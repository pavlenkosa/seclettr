/**
 * Message relay routes.
 * - POST /messages              → send encrypted message(s)
 * - GET  /messages/pending      → fetch undelivered messages (for offline devices)
 * - POST /messages/:id/ack      → acknowledge delivery
 * - POST /groups/:groupId/messages → send group message
 */
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { config } from "../../config.js";
import { requireAuth } from "../../middleware/auth.js";
import { query, transaction, type PoolClient } from "../../db/pool.js";
import { publishMessage } from "../../services/redis.js";
import { ensureDirectRelationship } from "../../services/user-relationships.js";
import { getPushPreferences, sendPushToUser } from "../../services/push.js";
import {
  buildDirectMessagePushPayload,
  buildGroupMessagePushPayload,
} from "../../services/push-payloads.js";
import { hasActiveConnectionForUserAcrossCluster } from "../../services/websocket.js";
import { parseVersionedOrReply } from "../../utils/validation.js";
import { recordMessageSent, recordOtkConsumed, recordPushNotificationFailure } from "../../services/observability.js";
import { consumeFixedWindowRateLimit } from "../../utils/fixed-window-rate-limit.js";

/** 60 direct messages per user per minute. */
const SEND_MESSAGE_RATE_MAX = 60;
const SEND_MESSAGE_RATE_WINDOW_SEC = 60;

/** 20 group messages per user per minute (one-to-many fan-out is more expensive). */
const SEND_GROUP_MESSAGE_RATE_MAX = 20;
const SEND_GROUP_MESSAGE_RATE_WINDOW_SEC = 60;
import {
  GROUPS_PROTOCOL_VERSION,
  MESSAGE_PROTOCOL_VERSION,
  type GroupHistoryMessage,
  GroupHistoryResponseSchema,
  MessageAckResponseSchema,
  PendingMessagesResponseSchema,
  SendGroupMessageResponseSchema,
  type GroupHistoryResponseWire,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  SendGroupMessageRequestSchema,
  type SendGroupMessageRequest,
  type DirectMessageDelivery,
  type SendMessageRequest,
} from "@seclettr/protocol";

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type RouteError = Error & {
  statusCode?: number;
  payload?: { error: string };
};

type DirectMessageRequestItem = SendMessageRequest["messages"][number];

interface DirectMessageInsertRow {
  id: string;
  created_at: string;
}

interface ExistingDirectMessageRow {
  id: string;
  sender_device_id: string;
  message_type: string;
  ciphertext: string;
  x3dh_header: unknown;
  otk_key_id: number | null;
  otk_reservation_token_hash: string | null;
}

interface DirectMessagePersistResult {
  result: DirectMessageDelivery;
  realtimeEvent?: DirectRealtimeEvent;
}

interface DirectRealtimeEvent {
  recipientDeviceId: string;
  message: {
    id: string;
    senderUserId: string;
    senderDeviceId: string;
    recipientDeviceId: string;
    type: string;
    ciphertext: string;
    x3dhHeader?: unknown;
    createdAt: string;
  };
}

interface GroupMessageRow {
  id: string;
  group_id: string;
  sender_device_id: string;
  message_type: string;
  ciphertext: string;
  signature: string;
  crypto_epoch: number;
  aead_version: number;
  created_at: string;
}

type GroupMessageRequest = SendGroupMessageRequest;

interface GroupMessagePersistResult {
  message: GroupMessageRow;
  inserted: boolean;
}

interface GroupMemberDeviceRow {
  id: string;
}

interface GroupMemberUserRow {
  user_id: string;
}

interface GroupSendMetadata {
  name: string | null;
  cryptoEpoch: number;
}

function routeError(statusCode: number, error: string): RouteError {
  const err = new Error(error) as RouteError;
  err.statusCode = statusCode;
  err.payload = { error };
  return err;
}

async function fetchUsername(userId: string): Promise<string | null> {
  const rows = await query<{ username: string }>(
    "SELECT username FROM users WHERE id = $1",
    [userId]
  );
  return rows[0]?.username ?? null;
}

function getMessageAttachmentId(message: DirectMessageRequestItem): string | undefined {
  return (message as { attachmentId?: string }).attachmentId;
}

