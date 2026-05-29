import { beforeEach, describe, expect, it } from "vitest";
import {
  callStateLabel,
  clampFloatingPreviewPosition,
  clampFloatingPreviewWidth,
  clampMinimizedDockPosition,
  formatPeerLabel,
  getPeerInitials,
  hasRenderableVideoTrack,
  toMediaErrorMessage,
  toScreenShareErrorMessage,
} from "@/calls/direct/model/direct-call-ui-utils";
import { DirectCallSetupTimeoutError } from "@/calls/direct/model/direct-call-setup-timeouts";
import type { DirectCallRuntimeState } from "@/calls/direct/model/direct-call-runtime-state";

const t = (key: string) => key;

// ── formatPeerLabel ───────────────────────────────────────────────────────────

describe("formatPeerLabel", () => {
  it("truncates a lowercase UUID to 8chars...4chars", () => {
    expect(formatPeerLabel("a1b2c3d4-e5f6-4abc-89ab-0123456789ab")).toBe(
      "a1b2c3d4...89ab"
    );
  });

  it("truncates an uppercase UUID", () => {
    expect(formatPeerLabel("A1B2C3D4-E5F6-4ABC-89AB-0123456789AB")).toBe(
      "A1B2C3D4...89AB"
    );
  });

  it("passes through a human-readable username unchanged", () => {
    expect(formatPeerLabel("alice")).toBe("alice");
  });

  it("passes through a string that looks like a UUID prefix but is not a full UUID", () => {
    expect(formatPeerLabel("a1b2c3d4-e5f6-4abc-89ab")).toBe(
      "a1b2c3d4-e5f6-4abc-89ab"
    );
  });
});

// ── getPeerInitials ───────────────────────────────────────────────────────────

describe("getPeerInitials", () => {
  it("returns '?' for an empty string", () => {
    expect(getPeerInitials("")).toBe("?");
  });

  it("returns '?' for whitespace-only string", () => {
    expect(getPeerInitials("   ")).toBe("?");
  });

  it("returns first two characters uppercased for a single word", () => {
    expect(getPeerInitials("alice")).toBe("AL");
  });

  it("returns single char uppercased for a one-char name", () => {
    expect(getPeerInitials("a")).toBe("A");
  });

  it("returns first char of each word (up to two) for multi-word name", () => {
    expect(getPeerInitials("Alice Smith")).toBe("AS");
  });

  it("uses only the first two words even when there are three", () => {
    expect(getPeerInitials("Alice Marie Smith")).toBe("AM");
  });

  it("handles multiple spaces between words", () => {
    expect(getPeerInitials("Alice  Smith")).toBe("AS");
  });
});

// ── callStateLabel ────────────────────────────────────────────────────────────

describe("callStateLabel", () => {
  it("returns formatted duration for active_audio", () => {
    expect(callStateLabel("active_audio", 75, t)).toBe("1:15");
  });

  it("returns formatted duration for active_video", () => {
    expect(callStateLabel("active_video" as DirectCallRuntimeState, 0, t)).toBe("0:00");
  });

  it("returns formatted duration for screen_sharing", () => {
    expect(callStateLabel("screen_sharing", 3661, t)).toBe("61:01");
  });

  it("returns ringing key for incoming", () => {
    expect(callStateLabel("incoming", 0, t)).toBe("call.state.ringing");
  });

  it("returns ringing key for outgoing", () => {
    expect(callStateLabel("outgoing", 0, t)).toBe("call.state.ringing");
  });

  it("returns reconnecting key for reconnecting", () => {
    expect(callStateLabel("reconnecting", 0, t)).toBe("call.state.reconnecting");
  });

  it("returns empty string for idle", () => {
    expect(callStateLabel("idle", 0, t)).toBe("");
  });

  it("returns connecting key for connecting (default case)", () => {
    expect(callStateLabel("connecting", 0, t)).toBe("call.state.connecting");
  });
});

// ── toMediaErrorMessage ───────────────────────────────────────────────────────

