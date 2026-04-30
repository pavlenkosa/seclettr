import {
  fromBase64Url,
  generateSenderKey,
  loadDecrypted,
  senderKeyDecrypt,
  senderKeyEncrypt,
  storeEncrypted,
  toBase64Url,
  type SenderKeyState,
} from "@seclettr/crypto";
import {
  PlaintextAttachmentMessageSchema,
  PlaintextSenderKeyDistributionMessageSchema,
  type PlaintextAttachmentMessage,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import { type GroupTextContent } from "@/lib/group-message-codec";

const LOCAL_SENDER_KEY_PREFIX = "group:sender-key:local:v1:";
const REMOTE_SENDER_KEY_PREFIX = "group:sender-key:remote:v1:";
const CURRENT_LOCAL_SENDER_KEY_RECORD_VERSION = 2;
const localSenderKeyLocks = new Map<string, Promise<void>>();

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>
  ): Promise<T>;
}

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

interface StoredRemoteSenderKeyState {
  chainKey: string;
  chainId: number;
  signingPublicKey: string;
}

export interface GroupHistoryReplayContext {
  stateByStorageKey: Map<string, SenderKeyState>;
}

function localSenderKeyStorageKey(groupId: string, senderDeviceId: string): string {
  return `${LOCAL_SENDER_KEY_PREFIX}${groupId}:${senderDeviceId}`;
}

function localSenderKeyLockKey(groupId: string, senderDeviceId: string): string {
  return `${groupId}:${senderDeviceId}`;
}

function localSenderKeyBrowserLockName(
  groupId: string,
  senderDeviceId: string
): string {
  return `seclettr:${LOCAL_SENDER_KEY_PREFIX}${localSenderKeyLockKey(groupId, senderDeviceId)}`;
}

function getBrowserLockManager(): BrowserLockManager | null {
  if (typeof globalThis.navigator === "undefined") return null;
  const locks = (globalThis.navigator as Navigator & {
    locks?: BrowserLockManager;
  }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

async function withInMemoryLocalSenderKeyLock<T>(
  groupId: string,
  senderDeviceId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = localSenderKeyLockKey(groupId, senderDeviceId);
  const previous = localSenderKeyLocks.get(key) ?? Promise.resolve();
  let releaseLock!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  localSenderKeyLocks.set(key, current);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    releaseLock();
    if (localSenderKeyLocks.get(key) === current) {
      localSenderKeyLocks.delete(key);
    }
  }
}

async function withLocalSenderKeyLock<T>(
  groupId: string,
  senderDeviceId: string,
  fn: () => Promise<T>
): Promise<T> {
  const run = () => withInMemoryLocalSenderKeyLock(groupId, senderDeviceId, fn);
  const browserLocks = getBrowserLockManager();
  if (!browserLocks) return run();
  return browserLocks.request(
    localSenderKeyBrowserLockName(groupId, senderDeviceId),
    { mode: "exclusive" },
    run
  );
}

function remoteSenderKeyStorageKey(groupId: string, senderDeviceId: string, distributionId: string): string {
  return `${REMOTE_SENDER_KEY_PREFIX}${groupId}:${senderDeviceId}:${distributionId}`;
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

function deserializeRemoteState(stored: StoredRemoteSenderKey): SenderKeyState {
  return {
    chainKey: fromBase64Url(stored.state.chainKey),
    chainId: stored.state.chainId,
    signingPublicKey: fromBase64Url(stored.state.signingPublicKey),
    MKSKIPPED: new Map(),
  };
}

function deserializeStoredRemoteState(stored: StoredRemoteSenderKeyState): SenderKeyState {
  return {
    chainKey: fromBase64Url(stored.chainKey),
    chainId: stored.chainId,
    signingPublicKey: fromBase64Url(stored.signingPublicKey),
    MKSKIPPED: new Map(),
  };
}

function serializeRemoteState(state: SenderKeyState): StoredRemoteSenderKeyState {
  return {
    chainKey: toBase64Url(state.chainKey),
    chainId: state.chainId,
    signingPublicKey: toBase64Url(state.signingPublicKey),
  };
}

async function saveLocalSenderKeyRecord(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  record: LocalSenderKeyRecord
): Promise<void> {
  await storeEncrypted(
    storageKey,
    localSenderKeyStorageKey(groupId, senderDeviceId),
    serializeLocalRecord(record)
  );
}

async function saveRemoteSenderKeyState(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  distributionId: string,
  state: SenderKeyState
): Promise<void> {
  const key = remoteSenderKeyStorageKey(groupId, senderDeviceId, distributionId);
  const existing = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
  await storeEncrypted(
    storageKey,
    key,
    {
      state: serializeRemoteState(state),
      initialState: existing?.initialState ?? serializeRemoteState(state),
    } satisfies StoredRemoteSenderKey
  );
}

async function ensureSelfRemoteSenderKeyState(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  record: LocalSenderKeyRecord
): Promise<void> {
  const key = remoteSenderKeyStorageKey(
    groupId,
    senderDeviceId,
    record.distributionId
  );
  const existing = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
  if (existing) return;

  const state = serializeRemoteState(record.state);
  await storeEncrypted(storageKey, key, {
    state,
    initialState: state,
  } satisfies StoredRemoteSenderKey);
}

function memberDeviceFingerprint(deviceIds: string[]): string {
  return [...new Set(deviceIds)]
    .filter((deviceId) => deviceId.length > 0)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");
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
    formatVersion: CURRENT_LOCAL_SENDER_KEY_RECORD_VERSION,
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
    localSenderKeyStorageKey(groupId, senderDeviceId)
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
  await ensureSelfRemoteSenderKeyState(storageKey, groupId, senderDeviceId, record);
  return record;
}

export async function ensureLocalSenderKeyRecord(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string
): Promise<LocalSenderKeyRecord> {
  return withLocalSenderKeyLock(groupId, senderDeviceId, () =>
    loadOrCreateLocalSenderKeyRecord(storageKey, groupId, senderDeviceId)
  );
}

export async function ensureLocalSenderKeyRecordForMemberDevices(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  activeRecipientDeviceIds: string[]
): Promise<LocalSenderKeyRecord> {
  const nextFingerprint = memberDeviceFingerprint(activeRecipientDeviceIds);
  return withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
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
  });
}

