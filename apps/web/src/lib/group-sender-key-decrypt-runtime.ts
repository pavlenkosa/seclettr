import {
  fromBase64Url,
  loadDecrypted,
  senderKeyDecrypt,
  storeEncrypted,
  toBase64Url,
  type SenderKeyState,
} from "@seclettr/crypto";
import {
  PlaintextAttachmentMessageSchema,
  type PlaintextAttachmentMessage,
} from "@seclettr/protocol";
import { type GroupTextContent } from "@/lib/group-message-codec";

interface StoredRemoteSenderKey {
  state: StoredRemoteSenderKeyState;
  initialState?: StoredRemoteSenderKeyState;
}

export interface StoredRemoteSenderKeyState {
  chainKey: string;
  chainId: number;
  signingPublicKey: string;
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

export interface GroupHistoryReplayContext {
  stateByStorageKey: Map<string, SenderKeyState>;
}

export type GroupDecryptFailureReason =
  | "missing_sender_key"
  | "decrypt_failed"
  | "invalid_payload";

export type GroupAttachmentDecryptResult =
  | { ok: true; attachment: PlaintextAttachmentMessage }
  | { ok: false; reason: GroupDecryptFailureReason };

export type GroupTextDecryptResult =
  | { ok: true; content: GroupTextContent }
  | { ok: false; reason: GroupDecryptFailureReason };

interface GroupSenderKeyDecryptRuntime {
  decryptGroupAttachmentEnvelopeResult: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ) => Promise<GroupAttachmentDecryptResult>;
  decryptGroupAttachmentEnvelope: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ) => Promise<PlaintextAttachmentMessage | null>;
  decryptGroupTextEnvelopeResult: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ) => Promise<GroupTextDecryptResult>;
  decryptGroupTextEnvelope: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ) => Promise<GroupTextContent | null>;
  createGroupHistoryReplayContext: () => GroupHistoryReplayContext;
  decryptGroupTextEnvelopeForHistory: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope,
    replay: GroupHistoryReplayContext
  ) => Promise<GroupTextContent | null>;
  decryptGroupTextEnvelopeForHistoryResult: (
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope,
    replay: GroupHistoryReplayContext
  ) => Promise<GroupTextDecryptResult>;
  flushGroupHistoryReplayContext: (
    storageKey: CryptoKey,
    replay: GroupHistoryReplayContext
  ) => Promise<void>;
}

interface CreateGroupSenderKeyDecryptRuntimeOptions {
  remoteSenderKeyStorageKey: (
    groupId: string,
    senderDeviceId: string,
    distributionId: string
  ) => string;
}

