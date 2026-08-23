import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const transcriptRequests = [];
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("transcript") || url.includes("get_transcript")) {
      const res = await req.response();
      transcriptRequests.push({ url, status: res?.status() });
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("transcript") || url.includes("get_transcript")) {
      transcriptRequests.push({ url, failed: req.failure()?.errorText });
    }
  });

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
  await page.waitForTimeout(6000);

  console.log("--- TRANSCRIPT-RELATED NETWORK REQUESTS ---");
  console.log(JSON.stringify(transcriptRequests, null, 2));

  const fullPanelHtml = await page.evaluate(() => {
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    return panel ? panel.outerHTML.slice(0, 3000) : "NO PANEL";
  });
  console.log("--- PANEL OUTER HTML (first 3000 chars) ---");
  console.log(fullPanelHtml);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
