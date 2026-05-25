import type { CSSProperties } from "react";
import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n/messages";
import type { AccentColor, FontSize, ThemeMode } from "@/ui-settings";
import { SegmentedControl } from "@/components/ui";
import { hexToOklch, oklchToHex } from "@/lib/custom-theme";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import sharedStyles from "../SettingsSections.module.css";
import styles from "./AppearanceSettingsSection.module.css";

const THEMES: ThemeMode[] = ["dark", "light", "custom"];
const ACCENTS: AccentColor[] = ["blue", "emerald", "rose", "violet", "amber", "teal", "indigo", "slate"];
const FONT_SIZES: FontSize[] = ["sm", "md", "lg"];

const ACCENT_SWATCH_CLASS: Record<AccentColor, string> = {
  blue: "swatchBlue",
  emerald: "swatchEmerald",
  rose: "swatchRose",
  violet: "swatchViolet",
  amber: "swatchAmber",
  teal: "swatchTeal",
  indigo: "swatchIndigo",
  slate: "swatchSlate",
};

function getAccentClass(accent: AccentColor): string {
  return sharedStyles[ACCENT_SWATCH_CLASS[accent]] ?? "";
}

/** Preset background chips for custom theme (dark + light options). */
const BG_PRESETS = [
  "#0b1526", "#1a1a2e", "#1e1e2e", "#0f1923", "#1c1917",
  "#eef3fa", "#f0ebe3", "#f8f4f0",
] as const;

/** Preset accent chips for custom theme. */
const ACCENT_PRESETS = [
  "#3b82f6", "#10b981", "#f43f5e", "#8b5cf6",
  "#f59e0b", "#06b6d4", "#ec4899", "#84cc16",
] as const;

// Fixed hue gradient — hue doesn't depend on component state.
const HUE_TRACK = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]
  .map((deg) => `hsl(${deg}, 75%, 55%)`)
  .join(", ");
const HUE_TRACK_GRADIENT = `linear-gradient(to right, ${HUE_TRACK})`;

// Max chroma for the slider range. Above ~0.35 the sRGB gamut clips for most hues.
const MAX_CHROMA = 0.35;

interface OklchSliderProps {
  readonly id: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (v: number) => void;
  readonly thumbColor: string;
  readonly trackGradient: string;
  readonly label: string;
}

function OklchSlider({ id, value, min, max, step, onChange, thumbColor, trackGradient, label }: OklchSliderProps) {
  return (
    <div className={styles.oklchSliderRow}>
      <label htmlFor={id} className={styles.oklchSliderLabel}>{label}</label>
      <input
        id={id}
        type="range"
        className={styles.oklchSlider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--oklch-track": trackGradient, "--oklch-thumb": thumbColor } as CSSProperties}
      />
    </div>
  );
}

interface OklchColorPickerProps {
  readonly pickerId: string;
  readonly label: string;
  readonly value: string;
  readonly presets: readonly string[];
  readonly onChange: (hex: string) => void;
}

function OklchColorPicker({ pickerId, label, value, presets, onChange }: OklchColorPickerProps) {
  const okl = hexToOklch(value) ?? { l: 0.30, c: 0.15, h: 240 };
  const { l, c, h } = okl;

  const setH = (v: number) => onChange(oklchToHex({ l, c, h: v }));
  const setC = (v: number) => onChange(oklchToHex({ l, c: v, h }));
  const setL = (v: number) => onChange(oklchToHex({ l: v, c, h }));

  // Chroma track: grey → vivid, at current hue and lightness.
  const chromaTrack = `linear-gradient(to right, ${oklchToHex({ l, c: 0, h })}, ${oklchToHex({ l, c: MAX_CHROMA, h })})`;
  // Lightness track: black → mid-hue → white.
  const lightnessTrack = `linear-gradient(to right, #000, ${oklchToHex({ l: 0.5, c, h })}, #fff)`;

  return (
    <div className={styles.colorPickerGroup}>
      <span className={styles.colorPickerLabel}>{label}</span>

      <div className={styles.colorPreview} style={{ background: value }}>
        <span className={styles.colorHex}>{value}</span>
      </div>

      <div className={styles.oklchSliders}>
        <OklchSlider
          id={`${pickerId}-h`}
          label="H"
          value={h}
          min={0}
          max={360}
          step={1}
          onChange={setH}
          thumbColor={value}
          trackGradient={HUE_TRACK_GRADIENT}
        />
        <OklchSlider
          id={`${pickerId}-c`}
          label="C"
          value={c}
          min={0}
          max={MAX_CHROMA}
          step={0.005}
          onChange={setC}
          thumbColor={value}
          trackGradient={chromaTrack}
        />
        <OklchSlider
          id={`${pickerId}-l`}
          label="L"
          value={l}
          min={0}
          max={1}
          step={0.01}
          onChange={setL}
          thumbColor={value}
          trackGradient={lightnessTrack}
        />
      </div>

      <div className={styles.colorPickerChips} role="group" aria-label={label}>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={[
              styles.colorChip,
              value.toLowerCase() === preset.toLowerCase() ? styles.colorChipActive : "",
            ].filter(Boolean).join(" ")}
            style={{ background: preset }}
            onClick={() => onChange(preset)}
            aria-label={preset}
            title={preset}
          />
        ))}
      </div>
    </div>
  );
}

