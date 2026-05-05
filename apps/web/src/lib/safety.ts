import {
  clearStoredSafetyVerificationRecord,
  getBrowserTrustIntegrityState,
  getStoredSafetyVerificationRecord,
  setStoredSafetyVerificationRecord,
  type BrowserTrustIntegrityState,
  type StoredSafetyVerificationRecord,
} from "@/lib/browser-trust-store";

export interface SafetyCodes {
  shortCode: string;
  fullCode: string;
  safetyHash: string;
}

export type {
  BrowserTrustIntegrityState,
  StoredSafetyVerificationRecord as SafetyVerificationRecord,
} from "@/lib/browser-trust-store";

export interface PeerDeviceSelectionInput {
  peerIdentityByDevice?: Record<string, string>;
  preferredDeviceId?: string | null;
  previousDeviceId?: string | null;
}

export async function getSafetyTrustIntegrityState(
  storageKey?: CryptoKey | null
): Promise<BrowserTrustIntegrityState> {
  return getBrowserTrustIntegrityState(storageKey);
}

export async function getSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string
): Promise<StoredSafetyVerificationRecord | null> {
  return getStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
}

export async function setSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  safetyHash: string,
  peerDeviceId?: string
): Promise<StoredSafetyVerificationRecord> {
  return setStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    safetyHash,
    peerDeviceId
  );
}

export async function clearSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string
): Promise<void> {
  await clearStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
}

/**
 * Resolve a stable default peer-device selection for safety verification.
 * Returns null when multiple peer devices exist and none is explicitly preferred.
 */
export function selectPeerDeviceId({
  peerIdentityByDevice,
  preferredDeviceId,
  previousDeviceId,
}: PeerDeviceSelectionInput): string | null {
  const entries = Object.entries(peerIdentityByDevice ?? {})
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return preferredDeviceId ?? null;
  }

  const ids = new Set(entries.map(([deviceId]) => deviceId));
  if (previousDeviceId && ids.has(previousDeviceId)) return previousDeviceId;
  if (preferredDeviceId && ids.has(preferredDeviceId)) return preferredDeviceId;
  if (entries.length === 1) return entries[0]![0];
  return null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replaceAll("-", "+").replaceAll("_", "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i)!;
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Format 32-byte hex as 8 groups of 4, separated by spaces */
export function formatFingerprint(b64url: string): string {
  const hex = bytesToHex(fromBase64Url(b64url));
  return hex.match(/.{1,4}/g)?.join(" ") ?? hex;
}

/**
 * Deterministic safety derivation:
 * SHA-256(canonical(firstUserId||firstIdentityKey||secondUserId||secondIdentityKey)).
 */
export async function computeSafetyCodes(
  myKeyB64: string,
  theirKeyB64: string,
  myUserId: string,
  theirUserId: string
): Promise<SafetyCodes> {
  const myKey = fromBase64Url(myKeyB64);
  const theirKey = fromBase64Url(theirKeyB64);
  const enc = new TextEncoder();

  const [firstId, firstKey, secondId, secondKey] =
    myUserId < theirUserId
      ? [myUserId, myKey, theirUserId, theirKey]
      : [theirUserId, theirKey, myUserId, myKey];

  const firstIdBytes = enc.encode(firstId);
  const secondIdBytes = enc.encode(secondId);

  const combined = new Uint8Array(
    firstIdBytes.length + firstKey.length + secondIdBytes.length + secondKey.length
  );
  let off = 0;
  combined.set(firstIdBytes, off); off += firstIdBytes.length;
  combined.set(firstKey, off); off += firstKey.length;
  combined.set(secondIdBytes, off); off += secondIdBytes.length;
  combined.set(secondKey, off);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  const hashBytes = new Uint8Array(digest);

  const fullGroups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = i * 2;
    const val = (hashBytes[idx]! << 8) | hashBytes[idx + 1]!;
    fullGroups.push(String(val % 100000).padStart(5, "0"));
  }

  const shortGroups: string[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = i * 2;
    const val = (hashBytes[idx]! << 8) | hashBytes[idx + 1]!;
    shortGroups.push(String(val % 10000).padStart(4, "0"));
  }

  return {
    shortCode: shortGroups.join(" "),
    fullCode: fullGroups.join(" "),
    safetyHash: bytesToHex(hashBytes.slice(0, 16)),
  };
}
