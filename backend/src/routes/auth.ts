import type { FastifyInstance } from "fastify";
import { verifyGoogleAccessToken } from "../services/googleAuth.js";
import { signSession } from "../services/jwt.js";
import { findOrCreateUserByGoogleSub } from "../db/client.js";

interface GoogleAuthBody {
  accessToken: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: GoogleAuthBody }>("/auth/google", async (request, reply) => {
    const { accessToken } = request.body ?? {};
    if (!accessToken) {
      return reply.code(400).send({ error: "accessToken is required" });
    }

    try {
      const identity = await verifyGoogleAccessToken(accessToken);
      const user = await findOrCreateUserByGoogleSub(identity.sub, identity.email);
      const token = signSession({ userId: user.id, email: user.email });
      return reply.send({ token, email: user.email });
    } catch (err) {
      request.log.warn({ err }, "Google auth failed");
      return reply.code(401).send({ error: "Google authentication failed" });
    }
  });
}
