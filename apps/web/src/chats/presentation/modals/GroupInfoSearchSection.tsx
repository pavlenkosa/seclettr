import { Avatar, InputField } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";
import type { GroupRole } from "./group-info-modal-shared";

export interface GroupInfoSearchResultLike {
  readonly userId: string;
  readonly username: string;
}

interface GroupInfoSearchSectionProps {
  readonly searchOpen: boolean;
  readonly canManage: boolean;
  readonly canPromote: boolean;
  readonly inputValue: string;
  readonly loadingSearch: boolean;
  readonly results: readonly GroupInfoSearchResultLike[];
  readonly addingRole: GroupRole;
  readonly busyMemberId: string | null;
  readonly onToggleSearchOpen: () => void;
  readonly onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onAddingRoleChange: (role: GroupRole) => void;
  readonly onAddUser: (user: GroupInfoSearchResultLike) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoSearchSection({
  searchOpen,
  canManage,
  canPromote,
  inputValue,
  loadingSearch,
  results,
  addingRole,
  busyMemberId,
  onToggleSearchOpen,
  onSearchChange,
  onAddingRoleChange,
  onAddUser,
  t,
}: GroupInfoSearchSectionProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{t("group.info.membersHeading")}</span>
        {canManage ? (
          <button
            type="button"
            className={styles.addToggle}
            onClick={onToggleSearchOpen}
            aria-expanded={searchOpen}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {t("group.info.addMember")}
          </button>
        ) : null}
      </div>

      {searchOpen && canManage ? (
        <div className={styles.searchBlock}>
          <InputField
            type="search"
            value={inputValue}
            onChange={onSearchChange}
            placeholder={t("group.members.searchPlaceholder")}
            aria-label={t("group.members.searchPlaceholder")}
            wrapperClassName={styles.searchField}
            leading={(
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.2 10.2 13.4 13.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            autoFocus
          />
          {canPromote ? (
            <div className={styles.addingRoleRow} role="radiogroup" aria-label={t("group.members.roleSelectAria")}>
              {(["member", "admin"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={addingRole === role}
                  className={`${styles.rolePill} ${addingRole === role ? styles.rolePillActive : ""}`}
                  onClick={() => onAddingRoleChange(role)}
                >
                  {t(`group.members.role.${role}`)}
                </button>
              ))}
            </div>
          ) : null}
          {loadingSearch ? <div className={styles.searchHint}>{t("group.members.searching")}</div> : null}
          {!loadingSearch && inputValue.trim().length >= 3 && results.length === 0 ? (
            <div className={styles.searchHint}>{t("group.members.noUsersFound")}</div>
          ) : null}
          {!loadingSearch && inputValue.trim().length < 3 ? (
            <div className={styles.searchHint}>{t("group.members.searchIdleHint")}</div>
          ) : null}
          {results.length > 0 ? (
            <ul className={styles.searchResults}>
              {results.map((user) => (
                <li key={user.userId}>
                  <button
                    type="button"
                    className={styles.searchResultRow}
                    onClick={() => onAddUser(user)}
                    disabled={busyMemberId === user.userId}
                  >
                    <Avatar label={user.username} size={36} fontSize="0.78rem" ariaHidden />
                    <span className={styles.searchResultName}>@{user.username}</span>
                    <span className={styles.searchResultAdd}>
                      {busyMemberId === user.userId ? t("group.members.adding") : t("group.members.add")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
