import { cleanupCues, fetchCaptionTracks, getVideoId, serializeCues } from "../lib/youtube";
import { fetchCuesFromPanel } from "../lib/transcriptPanel";
import { downloadTextFile } from "../lib/download";
import { claimVideoAccess, getMe, getSession, login, translateAllCues } from "../lib/api";
import { t } from "../lib/i18n";
import { recordDownloadAndMaybeShowReviewPrompt } from "../lib/reviewPrompt";
import { SubtitlePanel } from "./ui";
import type { CaptionTrack, Cue, Quota, Session, SubtitleFormat } from "../types";

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

async function getCleanCues(track: CaptionTrack): Promise<Cue[]> {
  return cleanupCues(await fetchCuesFromPanel(track));
}

// Claims today's per-video slot on the backend. Every download/copy/translate
// action must call this first — it's what the backend uses to enforce the
// daily video quota, and it requires a signed-in session (unlike just
// previewing the transcript, which stays available while signed out).
async function requireVideoAccess(): Promise<{ videoId: string; session: Session; quota: Quota }> {
  const session = await getSession();
  if (!session) throw new Error(t("notSignedInError"));
  const videoId = getVideoId(location.href);
  if (!videoId) throw new Error(t("error"));
  const quota = await claimVideoAccess(videoId, session);
  return { videoId, session, quota };
}

function ensurePanel(): SubtitlePanel {
  if (panel) return panel;
  panel = new SubtitlePanel({
    onDownload: async (cues: Cue[], format: SubtitleFormat, suffix: string) => {
      const { quota } = await requireVideoAccess();
      ensurePanel().updateQuota(quota);
      const content = serializeCues(cues, format);
      downloadTextFile(`${sanitizeFilename(getPageTitle())}.${suffix}.${format}`, content);
      void notifyDownloadCompleted();
    },
    onCopy: async (cues: Cue[], format: SubtitleFormat) => {
      const { quota } = await requireVideoAccess();
      ensurePanel().updateQuota(quota);
      const content = serializeCues(cues, format);
      await navigator.clipboard.writeText(content);
    },
    onTranslate: async (track: CaptionTrack, targetLang: string) => {
      const { videoId, session, quota } = await requireVideoAccess();
      ensurePanel().updateQuota(quota);
      const cues = await getCleanCues(track);
      const { cues: translated, quota: translateQuota } = await translateAllCues(
        videoId,
        cues,
        track.languageCode,
        targetLang,
        session,
      );
      ensurePanel().updateQuota(translateQuota);
      return { original: cues, translated };
    },
    onLoadTranscript: async (track: CaptionTrack) => getCleanCues(track),
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
    const quota = session ? await getMe(session).catch(() => null) : null;
    loadedVideoId = videoId;
    if (tracks.length === 0) {
      p.renderEmpty();
    } else {
      p.renderTracks(tracks, session, quota);
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
  // YouTube is a single-page app: navigating from a non-video page (home,
  // search results) into a video via its own router does NOT re-run content
  // scripts, only fires this event. If the extension first loaded on a
  // non-video page, `panel` was never created (see the bottom of this file),
  // so the FAB never appeared — confirmed via Playwright: SPA nav into a
  // video left #yt-subs-downloader-host absent, while a full reload of the
  // same URL created it. Ensuring the panel here (not just updating an
  // existing one) fixes that.
  if (getVideoId(location.href)) ensurePanel();
  if (panel?.isOpen()) void loadTracksIfNeeded();
});

if (getVideoId(location.href)) {
  ensurePanel();
}
