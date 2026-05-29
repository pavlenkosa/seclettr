import { loadDecrypted, storeEncrypted } from "@seclettr/crypto";
import type { SerializedRatchetState } from "@seclettr/crypto";
import { useAuthStore } from "@/stores/auth";

const OUTBOUND_QUEUE_PREFIX = "outbound-queue:v1:";

export interface OutboundQueueDeviceEnvelope {
  recipientDeviceId: string;
  ciphertext: string;
  type: "text" | "attachment" | "sender_key_distribution";
  attachmentId?: string;
  x3dhHeader?: {
    ephemeralKey: string;
    signedPreKeyId: number;
    oneTimePreKeyId?: number;
    senderIdentityKey: string;
  };
  oneTimePreKeyReservationToken?: string;
}

export interface OutboundQueueSessionCommit {
  recipientDeviceId: string;
  state: SerializedRatchetState;
}

export interface OutboundQueueItem {
  clientMessageId: string;
  recipientUserId: string;
  messageType: "text" | "attachment" | "sender_key_distribution";
  envelopes: OutboundQueueDeviceEnvelope[];
  sessionCommits?: OutboundQueueSessionCommit[];
  createdAt: number;
  retryCount: number;
}

type OutboundQueueStore = Record<string, OutboundQueueItem>;

let persistChain: Promise<void> = Promise.resolve();

/** Reset the serial write chain on logout so in-flight writes from a previous
 *  session cannot complete using a new session's storage key. */
export function resetOutboundPersistChain(): void {
  persistChain = Promise.resolve();
}

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = persistChain.then(task, task);
  persistChain = run.catch(() => undefined);
  return run;
}

function getStorageKey(): CryptoKey | null {
  return useAuthStore.getState().storageKey;
}

function getMyDeviceId(): string | null {
  return useAuthStore.getState().deviceId;
}

function getStoreKey(deviceId: string): string {
  return `${OUTBOUND_QUEUE_PREFIX}${deviceId}`;
}

/**
 * Persist an encrypted outbound envelope set before the HTTP delivery attempt.
 * Must be called after all per-device ratchet operations complete and before
 * the advanced ratchet sessions are saved or POSTed. The optional session
 * commits make a crash between queue persistence and session persistence
 * recoverable without re-encrypting plaintext.
 */
export async function persistOutboundQueueItem(
  item: OutboundQueueItem
): Promise<void> {
  const sk = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!sk || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current = (await loadDecrypted<OutboundQueueStore>(sk, key)) ?? {};
    current[item.clientMessageId] = item;
    await storeEncrypted(sk, key, current);
  });
}

/**
 * Remove a queue item after the server has accepted delivery.
 * Safe to call even if the item is already absent.
 */
export async function removeOutboundQueueItem(
  clientMessageId: string
): Promise<void> {
  const sk = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!sk || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current = await loadDecrypted<OutboundQueueStore>(sk, key);
    if (!current || !(clientMessageId in current)) return;
    delete current[clientMessageId];
    await storeEncrypted(sk, key, current);
  });
}

/**
 * Load a specific outbound queue item by clientMessageId, or null if absent.
 */
export async function loadOutboundQueueItem(
  clientMessageId: string
): Promise<OutboundQueueItem | null> {
  const sk = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!sk || !deviceId) return null;
  const key = getStoreKey(deviceId);
  const current = await loadDecrypted<OutboundQueueStore>(sk, key);
  return current?.[clientMessageId] ?? null;
}

/**
 * Increment and persist the retry counter for a queued item.
 * Returns the new count, or 0 if the item is no longer present.
 */
export async function incrementOutboundRetryCount(
  clientMessageId: string
): Promise<number> {
  const sk = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!sk || !deviceId) return 0;
  const key = getStoreKey(deviceId);
  let newCount = 0;
  await enqueueWrite(async () => {
    const current = (await loadDecrypted<OutboundQueueStore>(sk, key)) ?? {};
    const item = current[clientMessageId];
    if (!item) return;
    item.retryCount = (item.retryCount ?? 0) + 1;
    newCount = item.retryCount;
    await storeEncrypted(sk, key, current);
  });
  return newCount;
}

/**
 * Load all pending outbound items sorted oldest-first.
 * Used on startup / reconnect to resume delivery.
 */
export async function loadAllPendingOutboundItems(): Promise<
  OutboundQueueItem[]
> {
  const sk = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!sk || !deviceId) return [];
  const key = getStoreKey(deviceId);
  const current = await loadDecrypted<OutboundQueueStore>(sk, key);
  if (!current) return [];
  return Object.values(current).sort((a, b) => a.createdAt - b.createdAt);
}
