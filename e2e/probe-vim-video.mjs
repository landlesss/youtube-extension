import { chromium } from "playwright";

const VIDEO_ID = "RZ4p-saaQkc";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let transcriptReq = null;
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("get_transcript")) {
      const res = await req.response();
      transcriptReq = { status: res?.status() };
    }
  });

  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

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
    if (!button) return { ok: false, reason: "button-not-found" };

    const start = performance.now();
    simulateClick(button);

    let count = 0;
    while (performance.now() - start < 8000) {
      count = segCount();
      if (count > 0) {
        return { ok: true, ms: Math.round(performance.now() - start), segCount: count };
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // Failed within our 8s window — dump extra diagnostics to find what's
    // actually in the panel, in case YouTube renders this video's segments
    // under a different element name/structure.
    const panel = document.querySelector(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']",
    );
    const panelVisibility = panel ? panel.getAttribute("visibility") : "no-panel";
    const anySegmentLike = Array.from(document.querySelectorAll("[class*='transcript' i], [class*='Transcript' i]"))
      .slice(0, 15)
      .map((el) => el.tagName + "." + Array.from(el.classList).join("."));
    return {
      ok: false,
      reason: "timeout-in-8s",
      finalCount: segCount(),
      buttonStillInDom: document.contains(button),
      panelVisibility,
      anySegmentLikeElements: anySegmentLike,
    };
  });

  console.log("RESULT:", JSON.stringify(result, null, 2));
  console.log("get_transcript network:", JSON.stringify(transcriptReq));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
