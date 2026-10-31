import type { CaptionTrack, Cue, Quota, SubtitleFormat, Session, TranslationMode } from "../types";
import { t } from "../lib/i18n";
import { reviewPageUrl } from "../lib/reviewPrompt";
import { describeApiError } from "../lib/api";
import { FEEDBACK_FORM_URL } from "../lib/config";
import { toBilingualCues } from "../lib/cues";

const HOST_ID = "yt-subs-downloader-host";

const ICONS: Record<string, string> = {
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 12l5 5 5-5"/><path d="M5 21h14"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  format: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></svg>`,
  translate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h7"/><path d="M7 3v2c0 4-2 7-5 9"/><path d="M3 12c2 1 4 1 6 0"/><path d="M13 21l4-9 4 9"/><path d="M14.5 18h5"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Swaps a button's content for a spinner while an async action runs, and
// restores it afterward — a visible loading state beats a static label.
function setBusy(el: HTMLElement, busy: boolean, label?: string): void {
  if (busy) {
    if (el.dataset.originalHtml === undefined) el.dataset.originalHtml = el.innerHTML;
    el.innerHTML = `<span class="spinner"></span>${label ? `<span class="icon-label">${label}</span>` : ""}`;
  } else if (el.dataset.originalHtml !== undefined) {
    el.innerHTML = el.dataset.originalHtml;
    delete el.dataset.originalHtml;
  }
}

// Ordered by the business priority list (biggest/highest-value audiences
// first) rather than alphabetically, so the most relevant options appear
// before the user even starts typing in the searchable picker. Labels come
// from t(`langName_${code}`) at render time, not stored here — like
// YouTube's own language picker, each name should show as an exonym in the
// panel's current display language ("Norwegian" in English, "Норвежский" in
// Russian), not always in its own native form.
const TARGET_LANGUAGE_CODES: string[] = [
  "EN", "ES", "RU", "PT", "HI", "DE", "FR", "JA", "KO", "AR",
  "ZH", "YUE", "ID", "TR", "VI", "TH", "FIL", "BN", "TE", "MR",
  "TA", "UR", "FA", "HE", "MS", "IT", "PL", "NL", "SV", "NO",
  "DA", "FI", "CS", "RO", "HU", "UK", "EL", "BG", "HR", "SR",
  "SK", "LT", "LV", "ET", "CA", "KK", "UZ", "AZ", "KA", "HY",
  "SW", "AF", "PA", "GU", "KN", "ML", "SI", "KM", "MY", "IS",
];

function targetLanguageLabel(code: string): string {
  return t(`langName_${code}`) || code;
}

export interface PanelCallbacks {
  onDownload: (cues: Cue[], format: SubtitleFormat, filenameSuffix: string) => Promise<void>;
  onCopy: (cues: Cue[], format: SubtitleFormat) => Promise<void>;
  onTranslate: (
    track: CaptionTrack,
    targetLang: string,
  ) => Promise<{ original: Cue[]; translated: Cue[] }>;
  onLoadTranscript: (track: CaptionTrack) => Promise<Cue[]>;
  onSeek: (seconds: number) => void;
}

interface SearchableSelect {
  element: HTMLDivElement;
  getValue: () => string;
}

function createSearchableSelect(
  options: Array<{ value: string; label: string }>,
  onChange?: (value: string) => void,
): SearchableSelect {
  const wrapper = document.createElement("div");
  wrapper.className = "searchable-select";

  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;

  const list = document.createElement("div");
  list.className = "searchable-select-list hidden";

  let selected = options[0];
  input.value = selected?.label ?? "";

  function renderList(filter: string): void {
    list.innerHTML = "";
    const query = filter.trim().toLowerCase();
    const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;

    for (const opt of filtered) {
      const item = document.createElement("div");
      item.className = "searchable-select-item";
      item.textContent = opt.label;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // avoid input blur firing before the click registers
        const changed = selected?.value !== opt.value;
        selected = opt;
        input.value = opt.label;
        list.classList.add("hidden");
        if (changed) onChange?.(opt.value);
      });
      list.appendChild(item);
    }
  }

  input.addEventListener("focus", () => {
    renderList("");
    list.classList.remove("hidden");
  });
  input.addEventListener("input", () => {
    renderList(input.value);
    list.classList.remove("hidden");
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      input.value = selected?.label ?? "";
      list.classList.add("hidden");
    }, 0);
  });

  wrapper.append(input, list);
  return { element: wrapper, getValue: () => selected?.value ?? "" };
}

