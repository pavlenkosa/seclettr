import type {
  GroupMemberRole,
  WsServerMessage,
} from "@seclettr/protocol";
import type { GroupChat } from "./types";
export type { GroupChat, GroupChatMessage, GroupMember } from "./types";

export interface GroupsState {
  groups: Record<string, GroupChat>;
  activeGroupId: string | null;
  loadingGroups: boolean;
  errorGroups: string | null;
  loadingMessagesByGroup: Record<string, boolean>;
  processedGroupMessageKeys: Set<string>;

  setActiveGroup: (groupId: string | null) => void;
  loadGroups: () => Promise<void>;
  refreshGroup: (
    groupId: string,
    options?: { refreshDeviceLabels?: boolean }
  ) => Promise<void>;
  createGroup: (name: string, memberUserIds: string[]) => Promise<GroupChat>;
  addGroupMembers: (
    groupId: string,
    userIds: string[],
    role?: GroupMemberRole
  ) => Promise<void>;
  removeGroupMember: (groupId: string, memberUserId: string) => Promise<void>;
  updateGroupMemberRole: (
    groupId: string,
    memberUserId: string,
    role: "admin" | "member"
  ) => Promise<void>;
  loadGroupMessages: (groupId: string) => Promise<void>;
  sendGroupText: (
    groupId: string,
    text: string,
    reply?: { id: string; snippet: string }
  ) => Promise<void>;
  retryGroupMessage: (groupId: string, messageId: string) => Promise<void>;
  sendGroupFileAttachment: (groupId: string, file: File, mediaGroupId?: string) => Promise<void>;
  sendGroupVoiceNote: (groupId: string, blob: Blob, durationMs: number) => Promise<void>;
  sendGroupVideoNote: (groupId: string, blob: Blob, durationMs: number) => Promise<void>;
  handleIncomingGroupMessage: (
    msg: WsServerMessage & { type: "group_message.new" }
  ) => Promise<void>;
  startListening: () => () => void;
  reset: () => void;
}

export type SetGroupsState = (
  partial:
    | Partial<GroupsState>
    | ((state: GroupsState) => Partial<GroupsState>)
) => void;

export type GetGroupsState = () => GroupsState;
