/**
 * media-key — group-call media key type definitions, generation, and transport crypto.
 *
 * Owns:
 *   - LocalGroupCallMediaKey / ReceivedGroupCallMediaKey type definitions
 *   - createLocalGroupCallMediaKey — generates a random AES-256-GCM key with epoch + UUID
 *   - encryptGroupCallMediaKeyForDevice — seals the key bytes into a versioned JSON
 *     envelope with libsodium crypto_box_seal using the recipient's identity DH key
 *   - decryptGroupCallMediaKeyFromSignal — unseals and validates an incoming WS signal
 *     envelope; supports both the legacy raw-32-byte format and the versioned JSON format
 *   - shouldReplaceReceivedGroupCallMediaKey — determines if a newly received key supersedes
 *     the currently held key for the same sender device (epoch then sentAt ordering)
 *
 * Does not own key delivery scheduling (see media-key-delivery.ts), ACK tracking
 * (see media-key-ack-proof.ts), or frame-level encryption (see frame-crypto.ts).
 */
import { ensureSodium, fromBase64Url, toBase64Url, type KeyPair } from "@seclettr/crypto";
import type { GroupCallMediaKeyAlgorithm, WsServerMessage } from "@seclettr/protocol";

export interface LocalGroupCallMediaKey {
  epoch: number;
  keyId: string;
  algorithm: GroupCallMediaKeyAlgorithm;
  keyBytes: Uint8Array;
}

export interface ReceivedGroupCallMediaKey {
  senderUserId: string;
  senderDeviceId: string;
  targetDeviceId: string;
  epoch: number;
  keyId: string;
  algorithm: GroupCallMediaKeyAlgorithm;
  keyBytes: Uint8Array;
  sentAt: string;
}

interface VersionedGroupCallMediaKeyEnvelope {
  version: 1;
  callId: string;
  senderUserId: string;
  senderDeviceId: string;
  targetDeviceId: string;
  epoch: number;
  keyId: string;
  algorithm: GroupCallMediaKeyAlgorithm;
  keyBytes: string;
}

export function createLocalGroupCallMediaKey(epoch = 1): LocalGroupCallMediaKey {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return {
    epoch,
    keyId: crypto.randomUUID(),
    algorithm: "aes-256-gcm",
    keyBytes,
  };
}

export async function encryptGroupCallMediaKeyForDevice(
  localKey: LocalGroupCallMediaKey,
  recipientIdentityKeyPublicB64: string,
  context: {
    callId: string;
    senderUserId: string;
    senderDeviceId: string;
    targetDeviceId: string;
  }
): Promise<string> {
  const sodium = await ensureSodium();
  const payload = new TextEncoder().encode(JSON.stringify({
    version: 1,
    callId: context.callId,
    senderUserId: context.senderUserId,
    senderDeviceId: context.senderDeviceId,
    targetDeviceId: context.targetDeviceId,
    epoch: localKey.epoch,
    keyId: localKey.keyId,
    algorithm: localKey.algorithm,
    keyBytes: toBase64Url(localKey.keyBytes),
  } satisfies VersionedGroupCallMediaKeyEnvelope));
  const sealed = sodium.crypto_box_seal(payload, fromBase64Url(recipientIdentityKeyPublicB64));
  return toBase64Url(sealed);
}

function decodeVersionedGroupCallMediaKeyPayload(
  plaintext: Uint8Array
): VersionedGroupCallMediaKeyEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<VersionedGroupCallMediaKeyEnvelope>;
  if (
    candidate.version !== 1 ||
    typeof candidate.callId !== "string" ||
    typeof candidate.senderUserId !== "string" ||
    typeof candidate.senderDeviceId !== "string" ||
    typeof candidate.targetDeviceId !== "string" ||
    typeof candidate.epoch !== "number" ||
    !Number.isInteger(candidate.epoch) ||
    typeof candidate.keyId !== "string" ||
    typeof candidate.algorithm !== "string" ||
    typeof candidate.keyBytes !== "string"
  ) {
    return null;
  }

  if (candidate.algorithm !== "aes-256-gcm") {
    return null;
  }

  return {
    version: 1,
    callId: candidate.callId,
    senderUserId: candidate.senderUserId,
    senderDeviceId: candidate.senderDeviceId,
    targetDeviceId: candidate.targetDeviceId,
    epoch: candidate.epoch,
    keyId: candidate.keyId,
    algorithm: candidate.algorithm,
    keyBytes: candidate.keyBytes,
  };
}

export async function decryptGroupCallMediaKeyFromSignal(
  signal: Extract<WsServerMessage, { type: "group.call.media-key" }>,
  identityDhKeyPair: KeyPair
): Promise<ReceivedGroupCallMediaKey> {
  const sodium = await ensureSodium();
  const plaintext = sodium.crypto_box_seal_open(
    fromBase64Url(signal.encryptedKey),
    identityDhKeyPair.publicKey,
    identityDhKeyPair.privateKey
  );

  if (!plaintext) {
    throw new Error("Invalid group call media key payload");
  }

  if (plaintext.length === 32) {
    return {
      senderUserId: signal.senderUserId,
      senderDeviceId: signal.senderDeviceId,
      targetDeviceId: signal.targetDeviceId,
      epoch: signal.epoch,
      keyId: signal.keyId,
      algorithm: signal.algorithm,
      keyBytes: Uint8Array.from(plaintext),
      sentAt: signal.sentAt,
    };
  }

  const versionedPayload = decodeVersionedGroupCallMediaKeyPayload(Uint8Array.from(plaintext));
  if (!versionedPayload) {
    throw new Error("Invalid group call media key payload");
  }

  if (
    versionedPayload.callId !== signal.callId ||
    versionedPayload.senderUserId !== signal.senderUserId ||
    versionedPayload.senderDeviceId !== signal.senderDeviceId ||
    versionedPayload.targetDeviceId !== signal.targetDeviceId ||
    versionedPayload.epoch !== signal.epoch ||
    versionedPayload.keyId !== signal.keyId ||
    versionedPayload.algorithm !== signal.algorithm
  ) {
    throw new Error("Group call media key metadata mismatch");
  }

  const keyBytes = fromBase64Url(versionedPayload.keyBytes);
  if (keyBytes.length !== 32) {
    throw new Error("Invalid group call media key payload");
  }

  return {
    senderUserId: signal.senderUserId,
    senderDeviceId: signal.senderDeviceId,
    targetDeviceId: signal.targetDeviceId,
    epoch: signal.epoch,
    keyId: signal.keyId,
    algorithm: signal.algorithm,
    keyBytes: keyBytes,
    sentAt: signal.sentAt,
  };
}

export function shouldReplaceReceivedGroupCallMediaKey(
  current: ReceivedGroupCallMediaKey | undefined,
  next: ReceivedGroupCallMediaKey
): boolean {
  if (!current) return true;
  if (next.epoch !== current.epoch) {
    return next.epoch > current.epoch;
  }
  if (next.keyId !== current.keyId) {
    return next.sentAt >= current.sentAt;
  }
  return next.sentAt >= current.sentAt;
}
