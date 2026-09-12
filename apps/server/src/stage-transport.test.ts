import test from 'node:test';
import assert from 'node:assert/strict';
import { openAITransport, type ModelStageRequest } from './generation/stage-transport.js';
import { PipelineFailure, safePipelineError } from './generation/pipeline-errors.js';
import { PipelineErrorSchema } from '@sky/shared';
const request:ModelStageRequest={stage:'design',config:{model:'gpt-5.6-sol',reasoning:'low',maxOutputTokens:2048},
  instructions:'Design one item.',input:'wind crystal',schema:{type:'object',properties:{},required:[],additionalProperties:false},
  signal:new AbortController().signal};
const completed={object:'response',id:'resp_test',status:'completed',output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',
  content:[{type:'output_text',text:'{"ok":true}',annotations:[]}]}],
  usage:{input_tokens:11,output_tokens:22,total_tokens:33,output_tokens_details:{reasoning_tokens:5},input_tokens_details:{cached_tokens:0}}};
test('official SDK sends structured Responses request and reports usage',async () => {
  let sent:Record<string,any>={};
  const transport=openAITransport('test-not-a-real-key',async (_url,init) => {
    assert.equal(String(_url),'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-not-a-real-key');
    sent=JSON.parse(String(init?.body));return new Response(JSON.stringify(completed),{headers:{'content-type':'application/json'}});
  });
  const result=await transport.run(request);
  assert.equal(sent.model,'gpt-5.6-sol');
  assert.equal(sent.text.format.type,'json_schema');assert.equal(sent.text.format.strict,true);
  assert.equal(sent.store,false);assert.equal(sent.reasoning.effort,'low');
  assert.equal(sent.max_output_tokens,2048);assert.equal(sent.input,'wind crystal');
  assert.deepEqual(result.data,{ok:true});assert.equal(result.usage?.reasoningTokens,5);
});
test('SDK retries are disabled even for retryable HTTP failures',async () => {
  let calls=0;
  const transport=openAITransport('test-not-a-real-key',async () => {
    calls++;return new Response(JSON.stringify({error:{message:'rate limit',type:'rate_limit_error'}}),{status:429,headers:{'content-type':'application/json'}});
  });
  await assert.rejects(transport.run(request));assert.equal(calls,1);
});
test('refusal, incomplete output and malformed JSON are explicit failures',async () => {
  for (const [body,code] of [
    [{...completed,output:[{type:'message',content:[{type:'refusal',refusal:'Declined'}]}]},'REFUSED'],
    [{...completed,status:'incomplete'},'INCOMPLETE'],
    [{...completed,output:[{type:'message',content:[{type:'output_text',text:'{',annotations:[]}]}]},'INVALID_DESIGN'],
  ] as const) {
    const transport=openAITransport('test-not-a-real-key',async () => new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}}));
    await assert.rejects(transport.run(request),error => error instanceof PipelineFailure && error.code===code);
  }
});


test('SDK failures expose safe actionable categories and never retry',async () => {
  const cases = [
    {status:401,code:'invalid_api_key',param:null,expected:'PROVIDER_AUTH'},
    {status:404,code:'model_not_found',param:'model',expected:'MODEL_UNAVAILABLE'},
    {status:403,code:'permission_denied',param:null,expected:'PROVIDER_PERMISSION'},
    {status:429,code:'insufficient_quota',param:null,expected:'PROVIDER_QUOTA'},
    {status:429,code:'project_spend_limit_exceeded',param:null,expected:'PROVIDER_QUOTA'},
    {status:429,code:'credit_balance_exhausted',param:null,expected:'PROVIDER_QUOTA'},
    {status:429,code:'rate_limit_exceeded',param:null,expected:'PROVIDER_RATE_LIMIT'},
    {status:400,code:'invalid_json_schema',param:'text.format.schema',expected:'PROVIDER_SCHEMA'},
    {status:400,code:'unsupported_value',param:'reasoning.effort',expected:'PROVIDER_REQUEST'},
    {status:408,code:undefined,param:null,expected:'PROVIDER_TIMEOUT'},
    {status:500,code:'server_error',param:null,expected:'PROVIDER_UNAVAILABLE'},
  ];
  for (const item of cases) {
    let calls=0;
    const transport=openAITransport('test-private-credential',async () => {
      calls++;
      return new Response(JSON.stringify({error:{message:'Secret test-private-credential; echoed request data.',code:item.code,param:item.param}}),
        {status:item.status,headers:{'content-type':'application/json','x-request-id':'req_0123456789abcdef0123456789abcdef','x-debug-secret':'test-private-credential'}});
    });
    await assert.rejects(transport.run({...request,stage:'geometry',config:{...request.config,model:'gpt-6-astra'}}),error => {
      const safe=PipelineErrorSchema.parse(safePipelineError(error));
      assert.equal(safe.code,item.expected);
      assert.equal(safe.provider?.model,'gpt-6-astra');
      assert.equal(safe.provider?.httpStatus,item.status);
      assert.equal(safe.provider?.code,item.code);
      assert.equal(safe.provider?.parameter,item.param ?? undefined);
      assert.equal(safe.provider?.requestId,'req_0123456789abcdef0123456789abcdef');
      assert.equal(JSON.stringify(safe).includes('test-private-credential'),false);
      assert.equal(JSON.stringify(safe).includes('echoed request data'),false);
      return true;
    });
    assert.equal(calls,1);
  }
});

