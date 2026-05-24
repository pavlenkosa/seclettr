/**
 * ProfileSettingsSection — edit own display name, bio, and avatar.
 */
import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import { Avatar } from "@/components/ui/identity/Avatar";
import { useAvatarUrl } from "@/lib/hooks";
import { updateProfile, uploadAvatar, deleteAvatar } from "@/lib/profile-api";
import { AvatarCropDialog } from "./AvatarCropDialog";
import styles from "./ProfileSettingsSection.module.css";

const DISPLAY_NAME_MAX = 64;
const BIO_MAX = 200;
const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB — matches API limit

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProfileSettingsSection() {
  const { t } = useI18n();
  const { userId, username, displayName, bio, avatarKey, applyProfileUpdate } = useAuthStore(
    useShallow((s) => ({
      userId: s.userId,
      username: s.username,
      displayName: s.displayName,
      bio: s.bio,
      avatarKey: s.avatarKey,
      applyProfileUpdate: s.applyProfileUpdate,
    }))
  );

  const avatarBlobUrl = useAvatarUrl(userId, avatarKey);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nameValue, setNameValue] = useState(displayName ?? "");
  const [bioValue, setBioValue] = useState(bio ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      const updated = await updateProfile({
        displayName: nameValue.trim() || null,
        bio: bioValue.trim() || null,
      });
      applyProfileUpdate({
        displayName: updated.displayName,
        bio: updated.bio,
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("profile.saveError"));
      setSaveState("error");
    }
  }, [nameValue, bioValue, applyProfileUpdate, t]);

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Called when user selects a file — opens the crop dialog first.
  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(t("profile.avatarTooLarge"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setAvatarError(null);
    setCropFile(file);
    // Reset input so re-selecting the same file triggers onChange again.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [t]);

  // Called after crop confirmation — uploads the cropped blob.
  const handleCropConfirm = useCallback(async (blob: Blob) => {
    setCropFile(null);
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const croppedFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const updated = await uploadAvatar(croppedFile);
      applyProfileUpdate({ avatarKey: updated.avatarKey });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t("profile.avatarError"));
    } finally {
      setAvatarUploading(false);
    }
  }, [applyProfileUpdate, t]);

  const handleCropCancel = useCallback(() => {
    setCropFile(null);
  }, []);

  const handleDeleteAvatar = useCallback(async () => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const updated = await deleteAvatar();
      applyProfileUpdate({ avatarKey: updated.avatarKey });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t("profile.avatarError"));
    } finally {
      setAvatarUploading(false);
    }
  }, [applyProfileUpdate, t]);

  const isDirty = nameValue.trim() !== (displayName ?? "") || bioValue.trim() !== (bio ?? "");

  return (
    <div className={styles.root}>
      {/* Avatar section — avatar centered, actions below */}
      <div className={styles.avatarSection}>
        <div className={styles.avatarWrap}>
          <Avatar
            label={displayName || username || "?"}
            size={80}
            fontSize="1.5rem"
            imageUrl={avatarBlobUrl ?? undefined}
          />
          {avatarUploading && <div className={styles.avatarSpinner} aria-hidden="true" />}
        </div>
        <div className={styles.avatarActions}>
          <button
            type="button"
            className={styles.avatarBtn}
            onClick={handleAvatarClick}
            disabled={avatarUploading}
          >
            {t("profile.changePhoto")}
          </button>
          {avatarKey && (
            <button
              type="button"
              className={`${styles.avatarBtn} ${styles.avatarBtnDanger}`}
              onClick={() => void handleDeleteAvatar()}
              disabled={avatarUploading}
            >
              {t("profile.removePhoto")}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={styles.fileInput}
            onChange={handleAvatarChange}
            aria-hidden
            tabIndex={-1}
          />
        </div>
        {avatarError && <p className={styles.errorMsg}>{avatarError}</p>}
      </div>

      {/* Name field */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="profile-display-name">
          {t("profile.displayName")}
        </label>
        <input
          id="profile-display-name"
          type="text"
          className={styles.input}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={username ?? ""}
          autoComplete="name"
        />
        <span className={styles.charCount}>
          {nameValue.length}/{DISPLAY_NAME_MAX}
        </span>
      </div>

      {/* Username (read-only) */}
      <div className={styles.field}>
        <label className={styles.label}>{t("profile.username")}</label>
        <div className={styles.readonlyValue}>@{username}</div>
        <span className={styles.hint}>{t("profile.usernameHint")}</span>
      </div>

      {/* Bio field */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="profile-bio">
          {t("profile.bio")}
        </label>
        <textarea
          id="profile-bio"
          className={`${styles.input} ${styles.textarea}`}
          value={bioValue}
          onChange={(e) => setBioValue(e.target.value)}
          maxLength={BIO_MAX}
          rows={3}
          placeholder={t("profile.bioPlaceholder")}
        />
        <span className={styles.charCount}>
          {bioValue.length}/{BIO_MAX}
        </span>
      </div>

      {/* Save */}
      <div className={styles.saveRow}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void handleSave()}
          disabled={!isDirty || saveState === "saving"}
        >
          {saveState === "saving"
            ? t("profile.saving")
            : saveState === "saved"
              ? t("profile.saved")
              : t("profile.save")}
        </button>
        {saveState === "error" && saveError && (
          <p className={styles.errorMsg}>{saveError}</p>
        )}
      </div>

      {/* Avatar crop dialog — rendered over everything else */}
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
