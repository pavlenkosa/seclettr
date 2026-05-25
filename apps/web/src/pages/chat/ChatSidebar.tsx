import { useCallback, useMemo, useState } from "react";
import type { Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import type { PlainConversation, PlainGroup } from "@/stores/plain";
import type { SavedMessage } from "@/stores/saved";
import { useI18n } from "@/i18n";
import { ConversationList } from "@/chats/presentation/ConversationList";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { IconButton, IconLock, IconLogout, IconNewGroup, IconPlus, IconSearch, IconSettings, InputField } from "@/components/ui";

import styles from "./ChatSidebar.module.css";

/**
 * Props for the persistent chat list sidebar.
 */
export interface ChatSidebarProps {
  readonly username?: string | null;
  readonly canLock?: boolean;
  readonly conversations: Conversation[];
  readonly groups: GroupChat[];
  readonly plainConversations?: PlainConversation[];
  readonly plainGroups?: PlainGroup[];
  readonly savedMessages?: SavedMessage[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly onSelectThread: (selection: { kind: "direct" | "group" | "plain-direct" | "plain-group" | "saved"; id: string }) => void;
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
  plainConversations = [],
  plainGroups = [],
  savedMessages = [],
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

  const filteredPlainConversations = useMemo(() => {
    if (!searchQuery.trim()) return plainConversations;
    const q = searchQuery.trim().toLowerCase();
    return plainConversations.filter((c) => c.username.toLowerCase().includes(q));
  }, [plainConversations, searchQuery]);

  const filteredPlainGroups = useMemo(() => {
    if (!searchQuery.trim()) return plainGroups;
    const q = searchQuery.trim().toLowerCase();
    return plainGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [plainGroups, searchQuery]);

  const loadingPlaceholderCount = useMemo(
    () => filteredConversations.length + filteredGroups.length
      + filteredPlainConversations.length + filteredPlainGroups.length,
    [filteredConversations.length, filteredGroups.length, filteredPlainConversations.length, filteredPlainGroups.length]
  );

  return (
    <aside className={styles.sidebar} data-testid="chat-sidebar">
      <div className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <div className={styles.brandCopy}>
            <span className={styles.title}>{t("chat.sidebarTitle")}</span>
            {username ? (
              <span className={styles.username}>@{username}</span>
            ) : null}
          </div>
        </div>
        <div className={styles.actions}>
          <IconButton
            onClick={onOpenNewChat}
            className={`${styles.iconBtn} ${styles.desktopOnlyAction}`}
            size={40}
            title={t("chat.newConversation")}
            aria-label={t("chat.newConversation")}
          >
            <IconPlus size={16} strokeWidth={2} />
          </IconButton>

          <IconButton
            onClick={onOpenNewGroup}
            className={`${styles.iconBtn} ${styles.desktopOnlyAction}`}
            size={40}
            title={t("group.create.open")}
            aria-label={t("group.create.open")}
          >
            <IconNewGroup size={16} />
          </IconButton>

          <span className={`${styles.actionDivider} ${styles.desktopOnlyAction}`} aria-hidden="true" />

          <IconButton
            onClick={onOpenSettings}
            className={`${styles.iconBtn} ${styles.desktopOnlyAction}`}
            size={40}
            title={t("chat.settings")}
            aria-label={t("chat.settings")}
          >
            <IconSettings size={16} />
          </IconButton>

          {canLock ? (
            <IconButton
              onClick={onLock}
              className={styles.iconBtn}
              size={40}
              title={t("chat.lock")}
              aria-label={t("chat.lock")}
            >
              <IconLock />
            </IconButton>
          ) : null}

          <IconButton
            onClick={onLogout}
            className={styles.iconBtn}
            size={40}
            title={t("chat.signOut")}
            aria-label={t("chat.signOut")}
          >
            <IconLogout />
          </IconButton>
        </div>
      </div>

      <div className={styles.search}>
        <InputField
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={t("chat.search.placeholder")}
          aria-label={t("chat.search.placeholder")}
          wrapperClassName={styles.searchField}
          className={styles.searchInput}
          size="pill"
          leading={<IconSearch size={14} />}
        />
        {searchQuery && (
          <IconButton
            size={18}
            variant="ghost"
            className={styles.searchClear}
            onClick={handleSearchClear}
            aria-label={t("chat.search.clear")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </IconButton>
        )}
      </div>

      <ConversationList
        conversations={filteredConversations}
        groups={filteredGroups}
        plainConversations={filteredPlainConversations}
        plainGroups={filteredPlainGroups}
        savedMessages={savedMessages}
        activeId={activeId}
        loading={loading}
        loadingPlaceholderCount={loadingPlaceholderCount}
        onSelect={onSelectThread}
      />
    </aside>
  );
}
