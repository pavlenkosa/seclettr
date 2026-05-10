import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { createRequestSequence } from "@/lib/request-sequence";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import {
  USER_SEARCH_MIN_QUERY_LENGTH,
  searchUsers,
  type UserSearchResult,
} from "@/lib/user-search";
import { Avatar, InputField, ModalShell, PillButton } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";

export type GroupRole = "owner" | "admin" | "member";

export interface GroupInfoMember {
  readonly userId: string;
  readonly username: string;
  readonly role: GroupRole | string;
}

export interface GroupInfoActions {
  /** Rename the group. Throws on failure so the caller can surface an error. */
  readonly rename?: (name: string) => Promise<void>;
  /** Add a user. `role` is the role to assign on add (admin only when supported). */
  readonly addMember: (userId: string, role: GroupRole) => Promise<void>;
  /** Remove or self-leave (depending on userId). */
  readonly removeMember: (userId: string) => Promise<void>;
  /** Promote / demote. Returns the canonical post-change role on success. */
  readonly updateRole?: (userId: string, role: GroupRole) => Promise<void>;
  /** Optional: jump to the security/verify flow for a member (E2EE only). */
  readonly verifyMember?: (member: GroupInfoMember) => void;
}

interface Props {
  readonly groupId: string;
  readonly groupName: string;
  readonly groupKind: "e2ee" | "plain";
  readonly members: readonly GroupInfoMember[];
  readonly myUserId: string;
  readonly actions: GroupInfoActions;
  readonly onClose: () => void;
}

