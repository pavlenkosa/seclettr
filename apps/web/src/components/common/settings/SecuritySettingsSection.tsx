import { useI18n } from "@/i18n";
import type { AutoDecryptMedia, CallSecurityMode } from "@/ui-settings";
import { isNativePlatform } from "@/lib/native-platform";
import { SegmentedControl } from "@/components/ui";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import { AppLockSection } from "./AppLockSection";
import { TransferSection } from "./TransferSection";
import sharedStyles from "../SettingsSections.module.css";

const CALL_SECURITY_MODES: CallSecurityMode[] = ["compatibility", "balanced", "strict"];
const AUTO_DECRYPT_MEDIA_MODES: AutoDecryptMedia[] = ["on", "off"];

interface SecuritySettingsSectionProps {
  readonly callSecurityMode: CallSecurityMode;
  readonly autoDecryptMedia: AutoDecryptMedia;
  readonly setCallSecurityMode: (next: CallSecurityMode) => void;
  readonly setAutoDecryptMedia: (next: AutoDecryptMedia) => void;
}

export function SecuritySettingsSection({
  callSecurityMode,
  autoDecryptMedia,
  setCallSecurityMode,
  setAutoDecryptMedia,
}: SecuritySettingsSectionProps) {
  const { t } = useI18n();
  const flat = isNativePlatform();

  const callSecurityOptions = CALL_SECURITY_MODES.map((mode) => ({ value: mode, label: t(`settings.callSecurity.${mode}`) }));
  const autoDecryptOptions = AUTO_DECRYPT_MEDIA_MODES.map((mode) => ({ value: mode, label: t(`settings.autoDecryptMedia.${mode}`) }));

  return (
    <div className={flat ? sharedStyles.groupStackFlat : sharedStyles.groupStack}>
      <SettingsGroup
        eyebrow={t("settings.groups.security.calls")}
        title={t("settings.groups.security.calls.title")}
        description={t("settings.groups.security.calls.description")}
        tone="strong"
        flat={flat}
      >
        <SettingsRow
          label={t("settings.callSecurity")}
          description={t(`settings.callSecurity.${callSecurityMode}.description`)}
          secondaryDescription={t("settings.callSecurity.scopeDescription")}
          layout="stacked"
        >
          <SegmentedControl
            value={callSecurityMode}
            onChange={setCallSecurityMode}
            ariaLabel={t("settings.callSecurity")}
            options={callSecurityOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        eyebrow={t("settings.groups.security.media")}
        title={t("settings.groups.security.media.title")}
        description={t("settings.groups.security.media.description")}
        flat={flat}
      >
        <SettingsRow
          label={t("settings.autoDecryptMedia")}
          description={t("settings.autoDecryptMedia.description")}
        >
          <SegmentedControl
            value={autoDecryptMedia}
            onChange={setAutoDecryptMedia}
            ariaLabel={t("settings.autoDecryptMedia")}
            grouped
            options={autoDecryptOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <AppLockSection flat={flat} />
      <TransferSection flat={flat} />
    </div>
  );
}
