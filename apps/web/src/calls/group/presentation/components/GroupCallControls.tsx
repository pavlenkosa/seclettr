import { useI18n } from "@/i18n";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";
import {
  CameraIcon,
  HangupIcon,
  MuteIcon,
  ScreenShareIcon,
} from "@/calls/shared/presentation/CallIcons";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

interface GroupCallControlsProps {
  readonly className: string | undefined;
  readonly layout?: "stacked" | "inline";
  readonly hasLocalMedia: boolean;
  readonly status: GroupCallStatus;
  readonly isAudioMuted: boolean;
  readonly isLocalVideoEnabled: boolean;
  readonly isLocalScreenSharing: boolean;
  readonly isVideoSwitching: boolean;
  readonly isScreenSwitching: boolean;
  readonly muteToggleLabel: string;
  readonly videoToggleLabel: string;
  readonly screenShareToggleLabel: string;
  readonly leaveActionLabel: string;
  readonly endForEveryoneLabel: string;
  readonly canEndForEveryone: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
  readonly onLeave: () => void;
  readonly onEndForEveryone: () => void;
}

const canScreenShare =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

export function GroupCallControls({
  className,
  layout = "stacked",
  hasLocalMedia,
  status,
  isAudioMuted,
  isLocalVideoEnabled,
  isLocalScreenSharing,
  isVideoSwitching,
  isScreenSwitching,
  muteToggleLabel,
  videoToggleLabel,
  screenShareToggleLabel,
  leaveActionLabel,
  endForEveryoneLabel,
  canEndForEveryone,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
  onEndForEveryone,
}: GroupCallControlsProps) {
  const { t } = useI18n();
  const isReady = hasLocalMedia && status === "ready";

  return (
    <div
      className={className}
      role="toolbar"
      aria-label={t("group.call.controlsAria")}
    >
      <CallControlButton
        onClick={onToggleMute}
        layout={layout}
        className={styles.controlBtn}
        active={isAudioMuted}
        icon={<MuteIcon muted={isAudioMuted} />}
        label={muteToggleLabel}
        disabled={!isReady}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={muteToggleLabel}
        aria-pressed={isAudioMuted}
      />
      <CallControlButton
        onClick={() => { onToggleVideo(); }}
        layout={layout}
        className={styles.controlBtn}
        active={!isLocalVideoEnabled}
        icon={<CameraIcon />}
        label={videoToggleLabel}
        disabled={!isReady || isVideoSwitching || isScreenSwitching}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={videoToggleLabel}
        aria-pressed={!isLocalVideoEnabled}
      />
      {canScreenShare ? (
        <CallControlButton
          onClick={() => { onToggleScreenShare(); }}
          layout={layout}
          className={styles.controlBtn}
          active={isLocalScreenSharing}
          icon={<ScreenShareIcon />}
          label={screenShareToggleLabel}
          disabled={!isReady || isVideoSwitching || isScreenSwitching}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={screenShareToggleLabel}
          aria-pressed={isLocalScreenSharing}
        />
      ) : null}
      <CallControlButton
        onClick={onLeave}
        layout={layout}
        className={styles.controlBtn}
        tone="danger"
        icon={<HangupIcon />}
        label={leaveActionLabel}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={leaveActionLabel}
      />
      {canEndForEveryone ? (
        <CallControlButton
          onClick={onEndForEveryone}
          layout={layout}
          className={styles.controlBtn}
          tone="danger"
          icon={<HangupIcon />}
          label={endForEveryoneLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={endForEveryoneLabel}
        />
      ) : null}
    </div>
  );
}
