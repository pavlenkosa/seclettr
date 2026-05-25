import { describe, expect, it } from "vitest";
import { buildRemoteMediaSnapshot } from "@/calls/group/runtime/media-key/remote-media";

function createFakeStream(label: string): MediaStream {
  return { id: label } as unknown as MediaStream;
}

describe("buildRemoteMediaSnapshot", () => {
  it("keeps separate camera and screen tiles while attaching audio only once", () => {
    const remoteMediaByUserId = new Map([
      ["user-1", {
        userId: "user-1",
        audioStreamsByProducerId: new Map([["audio-1", createFakeStream("audio-1")]]),
        videoSlotsByProducerId: new Map([
          ["screen-1", {
            producerId: "screen-1",
            stream: createFakeStream("screen-stream"),
            source: "screen" as const,
            deviceId: "device-1",
          }],
          ["camera-1", {
            producerId: "camera-1",
            stream: createFakeStream("camera-stream"),
            source: "camera" as const,
            deviceId: "device-1",
          }],
        ]),
      }],
    ]);

    const snapshot = buildRemoteMediaSnapshot(remoteMediaByUserId);

    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]!).toMatchObject({
      mediaId: "user-1:camera-1",
      userId: "user-1",
      deviceId: "device-1",
      hasAudio: true,
      hasVideo: true,
      videoSource: "camera",
    });
    expect(snapshot[0]!.audioStream).toBe(remoteMediaByUserId.get("user-1")!.audioStreamsByProducerId.get("audio-1"));
    expect(snapshot[1]!).toMatchObject({
      mediaId: "user-1:screen-1",
      userId: "user-1",
      deviceId: "device-1",
      hasAudio: false,
      hasVideo: true,
      videoSource: "screen",
    });
    expect(snapshot[1]!.audioStream).toBeNull();
  });

  it("emits audio-only tile when no remote video is present", () => {
    const remoteMediaByUserId = new Map([
      ["user-2", {
        userId: "user-2",
        audioStreamsByProducerId: new Map([["audio-2", createFakeStream("audio-2")]]),
        videoSlotsByProducerId: new Map(),
      }],
    ]);

    const snapshot = buildRemoteMediaSnapshot(remoteMediaByUserId);

    expect(snapshot).toEqual([
      {
        mediaId: "user-2:audio",
        userId: "user-2",
        deviceId: null,
        hasAudio: true,
        hasVideo: false,
        audioStream: remoteMediaByUserId.get("user-2")!.audioStreamsByProducerId.get("audio-2"),
        videoStream: null,
        videoSource: null,
      },
    ]);
  });
});

describe("dedupeRemoteProducersBySlot", () => {
  it("keeps only the latest producer for the same user/device/source slot", async () => {
    const { dedupeRemoteProducersBySlot } = await import("@/calls/group/runtime/sfu/remote-producers");

    const deduped = dedupeRemoteProducersBySlot([
      {
        producerId: "camera-old",
        userId: "user-1",
        deviceId: "device-1",
        kind: "video",
        source: "camera",
      },
      {
        producerId: "camera-new",
        userId: "user-1",
        deviceId: "device-1",
        kind: "video",
        source: "camera",
      },
      {
        producerId: "screen-1",
        userId: "user-1",
        deviceId: "device-1",
        kind: "video",
        source: "screen",
      },
    ]);

    expect(deduped).toEqual([
      {
        producerId: "camera-new",
        userId: "user-1",
        deviceId: "device-1",
        kind: "video",
        source: "camera",
      },
      {
        producerId: "screen-1",
        userId: "user-1",
        deviceId: "device-1",
        kind: "video",
        source: "screen",
      },
    ]);
  });
});

