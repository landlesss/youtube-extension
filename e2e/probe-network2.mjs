import { chromium } from "playwright";

const VIDEO_ID = "gCR-WPuE_UA";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let bodyText = null;
  let requestPostData = null;
  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (url.includes("get_transcript")) {
      requestPostData = req.postData();
      const res = await req.response();
      if (res) {
        try {
          bodyText = await res.text();
        } catch (e) {
          bodyText = `<error reading body: ${e.message}>`;
        }
      }
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
  await page.waitForTimeout(4000);

  console.log("--- REQUEST POST DATA ---");
  console.log(requestPostData);
  console.log("--- RESPONSE BODY ---");
  console.log(bodyText);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
