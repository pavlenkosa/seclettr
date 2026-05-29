import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { logger } from "@/lib/logger";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildSearchWithConversation,
  buildSearchWithGroup,
  buildSearchWithPlainConversation,
  buildSearchWithPlainGroup,
  buildSearchWithSaved,
  getConversationIdFromSearch,
  getGroupIdFromSearch,
  getPlainConversationIdFromSearch,
  getPlainGroupIdFromSearch,
  getSavedFromSearch,
} from "@/lib/chat-route";

export interface ChatThreadSelection {
  kind: "direct" | "group" | "plain-direct" | "plain-group" | "saved";
  id: string;
}

interface UseChatThreadRoutingOptions {
  conversations: Record<string, unknown>;
  activeConversationId: string | null;
  activeGroupId: string | null;
  setActiveConversation: (userId: string | null) => void;
  setActiveGroup: (groupId: string | null) => void;
  loadGroupMessages: (groupId: string) => Promise<void>;
  getGroupsState: () => {
    groups: Record<string, unknown>;
    activeGroupId: string | null;
  };
  plainConversations: Record<string, unknown>;
  activePlainConversationId: string | null;
  activePlainGroupId: string | null;
  setActivePlainConversation: (userId: string | null) => void;
  setActivePlainGroup: (groupId: string | null) => void;
  loadPlainGroupMessages: (groupId: string) => Promise<void>;
  savedThreadActive: boolean;
  setSavedThreadActive: (active: boolean) => void;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
}

interface ActiveThreadState {
  activeConversationId: string | null;
  activeGroupId: string | null;
  setActiveConversation: (userId: string | null) => void;
  setActiveGroup: (groupId: string | null) => void;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
}

function clearActiveThreadState({
  activeConversationId,
  activeGroupId,
  setActiveConversation,
  setActiveGroup,
  setMobileShowConversation,
}: ActiveThreadState): void {
  if (activeConversationId !== null) {
    setActiveConversation(null);
  }
  if (activeGroupId !== null) {
    setActiveGroup(null);
  }
  setMobileShowConversation(false);
}

function activateGroupRoute(params: ActiveThreadState & {
  routeGroupId: string;
  loadGroupMessages: (groupId: string) => Promise<void>;
  getGroupsState: UseChatThreadRoutingOptions["getGroupsState"];
}): void {
  const {
    activeConversationId,
    activeGroupId,
    routeGroupId,
    setActiveConversation,
    setActiveGroup,
    setMobileShowConversation,
    loadGroupMessages,
    getGroupsState,
  } = params;

  if (activeConversationId !== null) {
    setActiveConversation(null);
  }
  if (activeGroupId !== routeGroupId) {
    setActiveGroup(routeGroupId);
  }
  setMobileShowConversation(true);

  loadGroupMessages(routeGroupId).catch(() => {
    const state = getGroupsState();
    if (state.groups[routeGroupId]) return;
    if (state.activeGroupId !== routeGroupId) return;
    setActiveGroup(null);
    setMobileShowConversation(false);
  });
}

function activateDirectRoute(params: ActiveThreadState & {
  routeConversationId: string;
}): void {
  const {
    activeConversationId,
    activeGroupId,
    routeConversationId,
    setActiveConversation,
    setActiveGroup,
    setMobileShowConversation,
  } = params;

  if (activeGroupId !== null) {
    setActiveGroup(null);
  }
  if (activeConversationId !== routeConversationId) {
    setActiveConversation(routeConversationId);
  }
  setMobileShowConversation(true);
}

