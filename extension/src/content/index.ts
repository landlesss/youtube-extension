import { cleanupCues, fetchCaptionTracks, getVideoId, serializeCues } from "../lib/youtube";
import { fetchCuesFromPanel } from "../lib/transcriptPanel";
import { downloadTextFile } from "../lib/download";
import { getSession, login, translateCues } from "../lib/api";
import { recordDownloadAndMaybeShowReviewPrompt } from "../lib/reviewPrompt";
import { SubtitlePanel } from "./ui";
import type { CaptionTrack, Cue, SubtitleFormat, TranslationMode } from "../types";

function toBilingualCues(original: Cue[], translated: Cue[]): Cue[] {
  return original.map((cue, i) => ({
    ...cue,
    text: translated[i] ? `${cue.text}\n${translated[i].text}` : cue.text,
  }));
}

let panel: SubtitlePanel | null = null;
let loadedVideoId: string | null = null;

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function getPageTitle(): string {
  return document.title.replace(/ - YouTube$/, "").trim() || "subtitles";
}

async function notifyDownloadCompleted(): Promise<void> {
  const shouldShowReviewPrompt = await recordDownloadAndMaybeShowReviewPrompt();
  if (shouldShowReviewPrompt) ensurePanel().showReviewToast();
}

function ensurePanel(): SubtitlePanel {
  if (panel) return panel;
  panel = new SubtitlePanel({
    onDownloadOriginal: async (track: CaptionTrack, format: SubtitleFormat) => {
      const cues = cleanupCues(await fetchCuesFromPanel(track));
      const content = serializeCues(cues, format);
      downloadTextFile(`${sanitizeFilename(getPageTitle())}.${track.languageCode}.${format}`, content);
      void notifyDownloadCompleted();
    },
    onCopyOriginal: async (track: CaptionTrack, format: SubtitleFormat) => {
      const cues = cleanupCues(await fetchCuesFromPanel(track));
      const content = serializeCues(cues, format);
      await navigator.clipboard.writeText(content);
    },
    onTranslateAndDownload: async (
      track: CaptionTrack,
      targetLang: string,
      format: SubtitleFormat,
      mode: TranslationMode,
    ) => {
      const session = await getSession();
      if (!session) throw new Error("Not signed in");
      const cues = cleanupCues(await fetchCuesFromPanel(track));
      const translated = await translateCues(cues, track.languageCode, targetLang, session);
      const finalCues = mode === "bilingual" ? toBilingualCues(cues, translated) : translated;
      const content = serializeCues(finalCues, format);
      const suffix =
        mode === "bilingual" ? `${track.languageCode}-${targetLang.toLowerCase()}.bilingual` : targetLang.toLowerCase();
      downloadTextFile(`${sanitizeFilename(getPageTitle())}.${suffix}.${format}`, content);
      void notifyDownloadCompleted();
    },
    onLogin: async () => login(),
    onToggle: (nextOpen) => {
      if (nextOpen) void loadTracksIfNeeded();
    },
  });
  return panel;
}

async function loadTracksIfNeeded(): Promise<void> {
  const videoId = getVideoId(location.href);
  const p = ensurePanel();
  if (!videoId) {
    p.renderEmpty();
    return;
  }
  if (videoId === loadedVideoId) return;

  p.renderLoading();
  try {
    const tracks = await fetchCaptionTracks(videoId);
    const session = await getSession();
    loadedVideoId = videoId;
    if (tracks.length === 0) {
      p.renderEmpty();
    } else {
      p.renderTracks(tracks, session);
    }
  } catch {
    p.renderEmpty();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TOGGLE_PANEL") {
    ensurePanel().toggle();
    sendResponse({ ok: true });
  }
  return true;
});

document.addEventListener("yt-navigate-finish", () => {
  loadedVideoId = null;
  if (panel?.isOpen()) void loadTracksIfNeeded();
});

if (getVideoId(location.href)) {
  ensurePanel();
}
