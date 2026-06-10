import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROTOCOL_VERSION } from "@seclettr/protocol";

const mockSetAccessToken = vi.fn();
const mockIsNativePlatform = vi.fn(() => false);
const mockGetNativeRefreshToken = vi.fn(async () => null);
const mockGetNativeServerUrl = vi.fn(() => null);
const mockPostNativeAuthJson = vi.fn(async () => null);

vi.mock("@/lib/api", () => ({
  setAccessToken: mockSetAccessToken,
}));

vi.mock("@/lib/native-platform", () => ({
  isNativePlatform: mockIsNativePlatform,
  getNativeServerUrl: mockGetNativeServerUrl,
}));

vi.mock("@/lib/native-storage", () => ({
  getNativeRefreshToken: mockGetNativeRefreshToken,
  storeNativeRefreshToken: vi.fn(),
}));

vi.mock("@/lib/native-auth-http", () => ({
  postNativeAuthJson: mockPostNativeAuthJson,
}));

describe("refreshSessionAccessToken", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSetAccessToken.mockReset();
    mockIsNativePlatform.mockReset();
    mockIsNativePlatform.mockReturnValue(false);
    mockGetNativeServerUrl.mockReset();
    mockGetNativeServerUrl.mockReturnValue(null);
    mockGetNativeRefreshToken.mockReset();
    mockGetNativeRefreshToken.mockResolvedValue(null);
    mockPostNativeAuthJson.mockReset();
    mockPostNativeAuthJson.mockResolvedValue(null);
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
      headers: {},
    });
    expect(mockSetAccessToken).not.toHaveBeenCalled();
  });

  it("attaches the persisted native refresh token during refresh on native platforms", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeRefreshToken.mockResolvedValue("native-refresh-token");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "access-token-2" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshSessionAccessToken } = await import("@/lib/session");

    await expect(refreshSessionAccessToken()).resolves.toBe("access-token-2");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Refresh-Token": "native-refresh-token",
      },
    });
  });

  it("prefers native Capacitor HTTP during refresh on native platforms", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeRefreshToken.mockResolvedValue("native-refresh-token");
    mockPostNativeAuthJson.mockResolvedValue({
      status: 200,
      data: { accessToken: "native-access-token", refreshToken: "native-refresh-2" },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { refreshSessionAccessToken } = await import("@/lib/session");

    await expect(refreshSessionAccessToken()).resolves.toBe("native-access-token");
    expect(mockPostNativeAuthJson).toHaveBeenCalledWith("/auth/refresh", {
      headers: {
        "X-Refresh-Token": "native-refresh-token",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the refresh URL at call time so native cold-start hydration can change the target origin", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeServerUrl.mockReturnValue("https://stale.example");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "access-token-3" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshSessionAccessToken } = await import("@/lib/session");
    mockGetNativeServerUrl.mockReturnValue("https://restored.example");

    await expect(refreshSessionAccessToken()).resolves.toBe("access-token-3");
    expect(fetchMock).toHaveBeenCalledWith("https://restored.example/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {},
    });
  });

  it("attaches the persisted native refresh token during session preview on native platforms", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeRefreshToken.mockResolvedValue("native-refresh-token");

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
      headers: {
        "X-Refresh-Token": "native-refresh-token",
      },
    });
  });

  it("prefers native Capacitor HTTP during session preview on native platforms", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeRefreshToken.mockResolvedValue("native-refresh-token");
    mockPostNativeAuthJson.mockResolvedValue({
      status: 200,
      data: {
        version: AUTH_PROTOCOL_VERSION,
        userId: "11111111-1111-4111-8111-111111111111",
        deviceId: "22222222-2222-4222-8222-222222222222",
        user: {
          username: "alice",
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { previewRefreshSession } = await import("@/lib/session-preview");

    await expect(previewRefreshSession()).resolves.toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      username: "alice",
    });
    expect(mockPostNativeAuthJson).toHaveBeenCalledWith("/auth/session", {
      headers: {
        "X-Refresh-Token": "native-refresh-token",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the preview URL at call time so native cold-start hydration can change the target origin", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetNativeServerUrl.mockReturnValue("https://stale.example");

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
    mockGetNativeServerUrl.mockReturnValue("https://restored.example");

    await expect(previewRefreshSession()).resolves.toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      username: "alice",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://restored.example/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: {},
    });
  });
});
