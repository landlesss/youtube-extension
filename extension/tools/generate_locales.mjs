// Generates _locales/<code>/messages.json for every store-listing locale.
// Chrome's chrome.i18n does NOT fall back key-by-key to default_locale when
// a locale folder exists but is missing a key — it falls back only when the
// whole locale folder is absent. So each new locale folder is a full clone
// of en/messages.json (keeping the in-panel UI working in English for that
// locale) with just extName/extDescription overridden to the localized
// store listing copy below.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../_locales");

const LISTING = {
  en: { name: "Download Subtitles from YouTube", description: "Download and translate YouTube subtitles instantly. 100+ languages supported." },
  de: { name: "YouTube Untertitel herunterladen", description: "Lade YouTube-Untertitel sofort herunter und übersetze sie. 100+ Sprachen unterstützt." },
  da: { name: "Download YouTube-undertekster", description: "Download og oversæt YouTube-undertekster øjeblikkeligt. Understøtter 100+ sprog." },
  sv: { name: "Ladda ner YouTube-undertexter", description: "Ladda ner och översätt YouTube-undertexter direkt. Stöder 100+ språk." },
  no: { name: "Last ned YouTube-undertekster", description: "Last ned og oversett YouTube-undertekster umiddelbart. Støtter 100+ språk." },
  nl: { name: "YouTube-ondertitels downloaden", description: "Download en vertaal YouTube-ondertitels direct. Ondersteunt 100+ talen." },
  fr: { name: "Télécharger les sous-titres YouTube", description: "Téléchargez et traduisez les sous-titres YouTube instantanément. 100+ langues supportées." },
  es: { name: "Descargar subtítulos de YouTube", description: "Descarga y traduce subtítulos de YouTube al instante. Compatible con 100+ idiomas." },
  pt_BR: { name: "Baixar legendas do YouTube", description: "Baixe e traduza legendas do YouTube instantaneamente. Suporte para 100+ idiomas." },
  hi: { name: "YouTube सबटाइटल डाउनलोड करें", description: "YouTube सबटाइटल तुरंत डाउनलोड और अनुवाद करें। 100+ भाषाओं का समर्थन।" },
  id: { name: "Unduh subtitle YouTube", description: "Unduh dan terjemahkan subtitle YouTube secara instan. Mendukung 100+ bahasa." },
  ru: { name: "Скачать субтитры с YouTube", description: "Скачивайте и переводите субтитры YouTube мгновенно. Поддержка 100+ языков." },
  zh_CN: { name: "下载 YouTube 字幕", description: "立即下载并翻译 YouTube 字幕。支持 100 多种语言。" },
  ja: { name: "YouTube字幕をダウンロード", description: "YouTube字幕を即座にダウンロードして翻訳。100以上の言語に対応。" },
  ko: { name: "YouTube 자막 다운로드", description: "YouTube 자막을 즉시 다운로드하고 번역하세요. 100개 이상의 언어 지원." },
  ar: { name: "تحميل ترجمات يوتيوب", description: "قم بتنزيل وترجمة ترجمات يوتيوب فوراً. يدعم أكثر من 100 لغة." },
  tr: { name: "YouTube Altyazılarını İndir", description: "YouTube altyazılarını anında indirin ve çevirin. 100+ dil desteği." },
  it: { name: "Scarica i sottotitoli di YouTube", description: "Scarica e traduci i sottotitoli di YouTube all'istante. Supporta 100+ lingue." },
  pl: { name: "Pobierz napisy z YouTube", description: "Pobierz i przetłumacz napisy z YouTube błyskawicznie. Obsługa 100+ języków." },
  vi: { name: "Tải phụ đề YouTube", description: "Tải xuống và dịch phụ đề YouTube tức thì. Hỗ trợ hơn 100 ngôn ngữ." },
  am: { name: "Download YouTube Subtitles", description: "የዩቱብ ንዑስ ጽሁፎችን ወዲያውኑ ያውርዱ እና ይተርጉሙ። ከ100 በላይ ቋንቋዎች ይደገፋሉ።" },
  bg: { name: "Изтегляне на субтитри от YouTube", description: "Изтеглете и превеждайте субтитри от YouTube незабавно. Поддържа над 100 езика." },
  bn: { name: "YouTube সাবটাইটেল ডাউনলোড করুন", description: "YouTube সাবটাইটেল তাৎক্ষণিকভাবে ডাউনলোড ও অনুবাদ করুন। ১০০+ ভাষা সমর্থিত।" },
  ca: { name: "Descarregar subtítols de YouTube", description: "Descarrega i tradueix subtítols de YouTube a l'instant. Compatible amb més de 100 idiomes." },
  cs: { name: "Stáhnout titulky z YouTube", description: "Stahujte a překládejte titulky z YouTube okamžitě. Podpora více než 100 jazyků." },
  el: { name: "Λήψη υπότιτλων YouTube", description: "Κατεβάστε και μεταφράστε υπότιτλους YouTube άμεσα. Υποστηρίζει 100+ γλώσσες." },
  es_419: { name: "Descargar subtítulos de YouTube", description: "Descarga y traduce subtítulos de YouTube al instante. Compatible con más de 100 idiomas." },
  et: { name: "Laadi alla YouTube'i subtiitrid", description: "Laadi alla ja tõlgi YouTube'i subtiitreid koheselt. Toetab 100+ keelt." },
  fa: { name: "دانلود زیرنویس یوتیوب", description: "زیرنویس‌های یوتیوب را فوراً دانلود و ترجمه کنید. پشتیبانی از بیش از ۱۰۰ زبان." },
  fi: { name: "Lataa YouTube-tekstitykset", description: "Lataa ja käännä YouTube-tekstityksiä heti. Tukee yli 100 kieltä." },
  fil: { name: "I-download ang YouTube Subtitles", description: "I-download at isalin agad ang mga subtitle ng YouTube. Sumusuporta sa 100+ na wika." },
  gu: { name: "YouTube સબટાઈટલ ડાઉનલોડ કરો", description: "YouTube સબટાઈટલ તરત ડાઉનલોડ અને અનુવાદ કરો. 100+ ભાષાઓ સપોર્ટેડ." },
  he: { name: "הורדת כתוביות מ-YouTube", description: "הורידו ותרגמו כתוביות מ-YouTube באופן מיידי. תומך ביותר מ-100 שפות." },
  hr: { name: "Preuzmi titlove s YouTubea", description: "Preuzmite i prevedite YouTube titlove odmah. Podržava 100+ jezika." },
  hu: { name: "YouTube feliratok letöltése", description: "Töltsön le és fordítson YouTube-feliratokat azonnal. 100+ nyelv támogatása." },
  kn: { name: "YouTube ಉಪಶೀರ್ಷಿಕೆಗಳನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ", description: "YouTube ಉಪಶೀರ್ಷಿಕೆಗಳನ್ನು ತಕ್ಷಣ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಮತ್ತು ಅನುವಾದಿಸಿ. 100+ ಭಾಷೆಗಳ ಬೆಂಬಲ." },
  lt: { name: "Atsisiųsti YouTube subtitrus", description: "Atsisiųskite ir išverskite YouTube subtitrus iš karto. Palaiko daugiau nei 100 kalbų." },
  lv: { name: "Lejupielādēt YouTube subtitrus", description: "Lejupielādējiet un tulkojiet YouTube subtitrus uzreiz. Atbalsta 100+ valodas." },
  ml: { name: "YouTube സബ്ടൈറ്റിലുകൾ ഡൗൺലോഡ് ചെയ്യുക", description: "YouTube സബ്ടൈറ്റിലുകൾ ഉടൻ ഡൗൺലോഡ് ചെയ്ത് വിവർത്തനം ചെയ്യുക. 100+ ഭാഷകൾ പിന്തുണയ്ക്കുന്നു." },
  mr: { name: "YouTube सबटायटल डाउनलोड करा", description: "YouTube सबटायटल त्वरित डाउनलोड आणि भाषांतर करा. 100+ भाषा समर्थित." },
  ms: { name: "Muat turun sari kata YouTube", description: "Muat turun dan terjemah sari kata YouTube serta-merta. Menyokong 100+ bahasa." },
  pt_PT: { name: "Descarregar legendas do YouTube", description: "Descarregue e traduza legendas do YouTube instantaneamente. Suporte para 100+ idiomas." },
  ro: { name: "Descarcă subtitrări YouTube", description: "Descarcă și tradu subtitrările YouTube instantaneu. Compatibil cu peste 100 de limbi." },
  sk: { name: "Stiahnuť titulky z YouTube", description: "Sťahujte a prekladajte titulky z YouTube okamžite. Podpora viac ako 100 jazykov." },
  sl: { name: "Prenesi podnapise z YouTube", description: "Prenesite in prevedite podnapise z YouTube takoj. Podpira več kot 100 jezikov." },
  sr: { name: "Преузми титлове са YouTube-а", description: "Преузмите и преведите титлове са YouTube-а одмах. Подржава 100+ језика." },
  sw: { name: "Pakua Manukuu ya YouTube", description: "Pakua na tafsiri manukuu ya YouTube papo hapo. Inasaidia lugha 100+." },
  ta: { name: "YouTube வசனங்களைப் பதிவிறக்கவும்", description: "YouTube வசனங்களை உடனடியாகப் பதிவிறக்கி மொழிபெயர்க்கவும். 100+ மொழிகள் ஆதரவு." },
  te: { name: "YouTube సబ్‌టైటిల్స్ డౌన్‌లోడ్ చేయండి", description: "YouTube సబ్‌టైటిల్స్‌ను వెంటనే డౌన్‌లోడ్ చేసి అనువదించండి. 100+ భాషల మద్దతు." },
  th: { name: "ดาวน์โหลดคำบรรยาย YouTube", description: "ดาวน์โหลดและแปลคำบรรยาย YouTube ได้ทันที รองรับกว่า 100 ภาษา" },
  uk: { name: "Завантажити субтитри з YouTube", description: "Завантажуйте та перекладайте субтитри YouTube миттєво. Підтримка 100+ мов." },
  zh_TW: { name: "下載 YouTube 字幕", description: "立即下載並翻譯 YouTube 字幕。支援 100 多種語言。" },
};

const enTemplate = JSON.parse(readFileSync(path.join(LOCALES_DIR, "en", "messages.json"), "utf8"));

for (const [code, { name, description }] of Object.entries(LISTING)) {
  const dir = path.join(LOCALES_DIR, code);
  mkdirSync(dir, { recursive: true });

  // en and ru already have full, hand-translated UI strings — only touch
  // the store-listing name/description there, keep everything else as is.
  const existingPath = path.join(dir, "messages.json");
  let base = enTemplate;
  try {
    base = JSON.parse(readFileSync(existingPath, "utf8"));
  } catch {
    // No existing file for this locale — clone the English template so the
    // in-panel UI still works (English) even though only name/description
    // are localized for this locale.
  }

  const updated = {
    ...base,
    extName: { message: name },
    extDescription: { message: description },
  };

  writeFileSync(existingPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(`wrote ${code}/messages.json`);
}
