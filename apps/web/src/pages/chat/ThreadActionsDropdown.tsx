import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedPresence } from "@/lib/hooks";
import { IconButton } from "@/components/ui";
import pageStyles from "@/pages/ChatPage.module.css";
import styles from "./ThreadActionsDropdown.module.css";

export interface ThreadActionsItem {
  id: string;
  labelKey: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
}

interface Props {
  readonly items: ThreadActionsItem[];
  readonly disabled?: boolean;
}

export function ThreadActionsDropdown({ items, disabled }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isMounted, isClosing } = useAnimatedPresence({
    isOpen: open,
    durationMs: 140,
    onHidden: () => {
      triggerRef.current?.focus();
    },
  });

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [closeMenu, open]);

  useEffect(() => {
    if (!open || isClosing) return;
    const firstAction = menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
    firstAction?.focus();
  }, [isClosing, open]);

  return (
    <div ref={containerRef} className={styles.root}>
      <IconButton
        ref={triggerRef}
        onClick={disabled ? undefined : () => setOpen((o) => !o)}
        className={`${pageStyles.iconBtn} ${open ? pageStyles.iconBtnActive : ""}`}
        size={40}
        title={t("chat.moreActions")}
        aria-label={t("chat.moreActions")}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
      >
        {/* Vertical three-dot icon */}
        <svg width="4" height="16" viewBox="0 0 4 16" fill="none" aria-hidden="true">
          <circle cx="2" cy="2.5" r="1.5" fill="currentColor" />
          <circle cx="2" cy="8" r="1.5" fill="currentColor" />
          <circle cx="2" cy="13.5" r="1.5" fill="currentColor" />
        </svg>
      </IconButton>

      {isMounted && (
        <div
          ref={menuRef}
          className={[styles.menu, isClosing ? styles.menuClosing : ""].join(" ")}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`${styles.item} ${item.isActive ? styles.itemActive : ""}`}
              onClick={() => { closeMenu(); item.onClick(); }}
            >
              <span className={styles.itemIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.itemLabel}>{t(item.labelKey)}</span>
              {item.isActive && (
                <span className={styles.itemCheck} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
