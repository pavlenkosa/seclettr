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
  COMPOSER_RECENT_EMOJI_STORAGE_KEY,
  DEFAULT_COMPOSER_EMOJI_GROUP_ID,
  filterComposerEmojiEntries,
  getComposerEmojiEntry,
  loadRecentComposerEmojis,
  recordRecentComposerEmoji,
  type MessageComposerEmojiTab,
} from "./index";
import type {
  ComposerEmojiCatalog,
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

let emojiCatalogPromise: Promise<ComposerEmojiCatalog> | null = null;

function loadComposerEmojiCatalogLazy(): Promise<ComposerEmojiCatalog> {
  emojiCatalogPromise ??= import("./composer-emoji-catalog").then((module) => module.loadComposerEmojiCatalog());
  return emojiCatalogPromise;
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
  const [emojiCatalog, setEmojiCatalog] = useState<ComposerEmojiCatalog | null>(null);
  const [activeEmojiGroupId, setActiveEmojiGroupId] = useState(DEFAULT_COMPOSER_EMOJI_GROUP_ID);
  const [activeEmojiSubgroupId, setActiveEmojiSubgroupId] = useState<string | null>(null);
  const emojiToggleButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLElement>(null);
  const emojiViewportRef = useRef<HTMLDivElement>(null);

  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!isEmojiPickerOpen || emojiCatalog) return;

    let cancelled = false;
    loadComposerEmojiCatalogLazy().then((catalog) => {
      if (cancelled) return;
      setEmojiCatalog(catalog);
      setActiveEmojiGroupId((current) => current || catalog.defaultGroupId);
      setRecentEmojis((current) => current.filter((emoji) => catalog.lookup.has(emoji)));
    }).catch(() => {
      if (!cancelled) setEmojiCatalog(null);
    });

    return () => {
      cancelled = true;
    };
  }, [emojiCatalog, isEmojiPickerOpen]);

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
      const next = recordRecentComposerEmoji(current, emoji, emojiCatalog);
      persistRecentEmojis(next);
      return next;
    });
    setIsEmojiPickerOpen(false);
  }, [emojiCatalog, insertTextAtSelection, isRecording, sending]);

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

    const activeGroup = emojiCatalog?.groups.find((group) => group.id === activeEmojiGroupId)
      ?? emojiCatalog?.groups[0]
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
  }, [activeEmojiGroupId, activeEmojiSubgroupId, emojiCatalog, setActiveEmojiSubgroupId]);

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
    () => filterComposerEmojiEntries(emojiCatalog, emojiSearchQuery),
    [emojiCatalog, emojiSearchQuery]
  );
  const recentEmojiItems = useMemo(
    () => emojiSearchQuery.trim().length === 0
      ? recentEmojis
          .map((emoji) => getComposerEmojiEntry(emojiCatalog, emoji))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
    [emojiCatalog, emojiSearchQuery, recentEmojis]
  );
  const emojiTabs: readonly MessageComposerEmojiTab[] = useMemo(
    () => [
      ...(recentEmojiItems.length > 0
        ? [{ id: "recent", labelKey: "composer.emojiGroup.recent", fallbackLabel: "Recent" }]
        : []),
      ...(emojiCatalog?.groups ?? []),
    ],
    [emojiCatalog, recentEmojiItems.length]
  );
  const activeEmojiGroup = useMemo(
    () => emojiCatalog?.groups.find((group) => group.id === activeEmojiGroupId)
      ?? emojiCatalog?.groups[0]
      ?? null,
    [activeEmojiGroupId, emojiCatalog]
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
