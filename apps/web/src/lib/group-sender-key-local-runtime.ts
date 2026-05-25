import {
  fromBase64Url,
  generateSenderKey,
  loadDecrypted,
  storeEncrypted,
  toBase64Url,
  type SenderKeyState,
} from "@seclettr/crypto";

interface StoredLocalSenderKey {
  distributionId: string;
  formatVersion?: number;
  memberDeviceFingerprint?: string;
  state: {
    chainKey: string;
    chainId: number;
    signingPublicKey: string;
    signingPrivateKey: string;
  };
  distributedToDeviceIds: string[];
}

interface StoredRemoteSenderKeyState {
  chainKey: string;
  chainId: number;
  signingPublicKey: string;
}

interface StoredRemoteSenderKey {
  state: StoredRemoteSenderKeyState;
  initialState?: StoredRemoteSenderKeyState;
}

export interface LocalSenderKeyRecord {
  distributionId: string;
  formatVersion: number;
  memberDeviceFingerprint?: string;
  state: SenderKeyState;
  distributedToDeviceIds: string[];
}

interface GroupSenderKeyLocalRuntime {
  loadOrCreateLocalSenderKeyRecord: (
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string
  ) => Promise<LocalSenderKeyRecord>;
  saveLocalSenderKeyRecord: (
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    record: LocalSenderKeyRecord
  ) => Promise<void>;
  ensureLocalSenderKeyRecord: (
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string
  ) => Promise<LocalSenderKeyRecord>;
  ensureLocalSenderKeyRecordForMemberDevices: (
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    activeRecipientDeviceIds: string[]
  ) => Promise<LocalSenderKeyRecord>;
  markSenderKeyDistributedToDevices: (
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    distributionId: string,
    deviceIds: string[]
  ) => Promise<void>;
}

interface CreateGroupSenderKeyLocalRuntimeOptions {
  localSenderKeyPrefix: string;
  currentLocalSenderKeyRecordVersion: number;
  withLocalSenderKeyLock: <T>(
    groupId: string,
    senderDeviceId: string,
    fn: () => Promise<T>
  ) => Promise<T>;
  remoteSenderKeyStorageKey: (
    groupId: string,
    senderDeviceId: string,
    distributionId: string
  ) => string;
  serializeRemoteState: (state: SenderKeyState) => StoredRemoteSenderKeyState;
}

function localSenderKeyStorageKey(
  localSenderKeyPrefix: string,
  groupId: string,
  senderDeviceId: string
): string {
  return `${localSenderKeyPrefix}${groupId}:${senderDeviceId}`;
}

function serializeLocalRecord(record: LocalSenderKeyRecord): StoredLocalSenderKey {
  if (!record.state.signingPrivateKey) {
    throw new Error("Local sender key record requires signing private key");
  }
  return {
    distributionId: record.distributionId,
    formatVersion: record.formatVersion,
    memberDeviceFingerprint: record.memberDeviceFingerprint,
    state: {
      chainKey: toBase64Url(record.state.chainKey),
      chainId: record.state.chainId,
      signingPublicKey: toBase64Url(record.state.signingPublicKey),
      signingPrivateKey: toBase64Url(record.state.signingPrivateKey),
    },
    distributedToDeviceIds: [...new Set(record.distributedToDeviceIds)],
  };
}

function deserializeLocalRecord(stored: StoredLocalSenderKey): LocalSenderKeyRecord {
  return {
    distributionId: stored.distributionId,
    formatVersion: stored.formatVersion ?? 1,
    memberDeviceFingerprint: stored.memberDeviceFingerprint,
    state: {
      chainKey: fromBase64Url(stored.state.chainKey),
      chainId: stored.state.chainId,
      signingPublicKey: fromBase64Url(stored.state.signingPublicKey),
      signingPrivateKey: fromBase64Url(stored.state.signingPrivateKey),
      MKSKIPPED: new Map(),
    },
    distributedToDeviceIds: [...new Set(stored.distributedToDeviceIds)],
  };
}