describe("toMediaErrorMessage", () => {
  it("maps local-media timeout + audio to micTimeout", () => {
    expect(toMediaErrorMessage(new DirectCallSetupTimeoutError("local-media"), "audio", t)).toBe(
      "call.error.micTimeout"
    );
  });

  it("maps local-media timeout + video to cameraMicTimeout", () => {
    expect(toMediaErrorMessage(new DirectCallSetupTimeoutError("local-media"), "video", t)).toBe(
      "call.error.cameraMicTimeout"
    );
  });

  it("maps non-local-media timeout stage to setupTimeout", () => {
    expect(toMediaErrorMessage(new DirectCallSetupTimeoutError("ice-connection"), "audio", t)).toBe(
      "call.error.setupTimeout"
    );
  });

  it("maps NotAllowedError + audio to micDenied", () => {
    expect(toMediaErrorMessage(new DOMException("", "NotAllowedError"), "audio", t)).toBe(
      "call.error.micDenied"
    );
  });

  it("maps NotAllowedError + video to cameraMicDenied", () => {
    expect(toMediaErrorMessage(new DOMException("", "NotAllowedError"), "video", t)).toBe(
      "call.error.cameraMicDenied"
    );
  });

  it("maps NotFoundError + audio to noMic", () => {
    expect(toMediaErrorMessage(new DOMException("", "NotFoundError"), "audio", t)).toBe(
      "call.error.noMic"
    );
  });

  it("maps DevicesNotFoundError + video to noCameraMic", () => {
    expect(toMediaErrorMessage(new DOMException("", "DevicesNotFoundError"), "video", t)).toBe(
      "call.error.noCameraMic"
    );
  });

  it("maps NotReadableError to deviceInUse regardless of callType", () => {
    expect(toMediaErrorMessage(new DOMException("", "NotReadableError"), "audio", t)).toBe(
      "call.error.deviceInUse"
    );
  });

  it("maps unknown DOMException name to unableStart", () => {
    expect(toMediaErrorMessage(new DOMException("", "AbortError"), "audio", t)).toBe(
      "call.error.unableStart"
    );
  });

  it("returns error.message for a plain Error with a message", () => {
    expect(toMediaErrorMessage(new Error("hardware failure"), "audio", t)).toBe(
      "hardware failure"
    );
  });

  it("falls back to unableStart for null", () => {
    expect(toMediaErrorMessage(null, "audio", t)).toBe("call.error.unableStart");
  });
});

// ── toScreenShareErrorMessage ─────────────────────────────────────────────────

describe("toScreenShareErrorMessage", () => {
  it("maps NotAllowedError to screenDenied", () => {
    expect(toScreenShareErrorMessage(new DOMException("", "NotAllowedError"), t)).toBe(
      "call.error.screenDenied"
    );
  });

  it("maps AbortError to screenDenied", () => {
    expect(toScreenShareErrorMessage(new DOMException("", "AbortError"), t)).toBe(
      "call.error.screenDenied"
    );
  });

  it("maps SecurityError to screenDenied", () => {
    expect(toScreenShareErrorMessage(new DOMException("", "SecurityError"), t)).toBe(
      "call.error.screenDenied"
    );
  });

  it("maps other DOMException names to unableScreenShare", () => {
    expect(toScreenShareErrorMessage(new DOMException("", "NotFoundError"), t)).toBe(
      "call.error.unableScreenShare"
    );
  });

  it("returns error.message for a plain Error", () => {
    expect(toScreenShareErrorMessage(new Error("permission denied by OS"), t)).toBe(
      "permission denied by OS"
    );
  });

  it("falls back to unableScreenShare for null", () => {
    expect(toScreenShareErrorMessage(null, t)).toBe("call.error.unableScreenShare");
  });
});

// ── hasRenderableVideoTrack ───────────────────────────────────────────────────

type MockTrack = { readyState: string; muted: boolean; enabled: boolean };

function makeStream(tracks: MockTrack[]): MediaStream {
  return { getVideoTracks: () => tracks } as unknown as MediaStream;
}

describe("hasRenderableVideoTrack", () => {
  it("returns false for a null stream", () => {
    expect(hasRenderableVideoTrack(null)).toBe(false);
  });

  it("returns false when stream has no video tracks", () => {
    expect(hasRenderableVideoTrack(makeStream([]))).toBe(false);
  });

  it("returns true for a live video track with default options", () => {
    expect(hasRenderableVideoTrack(makeStream([{ readyState: "live", muted: false, enabled: true }]))).toBe(true);
  });

  it("returns false for an ended track", () => {
    expect(hasRenderableVideoTrack(makeStream([{ readyState: "ended", muted: false, enabled: true }]))).toBe(false);
  });

  it("returns false when requireEnabled=true and track is disabled", () => {
    expect(hasRenderableVideoTrack(
      makeStream([{ readyState: "live", muted: false, enabled: false }]),
      { requireEnabled: true }
    )).toBe(false);
  });

  it("returns true when requireEnabled=true and track is enabled", () => {
    expect(hasRenderableVideoTrack(
      makeStream([{ readyState: "live", muted: false, enabled: true }]),
      { requireEnabled: true }
    )).toBe(true);
  });

  it("returns false when requireUnmuted=true and track is muted", () => {
    expect(hasRenderableVideoTrack(
      makeStream([{ readyState: "live", muted: true, enabled: true }]),
      { requireUnmuted: true }
    )).toBe(false);
  });

  it("returns true when requireUnmuted=true and track is not muted", () => {
    expect(hasRenderableVideoTrack(
      makeStream([{ readyState: "live", muted: false, enabled: true }]),
      { requireUnmuted: true }
    )).toBe(true);
  });
});

