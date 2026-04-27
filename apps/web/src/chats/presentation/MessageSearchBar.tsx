import { memo, useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
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
      <svg className={styles.icon} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

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
