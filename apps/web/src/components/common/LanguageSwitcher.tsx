import { useI18n } from "@/i18n";
import { SegmentedControl } from "@/components/ui";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <SegmentedControl
      value={locale}
      onChange={setLocale}
      ariaLabel={t("common.language")}
      grouped
options={[
        {
          value: "en",
          label: "EN",
          ariaLabel: t("common.language.english"),
        },
        {
          value: "ru",
          label: "RU",
          ariaLabel: t("common.language.russian"),
        },
      ]}
    />
  );
}

