import { useEffect } from "react";
import { Avatar, PillButton } from "@/components/ui";
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
            <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onVerify}>
              {t("group.members.verify")}
            </PillButton>
          ) : null}
          {canPromote && !isSelf && role === "member" ? (
            <PillButton type="button" tone="accent" appearance="soft" size="md" fullWidth onClick={onPromote} disabled={busy}>
              {t("group.info.action.promoteAdmin")}
            </PillButton>
          ) : null}
          {canPromote && !isSelf && role === "admin" ? (
            <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onDemote} disabled={busy}>
              {t("group.info.action.demoteMember")}
            </PillButton>
          ) : null}
          {canPromote && !isSelf && role !== "owner" ? (
            <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onTransferOwnership} disabled={busy}>
              {t("group.info.action.transferOwnership")}
            </PillButton>
          ) : null}
          {canRemove ? (
            <PillButton type="button" tone="danger" appearance="soft" size="md" fullWidth onClick={onRemove} disabled={busy}>
              {isSelf ? t("group.members.leave") : t("group.members.remove")}
            </PillButton>
          ) : null}
          <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onClose}>
            {t("group.info.cancel")}
          </PillButton>
        </div>
      </div>
    </div>
  );
}
