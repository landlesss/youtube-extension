import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db/client.js";

interface PaddleWebhookEvent {
  event_type: string;
  data: {
    customer_id?: string;
    subscription_id?: string;
    status?: string;
    custom_data?: { user_id?: string };
  };
}

function verifyPaddleSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !config.paddleWebhookSecret) return false;

  // Paddle Billing sends "ts=<timestamp>;h1=<hmac>"
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((part) => part.split("=") as [string, string]),
  );
  if (!parts.ts || !parts.h1) return false;

  const signedPayload = `${parts.ts}:${rawBody}`;
  const expected = createHmac("sha256", config.paddleWebhookSecret).update(signedPayload).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(parts.h1);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/paddle", async (request, reply) => {
      const rawBody = request.rawBody ?? "";
      const signature = request.headers["paddle-signature"] as string | undefined;

      if (!verifyPaddleSignature(rawBody, signature)) {
        request.log.warn("Rejected Paddle webhook with invalid signature");
        return reply.code(401).send({ error: "Invalid signature" });
      }

      const event = JSON.parse(rawBody) as PaddleWebhookEvent;
      const userId = event.data.custom_data?.user_id;

      switch (event.event_type) {
        case "subscription.activated":
        case "subscription.updated":
        case "subscription.canceled": {
          if (userId) {
            const status = event.event_type === "subscription.canceled" ? "canceled" : "active";
            const plan = status === "active" ? "pro" : "free";
            await pool.query(
              `UPDATE users SET subscription_status = $1, plan = $2,
               paddle_customer_id = $3, paddle_subscription_id = $4
               WHERE id = $5`,
              [status, plan, event.data.customer_id ?? null, event.data.subscription_id ?? null, userId],
            );
          }
          break;
        }
        default:
          request.log.info({ eventType: event.event_type }, "Unhandled Paddle event");
      }

      return reply.send({ received: true });
  });
}
