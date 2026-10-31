import type { Cue } from "../types";
import { getVideoId } from "./youtube";

// Use YouTube's own client in a separate, non-interactive document when its
// public caption endpoints reject direct requests. Never click the main page.
export async function fetchIsolatedTranscript(videoId: string): Promise<Cue[]> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.allow = "autoplay 'none'";
  frame.style.cssText = "position:fixed!important;left:-10000px!important;top:0!important;width:1280px!important;height:720px!important;visibility:hidden!important;pointer-events:none!important;border:0!important";
  frame.src = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&autoplay=0`;
  const deadline = Date.now() + 20000;
  let clicked = false;
  try {
    document.body.appendChild(frame);
    while (Date.now() < deadline) {
      if (getVideoId(location.href) !== videoId) throw new Error("Video changed");
      if (!document.body.contains(frame)) throw new Error("Transcript loading interrupted");
      const doc = frame.contentDocument;
      if (doc && doc.location.href.includes(`v=${videoId}`)) {
        for (const video of doc.querySelectorAll("video")) { video.muted = true; video.pause(); }
        const nodes = doc.querySelectorAll("transcript-segment-view-model, ytd-transcript-segment-renderer");
        const segments = Array.from(nodes).flatMap(node => {
          const stamp = node.querySelector(".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp")?.textContent?.trim();
          const text = node.querySelector("span.ytAttributedStringHost, .segment-text")?.textContent?.trim();
          if (!stamp || !text) return [];
          const parts = stamp.split(":").map(Number);
          if (parts.some(part => !Number.isFinite(part))) return [];
          return [{ start: parts.reduce((total, part) => total * 60 + part, 0), text }];
        });
        if (segments.length) return segments.map((segment, i) => ({ ...segment, end: segments[i + 1]?.start ?? segment.start + 4 }));
        const button = doc.querySelector<HTMLElement>("ytd-video-description-transcript-section-renderer button");
        if (button && !clicked) {
          clicked = true;
          const view = frame.contentWindow!;
          const options = { bubbles: true, cancelable: true, composed: true, view };
          button.dispatchEvent(new PointerEvent("pointerdown", options));
          button.dispatchEvent(new MouseEvent("mousedown", options));
          button.dispatchEvent(new PointerEvent("pointerup", options));
          button.dispatchEvent(new MouseEvent("mouseup", options));
          button.dispatchEvent(new MouseEvent("click", options));
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("YouTube couldn't provide this transcript. Try reloading the video.");
  } finally {
    frame.remove();
  }
}