function memberDeviceFingerprint(deviceIds: string[]): string {
  return [...new Set(deviceIds)]
    .filter((deviceId) => deviceId.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
}

/**
 * Owns local sender-key persistence and rotation-adoption behavior,
 * including the self-remote mirror needed for sent-message readability.
 */
export function createGroupSenderKeyLocalRuntime(
  options: CreateGroupSenderKeyLocalRuntimeOptions
): GroupSenderKeyLocalRuntime {
  async function saveLocalSenderKeyRecord(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    record: LocalSenderKeyRecord
  ): Promise<void> {
    await storeEncrypted(
      storageKey,
      localSenderKeyStorageKey(
        options.localSenderKeyPrefix,
        groupId,
        senderDeviceId
      ),
      serializeLocalRecord(record)
    );
  }

  async function ensureSelfRemoteSenderKeyState(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    record: LocalSenderKeyRecord
  ): Promise<void> {
    const key = options.remoteSenderKeyStorageKey(
      groupId,
      senderDeviceId,
      record.distributionId
    );
    const existing = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    if (existing) return;

    const state = options.serializeRemoteState(record.state);
    await storeEncrypted(storageKey, key, {
      state,
      initialState: state,
    } satisfies StoredRemoteSenderKey);
  }

  async function createLocalSenderKeyRecord(
    memberDeviceFingerprintValue?: string
  ): Promise<LocalSenderKeyRecord> {
    const state = await generateSenderKey();
    if (!state.signingPrivateKey) {
      throw new Error("Generated sender key has no signing private key");
    }

    return {
      distributionId: crypto.randomUUID(),
      formatVersion: options.currentLocalSenderKeyRecordVersion,
      memberDeviceFingerprint: memberDeviceFingerprintValue,
      state,
      distributedToDeviceIds: [],
    };
  }

  async function loadOrCreateLocalSenderKeyRecord(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string
  ): Promise<LocalSenderKeyRecord> {
    const existing = await loadDecrypted<StoredLocalSenderKey>(
      storageKey,
      localSenderKeyStorageKey(
        options.localSenderKeyPrefix,
        groupId,
        senderDeviceId
      )
    );
    if (existing) {
      const record = deserializeLocalRecord(existing);
      await ensureSelfRemoteSenderKeyState(
        storageKey,
        groupId,
        senderDeviceId,
        record
      );
      return record;
    }

    const record = await createLocalSenderKeyRecord();
    await saveLocalSenderKeyRecord(storageKey, groupId, senderDeviceId, record);
    await ensureSelfRemoteSenderKeyState(
      storageKey,
      groupId,
      senderDeviceId,
      record
    );
    return record;
  }

  async function ensureLocalSenderKeyRecord(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string
  ): Promise<LocalSenderKeyRecord> {
    return options.withLocalSenderKeyLock(groupId, senderDeviceId, () =>
      loadOrCreateLocalSenderKeyRecord(storageKey, groupId, senderDeviceId)
    );
  }

  async function ensureLocalSenderKeyRecordForMemberDevices(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    activeRecipientDeviceIds: string[]
  ): Promise<LocalSenderKeyRecord> {
    const nextFingerprint = memberDeviceFingerprint(activeRecipientDeviceIds);
    return options.withLocalSenderKeyLock(
      groupId,
      senderDeviceId,
      async () => {
        const record = await loadOrCreateLocalSenderKeyRecord(
          storageKey,
          groupId,
          senderDeviceId
        );

        if (record.memberDeviceFingerprint === nextFingerprint) {
          return record;
        }

        if (record.memberDeviceFingerprint === undefined) {
          const nextRecord = {
            ...record,
            memberDeviceFingerprint: nextFingerprint,
          };
          await saveLocalSenderKeyRecord(
            storageKey,
            groupId,
            senderDeviceId,
            nextRecord
          );
          return nextRecord;
        }

        const rotatedRecord = await createLocalSenderKeyRecord(nextFingerprint);
        await saveLocalSenderKeyRecord(
          storageKey,
          groupId,
          senderDeviceId,
          rotatedRecord
        );
        await ensureSelfRemoteSenderKeyState(
          storageKey,
          groupId,
          senderDeviceId,
          rotatedRecord
        );
        return rotatedRecord;
      }
    );
  }

  async function markSenderKeyDistributedToDevices(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    distributionId: string,
    deviceIds: string[]
  ): Promise<void> {
    if (deviceIds.length === 0) return;
    await options.withLocalSenderKeyLock(
      groupId,
      senderDeviceId,
      async () => {
        const record = await loadOrCreateLocalSenderKeyRecord(
          storageKey,
          groupId,
          senderDeviceId
        );
        if (record.distributionId !== distributionId) return;
        record.formatVersion = options.currentLocalSenderKeyRecordVersion;
        record.distributedToDeviceIds = [
          ...new Set([...record.distributedToDeviceIds, ...deviceIds]),
        ];
        await saveLocalSenderKeyRecord(
          storageKey,
          groupId,
          senderDeviceId,
          record
        );
      }
    );
  }

  return {
    loadOrCreateLocalSenderKeyRecord,
    saveLocalSenderKeyRecord,
    ensureLocalSenderKeyRecord,
    ensureLocalSenderKeyRecordForMemberDevices,
    markSenderKeyDistributedToDevices,
  };
}