export class SubtitlePanel {
  private shadow: ShadowRoot;
  private root: HTMLDivElement;

  private previewGeneration = 0;
  private transcriptCues: Cue[] = [];
  // The plain, untranslated cues for the currently selected track — kept
  // separate from transcriptCues because that array can hold the merged
  // bilingual text shown in the live preview after a translation.
  private originalCues: Cue[] = [];
  // Result of the last successful Translate action, kept only while it still
  // matches the selected target language — lets Download/Copy reuse it
  // instead of re-translating, and is invalidated on any track change.
  private lastTranslation: { targetLang: string; translated: Cue[] } | null = null;
  private transcriptRowEls: HTMLElement[] = [];
  private activeIndex = -1;
  updatePlaybackTime(time: number): void {
    const idx = this.transcriptCues.findIndex(c => time >= c.start && time < c.end);
    if (idx === this.activeIndex) return;
    this.activeIndex = idx;
    this.transcriptRowEls.forEach((el, i) => el.classList.toggle("active", i === idx));
    if (idx >= 0) this.transcriptRowEls[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  constructor(private callbacks: PanelCallbacks) {
    // Always start from a fresh host: a closed shadow root can't be reattached
    // to, so if a stale host from a previous instantiation is still around we
    // just replace it rather than trying to reuse its (inaccessible) shadow.
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);

    // Keep the panel styles isolated inside its extension document.
    this.shadow = host.attachShadow({ mode: "closed" });
    this.root = document.createElement("div");
    this.shadow.appendChild(this.styleEl());

    this.shadow.appendChild(this.root);
    this.root.className = "panel";
  }

  private styleEl(): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = `
      .panel {
        box-sizing: border-box;
        position: relative;
        width: 100%;
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        background: rgba(12, 15, 21, 0.98);
        color: #f5f7fb;
        border-left: 1px solid rgba(255,255,255,0.08);
        border-radius: 0;
        box-shadow: -14px 0 28px rgba(0,0,0,0.28);
        font-family: Roboto, Arial, sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        padding: 12px 14px 10px;
        backdrop-filter: blur(8px);
      }
      .panel > * { flex-shrink: 0; }
      .panel.hidden { display: none; }
      .title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .title-group { display: flex; align-items: center; gap: 8px; }
      .title-icon { width: 20px; height: 20px; border-radius: 0; display: block; }
      .title { font-size: 14px; font-weight: 600; }
      .icon-btn {
        width: auto;
        margin: 0;
        padding: 0 6px;
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 18px;
        line-height: 1.4;
      }
      .icon-btn:hover { color: #f1f1f1; }
      select, button {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid #303030;
        background: #1f1f1f;
        color: #f1f1f1;
        font-size: 13px;
      }
      button {
        cursor: pointer;
        background: #4fd1c5;
        color: #0f0f0f;
        font-weight: 600;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      button:disabled { opacity: 0.5; cursor: default; }
      button.secondary { background: #272727; color: #f1f1f1; }
      .btn-row { display: flex; gap: 8px; }
      .btn-row button { width: auto; flex: 1; margin-top: 6px; }
      .icon-grid { display: flex; gap: 6px; margin-top: 10px; }
      .icon-cell {
        flex: 1;
        width: auto;
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        background: #182035;
        border: 1px solid #2a3450;
        border-radius: 10px;
        padding: 8px 4px 6px;
        cursor: pointer;
        color: #4fd1c5;
      }
      .icon-cell:hover { background: #202b48; }
      .icon-cell.active { border-color: #4fd1c5; background: #1c3d3a; }
      .icon-cell:disabled { opacity: 0.5; cursor: default; }
      .icon-cell svg { width: 20px; height: 20px; }
      .icon-cell .icon-label { font-size: 10px; color: #c7d2e0; font-weight: 600; }
      .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: yt-subs-spin 0.7s linear infinite;
      }
      @keyframes yt-subs-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .spinner { animation-duration: 1.6s; }
      }
      .format-cell { position: relative; }
      .format-chevron { color: #6f7f9c; margin-top: -2px; }
      .format-chevron svg { width: 10px; height: 10px; display: block; }
      .format-select-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        border: none;
        opacity: 0;
        cursor: pointer;
      }
      .translate-panel { margin-top: 10px; }
      .translate-panel.hidden { display: none; }
      .row { margin-bottom: 10px; }
      .status { margin-top: 8px; opacity: 0.8; min-height: 16px; }
      .empty { opacity: 0.7; }
      .quota-line { font-size: 12px; opacity: 0.7; margin-top: 6px; }
      .hidden { display: none; }
      .searchable-select { position: relative; }
      .searchable-select input {
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid #303030;
        background: #1f1f1f;
        color: #f1f1f1;
        font-size: 13px;
        font-family: inherit;
      }
      .searchable-select-list {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 2px;
        max-height: 160px;
        overflow-y: auto;
        background: #1f1f1f;
        border: 1px solid #303030;
        border-radius: 8px;
        z-index: 10;
      }
      .searchable-select-item {
        padding: 8px;
        cursor: pointer;
        font-size: 13px;
      }
      .searchable-select-item:hover { background: #303030; }
      .transcript-list {
        margin-top: 10px;
        flex: 1 1 220px;
        min-height: 120px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 2px;
      }
      .transcript-row {
        flex-shrink: 0;
        background: #1a2b3a;
        border: 1px solid #24384a;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        line-height: 1.4;
      }
      .transcript-row:hover { background: #20364a; }
      .transcript-row.active {
        background: #24435e;
        border-color: #4fd1c5;
      }
      .transcript-ts {
        display: block;
        font-size: 11px;
        color: #7fb8f0;
        font-weight: 600;
        margin-bottom: 2px;
      }
      .transcript-text { font-size: 13px; }
      .transcript-line-original { color: #e8edf5; white-space: pre-line; }
      .transcript-line-translation {
        color: #4fd1c5;
        white-space: pre-line;
        margin-top: 5px;
        padding-top: 5px;
        border-top: 1px dashed #2a3450;
      }
      .review-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        max-width: calc(100vw - 32px);
        background: #14202e;
        color: #f1f1f1;
        border: 2px solid #4fd1c5;
        border-radius: 16px;
        padding: 24px 52px 24px 24px;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.3;
        box-shadow: 0 12px 48px rgba(0,0,0,0.65), 0 0 0 6px rgba(79,209,197,0.18);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 16px;
        animation: yt-subs-toast-in 0.35s ease-out;
      }
      @keyframes yt-subs-toast-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .review-toast { animation: none; }
      }
      .star-row { display: flex; gap: 6px; }
      .star-btn {
        width: auto;
        margin: 0;
        padding: 0 2px;
        background: transparent;
        border: none;
        color: #5b6b80;
        font-size: 44px;
        line-height: 1;
        cursor: pointer;
      }
      .star-btn.lit { color: #f5c518; }
      .review-toast-close {
        position: absolute;
        top: 12px;
        right: 14px;
        width: auto;
        margin: 0;
        padding: 4px 8px;
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 28px;
        line-height: 1;
      }
      .review-toast-close:hover { color: #f1f1f1; }
    `;
    return style;
  }

