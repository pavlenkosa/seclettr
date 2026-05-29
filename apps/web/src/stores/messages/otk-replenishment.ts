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

// In-flight guard: prevents two concurrent prekeys.low WS events from generating
// the same OTK ID range and uploading duplicates to the server.
let replenishInFlight: Promise<void> | null = null;

function getStorageKey() {
  return useAuthStore.getState().storageKey;
}

function getMyDeviceId() {
  return useAuthStore.getState().deviceId;
}

export function replenishOtksIfNeeded(remaining: number): Promise<void> {
  if (replenishInFlight) return replenishInFlight;
  replenishInFlight = doReplenish(remaining).finally(() => {
    replenishInFlight = null;
  });
  return replenishInFlight;
}

async function doReplenish(remaining: number): Promise<void> {
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

  // Save private keys locally BEFORE publishing public keys to the server.
  // If the server POST succeeds but the local write fails, the server would have
  // public keys whose private halves the client no longer has — any X3DH using
  // those keys would fail with permanent message loss. Persisting first means a
  // crash after the write but before the POST leaves unused private keys locally
  // (harmless) rather than orphaned public keys server-side (fatal).
  const merged = {
    ...deviceKeys,
    otkPrivateKeys: { ...deviceKeys.otkPrivateKeys },
  };
  for (const otk of newOtks) {
    merged.otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
  }
  await storeEncrypted(sk, `device:${myDeviceId}:keys`, merged);

  await api.post("/devices/prekeys", {
    oneTimePreKeys: newOtks.map((otk) => ({
      id: otk.id,
      publicKey: toBase64Url(otk.publicKey),
    })),
  });

  logger.debug("[OTK] replenished", OTK_REPLENISH_BATCH, "new keys");
}
