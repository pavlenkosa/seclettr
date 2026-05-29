// @vitest-environment jsdom

import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallSurfaceRenderer } from "@/calls/direct/presentation/components/DirectCallSurfaceRenderer";
import { resolveDirectCallStageLayout } from "@/calls/direct/model/direct-call-stage-layout";
import type { DirectCallStageSceneState } from "@/calls/direct/presentation/useDirectCallStagePresentation";

const noop = () => {};
const noopPointer = noop as unknown as React.PointerEventHandler<HTMLElement>;

function makeRef<T>(): RefObject<T> {
  return { current: null };
}

function makeFakeStageScene(): DirectCallStageSceneState {
  return {
    stageLayout: resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: false,
      hasRenderableRemoteScreen: false,
      preferredSource: null,
    }),
    isScreenViewerOpen: false,
    canOpenScreenViewer: false,
    canStopWatchingScreen: false,
    canRestoreScreenShare: false,
    selectSource: noop,
    openScreenViewer: noop,
    closeScreenViewer: noop,
    stopWatchingScreen: noop,
    restoreScreenShare: noop,
  };
}

function makeBaseProps(surface: React.ComponentProps<typeof DirectCallSurfaceRenderer>["surface"]) {
  return {
    notice: null,
    surface,
    incoming: null,
    active: null,
    incomingOverlayRef: makeRef<HTMLDivElement>(),
    incomingAcceptButtonRef: makeRef<HTMLButtonElement>(),
    minimizedDockRef: makeRef<HTMLDialogElement>(),
    incomingMinimizedSummaryRef: makeRef<HTMLButtonElement>(),
    incomingMinimizedAcceptButtonRef: makeRef<HTMLButtonElement>(),
    activeMinimizedSummaryRef: makeRef<HTMLButtonElement>(),
    remoteAudioRef: makeRef<HTMLAudioElement>(),
    activeOverlayRef: makeRef<HTMLDialogElement>(),
    remoteCameraProbeRef: makeRef<HTMLVideoElement>(),
    remoteScreenProbeRef: makeRef<HTMLVideoElement>(),
    localPreviewShellRef: makeRef<HTMLDivElement>(),
    localScreenPreviewShellRef: makeRef<HTMLDivElement>(),
    localVideoRef: makeRef<HTMLVideoElement>(),
    localScreenPreviewRef: makeRef<HTMLVideoElement>(),
    activeHangupButtonRef: makeRef<HTMLButtonElement>(),
    isDraggingMinimizedDock: false,
    isDraggingLocalPreview: false,
    isResizingLocalPreview: false,
    isDraggingLocalScreenPreview: false,
    shouldRenderLocalCameraPreview: false,
    hasRemoteVisualMedia: false,
    remoteScreenStream: null,
    remoteVideoRef: makeRef<HTMLVideoElement>(),
    remoteVideoCompanionRef: makeRef<HTMLVideoElement>(),
    remoteScreenVideoRef: makeRef<HTMLVideoElement>(),
    remoteScreenCompanionRef: makeRef<HTMLVideoElement>(),
    stageScene: makeFakeStageScene(),
    incomingPeerInitials: "SP",
    incomingPeerDisplayName: "Seclettr Peer",
    incomingMinimizedMetaText: "Incoming call",
    peerDisplayInitials: "SP",
    peerDisplayName: "Seclettr Peer",
    activeCallStateText: "Connected",
    cameraStageLabel: "Camera",
    screenStageLabel: "Screen share",
    enterFullscreenLabel: "Enter fullscreen",
    exitFullscreenLabel: "Exit fullscreen",
    closeViewerLabel: "Close viewer",
    stopWatchingScreenLabel: "Stop watching",
    screenViewerDialogAriaLabel: "Screen share viewer",
    showCameraOnStageLabel: "Show camera",
    showScreenOnStageLabel: "Show screen",
    isSecurityCardOpen: false,
    callSecurityToggleLabel: "Security",
    callSecurityStatusLabel: "Encrypted",
    muteToggleAriaLabel: "Toggle mute",
    muteToggleLabel: "Mute",
    videoToggleAriaLabel: "Toggle camera",
    videoToggleLabel: "Camera",
    switchCameraLabel: "Switch camera",
    resizePreviewLabel: "Resize",
    screenShareToggleAriaLabel: "Toggle screen share",
    screenShareToggleLabel: "Screen share",
    ringingLabel: "Ringing…",
    incomingDialogAriaLabel: "Incoming call",
    minimizeAriaLabel: "Minimize",
    videoCallLabel: "Video call",
    voiceCallLabel: "Voice call",
    rejectAriaLabel: "Reject",
    acceptAriaLabel: "Accept",
    dragAriaLabel: "Drag",
    openDetailsAriaLabel: "Open details",
    expandAriaLabel: "Expand",
    minimizedDialogAriaLabel: "Minimized call",
    endAriaLabel: "End call",
    endLabel: "End",
    youLabel: "You",
    screenSharingLabel: "Screen sharing",
    inProgressAriaLabel: "Call in progress",
    onIncomingMinimize: noop,
    onReject: noop,
    onAccept: noop,
    onStartMinimizedDockDrag: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onMoveMinimizedDock: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onStopMinimizedDockDrag: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onOpenIncomingDetails: noop,
    onOpenActiveDetails: noop,
    onToggleMute: noop,
    onHangup: noop,
    onActiveMinimize: noop,
    onToggleSecurityCard: noop,
    onStartLocalPreviewDrag: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onMoveLocalPreview: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onStopLocalPreviewDrag: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onStartLocalPreviewResize: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onMoveLocalPreviewResize: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onStopLocalPreviewResize: noopPointer as React.PointerEventHandler<HTMLButtonElement>,
    onStartLocalScreenPreviewDrag: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onMoveLocalScreenPreview: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onStopLocalScreenPreviewDrag: noopPointer as React.PointerEventHandler<HTMLDivElement>,
    onSwitchCamera: noop,
    onToggleVideo: noop,
    onToggleScreenShare: noop,
    selectedScreenResolution: "720p" as const,
    onSelectScreenResolution: noop,
    localStream: null,
    cameraSenderRef: makeRef<RTCRtpSender>(),
    peerConnectionRef: makeRef<RTCPeerConnection>(),
  };
}