async function fetchValidRecipientDeviceIds(
  client: PoolClient,
  recipientUserId: string,
  messages: DirectMessageRequestItem[]
): Promise<Set<string>> {
  const uniqueRecipientDeviceIds = [
    ...new Set(messages.map((message) => message.recipientDeviceId)),
  ];
  const validRecipientRows = await client.query<{ id: string }>(
    `SELECT id
     FROM devices
     WHERE user_id = $1
       AND id = ANY($2::uuid[])`,
    [recipientUserId, uniqueRecipientDeviceIds]
  );
  return new Set(validRecipientRows.rows.map((row) => row.id));
}

async function assertSenderCanUseAttachment(
  client: PoolClient,
  attachmentId: string,
  senderUserId: string
): Promise<void> {
  const ownedAttachment = await client.query<{ id: string; upload_state: string }>(
    `SELECT a.id, a.upload_state
     FROM attachments a
     JOIN devices uploader ON uploader.id = a.uploader_device_id
     WHERE a.id = $1
       AND a.deleted_at IS NULL
       AND uploader.user_id = $2`,
    [attachmentId, senderUserId]
  );
  if ((ownedAttachment.rowCount ?? 0) === 0) {
    throw routeError(403, "Attachment is not accessible to sender");
  }
  if (ownedAttachment.rows[0]?.upload_state !== "verified") {
    throw routeError(409, "Attachment is not verified");
  }
}

async function validateDirectMessageAttachment(
  client: PoolClient,
  message: DirectMessageRequestItem,
  senderUserId: string
): Promise<string | undefined> {
  const attachmentId = getMessageAttachmentId(message);
  if (message.type !== "attachment") {
    return attachmentId;
  }
  if (!attachmentId) {
    throw routeError(400, "attachmentId is required for attachment messages");
  }
  await assertSenderCanUseAttachment(client, attachmentId, senderUserId);
  return attachmentId;
}

async function insertDirectMessage(
  client: PoolClient,
  clientMessageId: string,
  senderDeviceId: string,
  message: DirectMessageRequestItem
): Promise<DirectMessageInsertRow | null> {
  const rows = await client.query<DirectMessageInsertRow>(
    `INSERT INTO messages
       (client_message_id, sender_device_id, recipient_device_id,
        message_type, ciphertext, x3dh_header, otk_key_id, otk_reservation_token_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (client_message_id, recipient_device_id) DO NOTHING
     RETURNING id, created_at`,
    [
      clientMessageId,
      senderDeviceId,
      message.recipientDeviceId,
      message.type,
      message.ciphertext,
      message.x3dhHeader ? JSON.stringify(message.x3dhHeader) : null,
      message.x3dhHeader?.oneTimePreKeyId ?? null,
      message.oneTimePreKeyReservationToken
        ? hashOpaqueToken(message.oneTimePreKeyReservationToken)
        : null,
    ]
  );
  return rows.rows[0] ?? null;
}

async function bindReservedOneTimePrekey(
  client: PoolClient,
  message: DirectMessageRequestItem,
  senderUserId: string,
  messageId: string
): Promise<void> {
  if (message.x3dhHeader?.oneTimePreKeyId === undefined) {
    return;
  }

  const reservationBinding = await client.query(
    `UPDATE one_time_prekeys
     SET reserved_message_id = $5,
         reservation_expires_at = NULL
     WHERE device_id = $1
       AND key_id = $2
       AND used_at IS NULL
       AND reservation_token_hash = $3
       AND reserved_for_user_id = $4
       AND reserved_message_id IS NULL
       AND reservation_expires_at > now()`,
    [
      message.recipientDeviceId,
      message.x3dhHeader.oneTimePreKeyId,
      message.oneTimePreKeyReservationToken
        ? hashOpaqueToken(message.oneTimePreKeyReservationToken)
        : null,
      senderUserId,
      messageId,
    ]
  );

  if ((reservationBinding.rowCount ?? 0) === 0) {
    throw routeError(409, "One-time prekey reservation is invalid or expired");
  }
}

