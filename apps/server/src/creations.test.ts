import test from 'node:test';
import assert from 'node:assert/strict';
import { CreationSpecSchema, meshFixture, GenerationErrorSchema } from '@sky/shared';
import { buildApp } from './app.js';
import type { CreationProvider } from './generation/provider.js';

test('new endpoint validates input/output, assigns identity, and exposes mode', async () => {
  let calls = 0;
  const provider: CreationProvider = {mode: 'mock', generate: async () => {calls++; return meshFixture;}};
  const app = buildApp({creationProvider: provider});
  try {
    const status = await app.inject('/api/creations/status');
    assert.equal(status.json().mode, 'mock');
    const bad = await app.inject({method: 'POST', url: '/api/creations', payload: {text: '', extra: true}});
    assert.equal(bad.statusCode, 400); assert.equal(calls, 0);
    const response = await app.inject({method: 'POST', url: '/api/creations', payload: {text: 'wind crystal'}});
    assert.equal(response.statusCode, 200);
    assert.ok(CreationSpecSchema.safeParse(response.json()).success);
    assert.notEqual(response.json().id, meshFixture.id);
    assert.equal(calls, 1);
  } finally { await app.close(); }
});
test('malformed provider output and exceptions become structured errors with no retries', async () => {
  for (const expected of [502, 500]) {
    let calls = 0;
    const app = buildApp({creationProvider: {mode: 'mock', generate: async () => {
      calls++;
      if (expected === 500) throw new Error('secret provider detail');
      return {script: 'evil'};
    }}});
    try {
      const response = await app.inject({method: 'POST', url: '/api/creations', payload: {text: 'wind crystal'}});
      assert.equal(response.statusCode, expected);
      assert.ok(GenerationErrorSchema.safeParse(response.json()).success);
      assert.equal(response.body.includes('secret'), false);
      assert.equal(calls, 1);
    } finally { await app.close(); }
  }
});
test('provider deadline returns structured failure and aborts work', async () => {
  let signal: AbortSignal | undefined;
  const app = buildApp({creationTimeoutMs: 10, creationProvider: {mode: 'mock', generate: async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }}});
  try {
    const response = await app.inject({method: 'POST', url: '/api/creations', payload: {text: 'wind crystal'}});
    assert.equal(response.statusCode, 500);
    assert.ok(signal?.aborted);
  } finally { await app.close(); }
});
