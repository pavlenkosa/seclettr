import { getAccessToken } from "@/lib/api";
import { refreshSessionAccessToken } from "@/lib/session";
import type { types as MediasoupTypes } from "mediasoup-client";
import type { ZodTypeAny } from "zod";
import {
  SFU_PROTOCOL_VERSION,
  SfuCloseProducerResponseSchema,
  SfuConsumeResponseSchema,
  SfuCreateTransportResponseSchema,
  SfuProduceResponseSchema,
  SfuRoomProducersResponseSchema,
  SfuRtpCapabilitiesResponseSchema,
  safeParseVersionedWire,
  type SfuCloseProducerRequest,
  type SfuConnectTransportRequest,
  type SfuCreateTransportResponse,
  type SfuCreateTransportRequest,
  type SfuConsumeResponse,
  type SfuProduceRequest,
  type SfuResumeConsumerRequest,
  type SfuRoomProducer,
} from "@seclettr/protocol";

const SFU_REQUEST_TIMEOUT_MS = 10_000;

interface SfuRequestOptions extends RequestInit {
  bodyJson?: unknown;
}

interface CreateSfuHttpClientOptions {
  sfuBaseUrl: string;
  /** If provided, use this token directly instead of reading from the auth store. */
  staticToken?: string;
}

type RawSfuHeaders = SfuRequestOptions["headers"];

export interface SfuHttpClient {
  getRouterRtpCapabilities: (
    roomId: string
  ) => Promise<MediasoupTypes.RtpCapabilities>;
  createTransport: (
    body: SfuCreateTransportRequest
  ) => Promise<SfuCreateTransportResponse>;
  connectTransport: (body: SfuConnectTransportRequest) => Promise<void>;
  produce: (body: SfuProduceRequest) => Promise<string>;
  closeProducer: (
    producerId: string,
    body: SfuCloseProducerRequest
  ) => Promise<void>;
  consume: (
    roomId: string,
    userId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: MediasoupTypes.RtpCapabilities
  ) => Promise<SfuConsumeResponse>;
  resumeConsumer: (
    consumerId: string,
    body: SfuResumeConsumerRequest
  ) => Promise<void>;
  listRoomProducers: (roomId: string) => Promise<SfuRoomProducer[]>;
  leaveRoomPeer: (roomId: string, userId: string) => Promise<void>;
  toTransportOptions: (
    response: SfuCreateTransportResponse
  ) => MediasoupTypes.TransportOptions;
}

