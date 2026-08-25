// Updates just extDescription (name stays as-is) for all store-listing
// locales: "100+ languages" copy -> "60 languages" copy, per Igor's new text.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../_locales");

const DESCRIPTIONS = {
  en: "Download and translate YouTube subtitles instantly. 60 languages supported.",
  de: "Lade YouTube-Untertitel sofort herunter und übersetze sie. 60 Sprachen unterstützt.",
  da: "Download og oversæt YouTube-undertekster øjeblikkeligt. Understøtter 60 sprog.",
  sv: "Ladda ner och översätt YouTube-undertexter direkt. Stöder 60 språk.",
  no: "Last ned og oversett YouTube-undertekster umiddelbart. Støtter 60 språk.",
  nl: "Download en vertaal YouTube-ondertitels direct. Ondersteunt 60 talen.",
  fr: "Téléchargez et traduisez les sous-titres YouTube instantanément. 60 langues supportées.",
  es: "Descarga y traduce subtítulos de YouTube al instante. Compatible con 60 idiomas.",
  pt_BR: "Baixe e traduza legendas do YouTube instantaneamente. Suporte para 60 idiomas.",
  hi: "YouTube सबटाइटल तुरंत डाउनलोड और अनुवाद करें। 60 भाषाओं का समर्थन।",
  id: "Unduh dan terjemahkan subtitle YouTube secara instan. Mendukung 60 bahasa.",
  ru: "Скачивайте и переводите субтитры YouTube мгновенно. Поддержка 60 языков.",
  zh_CN: "立即下载并翻译 YouTube 字幕。支持 60 种语言。",
  ja: "YouTube字幕を即座にダウンロードして翻訳。60言語に対応。",
  ko: "YouTube 자막을 즉시 다운로드하고 번역하세요. 60개 언어 지원.",
  ar: "قم بتنزيل وترجمة ترجمات يوتيوب فوراً. يدعم 60 لغة.",
  tr: "YouTube altyazılarını anında indirin ve çevirin. 60 dil desteği.",
  it: "Scarica e traduci i sottotitoli di YouTube all'istante. Supporta 60 lingue.",
  pl: "Pobierz i przetłumacz napisy z YouTube błyskawicznie. Obsługa 60 języków.",
  vi: "Tải xuống và dịch phụ đề YouTube tức thì. Hỗ trợ 60 ngôn ngữ.",
  am: "የዩቱብ ንዑስ ጽሁፎችን ወዲያውኑ ያውርዱ እና ይተርጉሙ። 60 ቋንቋዎች ይደገፋሉ።",
  bg: "Изтеглете и превеждайте субтитри от YouTube незабавно. Поддържа 60 езика.",
  bn: "YouTube সাবটাইটেল তাৎক্ষণিকভাবে ডাউনলোড ও অনুবাদ করুন। ৬০টি ভাষা সমর্থিত।",
  ca: "Descarrega i tradueix subtítols de YouTube a l'instant. Compatible amb 60 idiomes.",
  cs: "Stahujte a překládejte titulky z YouTube okamžitě. Podpora 60 jazyků.",
  el: "Κατεβάστε και μεταφράστε υπότιτλους YouTube άμεσα. Υποστηρίζει 60 γλώσσες.",
  es_419: "Descarga y traduce subtítulos de YouTube al instante. Compatible con 60 idiomas.",
  et: "Laadi alla ja tõlgi YouTube'i subtiitreid koheselt. Toetab 60 keelt.",
  fa: "زیرنویس‌های یوتیوب را فوراً دانلود و ترجمه کنید. پشتیبانی از ۶۰ زبان.",
  fi: "Lataa ja käännä YouTube-tekstityksiä heti. Tukee 60 kieltä.",
  fil: "I-download at isalin agad ang mga subtitle ng YouTube. Sumusuporta sa 60 wika.",
  gu: "YouTube સબટાઈટલ તરત ડાઉનલોડ અને અનુવાદ કરો. 60 ભાષાઓ સપોર્ટેડ.",
  he: "הורידו ותרגמו כתוביות מ-YouTube באופן מיידי. תומך ב-60 שפות.",
  hr: "Preuzmite i prevedite YouTube titlove odmah. Podržava 60 jezika.",
  hu: "Töltsön le és fordítson YouTube-feliratokat azonnal. 60 nyelv támogatása.",
  kn: "YouTube ಉಪಶೀರ್ಷಿಕೆಗಳನ್ನು ತಕ್ಷಣ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಮತ್ತು ಅನುವಾದಿಸಿ. 60 ಭಾಷೆಗಳ ಬೆಂಬಲ.",
  lt: "Atsisiųskite ir išverskite YouTube subtitrus iš karto. Palaiko 60 kalbų.",
  lv: "Lejupielādējiet un tulkojiet YouTube subtitrus uzreiz. Atbalsta 60 valodas.",
  ml: "YouTube സബ്ടൈറ്റിലുകൾ ഉടൻ ഡൗൺലോഡ് ചെയ്ത് വിവർത്തനം ചെയ്യുക. 60 ഭാഷകൾ പിന്തുണയ്ക്കുന്നു.",
  mr: "YouTube सबटायटल त्वरित डाउनलोड आणि भाषांतर करा. 60 भाषा समर्थित.",
  ms: "Muat turun dan terjemah sari kata YouTube serta-merta. Menyokong 60 bahasa.",
  pt_PT: "Descarregue e traduza legendas do YouTube instantaneamente. Suporte para 60 idiomas.",
  ro: "Descarcă și tradu subtitrările YouTube instantaneu. Compatibil cu 60 de limbi.",
  sk: "Sťahujte a prekladajte titulky z YouTube okamžite. Podpora 60 jazykov.",
  sl: "Prenesite in prevedite podnapise z YouTube takoj. Podpira 60 jezikov.",
  sr: "Преузмите и преведите титлове са YouTube-а одмах. Подржава 60 језика.",
  sw: "Pakua na tafsiri manukuu ya YouTube papo hapo. Inasaidia lugha 60.",
  ta: "YouTube வசனங்களை உடனடியாகப் பதிவிறக்கி மொழிபெயர்க்கவும். 60 மொழிகள் ஆதரவு.",
  te: "YouTube సబ్‌టైటిల్స్‌ను వెంటనే డౌన్‌లోడ్ చేసి అనువదించండి. 60 భాషల మద్దతు.",
  th: "ดาวน์โหลดและแปลคำบรรยาย YouTube ได้ทันที รองรับ 60 ภาษา",
  uk: "Завантажуйте та перекладайте субтитри YouTube миттєво. Підтримка 60 мов.",
  zh_TW: "立即下載並翻譯 YouTube 字幕。支援 60 種語言。",
};

let updated = 0;
for (const [code, description] of Object.entries(DESCRIPTIONS)) {
  const file = path.join(LOCALES_DIR, code, "messages.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.extDescription = { message: description };
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  updated++;
}
console.log(`updated extDescription in ${updated} locales`);
