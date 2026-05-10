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
        last_message_content: string;
        last_message_type: string;
        last_sender_user_id: string;
        unread_count: string;
      }>(
        `
        WITH last_msgs AS (
          SELECT DISTINCT ON (peer_user_id)
            peer_user_id,
            peer_username,
            last_message_at,
            last_message_content,
            last_message_type,
            last_sender_user_id
          FROM (
            SELECT
              CASE WHEN pm.sender_user_id = $1 THEN pm.recipient_user_id ELSE pm.sender_user_id END AS peer_user_id,
              CASE WHEN pm.sender_user_id = $1 THEN ru.username ELSE su.username END AS peer_username,
              pm.created_at   AS last_message_at,
              pm.content      AS last_message_content,
              pm.message_type AS last_message_type,
              pm.sender_user_id AS last_sender_user_id
            FROM plain_messages pm
            JOIN users su ON su.id = pm.sender_user_id
            JOIN users ru ON ru.id = pm.recipient_user_id
            WHERE pm.deleted_at IS NULL
              AND pm.recipient_user_id IS NOT NULL
              AND (pm.sender_user_id = $1 OR pm.recipient_user_id = $1)
          ) sub
          ORDER BY peer_user_id, last_message_at DESC
        ),
        unread AS (
          SELECT pm.sender_user_id AS peer_user_id, COUNT(*) AS cnt
          FROM plain_messages pm
          WHERE pm.recipient_user_id = $1
            AND pm.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM plain_message_reads pmr
              WHERE pmr.message_id = pm.id AND pmr.user_id = $1
            )
          GROUP BY pm.sender_user_id
        )
        SELECT lm.*, COALESCE(u.cnt, 0) AS unread_count
        FROM last_msgs lm
        LEFT JOIN unread u ON u.peer_user_id = lm.peer_user_id
        `,
        [userId]
      );

      return reply.send({
        conversations: rows.map((r) => ({
          peerUserId: r.peer_user_id,
          peerUsername: r.peer_username,
          lastMessageAt: r.last_message_at,
          lastMessageContent: r.last_message_content,
          lastMessageType: r.last_message_type,
          lastSenderUserId: r.last_sender_user_id,
          unreadCount: Number(r.unread_count),
        })),
      });
    }
  );
}
