import {
  type BrowserTrustIntegrityState,
  type StoredDeviceRegistration,
  type StoredSafetyVerificationRecord,
} from "./browser-trust-store-sanitize";
import { createBrowserTrustStorePersistenceRuntime } from "./browser-trust-store-persistence";
import { createBrowserTrustStoreVerificationRuntime } from "./browser-trust-store-verification-runtime";

const TRUST_STORE_PREFIX = "trust-store:v1";
const TRUST_STORE_KEY = `${TRUST_STORE_PREFIX}:browser`;
const REGISTRATION_ID_KEY = "seclettr.registrationId.v1";
const DEVICE_REG_PREFIX = "deviceReg:";
const SAFETY_VERIFICATION_PREFIX = "seclettr.safetyVerification.v1:";
const PEER_IDENTITY_CACHE_PREFIX = "seclettr.peerIdentity.v1:";

export type {
  BrowserTrustIntegrityState,
  StoredDeviceRegistration,
  StoredSafetyVerificationRecord,
};
const persistenceRuntime = createBrowserTrustStorePersistenceRuntime({
  trustStorePrefix: TRUST_STORE_PREFIX,
  trustStoreKey: TRUST_STORE_KEY,
  registrationIdKey: REGISTRATION_ID_KEY,
  deviceRegPrefix: DEVICE_REG_PREFIX,
  safetyVerificationPrefix: SAFETY_VERIFICATION_PREFIX,
  peerIdentityCachePrefix: PEER_IDENTITY_CACHE_PREFIX,
});
const verificationRuntime = createBrowserTrustStoreVerificationRuntime({
  safetyVerificationPrefix: SAFETY_VERIFICATION_PREFIX,
  persistenceRuntime,
});

export async function warmBrowserTrustStore(
  storageKey?: CryptoKey | null
): Promise<void> {
  await persistenceRuntime.loadTrustStore(storageKey);
}

export function clearBrowserTrustStoreCache(): void {
  persistenceRuntime.clearBrowserTrustStoreCache();
}

export async function clearBrowserTrustStore(
  storageKey?: CryptoKey | null
): Promise<void> {
  await persistenceRuntime.clearBrowserTrustStore(storageKey);
}

export async function getBrowserTrustIntegrityState(
  storageKey?: CryptoKey | null
): Promise<BrowserTrustIntegrityState> {
  const store = await persistenceRuntime.loadTrustStore(storageKey);
  return {
    degradedAt: store.integrityDegradedAt ?? null,
    issues: [...store.integrityIssues],
  };
}

export async function getOrCreateStoredRegistrationId(
  storageKey?: CryptoKey | null
): Promise<number> {
  const store = await persistenceRuntime.loadTrustStore(storageKey);
  if (store.registrationId !== undefined) {
    return store.registrationId;
  }

  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  const registrationId = (buf[0]! % 16382) + 1;

  await persistenceRuntime.updateTrustStore(
    (current) => ({
      ...current,
      registrationId,
    }),
    storageKey
  );

  return registrationId;
}

export async function getStoredDeviceRegistration(
  username: string,
  storageKey?: CryptoKey | null
): Promise<StoredDeviceRegistration | null> {
  const store = await persistenceRuntime.loadTrustStore(storageKey);
  return store.deviceRegistrationsByUsername[username] ?? null;
}

export async function setStoredDeviceRegistration(
  username: string,
  registration: StoredDeviceRegistration,
  storageKey?: CryptoKey | null
): Promise<void> {
  await persistenceRuntime.updateTrustStore(
    (current) => ({
      ...current,
      deviceRegistrationsByUsername: {
        ...current.deviceRegistrationsByUsername,
        [username]: registration,
      },
    }),
    storageKey
  );
}

export function getLegacyVerificationStorageKey(
  myUserId: string,
  recipientUserId: string,
  peerDeviceId = "unknown-device"
): string {
  return verificationRuntime.getLegacyVerificationStorageKey(
    myUserId,
    recipientUserId,
    peerDeviceId
  );
}

export function getVerificationStorageKey(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId = "unknown-device"
): string {
  return verificationRuntime.getVerificationStorageKey(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
}

export async function getStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<StoredSafetyVerificationRecord | null> {
  return verificationRuntime.getStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId,
    storageKey
  );
}

export async function setStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  safetyHash: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<StoredSafetyVerificationRecord> {
  return verificationRuntime.setStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    safetyHash,
    peerDeviceId,
    storageKey
  );
}

export async function clearStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<void> {
  await verificationRuntime.clearStoredSafetyVerificationRecord(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId,
    storageKey
  );
}

export function readCachedPeerIdentityKey(
  deviceId: string
): string | null {
  return persistenceRuntime.readCachedPeerIdentityKey(deviceId);
}

export function primeCachedPeerIdentityKey(
  deviceId: string,
  identityKey: string
): void {
  persistenceRuntime.primeCachedPeerIdentityKey(deviceId, identityKey);
}

export async function persistCachedPeerIdentityKey(
  deviceId: string,
  identityKey: string,
  storageKey?: CryptoKey | null
): Promise<void> {
  await persistenceRuntime.updateTrustStore(
    (current) => ({
      ...current,
      peerIdentityCacheByDevice: {
        ...current.peerIdentityCacheByDevice,
        [deviceId]: identityKey,
      },
    }),
    storageKey
  );
}
