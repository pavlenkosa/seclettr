import { type ReactNode } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { setVibrationEnabled } from "@/lib/native-haptics";
import { applyCustomThemeVars, isCustomBgDark, removeCustomThemeVars } from "@/lib/custom-theme";

export type ThemeMode = "light" | "dark" | "custom";
export type AccentColor = "blue" | "emerald" | "rose" | "violet" | "amber" | "teal" | "indigo" | "slate";
export type FontSize = "sm" | "md" | "lg";
export type CallSecurityMode = "compatibility" | "balanced" | "strict";
export type AudioOutputPreference = "system" | `device:${string}`;
export type AutoDecryptMedia = "on" | "off";
export type VibrationEnabled = "on" | "off";

const THEME_STORAGE_KEY = "seclettr.ui.theme.v1";
const ACCENT_STORAGE_KEY = "seclettr.ui.accent.v1";
const FONT_SIZE_STORAGE_KEY = "seclettr.ui.fontSize.v1";
const CUSTOM_BG_STORAGE_KEY = "seclettr.ui.custom.bg.v1";
const CUSTOM_ACCENT_STORAGE_KEY = "seclettr.ui.custom.accent.v1";
const CUSTOM_COLOR_SCHEME_STORAGE_KEY = "seclettr.ui.custom.colorScheme.v1";
const CALL_SECURITY_MODE_STORAGE_KEY = "seclettr.ui.callSecurityMode.v1";
const AUDIO_OUTPUT_PREFERENCE_STORAGE_KEY = "seclettr.ui.audioOutputPreference.v1";
const AUTO_DECRYPT_MEDIA_STORAGE_KEY = "seclettr.ui.autoDecryptMedia.v1";
const VIBRATION_STORAGE_KEY = "seclettr.ui.vibration.v1";

const THEME_VALUES: ReadonlySet<ThemeMode> = new Set(["light", "dark", "custom"]);
const ACCENT_VALUES: ReadonlySet<AccentColor> = new Set(["blue", "emerald", "rose", "violet", "amber", "teal", "indigo", "slate"]);
const FONT_SIZE_VALUES: ReadonlySet<FontSize> = new Set(["sm", "md", "lg"]);
const CALL_SECURITY_MODE_VALUES: ReadonlySet<CallSecurityMode> = new Set(["compatibility", "balanced", "strict"]);
const AUTO_DECRYPT_MEDIA_VALUES: ReadonlySet<AutoDecryptMedia> = new Set(["on", "off"]);
const VIBRATION_VALUES: ReadonlySet<VibrationEnabled> = new Set(["on", "off"]);

function resolveDomTheme(themeMode: ThemeMode, customThemeBg: string): "light" | "dark" {
  if (themeMode === "custom") {
    return isCustomBgDark(customThemeBg) ? "dark" : "light";
  }
  return themeMode;
}

function readStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota/private-mode failures; runtime state still works for the session.
  }
}

