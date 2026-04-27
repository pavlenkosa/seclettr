import type { KeyPair } from "@seclettr/crypto";
import { useAuthStore } from "@/stores/auth";
import { getUserContactGrantHeaders } from "@/lib/user-search";
import {
  persistCachedPeerIdentityKey,
  primeCachedPeerIdentityKey,
  readCachedPeerIdentityKey,
  warmBrowserTrustStore,
} from "@/lib/browser-trust-store";
import { getCachedUserLabel } from "@/lib/user-labels";
import { api } from "@/lib/api";
import { postMessageAck } from "@/lib/message-ack";
import { logger } from "@/lib/logger.js";
import { createInboundTrackingCoordinator } from "./inbound-tracking";
import {
  createRecipientDeviceDirectory,
} from "./recipient-directory";
import {
  createPeerIdentityRuntime,
  PeerIdentityContinuityError,
} from "./peer-identity-runtime";
import { createMessageSessionRuntime } from "./session-runtime";
import {
  persistConversations,
  persistPendingAckMessageIds,
  persistProcessedMessageIds,
  persistQuarantinedMessageIds,
  MAX_PROCESSED_MESSAGE_IDS,
} from "./conversation-persistence";
import type {
  Conversation,
  GetMessagesState,
  MessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";

interface SharedRuntimeState {
  historyBootstrapPromise: Promise<void> | null;
  historyBootstrapInFlightKey: string | null;
  historyBootstrapCompletedKey: string | null;
  pendingSyncPromise: Promise<void> | null;
  scheduledPendingSyncTimer: number | null;
  typingTimeoutByUser: Map<string, number>;
  sentReadReceipts: Set<string>;
  sessionLocks: Map<string, Promise<void>>;
  /** Maps message id (server or client) → conversationId for own messages.
   *  Used to skip O(total messages) scan on delivered/read status events. */
  ownMessageIndex: Map<string, string>;
  /** Timer handle for debounced conversation persistence. */
  pendingConversationPersistTimer: number | null;
}

export interface MessagesRuntimeShared {
  runtimeState: SharedRuntimeState;
  /** Index all own messages from a conversations snapshot (called after history restore). */
  indexOwnMessages: (conversations: Record<string, Conversation>) => void;
  /** Add a single own message to the index (called when sending or after first status event). */
  indexOwnMessage: (messageId: string, conversationId: string) => void;
  recipientDeviceDirectory: ReturnType<typeof createRecipientDeviceDirectory>;
  inboundTrackingCoordinator: ReturnType<
    typeof createInboundTrackingCoordinator<MessagesState>
  >;
  peerIdentityRuntime: ReturnType<typeof createPeerIdentityRuntime>;
  messageSessionRuntime: ReturnType<typeof createMessageSessionRuntime>;
  withSessionLock: <T>(deviceId: string, fn: () => Promise<T>) => Promise<T>;
  getStorageKey: () => CryptoKey | null;
  getMyDeviceId: () => string | null;
  getMyUserId: () => string | null;
  getMyKeyPair: () => KeyPair | null;
  warmPeerTrustStore: () => Promise<void>;
  getHistoryBootstrapKey: () => string | null;
  commitConversationIdentityUpdate: (
    set: SetMessagesState,
    nextConversations: Record<string, Conversation> | null
  ) => Promise<void>;
  assertPeerIdentityContinuity: (
    set: SetMessagesState,
    get: GetMessagesState,
    params: {
      recipientUserId: string;
      deviceId: string;
      observedIdentityKey: string;
    }
  ) => Promise<void>;
  resetRuntimeState: () => void;
}

function getStorageKey() {
  return useAuthStore.getState().storageKey;
}

function getMyDeviceId() {
  return useAuthStore.getState().deviceId;
}

function getMyUserId() {
  return useAuthStore.getState().userId;
}

function getMyKeyPair(): KeyPair | null {
  return useAuthStore.getState().identityDhKeyPair;
}

export function createMessagesRuntimeShared(): MessagesRuntimeShared {
  const runtimeState: SharedRuntimeState = {
    historyBootstrapPromise: null,
    historyBootstrapInFlightKey: null,
    historyBootstrapCompletedKey: null,
    pendingSyncPromise: null,
    scheduledPendingSyncTimer: null,
    typingTimeoutByUser: new Map<string, number>(),
    sentReadReceipts: new Set<string>(),
    sessionLocks: new Map<string, Promise<void>>(),
    ownMessageIndex: new Map<string, string>(),
    pendingConversationPersistTimer: null,
  };

  async function warmPeerTrustStore(): Promise<void> {
    const storageKey = getStorageKey();
    if (!storageKey) return;
    await warmBrowserTrustStore(storageKey);
  }

  function getHistoryBootstrapKey(): string | null {
    const userId = getMyUserId();
    const deviceId = getMyDeviceId();
    if (!userId || !deviceId) return null;
    return `${userId}:${deviceId}`;
  }

  async function withSessionLock<T>(
    deviceId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = runtimeState.sessionLocks.get(deviceId) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    runtimeState.sessionLocks.set(deviceId, lock);
    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }

  const recipientDeviceDirectory = createRecipientDeviceDirectory({
    getRequesterUserId: getMyUserId,
    fetchRecipientDevices: async (recipientUserId) => {
      const response = await api.get<{
        devices: Array<{
          deviceId: string;
          identityKeyPublic: string;
          signingKeyPublic?: string;
        }>;
      }>(`/users/${encodeURIComponent(recipientUserId)}/devices`, {
        headers: getUserContactGrantHeaders(recipientUserId),
      });
      return response.devices;
    },
    establishDirectRelationship: async () => undefined,
  });

  const inboundTrackingCoordinator =
    createInboundTrackingCoordinator<MessagesState>({
      persistence: {
        persistProcessedMessageIds,
        persistPendingAckMessageIds,
        persistQuarantinedMessageIds,
      },
      postMessageAck,
      maxProcessedMessageIds: MAX_PROCESSED_MESSAGE_IDS,
    });

  const peerIdentityRuntime = createPeerIdentityRuntime({
    readCachedPeerIdentityKey: (deviceId) => readCachedPeerIdentityKey(deviceId),
    writeCachedPeerIdentityKey: (deviceId, identityKey) => {
      primeCachedPeerIdentityKey(deviceId, identityKey);
      const storageKey = getStorageKey();
      if (!storageKey) return;
      persistCachedPeerIdentityKey(
        deviceId,
        identityKey,
        storageKey
      ).catch((error) => {
        logger.warn("[messages] failed to persist peer identity cache", error);
      });
    },
    resolveConversationUsername: (recipientUserId) =>
      getCachedUserLabel(recipientUserId) ?? recipientUserId,
  });

  const messageSessionRuntime = createMessageSessionRuntime({
    getStorageKey,
    getIdentityKeyPair: getMyKeyPair,
    fetchPrekeyBundle: async (userId, deviceId) =>
      api.get(
        `/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}/prekey-bundle`,
        {
        headers: getUserContactGrantHeaders(userId),
        }
      ),
  });

  async function commitConversationIdentityUpdate(
    set: SetMessagesState,
    nextConversations: Record<string, Conversation> | null
  ): Promise<void> {
    if (!nextConversations) {
      return;
    }
    set(() => ({ conversations: nextConversations }));
    await persistConversations(nextConversations);
  }

  async function assertPeerIdentityContinuity(
    set: SetMessagesState,
    get: GetMessagesState,
    params: {
      recipientUserId: string;
      deviceId: string;
      observedIdentityKey: string;
    }
  ): Promise<void> {
    await warmPeerTrustStore();
    const result = peerIdentityRuntime.checkPeerIdentityContinuity({
      conversations: get().conversations,
      recipientUserId: params.recipientUserId,
      deviceId: params.deviceId,
      observedIdentityKey: params.observedIdentityKey,
    });
    await commitConversationIdentityUpdate(set, result.nextConversations);
    if (result.blocked) {
      throw new PeerIdentityContinuityError(
        params.recipientUserId,
        params.deviceId
      );
    }
  }

  function indexOwnMessages(conversations: Record<string, Conversation>): void {
    for (const [conversationId, conversation] of Object.entries(conversations)) {
      for (const message of conversation.messages) {
        if (message.isOwn) {
          runtimeState.ownMessageIndex.set(message.id, conversationId);
        }
      }
    }
  }

  function indexOwnMessage(messageId: string, conversationId: string): void {
    runtimeState.ownMessageIndex.set(messageId, conversationId);
  }

  function resetRuntimeState() {
    runtimeState.historyBootstrapPromise = null;
    runtimeState.historyBootstrapInFlightKey = null;
    runtimeState.historyBootstrapCompletedKey = null;
    runtimeState.pendingSyncPromise = null;
    if (runtimeState.scheduledPendingSyncTimer !== null) {
      clearTimeout(runtimeState.scheduledPendingSyncTimer);
      runtimeState.scheduledPendingSyncTimer = null;
    }
    for (const timeoutId of runtimeState.typingTimeoutByUser.values()) {
      clearTimeout(timeoutId);
    }
    runtimeState.typingTimeoutByUser.clear();
    runtimeState.sentReadReceipts.clear();
    runtimeState.sessionLocks.clear();
    runtimeState.ownMessageIndex.clear();
    if (runtimeState.pendingConversationPersistTimer !== null) {
      clearTimeout(runtimeState.pendingConversationPersistTimer);
      runtimeState.pendingConversationPersistTimer = null;
    }
  }

  return {
    runtimeState,
    recipientDeviceDirectory,
    inboundTrackingCoordinator,
    peerIdentityRuntime,
    messageSessionRuntime,
    withSessionLock,
    getStorageKey,
    getMyDeviceId,
    getMyUserId,
    getMyKeyPair,
    warmPeerTrustStore,
    getHistoryBootstrapKey,
    commitConversationIdentityUpdate,
    assertPeerIdentityContinuity,
    resetRuntimeState,
    indexOwnMessages,
    indexOwnMessage,
  };
}
