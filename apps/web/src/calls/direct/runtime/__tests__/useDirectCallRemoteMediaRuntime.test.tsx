// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectCallRemoteMediaRuntime } from "@/calls/direct/runtime/useDirectCallRemoteMediaRuntime";
import type { LastIncomingMediaState } from "@/calls/direct/model/call-media-state";

type RemoteMediaRuntimeApi = ReturnType<typeof useDirectCallRemoteMediaRuntime>;

function createFakeVideoStream(trackId: string): MediaStream {
  const tracks = [{ id: trackId }] as Array<Pick<MediaStreamTrack, "id">>;
  return {
    getVideoTracks: () => tracks as MediaStreamTrack[],
    removeTrack: (track: MediaStreamTrack) => {
      const index = tracks.findIndex((candidate) => candidate.id === track.id);
      if (index >= 0) {
        tracks.splice(index, 1);
      }
    },
  } as unknown as MediaStream;
}

function HookHarness(props: {
  activeCallId: string | null;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  lastIncomingMediaStateRef: MutableRefObject<Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  capture: (runtime: RemoteMediaRuntimeApi) => void;
}) {
  const runtime = useDirectCallRemoteMediaRuntime({
    activeCallId: props.activeCallId,
    peerConnectionRef: props.peerConnectionRef,
    cameraTransceiverRef: props.cameraTransceiverRef,
    screenShareTransceiverRef: props.screenShareTransceiverRef,
    lastIncomingMediaStateRef: props.lastIncomingMediaStateRef,
    debugCallMedia: props.debugCallMedia,
  });

  props.capture(runtime);
  return null;
}

describe("useDirectCallRemoteMediaRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: RemoteMediaRuntimeApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("commits and clears a remote camera slot through its own lifecycle contract", async () => {
    const peerConnectionRef = {
      current: null,
    } as MutableRefObject<RTCPeerConnection | null>;
    const cameraTransceiverRef = {
      current: null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const screenShareTransceiverRef = {
      current: null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const lastIncomingMediaStateRef = {
      current: {
        camera: null,
        screen: null,
        mic: null,
      },
    } as MutableRefObject<Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>>;

    act(() => {
      root.render(
        <HookHarness
          activeCallId="call-1"
          peerConnectionRef={peerConnectionRef}
          cameraTransceiverRef={cameraTransceiverRef}
          screenShareTransceiverRef={screenShareTransceiverRef}
          lastIncomingMediaStateRef={lastIncomingMediaStateRef}
          debugCallMedia={() => undefined}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected remote media runtime");
    }

    const stream = createFakeVideoStream("track-1");
    act(() => {
      runtime?.commitRemoteMediaSlot("camera", {
        source: "camera",
        trackId: "track-1",
        stream,
        status: "live",
        lastFrameAt: 0,
        lastPacketAt: 0,
        mid: "0",
        signaledActivity: "active",
      });
    });

    expect(runtime?.remoteCameraSlot.trackId).toBe("track-1");
    expect(runtime?.remoteCameraSlot.status).toBe("live");
    expect(runtime?.remoteCameraSlot.stream).toBe(stream);

    act(() => {
      runtime?.clearRemoteMediaSlot("camera", "inactive", "track-1");
    });

    expect(runtime?.remoteCameraSlot.trackId).toBeNull();
    expect(runtime?.remoteCameraSlot.status).toBe("inactive");
  });

  it("keeps the teardown callback stable across rerenders", async () => {
    const peerConnectionRef = {
      current: null,
    } as MutableRefObject<RTCPeerConnection | null>;
    const cameraTransceiverRef = {
      current: null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const screenShareTransceiverRef = {
      current: null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const lastIncomingMediaStateRef = {
      current: {
        camera: null,
        screen: null,
        mic: null,
      },
    } as MutableRefObject<Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>>;
    const debugCallMedia = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeCallId={null}
          peerConnectionRef={peerConnectionRef}
          cameraTransceiverRef={cameraTransceiverRef}
          screenShareTransceiverRef={screenShareTransceiverRef}
          lastIncomingMediaStateRef={lastIncomingMediaStateRef}
          debugCallMedia={debugCallMedia}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected remote media runtime");
    }

    const firstReset = runtime.resetRemoteMediaRuntime;

    act(() => {
      root.render(
        <HookHarness
          activeCallId="call-2"
          peerConnectionRef={peerConnectionRef}
          cameraTransceiverRef={cameraTransceiverRef}
          screenShareTransceiverRef={screenShareTransceiverRef}
          lastIncomingMediaStateRef={lastIncomingMediaStateRef}
          debugCallMedia={debugCallMedia}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    expect(runtime?.resetRemoteMediaRuntime).toBe(firstReset);
  });
});
