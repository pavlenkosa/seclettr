import { useEffect, useLayoutEffect, useState, useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, type MutableRefObject } from "react";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { DirectCallStageSceneState } from "@/calls/direct/presentation/useDirectCallStagePresentation";
import { DirectCallControls } from "./DirectCallControls";
import { DirectCallFloatingPreview } from "./DirectCallFloatingPreview";
import { DirectCallSecurityPanel } from "./DirectCallSecurityPanel";
import { DirectCallStage } from "./DirectCallStage";
import { VIDEO_FRAME_RATE, VIDEO_RESOLUTION_DIMENSIONS } from "./direct-call-video-constraints";
import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";
import { useCallAudioOutput } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { useCallInputDevices } from "@/calls/shared/media/input-devices/useCallInputDevices";
import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import {
  CameraIcon,
  LockIcon,
  MinimizeIcon,
  PhoneIcon,
  SwitchCameraIcon,
} from "@/calls/shared/presentation/CallIcons";
import { useI18n } from "@/i18n";
import { HeaderBar, IconButton, IconPill, InfoStack } from "@/components/ui";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";
import activeStyles from "./DirectCallActiveOverlay.module.css";

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
  readonly callType: "audio" | "video";
  readonly callTypeLabel: string;
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
  readonly e2eeActive: boolean;
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
  callType,
  callTypeLabel,
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
  e2eeActive,
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
  const { t } = useI18n();
  const [selectedVideoResolution, setSelectedVideoResolution] = useState<VideoResolution>("720p");
  const callHeaderRef = useRef<HTMLDivElement>(null);
  const [securitySheetTop, setSecuritySheetTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = callHeaderRef.current;
    if (!el) return;
    setSecuritySheetTop(Math.round(el.getBoundingClientRect().bottom) + 8);
  }, []);

  useEffect(() => {
    const measure = () => {
      const el = callHeaderRef.current;
      if (!el) return;
      setSecuritySheetTop(Math.round(el.getBoundingClientRect().bottom) + 8);
    };
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

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
    const [w, h] = VIDEO_RESOLUTION_DIMENSIONS[selectedVideoResolution] ?? [1280, 720];
    await selectCamera(deviceId, localStream, async (nextTrack) => {
      if (cameraSenderRef.current) {
        await cameraSenderRef.current.replaceTrack(nextTrack);
      }
      await nextTrack.applyConstraints({
        width: { ideal: w },
        height: { ideal: h },
        frameRate: VIDEO_FRAME_RATE,
      }).catch(() => {});
    });
  }, [cameraSenderRef, localStream, selectCamera, selectedVideoResolution]);

  const handleSelectVideoResolution = useCallback(async (resolution: VideoResolution) => {
    const [w, h] = VIDEO_RESOLUTION_DIMENSIONS[resolution] ?? [1280, 720];
    const track = cameraSenderRef.current?.track ?? localStream?.getVideoTracks()[0] ?? null;
    if (track) {
      await track.applyConstraints({
        width: { ideal: w },
        height: { ideal: h },
        frameRate: VIDEO_FRAME_RATE,
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

  const peerHasAudio = Boolean(remoteStream?.getAudioTracks().some((track) => track.readyState === "live"));

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
          ariaLabel={t("call.durationAria")}
        />
      );
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

      <div ref={callHeaderRef}>
      <HeaderBar
        className={styles.callHeader}
        stackCenterOnNarrow
        leading={(
          <IconPill
            className={styles.modeChip}
            icon={callType === "video" ? <CameraIcon /> : <PhoneIcon />}
            size="sm"
          >
            {callTypeLabel}
          </IconPill>
        )}
        center={(
          <InfoStack
            className={activeStyles.callHeaderSummary}
            align="center"
            title={peerDisplayName}
            titleAccessory={callHeaderDuration}
            meta={(
              <button
                type="button"
                onClick={onToggleSecurityCard}
                className={[
                  activeStyles.callEncryptionBadge,
                  e2eeActive ? activeStyles.callEncryptionBadgeSecure : activeStyles.callEncryptionBadgePending,
                  isSecurityCardOpen ? activeStyles.callEncryptionBadgeOpen : "",
                ].filter(Boolean).join(" ")}
                aria-pressed={isSecurityCardOpen}
                aria-label={callSecurityToggleLabel}
              >
                <LockIcon />
                <span className={activeStyles.callEncryptionBadgeLabel}>{callSecurityStatusLabel}</span>
              </button>
            )}
            titleClassName={activeStyles.callHeaderTitle}
            metaClassName={activeStyles.callHeaderMetaRow}
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
      </div>

      {isSecurityCardOpen ? (
        <div
          className={activeStyles.callSecuritySheet}
          style={securitySheetTop !== null ? { top: `${securitySheetTop}px` } : undefined}
        >
          <DirectCallSecurityPanel
            onToggle={onToggleSecurityCard}
            callSecurityToggleLabel={callSecurityToggleLabel}
            callSecurityStatusLabel={callSecurityStatusLabel}
            e2eeActive={e2eeActive}
            mediaEncryptionMode={mediaEncryptionMode}
            verificationCode={verificationCode}
            verificationHash={verificationHash}
            verificationError={verificationError}
          />
        </div>
      ) : null}

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
          peerHasAudio={peerHasAudio}
        />
      </div>

      {hasAudioOutputControls ? (
        <AudioOutputSelector compact hideLabel className={activeStyles.callAudioOutputBar} />
      ) : null}

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
          isTransitioning={isSwitchingCamera}
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
        callType={callType}
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
        onSelectMic={(id) => { void handleSelectMic(id); }}
        onSelectCamera={(id) => { void handleSelectCamera(id); }}
        onSelectVideoResolution={(res) => { void handleSelectVideoResolution(res); }}
        onSelectScreenResolution={onSelectScreenResolution}
      />
    </dialog>
  );
}
