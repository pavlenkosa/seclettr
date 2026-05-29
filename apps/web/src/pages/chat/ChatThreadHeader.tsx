import { memo, type ReactNode } from "react";
import { ChatThreadChrome } from "@/chats/presentation/ChatThreadChrome";
import { SavedMessagesAvatar } from "@/chats/presentation/SavedMessagesAvatar";
import { useAvatarUrl } from "@/lib/hooks";
import type {
  SecurityWorkspaceState,
  TranslateFn,
  WorkspaceInteractions,
  WorkspaceEntryState,
} from "./chat-page-types";

const resolveStatusLabel = ({
  isDirectThread,
  security,
  t,
}: {
  isDirectThread: boolean;
  security: SecurityWorkspaceState;
  t: TranslateFn;
}) => {
  if (!isDirectThread) {
    return security.groupSecurityStatus === "verified"
      ? t("security.badge.verified")
      : t("security.badge.verify");
  }
  if (security.securityStatus === "verified") return t("security.badge.verified");
  if (security.securityStatus === "reverify_required") return t("security.badge.review");
  return t("security.badge.verify");
};

const resolveStatusAriaLabel = ({
  isDirectThread,
  security,
  t,
}: {
  isDirectThread: boolean;
  security: SecurityWorkspaceState;
  t: TranslateFn;
}) => {
  if (!isDirectThread) {
    const status = security.groupSecurityStatus === "verified"
      ? t("group.security.verified")
      : t("group.security.unverified");
    return `${status}. ${t("group.security.verifyMembers")}`;
  }

  const status = security.securityStatus === "verified"
    ? t("chat.securityVerified")
    : security.securityStatus === "reverify_required"
      ? t("chat.securityReverifyRequired")
      : t("chat.securityUnverified");
  return `${status}. ${t("chat.verifySecurity")}`;
};

const resolveStatusTone = ({
  isDirectThread,
  security,
}: {
  isDirectThread: boolean;
  security: SecurityWorkspaceState;
}) => {
  if (!isDirectThread) return security.groupSecurityStatus;
  return security.securityStatus === "reverify_required" ? "attention" : security.securityStatus;
};

function SavedThreadHeader({
  t, handleBack, threadChromeActions,
}: {
  t: TranslateFn;
  handleBack: WorkspaceEntryState["handleBack"];
  threadChromeActions: ReactNode;
}) {
  return (
    <ChatThreadChrome
      title={t("saved.title")}
      subtitle={t("saved.subtitle")}
      statusLabel={null} statusAriaLabel={null} statusTone={null}
      onStatusClick={null}
      avatarLabel={t("saved.title")}
      avatarSlot={<SavedMessagesAvatar size={38} />}
      backAriaLabel={t("chat.back")}
      onBack={handleBack}
      actions={threadChromeActions}
      callNotice={null}
    />
  );
}

function PlainThreadHeader({
  kind, plainConversation, plainGroup, avatarImageUrl,
  plainDirectPresenceLabel, t, handleBack, threadChromeActions, handleOpenGroupMembers, onOpenProfile,
}: {
  kind: "plain-direct" | "plain-group";
  plainConversation: WorkspaceEntryState["activePlainConversation"];
  plainGroup: WorkspaceEntryState["activePlainGroup"];
  avatarImageUrl: string | null;
  plainDirectPresenceLabel: string;
  t: TranslateFn;
  handleBack: WorkspaceEntryState["handleBack"];
  threadChromeActions: ReactNode;
  handleOpenGroupMembers: WorkspaceInteractions["handleOpenGroupMembers"];
  onOpenProfile?: (username: string) => void;
}) {
  const isDirect = kind === "plain-direct";
  const title = isDirect ? plainConversation?.username ?? "" : plainGroup?.name ?? "";
  const subtitle = isDirect
    ? plainDirectPresenceLabel
    : t("group.header.memberCount", { count: plainGroup?.members.length ?? 0 });
  const username = isDirect ? (plainConversation?.username ?? null) : null;
  const handleAvatarClick = username && onOpenProfile ? () => onOpenProfile(username) : null;
  return (
    <ChatThreadChrome
      title={title}
      subtitle={subtitle}
      statusLabel={null} statusAriaLabel={null} statusTone={null}
      onStatusClick={isDirect ? null : handleOpenGroupMembers}
      avatarLabel={title}
      onAvatarClick={handleAvatarClick}
      avatarImageUrl={isDirect ? avatarImageUrl : null}
      backAriaLabel={t("chat.back")}
      onBack={handleBack}
      actions={threadChromeActions}
      callNotice={null}
    />
  );
}

