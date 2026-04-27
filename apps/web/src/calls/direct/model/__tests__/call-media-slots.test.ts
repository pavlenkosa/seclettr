import { describe, expect, it } from "vitest";
import {
  createEmptyRemoteMediaSlot,
  getOppositeRemoteMediaSource,
  isRemoteTrackSignalingLive,
  isRemoteMediaSlotRenderable,
  resolveRemoteMediaSlotRuntimeStatus,
  toRemoteMediaUiStatus,
  withRemoteMediaProgress,
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
