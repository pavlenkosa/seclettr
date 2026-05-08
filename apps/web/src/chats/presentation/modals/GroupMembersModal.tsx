import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GroupMember, GroupChat } from "@/stores/groups";
import { useGroupsStore } from "@/stores/groups";
import { useI18n } from "@/i18n";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { createRequestSequence } from "@/lib/request-sequence";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import {
  USER_SEARCH_MIN_QUERY_LENGTH,
  searchUsers,
  type UserSearchResult,
} from "@/lib/user-search";
import { Avatar, EntityRow, FieldSection, InputField, ModalShell, PillButton, SelectField, SurfacePanel } from "@/components/ui";

import styles from "./GroupMembersModal.module.css";

type UserResult = UserSearchResult;

interface Props {
  readonly group: GroupChat;
  readonly myUserId: string;
  readonly onVerifyMember: (member: GroupMember) => void;
  readonly onClose: () => void;
}

function normalizeRole(role: GroupMember["role"] | undefined): "owner" | "admin" | "member" {
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function roleClassName(role: "owner" | "admin" | "member"): string {
  if (role === "owner") return styles.roleOwner ?? "";
  if (role === "admin") return styles.roleAdmin ?? "";
  return styles.roleMember ?? "";
}

export function GroupMembersModal({ group, myUserId, onVerifyMember, onClose }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const addGroupMembers = useGroupsStore((state) => state.addGroupMembers);
  const removeGroupMember = useGroupsStore((state) => state.removeGroupMember);
  const updateGroupMemberRole = useGroupsStore((state) => state.updateGroupMemberRole);

  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [addingRole, setAddingRole] = useState<"member" | "admin">("member");
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyRoleUserId, setBusyRoleUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<number | null>(null);

  const memberIdSet = useMemo(() => new Set(group.members.map((member) => member.userId)), [group.members]);
  const memberIdSetRef = useRef(memberIdSet);
  const requestSequenceRef = useRef(createRequestSequence());
  memberIdSetRef.current = memberIdSet;
  const myMembership = useMemo(
    () => group.members.find((member) => member.userId === myUserId),
    [group.members, myUserId]
  );
  const myRole = normalizeRole(myMembership?.role);
  const canManageMembers = myRole === "owner" || myRole === "admin";
  const canAssignAdmin = myRole === "owner";
  const showSearchResults =
    loadingSearch || inputValue.trim().length >= USER_SEARCH_MIN_QUERY_LENGTH;

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: canManageMembers ? searchInputRef : closeButtonRef,
    onClose: requestClose,
  });

  useEffect(() => {
    const requestSequence = requestSequenceRef.current;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      requestSequence.invalidate();
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < USER_SEARCH_MIN_QUERY_LENGTH) {
      return;
    }

    const requestToken = requestSequenceRef.current.begin();
    setLoadingSearch(true);

    (async () => {
      try {
        const users = await searchUsers(normalizedQuery);
        if (!requestSequenceRef.current.isCurrent(requestToken)) {
          return;
        }
        setResults(
          users
            .map((user) => ({
              ...user,
              username: sanitizeDisplayTextOrFallback(user.username, user.userId),
            }))
            .filter((user) => !memberIdSetRef.current.has(user.userId))
        );
      } catch {
        if (!requestSequenceRef.current.isCurrent(requestToken)) {
          return;
        }
        setResults([]);
        setError(t("group.members.error.searchFailed"));
      } finally {
        if (requestSequenceRef.current.isCurrent(requestToken)) {
          setLoadingSearch(false);
        }
      }
    })();
  }, [query, t]);

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

  const handleAddMember = async (user: UserResult) => {
    if (!canManageMembers || busyMemberId) return;
    setBusyMemberId(user.userId);
    setError(null);
    try {
      await addGroupMembers(group.groupId, [user.userId], canAssignAdmin ? addingRole : "member");
      setResults((prev) => prev.filter((item) => item.userId !== user.userId));
      setQuery("");
      setInputValue("");
    } catch {
      setError(t("group.members.error.addFailed"));
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemoveMember = async (member: GroupMember) => {
    if (busyMemberId) return;
    setBusyMemberId(member.userId);
    setError(null);
    try {
      await removeGroupMember(group.groupId, member.userId);
      if (member.userId === myUserId) {
        onClose();
      }
    } catch {
      setError(t("group.members.error.removeFailed"));
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRoleChange = async (member: GroupMember, role: "admin" | "member") => {
    if (busyRoleUserId || !canAssignAdmin) return;
    setBusyRoleUserId(member.userId);
    setError(null);
    try {
      await updateGroupMemberRole(group.groupId, member.userId, role);
    } catch {
      setError(t("group.members.error.roleFailed"));
    } finally {
      setBusyRoleUserId(null);
    }
  };

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("group.members.title")}
      closeAriaLabel={t("group.members.closeAria")}
      closeButtonRef={closeButtonRef}
      overlayClassName={styles.overlay}
      surfaceClassName={styles.surface}
      headerClassName={styles.header}
      bodyClassName={styles.body}
      style={{
        "--modal-width": "620px",
        "--modal-max-height": "86dvh",
        "--modal-max-height-mobile": "calc(100dvh - 1.1rem)",
        "--modal-z-index": 135,
      } as CSSProperties}
      title={(
        <span className={styles.titleStack}>
          <span className={styles.titleText}>{t("group.members.title")}</span>
          <span className={styles.subtitle}>{group.name}</span>
        </span>
      )}
    >
      {canManageMembers ? (
          <SurfacePanel className={styles.addPanel} padding="md" radius="lg">
            <FieldSection
              className={styles.addSection}
              label={t("group.members.addSectionTitle")}
              description={t("group.members.addSectionHint")}
              labelClassName={styles.addPanelTitle}
              descriptionClassName={styles.addPanelDescription}
            >
              <div className={styles.addRow}>
                <InputField
                  ref={searchInputRef}
                  type="search"
                  value={inputValue}
                  onChange={handleSearchChange}
                  placeholder={t("group.members.searchPlaceholder")}
                  aria-label={t("group.members.searchPlaceholder")}
                  className={styles.input}
                  wrapperClassName={styles.searchField}
                  leading={(
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.2 10.2 13.4 13.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                />
                {canAssignAdmin ? (
                  <SelectField
                    wrapperClassName={`${styles.roleSelect} ${styles.toolbarRoleSelect}`}
                    value={addingRole}
                    onChange={(event) => setAddingRole(event.currentTarget.value as "member" | "admin")}
                    aria-label={t("group.members.roleSelectAria")}
                  >
                    <option value="member">{t("group.members.role.member")}</option>
                    <option value="admin">{t("group.members.role.admin")}</option>
                  </SelectField>
                ) : null}
              </div>
            </FieldSection>
            {showSearchResults ? (
              <SurfacePanel as="ul" className={styles.searchResults} role="listbox" padding="none" radius="md">
                {loadingSearch ? <li className={styles.hint}>{t("group.members.searching")}</li> : null}
                {!loadingSearch && !error && inputValue.trim().length >= USER_SEARCH_MIN_QUERY_LENGTH && results.length === 0 ? (
                  <li className={styles.hint}>{t("group.members.noUsersFound")}</li>
                ) : null}
                {results.map((user) => (
                  <li key={user.userId} className={styles.searchItem}>
                    <EntityRow
                      as="div"
                      size="sm"
                      title={`@${user.username}`}
                      leading={<Avatar label={user.username} size={32} fontSize="0.64rem" ariaHidden />}
                      trailing={(
                        <PillButton
                          type="button"
                          className={styles.addMemberBtn}
                          tone="accent"
                          appearance="soft"
                          size="sm"
                          onClick={() => void handleAddMember(user)}
                          disabled={busyMemberId === user.userId}
                          leading={(
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                            </svg>
                          )}
                        >
                          {busyMemberId === user.userId ? t("group.members.adding") : t("group.members.add")}
                        </PillButton>
                      )}
                    />
                  </li>
                ))}
              </SurfacePanel>
            ) : (
              <div className={styles.idleHint}>{t("group.members.searchIdleHint")}</div>
            )}
          </SurfacePanel>
      ) : null}

      <ul className={styles.memberList}>
        {group.members.map((member) => {
          const role = normalizeRole(member.role);
          const isSelf = member.userId === myUserId;
          const canEditRole = canAssignAdmin && !isSelf && role !== "owner";
          const canRemove = (
            isSelf ||
            (canManageMembers && role !== "owner" && (myRole === "owner" || role === "member"))
          );

          return (
            <SurfacePanel as="li" key={member.userId} className={styles.memberItem} padding="md" radius="lg">
              <EntityRow
                as="div"
                className={styles.memberIdentity}
                mainClassName={styles.memberInfo}
                titleClassName={styles.memberHandle}
                metaClassName={styles.memberMetaRow}
                title={`@${member.username}`}
                leading={<Avatar label={member.username} size={40} fontSize="0.82rem" ariaHidden />}
                meta={(
                  <>
                    <span className={`${styles.roleBadge} ${roleClassName(role)}`}>
                      {t(`group.members.role.${role}`)}
                    </span>
                    {isSelf ? <span className={styles.youTag}>{t("group.members.you")}</span> : null}
                  </>
                )}
              />
              <div className={styles.memberActions}>
                {isSelf ? null : (
                  <PillButton
                    type="button"
                    className={styles.verifyBtn}
                    tone="accent"
                    appearance="strong"
                    size="sm"
                    onClick={() => onVerifyMember(member)}
                    leading={(
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M6 1.3 9.5 3v2.6C9.5 7.5 6 10.7 6 10.7S2.5 7.5 2.5 5.6V3L6 1.3Z" fill="currentColor" />
                      </svg>
                    )}
                  >
                    {t("group.members.verify")}
                  </PillButton>
                )}
                {canEditRole ? (
                  <SelectField
                    wrapperClassName={`${styles.roleSelect} ${styles.inlineRoleSelect}`}
                    value={role}
                    onChange={(event) => void handleRoleChange(member, event.currentTarget.value as "admin" | "member")}
                    disabled={busyRoleUserId === member.userId}
                    aria-label={t("group.members.roleSelectAria")}
                  >
                    <option value="member">{t("group.members.role.member")}</option>
                    <option value="admin">{t("group.members.role.admin")}</option>
                  </SelectField>
                ) : null}
                {canRemove ? (
                  <PillButton
                    type="button"
                    className={styles.removeBtn}
                    tone="danger"
                    appearance="soft"
                    size="sm"
                    onClick={() => void handleRemoveMember(member)}
                    disabled={busyMemberId === member.userId}
                    leading={(
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2.4 6h7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    )}
                  >
                    {isSelf ? t("group.members.leave") : t("group.members.remove")}
                  </PillButton>
                ) : null}
              </div>
            </SurfacePanel>
          );
        })}
      </ul>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </ModalShell>
  );
}
