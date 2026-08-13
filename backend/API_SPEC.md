# YouTube Subtitle Downloader — ТЗ на бэкенд

Стек: Node.js + Fastify + TypeScript, Postgres (провайдер — на усмотрение бэкенда, например Neon; Supabase не обязателен). Расширение (Chrome MV3) уже написано и жёстко рассчитывает на контракт ниже — важно не менять формы запросов/ответов без синхронизации с фронтом.

В `backend/` уже лежит рабочий скелет (Fastify, роуты, миграция) — реализует разделы 1 и 3 почти полностью. Можно взять за основу или переписать, но контракт (пути, поля) менять нельзя без созвона.

## 0. Общая архитектура

- Все секреты (DeepL/Google Translate key, Paddle key, JWT secret) — только на сервере, никогда в клиенте.
- Авторизация между расширением и бэкендом — свой JWT (`Authorization: Bearer <token>`), который бэкенд выдаёт после проверки Google-токена.
- CORS: разрешить origin `chrome-extension://<ID_РАСШИРЕНИЯ>` (сейчас ID нестабильный, т.к. расширение не опубликовано — на деве можно временно `*`).

### 0.1 Синхронизация состояния (план/лимиты)

Архитектура сознательно **pull, не push**: никакого отдельного канала синхронизации нет и не нужен.

- Единственный источник истины — таблица `users` в Postgres. Расширение ничего не кэширует локально, кроме самого JWT (`chrome.storage.local`) — а он про идентичность ("кто я"), не про состояние ("сколько у меня осталось").
- Перед **каждым** скачиванием расширение дёргает `POST /downloads/check` и получает актуальные `plan`/`remaining` на этот момент. Если Paddle webhook в фоне поменял `plan` на `pro` — следующий же `check` это увидит, без какого-либо специального оповещения клиента.
- Единственный кейс, который стоит явно обработать: JWT истёк/невалиден → любой authenticated-запрос (`/downloads/check`, `/translate`) отдаёт 401 → расширение должно тихо перезапросить Google-токен (`chrome.identity.getAuthToken({interactive:false})`) и повторить `/auth/google`, и только если это не сработало — просить пользователя войти заново вручную. Сейчас на фронте это ещё не реализовано (текущий `login()` всегда `interactive:true`), возьмём в работу с нашей стороны, когда появится `/downloads/check`.

## 1. Авторизация — `POST /auth/google`

**⚠️ Важное отличие от исходного ТЗ:** там написано "Google ID token", но `chrome.identity.getAuthToken()` (то, что реально вызывает расширение) отдаёт OAuth **access token**, не ID token. Получение ID token в MV3-расширениях требует другого, более сложного флоу (`launchWebAuthFlow`). Мы сознательно выбрали access token — он проще и это стандартный способ для расширений. Если у Вали есть аргументы за ID token — обсудим отдельно, но текущий код фронта отправляет именно access token.

**Запрос:**
```
POST /auth/google
Content-Type: application/json

{ "accessToken": "ya29.a0Af..." }
```

**Валидация токена:** запрос к `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=...`, проверить что `email_verified` и что `azp`/`aud` совпадает с нашим `GOOGLE_CLIENT_ID`. Если ок — найти пользователя по `google_sub` (поле `sub` из ответа tokeninfo) или создать нового.

**Успешный ответ (200):**
```
{ "token": "<наш JWT>", "email": "user@gmail.com" }
```

**Ошибка (401):** `{ "error": "Google authentication failed" }`

Дальше расширение кладёт `token` в `chrome.storage.local` и шлёт его в `Authorization: Bearer <token>` во всех остальных запросах.

## 2. Лимиты скачиваний — `POST /downloads/check` (ещё не реализовано, нужно сделать)

Вызывается расширением **перед каждым скачиванием**. Это check-and-consume за один запрос: если разрешено — сразу инкрементит счётчик на сервере (иначе лимит обходится через devtools).

**Запрос:**
```
POST /downloads/check
Authorization: Bearer <token>
```

**Ответ, если разрешено (200):**
```
{ "allowed": true, "plan": "trial" | "free" | "pro", "remaining": 7 | null, "trialEndsAt": "2026-08-25T00:00:00Z" | null }
```
`remaining: null` = безлимит (trial и pro).

