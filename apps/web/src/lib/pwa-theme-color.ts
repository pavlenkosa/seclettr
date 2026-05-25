/**
 * pwa-theme-color.ts — keeps `<meta name="theme-color">` in sync with the
 * active app theme.
 *
 * Android Chrome PWA uses this tag to colour the browser/OS toolbar. Without
 * dynamic updates the meta keeps the hardcoded dark default forever, showing
 * a mismatch on light or custom themes.
 *
 * Works on all platforms (web + Capacitor) — no native bridge required.
 * Call `initPwaThemeColor()` once from `initAppClientRuntime()`.
 */

import { useUiSettingsStore, type ThemeMode } from "@/ui-settings";

/** bg-secondary values that match the sidebar / header shell colour. */
const THEME_COLOR: Record<"dark" | "light", string> = {
  dark: "#152236",
  light: "#eef3fa",
};

function resolveThemeColor(mode: ThemeMode, customBg: string): string {
  if (mode === "dark") return THEME_COLOR.dark;
  if (mode === "light") return THEME_COLOR.light;
  // Custom theme: the bg hex is the most accurate representation of the shell.
  return customBg;
}

function applyThemeColor(color: string): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute("content", color);
}

/**
 * Apply current theme color immediately, then stay in sync on every
 * `themeMode` or `customThemeBg` change. Subscriptions live for the app
 * lifetime — no cleanup needed. Call once from `initAppClientRuntime()`.
 */
export function initPwaThemeColor(): void {
  const { themeMode, customThemeBg } = useUiSettingsStore.getState();
  applyThemeColor(resolveThemeColor(themeMode, customThemeBg));

  useUiSettingsStore.subscribe(
    (s) => s.themeMode,
    (mode) => {
      const { customThemeBg: bg } = useUiSettingsStore.getState();
      applyThemeColor(resolveThemeColor(mode, bg));
    }
  );

  // Update when custom background changes — only relevant in "custom" mode.
  useUiSettingsStore.subscribe(
    (s) => s.customThemeBg,
    (bg) => {
      const { themeMode: mode } = useUiSettingsStore.getState();
      if (mode !== "custom") return;
      applyThemeColor(resolveThemeColor(mode, bg));
    }
  );
}
