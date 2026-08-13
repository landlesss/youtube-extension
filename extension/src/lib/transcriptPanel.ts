import type { CaptionTrack, Cue } from "../types";

// YouTube's timedtext API now frequently requires a PO (proof-of-origin) token
// for auto-generated captions and returns HTTP 200 with an empty body without
// one. The token is computed by the player's own obfuscated JS and isn't
// exposed on captionTracks.baseUrl, so a plain fetch() can't reproduce it.
//
// Workaround: since the on-page transcript panel is populated by YouTube's own
// client (which already has a valid token), we open it and read the rendered
// segments from the DOM instead of calling the API ourselves. This is brittle
// against YouTube markup changes — selectors below were captured from the
// live DOM in August 2026 (YouTube's newer "ytw"-prefixed component set) and
// will need updating if YouTube redesigns the panel again.
//
// Known limitation: the panel shows whichever caption language YouTube's
// player currently has selected. We don't yet drive the panel's own language
// switcher, so for videos with multiple caption tracks the download may not
// match the "Original language" chosen in our own dropdown.

const PANEL_OPEN_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;

async function waitFor<T>(check: () => T | null | undefined, timeoutMs: number): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for YouTube's transcript panel");
}

function findTranscriptButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "ytd-video-description-transcript-section-renderer button",
  );
}

function findSegments(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("transcript-segment-view-model"));
}

async function openPanel(): Promise<HTMLElement> {
  if (findSegments().length > 0) {
    const button = findTranscriptButton();
    if (button) return button;
  }

  const button = findTranscriptButton();
  if (!button) {
    throw new Error('Couldn\'t find YouTube\'s "Show transcript" button on this page');
  }
  button.click();
  await waitFor(() => (findSegments().length > 0 ? true : null), PANEL_OPEN_TIMEOUT_MS);
  return button;
}

function parseTimestamp(text: string): number | null {
  const parts = text.trim().split(":").map(Number);
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function readSegments(): Cue[] {
  const raw: Array<{ start: number; text: string }> = [];

  for (const node of findSegments()) {
    const timestampEl = node.querySelector(".ytwTranscriptSegmentViewModelTimestamp");
    const textEl = node.querySelector("span.ytAttributedStringHost");
    const start = parseTimestamp(timestampEl?.textContent ?? "");
    const text = textEl?.textContent?.trim() ?? "";
    if (start === null || !text) continue;
    raw.push({ start, text });
  }

  // The panel only exposes a start time per line, so we approximate each
  // cue's end as the next cue's start (and pad the last one by 4s).
  return raw.map((seg, i) => ({
    start: seg.start,
    end: raw[i + 1] ? raw[i + 1].start : seg.start + 4,
    text: seg.text,
  }));
}

export async function fetchCuesFromPanel(track: CaptionTrack): Promise<Cue[]> {
  const toggleButton = await openPanel();
  const cues = readSegments();
  toggleButton.click(); // closes the panel again (it's a toggle)

  if (cues.length === 0) {
    throw new Error(`No transcript text found for "${track.name}" — try again`);
  }
  return cues;
}
