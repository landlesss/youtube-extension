import { chromium } from 'playwright';
import path from 'node:path';
const extension = path.resolve(import.meta.dirname, '../extension/dist');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const page = await context.newPage();
  page.on('pageerror', error => console.log('Page error:', error.message));
  await page.goto('https://www.youtube.com/watch?v=3Stflj2whx8', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log(await page.evaluate(() => ({
    url: location.href,
    players: document.querySelectorAll('#movie_player').length,
    controls: document.querySelectorAll('.ytp-right-controls').length,
    button: document.querySelector('#yt-subs-player-button')?.outerHTML ?? null,
    controlsHtml: document.querySelector('.ytp-right-controls')?.outerHTML.slice(0, 2000),
  })));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  console.log('Direct transcript:', await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_TRANSCRIPT', videoId: '3Stflj2whx8', track: { languageCode: 'en' } });
    return result.error ? { error: result.error } : { count: result.data.length };
  }));
} finally { await context.close(); }
