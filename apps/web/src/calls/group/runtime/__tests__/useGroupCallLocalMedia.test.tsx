// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useGroupCallLocalMedia } from "@/calls/group/runtime/useGroupCallLocalMedia";
import type { GroupSfuClient } from "@/calls/group/runtime/sfu";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";
import { resolveErrorMessage } from "@/calls/group/runtime/group-call-error-utils";

type VideoResolution = "360p" | "480p" | "720p" | "1080p";

function createMockTrack(kind: "audio" | "video", overrides?: Partial<MediaStreamTrack>): MediaStreamTrack {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    clone: vi.fn(),
    getCapabilities: vi.fn(),
    getConstraints: vi.fn(),
    getSettings: vi.fn(),
    label: `${kind}-track`,
    id: `${kind}-${Math.random()}`,
    muted: false,
    readyState: "live" as const,
    contentHint: "",
    dispatchEvent: vi.fn(),
    ...overrides,
  } as unknown as MediaStreamTrack;
}

function createMockStream(tracks: MediaStreamTrack[] = []): MediaStream {
  const trackList = [...tracks];
  return {
    getTracks: vi.fn(() => trackList),
    getAudioTracks: vi.fn(() => trackList.filter((t) => t.kind === "audio")),
    getVideoTracks: vi.fn(() => trackList.filter((t) => t.kind === "video")),
    addTrack: vi.fn((track: MediaStreamTrack) => { trackList.push(track); }),
    removeTrack: vi.fn((track: MediaStreamTrack) => {
      const idx = trackList.indexOf(track);
      if (idx >= 0) trackList.splice(idx, 1);
    }),
    clone: vi.fn(),
    getTrackById: vi.fn(),
    id: "mock-stream",
    active: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream;
}

/* jsdom does not implement MediaStream properly — the real constructor
   discards mock tracks silently. Override so `new MediaStream([track])`
   inside syncLocalScreenPreview preserves the track list. */
beforeAll(() => {
  /* eslint-disable-next-line @typescript-eslint/no-extraneous-class -- needed to mock MediaStream in jsdom */
  class MockMediaStream {
    private readonly _tracks: MediaStreamTrack[];
    constructor(tracks?: MediaStreamTrack[]) {
      this._tracks = [...(tracks ?? [])];
    }
    getTracks() { return this._tracks; }
    getAudioTracks() { return this._tracks.filter((t) => t.kind === "audio"); }
    getVideoTracks() { return this._tracks.filter((t) => t.kind === "video"); }
    addTrack(track: MediaStreamTrack) { this._tracks.push(track); }
    removeTrack(track: MediaStreamTrack) {
      const idx = this._tracks.indexOf(track);
      if (idx >= 0) this._tracks.splice(idx, 1);
    }
    getTrackById() { return null; }
    clone() { return new MockMediaStream(this._tracks); }
    active = true;
    id = "mock-stream";
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispatchEvent = vi.fn();
  }
  globalThis.MediaStream = MockMediaStream as unknown as typeof MediaStream;
});

afterAll(() => {
  globalThis.MediaStream = undefined as unknown as typeof MediaStream;
});

function createMockSfuClient(): GroupSfuClient {
  return {
    rtpCapabilities: {} as never,
    syncRemoteProducers: vi.fn(),
    removeParticipantMedia: vi.fn(),
    setVideoTrack: vi.fn(),
    setAudioTrack: vi.fn(),
    setLocalMediaKey: vi.fn(),
    setRemoteMediaKey: vi.fn(),
    getDebugSnapshot: vi.fn(),
    close: vi.fn(),
  };
}

function renderHook<Result>(hook: () => Result): {
  result: { current: Result };
  unmount: () => void;
  rerender: () => void;
} {
  const res = { current: undefined as Result };
  let root: Root;
  const container = document.createElement("div");
  const Component = () => {
    res.current = hook();
    return null;
  };
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(Component));
  });
  return {
    get result() { return res; },
    unmount: () => act(() => { root.unmount(); }),
    rerender: () => act(() => { root.render(React.createElement(Component)); }),
  };
}

