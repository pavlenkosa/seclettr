import { setAccessToken as setApiAccessToken } from "./api";
import { recordBootDiagnostic } from "./boot-diagnostics";
import { postNativeAuthJson } from "./native-auth-http";
import { resolveApiBaseUrl } from "./runtime-config";
import { isNativePlatform } from "./native-platform";
import { getNativeRefreshToken, storeNativeRefreshToken } from "./native-storage";

/**
 * Centralised session/token management for the web client.
 *
 * This module owns the single source of truth for the current access token
 * and exposes helpers for HTTP and WebSocket layers.
 */

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
  const apiBase = resolveApiBaseUrl();
  const nativeTransport = isNativePlatform() ? "capacitor-http" : "fetch";
  recordBootDiagnostic("auth.refresh", "starting refresh request", {
    native: isNativePlatform(),
    hasRefreshHeader: "X-Refresh-Token" in headers,
    target: apiBase,
    transport: nativeTransport,
  });

  if (isNativePlatform()) {
    try {
      const nativeResponse = await postNativeAuthJson("/auth/refresh", { headers });
      if (nativeResponse) {
        if (nativeResponse.status < 200 || nativeResponse.status >= 300) {
          recordBootDiagnostic("auth.refresh", "refresh request rejected by server", {
            status: nativeResponse.status,
            target: apiBase,
            transport: "capacitor-http",
          });
          setSessionAccessToken(null);
          return null;
        }

        const payload = parseRefreshResponse(nativeResponse.data);
        if (!payload) {
          recordBootDiagnostic("auth.refresh", "refresh payload malformed", {
            target: apiBase,
            transport: "capacitor-http",
          });
          setSessionAccessToken(null);
          return null;
        }

        if (payload.refreshToken) {
          void storeNativeRefreshToken(payload.refreshToken);
        }

        setSessionAccessToken(payload.accessToken);
        recordBootDiagnostic("auth.refresh", "refresh request succeeded", {
          rotatedRefreshToken: Boolean(payload.refreshToken),
          target: apiBase,
          transport: "capacitor-http",
        });
        return payload.accessToken;
      }
    } catch (err) {
      recordBootDiagnostic("auth.refresh", "refresh request failed at network layer", {
        target: apiBase,
        hasRefreshHeader: "X-Refresh-Token" in headers,
        error: err instanceof Error ? err.message : String(err),
        transport: "capacitor-http",
      });
      throw new Error("network_error");
    }
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
    });
  } catch (err) {
    recordBootDiagnostic("auth.refresh", "refresh request failed at network layer", {
      target: apiBase,
      hasRefreshHeader: "X-Refresh-Token" in headers,
      error: err instanceof Error ? err.message : String(err),
      transport: "fetch",
    });
    // Network-level failure (no connectivity, DNS, etc.).
    // Do NOT clear the token or return null — the caller should retry,
    // not sign the user out over a transient connection hiccup.
    throw new Error("network_error");
  }

  if (!response.ok) {
    recordBootDiagnostic("auth.refresh", "refresh request rejected by server", {
      status: response.status,
      target: apiBase,
      transport: "fetch",
    });
    // Server explicitly rejected the session (401/403) — it really is expired.
    setSessionAccessToken(null);
    return null;
  }

  const payload = parseRefreshResponse(await response.json());
  if (!payload) {
    recordBootDiagnostic("auth.refresh", "refresh payload malformed", {
      target: apiBase,
      transport: "fetch",
    });
    setSessionAccessToken(null);
    return null;
  }

  // The server rotates the refresh token on every /auth/refresh call.
  // Keep native Preferences in sync so the next app launch has the latest token.
  if (payload.refreshToken) {
    void storeNativeRefreshToken(payload.refreshToken);
  }

  setSessionAccessToken(payload.accessToken);
  recordBootDiagnostic("auth.refresh", "refresh request succeeded", {
    rotatedRefreshToken: Boolean(payload.refreshToken),
    target: apiBase,
    transport: "fetch",
  });
  return payload.accessToken;
}
