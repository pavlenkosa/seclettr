import { Avatar } from "@/components/ui";

import styles from "./GroupInfoModal.module.css";
import { normalizeRole, type GroupInfoMember } from "./group-info-modal-shared";

interface GroupInfoMemberListProps {
  readonly members: readonly GroupInfoMember[];
  readonly myUserId: string;
  readonly busyMemberId: string | null;
  readonly onSelectMember: (userId: string) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoMemberList({
  members,
  myUserId,
  busyMemberId,
  onSelectMember,
  t,
}: GroupInfoMemberListProps) {
  return (
    <ul className={styles.memberList}>
      {members.map((member) => {
        const role = normalizeRole(member.role);
        const isSelf = member.userId === myUserId;
        const showRoleBadge = role !== "member";

        return (
          <li key={member.userId}>
            <button
              type="button"
              className={styles.memberRow}
              onClick={() => onSelectMember(member.userId)}
              disabled={busyMemberId === member.userId}
            >
              <Avatar label={member.username} size={42} fontSize="0.9rem" ariaHidden />
              <span className={styles.memberMain}>
                <span className={styles.memberName}>
                  @{member.username}
                  {isSelf ? <span className={styles.youTag}>{t("group.members.you")}</span> : null}
                </span>
                {showRoleBadge ? (
                  <span className={`${styles.roleBadge} ${role === "owner" ? styles.roleOwner : styles.roleAdmin}`}>
                    {t(`group.members.role.${role}`)}
                  </span>
                ) : null}
              </span>
              <svg className={styles.memberChevron} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
