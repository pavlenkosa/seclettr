import { useI18n } from "@/i18n";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CallDevicePicker, type VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";
import type { InputDeviceOption } from "@/calls/shared/media/input-devices/useCallInputDevices";
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
  readonly micDevices?: InputDeviceOption[];
  readonly cameraDevices?: InputDeviceOption[];
  readonly selectedMicId?: string | null;
  readonly selectedCameraId?: string | null;
  readonly selectedVideoResolution?: VideoResolution;
  readonly selectedScreenResolution?: VideoResolution;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
  readonly onLeave: () => void;
  readonly onSelectMic?: (deviceId: string) => void;
  readonly onSelectCamera?: (deviceId: string) => void;
  readonly onSelectVideoResolution?: (res: VideoResolution) => void;
  readonly onSelectScreenResolution?: (res: VideoResolution) => void;
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
  micDevices = [],
  cameraDevices = [],
  selectedMicId = null,
  selectedCameraId = null,
  selectedVideoResolution = "720p",
  selectedScreenResolution = "720p",
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
  onSelectMic,
  onSelectCamera,
  onSelectVideoResolution,
  onSelectScreenResolution,
}: GroupCallControlsProps) {
  const { t } = useI18n();
  const isReady = hasLocalMedia && status === "ready";

  return (
    <div
      className={className}
      role="toolbar"
      aria-label={t("group.call.controlsAria")}
    >
      <CallDevicePicker
        micDevices={micDevices}
        selectedMicId={selectedMicId}
        micSectionLabel={t("call.devices.microphone")}
        onSelectMic={onSelectMic}
        disabled={!isReady}
        chevronAriaLabel={t("call.devices.micSettings")}
        active={isAudioMuted}
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
      </CallDevicePicker>
      <CallDevicePicker
        cameraDevices={cameraDevices}
        selectedCameraId={selectedCameraId}
        cameraSectionLabel={t("call.devices.camera")}
        selectedResolution={selectedVideoResolution}
        showResolution={isLocalVideoEnabled}
        resolutionSectionLabel={t("call.devices.videoQuality")}
        onSelectCamera={onSelectCamera}
        onSelectResolution={onSelectVideoResolution}
        disabled={!isReady || isVideoSwitching || isScreenSwitching}
        chevronAriaLabel={t("call.devices.cameraSettings")}
        active={!isLocalVideoEnabled}
      >
        <CallControlButton
          onClick={() => { void onToggleVideo(); }}
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
      </CallDevicePicker>
      {canScreenShare ? (
        <CallDevicePicker
          selectedResolution={selectedScreenResolution}
          showResolution={isLocalScreenSharing}
          resolutionSectionLabel={t("call.devices.screenQuality")}
          onSelectResolution={onSelectScreenResolution}
          disabled={!isReady || isVideoSwitching || isScreenSwitching}
          chevronAriaLabel={t("call.devices.screenSettings")}
          active={isLocalScreenSharing}
        >
          <CallControlButton
            onClick={() => { void onToggleScreenShare(); }}
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
        </CallDevicePicker>
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
    </div>
  );
}
