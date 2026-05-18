import { lazy, memo, Suspense, useCallback, type MutableRefObject } from "react";
import type { MessageComposerHandle } from "@/chats/presentation/MessageComposer";
import type { MessageReplyMeta } from "@/stores/messages";
import { PillButton, StatusBadge, SurfacePanel } from "@/components/ui";
import type {
  SecurityWorkspaceState,
  ThreadPaneState,
  TranslateFn,
  WorkspaceEntryState,
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
}) {
  const handlePlainDirectSendText = useCallback(
    async (content: string, replyTo?: MessageReplyMeta) => {
      if (!activePlainConversation) return;
      await sendPlainText(activePlainConversation.userId, activePlainConversation.username, content, replyTo);
    },
    [activePlainConversation, sendPlainText]
  );

  const handlePlainDirectSendFile = useCallback(
    async (file: File, mediaGroupId?: string, caption?: string) => {
      if (!activePlainConversation) return;
      await sendPlainAttachment(activePlainConversation.userId, activePlainConversation.username, file, {
        kind: "file",
        mediaGroupId,
        caption,
      });
    },
    [activePlainConversation, sendPlainAttachment]
  );

  const handlePlainDirectSendVoice = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!activePlainConversation) return;
      await sendPlainAttachment(
        activePlainConversation.userId,
        activePlainConversation.username,
        new File([blob], "voice.ogg", { type: blob.type }),
        { kind: "voice_note", durationMs }
      );
    },
    [activePlainConversation, sendPlainAttachment]
  );

  const handlePlainDirectSendVideo = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!activePlainConversation) return;
      await sendPlainAttachment(
        activePlainConversation.userId,
        activePlainConversation.username,
        new File([blob], "video.mp4", { type: blob.type }),
        { kind: "video_note", durationMs }
      );
    },
    [activePlainConversation, sendPlainAttachment]
  );

  const handlePlainGroupSendText = useCallback(
    async (content: string, replyTo?: MessageReplyMeta) => {
      if (!activePlainGroup) return;
      await sendPlainGroupText(activePlainGroup.groupId, content, replyTo);
    },
    [activePlainGroup, sendPlainGroupText]
  );

  const handlePlainGroupSendFile = useCallback(
    async (file: File, mediaGroupId?: string, caption?: string) => {
      if (!activePlainGroup) return;
      await sendPlainGroupAttachment(activePlainGroup.groupId, file, {
        kind: "file",
        mediaGroupId,
        caption,
      });
    },
    [activePlainGroup, sendPlainGroupAttachment]
  );

  const handlePlainGroupSendVoice = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!activePlainGroup) return;
      await sendPlainGroupAttachment(
        activePlainGroup.groupId,
        new File([blob], "voice.ogg", { type: blob.type }),
        { kind: "voice_note", durationMs }
      );
    },
    [activePlainGroup, sendPlainGroupAttachment]
  );

  const handlePlainGroupSendVideo = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (!activePlainGroup) return;
      await sendPlainGroupAttachment(
        activePlainGroup.groupId,
        new File([blob], "video.mp4", { type: blob.type }),
        { kind: "video_note", durationMs }
      );
    },
    [activePlainGroup, sendPlainGroupAttachment]
  );

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
  if (isDirectThread) {
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key={activeListId ?? "direct:unknown"}
          ref={messageComposerRef}
          recipientUserId={activeConversation.userId}
          onFocusChange={onComposerFocusChange}
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
          onFocusChange={onComposerFocusChange}
          replyTo={threadPaneState.replyToMeta}
          onClearReply={threadPaneState.handleClearReply}
        />
      </Suspense>
    );
  }
  if (activeThreadKind === "plain-direct" && activePlainConversation) {
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key={activeListId ?? "plain-direct:unknown"}
          ref={messageComposerRef}
          recipientUserId={activePlainConversation.userId}
          onFocusChange={onComposerFocusChange}
          replyTo={threadPaneState.replyToMeta}
          onClearReply={threadPaneState.handleClearReply}
          onSendText={handlePlainDirectSendText}
          onSendFile={handlePlainDirectSendFile}
          onSendVoiceBlob={handlePlainDirectSendVoice}
          onSendVideoBlob={handlePlainDirectSendVideo}
        />
      </Suspense>
    );
  }
  if (activeThreadKind === "plain-group" && activePlainGroup) {
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key={activeListId ?? "plain-group:unknown"}
          ref={messageComposerRef}
          groupId={activePlainGroup.groupId}
          onFocusChange={onComposerFocusChange}
          replyTo={threadPaneState.replyToMeta}
          onClearReply={threadPaneState.handleClearReply}
          onSendText={handlePlainGroupSendText}
          onSendFile={handlePlainGroupSendFile}
          onSendVoiceBlob={handlePlainGroupSendVoice}
          onSendVideoBlob={handlePlainGroupSendVideo}
          isGroupComposer
        />
      </Suspense>
    );
  }
  if (activeThreadKind === "saved") {
    const handleSavedSendText = async (text: string) => {
      sendSavedMessage(text);
    };
    return (
      <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
        <MessageComposer
          key="saved:saved"
          ref={messageComposerRef}
          onFocusChange={onComposerFocusChange}
          onSendText={handleSavedSendText}
          placeholder={t("saved.composer.placeholder")}
        />
      </Suspense>
    );
  }
  return null;
});
