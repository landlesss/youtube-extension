import type { Session } from "./types";
import { BACKEND_URL } from "./lib/config";

const SESSION_KEY = "session";

async function getStoredSession(): Promise<Session | null> {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return (data[SESSION_KEY] as Session | undefined) ?? null;
}

async function exchangeGoogleToken(accessToken: string): Promise<Session> {
  const res = await fetch(`${BACKEND_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });

  if (!res.ok) {
    throw new Error(`Backend auth failed (${res.status})`);
  }

  const session = (await res.json()) as Session;
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function loginWithGoogle(): Promise<Session> {
  const googleToken = await chrome.identity.getAuthToken({ interactive: true });
  const accessToken = typeof googleToken === "string" ? googleToken : googleToken.token;
  if (!accessToken) throw new Error("No Google access token returned");
  return exchangeGoogleToken(accessToken);
}

// Called when a backend request comes back 401 (our session JWT expired).
// Tries to mint a fresh backend session from the still-cached Google token,
// without ever prompting the user — falls back to clearing the stale
// session so the UI naturally reverts to "signed out" on its next render.
async function silentRefresh(): Promise<Session | null> {
  try {
    const googleToken = await chrome.identity.getAuthToken({ interactive: false });
    const accessToken = typeof googleToken === "string" ? googleToken : googleToken.token;
    if (!accessToken) {
      await chrome.storage.local.remove(SESSION_KEY);
      return null;
    }
    return await exchangeGoogleToken(accessToken);
  } catch {
    await chrome.storage.local.remove(SESSION_KEY);
    return null;
  }
}

async function logout(): Promise<void> {
  const session = await getStoredSession();
  await chrome.storage.local.remove(SESSION_KEY);
  if (session) {
    const googleToken = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
    const token = typeof googleToken === "string" ? googleToken : googleToken?.token;
    if (token) await chrome.identity.removeCachedAuthToken({ token });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "GET_SESSION": {
        sendResponse({ session: await getStoredSession() });
        break;
      }
      case "LOGIN": {
        try {
          const session = await loginWithGoogle();
          sendResponse({ session });
        } catch (err) {
          sendResponse({ error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }
      case "LOGOUT": {
        await logout();
        sendResponse({ ok: true });
        break;
      }
      case "SILENT_REFRESH": {
        sendResponse({ session: await silentRefresh() });
        break;
      }
      default:
        sendResponse({ error: "Unknown message type" });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  // Fails on any tab without our content script (i.e. not youtube.com) —
  // that's expected there, so swallow it instead of an unhandled rejection.
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {});
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});
