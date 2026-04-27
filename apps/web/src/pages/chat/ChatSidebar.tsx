import { useCallback, useMemo, useState } from "react";
import type { Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import { useI18n } from "@/i18n";
import { ConversationList } from "@/chats/presentation/ConversationList";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { IconButton } from "@/components/ui";

import styles from "@/pages/ChatPage.module.css";

/**
 * Props for the persistent chat list sidebar.
 */
export interface ChatSidebarProps {
  readonly username?: string | null;
  readonly canLock?: boolean;
  readonly conversations: Conversation[];
  readonly groups: GroupChat[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly onSelectThread: (selection: { kind: "direct" | "group"; id: string }) => void;
  readonly onOpenSettings: () => void;
  readonly onLock: () => void;
  readonly onLogout: () => void;
  readonly onOpenNewChat: () => void;
  readonly onOpenNewGroup: () => void;
}

/**
 * Sidebar shell for thread discovery and global actions.
 * Keeps chat list UI concerns separate from page-level routing and runtime logic.
 */
export function ChatSidebar({
  username,
  canLock = false,
  conversations,
  groups,
  activeId,
  loading,
  onSelectThread,
  onOpenSettings,
  onLock,
  onLogout,
  onOpenNewChat,
  onOpenNewGroup,
}: ChatSidebarProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
  }, []);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => c.username.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, searchQuery]);
  const loadingPlaceholderCount = useMemo(
    () => Math.max(filteredConversations.length + filteredGroups.length, 5),
    [filteredConversations.length, filteredGroups.length]
  );

  return (
    <aside className={styles.sidebar} data-testid="chat-sidebar">
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarBrand}>
          <span className={styles.sidebarBrandMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <span className={styles.sidebarTitle}>{t("chat.sidebarTitle")}</span>
        </div>
        <div className={styles.sidebarActions}>
          <IconButton
            onClick={onOpenSettings}
            className={`${styles.iconBtn} ${styles.desktopOnlyAction}`}
            size={40}
            variant="glass"
            title={t("chat.settings")}
            aria-label={t("chat.settings")}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path
                fill="currentColor"
                d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.101.345a1.464 1.464 0 0 1-2.105.872l-.312-.164c-1.265-.666-2.669.738-2.003 2.003l.164.312c.446.847.023 1.89-.872 2.105l-.345.101c-1.4.413-1.4 2.397 0 2.81l.345.101c.895.214 1.318 1.258.872 2.105l-.164.312c-.666 1.265.738 2.669 2.003 2.003l.312-.164a1.464 1.464 0 0 1 2.105.872l.101.345c.413 1.4 2.397 1.4 2.81 0l.101-.345a1.464 1.464 0 0 1 2.105-.872l.312.164c1.265.666 2.669-.738 2.003-2.003l-.164-.312a1.464 1.464 0 0 1 .872-2.105l.345-.101c1.4-.413 1.4-2.397 0-2.81l-.345-.101a1.464 1.464 0 0 1-.872-2.105l.164-.312c.666-1.265-.738-2.669-2.003-2.003l-.312.164a1.464 1.464 0 0 1-2.105-.872l-.101-.345ZM8 5.43a2.57 2.57 0 1 1 0 5.14 2.57 2.57 0 0 1 0-5.14Z"
              />
            </svg>
          </IconButton>

          {canLock ? (
            <IconButton
              onClick={onLock}
              className={styles.iconBtn}
              size={40}
              variant="glass"
              title={t("chat.lock")}
              aria-label={t("chat.lock")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </IconButton>
          ) : null}

          <IconButton
            onClick={onLogout}
            className={styles.iconBtn}
            size={40}
            variant="glass"
            title={t("chat.signOut")}
            aria-label={t("chat.signOut")}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M6.75 15.75H3.75A1.5 1.5 0 0 1 2.25 14.25V3.75A1.5 1.5 0 0 1 3.75 2.25h3M12 12.75l3.75-3.75L12 5.25M15.75 9H7.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        </div>
      </div>

      <div className={styles.sidebarMeta}>
        {username ? (
          <div className={styles.myUsername}>@{username}</div>
        ) : null}

        <div className={`${styles.quickActions} ${styles.desktopOnlyAction}`}>
          <button
            type="button"
            onClick={onOpenNewChat}
            className={styles.quickActionBtn}
            aria-label={t("chat.newConversation")}
          >
            <span className={styles.quickActionIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.quickActionLabel}>{t("chat.newConversation")}</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewGroup}
            className={styles.quickActionBtn}
            aria-label={t("group.create.open")}
          >
            <span className={styles.quickActionIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <circle cx="6.2" cy="6.2" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="11.8" cy="7.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2.8 13.3c.7-1.7 2.1-2.7 3.9-2.7s3.1 1 3.8 2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14.6 11.8v4M12.6 13.8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.quickActionLabel}>{t("group.create.open")}</span>
          </button>
        </div>
      </div>

      <div className={styles.sidebarSearch}>
        <svg className={styles.sidebarSearchIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className={styles.sidebarSearchInput}
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={t("chat.search.placeholder")}
          aria-label={t("chat.search.placeholder")}
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.sidebarSearchClear}
            onClick={handleSearchClear}
            aria-label={t("chat.search.clear")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <ConversationList
        conversations={filteredConversations}
        groups={filteredGroups}
        activeId={activeId}
        loading={loading}
        loadingPlaceholderCount={loadingPlaceholderCount}
        onSelect={onSelectThread}
      />
    </aside>
  );
}
