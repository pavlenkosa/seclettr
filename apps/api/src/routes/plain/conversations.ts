/**
 * GET /plain/conversations → list all plain DM peers with last message timestamp
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";

export async function plainConversationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { sub: userId } = request.auth;

      const rows = await query<{
        peer_user_id: string;
        peer_username: string;
        last_message_at: string;
      }>(
        `
        SELECT DISTINCT ON (peer_user_id)
          peer_user_id,
          peer_username,
          last_message_at
        FROM (
          SELECT
            CASE WHEN pm.sender_user_id = $1 THEN pm.recipient_user_id ELSE pm.sender_user_id END AS peer_user_id,
            CASE WHEN pm.sender_user_id = $1 THEN ru.username ELSE su.username END AS peer_username,
            pm.created_at AS last_message_at
          FROM plain_messages pm
          JOIN users su ON su.id = pm.sender_user_id
          JOIN users ru ON ru.id = pm.recipient_user_id
          WHERE pm.deleted_at IS NULL
            AND pm.recipient_user_id IS NOT NULL
            AND (pm.sender_user_id = $1 OR pm.recipient_user_id = $1)
        ) sub
        ORDER BY peer_user_id, last_message_at DESC
        `,
        [userId]
      );

      return reply.send({
        conversations: rows.map((r) => ({
          peerUserId: r.peer_user_id,
          peerUsername: r.peer_username,
          lastMessageAt: r.last_message_at,
        })),
      });
    }
  );
}
