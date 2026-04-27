import { describe, expect, it } from "vitest";
import {
  SFU_PROTOCOL_VERSION,
  SfuConnectTransportRequestSchema,
  SfuConnectTransportResponseSchema,
  SfuConsumeRequestSchema,
  SfuConsumeResponseSchema,
  SfuCreateTransportRequestSchema,
  SfuCreateTransportResponseSchema,
  SfuProduceRequestSchema,
  SfuProduceResponseSchema,
  SfuRoomProducersResponseSchema,
  SfuRtpCapabilitiesResponseSchema,
} from "../sfu.js";

function withSfuVersion<T extends Record<string, unknown>>(payload: T) {
  return {
    version: SFU_PROTOCOL_VERSION,
    ...payload,
  };
}

describe("SFU contract schemas", () => {
  it("accepts canonical transport and media payloads", () => {
    const roomId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    expect(
      SfuCreateTransportRequestSchema.safeParse(
        withSfuVersion({
          roomId,
          userId,
          direction: "send",
        })
      ).success
    ).toBe(true);

    expect(
      SfuCreateTransportResponseSchema.safeParse(
        withSfuVersion({
          transportId: "transport-1",
          iceParameters: {
            usernameFragment: "ufrag",
            password: "password-1",
          },
          iceCandidates: [
            {
              foundation: "foundation-1",
              priority: 1,
              ip: "127.0.0.1",
              protocol: "udp",
              port: 40000,
              type: "host",
            },
          ],
          dtlsParameters: {
            fingerprints: [{ algorithm: "sha-256", value: "AA:BB" }],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuConnectTransportRequestSchema.safeParse(
        withSfuVersion({
          roomId,
          transportId: "transport-1",
          dtlsParameters: {
            role: "auto",
            fingerprints: [{ algorithm: "sha-256", value: "AA:BB" }],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuConnectTransportResponseSchema.safeParse(
        withSfuVersion({
          ok: true,
        })
      ).success
    ).toBe(true);

    expect(
      SfuProduceRequestSchema.safeParse(
        withSfuVersion({
          roomId,
          transportId: "transport-1",
          kind: "video",
          source: "screen",
          rtpParameters: {
            codecs: [
              {
                mimeType: "video/VP8",
                payloadType: 96,
                clockRate: 90000,
              },
            ],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuProduceResponseSchema.safeParse(
        withSfuVersion({
          producerId: "producer-1",
        })
      ).success
    ).toBe(true);

    expect(
      SfuConsumeRequestSchema.safeParse(
        withSfuVersion({
          roomId,
          userId,
          transportId: "transport-2",
          producerId: "producer-1",
          rtpCapabilities: {
            codecs: [
              {
                kind: "video",
                mimeType: "video/VP8",
                clockRate: 90000,
              },
            ],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuConsumeResponseSchema.safeParse(
        withSfuVersion({
          consumerId: "consumer-1",
          producerId: "producer-1",
          kind: "audio",
          rtpParameters: {
            codecs: [
              {
                mimeType: "audio/opus",
                payloadType: 111,
                clockRate: 48000,
                channels: 2,
              },
            ],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuRtpCapabilitiesResponseSchema.safeParse(
        withSfuVersion({
          rtpCapabilities: {
            codecs: [
              {
                kind: "audio",
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2,
              },
            ],
          },
        })
      ).success
    ).toBe(true);

    expect(
      SfuRoomProducersResponseSchema.safeParse(
        withSfuVersion({
          producers: [
            {
              producerId: "producer-1",
              userId,
              deviceId: crypto.randomUUID(),
              sessionId: "session-1",
              kind: "video",
              source: "screen",
            },
          ],
        })
      ).success
    ).toBe(true);
  });

  it("rejects malformed room producer records", () => {
    const parsed = SfuRoomProducersResponseSchema.safeParse(
      withSfuVersion({
        producers: [
          {
            producerId: "producer-1",
            userId: "not-a-uuid",
            kind: "screen",
          },
        ],
      })
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects video producer boundaries that omit source", () => {
    const roomId = crypto.randomUUID();

    expect(
      SfuProduceRequestSchema.safeParse(
        withSfuVersion({
          roomId,
          transportId: "transport-1",
          kind: "video",
          rtpParameters: {
            codecs: [
              {
                mimeType: "video/VP8",
                payloadType: 96,
                clockRate: 90000,
              },
            ],
          },
        })
      ).success
    ).toBe(false);

    expect(
      SfuRoomProducersResponseSchema.safeParse(
        withSfuVersion({
          producers: [
            {
              producerId: "producer-1",
              userId: crypto.randomUUID(),
              kind: "video",
            },
          ],
        })
      ).success
    ).toBe(false);
  });

  it("rejects unsupported protocol versions and malformed boundary payloads", () => {
    expect(
      SfuCreateTransportRequestSchema.safeParse({
        version: SFU_PROTOCOL_VERSION + 1,
        roomId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        direction: "send",
      }).success
    ).toBe(false);

    expect(
      SfuCreateTransportResponseSchema.safeParse(
        withSfuVersion({
          transportId: "transport-1",
          iceParameters: { usernameFragment: "ufrag", password: "pw" },
          iceCandidates: [
            {
              foundation: "foundation-1",
              protocol: "udp",
              port: 40000,
              type: "host",
            },
          ],
          dtlsParameters: {
            fingerprints: [{ algorithm: "sha-256", value: "AA:BB" }],
          },
        })
      ).success
    ).toBe(false);
  });
});
