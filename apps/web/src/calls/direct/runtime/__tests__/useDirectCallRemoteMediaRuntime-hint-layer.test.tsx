// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { toIncomingMediaStateHint, shouldClearSlotFromHint, type IncomingMediaStateHint } from "@/calls/direct/model/call-media-state";

/**
 * These tests verify the hint-layer logic for remote media slot lifecycle.
 * The actual useDirectCallRemoteMediaRuntime hook tests are in
 * useDirectCallRemoteMediaRuntime.test.tsx
 */

describe("remote media slot hint layer logic", () => {
  describe("hint-based slot clearance decisions", () => {
    it("does not clear slot when peer signals stopping but track is still live", () => {
      // This is the key scenario that causes frozen frames if we clear too eagerly
      const hint: IncomingMediaStateHint = {
        signaledStopping: true,
        signaledEnded: false,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };

      // Track is still present and not ended
      const shouldClear = shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      });

      expect(shouldClear).toBe(false);
    });

    it("does not clear slot when peer signals on and track is live", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: false,
        activity: "active",
        reason: null,
        mid: "1",
      };

      const shouldClear = shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      });

      expect(shouldClear).toBe(false);
    });

    it("clears slot when peer signals ended and track is confirmed ended", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };

      const shouldClear = shouldClearSlotFromHint({
        slotHasTrack: false,
        trackEnded: true,
        hint,
      });

      expect(shouldClear).toBe(true);
    });

    it("waits for track ended when peer signals ended but track still present", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };

      // Track is still present but will end
      const shouldClear = shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      });

      // Should NOT clear immediately - wait for track.ended event
      expect(shouldClear).toBe(false);
    });

    it("clears when peer signals ended and track already ended", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "track-ended",
        mid: null,
      };

      const shouldClear = shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: true, // track already ended
        hint,
      });

      expect(shouldClear).toBe(true);
    });
  });

  describe("hint transformation", () => {
    it("converts incoming state to hint correctly", () => {
      const hint = toIncomingMediaStateHint({
        state: "on",
        activity: "active",
        reason: null,
        mid: "1",
      });

      expect(hint).toEqual({
        signaledStopping: false,
        signaledEnded: false,
        activity: "active",
        reason: null,
        mid: "1",
      });
    });

    it("marks 'off' state as signaledStopping", () => {
      const hint = toIncomingMediaStateHint({
        state: "off",
        activity: "inactive",
        reason: "user-toggle",
        mid: "1",
      });

      expect(hint.signaledStopping).toBe(true);
      expect(hint.signaledEnded).toBe(false);
    });

    it("marks 'ended' state as signaledEnded", () => {
      const hint = toIncomingMediaStateHint({
        state: "ended",
        activity: "inactive",
        reason: "track-ended",
        mid: null,
      });

      expect(hint.signaledEnded).toBe(true);
      expect(hint.signaledStopping).toBe(false);
    });
  });
});
