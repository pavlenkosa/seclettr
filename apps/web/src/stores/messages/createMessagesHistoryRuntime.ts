import { PendingMessagesResponseSchema } from "@seclettr/protocol";
import { api } from "@/lib/api";
import { primeUserLabelCache, shouldHydrateUserLabel } from "@/lib/user-labels";
import {
  restoreConversations,
  restorePendingAckMessageIds,
  restorePendingReadReceiptMessageIds,
  restoreProcessedMessageIds,
  restoreQuarantinedMessageIds,
  trimMessageIds,
} from "./conversation-persistence";
import type {
  Conversation,
  GetMessagesState,
  Message,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

interface CreateMessagesHistoryRuntimeOptions {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
}

interface RestoredHistorySnapshot {
  conversations: Awaited<ReturnType<typeof restoreConversations>>;
  processedMessageIds: Awaited<ReturnType<typeof restoreProcessedMessageIds>>;
  pendingAckMessageIds: Awaited<ReturnType<typeof restorePendingAckMessageIds>>;
  pendingReadReceiptMessageIds: Awaited<ReturnType<typeof restorePendingReadReceiptMessageIds>>;
  quarantinedMessageIds: Awaited<ReturnType<typeof restoreQuarantinedMessageIds>>;
}

function shouldRestoreProcessedMessageId(message: Message): boolean {
  if (message.isOwn) return true;
  if (message.status !== "error") return true;
  return (
    message.errorKind === "corrupted_payload" ||
    message.errorKind === "trust_failure"
  );
}

function getMessageStatusPriority(status: Message["status"]): number {
  switch (status) {
    case "read":
      return 4;
    case "delivered":
      return 3;
    case "sent":
      return 2;
    case "sending":
      return 1;
    case "error":
    default:
      return 0;
  }
}

function pickPreferredMessage(current: Message, candidate: Message): Message {
  const currentPriority = getMessageStatusPriority(current.status);
  const candidatePriority = getMessageStatusPriority(candidate.status);
  if (candidatePriority > currentPriority) return candidate;
  if (candidatePriority < currentPriority) return current;

  if (candidate.timestamp > current.timestamp) return candidate;
  if (candidate.timestamp < current.timestamp) return current;

  if (!candidate.errorKind && current.errorKind) return candidate;
  if (candidate.errorKind && !current.errorKind) return current;
  return current;
}

function mergeConversationMessages(
  restoredMessages: Message[],
  liveMessages: Message[]
): Message[] {
  const mergedById = new Map<string, Message>();
  for (const message of restoredMessages) {
    mergedById.set(message.id, message);
  }
  for (const message of liveMessages) {
    const existing = mergedById.get(message.id);
    if (!existing) {
      mergedById.set(message.id, message);
      continue;
    }
    mergedById.set(message.id, pickPreferredMessage(existing, message));
  }
  return [...mergedById.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    return left.id.localeCompare(right.id);
  });
}

function mergeConversationSnapshot(
  restoredConversation: Conversation,
  liveConversation: Conversation
): Conversation {
  const mergedMessages = mergeConversationMessages(
    restoredConversation.messages,
    liveConversation.messages
  );
  const mergedLastMessageAt = Math.max(
    restoredConversation.lastMessageAt,
    liveConversation.lastMessageAt,
    mergedMessages.at(-1)?.timestamp ?? 0
  );
  const mergedPeerIdentityByDevice = {
    ...restoredConversation.peerIdentityByDevice,
    ...liveConversation.peerIdentityByDevice,
  };
  const mergedPeerIdentityAlertsByDevice = {
    ...restoredConversation.peerIdentityAlertsByDevice,
    ...liveConversation.peerIdentityAlertsByDevice,
  };

  return {
    ...restoredConversation,
    ...liveConversation,
    username: shouldHydrateUserLabel(
      liveConversation.username,
      liveConversation.userId
    )
      ? restoredConversation.username
      : liveConversation.username,
    messages: mergedMessages,
    lastMessageAt: mergedLastMessageAt,
    // Preserve the latest live unread state to avoid re-introducing stale unread counters.
    unreadCount: liveConversation.unreadCount,
    peerIdentityByDevice:
      Object.keys(mergedPeerIdentityByDevice).length > 0
        ? mergedPeerIdentityByDevice
        : undefined,
    peerIdentityAlertsByDevice:
      Object.keys(mergedPeerIdentityAlertsByDevice).length > 0
        ? mergedPeerIdentityAlertsByDevice
        : undefined,
  };
}

