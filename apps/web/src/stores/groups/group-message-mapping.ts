import {
  decodeGroupTextCiphertext,
  GROUP_MESSAGE_UNREADABLE,
  type GroupTextContent,
} from "@/lib/group-message-codec";
import {
  type GroupHistoryMessage,
  type PlaintextAttachmentMessage,
} from "@seclettr/protocol";
import {
  decryptGroupAttachmentEnvelopeResult,
  decryptGroupTextEnvelopeForHistoryResult,
  decryptGroupTextEnvelopeResult,
  type GroupHistoryReplayContext,
} from "@/lib/group-sender-key";
import type {
  GroupChatMessage,
  GroupHistoryMessageEnvelope,
} from "./types";
import { formatSenderLabel } from "./group-display-helpers";

/**
 * group-message-mapping — history/live group envelope normalization and message projection.
 *
 * Owns:
 *   - timestamp parsing for group history ordering
 *   - protocol/history envelope canonicalization
 *   - text/attachment decrypt result mapping into GroupChatMessage
 *   - processed-message key generation
 *   - unreadable/pending fallback message shaping
 *
 * Does not own group detail fetch, display-label refresh scheduling, or sender-key distribution.
 */

export type GroupMessageMappingResult =
  | { kind: "message"; message: GroupChatMessage }
  | {
      kind: "pending";
      reason: "missing_sender_key";
      fallbackMessage: GroupChatMessage;
    };

type GroupTextDecodeResult =
  | { kind: "decoded"; content: GroupTextContent }
  | { kind: "pending"; reason: "missing_sender_key" }
  | { kind: "failed" };

interface GroupMessageContext {
  readonly senderLabel: string;
  readonly timestamp: number;
  readonly isOwn: boolean;
}

