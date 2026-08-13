import type { Session } from "./types";

const BACKEND_URL = "http://localhost:8787";
const SESSION_KEY = "session";

async function getStoredSession(): Promise<Session | null> {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return (data[SESSION_KEY] as Session | undefined) ?? null;
}

async function loginWithGoogle(): Promise<Session> {
  const googleToken = await chrome.identity.getAuthToken({ interactive: true });
  const accessToken = typeof googleToken === "string" ? googleToken : googleToken.token;
  if (!accessToken) throw new Error("No Google access token returned");

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
      default:
        sendResponse({ error: "Unknown message type" });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
});
