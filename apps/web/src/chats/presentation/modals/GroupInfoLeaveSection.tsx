import styles from "./GroupInfoModal.module.css";
import type { GroupInfoMember } from "./group-info-modal-shared";

interface GroupInfoLeaveSectionProps {
  readonly myMembership: GroupInfoMember | undefined;
  readonly myUserId: string;
  readonly busyMemberId: string | null;
  readonly error: string | null;
  readonly onLeave: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoLeaveSection({
  myMembership,
  myUserId,
  busyMemberId,
  error,
  onLeave,
  t,
}: GroupInfoLeaveSectionProps) {
  return (
    <>
      {myMembership ? (
        <button
          type="button"
          className={styles.leaveBtn}
          onClick={onLeave}
          disabled={busyMemberId === myUserId}
        >
          {busyMemberId === myUserId ? t("group.members.leaving") : t("group.members.leave")}
        </button>
      ) : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </>
  );
}
