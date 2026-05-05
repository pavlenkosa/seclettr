import type {
  CSSProperties,
  PointerEventHandler,
  RefObject,
} from "react";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { DirectCallStageSceneState } from "@/calls/direct/presentation/useDirectCallStagePresentation";
import { InlineNotice } from "@/components/ui";

import { DirectCallActiveMinimized } from "./DirectCallActiveMinimized";
import { DirectCallActiveOverlay } from "./DirectCallActiveOverlay";
import { DirectCallIncomingMinimized } from "./DirectCallIncomingMinimized";
import { DirectCallIncomingOverlay } from "./DirectCallIncomingOverlay";
import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

type DirectCallSurface =
  | "hidden"
  | "incoming-fullscreen"
  | "incoming-minimized"
  | "active-minimized"
  | "active-fullscreen";

interface CallNoticeData {
  kind: "info" | "error";
  message: string;
}

interface IncomingSurfaceData {
  callType: "audio" | "video";
}

interface ActiveSurfaceData {
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  duration: number;
  durationStartedAtMs: number | null;
  canSwitchCamera: boolean;
  isSwitchingCamera: boolean;
  e2eeActive: boolean;
  mediaEncryptionMode: DirectCallMediaEncryptionMode;
  verificationCode: string | null;
  verificationHash: string | null;
  verificationError: string | null;
}

interface DirectCallSurfaceRendererProps {
  readonly notice: CallNoticeData | null;
  readonly surface: DirectCallSurface;
  readonly incoming: IncomingSurfaceData | null;
  readonly active: ActiveSurfaceData | null;
  readonly incomingOverlayRef: RefObject<HTMLDivElement>;
  readonly incomingAcceptButtonRef: RefObject<HTMLButtonElement>;
  readonly minimizedDockRef: RefObject<HTMLDialogElement>;
  readonly incomingMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  readonly incomingMinimizedAcceptButtonRef: RefObject<HTMLButtonElement>;
  readonly activeMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  readonly remoteAudioRef: RefObject<HTMLAudioElement>;
  readonly activeOverlayRef: RefObject<HTMLDialogElement>;
  readonly remoteCameraProbeRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenProbeRef: RefObject<HTMLVideoElement>;
  readonly localPreviewShellRef: RefObject<HTMLDivElement>;
  readonly localScreenPreviewShellRef: RefObject<HTMLDivElement>;
  readonly localVideoRef: RefObject<HTMLVideoElement>;
  readonly localScreenPreviewRef: RefObject<HTMLVideoElement>;
  readonly activeHangupButtonRef: RefObject<HTMLButtonElement>;
  readonly isDraggingMinimizedDock: boolean;
  readonly minimizedDockInlineStyle?: CSSProperties;
  readonly isDraggingLocalPreview: boolean;
  readonly isResizingLocalPreview: boolean;
  readonly isDraggingLocalScreenPreview: boolean;
  readonly localPreviewStyle?: CSSProperties;
  readonly localScreenPreviewStyle?: CSSProperties;
  readonly shouldRenderLocalCameraPreview: boolean;
  readonly hasRemoteVisualMedia: boolean;
  readonly remoteScreenStream: MediaStream | null;
  readonly remoteVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  readonly stageScene: DirectCallStageSceneState;
  readonly incomingPeerInitials: string;
  readonly incomingPeerDisplayName: string;
  readonly incomingPromptText: string;
  readonly incomingMinimizedMetaText: string;
  readonly peerDisplayInitials: string;
  readonly peerDisplayName: string;
  readonly activeCallStateText: string;
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
  readonly callSecurityModeText: string;
  readonly showTransportModeInfo: boolean;
  readonly transportModeInfoLabel: string;
  readonly muteToggleAriaLabel: string;
  readonly muteToggleLabel: string;
  readonly videoToggleAriaLabel: string;
  readonly videoToggleLabel: string;
  readonly switchCameraLabel: string;
  readonly resizePreviewLabel: string;
  readonly screenShareToggleAriaLabel: string;
  readonly screenShareToggleLabel: string;
  readonly ringingLabel: string;
  readonly incomingDialogAriaLabel: string;
  readonly minimizeAriaLabel: string;
  readonly videoCallLabel: string;
  readonly voiceCallLabel: string;
  readonly rejectAriaLabel: string;
  readonly acceptAriaLabel: string;
  readonly dragAriaLabel: string;
  readonly openDetailsAriaLabel: string;
  readonly expandAriaLabel: string;
  readonly minimizedDialogAriaLabel: string;
  readonly endAriaLabel: string;
  readonly endLabel: string;
  readonly youLabel: string;
  readonly screenSharingLabel: string;
  readonly inProgressAriaLabel: string;
  readonly onIncomingMinimize: () => void;
  readonly onReject: () => void;
  readonly onAccept: () => void | Promise<void>;
  readonly onStartMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onMoveMinimizedDock: PointerEventHandler<HTMLButtonElement>;
  readonly onStopMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onOpenIncomingDetails: () => void;
  readonly onOpenActiveDetails: () => void;
  readonly onToggleMute: () => void;
  readonly onHangup: () => void;
  readonly onActiveMinimize: () => void;
  readonly onToggleSecurityCard: () => void;
  readonly onStartLocalPreviewDrag: React.PointerEventHandler<HTMLDivElement>;
  readonly onMoveLocalPreview: React.PointerEventHandler<HTMLDivElement>;
  readonly onStopLocalPreviewDrag: React.PointerEventHandler<HTMLDivElement>;
  readonly onStartLocalPreviewResize: React.PointerEventHandler<HTMLButtonElement>;
  readonly onMoveLocalPreviewResize: React.PointerEventHandler<HTMLButtonElement>;
  readonly onStopLocalPreviewResize: React.PointerEventHandler<HTMLButtonElement>;
  readonly onStartLocalScreenPreviewDrag: React.PointerEventHandler<HTMLDivElement>;
  readonly onMoveLocalScreenPreview: React.PointerEventHandler<HTMLDivElement>;
  readonly onStopLocalScreenPreviewDrag: React.PointerEventHandler<HTMLDivElement>;
  readonly onSwitchCamera: () => void | Promise<void>;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
  readonly localStream?: MediaStream | null;
  readonly cameraSenderRef?: RefObject<RTCRtpSender | null>;
}

