import { lazy, memo, Suspense, useCallback } from "react";
import { SettingsModal } from "@/components/common/SettingsModal";
import type {
  SecurityWorkspaceState,
  WorkspaceEntryState,
  WorkspaceInteractions,
  WorkspaceUiState,
} from "./chat-page-types";
import styles from "../ChatPage.module.css";

const NewChatModal = lazy(() =>
  import("@/chats/presentation/modals/NewChatModal").then(({ NewChatModal: Component }) => ({
    default: Component,
  }))
);
const NewGroupModal = lazy(() =>
  import("@/chats/presentation/modals/NewGroupModal").then(({ NewGroupModal: Component }) => ({
    default: Component,
  }))
);
const GroupMembersModal = lazy(() =>
  import("@/chats/presentation/modals/GroupMembersModal").then(({ GroupMembersModal: Component }) => ({
    default: Component,
  }))
);
const SecurityModal = lazy(() =>
  import("@/chats/presentation/modals/SecurityModal").then(({ SecurityModal: Component }) => ({
    default: Component,
  }))
);

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
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <NewChatModal
            onClose={workspaceUiState.closeNewChat}
            onSelect={interactions.handleNewChatSelect}
          />
        </Suspense>
      )}
      {workspaceUiState.showNewGroup && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <NewGroupModal
            onClose={workspaceUiState.closeNewGroup}
            onCreate={handleNewGroupCreate}
          />
        </Suspense>
      )}
      {workspaceUiState.showGroupMembers && activeGroup && userId && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <GroupMembersModal
            group={activeGroup}
            myUserId={userId}
            onVerifyMember={handleVerifyGroupMember}
            onClose={workspaceUiState.closeGroupMembers}
          />
        </Suspense>
      )}
      {security.showSecurity && activeConversation && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
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
        </Suspense>
      )}
      {security.groupSecurityTarget && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
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
        </Suspense>
      )}
      {workspaceUiState.showSettings && (
        <SettingsModal onClose={workspaceUiState.closeSettings} />
      )}
    </>
  );
});
