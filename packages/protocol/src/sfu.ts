import { z } from "zod";
import {
  type JsonObject,
  JsonObjectSchema,
  SFU_PROTOCOL_VERSION,
  type StripVersion,
  wireObject,
  versionedWireObject,
} from "./common.js";

export { SFU_PROTOCOL_VERSION } from "./common.js";

const SfuRtcpFeedbackSchema = wireObject({
  type: z.string().min(1).max(64),
  parameter: z.string().max(128).optional(),
});

const SfuRtpCodecCapabilitySchema = wireObject({
  kind: z.enum(["audio", "video"]),
  mimeType: z.string().min(1).max(128),
  preferredPayloadType: z.number().int().min(0).max(127).optional(),
  clockRate: z.number().int().positive(),
  channels: z.number().int().positive().optional(),
  parameters: JsonObjectSchema.optional(),
  rtcpFeedback: z.array(SfuRtcpFeedbackSchema).optional(),
});

const SfuRtpHeaderExtensionSchema = wireObject({
  kind: z.enum(["audio", "video"]),
  uri: z.string().min(1).max(512),
  preferredId: z.number().int().positive(),
  preferredEncrypt: z.boolean().optional(),
  direction: z
    .enum(["sendrecv", "sendonly", "recvonly", "inactive"])
    .optional(),
});

export const SfuRtpCapabilitiesSchema = wireObject({
  codecs: z.array(SfuRtpCodecCapabilitySchema),
  headerExtensions: z.array(SfuRtpHeaderExtensionSchema).optional(),
  fecMechanisms: z.array(z.string().min(1).max(64)).optional(),
});
export type SfuRtpCapabilities = z.infer<typeof SfuRtpCapabilitiesSchema>;

export const SfuIceParametersSchema = wireObject({
  usernameFragment: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
  iceLite: z.boolean().optional(),
});
export type SfuIceParameters = z.infer<typeof SfuIceParametersSchema>;

export const SfuIceCandidateSchema = wireObject({
  foundation: z.string().min(1).max(128),
  priority: z.number().int().nonnegative(),
  ip: z.string().min(1).max(256),
  address: z.string().min(1).max(256).optional(),
  protocol: z.enum(["udp", "tcp"]),
  port: z.number().int().positive().max(65535),
  type: z.enum(["host", "srflx", "prflx", "relay"]),
  tcpType: z.enum(["active", "passive", "so"]).optional(),
});
export type SfuIceCandidate = z.infer<typeof SfuIceCandidateSchema>;

const SfuDtlsFingerprintSchema = wireObject({
  algorithm: z.string().min(1).max(64),
  value: z.string().min(1).max(512),
});

export const SfuDtlsParametersSchema = wireObject({
  role: z.enum(["auto", "client", "server"]).optional(),
  fingerprints: z.array(SfuDtlsFingerprintSchema).min(1),
});
export type SfuDtlsParameters = z.infer<typeof SfuDtlsParametersSchema>;

const SfuRtpCodecParametersSchema = wireObject({
  mimeType: z.string().min(1).max(128),
  payloadType: z.number().int().min(0).max(127),
  clockRate: z.number().int().positive(),
  channels: z.number().int().positive().optional(),
  parameters: JsonObjectSchema.optional(),
  rtcpFeedback: z.array(SfuRtcpFeedbackSchema).optional(),
});

const SfuRtpHeaderExtensionParametersSchema = wireObject({
  uri: z.string().min(1).max(512),
  id: z.number().int().positive(),
  encrypt: z.boolean().optional(),
  parameters: JsonObjectSchema.optional(),
});

const SfuRtpEncodingRtxSchema = wireObject({
  ssrc: z.number().int().nonnegative(),
});

const SfuRtpEncodingParametersSchema = wireObject({
  ssrc: z.number().int().nonnegative().optional(),
  rid: z.string().min(1).max(64).optional(),
  codecPayloadType: z.number().int().min(0).max(127).optional(),
  rtx: SfuRtpEncodingRtxSchema.optional(),
  scalabilityMode: z.string().min(1).max(64).optional(),
  maxBitrate: z.number().int().nonnegative().optional(),
  dtx: z.boolean().optional(),
  active: z.boolean().optional(),
});

const SfuRtcpParametersSchema = wireObject({
  cname: z.string().min(1).max(256).optional(),
  reducedSize: z.boolean().optional(),
  mux: z.boolean().optional(),
});

export const SfuRtpParametersSchema = wireObject({
  mid: z.string().min(1).max(64).optional(),
  codecs: z.array(SfuRtpCodecParametersSchema).min(1),
  headerExtensions: z.array(SfuRtpHeaderExtensionParametersSchema).optional(),
  encodings: z.array(SfuRtpEncodingParametersSchema).min(1).optional(),
  rtcp: SfuRtcpParametersSchema.optional(),
});
export type SfuRtpParameters = z.infer<typeof SfuRtpParametersSchema>;

export const SfuProducerSourceSchema = z.enum(["camera", "screen"]);
export type SfuProducerSource = z.infer<typeof SfuProducerSourceSchema>;

export const SfuRoomAccessResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    ok: z.literal(true),
  }
);
export type SfuRoomAccessResponseWire = z.infer<
  typeof SfuRoomAccessResponseSchema
>;
export type SfuRoomAccessResponse = StripVersion<SfuRoomAccessResponseWire>;

export const SfuRtpCapabilitiesResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    rtpCapabilities: SfuRtpCapabilitiesSchema,
  }
);
export type SfuRtpCapabilitiesResponseWire = z.infer<
  typeof SfuRtpCapabilitiesResponseSchema
