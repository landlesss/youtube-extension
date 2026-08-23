import type { CaptionTrack, Cue } from "../types";

// YouTube's timedtext API now frequently requires a PO (proof-of-origin) token
// for auto-generated captions and returns HTTP 200 with an empty body without
// one. The token is computed by the player's own obfuscated JS and isn't
// exposed on captionTracks.baseUrl, so a plain fetch() can't reproduce it.
//
// Workaround: since the on-page transcript panel is populated by YouTube's own
// client (which already has a valid token), we open it and read the rendered
// segments from the DOM instead of calling the API ourselves. This is brittle
// against YouTube markup changes.
//
// YouTube currently serves (at least) two different DOM implementations for
// this panel, seemingly split by account/experiment cohort rather than by
// video: a newer "ytw"-prefixed component set (<transcript-segment-view-model>,
// captured August 2026) and an older Polymer-style renderer
// (<ytd-transcript-segment-renderer>, confirmed still live in the same month
// on a different account). Both are handled below — will need updating if
// YouTube retires or redesigns either one.
//
// Known limitation: the panel shows whichever caption language YouTube's
// player currently has selected. We don't yet drive the panel's own language
// switcher, so for videos with multiple caption tracks the download may not
// match the "Original language" chosen in our own dropdown.

// On a working video, YouTube's own transcript panel populates in well under
// 1s (measured 250-480ms). When YouTube's internal get_transcript API fails
// server-side for a given video (confirmed via network capture: it returns
// HTTP 400 FAILED_PRECONDITION for some videos, independent of our code,
// the user's account, or click method — a YouTube-side issue we can't fix),
// that failure also happens almost immediately. So a long timeout only makes
// users wait needlessly for a request that has already failed; 8s leaves
// generous headroom for a slow connection without that wait.
const PANEL_OPEN_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;

async function waitFor<T>(check: () => T | null | undefined, timeoutMs: number): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    "YouTube couldn't load the transcript for this video. This is a YouTube-side issue on some videos — try again later or use a different video.",
  );
}

// YouTube's newer button components (the "ytSpecButtonShapeNext..." family)
// may key their interaction off the real pointer/mouse event sequence rather
// than the synthetic "click" event alone that HTMLElement.click() fires.
// Not confirmed as the root cause of the timeout bug (that turned out to be
// PANEL_OPEN_TIMEOUT_MS being too tight), but dispatching the fuller event
// sequence is a strict superset of a plain click and can't hurt.
function simulateClick(el: HTMLElement): void {
  const opts = { bubbles: true, cancelable: true, composed: true, view: window };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
}

function findTranscriptButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "ytd-video-description-transcript-section-renderer button",
  );
}

function findSegments(): HTMLElement[] {
  const modern = document.querySelectorAll<HTMLElement>("transcript-segment-view-model");
  if (modern.length > 0) return Array.from(modern);
  return Array.from(document.querySelectorAll<HTMLElement>("ytd-transcript-segment-renderer"));
}

interface OpenedPanel {
  button: HTMLElement;
  // Whether this call is the one that opened the panel — only that caller
  // should close it again afterward. Otherwise a second call on the same
  // video (or a panel the user already had open manually) could toggle it
  // back open instead of leaving it alone.
  weOpenedIt: boolean;
}

async function openPanel(): Promise<OpenedPanel> {
  if (findSegments().length > 0) {
    const button = findTranscriptButton();
    if (button) return { button, weOpenedIt: false };
  }

  const button = findTranscriptButton();
  if (!button) {
    throw new Error('Couldn\'t find YouTube\'s "Show transcript" button on this page');
  }
  simulateClick(button);
  await waitFor(() => (findSegments().length > 0 ? true : null), PANEL_OPEN_TIMEOUT_MS);
  return { button, weOpenedIt: true };
}

function parseTimestamp(text: string): number | null {
  const parts = text.trim().split(":").map(Number);
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function readSegments(): Cue[] {
  const raw: Array<{ start: number; text: string }> = [];

  for (const node of findSegments()) {
    const timestampEl =
      node.querySelector(".ytwTranscriptSegmentViewModelTimestamp") ??
      node.querySelector(".segment-timestamp");
    const textEl =
      node.querySelector("span.ytAttributedStringHost") ?? node.querySelector(".segment-text");
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

// The auto-loaded live preview and any button the user clicks (Download /
// Copy / Translate) can both call this around the same time. Without
// serializing them, two concurrent calls each toggle the same "Show
// transcript" button — one opens it, the other's toggle click closes it
// again mid-wait, and the first call times out waiting for segments that
// never arrive. Track-switching isn't implemented (see note above), so
// concurrent calls are reading the same underlying panel state anyway —
// sharing one in-flight request is both a fix and a free optimization.
let inFlight: Promise<Cue[]> | null = null;

export async function fetchCuesFromPanel(track: CaptionTrack): Promise<Cue[]> {
  if (inFlight) return inFlight;
  inFlight = runFetchCuesFromPanel(track).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFetchCuesFromPanel(track: CaptionTrack): Promise<Cue[]> {
  const { button, weOpenedIt } = await openPanel();
  const cues = readSegments();
  if (weOpenedIt) simulateClick(button); // only close it if we're the ones who opened it

  if (cues.length === 0) {
    throw new Error(`No transcript text found for "${track.name}" — try again`);
  }
  return cues;
}
