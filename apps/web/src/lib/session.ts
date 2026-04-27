import { setAccessToken as setApiAccessToken } from "./api";
import { resolveApiBaseUrl } from "./runtime-config";

/**
 * Centralised session/token management for the web client.
 *
 * This module owns the single source of truth for the current access token
 * and exposes helpers for HTTP and WebSocket layers.
 */

const API_BASE_URL = resolveApiBaseUrl();

function parseRefreshResponse(
  payload: unknown
): { accessToken: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const accessToken = (payload as { accessToken?: unknown }).accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  return { accessToken };
}

export function setSessionAccessToken(token: string | null): void {
  setApiAccessToken(token);
}

// Deduplicates concurrent refresh calls — all callers (HTTP, WS, SFU) share
// the same in-flight promise so only one /auth/refresh request goes out at a time.
let _refreshPromise: Promise<string | null> | null = null;

export function refreshSessionAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefreshSessionAccessToken().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

async function _doRefreshSessionAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      setSessionAccessToken(null);
      return null;
    }

    const payload = parseRefreshResponse(await response.json());
    if (!payload) {
      setSessionAccessToken(null);
      return null;
    }

    setSessionAccessToken(payload.accessToken);
    return payload.accessToken;
  } catch {
    setSessionAccessToken(null);
    return null;
  }
}
