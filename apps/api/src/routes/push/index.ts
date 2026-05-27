import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { query } from "../../db/pool.js";
import { parseOrReply } from "../../utils/validation.js";
import {
  getPushPreferences,
  getVapidPublicKey,
  isPushEnabled,
  isFcmAvailable,
  upsertPushPreferences,
} from "../../services/push.js";

const PushSubscriptionBodySchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const UnsubscribeBodySchema = z.object({
  endpoint: z.string().url().max(2048),
});

const PushSubscriptionParamsSchema = z.object({
  id: z.string().uuid(),
});

const PushPreferencesBodySchema = z.object({
  directMessagesEnabled: z.boolean(),
  groupMessagesEnabled: z.boolean(),
  callInvitesEnabled: z.boolean(),
  showSender: z.boolean(),
});

const FcmTokenBodySchema = z.object({
  fcmToken: z.string().min(1).max(4096),
});

export async function pushRoutes(fastify: FastifyInstance): Promise<void> {
  if (!isPushEnabled()) {
    fastify.log.warn("Push notifications are disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured");
  }
  fastify.get(
    "/vapid-public-key",
    { preHandler: requireAuth },
    async (_request, reply) => {
      const vapidPublicKey = getVapidPublicKey();
      if (!vapidPublicKey) {
        return reply.code(404).send({ error: "Push is not configured" });
      }
      return { vapidPublicKey };
    }
  );

  fastify.post(
    "/subscriptions",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!isPushEnabled()) {
        return reply.code(503).send({ error: "Push is not configured" });
      }
      const body = parseOrReply(reply, PushSubscriptionBodySchema, request.body);
      if (!body) return;
      const { sub: userId, deviceId } = request.auth;

      await query(
        `INSERT INTO push_subscriptions (user_id, device_id, endpoint, p256dh, auth, user_agent, revoked_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, now())
         ON CONFLICT (endpoint)
         DO UPDATE SET
           user_id = EXCLUDED.user_id,
           device_id = EXCLUDED.device_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           revoked_at = NULL,
           updated_at = now()`,
        [
          userId,
          deviceId,
          body.endpoint,
          body.keys.p256dh,
          body.keys.auth,
          request.headers["user-agent"] ?? null,
        ]
      );

      return reply.code(204).send();
    }
  );

  fastify.post(
    "/subscriptions/unsubscribe",
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = parseOrReply(reply, UnsubscribeBodySchema, request.body);
      if (!body) return;
      const { sub: userId } = request.auth;

      await query(
        `UPDATE push_subscriptions
         SET revoked_at = now(), updated_at = now()
         WHERE user_id = $1 AND endpoint = $2 AND revoked_at IS NULL`,
        [userId, body.endpoint]
      );

      return reply.code(204).send();
    }
  );

  fastify.get(
    "/subscriptions",
    { preHandler: requireAuth },
    async (request) => {
      const rows = await query<{
        id: string;
        device_id: string | null;
        endpoint: string;
        user_agent: string | null;
        created_at: string;
        updated_at: string;
        last_success_at: string | null;
        last_error_at: string | null;
      }>(
        `SELECT id, device_id, endpoint, user_agent, created_at, updated_at, last_success_at, last_error_at
         FROM push_subscriptions
         WHERE user_id = $1
           AND revoked_at IS NULL
         ORDER BY updated_at DESC`,
        [request.auth.sub]
      );

      return {
        subscriptions: rows.map((row) => ({
          id: row.id,
          endpoint: row.endpoint,
          userAgent: row.user_agent,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
          lastErrorAt: row.last_error_at ? new Date(row.last_error_at).toISOString() : null,
          currentDevice: row.device_id === request.auth.deviceId,
        })),
      };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/subscriptions/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = parseOrReply(reply, PushSubscriptionParamsSchema, request.params);
      if (!params) return;

      const rows = await query<{ id: string }>(
        `UPDATE push_subscriptions
         SET revoked_at = now(), updated_at = now()
         WHERE id = $1
           AND user_id = $2
           AND revoked_at IS NULL
         RETURNING id`,
        [params.id, request.auth.sub]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: "Push subscription not found" });
      }

      return reply.code(204).send();
    }
  );

  fastify.get(
    "/preferences",
    { preHandler: requireAuth },
    async (request) => {
      return getPushPreferences(request.auth.sub);
    }
  );

  fastify.put(
    "/preferences",
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = parseOrReply(reply, PushPreferencesBodySchema, request.body);
      if (!body) return;
      return upsertPushPreferences(request.auth.sub, body);
    }
  );

  // ── FCM device token endpoints (optional) ────────────────────────────

  fastify.post(
    "/fcm/token",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!isFcmAvailable()) {
        return reply.code(503).send({ error: "FCM is not configured on this server" });
      }
      const body = parseOrReply(reply, FcmTokenBodySchema, request.body);
      if (!body) return;
      const { sub: userId, deviceId } = request.auth;

      await query(
        `INSERT INTO push_device_tokens (user_id, device_id, fcm_token, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (fcm_token)
         DO UPDATE SET
           user_id = EXCLUDED.user_id,
           device_id = EXCLUDED.device_id,
           revoked_at = NULL,
           updated_at = now()`,
        [userId, deviceId, body.fcmToken]
      );

      return reply.code(204).send();
    }
  );

  fastify.delete(
    "/fcm/token",
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = parseOrReply(reply, FcmTokenBodySchema, request.body);
      if (!body) return;
      const { sub: userId } = request.auth;

      await query(
        `UPDATE push_device_tokens
         SET revoked_at = now(), updated_at = now()
         WHERE user_id = $1 AND fcm_token = $2 AND revoked_at IS NULL`,
        [userId, body.fcmToken]
      );

      return reply.code(204).send();
    }
  );

  fastify.get(
    "/fcm/tokens",
    { preHandler: requireAuth },
    async (request) => {
      const rows = await query<{
        id: string;
        created_at: string;
        updated_at: string;
        device_id: string | null;
      }>(
        `SELECT id, device_id, created_at, updated_at
         FROM push_device_tokens
         WHERE user_id = $1
           AND revoked_at IS NULL
         ORDER BY updated_at DESC`,
        [request.auth.sub]
      );

      return {
        tokens: rows.map((row) => ({
          id: row.id,
          deviceId: row.device_id,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          currentDevice: row.device_id === request.auth.deviceId,
        })),
      };
    }
  );
}
