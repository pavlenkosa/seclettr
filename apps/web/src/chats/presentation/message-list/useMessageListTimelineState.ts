import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Message } from "@/stores/messages";
import { getMessageListAutoScrollBehavior } from "./message-list-scroll";

const JUMP_TO_BOTTOM_THRESHOLD_PX = 80;

export interface MessageListVirtualizer {
  scrollToIndex: (
    index: number,
    options: { align: "end" | "center"; behavior?: ScrollBehavior }
  ) => void;
}

interface UseMessageListTimelineStateOptions {
  messages: Message[];
  rowCount?: number;
  highlightMessageId?: string;
  highlightRowIndex?: number;
  shouldVirtualize: boolean;
  virtualizer: MessageListVirtualizer;
  onJumpToBottomStateChange?: (state: {
    visible: boolean;
    pendingCount: number;
  }) => void;
  containerRef?: RefObject<HTMLDivElement>;
  bottomRef?: RefObject<HTMLDivElement>;
}

interface UseMessageListTimelineStateResult {
  containerRef: RefObject<HTMLDivElement>;
  bottomRef: RefObject<HTMLDivElement>;
  activeMediaKey: string | null;
  showJumpToBottom: boolean;
  pendingNewMessages: number;
  handleActiveMediaChange: (next: string | null) => void;
  handleJumpToBottom: () => void;
  scrollToBottom: () => void;
}

