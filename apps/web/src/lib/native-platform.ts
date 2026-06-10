import { Capacitor } from "@capacitor/core";
import { nativeStorageGet, nativeStorageRemove, nativeStorageSet } from "./native-storage";
import { recordBootDiagnostic } from "./boot-diagnostics";

const NATIVE_SERVER_KEY = "sc:native_server_url";

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isNativePluginAvailable(name: string): boolean {
  if (!isNativePlatform()) return false;
  try {
    return Capacitor.isPluginAvailable(name);
  } catch {
    return false;
  }
}

// Synchronous read from localStorage — used at boot before Preferences resolves.
// setNativeServerUrl also writes to Preferences for background-runner access.
export function getNativeServerUrl(): string | null {
  try {
    return localStorage.getItem(NATIVE_SERVER_KEY);
  } catch {
    return null;
  }
}

export function setNativeServerUrl(url: string): void {
  const cleaned = url.replace(/\/+$/, "");
  try { localStorage.setItem(NATIVE_SERVER_KEY, cleaned); } catch { /* ignore */ }
  void nativeStorageSet(NATIVE_SERVER_KEY, cleaned);
}

export function clearNativeServerUrl(): void {
  try { localStorage.removeItem(NATIVE_SERVER_KEY); } catch { /* ignore */ }
  void nativeStorageRemove(NATIVE_SERVER_KEY);
}

/** Async read from Preferences — use in background runner context. */
export async function getNativeServerUrlAsync(): Promise<string | null> {
  return nativeStorageGet(NATIVE_SERVER_KEY);
}

/**
 * Rehydrates the synchronous boot path from durable native Preferences.
 *
 * Android process kill can leave the restore flow depending on a sync server URL
 * read before any async native bridge has run. When localStorage is empty but
 * Preferences still has the canonical server URL, copy it back so boot-time
 * auth/session helpers resolve the correct API origin.
 */
export async function hydrateNativeServerUrlForBoot(): Promise<string | null> {
  const current = getNativeServerUrl();
  if (current) {
    recordBootDiagnostic("native-platform", "boot server URL found in sync storage", {
      source: "localStorage",
      hasValue: true,
    });
    return current;
  }

  const stored = await getNativeServerUrlAsync();
  if (!stored) {
    recordBootDiagnostic("native-platform", "boot server URL missing from durable storage", {
      source: "preferences",
      hasValue: false,
    });
    return null;
  }

  const cleaned = stored.replace(/\/+$/, "");
  try { localStorage.setItem(NATIVE_SERVER_KEY, cleaned); } catch { /* ignore */ }
  recordBootDiagnostic("native-platform", "rehydrated boot server URL from durable storage", {
    source: "preferences",
    hasValue: true,
  });
  return cleaned;
}
