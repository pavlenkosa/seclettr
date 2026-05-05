import type { CSSProperties, ReactNode } from "react";
import { useI18n } from "@/i18n";
import { AvatarSummaryButton, FloatingDock, IconButton } from "@/components/ui";

import { ExpandIcon, HangupIcon } from "./GroupCallIcons";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

interface GroupCallDockProps {
  readonly groupName: string;
  readonly groupInitials: string;
  readonly isDragging: boolean;
  readonly dockRef: React.RefObject<HTMLDialogElement>;
  readonly inlineStyle: CSSProperties | undefined;
  readonly dockMetaLabel: ReactNode;
  readonly leaveActionLabel: string | undefined;
  readonly onRestore: () => void;
  readonly onLeave: () => void | Promise<void>;
  readonly onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  readonly onDragMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export function GroupCallDock({
  groupName,
  groupInitials,
  isDragging,
  dockRef,
  inlineStyle,
  dockMetaLabel,
  leaveActionLabel,
  onRestore,
  onLeave,
  onDragStart,
  onDragMove,
  onDragEnd,
}: GroupCallDockProps) {
  const { t } = useI18n();

  return (
    <FloatingDock
      ref={dockRef}
      className={styles.dock}
      style={inlineStyle}
      dialogAriaLabel={t("group.call.dialogAria")}
      dragAriaLabel={t("group.call.dragAria")}
      isDragging={isDragging}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      summary={(
        <AvatarSummaryButton
          onClick={onRestore}
          className={styles.dockSummary}
          avatarLabel={groupName}
          avatarInitials={groupInitials}
          primaryText={groupName}
          secondaryText={dockMetaLabel}
          aria-label={t("group.call.restore")}
        />
      )}
      actions={(
        <div className={styles.dockActions}>
          <IconButton
            onClick={onRestore}
            className={styles.dockBtn}
            size={38}
            variant="glass"
            aria-label={t("group.call.restore")}
          >
            <ExpandIcon />
          </IconButton>
          <IconButton
            onClick={() => { void onLeave(); }}
            className={styles.dockBtn}
            size={38}
            tone="danger"
            aria-label={leaveActionLabel}
          >
            <HangupIcon />
          </IconButton>
        </div>
      )}
    >
    </FloatingDock>
  );
}
