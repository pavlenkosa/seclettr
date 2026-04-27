/**
 * Non-rotating refresh-cookie session preview used only by auth restore.
 */
import { resolveApiBaseUrl } from "./runtime-config";

const API_BASE_URL = resolveApiBaseUrl();
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
  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    return parseSessionPreviewResponse(await response.json());
  } catch {
    return null;
  }
}
