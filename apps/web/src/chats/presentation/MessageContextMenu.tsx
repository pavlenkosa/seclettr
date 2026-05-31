import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";
import { hapticSelection } from "@/lib/native-haptics";
import { useExclusiveMenu } from "./exclusive-menu-context";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./MessageContextMenu.module.css";

export interface MessageContextMenuAction {
  kind: "reply" | "copy" | "forward" | "delete" | "select";
}

interface Props {
  readonly children: ReactNode;
  readonly onAction: (action: MessageContextMenuAction) => void;
  readonly copyText?: string;
  readonly canReply?: boolean;
  readonly canCopy?: boolean;
  readonly canForward?: boolean;
  readonly canDelete?: boolean;
  readonly canSelect?: boolean;
}

interface MenuPosition {
  x: number;
  y: number;
}

const LONG_PRESS_DELAY_MS = 500;

/**
 * MessageContextMenu — interaction wrapper that surfaces a floating action menu
 * for a message bubble.
 *
 * Owns:
 *   - Right-click (desktop) and long-press (mobile, 500 ms) gesture detection.
 *   - Menu open/close animation via `useAnimatedPresence`.
 *   - Viewport clamping so the menu never escapes screen edges.
 *   - Keyboard navigation (↑ ↓ Home End Escape) within the menu.
 *   - Copy-to-clipboard with 1 s "Copied ✓" feedback state.
 *   - Broadcasting a custom DOM event so simultaneous menus auto-close each other.
 *   - Focus restoration to the previously focused element on close.
 *
 * Does not own reply/forward/delete business logic — those are forwarded to `onAction`.
 * Does not own the message bubble markup inside `children`.
 */