function buildAuthHeaders(token: string, contentType = true): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  if (contentType) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function mergeSfuRequestHeaders(
  token: string,
  bodyJson: unknown,
  rawHeaders: RawSfuHeaders
): Headers {
  const headers = buildAuthHeaders(token, bodyJson !== undefined);
  if (rawHeaders instanceof Headers) {
    rawHeaders.forEach((value, key) => headers.set(key, value));
    return headers;
  }
  if (!rawHeaders) {
    return headers;
  }
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

async function readSfuErrorMessage(response: Response): Promise<string> {
  let message = `SFU request failed (${response.status})`;
  try {
    const text = await response.text();
    if (text.trim()) {
      message = text;
    }
  } catch {}
  return message;
}

async function readSfuResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readSfuErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function createSfuHttpClient(
  options: CreateSfuHttpClientOptions
): SfuHttpClient {
  const ensureSfuAccessToken = async (): Promise<string | null> => {
    if (options.staticToken) return options.staticToken;
    const token = getAccessToken();
    if (token) return token;
    // Shared refresh — deduplication across HTTP, WS, and SFU is in session.ts.
    return refreshSessionAccessToken();
  };

  const sfuRequest = async <T>(
    path: string,
    requestOptions: SfuRequestOptions = {},
    retry = true
  ): Promise<T> => {
    const { bodyJson, headers: rawHeaders, ...rest } = requestOptions;
    const token = await ensureSfuAccessToken();
    if (!token) {
      throw new Error("Missing access token for SFU request");
    }

    const response = await fetch(`${options.sfuBaseUrl}${path}`, {
      ...rest,
      headers: mergeSfuRequestHeaders(token, bodyJson, rawHeaders),
      credentials: "include",
      body: bodyJson === undefined ? rest.body : JSON.stringify(bodyJson),
      signal: rest.signal ?? AbortSignal.timeout(SFU_REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 && retry) {
      const refreshed = await refreshSessionAccessToken();
      if (refreshed) {
        return sfuRequest<T>(path, requestOptions, false);
      }
    }

    return readSfuResponse<T>(response);
  };

  const toTransportOptions = (
    response: SfuCreateTransportResponse
  ): MediasoupTypes.TransportOptions => {
    return {
      id: response.transportId,
      iceParameters: response.iceParameters as MediasoupTypes.IceParameters,
      iceCandidates: response.iceCandidates as MediasoupTypes.IceCandidate[],
      dtlsParameters: response.dtlsParameters as MediasoupTypes.DtlsParameters,
    };
  };

  const parseVersionedSfuPayload = <TSchema extends ZodTypeAny>(
    schema: TSchema,
    payload: unknown
  ) => {
    const parsed = safeParseVersionedWire(
      schema,
      payload,
      SFU_PROTOCOL_VERSION
    );
    if (!parsed.success) {
      throw new Error(
        parsed.error.code === "UNSUPPORTED_PROTOCOL_VERSION"
          ? `Unsupported SFU protocol version ${String(
              parsed.error.receivedVersion ?? "unknown"
            )}`
          : "Invalid SFU payload"
      );
    }
    return parsed.data;
  };

  return {
    toTransportOptions,
    getRouterRtpCapabilities: async (roomId) => {
      const result = await sfuRequest<unknown>(
        `/rooms/${encodeURIComponent(roomId)}/rtp-capabilities`,
        { method: "GET" }
      );
      return parseVersionedSfuPayload(SfuRtpCapabilitiesResponseSchema, result)
        .rtpCapabilities as MediasoupTypes.RtpCapabilities;
    },
    createTransport: async (body) => {
      const result = await sfuRequest<unknown>("/transports", {
        method: "POST",
        bodyJson: {
          version: SFU_PROTOCOL_VERSION,
          ...body,
        },
      });
      return parseVersionedSfuPayload(SfuCreateTransportResponseSchema, result);
    },
    connectTransport: async (body) => {
      const result = await sfuRequest<unknown>("/transports/connect", {
        method: "POST",
        bodyJson: {
          version: SFU_PROTOCOL_VERSION,
          ...body,
        },
      });
      parseVersionedSfuPayload(SfuCloseProducerResponseSchema, result);
    },
    produce: async (body) => {
      const result = await sfuRequest<unknown>("/produce", {
        method: "POST",
        bodyJson: {
          version: SFU_PROTOCOL_VERSION,
          ...body,
        },
      });
      return parseVersionedSfuPayload(SfuProduceResponseSchema, result)
        .producerId;
    },
    closeProducer: async (producerId, body) => {
      const result = await sfuRequest<unknown>(
        `/producers/${encodeURIComponent(producerId)}/close`,
        {
          method: "POST",
          bodyJson: {
            version: SFU_PROTOCOL_VERSION,
            ...body,
          },
        }
      );
      parseVersionedSfuPayload(SfuCloseProducerResponseSchema, result);
    },
    consume: async (
      roomId,
      userId,
      transportId,
      producerId,
      rtpCapabilities
    ) => {
      const result = await sfuRequest<unknown>("/consume", {
        method: "POST",
        bodyJson: {
          version: SFU_PROTOCOL_VERSION,
          roomId,
          userId,
          transportId,
          producerId,
          rtpCapabilities,
        },
      });
      return parseVersionedSfuPayload(SfuConsumeResponseSchema, result);
    },
    resumeConsumer: async (consumerId, body) => {
      const result = await sfuRequest<unknown>(
        `/consumers/${encodeURIComponent(consumerId)}/resume`,
        {
          method: "POST",
          bodyJson: {
            version: SFU_PROTOCOL_VERSION,
            ...body,
          },
        }
      );
      parseVersionedSfuPayload(SfuCloseProducerResponseSchema, result);
    },
    listRoomProducers: async (roomId) => {
      const result = await sfuRequest<unknown>(
        `/rooms/${encodeURIComponent(roomId)}/producers`,
        { method: "GET" }
      );
      return parseVersionedSfuPayload(SfuRoomProducersResponseSchema, result)
        .producers;
    },
    leaveRoomPeer: async (roomId, userId) => {
      const result = await sfuRequest<unknown>(
        `/rooms/${encodeURIComponent(roomId)}/peers/${encodeURIComponent(
          userId
        )}`,
        { method: "DELETE" }
      );
      parseVersionedSfuPayload(SfuCloseProducerResponseSchema, result);
    },
  };
}
