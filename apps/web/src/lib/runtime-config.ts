import { isNativePlatform, getNativeServerUrl } from "./native-platform";

interface SeclettrRuntimeConfig {
  apiUrl?: string;
  sfuUrl?: string;
  /** STUN server URLs. Empty array disables STUN (TURN-only). Defaults to [] when unset. */
  stunUrls?: string[];
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

function normalizeUrl(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  return stripTrailingSlashes(trimmed) || fallback;
}

function readRuntimeConfig(): SeclettrRuntimeConfig {
  if (globalThis.window === undefined) {
    return {};
  }

  const config = window.__SECLETTR_RUNTIME_CONFIG__;
  if (!config || typeof config !== "object") {
    return {};
  }

  return config;
}

export function resolveApiBaseUrl(): string {
  if (isNativePlatform()) {
    const serverUrl = getNativeServerUrl();
    if (serverUrl) return serverUrl + "/api";
  }
  const runtime = readRuntimeConfig();
  return normalizeUrl(runtime.apiUrl, normalizeUrl(import.meta.env["VITE_API_URL"], "/api"));
}

export function resolveSfuBaseUrl(): string {
  if (isNativePlatform()) {
    const serverUrl = getNativeServerUrl();
    if (serverUrl) return serverUrl + "/sfu";
  }
  const runtime = readRuntimeConfig();
  return normalizeUrl(runtime.sfuUrl, normalizeUrl(import.meta.env["VITE_SFU_URL"], "/sfu"));
}

export function resolveStunUrls(): string[] {
  const runtime = readRuntimeConfig();
  if (Array.isArray(runtime.stunUrls)) {
    return runtime.stunUrls.filter((u) => typeof u === "string" && u.length > 0);
  }
  // Default: no STUN — rely solely on TURN for privacy-safe deployments.
  return [];
}