  updateQuota(quota: Quota): void {
    const el = this.shadow.querySelector<HTMLElement>(".quota-line");
    if (!el) return;
    el.textContent = quota.plan === "pro" ? t("quotaProLine") : t("quotaFreeLine", String(quota.remaining ?? 0));
  }

  // Lets the live preview show original+translation together after a
  // successful Translate action, reusing the already-fetched translation
  // (no extra backend call, no extra quota spent).
  setTranscriptPreview(cues: Cue[]): void {
    this.renderTranscriptList(cues);
  }

  private renderTranscriptList(cues: Cue[]): void {
    this.transcriptCues = cues;
    this.activeIndex = -1;
    this.transcriptRowEls = [];

    const container = this.shadow.querySelector<HTMLElement>(".transcript-list");
    if (!container) return;
    container.innerHTML = "";

    if (cues.length === 0) {
      container.innerHTML = `<div class="empty">${t("noSubtitles")}</div>`;
      return;
    }

    for (const cue of cues) {
      const row = document.createElement("div");
      row.className = "transcript-row";

      const ts = document.createElement("span");
      ts.className = "transcript-ts";
      ts.textContent = formatClock(cue.start);

      const text = document.createElement("div");
      text.className = "transcript-text";
      // Bilingual cues join original+translation with "\n" (see
      // toBilingualCues in content/index.ts) — split them back out so they
      // render as visually distinct lines instead of one merged block.
      const [originalLine, ...translationLines] = cue.text.split("\n");
      const originalEl = document.createElement("div");
      originalEl.className = "transcript-line-original";
      originalEl.textContent = originalLine;
      text.appendChild(originalEl);
      if (translationLines.length > 0) {
        const translationEl = document.createElement("div");
        translationEl.className = "transcript-line-translation";
        translationEl.textContent = translationLines.join("\n");
        text.appendChild(translationEl);
      }

      row.append(ts, text);
      row.addEventListener("click", () => {
        this.callbacks.onSeek(cue.start);
      });

      container.appendChild(row);
      this.transcriptRowEls.push(row);
    }


  }

