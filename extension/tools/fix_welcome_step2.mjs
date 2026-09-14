// The toolbar button no longer shows "CC" text — it's the extension icon
// now. Update welcomeStep2 in every locale (localized for en/ru/no, English
// text everywhere else, matching how the rest of those locales fall back).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../_locales");

const EN = "Click the round icon in the top-right corner of the page.";
const LOCALIZED = {
  en: EN,
  ru: "Нажмите на круглую иконку в правом верхнем углу страницы.",
  no: "Klikk på det runde ikonet øverst til høyre på siden.",
};

for (const locale of readdirSync(LOCALES_DIR)) {
  const file = path.join(LOCALES_DIR, locale, "messages.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data.welcomeStep2) continue;
  data.welcomeStep2 = { message: LOCALIZED[locale] ?? EN };
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`updated ${locale}/welcomeStep2`);
}