export async function markSenderKeyDistributedToDevices(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  distributionId: string,
  deviceIds: string[]
): Promise<void> {
  if (deviceIds.length === 0) return;
  await withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
    const record = await loadOrCreateLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    if (record.distributionId !== distributionId) return;
    record.formatVersion = CURRENT_LOCAL_SENDER_KEY_RECORD_VERSION;
    record.distributedToDeviceIds = [
      ...new Set([...record.distributedToDeviceIds, ...deviceIds]),
    ];
    await saveLocalSenderKeyRecord(storageKey, groupId, senderDeviceId, record);
  });
}

export function buildSenderKeyDistributionPayload(
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

export async function importSenderKeyDistribution(
  storageKey: CryptoKey,
  rawPayload: unknown
): Promise<PlaintextSenderKeyDistributionMessage> {
  const payload = PlaintextSenderKeyDistributionMessageSchema.parse(rawPayload);
  const key = remoteSenderKeyStorageKey(payload.groupId, payload.senderDeviceId, payload.distributionId);
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

export interface GroupCipherEnvelope {
  groupId: string;
  senderDeviceId: string;
  distributionId: string;
  chainId: number;
  messageId: number;
  ciphertext: string;
  signature: string;
  /** 0 = legacy empty AEAD AD; 1 = distributionId+chainId+messageId AD. */
  aeadVersion: 0 | 1;
}

export async function encryptGroupTextEnvelope(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  text: string,
  reply?: { id: string; snippet: string }
): Promise<GroupCipherEnvelope> {
  return withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
    const record = await loadOrCreateLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        type: "text",
        text,
        ...(reply ? { replyToId: reply.id, replySnippet: reply.snippet } : {}),
      })
    );
    const { message, newState } = await senderKeyEncrypt(
      record.state,
      record.distributionId,
      plaintext
    );

    const nextRecord: LocalSenderKeyRecord = {
      ...record,
      state: newState,
    };
    await saveLocalSenderKeyRecord(storageKey, groupId, senderDeviceId, nextRecord);

    return {
      groupId,
      senderDeviceId,
      distributionId: message.distributionId,
      chainId: message.chainId,
      messageId: message.messageId,
      ciphertext: toBase64Url(message.ciphertext),
      signature: toBase64Url(message.signature),
      aeadVersion: message.aeadVersion,
    };
  });
}

export async function encryptGroupAttachmentEnvelope(
  storageKey: CryptoKey,
  groupId: string,
  senderDeviceId: string,
  attachmentPayload: PlaintextAttachmentMessage
): Promise<GroupCipherEnvelope> {
  return withLocalSenderKeyLock(groupId, senderDeviceId, async () => {
    const record = await loadOrCreateLocalSenderKeyRecord(
      storageKey,
      groupId,
      senderDeviceId
    );
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ v: 1, type: "attachment", ...attachmentPayload })
    );
    const { message, newState } = await senderKeyEncrypt(
      record.state,
      record.distributionId,
      plaintext
    );

    const nextRecord: LocalSenderKeyRecord = { ...record, state: newState };
    await saveLocalSenderKeyRecord(storageKey, groupId, senderDeviceId, nextRecord);

    return {
      groupId,
      senderDeviceId,
      distributionId: message.distributionId,
      chainId: message.chainId,
      messageId: message.messageId,
      ciphertext: toBase64Url(message.ciphertext),
      signature: toBase64Url(message.signature),
      aeadVersion: message.aeadVersion,
    };
  });
}

