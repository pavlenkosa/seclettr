import { api } from "@/lib/api";
import { logger } from "@/lib/logger.js";
import { ensurePushSubscription, unsubscribePush } from "@/lib/push";
import { refreshSessionAccessToken } from "@/lib/session";
import { wsClient } from "@/lib/websocket";

interface CachedWsTicket {
  token: string;
  expiresAtMs: number;
  accessToken: string;
}

interface AuthRealtimeRuntimeOptions {
  onAccessTokenRefreshed: (accessToken: string) => void;
  onSessionRefreshFailed: () => void;
}

export interface AuthRealtimeRuntime {
  activate: (accessToken: string, source: string) => void;
  suspend: (source: string) => void;
  teardown: (source: string) => Promise<void>;
  clearTransientState: () => void;
}

function parseWsTicketResponse(
  payload: unknown
): { wsToken: string; expiresInSec?: number } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    wsToken?: unknown;
    expiresInSec?: unknown;
  };

  if (
    typeof candidate.wsToken !== "string" ||
    candidate.wsToken.length === 0
  ) {
    return null;
  }

  return {
    wsToken: candidate.wsToken,
    expiresInSec:
      typeof candidate.expiresInSec === "number" &&
      Number.isFinite(candidate.expiresInSec)
        ? candidate.expiresInSec
        : undefined,
  };
}

export function createAuthRealtimeRuntime(
  options: AuthRealtimeRuntimeOptions
): AuthRealtimeRuntime {
  let cachedWsTicket: CachedWsTicket | null = null;
  let wsTicketInFlight: Promise<string | null> | null = null;

  function clearTransientState(): void {
    cachedWsTicket = null;
    wsTicketInFlight = null;
  }

  function activate(accessToken: string, source: string): void {
    wsClient.connect(accessToken);
    ensurePushSubscription().catch((err) => {
      logger.warn(`[push] subscribe failed after ${source}`, err);
    });
  }

  function suspend(_source: string): void {
    wsClient.disconnect();
    clearTransientState();
  }

  async function teardown(source: string): Promise<void> {
    suspend(source);
    await unsubscribePush().catch(() => null);
  }

  wsClient.setAuthErrorHandler(async () => {
    try {
      const newToken = await refreshSessionAccessToken();
      if (!newToken) {
        options.onSessionRefreshFailed();
        return null;
      }
      options.onAccessTokenRefreshed(newToken);
      return newToken;
    } catch {
      options.onSessionRefreshFailed();
      return null;
    }
  });

  wsClient.setWsAuthTokenProvider(async (accessToken) => {
    if (
      cachedWsTicket?.accessToken === accessToken &&
      Date.now() < cachedWsTicket.expiresAtMs - 5000
    ) {
      return cachedWsTicket.token;
    }

    if (wsTicketInFlight) {
      return wsTicketInFlight;
    }

    wsTicketInFlight = (async () => {
      try {
        const data = parseWsTicketResponse(
          await api.post<unknown>("/auth/ws-ticket")
        );
        if (data) {
          const ttlSec =
            typeof data.expiresInSec === "number" &&
            data.expiresInSec > 0
              ? data.expiresInSec
              : 60;
          cachedWsTicket = {
            token: data.wsToken,
            expiresAtMs: Date.now() + ttlSec * 1000,
            accessToken,
          };
          return data.wsToken;
        }
      } catch {
        // ws-ticket endpoint unavailable — return null so the caller schedules a retry
        // rather than falling back to a raw access token that the server will reject
      }

      cachedWsTicket = null;
      return null;
    })().finally(() => {
      wsTicketInFlight = null;
    });

    return wsTicketInFlight;
  });

  return {
    activate,
    suspend,
    teardown,
    clearTransientState,
  };
}