export const MessageContextMenu = memo(function MessageContextMenu({
  children,
  onAction,
  copyText,
  canReply = true,
  canCopy = true,
  canForward = false,
  canDelete = false,
  canSelect = false,
}: Props) {
  const menuId = useId();
  const { t } = useI18n();
  const { notifyOpen, subscribe } = useExclusiveMenu(menuId);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [mountedMenuPos, setMountedMenuPos] = useState<MenuPosition | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const touchMovedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { isMounted, isClosing } = useAnimatedPresence({
    isOpen: menuPos !== null,
    durationMs: MOTION_DURATION_MS.fast,
    onHidden: () => {
      setMountedMenuPos(null);
      const previousFocus = previousFocusRef.current;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    },
  });

  const openMenu = useCallback((x: number, y: number) => {
    notifyOpen();
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setCopied(false);
    const nextPosition = { x, y };
    setMountedMenuPos(nextPosition);
    setMenuPos(nextPosition);
  }, [notifyOpen]);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current !== null) {
      clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  const closeMenu = useCallback(() => {
    clearCopyResetTimer();
    setCopied(false);
    setMenuPos(null);
  }, [clearCopyResetTimer]);

  // Close this instance when another context menu opens in the same provider scope.
  useEffect(() => subscribe(closeMenu), [subscribe, closeMenu]);

  // Close when the message list scrolls (menu stays fixed while content moves).
  useEffect(() => {
    if (!menuPos) return;
    const onScroll = () => closeMenu();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [menuPos, closeMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }, [openMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchMovedRef.current = false;
    const touch = e.touches[0];
    if (!touch) return;
    const { clientX, clientY } = touch;
    longPressTimerRef.current = globalThis.setTimeout(() => {
      if (!touchMovedRef.current) {
        hapticSelection();
        openMenu(clientX, clientY);
      }
    }, LONG_PRESS_DELAY_MS) as unknown as number;
  }, [openMenu]);

  const handleTouchMove = useCallback(() => {
    touchMovedRef.current = true;
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuPos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    const onPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuPos, closeMenu]);

  useEffect(() => {
    if (!menuPos || isClosing) return;
    const firstAction = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]'
    );
    firstAction?.focus();
  }, [isClosing, menuPos]);

  useEffect(() => {
    if (!menuPos) {
      return;
    }
    setMountedMenuPos(menuPos);
  }, [menuPos]);

  // After the menu actually renders, measure it and clamp the position so it
  // doesn't escape the viewport — the previous fixed positioning placed the
  // menu's top-left corner at the click coordinate, which left it half-off
  // screen for clicks near the right/bottom edge.
  useLayoutEffect(() => {
    if (!isMounted || !mountedMenuPos) return;
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight;

    let x = mountedMenuPos.x;
    let y = mountedMenuPos.y;
    if (x + rect.width + margin > viewportWidth) {
      x = Math.max(margin, viewportWidth - rect.width - margin);
    }
    if (y + rect.height + margin > viewportHeight) {
      // Prefer flipping above the click point so the user's finger / cursor
      // doesn't sit on top of the first action.
      y = Math.max(margin, mountedMenuPos.y - rect.height);
    }
    if (x !== mountedMenuPos.x || y !== mountedMenuPos.y) {
      setMountedMenuPos({ x, y });
    }
  // mountedMenuPos.x/.y changes drive the re-measure; isMounted guards initial open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, mountedMenuPos?.x, mountedMenuPos?.y]);

  useEffect(() => {
    return () => {
      clearCopyResetTimer();
    };
  }, [clearCopyResetTimer]);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }, []);

  const handleAction = useCallback((kind: MessageContextMenuAction["kind"]) => {
    if (kind === "copy" && copyText) {
      if (!navigator.clipboard?.writeText) {
        closeMenu();
        return;
      }
      navigator.clipboard.writeText(copyText)
        .then(() => {
          clearCopyResetTimer();
          setCopied(true);
          copyResetTimerRef.current = globalThis.setTimeout(() => {
            copyResetTimerRef.current = null;
            setCopied(false);
            setMenuPos(null);
          }, 1000) as unknown as number;
        })
        .catch(() => {
          closeMenu();
        });
      onAction({ kind });
      return;
    }
    closeMenu();
    onAction({ kind });
  }, [clearCopyResetTimer, closeMenu, onAction, copyText]);

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      role="none"
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
      {isMounted && mountedMenuPos ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          className={[
            styles.menu,
            isClosing ? motionStyles.popoverOut : motionStyles.popoverIn,
          ].join(" ")}
          style={{ "--menu-x": `${mountedMenuPos.x}px`, "--menu-y": `${mountedMenuPos.y}px` } as CSSProperties}
          onKeyDown={handleMenuKeyDown}
        >
          {canReply && (
            <button
              role="menuitem"
              type="button"
              className={styles.item}
              onClick={() => handleAction("reply")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 8l5-5v3c4.5 0 7.5 2 8.5 6.5-1.5-2.5-4-3.5-8.5-3.5V12L1 8z" fill="currentColor" />
              </svg>
              {t("message.context.reply")}
            </button>
          )}
          {canCopy && (
            <button
              role="menuitem"
              type="button"
              className={styles.item}
              onClick={() => handleAction("copy")}
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 8.5l3.5 3.5 8.5-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {copied ? t("message.context.copied") : t("message.context.copy")}
            </button>
          )}
          {canForward && (
            <button
              role="menuitem"
              type="button"
              className={styles.item}
              onClick={() => handleAction("forward")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M15 8l-5-5v3C5.5 6 2.5 8 1.5 12.5 3 10 5.5 9 10 9v3l5-4z" fill="currentColor" />
              </svg>
              {t("message.context.forward")}
            </button>
          )}
          {canSelect && (
            <button
              role="menuitem"
              type="button"
              className={styles.item}
              onClick={() => handleAction("select")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("message.context.select")}
            </button>
          )}
          {canDelete && (canReply || canCopy || canForward || canSelect) && (
            <div className={styles.separator} aria-hidden="true" />
          )}
          {canDelete && (
            <button
              role="menuitem"
              type="button"
              className={`${styles.item} ${styles.itemDanger}`}
              onClick={() => handleAction("delete")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4h10M6 4V2.7a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7V4M5 4l.7 9.3a.7.7 0 0 0 .7.7h3.2a.7.7 0 0 0 .7-.7L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("message.context.delete")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});
