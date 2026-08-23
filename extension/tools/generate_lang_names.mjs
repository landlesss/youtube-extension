// Adds localized "langName_<CODE>" message keys (one per TARGET_LANGUAGES
// entry in ui.ts) to en/ru/no — the three locales with full UI translations
// — so the translate-target picker shows exonyms in the extension's current
// display language, matching how YouTube's own language picker works
// (e.g. "Норвежский" when the UI is Russian, "Norwegian" in English).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../_locales");

// code -> [en, ru, no]
const NAMES = {
  EN: ["English", "Английский", "Engelsk"],
  ES: ["Spanish", "Испанский", "Spansk"],
  RU: ["Russian", "Русский", "Russisk"],
  PT: ["Portuguese", "Португальский", "Portugisisk"],
  HI: ["Hindi", "Хинди", "Hindi"],
  DE: ["German", "Немецкий", "Tysk"],
  FR: ["French", "Французский", "Fransk"],
  JA: ["Japanese", "Японский", "Japansk"],
  KO: ["Korean", "Корейский", "Koreansk"],
  AR: ["Arabic", "Арабский", "Arabisk"],
  ZH: ["Chinese (Mandarin)", "Китайский (мандарин)", "Kinesisk (mandarin)"],
  YUE: ["Cantonese", "Кантонский", "Kantonesisk"],
  ID: ["Indonesian", "Индонезийский", "Indonesisk"],
  TR: ["Turkish", "Турецкий", "Tyrkisk"],
  VI: ["Vietnamese", "Вьетнамский", "Vietnamesisk"],
  TH: ["Thai", "Тайский", "Thai"],
  FIL: ["Filipino", "Филиппинский", "Filippinsk"],
  BN: ["Bengali", "Бенгальский", "Bengalsk"],
  TE: ["Telugu", "Телугу", "Telugu"],
  MR: ["Marathi", "Маратхи", "Marathi"],
  TA: ["Tamil", "Тамильский", "Tamilsk"],
  UR: ["Urdu", "Урду", "Urdu"],
  FA: ["Persian", "Персидский", "Persisk"],
  HE: ["Hebrew", "Иврит", "Hebraisk"],
  MS: ["Malay", "Малайский", "Malayisk"],
  IT: ["Italian", "Итальянский", "Italiensk"],
  PL: ["Polish", "Польский", "Polsk"],
  NL: ["Dutch", "Нидерландский", "Nederlandsk"],
  SV: ["Swedish", "Шведский", "Svensk"],
  NO: ["Norwegian", "Норвежский", "Norsk"],
  DA: ["Danish", "Датский", "Dansk"],
  FI: ["Finnish", "Финский", "Finsk"],
  CS: ["Czech", "Чешский", "Tsjekkisk"],
  RO: ["Romanian", "Румынский", "Rumensk"],
  HU: ["Hungarian", "Венгерский", "Ungarsk"],
  UK: ["Ukrainian", "Украинский", "Ukrainsk"],
  EL: ["Greek", "Греческий", "Gresk"],
  BG: ["Bulgarian", "Болгарский", "Bulgarsk"],
  HR: ["Croatian", "Хорватский", "Kroatisk"],
  SR: ["Serbian", "Сербский", "Serbisk"],
  SK: ["Slovak", "Словацкий", "Slovakisk"],
  LT: ["Lithuanian", "Литовский", "Litauisk"],
  LV: ["Latvian", "Латышский", "Latvisk"],
  ET: ["Estonian", "Эстонский", "Estisk"],
  CA: ["Catalan", "Каталанский", "Katalansk"],
  KK: ["Kazakh", "Казахский", "Kasakhisk"],
  UZ: ["Uzbek", "Узбекский", "Usbekisk"],
  AZ: ["Azerbaijani", "Азербайджанский", "Aserbajdsjansk"],
  KA: ["Georgian", "Грузинский", "Georgisk"],
  HY: ["Armenian", "Армянский", "Armensk"],
  SW: ["Swahili", "Суахили", "Swahili"],
  AF: ["Afrikaans", "Африкаанс", "Afrikaans"],
  PA: ["Punjabi", "Панджаби", "Panjabi"],
  GU: ["Gujarati", "Гуджарати", "Gujarati"],
  KN: ["Kannada", "Каннада", "Kannada"],
  ML: ["Malayalam", "Малаялам", "Malayalam"],
  SI: ["Sinhala", "Сингальский", "Singalesisk"],
  KM: ["Khmer", "Кхмерский", "Khmer"],
  MY: ["Burmese", "Бирманский", "Burmesisk"],
  IS: ["Icelandic", "Исландский", "Islandsk"],
};

const LOCALE_INDEX = { en: 0, ru: 1, no: 2 };

for (const [locale, idx] of Object.entries(LOCALE_INDEX)) {
  const file = path.join(LOCALES_DIR, locale, "messages.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const [code, names] of Object.entries(NAMES)) {
    data[`langName_${code}`] = { message: names[idx] };
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`updated ${locale}/messages.json with ${Object.keys(NAMES).length} language names`);
}
