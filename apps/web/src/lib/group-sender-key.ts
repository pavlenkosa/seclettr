import {
  senderKeyEncrypt,
  toBase64Url,
} from "@seclettr/crypto";
import {
  type PlaintextAttachmentMessage,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import { type GroupTextContent } from "@/lib/group-message-codec";
import {
  createGroupSenderKeyDecryptRuntime,
  serializeRemoteSenderKeyState,
  type GroupAttachmentDecryptResult,
  type GroupCipherEnvelope,
  type GroupHistoryReplayContext,
  type GroupTextDecryptResult,
} from "./group-sender-key-decrypt-runtime";
import { createGroupSenderKeyDistributionRuntime } from "./group-sender-key-distribution-runtime";
import { createGroupSenderKeyLockRuntime } from "./group-sender-key-lock-runtime";
import {
  createGroupSenderKeyLocalRuntime,
  type LocalSenderKeyRecord,
} from "./group-sender-key-local-runtime";

const LOCAL_SENDER_KEY_PREFIX = "group:sender-key:local:v1:";
const REMOTE_SENDER_KEY_PREFIX = "group:sender-key:remote:v1:";
const CURRENT_LOCAL_SENDER_KEY_RECORD_VERSION = 2;
const senderKeyLockRuntime = createGroupSenderKeyLockRuntime(
  LOCAL_SENDER_KEY_PREFIX
);

export type { LocalSenderKeyRecord } from "./group-sender-key-local-runtime";
export type {
  GroupAttachmentDecryptResult,
  GroupCipherEnvelope,
  GroupDecryptFailureReason,
  GroupHistoryReplayContext,
  GroupTextDecryptResult,
} from "./group-sender-key-decrypt-runtime";

function remoteSenderKeyStorageKey(groupId: string, senderDeviceId: string, distributionId: string): string {
  return `${REMOTE_SENDER_KEY_PREFIX}${groupId}:${senderDeviceId}:${distributionId}`;
}
const groupSenderKeyLocalRuntime = createGroupSenderKeyLocalRuntime({
  localSenderKeyPrefix: LOCAL_SENDER_KEY_PREFIX,
  currentLocalSenderKeyRecordVersion:
    CURRENT_LOCAL_SENDER_KEY_RECORD_VERSION,
  withLocalSenderKeyLock: senderKeyLockRuntime.withLocalSenderKeyLock,
  remoteSenderKeyStorageKey,
  serializeRemoteState: serializeRemoteSenderKeyState,
});
const groupSenderKeyDistributionRuntime =
  createGroupSenderKeyDistributionRuntime({
    remoteSenderKeyStorageKey,
  });
const groupSenderKeyDecryptRuntime = createGroupSenderKeyDecryptRuntime({
  remoteSenderKeyStorageKey,
});

export async function ensureLocalSenderKeyRecord(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string
): Promise<LocalSenderKeyRecord> {
  return groupSenderKeyLocalRuntime.ensureLocalSenderKeyRecord(
    storageKey,
    groupId,
    senderDeviceId
  );
}

export async function ensureLocalSenderKeyRecordForMemberDevices(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  activeRecipientDeviceIds: string[]
): Promise<LocalSenderKeyRecord> {
  return groupSenderKeyLocalRuntime.ensureLocalSenderKeyRecordForMemberDevices(
    storageKey,
    groupId,
    senderDeviceId,
    activeRecipientDeviceIds
  );
}

export async function markSenderKeyDistributedToDevices(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  distributionId: string,
  deviceIds: string[]
): Promise<void> {
  await groupSenderKeyLocalRuntime.markSenderKeyDistributedToDevices(
    storageKey,
    groupId,
    senderDeviceId,
    distributionId,
    deviceIds
  );
}

export function buildSenderKeyDistributionPayload(
  record: LocalSenderKeyRecord,
  groupId: string,
  senderDeviceId: string
): PlaintextSenderKeyDistributionMessage {
  return groupSenderKeyDistributionRuntime.buildSenderKeyDistributionPayload(
    record,
    groupId,
    senderDeviceId
  );
}

export async function importSenderKeyDistribution(
  storageKey: CryptoKey,
  rawPayload: unknown
): Promise<PlaintextSenderKeyDistributionMessage> {
  return groupSenderKeyDistributionRuntime.importSenderKeyDistribution(
    storageKey,
    rawPayload
  );
}

export async function encryptGroupTextEnvelope(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  text: string,
  reply?: { id: string; snippet: string }
): Promise<GroupCipherEnvelope> {
  return senderKeyLockRuntime.withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
    const record = await groupSenderKeyLocalRuntime.loadOrCreateLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        type: "text",
        text,
        ...(reply ? { replyToId: reply.id, replySnippet: reply.snippet } : {}),
      })
    );
    const { message, newState } = await senderKeyEncrypt(
      record.state,
      record.distributionId,
      plaintext
    );

    const nextRecord: LocalSenderKeyRecord = {
      ...record,
      state: newState,
    };
    await groupSenderKeyLocalRuntime.saveLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId,
      nextRecord
    );

    return {
      groupId,
      senderDeviceId,
      distributionId: message.distributionId,
      chainId: message.chainId,
      messageId: message.messageId,
      ciphertext: toBase64Url(message.ciphertext),
      signature: toBase64Url(message.signature),
      aeadVersion: message.aeadVersion,
    };
  });
}

