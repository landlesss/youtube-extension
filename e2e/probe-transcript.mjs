// Standalone probe: reproduces exactly what our extension's transcriptPanel.ts
// does (find "Show transcript" button, click it, poll for segments) directly
// against real YouTube, WITHOUT loading our extension at all. This isolates
// whether flakiness is a YouTube-side thing vs something about our extension's
// execution context — and lets us gather repeatable stats instead of manual
// back-and-forth screenshots.
import { chromium } from "playwright";

const VIDEOS = [
  { id: "dQw4w9WgXcQ", label: "Rick Astley (short, huge, stable)" },
  { id: "fbSY5yMSURA", label: "RU auto-caption video" },
  { id: "gCR-WPuE_UA", label: "Life Lessons (used in manual repro)" },
];

const RUNS_PER_VIDEO = 3;
const POLL_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 200;

async function probeOnce(page, videoId) {
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: "domcontentloaded" });

  // Give the page a moment to render the description/transcript section,
  // same as a real user landing on the page would.
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async ({ pollTimeoutMs, pollIntervalMs }) => {
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
    while (performance.now() - start < pollTimeoutMs) {
      count = segCount();
      if (count > 0) {
        return {
          ok: true,
          ms: Math.round(performance.now() - start),
          segCount: count,
        };
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return {
      ok: false,
      reason: "timeout",
      buttonStillInDom: document.contains(button),
      finalCount: segCount(),
    };
  }, { pollTimeoutMs: POLL_TIMEOUT_MS, pollIntervalMs: POLL_INTERVAL_MS });

  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const rows = [];
  for (const video of VIDEOS) {
    for (let run = 1; run <= RUNS_PER_VIDEO; run++) {
      const res = await probeOnce(page, video.id);
      const row = { video: video.label, videoId: video.id, run, ...res };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }

  const successes = rows.filter((r) => r.ok);
  console.log("\n--- SUMMARY ---");
  console.log(`Success: ${successes.length}/${rows.length}`);
  if (successes.length > 0) {
    const times = successes.map((r) => r.ms);
    console.log(`Time to first segment: min=${Math.min(...times)}ms max=${Math.max(...times)}ms`);
  }
  const failures = rows.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.log("Failures:", JSON.stringify(failures, null, 2));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