async function grantDirectAttachmentAccess(
  client: PoolClient,
  attachmentId: string | undefined,
  senderDeviceId: string,
  recipientDeviceId: string
): Promise<void> {
  if (!attachmentId) return;
  await client.query(
    `INSERT INTO attachment_access (attachment_id, device_id, granted_by_device_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (attachment_id, device_id) DO NOTHING`,
    [attachmentId, senderDeviceId, senderDeviceId]
  );
  await client.query(
    `INSERT INTO attachment_access (attachment_id, device_id, granted_by_device_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (attachment_id, device_id) DO NOTHING`,
    [attachmentId, recipientDeviceId, senderDeviceId]
  );
}

function toDirectRealtimeEvent(
  row: DirectMessageInsertRow,
  message: DirectMessageRequestItem,
  senderUserId: string,
  senderDeviceId: string
): DirectRealtimeEvent {
  return {
    recipientDeviceId: message.recipientDeviceId,
    message: {
      id: row.id,
      senderUserId,
      senderDeviceId,
      recipientDeviceId: message.recipientDeviceId,
      type: message.type,
      ciphertext: message.ciphertext,
      x3dhHeader: message.x3dhHeader,
      // PostgreSQL returns timestamps with space separator ("2024-01-15 12:34:56+00").
      // Zod z.string().datetime() requires ISO 8601 with T separator — convert here.
      createdAt: new Date(row.created_at).toISOString(),
    },
  };
}

async function fetchExistingDirectMessage(
  client: PoolClient,
  clientMessageId: string,
  recipientDeviceId: string
): Promise<ExistingDirectMessageRow | undefined> {
  const existingRows = await client.query<ExistingDirectMessageRow>(
    `SELECT id, sender_device_id, message_type, ciphertext, x3dh_header,
            otk_key_id, otk_reservation_token_hash
     FROM messages
     WHERE client_message_id = $1
       AND recipient_device_id = $2
     LIMIT 1`,
    [clientMessageId, recipientDeviceId]
  );
  return existingRows.rows[0];
}

function hasSameDirectMessagePayload(
  existing: ExistingDirectMessageRow,
  message: DirectMessageRequestItem,
  senderDeviceId: string
): boolean {
  const expectedX3dhHeader = message.x3dhHeader ?? null;
  const expectedReservationHash = message.oneTimePreKeyReservationToken
    ? hashOpaqueToken(message.oneTimePreKeyReservationToken)
    : null;

  return existing.sender_device_id === senderDeviceId &&
    existing.message_type === message.type &&
    existing.ciphertext === message.ciphertext &&
    JSON.stringify(existing.x3dh_header ?? null) === JSON.stringify(expectedX3dhHeader) &&
    (existing.otk_key_id ?? null) === (message.x3dhHeader?.oneTimePreKeyId ?? null) &&
    (existing.otk_reservation_token_hash ?? null) === expectedReservationHash;
}

async function resolveIdempotentDirectMessage(
  client: PoolClient,
  clientMessageId: string,
  message: DirectMessageRequestItem,
  senderDeviceId: string
): Promise<DirectMessagePersistResult | null> {
  const existing = await fetchExistingDirectMessage(
    client,
    clientMessageId,
    message.recipientDeviceId
  );
  if (!existing) return null;
  if (!hasSameDirectMessagePayload(existing, message, senderDeviceId)) {
    throw routeError(409, "clientMessageId already used with different payload");
  }

  return {
    result: {
      messageId: existing.id,
      recipientDeviceId: message.recipientDeviceId,
      status: "duplicate",
    },
  };
}

