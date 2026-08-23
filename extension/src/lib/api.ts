import type { ApiErrorCode, Cue, Quota, Session } from "../types";
import { t } from "./i18n";
import { BACKEND_URL } from "./config";

const TRANSLATION_RETRY_DELAY_MS = 2000;
const TRANSLATION_MAX_RETRIES = 20; // ~40s of polling on 409 translation_in_progress

export class ApiError extends Error {
  code: ApiErrorCode;
  quota?: Partial<Quota>;

  constructor(code: ApiErrorCode, message: string, quota?: Partial<Quota>) {
    super(message);
    this.code = code;
    this.quota = quota;
  }
}

export async function getSession(): Promise<Session | null> {
  const response = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
  return response?.session ?? null;
}

export async function login(): Promise<Session | null> {
  const response = await chrome.runtime.sendMessage({ type: "LOGIN" });
  if (response?.error) throw new Error(response.error);
  return response?.session ?? null;
}

// Tries to mint a fresh backend session from the still-cached Google token,
// with no UI prompt. Returns null if that isn't possible (e.g. the user
// revoked access) — callers should fall back to asking for an explicit sign-in.
async function silentRefresh(): Promise<Session | null> {
  const response = await chrome.runtime.sendMessage({ type: "SILENT_REFRESH" });
  return response?.session ?? null;
}

interface PydanticValidationDetail {
  loc?: Array<string | number>;
  msg?: string;
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));

  // Business-logic errors (video_quota, banned, char_cap, ...) come as
  // {error: {code, message}}. But FastAPI's own automatic Pydantic
  // validation (e.g. empty `texts`, too-short `sourceLang`) bypasses that
  // wrapper and returns its default {detail: [{loc, msg, type}, ...]}
  // shape instead — handle both rather than losing the real message.
  if (body?.error?.code) {
    const quota =
      body?.plan !== undefined
        ? {
            plan: body.plan,
            remaining: body.remaining,
            resetAt: body.resetAt,
            billingEnabled: body.billingEnabled,
          }
        : undefined;
    return new ApiError(body.error.code as ApiErrorCode, body.error.message ?? `Request failed (${res.status})`, quota);
  }

  if (Array.isArray(body?.detail)) {
    const details = body.detail as PydanticValidationDetail[];
    const message = details
      .map((d) => (d.loc?.length ? `${d.loc[d.loc.length - 1]}: ${d.msg}` : d.msg))
      .filter(Boolean)
      .join("; ");
    return new ApiError("validation", message || `Request failed (${res.status})`);
  }

  return new ApiError("unknown", `Request failed (${res.status})`);
}

function parseQuota(body: Record<string, unknown>): Quota {
  return {
    plan: body.plan as Quota["plan"],
    remaining: body.remaining as number | null,
    resetAt: body.resetAt as string,
    billingEnabled: Boolean(body.billingEnabled),
    charsUsedMonth: body.charsUsedMonth as number,
    charsLimitMonth: body.charsLimitMonth as number,
  };
}

// Every authenticated call goes through here so the 401-refresh-and-retry
// dance only lives in one place.
async function authFetch(path: string, session: Session, init: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string) =>
    fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await doFetch(session.token);
  if (res.status === 401) {
    const refreshed = await silentRefresh();
    if (!refreshed) {
      throw new ApiError("unauthorized", t("sessionExpiredError"));
    }
    res = await doFetch(refreshed.token);
  }
  return res;
}

export async function getMe(session: Session): Promise<Quota> {
  const res = await authFetch("/me", session, { method: "GET" });
  if (!res.ok) throw await parseErrorBody(res);
  return parseQuota(await res.json());
}

// Claims today's daily slot for this video. Must be called before any
// download/copy/translate action — idempotent for repeats on the same
// video within the same UTC day.
export async function claimVideoAccess(videoId: string, session: Session): Promise<Quota> {
  const res = await authFetch(`/v1/videos/${encodeURIComponent(videoId)}/access`, session, {
    method: "PUT",
  });
  if (!res.ok) throw await parseErrorBody(res);
  return parseQuota(await res.json());
}

async function translateTexts(
  videoId: string,
  texts: string[],
  sourceLang: string,
  targetLang: string,
  session: Session,
): Promise<{ translations: string[]; quota: Quota }> {
  for (let attempt = 0; attempt < TRANSLATION_MAX_RETRIES; attempt++) {
    const res = await authFetch(`/v1/videos/${encodeURIComponent(videoId)}/translations`, session, {
      method: "POST",
      body: JSON.stringify({ texts, sourceLang, targetLang }),
    });

    if (res.status === 409) {
      const err = await parseErrorBody(res);
      if (err.code === "translation_in_progress") {
        await new Promise((resolve) => setTimeout(resolve, TRANSLATION_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }

    if (!res.ok) throw await parseErrorBody(res);

    const body = (await res.json()) as { translations: string[] } & Record<string, unknown>;

    // If the backend drops a line, every cue after it would silently shift
    // onto the wrong translation (index i no longer matches). Fail loudly
    // instead of shipping misaligned subtitles.
    if (body.translations.length !== texts.length) {
      throw new ApiError(
        "unknown",
        `Translation count mismatch: sent ${texts.length}, got ${body.translations.length}`,
      );
    }

    return { translations: body.translations, quota: parseQuota(body) };
  }
  throw new ApiError("translation_in_progress", t("translationBusyError"));
}

// Translates every cue's text for a video in a single request — the backend
// now does its own internal batching against the LLM, so the client no
// longer splits long videos into multiple HTTP calls.
export async function translateAllCues(
  videoId: string,
  cues: Cue[],
  sourceLang: string,
  targetLang: string,
  session: Session,
): Promise<{ cues: Cue[]; quota: Quota }> {
  const result = await translateTexts(
    videoId,
    cues.map((c) => c.text),
    sourceLang,
    targetLang,
    session,
  );
  const translated = cues.map((cue, i) => ({ ...cue, text: result.translations[i] ?? cue.text }));
  return { cues: translated, quota: result.quota };
}

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "unauthorized":
        return t("sessionExpiredError");
      case "auth_failed":
        return t("authFailedError");
      case "banned":
        return t("bannedError");
      case "access_required":
        return t("error");
      case "email_conflict":
        return t("emailConflictError");
      case "conflict":
        return t("authFailedError");
      case "validation":
        return err.message;
      case "video_quota": {
        const resetAt = err.quota?.resetAt;
        const time = resetAt ? new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        return t("videoQuotaError", time);
      }
      case "char_cap":
        return t("charCapError");
      case "rate_limited":
        return t("rateLimitedError");
      case "llm_failed":
        return t("llmFailedError");
      case "not_ready":
        return t("notReadyError");
      case "translation_in_progress":
        return t("translationBusyError");
      default:
        return err.message || t("error");
    }
  }
  return err instanceof Error ? err.message : t("error");
}
