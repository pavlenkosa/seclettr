export interface InboundTrackingStateShape {
  processedMessageIds: Set<string>;
  pendingAckMessageIds: Set<string>;
  quarantinedMessageIds: Set<string>;
}

export interface InboundTrackingSnapshot extends InboundTrackingStateShape {}

interface InboundTrackingPersistence {
  persistProcessedMessageIds: (processedMessageIds: Set<string>) => Promise<void>;
  persistPendingAckMessageIds: (pendingAckMessageIds: Set<string>) => Promise<void>;
  persistQuarantinedMessageIds: (quarantinedMessageIds: Set<string>) => Promise<void>;
}

interface CreateInboundTrackingCoordinatorOptions {
  persistence: InboundTrackingPersistence;
  postMessageAck: (messageId: string) => Promise<string>;
  maxProcessedMessageIds?: number;
}

type StateSetter<TState> = (
  partial: Partial<TState> | ((state: TState) => Partial<TState>)
) => void;

const DEFAULT_MAX_TRACKED_MESSAGE_IDS = 5_000;

export function trimTrackedMessageIds(
  ids: Set<string>,
  maxTrackedMessageIds = DEFAULT_MAX_TRACKED_MESSAGE_IDS
): Set<string> {
  if (ids.size <= maxTrackedMessageIds) return ids;
  const next = new Set(ids);
  while (next.size > maxTrackedMessageIds) {
    const oldest = next.values().next().value;
    if (!oldest) break;
    next.delete(oldest);
  }
  return next;
}

export function createInboundTrackingCoordinator<
  TState extends InboundTrackingStateShape,
>(options: CreateInboundTrackingCoordinatorOptions) {
  const maxTrackedMessageIds =
    options.maxProcessedMessageIds ?? DEFAULT_MAX_TRACKED_MESSAGE_IDS;

  const getSnapshot = (
    state: Pick<
      InboundTrackingStateShape,
      "processedMessageIds" | "pendingAckMessageIds" | "quarantinedMessageIds"
    >
  ): InboundTrackingSnapshot => {
    return {
      processedMessageIds: trimTrackedMessageIds(
        new Set(state.processedMessageIds),
        maxTrackedMessageIds
      ),
      pendingAckMessageIds: trimTrackedMessageIds(
        new Set(state.pendingAckMessageIds),
        maxTrackedMessageIds
      ),
      quarantinedMessageIds: trimTrackedMessageIds(
        new Set(state.quarantinedMessageIds),
        maxTrackedMessageIds
      ),
    };
  };

  const persistSnapshot = async (
    snapshot: InboundTrackingSnapshot
  ): Promise<void> => {
    await Promise.all([
      options.persistence.persistProcessedMessageIds(snapshot.processedMessageIds),
      options.persistence.persistPendingAckMessageIds(snapshot.pendingAckMessageIds),
      options.persistence.persistQuarantinedMessageIds(snapshot.quarantinedMessageIds),
    ]);
  };

  const commitTerminalMessageState = async (
    set: StateSetter<TState>,
    get: () => TState,
    messageId: string,
    commitOptions?: { quarantined?: boolean }
  ): Promise<void> => {
    let nextSnapshot: InboundTrackingSnapshot | null = null;

    set((state) => {
      const processedMessageIds = new Set(state.processedMessageIds);
      const pendingAckMessageIds = new Set(state.pendingAckMessageIds);
      const quarantinedMessageIds = new Set(state.quarantinedMessageIds);

      processedMessageIds.add(messageId);
      pendingAckMessageIds.add(messageId);
      if (commitOptions?.quarantined) {
        quarantinedMessageIds.add(messageId);
      }

      nextSnapshot = getSnapshot({
        processedMessageIds,
        pendingAckMessageIds,
        quarantinedMessageIds,
      });

      return nextSnapshot as Partial<TState>;
    });

    if (nextSnapshot) {
      await persistSnapshot(nextSnapshot);
    }

    if (!get().processedMessageIds.has(messageId)) {
      throw new Error(`Failed to persist terminal inbound state for ${messageId}`);
    }
  };

  const clearPendingAckMessageState = async (
    set: StateSetter<TState>,
    get: () => TState,
    messageId: string
  ): Promise<void> => {
    if (!get().pendingAckMessageIds.has(messageId)) return;

    let nextSnapshot: InboundTrackingSnapshot | null = null;
    set((state) => {
      if (!state.pendingAckMessageIds.has(messageId)) return {};
      const pendingAckMessageIds = new Set(state.pendingAckMessageIds);
      pendingAckMessageIds.delete(messageId);
      nextSnapshot = getSnapshot({
        processedMessageIds: state.processedMessageIds,
        pendingAckMessageIds,
        quarantinedMessageIds: state.quarantinedMessageIds,
      });
      return nextSnapshot as Partial<TState>;
    });

    if (nextSnapshot) {
      await persistSnapshot(nextSnapshot);
    }
  };

  const flushPendingAckForMessage = async (
    set: StateSetter<TState>,
    get: () => TState,
    messageId: string
  ): Promise<string> => {
    if (!get().pendingAckMessageIds.has(messageId)) return "not_pending";

    const ackResult = await options.postMessageAck(messageId);
    if (
      ackResult === "acked" ||
      ackResult === "already_acked" ||
      ackResult === "terminal_error"
    ) {
      await clearPendingAckMessageState(set, get, messageId);
    }
    return ackResult;
  };

  const flushPendingAcknowledgements = async (
    set: StateSetter<TState>,
    get: () => TState
  ): Promise<void> => {
    const pendingAckMessageIds = [...get().pendingAckMessageIds];
    for (const messageId of pendingAckMessageIds) {
      await flushPendingAckForMessage(set, get, messageId);
    }
  };

  return {
    getSnapshot,
    commitTerminalMessageState,
    clearPendingAckMessageState,
    flushPendingAckForMessage,
    flushPendingAcknowledgements,
  };
}
