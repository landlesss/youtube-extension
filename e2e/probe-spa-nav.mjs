// Reproduces Valya's repro exactly: reload YouTube (land on homepage), type
// "vim" into search, click into a video from the results list — an SPA
// navigation, not a fresh page load — then check whether our extension's FAB
// (#yt-subs-downloader-host) exists. Loads the real unpacked extension so
// content script injection timing is authentic, not simulated.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../extension/dist");

async function main() {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
    ],
  });

  const page = context.pages()[0] ?? (await context.newPage());

  console.log("--- step 1: fresh load of youtube.com homepage ---");
  await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const hostOnHomepage = await page.evaluate(() => !!document.getElementById("yt-subs-downloader-host"));
  console.log("FAB host present on homepage (expected: false, no video):", hostOnHomepage);

  console.log("--- step 2: search for 'vim' ---");
  const searchBox = page.locator('input[name="search_query"]');
  await searchBox.click();
  await searchBox.fill("vim");
  await searchBox.press("Enter");
  await page.waitForTimeout(2500);

  console.log("--- step 3: click first video result (SPA navigation, no reload) ---");
  const firstResult = page.locator("ytd-video-renderer a#video-title, ytd-video-renderer #video-title-link").first();
  await firstResult.waitFor({ state: "visible", timeout: 15000 });
  const title = await firstResult.textContent();
  console.log("clicking video:", title?.trim());
  await firstResult.click();
  await page.waitForTimeout(3500);

  const url = page.url();
  console.log("landed on:", url);

  const hostAfterSpaNav = await page.evaluate(() => !!document.getElementById("yt-subs-downloader-host"));
  console.log("FAB host present after SPA nav into video (this is the bug check):", hostAfterSpaNav);

  console.log("--- step 4: full reload on this same video page, for comparison ---");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const hostAfterReload = await page.evaluate(() => !!document.getElementById("yt-subs-downloader-host"));
  console.log("FAB host present after full reload (expected: true):", hostAfterReload);

  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
