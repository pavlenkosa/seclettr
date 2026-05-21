import { lazy, memo, Suspense, type MutableRefObject } from "react";
import type { MessageComposerHandle } from "@/chats/presentation/MessageComposer";
import { PillButton, StatusBadge, SurfacePanel } from "@/components/ui";
import type {
  SecurityWorkspaceState,
  ThreadPaneState,
  TranslateFn,
  WorkspaceEntryState,
} from "./chat-page-types";
import { buildChatThreadComposerBindings } from "./chat-thread-composer-bindings";
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
  activePlainConversation,
  activePlainGroup,
  directTrustBlocked,
  t,
  security,
  activeListId,
  messageComposerRef,
  onComposerFocusChange,
  threadPaneState,
  sendPlainText,
  sendPlainAttachment,
  sendPlainGroupText,
  sendPlainGroupAttachment,
  sendSavedMessage,
  sendSavedFile,
}: {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeConversation: WorkspaceEntryState["activeConversation"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  activePlainConversation: WorkspaceEntryState["activePlainConversation"];
  activePlainGroup: WorkspaceEntryState["activePlainGroup"];
  directTrustBlocked: WorkspaceEntryState["directTrustBlocked"];
  t: TranslateFn;
  security: SecurityWorkspaceState;
  activeListId: WorkspaceEntryState["activeListId"];
  messageComposerRef: MutableRefObject<MessageComposerHandle | null>;
  onComposerFocusChange: (focused: boolean) => void;
  threadPaneState: ThreadPaneState;
  sendPlainText: WorkspaceEntryState["sendPlainText"];
  sendPlainAttachment: WorkspaceEntryState["sendPlainAttachment"];
  sendPlainGroupText: WorkspaceEntryState["sendPlainGroupText"];
  sendPlainGroupAttachment: WorkspaceEntryState["sendPlainGroupAttachment"];
  sendSavedMessage: WorkspaceEntryState["sendSavedMessage"];
  sendSavedFile: WorkspaceEntryState["sendSavedFile"];
}) {
  const isDirectThread = activeThreadKind === "direct" && activeConversation;
  if (isDirectThread && directTrustBlocked) {
    return (
      <SurfacePanel className={styles.trustNotice} padding="lg" radius="xl">
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
  const composerBindings = buildChatThreadComposerBindings({
    activeConversation,
    activeGroup,
    activeListId,
    activePlainConversation,
    activePlainGroup,
    activeThreadKind,
    savedPlaceholder: t("saved.composer.placeholder"),
    sendPlainAttachment,
    sendPlainGroupAttachment,
    sendPlainGroupText,
    sendPlainText,
    sendSavedFile,
    sendSavedMessage,
  });

  if (!composerBindings) return null;

  return (
    <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
      <MessageComposer
        key={composerBindings.composerKey}
        ref={messageComposerRef}
        recipientUserId={composerBindings.recipientUserId}
        groupId={composerBindings.groupId}
        onFocusChange={onComposerFocusChange}
        replyTo={threadPaneState.replyToMeta}
        onClearReply={threadPaneState.handleClearReply}
        onSendText={composerBindings.onSendText}
        onSendFile={composerBindings.onSendFile}
        onSendVoiceBlob={composerBindings.onSendVoiceBlob}
        onSendVideoBlob={composerBindings.onSendVideoBlob}
        isGroupComposer={composerBindings.isGroupComposer}
        placeholder={composerBindings.placeholder}
        supportsGif={composerBindings.supportsGif}
      />
    </Suspense>
  );
});
