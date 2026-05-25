import { loadDecrypted, storeEncrypted, toBase64Url } from "@seclettr/crypto";
import {
  PlaintextSenderKeyDistributionMessageSchema,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import type { LocalSenderKeyRecord } from "./group-sender-key-local-runtime";

interface StoredRemoteSenderKeyState {
  chainKey: string;
  chainId: number;
  signingPublicKey: string;
}

interface StoredRemoteSenderKey {
  state: StoredRemoteSenderKeyState;
  initialState?: StoredRemoteSenderKeyState;
}

interface GroupSenderKeyDistributionRuntime {
  buildSenderKeyDistributionPayload: (
    record: LocalSenderKeyRecord,
    groupId: string,
    senderDeviceId: string
  ) => PlaintextSenderKeyDistributionMessage;
  importSenderKeyDistribution: (
    storageKey: CryptoKey,
    rawPayload: unknown
  ) => Promise<PlaintextSenderKeyDistributionMessage>;
}

interface CreateGroupSenderKeyDistributionRuntimeOptions {
  remoteSenderKeyStorageKey: (
    groupId: string,
    senderDeviceId: string,
    distributionId: string
  ) => string;
}

/**
 * Owns sender-key distribution payload shaping and imported remote-state
 * persistence, including stale-chain backfill behavior.
 */
export function createGroupSenderKeyDistributionRuntime(
  options: CreateGroupSenderKeyDistributionRuntimeOptions
): GroupSenderKeyDistributionRuntime {
  function buildSenderKeyDistributionPayload(
    record: LocalSenderKeyRecord,
    groupId: string,
    senderDeviceId: string
  ): PlaintextSenderKeyDistributionMessage {
    return {
      schemaVersion: 1,
      type: "sender_key_distribution",
      groupId,
      senderDeviceId,
      distributionId: record.distributionId,
      chainId: record.state.chainId,
      chainKey: toBase64Url(record.state.chainKey),
      signingKey: toBase64Url(record.state.signingPublicKey),
    };
  }

  async function importSenderKeyDistribution(
    storageKey: CryptoKey,
    rawPayload: unknown
  ): Promise<PlaintextSenderKeyDistributionMessage> {
    const payload = PlaintextSenderKeyDistributionMessageSchema.parse(rawPayload);
    const key = options.remoteSenderKeyStorageKey(
      payload.groupId,
      payload.senderDeviceId,
      payload.distributionId
    );
    const existing = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    const importedState = {
      chainKey: payload.chainKey,
      chainId: payload.chainId,
      signingPublicKey: payload.signingKey,
    } satisfies StoredRemoteSenderKeyState;

    if (existing && existing.state.chainId > payload.chainId) {
      if (!existing.initialState) {
        await storeEncrypted(storageKey, key, {
          ...existing,
          initialState: importedState,
        } satisfies StoredRemoteSenderKey);
      }
    } else {
      await storeEncrypted(storageKey, key, {
        state: importedState,
        initialState: existing?.initialState ?? importedState,
      } satisfies StoredRemoteSenderKey);
    }

    return payload;
  }

  return {
    buildSenderKeyDistributionPayload,
    importSenderKeyDistribution,
  };
}
