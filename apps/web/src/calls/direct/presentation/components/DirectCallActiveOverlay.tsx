import { useEffect, useState, useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, type MutableRefObject } from "react";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { DirectCallStageSceneState } from "@/calls/direct/presentation/useDirectCallStagePresentation";
import { DirectCallControls } from "./DirectCallControls";
import { DirectCallFloatingPreview } from "./DirectCallFloatingPreview";
import { DirectCallSecurityPanel } from "./DirectCallSecurityPanel";
import { DirectCallStage } from "./DirectCallStage";
import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";
import { useCallAudioOutput } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { useCallAudioActivity } from "@/calls/shared/media/useCallAudioActivity";
import { useCallInputDevices } from "@/calls/shared/media/input-devices/useCallInputDevices";
import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import {
  MinimizeIcon,
  PhoneIcon,
  SwitchCameraIcon,
} from "@/calls/shared/presentation/CallIcons";
import { HeaderBar, IconButton, IconPill, InfoStack } from "@/components/ui";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallActiveOverlayProps {
  readonly activeOverlayRef: RefObject<HTMLDialogElement>;
  readonly remoteAudioRef: RefObject<HTMLAudioElement>;
  readonly remoteCameraProbeRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenProbeRef: RefObject<HTMLVideoElement>;
  readonly localPreviewShellRef: RefObject<HTMLDivElement>;
  readonly localScreenPreviewShellRef: RefObject<HTMLDivElement>;
  readonly localVideoRef: RefObject<HTMLVideoElement>;
  readonly localScreenPreviewRef: RefObject<HTMLVideoElement>;
  readonly activeHangupButtonRef: RefObject<HTMLButtonElement>;
  readonly shouldRenderLocalCameraPreview: boolean;
  readonly activeScreenSharing: boolean;
  readonly isDraggingLocalPreview: boolean;
  readonly isResizingLocalPreview: boolean;
  readonly isDraggingLocalScreenPreview: boolean;
  readonly localPreviewStyle?: CSSProperties;
  readonly localScreenPreviewStyle?: CSSProperties;
  readonly hasRemoteVisualMedia: boolean;
  readonly remoteScreenStream: MediaStream | null;
  readonly remoteVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  readonly stageScene: DirectCallStageSceneState;
  readonly peerDisplayName: string;
  readonly peerInitials: string;
  readonly callStateText: string;
  readonly duration: number;
  readonly durationStartedAtMs: number | null;
  readonly cameraStageLabel: string;
  readonly screenStageLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeViewerLabel: string;
  readonly stopWatchingScreenLabel: string;
  readonly screenViewerDialogAriaLabel: string;
  readonly showCameraOnStageLabel: string;
  readonly showScreenOnStageLabel: string;
  readonly isSecurityCardOpen: boolean;
  readonly callSecurityToggleLabel: string;
  readonly callSecurityStatusLabel: string;
  readonly callMediaEncryptionModeLabel: string;
  readonly e2eeActive: boolean;
  readonly showTransportModeInfo: boolean;
  readonly transportModeInfoLabel: string;
  readonly mediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly verificationCode: string | null;
  readonly verificationHash: string | null;
  readonly verificationError: string | null;
  readonly canSwitchCamera: boolean;
  readonly isSwitchingCamera: boolean;
  readonly muted: boolean;
  readonly videoOff: boolean;
  readonly screenSharing: boolean;
  readonly muteAriaLabel: string;
  readonly muteLabel: string;
  readonly cameraAriaLabel: string;
  readonly cameraLabel: string;
  readonly switchCameraLabel: string;
  readonly resizePreviewLabel: string;
  readonly screenShareAriaLabel: string;
  readonly screenShareLabel: string;
  readonly endAriaLabel: string;
  readonly endLabel: string;
  readonly youLabel: string;
  readonly screenSharingLabel: string;
  readonly inProgressAriaLabel: string;
  readonly minimizeAriaLabel: string;
  readonly onMinimize: () => void;
  readonly onToggleSecurityCard: () => void;
  readonly onStartLocalPreviewDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onMoveLocalPreview: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onStopLocalPreviewDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onStartLocalPreviewResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onMoveLocalPreviewResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onStopLocalPreviewResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onStartLocalScreenPreviewDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onMoveLocalScreenPreview: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onStopLocalScreenPreviewDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onSwitchCamera: () => void | Promise<void>;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void;
  readonly onToggleScreenShare: () => void;
  readonly selectedScreenResolution: VideoResolution;
  readonly onSelectScreenResolution: (res: VideoResolution) => void;
  readonly onHangup: () => void;
  readonly localStream: MediaStream | null;
  readonly cameraSenderRef: RefObject<RTCRtpSender | null>;
  readonly micSectionLabel?: string;
  readonly cameraSectionLabel?: string;
  readonly videoQualityLabel?: string;
  readonly screenQualityLabel?: string;
  readonly micSettingsAriaLabel?: string;
  readonly cameraSettingsAriaLabel?: string;
  readonly screenSettingsAriaLabel?: string;
}

