// @vitest-environment jsdom

import { useRef, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectCallMediaElementBindings } from "@/calls/direct/runtime/media/useDirectCallMediaElementBindings";

function MediaBindingHarness({ screenStream }: { screenStream: MediaStream }) {
  const [showScreenStage, setShowScreenStage] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenPreviewRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoCompanionRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenCompanionRef = useRef<HTMLVideoElement | null>(null);
  const remoteCameraProbeRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenProbeRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenPreviewStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteCameraStreamRef = useRef<MediaStream | null>(null);
  const remoteScreenStreamRef = useRef<MediaStream | null>(screenStream);

  useDirectCallMediaElementBindings({
    activeCallId: "call-1",
    isMinimized: false,
    isVideoCallActive: false,
    hasRenderableRemoteCamera: false,
    hasRenderableRemoteScreen: true,
    remoteVideoReady: false,
    remoteScreenReady: true,
    localVideoRef,
    localScreenPreviewRef,
    remoteVideoRef,
    remoteVideoCompanionRef,
    remoteScreenVideoRef,
    remoteScreenCompanionRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    remoteAudioRef,
    localStreamRef,
    localScreenPreviewStreamRef,
    remoteAudioStreamRef,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    remoteCameraSlotStream: null,
    remoteCameraSlotTrackId: null,
    remoteScreenSlotStream: screenStream,
    remoteScreenSlotTrackId: "screen-track",
    refreshRemoteVideoTracksFromPeer: () => {},
  });

  return (
    <div>
      <button type="button" onClick={() => setShowScreenStage(false)}>
        hide
      </button>
      <button type="button" onClick={() => setShowScreenStage(true)}>
        show
      </button>
      {showScreenStage ? (
        <video ref={remoteScreenVideoRef} data-testid="remote-screen-stage" />
      ) : null}
    </div>
  );
}

describe("useDirectCallMediaElementBindings", () => {
  let container: HTMLDivElement;
  let root: Root;
  let playSpy: { mockRestore: () => void };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      writable: true,
      value: null,
    });
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    playSpy.mockRestore();
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("rebinds the remote screen stream when the stage video element remounts", () => {
    const screenStream = { id: "screen-stream" } as MediaStream;

    act(() => {
      root.render(<MediaBindingHarness screenStream={screenStream} />);
    });

    const initialStageVideo = container.querySelector('[data-testid="remote-screen-stage"]');
    expect(initialStageVideo).not.toBeNull();
    expect(initialStageVideo?.srcObject).toBe(screenStream);

    act(() => {
      const hideButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "hide"
      );
      hideButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[data-testid="remote-screen-stage"]')).toBeNull();

    act(() => {
      const showButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "show"
      );
      showButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const restoredStageVideo = container.querySelector('[data-testid="remote-screen-stage"]');
    expect(restoredStageVideo).not.toBeNull();
    expect(restoredStageVideo?.srcObject).toBe(screenStream);
  });
});
