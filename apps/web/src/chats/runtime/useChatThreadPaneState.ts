import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Message } from "@/stores/messages";

interface UseChatThreadPaneStateOptions {
  activeListId: string | null;
  activeMessages: Message[];
  username: string | null;
  groupSenderLabels?: Record<string, string>;
  activeConversationUsername?: string;
}

interface ChatReplyMeta {
  id: string;
  content: string;
  senderName?: string;
}

interface UseChatThreadPaneStateResult {
  messageSearchOpen: boolean;
  messageSearchQuery: string;
  messageSearchMatches: string[];
  messageSearchMatchIndex: number;
  mediaPanelOpen: boolean;
  mediaAttachmentMessages: Message[];
  highlightMessageId: string | undefined;
  replyToMeta: ChatReplyMeta | undefined;
  handleToggleSearch: () => void;
  handleCloseSearch: () => void;
  handleSearchQueryChange: (value: string) => void;
  handleSearchPrev: () => void;
  handleSearchNext: () => void;
  handleToggleMediaPanel: () => void;
  handleScrollToMessage: (messageId: string) => void;
  handleReply: (messageId: string) => void;
  handleClearReply: () => void;
}

export function useChatThreadPaneState(
  options: UseChatThreadPaneStateOptions
): UseChatThreadPaneStateResult {
  const {
    activeConversationUsername,
    activeListId,
    activeMessages,
    groupSenderLabels,
    username,
  } = options;
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [messageSearchMatchIndex, setMessageSearchMatchIndex] = useState(0);
  const [mediaPanelOpen, setMediaPanelOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<
    string | undefined
  >(undefined);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const setHighlight = useCallback((messageId: string) => {
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current);
    }
    setHighlightMessageId(messageId);
    highlightClearTimerRef.current = setTimeout(() => {
      setHighlightMessageId(undefined);
    }, 3_000);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightClearTimerRef.current) {
        clearTimeout(highlightClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(messageSearchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [messageSearchQuery]);

  const messageSearchMatches = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return [];
    }
    const query = debouncedSearchQuery.trim().toLowerCase();
    return activeMessages
      .filter((message) => message.content?.toLowerCase().includes(query))
      .map((message) => message.id);
  }, [activeMessages, debouncedSearchQuery]);

  useEffect(() => {
    setMessageSearchMatchIndex((currentIndex) =>
      messageSearchMatches.length === 0
        ? 0
        : Math.min(currentIndex, messageSearchMatches.length - 1)
    );
  }, [messageSearchMatches.length]);

  useEffect(() => {
    const currentMatchId = messageSearchMatches[messageSearchMatchIndex];
    if (currentMatchId) {
      setHighlight(currentMatchId);
    }
  }, [messageSearchMatchIndex, messageSearchMatches, setHighlight]);

  const handleToggleSearch = useCallback(() => {
    setMessageSearchOpen((isOpen) => {
      if (isOpen) {
        setMessageSearchQuery("");
        setHighlightMessageId(undefined);
      }
      return !isOpen;
    });
    setMediaPanelOpen(false);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setMessageSearchOpen(false);
    setMessageSearchQuery("");
    setHighlightMessageId(undefined);
  }, []);

  const handleSearchQueryChange = useCallback((value: string) => {
    setMessageSearchQuery(value);
    setMessageSearchMatchIndex(0);
  }, []);

  const handleSearchPrev = useCallback(() => {
    if (messageSearchMatches.length === 0) {
      return;
    }
    setMessageSearchMatchIndex((currentIndex) =>
      currentIndex === 0 ? messageSearchMatches.length - 1 : currentIndex - 1
    );
  }, [messageSearchMatches.length]);

  const handleSearchNext = useCallback(() => {
    if (messageSearchMatches.length === 0) {
      return;
    }
    setMessageSearchMatchIndex(
      (currentIndex) => (currentIndex + 1) % messageSearchMatches.length
    );
  }, [messageSearchMatches.length]);

  const handleToggleMediaPanel = useCallback(() => {
    setMediaPanelOpen((isOpen) => !isOpen);
    setMessageSearchOpen((isOpen) => {
      if (isOpen) {
        setMessageSearchQuery("");
      }
      return false;
    });
  }, []);

  const handleScrollToMessage = useCallback(
    (messageId: string) => {
      setMediaPanelOpen(false);
      setHighlight(messageId);
    },
    [setHighlight]
  );

  const mediaAttachmentMessages = useMemo(
    () =>
      activeMessages.filter(
        (message) => message.type === "attachment" && Boolean(message.attachment)
      ),
    [activeMessages]
  );

  useEffect(() => {
    setReplyingTo(null);
    setMessageSearchOpen(false);
    setMessageSearchQuery("");
    setMediaPanelOpen(false);
    setHighlightMessageId(undefined);
  }, [activeListId]);

  const handleReply = useCallback(
    (messageId: string) => {
      const message = activeMessages.find((entry) => entry.id === messageId);
      if (!message) {
        return;
      }
      setReplyingTo(message);
    },
    [activeMessages]
  );

  const handleClearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const replyToMeta = useMemo<ChatReplyMeta | undefined>(() => {
    if (!replyingTo) {
      return undefined;
    }
    return {
      id: replyingTo.id,
      content: replyingTo.content,
      senderName: replyingTo.isOwn
        ? username ?? undefined
        : groupSenderLabels?.[replyingTo.id] ?? activeConversationUsername,
    };
  }, [activeConversationUsername, groupSenderLabels, replyingTo, username]);

  return {
    messageSearchOpen,
    messageSearchQuery,
    messageSearchMatches,
    messageSearchMatchIndex,
    mediaPanelOpen,
    mediaAttachmentMessages,
    highlightMessageId,
    replyToMeta,
    handleToggleSearch,
    handleCloseSearch,
    handleSearchQueryChange,
    handleSearchPrev,
    handleSearchNext,
    handleToggleMediaPanel,
    handleScrollToMessage,
    handleReply,
    handleClearReply,
  };
}
