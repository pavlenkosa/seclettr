import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROTOCOL_VERSION } from "@seclettr/protocol";

const mockSetAccessToken = vi.fn();

vi.mock("@/lib/api", () => ({
  setAccessToken: mockSetAccessToken,
}));

describe("refreshSessionAccessToken", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSetAccessToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the session when refresh returns a malformed payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 123 }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    );

    const { refreshSessionAccessToken } = await import("@/lib/session");

    await expect(refreshSessionAccessToken()).resolves.toBeNull();
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
  });

  it("accepts only a non-empty string token from refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "access-token-1" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    );

    const { refreshSessionAccessToken } = await import("@/lib/session");

    await expect(refreshSessionAccessToken()).resolves.toBe("access-token-1");
    expect(mockSetAccessToken).toHaveBeenCalledWith("access-token-1");
  });

  it("previews a refresh session without mutating the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        version: AUTH_PROTOCOL_VERSION,
        userId: "11111111-1111-4111-8111-111111111111",
        deviceId: "22222222-2222-4222-8222-222222222222",
        user: {
          username: "alice",
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { previewRefreshSession } = await import("@/lib/session-preview");

    await expect(previewRefreshSession()).resolves.toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      username: "alice",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      method: "POST",
      credentials: "include",
    });
    expect(mockSetAccessToken).not.toHaveBeenCalled();
  });
});
