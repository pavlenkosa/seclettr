/**
 * ProfileSheet — floating panel for viewing any user's public profile.
 *
 * Triggered by clicking a contact's avatar or name.
 * Fetches profile data on open, shows avatar, display name, bio, and username.
 */
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { Avatar } from "@/components/ui/identity/Avatar";
import { useAvatarUrl } from "@/lib/hooks";
import { fetchUserProfile, type UserProfile } from "@/lib/profile-api";
import styles from "./ProfileSheet.module.css";

interface ProfileSheetProps {
  readonly username: string;
  readonly onClose: () => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: UserProfile };

export function ProfileSheet({ username, onClose }: ProfileSheetProps) {
  const { t } = useI18n();
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClose();
    }
  };

  // Fetch profile on mount
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchUserProfile(username)
      .then((profile) => {
        if (!cancelled) setState({ status: "ready", profile });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : t("profile.loadError"),
          });
        }
      });
    return () => { cancelled = true; };
  }, [username, t]);

  const profile = state.status === "ready" ? state.profile : null;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      aria-label={t("profile.sheetAriaLabel")}
    >
      <div ref={panelRef} className={styles.panel}>
        {/* Close button */}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {state.status === "loading" && (
          <div className={styles.loadingState}>
            <div className={styles.avatarSkeleton} />
            <div className={styles.textSkeleton} />
            <div className={styles.textSkeletonShort} />
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.errorState}>
            <p>{state.message}</p>
          </div>
        )}

        {state.status === "ready" && profile && (
          <ProfileContent profile={profile} />
        )}
      </div>
    </div>
  );
}

function ProfileContent({ profile }: { readonly profile: UserProfile }) {
  const { t } = useI18n();
  const avatarBlobUrl = useAvatarUrl(profile.userId, profile.avatarKey);
  const displayLabel = profile.displayName || profile.username;

  return (
    <div className={styles.content}>
      {/* Large avatar */}
      <div className={styles.avatarSection}>
        <Avatar
          label={displayLabel}
          size={88}
          fontSize="1.8rem"
          imageUrl={avatarBlobUrl ?? undefined}
        />
      </div>

      {/* Name + username */}
      <div className={styles.identity}>
        {profile.displayName && (
          <h2 className={styles.displayName}>{profile.displayName}</h2>
        )}
        <p className={styles.username}>@{profile.username}</p>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className={styles.bioSection}>
          <p className={styles.bio}>{profile.bio}</p>
        </div>
      )}

      {/* Empty bio placeholder */}
      {!profile.bio && !profile.displayName && (
        <p className={styles.emptyHint}>{t("profile.noInfo")}</p>
      )}
    </div>
  );
}
