import { storeEncrypted, loadDecrypted } from "@seclettr/crypto";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { trimTrackedMessageIds } from "./inbound-tracking";
import { useAuthStore } from "@/stores/auth";
import type { Conversation, Message } from "./types";

export const MAX_PROCESSED_MESSAGE_IDS = 5_000;

/**
 * Per-conversation in-memory cap. Appends trim from the head (oldest dropped,
 * newest kept). This only bounds the live array: the persisted record is NOT
 * capped and must not shrink — persistConversations unions the in-memory
 * (trimmed) array with the previously persisted array by message id
 * (union-on-persist), so messages already in storage survive in-memory trims.
 * The restore path is uncapped by design; restored history is merged with the
 * live state on load (see createMessagesHistoryRuntime).
 */
export const MAX_MESSAGES_PER_CONVERSATION = 500;

/**
 * Keep the newest messages up to the per-conversation cap. Trimming is a
 * display/memory bound only — persisted history is preserved via
 * union-on-persist in persistConversations, never dropped by this cap.
 */
export function trimMessagesToCap(messages: readonly Message[]): Message[] {
  if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) {
    return [...messages];
  }
  return messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
}

const CONVERSATIONS_STORAGE_PREFIX = "conversations:v1:";
const PROCESSED_MESSAGE_IDS_STORAGE_PREFIX = "processed-message-ids:v1:";
const PENDING_ACK_MESSAGE_IDS_STORAGE_PREFIX = "pending-ack-message-ids:v1:";
const QUARANTINED_MESSAGE_IDS_STORAGE_PREFIX = "quarantined-message-ids:v1:";
const PENDING_READ_RECEIPT_MESSAGE_IDS_STORAGE_PREFIX =
  "pending-read-receipt-message-ids:v1:";
let conversationPersistQueue: Promise<void> = Promise.resolve();

/** Reset the serial persist queue on logout so in-flight writes from a previous
 *  session cannot complete using a new session's storage key. */
export function resetConversationPersistQueue(): void {
  conversationPersistQueue = Promise.resolve();
}

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

/**
 * Union restored (previously persisted) messages with the live in-memory
 * messages by message id. Live entries win for shared ids (e.g. optimistic
 * message updated to a final status); ids that no longer exist in the live
 * array (e.g. a trimmed optimistic send removed from memory) are kept from the
 * persisted record so history never shrinks. Ordering source of truth matches
 * mergeConversationMessages: timestamp ascending, ties broken by id.
 */
function unionMessagesBySnapshotId(
  restoredMessages: readonly Message[] | undefined,
  liveMessages: readonly Message[]
): Message[] {
  const restored = Array.isArray(restoredMessages) ? restoredMessages : [];
  const mergedById = new Map<string, Message>();  for (const message of restored) {
    if (message && typeof message.id === "string") {
      mergedById.set(message.id, message);
    }
  }
  const live = Array.isArray(liveMessages) ? liveMessages : [];
  for (const message of live) {
    if (message && typeof message.id === "string") {
      mergedById.set(message.id, message);
    }
  }
  return [...mergedById.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.id.localeCompare(right.id);
  });
}

function unionPersistedConversations(
  restored: Record<string, Conversation>,
  live: Record<string, Conversation>
): Record<string, Conversation> {
  const merged: Record<string, Conversation> = {};
  for (const userId of Object.keys(restored)) {
    const restoredConversation = restored[userId]!;
    const liveConversation = live[userId];
    merged[userId] = {
      ...restoredConversation,
      messages: unionMessagesBySnapshotId(
        restoredConversation.messages,
        liveConversation?.messages ?? []
      ),
    };
  }
  for (const [userId, liveConversation] of Object.entries(live)) {
    if (userId in merged) continue;
    merged[userId] = liveConversation;
  }
  return merged;
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
  // Read-before-write: union with the previously persisted record so the
  // in-memory per-conversation cap (trimMessagesToCap) can never permanently
  // shrink stored history. Untrusted storage shape is validated defensively.
  const persisted = await loadDecrypted<Record<string, Conversation>>(
    sk,
    storageKey
  );
  const nextConversations =
    persisted && typeof persisted === "object" && !Array.isArray(persisted)
      ? unionPersistedConversations(persisted, sanitizedConversations)
      : sanitizedConversations;
  await enqueueConversationPersist(() =>
    storeEncrypted(sk, storageKey, nextConversations)
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
