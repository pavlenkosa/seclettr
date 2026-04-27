import { type ReactNode } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

export type ThemeMode = "light" | "dark";
export type AccentColor = "blue" | "emerald" | "rose" | "violet";
export type CallSecurityMode = "compatibility" | "balanced" | "strict";
export type GlassMode = "on" | "off";
export type AudioOutputPreference = "system" | `device:${string}`;
export type AutoDecryptMedia = "on" | "off";

const THEME_STORAGE_KEY = "seclettr.ui.theme.v1";
const ACCENT_STORAGE_KEY = "seclettr.ui.accent.v1";
const CALL_SECURITY_MODE_STORAGE_KEY = "seclettr.ui.callSecurityMode.v1";
const GLASS_MODE_STORAGE_KEY = "seclettr.ui.glassMode.v1";
const AUDIO_OUTPUT_PREFERENCE_STORAGE_KEY = "seclettr.ui.audioOutputPreference.v1";
const AUTO_DECRYPT_MEDIA_STORAGE_KEY = "seclettr.ui.autoDecryptMedia.v1";

const THEME_VALUES: ReadonlySet<ThemeMode> = new Set(["light", "dark"]);
const ACCENT_VALUES: ReadonlySet<AccentColor> = new Set(["blue", "emerald", "rose", "violet"]);
const CALL_SECURITY_MODE_VALUES: ReadonlySet<CallSecurityMode> = new Set(["compatibility", "balanced", "strict"]);
const GLASS_MODE_VALUES: ReadonlySet<GlassMode> = new Set(["on", "off"]);
const AUTO_DECRYPT_MEDIA_VALUES: ReadonlySet<AutoDecryptMedia> = new Set(["on", "off"]);

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

function resolveInitialCallSecurityMode(): CallSecurityMode {
  const saved = readStorageValue(CALL_SECURITY_MODE_STORAGE_KEY);
  if (saved && CALL_SECURITY_MODE_VALUES.has(saved as CallSecurityMode)) return saved as CallSecurityMode;
  return "balanced";
}

function resolveInitialGlassMode(): GlassMode {
  const saved = readStorageValue(GLASS_MODE_STORAGE_KEY);
  if (saved && GLASS_MODE_VALUES.has(saved as GlassMode)) return saved as GlassMode;
  return "on";
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

interface UiSettingsState {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  glassMode: GlassMode;
  callSecurityMode: CallSecurityMode;
  autoDecryptMedia: AutoDecryptMedia;
  audioOutputPreference: AudioOutputPreference;
  setThemeMode: (next: ThemeMode) => void;
  setAccentColor: (next: AccentColor) => void;
  setGlassMode: (next: GlassMode) => void;
  setCallSecurityMode: (next: CallSecurityMode) => void;
  setAutoDecryptMedia: (next: AutoDecryptMedia) => void;
  setAudioOutputPreference: (next: AudioOutputPreference) => void;
}

export const useUiSettingsStore = create<UiSettingsState>()(
  subscribeWithSelector((set) => ({
    themeMode: resolveInitialTheme(),
    accentColor: resolveInitialAccent(),
    glassMode: resolveInitialGlassMode(),
    callSecurityMode: resolveInitialCallSecurityMode(),
    autoDecryptMedia: resolveInitialAutoDecryptMedia(),
    audioOutputPreference: resolveInitialAudioOutputPreference(),

    setThemeMode: (next) => { if (THEME_VALUES.has(next)) set({ themeMode: next }); },
    setAccentColor: (next) => { if (ACCENT_VALUES.has(next)) set({ accentColor: next }); },
    setGlassMode: (next) => { if (GLASS_MODE_VALUES.has(next)) set({ glassMode: next }); },
    setCallSecurityMode: (next) => { if (CALL_SECURITY_MODE_VALUES.has(next)) set({ callSecurityMode: next }); },
    setAutoDecryptMedia: (next) => { if (AUTO_DECRYPT_MEDIA_VALUES.has(next)) set({ autoDecryptMedia: next }); },
    setAudioOutputPreference: (next) => { if (isAudioOutputPreference(next)) set({ audioOutputPreference: next }); },
  }))
);

// ── DOM side-effects ──────────────────────────────────────────────────────────
// Apply current values immediately, then keep in sync on every change.
const _s = useUiSettingsStore.getState();
document.documentElement.dataset.theme = _s.themeMode;
document.documentElement.dataset.accent = _s.accentColor;
document.documentElement.dataset.glass = _s.glassMode;
document.documentElement.dataset.callSecurityMode = _s.callSecurityMode;

useUiSettingsStore.subscribe(
  (s) => s.themeMode,
  (v) => { document.documentElement.dataset.theme = v; writeStorageValue(THEME_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.accentColor,
  (v) => { document.documentElement.dataset.accent = v; writeStorageValue(ACCENT_STORAGE_KEY, v); }
);
useUiSettingsStore.subscribe(
  (s) => s.glassMode,
  (v) => { document.documentElement.dataset.glass = v; writeStorageValue(GLASS_MODE_STORAGE_KEY, v); }
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

// ── Public hooks ─────────────────────────────────────────────────────────────

export interface AppearanceSettingsContextValue {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  glassMode: GlassMode;
  setThemeMode: (next: ThemeMode) => void;
  setAccentColor: (next: AccentColor) => void;
  setGlassMode: (next: GlassMode) => void;
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
      glassMode: s.glassMode,
      setThemeMode: s.setThemeMode,
      setAccentColor: s.setAccentColor,
      setGlassMode: s.setGlassMode,
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

/** @deprecated The store is now a Zustand singleton — no provider needed. Kept for backward compatibility. */
export function UiSettingsProvider({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
