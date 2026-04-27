import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { SectionedModal, SurfacePanel, type StatusBadgeTone } from "@/components/ui";
import { useAppearanceSettings, useSecuritySettings } from "@/ui-settings";
import {
  BellIcon,
  ShieldIcon,
  SparklesIcon,
} from "./settings/SettingsSectionPrimitives";
import {
  usePushSettings,
  resolveNotificationsSummaryTone,
  resolvePushStatusLabel,
} from "./usePushSettings";
import styles from "./SettingsModal.module.css";

interface Props {
  readonly onClose: () => void;
}

type SettingsSectionId = "notifications" | "appearance" | "security";

const loadAppearanceSettingsSection = () =>
  import("./settings/AppearanceSettingsSection").then(({ AppearanceSettingsSection: Section }) => ({
    default: Section,
  }));

const loadNotificationsSettingsSectionContainer = () =>
  import("./settings/NotificationsSettingsSectionContainer").then(({
    NotificationsSettingsSectionContainer: Section,
  }) => ({
    default: Section,
  }));

const loadSecuritySettingsSection = () =>
  import("./settings/SecuritySettingsSection").then(({ SecuritySettingsSection: Section }) => ({
    default: Section,
  }));

const AppearanceSettingsSection = lazy(loadAppearanceSettingsSection);
const NotificationsSettingsSectionContainer = lazy(loadNotificationsSettingsSectionContainer);
const SecuritySettingsSection = lazy(loadSecuritySettingsSection);

const SETTINGS_SECTION_SKELETON_ROWS: Record<SettingsSectionId, readonly number[]> = {
  notifications: [1, 4, 1],
  appearance: [2, 2],
  security: [1, 1, 1],
};

function SettingsSkeletonGroup({ rows }: Readonly<{ rows: number }>) {
  return (
    <SurfacePanel
      className={`${styles.groupPanel} ${styles.skeletonGroupPanel}`}
      tone="strong"
      padding="md"
      radius="xl"
      glass="medium"
    >
      <div className={styles.skeletonGroupHeader}>
        <span className={`${styles.skeletonLine} ${styles.skeletonEyebrow}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonDescription}`} />
      </div>
      <div className={styles.skeletonRows}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <div className={styles.skeletonRowText}>
              <span className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
              <span className={`${styles.skeletonLine} ${styles.skeletonHint}`} />
            </div>
            <span className={`${styles.skeletonLine} ${styles.skeletonControl}`} />
          </div>
        ))}
      </div>
    </SurfacePanel>
  );
}

function SettingsSectionFallback({
  label,
  section,
}: Readonly<{
  label: string;
  section: SettingsSectionId;
}>) {
  return (
    <div
      className={styles.sectionSkeletonStack}
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      {SETTINGS_SECTION_SKELETON_ROWS[section].map((rows, index) => (
        <SettingsSkeletonGroup key={`${section}-${index}`} rows={rows} />
      ))}
    </div>
  );
}


export function SettingsModal({ onClose }: Props) {
  const { t, locale, setLocale } = useI18n();
  const {
    themeMode,
    accentColor,
    glassMode,
    setThemeMode,
    setAccentColor,
    setGlassMode,
  } = useAppearanceSettings();
  const {
    callSecurityMode,
    autoDecryptMedia,
    setCallSecurityMode,
    setAutoDecryptMedia,
  } = useSecuritySettings();

  // Hoisted here so API calls start immediately on modal open, before lazy chunks load.
  const pushSettings = usePushSettings();

  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("notifications");

  useModalSurfaceA11y({
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: requestClose,
  });

  useEffect(() => {
    void loadNotificationsSettingsSectionContainer();
    void loadAppearanceSettingsSection();
    void loadSecuritySettingsSection();
  }, []);

  const notificationsSummary = resolvePushStatusLabel(pushSettings.pushStatus, t);
  const notificationsSummaryTone: StatusBadgeTone = resolveNotificationsSummaryTone(pushSettings.pushStatus);

  const sectionEntries = useMemo(() => [
    {
      id: "notifications",
      title: t("settings.sections.notifications"),
      description: t("settings.sections.notifications.description"),
      summary: notificationsSummary,
      summaryTone: notificationsSummaryTone,
      icon: <BellIcon />,
    },
    {
      id: "appearance",
      title: t("settings.sections.appearance"),
      description: t("settings.sections.appearance.description"),
      summary: [
        t(`settings.theme.${themeMode}`),
        t(`settings.colors.${accentColor}`),
        t(`settings.glassEffects.${glassMode}`),
      ].join(" · "),
      summaryTone: "accent" as const,
      icon: <SparklesIcon />,
    },
    {
      id: "security",
      title: t("settings.sections.security"),
      description: t("settings.sections.security.description"),
      summary: [
        t(`settings.callSecurity.${callSecurityMode}`),
        t(`settings.autoDecryptMedia.${autoDecryptMedia}`),
      ].join(" · "),
      summaryTone: "success" as const,
      icon: <ShieldIcon />,
    },
  ] satisfies Array<{
    id: SettingsSectionId;
    title: string;
    description: string;
    summary: string;
    summaryTone: StatusBadgeTone;
    icon: ReactNode;
    }>, [
    t,
    themeMode,
    accentColor,
    glassMode,
    callSecurityMode,
    autoDecryptMedia,
    notificationsSummary,
    notificationsSummaryTone,
  ]);

  return (
    <SectionedModal
      ref={dialogRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("settings.title")}
      closeAriaLabel={t("settings.closeAria")}
      title={t("settings.title")}
      closeButtonRef={closeButtonRef}
      style={{
        "--modal-width": "840px",
        "--modal-max-height": "88vh",
        "--sectioned-modal-pane-min-height": "min(700px, calc(88dvh - 4.6rem))",
        "--sectioned-modal-pane-min-height-mobile": "min(620px, calc(86dvh - 4.4rem))",
      } as CSSProperties}
      sections={sectionEntries}
      activeSection={activeSection}
      onSectionChange={(id) => setActiveSection(id as SettingsSectionId)}
      heroEyebrow={t("settings.title")}
      footerNote={t("settings.appliedInstantly")}
      sidebarAriaLabel={t("settings.sections.ariaLabel")}
    >
      <Suspense fallback={<SettingsSectionFallback label={t("app.loading")} section={activeSection} />}>
        {activeSection === "appearance" ? (
          <AppearanceSettingsSection
            locale={locale}
            setLocale={setLocale}
            themeMode={themeMode}
            accentColor={accentColor}
            glassMode={glassMode}
            setThemeMode={setThemeMode}
            setAccentColor={setAccentColor}
            setGlassMode={setGlassMode}
          />
        ) : null}

        {activeSection === "security" ? (
          <SecuritySettingsSection
            callSecurityMode={callSecurityMode}
            autoDecryptMedia={autoDecryptMedia}
            setCallSecurityMode={setCallSecurityMode}
            setAutoDecryptMedia={setAutoDecryptMedia}
          />
        ) : null}

        {activeSection === "notifications" ? (
          <NotificationsSettingsSectionContainer {...pushSettings} />
        ) : null}
      </Suspense>
    </SectionedModal>
  );
}
