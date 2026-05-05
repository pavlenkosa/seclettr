import { api } from "@/lib/api";
import {
  decodeGroupTextCiphertext,
  GROUP_MESSAGE_UNREADABLE,
  type GroupTextContent,
} from "@/lib/group-message-codec";
import {
  buildSenderKeyDistributionPayload,
  decryptGroupAttachmentEnvelopeResult,
  decryptGroupTextEnvelopeForHistoryResult,
  decryptGroupTextEnvelopeResult,
  ensureLocalSenderKeyRecord,
  ensureLocalSenderKeyRecordForMemberDevices,
  markSenderKeyDistributedToDevices,
  type GroupHistoryReplayContext,
  type LocalSenderKeyRecord,
} from "@/lib/group-sender-key";
import {
  sanitizeDisplayText,
  sanitizeDisplayTextOrFallback,
} from "@/lib/display-text";
import {
  GROUPS_PROTOCOL_VERSION,
  GroupResponseSchema,
  safeParseVersionedWire,
  type GroupHistoryMessage,
  type PlaintextAttachmentMessage,
} from "@seclettr/protocol";
import type {
  GroupMember,
  GroupChatMessage,
  GroupChat,
  GroupDetailsDto,
  GroupHistoryMessageEnvelope,
} from "./types";

interface SendGroupSenderKeyDistributionOptions {
  prefetchedDevices?: Array<{
    deviceId: string;
    identityKeyPublic: string;
  }>;
}

type SendGroupSenderKeyDistribution = (
  recipientUserId: string,
  payload: ReturnType<typeof buildSenderKeyDistributionPayload>,
  options?: SendGroupSenderKeyDistributionOptions
) => Promise<string[]>;

export const GROUP_UNKNOWN_SENDER_LABEL = "Participant";
const GROUP_LABEL_REFRESH_IN_FLIGHT = new Set<string>();

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

export function formatUnknownGroupName(groupId: string): string {
  return `Group ${groupId.slice(0, 8)}`;
}

function sanitizeGroupMember(member: GroupMember): GroupMember {
  return {
    ...member,
    username: sanitizeDisplayTextOrFallback(member.username, member.userId),
  };
}

export function formatSenderLabel(
  senderDeviceId: string,
  isOwn: boolean,
  memberDeviceLabels?: Record<string, string>
): string {
  if (isOwn) return "You";
  const mapped = sanitizeDisplayText(memberDeviceLabels?.[senderDeviceId]);
  if (mapped) return `@${mapped}`;
  return GROUP_UNKNOWN_SENDER_LABEL;
}

