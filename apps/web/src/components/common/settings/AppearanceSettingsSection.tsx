import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n/messages";
import type { AccentColor, ThemeMode } from "@/ui-settings";
import { SegmentedControl } from "@/components/ui";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "../SettingsSections.module.css";

const THEMES: ThemeMode[] = ["dark", "light"];
const ACCENTS: AccentColor[] = ["blue", "emerald", "rose", "violet"];

interface AppearanceSettingsSectionProps {
  readonly locale: Locale;
  readonly setLocale: (next: Locale) => void;
  readonly themeMode: ThemeMode;
  readonly accentColor: AccentColor;
  readonly setThemeMode: (next: ThemeMode) => void;
  readonly setAccentColor: (next: AccentColor) => void;
}

function getAccentClass(accent: AccentColor): string {
  if (accent === "emerald") return styles.swatchEmerald ?? "";
  if (accent === "rose") return styles.swatchRose ?? "";
  if (accent === "violet") return styles.swatchViolet ?? "";
  return styles.swatchBlue ?? "";
}

export function AppearanceSettingsSection({
  locale,
  setLocale,
  themeMode,
  accentColor,
  setThemeMode,
  setAccentColor,
}: AppearanceSettingsSectionProps) {
  const { t } = useI18n();

  const langOptions: Array<{ value: Locale; label: string }> = [
    { value: "en", label: t("common.language.english") },
    { value: "ru", label: t("common.language.russian") },
  ];
  const themeOptions = THEMES.map((theme) => ({ value: theme, label: t(`settings.theme.${theme}`) }));

  return (
    <div className={styles.groupStack}>
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
      </SettingsGroup>

      <SettingsGroup
        eyebrow={t("settings.groups.appearance.style")}
        title={t("settings.groups.appearance.style.title")}
        description={t("settings.groups.appearance.style.description")}
        tone="accent"
      >
        <SettingsRow label={t("settings.colors")} controlClassName={styles.settingControlWide}>
          <div className={styles.swatches}>
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                className={`${styles.swatchBtn} ${getAccentClass(accent)} ${accentColor === accent ? styles.swatchBtnActive : ""}`}
                onClick={() => setAccentColor(accent)}
                aria-label={t(`settings.colors.${accent}`)}
                title={t(`settings.colors.${accent}`)}
              />
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
