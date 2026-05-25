import type { PointerEventHandler } from "react";

export type DensityMode = "compact" | "airy";
export type ThreadFilter = "all" | "media" | "secure";

export const densityOptions = [
  { value: "compact", label: "Compact" },
  { value: "airy", label: "Airy" },
] satisfies Array<{ value: DensityMode; label: string }>;

export const threadFilterOptions = [
  { value: "all", label: "All threads" },
  { value: "media", label: "Media heavy" },
  { value: "secure", label: "Secure only" },
] satisfies Array<{ value: ThreadFilter; label: string }>;

export const listboxOptions = [
  { value: "balanced", label: "Balanced" },
  { value: "strict", label: "Strict" },
  { value: "compatibility", label: "Compatibility" },
];

export const themeSnapshots = [
  {
    id: "dark",
    label: "Dark",
    theme: "dark",
    bgVar: "--bg-primary",
    surfaceVar: "--bg-secondary",
    textVar: "--text-primary",
    accentVar: "--accent",
  },
  {
    id: "light",
    label: "Light",
    theme: "light",
    bgVar: "--bg-primary",
    surfaceVar: "--bg-secondary",
    textVar: "--text-primary",
    accentVar: "--accent",
  },
] as const;

export const accentSnapshots = [
  { id: "blue", label: "Blue", accent: "blue", token: "--accent" },
  { id: "emerald", label: "Emerald", accent: "emerald", token: "--accent" },
  { id: "rose", label: "Rose", accent: "rose", token: "--accent" },
  { id: "violet", label: "Violet", accent: "violet", token: "--accent" },
] as const;

export type ThemeSnapshot = (typeof themeSnapshots)[number];
export type AccentSnapshot = (typeof accentSnapshots)[number];

export type ResolvedThemeSnapshot = ThemeSnapshot & {
  resolvedBg: string;
  resolvedSurface: string;
  resolvedText: string;
  resolvedAccent: string;
};

export type ResolvedAccentSnapshot = AccentSnapshot & {
  resolvedValue: string;
};

export const noopPointerHandler: PointerEventHandler<HTMLButtonElement> = () => {};

export function readCssVariable(style: CSSStyleDeclaration, variableName: string): string {
  return style.getPropertyValue(variableName).trim();
}