export function scheduleGroupLabelRefresh(
  groupId: string,
  refreshGroup: (groupId: string) => Promise<void>
): void {
  if (!groupId || GROUP_LABEL_REFRESH_IN_FLIGHT.has(groupId)) return;
  GROUP_LABEL_REFRESH_IN_FLIGHT.add(groupId);
  void refreshGroup(groupId).finally(() => {
    GROUP_LABEL_REFRESH_IN_FLIGHT.delete(groupId);
  });
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

interface GroupMessageContext {
  readonly senderLabel: string;
  readonly timestamp: number;
  readonly isOwn: boolean;
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

async function toGroupAttachmentMessage(
  groupId: string,
  envelope: GroupHistoryMessageEnvelope,
  context: GroupMessageContext,
  storageKey: CryptoKey | null
): Promise<GroupMessageMappingResult> {
  if (!storageKey) {
    // No storageKey - key unavailable, message is unreadable but not a crypto failure.
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

export async function fetchGroupDetails(
  groupId: string
): Promise<GroupDetailsDto | null> {
  try {
    const raw = await api.get<unknown>(`/groups/${encodeURIComponent(groupId)}`);
    const parsed = safeParseVersionedWire(GroupResponseSchema, raw, GROUPS_PROTOCOL_VERSION);
    if (!parsed.success) {
      return null;
    }
    return parsed.data as GroupDetailsDto;
  } catch {
    return null;
  }
}

export async function fetchGroupMemberDeviceLabels(
  groupId: string,
  members: GroupMember[]
): Promise<Record<string, string>> {
  const memberDevices = await api.getGroupMemberDevices(groupId);
  const usernames = new Map(
    members.map((member) => [
      member.userId,
      sanitizeDisplayTextOrFallback(member.username, member.userId),
    ])
  );
  const labels: Record<string, string> = {};
  for (const member of memberDevices) {
    const safeUsername = usernames.get(member.userId);
    if (!safeUsername) continue;
    for (const device of member.devices) {
      labels[device.deviceId] = safeUsername;
    }
  }
  return labels;
}

async function fetchGroupMemberDeviceMap(
  groupId: string
): Promise<
  Record<string, Array<{ deviceId: string; identityKeyPublic: string }>>
> {
  const members = await api.getGroupMemberDevices(groupId);
  const map: Record<
    string,
    Array<{ deviceId: string; identityKeyPublic: string }>
  > = {};
  for (const member of members) {
    map[member.userId] = member.devices.map((device) => ({
      deviceId: device.deviceId,
      identityKeyPublic: device.identityKeyPublic,
    }));
  }
  return map;
}

export async function ensureSenderKeyDistributedToGroupMembers(
  storageKey: CryptoKey,
  groupId: string,
  myUserId: string,
  myDeviceId: string,
  _members: GroupMember[],
  sendSenderKeyDistribution: SendGroupSenderKeyDistribution
): Promise<LocalSenderKeyRecord> {
  const batchMemberDevices = await fetchGroupMemberDeviceMap(groupId);
  const recipientEntries = Object.entries(batchMemberDevices)
    .filter(([memberUserId]) => memberUserId !== myUserId)
    .map(([memberUserId, devices]) => [
      memberUserId,
      devices.filter((device) => device.deviceId !== myDeviceId),
    ] as const)
    .filter(([, devices]) => devices.length > 0);
  const activeRecipientDeviceIds = recipientEntries.flatMap(([, devices]) =>
    devices.map((device) => device.deviceId)
  );

  let record = await ensureLocalSenderKeyRecordForMemberDevices(
    storageKey,
    groupId,
    myDeviceId,
    activeRecipientDeviceIds
  );
  let payload = buildSenderKeyDistributionPayload(record, groupId, myDeviceId);
  const forceRedistributeCurrentKey = record.formatVersion < 2;

  for (const [memberUserId, memberDevices] of recipientEntries) {
    const memberDeviceIds = memberDevices.map((device) => device.deviceId);
    const missingDeviceIds = forceRedistributeCurrentKey
      ? memberDeviceIds
      : memberDeviceIds.filter(
          (deviceId) => !record.distributedToDeviceIds.includes(deviceId)
        );
    if (missingDeviceIds.length === 0) continue;

    const deliveredDeviceIds = await sendSenderKeyDistribution(
      memberUserId,
      payload,
      {
        prefetchedDevices: memberDevices,
      }
    );
    const deliveredMissing = deliveredDeviceIds.filter((deviceId) =>
      missingDeviceIds.includes(deviceId)
    );
    if (deliveredMissing.length === 0) {
      throw new Error(
        `Sender-key distribution failed for member ${memberUserId}`
      );
    }

    await markSenderKeyDistributedToDevices(
      storageKey,
      groupId,
      myDeviceId,
      record.distributionId,
      deliveredMissing
    );
    record = await ensureLocalSenderKeyRecord(storageKey, groupId, myDeviceId);
    payload = buildSenderKeyDistributionPayload(record, groupId, myDeviceId);
  }

  return record;
}

export function toGroupChat(
  detail: GroupDetailsDto,
  existing?: GroupChat
): GroupChat {
  const safeMembers = detail.members.map(sanitizeGroupMember);
  const memberDeviceLabels =
    detail.memberDeviceLabels ?? existing?.memberDeviceLabels ?? {};
  const messages = (existing?.messages ?? []).map((message) => {
    if (message.isOwn) return message;
    return {
      ...message,
      senderLabel: formatSenderLabel(
        message.senderDeviceId,
        false,
        memberDeviceLabels
      ),
    };
  });

  return {
    groupId: detail.groupId,
    name: sanitizeDisplayTextOrFallback(
      detail.name,
      formatUnknownGroupName(detail.groupId)
    ),
    createdAt: detail.createdAt,
    cryptoEpoch: detail.cryptoEpoch ?? existing?.cryptoEpoch ?? 1,
    members: safeMembers,
    memberDeviceLabels,
    messages,
    lastMessageAt: existing?.lastMessageAt ?? parseTimestamp(detail.createdAt),
    unreadCount: existing?.unreadCount ?? 0,
    historyLoaded: existing?.historyLoaded ?? false,
  };
}
