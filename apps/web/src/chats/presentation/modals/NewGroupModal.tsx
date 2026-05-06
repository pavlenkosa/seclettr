import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { USER_SEARCH_MIN_QUERY_LENGTH, type UserSearchResult } from "@/lib/user-search";
import { useUserSearch } from "@/chats/runtime/useUserSearch";
import { Avatar, EntityRow, FieldSection, InputField, ModalShell, PillButton, SurfacePanel } from "@/components/ui";

import styles from "./NewGroupModal.module.css";

type UserResult = UserSearchResult;

interface Props {
  readonly onClose: () => void;
  readonly onCreate: (payload: { name: string; memberUserIds: string[] }) => Promise<void> | void;
}

export function NewGroupModal({ onClose, onCreate }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createFormId = useId();

  const selectedSet = useMemo(() => new Set(selected.map((item) => item.userId)), [selected]);

  const { inputValue, results, loading, error: searchError, handleSearchChange } = useUserSearch({
    errorMessage: t("group.create.error.searchFailed"),
  });

  // Exclude already-selected members from the visible list immediately on selection,
  // without waiting for the next search to re-run.
  const visibleResults = useMemo(
    () => results.filter((u) => !selectedSet.has(u.userId)),
    [results, selectedSet]
  );

  const modalRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: nameInputRef,
    onClose: requestClose,
  });

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || selected.length === 0 || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      await onCreate({
        name: trimmedName,
        memberUserIds: selected.map((user) => user.userId),
      });
    } catch {
      setCreateError(t("group.create.error.failed"));
    } finally {
      setCreating(false);
    }
  };
  const handleRemoveSelectedUser = (userId: string) => {
    setSelected((prev) => prev.filter((item) => item.userId !== userId));
  };
  const handleSelectUser = (user: UserResult) => {
    setSelected((prev) => [...prev, user]);
  };

  const displayError = searchError ?? createError;

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("group.create.title")}
      closeAriaLabel={t("group.create.closeAria")}
      title={t("group.create.title")}
      bodyClassName={styles.body}
      style={{
        "--modal-width": "520px",
        "--modal-z-index": 130,
      } as CSSProperties}
      footer={(
        <div className={styles.footer}>
          <PillButton type="button" className={styles.cancelBtn} tone="neutral" size="md" onClick={requestClose} disabled={creating}>
            {t("group.create.cancel")}
          </PillButton>
          <button
            type="submit"
            form={createFormId}
            className={styles.createBtn}
            disabled={creating || name.trim().length === 0 || selected.length === 0}
          >
            {creating ? t("group.create.creating") : t("group.create.submit")}
          </button>
        </div>
      )}
    >
      <form
        id={createFormId}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <FieldSection
          label={(
            <span className={styles.nameLabelRow}>
              {t("group.create.nameLabel")}
              {name.length > 0 && (
                <span className={`${styles.nameCharCount} ${name.length >= 110 ? styles.nameCharCountWarn : ""}`}>
                  {name.length}/128
                </span>
              )}
            </span>
          )}
          className={styles.fieldSection}
        >
          <InputField
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder={t("group.create.namePlaceholder")}
            maxLength={128}
            wrapperClassName={styles.inputField}
            aria-label={t("group.create.nameLabel")}
            autoFocus
          />
        </FieldSection>

        <FieldSection label={t("group.create.membersLabel")} className={styles.fieldSection}>
          <InputField
            type="search"
            value={inputValue}
            onChange={handleSearchChange}
            placeholder={t("group.create.searchPlaceholder")}
            wrapperClassName={styles.inputField}
            aria-label={t("group.create.membersLabel")}
            leading={(
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.2 10.2 13.4 13.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </FieldSection>

        {selected.length > 0 ? (
          <div className={styles.selectedWrap}>
            {selected.map((user) => (
              <PillButton
                key={user.userId}
                type="button"
                onClick={() => handleRemoveSelectedUser(user.userId)}
                className={styles.memberChip}
                tone="accent"
                appearance="soft"
                size="sm"
                trailing={<span>x</span>}
              >
                @{user.username}
              </PillButton>
            ))}
          </div>
        ) : null}

        <SurfacePanel as="ul" className={styles.results} role="listbox" padding="none" radius="lg">
          {loading && <li className={styles.hint}>{t("group.create.searching")}</li>}
          {!loading && !searchError && inputValue.trim().length >= USER_SEARCH_MIN_QUERY_LENGTH && results.length === 0 && (
            <li className={styles.hint}>{t("group.create.noUsersFound")}</li>
          )}
          {visibleResults.map((user) => (
            <li key={user.userId}>
              <EntityRow
                as="button"
                size="md"
                onClick={() => handleSelectUser(user)}
                title={`@${user.username}`}
                leading={<Avatar label={user.username} size={38} fontSize="0.74rem" ariaHidden />}
              />
            </li>
          ))}
        </SurfacePanel>

        {displayError ? (
          <div className={styles.error} role="alert">
            {displayError}
          </div>
        ) : null}
      </form>
    </ModalShell>
  );
}
