import test from 'node:test';
import assert from 'node:assert/strict';
import { openAITransport, type ModelStageRequest } from './generation/stage-transport.js';
import { PipelineFailure } from './generation/pipeline-errors.js';
const request:ModelStageRequest={stage:'design',config:{model:'gpt-5.6-sol',reasoning:'low',maxOutputTokens:2048},
  instructions:'Design one item.',input:'wind crystal',schema:{type:'object',properties:{},required:[],additionalProperties:false},
  signal:new AbortController().signal};
const completed={object:'response',id:'resp_test',status:'completed',output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',
  content:[{type:'output_text',text:'{"ok":true}',annotations:[]}]}],
  usage:{input_tokens:11,output_tokens:22,total_tokens:33,output_tokens_details:{reasoning_tokens:5},input_tokens_details:{cached_tokens:0}}};
test('official SDK sends structured Responses request and reports usage',async () => {
  let sent:Record<string,any>={};
  const transport=openAITransport('test-not-a-real-key',async (_url,init) => {
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