export function parseTimestamp(createdAt: string): number {
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function canonicalizeGroupHistoryEnvelope(
  row: GroupHistoryMessage
): GroupHistoryMessageEnvelope {
  return {
    ...row,
    aeadVersion: row.aeadVersion === 1 ? 1 : 0,
    cryptoEpoch: row.cryptoEpoch ?? 1,
  };
}

function toCipherEnvelope(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope
) {
  return {
    groupId,
    senderDeviceId: envelope.senderDeviceId,
    distributionId: envelope.distributionId,
    chainId: envelope.chainId,
    messageId: envelope.messageId,
    ciphertext: envelope.ciphertext,
    signature: envelope.signature,
    aeadVersion: envelope.aeadVersion,
  };
}

function buildGroupMessageContext(
  envelope: GroupHistoryMessageEnvelope,
  myDeviceId: string | null,
  memberDeviceLabels?: Record<string, string>
): GroupMessageContext {
  const isOwn = myDeviceId !== null && envelope.senderDeviceId === myDeviceId;
  return {
    isOwn,
    timestamp: parseTimestamp(envelope.createdAt),
    senderLabel: formatSenderLabel(envelope.senderDeviceId, isOwn, memberDeviceLabels),
  };
}

function deliveredGroupMessageStatus(isOwn: boolean): GroupChatMessage["status"] {
  return isOwn ? "sent" : "delivered";
}

function unreadableGroupMessage(
  envelope: GroupHistoryMessageEnvelope,
  context: GroupMessageContext,
  status: GroupChatMessage["status"] = deliveredGroupMessageStatus(context.isOwn)
): GroupChatMessage {
  return {
    id: envelope.id,
    senderDeviceId: envelope.senderDeviceId,
    senderLabel: context.senderLabel,
    content: GROUP_MESSAGE_UNREADABLE,
    timestamp: context.timestamp,
    status,
    isOwn: context.isOwn,
    rawType: envelope.messageType,
  };
}

function attachmentGroupMessage(
  envelope: GroupHistoryMessageEnvelope,
  context: GroupMessageContext,
  attachmentPayload: PlaintextAttachmentMessage
): GroupChatMessage {
  return {
    id: envelope.id,
    senderDeviceId: envelope.senderDeviceId,
    senderLabel: context.senderLabel,
    content: attachmentPayload.fileName ?? attachmentPayload.mimeType,
    type: "attachment",
    attachment: {
      attachmentId: attachmentPayload.attachmentId,
      key: attachmentPayload.key,
      digest: attachmentPayload.digest,
      mimeType: attachmentPayload.mimeType,
      fileName: attachmentPayload.fileName,
      size: attachmentPayload.size,
      caption: attachmentPayload.caption,
      kind: attachmentPayload.kind,
      durationMs: attachmentPayload.durationMs,
      mediaGroupId: attachmentPayload.mediaGroupId,
    },
    timestamp: context.timestamp,
    status: deliveredGroupMessageStatus(context.isOwn),
    isOwn: context.isOwn,
    rawType: envelope.messageType,
  };
}

async function decodeGroupTextContent(
  storageKey: CryptoKey | null,
  groupId: string,
  envelope: GroupHistoryMessageEnvelope,
  historyReplay?: GroupHistoryReplayContext
): Promise<GroupTextDecodeResult> {
  if (storageKey) {
    const cipherEnvelope = {
      groupId,
      senderDeviceId: envelope.senderDeviceId,
      distributionId: envelope.distributionId,
      chainId: envelope.chainId,
      messageId: envelope.messageId,
      ciphertext: envelope.ciphertext,
      signature: envelope.signature,
      aeadVersion: envelope.aeadVersion,
    };
    const decrypted = historyReplay
      ? await decryptGroupTextEnvelopeForHistoryResult(
          storageKey,
          cipherEnvelope,
          historyReplay
        )
      : await decryptGroupTextEnvelopeResult(storageKey, cipherEnvelope);
    if (decrypted.ok) return { kind: "decoded", content: decrypted.content };

    const legacy = decodeGroupTextCiphertext(envelope.ciphertext);
    if (legacy) return { kind: "decoded", content: legacy };
    if (decrypted.reason === "missing_sender_key") {
      return { kind: "pending", reason: "missing_sender_key" };
    }
    return { kind: "failed" };
  }

  const legacy = decodeGroupTextCiphertext(envelope.ciphertext);
  return legacy ? { kind: "decoded", content: legacy } : { kind: "failed" };
}

async function toGroupAttachmentMessage(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope,
  context: GroupMessageContext,
  storageKey: CryptoKey | null
): Promise<GroupMessageMappingResult> {
  if (!storageKey) {
    return { kind: "message", message: unreadableGroupMessage(envelope, context) };
  }

  const decrypted = await decryptGroupAttachmentEnvelopeResult(
    storageKey,
    toCipherEnvelope(groupId, envelope)
  );

  if (decrypted.ok) {
    return {
      kind: "message",
      message: attachmentGroupMessage(envelope, context, decrypted.attachment),
    };
  }

  const fallbackMessage = unreadableGroupMessage(envelope, context, "error");
  return decrypted.reason === "missing_sender_key"
    ? { kind: "pending", reason: "missing_sender_key", fallbackMessage }
    : { kind: "message", message: fallbackMessage };
}

async function toGroupTextMessage(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope,
  context: GroupMessageContext,
  storageKey: CryptoKey | null,
  historyReplay?: GroupHistoryReplayContext
): Promise<GroupMessageMappingResult> {
  const decoded = await decodeGroupTextContent(
    storageKey,
    groupId,
    envelope,
    historyReplay
  );
  if (decoded.kind === "pending") {
    return {
      kind: "pending",
      reason: decoded.reason,
      fallbackMessage: unreadableGroupMessage(envelope, context, "error"),
    };
  }
  const decryptFailed = decoded.kind === "failed";
  const message: GroupChatMessage = {
    id: envelope.id,
    senderDeviceId: envelope.senderDeviceId,
    senderLabel: context.senderLabel,
    content:
      decoded.kind === "decoded" ? decoded.content.text : GROUP_MESSAGE_UNREADABLE,
    replyTo: decoded.kind === "decoded" && decoded.content.replyToId
      ? {
          id: decoded.content.replyToId,
          content: decoded.content.replySnippet ?? "",
        }
      : undefined,
    timestamp: context.timestamp,
    status: decryptFailed ? "error" : deliveredGroupMessageStatus(context.isOwn),
    isOwn: context.isOwn,
    rawType: envelope.messageType,
  };
  return { kind: "message", message };
}

export async function toGroupMessageResult(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope,
  myDeviceId: string | null,
  storageKey: CryptoKey | null,
  memberDeviceLabels?: Record<string, string>,
  historyReplay?: GroupHistoryReplayContext
): Promise<GroupMessageMappingResult | null> {
  const context = buildGroupMessageContext(envelope, myDeviceId, memberDeviceLabels);

  if (envelope.messageType === "attachment") {
    return toGroupAttachmentMessage(groupId, envelope, context, storageKey);
  }

  if (envelope.messageType !== "text") {
    return { kind: "message", message: unreadableGroupMessage(envelope, context) };
  }

  return toGroupTextMessage(groupId, envelope, context, storageKey, historyReplay);
}

export function toProcessedMessageKey(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope
): string {
  return `${groupId}:${envelope.id}:${envelope.senderDeviceId}:${envelope.distributionId}:${envelope.messageId}`;
}
