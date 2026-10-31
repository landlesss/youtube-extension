import { build } from 'esbuild';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const built = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/sessions.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'sessions' });
let stored;
let calls = [];
let failRefresh = false;
let refreshCount = 0;
const context = vm.createContext({
  chrome: {
    storage: { local: { get: async () => ({ session: stored }), set: async value => { stored = value.session; } } },
  },
  fetch: async (url, init) => {
    calls.push({ url, init });
    await new Promise(resolve => setImmediate(resolve));
    if (url.endsWith('/auth/anonymous/refresh')) {
      refreshCount++;
      if (failRefresh) throw new Error('Network unavailable');
      assert.deepEqual(JSON.parse(init.body), { guestToken: stored.guestToken });
      return { ok: true, json: async () => ({ token: `jwt-${refreshCount}`, guestToken: `secret-${refreshCount}` }) };
    }
    assert.equal(url.endsWith('/auth/anonymous'), true, 'Only anonymous auth endpoints may be called');
    assert.equal(init.body, undefined);
    return { ok: true, json: async () => ({ token: 'jwt-initial', guestToken: 'secret-initial' }) };
  },
});
vm.runInContext(built.outputFiles[0].text, context);
const api = context.sessions;
const initial = await Promise.all(Array.from({ length: 5 }, () => api.ensureSession()));
assert.equal(calls.length, 1, 'Only one anonymous identity is created');
assert.equal(initial[0].guestToken, undefined, 'Guest secret must stay in worker storage');
assert.equal(stored.guestToken, 'secret-initial');
const refreshed = await Promise.all(Array.from({ length: 5 }, () => api.refreshSession('jwt-initial')));
assert.equal(refreshCount, 1, 'Concurrent 401s rotate tokens once');
assert.equal(new Set(refreshed.map(x => x.token)).size, 1);
assert.equal(stored.guestToken, 'secret-1');
failRefresh = true;
await assert.rejects(api.refreshSession(stored.token), /Network unavailable/);
assert.equal(stored.guestToken, 'secret-1', 'Network errors must preserve identity');
failRefresh = false;
stored = { token: 'legacy-google-jwt', email: 'legacy@example.com' };
const migrated = await Promise.all([api.ensureSession(), api.ensureSession()]);
assert.equal(migrated[0].isAnonymous, true);
assert.equal(stored.guestToken, 'secret-initial');
assert.equal(stored.email, undefined);
const count = calls.length;
await api.ensureSession();
assert.equal(calls.length, count, 'Migrated guest identity is reused');
console.log('Anonymous initialization, refresh rotation, failure recovery and legacy migration passed');