function mergeRestoredConversations(
  restoredConversations: Record<string, Conversation>,
  liveConversations: Record<string, Conversation>
): Record<string, Conversation> {
  const mergedConversations: Record<string, Conversation> = {
    ...restoredConversations,
  };
  for (const [userId, liveConversation] of Object.entries(liveConversations)) {
    const restoredConversation = mergedConversations[userId];
    if (!restoredConversation) {
      mergedConversations[userId] = liveConversation;
      continue;
    }
    mergedConversations[userId] = mergeConversationSnapshot(
      restoredConversation,
      liveConversation
    );
  }
  return mergedConversations;
}

async function restoreHistorySnapshot(): Promise<RestoredHistorySnapshot> {
  const conversations = await restoreConversations();
  const processedMessageIds = await restoreProcessedMessageIds();
  const pendingAckMessageIds = await restorePendingAckMessageIds();
  const pendingReadReceiptMessageIds = await restorePendingReadReceiptMessageIds();
  const quarantinedMessageIds = await restoreQuarantinedMessageIds();

  return {
    conversations,
    processedMessageIds,
    pendingAckMessageIds,
    pendingReadReceiptMessageIds,
    quarantinedMessageIds,
  };
}

function hasRestoredTrackingState(snapshot: RestoredHistorySnapshot): boolean {
  return Boolean(
    snapshot.processedMessageIds ||
    snapshot.pendingAckMessageIds ||
    snapshot.pendingReadReceiptMessageIds ||
    snapshot.quarantinedMessageIds
  );
}

function mergePendingProcessedMessageIds(snapshot: RestoredHistorySnapshot): Set<string> {
  return new Set([
    ...(snapshot.pendingAckMessageIds ?? []),
    ...(snapshot.quarantinedMessageIds ?? []),
  ]);
}

function applyRestoredTrackingState(
  set: SetMessagesState,
  snapshot: RestoredHistorySnapshot,
  additionalProcessedMessageIds: Set<string> = new Set()
): void {
  set((state) => ({
    processedMessageIds: trimMessageIds(
      new Set([
        ...state.processedMessageIds,
        ...additionalProcessedMessageIds,
        ...(snapshot.processedMessageIds ?? []),
        ...mergePendingProcessedMessageIds(snapshot),
      ])
    ),
    pendingAckMessageIds: trimMessageIds(
      new Set([
        ...state.pendingAckMessageIds,
        ...(snapshot.pendingAckMessageIds ?? []),
      ])
    ),
    pendingReadReceiptMessageIds: trimMessageIds(
      new Set([
        ...state.pendingReadReceiptMessageIds,
        ...(snapshot.pendingReadReceiptMessageIds ?? []),
      ])
    ),
    quarantinedMessageIds: trimMessageIds(
      new Set([
        ...state.quarantinedMessageIds,
        ...(snapshot.quarantinedMessageIds ?? []),
      ])
    ),
  }));
}

function restoreProcessedIdsFromConversations(
  conversations: Record<string, Conversation>,
  processedMessageIds: RestoredHistorySnapshot["processedMessageIds"]
): Set<string> {
  const restoredIds = new Set<string>(processedMessageIds ?? []);

  for (const conversation of Object.values(conversations)) {
    for (const message of conversation.messages) {
      if (shouldRestoreProcessedMessageId(message)) {
        restoredIds.add(message.id);
      }
    }
  }

  return restoredIds;
}

function primeRestoredConversationLabels(conversations: Record<string, Conversation>, get: GetMessagesState): void {
  for (const conversation of Object.values(conversations)) {
    if (shouldHydrateUserLabel(conversation.username, conversation.userId)) {
      get().ensureConversationUsername(conversation.userId);
    } else {
      primeUserLabelCache(conversation.userId, conversation.username);
    }
  }
}

