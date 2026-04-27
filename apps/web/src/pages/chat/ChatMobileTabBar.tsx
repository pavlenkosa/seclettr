import { useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedPresence } from "@/lib/hooks";
import { BottomDockSurface } from "@/components/ui";

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
  const createMenuPresence = useAnimatedPresence({
    isOpen: isCreateMenuOpen,
    durationMs: 180,
    onHidden: () => {
      createFabRef.current?.focus();
    },
  });

  const createMenuContent = (className?: string) => (
    <div
      id={createMenuId}
      ref={createMenuRef}
      className={[
        className,
        createMenuPresence.isClosing ? styles.createMenuClosing : "",
      ].filter(Boolean).join(" ")}
      role="menu"
      tabIndex={-1}
      aria-label={t("chat.createMenu")}
      onKeyDown={onCreateMenuKeyDown}
    >
      <button
        type="button"
        className={styles.createMenuButton}
        onClick={() => {
          onCloseCreateMenu();
          onOpenNewChat();
        }}
        role="menuitem"
        aria-label={t("chat.newConversation")}
        data-mobile-create-item="true"
      >
        <span className={styles.createMenuIcon} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
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
          onCloseCreateMenu();
          onOpenNewGroup();
        }}
        role="menuitem"
        aria-label={t("group.create.open")}
        data-mobile-create-item="true"
      >
        <span className={styles.createMenuIcon} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="6.2" cy="6.2" r="2.2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="11.8" cy="7.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.8 13.3c.7-1.7 2.1-2.7 3.9-2.7s3.1 1 3.8 2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M14.6 11.8v4M12.6 13.8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <span className={styles.createMenuText}>
          <span className={styles.createMenuTitle}>{t("group.create.open")}</span>
          <span className={styles.createMenuSubtitle}>{t("chat.createMenu.groupHint")}</span>
        </span>
      </button>
    </div>
  );

  return (
    <>
      {createMenuPresence.isMounted ? (
        <button
          type="button"
          className={[
            styles.scrim,
            createMenuPresence.isClosing ? styles.scrimClosing : "",
          ].filter(Boolean).join(" ")}
          onClick={onCloseCreateMenu}
          aria-label={t("chat.closeCreateMenu")}
        />
      ) : null}

      <BottomDockSurface
        as="nav"
        placement={placement}
        className={isCreateMenuOpen || createMenuPresence.isClosing ? styles.menuOpen : ""}
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

        <div className={styles.createDock}>
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
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.createFabLabel}>{t("chat.createAction")}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`${styles.tabButton} ${isSettingsOpen ? styles.tabButtonActive : ""}`}
          aria-label={t("chat.settings")}
        >
          <span className={styles.tabIcon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path
                fill="currentColor"
                d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.101.345a1.464 1.464 0 0 1-2.105.872l-.312-.164c-1.265-.666-2.669.738-2.003 2.003l.164.312c.446.847.023 1.89-.872 2.105l-.345.101c-1.4.413-1.4 2.397 0 2.81l.345.101c.895.214 1.318 1.258.872 2.105l-.164.312c-.666 1.265.738 2.669 2.003 2.003l.312-.164a1.464 1.464 0 0 1 2.105.872l.101.345c.413 1.4 2.397 1.4 2.81 0l.101-.345a1.464 1.464 0 0 1 2.105-.872l.312.164c1.265.666 2.669-.738 2.003-2.003l-.164-.312a1.464 1.464 0 0 1 .872-2.105l.345-.101c1.4-.413 1.4-2.397 0-2.81l-.345-.101a1.464 1.464 0 0 1-.872-2.105l.164-.312c.666-1.265-.738-2.669-2.003-2.003l-.312.164a1.464 1.464 0 0 1-2.105-.872l-.101-.345ZM8 5.43a2.57 2.57 0 1 1 0 5.14 2.57 2.57 0 0 1 0-5.14Z"
              />
            </svg>
          </span>
          <span className={styles.tabLabel}>{t("chat.settings")}</span>
        </button>
      </BottomDockSurface>
    </>
  );
}
