import { chromium } from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, file] of [['welcome','extension/dist/welcome.html'],['landing','docs/index.html']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`file://${path.join(root,file)}`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `/tmp/yt-${name}-desktop.png`, fullPage: true });
    await page.getByRole('button', { name: 'Step 3', exact: true }).click();
    assert.equal(await page.locator('.step-count').textContent(), '03 / 03');
    await page.getByRole('button', { name: 'Try the subtitle panel' }).click();
    assert.equal(await page.locator('.step-count').textContent(), '02 / 03');
    const href = await page.locator('#cta').getAttribute('href');
    assert.ok(href.includes(name === 'welcome' ? 'youtube.com' : 'chromewebstore.google.com'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `/tmp/yt-${name}-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile overflow');
    assert.deepEqual(errors, []);
    await page.close();
  }
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(`file://${path.join(root,'extension/dist/welcome.html')}`);
  assert.equal(await reduced.locator('#confetti').isVisible(), false);
  console.log('Landing and welcome: desktop/mobile layout, tutorial controls, CTA destinations, reduced motion passed');
} finally { await browser.close(); }
