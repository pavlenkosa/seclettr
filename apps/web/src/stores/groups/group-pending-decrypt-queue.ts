import { loadDecrypted, storeEncrypted } from "@seclettr/crypto";
import { useAuthStore } from "@/stores/auth";
import type { ImportedGroupSenderKeyDistribution } from "@/lib/group-sender-key-events";
import type { GroupHistoryMessageEnvelope } from "./types";

const GROUP_PENDING_DECRYPT_QUEUE_PREFIX = "group-pending-decrypt-queue:v1:";
const MAX_PENDING_GROUP_DECRYPT_ITEMS = 500;

export interface GroupPendingDecryptQueueItem {
  messageKey: string;
  groupId: string;
  envelope: GroupHistoryMessageEnvelope;
  createdAt: number;
  lastReason: "missing_sender_key";
}

type GroupPendingDecryptQueueStore = Record<string, GroupPendingDecryptQueueItem>;

let persistChain: Promise<void> = Promise.resolve();

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
  return `${GROUP_PENDING_DECRYPT_QUEUE_PREFIX}${deviceId}`;
}

function sanitizeQueueStore(
  store: GroupPendingDecryptQueueStore
): GroupPendingDecryptQueueStore {
  const entries = Object.entries(store)
    .filter(([, item]) => item?.lastReason === "missing_sender_key")
    .sort((left, right) => left[1].createdAt - right[1].createdAt)
    .slice(-MAX_PENDING_GROUP_DECRYPT_ITEMS);
  return Object.fromEntries(entries);
}

export function isPendingGroupDecryptItemForDistribution(
  item: GroupPendingDecryptQueueItem,
  distribution: ImportedGroupSenderKeyDistribution
): boolean {
  return (
    item.groupId === distribution.groupId &&
    item.envelope.senderDeviceId === distribution.senderDeviceId &&
    item.envelope.distributionId === distribution.distributionId
  );
}

export async function persistPendingGroupDecryptItem(
  item: GroupPendingDecryptQueueItem
): Promise<void> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current =
      (await loadDecrypted<GroupPendingDecryptQueueStore>(storageKey, key)) ?? {};
    current[item.messageKey] = item;
    await storeEncrypted(storageKey, key, sanitizeQueueStore(current));
  });
}

export async function removePendingGroupDecryptItem(
  messageKey: string
): Promise<void> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current = await loadDecrypted<GroupPendingDecryptQueueStore>(
      storageKey,
      key
    );
    if (!current || !(messageKey in current)) return;
    delete current[messageKey];
    await storeEncrypted(storageKey, key, sanitizeQueueStore(current));
  });
}

export async function loadAllPendingGroupDecryptItems(): Promise<
  GroupPendingDecryptQueueItem[]
> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return [];
  const key = getStoreKey(deviceId);
  const current = await loadDecrypted<GroupPendingDecryptQueueStore>(
    storageKey,
    key
  );
  if (!current) return [];
  return Object.values(sanitizeQueueStore(current)).sort(
    (left, right) => left.createdAt - right.createdAt
  );
}
