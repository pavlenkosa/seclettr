import type { CSSProperties, PointerEventHandler, RefObject } from "react";
import { AvatarSummaryButton, FloatingDock, IconButton } from "@/components/ui";

import { useRegisterCallAudioOutputTarget } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import { ExpandIcon, HangupIcon, MuteIcon } from "@/calls/shared/presentation/CallIcons";
import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallActiveMinimizedProps {
  readonly minimizedDockRef: RefObject<HTMLDialogElement>;
  readonly remoteAudioRef: RefObject<HTMLAudioElement>;
  readonly isDraggingMinimizedDock: boolean;
  readonly style?: CSSProperties;
  readonly minimizedDialogAriaLabel: string;
  readonly dragAriaLabel: string;
  readonly onStartDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onMoveDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onStopDrag: PointerEventHandler<HTMLButtonElement>;
  readonly activeMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  readonly peerInitials: string;
  readonly peerDisplayName: string;
  readonly callStateText: string;
  readonly duration: number;
  readonly durationStartedAtMs: number | null;
  readonly openDetailsAriaLabel: string;
  readonly muted: boolean;
  readonly muteAriaLabel: string;
  readonly expandAriaLabel: string;
  readonly endAriaLabel: string;
  readonly onOpenDetails: () => void;
  readonly onToggleMute: () => void;
  readonly onHangup: () => void;
}

export function DirectCallActiveMinimized({
  minimizedDockRef,
  remoteAudioRef,
  isDraggingMinimizedDock,
  style,
  minimizedDialogAriaLabel,
  dragAriaLabel,
  onStartDrag,
  onMoveDrag,
  onStopDrag,
  activeMinimizedSummaryRef,
  peerInitials,
  peerDisplayName,
  callStateText,
  duration,
  durationStartedAtMs,
  openDetailsAriaLabel,
  muted,
  muteAriaLabel,
  expandAriaLabel,
  endAriaLabel,
  onOpenDetails,
  onToggleMute,
  onHangup,
}: DirectCallActiveMinimizedProps) {
  useRegisterCallAudioOutputTarget(remoteAudioRef);
  const secondaryText = durationStartedAtMs === null
    ? callStateText
    : <CallDurationText baseSeconds={duration} startedAtMs={durationStartedAtMs} />;

  return (
    <FloatingDock
      ref={minimizedDockRef}
      className={styles.minimizedCall}
      style={style}
      tabIndex={-1}
      dialogAriaLabel={minimizedDialogAriaLabel}
      dragAriaLabel={dragAriaLabel}
      auxiliary={<audio ref={remoteAudioRef} autoPlay className={styles.remoteAudio}><track kind="captions" /></audio>}
      isDragging={isDraggingMinimizedDock}
      onDragStart={onStartDrag}
      onDragMove={onMoveDrag}
      onDragEnd={onStopDrag}
      summary={(
        <AvatarSummaryButton
          ref={activeMinimizedSummaryRef}
          onClick={onOpenDetails}
          className={styles.minimizedSummary}
          avatarLabel={peerDisplayName}
          avatarInitials={peerInitials}
          primaryText={peerDisplayName}
          secondaryText={secondaryText}
          aria-label={openDetailsAriaLabel}
        />
      )}
      actions={(
        <div className={styles.minimizedActions}>
          <IconButton
            onClick={onToggleMute}
            className={styles.minimizedBtn}
            size={38}
            variant="glass"
            active={muted}
            aria-label={muteAriaLabel}
            aria-pressed={muted}
          >
            <MuteIcon muted={muted} />
          </IconButton>
          <IconButton
            onClick={onOpenDetails}
            className={styles.minimizedBtn}
            size={38}
            variant="glass"
            aria-label={expandAriaLabel}
          >
            <ExpandIcon />
          </IconButton>
          <IconButton
            onClick={onHangup}
            className={styles.minimizedBtn}
            size={38}
            tone="danger"
            aria-label={endAriaLabel}
          >
            <HangupIcon />
          </IconButton>
        </div>
      )}
    >
    </FloatingDock>
  );
}
