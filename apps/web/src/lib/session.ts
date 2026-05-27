import { setAccessToken as setApiAccessToken } from "./api";
import { resolveApiBaseUrl } from "./runtime-config";
import { isNativePlatform } from "./native-platform";
import { getNativeRefreshToken, storeNativeRefreshToken } from "./native-storage";

/**
 * Centralised session/token management for the web client.
 *
 * This module owns the single source of truth for the current access token
 * and exposes helpers for HTTP and WebSocket layers.
 */

const API_BASE_URL = resolveApiBaseUrl();

function parseRefreshResponse(
  payload: unknown
): { accessToken: string; refreshToken?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const accessToken = (payload as { accessToken?: unknown }).accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  const refreshToken = (payload as { refreshToken?: unknown }).refreshToken;

  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" && refreshToken.length > 0
      ? refreshToken
      : undefined,
  };
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
  // On native, attach the persisted refresh token as a header fallback in case
  // the WebView cookie was wiped after an Android process kill.
  const headers: Record<string, string> = {};
  if (isNativePlatform()) {
    const nativeToken = await getNativeRefreshToken();
    if (nativeToken) {
      headers["X-Refresh-Token"] = nativeToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
    });
  } catch {
    // Network-level failure (no connectivity, DNS, etc.).
    // Do NOT clear the token or return null — the caller should retry,
    // not sign the user out over a transient connection hiccup.
    throw new Error("network_error");
  }

  if (!response.ok) {
    // Server explicitly rejected the session (401/403) — it really is expired.
    setSessionAccessToken(null);
    return null;
  }

  const payload = parseRefreshResponse(await response.json());
  if (!payload) {
    setSessionAccessToken(null);
    return null;
  }

  // The server rotates the refresh token on every /auth/refresh call.
  // Keep native Preferences in sync so the next app launch has the latest token.
  if (payload.refreshToken) {
    void storeNativeRefreshToken(payload.refreshToken);
  }

  setSessionAccessToken(payload.accessToken);
  return payload.accessToken;
}
