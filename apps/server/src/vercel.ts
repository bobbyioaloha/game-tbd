import { buildHostedApp } from './hosted.js';

const app = buildHostedApp();
// Vercel captures listen() and starts the socket after this module loads.
// Awaiting it here deadlocks the adapter's module import.
void app.listen({port:3000}).catch(error => {
  app.log.error(error);
  process.exitCode = 1;
});