export function DirectCallSurfaceRenderer({
  notice,
  surface,
  incoming,
  active,
  incomingOverlayRef,
  incomingAcceptButtonRef,
  minimizedDockRef,
  incomingMinimizedSummaryRef,
  incomingMinimizedAcceptButtonRef,
  activeMinimizedSummaryRef,
  remoteAudioRef,
  activeOverlayRef,
  remoteCameraProbeRef,
  remoteScreenProbeRef,
  localPreviewShellRef,
  localScreenPreviewShellRef,
  localVideoRef,
  localScreenPreviewRef,
  activeHangupButtonRef,
  isDraggingMinimizedDock,
  minimizedDockInlineStyle,
  isDraggingLocalPreview,
  isResizingLocalPreview,
  isDraggingLocalScreenPreview,
  localPreviewStyle,
  localScreenPreviewStyle,
  shouldRenderLocalCameraPreview,
  hasRemoteVisualMedia,
  remoteScreenStream,
  remoteVideoRef,
  remoteVideoCompanionRef,
  remoteScreenVideoRef,
  remoteScreenCompanionRef,
  stageScene,
  incomingPeerInitials,
  incomingPeerDisplayName,
  incomingMinimizedMetaText,
  peerDisplayInitials,
  peerDisplayName,
  activeCallStateText,
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
  callSecurityModeText,
  showTransportModeInfo,
  transportModeInfoLabel,
  muteToggleAriaLabel,
  muteToggleLabel,
  videoToggleAriaLabel,
  videoToggleLabel,
  switchCameraLabel,
  resizePreviewLabel,
  screenShareToggleAriaLabel,
  screenShareToggleLabel,
  ringingLabel,
  incomingDialogAriaLabel,
  minimizeAriaLabel,
  videoCallLabel,
  voiceCallLabel,
  rejectAriaLabel,
  acceptAriaLabel,
  dragAriaLabel,
  openDetailsAriaLabel,
  expandAriaLabel,
  minimizedDialogAriaLabel,
  endAriaLabel,
  endLabel,
  youLabel,
  screenSharingLabel,
  inProgressAriaLabel,
  onIncomingMinimize,
  onReject,
  onAccept,
  onStartMinimizedDockDrag,
  onMoveMinimizedDock,
  onStopMinimizedDockDrag,
  onOpenIncomingDetails,
  onOpenActiveDetails,
  onToggleMute,
  onHangup,
  onActiveMinimize,
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
  onToggleVideo,
  onToggleScreenShare,
  localStream,
  cameraSenderRef,
}: DirectCallSurfaceRendererProps) {
  if (surface === "hidden" && !notice) {
    return null;
  }

  return (
    <>
      {notice ? (
        <div className={styles.noticeLayer} aria-live="polite">
          <InlineNotice
            className={styles.notice}
            tone={notice.kind === "error" ? "error" : "info"}
            size="md"
            role="status"
          >
            {notice.message}
          </InlineNotice>
        </div>
      ) : null}

      {incoming && surface === "incoming-fullscreen" ? (
        <DirectCallIncomingOverlay
          incomingOverlayRef={incomingOverlayRef}
          incomingCallType={incoming.callType}
          incomingPeerInitials={incomingPeerInitials}
          incomingPeerDisplayName={incomingPeerDisplayName}
          ringingLabel={ringingLabel}
          incomingDialogAriaLabel={incomingDialogAriaLabel}
          minimizeAriaLabel={minimizeAriaLabel}
          videoCallLabel={videoCallLabel}
          voiceCallLabel={voiceCallLabel}
          rejectAriaLabel={rejectAriaLabel}
          acceptAriaLabel={acceptAriaLabel}
          onMinimize={onIncomingMinimize}
          onReject={onReject}
          onAccept={onAccept}
          incomingAcceptButtonRef={incomingAcceptButtonRef}
        />
      ) : null}

      {incoming && surface === "incoming-minimized" ? (
        <DirectCallIncomingMinimized
          minimizedDockRef={minimizedDockRef}
          isDraggingMinimizedDock={isDraggingMinimizedDock}
          style={minimizedDockInlineStyle}
          incomingDialogAriaLabel={incomingDialogAriaLabel}
          dragAriaLabel={dragAriaLabel}
          onStartDrag={onStartMinimizedDockDrag}
          onMoveDrag={onMoveMinimizedDock}
          onStopDrag={onStopMinimizedDockDrag}
          incomingMinimizedSummaryRef={incomingMinimizedSummaryRef}
          incomingMinimizedAcceptButtonRef={incomingMinimizedAcceptButtonRef}
          incomingCallType={incoming.callType}
          incomingPeerInitials={incomingPeerInitials}
          incomingPeerDisplayName={incomingPeerDisplayName}
          incomingMetaText={incomingMinimizedMetaText}
          openDetailsAriaLabel={openDetailsAriaLabel}
          rejectAriaLabel={rejectAriaLabel}
          acceptAriaLabel={acceptAriaLabel}
          expandAriaLabel={expandAriaLabel}
          onOpenDetails={onOpenIncomingDetails}
          onReject={onReject}
          onAccept={onAccept}
        />
      ) : null}

      {active && surface === "active-minimized" ? (
        <DirectCallActiveMinimized
          minimizedDockRef={minimizedDockRef}
          remoteAudioRef={remoteAudioRef}
          isDraggingMinimizedDock={isDraggingMinimizedDock}
          style={minimizedDockInlineStyle}
          minimizedDialogAriaLabel={minimizedDialogAriaLabel}
          dragAriaLabel={dragAriaLabel}
          onStartDrag={onStartMinimizedDockDrag}
          onMoveDrag={onMoveMinimizedDock}
          onStopDrag={onStopMinimizedDockDrag}
          activeMinimizedSummaryRef={activeMinimizedSummaryRef}
          peerInitials={peerDisplayInitials}
          peerDisplayName={peerDisplayName}
          callStateText={activeCallStateText}
          duration={active.duration}
          durationStartedAtMs={active.durationStartedAtMs}
          openDetailsAriaLabel={openDetailsAriaLabel}
          muted={active.muted}
          muteAriaLabel={muteToggleAriaLabel}
          expandAriaLabel={expandAriaLabel}
          endAriaLabel={endAriaLabel}
          onOpenDetails={onOpenActiveDetails}
          onToggleMute={onToggleMute}
          onHangup={onHangup}
        />
      ) : null}

      {active && surface === "active-fullscreen" ? (
        <DirectCallActiveOverlay
          activeOverlayRef={activeOverlayRef}
          remoteAudioRef={remoteAudioRef}
          remoteCameraProbeRef={remoteCameraProbeRef}
          remoteScreenProbeRef={remoteScreenProbeRef}
          localPreviewShellRef={localPreviewShellRef}
          localScreenPreviewShellRef={localScreenPreviewShellRef}
          localVideoRef={localVideoRef}
          localScreenPreviewRef={localScreenPreviewRef}
          activeHangupButtonRef={activeHangupButtonRef}
          shouldRenderLocalCameraPreview={shouldRenderLocalCameraPreview}
          activeScreenSharing={active.screenSharing}
          isDraggingLocalPreview={isDraggingLocalPreview}
          isResizingLocalPreview={isResizingLocalPreview}
          isDraggingLocalScreenPreview={isDraggingLocalScreenPreview}
          localPreviewStyle={localPreviewStyle}
          localScreenPreviewStyle={localScreenPreviewStyle}
          hasRemoteVisualMedia={hasRemoteVisualMedia}
          remoteScreenStream={remoteScreenStream}
          remoteVideoRef={remoteVideoRef}
          remoteVideoCompanionRef={remoteVideoCompanionRef}
          remoteScreenVideoRef={remoteScreenVideoRef}
          remoteScreenCompanionRef={remoteScreenCompanionRef}
          stageScene={stageScene}
          peerDisplayName={peerDisplayName}
          peerInitials={peerDisplayInitials}
          callStateText={activeCallStateText}
          duration={active.duration}
          durationStartedAtMs={active.durationStartedAtMs}
          cameraStageLabel={cameraStageLabel}
          screenStageLabel={screenStageLabel}
          enterFullscreenLabel={enterFullscreenLabel}
          exitFullscreenLabel={exitFullscreenLabel}
          closeViewerLabel={closeViewerLabel}
          stopWatchingScreenLabel={stopWatchingScreenLabel}
          screenViewerDialogAriaLabel={screenViewerDialogAriaLabel}
          showCameraOnStageLabel={showCameraOnStageLabel}
          showScreenOnStageLabel={showScreenOnStageLabel}
          isSecurityCardOpen={isSecurityCardOpen}
          callSecurityToggleLabel={callSecurityToggleLabel}
          callSecurityStatusLabel={callSecurityStatusLabel}
          callMediaEncryptionModeLabel={callSecurityModeText}
          e2eeActive={active.e2eeActive}
          showTransportModeInfo={showTransportModeInfo}
          transportModeInfoLabel={transportModeInfoLabel}
          mediaEncryptionMode={active.mediaEncryptionMode}
          verificationCode={active.verificationCode}
          verificationHash={active.verificationHash}
          verificationError={active.verificationError}
          canSwitchCamera={active.canSwitchCamera}
          isSwitchingCamera={active.isSwitchingCamera}
          muted={active.muted}
          videoOff={active.videoOff}
          screenSharing={active.screenSharing}
          muteAriaLabel={muteToggleAriaLabel}
          muteLabel={muteToggleLabel}
          cameraAriaLabel={videoToggleAriaLabel}
          cameraLabel={videoToggleLabel}
          switchCameraLabel={switchCameraLabel}
          resizePreviewLabel={resizePreviewLabel}
          screenShareAriaLabel={screenShareToggleAriaLabel}
          screenShareLabel={screenShareToggleLabel}
          endAriaLabel={endAriaLabel}
          endLabel={endLabel}
          youLabel={youLabel}
          screenSharingLabel={screenSharingLabel}
          inProgressAriaLabel={inProgressAriaLabel}
          minimizeAriaLabel={minimizeAriaLabel}
          onMinimize={onActiveMinimize}
          onToggleSecurityCard={onToggleSecurityCard}
          onStartLocalPreviewDrag={onStartLocalPreviewDrag}
          onMoveLocalPreview={onMoveLocalPreview}
          onStopLocalPreviewDrag={onStopLocalPreviewDrag}
          onStartLocalPreviewResize={onStartLocalPreviewResize}
          onMoveLocalPreviewResize={onMoveLocalPreviewResize}
          onStopLocalPreviewResize={onStopLocalPreviewResize}
          onStartLocalScreenPreviewDrag={onStartLocalScreenPreviewDrag}
          onMoveLocalScreenPreview={onMoveLocalScreenPreview}
          onStopLocalScreenPreviewDrag={onStopLocalScreenPreviewDrag}
          onSwitchCamera={onSwitchCamera}
          onToggleMute={onToggleMute}
          onToggleVideo={onToggleVideo}
          onToggleScreenShare={onToggleScreenShare}
          onHangup={onHangup}
          localStream={localStream ?? null}
          cameraSenderRef={cameraSenderRef ?? { current: null }}
        />
      ) : null}
    </>
  );
}
