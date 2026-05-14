import { useEffect } from "react";
import { Avatar, InputField, PillButton } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";
import { normalizeRole, type GroupInfoMember, type GroupRole } from "./group-info-modal-shared";

interface GroupInfoHeroSectionProps {
  readonly groupName: string;
  readonly memberCount: number;
  readonly groupKind: "e2ee" | "plain";
  readonly renaming: boolean;
  readonly canRename: boolean;
  readonly renameBusy: boolean;
  readonly nameDraft: string;
  readonly renameInputRef: React.RefObject<HTMLInputElement>;
  readonly onRenameDraftChange: (value: string) => void;
  readonly onRenameStart: () => void;
  readonly onRenameCancel: () => void;
  readonly onRenameSubmit: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface GroupInfoSearchSectionProps {
  readonly searchOpen: boolean;
  readonly canManage: boolean;
  readonly canPromote: boolean;
  readonly inputValue: string;
  readonly loadingSearch: boolean;
  readonly results: readonly SearchResultLike[];
  readonly addingRole: GroupRole;
  readonly busyMemberId: string | null;
  readonly onToggleSearchOpen: () => void;
  readonly onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onAddingRoleChange: (role: GroupRole) => void;
  readonly onAddUser: (user: SearchResultLike) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface GroupInfoMemberListProps {
  readonly members: readonly GroupInfoMember[];
  readonly myUserId: string;
  readonly busyMemberId: string | null;
  readonly onSelectMember: (userId: string) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface GroupInfoLeaveSectionProps {
  readonly myMembership: GroupInfoMember | undefined;
  readonly myUserId: string;
  readonly busyMemberId: string | null;
  readonly error: string | null;
  readonly onLeave: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface GroupInfoMemberActionSheetProps {
  readonly member: GroupInfoMember;
  readonly isSelf: boolean;
  readonly myRole: GroupRole;
  readonly groupKind: "e2ee" | "plain";
  readonly canPromote: boolean;
  readonly canVerify: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onPromote: () => void;
  readonly onDemote: () => void;
  readonly onTransferOwnership: () => void;
  readonly onRemove: () => void;
  readonly onVerify: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface SearchResultLike {
  readonly userId: string;
  readonly username: string;
}

export function GroupInfoHeroSection({
  groupName,
  memberCount,
  groupKind,
  renaming,
  canRename,
  renameBusy,
  nameDraft,
  renameInputRef,
  onRenameDraftChange,
  onRenameStart,
  onRenameCancel,
  onRenameSubmit,
  t,
}: GroupInfoHeroSectionProps) {
  return (
    <section className={styles.hero}>
      <Avatar label={groupName} size={88} fontSize="1.4rem" ariaHidden />
      {renaming ? (
        <form
          className={styles.renameForm}
          onSubmit={(event) => {
            event.preventDefault();
            onRenameSubmit();
          }}
        >
          <InputField
            ref={renameInputRef}
            value={nameDraft}
            onChange={(event) => onRenameDraftChange(event.currentTarget.value)}
            maxLength={128}
            wrapperClassName={styles.renameInput}
            aria-label={t("group.info.renameAria")}
            disabled={renameBusy}
          />
          <div className={styles.renameActions}>
            <PillButton
              type="button"
              tone="neutral"
              appearance="soft"
              size="sm"
              onClick={onRenameCancel}
              disabled={renameBusy}
            >
              {t("group.info.cancel")}
            </PillButton>
            <PillButton
              type="submit"
              tone="accent"
              appearance="strong"
              size="sm"
              disabled={renameBusy || nameDraft.trim().length === 0}
            >
              {renameBusy ? t("group.info.saving") : t("group.info.save")}
            </PillButton>
          </div>
        </form>
      ) : (
        <h2 className={styles.heroName}>
          <span>{groupName}</span>
          {canRename ? (
            <button
              type="button"
              className={styles.renamePencil}
              onClick={onRenameStart}
              aria-label={t("group.info.renameAria")}
              title={t("group.info.renameAria")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </h2>
      )}
      <p className={styles.heroMeta}>
        {t("group.info.memberCount", { count: memberCount })}
        <span className={styles.heroDot} aria-hidden="true">·</span>
        <span className={styles.heroKind}>
          {t(groupKind === "plain" ? "group.info.kind.plain" : "group.info.kind.e2ee")}
        </span>
      </p>
    </section>
  );
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

export function GroupInfoMemberList({
  members,
  myUserId,
  busyMemberId,
  onSelectMember,
  t,
}: GroupInfoMemberListProps) {
  return (
    <ul className={styles.memberList}>
      {members.map((member) => {
        const role = normalizeRole(member.role);
        const isSelf = member.userId === myUserId;
        const showRoleBadge = role !== "member";
        return (
          <li key={member.userId}>
            <button
              type="button"
              className={styles.memberRow}
              onClick={() => onSelectMember(member.userId)}
              disabled={busyMemberId === member.userId}
            >
              <Avatar label={member.username} size={42} fontSize="0.9rem" ariaHidden />
              <span className={styles.memberMain}>
                <span className={styles.memberName}>
                  @{member.username}
                  {isSelf ? <span className={styles.youTag}>{t("group.members.you")}</span> : null}
                </span>
                {showRoleBadge ? (
                  <span className={`${styles.roleBadge} ${role === "owner" ? styles.roleOwner : styles.roleAdmin}`}>
                    {t(`group.members.role.${role}`)}
                  </span>
                ) : null}
              </span>
              <svg className={styles.memberChevron} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function GroupInfoLeaveSection({
  myMembership,
  myUserId,
  busyMemberId,
  error,
  onLeave,
  t,
}: GroupInfoLeaveSectionProps) {
  return (
    <>
      {myMembership ? (
        <button
          type="button"
          className={styles.leaveBtn}
          onClick={onLeave}
          disabled={busyMemberId === myUserId}
        >
          {busyMemberId === myUserId ? t("group.members.leaving") : t("group.members.leave")}
        </button>
      ) : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </>
  );
}

export function GroupInfoMemberActionSheet({
  member,
  isSelf,
  myRole,
  groupKind,
  canPromote,
  canVerify,
  busy,
  onClose,
  onPromote,
  onDemote,
  onTransferOwnership,
  onRemove,
  onVerify,
  t,
}: GroupInfoMemberActionSheetProps) {
  void groupKind;
  const role = normalizeRole(member.role);
  const canRemove = (
    isSelf ||
    (myRole === "owner" && role !== "owner") ||
    (myRole === "admin" && role === "member")
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-label={member.username}>
        <div className={styles.sheetHeader}>
          <Avatar label={member.username} size={48} fontSize="0.96rem" ariaHidden />
          <div className={styles.sheetIdentity}>
            <span className={styles.sheetName}>@{member.username}</span>
            <span className={styles.sheetRole}>{t(`group.members.role.${role}`)}</span>
          </div>
        </div>
        <div className={styles.sheetActions}>
          {canVerify ? (
            <button type="button" className={styles.sheetAction} onClick={onVerify}>
              {t("group.members.verify")}
            </button>
          ) : null}
          {canPromote && !isSelf && role === "member" ? (
            <button type="button" className={styles.sheetAction} onClick={onPromote} disabled={busy}>
              {t("group.info.action.promoteAdmin")}
            </button>
          ) : null}
          {canPromote && !isSelf && role === "admin" ? (
            <button type="button" className={styles.sheetAction} onClick={onDemote} disabled={busy}>
              {t("group.info.action.demoteMember")}
            </button>
          ) : null}
          {canPromote && !isSelf && role !== "owner" ? (
            <button type="button" className={styles.sheetAction} onClick={onTransferOwnership} disabled={busy}>
              {t("group.info.action.transferOwnership")}
            </button>
          ) : null}
          {canRemove ? (
            <button type="button" className={`${styles.sheetAction} ${styles.sheetActionDanger}`} onClick={onRemove} disabled={busy}>
              {isSelf ? t("group.members.leave") : t("group.members.remove")}
            </button>
          ) : null}
          <button type="button" className={styles.sheetAction} onClick={onClose}>
            {t("group.info.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
