/**
 * Ephemeral encrypted chat transfer packages.
 * Blobs are stored for 1 hour and deleted after first download.
 * The server never sees plaintext — encryption/decryption happens client-side.
 */
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";
import { parseOrReply } from "../../utils/validation.js";

/** ~5 MB of base64url ≈ ~3.75 MB binary. Enough for serialised chat history. */
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;
const TRANSFER_ID_BYTES = 16;

function generateTransferId(): string {
  return randomBytes(TRANSFER_ID_BYTES).toString("base64url");
}

const UploadSchema = z.object({
  /** Base64url-encoded AES-GCM ciphertext (IV prepended, Argon2id-derived key). */
  payload: z.string().max(MAX_BASE64_LENGTH),
});

export async function transferRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "10 minutes" },
      },
      onRequest: requireAuth,
    },
    async (request, reply) => {
      const body = parseOrReply(reply, UploadSchema, request.body);
      if (!body) return;

      let payloadBytes: Buffer;
      try {
        payloadBytes = Buffer.from(body.payload, "base64url");
      } catch {
        return reply.code(400).send({ error: "Invalid base64url payload" });
      }

      const id = generateTransferId();
      await query(
        `INSERT INTO transfer_packages (id, payload) VALUES ($1, $2)`,
        [id, payloadBytes]
      );

      return reply.code(201).send({ id });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      onRequest: requireAuth,
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!id || typeof id !== "string" || id.length > 32) {
        return reply.code(404).send({ error: "Not found" });
      }

      const rows = await query<{ payload: Buffer }>(
        `DELETE FROM transfer_packages
         WHERE id = $1 AND expires_at > NOW()
         RETURNING payload`,
        [id]
      );

      if (!rows[0]) {
        return reply.code(404).send({ error: "Not found or expired" });
      }

      const b64 = rows[0].payload.toString("base64url");
      return reply.code(200).send({ payload: b64 });
    }
  );
}