describe("filterRemoteProducersForConsume", () => {
  it("filters out local producer IDs and same user+device producers", async () => {
    const { filterRemoteProducersForConsume } = await import("@/calls/group/runtime/sfu/remote-producers");

    const filtered = filterRemoteProducersForConsume(
      [
        {
          producerId: "local-camera",
          userId: "user-1",
          deviceId: "device-1",
          kind: "video",
          source: "camera",
        },
        {
          producerId: "same-device-remote",
          userId: "user-1",
          deviceId: "device-1",
          kind: "video",
          source: "screen",
        },
        {
          producerId: "other-device",
          userId: "user-1",
          deviceId: "device-2",
          kind: "video",
          source: "camera",
        },
        {
          producerId: "other-user",
          userId: "user-2",
          deviceId: "device-9",
          kind: "audio",
        },
      ],
      {
        userId: "user-1",
        deviceId: "device-1",
        localProducerIds: new Set(["local-camera"]),
      }
    );

    expect(filtered).toEqual([
      {
        producerId: "other-device",
        userId: "user-1",
        deviceId: "device-2",
        kind: "video",
        source: "camera",
      },
      {
        producerId: "other-user",
        userId: "user-2",
        deviceId: "device-9",
        kind: "audio",
      },
    ]);
  });
});

describe("computeConsumeRetryDelayMs", () => {
  it("uses constant delay for consume retries (simplified)", async () => {
    const { computeConsumeRetryDelayMs } = await import("@/calls/group/runtime/sfu/remote-producers");

    // Simplified: no exponential backoff, constant 2s delay
    expect(computeConsumeRetryDelayMs(1)).toBe(2_000);
    expect(computeConsumeRetryDelayMs(2)).toBe(2_000);
    expect(computeConsumeRetryDelayMs(3)).toBe(2_000);
    expect(computeConsumeRetryDelayMs(8)).toBe(2_000);
    expect(computeConsumeRetryDelayMs(0)).toBe(2_000);
    expect(computeConsumeRetryDelayMs(999)).toBe(2_000);
  });
});

describe("getNextRemoteConsumeRetryAt", () => {
  it("returns the earliest scheduled retry timestamp", async () => {
    const { getNextRemoteConsumeRetryAt } = await import("@/calls/group/runtime/sfu/remote-producers");

    expect(
      getNextRemoteConsumeRetryAt(
        new Map([
          ["producer-a", { retryAt: 15_000, attempts: 1 }],
          ["producer-b", { retryAt: 9_000, attempts: 2 }],
          ["producer-c", { retryAt: 30_000, attempts: 3 }],
        ])
      )
    ).toBe(9_000);
    expect(getNextRemoteConsumeRetryAt(new Map())).toBeNull();
  });
});

describe("computeRemoteSyncDelayMs", () => {
  it("uses constant reconciliation interval (simplified)", async () => {
    const { computeRemoteSyncDelayMs } = await import("@/calls/group/runtime/sfu/remote-producers");

    // Simplified: no visibility-dependent delays, constant 30s interval
    expect(
      computeRemoteSyncDelayMs({
        now: 1_000,
        nextRetryAt: null,
        pageHidden: false,
      })
    ).toBe(30_000);
    expect(
      computeRemoteSyncDelayMs({
        now: 1_000,
        nextRetryAt: null,
        pageHidden: true,
      })
    ).toBe(30_000);
  });

  it("returns constant interval regardless of retry timing", async () => {
    const { computeRemoteSyncDelayMs } = await import("@/calls/group/runtime/sfu/remote-producers");

    // Simplified: no dynamic scheduling based on retry times
    expect(
      computeRemoteSyncDelayMs({
        now: 5_000,
        nextRetryAt: 8_000,
        pageHidden: false,
      })
    ).toBe(30_000);
    expect(
      computeRemoteSyncDelayMs({
        now: 5_000,
        nextRetryAt: 50_000,
        pageHidden: false,
      })
    ).toBe(30_000);
    expect(
      computeRemoteSyncDelayMs({
        now: 5_000,
        nextRetryAt: 25_000,
        pageHidden: true,
      })
    ).toBe(30_000);
  });
});
