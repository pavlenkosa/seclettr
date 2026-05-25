import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { Avatar } from "@/components/ui/identity/Avatar";
import { ModalShell } from "@/components/ui/surfaces/ModalShell";
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
    <ModalShell
      isClosing={false}
      onClose={onClose}
      ariaLabel={t("profile.sheetAriaLabel")}
      closeAriaLabel={t("common.close")}
      surfaceClassName={styles.sheetSurface}
      bodyClassName={styles.sheetBody}
    >
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
    </ModalShell>
  );
}

function ProfileContent({ profile }: { readonly profile: UserProfile }) {
  const { t } = useI18n();
  const avatarBlobUrl = useAvatarUrl(profile.userId, profile.avatarKey);
  const displayLabel = profile.displayName || profile.username;

  return (
    <div className={styles.content}>
      <div className={styles.avatarSection}>
        <Avatar
          label={displayLabel}
          size={88}
          fontSize="1.8rem"
          imageUrl={avatarBlobUrl ?? undefined}
        />
      </div>

      <div className={styles.identity}>
        {profile.displayName && (
          <h2 className={styles.displayName}>{profile.displayName}</h2>
        )}
        <p className={styles.username}>@{profile.username}</p>
      </div>

      {profile.bio && (
        <div className={styles.bioSection}>
          <p className={styles.bio}>{profile.bio}</p>
        </div>
      )}

      {!profile.bio && !profile.displayName && (
        <p className={styles.emptyHint}>{t("profile.noInfo")}</p>
      )}
    </div>
  );
}
