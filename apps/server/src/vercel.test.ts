import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

test('hosted entrypoint finishes loading before Vercel starts its captured server', {timeout: 15000}, async () => {
  // Use a child process: importing the real entrypoint and intercepting listen must
  // not affect other tests. Vercel captures listen, awaits the import, then binds.
  const script = `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    const originalListen = http.Server.prototype.listen;
    let captured;
    let resolveCapture;
    const captureReady = new Promise(resolve => { resolveCapture = resolve; });
    http.Server.prototype.listen = function () {
      captured = this;
      http.Server.prototype.listen = originalListen;
      resolveCapture();
      return this;
    };
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls++;
      throw new Error('Provider access is forbidden in this startup test');
    };
    const watchdog = setTimeout(() => {
      console.error('Hosted startup deadlocked before Vercel could start the captured server');
      process.exit(1);
    }, 8000);
    try {
      await import('./apps/server/src/vercel.ts');
      await captureReady;
      assert.equal(captured.listening, false);
      await new Promise(resolve => captured.listen(0, '127.0.0.1', resolve));
      const port = captured.address().port;
      async function get(path) {
        return new Promise((resolve, reject) => {
          const request = http.get({hostname: '127.0.0.1', port, path}, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('error', reject);
            response.on('end', () => resolve({status: response.statusCode, body}));
          });
          request.on('error', reject);
        });
      }
      const health = await get('/api/health');
      assert.equal(health.status, 200);
      assert.deepEqual(JSON.parse(health.body), {status: 'ok', mode: 'mock'});
      const profiles = await get('/api/lab/profiles');
      assert.equal(profiles.status, 200);
      assert.equal(JSON.parse(profiles.body).liveUsage.enabled, false);
      assert.equal(providerCalls, 0);
      console.log('Hosted listener capture passed');
    } finally {
      clearTimeout(watchdog);
      http.Server.prototype.listen = originalListen;
      if (captured?.listening) {
        captured.closeAllConnections();
        await new Promise(resolve => captured.close(resolve));
      }
    }
  `;
  const {stdout} = await run(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    timeout: 12000,
    // Never inherit credentials, dotenv loaders, or flags that could enable live mode.
    env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, VERCEL_ENV: 'production', HOSTED_LIVE_ENABLED: 'false'},
  });
  assert.match(stdout, /Hosted listener capture passed/);
});
