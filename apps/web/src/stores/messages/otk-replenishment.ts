import {
  generateOneTimePreKeys,
  loadDecrypted,
  storeEncrypted,
  toBase64Url,
} from "@seclettr/crypto";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { logger } from "@/lib/logger.js";

const OTK_REPLENISH_BATCH = 50;

function getStorageKey() {
  return useAuthStore.getState().storageKey;
}

function getMyDeviceId() {
  return useAuthStore.getState().deviceId;
}

export async function replenishOtksIfNeeded(remaining: number): Promise<void> {
  logger.debug(
    "[OTK] pool low, remaining:",
    remaining,
    "— replenishing",
    OTK_REPLENISH_BATCH
  );
  const myDeviceId = getMyDeviceId();
  if (!myDeviceId) return;
  const sk = getStorageKey();
  if (!sk) return;

  const deviceKeys = await loadDecrypted<{
    signedPreKeyId: number;
    otkPrivateKeys?: Record<number, string>;
  }>(sk, `device:${myDeviceId}:keys`);
  if (!deviceKeys) return;

  const existingIds = Object.keys(deviceKeys.otkPrivateKeys ?? {}).map(Number);
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
  const newOtks = await generateOneTimePreKeys(maxId + 1, OTK_REPLENISH_BATCH);

  await api.post("/devices/prekeys", {
    oneTimePreKeys: newOtks.map((otk) => ({
      id: otk.id,
      publicKey: toBase64Url(otk.publicKey),
    })),
  });

  const merged = {
    ...deviceKeys,
    otkPrivateKeys: { ...deviceKeys.otkPrivateKeys },
  };
  for (const otk of newOtks) {
    merged.otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
  }
  await storeEncrypted(sk, `device:${myDeviceId}:keys`, merged);
  logger.debug("[OTK] replenished", OTK_REPLENISH_BATCH, "new keys");
}
