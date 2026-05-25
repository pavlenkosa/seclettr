import { isNativePlatform } from "./native-platform";

interface AudioRoutePlugin {
  isSpeakerOn: () => Promise<{ value: boolean }>;
  setSpeaker: (opts: { enabled: boolean }) => Promise<void>;
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
