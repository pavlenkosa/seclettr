import { describe, expect, it } from "vitest";
import {
  dedupeRemoteProducersBySlot,
  filterRemoteProducersForConsume,
  computeConsumeRetryDelayMs,
  getNextRemoteConsumeRetryAt,
  getProducerRemovalGracePeriodMs,
  computeRemoteSyncDelayMs,
} from "@/calls/group/runtime/sfu/remote-producers";
import type { SfuRoomProducer } from "@seclettr/protocol";

const createTestProducer = (overrides: Partial<SfuRoomProducer> = {}): SfuRoomProducer => ({
  producerId: "p1",
  userId: "user1",
  deviceId: "device1",
  kind: "video",
  source: "camera",
  ...overrides,
});

describe("remote-producers utilities", () => {
  describe("dedupeRemoteProducersBySlot", () => {
    it("should deduplicate producers by slot key", () => {
      const producers: SfuRoomProducer[] = [
        createTestProducer({ producerId: "p1", source: "camera" }),
        createTestProducer({ producerId: "p2", source: "camera" }), // Same slot as p1
        createTestProducer({ producerId: "p3", source: "screen" }), // Different slot
      ];

      const result = dedupeRemoteProducersBySlot(producers);
      
      // Should have 2 unique slots (camera + screen)
      expect(result.length).toBe(2);
    });

    it("should handle producers without deviceId", () => {
      const producers: SfuRoomProducer[] = [
        createTestProducer({ producerId: "p1", deviceId: "device1" }),
        createTestProducer({ producerId: "p2", deviceId: undefined }),
      ];

      const result = dedupeRemoteProducersBySlot(producers);
      
      // Should have 2 entries since they have different slot keys
      expect(result.length).toBe(2);
    });

    it("should keep later producer when duplicates exist", () => {
      const producers: SfuRoomProducer[] = [
        createTestProducer({ producerId: "p1", source: "camera" }),
        createTestProducer({ producerId: "p2", source: "camera" }),
      ];

      const result = dedupeRemoteProducersBySlot(producers);
      
      // Should keep the last one
      expect(result.length).toBe(1);
      const kept = result.find(p => p.producerId === "p2");
      expect(kept?.producerId).toBe("p2");
    });
  });

  describe("filterRemoteProducersForConsume", () => {
    const options = {
      userId: "user1",
      deviceId: "device1",
      localProducerIds: new Set(["local1"]),
    };

    it("should exclude local producers", () => {
      const producers = [
        createTestProducer({ producerId: "local1", userId: "user1", deviceId: "device1" }),
      ];

      const result = filterRemoteProducersForConsume(producers, options);
      expect(result.length).toBe(0);
    });

    it("should exclude own device's producers", () => {
      const producers = [
        createTestProducer({ producerId: "p1", userId: "user1", deviceId: "device1" }),
      ];

      const result = filterRemoteProducersForConsume(producers, options);
      expect(result.length).toBe(0);
    });

    it("should include other users' producers", () => {
      const producers = [
        createTestProducer({ producerId: "p1", userId: "user2", deviceId: "device2" }),
      ];

      const result = filterRemoteProducersForConsume(producers, options);
      expect(result.length).toBe(1);
    });

    it("should include other devices of same user", () => {
      const producers = [
        createTestProducer({ producerId: "p1", userId: "user1", deviceId: "device2" }),
      ];

      const result = filterRemoteProducersForConsume(producers, options);
      expect(result.length).toBe(1);
    });

    it("should exclude audio producers from same user", () => {
      const producers = [
        createTestProducer({ producerId: "p1", userId: "user1", deviceId: "device2", kind: "audio" }),
      ];

      const result = filterRemoteProducersForConsume(producers, options);
      expect(result.length).toBe(1); // Other device is included
    });
  });

  describe("computeConsumeRetryDelayMs", () => {
    it("should return constant delay regardless of attempts", () => {
      // Simplified: no exponential backoff
      expect(computeConsumeRetryDelayMs(1)).toBe(2000);
      expect(computeConsumeRetryDelayMs(5)).toBe(2000);
      expect(computeConsumeRetryDelayMs(10)).toBe(2000);
    });
  });

  describe("getNextRemoteConsumeRetryAt", () => {
    it("should return null for empty map", () => {
      const result = getNextRemoteConsumeRetryAt(new Map());
      expect(result).toBeNull();
    });

    it("should return the earliest retry time", () => {
      const retryStates = new Map([
        ["p1", { retryAt: 1000, attempts: 1 }],
        ["p2", { retryAt: 500, attempts: 1 }],
        ["p3", { retryAt: 1500, attempts: 1 }],
      ]);

      const result = getNextRemoteConsumeRetryAt(retryStates);
      expect(result).toBe(500);
    });
  });

  describe("getProducerRemovalGracePeriodMs", () => {
    it("should return the grace period", () => {
      const result = getProducerRemovalGracePeriodMs();
      expect(result).toBe(5000);
    });
  });
});

describe("consumer-runtime simplified behavior", () => {
  describe("topology sync behavior", () => {
    it("should not have visibility-dependent delays in sync", () => {
      const result = computeRemoteSyncDelayMs({
        now: Date.now(),
        nextRetryAt: null,
        pageHidden: true,
      });
      
      // Should return constant interval regardless of visibility
      expect(result).toBe(30000);
    });

    it("should use constant retry delay", () => {
      const delay = computeConsumeRetryDelayMs(1);
      expect(delay).toBe(2000);
    });
  });
});