function applyRestoredConversations(
  set: SetMessagesState,
  get: GetMessagesState,
  shared: MessagesRuntimeShared,
  snapshot: RestoredHistorySnapshot
): void {
  if (!snapshot.conversations) {
    applyRestoredTrackingState(set, snapshot);
    return;
  }

  const mergedConversations = mergeRestoredConversations(
    snapshot.conversations,
    get().conversations
  );
  const restoredIds = trimMessageIds(
    new Set([
      ...restoreProcessedIdsFromConversations(
        mergedConversations,
        snapshot.processedMessageIds
      ),
      ...mergePendingProcessedMessageIds(snapshot),
    ])
  );

  primeRestoredConversationLabels(mergedConversations, get);
  set((state) => ({
    conversations: mergedConversations,
    processedMessageIds: trimMessageIds(
      new Set([...state.processedMessageIds, ...restoredIds])
    ),
    pendingAckMessageIds: trimMessageIds(
      new Set([
        ...state.pendingAckMessageIds,
        ...(snapshot.pendingAckMessageIds ?? []),
      ])
    ),
    pendingReadReceiptMessageIds: trimMessageIds(
      new Set([
        ...state.pendingReadReceiptMessageIds,
        ...(snapshot.pendingReadReceiptMessageIds ?? []),
      ])
    ),
    quarantinedMessageIds: trimMessageIds(
      new Set([
        ...state.quarantinedMessageIds,
        ...(snapshot.quarantinedMessageIds ?? []),
      ])
    ),
  }));
  shared.indexOwnMessages(mergedConversations);
}

export function createMessagesHistoryRuntime({
  set,
  get,
  shared,
}: CreateMessagesHistoryRuntimeOptions) {
  async function syncPendingMessages(): Promise<void> {
    if (shared.runtimeState.pendingSyncPromise) {
      await shared.runtimeState.pendingSyncPromise;
      return;
    }

    shared.runtimeState.pendingSyncPromise = (async () => {
      const { messages } = PendingMessagesResponseSchema.parse(
        await api.get<unknown>("/messages/pending")
      );
      for (const message of messages) {
        await get().handleIncomingMessage({
          type: "message.new",
          message,
        });
      }
    })().finally(() => {
      shared.runtimeState.pendingSyncPromise = null;
    });

    await shared.runtimeState.pendingSyncPromise;
  }

  async function loadHistory(): Promise<void> {
    const bootstrapKey = shared.getHistoryBootstrapKey();
    if (!bootstrapKey) return;
    if (shared.runtimeState.historyBootstrapCompletedKey === bootstrapKey) return;

    if (shared.runtimeState.historyBootstrapPromise) {
      if (shared.runtimeState.historyBootstrapInFlightKey === bootstrapKey) {
        await shared.runtimeState.historyBootstrapPromise;
        return;
      }
      await shared.runtimeState.historyBootstrapPromise.catch(() => null);
    }

    shared.runtimeState.historyBootstrapInFlightKey = bootstrapKey;
    shared.runtimeState.historyBootstrapPromise = (async () => {
      await shared.warmPeerTrustStore();
      const snapshot = await restoreHistorySnapshot();

      if (snapshot.conversations || hasRestoredTrackingState(snapshot)) {
        applyRestoredConversations(set, get, shared, snapshot);
      }

      await shared.inboundTrackingCoordinator.flushPendingAcknowledgements(
        set,
        get
      );
      await syncPendingMessages();
      await shared.inboundTrackingCoordinator.flushPendingAcknowledgements(
        set,
        get
      );

      shared.runtimeState.historyBootstrapCompletedKey = bootstrapKey;
      set({ historyLoaded: true });
    })().finally(() => {
      shared.runtimeState.historyBootstrapPromise = null;
      shared.runtimeState.historyBootstrapInFlightKey = null;
    });

    await shared.runtimeState.historyBootstrapPromise;
  }

  return {
    loadHistory,
    syncPendingMessages,
  };
}
