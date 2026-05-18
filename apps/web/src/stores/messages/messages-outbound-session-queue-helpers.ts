import {
  deserializeRatchetState,
  serializeRatchetState,
  type RatchetState,
} from "@seclettr/crypto";
import type { DirectMessageDeliveryMeta } from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";
import {
  persistOutboundQueueItem,
  removeOutboundQueueItem,
  type OutboundQueueItem,
  type OutboundQueueSessionCommit,
} from "./outbound-queue";

/**
 * Session/queue helper layer for encrypted outbound direct-message runtime.
 *
 * Owns only queue/session orchestration helpers: sorted session locking,
 * queued session-commit apply/save semantics, and partial-delivery queue
 * settlement. It does not own visible message send flows, optimistic bubbles,
 * or final HTTP `/messages` send orchestration.
 */

export interface DirectDeviceSessionCommit {
  recipientDeviceId: string;
  state: RatchetState;
  serializedState: OutboundQueueSessionCommit["state"];
}

export interface MessagesOutboundSessionQueueHelpers {
  withDeviceSessionLocks: <T>(
    deviceIds: string[],
    fn: () => Promise<T>
  ) => Promise<T>;
  saveGeneratedSessionCommits: (
    sessionCommits: DirectDeviceSessionCommit[]
  ) => Promise<void>;
  applyQueuedSessionCommits: (item: OutboundQueueItem) => Promise<void>;
  applyPendingSessionCommitsForRecipient: (
    recipientUserId: string
  ) => Promise<void>;
  settleAcceptedDirectQueueItem: (
    item: OutboundQueueItem,
    deliveries: DirectMessageDeliveryMeta[] | undefined
  ) => Promise<boolean>;
}

export function toOutboundQueueSessionCommits(
  sessionCommits: DirectDeviceSessionCommit[]
): OutboundQueueSessionCommit[] {
  return sessionCommits.map((commit) => ({
    recipientDeviceId: commit.recipientDeviceId,
    state: commit.serializedState,
  }));
}

export function createMessagesOutboundSessionQueueHelpers(
  shared: MessagesRuntimeShared,
  loadAllPendingOutboundItems: () => Promise<OutboundQueueItem[]>
): MessagesOutboundSessionQueueHelpers {
  async function withDeviceSessionLocks<T>(
    deviceIds: string[],
    fn: () => Promise<T>
  ): Promise<T> {
    const uniqueDeviceIds = [...new Set(deviceIds)].sort((left, right) =>
      left.localeCompare(right)
    );

    const run = (index: number): Promise<T> => {
      const deviceId = uniqueDeviceIds[index];
      if (!deviceId) return fn();
      return shared.withSessionLock(deviceId, () => run(index + 1));
    };

    return run(0);
  }

  async function saveGeneratedSessionCommits(
    sessionCommits: DirectDeviceSessionCommit[]
  ): Promise<void> {
    for (const commit of sessionCommits) {
      await shared.messageSessionRuntime.saveSession(
        commit.recipientDeviceId,
        commit.state
      );
    }
  }

  async function applyQueuedSessionCommits(
    item: OutboundQueueItem
  ): Promise<void> {
    const sessionCommits = item.sessionCommits ?? [];
    if (sessionCommits.length === 0) return;

    await withDeviceSessionLocks(
      sessionCommits.map((commit) => commit.recipientDeviceId),
      async () => {
        for (const commit of sessionCommits) {
          const currentState = await shared.messageSessionRuntime.loadSession(
            commit.recipientDeviceId
          );
          if (!shouldApplyQueuedSessionCommit(currentState, commit.state)) {
            continue;
          }
          const queuedState = await deserializeRatchetState(commit.state);
          await shared.messageSessionRuntime.saveSession(
            commit.recipientDeviceId,
            queuedState
          );
        }
      }
    );
  }

  async function applyPendingSessionCommitsForRecipient(
    recipientUserId: string
  ): Promise<void> {
    const pendingItems = await loadAllPendingOutboundItems();
    for (const item of pendingItems) {
      if (item.recipientUserId !== recipientUserId) continue;
      await applyQueuedSessionCommits(item);
    }
  }

  async function settleAcceptedDirectQueueItem(
    item: OutboundQueueItem,
    deliveries: DirectMessageDeliveryMeta[] | undefined
  ): Promise<boolean> {
    if (!deliveries) {
      await removeOutboundQueueItem(item.clientMessageId);
      return true;
    }

    const acceptedDeviceIds = new Set(
      deliveries.map((delivery) => delivery.recipientDeviceId)
    );
    const remainingEnvelopes = item.envelopes.filter(
      (envelope) => !acceptedDeviceIds.has(envelope.recipientDeviceId)
    );

    if (remainingEnvelopes.length === 0) {
      await removeOutboundQueueItem(item.clientMessageId);
      return true;
    }

    await persistOutboundQueueItem({
      ...item,
      envelopes: remainingEnvelopes,
      sessionCommits: item.sessionCommits?.filter((commit) =>
        remainingEnvelopes.some(
          (envelope) => envelope.recipientDeviceId === commit.recipientDeviceId
        )
      ),
    });
    return false;
  }

  return {
    withDeviceSessionLocks,
    saveGeneratedSessionCommits,
    applyQueuedSessionCommits,
    applyPendingSessionCommitsForRecipient,
    settleAcceptedDirectQueueItem,
  };
}

function shouldApplyQueuedSessionCommit(
  currentState: RatchetState | null,
  queuedState: OutboundQueueSessionCommit["state"]
): boolean {
  if (!currentState) return true;

  const current = serializeRatchetState(currentState);
  const sameSendingChain =
    current.DHs_pub === queuedState.DHs_pub &&
    current.DHr === queuedState.DHr;

  return sameSendingChain && current.Ns < queuedState.Ns;
}
