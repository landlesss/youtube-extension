# YouTube Subtitle Downloader

Chrome extension (Manifest V3) that extracts YouTube subtitles client-side and,
for signed-in users, translates them via a small backend before download.

## Structure

```
extension/   MV3 extension: vanilla TS, Shadow DOM UI, esbuild
backend/     Fastify + TS API: Google auth, translation proxy, Paddle webhooks
```

## Extension

```bash
cd extension
npm install
npm run build     # outputs extension/dist — load this as an unpacked extension
npm run dev        # watch mode
```

Load `extension/dist` via `chrome://extensions` → "Load unpacked" (Developer mode on).

Before shipping, replace the placeholders in `extension/manifest.json`:
- `oauth2.client_id` — a Google OAuth client ID (type "Chrome App", matching the
  extension's ID) with the `openid email profile` scopes.
- `host_permissions` — the real backend origin instead of `api.yt-subtitles.example`.

Add real PNG icons under `extension/icons/` (16/48/128px) — the manifest
references them but none are checked in yet.

## Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, GOOGLE_CLIENT_ID, DEEPL_API_KEY, JWT_SECRET, Paddle keys
npm run dev
```

Run `backend/src/db/schema.sql` once against your Postgres instance (Neon or
Supabase both work — just paste it into their SQL editor, or `psql "$DATABASE_URL" -f src/db/schema.sql`).

### How auth works

1. The extension calls `chrome.identity.getAuthToken()` to get a Google OAuth
   access token (no client secret involved — this is the standard MV3 flow).
2. It POSTs that token to `POST /auth/google` on the backend.
3. The backend verifies the token against Google's `tokeninfo` endpoint,
   checks the audience matches `GOOGLE_CLIENT_ID`, then finds-or-creates a
   `users` row and returns a signed session JWT.
3. The extension stores `{ token, email }` in `chrome.storage.local` and sends
   `Authorization: Bearer <token>` on subsequent `/translate` calls.

### Translation

`POST /translate` (requires the bearer session token) proxies to DeepL by
default (`TRANSLATE_PROVIDER=deepl`) or Google Cloud Translation
(`TRANSLATE_PROVIDER=google`). The API key never reaches the extension.

### Payments

`POST /webhooks/paddle` is a stub: it verifies the `Paddle-Signature` header
against `PADDLE_WEBHOOK_SECRET` (HMAC-SHA256 over the raw body) and flips
`users.plan` / `subscription_status` on `subscription.activated` /
`.updated` / `.canceled` events. Wire up the actual Paddle Checkout overlay
and product/price IDs before launch, and pass the user's `id` as
`custom_data.user_id` at checkout time so the webhook can match it back.

## Not done yet

- Extension icons (placeholder folder only)
- Popup/options page for managing the account or subscription
- Rate limiting on `/translate`
- Tests
