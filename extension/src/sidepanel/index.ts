import { getVideoId, serializeCues } from "../lib/youtube";
import { downloadTextFile } from "../lib/download";
import { claimVideoAccess, getMe, getSession, translateAllCues } from "../lib/api";
import { t } from "../lib/i18n";
import { recordActionAndMaybeShowReviewPrompt } from "../lib/reviewPrompt";
import { SubtitlePanel } from "../content/ui";
import type { CaptionTrack, Cue, Quota, Session, SubtitleFormat } from "../types";

let panel: SubtitlePanel | null = null;
let loadedVideoId: string | null = null;
let currentVideoId: string | null = null;
let activeTabId: number | null = null;
let pageTitle = "subtitles";
let selectionGeneration = 0;
const tabParameter = new URL(location.href).searchParams.get("tabId");
const boundTabId = tabParameter !== null && /^\d+$/.test(tabParameter) ? Number(tabParameter) : null;
let loadGeneration = 0;
let loadingGeneration: number | null = null;

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function getPageTitle(): string {
  return pageTitle;
}

// Any successful download, copy, or translate counts as one use — counting
// only downloads meant people who mostly copy or translate never got asked.
async function notifyActionCompleted(): Promise<void> {
  const shouldShowReviewPrompt = await recordActionAndMaybeShowReviewPrompt();
  if (shouldShowReviewPrompt) ensurePanel().showReviewToast();
}

async function getCleanCues(track: CaptionTrack): Promise<Cue[]> {
  return requestPage<Cue[]>("GET_TRANSCRIPT", { track });
}

// Anonymous and linked sessions use the same server-enforced per-video quota.
async function requireVideoAccess(): Promise<{ videoId: string; session: Session; quota: Quota }> {
  const generation = selectionGeneration;
  const videoId = currentVideoId;
  const session = await getSession();
  if (!session) throw new Error(t("notSignedInError"));
  if (!videoId) throw new Error(t("error"));
  const quota = await claimVideoAccess(videoId, session);
  if (generation !== selectionGeneration) throw new Error("Video changed");
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
      void notifyActionCompleted();
    },
    onCopy: async (cues: Cue[], format: SubtitleFormat) => {
      const { quota } = await requireVideoAccess();
      ensurePanel().updateQuota(quota);
      const content = serializeCues(cues, format);
      await navigator.clipboard.writeText(content);
      void notifyActionCompleted();
    },
    onTranslate: async (track: CaptionTrack, targetLang: string) => {
      const generation = selectionGeneration;
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
      if (generation !== selectionGeneration) throw new Error("Video changed");
      ensurePanel().updateQuota(translateQuota);
      void notifyActionCompleted();
      return { original: cues, translated };
    },
    onLoadTranscript: async (track: CaptionTrack) => getCleanCues(track),
    onSeek: (seconds) => {
      if (activeTabId !== null) void chrome.tabs.sendMessage(activeTabId, { type: "SEEK_VIDEO", videoId: currentVideoId, seconds }).catch(() => {});
    },
  });
  return panel;
}

async function loadTracksIfNeeded(): Promise<void> {
  const videoId = currentVideoId;
  const p = ensurePanel();
  if (!videoId) {
    loadedVideoId = null;
    p.renderEmpty();
    return;
  }
  if (videoId === loadedVideoId || loadingGeneration === loadGeneration) return;

  const generation = ++loadGeneration;
  loadingGeneration = generation;
  p.renderLoading();
  try {
    const tracks = await requestPage<CaptionTrack[]>("GET_CAPTION_TRACKS");
    const session = await getSession().catch(() => null);
    const quota = session ? await getMe(session).catch(() => null) : null;
    if (session && quota?.isAnonymous !== undefined) session.isAnonymous = quota.isAnonymous;
    if (generation !== loadGeneration || currentVideoId !== videoId) return;
    loadedVideoId = videoId;
    if (tracks.length === 0) {
      p.renderEmpty();
    } else {
      p.renderTracks(tracks, session, quota);
    }
  } catch {
    if (generation !== loadGeneration || currentVideoId !== videoId) return;
    p.renderEmpty();
  } finally {
    if (loadingGeneration === generation) loadingGeneration = null;
  }
}

async function requestPage<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
  const tabId = activeTabId;
  const videoId = currentVideoId;
  const selection = selectionGeneration;
  if (tabId === null || !videoId) throw new Error(t("noSubtitles"));
  const response = await chrome.tabs.sendMessage(tabId, { type, videoId, ...extra });
  if (selection !== selectionGeneration) throw new Error("Video changed");
  if (response?.error) throw new Error(response.error);
  return response.data as T;
}

function selectVideo(tabId: number | null, videoId: string | null, title: string): void {
  pageTitle = title || "subtitles";
  if (activeTabId === tabId && currentVideoId === videoId) return;
  activeTabId = tabId;
  currentVideoId = videoId;
  loadedVideoId = null;
  ++selectionGeneration;
  ++loadGeneration;
  if (videoId) void loadTracksIfNeeded();
  else ensurePanel().renderEmpty();
}

let refreshGeneration = 0;
async function refreshActiveTab(): Promise<void> {
  const generation = ++refreshGeneration;
  if (boundTabId === null) return;
  const tab = await chrome.tabs.get(boundTabId).catch(() => null);
  if (generation !== refreshGeneration) return;
  const tabId = tab?.id ?? null;
  const videoId = tab?.url ? getVideoId(tab.url) : null;
  selectVideo(tabId, videoId, tab?.title ?? "");
  if (tabId === null || !tab?.url?.startsWith("https://www.youtube.com/")) return;
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: "GET_VIDEO_STATE" });
    if (generation === refreshGeneration) {
      selectVideo(tabId, state.videoId, state.title);
      if (currentVideoId && loadedVideoId !== currentVideoId) void loadTracksIfNeeded();
    }
  } catch { /* The content script may still be starting after a full navigation. */ }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab?.id !== activeTabId) return false;
  if (message?.type === "VIDEO_CHANGED") {
    ++refreshGeneration;
    selectVideo(activeTabId, message.videoId, message.title);
  } else if (message?.type === "VIDEO_TIME" && message.videoId === currentVideoId) {
    ensurePanel().updatePlaybackTime(message.time);
  }
  return false;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId === activeTabId && (change.url || change.status === "complete")) void refreshActiveTab();
});
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === activeTabId) void refreshActiveTab();
});
ensurePanel().renderEmpty();
void refreshActiveTab();
