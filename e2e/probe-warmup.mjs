// Test whether a "cold" browser context (zero cookies, first request ever)
// is the actual cause of the 400 FAILED_PRECONDITION — as opposed to the
// specific video. Visits youtube.com first to let YouTube set its normal
// visitor-id cookies, THEN navigates to the target video, mimicking how a
// real user's browser (which always already has those cookies from earlier
// browsing) actually behaves.
import { chromium } from "playwright";

const VIDEOS = [
  { id: "gCR-WPuE_UA", label: "Life Lessons" },
  { id: "RZ4p-saaQkc", label: "Vim Tutorial" },
];

async function probe(page, videoId, label) {
  let transcriptStatus = null;
  const handler = async (req) => {
    if (req.url().includes("get_transcript")) {
      const res = await req.response();
      transcriptStatus = res?.status();
    }
  };
  page.on("requestfinished", handler);

  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: "domcontentloaded" });
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
    while (performance.now() - start < 8000) {
      const c = segCount();
      if (c > 0) return { ok: true, ms: Math.round(performance.now() - start), segCount: c };
      await new Promise((r) => setTimeout(r, 200));
    }
    return { ok: false, reason: "timeout" };
  });

  page.off("requestfinished", handler);
  console.log(`${label} (${videoId}):`, JSON.stringify(result), "get_transcript status:", transcriptStatus);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("--- warming up: visiting youtube.com homepage first ---");
  await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const cookies = await context.cookies();
  console.log(`cookies established after homepage visit: ${cookies.length}`);

  console.log("--- now testing both videos in this warmed-up context ---");
  for (const v of VIDEOS) {
    await probe(page, v.id, v.label);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
