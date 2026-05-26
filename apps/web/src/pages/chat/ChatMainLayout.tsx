import { memo, useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import { useAnimatedPresence } from "@/lib/hooks";
import { ChatMobileShell } from "./ChatMobileShell";
import {
  type useSidebarResize,
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
  KEYBOARD_STEP,
  STORAGE_KEY,
} from "./useSidebarResize";
import styles from "../ChatPage.module.css";

export const ChatMainLayout = memo(function ChatMainLayout({
  isMobileViewport,
  mobileShowConversation,
  showSettings,
  sidebar,
  threadPane,
  sidebarDock,
  settingsScreen,
  startResize,
  resetWidth,
}: {
  isMobileViewport: boolean;
  mobileShowConversation: boolean;
  showSettings: boolean;
  sidebar: ReactNode;
  threadPane: ReactNode;
  sidebarDock: ReactNode;
  settingsScreen: ReactNode;
  startResize: ReturnType<typeof useSidebarResize>["startResize"];
  resetWidth: ReturnType<typeof useSidebarResize>["resetWidth"];
}) {
  const { t } = useI18n();
  const settingsPresence = useAnimatedPresence({
    isOpen: showSettings,
    durationMs: 180,
  });

  // Keyboard resize — desktop only.
  // We write --sidebar-width directly on the parent root element (the same DOM
  // node that useSidebarResize targets via its rootRef) so the two techniques
  // share a single CSS variable.  useSidebarResize.startResize reads the live
  // CSS value on drag-start, so pointer drag remains correct after keyboard use.
  const resizerRef = useRef<HTMLDivElement>(null);

  // Initialise aria-valuenow from localStorage once the component mounts.
  // (useSidebarResize sets the CSS var in its own useEffect at the same time.)
  useEffect(() => {
    const el = resizerRef.current;
    if (!el) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw !== null ? Number.parseInt(raw, 10) : NaN;
      const initial = Number.isFinite(n)
        ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n))
        : DEFAULT_WIDTH;
      el.setAttribute("aria-valuenow", String(initial));
    } catch { /* ignore — localStorage may be unavailable */ }
  }, []);

  // Reads --sidebar-width from the root element and syncs aria-valuenow.
  // Attached to onPointerUp so the attribute is current after every drag end.
  // Also fires on plain clicks (no drag occurred) — reading the unchanged CSS
  // value in that case is harmless.
  const syncAriaValueNow = useCallback(() => {
    const el = resizerRef.current;
    if (!el) return;
    const root = el.parentElement;
    if (!root) return;
    const cssVal = Number.parseInt(root.style.getPropertyValue("--sidebar-width"), 10);
    if (Number.isFinite(cssVal)) {
      el.setAttribute("aria-valuenow", String(cssVal));
    }
  }, []);

  // Wraps resetWidth so aria-valuenow stays in sync on both double-click and
  // Enter key paths.
  const handleReset = useCallback(() => {
    resetWidth();
    resizerRef.current?.setAttribute("aria-valuenow", String(DEFAULT_WIDTH));
  }, [resetWidth]);

  /**
   * Keyboard contract for the desktop sidebar resizer:
   *   ArrowRight / ArrowLeft — widen / narrow sidebar by KEYBOARD_STEP px
   *   Home                   — narrow to minimum (MIN_WIDTH)
   *   End                    — widen to maximum (MAX_WIDTH)
   *   Enter                  — reset to default (equivalent to double-click)
   */
  const handleResizerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const el = resizerRef.current;
      if (!el) return;
      const root = el.parentElement;
      if (!root) return;

      const cssVal = Number.parseInt(root.style.getPropertyValue("--sidebar-width"), 10);
      const currentWidth = Number.isFinite(cssVal) ? cssVal : DEFAULT_WIDTH;

      const applyKeyboardWidth = (next: number) => {
        root.style.setProperty("--sidebar-width", `${next}px`);
        try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
        el.setAttribute("aria-valuenow", String(next));
      };

      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          applyKeyboardWidth(Math.min(MAX_WIDTH, Math.round(currentWidth + KEYBOARD_STEP)));
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          applyKeyboardWidth(Math.max(MIN_WIDTH, Math.round(currentWidth - KEYBOARD_STEP)));
          break;
        }
        case "Home": {
          e.preventDefault();
          applyKeyboardWidth(MIN_WIDTH);
          break;
        }
        case "End": {
          e.preventDefault();
          applyKeyboardWidth(MAX_WIDTH);
          break;
        }
        case "Enter": {
          // Mirror double-click reset behaviour.
          e.preventDefault();
          handleReset();
          break;
        }
        default:
          break;
      }
    },
    [handleReset],
  );

  if (isMobileViewport) {
    return (
      <ChatMobileShell
        isConversationVisible={mobileShowConversation}
        isSettingsVisible={showSettings}
        sidebar={sidebar}
        thread={threadPane}
        sidebarDock={sidebarDock}
        settings={settingsScreen}
      />
    );
  }

  return (
    <>
      {/* Skip-to-content link: visually hidden until focused, then slides into
          view so keyboard-only users can bypass the sidebar on each page load. */}
      <a href="#main-content" className={styles.skipLink}>
        {t("chat.layout.skipToMainContent")}
      </a>
      {sidebar}
      <div
        ref={resizerRef}
        className={styles.resizer}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("chat.layout.resizerTitle")}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerUp={syncAriaValueNow}
        onDoubleClick={handleReset}
        onKeyDown={handleResizerKeyDown}
        title={t("chat.layout.resizerTitle")}
      />
      <main id="main-content" className={styles.main}>
        {threadPane}
      </main>
      {settingsPresence.isMounted ? (
        <div className={`${styles.settingsOverlay} ${settingsPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn}`}>
          {settingsScreen}
        </div>
      ) : null}
    </>
  );
});