export function serializeRemoteSenderKeyState(
  state: SenderKeyState
): StoredRemoteSenderKeyState {
  return {
    chainKey: toBase64Url(state.chainKey),
    chainId: state.chainId,
    signingPublicKey: toBase64Url(state.signingPublicKey),
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

function parseGroupAttachmentPayload(
  plaintext: Uint8Array
): PlaintextAttachmentMessage | null {
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
    const { v: _v, type: _t, ...payload } = parsed as Record<string, unknown>;
    return PlaintextAttachmentMessageSchema.parse(payload);
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
    const p = parsed as {
      text: string;
      replyToId?: unknown;
      replySnippet?: unknown;
    };
    return {
      text: p.text,
      replyToId: typeof p.replyToId === "string" ? p.replyToId : undefined,
      replySnippet:
        typeof p.replySnippet === "string" ? p.replySnippet : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Owns remote sender-key state advance, live decrypt classification, and
 * history replay/flush behavior.
 */
export function createGroupSenderKeyDecryptRuntime(
  options: CreateGroupSenderKeyDecryptRuntimeOptions
): GroupSenderKeyDecryptRuntime {
  async function saveRemoteSenderKeyState(
    storageKey: CryptoKey,
    groupId: string,
    senderDeviceId: string,
    distributionId: string,
    state: SenderKeyState
  ): Promise<void> {
    const key = options.remoteSenderKeyStorageKey(
      groupId,
      senderDeviceId,
      distributionId
    );
    const existing = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    await storeEncrypted(
      storageKey,
      key,
      {
        state: serializeRemoteSenderKeyState(state),
        initialState: existing?.initialState ?? serializeRemoteSenderKeyState(state),
      } satisfies StoredRemoteSenderKey
    );
  }

  async function decryptGroupAttachmentEnvelopeResult(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ): Promise<GroupAttachmentDecryptResult> {
    const key = options.remoteSenderKeyStorageKey(
      envelope.groupId,
      envelope.senderDeviceId,
      envelope.distributionId
    );
    const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    if (!stored) return { ok: false, reason: "missing_sender_key" };

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
      const attachment = parseGroupAttachmentPayload(plaintext);
      return attachment
        ? { ok: true, attachment }
        : { ok: false, reason: "invalid_payload" };
    } catch {
      return { ok: false, reason: "decrypt_failed" };
    }
  }

  async function decryptGroupAttachmentEnvelope(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ): Promise<PlaintextAttachmentMessage | null> {
    const result = await decryptGroupAttachmentEnvelopeResult(
      storageKey,
      envelope
    );
    return result.ok ? result.attachment : null;
  }

  async function decryptGroupTextEnvelopeResult(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ): Promise<GroupTextDecryptResult> {
    const key = options.remoteSenderKeyStorageKey(
      envelope.groupId,
      envelope.senderDeviceId,
      envelope.distributionId
    );
    const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
    if (!stored) return { ok: false, reason: "missing_sender_key" };

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
      const content = parseGroupTextPayload(plaintext);
      return content
        ? { ok: true, content }
        : { ok: false, reason: "invalid_payload" };
    } catch {
      return { ok: false, reason: "decrypt_failed" };
    }
  }

  async function decryptGroupTextEnvelope(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope
  ): Promise<GroupTextContent | null> {
    const result = await decryptGroupTextEnvelopeResult(storageKey, envelope);
    return result.ok ? result.content : null;
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

  function createGroupHistoryReplayContext(): GroupHistoryReplayContext {
    return {
      stateByStorageKey: new Map<string, SenderKeyState>(),
    };
  }

  async function decryptGroupTextEnvelopeForHistory(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope,
    replay: GroupHistoryReplayContext
  ): Promise<GroupTextContent | null> {
    const result = await decryptGroupTextEnvelopeForHistoryResult(
      storageKey,
      envelope,
      replay
    );
    return result.ok ? result.content : null;
  }

  async function decryptGroupTextEnvelopeForHistoryResult(
    storageKey: CryptoKey,
    envelope: GroupCipherEnvelope,
    replay: GroupHistoryReplayContext
  ): Promise<GroupTextDecryptResult> {
    const key = options.remoteSenderKeyStorageKey(
      envelope.groupId,
      envelope.senderDeviceId,
      envelope.distributionId
    );
    const cachedState = replay.stateByStorageKey.get(key);
    let state = cachedState;
    if (!state) {
      const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
      if (!stored) return { ok: false, reason: "missing_sender_key" };
      state = stored.initialState
        ? deserializeStoredRemoteState(stored.initialState)
        : deserializeRemoteState(stored);
    }

    const { content, newState } = await decryptGroupTextWithState(state, envelope);
    if (newState) {
      replay.stateByStorageKey.set(key, newState);
    }
    if (content) return { ok: true, content };
    return {
      ok: false,
      reason: newState ? "invalid_payload" : "decrypt_failed",
    };
  }

  async function flushGroupHistoryReplayContext(
    storageKey: CryptoKey,
    replay: GroupHistoryReplayContext
  ): Promise<void> {
    for (const [key, replayState] of replay.stateByStorageKey.entries()) {
      const stored = await loadDecrypted<StoredRemoteSenderKey>(storageKey, key);
      if (!stored) continue;
      if (stored.state.chainId >= replayState.chainId) continue;

      await storeEncrypted(storageKey, key, {
        state: serializeRemoteSenderKeyState(replayState),
        initialState: stored.initialState ?? stored.state,
      } satisfies StoredRemoteSenderKey);
    }
  }

  return {
    decryptGroupAttachmentEnvelopeResult,
    decryptGroupAttachmentEnvelope,
    decryptGroupTextEnvelopeResult,
    decryptGroupTextEnvelope,
    createGroupHistoryReplayContext,
    decryptGroupTextEnvelopeForHistory,
    decryptGroupTextEnvelopeForHistoryResult,
    flushGroupHistoryReplayContext,
  };
}
