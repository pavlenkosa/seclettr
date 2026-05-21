import { isNativePlatform } from "./native-platform";

interface PreferencesPlugin {
  get: (opts: { key: string }) => Promise<{ value: string | null }>;
  set: (opts: { key: string; value: string }) => Promise<void>;
  remove: (opts: { key: string }) => Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): PreferencesPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["Preferences"];
  return plugin ? (plugin as PreferencesPlugin) : null;
}

export async function nativeStorageGet(key: string): Promise<string | null> {
  const plugin = getPlugin();
  if (plugin) {
    const { value } = await plugin.get({ key });
    return value;
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function nativeStorageSet(key: string, value: string): Promise<void> {
  const plugin = getPlugin();
  if (plugin) {
    await plugin.set({ key, value });
    return;
  }
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export async function nativeStorageRemove(key: string): Promise<void> {
  const plugin = getPlugin();
  if (plugin) {
    await plugin.remove({ key });
    return;
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
