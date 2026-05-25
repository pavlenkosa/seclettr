import { useEffect } from "react";
import { Avatar } from "@/components/ui";
import { useNativeBackAction } from "@/lib/hooks";

import styles from "./GroupInfoModal.module.css";
import { normalizeRole, type GroupInfoMember, type GroupRole } from "./group-info-modal-shared";

interface GroupInfoMemberActionSheetProps {
  readonly member: GroupInfoMember;
  readonly isSelf: boolean;
  readonly myRole: GroupRole;
  readonly groupKind: "e2ee" | "plain";
  readonly canPromote: boolean;
  readonly canVerify: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onPromote: () => void;
  readonly onDemote: () => void;
  readonly onTransferOwnership: () => void;
  readonly onRemove: () => void;
  readonly onVerify: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoMemberActionSheet({
  member,
  isSelf,
  myRole,
  groupKind,
  canPromote,
  canVerify,
  busy,
  onClose,
  onPromote,
  onDemote,
  onTransferOwnership,
  onRemove,
  onVerify,
  t,
}: GroupInfoMemberActionSheetProps) {
  void groupKind;
  useNativeBackAction(onClose);
  const role = normalizeRole(member.role);
  const canRemove = (
    isSelf ||
    (myRole === "owner" && role !== "owner") ||
    (myRole === "admin" && role === "member")
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={styles.sheetOverlay}
      onClick={onClose}
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
      tabIndex={0}
    >
      <div
        className={styles.sheet}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={member.username}
        tabIndex={-1}
      >
        <div className={styles.sheetHeader}>
          <Avatar label={member.username} size={48} fontSize="0.96rem" ariaHidden />
          <div className={styles.sheetIdentity}>
            <span className={styles.sheetName}>@{member.username}</span>
            <span className={styles.sheetRole}>{t(`group.members.role.${role}`)}</span>
          </div>
        </div>
        <div className={styles.sheetActions}>
          {canVerify ? (
            <button type="button" className={styles.sheetAction} onClick={onVerify}>
              {t("group.members.verify")}
            </button>
          ) : null}
          {canPromote && !isSelf && role === "member" ? (
            <button type="button" className={styles.sheetAction} onClick={onPromote} disabled={busy}>
              {t("group.info.action.promoteAdmin")}
            </button>
          ) : null}
          {canPromote && !isSelf && role === "admin" ? (
            <button type="button" className={styles.sheetAction} onClick={onDemote} disabled={busy}>
              {t("group.info.action.demoteMember")}
            </button>
          ) : null}
          {canPromote && !isSelf && role !== "owner" ? (
            <button type="button" className={styles.sheetAction} onClick={onTransferOwnership} disabled={busy}>
              {t("group.info.action.transferOwnership")}
            </button>
          ) : null}
          {canRemove ? (
            <button type="button" className={`${styles.sheetAction} ${styles.sheetActionDanger}`} onClick={onRemove} disabled={busy}>
              {isSelf ? t("group.members.leave") : t("group.members.remove")}
            </button>
          ) : null}
          <button type="button" className={styles.sheetAction} onClick={onClose}>
            {t("group.info.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
