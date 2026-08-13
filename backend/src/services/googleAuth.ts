import { config } from "../config.js";

interface GoogleTokenInfo {
  azp?: string;
  aud?: string;
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  exp: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
}

/**
 * chrome.identity.getAuthToken() returns an OAuth *access* token (not an ID token),
 * so we validate it via Google's tokeninfo endpoint and check the audience matches
 * our extension's OAuth client ID before trusting the sub/email it returns.
 */
export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleIdentity> {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );

  if (!res.ok) {
    throw new Error("Invalid Google access token");
  }

  const info = (await res.json()) as GoogleTokenInfo;

  const audience = info.azp ?? info.aud;
  if (config.googleClientId && audience !== config.googleClientId) {
    throw new Error("Google token audience mismatch");
  }
  if (!info.email || (info.email_verified !== true && info.email_verified !== "true")) {
    throw new Error("Google account email is not verified");
  }

  return { sub: info.sub, email: info.email };
}
