function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  databaseUrl: process.env.DATABASE_URL ?? "",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",

  jwtSecret: process.env.NODE_ENV === "production" ? required("JWT_SECRET") : (process.env.JWT_SECRET ?? "dev-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "30d",

  translateProvider: (process.env.TRANSLATE_PROVIDER ?? "deepl") as "deepl" | "google",
  deeplApiKey: process.env.DEEPL_API_KEY ?? "",
  deeplApiUrl: process.env.DEEPL_API_URL ?? "https://api-free.deepl.com/v2/translate",
  googleTranslateApiKey: process.env.GOOGLE_TRANSLATE_API_KEY ?? "",

  paddleApiKey: process.env.PADDLE_API_KEY ?? "",
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
};
