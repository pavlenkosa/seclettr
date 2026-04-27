import {
  useMemo,
  type CSSProperties,
  type PointerEventHandler,
  type RefObject,
} from "react";
import type { CallSecurityMode } from "@/ui-settings";
import { buildDirectCallPresentationState } from "@/calls/direct/model/direct-call-presentation";
import { useDirectCallStagePresentation } from "@/calls/direct/presentation/useDirectCallStagePresentation";
import type {
  ActiveCall,
  CallNotice,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";

type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;

interface UseDirectCallPresentationBindingsOptions {
  active: ActiveCall | null;
  incoming: IncomingCall | null;
  notice: CallNotice | null;
  isMinimized: boolean;
  isSecurityCardOpen: boolean;
  localSupportsFrameEncryption: boolean;
  callSecurityMode: CallSecurityMode;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
  t: Translate;
  incomingOverlayRef: RefObject<HTMLDivElement>;
  activeOverlayRef: RefObject<HTMLDialogElement>;
  minimizedDockRef: RefObject<HTMLDialogElement>;
  incomingAcceptButtonRef: RefObject<HTMLButtonElement>;
  activeHangupButtonRef: RefObject<HTMLButtonElement>;
  incomingMinimizedAcceptButtonRef: RefObject<HTMLButtonElement>;
  incomingMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  activeMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  remoteAudioRef: RefObject<HTMLAudioElement>;
  remoteCameraProbeRef: RefObject<HTMLVideoElement>;
  remoteScreenProbeRef: RefObject<HTMLVideoElement>;
  localPreviewShellRef: RefObject<HTMLDivElement>;
  localScreenPreviewShellRef: RefObject<HTMLDivElement>;
  localVideoRef: RefObject<HTMLVideoElement>;
  localScreenPreviewRef: RefObject<HTMLVideoElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
  remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  isDraggingMinimizedDock: boolean;
  minimizedDockInlineStyle?: CSSProperties;
  isDraggingLocalPreview: boolean;
  isResizingLocalPreview: boolean;
  isDraggingLocalScreenPreview: boolean;
  localPreviewStyle?: CSSProperties;
  localScreenPreviewStyle?: CSSProperties;
  shouldRenderLocalCameraPreview: boolean;
  hasRemoteVisualMedia: boolean;
  hasRenderableRemoteCamera: boolean;
  hasRenderableRemoteScreen: boolean;
  remoteScreenStream: MediaStream | null;
  onExpandMinimized: () => void;
  onHangup: () => void;
  onReject: () => void;
  onIncomingMinimize: () => void;
  onAccept: () => void | Promise<void>;
  onStartMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  onMoveMinimizedDock: PointerEventHandler<HTMLButtonElement>;
  onStopMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  onOpenIncomingDetails: () => void;
  onOpenActiveDetails: () => void;
  onToggleMute: () => void;
  onActiveMinimize: () => void;
  onToggleSecurityCard: () => void;
  onStartLocalPreviewDrag: PointerEventHandler<HTMLDivElement>;
  onMoveLocalPreview: PointerEventHandler<HTMLDivElement>;
  onStopLocalPreviewDrag: PointerEventHandler<HTMLDivElement>;
  onStartLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  onMoveLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  onStopLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  onStartLocalScreenPreviewDrag: PointerEventHandler<HTMLDivElement>;
  onMoveLocalScreenPreview: PointerEventHandler<HTMLDivElement>;
  onStopLocalScreenPreviewDrag: PointerEventHandler<HTMLDivElement>;
  onToggleVideo: () => void | Promise<void>;
  canSwitchCamera: boolean;
  isSwitchingCamera: boolean;
  onSwitchCamera: () => void | Promise<void>;
  onToggleScreenShare: () => void | Promise<void>;
}

export function useDirectCallPresentationBindings({
  active,
  incoming,
  notice,
  isMinimized,
  isSecurityCardOpen,
  localSupportsFrameEncryption,
  callSecurityMode,
  resolvePeerLabel,
  t,
  incomingOverlayRef,
  activeOverlayRef,
  minimizedDockRef,
  incomingAcceptButtonRef,
  activeHangupButtonRef,
  incomingMinimizedAcceptButtonRef,
  incomingMinimizedSummaryRef,
  activeMinimizedSummaryRef,
  remoteAudioRef,
  remoteCameraProbeRef,
  remoteScreenProbeRef,
  localPreviewShellRef,
  localScreenPreviewShellRef,
  localVideoRef,
  localScreenPreviewRef,
  remoteVideoRef,
  remoteVideoCompanionRef,
  remoteScreenVideoRef,
  remoteScreenCompanionRef,
  isDraggingMinimizedDock,
  minimizedDockInlineStyle,
  isDraggingLocalPreview,
  isResizingLocalPreview,
  isDraggingLocalScreenPreview,
  localPreviewStyle,
  localScreenPreviewStyle,
  shouldRenderLocalCameraPreview,
  hasRemoteVisualMedia,
  hasRenderableRemoteCamera,
  hasRenderableRemoteScreen,
  remoteScreenStream,
  onExpandMinimized,
  onHangup,
  onReject,
  onIncomingMinimize,
  onAccept,
  onStartMinimizedDockDrag,
  onMoveMinimizedDock,
  onStopMinimizedDockDrag,
  onOpenIncomingDetails,
  onOpenActiveDetails,
  onToggleMute,
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
  canSwitchCamera,
  isSwitchingCamera,
  onSwitchCamera,
  onToggleVideo,
  onToggleScreenShare,
}: UseDirectCallPresentationBindingsOptions) {
  const stageScene = useDirectCallStagePresentation({
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
  });

  const presentation = useMemo(() => buildDirectCallPresentationState({
    active,
    incoming,
    isMinimized,
    isSecurityCardOpen,
    localSupportsFrameEncryption,
    callSecurityMode,
    t,
    resolvePeerLabel,
  }), [
    active,
    incoming,
    isMinimized,
    isSecurityCardOpen,
    localSupportsFrameEncryption,
    callSecurityMode,
    t,
    resolvePeerLabel,
  ]);

  const {
    surface,
    peerDisplayName,
    peerDisplayInitials,
    incomingPeerDisplayName,
    incomingPeerInitials,
    incomingPromptText,
    incomingMinimizedMetaText,
    callSecurityStatusLabel,
    callMediaEncryptionModeLabel,
    showTransportModeInfo,
    callSecurityToggleLabel,
    activeCallStateText,
    muteToggleAriaLabel,
    muteToggleLabel,
    videoToggleAriaLabel,
    videoToggleLabel,
    switchCameraLabel,
    screenShareToggleAriaLabel,
    screenShareToggleLabel,
  } = presentation;

  const focusTrapProps = {
    surface,
    incomingOverlayRef,
    activeOverlayRef,
    minimizedDockRef,
    incomingAcceptButtonRef,
    activeHangupButtonRef,
    incomingMinimizedAcceptButtonRef,
    incomingMinimizedSummaryRef,
    activeMinimizedSummaryRef,
    onExpandMinimized,
    onHangup,
    onReject,
    isActiveStageViewerOpen: stageScene.isScreenViewerOpen,
  };

  const surfaceRendererProps = {
    notice,
    surface,
    incoming: incoming ? { callType: incoming.callType } : null,
    active: active ? {
      muted: active.muted,
      videoOff: active.videoOff,
      screenSharing: active.screenSharing,
      duration: active.duration,
      durationStartedAtMs: active.durationStartedAtMs ?? null,
      canSwitchCamera,
      isSwitchingCamera,
      e2eeActive: active.e2eeActive,
      mediaEncryptionMode: active.mediaEncryptionMode,
      verificationCode: active.verificationCode,
      verificationHash: active.verificationHash,
      verificationError: active.verificationError,
    } : null,
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
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    remoteVideoRef,
    remoteVideoCompanionRef,
    remoteScreenVideoRef,
    remoteScreenCompanionRef,
    remoteScreenStream,
    stageScene,
    incomingPeerInitials,
    incomingPeerDisplayName,
    incomingPromptText,
    incomingMinimizedMetaText,
    peerDisplayInitials,
    peerDisplayName,
    activeCallStateText,
    cameraStageLabel: t("call.stage.camera"),
    screenStageLabel: t("call.stage.screen"),
    enterFullscreenLabel: t("call.stage.enterFullscreen"),
    exitFullscreenLabel: t("call.stage.exitFullscreen"),
    closeViewerLabel: t("call.stage.closeViewer"),
    stopWatchingScreenLabel: t("call.stage.stopWatchingScreen"),
    screenViewerDialogAriaLabel: t("call.stage.screenViewerDialogAria"),
    showCameraOnStageLabel: t("call.stage.showCamera"),
    showScreenOnStageLabel: t("call.stage.showScreen"),
    isSecurityCardOpen,
    callSecurityToggleLabel,
    callSecurityStatusLabel,
    callSecurityModeText: callMediaEncryptionModeLabel,
    showTransportModeInfo,
    transportModeInfoLabel: t("callSecurity.transportPeerUnsupported"),
    muteToggleAriaLabel,
    muteToggleLabel,
    videoToggleAriaLabel,
    videoToggleLabel,
    switchCameraLabel,
    resizePreviewLabel: t("call.resizePreviewLabel"),
    screenShareToggleAriaLabel,
    screenShareToggleLabel,
    ringingLabel: t("call.state.ringing"),
    incomingDialogAriaLabel: t("call.incomingDialogAria"),
    minimizeAriaLabel: t("call.minimizeAria"),
    videoCallLabel: t("call.videoCall"),
    voiceCallLabel: t("call.voiceCall"),
    rejectAriaLabel: t("call.rejectAria"),
    acceptAriaLabel: t("call.acceptAria"),
    dragAriaLabel: t("call.dragAria"),
    openDetailsAriaLabel: t("call.openDetailsAria"),
    expandAriaLabel: t("call.expandAria"),
    minimizedDialogAriaLabel: t("call.minimizedDialogAria"),
    endAriaLabel: t("call.endAria"),
    endLabel: t("call.endLabel"),
    youLabel: t("call.you"),
    screenSharingLabel: t("call.screenSharing"),
    inProgressAriaLabel: t("call.inProgressAria"),
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
  };

  return {
    surface,
    focusTrapProps,
    surfaceRendererProps,
  };
}
