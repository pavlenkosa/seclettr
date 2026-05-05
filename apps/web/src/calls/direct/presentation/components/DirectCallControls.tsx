import type { RefObject } from "react";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CallDevicePicker, type VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";
import type { InputDeviceOption } from "@/calls/shared/media/input-devices/useCallInputDevices";
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
  readonly micDevices?: InputDeviceOption[];
  readonly cameraDevices?: InputDeviceOption[];
  readonly selectedMicId?: string | null;
  readonly selectedCameraId?: string | null;
  readonly selectedVideoResolution?: VideoResolution;
  readonly micSectionLabel?: string;
  readonly cameraSectionLabel?: string;
  readonly resolutionSectionLabel?: string;
  readonly micSettingsAriaLabel?: string;
  readonly cameraSettingsAriaLabel?: string;
  readonly selectedScreenResolution?: VideoResolution;
  readonly screenResolutionLabel?: string;
  readonly screenSettingsAriaLabel?: string;
  readonly onSelectMic?: (deviceId: string) => void;
  readonly onSelectCamera?: (deviceId: string) => void;
  readonly onSelectVideoResolution?: (res: VideoResolution) => void;
  readonly onSelectScreenResolution?: (res: VideoResolution) => void;
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
  micDevices = [],
  cameraDevices = [],
  selectedMicId = null,
  selectedCameraId = null,
  selectedVideoResolution = "720p",
  micSectionLabel = "Microphone",
  cameraSectionLabel = "Camera",
  resolutionSectionLabel = "Video quality",
  micSettingsAriaLabel = "Microphone settings",
  cameraSettingsAriaLabel = "Camera settings",
  selectedScreenResolution = "720p",
  screenResolutionLabel = "Screen quality",
  screenSettingsAriaLabel = "Screen share settings",
  onSelectMic,
  onSelectCamera,
  onSelectVideoResolution,
  onSelectScreenResolution,
}: DirectCallControlsProps) {
  return (
    <div className={styles.controlsDock}>
      <CallDevicePicker
        micDevices={micDevices}
        selectedMicId={selectedMicId}
        micSectionLabel={micSectionLabel}
        onSelectMic={onSelectMic}
        chevronAriaLabel={micSettingsAriaLabel}
        active={muted}
      >
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
      </CallDevicePicker>

      <CallDevicePicker
        cameraDevices={cameraDevices}
        selectedCameraId={selectedCameraId}
        cameraSectionLabel={cameraSectionLabel}
        selectedResolution={selectedVideoResolution}
        showResolution={!videoOff}
        resolutionSectionLabel={resolutionSectionLabel}
        onSelectCamera={onSelectCamera}
        onSelectResolution={onSelectVideoResolution}
        chevronAriaLabel={cameraSettingsAriaLabel}
        active={videoOff}
      >
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
      </CallDevicePicker>

      {canScreenShare ? (
        <CallDevicePicker
          selectedResolution={selectedScreenResolution}
          showResolution={screenSharing}
          resolutionSectionLabel={screenResolutionLabel}
          onSelectResolution={onSelectScreenResolution}
          chevronAriaLabel={screenSettingsAriaLabel}
          active={screenSharing}
        >
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
        </CallDevicePicker>
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
