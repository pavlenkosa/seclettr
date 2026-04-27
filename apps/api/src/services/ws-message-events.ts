import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";
import { publishMessage } from "./redis.js";
import { resolveUserRelationshipAccess } from "./user-relationships.js";

export interface TypingSignalSender {
  userId: string;
  deviceId: string;
}

async function canExchangeTypingSignals(senderUserId: string, targetUserId: string): Promise<boolean> {
  const relationship = await resolveUserRelationshipAccess(senderUserId, targetUserId);
  return relationship.allowed;
}

export async function markMessageDelivered(
  fastify: FastifyInstance,
  messageId: string,
  recipientDeviceId: string
): Promise<void> {
  try {
    const updated = await query<{ id: string; sender_device_id: string; client_message_id: string }>(
      `UPDATE messages
       SET delivered_at = now()
       WHERE id = $1 AND recipient_device_id = $2 AND delivered_at IS NULL
       RETURNING id, sender_device_id, client_message_id`,
      [messageId, recipientDeviceId]
    );

    if (updated.length === 0) {
      fastify.log.debug({ messageId, recipientDeviceId }, "WS ack ignored: message not pending");
      return;
    }
    await publishMessage({
      type: "message.delivered",
      recipientDeviceId: updated[0]!.sender_device_id,
      messageId,
      clientMessageId: updated[0]!.client_message_id,
    });
  } catch (err) {
    fastify.log.warn({ err, messageId, recipientDeviceId }, "Failed to persist WS ack");
  }
}

export async function markMessageRead(
  fastify: FastifyInstance,
  messageId: string,
  recipientDeviceId: string,
  readerUserId: string
): Promise<void> {
  try {
    const updated = await query<{
      id: string;
      sender_device_id: string;
      client_message_id: string;
      read_at: string;
    }>(
      `UPDATE messages
       SET delivered_at = COALESCE(delivered_at, now()),
           read_at = now()
       WHERE id = $1 AND recipient_device_id = $2 AND read_at IS NULL
       RETURNING id, sender_device_id, client_message_id, read_at`,
      [messageId, recipientDeviceId]
    );

    if (updated.length === 0) {
      fastify.log.debug({ messageId, recipientDeviceId }, "WS read ignored: message not pending");
      return;
    }

    await publishMessage({
      type: "message.read",
      recipientDeviceId: updated[0]!.sender_device_id,
      messageId,
      clientMessageId: updated[0]!.client_message_id,
      readerUserId,
      readerDeviceId: recipientDeviceId,
      readAt: new Date(updated[0]!.read_at).toISOString(),
    });
  } catch (err) {
    fastify.log.warn({ err, messageId, recipientDeviceId }, "Failed to persist WS read");
  }
}

export async function replayMessageReceipts(
  fastify: FastifyInstance,
  senderDeviceId: string
): Promise<void> {
  try {
    const updates = await query<{
      id: string;
      client_message_id: string;
      recipient_device_id: string;
      reader_user_id: string;
      delivered_at: string | null;
      read_at: string | null;
    }>(
      `SELECT m.id,
              m.client_message_id,
              m.recipient_device_id,
              d.user_id AS reader_user_id,
              m.delivered_at,
              m.read_at
       FROM messages m
       JOIN devices d ON d.id = m.recipient_device_id
       WHERE m.sender_device_id = $1
         AND (m.delivered_at IS NOT NULL OR m.read_at IS NOT NULL)
         AND m.created_at > now() - interval '14 days'
       ORDER BY COALESCE(m.read_at, m.delivered_at) DESC
       LIMIT 400`,
      [senderDeviceId]
    );

    await Promise.all(
      updates.map(async (update) => {
        if (update.read_at) {
          await publishMessage({
            type: "message.read",
            recipientDeviceId: senderDeviceId,
            messageId: update.id,
            clientMessageId: update.client_message_id,
            readerUserId: update.reader_user_id,
            readerDeviceId: update.recipient_device_id,
            readAt: new Date(update.read_at).toISOString(),
          });
          return;
        }
        if (update.delivered_at) {
          await publishMessage({
            type: "message.delivered",
            recipientDeviceId: senderDeviceId,
            messageId: update.id,
            clientMessageId: update.client_message_id,
          });
        }
      })
    );
  } catch (err) {
    fastify.log.warn({ err, senderDeviceId }, "Failed to replay message receipt state");
  }
}

export async function forwardTypingSignal(
  fastify: FastifyInstance,
  sender: TypingSignalSender,
  targetUserId: string,
  signalType: "typing.start" | "typing.stop"
): Promise<void> {
  if (targetUserId === sender.userId) return;

  try {
    if (!(await canExchangeTypingSignals(sender.userId, targetUserId))) {
      fastify.log.debug(
        { senderUserId: sender.userId, targetUserId },
        "Dropped typing signal for unrelated users"
      );
      return;
    }

    const devices = await query<{ id: string }>(
      `SELECT id FROM devices WHERE user_id = $1`,
      [targetUserId]
    );

    await Promise.all(
      devices
        .filter((device) => device.id !== sender.deviceId)
        .map(async (device) => publishMessage({
          type: signalType,
          recipientDeviceId: device.id,
          senderUserId: sender.userId,
          senderDeviceId: sender.deviceId,
        }))
    );
  } catch (err) {
    fastify.log.warn({ err, senderUserId: sender.userId, targetUserId }, "Failed to forward typing signal");
  }
}
