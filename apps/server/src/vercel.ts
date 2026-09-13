import { buildHostedApp } from './hosted.js';

const app = buildHostedApp();
await app.listen({port:3000});
