import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  COMPOSER_EMOJI_GROUPS,
  COMPOSER_RECENT_EMOJI_STORAGE_KEY,
  DEFAULT_COMPOSER_EMOJI_GROUP_ID,
  filterComposerEmojiEntries,
  getComposerEmojiEntry,
  loadRecentComposerEmojis,
  recordRecentComposerEmoji,
  type MessageComposerEmojiTab,
} from "./index";
import type {
  ComposerEmojiEntry,
  ComposerEmojiGroup,
  ComposerEmojiSubgroup,
} from "./composer-emojis";

interface UseMessageComposerEmojiStateOptions {
  sending: boolean;
  isRecording: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  syncTextareaSelection: () => void;
  insertTextAtSelection: (value: string) => void;
  clearComposerError: () => void;
}

export interface UseMessageComposerEmojiStateResult {
  emojiToggleButtonRef: RefObject<HTMLButtonElement>;
  emojiPickerRef: RefObject<HTMLElement>;
  emojiViewportRef: RefObject<HTMLDivElement>;
  isEmojiPickerOpen: boolean;
  emojiSearchQuery: string;
  isEmojiSearchActive: boolean;
  emojiTabs: readonly MessageComposerEmojiTab[];
  activeEmojiGroupId: string;
  activeEmojiGroup: ComposerEmojiGroup | null;
  activeEmojiSubgroupId: string | null;
  activeEmojiSubgroup: ComposerEmojiSubgroup | null;
  visibleEmojiItems: readonly ComposerEmojiEntry[];
  handleEmojiToggleMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  handleEmojiToggleOpen: () => void;
  closeEmojiPicker: () => void;
  setEmojiSearchQuery: (nextValue: string) => void;
  setActiveEmojiGroupId: (nextValue: string) => void;
  setActiveEmojiSubgroupId: (nextValue: string | null) => void;
  insertEmoji: (emoji: string) => void;
}

function persistRecentEmojis(nextRecentEmojis: readonly string[]) {
  try {
    localStorage.setItem(COMPOSER_RECENT_EMOJI_STORAGE_KEY, JSON.stringify(nextRecentEmojis));
  } catch {
    // Ignore storage failures and keep in-memory recents working.
  }
}