export function useChatThreadRouting(options: UseChatThreadRoutingOptions) {
  const {
    conversations,
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    loadGroupMessages,
    getGroupsState,
    plainConversations,
    activePlainConversationId,
    activePlainGroupId,
    setActivePlainConversation,
    setActivePlainGroup,
    loadPlainGroupMessages,
    savedThreadActive,
    setSavedThreadActive,
    setMobileShowConversation,
    setMobileCreateMenuOpen,
  } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const routeConversationId = getConversationIdFromSearch(location.search);
  const routeGroupId = getGroupIdFromSearch(location.search);
  const routePlainConversationId = getPlainConversationIdFromSearch(location.search);
  const routePlainGroupId = getPlainGroupIdFromSearch(location.search);
  const routeSaved = getSavedFromSearch(location.search);
  const activeThreadState = useMemo<ActiveThreadState>(() => ({
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    setMobileShowConversation,
  }), [
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    setMobileShowConversation,
  ]);

  // Route: group thread
  useEffect(() => {
    if (!routeGroupId) return;
    activateGroupRoute({
      ...activeThreadState,
      routeGroupId,
      loadGroupMessages,
      getGroupsState,
    });
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
  }, [
    routeGroupId,
    activeThreadState,
    loadGroupMessages,
    getGroupsState,
    activePlainConversationId,
    activePlainGroupId,
    setActivePlainConversation,
    setActivePlainGroup,
  ]);

  // Route: direct conversation
  useEffect(() => {
    if (routeGroupId) return;
    if (!routeConversationId || !conversations[routeConversationId]) return;
    activateDirectRoute({ ...activeThreadState, routeConversationId });
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
  }, [
    routeGroupId,
    routeConversationId,
    conversations,
    activeThreadState,
    activePlainConversationId,
    activePlainGroupId,
    setActivePlainConversation,
    setActivePlainGroup,
  ]);

  // Route: plain group
  useEffect(() => {
    if (routeGroupId) return;
    if (routeConversationId && conversations[routeConversationId]) return;
    if (!routePlainGroupId) return;
    if (activeConversationId !== null) setActiveConversation(null);
    if (activeGroupId !== null) setActiveGroup(null);
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== routePlainGroupId) setActivePlainGroup(routePlainGroupId);
    setMobileShowConversation(true);
    loadPlainGroupMessages(routePlainGroupId).catch((err) => { logger.warn("[CHAT] loadPlainGroupMessages failed", err); });
  }, [
    routeGroupId,
    routeConversationId,
    conversations,
    routePlainGroupId,
    activeConversationId,
    activeGroupId,
    activePlainConversationId,
    activePlainGroupId,
    setActiveConversation,
    setActiveGroup,
    setActivePlainConversation,
    setActivePlainGroup,
    setMobileShowConversation,
    loadPlainGroupMessages,
  ]);

  // Route: plain conversation
  useEffect(() => {
    if (routeGroupId) return;
    if (routeConversationId && conversations[routeConversationId]) return;
    if (routePlainGroupId) return;
    if (!routePlainConversationId || !plainConversations[routePlainConversationId]) return;
    if (activeConversationId !== null) setActiveConversation(null);
    if (activeGroupId !== null) setActiveGroup(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
    if (activePlainConversationId !== routePlainConversationId) {
      setActivePlainConversation(routePlainConversationId);
    }
    if (savedThreadActive) setSavedThreadActive(false);
    setMobileShowConversation(true);
  }, [
    routeGroupId,
    routeConversationId,
    conversations,
    routePlainGroupId,
    routePlainConversationId,
    plainConversations,
    activeConversationId,
    activeGroupId,
    activePlainGroupId,
    activePlainConversationId,
    savedThreadActive,
    setActiveConversation,
    setActiveGroup,
    setActivePlainGroup,
    setActivePlainConversation,
    setSavedThreadActive,
    setMobileShowConversation,
  ]);

  // Route: saved messages
  useEffect(() => {
    if (routeGroupId) return;
    if (routeConversationId && conversations[routeConversationId]) return;
    if (routePlainGroupId) return;
    if (routePlainConversationId && plainConversations[routePlainConversationId]) return;
    if (!routeSaved) return;
    clearActiveThreadState(activeThreadState);
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
    if (!savedThreadActive) setSavedThreadActive(true);
    setMobileShowConversation(true);
  }, [
    routeGroupId,
    routeConversationId,
    conversations,
    routePlainGroupId,
    routePlainConversationId,
    plainConversations,
    routeSaved,
    activeThreadState,
    activePlainConversationId,
    activePlainGroupId,
    savedThreadActive,
    setSavedThreadActive,
    setActivePlainConversation,
    setActivePlainGroup,
    setMobileShowConversation,
  ]);

  // Route: clear (no match)
  useEffect(() => {
    if (routeGroupId) return;
    if (routeConversationId && conversations[routeConversationId]) return;
    if (routePlainGroupId) return;
    if (routePlainConversationId && plainConversations[routePlainConversationId]) return;
    if (routeSaved) return;
    clearActiveThreadState(activeThreadState);
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
    if (savedThreadActive) setSavedThreadActive(false);
  }, [
    routeGroupId,
    routeConversationId,
    conversations,
    routePlainGroupId,
    routePlainConversationId,
    plainConversations,
    routeSaved,
    activeThreadState,
    activePlainConversationId,
    activePlainGroupId,
    savedThreadActive,
    setSavedThreadActive,
    setActivePlainConversation,
    setActivePlainGroup,
  ]);

  const updateConversationRoute = useCallback(
    (nextConversationId: string | null) => {
      const nextSearch = buildSearchWithConversation(location.search, nextConversationId);
      if (nextSearch === location.search) return;
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
    },
    [location.pathname, location.search, navigate]
  );

  const updateGroupRoute = useCallback(
    (nextGroupId: string | null) => {
      const nextSearch = buildSearchWithGroup(location.search, nextGroupId);
      if (nextSearch === location.search) return;
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
    },
    [location.pathname, location.search, navigate]
  );

  const updatePlainConversationRoute = useCallback(
    (nextId: string | null) => {
      const nextSearch = buildSearchWithPlainConversation(location.search, nextId);
      if (nextSearch === location.search) return;
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
    },
    [location.pathname, location.search, navigate]
  );

  const updatePlainGroupRoute = useCallback(
    (nextId: string | null) => {
      const nextSearch = buildSearchWithPlainGroup(location.search, nextId);
      if (nextSearch === location.search) return;
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
    },
    [location.pathname, location.search, navigate]
  );

  const updateSavedRoute = useCallback(
    (active: boolean) => {
      const nextSearch = buildSearchWithSaved(location.search, active);
      if (nextSearch === location.search) return;
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
    },
    [location.pathname, location.search, navigate]
  );

  const clearThreadRoute = useCallback(() => {
    const s1 = buildSearchWithConversation(location.search, null);
    const s2 = buildSearchWithGroup(s1, null);
    const s3 = buildSearchWithPlainConversation(s2, null);
    const s4 = buildSearchWithPlainGroup(s3, null);
    const nextSearch = buildSearchWithSaved(s4, false);
    if (nextSearch === location.search) return;
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: false });
  }, [location.pathname, location.search, navigate]);

  const handleBack = useCallback(() => {
    setMobileCreateMenuOpen(false);
    setMobileShowConversation(false);
    clearThreadRoute();
  }, [clearThreadRoute, setMobileCreateMenuOpen, setMobileShowConversation]);

  const handleSelectThread = useCallback(
    (selection: ChatThreadSelection) => {
      setMobileCreateMenuOpen(false);
      setMobileShowConversation(true);

      if (selection.kind === "direct") {
        if (activeGroupId !== null) setActiveGroup(null);
        if (activePlainConversationId !== null) setActivePlainConversation(null);
        if (activePlainGroupId !== null) setActivePlainGroup(null);
        if (activeConversationId !== selection.id) setActiveConversation(selection.id);
        updateConversationRoute(selection.id);
        return;
      }

      if (selection.kind === "group") {
        if (activeConversationId !== null) setActiveConversation(null);
        if (activePlainConversationId !== null) setActivePlainConversation(null);
        if (activePlainGroupId !== null) setActivePlainGroup(null);
        if (activeGroupId !== selection.id) setActiveGroup(selection.id);
        loadGroupMessages(selection.id).catch((err) => { logger.warn("[CHAT] loadGroupMessages failed", err); });
        updateGroupRoute(selection.id);
        return;
      }

      if (selection.kind === "plain-direct") {
        if (activeConversationId !== null) setActiveConversation(null);
        if (activeGroupId !== null) setActiveGroup(null);
        if (activePlainGroupId !== null) setActivePlainGroup(null);
        if (activePlainConversationId !== selection.id) setActivePlainConversation(selection.id);
        updatePlainConversationRoute(selection.id);
        return;
      }

      if (selection.kind === "plain-group") {
        if (activeConversationId !== null) setActiveConversation(null);
        if (activeGroupId !== null) setActiveGroup(null);
        if (activePlainConversationId !== null) setActivePlainConversation(null);
        if (activePlainGroupId !== selection.id) setActivePlainGroup(selection.id);
        if (savedThreadActive) setSavedThreadActive(false);
        loadPlainGroupMessages(selection.id).catch((err) => { logger.warn("[CHAT] loadPlainGroupMessages failed", err); });
        updatePlainGroupRoute(selection.id);
        return;
      }

      if (selection.kind === "saved") {
        if (activeConversationId !== null) setActiveConversation(null);
        if (activeGroupId !== null) setActiveGroup(null);
        if (activePlainConversationId !== null) setActivePlainConversation(null);
        if (activePlainGroupId !== null) setActivePlainGroup(null);
        if (!savedThreadActive) setSavedThreadActive(true);
        updateSavedRoute(true);
      }
    },
    [
      activeConversationId,
      activeGroupId,
      activePlainConversationId,
      activePlainGroupId,
      savedThreadActive,
      setSavedThreadActive,
      loadGroupMessages,
      loadPlainGroupMessages,
      setActiveConversation,
      setActiveGroup,
      setActivePlainConversation,
      setActivePlainGroup,
      setMobileCreateMenuOpen,
      setMobileShowConversation,
      updateConversationRoute,
      updateGroupRoute,
      updatePlainConversationRoute,
      updatePlainGroupRoute,
      updateSavedRoute,
    ]
  );

  return {
    routeConversationId,
    routeGroupId,
    routePlainConversationId,
    routePlainGroupId,
    updateConversationRoute,
    updateGroupRoute,
    updatePlainConversationRoute,
    updatePlainGroupRoute,
    updateSavedRoute,
    clearThreadRoute,
    handleBack,
    handleSelectThread,
  };
}
