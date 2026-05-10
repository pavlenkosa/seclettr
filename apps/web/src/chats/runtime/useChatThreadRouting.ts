import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildSearchWithConversation,
  buildSearchWithGroup,
  buildSearchWithPlainConversation,
  buildSearchWithPlainGroup,
  getConversationIdFromSearch,
  getGroupIdFromSearch,
  getPlainConversationIdFromSearch,
  getPlainGroupIdFromSearch,
} from "@/lib/chat-route";

export interface ChatThreadSelection {
  kind: "direct" | "group" | "plain-direct" | "plain-group";
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
    setMobileShowConversation,
    setMobileCreateMenuOpen,
  } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const routeConversationId = getConversationIdFromSearch(location.search);
  const routeGroupId = getGroupIdFromSearch(location.search);
  const routePlainConversationId = getPlainConversationIdFromSearch(location.search);
  const routePlainGroupId = getPlainGroupIdFromSearch(location.search);
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

  useEffect(() => {
    if (routeGroupId) {
      activateGroupRoute({
        ...activeThreadState,
        routeGroupId,
        loadGroupMessages,
        getGroupsState,
      });
      if (activePlainConversationId !== null) setActivePlainConversation(null);
      if (activePlainGroupId !== null) setActivePlainGroup(null);
      return;
    }

    if (routeConversationId && conversations[routeConversationId]) {
      activateDirectRoute({ ...activeThreadState, routeConversationId });
      if (activePlainConversationId !== null) setActivePlainConversation(null);
      if (activePlainGroupId !== null) setActivePlainGroup(null);
      return;
    }

    if (routePlainGroupId) {
      if (activeConversationId !== null) setActiveConversation(null);
      if (activeGroupId !== null) setActiveGroup(null);
      if (activePlainConversationId !== null) setActivePlainConversation(null);
      if (activePlainGroupId !== routePlainGroupId) setActivePlainGroup(routePlainGroupId);
      setMobileShowConversation(true);
      loadPlainGroupMessages(routePlainGroupId).catch(() => {});
      return;
    }

    if (routePlainConversationId && plainConversations[routePlainConversationId]) {
      if (activeConversationId !== null) setActiveConversation(null);
      if (activeGroupId !== null) setActiveGroup(null);
      if (activePlainGroupId !== null) setActivePlainGroup(null);
      if (activePlainConversationId !== routePlainConversationId) {
        setActivePlainConversation(routePlainConversationId);
      }
      setMobileShowConversation(true);
      return;
    }

    clearActiveThreadState(activeThreadState);
    if (activePlainConversationId !== null) setActivePlainConversation(null);
    if (activePlainGroupId !== null) setActivePlainGroup(null);
  }, [
    routeConversationId,
    routeGroupId,
    routePlainConversationId,
    routePlainGroupId,
    conversations,
    plainConversations,
    activeThreadState,
    loadGroupMessages,
    getGroupsState,
    loadPlainGroupMessages,
    activeConversationId,
    activeGroupId,
    activePlainConversationId,
    activePlainGroupId,
    setActiveConversation,
    setActiveGroup,
    setActivePlainConversation,
    setActivePlainGroup,
    setMobileShowConversation,
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

  const clearThreadRoute = useCallback(() => {
    const s1 = buildSearchWithConversation(location.search, null);
    const s2 = buildSearchWithGroup(s1, null);
    const s3 = buildSearchWithPlainConversation(s2, null);
    const nextSearch = buildSearchWithPlainGroup(s3, null);
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
        loadGroupMessages(selection.id).catch(() => {});
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
        loadPlainGroupMessages(selection.id).catch(() => {});
        updatePlainGroupRoute(selection.id);
      }
    },
    [
      activeConversationId,
      activeGroupId,
      activePlainConversationId,
      activePlainGroupId,
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
    clearThreadRoute,
    handleBack,
    handleSelectThread,
  };
}