function resolveInitialTheme(): ThemeMode {
  const saved = readStorageValue(THEME_STORAGE_KEY);
  if (saved && THEME_VALUES.has(saved as ThemeMode)) return saved as ThemeMode;
  return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveInitialAccent(): AccentColor {
  const saved = readStorageValue(ACCENT_STORAGE_KEY);
  if (saved && ACCENT_VALUES.has(saved as AccentColor)) return saved as AccentColor;
  return "blue";
}

function resolveInitialFontSize(): FontSize {
  const saved = readStorageValue(FONT_SIZE_STORAGE_KEY);
  if (saved && FONT_SIZE_VALUES.has(saved as FontSize)) return saved as FontSize;
  return "md";
}

function resolveInitialCustomBg(): string {
  return readStorageValue(CUSTOM_BG_STORAGE_KEY) ?? "#0b1526";
}

function resolveInitialCustomAccent(): string {
  return readStorageValue(CUSTOM_ACCENT_STORAGE_KEY) ?? "#3b82f6";
}

function resolveInitialCallSecurityMode(): CallSecurityMode {
  const saved = readStorageValue(CALL_SECURITY_MODE_STORAGE_KEY);
  if (saved && CALL_SECURITY_MODE_VALUES.has(saved as CallSecurityMode)) return saved as CallSecurityMode;
  return "balanced";
}

function isAudioOutputPreference(value: string | null): value is AudioOutputPreference {
  return value !== null && (value === "system" || value.startsWith("device:"));
}

function resolveInitialAudioOutputPreference(): AudioOutputPreference {
  const saved = readStorageValue(AUDIO_OUTPUT_PREFERENCE_STORAGE_KEY);
  if (isAudioOutputPreference(saved)) return saved;
  return "system";
}

function resolveInitialAutoDecryptMedia(): AutoDecryptMedia {
  const saved = readStorageValue(AUTO_DECRYPT_MEDIA_STORAGE_KEY);
  if (saved && AUTO_DECRYPT_MEDIA_VALUES.has(saved as AutoDecryptMedia)) return saved as AutoDecryptMedia;
  return "on";
}

function resolveInitialVibrationEnabled(): VibrationEnabled {
  const saved = readStorageValue(VIBRATION_STORAGE_KEY);
  if (saved && VIBRATION_VALUES.has(saved as VibrationEnabled)) return saved as VibrationEnabled;
  return "on";
}

interface UiSettingsState {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  customThemeBg: string;
  customThemeAccent: string;
  callSecurityMode: CallSecurityMode;
  autoDecryptMedia: AutoDecryptMedia;
  audioOutputPreference: AudioOutputPreference;
  vibrationEnabled: VibrationEnabled;
  setThemeMode: (next: ThemeMode) => void;
  setAccentColor: (next: AccentColor) => void;
  setFontSize: (next: FontSize) => void;
  setCustomThemeBg: (next: string) => void;
  setCustomThemeAccent: (next: string) => void;
  setCallSecurityMode: (next: CallSecurityMode) => void;
  setAutoDecryptMedia: (next: AutoDecryptMedia) => void;
  setAudioOutputPreference: (next: AudioOutputPreference) => void;
  setVibrationEnabled: (next: VibrationEnabled) => void;
}

export const useUiSettingsStore = create<UiSettingsState>()(
  subscribeWithSelector((set) => ({
    themeMode: resolveInitialTheme(),
    accentColor: resolveInitialAccent(),
    fontSize: resolveInitialFontSize(),
    customThemeBg: resolveInitialCustomBg(),
    customThemeAccent: resolveInitialCustomAccent(),
    callSecurityMode: resolveInitialCallSecurityMode(),
    autoDecryptMedia: resolveInitialAutoDecryptMedia(),
    audioOutputPreference: resolveInitialAudioOutputPreference(),
    vibrationEnabled: resolveInitialVibrationEnabled(),

    setThemeMode: (next) => { if (THEME_VALUES.has(next)) set({ themeMode: next }); },
    setAccentColor: (next) => { if (ACCENT_VALUES.has(next)) set({ accentColor: next }); },
    setFontSize: (next) => { if (FONT_SIZE_VALUES.has(next)) set({ fontSize: next }); },
    setCustomThemeBg: (next) => { if (/^#[0-9a-f]{6}$/i.test(next)) set({ customThemeBg: next }); },
    setCustomThemeAccent: (next) => { if (/^#[0-9a-f]{6}$/i.test(next)) set({ customThemeAccent: next }); },
    setCallSecurityMode: (next) => { if (CALL_SECURITY_MODE_VALUES.has(next)) set({ callSecurityMode: next }); },
    setAutoDecryptMedia: (next) => { if (AUTO_DECRYPT_MEDIA_VALUES.has(next)) set({ autoDecryptMedia: next }); },
    setAudioOutputPreference: (next) => { if (isAudioOutputPreference(next)) set({ audioOutputPreference: next }); },
    setVibrationEnabled: (next) => { if (VIBRATION_VALUES.has(next)) set({ vibrationEnabled: next }); },
  }))
);

// ── DOM side-effects ──────────────────────────────────────────────────────────
// Apply current values immediately, then keep in sync on every change.
const _s = useUiSettingsStore.getState();
document.documentElement.dataset.theme = resolveDomTheme(_s.themeMode, _s.customThemeBg);
document.documentElement.dataset.accent = _s.accentColor;
document.documentElement.dataset.fontSize = _s.fontSize;
document.documentElement.dataset.callSecurityMode = _s.callSecurityMode;
setVibrationEnabled(_s.vibrationEnabled === "on");
if (_s.themeMode === "custom") {
  applyCustomThemeVars(_s.customThemeBg, _s.customThemeAccent);
}

useUiSettingsStore.subscribe(
  (s) => s.themeMode,
  (v) => {
    const { customThemeBg } = useUiSettingsStore.getState();
    document.documentElement.dataset.theme = resolveDomTheme(v, customThemeBg);
    writeStorageValue(THEME_STORAGE_KEY, v);
    if (v === "custom") {
      const { customThemeAccent } = useUiSettingsStore.getState();
      applyCustomThemeVars(customThemeBg, customThemeAccent);
    } else {
      removeCustomThemeVars();
    }
  }
);
useUiSettingsStore.subscribe(
  (s) => s.accentColor,
  (v) => { document.documentElement.dataset.accent = v; writeStorageValue(ACCENT_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.fontSize,
  (v) => { document.documentElement.dataset.fontSize = v; writeStorageValue(FONT_SIZE_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.customThemeBg,
  (v) => {
    writeStorageValue(CUSTOM_BG_STORAGE_KEY, v);
    if (useUiSettingsStore.getState().themeMode !== "custom") return;
    document.documentElement.dataset.theme = resolveDomTheme("custom", v);
    const { customThemeAccent } = useUiSettingsStore.getState();
    applyCustomThemeVars(v, customThemeAccent);
    writeStorageValue(CUSTOM_COLOR_SCHEME_STORAGE_KEY, isCustomBgDark(v) ? "dark" : "light");
  }
);
useUiSettingsStore.subscribe(
  (s) => s.customThemeAccent,
  (v) => {
    writeStorageValue(CUSTOM_ACCENT_STORAGE_KEY, v);
    if (useUiSettingsStore.getState().themeMode !== "custom") return;
    const { customThemeBg } = useUiSettingsStore.getState();
    applyCustomThemeVars(customThemeBg, v);
  }
);
useUiSettingsStore.subscribe(
  (s) => s.callSecurityMode,
  (v) => { document.documentElement.dataset.callSecurityMode = v; writeStorageValue(CALL_SECURITY_MODE_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.autoDecryptMedia,
  (v) => { writeStorageValue(AUTO_DECRYPT_MEDIA_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.audioOutputPreference,
  (v) => { writeStorageValue(AUDIO_OUTPUT_PREFERENCE_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.vibrationEnabled,
  (v) => { setVibrationEnabled(v === "on"); writeStorageValue(VIBRATION_STORAGE_KEY, v); }
);

// ── Public hooks ─────────────────────────────────────────────────────────────

export interface AppearanceSettingsContextValue {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  customThemeBg: string;
  customThemeAccent: string;
  setThemeMode: (next: ThemeMode) => void;
  setAccentColor: (next: AccentColor) => void;
  setFontSize: (next: FontSize) => void;
  setCustomThemeBg: (next: string) => void;
  setCustomThemeAccent: (next: string) => void;
}

export interface SecuritySettingsContextValue {
  callSecurityMode: CallSecurityMode;
  autoDecryptMedia: AutoDecryptMedia;
  setCallSecurityMode: (next: CallSecurityMode) => void;
  setAutoDecryptMedia: (next: AutoDecryptMedia) => void;
}

export interface AudioOutputSettingsContextValue {
  audioOutputPreference: AudioOutputPreference;
  setAudioOutputPreference: (next: AudioOutputPreference) => void;
}

export function useAppearanceSettings(): AppearanceSettingsContextValue {
  return useUiSettingsStore(
    useShallow((s) => ({
      themeMode: s.themeMode,
      accentColor: s.accentColor,
      fontSize: s.fontSize,
      customThemeBg: s.customThemeBg,
      customThemeAccent: s.customThemeAccent,
      setThemeMode: s.setThemeMode,
      setAccentColor: s.setAccentColor,
      setFontSize: s.setFontSize,
      setCustomThemeBg: s.setCustomThemeBg,
      setCustomThemeAccent: s.setCustomThemeAccent,
    }))
  );
}

export function useSecuritySettings(): SecuritySettingsContextValue {
  return useUiSettingsStore(
    useShallow((s) => ({
      callSecurityMode: s.callSecurityMode,
      autoDecryptMedia: s.autoDecryptMedia,
      setCallSecurityMode: s.setCallSecurityMode,
      setAutoDecryptMedia: s.setAutoDecryptMedia,
    }))
  );
}

export function useAudioOutputSettings(): AudioOutputSettingsContextValue {
  return useUiSettingsStore(
    useShallow((s) => ({
      audioOutputPreference: s.audioOutputPreference,
      setAudioOutputPreference: s.setAudioOutputPreference,
    }))
  );
}

export interface HapticsSettingsContextValue {
  vibrationEnabled: VibrationEnabled;
  setVibrationEnabled: (next: VibrationEnabled) => void;
}

export function useHapticsSettings(): HapticsSettingsContextValue {
  return useUiSettingsStore(
    useShallow((s) => ({
      vibrationEnabled: s.vibrationEnabled,
      setVibrationEnabled: s.setVibrationEnabled,
    }))
  );
}

/** @deprecated The store is now a Zustand singleton — no provider needed. Kept for backward compatibility. */
export function UiSettingsProvider({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
