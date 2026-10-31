import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/sidepanel/index.ts', import.meta.url))], bundle: true, write: false, format: 'iife',
  plugins: [{ name: 'browser-fixtures', setup(builder) {
    builder.onResolve({ filter: /^\.\.?\// }, args => args.importer.endsWith('/sidepanel/index.ts')
      ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (args.path === '../content/ui') return { contents: `export class SubtitlePanel {
        constructor(callbacks) { globalThis.panel = this; this.callbacks = callbacks; this.open = false; }
        toggle() { this.open = !this.open; this.callbacks.onToggle(this.open); }
        isOpen() { return this.open; }
        renderVideoDetected() { events.push('loading'); }
        renderLoading() { events.push('loading'); }
        renderEmpty() { events.push('empty'); }
        renderTracks() { events.push('tracks'); }
      }` };
      if (args.path.endsWith('/youtube')) return { contents: `
        export const getVideoId = url => new URL(url).searchParams.get('v');
        export const fetchCaptionTracks = id => { requests.push(id); return new Promise(resolve => pending.push(resolve)); };
        export const cleanupCues = x => x;
        export const serializeCues = () => '';
      ` };
      return { contents: `export const getSession = async () => null;
        export const getMe = async () => null;
        export const claimVideoAccess = () => {};
        export const login = () => {};
        export const translateAllCues = () => {};
        export const fetchCuesFromPanel = () => {};
        export const downloadTextFile = () => {};
        export const t = x => x;
        export const recordActionAndMaybeShowReviewPrompt = () => false;` };
    });
  } }],
});
const listeners = {};
const requests = [];
const pending = [];
let videoId = 'A';
const context = vm.createContext({ URL, location: { href: "chrome-extension://test/sidepanel.html?tabId=5" }, events: [], requests, pending,
  chrome: {
    windows: { getCurrent: async () => ({ id: 1 }) },
    runtime: { onMessage: { addListener: cb => { listeners.message = cb; } },
      sendMessage: async () => ({ session: null }) },
    tabs: {
      get: async () => ({ id: 5, url: `https://www.youtube.com/watch?v=${videoId}`, title: 'Video' }),
      sendMessage: async (_tabId, message) => {
        if (message.type === 'GET_VIDEO_STATE') return { videoId, title: 'Video' };
        requests.push(message);
        return new Promise(resolve => pending.push(resolve));
      },
      onActivated: { addListener() {} }, onUpdated: { addListener() {} }, onRemoved: { addListener() {} },
    },
  },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
vm.runInContext(result.outputFiles[0].text, context);
await flush();
assert.equal(context.events.at(-1), 'loading');
assert.equal(requests.length, 1, 'Opening loads captions immediately');
videoId = 'B';
listeners.message({ type: 'VIDEO_CHANGED', videoId, title: 'B' }, { tab: { id: 5 } });
assert.equal(context.events.at(-1), 'loading');
pending.shift()({ data: [{}] });
await flush();
assert.equal(context.events.at(-1), 'loading', 'Old response must be ignored');
const count = context.events.length;
listeners.message({ type: 'VIDEO_CHANGED', videoId, title: 'B' }, { tab: { id: 5 } });
assert.equal(context.events.length, count, 'Duplicate navigation must preserve UI');
listeners.message({ type: 'VIDEO_CHANGED', videoId: 'Other' }, { tab: { id: 9 } });
assert.equal(context.events.length, count, 'Inactive tabs must not change panel');
pending.shift()({ data: [{}] });
await flush();
assert.equal(context.events.at(-1), 'tracks');
listeners.message({ type: 'VIDEO_CHANGED', videoId: null, title: '' }, { tab: { id: 5 } });
assert.equal(context.events.at(-1), 'empty');
assert.equal(requests.length, 2);
console.log('Side panel SPA navigation checks passed');
