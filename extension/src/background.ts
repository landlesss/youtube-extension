import { UNINSTALL_FEEDBACK_URL } from "./lib/config";
import { ensureSession, refreshSession } from "./lib/sessions";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!["GET_SESSION", "SILENT_REFRESH"].includes(message?.type)) return false;
  void (async () => {
    try {
      switch (message.type) {
        case "GET_SESSION": sendResponse({ session: await ensureSession() }); break;
        case "SILENT_REFRESH": sendResponse({ session: await refreshSession(message.failedToken) }); break;
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});

// No global panel: enable an independent panel only on an explicit toolbar click.
void chrome.sidePanel.setOptions({ enabled: false });
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
function isYouTube(url?: string): boolean {
  if (!url) return false;
  try { return new URL(url).origin === "https://www.youtube.com"; }
  catch { return false; }
}
function preparePanelForTab(tabId: number): Promise<void> {
  return chrome.sidePanel.setOptions({
    tabId, path: `sidepanel.html?tabId=${tabId}`, enabled: true,
  });
}
chrome.action.onClicked.addListener(tab => {
  if (tab.id === undefined || !isYouTube(tab.url)) return;
  void chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});
// A player-control click carries the user gesture from the content script.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!["PREPARE_SUBTITLE_PANEL", "OPEN_SUBTITLE_PANEL"].includes(message?.type)) return false;
  if (sender.tab?.id === undefined || !isYouTube(sender.url ?? sender.tab.url)) return false;
  const tabId = sender.tab.id;
  // Prepare when the control mounts so open() runs synchronously on the click.
  const action = message.type === "PREPARE_SUBTITLE_PANEL"
    ? chrome.sidePanel.setOptions({ tabId, path: `sidepanel.html?tabId=${tabId}`, enabled: true })
    : chrome.sidePanel.open({ tabId });
  void action.then(
    () => sendResponse({ ok: true }),
    error => sendResponse({ error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url && change.status !== "complete") return;
  if (isYouTube(change.url ?? tab.url)) {
    void preparePanelForTab(tabId).catch(() => {});
  } else {
    void chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  }
});

// Prepare already-open YouTube tabs after an extension reload or worker restart.
void chrome.tabs.query({ url: "https://www.youtube.com/*" }).then(tabs => {
  for (const tab of tabs) {
    if (tab.id !== undefined) void preparePanelForTab(tab.id).catch(() => {});
  }
}).catch(console.error);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

// Register on worker startup as well as installation, covering existing installs.
const uninstallUrl = new URL(UNINSTALL_FEEDBACK_URL);
uninstallUrl.searchParams.set("lang", chrome.i18n.getUILanguage());
uninstallUrl.searchParams.set("version", chrome.runtime.getManifest().version);
chrome.runtime.setUninstallURL(uninstallUrl.href, () => {
  if (chrome.runtime.lastError) console.error("Could not register uninstall feedback:", chrome.runtime.lastError.message);
});
