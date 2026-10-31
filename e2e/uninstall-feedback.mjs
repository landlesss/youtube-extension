import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const browser = await chromium.launch({ headless: true });
try {
  for (const lang of ['en','ru']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    let submitted;
    await page.route('https://docs.google.com/forms/**/formResponse', route => {
      submitted = new URLSearchParams(route.request().postData());
      return route.fulfill({ contentType: 'text/html', body: '<h1>Test confirmation</h1>' });
    });
    await page.goto(`file://${path.resolve(import.meta.dirname,'../docs/uninstall/index.html')}?lang=${lang}&version=0.1.1`);
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    await page.locator('button[type=submit]').click();
    assert.equal(submitted, undefined, 'Reason is required');
    await page.locator('input[value=translation]').check();
    await page.locator('#comment').fill('The translation stopped with an error.');
    await page.locator('#email').fill('test@example.com');
    await page.screenshot({ path: `/tmp/yt-uninstall-${lang}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('https://docs.google.com/forms/**/formResponse');
    assert.ok(submitted.get('entry.440991757').includes('Translation quality'));
    assert.ok(submitted.get('entry.440991757').includes('The translation stopped with an error.'));
    assert.ok(submitted.get('entry.440991757').includes('Extension version: 0.1.1'));
    assert.equal(submitted.getAll('entry.440991757').length, 1);
    assert.equal(submitted.get('entry.1081135527'), 'test@example.com');
    await page.close();
  }
  console.log('Uninstall feedback: required reason, optional comment/email, RU/EN, mobile layout and form payload passed. No real feedback submitted.');
} finally { await browser.close(); }
