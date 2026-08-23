// Fills any key present in en/messages.json but missing from a locale's
// messages.json with the English value — without touching keys that locale
// already has translated. Needed because chrome.i18n does NOT fall back
// key-by-key to default_locale; a locale folder that exists but lacks a key
// just renders blank for that key, not English.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../_locales");

const en = JSON.parse(readFileSync(path.join(LOCALES_DIR, "en", "messages.json"), "utf8"));

for (const locale of readdirSync(LOCALES_DIR)) {
  if (locale === "en") continue;
  const file = path.join(LOCALES_DIR, locale, "messages.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const [key, value] of Object.entries(en)) {
    if (!(key in data)) {
      data[key] = value;
      added++;
    }
  }
  if (added > 0) {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`${locale}: added ${added} missing key(s)`);
  }
}
