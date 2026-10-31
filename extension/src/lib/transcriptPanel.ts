import type { CaptionTrack, Cue } from "../types";
import { fetchIsolatedTranscript } from "./isolatedTranscript";
import { getVideoId } from "./youtube";

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (typeof item.text === "string") return item.text;
  if (typeof item.simpleText === "string") return item.simpleText;
  if (typeof item.content === "string") return item.content;
  if (Array.isArray(item.runs)) return item.runs.map(textOf).join("");
  return Object.values(item).map(textOf).join("");
}

export function parseTranscriptResponse(body: unknown): Cue[] {
  const cues: Cue[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const segment = (item.transcriptSegmentRenderer ?? item.transcriptSegmentViewModel) as Record<string, unknown> | undefined;
    if (segment) {
      const start = Number(segment.startMs) / 1000;
      const end = Number(segment.endMs) / 1000;
      const text = textOf(segment.snippet ?? segment.text).trim();
      if (Number.isFinite(start) && text) cues.push({ start, end: Number.isFinite(end) && end > start ? end : start + 4, text });
      return;
    }
    for (const child of Object.values(item)) visit(child);
  }
  visit(body);
  return cues;
}

// Direct requests are preferred. A separate hidden document provides a fallback
// without opening or clicking YouTube engagement panels in the visible page.
const pending = new Map<string, Promise<Cue[]>>();
const cached = new Map<string, Cue[]>();
export async function fetchCuesFromPanel(track: CaptionTrack): Promise<Cue[]> {
  const videoId = getVideoId(location.href);
  if (!videoId) throw new Error("Open a YouTube video first");
  const key = `${videoId}:${track.languageCode}`;
  const ready = cached.get(key);
  if (ready) return ready;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetchCaptionFile(track).catch(() => fetchTranscript(videoId)).catch(() => fetchIsolatedTranscript(videoId)).then(cues => {
    if (cached.size >= 5) cached.delete(cached.keys().next().value!);
    cached.set(key, cues);
    return cues;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

async function fetchCaptionFile(track: CaptionTrack): Promise<Cue[]> {
  const url = new URL(track.baseUrl);
  if (url.origin !== "https://www.youtube.com") throw new Error("Invalid caption URL");
  url.searchParams.set("fmt", "json3");
  const response = await fetch(url.href, { credentials: "same-origin", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Caption file unavailable");
  const body = await response.json() as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
  const cues = (body.events ?? []).flatMap(event => {
    const text = event.segs?.map(segment => segment.utf8 ?? "").join("").trim();
    if (!text || event.tStartMs === undefined) return [];
    const start = event.tStartMs / 1000;
    return [{ start, end: start + (event.dDurationMs ?? 4000) / 1000, text }];
  });
  if (!cues.length) throw new Error("Caption file is empty");
  return cues;
}

async function fetchTranscript(videoId: string): Promise<Cue[]> {
  const page = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { credentials: "same-origin", signal: AbortSignal.timeout(15000) });
  if (!page.ok) throw new Error(`YouTube request failed (${page.status})`);
  const html = await page.text();
  const paramsMatch = html.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*("(?:[^"\\]|\\.)*")/);
  const versionMatch = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
  const visitorMatch = html.match(/"VISITOR_DATA"\s*:\s*("(?:[^"\\]|\\.)*")/);
  if (!paramsMatch || !versionMatch) throw new Error("YouTube did not provide a transcript for this video");
  const response = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
    method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": versionMatch[1] },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: versionMatch[1], ...(visitorMatch ? { visitorData: JSON.parse(visitorMatch[1]) } : {}) } },
      params: JSON.parse(paramsMatch[1]),
    }),
  });
  if (!response.ok) throw new Error(`YouTube couldn't load the transcript (${response.status})`);
  const cues = parseTranscriptResponse(await response.json());
  if (!cues.length) throw new Error("YouTube returned an empty transcript");
  return cues;
}
