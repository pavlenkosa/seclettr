/**
 * ChatPage — authenticated messenger shell orchestration root.
 *
 * Owns:
 *   - authenticated chat layout assembly across sidebar, thread pane, alerts,
 *     call panels, forwarding overlay, and room-create flow
 *   - lazy loading boundaries for demand-only chat/settings/room surfaces
 *   - top-level wiring between auth identity, workspace entry, UI state, and
 *     page-local helper hooks
 *
 * Does not own:
 *   - message store transport/runtime internals
 *   - direct/group/room call media/signaling logic
 *   - message-list row rendering
 *   - settings screen internals
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/auth";
import { usePlainMessagesStore, usePlainGroupsStore } from "@/stores/plain";
import { useSavedMessagesStore } from "@/stores/saved";
import type { DirectCallPanelHandle } from "@/calls/direct/model/direct-call-types";
import { useDirectMissedCallAlerts } from "@/calls/direct/runtime/session/useDirectMissedCallAlerts";
import {
  createGroupSecurityDirectory,
  useChatSecurityWorkspace,
  useChatSessionBootstrap,
  useChatThreadPaneState,
  useChatWorkspaceEntry,
  useChatWorkspaceInteractions,
  useChatWorkspaceUiState,
} from "@/chats";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useAnimatedPresence, useIsMobileViewport } from "@/lib/hooks";
import { ErrorBoundary, ThreadErrorFallback } from "@/components/common/ErrorBoundary";
import { ConnectionBanner } from "@/components/common/ConnectionBanner";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ChatMobileTabBar } from "./chat/ChatMobileTabBar";
import { useSidebarResize } from "./chat/useSidebarResize";
import type { MessageComposerHandle } from "@/chats/presentation/MessageComposer";
import { ChatNotice } from "./chat/ChatNotice";
import { ChatCallAlertBanners } from "./chat/ChatCallAlertBanners";
import { ChatThreadView } from "./chat/ChatThreadView";
import { ChatCallPanels } from "./chat/ChatCallPanels";
import { ChatMainLayout } from "./chat/ChatMainLayout";
import type { WorkspaceEntryState } from "./chat/chat-page-types";
import { useChatPageAlertState } from "./chat/useChatPageAlertState";
import { useChatPageForwarding } from "./chat/useChatPageForwarding";
import { useChatPageRoomState } from "./chat/useChatPageRoomState";
import styles from "./ChatPage.module.css";

const SettingsScreen = lazy(() =>
  import("@/components/common/SettingsScreen").then(({ SettingsScreen: Component }) => ({
    default: Component,
  }))
);
const ChatModals = lazy(() =>
  import("./chat/ChatModals").then(({ ChatModals: Component }) => ({
    default: Component,
  }))
);
const ForwardPickerModal = lazy(() =>
  import("@/chats/presentation/modals/ForwardPickerModal").then(({ ForwardPickerModal: Component }) => ({
    default: Component,
  }))
);
const CreateRoomDialog = lazy(() =>
  import("./chat/CreateRoomDialog").then(({ CreateRoomDialog: Component }) => ({
    default: Component,
  }))
);
const ChatThreadActionButtons = lazy(() =>
  import("./chat/ChatThreadActionButtons").then(({ ChatThreadActionButtons: Component }) => ({
    default: Component,
  }))
);
const ChatThreadHeader = lazy(() =>
  import("./chat/ChatThreadHeader").then(({ ChatThreadHeader: Component }) => ({
    default: Component,
  }))
);
const ProfileSheet = lazy(() =>
  import("@/components/common/ProfileSheet").then(({ ProfileSheet: Component }) => ({
    default: Component,
  }))
);
const ChatThreadComposer = lazy(() =>
  import("./chat/ChatThreadComposer").then(({ ChatThreadComposer: Component }) => ({
    default: Component,
  }))
);
const RoomCallPanel = lazy(() =>
  import("@/calls/room/RoomCallPanel").then(({ RoomCallPanel: Component }) => ({
    default: Component,
  }))
);

const groupSecurityDirectory = createGroupSecurityDirectory({
  fetchMemberDevices: (groupId) => api.getGroupMemberDevices(groupId),
});

const resolveDirectPresenceLabel = ({
  activeConversationUserId,
  activeTyping,
  activePresence,
  locale,
  t,
}: {
  activeConversationUserId: string | null;
  activeTyping: boolean | undefined;
  activePresence: WorkspaceEntryState["activePresence"];
  locale: string;
  t: ReturnType<typeof useI18n>["t"];
}) => {
  if (!activeConversationUserId) return "";
  if (activeTyping) return t("chat.presence.typing");
  if (activePresence?.online) return t("chat.presence.online");
  if (!activePresence?.lastSeenAt) return t("chat.presence.unknown");

  const parsed = new Date(activePresence.lastSeenAt);
  const formatted = Number.isNaN(parsed.getTime())
    ? activePresence.lastSeenAt
    : parsed.toLocaleString(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  return t("chat.presence.lastSeen", { value: formatted });
};

const resolveActiveGroupCallCallerLabel = ({
  activeGroup,
  activeGroupCall,
}: {
  activeGroup: WorkspaceEntryState["activeGroup"];
  activeGroupCall: WorkspaceEntryState["activeGroupCall"];
}) => {
  if (!activeGroup || !activeGroupCall) return "";
  const caller = activeGroup.members.find((member) => member.userId === activeGroupCall.callerUserId);
  if (caller?.username) return caller.username;
  return `${activeGroupCall.callerUserId.slice(0, 8)}...${activeGroupCall.callerUserId.slice(-4)}`;
};


export function ChatPage() {
  const { t, locale } = useI18n();
  const { rootRef, startResize, resetWidth } = useSidebarResize();
  const [profileSheetUsername, setProfileSheetUsername] = useState<string | null>(null);
  const handleOpenProfile = useCallback((username: string) => setProfileSheetUsername(username), []);
  const handleCloseProfile = useCallback(() => setProfileSheetUsername(null), []);
  const { username, logout, lock, identityDhKeyPair, userId, deviceId, pinEnabled } = useAuthStore(
    useShallow((state) => ({
      username: state.username,
      logout: state.logout,
      lock: state.lock,
      identityDhKeyPair: state.identityDhKeyPair,
      userId: state.userId,
      deviceId: state.deviceId,
      pinEnabled: state.pinEnabled,
    }))
  );
  const isMobileViewport = useIsMobileViewport();
  const {
    createRoomOpen,
    activeRoomSession,
    handleCloseCreateRoom,
    handleLeaveRoom,
    handleRoomCreated,
  } = useChatPageRoomState();
  const directCallPanelRef = useRef<DirectCallPanelHandle>(null);
  const messageComposerRef = useRef<MessageComposerHandle>(null);
  const workspaceUiState = useChatWorkspaceUiState();

  const { historyLoaded, loadingGroups } = useChatSessionBootstrap({
    onNotice: workspaceUiState.showChatNotice,
  });

  const {
    acceptPeerIdentityChange,
    activeConversation,
    activeConversationUserId,
    activePeerIdentityAlertCount,
    activeGroup,
    activeGroupCall,
    activeGroupCallParticipantIds,
    activeHistoryLoading,
    activeListId,
    activeMessages,
    activePresence,
    activeThreadKind,
    activeTyping,
    clearMissedCall,
    conversationEntries,
    createGroup,
    directTrustBlocked,
    ensureConversation,
    ensurePlainConversation,
    globalGroupCallAlerts,
    groupCallNoticeSurface,
    groupCallSession,
    groupEntries,
    groupSenderLabels,
    handleBack,
    handleCloseGroupCallPanel,
    handleJoinActiveGroupCall,
    handleRetryMessage,
    handleSelectThread,
    handleStartGroupCall,
    missedCall,
    activePlainConversation,
    activePlainGroup,
    plainActivePresence,
    plainActiveTyping,
    plainConversationEntries,
    plainGroupEntries,
    sendPlainText,
    sendPlainAttachment,
    createPlainGroup,
    sendPlainGroupText,
    sendPlainGroupAttachment,
    savedMessages,
    sendSavedMessage,
    sendSavedFile,
  } = useChatWorkspaceEntry({
    userId,
    setMobileShowConversation: workspaceUiState.setMobileShowConversation,
    setMobileCreateMenuOpen: workspaceUiState.setMobileCreateMenuOpen,
  });

  useEffect(() => {
    if (userId) {
      useSavedMessagesStore.getState().load(userId);
    } else {
      useSavedMessagesStore.getState().reset();
    }
  }, [userId]);

  const { missedDirectCalls, dismissMissedDirectCall } = useDirectMissedCallAlerts(userId);

  const {
    chatNoticePresence,
    callAlertBannersPresence,
    renderedNoticeText,
    renderedCallAlerts,
  } = useChatPageAlertState({
    workspaceUiState,
    missedCall,
    globalGroupCallAlerts,
    missedDirectCalls,
  });

  const security = useChatSecurityWorkspace({
    activeConversationUserId,
    activePeerIdentityKey: activeConversation?.peerIdentityKey,
    activePeerIdentityDeviceId: activeConversation?.peerIdentityDeviceId,
    activePeerIdentityByDevice: activeConversation?.peerIdentityByDevice,
    activePeerIdentityAlertCount,
    identityDhKeyPair,
    userId,
    deviceId,
    activeGroupId: activeGroup?.groupId ?? null,
    activeGroupMembers: activeGroup?.members ?? null,
    activeThreadKind,
    groupSecurityDirectory,
    showChatNotice: workspaceUiState.showChatNotice,
  });

  const threadPaneState = useChatThreadPaneState({
    activeListId,
    activeMessages,
    username,
    groupSenderLabels,
    activeConversationUsername: activeConversation?.username,
  });
  const searchBarPresence = useAnimatedPresence({
    isOpen: threadPaneState.messageSearchOpen,
    durationMs: 140,
  });
  const mediaPanelPresence = useAnimatedPresence({
    isOpen: threadPaneState.mediaPanelOpen,
    durationMs: 200,
  });

  const activeConversationSummary = useMemo(
    () => activeConversation
      ? { userId: activeConversation.userId, username: activeConversation.username }
      : null,
    [activeConversation]
  );
  const activeGroupSummary = useMemo(
    () => activeGroup ? { groupId: activeGroup.groupId } : null,
    [activeGroup]
  );

  const interactions = useChatWorkspaceInteractions({
    activeConversation: activeConversationSummary,
    activePlainConversation: activePlainConversation
      ? { userId: activePlainConversation.userId, username: activePlainConversation.username }
      : null,
    activeGroup: activeGroupSummary,
    activeThreadKind,
    directCallPanelRef,
    showChatNotice: workspaceUiState.showChatNotice,
    ensureConversation,
    ensurePlainConversation,
    handleSelectThread,
    logout,
    lock,
    setMobileCreateMenuOpen: workspaceUiState.setMobileCreateMenuOpen,
    openSettings: workspaceUiState.openSettings,
    openNewChat: workspaceUiState.openNewChat,
    closeNewChat: workspaceUiState.closeNewChat,
    openNewGroup: workspaceUiState.openNewGroup,
    openGroupMembers: workspaceUiState.openGroupMembers,
    closeGroupMembers: workspaceUiState.closeGroupMembers,
    openChatTypePicker: workspaceUiState.openChatTypePicker,
    closeChatTypePicker: workspaceUiState.closeChatTypePicker,
  });

  const handleDropFiles = useCallback(async (files: File[]) => {
    await messageComposerRef.current?.handleDroppedFiles(files);
  }, []);

  // Plain-only delete: dispatches to the right store based on the active
  // thread kind. E2EE doesn't expose a delete-message store action, so the
  // bubble's context menu hides the Delete entry there (canDelete falsy).
  const deletePlainDmMessage = usePlainMessagesStore((state) => state.deleteMessage);
  const deletePlainGroupMessage = usePlainGroupsStore((state) => state.deleteMessage);
  const handleDeleteMessage = useCallback((messageId: string) => {
    if (activeThreadKind === "plain-direct" && activePlainConversation) {
      void deletePlainDmMessage(activePlainConversation.userId, messageId);
      return;
    }
    if (activeThreadKind === "plain-group" && activePlainGroup) {
      void deletePlainGroupMessage(activePlainGroup.groupId, messageId);
    }
  }, [
    activeThreadKind,
    activePlainConversation,
    activePlainGroup,
    deletePlainDmMessage,
    deletePlainGroupMessage,
  ]);
  const handleBulkDeleteMessage = useCallback((messageIds: string[]) => {
    for (const messageId of messageIds) {
      handleDeleteMessage(messageId);
    }
  }, [handleDeleteMessage]);

  const {
    forwardMessageId,
    forwardTargets,
    handleForwardMessage,
    handleBulkForwardMessage,
    handleCloseForwardPicker,
    handleForwardSend,
  } = useChatPageForwarding({
    activeMessages,
    username,
    groupSenderLabels,
    activePlainConversation,
    plainConversationEntries,
    plainGroupEntries,
    sendSavedMessage,
    sendPlainText,
    sendPlainGroupText,
    t,
  });

  const directPresenceLabel = useMemo(
    () => resolveDirectPresenceLabel({ activeConversationUserId, activeTyping, activePresence, locale, t }),
    [activeConversationUserId, activeTyping, activePresence, locale, t]
  );

  const plainDirectPresenceLabel = useMemo(
    () => resolveDirectPresenceLabel({
      activeConversationUserId: activePlainConversation?.userId ?? null,
      activeTyping: plainActiveTyping,
      activePresence: plainActivePresence,
      locale,
      t,
    }),
    [activePlainConversation, plainActiveTyping, plainActivePresence, locale, t]
  );

  const activeGroupCallCallerLabel = useMemo(
    () => resolveActiveGroupCallCallerLabel({ activeGroup, activeGroupCall }),
    [activeGroup, activeGroupCall]
  );

  const showGroupCallNotice =
    activeThreadKind === "group" && activeGroupCall !== null && groupCallNoticeSurface === "banner";
  const shouldRenderChatModals =
    workspaceUiState.showNewChat
    || workspaceUiState.showChatTypePicker
    || workspaceUiState.showNewGroup
    || workspaceUiState.showGroupMembers
    || security.showSecurity
    || security.groupSecurityTarget !== null;
  const hasActiveThread = activeThreadKind !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  const threadChromeActions = hasActiveThread ? (
    <Suspense fallback={null}>
      <ChatThreadActionButtons
        activeThreadKind={activeThreadKind}
        groupCallDisabled={groupCallSession !== null}
        isSearchOpen={threadPaneState.messageSearchOpen}
        isMediaPanelOpen={threadPaneState.mediaPanelOpen}
        onOpenSecurity={security.openSecurity}
        onStartDirectCall={interactions.handleStartCall}
        onStartGroupCall={handleStartGroupCall}
        onOpenGroupMembers={interactions.handleOpenGroupMembers}
        onToggleSearch={threadPaneState.handleToggleSearch}
        onToggleMediaPanel={threadPaneState.handleToggleMediaPanel}
      />
    </Suspense>
  ) : null;

  const threadChrome = hasActiveThread ? (
    <Suspense fallback={null}>
      <ChatThreadHeader
        activeThreadKind={activeThreadKind}
        activeConversation={activeConversation}
        activeGroup={activeGroup}
        activePlainConversation={activePlainConversation}
        activePlainGroup={activePlainGroup}
        directPresenceLabel={directPresenceLabel}
        plainDirectPresenceLabel={plainDirectPresenceLabel}
        security={security}
        t={t}
        handleBack={handleBack}
        threadChromeActions={threadChromeActions}
        handleOpenGroupMembers={interactions.handleOpenGroupMembers}
        activeGroupCall={activeGroupCall}
        showGroupCallNotice={showGroupCallNotice}
        activeGroupCallCallerLabel={activeGroupCallCallerLabel}
        activeGroupCallParticipantIds={activeGroupCallParticipantIds}
        handleJoinActiveGroupCall={handleJoinActiveGroupCall}
        onOpenProfile={handleOpenProfile}
      />
    </Suspense>
  ) : null;

  const threadComposer = hasActiveThread ? (
    <Suspense fallback={<div className={styles.composerLazyFallback} aria-hidden="true" />}>
      <ChatThreadComposer
        activeThreadKind={activeThreadKind}
        activeConversation={activeConversation}
        activeGroup={activeGroup}
        activePlainConversation={activePlainConversation}
        activePlainGroup={activePlainGroup}
        directTrustBlocked={directTrustBlocked}
        t={t}
        security={security}
        activeListId={activeListId}
        messageComposerRef={messageComposerRef}
        onComposerFocusChange={interactions.handleComposerFocusChange}
        threadPaneState={threadPaneState}
        sendPlainText={sendPlainText}
        sendPlainAttachment={sendPlainAttachment}
        sendPlainGroupText={sendPlainGroupText}
        sendPlainGroupAttachment={sendPlainGroupAttachment}
        sendSavedMessage={sendSavedMessage}
        sendSavedFile={sendSavedFile}
      />
    </Suspense>
  ) : null;

  const sidebar = (
    <ErrorBoundary FallbackComponent={ThreadErrorFallback}>
      <ChatSidebar
        username={username}
        canLock={pinEnabled}
        conversations={conversationEntries}
        groups={groupEntries}
        plainConversations={plainConversationEntries}
        plainGroups={plainGroupEntries}
        savedMessages={savedMessages}
        activeId={activeListId}
        loading={!historyLoaded || loadingGroups}
        onSelectThread={handleSelectThread}
        onOpenSettings={interactions.handleOpenSettings}
        onLock={interactions.handleLock}
        onLogout={interactions.handleLogout}
        onOpenNewChat={interactions.handleOpenNewChat}
        onOpenNewGroup={interactions.handleOpenNewGroup}
      />
    </ErrorBoundary>
  );

  const sidebarDock = (
    <ChatMobileTabBar
      isCreateMenuOpen={workspaceUiState.mobileCreateMenuOpen}
      isSettingsOpen={workspaceUiState.showSettings}
      placement="overlay"
      createMenuId={workspaceUiState.mobileCreateMenuId}
      createMenuRef={workspaceUiState.mobileCreateMenuRef}
      onCreateMenuKeyDown={workspaceUiState.handleMobileCreateMenuKeyDown}
      onToggleCreateMenu={interactions.handleToggleCreateMenu}
      onCloseCreateMenu={interactions.handleCloseCreateMenu}
      onOpenNewChat={interactions.handleOpenNewChat}
      onOpenNewGroup={interactions.handleOpenNewGroup}
      onOpenSettings={interactions.handleMobileOpenSettings}
      isChatsActive
      onOpenChats={interactions.handleMobileOpenChats}
    />
  );

  const threadPane = (
    <ChatThreadView
      activeThreadKind={activeThreadKind}
      activeListId={activeListId}
      activeMessages={activeMessages}
      activeHistoryLoading={activeHistoryLoading}
      groupSenderLabels={groupSenderLabels}
      threadChrome={threadChrome}
      threadComposer={threadComposer}
      activeTyping={activeTyping}
      plainActiveTyping={plainActiveTyping}
      searchBarPresence={searchBarPresence}
      mediaPanelPresence={mediaPanelPresence}
      threadPaneState={threadPaneState}
      handleRetryMessage={handleRetryMessage}
      handleDeleteMessage={handleDeleteMessage}
      handleForwardMessage={handleForwardMessage}
      handleBulkDeleteMessage={handleBulkDeleteMessage}
      handleBulkForwardMessage={handleBulkForwardMessage}
      directTrustBlocked={directTrustBlocked}
      handleDropFiles={handleDropFiles}
    />
  );

  const settingsScreen = workspaceUiState.showSettings ? (
    <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
      <SettingsScreen
        username={username}
        isMobileViewport={isMobileViewport}
        onClose={workspaceUiState.closeSettings}
      />
    </Suspense>
  ) : null;

  return (
    <div ref={rootRef} className={styles.root}>
      <ConnectionBanner />
      <ChatNotice
        presence={chatNoticePresence}
        noticeText={renderedNoticeText}
      />
      <ChatCallAlertBanners
        presence={callAlertBannersPresence}
        chatNoticeMounted={chatNoticePresence.isMounted}
        renderedCallAlerts={renderedCallAlerts}
        clearMissedCall={clearMissedCall}
        groupEntries={groupEntries}
        handleSelectThread={handleSelectThread}
        dismissMissedDirectCall={dismissMissedDirectCall}
        t={t}
      />
      <ChatCallPanels
        directCallPanelRef={directCallPanelRef}
        groupCallSession={groupCallSession}
        handleCloseGroupCallPanel={handleCloseGroupCallPanel}
      />
      <ChatMainLayout
        isMobileViewport={isMobileViewport}
        mobileShowConversation={workspaceUiState.mobileShowConversation}
        showSettings={workspaceUiState.showSettings}
        sidebar={sidebar}
        threadPane={threadPane}
        sidebarDock={sidebarDock}
        settingsScreen={settingsScreen}
        startResize={startResize}
        resetWidth={resetWidth}
      />
      {shouldRenderChatModals ? (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <ChatModals
            workspaceUiState={workspaceUiState}
            interactions={interactions}
            createGroup={createGroup}
            createPlainGroup={createPlainGroup}
            handleSelectThread={handleSelectThread}
            activeGroup={activeGroup}
            activePlainGroup={activePlainGroup}
            userId={userId}
            security={security}
            activeConversation={activeConversation}
            acceptPeerIdentityChange={acceptPeerIdentityChange}
          />
        </Suspense>
      ) : null}
      {createRoomOpen && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <CreateRoomDialog
            onClose={handleCloseCreateRoom}
            onRoomCreated={(res, callType) =>
              handleRoomCreated({ res, callType, userId, deviceId, username })
            }
          />
        </Suspense>
      )}
      {forwardMessageId !== null && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <ForwardPickerModal
            targets={forwardTargets}
            onClose={handleCloseForwardPicker}
            onSelect={handleForwardSend}
          />
        </Suspense>
      )}
      {activeRoomSession && (
        <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
          <RoomCallPanel session={activeRoomSession} onLeave={handleLeaveRoom} />
        </Suspense>
      )}
      {profileSheetUsername !== null && (
        <Suspense fallback={null}>
          <ProfileSheet username={profileSheetUsername} onClose={handleCloseProfile} />
        </Suspense>
      )}
    </div>
  );
}