// ── clampMinimizedDockPosition ────────────────────────────────────────────────

describe("clampMinimizedDockPosition", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { innerWidth: number; innerHeight: number }).innerWidth = 1280;
    (globalThis as typeof globalThis & { innerWidth: number; innerHeight: number }).innerHeight = 800;
  });

  it("leaves a position within bounds unchanged", () => {
    expect(clampMinimizedDockPosition({ x: 100, y: 200 }, 120, 80)).toEqual({ x: 100, y: 200 });
  });

  it("clamps x below the margin to margin (8)", () => {
    expect(clampMinimizedDockPosition({ x: 0, y: 200 }, 120, 80).x).toBe(8);
  });

  it("clamps x above the right boundary", () => {
    // maxX = 1280 - 120 - 8 = 1152
    expect(clampMinimizedDockPosition({ x: 9999, y: 200 }, 120, 80).x).toBe(1152);
  });

  it("clamps y below the margin to margin (8)", () => {
    expect(clampMinimizedDockPosition({ x: 100, y: -5 }, 120, 80).y).toBe(8);
  });

  it("clamps y above the bottom boundary", () => {
    // maxY = 800 - 80 - 8 = 712
    expect(clampMinimizedDockPosition({ x: 100, y: 9999 }, 120, 80).y).toBe(712);
  });

  it("preserves extra properties on the position object", () => {
    const result = clampMinimizedDockPosition({ x: 100, y: 200, label: "dock" } as { x: number; y: number; label: string }, 120, 80);
    expect(result.label).toBe("dock");
  });
});

// ── clampFloatingPreviewPosition ──────────────────────────────────────────────

describe("clampFloatingPreviewPosition", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { innerWidth: number; innerHeight: number }).innerWidth = 1280;
    (globalThis as typeof globalThis & { innerWidth: number; innerHeight: number }).innerHeight = 800;
  });

  it("delegates to clampMinimizedDockPosition (smoke test)", () => {
    // Same result expected as clampMinimizedDockPosition with same args.
    expect(clampFloatingPreviewPosition({ x: 0, y: 0 }, 100, 60)).toEqual(
      clampMinimizedDockPosition({ x: 0, y: 0 }, 100, 60)
    );
  });
});

// ── clampFloatingPreviewWidth ─────────────────────────────────────────────────

describe("clampFloatingPreviewWidth", () => {
  it("clamps below minimum (92) up to 92 on desktop", () => {
    (globalThis as typeof globalThis & { innerWidth: number }).innerWidth = 1280;
    expect(clampFloatingPreviewWidth(50)).toBe(92);
  });

  it("clamps above desktop maximum (220) down to 220", () => {
    // desktop: maxWidth = min(220, round(1280*0.24)=307) = 220
    (globalThis as typeof globalThis & { innerWidth: number }).innerWidth = 1280;
    expect(clampFloatingPreviewWidth(9999)).toBe(220);
  });

  it("returns value unchanged when within desktop range", () => {
    (globalThis as typeof globalThis & { innerWidth: number }).innerWidth = 1280;
    expect(clampFloatingPreviewWidth(150)).toBe(150);
  });

  it("clamps above mobile maximum on narrow viewport", () => {
    // mobile (<=640): maxWidth = min(220, round(375*0.44)=165) = 165
    (globalThis as typeof globalThis & { innerWidth: number }).innerWidth = 375;
    expect(clampFloatingPreviewWidth(9999)).toBe(165);
  });

  it("rounds fractional widths", () => {
    (globalThis as typeof globalThis & { innerWidth: number }).innerWidth = 1280;
    expect(clampFloatingPreviewWidth(120.7)).toBe(121);
  });
});
