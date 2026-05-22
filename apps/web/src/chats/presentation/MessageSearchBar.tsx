/**
 * MessageSearchBar — inline search bar for navigating message history matches.
 *
 * Owns:
 *   - Search query input with auto-focus on mount.
 *   - Match counter display ("3 / 12" or "no results").
 *   - Previous / next navigation buttons.
 *   - Keyboard shortcuts: Enter → next, Shift+Enter → prev, Escape → close.
 *
 * Does not own match computation, scroll-to-match behavior, or panel visibility state.
 */
import { memo, useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import { IconSearch } from "@/components/ui";
import styles from "./MessageSearchBar.module.css";

interface Props {
  readonly query: string;
  readonly matchCount: number;
  readonly currentMatch: number; // 1-based, 0 when no matches
  readonly onQueryChange: (q: string) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onClose: () => void;
}

export const MessageSearchBar = memo(function MessageSearchBar({
  query,
  matchCount,
  currentMatch,
  onQueryChange,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasQuery = query.length > 0;
  const hasMatches = matchCount > 0;

  return (
    <div className={styles.bar} role="search" aria-label={t("chat.search.ariaLabel")}>
      <IconSearch size={14} className={styles.icon} />

      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t("chat.search.queryPlaceholder")}
        aria-label={t("chat.search.queryPlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.shiftKey ? onPrev() : onNext(); }
          if (e.key === "Escape") onClose();
        }}
        autoComplete="off"
        spellCheck={false}
      />

      {hasQuery && (
        <span className={`${styles.counter} ${hasQuery && !hasMatches ? styles.counterEmpty : ""}`}>
          {hasMatches
            ? t("chat.search.counter", { current: currentMatch, total: matchCount })
            : t("chat.search.noResults")}
        </span>
      )}

      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={onPrev}
          disabled={!hasMatches}
          aria-label={t("chat.search.prev")}
          title={t("chat.search.prev")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={onNext}
          disabled={!hasMatches}
          aria-label={t("chat.search.next")}
          title={t("chat.search.next")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className={styles.closeBtn}
        onClick={onClose}
        aria-label={t("chat.search.close")}
        title={t("chat.search.close")}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
});
