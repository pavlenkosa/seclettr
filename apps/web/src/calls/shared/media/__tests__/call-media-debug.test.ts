// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_MEDIA_DEBUG_ENABLED_KEY,
  logCallMediaError,
  logCallMediaWarn,
  readCallMediaDebugEnabled,
  readDecodedFrameCount,
  snapshotTrack,
  snapshotVideoElement,
  writeCallMediaDebugEnabled,
} from "../call-media-debug";

vi.mock("@/lib/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

const { logger } = await import("@/lib/logger.js");

function fakeTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return { id: "tid", kind: "video", label: "Camera", enabled: true, muted: false, readyState: "live", ...overrides } as MediaStreamTrack;
}

function fakeVideoElement(overrides: Record<string, unknown> = {}): HTMLVideoElement {
  return { paused: true, readyState: 0, currentTime: 0, videoWidth: 320, videoHeight: 240, srcObject: null, ...overrides } as unknown as HTMLVideoElement;
}

describe("snapshotTrack", () => {
  it("returns null for null", () => expect(snapshotTrack(null)).toBeNull());
  it("returns null for undefined", () => expect(snapshotTrack(undefined)).toBeNull());

  it("returns a record with track properties", () => {
    expect(snapshotTrack(fakeTrack())).toEqual({
      id: "tid", kind: "video", label: "Camera", enabled: true, muted: false, readyState: "live",
    });
  });

  it("reflects disabled/muted state", () => {
    const snap = snapshotTrack(fakeTrack({ enabled: false, muted: true, readyState: "ended" }));
    expect(snap?.enabled).toBe(false);
    expect(snap?.muted).toBe(true);
    expect(snap?.readyState).toBe("ended");
  });
});

describe("snapshotVideoElement", () => {
  it("returns {mounted: false} for null", () => {
    expect(snapshotVideoElement(null)).toEqual({ mounted: false });
  });

  it("returns element snapshot when element is provided", () => {
    const el = fakeVideoElement({ videoWidth: 640, videoHeight: 480, srcObject: null });
    expect(snapshotVideoElement(el)).toMatchObject({
      mounted: true, paused: true, readyState: 0, currentTime: 0,
      videoWidth: 640, videoHeight: 480, hasSrcObject: false,
    });
  });

  it("sets hasSrcObject true when srcObject is set", () => {
    const el = fakeVideoElement({ srcObject: {} });
    expect(snapshotVideoElement(el).hasSrcObject).toBe(true);
  });
});

describe("readDecodedFrameCount", () => {
  it("returns totalVideoFrames from getVideoPlaybackQuality", () => {
    const el = { getVideoPlaybackQuality: () => ({ totalVideoFrames: 42 }) } as unknown as HTMLVideoElement;
    expect(readDecodedFrameCount(el)).toBe(42);
  });

  it("falls back to webkitDecodedFrameCount when quality returns NaN", () => {
    const el = { getVideoPlaybackQuality: () => ({ totalVideoFrames: NaN }), webkitDecodedFrameCount: 10 } as unknown as HTMLVideoElement;
    expect(readDecodedFrameCount(el)).toBe(10);
  });

  it("returns null when neither API is available", () => {
    expect(readDecodedFrameCount({} as HTMLVideoElement)).toBeNull();
  });

  it("returns null when webkitDecodedFrameCount is also NaN", () => {
    const el = { webkitDecodedFrameCount: NaN } as unknown as HTMLVideoElement;
    expect(readDecodedFrameCount(el)).toBeNull();
  });
});

describe("readCallMediaDebugEnabled / writeCallMediaDebugEnabled", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readCallMediaDebugEnabled returns false when key is absent", () => {
    expect(readCallMediaDebugEnabled()).toBe(false);
  });

  it("readCallMediaDebugEnabled returns true when key is '1'", () => {
    storage.set(CALL_MEDIA_DEBUG_ENABLED_KEY, "1");
    expect(readCallMediaDebugEnabled()).toBe(true);
  });

  it("readCallMediaDebugEnabled returns false when key is '0'", () => {
    storage.set(CALL_MEDIA_DEBUG_ENABLED_KEY, "0");
    expect(readCallMediaDebugEnabled()).toBe(false);
  });

  it("writeCallMediaDebugEnabled stores '1' for true", () => {
    writeCallMediaDebugEnabled(true);
    expect(storage.get(CALL_MEDIA_DEBUG_ENABLED_KEY)).toBe("1");
  });

  it("writeCallMediaDebugEnabled stores '0' for false", () => {
    writeCallMediaDebugEnabled(false);
    expect(storage.get(CALL_MEDIA_DEBUG_ENABLED_KEY)).toBe("0");
  });
});

describe("logCallMediaWarn", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    });
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call logger.warn when debug is disabled", () => {
    logCallMediaWarn("test");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("calls logger.warn when debug flag is enabled", () => {
    storage.set(CALL_MEDIA_DEBUG_ENABLED_KEY, "1");
    logCallMediaWarn("msg", { x: 1 });
    expect(logger.warn).toHaveBeenCalledWith("msg", { x: 1 });
  });
});

describe("logCallMediaError", () => {
  beforeEach(() => { vi.mocked(logger.error).mockClear(); });

  it("always calls logger.error regardless of debug flag", () => {
    logCallMediaError("oops", new Error("boom"));
    expect(logger.error).toHaveBeenCalledWith("oops", new Error("boom"));
  });
});
