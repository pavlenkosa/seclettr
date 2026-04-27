import { memo, type ReactNode } from "react";
import { ChatThreadChrome } from "@/chats/presentation/ChatThreadChrome";
import type {
  SecurityWorkspaceState,
  TranslateFn,
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
      ? t("group.security.verified")
      : t("group.security.unverified");
  }
  if (security.securityStatus === "verified") return t("chat.securityVerified");
  if (security.securityStatus === "reverify_required") return t("chat.securityReverifyRequired");
  return t("chat.securityUnverified");
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
  directPresenceLabel,
  security,
  t,
  handleBack,
  threadChromeActions,
  activeGroupCall,
  showGroupCallNotice,
  activeGroupCallCallerLabel,
  activeGroupCallParticipantIds,
  handleJoinActiveGroupCall,
}: {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeConversation: WorkspaceEntryState["activeConversation"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  directPresenceLabel: string;
  security: SecurityWorkspaceState;
  t: TranslateFn;
  handleBack: WorkspaceEntryState["handleBack"];
  threadChromeActions: ReactNode;
  activeGroupCall: WorkspaceEntryState["activeGroupCall"];
  showGroupCallNotice: boolean;
  activeGroupCallCallerLabel: string;
  activeGroupCallParticipantIds: WorkspaceEntryState["activeGroupCallParticipantIds"];
  handleJoinActiveGroupCall: WorkspaceEntryState["handleJoinActiveGroupCall"];
}) {
  if (!activeThreadKind) return null;

  const isDirectThread = activeThreadKind === "direct";
  const title = isDirectThread ? activeConversation?.username ?? "" : activeGroup?.name ?? "";
  const subtitle = isDirectThread
    ? directPresenceLabel
    : t("group.header.memberCount", { count: activeGroup?.members.length ?? 0 });
  const statusLabel = resolveStatusLabel({ isDirectThread, security, t });
  const statusTone = resolveStatusTone({ isDirectThread, security });
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
      statusTone={statusTone}
      avatarLabel={title}
      backAriaLabel={t("chat.back")}
      onBack={handleBack}
      actions={threadChromeActions}
      callNotice={callNotice}
    />
  );
});
