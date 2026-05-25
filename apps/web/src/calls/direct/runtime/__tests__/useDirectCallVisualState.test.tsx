// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyRemoteMediaSlot,
  type RemoteMediaSlot,
} from "@/calls/direct/model/call-media-slots";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallVisualState } from "@/calls/direct/runtime/media/useDirectCallVisualState";

type VisualStateSummaryApi = ReturnType<typeof useDirectCallVisualState>;

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "audio",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: true,
    screenSharing: false,
    duration: 0,
    signalingVerified: true,
    e2eeActive: false,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

function createVideoTrack(overrides?: Partial<Pick<MediaStreamTrack, "readyState" | "enabled" | "muted">>) {
  return {
    kind: "video",
    readyState: overrides?.readyState ?? "live",
    enabled: overrides?.enabled ?? true,
    muted: overrides?.muted ?? false,
  } as MediaStreamTrack;
}

function createVideoStream(track: MediaStreamTrack | null): MediaStream | null {
  if (!track) {
    return null;
  }
  return {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function createRenderableRemoteSlot(source: "camera" | "screen", trackId: string): RemoteMediaSlot {
  return {
    source,
    trackId,
    stream: createVideoStream(createVideoTrack()),
    status: "live",
    lastFrameAt: 0,
    lastPacketAt: 0,
    mid: source === "camera" ? "0" : "1",
    signaledActivity: "active",
  };
}

function HookHarness(props: {
  active: ActiveCall | null;
  localStream: MediaStream | null;
  remoteCameraSlot: RemoteMediaSlot;
  remoteScreenSlot: RemoteMediaSlot;
  localSupportedMediaEncryptionModes: Array<"transport" | "frame-v1">;
  capture: (api: VisualStateSummaryApi) => void;
}) {
  const api = useDirectCallVisualState({
    active: props.active,
    localStream: props.localStream,
    remoteCameraSlot: props.remoteCameraSlot,
    remoteScreenSlot: props.remoteScreenSlot,
    localSupportedMediaEncryptionModes: props.localSupportedMediaEncryptionModes,
  });
  props.capture(api);
  return null;
}

describe("useDirectCallVisualState", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: VisualStateSummaryApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderSummary(props?: Partial<React.ComponentProps<typeof HookHarness>>) {
    act(() => {
      root.render(
        <HookHarness
          active={props?.active ?? createActiveCall()}
          localStream={props?.localStream ?? null}
          remoteCameraSlot={props?.remoteCameraSlot ?? createEmptyRemoteMediaSlot("camera")}
          remoteScreenSlot={props?.remoteScreenSlot ?? createEmptyRemoteMediaSlot("screen")}
          localSupportedMediaEncryptionModes={props?.localSupportedMediaEncryptionModes ?? ["transport"]}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    if (!api) {
      throw new Error("Expected visual state summary");
    }

    return api;
  }

  it("reports audio-only state without any visual media", () => {
    const summary = renderSummary();

    expect(summary.hasLiveLocalCameraTrack).toBe(false);
    expect(summary.hasRenderableRemoteCamera).toBe(false);
    expect(summary.hasRenderableRemoteScreen).toBe(false);
    expect(summary.hasRemoteVisualMedia).toBe(false);
    expect(summary.isVideoCallActive).toBe(false);
    expect(summary.hasAnyVisualMedia).toBe(false);
    expect(summary.shouldRenderLocalCameraPreview).toBe(false);
    expect(summary.localSupportsFrameEncryption).toBe(false);
  });

  it("reports local camera preview and frame-encryption support when camera is active", () => {
    const summary = renderSummary({
      active: createActiveCall({
        callType: "video",
        videoOff: false,
      }),
      localStream: createVideoStream(createVideoTrack()),
      localSupportedMediaEncryptionModes: ["transport", "frame-v1"],
    });

    expect(summary.hasLiveLocalCameraTrack).toBe(true);
    expect(summary.isVideoCallActive).toBe(true);
    expect(summary.hasAnyVisualMedia).toBe(true);
    expect(summary.shouldRenderLocalCameraPreview).toBe(true);
    expect(summary.localSupportsFrameEncryption).toBe(true);
  });

  it("reports a renderable remote camera as visual media", () => {
    const summary = renderSummary({
      remoteCameraSlot: createRenderableRemoteSlot("camera", "remote-camera-1"),
    });

    expect(summary.hasRenderableRemoteCamera).toBe(true);
    expect(summary.hasRenderableRemoteScreen).toBe(false);
    expect(summary.hasRemoteVisualMedia).toBe(true);
    expect(summary.hasAnyVisualMedia).toBe(true);
  });

  it("reports remote screen-share as active visual media", () => {
    const summary = renderSummary({
      active: createActiveCall({
        screenSharing: true,
      }),
      remoteScreenSlot: createRenderableRemoteSlot("screen", "remote-screen-1"),
    });

    expect(summary.hasRenderableRemoteScreen).toBe(true);
    expect(summary.hasRemoteVisualMedia).toBe(true);
    expect(summary.isVideoCallActive).toBe(true);
    expect(summary.hasAnyVisualMedia).toBe(true);
  });
});
