import { build } from 'esbuild';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const result = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/transcriptPanel.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 'transcript' });
const requests = [];
const context = vm.createContext({ URL, AbortSignal, location: { href: 'https://www.youtube.com/watch?v=A' }, fetch: async (url, init) => {
  requests.push({ url, init });
  if (!init?.method) return { ok: true, text: async () => '{"getTranscriptEndpoint":{"params":"abc"}},"INNERTUBE_CLIENT_VERSION":"version"' };
  return { ok: true, json: async () => ({ actions: [{ transcriptSegmentRenderer: { startMs: '1000', endMs: '3500', snippet: { runs: [{ text: 'Hello' }, { text: ' world' }] } } }] }) };
} });
vm.runInContext(result.outputFiles[0].text, context);
const [first, second] = await Promise.all([context.transcript.fetchCuesFromPanel({ languageCode: 'en' }), context.transcript.fetchCuesFromPanel({ languageCode: 'en' })]);
assert.equal(requests.length, 2, 'Concurrent loads share a single network request pair');
assert.equal(first[0].text, 'Hello world');
assert.equal(first[0].start, 1);
assert.equal(first[0].end, 3.5);
assert.equal(second[0].text, first[0].text);
assert.equal(JSON.parse(requests[1].init.body).params, 'abc');
// No document or click API is supplied: extraction must not access page UI.
console.log('Direct transcript extraction without page UI passed');
