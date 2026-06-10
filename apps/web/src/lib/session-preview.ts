/**
 * Non-rotating refresh-cookie session preview used only by auth restore.
 */
import { recordBootDiagnostic } from "./boot-diagnostics";
import { postNativeAuthJson } from "./native-auth-http";
import { resolveApiBaseUrl } from "./runtime-config";
import { isNativePlatform } from "./native-platform";
import { getNativeRefreshToken } from "./native-storage";

const AUTH_PROTOCOL_VERSION = 1;

export interface RefreshSessionPreview {
  userId: string;
  deviceId: string;
  username: string;
}

function parseSessionPreviewResponse(payload: unknown): RefreshSessionPreview | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    version?: unknown;
    userId?: unknown;
    deviceId?: unknown;
    user?: { username?: unknown };
  };
  if (
    candidate.version !== AUTH_PROTOCOL_VERSION ||
    typeof candidate.userId !== "string" ||
    candidate.userId.length === 0 ||
    typeof candidate.deviceId !== "string" ||
    candidate.deviceId.length === 0 ||
    !candidate.user ||
    typeof candidate.user !== "object" ||
    typeof candidate.user.username !== "string" ||
    candidate.user.username.length === 0
  ) {
    return null;
  }

  return {
    userId: candidate.userId,
    deviceId: candidate.deviceId,
    username: candidate.user.username,
  };
}

let previewPromise: Promise<RefreshSessionPreview | null> | null = null;

export function previewRefreshSession(): Promise<RefreshSessionPreview | null> {
  if (previewPromise) return previewPromise;
  previewPromise = doPreviewRefreshSession().finally(() => {
    previewPromise = null;
  });
  return previewPromise;
}

async function doPreviewRefreshSession(): Promise<RefreshSessionPreview | null> {
  // On native, attach the persisted refresh token as a header fallback.
  // The cookie may have been wiped after an Android process kill, but
  // Capacitor Preferences survives restarts.  The server only accepts
  // this header from known native WebView origins.
  const headers: Record<string, string> = {};
  if (isNativePlatform()) {
    const nativeToken = await getNativeRefreshToken();
    if (nativeToken) {
      headers["X-Refresh-Token"] = nativeToken;
    }
  }
  const apiBase = resolveApiBaseUrl();
  const nativeTransport = isNativePlatform() ? "capacitor-http" : "fetch";
  recordBootDiagnostic("auth.preview", "starting session preview request", {
    native: isNativePlatform(),
    hasRefreshHeader: "X-Refresh-Token" in headers,
    target: apiBase,
    transport: nativeTransport,
  });

  if (isNativePlatform()) {
    try {
      const nativeResponse = await postNativeAuthJson("/auth/session", { headers });
      if (nativeResponse) {
        if (nativeResponse.status < 200 || nativeResponse.status >= 300) {
          recordBootDiagnostic("auth.preview", "session preview rejected by server", {
            status: nativeResponse.status,
            target: apiBase,
            transport: "capacitor-http",
          });
          return null;
        }

        const parsed = parseSessionPreviewResponse(nativeResponse.data);
        recordBootDiagnostic("auth.preview", parsed ? "session preview succeeded" : "session preview payload malformed", {
          target: apiBase,
          hasSession: Boolean(parsed),
          transport: "capacitor-http",
        });
        return parsed;
      }
    } catch (err) {
      recordBootDiagnostic("auth.preview", "session preview failed at network layer", {
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
    response = await fetch(`${apiBase}/auth/session`, {
      method: "POST",
      credentials: "include",
      headers,
    });
  } catch (err) {
    recordBootDiagnostic("auth.preview", "session preview failed at network layer", {
      target: apiBase,
      hasRefreshHeader: "X-Refresh-Token" in headers,
      error: err instanceof Error ? err.message : String(err),
      transport: "fetch",
    });
    // Network-level failure (no connectivity, DNS, timeout).
    // Throw so the caller can distinguish "no session" from "can't reach server".
    // Signing the user out over a transient connection failure is wrong.
    throw new Error("network_error");
  }

  if (!response.ok) {
    recordBootDiagnostic("auth.preview", "session preview rejected by server", {
      status: response.status,
      target: apiBase,
      transport: "fetch",
    });
    // Server explicitly said "no session" (401) — user is signed out.
    return null;
  }

  const parsed = parseSessionPreviewResponse(await response.json());
  recordBootDiagnostic("auth.preview", parsed ? "session preview succeeded" : "session preview payload malformed", {
    target: apiBase,
    hasSession: Boolean(parsed),
    transport: "fetch",
  });
  return parsed;
}
