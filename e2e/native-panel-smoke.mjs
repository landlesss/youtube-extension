import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const rejectTranscript = process.argv.includes('--reject-transcript');
const extension = path.resolve(import.meta.dirname, '../extension/dist');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  let anonymousCalls = 0;
  let quotaClaims = 0;
  await context.route('https://api.downloadsubtitles.online/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/anonymous') {
      anonymousCalls++;
      assert.equal(route.request().postData(), null);
      return route.fulfill({ json: { token: 'test-jwt', guestToken: 'test-guest-secret' } });
    }
    if (url.pathname.endsWith('/access')) {
      quotaClaims++;
      assert.equal(route.request().headers().authorization, 'Bearer test-jwt');
    }
    return route.fulfill({ json: { isAnonymous: true, plan: 'free', remaining: 3, resetAt: '2026-11-01T00:00:00Z', billingEnabled: false, charsUsedMonth: 0, charsLimitMonth: 10000 } });
  });
  await context.route('https://example.com/**', route => route.fulfill({ body: 'Other website' }));
  await context.route('https://www.youtube.com/**', route => route.request().url().includes('/youtubei/v1/get_transcript')
    ? rejectTranscript ? route.fulfill({ status: 400, json: { error: 'FAILED_PRECONDITION' } }) : route.fulfill({ json: { actions: [{ transcriptSegmentRenderer: { startMs: '0', endMs: '4000', snippet: { runs: [{ text: 'Hello world' }] } } }] } })
    : route.fulfill({ contentType: 'text/html', body: `<html><head><title>Test video - YouTube</title></head><body><video></video><div id="movie_player"><div class="ytp-right-controls"><div class="ytp-right-controls-left"><button class="ytp-subtitles-button">CC</button></div></div></div><aside id="recommendations">Recommendations</aside>
    <script>window.ytcfg={"INNERTUBE_CLIENT_VERSION":"test-version"};window.endpoint={"getTranscriptEndpoint":{"params":"fixture-params"}};window.fixture={"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext","languageCode":"en","name":{"simpleText":"English"}}],"audioTracks":[]};</script>
    <ytd-video-description-transcript-section-renderer><button onclick="globalThis.transcriptClicks=(globalThis.transcriptClicks||0)+1">Transcript</button></ytd-video-description-transcript-section-renderer>
    <ytd-transcript-segment-renderer><span class="segment-timestamp">0:00</span><span class="segment-text">Hello world</span></ytd-transcript-segment-renderer>
    </body></html>` }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const youtube = await context.newPage();
  youtube.on("console", message => { if (message.type() === "error") console.log("Page error:", message.text()); });
  await youtube.goto('https://www.youtube.com/watch?v=AAAAAAAAAAA');
  const youtubeTabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' }))[0].id);
  await worker.evaluate(() => {
    globalThis.panelOpened = false;
    const open = chrome.sidePanel.open.bind(chrome.sidePanel);
    chrome.sidePanel.open = async options => {
      await open(options);
      globalThis.panelOpened = true;
    };
  });
  const playerButton = youtube.locator('#yt-subs-player-button');
  await playerButton.waitFor();
  assert.equal(await playerButton.count(), 1);
  const playerImage = playerButton.locator('img');
  await playerImage.evaluate(image => image.decode());
  assert.ok((await playerImage.getAttribute('src')).startsWith('data:image/png;'));
  assert.equal(await playerImage.evaluate(image => image.naturalWidth), 48);
  await playerButton.click();
  for (let i = 0; i < 40 && !(await worker.evaluate(() => globalThis.panelOpened)); i++) await youtube.waitForTimeout(100);
  assert.equal(await worker.evaluate(() => globalThis.panelOpened), true, 'Player button must open native panel with a real user gesture');
  await youtube.evaluate(() => {
    const controls = document.querySelector('.ytp-right-controls');
    controls.replaceWith(controls.cloneNode(true));
    document.querySelector('#yt-subs-player-button')?.remove();
  });
  await playerButton.waitFor();
  assert.equal(await playerButton.count(), 1, 'Player control is restored without duplicates');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${youtubeTabId}`);
  await youtube.bringToFront();
  const session = await context.newCDPSession(panel);
  const panelContains = async text => {
    const snapshot = await session.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
    return snapshot.strings.some(value => value.includes(text));
  };
  await panel.waitForTimeout(400);
  for (let i = 0; i < 40 && !(await panelContains('Hello world')); i++) await panel.waitForTimeout(100);
  assert.equal(await panelContains('Hello world'), true, 'Transcript loads automatically');
  if (rejectTranscript) assert.equal(await youtube.locator('iframe[src*="autoplay=0"]').count(), 0, 'Isolated loader is cleaned up');
  assert.equal(await panelContains('New video detected'), false);
  assert.equal(await panelContains('Load subtitles'), false);
  assert.equal(await panelContains('Sign in with Google to'), false);
  assert.equal(await panelContains('Link Google account'), false);
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.permissions.includes('identity'), false);
  assert.equal(manifest.oauth2, undefined);
  assert.equal(await panelContains('Translate to'), true, 'Translation controls are visible');
  assert.equal(anonymousCalls, 1);
  assert.equal(quotaClaims, 0, 'Preview does not consume download quota');
  assert.equal(await youtube.locator('#yt-subs-downloader-host').count(), 0);
  assert.equal(await youtube.evaluate(() => globalThis.transcriptClicks ?? 0), 0, 'Native transcript panel must never be triggered');
  assert.equal(await youtube.locator('#recommendations').count(), 1);
  const tree = await session.send('DOM.getDocument', { depth: -1, pierce: true });
  const findDownload = node => {
    if (node.nodeName === 'BUTTON' && node.attributes?.includes('Download subtitles as a file')) return node;
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = findDownload(child);
      if (found) return found;
    }
    return null;
  };
  const button = findDownload(tree.root);
  assert.ok(button, 'Guest has a download button');
  const remote = await session.send('DOM.resolveNode', { nodeId: button.nodeId });
  const download = panel.waitForEvent('download');
  await session.send('Runtime.callFunctionOn', { objectId: remote.object.objectId, functionDeclaration: 'function() { this.click(); }' });
  assert.ok((await download).suggestedFilename().endsWith('.srt'));
  assert.equal(quotaClaims, 1, 'Guest download must claim server quota');
  const state = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    return chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEO_STATE' });
  });
  assert.equal(state.videoId, 'AAAAAAAAAAA');
  const config = await worker.evaluate(async () => ({ options: await chrome.sidePanel.getOptions({}), behavior: await chrome.sidePanel.getPanelBehavior() }));
  assert.equal(config.options.enabled, false, 'Global panel is disabled');
  assert.equal(config.behavior.openPanelOnActionClick, false);
  const scoped = await worker.evaluate(tabId => chrome.sidePanel.getOptions({ tabId }), youtubeTabId);
  assert.equal(scoped.path, `sidepanel.html?tabId=${youtubeTabId}`);
  const other = await context.newPage();
  await other.goto('https://example.com/');
  const otherOptions = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.sidePanel.getOptions({ tabId: tabs[0].id });
  });
  assert.equal(otherOptions.enabled, false, 'Other tabs must not inherit panel');
  await youtube.bringToFront();
  await youtube.evaluate(() => { history.pushState({}, '', '/watch?v=BBBBBBBBBBB'); document.dispatchEvent(new Event('yt-navigate-finish')); });
  const next = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    return chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEO_STATE' });
  });
  assert.equal(next.videoId, 'BBBBBBBBBBB');
  for (let i = 0; i < 40 && !(await panelContains('Hello world')); i++) await panel.waitForTimeout(100);
  assert.equal(await panelContains('Hello world'), true);
  assert.equal(anonymousCalls, 1, 'SPA navigation reuses anonymous identity');
  assert.equal(await youtube.locator('#yt-subs-downloader-host').count(), 0);
  console.log('Native panel configuration, content bridge, SPA navigation and absence of overlay passed');
} finally { await context.close(); }
