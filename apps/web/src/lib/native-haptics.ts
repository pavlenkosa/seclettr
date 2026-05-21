import { isNativePlatform } from "./native-platform";

interface HapticsPlugin {
  impact: (opts: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  notification: (opts: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  selectionStart: () => Promise<void>;
  vibrate: (opts?: { duration?: number }) => Promise<void>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): HapticsPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["Haptics"];
  return plugin ? (plugin as HapticsPlugin) : null;
}

function webVibrate(ms: number): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

/** Light tap — sending a message, minor confirmation. */
export function hapticImpactLight(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.impact({ style: "LIGHT" }); return; }
  webVibrate(10);
}

/** Medium impact — accepting a call, important action. */
export function hapticImpactMedium(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.impact({ style: "MEDIUM" }); return; }
  webVibrate(20);
}

/** Heavy impact — incoming call, alert. */
export function hapticImpactHeavy(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.impact({ style: "HEAVY" }); return; }
  webVibrate(40);
}

/** Success notification — delivered/confirmed. */
export function hapticNotificationSuccess(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.notification({ type: "SUCCESS" }); return; }
  webVibrate(15);
}

/** Warning notification — missed call, error. */
export function hapticNotificationWarning(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.notification({ type: "WARNING" }); return; }
  webVibrate(25);
}

/** Selection feedback — long-press context menu. */
export function hapticSelection(): void {
  const plugin = getPlugin();
  if (plugin) { void plugin.selectionStart(); return; }
  webVibrate(8);
}
