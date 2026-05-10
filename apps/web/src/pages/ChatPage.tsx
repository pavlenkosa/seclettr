import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/auth";
import type { DirectCallPanelHandle } from "@/calls/direct/model/direct-call-types";
import { useDirectMissedCallAlerts } from "@/calls/direct/runtime/useDirectMissedCallAlerts";
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
import { SettingsScreen } from "@/components/common/SettingsScreen";
import { ChatSidebar } from "./chat/ChatSidebar";
import { ChatMobileTabBar } from "./chat/ChatMobileTabBar";
import { ChatThreadActionButtons } from "./chat/ChatThreadActionButtons";
import { useSidebarResize } from "./chat/useSidebarResize";
import type { MessageComposerHandle } from "@/chats/presentation/MessageComposer";
import { ChatNotice } from "./chat/ChatNotice";
import { ChatCallAlertBanners } from "./chat/ChatCallAlertBanners";
import { ChatThreadHeader } from "./chat/ChatThreadHeader";
import { ChatThreadView } from "./chat/ChatThreadView";
import { ChatThreadComposer } from "./chat/ChatThreadComposer";
import { ChatCallPanels } from "./chat/ChatCallPanels";
import { ChatMainLayout } from "./chat/ChatMainLayout";
import { ChatModals } from "./chat/ChatModals";
import { CreateRoomDialog } from "./chat/CreateRoomDialog";
import { RoomCallPanel } from "@/calls/room/RoomCallPanel";
import type { RoomCallSession } from "@/calls/room/room-call-bootstrap";
import type { WorkspaceEntryState } from "./chat/chat-page-types";
import styles from "./ChatPage.module.css";

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
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [activeRoomSession, setActiveRoomSession] = useState<RoomCallSession | null>(null);
  const handleOpenCreateRoom = useCallback(() => setCreateRoomOpen(true), []);
  const handleCloseCreateRoom = useCallback(() => setCreateRoomOpen(false), []);
  const handleLeaveRoom = useCallback(() => setActiveRoomSession(null), []);

  useEffect(() => {
    (globalThis as Record<string, unknown>).__scCreateRoom = handleOpenCreateRoom;
    return () => { delete (globalThis as Record<string, unknown>).__scCreateRoom; };
  }, [handleOpenCreateRoom]);
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
    plainConversationEntries,
    plainGroupEntries,
    sendPlainText,
    sendPlainAttachment,
    createPlainGroup,
    sendPlainGroupText,
    sendPlainGroupAttachment,
  } = useChatWorkspaceEntry({
    userId,
    setMobileShowConversation: workspaceUiState.setMobileShowConversation,
    setMobileCreateMenuOpen: workspaceUiState.setMobileCreateMenuOpen,
  });

  const { missedDirectCalls, dismissMissedDirectCall } = useDirectMissedCallAlerts(userId);

  const chatNoticePresence = useAnimatedPresence({
    isOpen: Boolean(workspaceUiState.chatNotice),
    durationMs: 200,
  });
  const callAlertsVisible = Boolean(
    missedCall || globalGroupCallAlerts.length > 0 || missedDirectCalls.length > 0
  );
  const callAlertBannersPresence = useAnimatedPresence({
    isOpen: callAlertsVisible,
    durationMs: 200,
  });

  const lastChatNoticeRef = useRef<string | null>(null);
  if (workspaceUiState.chatNotice) {
    lastChatNoticeRef.current = workspaceUiState.chatNotice;
  }
  const callAlertSnapshotRef = useRef({ missedCall, globalGroupCallAlerts, missedDirectCalls });
  if (callAlertsVisible) {
    callAlertSnapshotRef.current = { missedCall, globalGroupCallAlerts, missedDirectCalls };
  }
  const renderedCallAlerts = callAlertsVisible
    ? { missedCall, globalGroupCallAlerts, missedDirectCalls }
    : callAlertSnapshotRef.current;

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

  const directPresenceLabel = useMemo(
    () => resolveDirectPresenceLabel({ activeConversationUserId, activeTyping, activePresence, locale, t }),
    [activeConversationUserId, activeTyping, activePresence, locale, t]
  );

  const plainDirectPresenceLabel = useMemo(
    () => resolveDirectPresenceLabel({
      activeConversationUserId: activePlainConversation?.userId ?? null,
      activeTyping: false,
      activePresence: plainActivePresence,
      locale,
      t,
    }),
    [activePlainConversation, plainActivePresence, locale, t]
  );

  const activeGroupCallCallerLabel = useMemo(
    () => resolveActiveGroupCallCallerLabel({ activeGroup, activeGroupCall }),
    [activeGroup, activeGroupCall]
  );

  const showGroupCallNotice =
    activeThreadKind === "group" && activeGroupCall !== null && groupCallNoticeSurface === "banner";

  // ── Render ────────────────────────────────────────────────────────────────

  const threadChromeActions = (
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
  );

  const threadChrome = (
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
    />
  );

  const threadComposer = (
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
    />
  );

  const sidebar = (
    <ErrorBoundary FallbackComponent={ThreadErrorFallback}>
      <ChatSidebar
        username={username}
        canLock={pinEnabled}
        conversations={conversationEntries}
        groups={groupEntries}
        plainConversations={plainConversationEntries}
        plainGroups={plainGroupEntries}
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
      searchBarPresence={searchBarPresence}
      mediaPanelPresence={mediaPanelPresence}
      threadPaneState={threadPaneState}
      handleRetryMessage={handleRetryMessage}
      directTrustBlocked={directTrustBlocked}
      handleDropFiles={handleDropFiles}
    />
  );

  const settingsScreen = (
    <SettingsScreen
      username={username}
      isMobileViewport={isMobileViewport}
      onClose={workspaceUiState.closeSettings}
    />
  );

  return (
    <div ref={rootRef} className={styles.root}>
      <ConnectionBanner />
      <ChatNotice
        presence={chatNoticePresence}
        noticeText={workspaceUiState.chatNotice ?? lastChatNoticeRef.current}
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
      <ChatModals
        workspaceUiState={workspaceUiState}
        interactions={interactions}
        createGroup={createGroup}
        createPlainGroup={createPlainGroup}
        handleSelectThread={handleSelectThread}
        activeGroup={activeGroup}
        userId={userId}
        security={security}
        activeConversation={activeConversation}
        acceptPeerIdentityChange={acceptPeerIdentityChange}
      />
      {createRoomOpen && (
        <CreateRoomDialog
          onClose={handleCloseCreateRoom}
          onRoomCreated={(res, callType) => {
            handleCloseCreateRoom();
            if (!userId || !deviceId || !username) return;
            setActiveRoomSession({
              callId: res.callId,
              callType,
              participantId: userId,
              deviceId,
              displayName: username,
              isGuest: false,
              isHost: true,
              guestToken: null,
              sfuBaseUrl: null,
              inviteUrl: res.inviteUrl,
            });
          }}
        />
      )}
      {activeRoomSession && (
        <RoomCallPanel session={activeRoomSession} onLeave={handleLeaveRoom} />
      )}
    </div>
  );
}
