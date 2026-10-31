# YouTube Subtitle Downloader

Chrome extension (Manifest V3) that extracts YouTube subtitles client-side and,
using anonymous sessions, translates them via a small backend before download.

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

The extension uses anonymous sessions. No Google OAuth configuration or
`identity` permission is needed. Approved icon sizes are generated from
`extension/icons/source.png`.

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

The extension creates a session with `POST /auth/anonymous` and rotates it with
`POST /auth/anonymous/refresh`. Both tokens are issued by the deployed API; the
rotating secret stays in worker storage. Legacy Google sessions are migrated to
an anonymous session once. Existing anonymous sessions keep their identity.
The backend sources in this checkout are an older scaffold; the live API also
exposes the versioned video access and translation endpoints.

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

- Popup/options page for managing the account or subscription
- Rate limiting on `/translate`

### Native Chrome side panel

The extension UI runs in `sidepanel.html` using Chrome Side Panel API, outside
YouTube's document. Click the extension toolbar icon or the extension icon next to the player subtitle control on YouTube to open it for that tab only. Other tabs do not inherit it; leaving YouTube disables it. The content
script only provides video metadata, caption extraction, playback time and seek
commands. SPA navigation preserves the panel and automatically loads the transcript and translation controls. Translation itself runs on user action.

After rebuilding, reload the extension at `chrome://extensions` and reload any
existing YouTube tabs to remove the previous injected UI.

Checks: `cd extension && npm run typecheck && npm run build && node tests/spa-navigation.mjs`.
Browser bridge smoke test: `node e2e/native-panel-smoke.mjs` (requires Playwright Chromium).

Anonymous sessions are created by `POST /auth/anonymous` when first needed.
The service worker stores the JWT and rotating guest secret together in
`chrome.storage.local`; only the JWT is exposed to the panel. Concurrent 401s
share one token rotation through `/auth/anonymous/refresh`. Network errors
preserve the stored identity. Quotas still use the existing server access and
translation endpoints. Google linking and its OAuth permission have been removed.

Transcript loading uses caption files with a direct transcript API fallback;
if those endpoints fail, a temporary hidden same-origin document runs YouTube's
own transcript loader. The visible page's native transcript control is never
clicked. The hidden document is removed on success, failure, timeout or video
change, and successful transcripts are cached in memory for repeat actions.

The landing page (`docs/index.html`) and installed welcome page share the
onboarding styles and demo behavior. `npm run build` in `extension` also rebuilds
`docs/onboarding.js` and copies its CSS. The Chrome Web Store CTA leads to the
store; the celebration runs on the welcome page opened after a successful
installation, with a once-per-tab burst and support for reduced motion.
Preview: `node e2e/onboarding-preview.mjs` captures desktop and mobile views.

Uninstall feedback: `docs/uninstall/index.html` offers preset reasons and optional
comment/email in English and Russian. Native form POST sends the verified Google
Form fields (`entry.440991757`, `entry.1081135527`), and Google displays the real
submission result. No identifiers or session tokens are attached; only UI
language and extension version are included in the registered uninstall URL.
Until `docs/uninstall/` is published at `https://downloadsubtitles.online/uninstall/`,
`UNINSTALL_FEEDBACK_URL` deliberately points to the already-live Google Form.
After deployment, change it to `UNINSTALL_FEEDBACK_PAGE_URL` and rebuild.
Browser check: `node e2e/uninstall-feedback.mjs` intercepts submission locally.

Version 0.2.2 adds a looping motion tutorial: simulated cursor/click, player zoom,
side-panel reveal, transcript follow-along, export menu and replay. Intro and
scroll reveals respect reduced motion; celebration is restricted to the install
welcome page. `node e2e/onboarding-motion.mjs` verifies and records the sequence
(default output `/tmp/yt-onboarding-motion`, configurable with `YT_PREVIEW_DIR`).
After building, `python3 extension/tools/package_release.py` creates test and
store ZIPs under `releases/` using the current manifest version.
