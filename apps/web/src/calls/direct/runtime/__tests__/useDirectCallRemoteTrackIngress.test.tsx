// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LastIncomingMediaState } from "@/calls/direct/model/call-media-state";
import { useDirectCallRemoteMediaState } from "@/calls/direct/runtime/media/useDirectCallRemoteMediaState";
import { useDirectCallRemoteTrackIngress } from "@/calls/direct/runtime/media/useDirectCallRemoteTrackIngress";

type RemoteMediaStateApi = ReturnType<typeof useDirectCallRemoteMediaState>;
type RemoteTrackIngressApi = ReturnType<typeof useDirectCallRemoteTrackIngress>;
type RemoteTrackIngressHarnessApi = RemoteMediaStateApi & RemoteTrackIngressApi;

class FakeMediaStream {
  private tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack) {
    if (!this.tracks.some((candidate) => candidate.id === track.id)) {
      this.tracks.push(track);
    }
  }

  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter((candidate) => candidate.id !== track.id);
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

function createFakeVideoTrack(
  trackId: string,
  overrides?: Partial<Pick<MediaStreamTrack, "muted" | "readyState" | "enabled">>
): MediaStreamTrack {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    id: trackId,
    kind: "video",
    muted: overrides?.muted ?? false,
    readyState: overrides?.readyState ?? "live",
    enabled: overrides?.enabled ?? true,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const normalized = typeof listener === "function"
        ? listener
        : listener.handleEvent.bind(listener);
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(normalized);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const normalized = typeof listener === "function"
        ? listener
        : listener.handleEvent.bind(listener);
      listeners.get(type)?.delete(normalized);
    },
  } as unknown as MediaStreamTrack;
}

function createVideoTransceiver(mid: string): RTCRtpTransceiver {
  return {
    mid,
    receiver: { track: { kind: "video" } } as RTCRtpReceiver,
    sender: { track: null } as RTCRtpSender,
  } as unknown as RTCRtpTransceiver;
}

function HookHarness(props: {
  activeCallId: string | null;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  lastIncomingMediaStateRef: MutableRefObject<Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  capture: (api: RemoteTrackIngressHarnessApi) => void;
}) {
  const state = useDirectCallRemoteMediaState({
    activeCallId: props.activeCallId,
    debugCallMedia: props.debugCallMedia,
  });
  const ingress = useDirectCallRemoteTrackIngress({
    peerConnectionRef: props.peerConnectionRef,
    cameraTransceiverRef: props.cameraTransceiverRef,
    screenShareTransceiverRef: props.screenShareTransceiverRef,
    lastIncomingMediaStateRef: props.lastIncomingMediaStateRef,
    debugCallMedia: props.debugCallMedia,
    ...state,
  });

  props.capture({
    ...state,
    ...ingress,
  });
  return null;
}

describe("useDirectCallRemoteTrackIngress", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: RemoteTrackIngressHarnessApi | null;
  const originalMediaStream = globalThis.MediaStream;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    vi.stubGlobal("MediaStream", FakeMediaStream as unknown as typeof MediaStream);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    globalThis.MediaStream = originalMediaStream;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderHook(options?: {
    peerConnection?: RTCPeerConnection | null;
    cameraTransceiver?: RTCRtpTransceiver | null;
    screenTransceiver?: RTCRtpTransceiver | null;
    lastIncomingMediaState?: Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>;
  }): void {
    const peerConnectionRef = {
      current: options?.peerConnection ?? null,
    } as MutableRefObject<RTCPeerConnection | null>;
    const cameraTransceiverRef = {
      current: options?.cameraTransceiver ?? null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const screenShareTransceiverRef = {
      current: options?.screenTransceiver ?? null,
    } as MutableRefObject<RTCRtpTransceiver | null>;
    const lastIncomingMediaStateRef = {
      current: options?.lastIncomingMediaState ?? {
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
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    if (!api) {
      throw new Error("Expected remote track ingress api");
    }

  }

  it("ingests a live receiver track into the resolved camera slot", () => {
    const cameraTransceiver = createVideoTransceiver("0");
    renderHook({
      peerConnection: {
        getTransceivers: () => [cameraTransceiver],
      } as unknown as RTCPeerConnection,
      cameraTransceiver,
    });
    const track = createFakeVideoTrack("camera-track-1");
    const receiver = { track } as RTCRtpReceiver;

    act(() => {
      api?.ingestRemoteVideoTrack({
        callId: "call-1",
        receiver,
        transceiver: cameraTransceiver,
      });
    });

    expect(api?.remoteCameraSlot.trackId).toBe("camera-track-1");
    expect(api?.remoteCameraSlot.status).toBe("live");
    expect(api?.remoteCameraSlot.stream?.getVideoTracks().map((candidate) => candidate.id)).toEqual(["camera-track-1"]);
    expect(api?.remoteScreenSlot.trackId).toBeNull();
  });

  it("reassigns the same live track between camera and screen slots without losing the stream", () => {
    const cameraTransceiver = createVideoTransceiver("0");
    const screenTransceiver = createVideoTransceiver("1");
    renderHook({
      peerConnection: {
        getTransceivers: () => [cameraTransceiver, screenTransceiver],
      } as unknown as RTCPeerConnection,
      cameraTransceiver,
      screenTransceiver,
    });
    const track = createFakeVideoTrack("shared-video-track");
    const receiver = { track } as RTCRtpReceiver;

    act(() => {
      api?.ingestRemoteVideoTrack({
        callId: "call-1",
        receiver,
        transceiver: cameraTransceiver,
      });
    });

    const originalStream = api?.remoteCameraSlot.stream;

    act(() => {
      api?.ingestRemoteVideoTrack({
        callId: "call-1",
        receiver,
        transceiver: screenTransceiver,
      });
    });

    expect(api?.remoteCameraSlot.trackId).toBeNull();
    expect(api?.remoteCameraSlot.status).toBe("inactive");
    expect(api?.remoteScreenSlot.trackId).toBe("shared-video-track");
    expect(api?.remoteScreenSlot.stream).toBe(originalStream);
    expect(api?.remoteScreenSlot.stream?.getVideoTracks().map((candidate) => candidate.id)).toEqual(["shared-video-track"]);
  });

  it("respects signaled mid-based slot resolution when transceiver identity is not pre-bound", () => {
    const transceiver = createVideoTransceiver("7");
    renderHook({
      peerConnection: {
        getTransceivers: () => [transceiver],
      } as unknown as RTCPeerConnection,
      lastIncomingMediaState: {
        camera: null,
        screen: {
          seq: 1,
          streamRevision: 1,
          state: "on",
          activity: "active",
          reason: null,
          mid: "7",
        },
        mic: null,
      },
    });
    const track = createFakeVideoTrack("screen-track-1");
    const receiver = { track } as RTCRtpReceiver;

    act(() => {
      api?.ingestRemoteVideoTrack({
        callId: "call-1",
        receiver,
        transceiver,
      });
    });

    expect(api?.remoteScreenSlot.trackId).toBe("screen-track-1");
    expect(api?.remoteCameraSlot.trackId).toBeNull();
    expect(api?.remoteReceiverSlotBindingsRef.current.get("7")).toBe("screen");
  });
});
