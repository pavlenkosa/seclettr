import { describe, expect, it } from "vitest";
import {
  toIncomingMediaStateHint,
  shouldClearSlotFromHint,
  shouldApplyIncomingMediaState,
  type IncomingMediaStateHint,
} from "@/calls/direct/model/call-media-state";

describe("call media state hint layer", () => {
  describe("toIncomingMediaStateHint", () => {
    it("converts 'on' state correctly", () => {
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

    it("converts 'off' state to stopping hint", () => {
      const hint = toIncomingMediaStateHint({
        state: "off",
        activity: "inactive",
        reason: "user-toggle",
        mid: "1",
      });
      expect(hint).toEqual({
        signaledStopping: true,
        signaledEnded: false,
        activity: "inactive",
        reason: "user-toggle",
        mid: "1",
      });
    });

    it("converts 'ended' state to ended hint", () => {
      const hint = toIncomingMediaStateHint({
        state: "ended",
        activity: "inactive",
        reason: "track-ended",
        mid: null,
      });
      expect(hint).toEqual({
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "track-ended",
        mid: null,
      });
    });
  });

  describe("shouldClearSlotFromHint", () => {
    it("clears when peer signaled ended and track is gone", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };
      expect(shouldClearSlotFromHint({
        slotHasTrack: false,
        trackEnded: true,
        hint,
      })).toBe(true);
    });

    it("does not clear when peer signaled ended but track still present", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: true,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };
      expect(shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      })).toBe(false);
    });

    it("waits for track events when peer signals stopping but track present", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: true,
        signaledEnded: false,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };
      expect(shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      })).toBe(false);
    });

    it("does not clear when peer signals stopping even if track ended", () => {
      // Stopping means the peer is temporarily disabling - don't clear
      const hint: IncomingMediaStateHint = {
        signaledStopping: true,
        signaledEnded: false,
        activity: "inactive",
        reason: "user-toggle",
        mid: null,
      };
      expect(shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: true,
        hint,
      })).toBe(false);
    });

    it("does not clear when peer signals on", () => {
      const hint: IncomingMediaStateHint = {
        signaledStopping: false,
        signaledEnded: false,
        activity: "active",
        reason: null,
        mid: null,
      };
      expect(shouldClearSlotFromHint({
        slotHasTrack: true,
        trackEnded: false,
        hint,
      })).toBe(false);
    });
  });

  describe("shouldApplyIncomingMediaState", () => {
    it("applies when sequence is higher", () => {
      expect(shouldApplyIncomingMediaState(1, 0, 2)).toBe(true);
    });

    it("rejects when sequence is equal regardless of revision", () => {
      // Equal sequence means same message, reject regardless of revision
      expect(shouldApplyIncomingMediaState(2, 0, 2)).toBe(false);
      expect(shouldApplyIncomingMediaState(1, 1, 1, 2)).toBe(false);
    });

    it("rejects when sequence is lower", () => {
      expect(shouldApplyIncomingMediaState(3, 0, 2)).toBe(false);
    });

    it("rejects when revision is lower", () => {
      expect(shouldApplyIncomingMediaState(1, 3, 1, 2)).toBe(false);
    });

    it("applies when revision is missing but seq is higher", () => {
      // Missing revision means we can't compare, so trust sequence order
      expect(shouldApplyIncomingMediaState(1, 5, 2)).toBe(true);
    });
  });
});
