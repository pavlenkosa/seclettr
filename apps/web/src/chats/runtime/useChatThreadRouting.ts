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
  getConversationIdFromSearch,
  getGroupIdFromSearch,
} from "@/lib/chat-route";

export interface ChatThreadSelection {
  kind: "direct" | "group";
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
    setMobileShowConversation,
    setMobileCreateMenuOpen,
  } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const routeConversationId = getConversationIdFromSearch(location.search);
  const routeGroupId = getGroupIdFromSearch(location.search);
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
      return;
    }

    if (!routeConversationId || !conversations[routeConversationId]) {
      clearActiveThreadState(activeThreadState);
      return;
    }

    activateDirectRoute({
      ...activeThreadState,
      routeConversationId,
    });
  }, [
    routeConversationId,
    routeGroupId,
    conversations,
    activeThreadState,
    loadGroupMessages,
    getGroupsState,
  ]);

  const updateConversationRoute = useCallback(
    (nextConversationId: string | null) => {
      const nextSearch = buildSearchWithConversation(
        location.search,
        nextConversationId
      );
      if (nextSearch === location.search) return;
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch,
        },
        { replace: false }
      );
    },
    [location.pathname, location.search, navigate]
  );

  const updateGroupRoute = useCallback(
    (nextGroupId: string | null) => {
      const nextSearch = buildSearchWithGroup(location.search, nextGroupId);
      if (nextSearch === location.search) return;
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch,
        },
        { replace: false }
      );
    },
    [location.pathname, location.search, navigate]
  );

  const clearThreadRoute = useCallback(() => {
    const withoutConversation = buildSearchWithConversation(location.search, null);
    const nextSearch = buildSearchWithGroup(withoutConversation, null);
    if (nextSearch === location.search) return;
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
      },
      { replace: false }
    );
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
        if (activeGroupId !== null) {
          setActiveGroup(null);
        }
        if (activeConversationId !== selection.id) {
          setActiveConversation(selection.id);
        }
        updateConversationRoute(selection.id);
        return;
      }

      if (activeConversationId !== null) {
        setActiveConversation(null);
      }
      if (activeGroupId !== selection.id) {
        setActiveGroup(selection.id);
      }
      loadGroupMessages(selection.id).catch(() => {});
      updateGroupRoute(selection.id);
    },
    [
      activeConversationId,
      activeGroupId,
      loadGroupMessages,
      setActiveConversation,
      setActiveGroup,
      setMobileCreateMenuOpen,
      setMobileShowConversation,
      updateConversationRoute,
      updateGroupRoute,
    ]
  );

  return {
    routeConversationId,
    routeGroupId,
    updateConversationRoute,
    updateGroupRoute,
    clearThreadRoute,
    handleBack,
    handleSelectThread,
  };
}