function normalizeRole(role: GroupInfoMember["role"]): GroupRole {
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function roleSortKey(role: GroupRole): number {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  return 2;
}

export function GroupInfoModal({
  groupId,
  groupName,
  groupKind,
  members,
  myUserId,
  actions,
  onClose,
}: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);

  // ── Header / rename ───────────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(groupName);
  const [renameBusy, setRenameBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameDraft(groupName); }, [groupName]);
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  const myMembership = useMemo(
    () => members.find((m) => m.userId === myUserId),
    [members, myUserId]
  );
  const myRole = normalizeRole(myMembership?.role ?? "member");
  const canManage = myRole === "owner" || myRole === "admin";
  const canPromote = myRole === "owner";
  const canRename = canManage && !!actions.rename;

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => {
      const rk = roleSortKey(normalizeRole(a.role)) - roleSortKey(normalizeRole(b.role));
      if (rk !== 0) return rk;
      return a.username.localeCompare(b.username);
    }),
    [members]
  );

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [addingRole, setAddingRole] = useState<GroupRole>("member");
  const debounceRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(createRequestSequence());
  const memberIdSet = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  useEffect(() => {
    const seq = requestSequenceRef.current;
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      seq.invalidate();
    };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < USER_SEARCH_MIN_QUERY_LENGTH) return;
    const token = requestSequenceRef.current.begin();
    setLoadingSearch(true);
    (async () => {
      try {
        const users = await searchUsers(normalized);
        if (!requestSequenceRef.current.isCurrent(token)) return;
        setResults(
          users
            .map((u) => ({ ...u, username: sanitizeDisplayTextOrFallback(u.username, u.userId) }))
            .filter((u) => !memberIdSet.has(u.userId))
        );
      } catch {
        if (requestSequenceRef.current.isCurrent(token)) {
          setResults([]);
          setError(t("group.members.error.searchFailed"));
        }
      } finally {
        if (requestSequenceRef.current.isCurrent(token)) setLoadingSearch(false);
      }
    })();
  }, [query, memberIdSet, t]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setInputValue(value);
    setError(null);
    requestSequenceRef.current.invalidate();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = globalThis.window.setTimeout(() => {
      setQuery(value);
      if (value.trim().length < USER_SEARCH_MIN_QUERY_LENGTH) {
        setResults([]);
        setLoadingSearch(false);
      }
    }, 250);
  };

  // ── Action sheet (Telegram-style row tap → sheet of actions) ──────────────
  const [activeSheetUserId, setActiveSheetUserId] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closeSheet = () => setActiveSheetUserId(null);
  const sheetMember = useMemo(
    () => sortedMembers.find((m) => m.userId === activeSheetUserId) ?? null,
    [sortedMembers, activeSheetUserId]
  );

  const handleAdd = async (user: UserSearchResult) => {
    if (busyMemberId) return;
    setBusyMemberId(user.userId);
    setError(null);
    try {
      await actions.addMember(user.userId, canPromote ? addingRole : "member");
      setResults((prev) => prev.filter((u) => u.userId !== user.userId));
      setInputValue("");
      setQuery("");
      setSearchOpen(false);
    } catch {
      setError(t("group.members.error.addFailed"));
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemove = async (member: GroupInfoMember) => {
    if (busyMemberId) return;
    setBusyMemberId(member.userId);
    setError(null);
    closeSheet();
    try {
      await actions.removeMember(member.userId);
      if (member.userId === myUserId) onClose();
    } catch {
      setError(t("group.members.error.removeFailed"));
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRoleChange = async (member: GroupInfoMember, role: GroupRole) => {
    if (busyMemberId || !actions.updateRole) return;
    setBusyMemberId(member.userId);
    setError(null);
    closeSheet();
    try {
      await actions.updateRole(member.userId, role);
    } catch {
      setError(t("group.members.error.roleFailed"));
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRenameSubmit = async () => {
    if (!actions.rename) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === groupName) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    setError(null);
    try {
      await actions.rename(trimmed);
      setRenaming(false);
    } catch {
      setError(t("group.members.error.renameFailed"));
    } finally {
      setRenameBusy(false);
    }
  };

  // ── A11y ──────────────────────────────────────────────────────────────────
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
    onClose: requestClose,
  });

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("group.info.title")}
      closeAriaLabel={t("group.members.closeAria")}
      closeButtonRef={closeButtonRef}
      surfaceClassName={styles.surface}
      headerClassName={styles.headerSlot}
      bodyClassName={styles.body}
      style={{
        "--modal-width": "560px",
        "--modal-max-height": "86dvh",
        "--modal-max-height-mobile": "calc(100dvh - 1.1rem)",
        "--modal-z-index": 135,
      } as CSSProperties}
      title={null}
    >
      {/* Hero — large avatar + name + member count */}
      <section className={styles.hero}>
        <Avatar label={groupName} size={88} fontSize="1.4rem" ariaHidden />
        {renaming ? (
          <form
            className={styles.renameForm}
            onSubmit={(e) => { e.preventDefault(); void handleRenameSubmit(); }}
          >
            <InputField
              ref={renameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.currentTarget.value)}
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
                onClick={() => { setNameDraft(groupName); setRenaming(false); }}
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
                onClick={() => setRenaming(true)}
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
          {t("group.info.memberCount", { count: members.length })}
          <span className={styles.heroDot} aria-hidden="true">·</span>
          <span className={styles.heroKind}>
            {t(groupKind === "plain" ? "group.info.kind.plain" : "group.info.kind.e2ee")}
          </span>
        </p>
      </section>

      {/* Members section header — count + add toggle */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {t("group.info.membersHeading")}
        </span>
        {canManage ? (
          <button
            type="button"
            className={styles.addToggle}
            onClick={() => setSearchOpen((v) => !v)}
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
            onChange={handleSearchChange}
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
              {(["member", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={addingRole === r}
                  className={`${styles.rolePill} ${addingRole === r ? styles.rolePillActive : ""}`}
                  onClick={() => setAddingRole(r)}
                >
                  {t(`group.members.role.${r}`)}
                </button>
              ))}
            </div>
          ) : null}
          {loadingSearch ? <div className={styles.searchHint}>{t("group.members.searching")}</div> : null}
          {!loadingSearch && inputValue.trim().length >= USER_SEARCH_MIN_QUERY_LENGTH && results.length === 0 ? (
            <div className={styles.searchHint}>{t("group.members.noUsersFound")}</div>
          ) : null}
          {!loadingSearch && inputValue.trim().length < USER_SEARCH_MIN_QUERY_LENGTH ? (
            <div className={styles.searchHint}>{t("group.members.searchIdleHint")}</div>
          ) : null}
          {results.length > 0 ? (
            <ul className={styles.searchResults}>
              {results.map((user) => (
                <li key={user.userId}>
                  <button
                    type="button"
                    className={styles.searchResultRow}
                    onClick={() => void handleAdd(user)}
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

      {/* Members list */}
      <ul className={styles.memberList}>
        {sortedMembers.map((member) => {
          const role = normalizeRole(member.role);
          const isSelf = member.userId === myUserId;
          const showRoleBadge = role !== "member";
          return (
            <li key={member.userId}>
              <button
                type="button"
                className={styles.memberRow}
                onClick={() => setActiveSheetUserId(member.userId)}
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

      {/* Self-leave (always available — server still enforces last-owner rule). */}
      {myMembership ? (
        <button
          type="button"
          className={styles.leaveBtn}
          onClick={() => void handleRemove(myMembership)}
          disabled={busyMemberId === myUserId}
        >
          {busyMemberId === myUserId ? t("group.members.leaving") : t("group.members.leave")}
        </button>
      ) : null}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {/* Action sheet — Telegram-style, opens on member-row tap */}
      {sheetMember ? (
        <ActionSheet
          member={sheetMember}
          isSelf={sheetMember.userId === myUserId}
          myRole={myRole}
          groupKind={groupKind}
          canPromote={canPromote && !!actions.updateRole}
          canVerify={!!actions.verifyMember && groupKind === "e2ee"}
          busy={busyMemberId === sheetMember.userId}
          onClose={closeSheet}
          onPromote={() => void handleRoleChange(sheetMember, "admin")}
          onDemote={() => void handleRoleChange(sheetMember, "member")}
          onTransferOwnership={() => void handleRoleChange(sheetMember, "owner")}
          onRemove={() => void handleRemove(sheetMember)}
          onVerify={() => { closeSheet(); actions.verifyMember?.(sheetMember); }}
          t={t}
        />
      ) : null}
      {/* groupId is intentionally unused inside the modal — ChatModals routes
          calls back to the right store via the actions object. */}
      <span hidden data-group-id={groupId} />
    </ModalShell>
  );
}

interface ActionSheetProps {
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

function ActionSheet({
  member, isSelf, myRole, groupKind, canPromote, canVerify, busy,
  onClose, onPromote, onDemote, onTransferOwnership, onRemove, onVerify, t,
}: ActionSheetProps) {
  void groupKind;
  const role = normalizeRole(member.role);
  const canRemove = (
    isSelf ||
    (myRole === "owner" && role !== "owner") ||
    (myRole === "admin" && role === "member")
  );

  // Click outside to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={member.username}>
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