  private async loadTranscriptPreview(track: CaptionTrack): Promise<void> {
    const generation = ++this.previewGeneration;
    const container = this.shadow.querySelector<HTMLElement>(".transcript-list");
    this.originalCues = [];
    this.transcriptCues = [];
    if (container) container.innerHTML = `<div class="empty">${t("loading")}</div>`;
    // A newly selected track's original text has nothing to do with any
    // translation run for the previous one.
    this.lastTranslation = null;
    try {
      const cues = await this.callbacks.onLoadTranscript(track);
      if (generation !== this.previewGeneration) return;
      this.originalCues = cues;
      this.renderTranscriptList(cues);
    } catch (err) {
      if (generation !== this.previewGeneration) return;
      if (container) {
        container.innerHTML = `<div class="empty">${err instanceof Error ? err.message : t("error")}</div>`;
      }
    }
  }

  showReviewToast(): void {
    if (this.shadow.querySelector(".review-toast")) return;

    const toast = document.createElement("div");
    toast.className = "review-toast";

    const text = document.createElement("span");
    text.textContent = t("reviewToastText");

    // 4-5 stars → public Chrome Web Store review. 1-3 stars → private
    // feedback form instead, so an unhappy user doesn't end up leaving a
    // public bad review we can't do anything about.
    const starRow = document.createElement("div");
    starRow.className = "star-row";
    const stars: HTMLButtonElement[] = [];
    for (let value = 1; value <= 5; value++) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star-btn";
      star.textContent = "★";
      star.title = t("reviewToastRateLabel", String(value));
      star.addEventListener("mouseenter", () => {
        stars.forEach((s, i) => s.classList.toggle("lit", i < value));
      });
      star.addEventListener("click", () => {
        const url = value >= 4 ? reviewPageUrl() : FEEDBACK_FORM_URL;
        window.open(url, "_blank", "noopener,noreferrer");
        toast.remove();
      });
      stars.push(star);
      starRow.appendChild(star);
    }
    starRow.addEventListener("mouseleave", () => stars.forEach((s) => s.classList.remove("lit")));

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "review-toast-close";
    closeBtn.textContent = "×";
    closeBtn.title = t("closeButton");
    closeBtn.setAttribute("aria-label", t("closeButton"));
    closeBtn.addEventListener("click", () => toast.remove());

