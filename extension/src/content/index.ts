import playerIcon from "../../icons/icon48.png";
import { cleanupCues, fetchCaptionTracks, getVideoId } from "../lib/youtube";
import { fetchCuesFromPanel } from "../lib/transcriptPanel";

const state = () => ({ videoId: getVideoId(location.href), title: document.title.replace(/ - YouTube$/, "").trim() });
let currentVideoId = state().videoId;
function notifyNavigation(): void {
  const next = state();
  if (next.videoId === currentVideoId) return;
  currentVideoId = next.videoId;
  void chrome.runtime.sendMessage({ type: "VIDEO_CHANGED", ...next }).catch(() => {});
}
document.addEventListener("yt-navigate-finish", notifyNavigation);
window.addEventListener("popstate", notifyNavigation);

// The transcript and translation UI lives in Chrome's panel.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_VIDEO_STATE") {
    sendResponse(state());
    return false;
  }
  if (message?.type === "SEEK_VIDEO") {
    if (message.videoId === state().videoId && Number.isFinite(message.seconds)) {
      const video = document.querySelector<HTMLVideoElement>("video");
      if (video) video.currentTime = Math.max(0, message.seconds);
    }
    sendResponse({ ok: true });
    return false;
  }
  if (!["GET_CAPTION_TRACKS", "GET_TRANSCRIPT"].includes(message?.type)) return false;
  void (async () => {
    try {
      if (!message.videoId || message.videoId !== state().videoId) throw new Error("Video changed");
      const data = message.type === "GET_CAPTION_TRACKS"
        ? await fetchCaptionTracks(message.videoId)
        : cleanupCues(await fetchCuesFromPanel(message.track));
      if (message.videoId !== state().videoId) throw new Error("Video changed");
      sendResponse({ data });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});
let lastTimeSent = 0;
document.addEventListener("timeupdate", (event) => {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || Date.now() - lastTimeSent < 250) return;
  lastTimeSent = Date.now();
  void chrome.runtime.sendMessage({ type: "VIDEO_TIME", videoId: state().videoId, time: video.currentTime }).catch(() => {});
}, true);

// YouTube replaces its controls during SPA navigation and player recreation.
// Keep exactly one launch button in the current video's control bar.
const PLAYER_BUTTON_ID = "yt-subs-player-button";
function mountPlayerButton(): void {
  const existing = document.getElementById(PLAYER_BUTTON_ID);
  const controls = getVideoId(location.href)
    ? document.querySelector<HTMLElement>("#movie_player .ytp-right-controls")
    : null;
  if (!controls) {
    existing?.remove();
    return;
  }
  const subtitles = controls.querySelector(".ytp-subtitles-button");
  const group = subtitles?.parentElement
    ?? controls.querySelector<HTMLElement>(".ytp-right-controls-left")
    ?? controls;
  if (existing?.parentElement === group) return;
  existing?.remove();
  const button = document.createElement("button");
  button.id = PLAYER_BUTTON_ID;
  button.type = "button";
  button.className = "ytp-button";
  button.disabled = true;
  button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;vertical-align:top;height:100%;padding:0;flex-shrink:0";
  button.title = chrome.i18n.getMessage("openSubtitlePanel") || "Open subtitle translator";
  button.setAttribute("aria-label", button.title);
  const icon = document.createElement("img");
  // Embed the approved PNG so page images never request chrome-extension URLs.
  icon.src = playerIcon;
  icon.alt = "";
  icon.draggable = false;
  icon.style.cssText = "width:24px;height:24px;object-fit:contain;display:block;pointer-events:none";
  button.appendChild(icon);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void chrome.runtime.sendMessage({ type: "OPEN_SUBTITLE_PANEL" }).then(response => {
      if (response?.error) console.error("Could not open subtitle panel:", response.error);
    }).catch(console.error);
  });
  void chrome.runtime.sendMessage({ type: "PREPARE_SUBTITLE_PANEL" }).then(response => {
    button.disabled = Boolean(response?.error);
  }).catch(console.error);
  if (subtitles) group.insertBefore(button, subtitles);
  else group.prepend(button);
}
let playerButtonUpdatePending = false;
new MutationObserver(() => {
  if (playerButtonUpdatePending) return;
  playerButtonUpdatePending = true;
  requestAnimationFrame(() => {
    playerButtonUpdatePending = false;
    mountPlayerButton();
  });
}).observe(document.body, { childList: true, subtree: true });
document.addEventListener("yt-navigate-finish", mountPlayerButton);
window.addEventListener("popstate", mountPlayerButton);
mountPlayerButton();
