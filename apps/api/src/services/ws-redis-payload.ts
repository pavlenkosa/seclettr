import {
  safeParseWsServerMessage,
  type WsServerMessage,
} from "@seclettr/protocol";

interface ParsedRedisWsDevicePayload {
  scope: "device";
  recipientDeviceId: string;
  payload: WsServerMessage;
}

interface ParsedRedisWsPresencePayload {
  scope: "presence.broadcast";
  payload: Extract<WsServerMessage, { type: "presence.update" }>;
}

interface ParsedRedisWsForceDisconnectPayload {
  scope: "device.force_disconnect";
  deviceId: string;
}

interface ParsedRedisWsUserPayload {
  scope: "user";
  recipientUserId: string;
  payload: WsServerMessage;
}

export type ParsedRedisWsPayload =
  | ParsedRedisWsDevicePayload
  | ParsedRedisWsPresencePayload
  | ParsedRedisWsForceDisconnectPayload
  | ParsedRedisWsUserPayload;

export function parseRedisWsPayload(
  rawPayload: string
): ParsedRedisWsPayload | null {
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawPayload) as unknown;
  } catch {
    return null;
  }

  if (!parsedPayload || typeof parsedPayload !== "object") {
    return null;
  }

  const scopeRaw =
    "scope" in parsedPayload
      ? (parsedPayload as { scope?: unknown }).scope
      : undefined;

  // Handle control payloads that are not WsServerMessages.
  if (scopeRaw === "device.force_disconnect") {
    const deviceIdRaw = (parsedPayload as { deviceId?: unknown }).deviceId;
    if (typeof deviceIdRaw !== "string" || !deviceIdRaw) return null;
    return { scope: "device.force_disconnect", deviceId: deviceIdRaw };
  }

  const payloadEnvelope = {
    ...(parsedPayload as Record<string, unknown>),
  };
  delete payloadEnvelope["scope"];
  delete payloadEnvelope["recipientDeviceId"];
  delete payloadEnvelope["recipientUserId"];

  const payloadResult = safeParseWsServerMessage(payloadEnvelope);
  if (!payloadResult.success) {
    return null;
  }
  const payload = payloadResult.data;

  if (scopeRaw === "presence.broadcast") {
    if (payload.type !== "presence.update") {
      return null;
    }
    return {
      scope: "presence.broadcast",
      payload,
    };
  }

  if (scopeRaw === "user") {
    const recipientUserIdRaw =
      "recipientUserId" in parsedPayload
        ? (parsedPayload as { recipientUserId?: unknown }).recipientUserId
        : null;
    const recipientUserId =
      typeof recipientUserIdRaw === "string" ? recipientUserIdRaw : null;
    if (!recipientUserId) return null;
    return { scope: "user", recipientUserId, payload };
  }

  const recipientDeviceIdRaw =
    "recipientDeviceId" in parsedPayload
      ? (parsedPayload as { recipientDeviceId?: unknown }).recipientDeviceId
      : null;
  const recipientDeviceId =
    typeof recipientDeviceIdRaw === "string" ? recipientDeviceIdRaw : null;
  if (!recipientDeviceId) {
    return null;
  }

  return {
    scope: "device",
    recipientDeviceId,
    payload,
  };
}
