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

  // Click transcript button, then poll for up to 15s logging every second
  // what's happening to the engagement-panel / transcript renderer.
  const result = await page.evaluate(async () => {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    function simulateClick(el) {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    }
    const button = document.querySelector("ytd-video-description-transcript-section-renderer button");
    const rect = button.getBoundingClientRect();
    const log = [];
    log.push(`button rect before click: ${rect.width}x${rect.height}`);
    log.push(`button disabled=${button.disabled} aria-disabled=${button.getAttribute("aria-disabled")}`);
    simulateClick(button);

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const segCount = document.querySelectorAll("transcript-segment-view-model").length;
      const panel = document.querySelector("ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']");
      const panelVisible = panel ? panel.getAttribute("visibility") : "no-panel";
      const transcriptRenderer = document.querySelector("ytd-transcript-search-panel-renderer, ytd-transcript-renderer");
      log.push(`t+${i+1}s segCount=${segCount} panelVisibility=${panelVisible} transcriptRendererFound=${!!transcriptRenderer}`);
    }
    return log;
  });
  console.log(result.join("\n"));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