**Ответ, если лимит исчерпан (200, не 4xx — это ожидаемый кейс, не ошибка):**
```
{ "allowed": false, "plan": "free", "remaining": 0, "resetAt": "2026-08-07T00:00:00Z" }
```

**Логика (рекомендуемая, можно менять):**
- `plan` в БД хранит только `'free' | 'pro'` — это состояние **после** триала. Сам триал не хранится как отдельное состояние, а вычисляется на лету: `effectivePlan = now() < trial_ends_at ? 'trial' : user.plan`. Так не нужна крон-джоба, которая бы "переключала" пользователей по истечении триала.
- `trial` и `pro` — `allowed: true`, `remaining: null`, счётчик не трогаем.
- `free`: если `now() >= downloads_reset_at` — обнулить `downloads_today = 0`, `downloads_reset_at` = следующая полночь UTC. Лимит — **10/сутки**. Если `downloads_today < 10` — инкремент, `allowed: true`. Иначе `allowed: false`.

Фронт сейчас **не вызывает** этот эндпоинт и не показывает "осталось X скачиваний" — это отдельная задача на нашей стороне после того, как эндпоинт появится. Не блокирует вас.

## 3. Перевод — `POST /translate` (уже реализовано в скелете)

**Запрос:**
```
POST /translate
Authorization: Bearer <token>
Content-Type: application/json

{ "texts": ["line 1", "line 2", ...], "sourceLang": "en", "targetLang": "RU" }
```
`texts` — массив строк субтитров, до 2000 штук / 100k символов суммарно (можно менять лимиты).

**Ответ (200):**
```
{ "translations": ["строка 1", "строка 2", ...] }
```
Порядок и длина массива должны 1-в-1 совпадать с `texts`.

**Нужно добавить (в скелете пока нет):** кэш — не платить DeepL дважды за один и тот же текст. Рекомендация: таблица `translation_cache` с ключом `sha256(sourceLang|targetLang|text)`, перед вызовом DeepL проверять кэш по каждой строке, слать в DeepL только те, которых нет, писать результат обратно в кэш.

Провайдер переключается через `TRANSLATE_PROVIDER=deepl|google` (обе реализации уже есть в скелете: `services/translateProvider.ts`).

## 4. Paddle — `POST /webhooks/paddle` (реализовано, нужно доработать под новую схему `plan`)

- Проверка подписи: HMAC-SHA256 по сырому телу запроса, заголовок `Paddle-Signature: ts=...;h1=...`, секрет — `PADDLE_WEBHOOK_SECRET`.
- На `subscription.activated`/`.updated` → `plan = 'pro'`, `subscription_status = 'active'`.
- На `subscription.canceled` → `plan = 'free'`, `subscription_status = 'canceled'`.
- Матчим пользователя через `custom_data.user_id`, который нужно передавать в Paddle Checkout при открытии оплаты (frontend positions this — Upgrade-кнопка пока не сделана).

## 5. Схема БД

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 days'),
  downloads_today INTEGER NOT NULL DEFAULT 0,
  downloads_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS translation_cache (
  hash TEXT PRIMARY KEY,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS translation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  characters INTEGER NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. ENV переменные

```
PORT=8787
CORS_ORIGIN=chrome-extension://<id>
DATABASE_URL=postgres://...
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
JWT_SECRET=...
JWT_EXPIRES_IN=30d
TRANSLATE_PROVIDER=deepl
DEEPL_API_KEY=...
PADDLE_API_KEY=...
PADDLE_WEBHOOK_SECRET=...
```

## 7. Что уже НЕ входит в зону бэкенда (для контекста)

Фронт (расширение) уже реализован и включает: извлечение субтитров, конвертацию SRT/VTT/TXT, очистку `[music]`/`(смех)`, кнопки Download/Copy, выбор языка перевода и режим "только перевод"/"билингва" — это всё готово и не требует изменений в контракте выше. UI для лимитов/Upgrade появится после того, как будет готов `/downloads/check`.

## 8. Открытые вопросы к согласованию

1. Access token vs ID token для `/auth/google` (см. раздел 1) — если хотите ID token, скажите, поменяем флоу на фронте.
2. Точный URL продакшен-бэкенда (сейчас фронт хардкодит `http://localhost:8787` в `extension/src/lib/api.ts` и `background.ts` — надо будет поменять на реальный домен и завести это через build-переменную).
3. Публичный домен для CORS `CORS_ORIGIN` — понадобится ID опубликованного расширения.
