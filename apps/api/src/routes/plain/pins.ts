/**
 * Per-user pinned plain chats.
 *
 * GET    /plain/pins                       → list this user's pins
 * POST   /plain/pins/:peerKind/:peerId     → pin a chat (dm | group)
 * DELETE /plain/pins/:peerKind/:peerId     → unpin
 *
 * Pins are local to the pinning user. POST is idempotent (re-pinning bumps
 * `pinned_at`); DELETE is idempotent (unpinning a non-pinned chat is OK).
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";
import { PlainChatPinKindSchema } from "@seclettr/protocol";
import { z } from "zod";

const PinParamsSchema = z.object({
  peerKind: PlainChatPinKindSchema,
  peerId: z.string().uuid(),
});

const MAX_PINS_PER_USER = 50;

export async function plainPinRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;

      const rows = await query<{
        peer_kind: string;
        peer_id: string;
        pinned_at: string;
      }>(
        `SELECT
           peer_kind,
           peer_id,
           to_char(pinned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS pinned_at
         FROM plain_chat_pins
         WHERE user_id = $1
         ORDER BY pinned_at DESC`,
        [userId]
      );

      return reply.code(200).send({
        pins: rows.map((r) => ({
          peerKind: r.peer_kind,
          peerId: r.peer_id,
          pinnedAt: r.pinned_at,
        })),
      });
    }
  );

  fastify.post(
    "/:peerKind/:peerId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const parsed = PinParamsSchema.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid params" });
      const { peerKind, peerId } = parsed.data;

      // Authorize: the peer must actually exist and be reachable by this user.
      // For DM — the user table; for group — active membership.
      if (peerKind === "dm") {
        if (peerId === userId) {
          return reply.code(400).send({ error: "Cannot pin self DM" });
        }
        const [peer] = await query<{ id: string }>(
          "SELECT id FROM users WHERE id = $1",
          [peerId]
        );
        if (!peer) return reply.code(404).send({ error: "Peer not found" });
      } else {
        const [membership] = await query<{ user_id: string }>(
          `SELECT user_id FROM plain_group_members
           WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL`,
          [peerId, userId]
        );
        if (!membership) return reply.code(403).send({ error: "Not a member" });
      }

      // Pin cap protects against abuse / unbounded sidebar.
      const countRows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM plain_chat_pins WHERE user_id = $1`,
        [userId]
      );
      const currentCount = Number(countRows[0]?.count ?? 0);

      // If the chat is already pinned, the upsert just bumps pinned_at and
      // doesn't increase the count — only fresh pins hit the cap.
      const [existing] = await query<{ peer_id: string }>(
        `SELECT peer_id FROM plain_chat_pins
         WHERE user_id = $1 AND peer_kind = $2 AND peer_id = $3`,
        [userId, peerKind, peerId]
      );
      if (!existing && currentCount >= MAX_PINS_PER_USER) {
        return reply.code(409).send({ error: `Pin limit reached (max ${MAX_PINS_PER_USER})` });
      }

      const [pin] = await query<{ pinned_at: string }>(
        `INSERT INTO plain_chat_pins (user_id, peer_kind, peer_id, pinned_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, peer_kind, peer_id) DO UPDATE SET pinned_at = EXCLUDED.pinned_at
         RETURNING to_char(pinned_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS pinned_at`,
        [userId, peerKind, peerId]
      );

      return reply.code(200).send({
        peerKind,
        peerId,
        pinnedAt: pin?.pinned_at ?? new Date().toISOString(),
      });
    }
  );

  fastify.delete(
    "/:peerKind/:peerId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;
      const parsed = PinParamsSchema.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid params" });
      const { peerKind, peerId } = parsed.data;

      await query(
        `DELETE FROM plain_chat_pins
         WHERE user_id = $1 AND peer_kind = $2 AND peer_id = $3`,
        [userId, peerKind, peerId]
      );

      return reply.code(204).send();
    }
  );
}
