import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { Avatar, EntityRow, InputField, ModalShell } from "@/components/ui";

import styles from "./NewChatModal.module.css";
import pickerStyles from "./ForwardPickerModal.module.css";

export interface ForwardTarget {
  kind: "plain-direct" | "plain-group" | "saved";
  id: string;
  name: string;
}

interface Props {
  readonly targets: ForwardTarget[];
  readonly onClose: () => void;
  readonly onSelect: (target: ForwardTarget) => void;
}

export function ForwardPickerModal({ targets, onClose, onSelect }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const modalRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: searchInputRef,
    onClose: requestClose,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target) => target.name.toLowerCase().includes(q));
  }, [targets, query]);

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("forward.picker.title")}
      closeAriaLabel={t("modal.close")}
      title={t("forward.picker.title")}
      style={{
        "--modal-width": "400px",
        "--modal-max-height": "72dvh",
        "--modal-z-index": 135,
      } as CSSProperties}
    >
      <div className={styles.searchWrap}>
        <InputField
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t("forward.picker.searchPlaceholder")}
          aria-label={t("forward.picker.searchPlaceholder")}
          wrapperClassName={styles.searchField}
          size="pill"
        />
      </div>

      {filtered.length === 0 ? (
        <p className={styles.hint}>{t("forward.picker.empty")}</p>
      ) : (
        <ul className={`${styles.results} ${pickerStyles.list}`}>
          {filtered.map((target) => (
            <li key={`${target.kind}:${target.id}`}>
              <EntityRow
                as="button"
                onClick={() => { requestClose(); onSelect(target); }}
                leading={<Avatar label={target.name} size={42} fontSize="0.8rem" ariaHidden />}
                title={target.name}
                subtitle={t(
                  target.kind === "saved"
                    ? "saved.title"
                    : target.kind === "plain-group"
                      ? "forward.picker.group"
                      : "forward.picker.direct"
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