interface AppearanceSettingsSectionProps {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  readonly themeMode: ThemeMode;
  readonly accentColor: AccentColor;
  readonly fontSize: FontSize;
  readonly customThemeBg: string;
  readonly customThemeAccent: string;
  readonly setThemeMode: (next: ThemeMode) => void;
  readonly setAccentColor: (next: AccentColor) => void;
  readonly setFontSize: (next: FontSize) => void;
  readonly setCustomThemeBg: (next: string) => void;
  readonly setCustomThemeAccent: (next: string) => void;
}

export function AppearanceSettingsSection({
  locale,
  setLocale,
  themeMode,
  accentColor,
  fontSize,
  customThemeBg,
  customThemeAccent,
  setThemeMode,
  setAccentColor,
  setFontSize,
  setCustomThemeBg,
  setCustomThemeAccent,
}: AppearanceSettingsSectionProps) {
  const { t } = useI18n();

  const langOptions: Array<{ value: Locale; label: string }> = [
    { value: "en", label: t("common.language.english") },
    { value: "ru", label: t("common.language.russian") },
  ];
  const themeOptions = THEMES.map((theme) => ({ value: theme, label: t(`settings.theme.${theme}`) }));
  const fontSizeOptions = FONT_SIZES.map((size) => ({ value: size, label: t(`settings.fontSize.${size}`) }));

  return (
    <div className={sharedStyles.groupStack}>
      <SettingsGroup
        eyebrow={t("settings.groups.appearance.core")}
        title={t("settings.groups.appearance.core.title")}
        description={t("settings.groups.appearance.core.description")}
      >
        <SettingsRow label={t("settings.language")}>
          <SegmentedControl
            value={locale}
            onChange={setLocale}
            ariaLabel={t("settings.language")}
            grouped
            options={langOptions}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.theme")}>
          <SegmentedControl
            value={themeMode}
            onChange={setThemeMode}
            ariaLabel={t("settings.theme")}
            grouped
            options={themeOptions}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.fontSize")}>
          <SegmentedControl
            value={fontSize}
            onChange={setFontSize}
            ariaLabel={t("settings.fontSize")}
            grouped
            options={fontSizeOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      {themeMode === "custom" ? (
        <SettingsGroup
          eyebrow={t("settings.groups.appearance.style")}
          title={t("settings.theme.custom")}
          description={t("settings.groups.appearance.style.description")}
          tone="accent"
        >
          <div className={styles.customThemeRow}>
            <OklchColorPicker
              pickerId="bg"
              label={t("settings.customTheme.bg")}
              value={customThemeBg}
              presets={BG_PRESETS}
              onChange={setCustomThemeBg}
            />
            <OklchColorPicker
              pickerId="accent"
              label={t("settings.customTheme.accent")}
              value={customThemeAccent}
              presets={ACCENT_PRESETS}
              onChange={setCustomThemeAccent}
            />
          </div>
        </SettingsGroup>
      ) : (
        <SettingsGroup
          eyebrow={t("settings.groups.appearance.style")}
          title={t("settings.groups.appearance.style.title")}
          description={t("settings.groups.appearance.style.description")}
          tone="accent"
        >
          <SettingsRow label={t("settings.colors")} layout="stacked">
            <div className={sharedStyles.swatches}>
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  className={`${sharedStyles.swatchBtn} ${getAccentClass(accent)} ${accentColor === accent ? sharedStyles.swatchBtnActive : ""}`}
                  onClick={() => setAccentColor(accent)}
                  aria-label={t(`settings.colors.${accent}`)}
                  title={t(`settings.colors.${accent}`)}
                />
              ))}
            </div>
          </SettingsRow>
        </SettingsGroup>
      )}
    </div>
  );
}
