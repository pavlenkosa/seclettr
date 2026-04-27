import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SFU_PROTOCOL_VERSION } from "@seclettr/protocol";
import { setAccessToken } from "@/lib/api";
import { createSfuHttpClient } from "@/calls/group/runtime/sfu/http-client";

describe("createSfuHttpClient", () => {
  beforeEach(() => {
    setAccessToken("access-token");
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends strict versioned request bodies to the SFU", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: SFU_PROTOCOL_VERSION,
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
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createSfuHttpClient({
      sfuBaseUrl: "https://sfu.test",
    });

    await client.createTransport({
      roomId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      direction: "send",
    });

    const requestBody = JSON.parse(
      String(
        (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"
      )
    ) as { version?: number };
    expect(requestBody.version).toBe(SFU_PROTOCOL_VERSION);
  });

  it("throws on unsupported SFU response versions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: SFU_PROTOCOL_VERSION + 1,
            rtpCapabilities: {
              codecs: [],
            },
          }),
          { status: 200 }
        )
      )
    );

    const client = createSfuHttpClient({
      sfuBaseUrl: "https://sfu.test",
    });

    await expect(
      client.getRouterRtpCapabilities(crypto.randomUUID())
    ).rejects.toThrow("Unsupported SFU protocol version");
  });
});
