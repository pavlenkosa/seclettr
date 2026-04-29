import { loadDecrypted, storeEncrypted } from "@seclettr/crypto";
import { useAuthStore } from "@/stores/auth";
import type { SendGroupMessageRequestWire } from "@seclettr/protocol";
import type { GroupChatMessage } from "./groups-store-runtime-types";

const GROUP_OUTBOUND_QUEUE_PREFIX = "group-outbound-queue:v1:";

export interface GroupOutboundQueueItem {
  localMessageId: string;
  groupId: string;
  clientMessageId: string;
  messageType: "text" | "attachment";
  payload: SendGroupMessageRequestWire;
  optimisticMessage: GroupChatMessage;
  createdAt: number;
  retryCount: number;
}

type GroupOutboundQueueStore = Record<string, GroupOutboundQueueItem>;

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
  return `${GROUP_OUTBOUND_QUEUE_PREFIX}${deviceId}`;
}

export async function persistGroupOutboundQueueItem(
  item: GroupOutboundQueueItem
): Promise<void> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current =
      (await loadDecrypted<GroupOutboundQueueStore>(storageKey, key)) ?? {};
    current[item.localMessageId] = item;
    await storeEncrypted(storageKey, key, current);
  });
}

export async function removeGroupOutboundQueueItem(
  localMessageId: string
): Promise<void> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return;
  const key = getStoreKey(deviceId);
  await enqueueWrite(async () => {
    const current = await loadDecrypted<GroupOutboundQueueStore>(storageKey, key);
    if (!current || !(localMessageId in current)) return;
    delete current[localMessageId];
    await storeEncrypted(storageKey, key, current);
  });
}

export async function loadGroupOutboundQueueItem(
  localMessageId: string
): Promise<GroupOutboundQueueItem | null> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return null;
  const key = getStoreKey(deviceId);
  const current = await loadDecrypted<GroupOutboundQueueStore>(storageKey, key);
  return current?.[localMessageId] ?? null;
}

export async function incrementGroupOutboundRetryCount(
  localMessageId: string
): Promise<number> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return 0;
  const key = getStoreKey(deviceId);
  let newCount = 0;
  await enqueueWrite(async () => {
    const current =
      (await loadDecrypted<GroupOutboundQueueStore>(storageKey, key)) ?? {};
    const item = current[localMessageId];
    if (!item) return;
    item.retryCount = (item.retryCount ?? 0) + 1;
    newCount = item.retryCount;
    await storeEncrypted(storageKey, key, current);
  });
  return newCount;
}

export async function loadAllPendingGroupOutboundItems(): Promise<
  GroupOutboundQueueItem[]
> {
  const storageKey = getStorageKey();
  const deviceId = getMyDeviceId();
  if (!storageKey || !deviceId) return [];
  const key = getStoreKey(deviceId);
  const current = await loadDecrypted<GroupOutboundQueueStore>(storageKey, key);
  if (!current) return [];
  return Object.values(current).sort((left, right) => left.createdAt - right.createdAt);
}
