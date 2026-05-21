import type {
  BrowserTrustStore,
  StoredSafetyVerificationRecord,
} from "./browser-trust-store-sanitize";

interface BrowserTrustStoreVerificationPersistenceRuntime {
  loadTrustStore: (storageKey?: CryptoKey | null) => Promise<BrowserTrustStore>;
  updateTrustStore: (
    updater: (current: BrowserTrustStore) => BrowserTrustStore,
    storageKey?: CryptoKey | null
  ) => Promise<BrowserTrustStore>;
}

interface BrowserTrustStoreVerificationRuntimeOptions {
  safetyVerificationPrefix: string;
  persistenceRuntime: BrowserTrustStoreVerificationPersistenceRuntime;
}

interface BrowserTrustStoreVerificationRuntime {
  getLegacyVerificationStorageKey: (
    myUserId: string,
    recipientUserId: string,
    peerDeviceId?: string
  ) => string;
  getVerificationStorageKey: (
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId?: string
  ) => string;
  getStoredSafetyVerificationRecord: (
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ) => Promise<StoredSafetyVerificationRecord | null>;
  setStoredSafetyVerificationRecord: (
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    safetyHash: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ) => Promise<StoredSafetyVerificationRecord>;
  clearStoredSafetyVerificationRecord: (
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ) => Promise<void>;
}

function isVerificationRecordInvalidated(
  store: BrowserTrustStore,
  record: StoredSafetyVerificationRecord
): boolean {
  const degradedAtMs = Date.parse(store.integrityDegradedAt ?? "");
  const verifiedAtMs = Date.parse(record.verifiedAt);
  return (
    Number.isFinite(degradedAtMs) &&
    (!Number.isFinite(verifiedAtMs) || verifiedAtMs < degradedAtMs)
  );
}

/**
 * Owns the browser trust-store safety verification record API, including
 * scoped/legacy key handling and integrity-aware read semantics.
 */
export function createBrowserTrustStoreVerificationRuntime(
  options: BrowserTrustStoreVerificationRuntimeOptions
): BrowserTrustStoreVerificationRuntime {
  function getLegacyVerificationStorageKey(
    myUserId: string,
    recipientUserId: string,
    peerDeviceId = "unknown-device"
  ): string {
    return `${options.safetyVerificationPrefix}${myUserId}:${recipientUserId}:${peerDeviceId}`;
  }

  function getVerificationStorageKey(
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId = "unknown-device"
  ): string {
    return `${options.safetyVerificationPrefix}${myUserId}:${myDeviceId}:${recipientUserId}:${peerDeviceId}`;
  }

  async function getStoredSafetyVerificationRecord(
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ): Promise<StoredSafetyVerificationRecord | null> {
    const scopedKey = getVerificationStorageKey(
      myUserId,
      myDeviceId,
      recipientUserId,
      peerDeviceId
    );
    const legacyKey = getLegacyVerificationStorageKey(
      myUserId,
      recipientUserId,
      peerDeviceId
    );
    const store = await options.persistenceRuntime.loadTrustStore(storageKey);
    const scopedRecord = store.safetyVerificationRecordsByKey[scopedKey];
    if (scopedRecord) {
      return isVerificationRecordInvalidated(store, scopedRecord)
        ? null
        : scopedRecord;
    }

    const legacyRecord = store.safetyVerificationRecordsByKey[legacyKey];
    if (!legacyRecord) {
      return null;
    }

    await options.persistenceRuntime.updateTrustStore(
      (current) => {
        const nextRecords = { ...current.safetyVerificationRecordsByKey };
        nextRecords[scopedKey] = legacyRecord;
        delete nextRecords[legacyKey];
        return {
          ...current,
          safetyVerificationRecordsByKey: nextRecords,
        };
      },
      storageKey
    );

    return isVerificationRecordInvalidated(store, legacyRecord)
      ? null
      : legacyRecord;
  }

  async function setStoredSafetyVerificationRecord(
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    safetyHash: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ): Promise<StoredSafetyVerificationRecord> {
    const record: StoredSafetyVerificationRecord = {
      safetyHash,
      verifiedAt: new Date().toISOString(),
    };
    const scopedKey = getVerificationStorageKey(
      myUserId,
      myDeviceId,
      recipientUserId,
      peerDeviceId
    );
    const legacyKey = getLegacyVerificationStorageKey(
      myUserId,
      recipientUserId,
      peerDeviceId
    );

    await options.persistenceRuntime.updateTrustStore(
      (current) => {
        const nextRecords = {
          ...current.safetyVerificationRecordsByKey,
          [scopedKey]: record,
        };
        delete nextRecords[legacyKey];
        return {
          ...current,
          safetyVerificationRecordsByKey: nextRecords,
        };
      },
      storageKey
    );

    return record;
  }

  async function clearStoredSafetyVerificationRecord(
    myUserId: string,
    myDeviceId: string,
    recipientUserId: string,
    peerDeviceId?: string,
    storageKey?: CryptoKey | null
  ): Promise<void> {
    const scopedKey = getVerificationStorageKey(
      myUserId,
      myDeviceId,
      recipientUserId,
      peerDeviceId
    );
    const legacyKey = getLegacyVerificationStorageKey(
      myUserId,
      recipientUserId,
      peerDeviceId
    );

    await options.persistenceRuntime.updateTrustStore(
      (current) => {
        const nextRecords = { ...current.safetyVerificationRecordsByKey };
        delete nextRecords[scopedKey];
        delete nextRecords[legacyKey];
        return {
          ...current,
          safetyVerificationRecordsByKey: nextRecords,
        };
      },
      storageKey
    );
  }

  return {
    getLegacyVerificationStorageKey,
    getVerificationStorageKey,
    getStoredSafetyVerificationRecord,
    setStoredSafetyVerificationRecord,
    clearStoredSafetyVerificationRecord,
  };
}
