import type { RefObject } from "react";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CameraIcon, HangupIcon, MuteIcon, ScreenShareIcon } from "@/calls/shared/presentation/CallIcons";
import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallControlsProps {
  readonly muted: boolean;
  readonly videoOff: boolean;
  readonly screenSharing: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
  readonly onHangup: () => void;
  readonly hangupButtonRef?: RefObject<HTMLButtonElement>;
  readonly muteAriaLabel: string;
  readonly muteLabel: string;
  readonly cameraAriaLabel: string;
  readonly cameraLabel: string;
  readonly screenShareAriaLabel: string;
  readonly screenShareLabel: string;
  readonly endAriaLabel: string;
  readonly endLabel: string;
}

const canScreenShare =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

export function DirectCallControls({
  muted,
  videoOff,
  screenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onHangup,
  hangupButtonRef,
  muteAriaLabel,
  muteLabel,
  cameraAriaLabel,
  cameraLabel,
  screenShareAriaLabel,
  screenShareLabel,
  endAriaLabel,
  endLabel,
}: DirectCallControlsProps) {
  return (
    <div className={styles.controlsDock}>
      <CallControlButton
        onClick={onToggleMute}
        className={styles.controlBtn}
        active={muted}
        icon={<MuteIcon muted={muted} />}
        label={muteLabel}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={muteAriaLabel}
        aria-pressed={muted}
      />

      <CallControlButton
        onClick={() => onToggleVideo()}
        className={styles.controlBtn}
        active={videoOff}
        icon={<CameraIcon />}
        label={cameraLabel}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={cameraAriaLabel}
        aria-pressed={videoOff}
      />

      {canScreenShare ? (
        <CallControlButton
          onClick={() => onToggleScreenShare()}
          className={styles.controlBtn}
          active={screenSharing}
          icon={<ScreenShareIcon />}
          label={screenShareLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={screenShareAriaLabel}
          aria-pressed={screenSharing}
        />
      ) : null}

      <CallControlButton
        ref={hangupButtonRef}
        onClick={onHangup}
        className={styles.controlBtn}
        tone="danger"
        icon={<HangupIcon />}
        label={endLabel}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={endAriaLabel}
      />
    </div>
  );
}
