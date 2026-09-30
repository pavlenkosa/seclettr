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

/** Same-origin absolute paths ("/api", "/sfu") are allowed as base URLs. */
function isSameOriginPath(value: string): boolean {
  return value.startsWith("/");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * window.__SECLETTR_RUNTIME_CONFIG__ is untrusted host-page data: validate each
 * field at read time and fall back to existing defaults when malformed.
 */
function readRuntimeConfig(): SeclettrRuntimeConfig {
  if (globalThis.window === undefined) {
    return {};
  }

  const config: unknown = window.__SECLETTR_RUNTIME_CONFIG__;
  if (!config || typeof config !== "object") {
    return {};
  }

  const validated: SeclettrRuntimeConfig = {};

  const rawApiUrl = (config as { apiUrl?: unknown }).apiUrl;
  if (typeof rawApiUrl === "string" && (isSameOriginPath(rawApiUrl) || isHttpUrl(rawApiUrl))) {
    validated.apiUrl = rawApiUrl;
  }

  const rawSfuUrl = (config as { sfuUrl?: unknown }).sfuUrl;
  if (typeof rawSfuUrl === "string" && (isSameOriginPath(rawSfuUrl) || isHttpUrl(rawSfuUrl))) {
    validated.sfuUrl = rawSfuUrl;
  }

  const rawStunUrls = (config as { stunUrls?: unknown }).stunUrls;
  if (Array.isArray(rawStunUrls)) {
    const stunUrls = rawStunUrls.filter(
      (u): u is string => typeof u === "string" && (u.startsWith("stun:") || u.startsWith("turn:"))
    );
    if (stunUrls.length > 0) {
      validated.stunUrls = stunUrls;
    }
  }

  return validated;
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
