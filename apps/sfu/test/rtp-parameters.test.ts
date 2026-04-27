import { describe, expect, it } from "vitest";
import {
  getUnexpectedSfuRtpParameterKeys,
  normalizeSfuRtpParameters,
} from "../src/rtp-parameters.js";

describe("SFU RTP parameter normalization", () => {
  it("drops mediasoup-only top-level keys and preserves the canonical wire payload", () => {
    const normalized = normalizeSfuRtpParameters({
      mid: "0",
      msid: "stream track",
      codecs: [
        {
          mimeType: "audio/opus",
          payloadType: 111,
          clockRate: 48_000,
          channels: 2,
          parameters: { useinbandfec: 1 },
          rtcpFeedback: [{ type: "transport-cc", parameter: "" }],
        },
      ],
      headerExtensions: [
        {
          uri: "urn:ietf:params:rtp-hdrext:sdes:mid",
          id: 4,
          encrypt: false,
          parameters: {},
        },
      ],
      encodings: [{ ssrc: 1234, active: true }],
      rtcp: { cname: "audio-cname", reducedSize: true, mux: true },
    } as unknown as import("mediasoup").types.RtpParameters);

    expect(normalized).toEqual({
      mid: "0",
      codecs: [
        {
          mimeType: "audio/opus",
          payloadType: 111,
          clockRate: 48_000,
          channels: 2,
          parameters: { useinbandfec: 1 },
          rtcpFeedback: [{ type: "transport-cc", parameter: "" }],
        },
      ],
      headerExtensions: [
        {
          uri: "urn:ietf:params:rtp-hdrext:sdes:mid",
          id: 4,
          encrypt: false,
          parameters: {},
        },
      ],
      encodings: [{ ssrc: 1234, active: true }],
      rtcp: { cname: "audio-cname", reducedSize: true, mux: true },
    });
  });

  it("reports stripped top-level keys deterministically", () => {
    expect(
      getUnexpectedSfuRtpParameterKeys({
        codecs: [],
        msid: "stream track",
        rtcp: {},
        custom: true,
      })
    ).toEqual(["custom", "msid"]);
  });
});
