// For the one video that fails our simulated click, try Playwright's own
// .click() (a genuinely realistic, CDP-driven click) to see if the problem
// is specifically about click realism, or something else about this video.
import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";
const POLL_TIMEOUT_MS = 20000;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const button = page.locator("ytd-video-description-transcript-section-renderer button").first();
  const buttonExists = (await button.count()) > 0;
  console.log("button exists:", buttonExists);

  if (!buttonExists) {
    console.log("Button not found at all — different issue.");
    await browser.close();
    return;
  }

  await button.scrollIntoViewIfNeeded();
  const start = Date.now();
  await button.click({ force: false, timeout: 5000 }).catch((err) => {
    console.log("Playwright click() threw:", err.message);
  });
  console.log("clicked via real playwright .click(), waiting for segments...");

  let count = 0;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    count = await page.locator("transcript-segment-view-model").count();
    if (count > 0) {
      console.log(`SUCCESS: ${count} segments after ${Date.now() - start}ms`);
      await browser.close();
      return;
    }
    await page.waitForTimeout(200);
  }
  console.log(`FAILED: still 0 segments after ${Date.now() - start}ms`);

  // Dump some page state for more clues.
  const title = await page.title();
  const captionsAvailable = await page.evaluate(() => {
    const cc = document.querySelector(".ytp-subtitles-button");
    return { ccButtonFound: !!cc, ccAriaPressed: cc?.getAttribute("aria-pressed") };
  });
  console.log("page title:", title);
  console.log("captions button state:", captionsAvailable);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
