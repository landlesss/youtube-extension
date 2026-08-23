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
  await page.waitForTimeout(2000);

  // Inspect the panel for tab-like elements.
  const tabInfo = await page.evaluate(() => {
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    if (!panel) return "NO PANEL";
    const tabEls = Array.from(panel.querySelectorAll("tp-yt-paper-tab, yt-tab-shape, [role='tab']"));
    return tabEls.map((el, i) => ({
      i,
      tag: el.tagName,
      text: el.textContent.trim().slice(0, 30),
      ariaSelected: el.getAttribute("aria-selected"),
      selected: el.hasAttribute("selected") || el.getAttribute("selected"),
    }));
  });
  console.log("--- TABS ---");
  console.log(JSON.stringify(tabInfo, null, 2));

  // Try clicking the transcript tab by matching text.
  const clickedTab = await page.evaluate(() => {
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    if (!panel) return false;
    const tabEls = Array.from(panel.querySelectorAll("tp-yt-paper-tab, yt-tab-shape, [role='tab']"));
    const transcriptTab = tabEls.find((el) => el.textContent.includes("Расшифровка"));
    if (!transcriptTab) return false;
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    transcriptTab.dispatchEvent(new PointerEvent("pointerdown", opts));
    transcriptTab.dispatchEvent(new MouseEvent("mousedown", opts));
    transcriptTab.dispatchEvent(new PointerEvent("pointerup", opts));
    transcriptTab.dispatchEvent(new MouseEvent("mouseup", opts));
    transcriptTab.dispatchEvent(new MouseEvent("click", opts));
    return true;
  });
  console.log("clicked transcript tab:", clickedTab);

  await page.waitForTimeout(2000);
  const segCount = await page.evaluate(
    () => document.querySelectorAll("transcript-segment-view-model").length,
  );
  console.log("segCount after tab click:", segCount);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
