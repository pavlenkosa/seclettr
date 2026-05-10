import { memo, type ReactNode } from "react";
import { ChatThreadChrome } from "@/chats/presentation/ChatThreadChrome";
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
}) {
  if (!activeThreadKind) return null;

  const isPlainDirect = activeThreadKind === "plain-direct";
  const isPlainGroup = activeThreadKind === "plain-group";

  if (isPlainDirect || isPlainGroup) {
    const plainTitle = isPlainDirect
      ? activePlainConversation?.username ?? ""
      : activePlainGroup?.name ?? "";
    const plainSubtitle = isPlainGroup
      ? t("group.header.memberCount", { count: activePlainGroup?.members.length ?? 0 })
      : plainDirectPresenceLabel;
    return (
      <ChatThreadChrome
        title={plainTitle}
        subtitle={plainSubtitle}
        statusLabel={null}
        statusAriaLabel={null}
        statusTone={null}
        // Plain groups open the same Telegram-style info modal on title/sub tap;
        // plain DMs have nothing extra to surface here.
        onStatusClick={isPlainGroup ? handleOpenGroupMembers : null}
        avatarLabel={plainTitle}
        backAriaLabel={t("chat.back")}
        onBack={handleBack}
        actions={threadChromeActions}
        callNotice={null}
      />
    );
  }

  const isDirectThread = activeThreadKind === "direct";
  const title = isDirectThread ? activeConversation?.username ?? "" : activeGroup?.name ?? "";
  const subtitle = isDirectThread
    ? directPresenceLabel
    : t("group.header.memberCount", { count: activeGroup?.members.length ?? 0 });
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

  return (
    <ChatThreadChrome
      title={title}
      subtitle={subtitle}
      statusLabel={statusLabel}
      statusAriaLabel={statusAriaLabel}
      statusTone={statusTone}
      onStatusClick={handleStatusClick}
      avatarLabel={title}
      backAriaLabel={t("chat.back")}
      onBack={handleBack}
      actions={threadChromeActions}
      callNotice={callNotice}
    />
  );
});
