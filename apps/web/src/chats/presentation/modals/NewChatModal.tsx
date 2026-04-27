import { useRef, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { USER_SEARCH_MIN_QUERY_LENGTH } from "@/lib/user-search";
import { useUserSearch } from "@/chats/runtime/useUserSearch";
import { Avatar, EntityRow, InputField, ModalShell, SurfacePanel } from "@/components/ui";

import styles from "./NewChatModal.module.css";

interface Props {
  readonly onClose: () => void;
  readonly onSelect: (userId: string, username: string) => void;
}

export function NewChatModal({ onClose, onSelect }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const modalRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { inputValue, results, loading, error, handleSearchChange } = useUserSearch({
    errorMessage: t("group.members.error.searchFailed"),
  });

  const hasSearchQuery = inputValue.trim().length >= USER_SEARCH_MIN_QUERY_LENGTH;

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: searchInputRef,
    onClose: requestClose,
  });

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("newChat.title")}
      closeAriaLabel={t("newChat.closeAria")}
      title={t("newChat.title")}
      style={{
        "--modal-width": "480px",
        "--modal-max-height": "82dvh",
        "--modal-max-height-mobile": "84dvh",
        "--modal-z-index": 100,
      } as CSSProperties}
    >
      <div className={styles.searchWrap}>
        <InputField
          ref={searchInputRef}
          type="search"
          autoFocus
          placeholder={t("newChat.searchPlaceholder")}
          aria-label={t("newChat.searchPlaceholder")}
          value={inputValue}
          onChange={handleSearchChange}
          wrapperClassName={styles.searchField}
          size="pill"
          autoCapitalize="none"
          autoCorrect="off"
          leading={(
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.2 10.2 13.4 13.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        />
      </div>

      <SurfacePanel as="ul" className={styles.results} role="listbox" padding="none" radius="lg" glass="medium">
        {loading && <li className={styles.hint}>{t("newChat.searching")}</li>}
        {!loading && error && (
          <li className={styles.hint} role="alert">{error}</li>
        )}
        {!loading && !error && hasSearchQuery && results.length === 0 && (
          <li className={styles.hint}>{t("newChat.noUsersFound")}</li>
        )}
        {results.map((user) => (
          <li key={user.userId}>
            <EntityRow
              as="button"
              size="lg"
              onClick={() => onSelect(user.userId, user.username)}
              role="option"
              title={user.username}
              leading={<Avatar label={user.username} size={44} fontSize="0.82rem" ariaHidden />}
            />
          </li>
        ))}
      </SurfacePanel>
    </ModalShell>
  );
}
