// @vitest-environment jsdom

import { useRef, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DirectCallStage } from "@/calls/direct/presentation/components/DirectCallStage";
import { useDirectCallStagePresentation } from "@/calls/direct/presentation/useDirectCallStagePresentation";

interface DirectCallStageHarnessProps {
  readonly hasRenderableRemoteCamera: boolean;
  readonly hasRenderableRemoteScreen: boolean;
}

function DirectCallStageHarness({
  hasRenderableRemoteCamera,
  hasRenderableRemoteScreen,
}: DirectCallStageHarnessProps) {
  const scene = useDirectCallStagePresentation({
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
  });
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoCompanionRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenCompanionRef = useRef<HTMLVideoElement | null>(null);

  return (
    <DirectCallStage
      remoteScreenStream={null}
      remoteVideoRef={remoteVideoRef}
      remoteVideoCompanionRef={remoteVideoCompanionRef}
      remoteScreenVideoRef={remoteScreenVideoRef}
      remoteScreenCompanionRef={remoteScreenCompanionRef}
      scene={scene}
      peerDisplayName="Seclettr Peer"
      peerInitials="SP"
      callStateText="Connected"
      cameraStageLabel="Camera"
      screenStageLabel="Screen share"
      enterFullscreenLabel="Fullscreen"
      exitFullscreenLabel="Exit fullscreen"
      closeViewerLabel="Close viewer"
      stopWatchingScreenLabel="Stop watching screen share"
      screenViewerDialogAriaLabel="Screen share viewer"
      showCameraOnStageLabel="Show camera on stage"
      showScreenOnStageLabel="Show screen share on stage"
      peerHasAudio={false}
    />
  );
}

describe("DirectCallStage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("switches focused source when the companion preview is selected", () => {
    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera
          hasRenderableRemoteScreen
        />
      );
    });

    const initialCompanion = container.querySelector('[aria-label="Show camera on stage"]');
    expect(initialCompanion).not.toBeNull();

    act(() => {
      initialCompanion?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[aria-label="Show screen share on stage"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Stop watching screen share"]')).toBeNull();
  });

  it("renders a companion shortcut when screen share is on stage", () => {
    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera
          hasRenderableRemoteScreen
        />
      );
    });

    const shortcutButton = container.querySelector(
      '[aria-label="Show camera on stage"]'
    );
    expect(shortcutButton).not.toBeNull();
  });

  it("suppresses remote screen share locally and lets the user restore it", () => {
    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera={false}
          hasRenderableRemoteScreen
        />
      );
    });

    const stopWatchingButton = container.querySelector('[aria-label="Stop watching screen share"]');
    expect(stopWatchingButton).not.toBeNull();

    act(() => {
      stopWatchingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const restoreButton = container.querySelector(
      '[aria-label="Show screen share on stage"]'
    );
    expect(restoreButton).not.toBeNull();
    expect(container.querySelector('[aria-label="Stop watching screen share"]')).toBeNull();

    act(() => {
      restoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[aria-label="Stop watching screen share"]')).not.toBeNull();
  });

  it("clears local screen suppression when the remote screen share disappears", () => {
    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera={false}
          hasRenderableRemoteScreen
        />
      );
    });

    const stopWatchingButton = container.querySelector('[aria-label="Stop watching screen share"]');
    expect(stopWatchingButton).not.toBeNull();

    act(() => {
      stopWatchingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[aria-label="Show screen share on stage"]')).not.toBeNull();

    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera={false}
          hasRenderableRemoteScreen={false}
        />
      );
    });

    expect(container.querySelector('[aria-label="Show screen share on stage"]')).toBeNull();

    act(() => {
      root.render(
        <DirectCallStageHarness
          hasRenderableRemoteCamera={false}
          hasRenderableRemoteScreen
        />
      );
    });

    expect(container.querySelector('[aria-label="Stop watching screen share"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Show screen share on stage"]')).toBeNull();
  });
});
