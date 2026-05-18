import {
  MESSAGE_PROTOCOL_VERSION,
  type DirectMessageDelivery,
} from "@seclettr/protocol";
import type {
  DirectMessageDeliveryMeta,
} from "./messages-store-runtime-types";
import type { OutboundQueueItem } from "./outbound-queue";

/**
 * Owns pure helper logic for encrypted direct-message outbound runtime:
 * AEAD AD construction, server delivery parsing/merge, queue payload shaping,
 * and retry-limit constant. Does not own any runtime side effects, state
 * mutation, crypto session advancement, or HTTP orchestration.
 */

export const MAX_OUTBOUND_RETRIES = 5;

export function buildDirectMessageADv1(params: {
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string;
  recipientDeviceId: string;
  messageType: "text" | "attachment" | "sender_key_distribution";
}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      p: "seclettr-dm",
      v: 1,
      su: params.senderUserId,
      sd: params.senderDeviceId,
      ru: params.recipientUserId,
      rd: params.recipientDeviceId,
      mt: params.messageType,
    })
  );
}

export function parseDirectDeliveries(
  response: unknown
): DirectMessageDeliveryMeta[] | undefined {
  const deliveries = (response as { deliveries?: unknown } | null)?.deliveries;
  if (!Array.isArray(deliveries)) return undefined;

  const parsed = deliveries.flatMap((delivery): DirectMessageDeliveryMeta[] => {
    const candidate = delivery as Partial<DirectMessageDelivery>;
    if (
      typeof candidate.recipientDeviceId !== "string" ||
      typeof candidate.messageId !== "string" ||
      (candidate.status !== "created" && candidate.status !== "duplicate")
    ) {
      return [];
    }
    return [
      {
        recipientDeviceId: candidate.recipientDeviceId,
        messageId: candidate.messageId,
        status: candidate.status,
      },
    ];
  });

  return parsed.length > 0 ? parsed : undefined;
}

export function mergeDirectDeliveries(
  existing: DirectMessageDeliveryMeta[] | undefined,
  incoming: DirectMessageDeliveryMeta[] | undefined
): DirectMessageDeliveryMeta[] | undefined {
  if (!incoming || incoming.length === 0) return existing;
  const merged = new Map<string, DirectMessageDeliveryMeta>();
  for (const delivery of existing ?? []) {
    merged.set(delivery.recipientDeviceId, delivery);
  }
  for (const delivery of incoming) {
    merged.set(delivery.recipientDeviceId, delivery);
  }
  return [...merged.values()];
}

export function buildQueuedDirectPayload(item: OutboundQueueItem) {
  return {
    version: MESSAGE_PROTOCOL_VERSION,
    clientMessageId: item.clientMessageId,
    recipientUserId: item.recipientUserId,
    messages: item.envelopes.map((env) => ({
      recipientDeviceId: env.recipientDeviceId,
      ciphertext: env.ciphertext,
      type: env.type,
      attachmentId: env.attachmentId,
      x3dhHeader: env.x3dhHeader,
      oneTimePreKeyReservationToken: env.oneTimePreKeyReservationToken,
    })),
  };
}
