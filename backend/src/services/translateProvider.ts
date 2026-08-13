import { config } from "../config.js";

export async function translateTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
): Promise<string[]> {
  if (texts.length === 0) return [];

  if (config.translateProvider === "google") {
    return translateWithGoogle(texts, sourceLang, targetLang);
  }
  return translateWithDeepL(texts, sourceLang, targetLang);
}

async function translateWithDeepL(
  texts: string[],
  sourceLang: string,
  targetLang: string,
): Promise<string[]> {
  const body = new URLSearchParams();
  for (const text of texts) body.append("text", text);
  body.append("source_lang", sourceLang.toUpperCase());
  body.append("target_lang", targetLang.toUpperCase());

  const res = await fetch(config.deeplApiUrl, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${config.deeplApiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`DeepL request failed (${res.status})`);
  }

  const data = (await res.json()) as { translations: Array<{ text: string }> };
  return data.translations.map((t) => t.text);
}

async function translateWithGoogle(
  texts: string[],
  sourceLang: string,
  targetLang: string,
): Promise<string[]> {
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${config.googleTranslateApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: texts,
        source: sourceLang.toLowerCase(),
        target: targetLang.toLowerCase(),
        format: "text",
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Google Translate request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  return data.data.translations.map((t) => t.translatedText);
}
