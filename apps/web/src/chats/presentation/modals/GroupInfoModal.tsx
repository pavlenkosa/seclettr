import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { createRequestSequence } from "@/lib/request-sequence";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import {
  USER_SEARCH_MIN_QUERY_LENGTH,
  searchUsers,
} from "@/lib/user-search";
import { ModalShell } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";
import { GroupInfoHeroSection } from "./GroupInfoHeroSection";
import { GroupInfoLeaveSection } from "./GroupInfoLeaveSection";
import { GroupInfoMemberActionSheet } from "./GroupInfoMemberActionSheet";
import { GroupInfoMemberList } from "./GroupInfoMemberList";
import {
  GroupInfoSearchSection,
  type GroupInfoSearchResultLike,
} from "./GroupInfoSearchSection";
import { normalizeRole, roleSortKey, type GroupInfoMember, type GroupRole } from "./group-info-modal-shared";

export type { GroupInfoMember, GroupRole } from "./group-info-modal-shared";

export interface GroupInfoActions {
  /** Rename the group. Throws on failure so the caller can surface an error. */
  readonly rename?: (name: string) => Promise<void>;
  /** Upload a new group avatar. Plain groups only. */
  readonly uploadAvatar?: (file: File) => Promise<void>;
  /** Remove the group avatar. Plain groups only. */
  readonly deleteAvatar?: () => Promise<void>;
  /** Update the group description. Plain groups only. */
  readonly updateDescription?: (description: string | null) => Promise<void>;
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
  readonly avatarKey?: string | null;
  readonly description?: string | null;
  readonly members: readonly GroupInfoMember[];
  readonly myUserId: string;
  readonly actions: GroupInfoActions;
  readonly onClose: () => void;
}

export function GroupInfoModal({
  groupId,
  groupName,
  groupKind,
  avatarKey = null,
  description = null,
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
  const [results, setResults] = useState<GroupInfoSearchResultLike[]>([]);
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

  const handleAdd = async (user: GroupInfoSearchResultLike) => {
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
      <GroupInfoHeroSection
        groupId={groupId}
        groupName={groupName}
        avatarKey={avatarKey}
        description={description}
        memberCount={members.length}
        groupKind={groupKind}
        renaming={renaming}
        canRename={canRename}
        renameBusy={renameBusy}
        nameDraft={nameDraft}
        renameInputRef={renameInputRef}
        canEditAvatar={canManage && groupKind === "plain"}
        canEditDescription={canManage && groupKind === "plain"}
        onRenameDraftChange={setNameDraft}
        onRenameStart={() => setRenaming(true)}
        onRenameCancel={() => { setNameDraft(groupName); setRenaming(false); }}
        onRenameSubmit={() => { void handleRenameSubmit(); }}
        onAvatarUpload={actions.uploadAvatar}
        onAvatarDelete={actions.deleteAvatar}
        onDescriptionSave={actions.updateDescription}
        t={t}
      />

      <GroupInfoSearchSection
        searchOpen={searchOpen}
        canManage={canManage}
        canPromote={canPromote}
        inputValue={inputValue}
        loadingSearch={loadingSearch}
        results={results}
        addingRole={addingRole}
        busyMemberId={busyMemberId}
        onToggleSearchOpen={() => setSearchOpen((value) => !value)}
        onSearchChange={handleSearchChange}
        onAddingRoleChange={setAddingRole}
        onAddUser={(user) => { void handleAdd(user); }}
        t={t}
      />

      <GroupInfoMemberList
        members={sortedMembers}
        myUserId={myUserId}
        busyMemberId={busyMemberId}
        onSelectMember={setActiveSheetUserId}
        t={t}
      />

      <GroupInfoLeaveSection
        myMembership={myMembership}
        myUserId={myUserId}
        busyMemberId={busyMemberId}
        error={error}
        onLeave={() => { void handleRemove(myMembership!); }}
        t={t}
      />

      {sheetMember ? (
        <GroupInfoMemberActionSheet
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
