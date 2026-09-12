import test from 'node:test';
import assert from 'node:assert/strict';
import { meshFixture, type PipelineEvent } from '@sky/shared';
import { runLabPipeline } from './pipeline-client';
test('lab client parses progress split across byte chunks and requires a terminal event',async () => {
  const original=globalThis.fetch;
  const terminal={type:'complete',spec:meshFixture,elapsedMs:25,metrics:[]};
  const text=JSON.stringify({type:'stage',stage:'design',elapsedMs:0})+'\n'+JSON.stringify(terminal)+'\n';
  try {
    globalThis.fetch=async () => new Response(new ReadableStream({
      start(controller) {const bytes=new TextEncoder().encode(text);controller.enqueue(bytes.slice(0,17));controller.enqueue(bytes.slice(17));controller.close();},
    }));
    const events:PipelineEvent[]=[];
    await runLabPipeline({text:'crystal',profileId:'mock'},new AbortController().signal,event=>events.push(event));
    assert.deepEqual(events.map(event=>event.type),['stage','complete']);
    globalThis.fetch=async () => new Response(JSON.stringify({type:'stage',stage:'design',elapsedMs:0})+'\n');
    await assert.rejects(runLabPipeline({text:'crystal',profileId:'mock'},new AbortController().signal,()=>{}),/before the pipeline completed/);
  } finally {globalThis.fetch=original;}
});

test('lab client handles structured, non-JSON, and null HTTP errors', async () => {
  const original = globalThis.fetch;
  const fallback = 'The server rejected the pipeline request.';
  try {
    for (const [body, message] of [
      [JSON.stringify({error: {code: 'NOT_CONFIGURED', message: 'Configure the server key.'}}), 'Configure the server key.'],
      ['<html>Bad gateway</html>', fallback],
      ['null', fallback],
      [JSON.stringify({error: {code: 'UNKNOWN', message: 'Unvalidated message'}}), fallback],
    ]) {
      globalThis.fetch = async () => new Response(body, {status: 503});
      await assert.rejects(
        runLabPipeline({text: 'crystal', profileId: 'mock'}, new AbortController().signal, () => {}),
        {message},
      );
    }
  } finally { globalThis.fetch = original; }
});
