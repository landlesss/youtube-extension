import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => {
    const btn = document.querySelector("ytd-video-description-transcript-section-renderer button");
    const rect = btn?.getBoundingClientRect();
    const expandBtn =
      document.querySelector("tp-yt-paper-button#expand") ||
      document.querySelector("#description-inline-expander tp-yt-paper-button") ||
      document.querySelector("#expand");
    return {
      buttonRect: rect ? { w: rect.width, h: rect.height } : null,
      expandBtnFound: !!expandBtn,
      expandBtnText: expandBtn?.textContent?.trim().slice(0, 40),
    };
  });
  console.log("BEFORE expand:", JSON.stringify(before));

  // Try clicking the description's "...more" expander.
  const clicked = await page.evaluate(() => {
    const expandBtn =
      document.querySelector("tp-yt-paper-button#expand") ||
      document.querySelector("#description-inline-expander tp-yt-paper-button") ||
      document.querySelector("#expand");
    if (!expandBtn) return false;
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    expandBtn.dispatchEvent(new PointerEvent("pointerdown", opts));
    expandBtn.dispatchEvent(new MouseEvent("mousedown", opts));
    expandBtn.dispatchEvent(new PointerEvent("pointerup", opts));
    expandBtn.dispatchEvent(new MouseEvent("mouseup", opts));
    expandBtn.dispatchEvent(new MouseEvent("click", opts));
    return true;
  });
  console.log("expand clicked:", clicked);
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const btn = document.querySelector("ytd-video-description-transcript-section-renderer button");
    const rect = btn?.getBoundingClientRect();
    return { buttonRect: rect ? { w: rect.width, h: rect.height } : null };
  });
  console.log("AFTER expand:", JSON.stringify(after));

  if (after.buttonRect && after.buttonRect.w > 0) {
    // Now retry the real open+poll.
    const result = await page.evaluate(async () => {
      function findButton() {
        return document.querySelector("ytd-video-description-transcript-section-renderer button");
      }
      function segCount() {
        return document.querySelectorAll("transcript-segment-view-model").length;
      }
      function simulateClick(el) {
        const opts = { bubbles: true, cancelable: true, composed: true, view: window };
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
      }
      const button = findButton();
      const start = performance.now();
      simulateClick(button);
      while (performance.now() - start < 10000) {
        const c = segCount();
        if (c > 0) return { ok: true, ms: Math.round(performance.now() - start), segCount: c };
        await new Promise((r) => setTimeout(r, 200));
      }
      return { ok: false };
    });
    console.log("RETRY AFTER EXPAND:", JSON.stringify(result));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
