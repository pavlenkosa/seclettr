import { Preferences } from "@capacitor/preferences";
import { recordBootDiagnostic } from "./boot-diagnostics";
import { isNativePlatform, isNativePluginAvailable } from "./native-platform";

/**
 * Key under which the refresh token is persisted via Capacitor Preferences
 * (maps to NSUserDefaults on iOS and SharedPreferences on Android).
 * We use a dedicated helper set so callers never need to know the key string,
 * and so we can easily migrate the storage location in the future.
 *
 * Why native storage? Capacitor's WebView cookie store can be wiped after an
 * Android process kill, causing the session to look "signed out".  Preferences
 * storage survives process restarts, so we keep a copy of the refresh token
 * there and send it as an `X-Refresh-Token` header fallback on the next launch.
 */
const NATIVE_REFRESH_TOKEN_STORAGE_KEY = "sc:refresh_token";

interface PreferencesPlugin {
  get: (opts: { key: string }) => Promise<{ value: string | null }>;
  set: (opts: { key: string; value: string }) => Promise<void>;
  remove: (opts: { key: string }) => Promise<void>;
}

function getPlugin(): PreferencesPlugin | null {
  if (!isNativePlatform() || !isNativePluginAvailable("Preferences")) return null;
  return Preferences as unknown as PreferencesPlugin;
}

const NATIVE_STORAGE_RETRY_DELAYS_MS = [0, 120, 320, 700] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function withNativePreferencesRetry<T>(
  operation: "get" | "set" | "remove",
  key: string,
  run: (plugin: PreferencesPlugin) => Promise<T>
): Promise<T> {
  let lastError: unknown = null;

  for (let index = 0; index < NATIVE_STORAGE_RETRY_DELAYS_MS.length; index += 1) {
    const delayMs = NATIVE_STORAGE_RETRY_DELAYS_MS[index] ?? 0;
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const plugin = getPlugin();
    if (!plugin) {
      recordBootDiagnostic("native-storage", "preferences plugin unavailable during native storage op", {
        operation,
        key,
        attempt: index + 1,
      });
      continue;
    }

    try {
      const result = await run(plugin);
      if (index > 0) {
        recordBootDiagnostic("native-storage", "native storage op recovered after retry", {
          operation,
          key,
          attempt: index + 1,
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      recordBootDiagnostic("native-storage", "native storage op failed", {
        operation,
        key,
        attempt: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(`native_preferences_${operation}_failed`));
}

export async function nativeStorageGet(key: string): Promise<string | null> {
  if (isNativePlatform()) {
    try {
      const { value } = await withNativePreferencesRetry("get", key, (plugin) => plugin.get({ key }));
      return value;
    } catch {
      return null;
    }
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function nativeStorageSet(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await withNativePreferencesRetry("set", key, (plugin) => plugin.set({ key, value }));
    return;
  }
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export async function nativeStorageRemove(key: string): Promise<void> {
  if (isNativePlatform()) {
    await withNativePreferencesRetry("remove", key, (plugin) => plugin.remove({ key }));
    return;
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Refresh-token native store (native-only — no localStorage fallback)
// ---------------------------------------------------------------------------

/** Persists the refresh token to native Preferences.  No-op on non-native. */
export async function storeNativeRefreshToken(token: string): Promise<void> {
  if (!isNativePlatform()) return;
  await nativeStorageSet(NATIVE_REFRESH_TOKEN_STORAGE_KEY, token);
}

/** Retrieves the persisted refresh token from native Preferences.
 *  Returns `null` on non-native or when not set. */
export async function getNativeRefreshToken(): Promise<string | null> {
  if (!isNativePlatform()) return null;
  return nativeStorageGet(NATIVE_REFRESH_TOKEN_STORAGE_KEY);
}

/** Clears the persisted refresh token from native Preferences.  No-op on non-native. */
export async function clearNativeRefreshToken(): Promise<void> {
  if (!isNativePlatform()) return;
  await nativeStorageRemove(NATIVE_REFRESH_TOKEN_STORAGE_KEY);
}