const mediaDevicesMock = vi.hoisted(() => ({
  getUserMedia: vi.fn(),
  getDisplayMedia: vi.fn(),
}));

describe("useGroupCallLocalMedia", () => {
  let sfuClient: GroupSfuClient;
  let setError: Mock;

  function createOptions(overrides?: Partial<{
    status: GroupCallStatus;
    sfuClientRef: { current: GroupSfuClient | null };
    setError: Mock;
  }>) {
    return {
      status: "ready" as GroupCallStatus,
      sfuClientRef: { current: sfuClient },
      setError: setError,
      mediaPermissionError: "No media permission",
      cameraToggleError: "Camera toggle failed",
      screenToggleError: "Screen share failed",
      ...overrides,
    };
  }

  beforeEach(() => {
    sfuClient = createMockSfuClient();
    setError = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: mediaDevicesMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns null streams and default state", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      expect(result.current.localStream).toBeNull();
      expect(result.current.localScreenStream).toBeNull();
      expect(result.current.isLocalAudioMuted).toBe(false);
      expect(result.current.isVideoSwitching).toBe(false);
      expect(result.current.isScreenSwitching).toBe(false);
      expect(result.current.isLocalScreenSharing).toBe(false);
      expect(result.current.selectedVideoResolution).toBe("720p");
      expect(result.current.selectedScreenResolution).toBe("720p");
    });
  });

  describe("attachInitialStream", () => {
    it("stores the stream and unmutes audio", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([createMockTrack("audio")]);

      act(() => { result.current.attachInitialStream(stream); });

      expect(result.current.localStream).toBe(stream);
      expect(result.current.isLocalAudioMuted).toBe(false);
      expect(result.current.localStreamRef.current).toBe(stream);
    });
  });

  describe("resetLocalMediaState", () => {
    it("resets all local state to defaults", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([createMockTrack("audio")]);
      act(() => { result.current.attachInitialStream(stream); });
      act(() => { result.current.resetLocalMediaState(); });

      expect(result.current.localStream).toBeNull();
      expect(result.current.localScreenStream).toBeNull();
      expect(result.current.isLocalAudioMuted).toBe(false);
      expect(result.current.isVideoSwitching).toBe(false);
      expect(result.current.isScreenSwitching).toBe(false);
      expect(result.current.isLocalScreenSharing).toBe(false);
    });
  });

  describe("cleanupLocalMedia", () => {
    it("stops tracks, nulls refs, resets state", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const audioTrack = createMockTrack("audio");
      const videoTrack = createMockTrack("video");
      const stream = createMockStream([audioTrack, videoTrack]);
      act(() => { result.current.attachInitialStream(stream); });

      act(() => { result.current.cleanupLocalMedia(); });

      expect(audioTrack.stop).toHaveBeenCalledTimes(1);
      expect(videoTrack.stop).toHaveBeenCalledTimes(1);
      expect(result.current.localStream).toBeNull();
      expect(sfuClient.close).toHaveBeenCalledTimes(1);
    });

    it("closes SFU client", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      act(() => { result.current.cleanupLocalMedia(); });
      expect(sfuClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleToggleMute", () => {
    it("toggles audio track enabled state", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const audioTrack = createMockTrack("audio");
      act(() => { result.current.attachInitialStream(createMockStream([audioTrack])); });

      act(() => { result.current.handleToggleMute(); });
      expect(audioTrack.enabled).toBe(false);
      expect(result.current.isLocalAudioMuted).toBe(true);

      act(() => { result.current.handleToggleMute(); });
      expect(audioTrack.enabled).toBe(true);
      expect(result.current.isLocalAudioMuted).toBe(false);
    });

    it("sets error when no audio tracks exist", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const noAudioStream = createMockStream([createMockTrack("video")]);
      act(() => { result.current.attachInitialStream(noAudioStream); });

      act(() => { result.current.handleToggleMute(); });
      expect(setError).toHaveBeenCalledWith("No media permission");
    });

    it("does nothing when status is not ready", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions({ status: "idle" as GroupCallStatus })));
      const audioTrack = createMockTrack("audio");
      act(() => { result.current.attachInitialStream(createMockStream([audioTrack])); });

      act(() => { result.current.handleToggleMute(); });
      expect(audioTrack.enabled).toBe(true);
      expect(result.current.isLocalAudioMuted).toBe(false);
    });
  });

  describe("handleToggleVideo", () => {
    it("removes video track when camera is on", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const videoTrack = createMockTrack("video");
      const stream = createMockStream([videoTrack]);
      act(() => { result.current.attachInitialStream(stream); });

      await act(async () => { await result.current.handleToggleVideo(); });

      expect(sfuClient.setVideoTrack).toHaveBeenCalledWith(null, "camera");
      expect(videoTrack.stop).toHaveBeenCalledTimes(1);
      expect(result.current.isVideoSwitching).toBe(false);
    });

    it("acquires new video track when camera is off", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([]);
      const newVideoTrack = createMockTrack("video");
      const captureStream = createMockStream([newVideoTrack]);
      mediaDevicesMock.getUserMedia.mockResolvedValue(captureStream);

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleToggleVideo(); });

      expect(mediaDevicesMock.getUserMedia).toHaveBeenCalled();
      expect(sfuClient.setVideoTrack).toHaveBeenCalledWith(newVideoTrack, "camera");
      expect(stream.addTrack).toHaveBeenCalledWith(newVideoTrack);
      expect(result.current.isVideoSwitching).toBe(false);
    });

    it("sets error when getUserMedia fails", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([]);
      mediaDevicesMock.getUserMedia.mockRejectedValue(new Error("permission denied"));

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleToggleVideo(); });

      expect(setError).toHaveBeenCalled();
      expect(result.current.isVideoSwitching).toBe(false);
    });

    it("does nothing when sfuClient is null", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions({
        sfuClientRef: { current: null },
      })));
      const videoTrack = createMockTrack("video");
      act(() => { result.current.attachInitialStream(createMockStream([videoTrack])); });

      await act(async () => { await result.current.handleToggleVideo(); });
      expect(videoTrack.stop).not.toHaveBeenCalled();
    });
  });

  describe("handleToggleScreenShare", () => {
    it("starts screen share via getDisplayMedia", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([createMockTrack("audio")]);
      const screenTrack = createMockTrack("video");
      const displayStream = createMockStream([screenTrack]);
      mediaDevicesMock.getDisplayMedia.mockResolvedValue(displayStream);

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleToggleScreenShare(); });

      expect(mediaDevicesMock.getDisplayMedia).toHaveBeenCalled();
      expect(sfuClient.setVideoTrack).toHaveBeenCalledWith(screenTrack, "screen");
      expect(result.current.isLocalScreenSharing).toBe(true);
      expect(result.current.isScreenSwitching).toBe(false);
    });

    it("stops screen share when already sharing", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const screenTrack = createMockTrack("video");
      const stream = createMockStream([createMockTrack("audio")]);

      act(() => { result.current.attachInitialStream(stream); });
      mediaDevicesMock.getDisplayMedia.mockResolvedValue(createMockStream([screenTrack]));
      await act(async () => { await result.current.handleToggleScreenShare(); });

      await act(async () => { await result.current.handleToggleScreenShare(); });

      expect(sfuClient.setVideoTrack).toHaveBeenCalledWith(null, "screen");
      expect(screenTrack.stop).toHaveBeenCalled();
      expect(result.current.isLocalScreenSharing).toBe(false);
      expect(result.current.isScreenSwitching).toBe(false);
    });

    it("sets error when getDisplayMedia fails", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const stream = createMockStream([createMockTrack("audio")]);
      mediaDevicesMock.getDisplayMedia.mockRejectedValue(new Error("Permission denied"));

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleToggleScreenShare(); });

      expect(setError).toHaveBeenCalled();
      expect(result.current.isScreenSwitching).toBe(false);
    });
  });

  describe("handleSwitchMic", () => {
    it("switches audio track to new device", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const oldTrack = createMockTrack("audio");
      const stream = createMockStream([oldTrack]);
      const newTrack = createMockTrack("audio");
      mediaDevicesMock.getUserMedia.mockResolvedValue(createMockStream([newTrack]));

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleSwitchMic("device-2"); });

      expect(oldTrack.stop).toHaveBeenCalledTimes(1);
      expect(stream.removeTrack).toHaveBeenCalledWith(oldTrack);
      expect(stream.addTrack).toHaveBeenCalledWith(newTrack);
      expect(sfuClient.setAudioTrack).toHaveBeenCalledWith(newTrack);
    });

    it("does nothing when status is not ready", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions({ status: "idle" as GroupCallStatus })));
      await act(async () => { await result.current.handleSwitchMic("device-2"); });
      expect(mediaDevicesMock.getUserMedia).not.toHaveBeenCalled();
    });
  });

  describe("handleSwitchCamera", () => {
    it("switches video track to new device", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const oldTrack = createMockTrack("video");
      const stream = createMockStream([oldTrack]);
      const newTrack = createMockTrack("video");
      mediaDevicesMock.getUserMedia.mockResolvedValue(createMockStream([newTrack]));

      act(() => { result.current.attachInitialStream(stream); });
      await act(async () => { await result.current.handleSwitchCamera("device-2"); });

      expect(oldTrack.stop).toHaveBeenCalledTimes(1);
      expect(stream.addTrack).toHaveBeenCalledWith(newTrack);
      expect(sfuClient.setVideoTrack).toHaveBeenCalledWith(newTrack, "camera");
      expect(result.current.isVideoSwitching).toBe(false);
    });

    it("does nothing when sfuClient is null", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions({
        sfuClientRef: { current: null },
      })));
      await act(async () => { await result.current.handleSwitchCamera("device-2"); });
      expect(mediaDevicesMock.getUserMedia).not.toHaveBeenCalled();
    });
  });

  describe("handleSelectVideoResolution", () => {
    it("applies constraints to existing video track", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const videoTrack = createMockTrack("video");
      act(() => { result.current.attachInitialStream(createMockStream([videoTrack])); });

      await act(async () => { await result.current.handleSelectVideoResolution("1080p"); });

      expect(videoTrack.applyConstraints).toHaveBeenCalledWith({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      });
      expect(result.current.selectedVideoResolution).toBe("1080p");
    });

    it("stores resolution without track when no video track exists", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      act(() => { result.current.attachInitialStream(createMockStream([])); });

      await act(async () => { await result.current.handleSelectVideoResolution("480p"); });

      expect(result.current.selectedVideoResolution).toBe("480p");
    });

    it("sets error when applyConstraints fails", async () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const videoTrack = createMockTrack("video");
      (videoTrack.applyConstraints as Mock).mockRejectedValue(new Error("constraint error"));
      act(() => { result.current.attachInitialStream(createMockStream([videoTrack])); });

      await act(async () => { await result.current.handleSelectVideoResolution("1080p"); });

      expect(setError).toHaveBeenCalled();
    });
  });

  describe("handleSelectScreenResolution", () => {
    it("applies constraints when screen track exists", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      const screenTrack = createMockTrack("video");
      const screenStream = createMockStream([screenTrack]);

      act(() => {
        result.current.attachInitialStream(createMockStream([]));
        result.current.localScreenStreamRef.current = screenStream;
      });
      act(() => { result.current.handleSelectScreenResolution("1080p"); });

      expect(screenTrack.applyConstraints).toHaveBeenCalledWith({
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      });
      expect(result.current.selectedScreenResolution).toBe("1080p");
    });

    it("stores resolution without track when no screen track exists", () => {
      const { result } = renderHook(() => useGroupCallLocalMedia(createOptions()));
      act(() => { result.current.handleSelectScreenResolution("480p"); });
      expect(result.current.selectedScreenResolution).toBe("480p");
    });
  });
});
