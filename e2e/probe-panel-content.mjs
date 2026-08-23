import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const expandBtn =
      document.querySelector("tp-yt-paper-button#expand") ||
      document.querySelector("#description-inline-expander tp-yt-paper-button") ||
      document.querySelector("#expand");
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    expandBtn.dispatchEvent(new PointerEvent("pointerdown", opts));
    expandBtn.dispatchEvent(new MouseEvent("mousedown", opts));
    expandBtn.dispatchEvent(new PointerEvent("pointerup", opts));
    expandBtn.dispatchEvent(new MouseEvent("mouseup", opts));
    expandBtn.dispatchEvent(new MouseEvent("click", opts));
  });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    const button = document.querySelector("ytd-video-description-transcript-section-renderer button");
    button.dispatchEvent(new PointerEvent("pointerdown", opts));
    button.dispatchEvent(new MouseEvent("mousedown", opts));
    button.dispatchEvent(new PointerEvent("pointerup", opts));
    button.dispatchEvent(new MouseEvent("mouseup", opts));
    button.dispatchEvent(new MouseEvent("click", opts));
  });
  await page.waitForTimeout(4000);

  const panelHtml = await page.evaluate(() => {
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    return panel ? panel.innerText : "NO PANEL FOUND";
  });
  console.log("--- PANEL TEXT CONTENT ---");
  console.log(panelHtml);

  // Also check: does the video have captions at all, per the CC button?
  const ccState = await page.evaluate(() => {
    const cc = document.querySelector(".ytp-subtitles-button");
    return {
      found: !!cc,
      ariaPressed: cc?.getAttribute("aria-pressed"),
      title: cc?.getAttribute("title"),
      disabled: cc?.disabled,
    };
  });
  console.log("--- CC BUTTON STATE ---");
  console.log(JSON.stringify(ccState));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