async function persistDirectMessage(
  client: PoolClient,
  params: {
    clientMessageId: string;
    senderUserId: string;
    senderDeviceId: string;
    validRecipientDeviceIds: Set<string>;
    message: DirectMessageRequestItem;
  }
): Promise<DirectMessagePersistResult | null> {
  const { clientMessageId, senderUserId, senderDeviceId, validRecipientDeviceIds, message } = params;
  const attachmentId = await validateDirectMessageAttachment(client, message, senderUserId);
  if (!validRecipientDeviceIds.has(message.recipientDeviceId)) return null;

  const inserted = await insertDirectMessage(client, clientMessageId, senderDeviceId, message);
  if (!inserted) {
    return resolveIdempotentDirectMessage(client, clientMessageId, message, senderDeviceId);
  }

  await bindReservedOneTimePrekey(client, message, senderUserId, inserted.id);
  if (message.type === "attachment") {
    await grantDirectAttachmentAccess(client, attachmentId, senderDeviceId, message.recipientDeviceId);
  }

  return {
    result: {
      messageId: inserted.id,
      recipientDeviceId: message.recipientDeviceId,
      status: "created",
    },
    realtimeEvent: toDirectRealtimeEvent(inserted, message, senderUserId, senderDeviceId),
  };
}

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/",
    {
      preHandler: requireAuth,
      bodyLimit: config.MAX_MESSAGE_JSON_BYTES,
    },
    async (request, reply) => {
      const body = parseVersionedOrReply(
        reply,
        SendMessageRequestSchema,
        request.body,
        MESSAGE_PROTOCOL_VERSION
      );
      if (!body) return;
      const { sub: senderUserId, deviceId: senderDeviceId } = request.auth;

      const sendLimit = await consumeFixedWindowRateLimit({
        key: `rl:send_message:${senderUserId}`,
        max: SEND_MESSAGE_RATE_MAX,
        windowSec: SEND_MESSAGE_RATE_WINDOW_SEC,
      });
      if (!sendLimit.allowed) {
        return reply.code(429).header("Retry-After", String(sendLimit.retryAfterSec)).send({
          error: "Too many requests",
        });
      }

      const senderUsername = await fetchUsername(senderUserId);

      const recipients = await query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1",
        [body.recipientUserId]
      );
      if (recipients.length === 0) {
        return reply.code(404).send({ error: "Recipient not found" });
      }

      const results: DirectMessageDelivery[] = [];
      const realtimeDirectEvents: DirectRealtimeEvent[] = [];

      try {
        await transaction(async (client) => {
          const validRecipientDeviceIds = await fetchValidRecipientDeviceIds(
            client,
            body.recipientUserId,
            body.messages
          );

          for (const msg of body.messages) {
            const persisted = await persistDirectMessage(client, {
              clientMessageId: body.clientMessageId,
              senderUserId,
              senderDeviceId,
              validRecipientDeviceIds,
              message: msg,
            });
            if (!persisted) continue;
            results.push(persisted.result);
            if (persisted.realtimeEvent) {
              realtimeDirectEvents.push(persisted.realtimeEvent);
            }
          }
        });
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode) {
          return reply
            .code(statusCode)
            .send(
              (err as { payload?: { error: string } }).payload ?? {
                error: "Bad request",
              }
            );
        }
        throw err;
      }

      const directPublishResults = await Promise.allSettled(
        realtimeDirectEvents.map(async (event) => {
          await publishMessage({
            type: "message.new",
            recipientDeviceId: event.recipientDeviceId,
            message: event.message,
          });
          return event;
        })
      );
      directPublishResults.forEach((result, index) => {
        if (result.status === "fulfilled") return;
        const failedEvent = realtimeDirectEvents[index];
        request.log.warn(
          {
            err: result.reason,
            recipientDeviceId: failedEvent?.recipientDeviceId,
            messageId: failedEvent?.message.id,
          },
          "Failed to publish direct message realtime event after commit"
        );
      });

      if (
        realtimeDirectEvents.length > 0 &&
        !(await hasActiveConnectionForUserAcrossCluster(body.recipientUserId))
      ) {
        void (async () => {
          const pushPreferences = await getPushPreferences(
            body.recipientUserId
          );
          const hasAttachment = body.messages.some(
            (msg) => msg.type === "attachment"
          );
          const payload = buildDirectMessagePushPayload({
            senderUserId,
            senderUsername,
            hasAttachment,
            preferences: pushPreferences,
          });
          if (!payload) return;

          await sendPushToUser(body.recipientUserId, payload);
        })().catch((err) => {
          request.log.warn({ err, userId: body.recipientUserId }, "push notification failed for direct message");
          recordPushNotificationFailure();
        });
      }

      if (results.length === 0) {
        return reply.code(404).send({ error: "No valid recipient devices" });
      }

      // Promote to a direct relationship only after at least one direct message
      // targeting a real recipient device has been accepted.
      await ensureDirectRelationship(senderUserId, body.recipientUserId);

      recordMessageSent("direct");

      return reply.code(202).send(
        SendMessageResponseSchema.parse({
          version: MESSAGE_PROTOCOL_VERSION,
          messageId: results[0]!.messageId,
          timestamp: new Date().toISOString(),
          deliveries: results,
        })
      );
    }
  );

  fastify.get("/pending", { preHandler: requireAuth }, async (request) => {
    const { deviceId } = request.auth;
    const messages = await query<{
      id: string;
      sender_user_id: string;
      sender_device_id: string;
      message_type: string;
      ciphertext: string;
      x3dh_header: object | null;
      created_at: string;
    }>(
      `SELECT m.id, d.user_id AS sender_user_id, m.sender_device_id,
                m.message_type, m.ciphertext, m.x3dh_header, m.created_at
         FROM messages m
         JOIN devices d ON d.id = m.sender_device_id
         WHERE m.recipient_device_id = $1 AND m.delivered_at IS NULL
         ORDER BY m.created_at ASC
         LIMIT 500`,
      [deviceId]
    );

    return PendingMessagesResponseSchema.parse({
      version: MESSAGE_PROTOCOL_VERSION,
      messages: messages.map((m) => ({
        id: m.id,
        senderUserId: m.sender_user_id,
        senderDeviceId: m.sender_device_id,
        recipientDeviceId: deviceId,
        type: m.message_type,
        ciphertext: m.ciphertext,
        x3dhHeader: m.x3dh_header ?? undefined,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    });
  });

  fastify.post<{ Params: { id: string } }>(
    "/:id/ack",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params;
      const { deviceId } = request.auth;

      const updated = await transaction(async (client) => {
        const delivered = await client.query<{
          id: string;
          sender_device_id: string;
          client_message_id: string;
          otk_key_id: number | null;
          otk_reservation_token_hash: string | null;
        }>(
          `UPDATE messages
           SET delivered_at = now()
           WHERE id = $1 AND recipient_device_id = $2 AND delivered_at IS NULL
           RETURNING id, sender_device_id, client_message_id, otk_key_id, otk_reservation_token_hash`,
          [id, deviceId]
        );

        if ((delivered.rowCount ?? 0) === 0) {
          return null;
        }

        const message = delivered.rows[0]!;
        if (
          message.otk_key_id !== null &&
          message.otk_reservation_token_hash !== null
        ) {
          const committedReservation = await client.query(
            `UPDATE one_time_prekeys
             SET used_at = now(),
                 reserved_at = NULL,
                 reservation_expires_at = NULL,
                 reservation_token_hash = NULL,
                 reserved_for_user_id = NULL,
                 reserved_message_id = NULL
             WHERE device_id = $1
               AND key_id = $2
               AND used_at IS NULL
               AND reserved_message_id = $3
               AND reservation_token_hash = $4`,
            [
              deviceId,
              message.otk_key_id,
              message.id,
              message.otk_reservation_token_hash,
            ]
          );

          if ((committedReservation.rowCount ?? 0) === 0) {
            const err = new Error(
              "Message ACK could not commit the reserved one-time prekey"
            ) as Error & { statusCode?: number };
            err.statusCode = 409;
            throw err;
          }
          recordOtkConsumed();
        }

        return message;
      });

      if (updated) {
        await publishMessage({
          type: "message.delivered",
          recipientDeviceId: updated.sender_device_id,
          messageId: id,
          clientMessageId: updated.client_message_id,
        });
        return MessageAckResponseSchema.parse({
          version: MESSAGE_PROTOCOL_VERSION,
          ok: true,
        });
      }

      const existing = await query<{ id: string }>(
        `SELECT id FROM messages
         WHERE id = $1 AND recipient_device_id = $2`,
        [id, deviceId]
      );

      if (existing.length === 0) {
        return reply.code(404).send({ error: "Message not found" });
      }

      return reply.code(409).send({ error: "Message already acknowledged" });
    }
  );
}

async function fetchGroupSendMetadataForMember(
  groupId: string,
  userId: string
): Promise<GroupSendMetadata> {
  const membership = await query<{
    group_id: string;
    group_name: string;
    crypto_epoch: number;
  }>(
    `SELECT gm.group_id, g.name AS group_name, g.crypto_epoch
     FROM group_members gm
     INNER JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.removed_at IS NULL`,
    [groupId, userId]
  );
  if (membership.length === 0) {
    throw routeError(403, "Not a group member");
  }
  const row = membership[0]!;
  return {
    name: row.group_name ?? null,
    cryptoEpoch: row.crypto_epoch,
  };
}

async function validateGroupMessageAttachment(
  body: GroupMessageRequest,
  senderUserId: string
): Promise<string | undefined> {
  if (body.type !== "attachment") {
    return undefined;
  }

  const attachmentId = body.attachmentId;
  if (!attachmentId) {
    throw routeError(400, "attachmentId is required for attachment messages");
  }

  const ownedAttachment = await query<{ id: string; upload_state: string }>(
    `SELECT a.id, a.upload_state
     FROM attachments a
     JOIN devices uploader ON uploader.id = a.uploader_device_id
     WHERE a.id = $1 AND a.deleted_at IS NULL AND uploader.user_id = $2`,
    [attachmentId, senderUserId]
  );
  if (ownedAttachment.length === 0) {
    throw routeError(403, "Attachment is not accessible to sender");
  }
  if (ownedAttachment[0]?.upload_state !== "verified") {
    throw routeError(409, "Attachment is not verified");
  }

  return attachmentId;
}

async function insertGroupMessage(
  groupId: string,
  senderDeviceId: string,
  body: GroupMessageRequest,
  cryptoEpoch: number
): Promise<GroupMessageRow | undefined> {
  const inserted = await query<GroupMessageRow>(
    `INSERT INTO group_messages
       (group_id, sender_device_id, distribution_id, chain_id, message_id,
        message_type, ciphertext, signature, crypto_epoch, aead_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING
     RETURNING id, group_id, sender_device_id, message_type,
               ciphertext, signature, crypto_epoch, aead_version, created_at`,
    [
      groupId,
      senderDeviceId,
      body.distributionId,
      body.chainId,
      body.messageId,
      body.type,
      body.ciphertext,
      body.signature,
      cryptoEpoch,
      body.aeadVersion ?? 1,
    ]
  );
  return inserted[0];
}

async function fetchExistingGroupMessage(
  body: GroupMessageRequest
): Promise<GroupMessageRow | undefined> {
  const existing = await query<GroupMessageRow>(
    `SELECT id, group_id, sender_device_id, message_type,
            ciphertext, signature, crypto_epoch, aead_version, created_at
     FROM group_messages
     WHERE distribution_id = $1 AND chain_id = $2 AND message_id = $3
     LIMIT 1`,
    [body.distributionId, body.chainId, body.messageId]
  );
  return existing[0];
}

function hasSameGroupMessagePayload(
  message: GroupMessageRow,
  groupId: string,
  senderDeviceId: string,
  body: GroupMessageRequest
): boolean {
  return message.group_id === groupId &&
    message.sender_device_id === senderDeviceId &&
    message.message_type === body.type &&
    message.ciphertext === body.ciphertext &&
    message.signature === body.signature &&
    message.crypto_epoch === body.cryptoEpoch &&
    message.aead_version === (body.aeadVersion ?? 1);
}

async function persistGroupMessage(
  groupId: string,
  senderDeviceId: string,
  body: GroupMessageRequest
): Promise<GroupMessagePersistResult | null> {
  const inserted = await insertGroupMessage(
    groupId,
    senderDeviceId,
    body,
    body.cryptoEpoch
  );
  const message = inserted ?? await fetchExistingGroupMessage(body);
  if (!message) {
    return null;
  }

  if (!hasSameGroupMessagePayload(message, groupId, senderDeviceId, body)) {
    throw routeError(409, "group sender-key message id already used with different payload");
  }

  return { message, inserted: inserted !== undefined };
}

async function fetchGroupMemberDevices(
  groupId: string,
  senderUserId: string
): Promise<GroupMemberDeviceRow[]> {
  return query<GroupMemberDeviceRow>(
    `SELECT d.id FROM devices d
     INNER JOIN group_members gm ON gm.user_id = d.user_id
     WHERE gm.group_id = $1 AND gm.removed_at IS NULL AND d.user_id != $2`,
    [groupId, senderUserId]
  );
}

async function grantGroupAttachmentAccess(
  attachmentId: string | undefined,
  senderDeviceId: string,
  members: GroupMemberDeviceRow[]
): Promise<void> {
  if (!attachmentId) return;

  await query(
    `INSERT INTO attachment_access (attachment_id, device_id, granted_by_device_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (attachment_id, device_id) DO NOTHING`,
    [attachmentId, senderDeviceId, senderDeviceId]
  );

  for (const member of members) {
    await query(
      `INSERT INTO attachment_access (attachment_id, device_id, granted_by_device_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (attachment_id, device_id) DO NOTHING`,
      [attachmentId, member.id, senderDeviceId]
    );
  }
}

async function publishGroupMessageToMembers(
  members: GroupMemberDeviceRow[],
  params: {
    groupId: string;
    senderDeviceId: string;
    body: GroupMessageRequest;
    createdAt: string;
    cryptoEpoch: number;
  }
): Promise<void> {
  const { groupId, senderDeviceId, body, createdAt, cryptoEpoch } = params;
  await Promise.all(
    members.map(async (member) =>
      publishMessage({
        type: "group_message.new",
        recipientDeviceId: member.id,
        groupId,
        senderDeviceId,
        distributionId: body.distributionId,
        cryptoEpoch,
        chainId: body.chainId,
        messageId: body.messageId,
        ciphertext: body.ciphertext,
        signature: body.signature,
        messageType: body.type,
        createdAt,
        aeadVersion: body.aeadVersion ?? 1,
      })
    )
  );
}

async function fetchGroupMemberUsers(
  groupId: string,
  senderUserId: string
): Promise<GroupMemberUserRow[]> {
  return query<GroupMemberUserRow>(
    `SELECT DISTINCT gm.user_id
     FROM group_members gm
     WHERE gm.group_id = $1
       AND gm.removed_at IS NULL
       AND gm.user_id != $2`,
    [groupId, senderUserId]
  );
}

async function sendGroupMessagePushNotifications(
  members: GroupMemberUserRow[],
  params: {
    senderUserId: string;
    senderUsername: string | null;
    groupId: string;
    groupName: string | null;
    logWarning: (err: unknown, userId: string) => void;
  }
): Promise<void> {
  const { senderUserId, senderUsername, groupId, groupName, logWarning } = params;
  await Promise.all(
    members.map(async (member) => {
      if (await hasActiveConnectionForUserAcrossCluster(member.user_id)) return;
      try {
        const pushPreferences = await getPushPreferences(member.user_id);
        const payload = buildGroupMessagePushPayload({
          senderUserId,
          senderUsername,
          groupId,
          groupName,
          preferences: pushPreferences,
        });
        if (!payload) return;

        await sendPushToUser(member.user_id, payload);
      } catch (err) {
        logWarning(err, member.user_id);
        recordPushNotificationFailure();
      }
    })
  );
}

export async function groupMessageRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post<{ Params: { groupId: string } }>(
    "/:groupId/messages",
    {
      preHandler: requireAuth,
      bodyLimit: config.MAX_MESSAGE_JSON_BYTES,
    },
    async (request, reply) => {
      const { groupId } = request.params;
      const body = parseVersionedOrReply(
        reply,
        SendGroupMessageRequestSchema,
        request.body,
        MESSAGE_PROTOCOL_VERSION
      );
      if (!body) return;
      const { sub: userId, deviceId } = request.auth;

      const groupSendLimit = await consumeFixedWindowRateLimit({
        key: `rl:send_group_message:${userId}`,
        max: SEND_GROUP_MESSAGE_RATE_MAX,
        windowSec: SEND_GROUP_MESSAGE_RATE_WINDOW_SEC,
      });
      if (!groupSendLimit.allowed) {
        return reply.code(429).header("Retry-After", String(groupSendLimit.retryAfterSec)).send({
          error: "Too many requests",
        });
      }

      try {
        const senderUsername = await fetchUsername(userId);
        const groupMetadata = await fetchGroupSendMetadataForMember(
          groupId,
          userId
        );
        if (body.cryptoEpoch !== groupMetadata.cryptoEpoch) {
          throw routeError(409, "Group crypto epoch mismatch");
        }
        const attachmentId = await validateGroupMessageAttachment(body, userId);
        const persisted = await persistGroupMessage(groupId, deviceId, body);

        if (!persisted) {
          request.log.error(
            {
              groupId,
              senderDeviceId: deviceId,
              distributionId: body.distributionId,
              cryptoEpoch: body.cryptoEpoch,
              chainId: body.chainId,
              messageId: body.messageId,
            },
            "group message insert returned no row and conflict lookup failed"
          );
          return reply.code(500).send({ error: "Failed to persist group message" });
        }

        const persistedGroupMessage = persisted.message;
        if (persisted.inserted) {
          recordMessageSent("group");
          const createdAt = new Date(persistedGroupMessage.created_at).toISOString();
          const members = await fetchGroupMemberDevices(groupId, userId);

          await grantGroupAttachmentAccess(attachmentId, deviceId, members);
          await publishGroupMessageToMembers(members, {
            groupId,
            senderDeviceId: deviceId,
            body,
            createdAt,
            cryptoEpoch: persistedGroupMessage.crypto_epoch,
          });

          const memberUsers = await fetchGroupMemberUsers(groupId, userId);
          await sendGroupMessagePushNotifications(memberUsers, {
            senderUserId: userId,
            senderUsername,
            groupId,
            groupName: groupMetadata.name,
            logWarning: (err, memberUserId) => {
              request.log.warn(
                { err, userId: memberUserId },
                "push notification failed for group message"
              );
            },
          });
        }

        return reply.code(202).send(
          SendGroupMessageResponseSchema.parse({
            version: MESSAGE_PROTOCOL_VERSION,
            ok: true,
            serverMessageId: persistedGroupMessage.id,
            createdAt: new Date(persistedGroupMessage.created_at).toISOString(),
            cryptoEpoch: persistedGroupMessage.crypto_epoch,
          })
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (!statusCode) throw err;
        return reply.code(statusCode).send(
          (err as { payload?: { error: string } }).payload ?? { error: "Bad request" }
        );
      }
    }
  );

  fastify.get<{
    Params: { groupId: string };
    Querystring: { before?: string; limit?: string };
  }>(
    "/:groupId/messages",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { groupId } = request.params;
      const { sub: userId } = request.auth;
      const parsedLimit = Number.parseInt(request.query.limit ?? "50", 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 200)
        : 50;
      const beforeRaw = request.query.before;
      let before: string | undefined;
      if (beforeRaw !== undefined) {
        const beforeMs = Date.parse(beforeRaw);
        if (Number.isNaN(beforeMs)) {
          return reply.code(400).send({ error: "Invalid 'before' timestamp" });
        }
        before = new Date(beforeMs).toISOString();
      }

      const membership = await query<{ group_id: string }>(
        "SELECT group_id FROM group_members WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL",
        [groupId, userId]
      );
      if (membership.length === 0) {
        return reply.code(403).send({ error: "Not a group member" });
      }

      const messages = await query<{
        id: string;
        sender_device_id: string;
        distribution_id: string;
        chain_id: number;
        message_id: number;
        message_type: GroupHistoryMessage["messageType"];
        ciphertext: string;
        signature: string;
        created_at: string;
        aead_version: number;
        crypto_epoch: number;
      }>(
        before
          ? `SELECT id, sender_device_id, distribution_id, chain_id, message_id,
                    message_type, ciphertext, signature, created_at, aead_version,
                    crypto_epoch
             FROM group_messages
             WHERE group_id = $1 AND created_at < $2
             ORDER BY created_at DESC LIMIT $3`
          : `SELECT id, sender_device_id, distribution_id, chain_id, message_id,
                    message_type, ciphertext, signature, created_at, aead_version,
                    crypto_epoch
             FROM group_messages
             WHERE group_id = $1
             ORDER BY created_at DESC LIMIT $2`,
        before ? [groupId, before, limit] : [groupId, limit]
      );

      const response = {
        version: GROUPS_PROTOCOL_VERSION,
        messages: messages.map((message) => ({
          id: message.id,
          senderDeviceId: message.sender_device_id,
          distributionId: message.distribution_id,
          cryptoEpoch: message.crypto_epoch,
          chainId: message.chain_id,
          messageId: message.message_id,
          messageType: message.message_type,
          ciphertext: message.ciphertext,
          signature: message.signature,
          createdAt: new Date(message.created_at).toISOString(),
          aeadVersion: message.aead_version,
        })),
      } satisfies GroupHistoryResponseWire;

      return GroupHistoryResponseSchema.parse(response);
    }
  );
}
