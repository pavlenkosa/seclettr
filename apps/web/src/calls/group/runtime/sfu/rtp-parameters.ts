/**
 * rtp-parameters — mediasoup RTP parameter normalization for the SFU protocol.
 *
 * Owns:
 *   - SFU_RTP_PARAMETER_KEYS — expected set of top-level RTP parameter keys
 *   - getUnexpectedSfuRtpParameterKeys — validation helper to surface unknown keys
 *   - normalizeSfuRtpParameters — converts a MediasoupTypes.RtpParameters object to
 *     the SfuRtpParameters protocol shape, omitting optional fields that are undefined
 *     and normalizing codec / headerExtension / encoding / RTCP structures
 *
 * Does not own transport setup, producer creation, or codec negotiation.
 */
import type { SfuRtpParameters } from "@seclettr/protocol";
import type { types as MediasoupTypes } from "mediasoup-client";

const SFU_RTP_PARAMETER_KEYS = new Set<string>([
  "mid",
  "codecs",
  "headerExtensions",
  "encodings",
  "rtcp",
]);

export function getUnexpectedSfuRtpParameterKeys(
  rtpParameters: MediasoupTypes.RtpParameters
): string[] {
  return Object.keys(rtpParameters as Record<string, unknown>)
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
            ...(typeof encoding.active === "boolean" ? { active: encoding.active } : {}),
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
            ...(typeof rtpParameters.rtcp.mux === "boolean"
              ? { mux: rtpParameters.rtcp.mux }
              : {}),
          },
        }
      : {}),
  };
}