export function useMessageComposerEmojiState({
  sending,
  isRecording,
  textareaRef,
  syncTextareaSelection,
  insertTextAtSelection,
  clearComposerError,
}: UseMessageComposerEmojiStateOptions): UseMessageComposerEmojiStateResult {
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [activeEmojiGroupId, setActiveEmojiGroupId] = useState(DEFAULT_COMPOSER_EMOJI_GROUP_ID);
  const [activeEmojiSubgroupId, setActiveEmojiSubgroupId] = useState<string | null>(null);
  const emojiToggleButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLElement>(null);
  const emojiViewportRef = useRef<HTMLDivElement>(null);

  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
  }, []);

  const applyEmojiSearchQuery = useCallback((nextValue: string) => {
    setEmojiSearchQuery(nextValue);
  }, [setEmojiSearchQuery]);

  const applyActiveEmojiGroupId = useCallback((nextValue: string) => {
    setActiveEmojiGroupId(nextValue);
  }, [setActiveEmojiGroupId]);

  const applyActiveEmojiSubgroupId = useCallback((nextValue: string | null) => {
    setActiveEmojiSubgroupId(nextValue);
  }, [setActiveEmojiSubgroupId]);

  const handleEmojiToggleMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    syncTextareaSelection();
  }, [syncTextareaSelection]);

  const handleEmojiToggleOpen = useCallback(() => {
    clearComposerError();
    setIsEmojiPickerOpen((current) => {
      const next = !current;
      if (next && globalThis.window !== undefined && globalThis.innerWidth <= 640) {
        textareaRef.current?.blur();
      }
      return next;
    });
  }, [clearComposerError, textareaRef]);

  const insertEmoji = useCallback((emoji: string) => {
    if (sending || isRecording) return;

    insertTextAtSelection(emoji);
    setRecentEmojis((current) => {
      const next = recordRecentComposerEmoji(current, emoji);
      persistRecentEmojis(next);
      return next;
    });
    setIsEmojiPickerOpen(false);
  }, [insertTextAtSelection, isRecording, sending]);

  useEffect(() => {
    try {
      setRecentEmojis(
        loadRecentComposerEmojis(localStorage.getItem(COMPOSER_RECENT_EMOJI_STORAGE_KEY))
      );
    } catch {
      setRecentEmojis([]);
    }
  }, []);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (emojiPickerRef.current?.contains(target)) return;
      if (emojiToggleButtonRef.current?.contains(target)) return;
      setIsEmojiPickerOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsEmojiPickerOpen(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEmojiPickerOpen, textareaRef]);

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      setEmojiSearchQuery("");
    }
  }, [isEmojiPickerOpen, setEmojiSearchQuery]);

  useEffect(() => {
    if (activeEmojiGroupId === "recent") {
      if (activeEmojiSubgroupId !== null) setActiveEmojiSubgroupId(null);
      return;
    }

    const activeGroup = COMPOSER_EMOJI_GROUPS.find((group) => group.id === activeEmojiGroupId)
      ?? COMPOSER_EMOJI_GROUPS[0]
      ?? null;
    if (!activeGroup) {
      if (activeEmojiSubgroupId !== null) setActiveEmojiSubgroupId(null);
      return;
    }

    const nextSubgroupId = activeGroup.subgroups[0]?.id ?? null;
    const isCurrentSubgroupValid = activeGroup.subgroups.some(
      (subgroup) => subgroup.id === activeEmojiSubgroupId
    );
    if (!isCurrentSubgroupValid && nextSubgroupId !== activeEmojiSubgroupId) {
      setActiveEmojiSubgroupId(nextSubgroupId);
    }
  }, [activeEmojiGroupId, activeEmojiSubgroupId, setActiveEmojiSubgroupId]);

  useEffect(() => {
    if (isRecording) {
      setIsEmojiPickerOpen(false);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isEmojiPickerOpen || !emojiViewportRef.current) return;
    emojiViewportRef.current.scrollTop = 0;
  }, [activeEmojiGroupId, activeEmojiSubgroupId, emojiSearchQuery, isEmojiPickerOpen]);

  const isEmojiSearchActive = emojiSearchQuery.trim().length > 0;
  const filteredEmojiItems = useMemo(
    () => filterComposerEmojiEntries(emojiSearchQuery),
    [emojiSearchQuery]
  );
  const recentEmojiItems = useMemo(
    () => emojiSearchQuery.trim().length === 0
      ? recentEmojis
          .map((emoji) => getComposerEmojiEntry(emoji))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
    [emojiSearchQuery, recentEmojis]
  );
  const emojiTabs: readonly MessageComposerEmojiTab[] = useMemo(
    () => [
      ...(recentEmojiItems.length > 0
        ? [{ id: "recent", labelKey: "composer.emojiGroup.recent", fallbackLabel: "Recent" }]
        : []),
      ...COMPOSER_EMOJI_GROUPS,
    ],
    [recentEmojiItems.length]
  );
  const activeEmojiGroup = useMemo(
    () => COMPOSER_EMOJI_GROUPS.find((group) => group.id === activeEmojiGroupId)
      ?? COMPOSER_EMOJI_GROUPS[0]
      ?? null,
    [activeEmojiGroupId]
  );
  const activeEmojiSubgroup = useMemo(
    () => activeEmojiGroup?.subgroups.find((subgroup) => subgroup.id === activeEmojiSubgroupId)
      ?? activeEmojiGroup?.subgroups[0]
      ?? null,
    [activeEmojiGroup, activeEmojiSubgroupId]
  );
  const visibleEmojiItems = useMemo(
    () => {
      const nonSearchItems = activeEmojiGroupId === "recent"
        ? recentEmojiItems
        : (activeEmojiSubgroup?.items ?? []);
      return isEmojiSearchActive ? filteredEmojiItems : nonSearchItems;
    },
    [
      activeEmojiGroupId,
      activeEmojiSubgroup,
      filteredEmojiItems,
      isEmojiSearchActive,
      recentEmojiItems,
    ]
  );

  return {
    activeEmojiGroup,
    activeEmojiGroupId,
    activeEmojiSubgroup,
    activeEmojiSubgroupId,
    closeEmojiPicker,
    emojiPickerRef,
    emojiSearchQuery,
    emojiTabs,
    emojiToggleButtonRef,
    emojiViewportRef,
    handleEmojiToggleMouseDown,
    handleEmojiToggleOpen,
    insertEmoji,
    isEmojiPickerOpen,
    isEmojiSearchActive,
    setActiveEmojiGroupId: applyActiveEmojiGroupId,
    setActiveEmojiSubgroupId: applyActiveEmojiSubgroupId,
    setEmojiSearchQuery: applyEmojiSearchQuery,
    visibleEmojiItems,
  };
}
