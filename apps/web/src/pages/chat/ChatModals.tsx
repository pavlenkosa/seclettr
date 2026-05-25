import { memo, useCallback, useMemo } from "react";
import { NewChatModal } from "@/chats/presentation/modals/NewChatModal";
import { NewGroupModal } from "@/chats/presentation/modals/NewGroupModal";
import { GroupInfoModal, type GroupInfoActions, type GroupInfoMember } from "@/chats/presentation/modals/GroupInfoModal";
import { SecurityModal } from "@/chats/presentation/modals/SecurityModal";
import { ChatTypePickerModal } from "@/chats/presentation/modals/ChatTypePickerModal";
import { useGroupsStore } from "@/stores/groups";
import { usePlainGroupsStore } from "@/stores/plain";
import type {
  SecurityWorkspaceState,
  WorkspaceEntryState,
  WorkspaceInteractions,
  WorkspaceUiState,
} from "./chat-page-types";

export const ChatModals = memo(function ChatModals({
  workspaceUiState,
  interactions,
  createGroup,
  createPlainGroup,
  handleSelectThread,
  activeGroup,
  activePlainGroup,
  userId,
  security,
  activeConversation,
  acceptPeerIdentityChange,
}: {
  workspaceUiState: WorkspaceUiState;
  interactions: WorkspaceInteractions;
  createGroup: WorkspaceEntryState["createGroup"];
  createPlainGroup: WorkspaceEntryState["createPlainGroup"];
  handleSelectThread: WorkspaceEntryState["handleSelectThread"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  activePlainGroup: WorkspaceEntryState["activePlainGroup"];
  userId: string | null;
  security: SecurityWorkspaceState;
  activeConversation: WorkspaceEntryState["activeConversation"];
  acceptPeerIdentityChange: WorkspaceEntryState["acceptPeerIdentityChange"];
}) {
  // E2EE group store actions used by the info modal.
  const e2eeAddMembers = useGroupsStore((state) => state.addGroupMembers);
  const e2eeRemoveMember = useGroupsStore((state) => state.removeGroupMember);
  const e2eeUpdateRole = useGroupsStore((state) => state.updateGroupMemberRole);

  // Plain group store actions.
  const plainRename = usePlainGroupsStore((state) => state.renameGroup);
  const plainAddMember = usePlainGroupsStore((state) => state.addMember);
  const plainRemoveMember = usePlainGroupsStore((state) => state.removeMember);
  const plainUpdateRole = usePlainGroupsStore((state) => state.updateMemberRole);
  const plainUploadAvatar = usePlainGroupsStore((state) => state.uploadGroupAvatar);
  const plainDeleteAvatar = usePlainGroupsStore((state) => state.deleteGroupAvatar);
  const plainUpdateDescription = usePlainGroupsStore((state) => state.updateGroupDescription);

  const handleNewGroupCreate = useCallback(
    async ({ name, memberUserIds, kind }: { name: string; memberUserIds: string[]; kind: "e2ee" | "plain" }) => {
      if (kind === "plain") {
        const createdGroupId = await createPlainGroup(name, memberUserIds);
        workspaceUiState.closeNewGroup();
        handleSelectThread({ kind: "plain-group", id: createdGroupId });
        return;
      }
      const created = await createGroup(name, memberUserIds);
      workspaceUiState.closeNewGroup();
      handleSelectThread({ kind: "group", id: created.groupId });
    },
    [createGroup, createPlainGroup, handleSelectThread, workspaceUiState]
  );

  const handleVerifyGroupMember = useCallback(
    (member: Parameters<SecurityWorkspaceState["handleVerifyGroupMember"]>[0]) => {
      workspaceUiState.closeGroupMembers();
      void security.handleVerifyGroupMember(member);
    },
    [security, workspaceUiState]
  );

  const handleAcceptDirectIdentityChange = useCallback(
    (peerDeviceId: string) => {
      if (activeConversation) {
        void acceptPeerIdentityChange(activeConversation.userId, peerDeviceId);
      }
    },
    [acceptPeerIdentityChange, activeConversation]
  );

  // ── Build the GroupInfoModal contract for the active group (E2EE or plain).
  // Only one is non-null at a time — selection lives in WorkspaceEntryState.
  const e2eeGroupInfo = useMemo(() => {
    if (!activeGroup) return null;
    const members: GroupInfoMember[] = activeGroup.members.map((m) => ({
      userId: m.userId,
      username: m.username,
      role: m.role ?? "member",
    }));
    const actions: GroupInfoActions = {
      addMember: (id, role) => e2eeAddMembers(activeGroup.groupId, [id], role),
      removeMember: (id) => e2eeRemoveMember(activeGroup.groupId, id),
      updateRole: (id, role) => e2eeUpdateRole(activeGroup.groupId, id, role === "owner" ? "admin" : role),
      verifyMember: (m) => {
        // Look the original group member up so we keep joinedAt + the strict
        // role union expected by the security flow.
        const original = activeGroup.members.find((x) => x.userId === m.userId);
        if (original) handleVerifyGroupMember(original);
      },
      // E2EE store has no rename API yet — the pencil stays hidden.
    };
    return {
      members,
      actions,
      groupId: activeGroup.groupId,
      groupName: activeGroup.name,
      avatarKey: null,
      description: null,
    };
  }, [activeGroup, e2eeAddMembers, e2eeRemoveMember, e2eeUpdateRole, handleVerifyGroupMember]);

  const plainGroupInfo = useMemo(() => {
    if (!activePlainGroup) return null;
    const members: GroupInfoMember[] = activePlainGroup.members.map((m) => ({
      userId: m.userId,
      username: m.username,
      role: m.role,
    }));
    const actions: GroupInfoActions = {
      rename: (name) => plainRename(activePlainGroup.groupId, name),
      uploadAvatar: (file) => plainUploadAvatar(activePlainGroup.groupId, file),
      deleteAvatar: () => plainDeleteAvatar(activePlainGroup.groupId),
      updateDescription: (desc) => plainUpdateDescription(activePlainGroup.groupId, desc),
      addMember: (id) => plainAddMember(activePlainGroup.groupId, id),
      removeMember: (id) => plainRemoveMember(activePlainGroup.groupId, id),
      updateRole: (id, role) => plainUpdateRole(activePlainGroup.groupId, id, role),
    };
    return {
      members,
      actions,
      groupId: activePlainGroup.groupId,
      groupName: activePlainGroup.name,
      avatarKey: activePlainGroup.avatarKey,
      description: activePlainGroup.description,
    };
  }, [activePlainGroup, plainAddMember, plainRemoveMember, plainRename, plainUpdateRole, plainUploadAvatar, plainDeleteAvatar, plainUpdateDescription]);

  const activeGroupInfo = e2eeGroupInfo ?? plainGroupInfo;
  const activeGroupKind: "e2ee" | "plain" = e2eeGroupInfo ? "e2ee" : "plain";

  return (
    <>
      {workspaceUiState.showNewChat && (
        <NewChatModal
          onClose={workspaceUiState.closeNewChat}
          onSelect={interactions.handleNewChatSelect}
        />
      )}
      {workspaceUiState.showChatTypePicker && workspaceUiState.pendingChatUser && (
        <ChatTypePickerModal
          userId={workspaceUiState.pendingChatUser.userId}
          username={workspaceUiState.pendingChatUser.username}
          onClose={workspaceUiState.closeChatTypePicker}
          onSelectE2ee={interactions.handleNewChatSelectE2ee}
          onSelectPlain={interactions.handleNewChatSelectPlain}
        />
      )}
      {workspaceUiState.showNewGroup && (
        <NewGroupModal
          onClose={workspaceUiState.closeNewGroup}
          onCreate={handleNewGroupCreate}
        />
      )}
      {workspaceUiState.showGroupMembers && activeGroupInfo && userId && (
        <GroupInfoModal
          groupId={activeGroupInfo.groupId}
          groupName={activeGroupInfo.groupName}
          groupKind={activeGroupKind}
          avatarKey={activeGroupInfo.avatarKey}
          description={activeGroupInfo.description}
          members={activeGroupInfo.members}
          myUserId={userId}
          actions={activeGroupInfo.actions}
          onClose={workspaceUiState.closeGroupMembers}
        />
      )}
      {security.showSecurity && activeConversation && (
        <SecurityModal
          recipientUserId={activeConversation.userId}
          recipientUsername={activeConversation.username}
          peerIdentityKey={activeConversation.peerIdentityKey}
          peerIdentityDeviceId={activeConversation.peerIdentityDeviceId}
          peerIdentityByDevice={activeConversation.peerIdentityByDevice}
          peerIdentityAlertsByDevice={activeConversation.peerIdentityAlertsByDevice}
          onAcceptPeerIdentityChange={handleAcceptDirectIdentityChange}
          onVerificationChanged={security.onDirectVerificationChanged}
          onClose={security.closeSecurity}
        />
      )}
      {security.groupSecurityTarget && (
        <SecurityModal
          recipientUserId={security.groupSecurityTarget.recipientUserId}
          recipientUsername={security.groupSecurityTarget.recipientUsername}
          peerIdentityKey={security.groupSecurityTarget.preferredDeviceId
            ? security.groupSecurityTarget.peerIdentityByDevice[security.groupSecurityTarget.preferredDeviceId]
            : undefined}
          peerIdentityDeviceId={security.groupSecurityTarget.preferredDeviceId ?? undefined}
          peerIdentityByDevice={security.groupSecurityTarget.peerIdentityByDevice}
          onVerificationChanged={security.onGroupVerificationChanged}
          onClose={security.clearGroupSecurityTarget}
        />
      )}
    </>
  );
});
