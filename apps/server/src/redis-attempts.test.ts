import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RedisAttempts, LIVE_REDIS_KEYS } from './generation/redis-attempts.js';
import { PipelineFailure } from './generation/pipeline-errors.js';

const exec=promisify(execFile);
const failure=(code:string)=>(error:unknown)=>error instanceof PipelineFailure && error.code===code;
const request=()=>({paidAttempt:{id:randomUUID(),confirmed:true as const}});

// Optional integration check against a private, temporary Redis process. No cloud credentials.
// REDIS_TEST_SERVER=/path/redis-server REDIS_TEST_CLI=/path/redis-cli bun run test
const serverPath=process.env.REDIS_TEST_SERVER,cliPath=process.env.REDIS_TEST_CLI;
test('real Redis atomically enforces the shared 100-attempt budget', {skip:!serverPath || !cliPath},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'skyfall-budget-')),socket=join(directory,'redis.sock');
  const server=spawn(serverPath!,['--port','0','--unixsocket',socket,'--save','','--appendonly','no'],{stdio:'ignore'});
  let spawnError:Error|undefined;
  server.on('error',error=>{spawnError=error;});
  const exited=new Promise<void>(resolve=>server.once('exit',()=>resolve()));
  const command=async(...args:(string|number)[]):Promise<unknown>=>{
    const result=await exec(cliPath!,['-s',socket,'--json',...args.map(String)]);
    return JSON.parse(result.stdout);
  };
  const transport:typeof fetch=async(_url,options)=>Response.json({result:await command(...JSON.parse(String(options?.body)))});
  const store=()=>new RedisAttempts('https://test-redis.example','fake-token',transport);
  const [budget,seen,lease]=LIVE_REDIS_KEYS;
  try {
    let ready=false;
    for(let i=0;i<100;i++) {
      if(spawnError)throw spawnError;
      try {ready=await command('PING')==='PONG';}catch {/* Socket is not ready yet. */}
      if(ready)break;await delay(20);
    }
    assert.equal(ready,true,'Redis test process must start');
    await t.test('missing configuration is never initialized by an HTTP request',async()=>{
      await assert.rejects(store().acquire(request()),failure('NOT_CONFIGURED'));
      assert.equal(await command('EXISTS',budget),0);
    });
    await command('HSET',budget,'enabled','1','limit','100','used','0');
    await t.test('separate instances compete for one slot; replay is rejected after release',async()=>{
      const requests=Array.from({length:20},request);
      const results=await Promise.allSettled(requests.map(input=>store().acquire(input)));
      const winner=results.findIndex(result=>result.status==='fulfilled');
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      for(const result of results)if(result.status==='rejected')assert.ok(failure('LIVE_BUSY')(result.reason));
      assert.equal((await store().readStatus()).attemptsUsed,1);
      const result=results[winner];if(result.status==='fulfilled')await result.value();
      await assert.rejects(store().acquire(requests[winner]),failure('DUPLICATE_ATTEMPT'));
      assert.equal(await command('SCARD',seen),1);
    });
    await t.test('an expired lease recovers and its old owner cannot release the new owner',async()=>{
      const oldRelease=await store().acquire(request());
      await command('PEXPIRE',lease,1);await delay(10);
      const release=await store().acquire(request());
      await oldRelease();assert.equal((await store().readStatus()).busy,true);
      await release();assert.equal((await store().readStatus()).busy,false);
      assert.equal((await store().readStatus()).attemptsUsed,3);
    });
    await t.test('operator disable blocks new attempts without clearing usage',async()=>{
      await command('HSET',budget,'enabled','0');
      await assert.rejects(store().acquire(request()),failure('LIVE_DISABLED'));
      assert.equal((await store().readStatus()).enabled,false);
      assert.equal((await store().readStatus()).attemptsUsed,3);
      await command('HSET',budget,'enabled','1');
    });
    await t.test('only the hundredth attempt can reserve the final allowance',async()=>{
      await command('HSET',budget,'used','99');
      const results=await Promise.allSettled(Array.from({length:20},()=>store().acquire(request())));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      for(const result of results)if(result.status==='fulfilled')await result.value();
      await assert.rejects(store().acquire(request()),failure('LIVE_LIMIT_REACHED'));
      assert.deepEqual(await store().readStatus(),{enabled:true,maxAttempts:100,attemptsUsed:100,attemptsRemaining:0,busy:false});
    });
    await t.test('replenishing usage retains previously reserved IDs',async()=>{
      await command('HSET',budget,'used','0');
      const input=request();const release=await store().acquire(input);await release();
      await command('HSET',budget,'used','0');
      await assert.rejects(store().acquire(input),failure('DUPLICATE_ATTEMPT'));
    });
  } finally {
    server.kill('SIGTERM');if(!spawnError)await exited;
    await rm(directory,{recursive:true,force:true});
  }
});
