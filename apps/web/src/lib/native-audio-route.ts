import { isNativePlatform } from "./native-platform";

export type AudioRouteName = "earpiece" | "speaker" | "bluetooth";

export interface AudioRoutes {
  /** True when the device has a physical earpiece (always true on phones). */
  hasEarpiece: boolean;
  /** True when the device has a loudspeaker (always true on phones). */
  hasSpeaker: boolean;
  /** True when a Bluetooth SCO-capable headset is currently connected. */
  hasBluetooth: boolean;
  /** The route that is actively selected. */
  currentRoute: AudioRouteName;
}

interface AudioRoutePlugin {
  isSpeakerOn: () => Promise<{ value: boolean }>;
  setSpeaker: (opts: { enabled: boolean }) => Promise<void>;
  getAudioRoutes: () => Promise<AudioRoutes>;
  setAudioRoute: (opts: { route: AudioRouteName }) => Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): AudioRoutePlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["AudioRoute"];
  return plugin ? (plugin as AudioRoutePlugin) : null;
}

export function isNativeAudioRouteSupported(): boolean {
  return getPlugin() !== null;
}

export async function getNativeSpeakerOn(): Promise<boolean> {
  const plugin = getPlugin();
  if (!plugin) return false;
  const result = await plugin.isSpeakerOn();
  return result.value;
}

export async function setNativeSpeaker(enabled: boolean): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.setSpeaker({ enabled });
}

/**
 * Returns all available audio routes and the currently active one.
 * Returns null when the native plugin is unavailable (web / iOS without plugin).
 */
export async function getNativeAudioRoutes(): Promise<AudioRoutes | null> {
  const plugin = getPlugin();
  if (!plugin) return null;
  return plugin.getAudioRoutes();
}

/**
 * Switches the active audio route.
 * No-op when the native plugin is unavailable.
 */
export async function setNativeAudioRoute(route: AudioRouteName): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  await plugin.setAudioRoute({ route });
}
