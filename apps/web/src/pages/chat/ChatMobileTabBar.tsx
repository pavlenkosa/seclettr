import { useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import { BottomDockSurface, IconNewGroup, IconPlus, IconSettings, SurfacePanel } from "@/components/ui";
import motionStyles from "@/components/ui/motion/Motion.module.css";

import styles from "./ChatMobileTabBar.module.css";

/**
 * Props for the mobile bottom navigation and create-action menu.
 */
export interface ChatMobileTabBarProps {
  readonly isCreateMenuOpen: boolean;
  readonly isChatsActive: boolean;
  readonly isSettingsOpen: boolean;
  readonly placement?: "overlay" | "inline";
  readonly createMenuId: string;
  readonly createMenuRef: RefObject<HTMLDivElement>;
  readonly onCreateMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly onOpenChats: () => void;
  readonly onToggleCreateMenu: () => void;
  readonly onCloseCreateMenu: () => void;
  readonly onOpenNewChat: () => void;
  readonly onOpenNewGroup: () => void;
  readonly onOpenSettings: () => void;
}

/**
 * Mobile-only navigation surface used by `ChatPage`.
 * Keeps dense tab/menu markup out of the page container.
 */
export function ChatMobileTabBar({
  isCreateMenuOpen,
  isChatsActive,
  isSettingsOpen,
  placement = "overlay",
  createMenuId,
  createMenuRef,
  onCreateMenuKeyDown,
  onOpenChats,
  onToggleCreateMenu,
  onCloseCreateMenu,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenSettings,
}: ChatMobileTabBarProps) {
  const { t } = useI18n();
  const createFabRef = useRef<HTMLButtonElement | null>(null);
  const pendingCreateActionRef = useRef<(() => void) | null>(null);
  const createMenuPresence = useAnimatedPresence({
    isOpen: isCreateMenuOpen,
    durationMs: MOTION_DURATION_MS.base,
    onHidden: () => {
      const pendingCreateAction = pendingCreateActionRef.current;
      pendingCreateActionRef.current = null;

      if (pendingCreateAction) {
        pendingCreateAction();
        return;
      }

      createFabRef.current?.focus();
    },
  });

  const queueCreateAction = useCallback((action: () => void) => {
    pendingCreateActionRef.current = action;
    onCloseCreateMenu();
  }, [onCloseCreateMenu]);

  const createMenuContent = (className?: string) => (
    <div
      id={createMenuId}
      ref={createMenuRef}
      className={[
        className,
        createMenuPresence.isClosing ? motionStyles.popoverOut : motionStyles.popoverIn,
      ].filter(Boolean).join(" ")}
      role="menu"
      tabIndex={-1}
      aria-label={t("chat.createMenu")}
      onKeyDown={onCreateMenuKeyDown}
    >
      <SurfacePanel className={styles.createMenuSurface} padding="none" radius="md">
        <button
          type="button"
          className={styles.createMenuButton}
          onClick={() => {
            queueCreateAction(onOpenNewChat);
          }}
          role="menuitem"
          aria-label={t("chat.newConversation")}
          data-mobile-create-item="true"
        >
          <span className={styles.createMenuIcon} aria-hidden="true">
            <IconPlus size={18} strokeWidth={2} />
          </span>
          <span className={styles.createMenuText}>
            <span className={styles.createMenuTitle}>{t("chat.newConversation")}</span>
            <span className={styles.createMenuSubtitle}>{t("chat.createMenu.chatHint")}</span>
          </span>
        </button>

        <button
          type="button"
          className={styles.createMenuButton}
          onClick={() => {
            queueCreateAction(onOpenNewGroup);
          }}
          role="menuitem"
          aria-label={t("group.create.open")}
          data-mobile-create-item="true"
        >
          <span className={styles.createMenuIcon} aria-hidden="true">
            <IconNewGroup size={18} />
          </span>
          <span className={styles.createMenuText}>
            <span className={styles.createMenuTitle}>{t("group.create.open")}</span>
            <span className={styles.createMenuSubtitle}>{t("chat.createMenu.groupHint")}</span>
          </span>
        </button>
      </SurfacePanel>
    </div>
  );

  return (
    <>
      {createMenuPresence.isMounted ? (
        <button
          type="button"
          className={[
            styles.scrim,
            createMenuPresence.isClosing ? motionStyles.fadeOut : motionStyles.fadeIn,
          ].filter(Boolean).join(" ")}
          onClick={onCloseCreateMenu}
          aria-label={t("chat.closeCreateMenu")}
        />
      ) : null}

      <BottomDockSurface
        as="nav"
        placement={placement}
        className={[
          styles.navDock,
          isCreateMenuOpen || createMenuPresence.isClosing ? styles.menuOpen : "",
        ].filter(Boolean).join(" ")}
        aria-label={t("chat.sidebarTitle")}
      >
        <button
          type="button"
          onClick={onOpenChats}
          className={`${styles.tabButton} ${isChatsActive ? styles.tabButtonActive : ""}`}
          aria-label={t("chat.sidebarTitle")}
          aria-current={isChatsActive ? "page" : undefined}
        >
          <span className={styles.tabIcon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M3.5 5.25A1.75 1.75 0 0 1 5.25 3.5h7.5A1.75 1.75 0 0 1 14.5 5.25v4.4A1.75 1.75 0 0 1 12.75 11.4H8l-2.8 2.35v-2.35H5.25A1.75 1.75 0 0 1 3.5 9.65v-4.4Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={styles.tabLabel}>{t("chat.sidebarTitle")}</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`${styles.tabButton} ${isSettingsOpen ? styles.tabButtonActive : ""}`}
          aria-label={t("chat.settings")}
        >
          <span className={styles.tabIcon} aria-hidden="true">
            <IconSettings size={18} />
          </span>
          <span className={styles.tabLabel}>{t("chat.settings")}</span>
        </button>
      </BottomDockSurface>

      <div className={styles.createLayer}>
        {createMenuPresence.isMounted ? createMenuContent(styles.createMenu) : null}

        <button
          ref={createFabRef}
          type="button"
          onClick={onToggleCreateMenu}
          className={`${styles.createFab} ${isCreateMenuOpen ? styles.createFabActive : ""}`}
          aria-label={isCreateMenuOpen ? t("chat.closeCreateMenu") : t("chat.openCreateMenu")}
          aria-expanded={isCreateMenuOpen}
          aria-controls={createMenuId}
          aria-haspopup="menu"
        >
          <span className={styles.createFabIcon} aria-hidden="true">
            <IconPlus size={20} strokeWidth={2} />
          </span>
          <span className={styles.createFabLabel}>{t("chat.createAction")}</span>
        </button>
      </div>
    </>
  );
}
