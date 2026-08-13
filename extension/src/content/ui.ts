import type { CaptionTrack, SubtitleFormat, Session, TranslationMode } from "../types";
import { t } from "../lib/i18n";
import { reviewPageUrl } from "../lib/reviewPrompt";

const HOST_ID = "yt-subs-downloader-host";

const TARGET_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "EN", label: "English" },
  { code: "RU", label: "Русский" },
  { code: "ES", label: "Español" },
  { code: "DE", label: "Deutsch" },
  { code: "FR", label: "Français" },
  { code: "PT", label: "Português" },
  { code: "JA", label: "日本語" },
  { code: "ZH", label: "中文" },
];

export interface PanelCallbacks {
  onDownloadOriginal: (track: CaptionTrack, format: SubtitleFormat) => Promise<void>;
  onCopyOriginal: (track: CaptionTrack, format: SubtitleFormat) => Promise<void>;
  onTranslateAndDownload: (
    track: CaptionTrack,
    targetLang: string,
    format: SubtitleFormat,
    mode: TranslationMode,
  ) => Promise<void>;
  onLogin: () => Promise<Session | null>;
  onToggle: (nextOpen: boolean) => void;
}

interface SearchableSelect {
  element: HTMLDivElement;
  getValue: () => string;
}

function createSearchableSelect(options: Array<{ value: string; label: string }>): SearchableSelect {
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
        selected = opt;
        input.value = opt.label;
        list.classList.add("hidden");
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
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private fab: HTMLButtonElement;
  private visible = false;

  constructor(private callbacks: PanelCallbacks) {
    // Always start from a fresh host: a closed shadow root can't be reattached
    // to, so if a stale host from a previous instantiation is still around we
    // just replace it rather than trying to reuse its (inaccessible) shadow.
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
    this.host = host;

    // Closed mode keeps YouTube's page styles (and other extensions) from
    // leaking in or out — this is what was previously causing the injected
    // button to inherit stray page styles.
    this.shadow = host.attachShadow({ mode: "closed" });
    this.root = document.createElement("div");
    this.shadow.appendChild(this.styleEl());

    this.fab = document.createElement("button");
    this.fab.className = "fab";
    this.fab.type = "button";
    this.fab.title = t("panelTitle");
    this.fab.textContent = "CC";
    this.fab.addEventListener("click", () => this.toggle());
    this.shadow.appendChild(this.fab);

    this.shadow.appendChild(this.root);
    this.root.className = "panel hidden";

    // YouTube's SPA router occasionally wipes and rebuilds large chunks of
    // <body> on navigation, which can take our host element down with it.
    // Re-append it whenever that happens so the button survives page changes.
    new MutationObserver(() => {
      if (!document.body.contains(this.host)) {
        document.body.appendChild(this.host);
      }
    }).observe(document.body, { childList: true });
  }

  private styleEl(): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = `
      .panel {
        position: fixed;
        top: 122px;
        right: 16px;
        width: 320px;
        max-height: 80vh;
        overflow-y: auto;
        background: #0f0f0f;
        color: #f1f1f1;
        border: 1px solid #303030;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.4);
        font-family: Roboto, Arial, sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        padding: 12px;
      }
      .panel.hidden { display: none; }
      .fab {
        position: fixed;
        top: 72px;
        right: 16px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #272727;
        color: #f1f1f1;
        border: 1px solid #3f3f3f;
        font-family: Roboto, Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        z-index: 2147483647;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      .fab:hover { background: #3ea6ff; color: #0f0f0f; }
      .title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
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
        background: #3ea6ff;
        color: #0f0f0f;
        font-weight: 600;
        border: none;
      }
      button:disabled { opacity: 0.5; cursor: default; }
      button.secondary { background: #272727; color: #f1f1f1; }
      .btn-row { display: flex; gap: 8px; }
      .btn-row button { width: auto; flex: 1; margin-top: 6px; }
      .row { margin-bottom: 10px; }
      .status { margin-top: 8px; opacity: 0.8; min-height: 16px; }
      .empty { opacity: 0.7; }
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
      .review-toast {
        position: fixed;
        bottom: 16px;
        right: 16px;
        max-width: 280px;
        background: #1f1f1f;
        color: #f1f1f1;
        border: 1px solid #303030;
        border-radius: 10px;
        padding: 12px 32px 12px 12px;
        font-size: 13px;
        line-height: 1.4;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .review-toast a {
        color: #3ea6ff;
        font-weight: 600;
        text-decoration: none;
      }
      .review-toast a:hover { text-decoration: underline; }
      .review-toast-close {
        position: absolute;
        top: 4px;
        right: 6px;
        width: auto;
        margin: 0;
        padding: 2px 6px;
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 15px;
        line-height: 1;
      }
      .review-toast-close:hover { color: #f1f1f1; }
    `;
    return style;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle("hidden", !this.visible);
    this.callbacks.onToggle(this.visible);
  }

  isOpen(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.host.remove();
  }

  showReviewToast(): void {
    if (this.shadow.querySelector(".review-toast")) return;

    const toast = document.createElement("div");
    toast.className = "review-toast";

    const text = document.createElement("span");
    text.textContent = t("reviewToastText");

    const link = document.createElement("a");
    link.href = reviewPageUrl();
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("reviewToastAction");
    link.addEventListener("click", () => toast.remove());

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "review-toast-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => toast.remove());

    toast.append(text, link, closeBtn);
    this.shadow.appendChild(toast);

    setTimeout(() => toast.remove(), 12000);
  }

  renderLoading(): void {
    this.root.innerHTML = `<div class="title">${t("panelTitle")}</div><div class="empty">${t("loading")}</div>`;
  }

  renderEmpty(): void {
    this.root.innerHTML = `<div class="title">${t("panelTitle")}</div><div class="empty">${t("noSubtitles")}</div>`;
  }

  renderTracks(tracks: CaptionTrack[], session: Session | null): void {
    this.root.innerHTML = "";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t("panelTitle");
    this.root.appendChild(title);

    const langRow = document.createElement("div");
    langRow.className = "row";
    const langLabel = document.createElement("label");
    langLabel.textContent = t("languageLabel");
    const langSelect = createSearchableSelect(
      tracks.map((track) => ({
        value: track.languageCode,
        label: `${track.name}${track.isAutoGenerated ? " (auto)" : ""}`,
      })),
    );
    langRow.append(langLabel, langSelect.element);
    this.root.appendChild(langRow);

    const formatRow = document.createElement("div");
    formatRow.className = "row";
    const formatLabel = document.createElement("label");
    formatLabel.textContent = t("formatLabel");
    const formatSelect = document.createElement("select");
    for (const fmt of ["srt", "vtt", "txt"] as SubtitleFormat[]) {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = fmt.toUpperCase();
      formatSelect.appendChild(opt);
    }
    formatRow.append(formatLabel, formatSelect);
    this.root.appendChild(formatRow);

    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "secondary";
    downloadBtn.textContent = t("downloadButton");

    const copyBtn = document.createElement("button");
    copyBtn.className = "secondary";
    copyBtn.textContent = t("copyButton");

    btnRow.append(downloadBtn, copyBtn);
    this.root.appendChild(btnRow);

    const status = document.createElement("div");
    status.className = "status";

    downloadBtn.addEventListener("click", async () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      if (!track) return;
      downloadBtn.disabled = true;
      status.textContent = t("loading");
      try {
        await this.callbacks.onDownloadOriginal(track, formatSelect.value as SubtitleFormat);
        status.textContent = "";
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : t("error");
      } finally {
        downloadBtn.disabled = false;
      }
    });

    copyBtn.addEventListener("click", async () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      if (!track) return;
      copyBtn.disabled = true;
      status.textContent = t("loading");
      try {
        await this.callbacks.onCopyOriginal(track, formatSelect.value as SubtitleFormat);
        status.textContent = t("copiedStatus");
        setTimeout(() => {
          if (status.textContent === t("copiedStatus")) status.textContent = "";
        }, 1500);
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : t("error");
      } finally {
        copyBtn.disabled = false;
      }
    });

    if (!session) {
      const signInBtn = document.createElement("button");
      signInBtn.textContent = t("signInButton");
      signInBtn.style.marginTop = "12px";
      signInBtn.addEventListener("click", async () => {
        signInBtn.disabled = true;
        try {
          const newSession = await this.callbacks.onLogin();
          this.renderTracks(tracks, newSession);
        } catch (err) {
          status.textContent = err instanceof Error ? err.message : t("error");
          signInBtn.disabled = false;
        }
      });
      this.root.appendChild(signInBtn);
      this.root.appendChild(status);
      return;
    }

    const signedIn = document.createElement("div");
    signedIn.className = "empty";
    signedIn.style.marginTop = "10px";
    signedIn.textContent = t("signedInAs", session.email);
    this.root.appendChild(signedIn);

    const targetRow = document.createElement("div");
    targetRow.className = "row";
    const targetLabel = document.createElement("label");
    targetLabel.textContent = t("targetLanguageLabel");
    const targetSelect = document.createElement("select");
    for (const lang of TARGET_LANGUAGES) {
      const opt = document.createElement("option");
      opt.value = lang.code;
      opt.textContent = lang.label;
      targetSelect.appendChild(opt);
    }
    targetRow.append(targetLabel, targetSelect);
    this.root.appendChild(targetRow);

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
    this.root.appendChild(modeRow);

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

    const translateBtn = document.createElement("button");
    translateBtn.textContent = t("translateButton");
    translateBtn.style.marginTop = "6px";
    this.root.appendChild(translateBtn);
    this.root.appendChild(status);

    translateBtn.addEventListener("click", async () => {
      const track = tracks.find((tr) => tr.languageCode === langSelect.getValue());
      if (!track) return;
      translateBtn.disabled = true;
      status.textContent = t("translating");
      try {
        await this.callbacks.onTranslateAndDownload(
          track,
          targetSelect.value,
          formatSelect.value as SubtitleFormat,
          mode,
        );
        status.textContent = "";
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : t("error");
      } finally {
        translateBtn.disabled = false;
      }
    });
  }
}
