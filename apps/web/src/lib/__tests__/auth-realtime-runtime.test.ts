import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiPost = vi.fn();
const mockEnsurePushSubscription = vi.fn();
const mockUnsubscribePush = vi.fn();
const mockRefreshSessionAccessToken = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const setAuthErrorHandler = vi.fn();
const setWsAuthTokenProvider = vi.fn();

let authErrorHandler: (() => Promise<string | null>) | null = null;
let wsAuthTokenProvider: ((accessToken: string) => Promise<string | null>) | null = null;

vi.mock("@/lib/api", () => ({
  api: {
    post: mockApiPost,
  },
}));

vi.mock("@/lib/push", () => ({
  ensurePushSubscription: mockEnsurePushSubscription,
  unsubscribePush: mockUnsubscribePush,
}));

vi.mock("@/lib/session", () => ({
  refreshSessionAccessToken: mockRefreshSessionAccessToken,
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    connect: mockConnect,
    disconnect: mockDisconnect,
    setAuthErrorHandler: (handler: () => Promise<string | null>) => {
      authErrorHandler = handler;
      setAuthErrorHandler(handler);
    },
    setWsAuthTokenProvider: (provider: (accessToken: string) => Promise<string | null>) => {
      wsAuthTokenProvider = provider;
      setWsAuthTokenProvider(provider);
    },
  },
}));

describe("createAuthRealtimeRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authErrorHandler = null;
    wsAuthTokenProvider = null;
    mockEnsurePushSubscription.mockResolvedValue(undefined);
    mockUnsubscribePush.mockResolvedValue(undefined);
    mockRefreshSessionAccessToken.mockResolvedValue(null);
    mockApiPost.mockReset();
  });

  it("owns activation, suspend, and teardown side effects", async () => {
    const { createAuthRealtimeRuntime } = await import("@/lib/auth-realtime-runtime");
    const runtime = createAuthRealtimeRuntime({
      onAccessTokenRefreshed: vi.fn(),
      onSessionRefreshFailed: vi.fn(),
    });

    runtime.activate("access-token-1", "login");
    expect(mockConnect).toHaveBeenCalledWith("access-token-1");
    expect(mockEnsurePushSubscription).toHaveBeenCalledTimes(1);

    runtime.suspend("lock");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribePush).not.toHaveBeenCalled();

    await runtime.teardown("logout");
    expect(mockDisconnect).toHaveBeenCalledTimes(2);
    expect(mockUnsubscribePush).toHaveBeenCalledTimes(1);
  });

  it("refreshes the access token through the registered websocket auth handler", async () => {
    const onAccessTokenRefreshed = vi.fn();
    const onSessionRefreshFailed = vi.fn();
    const { createAuthRealtimeRuntime } = await import("@/lib/auth-realtime-runtime");
    createAuthRealtimeRuntime({
      onAccessTokenRefreshed,
      onSessionRefreshFailed,
    });

    expect(authErrorHandler).not.toBeNull();

    mockRefreshSessionAccessToken.mockResolvedValueOnce("access-token-2");
    await expect(authErrorHandler?.()).resolves.toBe("access-token-2");
    expect(onAccessTokenRefreshed).toHaveBeenCalledWith("access-token-2");
    expect(onSessionRefreshFailed).not.toHaveBeenCalled();

    mockRefreshSessionAccessToken.mockResolvedValueOnce(null);
    await expect(authErrorHandler?.()).resolves.toBeNull();
    expect(onSessionRefreshFailed).toHaveBeenCalledTimes(1);
  });

  it("coalesces ws-ticket fetches and clears cached tickets when suspended", async () => {
    const { createAuthRealtimeRuntime } = await import("@/lib/auth-realtime-runtime");
    const runtime = createAuthRealtimeRuntime({
      onAccessTokenRefreshed: vi.fn(),
      onSessionRefreshFailed: vi.fn(),
    });

    expect(wsAuthTokenProvider).not.toBeNull();
    const provider = wsAuthTokenProvider!;

    let resolveTicket!: (value: {
      wsToken: string;
      expiresInSec: number;
    }) => void;
    const pendingTicket = new Promise<{ wsToken: string; expiresInSec: number }>((resolve) => {
      resolveTicket = resolve;
    });
    mockApiPost.mockReturnValueOnce(pendingTicket);

    const firstRequest = provider("access-token-1");
    const secondRequest = provider("access-token-1");
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    resolveTicket({ wsToken: "ws-ticket-1", expiresInSec: 60 });

    await expect(firstRequest).resolves.toBe("ws-ticket-1");
    await expect(secondRequest).resolves.toBe("ws-ticket-1");

    await expect(provider("access-token-1")).resolves.toBe("ws-ticket-1");
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    runtime.suspend("disconnect");

    mockApiPost.mockResolvedValueOnce({ wsToken: "ws-ticket-2", expiresInSec: 60 });
    await expect(provider("access-token-1")).resolves.toBe("ws-ticket-2");
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed ws-ticket payloads instead of trusting them", async () => {
    const { createAuthRealtimeRuntime } = await import("@/lib/auth-realtime-runtime");
    createAuthRealtimeRuntime({
      onAccessTokenRefreshed: vi.fn(),
      onSessionRefreshFailed: vi.fn(),
    });

    expect(wsAuthTokenProvider).not.toBeNull();

    mockApiPost.mockResolvedValueOnce({ wsToken: 42, expiresInSec: "60" });
    await expect(wsAuthTokenProvider?.("access-token-1")).resolves.toBeNull();

    mockApiPost.mockResolvedValueOnce({ wsToken: "ws-ticket-3", expiresInSec: 60 });
    await expect(wsAuthTokenProvider?.("access-token-1")).resolves.toBe("ws-ticket-3");
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });
});
