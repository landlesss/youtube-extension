import type { Session } from "../types";
import { BACKEND_URL } from "./config";

// Only the service worker reads the rotating guest secret. All session mutations
// share this queue, including initialization and refresh.
type StoredSession = Session & { guestToken?: string };
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
async function read(): Promise<StoredSession | null> {
  return (await chrome.storage.local.get("session")).session ?? null;
}
function publicSession(session: StoredSession): Session {
  const { guestToken: _secret, ...visible } = session;
  return visible;
}
async function save(response: Response): Promise<Session> {
  if (!response.ok) throw new Error(`Authentication failed (${response.status})`);
  const body = await response.json() as StoredSession;
  if (!body.token || !body.guestToken) throw new Error("Invalid authentication response");
  const session: StoredSession = { token: body.token, guestToken: body.guestToken, isAnonymous: true };
  await chrome.storage.local.set({ session });
  return publicSession(session);
}
export function ensureSession(): Promise<Session> {
  return exclusive(async () => {
    const stored = await read();
    if (stored?.guestToken) return publicSession(stored);
    // One-time migration from retired Google sessions to this installation’s guest identity.
    // No body: the server creates both the identity and tokens.
    return save(await fetch(`${BACKEND_URL}/auth/anonymous`, { method: "POST" }));
  });
}
export function refreshSession(failedToken?: string): Promise<Session> {
  return exclusive(async () => {
    const stored = await read();
    if (!stored) throw new Error("Session unavailable");
    // A concurrent request already rotated this pair; reuse its result.
    if (failedToken && failedToken !== stored.token) return publicSession(stored);
    if (stored.guestToken) {
      return save(await fetch(`${BACKEND_URL}/auth/anonymous/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestToken: stored.guestToken }),
      }));
    }
    throw new Error("Anonymous session unavailable. Reopen the side panel to initialize it.");
  });
}
