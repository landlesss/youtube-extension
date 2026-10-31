import { createRequire } from "node:module";
const { chromium } = createRequire(new URL("../../e2e/package.json", import.meta.url))("playwright");
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHOTS = [
  { file: "screenshot1.html", out: "screenshot-1-1280x800.png", width: 1280, height: 800 },
  { file: "screenshot2.html", out: "screenshot-2-1280x800.png", width: 1280, height: 800 },
  { file: "small-tile.html", out: "small-promo-tile-440x280.png", width: 440, height: 280 },
  { file: "marquee.html", out: "marquee-promo-1400x560.png", width: 1400, height: 560 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.goto(`file://${path.join(__dirname, shot.file)}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(__dirname, "..", shot.out) });
    console.log(`saved ${shot.out} (${shot.width}x${shot.height})`);
    await page.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
