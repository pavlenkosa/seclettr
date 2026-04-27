// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IncomingMediaStateHint,
  LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import { useDirectCallRemoteMediaHints } from "@/calls/direct/runtime/useDirectCallRemoteMediaHints";
import { useDirectCallRemoteMediaState } from "@/calls/direct/runtime/useDirectCallRemoteMediaState";
import { useDirectCallRemoteTrackIngress } from "@/calls/direct/runtime/useDirectCallRemoteTrackIngress";

type RemoteMediaStateApi = ReturnType<typeof useDirectCallRemoteMediaState>;
type RemoteTrackIngressApi = ReturnType<typeof useDirectCallRemoteTrackIngress>;
type RemoteMediaHintsApi = ReturnType<typeof useDirectCallRemoteMediaHints>;
type RemoteMediaHintsHarnessApi = RemoteMediaStateApi & RemoteTrackIngressApi & RemoteMediaHintsApi;

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

function createFakeVideoTrack(trackId: string): MediaStreamTrack {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    id: trackId,
    kind: "video",
    enabled: true,
    muted: false,
    readyState: "live",
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

function HookHarness(props: {
  lastIncomingMediaStateRef: MutableRefObject<Record<"camera" | "screen" | "mic", LastIncomingMediaState | null>>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  capture: (api: RemoteMediaHintsHarnessApi) => void;
}) {
  const state = useDirectCallRemoteMediaState({
    activeCallId: "call-1",
    debugCallMedia: props.debugCallMedia,
  });
  const trackIngress = useDirectCallRemoteTrackIngress({
    peerConnectionRef: { current: null },
    cameraTransceiverRef: { current: null },
    screenShareTransceiverRef: { current: null },
    lastIncomingMediaStateRef: props.lastIncomingMediaStateRef,
    debugCallMedia: props.debugCallMedia,
    ...state,
  });
  const hints = useDirectCallRemoteMediaHints({
    debugCallMedia: props.debugCallMedia,
    remoteCameraSlotRef: state.remoteCameraSlotRef,
    remoteScreenSlotRef: state.remoteScreenSlotRef,
    updateRemoteMediaSlot: state.updateRemoteMediaSlot,
    clearRemoteMediaSlot: trackIngress.clearRemoteMediaSlot,
  });

  props.capture({
    ...state,
    ...trackIngress,
    ...hints,
  });
  return null;
}

describe("useDirectCallRemoteMediaHints", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: RemoteMediaHintsHarnessApi | null;
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

  function renderHook(debugCallMedia = vi.fn()) {
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
          lastIncomingMediaStateRef={lastIncomingMediaStateRef}
          debugCallMedia={debugCallMedia}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    if (!api) {
      throw new Error("Expected remote media hints api");
    }

    return { debugCallMedia };
  }

  function seedCameraSlot(target: RemoteMediaHintsHarnessApi, trackId = "track-1") {
    const stream = new FakeMediaStream() as unknown as MediaStream;
    stream.addTrack(createFakeVideoTrack(trackId));
    act(() => {
      target.commitRemoteMediaSlot("camera", {
        source: "camera",
        trackId,
        stream,
        status: "live",
        lastFrameAt: 0,
        lastPacketAt: 0,
        mid: "0",
        signaledActivity: "active",
      });
    });
  }

  it("waits for the track to end before clearing an ended slot", () => {
    renderHook();
    if (!api) {
      throw new Error("Expected remote media hints api");
    }
    seedCameraSlot(api);
    const hint: IncomingMediaStateHint = {
      signaledStopping: false,
      signaledEnded: true,
      activity: "inactive",
      reason: "track-ended",
      mid: "0",
    };

    act(() => {
      api?.processIncomingMediaStateHint("camera", hint, "track-1", false);
    });

    expect(api?.remoteCameraSlot.trackId).toBe("track-1");
    expect(api?.remoteCameraSlot.status).toBe("stopping");

    act(() => {
      api?.processIncomingMediaStateHint("camera", hint, "track-1", true);
    });

    expect(api?.remoteCameraSlot.trackId).toBeNull();
    expect(api?.remoteCameraSlot.status).toBe("ended");
  });

  it("updates stopping hint metadata without clearing a live slot prematurely", () => {
    const { debugCallMedia } = renderHook();
    if (!api) {
      throw new Error("Expected remote media hints api");
    }
    seedCameraSlot(api);
    const hint: IncomingMediaStateHint = {
      signaledStopping: true,
      signaledEnded: false,
      activity: "inactive",
      reason: "user-toggle",
      mid: "1",
    };

    act(() => {
      api?.processIncomingMediaStateHint("camera", hint, "track-1", false);
    });

    expect(api?.remoteCameraSlot.trackId).toBe("track-1");
    expect(api?.remoteCameraSlot.status).toBe("live");
    expect(api?.remoteCameraSlot.signaledActivity).toBe("inactive");
    expect(api?.remoteCameraSlot.mid).toBe("1");
    expect(debugCallMedia).not.toHaveBeenCalledWith(
      "hint-triggered-clear",
      expect.anything()
    );
  });

  it("updates telemetry progress timestamps without mutating other slot fields", () => {
    renderHook();
    if (!api) {
      throw new Error("Expected remote media hints api");
    }
    seedCameraSlot(api);

    act(() => {
      api?.updateSlotProgress("camera", {
        lastFrameAt: 120,
        lastPacketAt: 240,
      });
    });

    expect(api?.remoteCameraSlot.trackId).toBe("track-1");
    expect(api?.remoteCameraSlot.status).toBe("live");
    expect(api?.remoteCameraSlot.mid).toBe("0");
    expect(api?.remoteCameraSlot.lastFrameAt).toBe(120);
    expect(api?.remoteCameraSlot.lastPacketAt).toBe(240);
  });
});
