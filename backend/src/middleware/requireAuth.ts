import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession } from "../services/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userEmail?: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    await reply.code(401).send({ error: "Missing bearer token" });
    return;
  }

  try {
    const payload = verifySession(token);
    request.userId = payload.userId;
    request.userEmail = payload.email;
  } catch {
    await reply.code(401).send({ error: "Invalid or expired session" });
  }
}
