import React, { type MouseEvent, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";

import {
  COMPOSER_EMOJI_TOGGLE_GLYPH,
  type ComposerEmojiEntry,
  type ComposerEmojiGroup,
  type ComposerEmojiSubgroup,
} from "./composer-emojis";
import styles from "../presentation/MessageComposer.module.css";

/**
 * Static tab metadata used by the emoji picker category switcher.
 */
export interface MessageComposerEmojiTab {
  id: string;
  labelKey: string;
  fallbackLabel: string;
}

/**
 * Props for the composer emoji toggle button and floating picker panel.
 */
export interface MessageComposerEmojiPickerProps {
  readonly isOpen: boolean;
  readonly disabled: boolean;
  readonly pickerId: string;
  readonly searchQuery: string;
  readonly isSearchActive: boolean;
  readonly emojiTabs: readonly MessageComposerEmojiTab[];
  readonly activeEmojiGroupId: string;
  readonly activeEmojiGroup: ComposerEmojiGroup | null;
  readonly activeEmojiSubgroup: ComposerEmojiSubgroup | null;
  readonly visibleEmojiItems: readonly ComposerEmojiEntry[];
  readonly toggleButtonRef: RefObject<HTMLButtonElement>;
  readonly pickerRef: RefObject<HTMLElement>;
  readonly viewportRef: RefObject<HTMLDivElement>;
  readonly onToggleMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onToggleOpen: () => void;
  readonly onSearchQueryChange: (value: string) => void;
  readonly onSelectEmojiGroup: (groupId: string) => void;
  readonly onSelectEmojiSubgroup: (subgroupId: string) => void;
  readonly onInsertEmoji: (emoji: string) => void;
}

/**
 * Presentation-only emoji picker used in the message composer.
 * State and behavior are delegated to the parent container.
 */
export function MessageComposerEmojiPicker({
  isOpen,
  disabled,
  pickerId,
  searchQuery,
  isSearchActive,
  emojiTabs,
  activeEmojiGroupId,
  activeEmojiGroup,
  activeEmojiSubgroup,
  visibleEmojiItems,
  toggleButtonRef,
  pickerRef,
  viewportRef,
  onToggleMouseDown,
  onToggleOpen,
  onSearchQueryChange,
  onSelectEmojiGroup,
  onSelectEmojiSubgroup,
  onInsertEmoji,
}: MessageComposerEmojiPickerProps) {
  const { t } = useI18n();

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
        <span className={styles.emojiToggleGlyph} aria-hidden="true">{COMPOSER_EMOJI_TOGGLE_GLYPH}</span>
      </IconButton>

      {isOpen ? (
        <fieldset
          id={pickerId}
          ref={pickerRef as React.RefObject<HTMLFieldSetElement>}
          className={styles.emojiPicker}
          aria-label={t("composer.aria.emojiPicker")}
        >
          <div className={styles.emojiSearchWrap}>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
              className={styles.emojiSearchInput}
              placeholder={t("composer.emojiSearch.placeholder")}
              aria-label={t("composer.aria.searchEmoji")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {isSearchActive ? (
            <div className={styles.emojiSearchSummary}>
              {t("composer.emojiSearch.results", { count: visibleEmojiItems.length })}
            </div>
          ) : (
            <>
              <div className={styles.emojiGroupTabs} role="tablist" aria-label={t("composer.aria.emojiCategories")}>
                {emojiTabs.map((group) => {
                  const translatedLabel = t(group.labelKey);
                  const label = translatedLabel === group.labelKey
                    ? group.fallbackLabel
                    : translatedLabel;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      role="tab"
                      aria-selected={group.id === activeEmojiGroupId}
                      className={`${styles.emojiGroupTab} ${
                        group.id === activeEmojiGroupId ? styles.emojiGroupTabActive : ""
                      }`}
                      onClick={() => onSelectEmojiGroup(group.id)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeEmojiGroupId !== "recent" && activeEmojiGroup && activeEmojiGroup.subgroups.length > 1 ? (
                <div className={styles.emojiSubgroupRow}>
                  <select
                    className={styles.emojiSubgroupSelect}
                    value={activeEmojiSubgroup?.id ?? ""}
                    onChange={(event) => onSelectEmojiSubgroup(event.currentTarget.value)}
                    aria-label={t("composer.aria.selectEmojiSubgroup")}
                  >
                    {activeEmojiGroup.subgroups.map((subgroup) => (
                      <option key={subgroup.id} value={subgroup.id}>
                        {subgroup.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}

          <section
            ref={viewportRef}
            className={styles.emojiViewport}
            aria-label={t("composer.aria.emojiResults")}
          >
            {visibleEmojiItems.length > 0 ? (
              <div className={styles.emojiGrid}>
                {visibleEmojiItems.map((item) => (
                  <button
                    key={`${item.subgroupId}-${item.emoji}`}
                    type="button"
                    className={styles.emojiButton}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onInsertEmoji(item.emoji)}
                    aria-label={t("composer.aria.insertEmoji", { emoji: item.emoji })}
                    title={isSearchActive ? item.name : t("composer.aria.insertEmoji", { emoji: item.emoji })}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emojiEmptyState}>
                {t("composer.emojiSearch.empty")}
              </div>
            )}
          </section>
        </fieldset>
      ) : null}
    </div>
  );
}