function parseGroupAttachmentPayload(plaintext: Uint8Array): PlaintextAttachmentMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { v?: number }).v !== 1 ||
      (parsed as { type?: string }).type !== "attachment"
    ) {
      return null;
    }
    // Strip envelope wrapper fields (v, type) before parsing the strict schema —
    // they are not part of PlaintextAttachmentMessageSchema.
    const { v: _v, type: _t, ...payload } = parsed as Record<string, unknown>;
    return PlaintextAttachmentMessageSchema.parse(payload);
  } catch {
    return null;
  }
}

export async function decryptGroupAttachmentEnvelope(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<PlaintextAttachmentMessage | null> {
  const key = remoteSenderKeyStorageKey(
    envelope.groupId,
    envelope.senderDeviceId,
    envelope.distributionId
  );
  const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
  if (!stored) return null;

  try {
    const state = deserializeRemoteState(stored);
    const { plaintext, newState } = await senderKeyDecrypt(state, {
      distributionId: envelope.distributionId,
      chainId: envelope.chainId,
      messageId: envelope.messageId,
      ciphertext: fromBase64Url(envelope.ciphertext),
      signature: fromBase64Url(envelope.signature),
      aeadVersion: envelope.aeadVersion ?? 0,
    });
    await saveRemoteSenderKeyState(
      storageKey,
      envelope.groupId,
      envelope.senderDeviceId,
      envelope.distributionId,
      newState
    );
    return parseGroupAttachmentPayload(plaintext);
  } catch {
    return null;
  }
}

function parseGroupTextPayload(plaintext: Uint8Array): GroupTextContent | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { v?: number }).v !== 1 ||
      (parsed as { type?: string }).type !== "text" ||
      typeof (parsed as { text?: unknown }).text !== "string"
    ) {
      return null;
    }
    const p = parsed as { text: string; replyToId?: unknown; replySnippet?: unknown };
    return {
      text: p.text,
      replyToId: typeof p.replyToId === "string" ? p.replyToId : undefined,
      replySnippet: typeof p.replySnippet === "string" ? p.replySnippet : undefined,
    };
  } catch {
    return null;
  }
}

export async function decryptGroupTextEnvelope(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope
): Promise<GroupTextContent | null> {
  const key = remoteSenderKeyStorageKey(
    envelope.groupId,
    envelope.senderDeviceId,
    envelope.distributionId
  );
  const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
  if (!stored) return null;

  try {
    const state = deserializeRemoteState(stored);
    const { plaintext, newState } = await senderKeyDecrypt(state, {
      distributionId: envelope.distributionId,
      chainId: envelope.chainId,
      messageId: envelope.messageId,
      ciphertext: fromBase64Url(envelope.ciphertext),
      signature: fromBase64Url(envelope.signature),
      aeadVersion: envelope.aeadVersion ?? 0,
    });
    await saveRemoteSenderKeyState(
      storageKey,
      envelope.groupId,
      envelope.senderDeviceId,
      envelope.distributionId,
      newState
    );
    return parseGroupTextPayload(plaintext);
  } catch {
    return null;
  }
}

async function decryptGroupTextWithState(
  state: SenderKeyState,
  envelope: GroupCipherEnvelope
): Promise<{ content: GroupTextContent | null; newState: SenderKeyState | null }> {
  try {
    const { plaintext, newState } = await senderKeyDecrypt(state, {
      distributionId: envelope.distributionId,
      chainId: envelope.chainId,
      messageId: envelope.messageId,
      ciphertext: fromBase64Url(envelope.ciphertext),
      signature: fromBase64Url(envelope.signature),
      aeadVersion: envelope.aeadVersion ?? 0,
    });
    return { content: parseGroupTextPayload(plaintext), newState };
  } catch {
    return { content: null, newState: null };
  }
}

export function createGroupHistoryReplayContext(): GroupHistoryReplayContext {
  return {
    stateByStorageKey: new Map<string, SenderKeyState>(),
  };
}

export async function decryptGroupTextEnvelopeForHistory(
  storageKey: CryptoKey,
  envelope: GroupCipherEnvelope,
  replay: GroupHistoryReplayContext
): Promise<GroupTextContent | null> {
  const key = remoteSenderKeyStorageKey(
    envelope.groupId,
    envelope.senderDeviceId,
    envelope.distributionId
  );
  const cachedState = replay.stateByStorageKey.get(key);
  let state = cachedState;
  if (!state) {
    const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    if (!stored) return null;
    state = stored.initialState
      ? deserializeStoredRemoteState(stored.initialState)
      : deserializeRemoteState(stored);
  }

  const { content, newState } = await decryptGroupTextWithState(state, envelope);
  if (newState) {
    replay.stateByStorageKey.set(key, newState);
  }
  return content;
}

export async function flushGroupHistoryReplayContext(
  storageKey: CryptoKey,
  replay: GroupHistoryReplayContext
): Promise<void> {
  for (const [key, replayState] of replay.stateByStorageKey.entries()) {
    const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    if (!stored) continue;
    if (stored.state.chainId >= replayState.chainId) continue;

    await storeEncrypted(storageKey, key, {
      state: serializeRemoteState(replayState),
      initialState: stored.initialState ?? stored.state,
    } satisfies StoredRemoteSenderKey);
  }
}
