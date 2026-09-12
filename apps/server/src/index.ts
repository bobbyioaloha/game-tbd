import { buildApp } from './app.js';
const app=buildApp();
const port=Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT must be an integer from 1 to 65535');
try { await app.listen({port,host:process.env.HOST ?? '127.0.0.1'}); }
catch(error) { app.log.error(error); process.exitCode=1; }
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void app.close(); });