test('unrecognized provider strings and malformed request IDs are omitted from diagnostics',async () => {
  const secret='test-secret-in-arbitrary-fields';
  const transport=openAITransport(secret,async () => new Response(JSON.stringify({error:{message:secret,code:secret,param:secret,type:secret}}),
    {status:400,headers:{'content-type':'application/json','x-request-id':secret}}));
  await assert.rejects(transport.run(request),error => {
    const safe=safePipelineError(error);
    assert.equal(safe.code,'PROVIDER_REQUEST');
    assert.deepEqual(safe.provider,{model:'gpt-5.6-sol',httpStatus:400});
    assert.equal(JSON.stringify(safe).includes(secret),false);
    return true;
  });
});

test('connection failures are identifiable without exposing their cause or credentials',async () => {
  let calls=0;
  const transport=openAITransport('test-private-credential',async () => {calls++;throw new Error('Network test-private-credential');});
  await assert.rejects(transport.run(request),error => {
    const safe=safePipelineError(error);
    assert.equal(safe.code,'PROVIDER_CONNECTION');
    assert.equal(JSON.stringify(safe).includes('test-private-credential'),false);
    return true;
  });
  assert.equal(calls,1);
});

test('failed HTTP-200 Responses carry a provider failure, rather than an incomplete-output error',async () => {
  const transport=openAITransport('test-not-a-real-key',async () => new Response(JSON.stringify({
    ...completed,status:'failed',error:{code:'server_error',message:'private provider detail'},output:[],
  }),{headers:{'content-type':'application/json'}}));
  await assert.rejects(transport.run(request),error => {
    const safe=safePipelineError(error);
    assert.equal(safe.code,'PROVIDER_UNAVAILABLE');
    assert.equal(safe.provider?.httpStatus,200);
    assert.equal(JSON.stringify(safe).includes('private provider detail'),false);
    return true;
  });
});


test('a wall-clock correction does not prematurely time out a response body',async t => {
  const now=Date.now;
  let clockOffset=0, calls=0;
  t.mock.method(Date,'now',() => now()+clockOffset);
  const transport=openAITransport('test-not-a-real-key',async (_url,init) => {
    calls++;
    // Simulate clock synchronization while the request is in flight. Pipeline
    // elapsed time uses performance.now(), which is unaffected by this jump.
    clockOffset=60_000;
    return new Response(new ReadableStream({start(controller) {
      const abort=() => {clearTimeout(timer);controller.error(init?.signal?.reason);};
      const timer=setTimeout(() => {
        init?.signal?.removeEventListener('abort',abort);
        controller.enqueue(new TextEncoder().encode(JSON.stringify(completed)));
        controller.close();
      },20);
      init?.signal?.addEventListener('abort',abort,{once:true});
    }}),{headers:{'content-type':'application/json'}});
  });
  const result=await transport.run({...request,signal:AbortSignal.timeout(1000)});
  assert.deepEqual(result.data,{ok:true});
  assert.equal(calls,1);
});


test('early SDK and native timeouts have a separate category and allowlisted diagnostics',async () => {
  for (const transportCode of ['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ETIMEDOUT','test-private-credential',undefined]) {
    let calls=0;
    const transport=openAITransport('test-private-credential',async () => {
      calls++;
      throw new TypeError('fetch failed: test-private-credential',{
        cause:Object.assign(new Error('Timeout: test-private-credential'),{code:transportCode}),
      });
    });
    await assert.rejects(transport.run(request),error => {
      const safe=PipelineErrorSchema.parse(safePipelineError(error));
      assert.equal(safe.code,'PROVIDER_TIMEOUT');
      assert.equal(safe.provider?.transportCode,transportCode === 'test-private-credential' ? undefined : transportCode);
      assert.equal(JSON.stringify(safe).includes('test-private-credential'),false);
      return true;
    });
    assert.equal(calls,1);
  }
});

test('native body-read timeout retains its safe code without exposing raw error details',async () => {
  let calls=0;
  const transport=openAITransport('test-not-a-real-key',async () => {
    calls++;
    return new Response(new ReadableStream({start(controller) {
      controller.error(new TypeError('private body detail',{cause:Object.assign(new Error('private cause'),{code:'UND_ERR_BODY_TIMEOUT'})}));
    }}),{headers:{'content-type':'application/json'}});
  });
  await assert.rejects(transport.run(request),error => {
    const safe=PipelineErrorSchema.parse(safePipelineError(error));
    assert.equal(safe.code,'PROVIDER_TIMEOUT');
    assert.equal(safe.provider?.transportCode,'UND_ERR_BODY_TIMEOUT');
    assert.equal(JSON.stringify(safe).includes('private'),false);
    return true;
  });
  assert.equal(calls,1);
});
