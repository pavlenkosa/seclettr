import { useRef, useState } from "react";
import { Avatar, InputField, PillButton } from "@/components/ui";
import { useGroupAvatarUrl } from "@/lib/hooks";
import { AvatarCropDialog } from "@/components/common/settings/AvatarCropDialog";

import styles from "./GroupInfoModal.module.css";

const GROUP_AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB

interface GroupInfoHeroSectionProps {
  readonly groupId: string;
  readonly groupName: string;
  readonly avatarKey: string | null;
  readonly description: string | null;
  readonly memberCount: number;
  readonly groupKind: "e2ee" | "plain";
  readonly renaming: boolean;
  readonly canRename: boolean;
  readonly renameBusy: boolean;
  readonly nameDraft: string;
  readonly renameInputRef: React.RefObject<HTMLInputElement>;
  readonly canEditAvatar: boolean;
  readonly canEditDescription: boolean;
  readonly onRenameDraftChange: (value: string) => void;
  readonly onRenameStart: () => void;
  readonly onRenameCancel: () => void;
  readonly onRenameSubmit: () => void;
  readonly onAvatarUpload?: (file: File) => Promise<void>;
  readonly onAvatarDelete?: () => Promise<void>;
  readonly onDescriptionSave?: (description: string | null) => Promise<void>;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoHeroSection({
  groupId,
  groupName,
  avatarKey,
  description,
  memberCount,
  groupKind,
  renaming,
  canRename,
  renameBusy,
  nameDraft,
  renameInputRef,
  canEditAvatar,
  canEditDescription,
  onRenameDraftChange,
  onRenameStart,
  onRenameCancel,
  onRenameSubmit,
  onAvatarUpload,
  onAvatarDelete,
  onDescriptionSave,
  t,
}: GroupInfoHeroSectionProps) {
  const avatarImageUrl = useGroupAvatarUrl(groupId, avatarKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Description editing state
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(description ?? "");
  const [descBusy, setDescBusy] = useState(false);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (file.size > GROUP_AVATAR_MAX_BYTES) {
      setAvatarError(t("profile.avatarTooLarge"));
      return;
    }
    setAvatarError(null);
    setCropFile(file);
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!onAvatarUpload) return;
    setCropFile(null);
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      await onAvatarUpload(file);
    } catch {
      setAvatarError(t("profile.avatarUploadError"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!onAvatarDelete) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await onAvatarDelete();
    } catch {
      setAvatarError(t("profile.avatarUploadError"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleDescSave = async () => {
    if (!onDescriptionSave) return;
    setDescBusy(true);
    try {
      const trimmed = descDraft.trim();
      await onDescriptionSave(trimmed === "" ? null : trimmed);
      setEditingDesc(false);
    } catch {
      // keep editing open
    } finally {
      setDescBusy(false);
    }
  };

  const handleDescCancel = () => {
    setDescDraft(description ?? "");
    setEditingDesc(false);
  };

  return (
    <section className={styles.hero}>
      {/* Avatar */}
      <div className={styles.heroAvatarWrap}>
        {canEditAvatar && onAvatarUpload ? (
          <button
            type="button"
            className={styles.heroAvatarBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarBusy}
            aria-label={t("group.info.changeAvatarAria")}
          >
            <Avatar label={groupName} size={88} fontSize="1.4rem" ariaHidden imageUrl={avatarImageUrl ?? undefined} />
            <div className={styles.heroAvatarOverlay} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        ) : (
          <Avatar label={groupName} size={88} fontSize="1.4rem" ariaHidden imageUrl={avatarImageUrl ?? undefined} />
        )}
        {canEditAvatar && avatarKey && onAvatarDelete ? (
          <button
            type="button"
            className={styles.heroAvatarDeleteBtn}
            onClick={() => void handleAvatarDelete()}
            disabled={avatarBusy}
            aria-label={t("group.info.deleteAvatarAria")}
          >
            ×
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={handleAvatarFileChange}
        />
        {avatarError ? <p className={styles.heroAvatarError}>{avatarError}</p> : null}
      </div>

      {/* Name / rename */}
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

      {/* Description */}
      {(canEditDescription || description) ? (
        <div className={styles.heroDescription}>
          {editingDesc ? (
            <form
              className={styles.descForm}
              onSubmit={(e) => { e.preventDefault(); void handleDescSave(); }}
            >
              <InputField
                value={descDraft}
                onChange={(e) => setDescDraft(e.currentTarget.value)}
                maxLength={500}
                placeholder={t("group.info.descriptionPlaceholder")}
                aria-label={t("group.info.descriptionAria")}
                disabled={descBusy}
              />
              <div className={styles.renameActions}>
                <PillButton
                  type="button"
                  tone="neutral"
                  appearance="soft"
                  size="sm"
                  onClick={handleDescCancel}
                  disabled={descBusy}
                >
                  {t("group.info.cancel")}
                </PillButton>
                <PillButton
                  type="submit"
                  tone="accent"
                  appearance="strong"
                  size="sm"
                  disabled={descBusy}
                >
                  {descBusy ? t("group.info.saving") : t("group.info.save")}
                </PillButton>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className={`${styles.descText} ${!description ? styles.descTextEmpty : ""}`}
              onClick={canEditDescription ? () => { setDescDraft(description ?? ""); setEditingDesc(true); } : undefined}
              disabled={!canEditDescription}
            >
              {description ?? (canEditDescription ? t("group.info.descriptionAdd") : null)}
              {canEditDescription ? (
                <svg className={styles.descPencil} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              ) : null}
            </button>
          )}
        </div>
      ) : null}

      {cropFile ? (
        <AvatarCropDialog
          file={cropFile}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={() => setCropFile(null)}
        />
      ) : null}
    </section>
  );
}
