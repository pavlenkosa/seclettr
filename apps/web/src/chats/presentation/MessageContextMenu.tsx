import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./MessageContextMenu.module.css";

export interface MessageContextMenuAction {
  kind: "reply" | "copy";
}

interface Props {
  readonly children: ReactNode;
  readonly onAction: (action: MessageContextMenuAction) => void;
  readonly copyText?: string;
  readonly canReply?: boolean;
  readonly canCopy?: boolean;
}

interface MenuPosition {
  x: number;
  y: number;
}

const LONG_PRESS_DELAY_MS = 500;

/**
 * Wraps a message bubble and exposes a right-click (desktop) / long-press (mobile)
 * context menu with Reply and Copy actions.
 */
export const MessageContextMenu = memo(function MessageContextMenu({
  children,
  onAction,
  copyText,
  canReply = true,
  canCopy = true,
}: Props) {
  const { t } = useI18n();
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
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setCopied(false);
    const nextPosition = { x, y };
    setMountedMenuPos(nextPosition);
    setMenuPos(nextPosition);
  }, []);

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
          className={[
            styles.menu,
            isClosing ? motionStyles.popoverOut : motionStyles.popoverIn,
          ].join(" ")}
          style={{ "--menu-x": `${mountedMenuPos.x}px`, "--menu-y": `${mountedMenuPos.y}px` } as CSSProperties}
        >
          {canReply && (
            <button
              role="menuitem"
              type="button"
              className={styles.item}
              onClick={() => handleAction("reply")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 8L6 3v3c4 0 7 2 8 6-1.5-2-4-3-8-3v3L1 8z" fill="currentColor" />
              </svg>
              {t("message.context.reply")}
            </button>
          )}
          {canCopy && (
            <button
              role="menuitem"
              type="button"
              className={`${styles.item} ${copied ? styles.itemCopied : ""}`}
              onClick={() => handleAction("copy")}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
              {copied ? t("message.context.copied") : t("message.context.copy")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});
