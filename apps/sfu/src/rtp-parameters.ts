import type { SfuRtpParameters } from "@seclettr/protocol";
import type { types as MediasoupTypes } from "mediasoup";

const SFU_RTP_PARAMETER_KEYS = new Set<string>([
  "mid",
  "codecs",
  "headerExtensions",
  "encodings",
  "rtcp",
]);

export function getUnexpectedSfuRtpParameterKeys(
  rtpParameters: Partial<Record<string, unknown>>
): string[] {
  return Object.keys(rtpParameters)
    .filter((key) => !SFU_RTP_PARAMETER_KEYS.has(key))
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeSfuRtpParameters(
  rtpParameters: MediasoupTypes.RtpParameters
): SfuRtpParameters {
  return {
    ...(typeof rtpParameters.mid === "string" ? { mid: rtpParameters.mid } : {}),
    codecs: rtpParameters.codecs.map((codec) => ({
      mimeType: codec.mimeType,
      payloadType: codec.payloadType,
      clockRate: codec.clockRate,
      ...(typeof codec.channels === "number" ? { channels: codec.channels } : {}),
      ...(codec.parameters ? { parameters: { ...codec.parameters } } : {}),
      ...(codec.rtcpFeedback
        ? {
            rtcpFeedback: codec.rtcpFeedback.map((feedback) => ({
              type: feedback.type,
              ...(typeof feedback.parameter === "string"
                ? { parameter: feedback.parameter }
                : {}),
            })),
          }
        : {}),
    })),
    ...(rtpParameters.headerExtensions
      ? {
          headerExtensions: rtpParameters.headerExtensions.map((extension) => ({
            uri: extension.uri,
            id: extension.id,
            ...(typeof extension.encrypt === "boolean"
              ? { encrypt: extension.encrypt }
              : {}),
            ...(extension.parameters ? { parameters: { ...extension.parameters } } : {}),
          })),
        }
      : {}),
    ...(rtpParameters.encodings
      ? {
          encodings: rtpParameters.encodings.map((encoding) => ({
            ...(typeof (encoding as Record<string, unknown>)["active"] === "boolean"
              ? { active: (encoding as Record<string, unknown>)["active"] as boolean }
              : {}),
            ...(typeof encoding.ssrc === "number" ? { ssrc: encoding.ssrc } : {}),
            ...(typeof encoding.rid === "string" ? { rid: encoding.rid } : {}),
            ...(typeof encoding.codecPayloadType === "number"
              ? { codecPayloadType: encoding.codecPayloadType }
              : {}),
            ...(encoding.rtx && typeof encoding.rtx.ssrc === "number"
              ? { rtx: { ssrc: encoding.rtx.ssrc } }
              : {}),
            ...(typeof encoding.scalabilityMode === "string"
              ? { scalabilityMode: encoding.scalabilityMode }
              : {}),
            ...(typeof encoding.maxBitrate === "number"
              ? { maxBitrate: encoding.maxBitrate }
              : {}),
            ...(typeof encoding.dtx === "boolean" ? { dtx: encoding.dtx } : {}),
          })),
        }
      : {}),
    ...(rtpParameters.rtcp
      ? {
          rtcp: {
            ...(typeof rtpParameters.rtcp.cname === "string"
              ? { cname: rtpParameters.rtcp.cname }
              : {}),
            ...(typeof rtpParameters.rtcp.reducedSize === "boolean"
              ? { reducedSize: rtpParameters.rtcp.reducedSize }
              : {}),
            ...(typeof (rtpParameters.rtcp as Record<string, unknown>)["mux"] === "boolean"
              ? { mux: (rtpParameters.rtcp as Record<string, unknown>)["mux"] as boolean }
              : {}),
          },
        }
      : {}),
  };
}
