import { storeEncrypted, loadDecrypted } from "@seclettr/crypto";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { trimTrackedMessageIds } from "./inbound-tracking";
import { useAuthStore } from "@/stores/auth";
import type { Conversation } from "./types";

export const MAX_PROCESSED_MESSAGE_IDS = 5_000;

const CONVERSATIONS_STORAGE_PREFIX = "conversations:v1:";
const PROCESSED_MESSAGE_IDS_STORAGE_PREFIX = "processed-message-ids:v1:";
const PENDING_ACK_MESSAGE_IDS_STORAGE_PREFIX = "pending-ack-message-ids:v1:";
const QUARANTINED_MESSAGE_IDS_STORAGE_PREFIX = "quarantined-message-ids:v1:";
const PENDING_READ_RECEIPT_MESSAGE_IDS_STORAGE_PREFIX =
  "pending-read-receipt-message-ids:v1:";
let conversationPersistQueue: Promise<void> = Promise.resolve();

function enqueueConversationPersist(task: () => Promise<void>): Promise<void> {
  const run = conversationPersistQueue.then(task, task);
  conversationPersistQueue = run.catch(() => undefined);
  return run;
}

function getStorageKey() {
  return useAuthStore.getState().storageKey;
}

function getMyDeviceId() {
  return useAuthStore.getState().deviceId;
}

function getConversationStorageKey(): string | null {
  const deviceId = getMyDeviceId();
  if (!deviceId) return null;
  return `${CONVERSATIONS_STORAGE_PREFIX}${deviceId}`;
}

function getMessageIdSetStorageKey(prefix: string): string | null {
  const deviceId = getMyDeviceId();
  if (!deviceId) return null;
  return `${prefix}${deviceId}`;
}

export function trimMessageIds(ids: Set<string>): Set<string> {
  return trimTrackedMessageIds(ids, MAX_PROCESSED_MESSAGE_IDS);
}

export async function persistConversations(
  conversations: Record<string, Conversation>
): Promise<void> {
  const sk = getStorageKey();
  const storageKey = getConversationStorageKey();
  if (!sk || !storageKey) return;
  const sanitizedConversations = Object.fromEntries(
    Object.entries(conversations).map(([userId, conversation]) => [
      userId,
      {
        ...conversation,
        username: sanitizeDisplayTextOrFallback(conversation.username, userId),
      },
    ])
  );
  await enqueueConversationPersist(() =>
    storeEncrypted(sk, storageKey, sanitizedConversations)
  );
}

export async function restoreConversations(): Promise<Record<
  string,
  Conversation
> | null> {
  const sk = getStorageKey();
  const storageKey = getConversationStorageKey();
  if (!sk || !storageKey) return null;
  const restored = await loadDecrypted<Record<string, Conversation>>(
    sk,
    storageKey
  );
  if (!restored) return null;

  return Object.fromEntries(
    Object.entries(restored).map(([userId, conversation]) => [
      userId,
      {
        ...conversation,
        username: sanitizeDisplayTextOrFallback(conversation.username, userId),
      },
    ])
  );
}

async function persistMessageIdSet(
  storageKey: string | null,
  messageIds: Set<string>
): Promise<void> {
  const sk = getStorageKey();
  if (!sk || !storageKey) return;

  const trimmed = trimMessageIds(new Set(messageIds));
  await storeEncrypted(sk, storageKey, Array.from(trimmed));
}

async function restoreMessageIdSet(
  storageKey: string | null
): Promise<Set<string> | null> {
  const sk = getStorageKey();
  if (!sk || !storageKey) return null;

  const restored = await loadDecrypted<string[]>(sk, storageKey);
  if (!Array.isArray(restored) || restored.length === 0) {
    return null;
  }

  const sanitized = new Set<string>();
  for (const messageId of restored) {
    if (typeof messageId !== "string" || messageId.length === 0) continue;
    sanitized.add(messageId);
  }
  if (sanitized.size === 0) return null;
  return trimMessageIds(sanitized);
}

export async function persistProcessedMessageIds(
  processedMessageIds: Set<string>
): Promise<void> {
  await persistMessageIdSet(
    getMessageIdSetStorageKey(PROCESSED_MESSAGE_IDS_STORAGE_PREFIX),
    processedMessageIds
  );
}

export async function persistPendingAckMessageIds(
  pendingAckMessageIds: Set<string>
): Promise<void> {
  await persistMessageIdSet(
    getMessageIdSetStorageKey(PENDING_ACK_MESSAGE_IDS_STORAGE_PREFIX),
    pendingAckMessageIds
  );
}

export async function persistQuarantinedMessageIds(
  quarantinedMessageIds: Set<string>
): Promise<void> {
  await persistMessageIdSet(
    getMessageIdSetStorageKey(QUARANTINED_MESSAGE_IDS_STORAGE_PREFIX),
    quarantinedMessageIds
  );
}

export async function persistPendingReadReceiptMessageIds(
  pendingReadReceiptMessageIds: Set<string>
): Promise<void> {
  await persistMessageIdSet(
    getMessageIdSetStorageKey(PENDING_READ_RECEIPT_MESSAGE_IDS_STORAGE_PREFIX),
    pendingReadReceiptMessageIds
  );
}

export async function restoreProcessedMessageIds(): Promise<Set<string> | null> {
  return restoreMessageIdSet(
    getMessageIdSetStorageKey(PROCESSED_MESSAGE_IDS_STORAGE_PREFIX)
  );
}

export async function restorePendingAckMessageIds(): Promise<Set<string> | null> {
  return restoreMessageIdSet(
    getMessageIdSetStorageKey(PENDING_ACK_MESSAGE_IDS_STORAGE_PREFIX)
  );
}

export async function restoreQuarantinedMessageIds(): Promise<Set<string> | null> {
  return restoreMessageIdSet(
    getMessageIdSetStorageKey(QUARANTINED_MESSAGE_IDS_STORAGE_PREFIX)
  );
}

export async function restorePendingReadReceiptMessageIds(): Promise<Set<string> | null> {
  return restoreMessageIdSet(
    getMessageIdSetStorageKey(PENDING_READ_RECEIPT_MESSAGE_IDS_STORAGE_PREFIX)
  );
}
