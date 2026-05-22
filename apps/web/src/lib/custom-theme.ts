/**
 * Derives the full set of CSS custom-property values for the "custom" theme
 * from a background hex color and an accent hex color.
 *
 * Uses OKLCH (perceptually uniform) for surface tiers, text tinting, and
 * accent state derivation. No external dependencies — all math is inline.
 */

type Rgb = readonly [number, number, number];
export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

// ── Basic utilities ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): Rgb | null {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ] as const;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function hexAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
}

// ── OKLCH math (zero-dependency, sRGB D65) ────────────────────────────────────
//
// Pipeline: sRGB hex → linear sRGB → XYZ-D65 → OKLab → OKLCH
//           OKLCH → OKLab → XYZ-D65 → linear sRGB → sRGB hex
//
// Out-of-gamut values are clamped in fromLinear; some highly saturated
// OKLCH coordinates produce clipped sRGB but this is visually acceptable.

function toLinear(v: number): number {
  const n = v / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function fromLinear(v: number): number {
  const n = clamp01(v);
  return Math.round((n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1 / 2.4) - 0.055) * 255);
}

function linearToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

function xyzToLinear(x: number, y: number, z: number): [number, number, number] {
  return [
     3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
     0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

function xyzToOklab(x: number, y: number, z: number): [number, number, number] {
  const l = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function oklabToXyz(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
     1.2270138511 * l - 0.5577999807 * m + 0.2812561490 * s,
    -0.0405801784 * l + 1.1122568696 * m - 0.0716766787 * s,
    -0.0763812845 * l - 0.4214819784 * m + 1.5861632204 * s,
  ];
}

export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [L, a, b] = xyzToOklab(...linearToXyz(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])));
  return {
    l: L,
    c: Math.sqrt(a * a + b * b),
    h: ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360,
  };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = h * Math.PI / 180;
  const [r, g, b] = xyzToLinear(...oklabToXyz(clamp01(l), c * Math.cos(hr), c * Math.sin(hr)));
  return rgbToHex(fromLinear(r), fromLinear(g), fromLinear(b));
}

// ── Public API ────────────────────────────────────────────────────────────────

/** All vars set by applyCustomThemeVars — must be exhaustive for removeCustomThemeVars. */
export const CUSTOM_THEME_VARS = [
  "--bg-primary", "--bg-secondary", "--bg-tertiary", "--bg-message-out", "--bg-message-in",
  "--text-primary", "--text-secondary", "--text-muted",
  "--border", "--danger", "--success", "--warning",
  "--danger-contrast", "--danger-soft-bg", "--danger-soft-border",
  "--accent", "--accent-hover", "--accent-gradient",
  "--app-glow-left", "--app-glow-right",
  "--panel-sidebar-bg", "--panel-header-bg", "--panel-border", "--panel-border-soft",
  "--panel-modal-bg", "--surface-shell", "--surface-shell-strong", "--surface-float",
  "--shadow", "--elevated-shadow-sm", "--elevated-shadow-md", "--elevated-shadow-lg",
  "--icon-btn-bg", "--icon-btn-border", "--icon-btn-color", "--icon-btn-hover-bg", "--icon-btn-hover-color",
  "--avatar-grad-start", "--avatar-grad-end", "--avatar-text", "--avatar-shadow",
  "--list-item-hover-bg", "--list-item-active-bg", "--list-item-active-ring",
  "--message-container-bg", "--timestamp-bg", "--timestamp-border", "--bubble-shadow",
  "--message-out-bg", "--message-out-tail", "--message-out-text",
  "--message-out-ui", "--message-out-ui-muted", "--message-out-ui-soft", "--message-out-ui-strong",
  "--message-out-wave", "--message-out-wave-active",
  "--message-in-bg", "--message-in-border", "--message-in-tail", "--message-in-text",
  "--message-delivered", "--message-ui-accent",
  "--voice-decrypt-bg", "--voice-decrypt-border", "--voice-decrypt-text", "--voice-decrypt-icon",
  "--voice-decrypt-hover-bg", "--voice-play-bg", "--voice-play-border", "--voice-play-hover-bg",
  "--voice-bar", "--voice-bar-active",
  "--composer-bg", "--composer-inner-bg", "--composer-inner-border",
  "--composer-shadow", "--composer-shadow-focus",
  "--brand-mark-primary-start", "--brand-mark-primary-mid", "--brand-mark-primary-end",
  "--brand-mark-accent-start", "--brand-mark-accent-mid", "--brand-mark-accent-end",
  "--brand-mark-base-start", "--brand-mark-base-mid", "--brand-mark-base-end",
] as const;

/** Returns true when the bg needs light text (OKLCH L < 0.50 ≈ WCAG Y < 0.22). */
export function isCustomBgDark(bgHex: string): boolean {
  return (hexToOklch(bgHex)?.l ?? 0) < 0.50;
}