export async function encryptGroupAttachmentEnvelope(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  attachmentPayload: PlaintextAttachmentMessage
): Promise<GroupCipherEnvelope> {
  return senderKeyLockRuntime.withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
    const record = await groupSenderKeyLocalRuntime.loadOrCreateLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ v: 1, type: "attachment", ...attachmentPayload })
    );
    const { message, newState } = await senderKeyEncrypt(
      record.state,
      record.distributionId,
      plaintext
    );

    const nextRecord: LocalSenderKeyRecord = { ...record, state: newState };
    await groupSenderKeyLocalRuntime.saveLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId,
      nextRecord
    );

    return {
      groupId,
      senderDeviceId,
      distributionId: message.distributionId,
      chainId: message.chainId,
      messageId: message.messageId,
      ciphertext: toBase64Url(message.ciphertext),
      signature: toBase64Url(message.signature),
      aeadVersion: message.aeadVersion,
    };
  });
}

export async function decryptGroupAttachmentEnvelopeResult(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<GroupAttachmentDecryptResult> {
  return groupSenderKeyDecryptRuntime.decryptGroupAttachmentEnvelopeResult(
    storageKey,
    envelope
  );
}

export async function decryptGroupAttachmentEnvelope(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<PlaintextAttachmentMessage | null> {
  return groupSenderKeyDecryptRuntime.decryptGroupAttachmentEnvelope(
    storageKey,
    envelope
  );
}

export async function decryptGroupTextEnvelopeResult(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<GroupTextDecryptResult> {
  return groupSenderKeyDecryptRuntime.decryptGroupTextEnvelopeResult(
    storageKey,
    envelope
  );
}

export async function decryptGroupTextEnvelope(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<GroupTextContent | null> {
  return groupSenderKeyDecryptRuntime.decryptGroupTextEnvelope(
    storageKey,
    envelope
  );
}

export async function decryptGroupTextEnvelopeForHistory(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope,
  replay: GroupHistoryReplayContext
): Promise<GroupTextContent | null> {
  return groupSenderKeyDecryptRuntime.decryptGroupTextEnvelopeForHistory(
    storageKey,
    envelope,
    replay
  );
}

export async function decryptGroupTextEnvelopeForHistoryResult(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope,
  replay: GroupHistoryReplayContext
): Promise<GroupTextDecryptResult> {
  return groupSenderKeyDecryptRuntime.decryptGroupTextEnvelopeForHistoryResult(
    storageKey,
    envelope,
    replay
  );
}

export function createGroupHistoryReplayContext(): GroupHistoryReplayContext {
  return groupSenderKeyDecryptRuntime.createGroupHistoryReplayContext();
}

export async function flushGroupHistoryReplayContext(
  storageKey: CryptoKey,
  replay: GroupHistoryReplayContext
): Promise<void> {
  await groupSenderKeyDecryptRuntime.flushGroupHistoryReplayContext(
    storageKey,
    replay
  );
}
