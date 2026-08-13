import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { translateRoutes } from "./routes/translate.js";
import { billingRoutes } from "./routes/billing.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const app = Fastify({ logger: true });

// Capture the raw request body so webhook signatures (Paddle) can be verified
// against the exact bytes that were sent, not a re-serialized copy.
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (request, body, done) => {
    const raw = body.toString("utf8");
    request.rawBody = raw;
    try {
      done(null, raw.length ? JSON.parse(raw) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

await app.register(cors, { origin: config.corsOrigin });

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(translateRoutes);
await app.register(billingRoutes);

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`Backend listening on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
