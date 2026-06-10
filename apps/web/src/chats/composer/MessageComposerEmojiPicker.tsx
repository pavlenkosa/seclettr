import React, { useRef, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { useModalSurfaceA11y } from "@/lib/hooks";
import { IconButton } from "@/components/ui";

import {
  COMPOSER_EMOJI_TOGGLE_GLYPH,
  type ComposerEmojiEntry,
  type ComposerEmojiGroup,
} from "./composer-emojis";
import type { GifResult } from "./composer-gif-service";
import styles from "./MessageComposerEmojiPicker.module.css";

export interface MessageComposerEmojiPickerProps {
  readonly isOpen: boolean;
  readonly disabled: boolean;
  readonly pickerId: string;
  readonly searchQuery: string;
  readonly isSearchActive: boolean;
  readonly emojiGroups: readonly ComposerEmojiGroup[];
  readonly activeEmojiGroupId: string;
  readonly activeEmojiGroup: ComposerEmojiGroup | null;
  readonly hasRecentEmojis: boolean;
  readonly recentEmojiItems: readonly ComposerEmojiEntry[];
  readonly visibleEmojiItems: readonly ComposerEmojiEntry[];
  readonly toggleButtonRef: RefObject<HTMLButtonElement>;
  readonly pickerRef: RefObject<HTMLElement>;
  readonly viewportRef: RefObject<HTMLDivElement>;
  readonly onToggleMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onToggleOpen: () => void;
  readonly onSearchQueryChange: (value: string) => void;
  readonly onSelectEmojiGroup: (groupId: string) => void;
  readonly onInsertEmoji: (emoji: string) => void;
  // GIF
  readonly isGifMode: boolean;
  readonly isGifTabAvailable: boolean;
  readonly gifQuery: string;
  readonly gifResults: readonly GifResult[];
  readonly isGifLoading: boolean;
  readonly isSendingGif: boolean;
  readonly onSetGifMode: (next: boolean) => void;
  readonly onSetGifQuery: (q: string) => void;
  readonly onSendGif: (gif: GifResult) => Promise<void>;
}

/** Maps emoji group IDs to representative emoji icons shown in the bottom tab bar. */
const GROUP_ICONS: Record<string, string> = {
  "smileys-and-emotion": "😀",
  "people-and-body": "👋",
  "animals-and-nature": "🐶",
  "food-and-drink": "🍎",
  "travel-and-places": "✈️",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

// ── Sub-components ──────────────────────────────────────────────────────────

type EmojiGridProps = Readonly<{
  items: readonly ComposerEmojiEntry[];
  onInsert: (emoji: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}>;

function EmojiGrid({ items, onInsert, t }: EmojiGridProps) {
  if (items.length === 0) {
    return (
      <div className={styles.emojiEmptyState}>
        {t("composer.emojiSearch.empty")}
      </div>
    );
  }

  return (
    <div className={styles.emojiGrid}>
      {items.map((item) => (
        <button
          key={`${item.subgroupId}-${item.emoji}`}
          type="button"
          className={styles.emojiButton}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(item.emoji)}
          aria-label={t("composer.aria.insertEmoji", { emoji: item.emoji })}
          title={item.name}
        >
          <span aria-hidden="true">{item.emoji}</span>
        </button>
      ))}
    </div>
  );
}

type EmojiSectionsProps = Readonly<{
  group: ComposerEmojiGroup;
  onInsert: (emoji: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}>;

function EmojiSections({ group, onInsert, t }: EmojiSectionsProps) {
  return (
    <>
      {group.subgroups.map((subgroup) => (
        <div key={subgroup.id} className={styles.emojiSection}>
          <div className={styles.emojiSectionHeader}>{subgroup.label}</div>
          <EmojiGrid items={subgroup.items} onInsert={onInsert} t={t} />
        </div>
      ))}
    </>
  );
}

type GifPanelProps = Readonly<{
  gifResults: readonly GifResult[];
  isGifLoading: boolean;
  isSendingGif: boolean;
  gifQuery: string;
  onSendGif: (gif: GifResult) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
}>;

function GifPanel({
  gifResults,
  isGifLoading,
  isSendingGif,
  gifQuery,
  onSendGif,
  t,
}: GifPanelProps) {
  if (isGifLoading) {
    return (
      <div className={styles.gifLoadingState}>
        <div className={styles.gifSpinner} aria-hidden="true" />
      </div>
    );
  }

  if (gifResults.length === 0) {
    return (
      <div className={styles.emojiEmptyState}>
        {gifQuery.trim()
          ? t("composer.gifSearch.empty")
          : t("composer.gifSearch.trending")}
      </div>
    );
  }

  return (
    <>
    <div className={styles.gifGrid}>
      {gifResults.map((gif) => (
        <button
          key={gif.id}
          type="button"
          className={styles.gifCell}
          disabled={isSendingGif}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void onSendGif(gif)}
          title={gif.title || t("composer.gif.send")}
          aria-label={gif.title || t("composer.gif.send")}
        >
          <img
            src={gif.previewUrl}
            alt={gif.title}
            loading="lazy"
            decoding="async"
            className={styles.gifImg}
            style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
          />
        </button>
      ))}
    </div>
    <div className={styles.gifAttribution}>Powered by GIPHY</div>
    </>
  );
}

type EmojiTabBarProps = Readonly<{
  emojiGroups: readonly ComposerEmojiGroup[];
  activeEmojiGroupId: string;
  hasRecentEmojis: boolean;
  isGifMode: boolean;
  isGifTabAvailable: boolean;
  onSelectGroup: (groupId: string) => void;
  onSetGifMode: (next: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
}>;

function EmojiTabBar({
  emojiGroups,
  activeEmojiGroupId,
  hasRecentEmojis,
  isGifMode,
  isGifTabAvailable,
  onSelectGroup,
  onSetGifMode,
  t,
}: EmojiTabBarProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const { key } = e;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;

    e.preventDefault();

    const tablist = tablistRef.current;
    if (!tablist) return;

    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(btn => btn.getAttribute("aria-selected") === "true");
    const start = currentIndex === -1 ? 0 : currentIndex;

    let nextIndex: number;
    if (key === "ArrowRight" || key === "ArrowDown") {
      nextIndex = (start + 1) % tabs.length;
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      nextIndex = (start - 1 + tabs.length) % tabs.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else {
      nextIndex = tabs.length - 1;
    }

    const next = tabs[nextIndex];
    if (!next) return;
    next.focus();
    next.click();
  }

  return (
    <div
      ref={tablistRef}
      className={styles.emojiTabBar}
      role="tablist"
      tabIndex={-1}
      aria-label={t("composer.aria.emojiCategories")}
      onKeyDown={handleKeyDown}
    >
      {hasRecentEmojis && (
        <button
          type="button"
          role="tab"
          className={`${styles.emojiTabBtn} ${!isGifMode && activeEmojiGroupId === "recent" ? styles.emojiTabBtnActive : ""}`}
          onClick={() => { onSetGifMode(false); onSelectGroup("recent"); }}
          title={t("composer.emojiGroup.recent")}
          aria-selected={!isGifMode && activeEmojiGroupId === "recent"}
        >
          <span aria-hidden="true">🕐</span>
          <span className={styles.screenReaderOnly}>
            {t("composer.emojiGroup.recent")}
          </span>
        </button>
      )}

      {emojiGroups.map((group) => (
        <button
          key={group.id}
          type="button"
          role="tab"
          className={`${styles.emojiTabBtn} ${!isGifMode && activeEmojiGroupId === group.id ? styles.emojiTabBtnActive : ""}`}
          onClick={() => { onSetGifMode(false); onSelectGroup(group.id); }}
          title={group.fallbackLabel}
          aria-selected={!isGifMode && activeEmojiGroupId === group.id}
        >
          <span aria-hidden="true">{GROUP_ICONS[group.id] ?? "🙂"}</span>
        </button>
      ))}

      {isGifTabAvailable && (
        <>
          <div className={styles.emojiTabSpacer} />
          <button
            type="button"
            role="tab"
            className={`${styles.emojiTabBtn} ${isGifMode ? styles.emojiTabBtnActive : ""}`}
            onClick={() => onSetGifMode(true)}
            title="GIF"
            aria-selected={isGifMode}
          >
            <span className={styles.gifTabLabel} aria-hidden="true">GIF</span>
          </button>
        </>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MessageComposerEmojiPicker({
  isOpen,
  disabled,
  pickerId,
  searchQuery,
  isSearchActive,
  emojiGroups,
  activeEmojiGroupId,
  activeEmojiGroup,
  hasRecentEmojis,
  recentEmojiItems,
  visibleEmojiItems,
  toggleButtonRef,
  pickerRef,
  viewportRef,
  onToggleMouseDown,
  onToggleOpen,
  onSearchQueryChange,
  onSelectEmojiGroup,
  onInsertEmoji,
  isGifMode,
  isGifTabAvailable,
  gifQuery,
  gifResults,
  isGifLoading,
  isSendingGif,
  onSetGifMode,
  onSetGifQuery,
  onSendGif,
}: MessageComposerEmojiPickerProps) {
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useModalSurfaceA11y({
    containerRef: pickerRef as RefObject<HTMLElement>,
    isActive: isOpen,
    onClose: onToggleOpen,
    initialFocusRef: searchInputRef,
  });

  const currentSearchQuery = isGifMode ? gifQuery : searchQuery;
  const handleSearchChange = (value: string) => {
    if (isGifMode) onSetGifQuery(value);
    else onSearchQueryChange(value);
  };
  const searchPlaceholder = isGifMode
    ? t("composer.gifSearch.placeholder")
    : t("composer.emojiSearch.placeholder");

  function renderContent() {
    if (isGifMode) {
      return (
        <GifPanel
          gifResults={gifResults}
          isGifLoading={isGifLoading}
          isSendingGif={isSendingGif}
          gifQuery={gifQuery}
          onSendGif={onSendGif}
          t={t}
        />
      );
    }

    if (isSearchActive) {
      return (
        <EmojiGrid
          items={visibleEmojiItems}
          onInsert={onInsertEmoji}
          t={t}
        />
      );
    }

    if (activeEmojiGroupId === "recent") {
      return (
        <EmojiGrid
          items={recentEmojiItems}
          onInsert={onInsertEmoji}
          t={t}
        />
      );
    }

    if (activeEmojiGroup) {
      return (
        <EmojiSections
          group={activeEmojiGroup}
          onInsert={onInsertEmoji}
          t={t}
        />
      );
    }

    return null;
  }

  return (
    <div className={styles.emojiShell}>
      <IconButton
        ref={toggleButtonRef}
        onMouseDown={onToggleMouseDown}
        onClick={onToggleOpen}
        disabled={disabled}
        className={styles.secondaryBtn}
        active={isOpen}
        aria-label={t(
          isOpen
            ? "composer.aria.closeEmojiPicker"
            : "composer.aria.openEmojiPicker"
        )}
        aria-expanded={isOpen}
        aria-controls={pickerId}
        aria-haspopup="true"
        title={t(
          isOpen
            ? "composer.title.closeEmojiPicker"
            : "composer.title.openEmojiPicker"
        )}
      >
        <span className={styles.emojiToggleGlyph} aria-hidden="true">
          {COMPOSER_EMOJI_TOGGLE_GLYPH}
        </span>
      </IconButton>

      {isOpen ? (
        <div
          id={pickerId}
          ref={pickerRef as React.RefObject<HTMLDivElement>}
          className={styles.emojiPicker}
          role="dialog"
          aria-modal="true"
          aria-label={t("composer.aria.emojiPicker")}
        >
          {/* Search bar */}
          <div className={styles.emojiSearchWrap}>
            <input
              ref={searchInputRef}
              type="search"
              value={currentSearchQuery}
              onChange={(e) => handleSearchChange(e.currentTarget.value)}
              className={styles.emojiSearchInput}
              placeholder={searchPlaceholder}
              aria-label={isGifMode ? t("composer.aria.searchGif") : t("composer.aria.searchEmoji")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {/* Scrollable content */}
          <div
            ref={viewportRef}
            className={styles.emojiViewport}
            aria-label={isGifMode ? t("composer.aria.gifResults") : t("composer.aria.emojiResults")}
          >
            {renderContent()}
          </div>

          {/* Bottom tab bar */}
          <EmojiTabBar
            emojiGroups={emojiGroups}
            activeEmojiGroupId={activeEmojiGroupId}
            hasRecentEmojis={hasRecentEmojis}
            isGifMode={isGifMode}
            isGifTabAvailable={isGifTabAvailable}
            onSelectGroup={onSelectEmojiGroup}
            onSetGifMode={onSetGifMode}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}