function readPrefersReducedMotion(): boolean {
  return globalThis.window !== undefined
    && typeof globalThis.globalThis.matchMedia === "function"
    && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useMessageListTimelineState({
  messages,
  rowCount,
  highlightMessageId,
  highlightRowIndex,
  shouldVirtualize,
  virtualizer,
  onJumpToBottomStateChange,
  containerRef: externalContainerRef,
  bottomRef: externalBottomRef,
}: UseMessageListTimelineStateOptions): UseMessageListTimelineStateResult {
  const lastRowIndex = (rowCount ?? messages.length) - 1;
  const lastMessage = messages.at(-1) ?? null;
  const lastMessageId = lastMessage?.id ?? null;
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const internalBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalContainerRef;
  const bottomRef = externalBottomRef ?? internalBottomRef;
  const previousMessageCountRef = useRef(0);
  const [activeMediaKey, setActiveMediaKey] = useState<string | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [pendingNewMessages, setPendingNewMessages] = useState(0);

  const handleActiveMediaChange = useCallback((next: string | null) => {
    setActiveMediaKey(next);
  }, []);

  const readDistanceFromBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return 0;
    return Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
  }, [containerRef]);

  const syncJumpStateFromDistance = useCallback((distanceFromBottom: number) => {
    const shouldShow = distanceFromBottom > JUMP_TO_BOTTOM_THRESHOLD_PX;
    setShowJumpToBottom((current) => (current === shouldShow ? current : shouldShow));
    if (!shouldShow) {
      setPendingNewMessages((current) => (current === 0 ? current : 0));
    }
    return shouldShow;
  }, []);

  const scrollToBottomWithBehavior = useCallback((behavior: ScrollBehavior) => {
    setShowJumpToBottom(false);
    setPendingNewMessages(0);
    if (lastRowIndex < 0) return;

    if (shouldVirtualize) {
      virtualizer.scrollToIndex(lastRowIndex, {
        align: "end",
        behavior,
      });
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, [bottomRef, lastRowIndex, shouldVirtualize, virtualizer]);

  const handleJumpToBottom = useCallback(() => {
    scrollToBottomWithBehavior("smooth");
  }, [scrollToBottomWithBehavior]);

  useEffect(() => {
    onJumpToBottomStateChange?.({
      visible: showJumpToBottom,
      pendingCount: pendingNewMessages,
    });
  }, [onJumpToBottomStateChange, pendingNewMessages, showJumpToBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      syncJumpStateFromDistance(
        Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight)
      );
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, syncJumpStateFromDistance]);

  // When the virtual keyboard opens (visualViewport shrinks), scroll to bottom
  // if already near the bottom so the last message stays visible.
  useEffect(() => {
    const vv = globalThis.visualViewport;
    if (!vv) return;

    const onVvResize = () => {
      if (readDistanceFromBottom() <= JUMP_TO_BOTTOM_THRESHOLD_PX) {
        scrollToBottomWithBehavior("instant");
      }
    };

    vv.addEventListener("resize", onVvResize);
    return () => vv.removeEventListener("resize", onVvResize);
  }, [readDistanceFromBottom, scrollToBottomWithBehavior]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () => {
      syncJumpStateFromDistance(readDistanceFromBottom());
    };

    sync();
    const frameId = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(sync)
      : null;
    const handleWindowResize = () => sync();
    globalThis.window?.addEventListener("resize", handleWindowResize, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => sync());
      resizeObserver.observe(container);
      const contentRoot = container.firstElementChild;
      if (contentRoot instanceof HTMLElement) {
        resizeObserver.observe(contentRoot);
      }
    }

    return () => {
      if (frameId !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frameId);
      }
      globalThis.window?.removeEventListener("resize", handleWindowResize);
      resizeObserver?.disconnect();
    };
  }, [
    containerRef,
    messages.length,
    readDistanceFromBottom,
    rowCount,
    syncJumpStateFromDistance,
  ]);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const nextMessageCount = messages.length;
    const appendedCount = Math.max(0, nextMessageCount - previousMessageCount);
    const distanceFromBottomPx = readDistanceFromBottom();
    const isOwnAppend = appendedCount > 0 && Boolean(lastMessage?.isOwn);

    const behavior = getMessageListAutoScrollBehavior({
      previousMessageCount,
      nextMessageCount,
      distanceFromBottomPx,
      prefersReducedMotion: readPrefersReducedMotion(),
      forceScroll: isOwnAppend,
    });

    previousMessageCountRef.current = nextMessageCount;
    if (!behavior || lastRowIndex < 0) {
      if (appendedCount > 0 && !lastMessage?.isOwn && distanceFromBottomPx > JUMP_TO_BOTTOM_THRESHOLD_PX) {
        setShowJumpToBottom(true);
        setPendingNewMessages((current) => current + appendedCount);
      } else if (distanceFromBottomPx <= JUMP_TO_BOTTOM_THRESHOLD_PX) {
        syncJumpStateFromDistance(distanceFromBottomPx);
      }
      return;
    }

    scrollToBottomWithBehavior(behavior);
  }, [
    lastMessage?.isOwn,
    lastMessageId,
    lastRowIndex,
    messages.length,
    readDistanceFromBottom,
    scrollToBottomWithBehavior,
    syncJumpStateFromDistance,
  ]);

  useEffect(() => {
    if (!activeMediaKey) return;

    const hasActiveMedia = messages.some(
      (message) => `voice:${message.id}` === activeMediaKey || `video:${message.id}` === activeMediaKey
    );

    if (!hasActiveMedia) {
      setActiveMediaKey(null);
    }
  }, [activeMediaKey, messages]);

  useEffect(() => {
    if (!highlightMessageId) return;

    if (shouldVirtualize) {
      const resolvedHighlightRowIndex = highlightRowIndex ?? -1;
      if (resolvedHighlightRowIndex >= 0) {
        virtualizer.scrollToIndex(resolvedHighlightRowIndex, { align: "center", behavior: "smooth" });
      }
      return;
    }

    const element = containerRef.current?.querySelector(`[data-mid="${highlightMessageId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [containerRef, highlightMessageId, highlightRowIndex, shouldVirtualize, virtualizer]);

  return {
    activeMediaKey,
    bottomRef,
    containerRef,
    handleActiveMediaChange,
    handleJumpToBottom,
    pendingNewMessages,
    scrollToBottom: handleJumpToBottom,
    showJumpToBottom,
  };
}
