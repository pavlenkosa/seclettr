import { CapacitorHttp } from "@capacitor/core";
import { isNativePlatform } from "./native-platform";
import { resolveApiBaseUrl } from "./runtime-config";

const NATIVE_AUTH_ORIGIN = "https://localhost";

export interface NativeAuthHttpResponse {
  readonly status: number;
  readonly data: unknown;
}

interface NativeAuthHttpOptions {
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

function normalizeNativeHttpData(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }

  const trimmed = data.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return data;
  }
}

export function canUseNativeAuthHttp(): boolean {
  return isNativePlatform() && typeof CapacitorHttp.request === "function";
}

export async function postNativeAuthJson(
  path: string,
  options: NativeAuthHttpOptions = {}
): Promise<NativeAuthHttpResponse | null> {
  if (!canUseNativeAuthHttp()) {
    return null;
  }

  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...options.headers,
    Origin: NATIVE_AUTH_ORIGIN,
    "X-Client-Origin": NATIVE_AUTH_ORIGIN,
  };

  const response = await CapacitorHttp.request({
    url: `${resolveApiBaseUrl()}${path}`,
    method: "POST",
    headers: requestHeaders,
    data: options.body ?? {},
    connectTimeout: 10_000,
    readTimeout: 10_000,
    responseType: "json",
  });

  return {
    status: response.status,
    data: normalizeNativeHttpData(response.data),
  };
}
