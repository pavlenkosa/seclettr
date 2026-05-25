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
} from "./index";
import type {
  ComposerEmojiCatalog,
  ComposerEmojiEntry,
  ComposerEmojiGroup,
} from "./composer-emojis";
import {
  isGifSupportEnabled,
  searchGifs,
  type GifResult,
} from "./composer-gif-service";

interface UseMessageComposerEmojiStateOptions {
  sending: boolean;
  isRecording: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  syncTextareaSelection: () => void;
  insertTextAtSelection: (value: string) => void;
  clearComposerError: () => void;
  supportsGif?: boolean;
  onSendGif?: (gifUrl: string, filename: string) => Promise<void>;
}

export interface UseMessageComposerEmojiStateResult {
  emojiToggleButtonRef: RefObject<HTMLButtonElement>;
  emojiPickerRef: RefObject<HTMLElement>;
  emojiViewportRef: RefObject<HTMLDivElement>;
  isEmojiPickerOpen: boolean;
  emojiSearchQuery: string;
  isEmojiSearchActive: boolean;
  emojiGroups: readonly ComposerEmojiGroup[];
  activeEmojiGroupId: string;
  activeEmojiGroup: ComposerEmojiGroup | null;
  hasRecentEmojis: boolean;
  recentEmojiItems: readonly ComposerEmojiEntry[];
  visibleEmojiItems: readonly ComposerEmojiEntry[];
  handleEmojiToggleMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  handleEmojiToggleOpen: () => void;
  closeEmojiPicker: () => void;
  setEmojiSearchQuery: (nextValue: string) => void;
  setActiveEmojiGroupId: (nextValue: string) => void;
  insertEmoji: (emoji: string) => void;
  // GIF
  isGifMode: boolean;
  isGifTabAvailable: boolean;
  gifQuery: string;
  gifResults: readonly GifResult[];
  isGifLoading: boolean;
  isSendingGif: boolean;
  setGifMode: (next: boolean) => void;
  setGifQuery: (q: string) => void;
  sendGif: (gif: GifResult) => Promise<void>;
}

function persistRecentEmojis(nextRecentEmojis: readonly string[]) {
  try {
    localStorage.setItem(
      COMPOSER_RECENT_EMOJI_STORAGE_KEY,
      JSON.stringify(nextRecentEmojis)
    );
  } catch {
    // ignore storage failures
  }
}

let emojiCatalogPromise: Promise<ComposerEmojiCatalog> | null = null;

function loadComposerEmojiCatalogLazy(): Promise<ComposerEmojiCatalog> {
  emojiCatalogPromise ??= import("./composer-emoji-catalog").then((module) =>
    module.loadComposerEmojiCatalog()
  );
  return emojiCatalogPromise;
}