/**
 * Derives the complete CSS-var map for the custom theme.
 * Returns null when either hex is invalid.
 */
export function deriveCustomThemeVars(bgHex: string, accentHex: string): Record<string, string> | null {
  const bgOkl = hexToOklch(bgHex);
  const acOkl = hexToOklch(accentHex);
  if (!bgOkl || !acOkl) return null;

  const { l, c, h } = bgOkl;
  const { l: al, c: ac, h: ah } = acOkl;
  const isDark = l < 0.50;

  // Chroma for surface tiers is capped to prevent garish tinting on highly
  // saturated backgrounds (e.g. #8800ff). The cap mirrors what Material
  // Design 3 does with its "neutral" tonal palette: hue identity is preserved
  // but saturation is pulled way down for shells/panels.
  const surfC = Math.min(c, 0.06);

  // Shift bg L by dL, optionally scale chroma. Used for all surface tiers.
  const surf = (dL: number, cScale = 1.0): string =>
    oklchToHex({ l: clamp01(l + dL), c: surfC * cScale, h });

  // Shift accent L by dL, preserving hue and chroma.
  const acStep = (dL: number): string =>
    oklchToHex({ l: clamp01(al + dL), c: ac, h: ah });

  const accentHover = acStep(isDark ? 0.07 : -0.07);
  const accentDeep  = acStep(-0.10);

  // When the accent is very light (L > 0.68) outgoing bubble text needs to be dark.
  const lightAccent   = al > 0.68;
  const onAccentText  = lightAccent ? "#111827" : "#ffffff";
  const onAccentUi    = lightAccent ? "rgb(17 24 39 / 0.92)"  : "rgb(255 255 255 / 0.92)";
  const onAccentMuted = lightAccent ? "rgb(17 24 39 / 0.76)"  : "rgb(255 255 255 / 0.76)";
  const onAccentSoft  = lightAccent ? "rgb(17 24 39 / 0.16)"  : "rgb(255 255 255 / 0.16)";
  const onAccentStrong = lightAccent ? "rgb(17 24 39 / 0.26)" : "rgb(255 255 255 / 0.26)";
  const onAccentWave  = lightAccent ? "rgb(17 24 39 / 0.22)"  : "rgb(255 255 255 / 0.22)";
  const onAccentWaveA = lightAccent ? "rgb(17 24 39 / 0.90)"  : "rgb(255 255 255 / 0.90)";

  const v: Record<string, string> = {};

  // ── Accent-derived vars (same regardless of bg dark/light) ───────────────

  v["--bg-message-out"]       = accentHex;
  v["--accent"]               = accentHex;
  v["--accent-hover"]         = accentHover;
  v["--accent-gradient"]      = accentHex;
  v["--avatar-grad-start"]    = acStep(0.11);
  v["--avatar-grad-end"]      = accentHex;
  v["--avatar-text"]          = onAccentText;
  v["--message-out-bg"]       = accentHex;
  v["--message-out-tail"]     = accentDeep;
  v["--message-out-text"]     = onAccentText;
  v["--message-out-ui"]       = onAccentUi;
  v["--message-out-ui-muted"] = onAccentMuted;
  v["--message-out-ui-soft"]  = onAccentSoft;
  v["--message-out-ui-strong"] = onAccentStrong;
  v["--message-out-wave"]     = onAccentWave;
  v["--message-out-wave-active"] = onAccentWaveA;
  v["--voice-play-bg"]        = hexAlpha(accentHex, 0.84);
  v["--voice-play-border"]    = hexAlpha(accentHex, 0.28);
  v["--voice-play-hover-bg"]  = hexAlpha(accentHover, 0.90);
  v["--voice-decrypt-icon"]   = accentHex;

  // Read receipts / accent UI on outgoing bubble: lighter + lower chroma version.
  const deliveredColor = oklchToHex({ l: clamp01(al + 0.20), c: ac * 0.60, h: ah });
  v["--message-delivered"] = isDark ? deliveredColor : accentHex;
  v["--message-ui-accent"] = isDark ? deliveredColor : accentHex;

  v["--brand-mark-primary-start"] = `color-mix(in srgb, ${accentHex} 74%, white 26%)`;
  v["--brand-mark-primary-mid"]   = `color-mix(in srgb, ${accentHex} 92%, white 8%)`;
  v["--brand-mark-primary-end"]   = `color-mix(in srgb, ${accentHex} 64%, #071425 36%)`;
  v["--brand-mark-accent-start"]  = `color-mix(in srgb, ${accentHex} 34%, white 66%)`;
  v["--brand-mark-accent-mid"]    = `color-mix(in srgb, ${accentHex} 54%, white 46%)`;
  v["--brand-mark-accent-end"]    = `color-mix(in srgb, ${accentHex} 86%, white 14%)`;
  v["--brand-mark-base-start"]    = `color-mix(in srgb, ${accentHex} 58%, white 20%)`;
  v["--brand-mark-base-mid"]      = `color-mix(in srgb, ${accentHex} 90%, #071425 10%)`;
  v["--brand-mark-base-end"]      = `color-mix(in srgb, ${accentHex} 56%, #04101f 44%)`;
  v["--app-glow-left"]  = "transparent";
  v["--app-glow-right"] = "transparent";

  // ── Background-derived vars ──────────────────────────────────────────────

  v["--bg-primary"] = bgHex;

  if (isDark) {
    // Surfaces: step L upward in OKLCH — equal visual jumps regardless of hue.
    const shellBg  = surf(0.05);
    const floatBg  = surf(0.07);
    const msgInBg  = surf(0.07, 0.80);

    v["--bg-secondary"]          = surf(0.04);
    v["--bg-tertiary"]           = surf(0.08);
    v["--bg-message-in"]         = msgInBg;
    v["--surface-shell"]         = shellBg;
    v["--surface-shell-strong"]  = surf(0.03);
    v["--surface-float"]         = floatBg;
    v["--panel-sidebar-bg"]      = shellBg;
    v["--panel-header-bg"]       = shellBg;
    v["--panel-modal-bg"]        = shellBg;

    // Text: near-white with a subtle hue tint matching the bg character.
    const tC = Math.max(c * 0.12, 0.008);
    const textPrimary   = oklchToHex({ l: 0.94, c: tC,        h });
    const textSecondary = oklchToHex({ l: 0.68, c: tC * 0.70, h });
    const textMuted     = oklchToHex({ l: 0.50, c: tC * 0.50, h });
    v["--text-primary"]   = textPrimary;
    v["--text-secondary"] = textSecondary;
    v["--text-muted"]     = textMuted;

    v["--border"]            = "rgb(255 255 255 / 0.18)";
    v["--panel-border"]      = "rgb(255 255 255 / 0.14)";
    v["--panel-border-soft"] = "rgb(255 255 255 / 0.10)";

    v["--shadow"]              = "none";
    v["--elevated-shadow-sm"]  = "none";
    v["--elevated-shadow-md"]  = "none";
    v["--elevated-shadow-lg"]  = "none";
    v["--bubble-shadow"]       = "none";
    v["--avatar-shadow"]       = "none";

    v["--icon-btn-bg"]         = floatBg;
    v["--icon-btn-border"]     = "rgb(255 255 255 / 0.14)";
    v["--icon-btn-color"]      = "rgb(255 255 255 / 0.82)";
    v["--icon-btn-hover-bg"]   = surf(0.10);
    v["--icon-btn-hover-color"] = "#ffffff";

    v["--list-item-hover-bg"]   = "rgb(255 255 255 / 0.06)";
    v["--list-item-active-bg"]  = hexAlpha(accentHex, 0.24);
    v["--list-item-active-ring"] = hexAlpha(accentHex, 0.16);

    v["--message-container-bg"] = bgHex;
    v["--timestamp-bg"]         = shellBg;
    v["--timestamp-border"]     = "rgb(255 255 255 / 0.12)";
    v["--message-in-bg"]        = msgInBg;
    v["--message-in-border"]    = "rgb(255 255 255 / 0.10)";
    v["--message-in-tail"]      = msgInBg;
    v["--message-in-text"]      = textPrimary;

    v["--voice-decrypt-bg"]      = "rgb(255 255 255 / 0.08)";
    v["--voice-decrypt-border"]  = "rgb(255 255 255 / 0.16)";
    v["--voice-decrypt-text"]    = textPrimary;
    v["--voice-decrypt-hover-bg"] = "rgb(255 255 255 / 0.12)";
    v["--voice-bar"]             = "rgb(255 255 255 / 0.22)";
    v["--voice-bar-active"]      = "rgb(255 255 255 / 0.90)";

    v["--composer-bg"]           = bgHex;
    v["--composer-inner-bg"]     = shellBg;
    v["--composer-inner-border"] = "rgb(255 255 255 / 0.12)";
    v["--composer-shadow"]       = "none";
    v["--composer-shadow-focus"] = "none";

    v["--danger"]            = "#ef4444";
    v["--success"]           = "#22c55e";
    v["--warning"]           = "#f59e0b";
    v["--danger-contrast"]   = "#fee2e2";
    v["--danger-soft-bg"]    = "rgb(127 29 29 / 0.35)";
    v["--danger-soft-border"] = "rgb(248 113 113 / 0.36)";
  } else {
    // Surfaces: step L downward (toward more saturated) for light theme.
    const strongBg = surf(-0.03, 1.02);

    v["--bg-secondary"]          = surf(-0.04, 1.05);
    v["--bg-tertiary"]           = surf(-0.08, 1.10);
    v["--bg-message-in"]         = "#ffffff";
    v["--surface-shell"]         = "#ffffff";
    v["--surface-shell-strong"]  = strongBg;
    v["--surface-float"]         = "#ffffff";
    v["--panel-sidebar-bg"]      = "#ffffff";
    v["--panel-header-bg"]       = "#ffffff";
    v["--panel-modal-bg"]        = "#ffffff";

    // Text: near-black with a subtle hue tint matching the bg character.
    const tC = Math.max(c * 0.10, 0.006);
    const textPrimary   = oklchToHex({ l: 0.14, c: tC,        h });
    const textSecondary = oklchToHex({ l: 0.40, c: tC * 0.75, h });
    const textMuted     = oklchToHex({ l: 0.56, c: tC * 0.55, h });
    v["--text-primary"]   = textPrimary;
    v["--text-secondary"] = textSecondary;
    v["--text-muted"]     = textMuted;

    v["--border"]            = "rgb(15 23 42 / 0.18)";
    v["--panel-border"]      = "rgb(15 23 42 / 0.14)";
    v["--panel-border-soft"] = "rgb(15 23 42 / 0.10)";

    v["--shadow"]             = "0 1px 4px rgb(15 23 42 / 0.08)";
    v["--elevated-shadow-sm"] = "0 1px 3px rgb(15 23 42 / 0.10)";
    v["--elevated-shadow-md"] = "0 2px 8px rgb(15 23 42 / 0.12)";
    v["--elevated-shadow-lg"] = "0 4px 16px rgb(15 23 42 / 0.14)";
    v["--bubble-shadow"]      = "none";
    v["--avatar-shadow"]      = "0 1px 4px rgb(15 23 42 / 0.10)";

    v["--icon-btn-bg"]         = "#ffffff";
    v["--icon-btn-border"]     = "rgb(15 23 42 / 0.14)";
    v["--icon-btn-color"]      = "rgb(15 23 42 / 0.70)";
    v["--icon-btn-hover-bg"]   = surf(-0.06, 1.04);
    v["--icon-btn-hover-color"] = textPrimary;

    v["--list-item-hover-bg"]   = "rgb(15 23 42 / 0.04)";
    v["--list-item-active-bg"]  = hexAlpha(accentHex, 0.14);
    v["--list-item-active-ring"] = hexAlpha(accentHex, 0.10);

    v["--message-container-bg"] = bgHex;
    v["--timestamp-bg"]         = "#ffffff";
    v["--timestamp-border"]     = "rgb(15 23 42 / 0.10)";
    v["--message-in-bg"]        = "#ffffff";
    v["--message-in-border"]    = "rgb(15 23 42 / 0.10)";
    v["--message-in-tail"]      = "#ffffff";
    v["--message-in-text"]      = textPrimary;

    v["--voice-decrypt-bg"]      = "rgb(15 23 42 / 0.06)";
    v["--voice-decrypt-border"]  = "rgb(15 23 42 / 0.14)";
    v["--voice-decrypt-text"]    = textPrimary;
    v["--voice-decrypt-hover-bg"] = "rgb(15 23 42 / 0.10)";
    v["--voice-bar"]             = "rgb(15 23 42 / 0.16)";
    v["--voice-bar-active"]      = "rgb(15 23 42 / 0.70)";

    v["--composer-bg"]           = bgHex;
    v["--composer-inner-bg"]     = "#ffffff";
    v["--composer-inner-border"] = "rgb(15 23 42 / 0.12)";
    v["--composer-shadow"]       = "0 1px 4px rgb(15 23 42 / 0.06)";
    v["--composer-shadow-focus"] = "0 0 0 2px rgb(15 23 42 / 0.08)";

    v["--danger"]            = "#b91c1c";
    v["--success"]           = "#166534";
    v["--warning"]           = "#92400e";
    v["--danger-contrast"]   = "#fee2e2";
    v["--danger-soft-bg"]    = "rgb(254 226 226 / 0.80)";
    v["--danger-soft-border"] = "rgb(185 28 28 / 0.28)";
  }

  return v;
}

export function applyCustomThemeVars(bgHex: string, accentHex: string): void {
  const vars = deriveCustomThemeVars(bgHex, accentHex);
  if (!vars) return;
  const el = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
  el.style.colorScheme = isCustomBgDark(bgHex) ? "dark" : "light";
}

export function removeCustomThemeVars(): void {
  const el = document.documentElement;
  for (const key of CUSTOM_THEME_VARS) {
    el.style.removeProperty(key);
  }
  el.style.colorScheme = "";
}
