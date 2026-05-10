import { memo, useCallback } from "react";
import { NewChatModal } from "@/chats/presentation/modals/NewChatModal";
import { NewGroupModal } from "@/chats/presentation/modals/NewGroupModal";
import { GroupMembersModal } from "@/chats/presentation/modals/GroupMembersModal";
import { SecurityModal } from "@/chats/presentation/modals/SecurityModal";
import { ChatTypePickerModal } from "@/chats/presentation/modals/ChatTypePickerModal";
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
  handleSelectThread,
  activeGroup,
  userId,
  security,
  activeConversation,
  acceptPeerIdentityChange,
}: {
  workspaceUiState: WorkspaceUiState;
  interactions: WorkspaceInteractions;
  createGroup: WorkspaceEntryState["createGroup"];
  handleSelectThread: WorkspaceEntryState["handleSelectThread"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  userId: string | null;
  security: SecurityWorkspaceState;
  activeConversation: WorkspaceEntryState["activeConversation"];
  acceptPeerIdentityChange: WorkspaceEntryState["acceptPeerIdentityChange"];
}) {
  const handleNewGroupCreate = useCallback(
    async ({ name, memberUserIds }: { name: string; memberUserIds: string[] }) => {
      const created = await createGroup(name, memberUserIds);
      workspaceUiState.closeNewGroup();
      handleSelectThread({ kind: "group", id: created.groupId });
    },
    [createGroup, handleSelectThread, workspaceUiState]
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
      {workspaceUiState.showGroupMembers && activeGroup && userId && (
        <GroupMembersModal
          group={activeGroup}
          myUserId={userId}
          onVerifyMember={handleVerifyGroupMember}
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
