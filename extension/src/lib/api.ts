import type { Cue, Session } from "../types";

export const BACKEND_URL = "http://localhost:8787";

export async function getSession(): Promise<Session | null> {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
  return response?.session ?? null;
}

export async function login(): Promise<Session | null> {
  const response = await chrome.runtime.sendMessage({ type: "LOGIN" });
  if (response?.error) throw new Error(response.error);
  return response?.session ?? null;
}

export async function translateCues(
  cues: Cue[],
  sourceLang: string,
  targetLang: string,
  session: Session,
): Promise<Cue[]> {
  const res = await fetch(`${BACKEND_URL}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      texts: cues.map((c) => c.text),
      sourceLang,
      targetLang,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Translate request failed (${res.status})`);
  }

  const { translations } = (await res.json()) as { translations: string[] };
  return cues.map((cue, i) => ({ ...cue, text: translations[i] ?? cue.text }));
}
