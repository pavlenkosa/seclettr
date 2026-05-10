import { lazy, memo, Suspense, type ReactNode } from "react";
import { ErrorBoundary, ThreadErrorFallback } from "@/components/common/ErrorBoundary";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import { ChatThreadPane } from "./ChatThreadPane";
import type { ChatPresence, ThreadPaneState, WorkspaceEntryState } from "./chat-page-types";
import styles from "../ChatPage.module.css";

const MessageSearchBar = lazy(() =>
  import("@/chats/presentation/MessageSearchBar").then(({ MessageSearchBar: Component }) => ({
    default: Component,
  }))
);
const SharedMediaPanel = lazy(() =>
  import("@/chats/presentation/SharedMediaPanel").then(({ SharedMediaPanel: Component }) => ({
    default: Component,
  }))
);

export const ChatThreadView = memo(function ChatThreadView({
  activeThreadKind,
  activeListId,
  activeMessages,
  activeHistoryLoading,
  groupSenderLabels,
  threadChrome,
  threadComposer,
  activeTyping,
  searchBarPresence,
  mediaPanelPresence,
  threadPaneState,
  handleRetryMessage,
  directTrustBlocked,
  handleDropFiles,
}: {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeListId: WorkspaceEntryState["activeListId"];
  activeMessages: WorkspaceEntryState["activeMessages"];
  activeHistoryLoading?: boolean;
  groupSenderLabels: WorkspaceEntryState["groupSenderLabels"];
  threadChrome: ReactNode;
  threadComposer: ReactNode;
  activeTyping: WorkspaceEntryState["activeTyping"];
  searchBarPresence: ChatPresence;
  mediaPanelPresence: ChatPresence;
  threadPaneState: ThreadPaneState;
  handleRetryMessage: WorkspaceEntryState["handleRetryMessage"];
  directTrustBlocked: WorkspaceEntryState["directTrustBlocked"];
  handleDropFiles: (files: File[]) => Promise<void>;
}) {
  return (
    <ErrorBoundary
      FallbackComponent={ThreadErrorFallback}
      resetKeys={[activeListId]}
    >
      <ChatThreadPane
        hasActiveThread={activeThreadKind !== null}
        threadKey={activeListId ?? undefined}
        messages={activeMessages}
        isLoadingHistory={activeHistoryLoading ?? false}
        senderLabels={activeThreadKind === "group" ? groupSenderLabels : undefined}
        topChrome={threadChrome}
        composer={threadComposer}
        isTyping={activeThreadKind === "direct" ? activeTyping : undefined}
        searchBar={searchBarPresence.isMounted ? (
          <div className={`${styles.searchBarPresence} ${searchBarPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn}`}>
            <Suspense fallback={<div className={styles.searchBarLazyFallback} aria-hidden="true" />}>
              <MessageSearchBar
                query={threadPaneState.messageSearchQuery}
                matchCount={threadPaneState.messageSearchMatches.length}
                currentMatch={threadPaneState.messageSearchMatches.length === 0
                  ? 0
                  : threadPaneState.messageSearchMatchIndex + 1}
                onQueryChange={threadPaneState.handleSearchQueryChange}
                onPrev={threadPaneState.handleSearchPrev}
                onNext={threadPaneState.handleSearchNext}
                onClose={threadPaneState.handleCloseSearch}
              />
            </Suspense>
          </div>
        ) : undefined}
        mediaPanel={mediaPanelPresence.isMounted ? (
          <div className={`${styles.mediaPanelPresence} ${mediaPanelPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn}`}>
            <Suspense fallback={<div className={styles.mediaPanelLazyFallback} aria-hidden="true" />}>
              <SharedMediaPanel
                messages={threadPaneState.mediaAttachmentMessages}
                onScrollToMessage={threadPaneState.handleScrollToMessage}
                onClose={threadPaneState.handleToggleMediaPanel}
              />
            </Suspense>
          </div>
        ) : undefined}
        highlightMessageId={threadPaneState.highlightMessageId}
        onRetry={activeThreadKind === null ? undefined : handleRetryMessage}
        onReply={threadPaneState.handleReply}
        onScrollToMessage={threadPaneState.handleScrollToMessage}
        onDropFiles={
          activeThreadKind === "group" || (activeThreadKind === "direct" && !directTrustBlocked)
            ? handleDropFiles
            : undefined
        }
      />
    </ErrorBoundary>
  );
});
