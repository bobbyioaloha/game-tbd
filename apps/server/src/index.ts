import { buildApp } from './app.js';
// Environment variables (including legacy enable flags) cannot opt into paid calls.
const liveEnabled = process.argv.slice(2).includes('--live');
const host = process.env.HOST ?? '127.0.0.1';
if (liveEnabled && !['127.0.0.1','::1','localhost'].includes(host)) {
  throw new Error('The paid development lab must listen on localhost. Use HOST=127.0.0.1.');
}
const app=buildApp({liveEnabled});
const port=Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT must be an integer from 1 to 65535');
app.log.info(liveEnabled ? 'Paid lab explicitly enabled; each attempt requires consent and consumes the server allowance.' : 'Paid generation disabled; mock mode only.');
try { await app.listen({port,host}); }
catch(error) { app.log.error(error); process.exitCode=1; }
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void app.close(); });