export function useMessageComposerEmojiState({
  sending,
  isRecording,
  textareaRef,
  syncTextareaSelection,
  insertTextAtSelection,
  clearComposerError,
  supportsGif = false,
  onSendGif,
}: UseMessageComposerEmojiStateOptions): UseMessageComposerEmojiStateResult {
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [emojiCatalog, setEmojiCatalog] = useState<ComposerEmojiCatalog | null>(null);
  const [activeEmojiGroupId, setActiveEmojiGroupId] = useState(DEFAULT_COMPOSER_EMOJI_GROUP_ID);

  // GIF state
  const [isGifMode, setIsGifMode] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [isGifLoading, setIsGifLoading] = useState(false);
  const [isSendingGif, setIsSendingGif] = useState(false);
  const gifSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emojiToggleButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLElement>(null);
  const emojiViewportRef = useRef<HTMLDivElement>(null);

  const isGifTabAvailable = supportsGif && isGifSupportEnabled();

  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
  }, []);

  // Load emoji catalog on first open
  useEffect(() => {
    if (!isEmojiPickerOpen || emojiCatalog) return;

    let cancelled = false;
    loadComposerEmojiCatalogLazy()
      .then((catalog) => {
        if (cancelled) return;
        setEmojiCatalog(catalog);
        setActiveEmojiGroupId((current) => current || catalog.defaultGroupId);
        setRecentEmojis((current) =>
          current.filter((emoji) => catalog.lookup.has(emoji))
        );
      })
      .catch(() => {
        if (!cancelled) setEmojiCatalog(null);
      });

    return () => {
      cancelled = true;
    };
  }, [emojiCatalog, isEmojiPickerOpen]);

  // Load GIFs when entering GIF mode or query changes
  useEffect(() => {
    if (!isGifMode || !isEmojiPickerOpen || !isGifTabAvailable) return;

    if (gifSearchTimerRef.current) clearTimeout(gifSearchTimerRef.current);

    const delay = gifQuery.trim() ? 400 : 0;
    gifSearchTimerRef.current = setTimeout(() => {
      let cancelled = false;
      setIsGifLoading(true);
      searchGifs(gifQuery).then((results) => {
        if (cancelled) return;
        setGifResults(results);
        setIsGifLoading(false);
      }).catch(() => {
        if (!cancelled) setIsGifLoading(false);
      });
      return () => { cancelled = true; };
    }, delay);

    return () => {
      if (gifSearchTimerRef.current) clearTimeout(gifSearchTimerRef.current);
    };
  }, [gifQuery, isGifMode, isEmojiPickerOpen, isGifTabAvailable]);

  const applyEmojiSearchQuery = useCallback((nextValue: string) => {
    setEmojiSearchQuery(nextValue);
  }, []);

  const applyActiveEmojiGroupId = useCallback((nextValue: string) => {
    setActiveEmojiGroupId(nextValue);
  }, []);

  const handleEmojiToggleMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      syncTextareaSelection();
    },
    [syncTextareaSelection]
  );

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

  const insertEmoji = useCallback(
    (emoji: string) => {
      if (sending || isRecording) return;

      insertTextAtSelection(emoji);
      setRecentEmojis((current) => {
        const next = recordRecentComposerEmoji(current, emoji, emojiCatalog);
        persistRecentEmojis(next);
        return next;
      });
      setIsEmojiPickerOpen(false);
    },
    [emojiCatalog, insertTextAtSelection, isRecording, sending]
  );

  const setGifMode = useCallback((next: boolean) => {
    setIsGifMode(next);
    if (next) {
      setEmojiSearchQuery("");
    } else {
      setGifQuery("");
    }
  }, []);

  const sendGif = useCallback(
    async (gif: GifResult) => {
      if (!onSendGif || isSendingGif) return;
      setIsSendingGif(true);
      try {
        await onSendGif(gif.sendUrl, `${gif.id}.gif`);
        setIsEmojiPickerOpen(false);
      } finally {
        setIsSendingGif(false);
      }
    },
    [isSendingGif, onSendGif]
  );

  // Load recent emojis from localStorage on mount
  useEffect(() => {
    try {
      setRecentEmojis(
        loadRecentComposerEmojis(
          localStorage.getItem(COMPOSER_RECENT_EMOJI_STORAGE_KEY)
        )
      );
    } catch {
      setRecentEmojis([]);
    }
  }, []);

  // Close on outside click / Escape
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

  // Clear search when picker closes
  useEffect(() => {
    if (!isEmojiPickerOpen) {
      setEmojiSearchQuery("");
      setGifQuery("");
      setIsGifMode(false);
    }
  }, [isEmojiPickerOpen]);

  // Close on recording start
  useEffect(() => {
    if (isRecording) {
      setIsEmojiPickerOpen(false);
    }
  }, [isRecording]);

  // Scroll to top on group/search change
  useEffect(() => {
    if (!isEmojiPickerOpen || !emojiViewportRef.current) return;
    emojiViewportRef.current.scrollTop = 0;
  }, [activeEmojiGroupId, emojiSearchQuery, isEmojiPickerOpen, isGifMode]);

  const isEmojiSearchActive = emojiSearchQuery.trim().length > 0;

  const filteredEmojiItems = useMemo(
    () => filterComposerEmojiEntries(emojiCatalog, emojiSearchQuery),
    [emojiCatalog, emojiSearchQuery]
  );

  const recentEmojiItems = useMemo(
    () =>
      emojiSearchQuery.trim().length === 0
        ? recentEmojis
            .map((emoji) => getComposerEmojiEntry(emojiCatalog, emoji))
            .filter(
              (entry): entry is NonNullable<typeof entry> => entry !== null
            )
        : [],
    [emojiCatalog, emojiSearchQuery, recentEmojis]
  );

  const emojiGroups = useMemo(
    () => emojiCatalog?.groups ?? [],
    [emojiCatalog]
  );

  const activeEmojiGroup = useMemo(
    () =>
      emojiCatalog?.groups.find((group) => group.id === activeEmojiGroupId) ??
      emojiCatalog?.groups[0] ??
      null,
    [activeEmojiGroupId, emojiCatalog]
  );

  const visibleEmojiItems = useMemo(() => {
    if (!isEmojiSearchActive) return [];
    return filteredEmojiItems;
  }, [filteredEmojiItems, isEmojiSearchActive]);

  return {
    activeEmojiGroup,
    activeEmojiGroupId,
    closeEmojiPicker,
    emojiGroups,
    emojiPickerRef,
    emojiSearchQuery,
    emojiToggleButtonRef,
    emojiViewportRef,
    handleEmojiToggleMouseDown,
    handleEmojiToggleOpen,
    hasRecentEmojis: recentEmojiItems.length > 0,
    insertEmoji,
    isEmojiPickerOpen,
    isEmojiSearchActive,
    recentEmojiItems,
    setActiveEmojiGroupId: applyActiveEmojiGroupId,
    setEmojiSearchQuery: applyEmojiSearchQuery,
    visibleEmojiItems,
    // GIF
    gifQuery,
    gifResults,
    isGifLoading,
    isGifMode,
    isGifTabAvailable,
    isSendingGif,
    sendGif,
    setGifMode,
    setGifQuery,
  };
}