    toast.append(text, starRow, closeBtn);
    this.shadow.appendChild(toast);
    // Deliberately no auto-dismiss: this appears only once, ever, so a timer
    // meant most people never noticed it. It stays until rated or closed.
  }

  private resetVideoState(): void {
    ++this.previewGeneration;

    this.transcriptCues = [];
    this.originalCues = [];
    this.lastTranslation = null;
    this.transcriptRowEls = [];
    this.activeIndex = -1;
  }

  renderLoading(): void {
    this.resetVideoState();
    this.root.innerHTML = "";
    this.root.insertAdjacentHTML("beforeend", `<div class="empty">${t("loading")}</div>`);
  }

  renderEmpty(): void {
    this.resetVideoState();
    this.root.innerHTML = "";
    this.root.insertAdjacentHTML("beforeend", `<div class="empty">${t("noSubtitles")}</div>`);
  }

  renderTracks(tracks: CaptionTrack[], _session: Session | null, quota: Quota | null = null): void {
    this.resetVideoState();
    this.root.innerHTML = "";

    const langRow = document.createElement("div");
    langRow.className = "row";
    const langLabel = document.createElement("label");
    langLabel.textContent = t("languageLabel");
    // Assigned only in the signed-in branch below (the translate section
    // doesn't exist at all when signed out) — guarded as optional so this
    // callback, which can outlive that branch, never touches an uninitialized
    // binding.
    let updateSameLanguageState: (() => void) | null = null;
    let updateTranslationStatusLine: (() => void) | null = null;

    const langSelect = createSearchableSelect(
      tracks.map((track) => ({
        value: track.languageCode,
        label: `${track.name}${track.isAutoGenerated ? " (auto)" : ""}`,
      })),
      (value) => {
        const track = tracks.find((tr) => tr.languageCode === value);
        if (track) void this.loadTranscriptPreview(track);
        updateSameLanguageState?.();
        updateTranslationStatusLine?.();
      },
    );
    langRow.append(langLabel, langSelect.element);
    this.root.appendChild(langRow);

    const formatSelect = document.createElement("select");
    formatSelect.title = t("formatLabel");
    for (const fmt of ["srt", "vtt", "txt"] as SubtitleFormat[]) {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = fmt.toUpperCase();
      formatSelect.appendChild(opt);
    }

    const transcriptList = document.createElement("div");
    transcriptList.className = "transcript-list";
    this.root.appendChild(transcriptList);

    const defaultTrack = tracks.find((tr) => tr.languageCode === langSelect.getValue()) ?? tracks[0];
    if (defaultTrack) void this.loadTranscriptPreview(defaultTrack);

    const status = document.createElement("div");
    status.className = "status";

    // A guest session has the same controls and server-enforced quota.
    // Google linking is optional and never blocks the first action.
    const quotaLine = document.createElement("div");
    quotaLine.className = "quota-line";
    this.root.appendChild(quotaLine);
    if (quota) this.updateQuota(quota);

    // Compact icon toolbar: format + download + copy + a translate toggle
    // that reveals the target-language/mode controls only when needed,
    // instead of stacking every control as its own full-width row.
    const iconGrid = document.createElement("div");
    iconGrid.className = "icon-grid";

    const formatCell = document.createElement("div");
    formatCell.className = "icon-cell format-cell";

    const formatIcon = document.createElement("span");
    formatIcon.innerHTML = ICONS.format;

    const formatLabel = document.createElement("span");
    formatLabel.className = "icon-label";
    formatLabel.textContent = formatSelect.value.toUpperCase();
    formatSelect.addEventListener("change", () => {
      formatLabel.textContent = formatSelect.value.toUpperCase();
    });

    // A plain "SRT" label reads as a static badge, not a control — the
    // chevron is the same "this is a dropdown" cue used elsewhere on the web,
    // so users notice the format can be changed instead of missing it.
    const formatChevron = document.createElement("span");
    formatChevron.className = "format-chevron";
    formatChevron.innerHTML = ICONS.chevronDown;

    // The <select> is stretched invisibly over the whole cell (rather than
    // sitting small inside it) so a click anywhere on the card — not just
    // the native select's own tiny hit box — opens the format picker.
    formatSelect.className = "format-select-overlay";

    formatCell.title = t("formatHint");
    formatCell.append(formatIcon, formatLabel, formatChevron, formatSelect);

    const downloadCell = document.createElement("button");
    downloadCell.type = "button";
    downloadCell.className = "icon-cell";
    downloadCell.title = t("downloadButtonHint");
    downloadCell.innerHTML = `${ICONS.download}<span class="icon-label">${t("downloadButton")}</span>`;

    const copyCell = document.createElement("button");
    copyCell.type = "button";
    copyCell.className = "icon-cell";
    copyCell.title = t("copyButtonHint");
    copyCell.innerHTML = `${ICONS.copy}<span class="icon-label">${t("copyButton")}</span>`;

    const translateCell = document.createElement("button");
    translateCell.type = "button";
    translateCell.className = "icon-cell";
    translateCell.title = t("translateButtonHint");
    translateCell.innerHTML = `${ICONS.translate}<span class="icon-label">${t("translateButton")}</span>`;

    iconGrid.append(formatCell, downloadCell, copyCell, translateCell);
    this.root.appendChild(iconGrid);

    // Persistent reminder of what Download/Copy currently act on, since that
    // now silently follows the last translation instead of always being the
    // original — visible regardless of whether the translate panel is open.
    const translationStatusLine = document.createElement("div");
    translationStatusLine.className = "quota-line hidden";
    this.root.appendChild(translationStatusLine);

    const translatePanel = document.createElement("div");
    translatePanel.className = "translate-panel";
    translateCell.classList.add("active");

    const targetRow = document.createElement("div");
    targetRow.className = "row";
    const targetLabel = document.createElement("label");
    targetLabel.textContent = t("targetLanguageLabel");
    const targetSelect = createSearchableSelect(
      TARGET_LANGUAGE_CODES.map((code) => ({ value: code, label: targetLanguageLabel(code) })),
      () => {
        updateSameLanguageState?.();
        updateTranslationStatusLine?.();
      },
    );
    targetRow.append(targetLabel, targetSelect.element);
    translatePanel.appendChild(targetRow);

    const modeRow = document.createElement("div");
    modeRow.className = "row";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = t("modeLabel");
    const modeToggle = document.createElement("div");
    modeToggle.className = "btn-row";
    const modeTranslationBtn = document.createElement("button");
    modeTranslationBtn.type = "button";
    modeTranslationBtn.textContent = t("modeTranslationOnly");
    const modeBilingualBtn = document.createElement("button");
    modeBilingualBtn.type = "button";
    modeBilingualBtn.textContent = t("modeBilingual");
    modeToggle.append(modeTranslationBtn, modeBilingualBtn);
    modeRow.append(modeLabel, modeToggle);
    translatePanel.appendChild(modeRow);

    let mode: TranslationMode = "translation";
    const updateModeButtons = () => {
      modeTranslationBtn.classList.toggle("secondary", mode !== "translation");
      modeBilingualBtn.classList.toggle("secondary", mode !== "bilingual");
    };
    updateModeButtons();
    modeTranslationBtn.addEventListener("click", () => {
      mode = "translation";
      updateModeButtons();
    });
    modeBilingualBtn.addEventListener("click", () => {
      mode = "bilingual";
      updateModeButtons();
    });

    const sameLanguageHint = document.createElement("div");
    sameLanguageHint.className = "empty";
    sameLanguageHint.textContent = t("sameLanguageHint");
    translatePanel.appendChild(sameLanguageHint);

    const translateSubmitBtn = document.createElement("button");
    translateSubmitBtn.textContent = t("translateButton");
    translateSubmitBtn.style.marginTop = "6px";
    translatePanel.appendChild(translateSubmitBtn);

    this.root.appendChild(translatePanel);
    this.root.appendChild(status);

    // A source and target of the same language is a no-op the backend will
    // reject anyway — catch it here so the user isn't left waiting on a
    // request that's guaranteed to fail.
    updateSameLanguageState = () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      const sameLanguage = !!track && track.languageCode.split("-")[0].toLowerCase() === targetSelect.getValue().toLowerCase();
      sameLanguageHint.classList.toggle("hidden", !sameLanguage);
      translateSubmitBtn.disabled = sameLanguage;
    };
    updateSameLanguageState();

    // Download/Copy use whichever cues are currently "active": the last
    // translation, as long as it still matches the selected target language
    // (switching target language invalidates it without needing to null it
    // out), combined per the current mode toggle — or the plain original
    // text if no matching translation exists yet.
    const activeCues = (): Cue[] => {
      if (this.lastTranslation && this.lastTranslation.targetLang === targetSelect.getValue()) {
        return mode === "bilingual"
          ? toBilingualCues(this.originalCues, this.lastTranslation.translated)
          : this.lastTranslation.translated;
      }
      return this.originalCues;
    };
    const activeSuffix = (track: CaptionTrack): string => {
      if (this.lastTranslation && this.lastTranslation.targetLang === targetSelect.getValue()) {
        const targetLang = targetSelect.getValue().toLowerCase();
        return mode === "bilingual" ? `${track.languageCode}-${targetLang}.bilingual` : targetLang;
      }
      return track.languageCode;
    };
    updateTranslationStatusLine = () => {
      const active = this.lastTranslation && this.lastTranslation.targetLang === targetSelect.getValue();
      if (!active) {
        translationStatusLine.classList.add("hidden");
        return;
      }
      const langLabel = targetLanguageLabel(targetSelect.getValue());
      translationStatusLine.textContent = t("translationActiveLine", langLabel);
      translationStatusLine.classList.remove("hidden");
    };
    updateTranslationStatusLine();
    modeTranslationBtn.addEventListener("click", () => updateTranslationStatusLine?.());
    modeBilingualBtn.addEventListener("click", () => updateTranslationStatusLine?.());

    translateCell.addEventListener("click", () => {
      translatePanel.classList.toggle("hidden");
      translateCell.classList.toggle("active", !translatePanel.classList.contains("hidden"));
      if (!translatePanel.classList.contains("hidden")) updateSameLanguageState();
    });

    downloadCell.addEventListener("click", async () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      if (!track) return;
      downloadCell.disabled = true;
      setBusy(downloadCell, true);
      status.textContent = "";
      try {
        await this.callbacks.onDownload(activeCues(), formatSelect.value as SubtitleFormat, activeSuffix(track));
      } catch (err) {
        status.textContent = describeApiError(err);
      } finally {
        downloadCell.disabled = false;
        setBusy(downloadCell, false);
      }
    });

    copyCell.addEventListener("click", async () => {
      copyCell.disabled = true;
      setBusy(copyCell, true);
      status.textContent = "";
      try {
        await this.callbacks.onCopy(activeCues(), formatSelect.value as SubtitleFormat);
        status.textContent = t("copiedStatus");
        setTimeout(() => {
          if (status.textContent === t("copiedStatus")) status.textContent = "";
        }, 1500);
      } catch (err) {
        status.textContent = describeApiError(err);
      } finally {
        copyCell.disabled = false;
        setBusy(copyCell, false);
      }
    });

    translateSubmitBtn.addEventListener("click", async () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      if (!track) return;
      translateSubmitBtn.disabled = true;
      setBusy(translateSubmitBtn, true, t("translating"));
      status.textContent = "";
      const generation = this.previewGeneration;
      const targetLang = targetSelect.getValue();
      try {
        const { original, translated } = await this.callbacks.onTranslate(track, targetLang);
        if (generation !== this.previewGeneration) return;
        this.originalCues = original;
        this.lastTranslation = { targetLang, translated };
        // The live preview always shows original+translation together once a
        // translation exists, regardless of what Download/Copy will produce.
        this.setTranscriptPreview(toBilingualCues(original, translated));
        updateTranslationStatusLine();
      } catch (err) {
        status.textContent = describeApiError(err);
      } finally {
        translateSubmitBtn.disabled = false;
        setBusy(translateSubmitBtn, false);
      }
    });
  }
}
