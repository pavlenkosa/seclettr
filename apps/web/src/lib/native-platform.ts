import { nativeStorageGet, nativeStorageRemove, nativeStorageSet } from "./native-storage";

const NATIVE_SERVER_KEY = "sc:native_server_url";

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
}

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as Record<string, unknown>).Capacitor as CapacitorBridge | undefined;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
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
