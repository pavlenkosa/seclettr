import { describe, expect, it } from "vitest";
import {
  createEmptyRemoteMediaSlot,
  getOppositeRemoteMediaSource,
  isRemoteTrackSignalingLive,
  isRemoteMediaSlotRenderable,
  resolveRemoteMediaSlotRuntimeStatus,
  toRemoteMediaUiStatus,
  withRemoteMediaProgress,
  type RemoteMediaSlot,
} from "@/calls/direct/model/call-media-slots";

describe("call media slots", () => {
  it("creates empty inactive slots", () => {
    expect(createEmptyRemoteMediaSlot("camera")).toEqual({
      source: "camera",
      trackId: null,
      stream: null,
      status: "inactive",
      lastFrameAt: 0,
      lastPacketAt: 0,
      mid: null,
      signaledActivity: null,
    });
  });

  it("treats only live video streams as renderable", () => {
    const track = {
      kind: "video",
      enabled: true,
      readyState: "live",
    } as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream,
      status: "live",
      trackId: "track-1",
      lastFrameAt: 120,
      lastPacketAt: 120,
    })).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream,
      status: "starting",
      trackId: "track-1",
    })).toBe(true);
  });

  it("keeps camera and screen slots renderable while tracks are live", () => {
    const track = {
      kind: "video",
      enabled: true,
      readyState: "live",
    } as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream,
      status: "live",
      trackId: "camera-track",
      lastFrameAt: 0,
      lastPacketAt: 0,
    }, 5000, 1300)).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("screen"),
      stream,
      status: "live",
      trackId: "screen-track",
      lastFrameAt: 0,
      lastPacketAt: 0,
    }, 2600, 1300)).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("screen"),
      stream,
      status: "live",
      trackId: "screen-track",
      lastFrameAt: 2000,
      lastPacketAt: 0,
    }, 2600, 1300)).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("screen"),
      stream,
      status: "live",
      trackId: "screen-track",
      lastFrameAt: 0,
      lastPacketAt: 2000,
    }, 2600, 1300)).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("screen"),
      stream,
      status: "live",
      trackId: "screen-track",
      lastFrameAt: 1000,
      lastPacketAt: 1000,
    }, 2600, 1300)).toBe(true);
  });

  it("hides a slot immediately when the control-plane marks the visual stream inactive", () => {
    const track = {
      kind: "video",
      enabled: true,
      readyState: "live",
      muted: false,
    } as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream,
      status: "live",
      trackId: "track-1",
      signaledActivity: "inactive",
    })).toBe(false);
  });

  it("keeps a live slot renderable when browser track mute lags behind confirmed media activity", () => {
    const mutedTrack = {
      kind: "video",
      enabled: true,
      muted: true,
      readyState: "live",
    } as MediaStreamTrack;
    const mutedStream = {
      getVideoTracks: () => [mutedTrack],
    } as unknown as MediaStream;

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream: mutedStream,
      status: "live",
      trackId: "camera-track",
      lastFrameAt: 2400,
      lastPacketAt: 2400,
    }, 2600, 1300)).toBe(true);

    expect(isRemoteMediaSlotRenderable({
      ...createEmptyRemoteMediaSlot("camera"),
      stream: mutedStream,
      status: "starting",
      trackId: "camera-track",
      lastFrameAt: 0,
      lastPacketAt: 0,
    }, 2600, 1300)).toBe(false);
  });

  it("maps slot lifecycle states to UI states", () => {
    expect(toRemoteMediaUiStatus("inactive")).toBe("inactive");
    expect(toRemoteMediaUiStatus("starting")).toBe("starting");
    expect(toRemoteMediaUiStatus("stopping")).toBe("starting");
    expect(toRemoteMediaUiStatus("live")).toBe("active");
    expect(toRemoteMediaUiStatus("ended")).toBe("inactive");
  });

  it("updates frame and packet timestamps without changing other fields", () => {
    const slot = createEmptyRemoteMediaSlot("screen");
    expect(withRemoteMediaProgress(slot, { lastFrameAt: 10, lastPacketAt: 12 })).toEqual({
      ...slot,
      lastFrameAt: 10,
      lastPacketAt: 12,
    });
  });

  it("resolves the opposite visual source", () => {
    expect(getOppositeRemoteMediaSource("camera")).toBe("screen");
    expect(getOppositeRemoteMediaSource("screen")).toBe("camera");
  });

  it("treats only unmuted live receiver tracks as signaling-live", () => {
    expect(isRemoteTrackSignalingLive({
      readyState: "live",
      muted: false,
    } as Pick<MediaStreamTrack, "readyState" | "muted">)).toBe(true);

    expect(isRemoteTrackSignalingLive({
      readyState: "live",
      muted: true,
    } as Pick<MediaStreamTrack, "readyState" | "muted">)).toBe(false);

    expect(isRemoteTrackSignalingLive({
      readyState: "ended",
      muted: false,
    } as Pick<MediaStreamTrack, "readyState" | "muted">)).toBe(false);
  });

  // ── isRemoteMediaSlotRenderable edge cases ──────────────────────────────

  describe("isRemoteMediaSlotRenderable edge cases", () => {
    const NOW = 10_000;
    const WINDOW = 1300;

    function makeVideoTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
      return { kind: "video", enabled: true, readyState: "live", muted: false, ...overrides } as MediaStreamTrack;
    }

    function makeStream(tracks: MediaStreamTrack[]): MediaStream {
      return { getVideoTracks: () => tracks } as unknown as MediaStream;
    }

    function baseSlot(overrides: Partial<RemoteMediaSlot> = {}): RemoteMediaSlot {
      return {
        ...createEmptyRemoteMediaSlot("camera"),
        stream: makeStream([makeVideoTrack()]),
        status: "live",
        trackId: "t",
        ...overrides,
      };
    }

    it("returns false when stream is null regardless of status", () => {
      expect(isRemoteMediaSlotRenderable(baseSlot({ stream: null, status: "live" }), NOW, WINDOW)).toBe(false);
      expect(isRemoteMediaSlotRenderable(baseSlot({ stream: null, status: "starting" }), NOW, WINDOW)).toBe(false);
    });

    it("returns false for ended slot status even with a live unmuted track", () => {
      expect(isRemoteMediaSlotRenderable(baseSlot({ status: "ended" }), NOW, WINDOW)).toBe(false);
    });

    it("returns false when track readyState is ended", () => {
      const endedStream = makeStream([makeVideoTrack({ readyState: "ended" })]);
      expect(isRemoteMediaSlotRenderable(baseSlot({ stream: endedStream, status: "live" }), NOW, WINDOW)).toBe(false);
    });

    it("returns false when track is disabled", () => {
      const disabledStream = makeStream([makeVideoTrack({ enabled: false })]);
      expect(isRemoteMediaSlotRenderable(baseSlot({ stream: disabledStream, status: "live" }), NOW, WINDOW)).toBe(false);
    });

    it("renders stopping slot with unmuted live track — stopping is advisory only", () => {
      // status "stopping" is not in the early-exit block; unmuted live track passes immediately.
      expect(isRemoteMediaSlotRenderable(baseSlot({ status: "stopping" }), NOW, WINDOW)).toBe(true);
    });

    it("does not render stopping slot with muted track and no progress", () => {
      const mutedStream = makeStream([makeVideoTrack({ muted: true })]);
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "stopping", lastFrameAt: 0, lastPacketAt: 0 }),
        NOW, WINDOW,
      )).toBe(false);
    });

    it("renders stopping slot with muted track and recent frame activity", () => {
      const mutedStream = makeStream([makeVideoTrack({ muted: true })]);
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "stopping", lastFrameAt: NOW - 100, lastPacketAt: 0 }),
        NOW, WINDOW,
      )).toBe(true);
    });

    it("renders starting slot with muted track driven only by recent packet activity", () => {
      // lastFrameAt stays 0; only lastPacketAt is within the window.
      const mutedStream = makeStream([makeVideoTrack({ muted: true })]);
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "starting", lastFrameAt: 0, lastPacketAt: NOW - 100 }),
        NOW, WINDOW,
      )).toBe(true);
    });

    it("does not render starting slot when both frame and packet progress fall outside the active window", () => {
      const mutedStream = makeStream([makeVideoTrack({ muted: true })]);
      const staleAt = NOW - WINDOW - 1;
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "starting", lastFrameAt: staleAt, lastPacketAt: staleAt }),
        NOW, WINDOW,
      )).toBe(false);
    });

    it("does not render at the exact active window boundary — progress window is strictly less-than", () => {
      // now - lastFrameAt === WINDOW → NOT within window (< required, not ≤)
      const mutedStream = makeStream([makeVideoTrack({ muted: true })]);
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "starting", lastFrameAt: NOW - WINDOW, lastPacketAt: 0 }),
        NOW, WINDOW,
      )).toBe(false);
      // one millisecond inside the window → renderable
      expect(isRemoteMediaSlotRenderable(
        baseSlot({ stream: mutedStream, status: "starting", lastFrameAt: NOW - WINDOW + 1, lastPacketAt: 0 }),
        NOW, WINDOW,
      )).toBe(true);
    });
  });

  it("promotes slots to live from track activity without waiting for probe-only progress", () => {
    expect(resolveRemoteMediaSlotRuntimeStatus({
      currentStatus: "starting",
      trackSignalLive: true,
      hasPacketProgress: false,
      hasFrameProgress: false,
    })).toBe("live");

    expect(resolveRemoteMediaSlotRuntimeStatus({
      currentStatus: "stopping",
      trackSignalLive: false,
      hasPacketProgress: false,
      hasFrameProgress: false,
    })).toBe("stopping");

    expect(resolveRemoteMediaSlotRuntimeStatus({
      currentStatus: "stopping",
      trackSignalLive: false,
      hasPacketProgress: true,
      hasFrameProgress: false,
    })).toBe("live");

    expect(resolveRemoteMediaSlotRuntimeStatus({
      currentStatus: "live",
      trackSignalLive: false,
      hasPacketProgress: false,
      hasFrameProgress: false,
    })).toBe("live");
  });
});