>;
export type SfuRtpCapabilitiesResponse =
  StripVersion<SfuRtpCapabilitiesResponseWire>;

export const SfuCreateTransportRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
    userId: z.string().uuid(),
    direction: z.enum(["send", "recv"]),
  }
);
export type SfuCreateTransportRequestWire = z.infer<
  typeof SfuCreateTransportRequestSchema
>;
export type SfuCreateTransportRequest =
  StripVersion<SfuCreateTransportRequestWire>;

export const SfuCreateTransportResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    transportId: z.string().min(1).max(256),
    iceParameters: SfuIceParametersSchema,
    iceCandidates: z.array(SfuIceCandidateSchema),
    dtlsParameters: SfuDtlsParametersSchema,
  }
);
export type SfuCreateTransportResponseWire = z.infer<
  typeof SfuCreateTransportResponseSchema
>;
export type SfuCreateTransportResponse =
  StripVersion<SfuCreateTransportResponseWire>;

export const SfuConnectTransportRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
    transportId: z.string().min(1).max(256),
    dtlsParameters: SfuDtlsParametersSchema,
  }
);
export type SfuConnectTransportRequestWire = z.infer<
  typeof SfuConnectTransportRequestSchema
>;
export type SfuConnectTransportRequest =
  StripVersion<SfuConnectTransportRequestWire>;

export const SfuConnectTransportResponseSchema = SfuRoomAccessResponseSchema;
export type SfuConnectTransportResponseWire = z.infer<
  typeof SfuConnectTransportResponseSchema
>;
export type SfuConnectTransportResponse =
  StripVersion<SfuConnectTransportResponseWire>;

export const SfuProduceRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
    transportId: z.string().min(1).max(256),
    kind: z.enum(["audio", "video"]),
    source: SfuProducerSourceSchema.optional(),
    rtpParameters: SfuRtpParametersSchema,
  }
).superRefine((value, ctx) => {
  if (value.kind === "video" && !value.source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Video producer requests require source",
      path: ["source"],
    });
    return;
  }
  if (value.kind === "audio" && value.source !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Audio producer requests must not declare video source",
      path: ["source"],
    });
  }
});
export type SfuProduceRequestWire = z.infer<typeof SfuProduceRequestSchema>;
export type SfuProduceRequest = StripVersion<SfuProduceRequestWire>;

export const SfuProduceResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    producerId: z.string().min(1).max(256),
  }
);
export type SfuProduceResponseWire = z.infer<typeof SfuProduceResponseSchema>;
export type SfuProduceResponse = StripVersion<SfuProduceResponseWire>;

export const SfuCloseProducerRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
  }
);
export type SfuCloseProducerRequestWire = z.infer<
  typeof SfuCloseProducerRequestSchema
>;
export type SfuCloseProducerRequest = StripVersion<SfuCloseProducerRequestWire>;

export const SfuCloseProducerResponseSchema = SfuRoomAccessResponseSchema;
export type SfuCloseProducerResponseWire = z.infer<
  typeof SfuCloseProducerResponseSchema
>;
export type SfuCloseProducerResponse =
  StripVersion<SfuCloseProducerResponseWire>;

export const SfuConsumeRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
    userId: z.string().uuid(),
    transportId: z.string().min(1).max(256),
    producerId: z.string().min(1).max(256),
    rtpCapabilities: SfuRtpCapabilitiesSchema,
  }
);
export type SfuConsumeRequestWire = z.infer<typeof SfuConsumeRequestSchema>;
export type SfuConsumeRequest = StripVersion<SfuConsumeRequestWire>;

export const SfuConsumeResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    consumerId: z.string().min(1).max(256),
    producerId: z.string().min(1).max(256),
    kind: z.enum(["audio", "video"]),
    rtpParameters: SfuRtpParametersSchema,
  }
);
export type SfuConsumeResponseWire = z.infer<typeof SfuConsumeResponseSchema>;
export type SfuConsumeResponse = StripVersion<SfuConsumeResponseWire>;

export const SfuResumeConsumerRequestSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    roomId: z.string().uuid(),
    userId: z.string().uuid(),
  }
);
export type SfuResumeConsumerRequestWire = z.infer<
  typeof SfuResumeConsumerRequestSchema
>;
export type SfuResumeConsumerRequest =
  StripVersion<SfuResumeConsumerRequestWire>;

export const SfuResumeConsumerResponseSchema = SfuRoomAccessResponseSchema;
export type SfuResumeConsumerResponseWire = z.infer<
  typeof SfuResumeConsumerResponseSchema
>;
export type SfuResumeConsumerResponse =
  StripVersion<SfuResumeConsumerResponseWire>;

export const SfuRoomProducerSchema = wireObject({
  producerId: z.string().min(1).max(256),
  userId: z.string().uuid(),
  deviceId: z.string().uuid().optional(),
  sessionId: z.string().min(1).max(256).optional(),
  kind: z.enum(["audio", "video"]),
  source: SfuProducerSourceSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "video" && !value.source) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Video room producers require source",
      path: ["source"],
    });
    return;
  }
  if (value.kind === "audio" && value.source !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Audio room producers must not declare video source",
      path: ["source"],
    });
  }
});
export type SfuRoomProducer = z.infer<typeof SfuRoomProducerSchema>;

export const SfuRoomProducersResponseSchema = versionedWireObject(
  SFU_PROTOCOL_VERSION,
  {
    producers: z.array(SfuRoomProducerSchema),
  }
);
export type SfuRoomProducersResponseWire = z.infer<
  typeof SfuRoomProducersResponseSchema
>;
export type SfuRoomProducersResponse =
  StripVersion<SfuRoomProducersResponseWire>;

export type SfuOpaqueJson = JsonObject;