export function DirectCallActiveOverlay({
  activeOverlayRef,
  remoteAudioRef,
  remoteCameraProbeRef,
  remoteScreenProbeRef,
  localPreviewShellRef,
  localScreenPreviewShellRef,
  localVideoRef,
  localScreenPreviewRef,
  activeHangupButtonRef,
  shouldRenderLocalCameraPreview,
  activeScreenSharing,
  isDraggingLocalPreview,
  isResizingLocalPreview,
  isDraggingLocalScreenPreview,
  localPreviewStyle,
  localScreenPreviewStyle,
  hasRemoteVisualMedia,
  remoteScreenStream,
  remoteVideoRef,
  remoteVideoCompanionRef,
  remoteScreenVideoRef,
  remoteScreenCompanionRef,
  stageScene,
  peerDisplayName,
  peerInitials,
  callStateText,
  duration,
  durationStartedAtMs,
  cameraStageLabel,
  screenStageLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeViewerLabel,
  stopWatchingScreenLabel,
  screenViewerDialogAriaLabel,
  showCameraOnStageLabel,
  showScreenOnStageLabel,
  isSecurityCardOpen,
  callSecurityToggleLabel,
  callSecurityStatusLabel,
  callMediaEncryptionModeLabel,
  e2eeActive,
  showTransportModeInfo,
  transportModeInfoLabel,
  mediaEncryptionMode,
  verificationCode,
  verificationHash,
  verificationError,
  canSwitchCamera,
  isSwitchingCamera,
  muted,
  videoOff,
  screenSharing,
  muteAriaLabel,
  muteLabel,
  cameraAriaLabel,
  cameraLabel,
  switchCameraLabel,
  resizePreviewLabel,
  screenShareAriaLabel,
  screenShareLabel,
  endAriaLabel,
  endLabel,
  youLabel,
  screenSharingLabel,
  inProgressAriaLabel,
  minimizeAriaLabel,
  onMinimize,
  onToggleSecurityCard,
  onStartLocalPreviewDrag,
  onMoveLocalPreview,
  onStopLocalPreviewDrag,
  onStartLocalPreviewResize,
  onMoveLocalPreviewResize,
  onStopLocalPreviewResize,
  onStartLocalScreenPreviewDrag,
  onMoveLocalScreenPreview,
  onStopLocalScreenPreviewDrag,
  onSwitchCamera,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  selectedScreenResolution,
  onSelectScreenResolution,
  onHangup,
  localStream,
  cameraSenderRef,
  micSectionLabel,
  cameraSectionLabel,
  videoQualityLabel,
  screenQualityLabel,
  micSettingsAriaLabel,
  cameraSettingsAriaLabel,
  screenSettingsAriaLabel,
}: DirectCallActiveOverlayProps) {
  const [selectedVideoResolution, setSelectedVideoResolution] = useState<VideoResolution>("720p");

  const {
    micDevices,
    cameraDevices,
    selectedMicId,
    selectedCameraId,
    selectMic,
    selectCamera,
  } = useCallInputDevices(localStream);

  const handleSelectMic = useCallback(async (deviceId: string) => {
    if (!localStream) return;
    await selectMic(deviceId, localStream);
    const pc = (cameraSenderRef.current as RTCRtpSender & { _pc?: RTCPeerConnection })?._pc;
    if (!pc) return;
    const newTrack = localStream.getAudioTracks()[0];
    if (!newTrack) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender) {
      await sender.replaceTrack(newTrack).catch(() => {});
    }
  }, [cameraSenderRef, localStream, selectMic]);

  const handleSelectCamera = useCallback(async (deviceId: string) => {
    if (!localStream || !cameraSenderRef.current) return;
    const resolution = { "360p": [640, 360], "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] }[selectedVideoResolution] ?? [1280, 720];
    await selectCamera(deviceId, localStream, async (nextTrack) => {
      if (cameraSenderRef.current) {
        await cameraSenderRef.current.replaceTrack(nextTrack);
      }
      await nextTrack.applyConstraints({
        width: { ideal: resolution[0] },
        height: { ideal: resolution[1] },
        frameRate: { ideal: 30, max: 30 },
      }).catch(() => {});
    });
  }, [cameraSenderRef, localStream, selectCamera, selectedVideoResolution]);

  const handleSelectVideoResolution = useCallback(async (resolution: VideoResolution) => {
    const constraints = { "360p": [640, 360], "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] }[resolution] ?? [1280, 720];
    const track = cameraSenderRef.current?.track ?? localStream?.getVideoTracks()[0] ?? null;
    if (track) {
      await track.applyConstraints({
        width: { ideal: constraints[0] },
        height: { ideal: constraints[1] },
        frameRate: { ideal: 30, max: 30 },
      }).catch(() => {});
    }
    setSelectedVideoResolution(resolution);
  }, [cameraSenderRef, localStream]);

  // Local ref for audio element to track stream changes
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Track stream changes on the audio element
  useEffect(() => {
    const audioEl = localAudioRef.current;
    if (!audioEl) return;

    const updateStream = () => {
      const stream = audioEl.srcObject as MediaStream | null;
      setRemoteStream(stream);
    };

    // Initial stream
    updateStream();

    // Listen for stream changes
    audioEl.addEventListener('loadedmetadata', updateStream);
    audioEl.addEventListener('canplay', updateStream);

    return () => {
      audioEl.removeEventListener('loadedmetadata', updateStream);
      audioEl.removeEventListener('canplay', updateStream);
    };
  }, []);

  // Callback ref to both set the local ref AND sync with the passed ref
  const handleAudioRef = useCallback((node: HTMLAudioElement | null) => {
    localAudioRef.current = node;
    
    // Also set the passed ref's current so runtime can update it
    if (remoteAudioRef) {
      (remoteAudioRef as MutableRefObject<HTMLAudioElement | null>).current = node;
    }
  }, [remoteAudioRef]);

  // Detect when peer is speaking
  const peerIsSpeaking = useCallAudioActivity(remoteStream, true);

  // Only show audio output controls when the browser actually supports it
  const { support: audioOutputSupport, canPromptForDevices: audioCanPrompt } = useCallAudioOutput();
  const hasAudioOutputControls = audioOutputSupport === "full" || audioCanPrompt;

  const callStateSpan = callStateText
    ? <span className={styles.callHeaderDuration}>{callStateText}</span>
    : null;
  const callHeaderDuration = durationStartedAtMs === null
    ? callStateSpan
    : (
        <CallDurationText
          className={styles.callHeaderDuration}
          baseSeconds={duration}
          startedAtMs={durationStartedAtMs}
        />
      );
  // Only show stage type in header when screen share is active — "Camera" is implied and
  // misleading when the peer's camera is off (avatar showing).
  const callHeaderMeta = stageScene.stageLayout.stageSource === "screen" ? screenStageLabel : undefined;

  return (
    <dialog
      ref={activeOverlayRef}
      open
      className={styles.callOverlay}
      aria-modal="true"
      aria-label={inProgressAriaLabel}
      tabIndex={-1}
    >
      <audio ref={handleAudioRef} autoPlay className={styles.remoteAudio}><track kind="captions" /></audio>
      <video ref={remoteCameraProbeRef} autoPlay playsInline muted className={styles.mediaProbe}><track kind="captions" /></video>
      <video ref={remoteScreenProbeRef} autoPlay playsInline muted className={styles.mediaProbe}><track kind="captions" /></video>

      <HeaderBar
        className={styles.callHeader}
        stackCenterOnNarrow
        leading={(
          <IconPill className={styles.modeChip} icon={<PhoneIcon />} size="sm">
            {inProgressAriaLabel}
          </IconPill>
        )}
        center={(
          <InfoStack
            className={styles.callHeaderSummary}
            align="center"
            title={peerDisplayName}
            titleAccessory={callHeaderDuration}
            meta={callHeaderMeta}
            titleClassName={styles.callHeaderTitle}
            metaClassName={styles.callHeaderMeta}
          />
        )}
        trailing={(
          <IconButton
            onClick={onMinimize}
            className={styles.minimizeBtn}
            size={34}
            aria-label={minimizeAriaLabel}
          >
            <MinimizeIcon />
          </IconButton>
        )}
      />

      <div
        className={[
          styles.callCenter,
          hasRemoteVisualMedia ? styles.callCenterVisual : "",
        ].filter(Boolean).join(" ")}
      >
        <DirectCallStage
          remoteScreenStream={remoteScreenStream}
          remoteVideoRef={remoteVideoRef}
          remoteVideoCompanionRef={remoteVideoCompanionRef}
          remoteScreenVideoRef={remoteScreenVideoRef}
          remoteScreenCompanionRef={remoteScreenCompanionRef}
          scene={stageScene}
          peerDisplayName={peerDisplayName}
          peerInitials={peerInitials}
          callStateText={callStateText}
          cameraStageLabel={cameraStageLabel}
          screenStageLabel={screenStageLabel}
          enterFullscreenLabel={enterFullscreenLabel}
          exitFullscreenLabel={exitFullscreenLabel}
          closeViewerLabel={closeViewerLabel}
          stopWatchingScreenLabel={stopWatchingScreenLabel}
          screenViewerDialogAriaLabel={screenViewerDialogAriaLabel}
          showCameraOnStageLabel={showCameraOnStageLabel}
          showScreenOnStageLabel={showScreenOnStageLabel}
          peerIsSpeaking={peerIsSpeaking}
        />

        <div className={styles.callSecuritySection}>
          <DirectCallSecurityPanel
            isOpen={isSecurityCardOpen}
            onToggle={onToggleSecurityCard}
            callSecurityToggleLabel={callSecurityToggleLabel}
            callSecurityStatusLabel={callSecurityStatusLabel}
            callMediaEncryptionModeLabel={callMediaEncryptionModeLabel}
            e2eeActive={e2eeActive}
            showTransportModeInfo={showTransportModeInfo}
            transportModeInfoLabel={transportModeInfoLabel}
            mediaEncryptionMode={mediaEncryptionMode}
            verificationCode={verificationCode}
            verificationHash={verificationHash}
            verificationError={verificationError}
          />
          {hasAudioOutputControls ? (
            <div className={styles.audioOutputStrip}>
              <AudioOutputSelector compact />
            </div>
          ) : null}
        </div>
      </div>

      {shouldRenderLocalCameraPreview ? (
        <DirectCallFloatingPreview
          shellRef={localPreviewShellRef}
          videoRef={localVideoRef}
          label={youLabel}
          className={styles.localPreview}
          isDragging={isDraggingLocalPreview}
          isResizing={isResizingLocalPreview}
          style={localPreviewStyle}
          onStartDrag={onStartLocalPreviewDrag}
          onMoveDrag={onMoveLocalPreview}
          onStopDrag={onStopLocalPreviewDrag}
          onStartResize={onStartLocalPreviewResize}
          onMoveResize={onMoveLocalPreviewResize}
          onStopResize={onStopLocalPreviewResize}
          resizeHandleLabel={resizePreviewLabel}
          onSecondaryAction={canSwitchCamera ? onSwitchCamera : undefined}
          secondaryActionLabel={canSwitchCamera ? switchCameraLabel : undefined}
          secondaryActionContent={<SwitchCameraIcon />}
          secondaryActionDisabled={isSwitchingCamera}
        />
      ) : null}

      {activeScreenSharing ? (
        <DirectCallFloatingPreview
          shellRef={localScreenPreviewShellRef}
          videoRef={localScreenPreviewRef}
          label={screenSharingLabel}
          className={styles.localScreenPreview}
          isDragging={isDraggingLocalScreenPreview}
          style={localScreenPreviewStyle}
          onStartDrag={onStartLocalScreenPreviewDrag}
          onMoveDrag={onMoveLocalScreenPreview}
          onStopDrag={onStopLocalScreenPreviewDrag}
        />
      ) : null}

      <DirectCallControls
        muted={muted}
        videoOff={videoOff}
        screenSharing={screenSharing}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onHangup={onHangup}
        hangupButtonRef={activeHangupButtonRef}
        muteAriaLabel={muteAriaLabel}
        muteLabel={muteLabel ?? muteAriaLabel}
        cameraAriaLabel={cameraAriaLabel}
        cameraLabel={cameraLabel ?? cameraAriaLabel}
        screenShareAriaLabel={screenShareAriaLabel}
        screenShareLabel={screenShareLabel ?? screenShareAriaLabel}
        endAriaLabel={endAriaLabel}
        endLabel={endLabel}
        micDevices={micDevices}
        cameraDevices={cameraDevices}
        selectedMicId={selectedMicId}
        selectedCameraId={selectedCameraId}
        selectedVideoResolution={selectedVideoResolution}
        selectedScreenResolution={selectedScreenResolution}
        micSectionLabel={micSectionLabel}
        cameraSectionLabel={cameraSectionLabel}
        resolutionSectionLabel={videoQualityLabel}
        screenResolutionLabel={screenQualityLabel}
        micSettingsAriaLabel={micSettingsAriaLabel}
        cameraSettingsAriaLabel={cameraSettingsAriaLabel}
        screenSettingsAriaLabel={screenSettingsAriaLabel}
        onSelectMic={handleSelectMic}
        onSelectCamera={handleSelectCamera}
        onSelectVideoResolution={handleSelectVideoResolution}
        onSelectScreenResolution={onSelectScreenResolution}
      />
    </dialog>
  );
}
