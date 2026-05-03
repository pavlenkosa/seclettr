import { useAuthStore } from "@/stores/auth";
import { trimTrackedMessageIds } from "@/stores/messages/inbound-tracking";
import { formatUnknownGroupName } from "./group-helpers";
import type { GroupChat } from "./groups-store-runtime-types";

const MAX_PROCESSED_GROUP_MESSAGE_KEYS = 5_000;

export interface GroupsRuntimeShared {
  getMyUserId: () => string | null;
  getMyDeviceId: () => string | null;
  getStorageKey: () => CryptoKey | null;
  createUnknownGroupChat: (
    groupId: string,
    overrides?: Partial<GroupChat>
  ) => GroupChat;
  trimProcessedGroupMessageKeys: (keys: Set<string>) => Set<string>;
}

function getMyUserId() {
  return useAuthStore.getState().userId;
}

function getMyDeviceId() {
  return useAuthStore.getState().deviceId;
}

function getStorageKey() {
  return useAuthStore.getState().storageKey;
}

function createUnknownGroupChat(
  groupId: string,
  overrides: Partial<GroupChat> = {}
): GroupChat {
  const defaultMessages = overrides.messages ?? [];
  const defaultLastMessageAt =
    overrides.lastMessageAt ?? defaultMessages.at(-1)?.timestamp ?? 0;

  return {
    groupId,
    name: formatUnknownGroupName(groupId),
    createdAt: new Date().toISOString(),
    cryptoEpoch: 1,
    members: [],
    memberDeviceLabels: {},
    messages: defaultMessages,
    lastMessageAt: defaultLastMessageAt,
    unreadCount: 0,
    historyLoaded: false,
    ...overrides,
  };
}

function trimProcessedGroupMessageKeys(keys: Set<string>): Set<string> {
  return trimTrackedMessageIds(keys, MAX_PROCESSED_GROUP_MESSAGE_KEYS);
}

export function createGroupsRuntimeShared(): GroupsRuntimeShared {
  return {
    getMyUserId,
    getMyDeviceId,
    getStorageKey,
    createUnknownGroupChat,
    trimProcessedGroupMessageKeys,
  };
}
