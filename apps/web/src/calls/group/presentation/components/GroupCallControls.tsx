import { useI18n } from "@/i18n";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";
import {
  CameraIcon,
  MuteIcon,
  ScreenShareIcon,
} from "./GroupCallIcons";
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
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
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
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
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
        aria-label={muteToggleLabel}
        aria-pressed={isAudioMuted}
      />
      <CallControlButton
        onClick={() => { onToggleVideo(); }}
        layout={layout}
        className={styles.controlBtn}
        active={isLocalVideoEnabled}
        icon={<CameraIcon />}
        label={videoToggleLabel}
        disabled={!isReady || isVideoSwitching || isScreenSwitching}
        aria-label={videoToggleLabel}
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
          aria-label={screenShareToggleLabel}
        />
      ) : null}
    </div>
  );
}