describe("DirectCallSurfaceRenderer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders nothing when surface is hidden and there is no notice", () => {
    act(() => {
      root.render(<DirectCallSurfaceRenderer {...makeBaseProps("hidden")} />);
    });

    expect(container.innerHTML).toBe("");
  });

  it("renders a notice when surface is hidden but notice is provided", () => {
    act(() => {
      root.render(
        <DirectCallSurfaceRenderer
          {...makeBaseProps("hidden")}
          notice={{ kind: "error", message: "Connection lost" }}
        />
      );
    });

    expect(container.textContent).toContain("Connection lost");
  });

  it("renders the incoming fullscreen overlay with peer name", () => {
    act(() => {
      root.render(
        <DirectCallSurfaceRenderer
          {...makeBaseProps("incoming-fullscreen")}
          incoming={{ callType: "audio" }}
          incomingPeerDisplayName="Alice"
        />
      );
    });

    const overlay = container.querySelector('[role="alertdialog"]');
    expect(overlay).not.toBeNull();
    expect(container.textContent).toContain("Alice");
  });

  it("renders the incoming minimized dock with peer name", () => {
    act(() => {
      root.render(
        <DirectCallSurfaceRenderer
          {...makeBaseProps("incoming-minimized")}
          incoming={{ callType: "video" }}
          incomingPeerDisplayName="Bob"
        />
      );
    });

    const dock = container.querySelector('dialog[aria-label="Incoming call"]');
    expect(dock).not.toBeNull();
    expect(container.textContent).toContain("Bob");
  });

  it("renders an info notice above the surface content", () => {
    act(() => {
      root.render(
        <DirectCallSurfaceRenderer
          {...makeBaseProps("incoming-fullscreen")}
          incoming={{ callType: "audio" }}
          notice={{ kind: "info", message: "Poor connection" }}
        />
      );
    });

    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(container.textContent).toContain("Poor connection");
  });
});