function E2eeThreadHeader({
  kind, conversation, group, avatarImageUrl,
  directPresenceLabel, security, t, handleBack, threadChromeActions,
  handleOpenGroupMembers,
  activeGroupCall, showGroupCallNotice, activeGroupCallCallerLabel,
  activeGroupCallParticipantIds, handleJoinActiveGroupCall, onOpenProfile,
}: {
  kind: "direct" | "group";
  conversation: WorkspaceEntryState["activeConversation"];
  group: WorkspaceEntryState["activeGroup"];
  avatarImageUrl: string | null;
  directPresenceLabel: string;
  security: SecurityWorkspaceState;
  t: TranslateFn;
  handleBack: WorkspaceEntryState["handleBack"];
  threadChromeActions: ReactNode;
  handleOpenGroupMembers: WorkspaceInteractions["handleOpenGroupMembers"];
  activeGroupCall: WorkspaceEntryState["activeGroupCall"];
  showGroupCallNotice: boolean;
  activeGroupCallCallerLabel: string;
  activeGroupCallParticipantIds: WorkspaceEntryState["activeGroupCallParticipantIds"];
  handleJoinActiveGroupCall: WorkspaceEntryState["handleJoinActiveGroupCall"];
  onOpenProfile?: (username: string) => void;
}) {
  const isDirectThread = kind === "direct";
  const title = isDirectThread ? conversation?.username ?? "" : group?.name ?? "";
  const subtitle = isDirectThread
    ? directPresenceLabel
    : t("group.header.memberCount", { count: group?.members.length ?? 0 });
  const statusLabel = resolveStatusLabel({ isDirectThread, security, t });
  const statusAriaLabel = resolveStatusAriaLabel({ isDirectThread, security, t });
  const statusTone = resolveStatusTone({ isDirectThread, security });
  const handleStatusClick = isDirectThread ? security.openSecurity : handleOpenGroupMembers;
  const callNotice = showGroupCallNotice && activeGroupCall
    ? {
        callType: activeGroupCall.callType,
        status: activeGroupCall.status,
        callerLabel: activeGroupCallCallerLabel,
        participantCount: activeGroupCallParticipantIds.length,
        onJoin: handleJoinActiveGroupCall,
      }
    : null;
  const username = isDirectThread ? (conversation?.username ?? null) : null;
  const handleAvatarClick = username && onOpenProfile ? () => onOpenProfile(username) : null;
  return (
    <ChatThreadChrome
      title={title}
      subtitle={subtitle}
      statusLabel={statusLabel} statusAriaLabel={statusAriaLabel} statusTone={statusTone}
      onStatusClick={handleStatusClick}
      avatarLabel={title}
      onAvatarClick={handleAvatarClick}
      avatarImageUrl={isDirectThread ? avatarImageUrl : null}
      backAriaLabel={t("chat.back")}
      onBack={handleBack}
      actions={threadChromeActions}
      callNotice={callNotice}
    />
  );
}

export const ChatThreadHeader = memo(function ChatThreadHeader({
  activeThreadKind,
  activeConversation,
  activeGroup,
  activePlainConversation,
  activePlainGroup,
  directPresenceLabel,
  plainDirectPresenceLabel,
  security,
  t,
  handleBack,
  threadChromeActions,
  handleOpenGroupMembers,
  activeGroupCall,
  showGroupCallNotice,
  activeGroupCallCallerLabel,
  activeGroupCallParticipantIds,
  handleJoinActiveGroupCall,
  onOpenProfile,
}: {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeConversation: WorkspaceEntryState["activeConversation"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  activePlainConversation: WorkspaceEntryState["activePlainConversation"];
  activePlainGroup: WorkspaceEntryState["activePlainGroup"];
  directPresenceLabel: string;
  plainDirectPresenceLabel: string;
  security: SecurityWorkspaceState;
  t: TranslateFn;
  handleBack: WorkspaceEntryState["handleBack"];
  threadChromeActions: ReactNode;
  handleOpenGroupMembers: WorkspaceInteractions["handleOpenGroupMembers"];
  activeGroupCall: WorkspaceEntryState["activeGroupCall"];
  showGroupCallNotice: boolean;
  activeGroupCallCallerLabel: string;
  activeGroupCallParticipantIds: WorkspaceEntryState["activeGroupCallParticipantIds"];
  handleJoinActiveGroupCall: WorkspaceEntryState["handleJoinActiveGroupCall"];
  onOpenProfile?: (username: string) => void;
}) {
  const peerUserId = activeThreadKind === "plain-direct"
    ? (activePlainConversation?.userId ?? null)
    : activeThreadKind === "direct"
      ? (activeConversation?.userId ?? null)
      : null;
  const peerAvatarKey = activeThreadKind === "plain-direct"
    ? (activePlainConversation?.avatarKey ?? null)
    : null;
  const avatarImageUrl = useAvatarUrl(peerUserId, peerAvatarKey);

  if (!activeThreadKind) return null;

  if (activeThreadKind === "saved") {
    return <SavedThreadHeader t={t} handleBack={handleBack} threadChromeActions={threadChromeActions} />;
  }

  if (activeThreadKind === "plain-direct" || activeThreadKind === "plain-group") {
    return (
      <PlainThreadHeader
        kind={activeThreadKind}
        plainConversation={activePlainConversation}
        plainGroup={activePlainGroup}
        avatarImageUrl={avatarImageUrl}
        plainDirectPresenceLabel={plainDirectPresenceLabel}
        t={t}
        handleBack={handleBack}
        threadChromeActions={threadChromeActions}
        handleOpenGroupMembers={handleOpenGroupMembers}
        onOpenProfile={onOpenProfile}
      />
    );
  }

  return (
    <E2eeThreadHeader
      kind={activeThreadKind}
      conversation={activeConversation}
      group={activeGroup}
      avatarImageUrl={avatarImageUrl}
      directPresenceLabel={directPresenceLabel}
      security={security}
      t={t}
      handleBack={handleBack}
      threadChromeActions={threadChromeActions}
      handleOpenGroupMembers={handleOpenGroupMembers}
      activeGroupCall={activeGroupCall}
      showGroupCallNotice={showGroupCallNotice}
      activeGroupCallCallerLabel={activeGroupCallCallerLabel}
      activeGroupCallParticipantIds={activeGroupCallParticipantIds}
      handleJoinActiveGroupCall={handleJoinActiveGroupCall}
      onOpenProfile={onOpenProfile}
    />
  );
});
