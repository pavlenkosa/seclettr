import { lazy, memo, Suspense, type MutableRefObject } from "react";
import type { MessageComposerHandle } from "@/chats/presentation/MessageComposer";
import { PillButton, StatusBadge, SurfacePanel } from "@/components/ui";
import type {
  SecurityWorkspaceState,
  ThreadPaneState,
  TranslateFn,
  WorkspaceEntryState,
  WorkspaceInteractions,
} from "./chat-page-types";
import styles from "../ChatPage.module.css";

const MessageComposer = lazy(() =>
  import("@/chats/presentation/MessageComposer").then(({ MessageComposer: Component }) => ({
    default: Component,
  }))
);

export const ChatThreadComposer = memo(function ChatThreadComposer({
  activeThreadKind,
  activeConversation,
  activeGroup,
  directTrustBlocked,
  t,
  security,
  activeListId,
  messageComposerRef,
  interactions,
  threadPaneState,
}: {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeConversation: WorkspaceEntryState["activeConversation"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  directTrustBlocked: WorkspaceEntryState["directTrustBlocked"];
  t: TranslateFn;
  security: SecurityWorkspaceState;
  activeListId: WorkspaceEntryState["activeListId"];
  messageComposerRef: MutableRefObject<MessageComposerHandle | null>;
  interactions: WorkspaceInteractions;
  threadPaneState: ThreadPaneState;
}) {
  const isDirectThread = activeThreadKind === "direct" && activeConversation;
  if (isDirectThread && directTrustBlocked) {
    return (
      <SurfacePanel className={styles.trustNotice} padding="lg" radius="xl" glass="strong">
        <div className={styles.trustNoticeHeader}>
          <StatusBadge tone="danger" size="md">
            {t("chat.securityReverifyRequired")}
          </StatusBadge>
        </div>
        <p className={styles.trustNoticeTitle}>{t("chat.trustBlockedTitle")}</p>
        <p className={styles.trustNoticeBody}>
          {t("chat.trustBlockedBody", { recipient: activeConversation.username })}
        </p>
        <PillButton onClick={security.openSecurity}>
          {t("chat.trustBlockedAction")}
        </PillButton>
      </SurfacePanel>
    );
  }
  if (isDirectThread) {
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key={activeListId ?? "direct:unknown"}
          ref={messageComposerRef}
          recipientUserId={activeConversation.userId}
          onFocusChange={interactions.handleComposerFocusChange}
          replyTo={threadPaneState.replyToMeta}
          onClearReply={threadPaneState.handleClearReply}
        />
      </Suspense>
    );
  }
  if (activeThreadKind === "group" && activeGroup) {
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key={activeListId ?? "group:unknown"}
          ref={messageComposerRef}
          groupId={activeGroup.groupId}
          onFocusChange={interactions.handleComposerFocusChange}
          replyTo={threadPaneState.replyToMeta}
          onClearReply={threadPaneState.handleClearReply}
        />
      </Suspense>
    );
  }
  return null;
});
