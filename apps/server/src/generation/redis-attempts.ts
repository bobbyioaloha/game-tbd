import { randomUUID } from 'node:crypto';
import { LiveUsageSchema, type LiveUsage, type PipelineRequest } from '@sky/shared';
import type { PaidAttemptStore } from './live-attempts.js';
import { PipelineFailure } from './pipeline-errors.js';

// Stable across deployments. Only an operator initializes/replenishes this budget.
export const LIVE_REDIS_KEYS = ['skyfall:{live}:budget','skyfall:{live}:attempts','skyfall:{live}:lease'];
export const LIVE_LEASE_MS = 90_000;
const budget = `
local values = redis.call('HMGET', KEYS[1], 'enabled', 'limit', 'used')
local limit, used = tonumber(values[2]), tonumber(values[3])
if (values[1] ~= '0' and values[1] ~= '1') or not limit or not used
  or limit < 1 or limit > 100 or limit % 1 ~= 0 or used < 0 or used % 1 ~= 0 then
  return 'NOT_CONFIGURED'
end
`;
export const READ_LIVE_STATUS = budget + `
return {tonumber(values[1]), limit, used, redis.call('EXISTS', KEYS[3])}
`;
export const RESERVE_LIVE_ATTEMPT = budget + `
if values[1] ~= '1' then return 'LIVE_DISABLED' end
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return 'DUPLICATE_ATTEMPT' end
if redis.call('EXISTS', KEYS[3]) == 1 then return 'LIVE_BUSY' end
if used >= limit then return 'LIVE_LIMIT_REACHED' end
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('HINCRBY', KEYS[1], 'used', 1)
redis.call('SET', KEYS[3], ARGV[2], 'PX', ARGV[3])
return 'OK'
`;
export const RELEASE_LIVE_ATTEMPT = `
if redis.call('GET', KEYS[3]) == ARGV[1] then return redis.call('DEL', KEYS[3]) end
return 0
`;
const messages = {
  NOT_CONFIGURED:'The shared paid allowance is not configured. Ask the host to check it.',
  LIVE_DISABLED:'Paid generation is disabled by the host.',
  DUPLICATE_ATTEMPT:'This paid attempt was already reserved. It will not run again.',
  LIVE_BUSY:'Another paid attempt is running. Wait for it to finish.',
  LIVE_LIMIT_REACHED:'The shared paid allowance is exhausted. Ask the host to replenish it.',
} as const;
function failResult(result:unknown):never {
  if (typeof result === 'string' && Object.hasOwn(messages,result)) {
    const code = result as keyof typeof messages;
    throw new PipelineFailure(code,messages[code]);
  }
  throw new PipelineFailure('NOT_CONFIGURED','The shared paid allowance is unavailable. No provider request was started.');
}

export class RedisAttempts implements PaidAttemptStore {
  constructor(private url:string,private token:string,private transport:typeof fetch = fetch) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || !token.trim()) {
      throw new Error('Configure the Upstash HTTPS REST URL and token on the server.');
    }
  }
  private async command(script:string,args:string[] = []):Promise<unknown> {
    try {
      const response = await this.transport(this.url,{
        method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},
        body:JSON.stringify(['EVAL',script,LIVE_REDIS_KEYS.length,...LIVE_REDIS_KEYS,...args]),
        signal:AbortSignal.timeout(2000),redirect:'error',
      });
      if (!response.ok) throw new Error('Redis unavailable');
      const data:unknown = await response.json();
      if (!data || typeof data !== 'object' || 'error' in data || !('result' in data)) throw new Error('Invalid Redis response');
      return data.result;
    } catch {
      // Never expose transport errors, tokens, or retry an uncertain reservation.
      throw new PipelineFailure('NOT_CONFIGURED','The shared paid allowance is unavailable. Try again later with a new attempt.');
    }
  }
  async readStatus():Promise<LiveUsage> {
    const result = await this.command(READ_LIVE_STATUS);
    if (!Array.isArray(result) || result.length !== 4) return failResult(result);
    const [enabled,maxAttempts,attemptsUsed,busy] = result;
    const status = LiveUsageSchema.safeParse({enabled:enabled===1,maxAttempts,attemptsUsed,
      attemptsRemaining:Math.max(0,maxAttempts-attemptsUsed),busy:busy===1});
    if (!status.success || ![0,1].includes(enabled) || ![0,1].includes(busy)) return failResult(result);
    return status.data;
  }
  async acquire(request:Pick<PipelineRequest,'paidAttempt'>):Promise<()=>Promise<void>> {
    if (!request.paidAttempt?.confirmed) throw new PipelineFailure('CONSENT_REQUIRED','Allow this paid attempt before generating.');
    const token = randomUUID();
    const result = await this.command(RESERVE_LIVE_ATTEMPT,[request.paidAttempt.id,token,String(LIVE_LEASE_MS)]);
    if (result !== 'OK') return failResult(result);
    return async () => {
      try {await this.command(RELEASE_LIVE_ATTEMPT,[token]);}
      catch {/* The lease expires after a crash/disconnect; never refund or replace a completed result. */}
    };
  }
}
