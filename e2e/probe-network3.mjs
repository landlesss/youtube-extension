import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let status = null;
  let bodyText = null;
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("get_transcript")) {
      const res = await req.response();
      status = res?.status();
      try {
        bodyText = await res.text();
      } catch (e) {}
    }
  });

  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // NO description-expand click this time — click transcript button directly,
  // same as our real extension code does today.
  const clickResult = await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    const button = document.querySelector("ytd-video-description-transcript-section-renderer button");
    if (!button) return { clicked: false };
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(new PointerEvent("pointerdown", opts));
    button.dispatchEvent(new MouseEvent("mousedown", opts));
    button.dispatchEvent(new PointerEvent("pointerup", opts));
    button.dispatchEvent(new MouseEvent("mouseup", opts));
    button.dispatchEvent(new MouseEvent("click", opts));
    return { clicked: true, rectBeforeClick: { w: rect.width, h: rect.height } };
  });
  console.log("click result:", JSON.stringify(clickResult));

  await page.waitForTimeout(4000);

  const panelState = await page.evaluate(() => {
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    return {
      panelVisibility: panel ? panel.getAttribute("visibility") : "no-panel",
      segCount: document.querySelectorAll("transcript-segment-view-model").length,
    };
  });
  console.log("panel state:", JSON.stringify(panelState));
  console.log("get_transcript status:", status);
  console.log("get_transcript body:", bodyText);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
