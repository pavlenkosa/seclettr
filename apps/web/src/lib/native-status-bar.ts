/**
 * native-status-bar.ts — Capacitor StatusBar plugin bridge.
 *
 * Applies a dark/light icon style to the Android status bar so it always
 * matches the app theme. Requires AND-02 (edge-to-edge) to be in effect —
 * once the WebView overlays the status bar, setting overlay=true here makes
 * the bar transparent and the icons inherit the correct tone.
 *
 * Custom theme: dark/light is determined by `isCustomBgDark` at apply time.
 *
 * On web (non-native), the plugin is unavailable — this is a no-op.
 */

import { isNativePlatform } from "./native-platform";
import { isCustomBgDark } from "./custom-theme";
import { useUiSettingsStore, type ThemeMode } from "@/ui-settings";

interface StatusBarPlugin {
  setStyle: (opts: { style: "DARK" | "LIGHT" | "DEFAULT" }) => Promise<void>;
  setOverlaysWebView: (opts: { overlay: boolean }) => Promise<void>;
}

function getPlugin(): StatusBarPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (cap?.Plugins?.["StatusBar"] as StatusBarPlugin) ?? null;
}

/**
 * Resolves whether a given theme mode is visually dark.
 *
 * "custom" reads the actual background lightness via `isCustomBgDark`.
 * We pass `customBg` from the store so the function stays pure.
 */
function resolveIsDark(mode: ThemeMode, customBg: string): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return isCustomBgDark(customBg);
}

/**
 * Apply status bar icon style matching the current app theme.
 *
 * DARK style  = dark icons (use on light backgrounds)
 * LIGHT style = light icons (use on dark backgrounds)
 */
export async function applyStatusBarTheme(
  mode: ThemeMode,
  customBg: string
): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  const isDark = resolveIsDark(mode, customBg);
  // Overlay = true lets the WebView render behind the status bar (edge-to-edge).
  // This is safe to call on every theme change — idempotent.
  await plugin.setOverlaysWebView({ overlay: true });
  // DARK icons on light background; LIGHT icons on dark background.
  await plugin.setStyle({ style: isDark ? "LIGHT" : "DARK" });
}

/**
 * Subscribe to theme-mode changes and apply the matching status bar style.
 *
 * Reads current state once on init (applies immediately), then keeps in sync
 * whenever `themeMode` or `customThemeBg` changes via Zustand subscriptions.
 *
 * The subscriptions live for the app lifetime — no cleanup is needed.
 * Call once from `initAppClientRuntime()`.
 */
export function initStatusBarTheme(): void {
  // Apply immediately using the current store state.
  const { themeMode, customThemeBg } = useUiSettingsStore.getState();
  void applyStatusBarTheme(themeMode, customThemeBg);

  // Re-apply on every theme mode change (light ↔ dark ↔ custom).
  useUiSettingsStore.subscribe(
    (s) => s.themeMode,
    (mode) => {
      const { customThemeBg: bg } = useUiSettingsStore.getState();
      void applyStatusBarTheme(mode, bg);
    }
  );

  // Re-apply when the custom background colour changes (affects icon tone).
  // Skip if the active mode is not "custom" — irrelevant for light/dark.
  useUiSettingsStore.subscribe(
    (s) => s.customThemeBg,
    (bg) => {
      const { themeMode: mode } = useUiSettingsStore.getState();
      if (mode !== "custom") return;
      void applyStatusBarTheme(mode, bg);
    }
  );
}
