import { Avatar, InputField, PillButton } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";

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
