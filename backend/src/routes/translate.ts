import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";
import { translateTexts } from "../services/translateProvider.js";
import { pool } from "../db/client.js";

interface TranslateBody {
  texts: string[];
  sourceLang: string;
  targetLang: string;
}

const MAX_TEXTS = 2000;
const MAX_TOTAL_CHARS = 100_000;

export async function translateRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: TranslateBody }>(
    "/translate",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { texts, sourceLang, targetLang } = request.body ?? {};

      if (!Array.isArray(texts) || texts.length === 0 || !sourceLang || !targetLang) {
        return reply.code(400).send({ error: "texts, sourceLang and targetLang are required" });
      }
      if (texts.length > MAX_TEXTS) {
        return reply.code(400).send({ error: `Too many subtitle lines (max ${MAX_TEXTS})` });
      }
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
      if (totalChars > MAX_TOTAL_CHARS) {
        return reply.code(400).send({ error: "Subtitle text is too long" });
      }

      try {
        const translations = await translateTexts(texts, sourceLang, targetLang);
        await pool.query(
          "INSERT INTO translation_usage (user_id, characters, source_lang, target_lang) VALUES ($1, $2, $3, $4)",
          [request.userId, totalChars, sourceLang, targetLang],
        );
        return reply.send({ translations });
      } catch (err) {
        request.log.error({ err }, "Translation failed");
        return reply.code(502).send({ error: "Translation provider error" });
      }
    },
  );
}
