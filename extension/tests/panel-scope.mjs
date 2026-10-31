import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const result = await build({ entryPoints: [fileURLToPath(new URL('../src/background.ts', import.meta.url))], bundle: true, write: false, format: 'iife' });
const listeners = {};
const options = [];
const opened = [];
let uninstallUrl;
vm.runInNewContext(result.outputFiles[0].text, { URL, console, chrome: {
  i18n: { getUILanguage: () => "ru" },
  runtime: { getManifest: () => ({ version: "0.1.1" }), setUninstallURL: (url, done) => { uninstallUrl = url; done(); }, onMessage: { addListener() {} }, onConnect: { addListener() {} }, onInstalled: { addListener() {} } },
  action: { onClicked: { addListener: cb => { listeners.click = cb; } } },
  tabs: { query: async () => [], onUpdated: { addListener: cb => { listeners.update = cb; } } },
  sidePanel: {
    setOptions: async value => { options.push(value); },
    setPanelBehavior: async value => { assert.equal(value.openPanelOnActionClick, false); },
    open: async value => { opened.push(value.tabId); },
  },
} });
assert.equal(options[0].enabled, false, 'No global panel');
listeners.click({ id: 1, url: 'https://example.com/' });
assert.equal(options.length, 1);
listeners.update(2, { url: 'https://www.youtube.com/watch?v=A' }, {});
listeners.click({ id: 2, url: 'https://www.youtube.com/watch?v=A' });
assert.deepEqual(opened, [2], 'Toolbar opens synchronously without losing user gesture');
await new Promise(resolve => setImmediate(resolve));
assert.equal(options.at(-1).path, 'sidepanel.html?tabId=2');
assert.equal(options.at(-1).tabId, 2);
assert.deepEqual(opened, [2]);
const count = options.length;
listeners.update(3, { url: 'https://www.youtube.com/watch?v=B' }, {});
assert.equal(options.length, count + 1, 'Other YouTube tabs are prepared but not opened');
assert.deepEqual(opened, [2]);
listeners.update(2, { url: 'https://example.com/' }, {});
assert.equal(options.at(-1).tabId, 2);
assert.equal(options.at(-1).enabled, false, 'Leaving YouTube disables its panel');
console.log('Per-tab opening and disabling outside YouTube passed');

assert.equal(new URL(uninstallUrl).pathname, '/uninstall/');
assert.equal(new URL(uninstallUrl).searchParams.get('lang'), 'ru');
assert.equal(new URL(uninstallUrl).searchParams.get('version'), '0.1.1');
