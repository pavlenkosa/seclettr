import type {
  SendGroupMessageRequestWire,
  SendGroupMessageResponse,
} from "@seclettr/protocol";
import { encryptGroupTextEnvelope } from "@/lib/group-sender-key";
import { formatSenderLabel } from "./group-display-helpers";
import {
  buildGroupMessagePayload,
  createLocalMessageIdentifiers,
} from "./groups-outbound-helpers";
import {
  persistGroupOutboundQueueItem,
  removeGroupOutboundQueueItem,
  type GroupOutboundQueueItem,
} from "./group-outbound-queue";
import type {
  GetGroupsState,
  GroupChatMessage,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";
import type { GroupMember } from "./types";

interface CreateGroupsOutboundTextRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  pendingGroupOutboundEnvelopes: Map<string, GroupOutboundQueueItem>;
  ensureGroupSenderKeys: (
    groupId: string,
    members: GroupMember[]
  ) => Promise<{
    myDeviceId: string;
    storageKey: CryptoKey;
  }>;
  deliverQueuedGroupOutboundItem: (
    item: GroupOutboundQueueItem
  ) => Promise<SendGroupMessageResponse>;
  markQueuedMessageSent: (
    item: GroupOutboundQueueItem,
    sentMessage: SendGroupMessageResponse
  ) => void;
}

/**
 * Owns the visible encrypted group text-send flow without touching
 * attachment upload or queue-resume behavior.
 */
export function createGroupsOutboundTextRuntime({
  set,
  get,
  shared,
  pendingGroupOutboundEnvelopes,
  ensureGroupSenderKeys,
  deliverQueuedGroupOutboundItem,
  markQueuedMessageSent,
}: CreateGroupsOutboundTextRuntimeOptions) {
  async function encryptGroupTextPayload(
    groupId: string,
    clientMessageId: string,
    content: string,
    reply?: { id: string; snippet: string }
  ): Promise<SendGroupMessageRequestWire> {
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    if (!myDeviceId || !storageKey) {
      throw new Error("Not authenticated");
    }

    const encryptedEnvelope = await encryptGroupTextEnvelope(
      storageKey,
      groupId,
      myDeviceId,
      content,
      reply
    );
    return buildGroupMessagePayload(
      encryptedEnvelope,
      clientMessageId,
      "text",
      get().groups[groupId]?.cryptoEpoch ?? 1
    );
  }

  return {
    async sendGroupText(
      groupId: string,
      text: string,
      reply?: { id: string; snippet: string }
    ): Promise<void> {
      const trimmed = text.trim();
      if (!trimmed) return;

      const myDeviceId = shared.getMyDeviceId();
      if (!myDeviceId) {
        throw new Error("Not authenticated");
      }

      const { optimisticId, clientMessageId } = createLocalMessageIdentifiers();
      const optimisticTimestamp = Date.now();
      const optimisticMessage: GroupChatMessage = {
        id: optimisticId,
        senderDeviceId: myDeviceId,
        senderLabel: formatSenderLabel(myDeviceId, true),
        content: trimmed,
        replyTo: reply ? { id: reply.id, content: reply.snippet } : undefined,
        timestamp: optimisticTimestamp,
        status: "sending",
        isOwn: true,
        rawType: "text",
      };

      set((state) => {
        const group =
          state.groups[groupId] ??
          shared.createUnknownGroupChat(groupId, {
            historyLoaded: true,
          });
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...group,
              messages: [...group.messages, optimisticMessage],
              lastMessageAt: optimisticTimestamp,
            },
          },
        };
      });

      try {
        await get().refreshGroup(groupId, { refreshDeviceLabels: false });
        const members = get().groups[groupId]?.members ?? [];
        await ensureGroupSenderKeys(groupId, members);
        const outboundPayload = await encryptGroupTextPayload(
          groupId,
          clientMessageId,
          trimmed,
          reply
        );
        const queueItem: GroupOutboundQueueItem = {
          localMessageId: optimisticId,
          groupId,
          clientMessageId,
          messageType: "text",
          payload: outboundPayload,
          optimisticMessage,
          createdAt: Date.now(),
          retryCount: 0,
        };
        pendingGroupOutboundEnvelopes.set(optimisticId, queueItem);
        await persistGroupOutboundQueueItem(queueItem);
        const sentMessage = await deliverQueuedGroupOutboundItem(queueItem);

        markQueuedMessageSent(queueItem, sentMessage);
        pendingGroupOutboundEnvelopes.delete(optimisticId);
        await removeGroupOutboundQueueItem(optimisticId).catch(() => null);
      } catch (error) {
        set((state) => {
          const group = state.groups[groupId];
          if (!group) return {};
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                messages: group.messages.map((message) =>
                  message.id === optimisticId
                    ? { ...message, status: "error" }
                    : message
                ),
              },
            },
          };
        });
        throw error;
      }
    },
  };
}
