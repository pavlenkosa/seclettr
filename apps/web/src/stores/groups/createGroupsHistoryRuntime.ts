import { api } from "@/lib/api";
import {
  canonicalizeGroupHistoryEnvelope,
  parseTimestamp,
  toGroupMessageResult,
  toProcessedMessageKey,
} from "./group-message-mapping";
import {
  formatUnknownGroupName,
  GROUP_UNKNOWN_SENDER_LABEL,
  scheduleGroupLabelRefresh,
} from "./group-display-helpers";
import { persistPendingGroupDecryptItem } from "./group-pending-decrypt-queue";
import {
  createGroupHistoryReplayContext,
  flushGroupHistoryReplayContext,
} from "@/lib/group-sender-key";
import type {
  GetGroupsState,
  GroupChatMessage,
  GroupsState,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

interface CreateGroupsHistoryRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
}

type HistoryEnvelope = Awaited<ReturnType<typeof api.getGroupHistory>>[number];
type NormalizedEnvelope = ReturnType<typeof canonicalizeGroupHistoryEnvelope>;

async function decodeHistoryEnvelopes(
  groupId: string,
  normalized: NormalizedEnvelope[],
  myDeviceId: string | null,
  storageKey: CryptoKey | null,
  memberDeviceLabels: Record<string, string>,
  refreshGroup: GroupsState["refreshGroup"],
  getCryptoEpoch: () => number
): Promise<{ mapped: GroupChatMessage[]; processedMessageKeys: string[] }> {
  const historyReplay = storageKey ? createGroupHistoryReplayContext() : undefined;
  const mapped: GroupChatMessage[] = [];
  const processedMessageKeys: string[] = [];

  for (const envelope of normalized) {
    const knownCryptoEpoch = getCryptoEpoch();
    if (envelope.cryptoEpoch > knownCryptoEpoch) {
      await refreshGroup(groupId, { refreshDeviceLabels: false });
      if (envelope.cryptoEpoch > getCryptoEpoch()) continue;
    }
    const messageKey = toProcessedMessageKey(groupId, envelope);
    const result = await toGroupMessageResult(
      groupId,
      envelope,
      myDeviceId,
      storageKey,
      memberDeviceLabels,
      historyReplay
    );
    if (!result) continue;
    if (result.kind === "pending") {
      await persistPendingGroupDecryptItem({
        messageKey,
        groupId,
        envelope,
        createdAt: result.fallbackMessage.timestamp,
        lastReason: "missing_sender_key",
      });
      continue;
    }
    mapped.push(result.message);
    processedMessageKeys.push(messageKey);
  }

  if (storageKey && historyReplay) {
    await flushGroupHistoryReplayContext(storageKey, historyReplay);
  }

  return { mapped, processedMessageKeys };
}

function normalizeHistory(rows: HistoryEnvelope[]): NormalizedEnvelope[] {
  return rows
    .map((row) => canonicalizeGroupHistoryEnvelope(row))
    .sort((left, right) => parseTimestamp(left.createdAt) - parseTimestamp(right.createdAt));
}

export function createGroupsHistoryRuntime({
  set,
  get,
  shared,
}: CreateGroupsHistoryRuntimeOptions) {
  return {
    loadGroupMessages: async (groupId: string) => {
      if (!groupId) return;
      if (get().loadingMessagesByGroup[groupId]) return;
      const existing = get().groups[groupId];
      if (existing?.historyLoaded) return;

      set((state) => ({
        loadingMessagesByGroup: { ...state.loadingMessagesByGroup, [groupId]: true },
      }));

      try {
        const historyMessages = await api.getGroupHistory(groupId, { limit: 100 });
        const myDeviceId = shared.getMyDeviceId();
        const storageKey = shared.getStorageKey();
        const memberDeviceLabels = get().groups[groupId]?.memberDeviceLabels ?? {};
        const normalized = normalizeHistory(historyMessages);

        const { mapped, processedMessageKeys } = await decodeHistoryEnvelopes(
          groupId,
          normalized,
          myDeviceId,
          storageKey,
          memberDeviceLabels,
          get().refreshGroup,
          () => get().groups[groupId]?.cryptoEpoch ?? 1
        );

        set((state) => {
          const currentGroup =
            state.groups[groupId] ??
            shared.createUnknownGroupChat(groupId, { name: formatUnknownGroupName(groupId) });
          const pendingLocal = currentGroup.messages.filter(
            (message) =>
              message.id.startsWith("local-") &&
              (message.status === "sending" || message.status === "error")
          );
          const nextMessages = [...mapped, ...pendingLocal].sort(
            (left, right) => left.timestamp - right.timestamp
          );
          const processedKeys = new Set(state.processedGroupMessageKeys);
          for (const messageKey of processedMessageKeys) {
            processedKeys.add(messageKey);
          }
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...currentGroup,
                messages: nextMessages,
                lastMessageAt: nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
                historyLoaded: true,
              },
            },
            processedGroupMessageKeys: shared.trimProcessedGroupMessageKeys(processedKeys),
          };
        });

        if (mapped.some((message) => !message.isOwn && message.senderLabel === GROUP_UNKNOWN_SENDER_LABEL)) {
          scheduleGroupLabelRefresh(groupId, get().refreshGroup);
        }
      } finally {
        set((state) => ({
          loadingMessagesByGroup: { ...state.loadingMessagesByGroup, [groupId]: false },
        }));
      }
    },
  };
}
