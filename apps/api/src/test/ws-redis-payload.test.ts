import { describe, expect, it } from "vitest";
import { WS_PROTOCOL_VERSION } from "@seclettr/protocol";
import { parseRedisWsPayload } from "../services/ws-redis-payload.js";

describe("parseRedisWsPayload", () => {
  it("keeps recipientDeviceId from redis envelope and validates ws payload", () => {
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION,
        type: "pong",
        id: "ping-1",
        recipientDeviceId: "device-1",
      })
    );

    expect(parsed).toEqual({
      scope: "device",
      recipientDeviceId: "device-1",
      payload: { type: "pong", id: "ping-1" },
    });
  });

  it("parses presence broadcast payload without recipientDeviceId", () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION,
        scope: "presence.broadcast",
        type: "presence.update",
        userId,
        online: true,
      })
    );

    expect(parsed).toEqual({
      scope: "presence.broadcast",
      payload: {
        type: "presence.update",
        userId,
        online: true,
      },
    });
  });

  it("returns null when recipientDeviceId is missing", () => {
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION,
        type: "pong",
        id: "ping-2",
      })
    );

    expect(parsed).toBeNull();
  });

  it("returns null when presence scope is used for non-presence message", () => {
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION,
        scope: "presence.broadcast",
        type: "pong",
        id: "ping-3",
      })
    );

    expect(parsed).toBeNull();
  });

  it("returns null when payload fails schema validation", () => {
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION,
        type: "pong",
        recipientDeviceId: "device-2",
      })
    );

    expect(parsed).toBeNull();
  });

  it("returns null for malformed json", () => {
    const parsed = parseRedisWsPayload("{not-json");
    expect(parsed).toBeNull();
  });

  it("returns null for unsupported websocket protocol versions", () => {
    const parsed = parseRedisWsPayload(
      JSON.stringify({
        version: WS_PROTOCOL_VERSION + 1,
        type: "pong",
        id: "ping-4",
        recipientDeviceId: "device-4",
      })
    );

    expect(parsed).toBeNull();
  });
});
