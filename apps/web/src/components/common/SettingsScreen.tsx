import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";
import { useAppearanceSettings, useSecuritySettings } from "@/ui-settings";
import {
  BellIcon,
  ShieldIcon,
  SparklesIcon,
} from "./settings/SettingsSectionPrimitives";
import {
  resolvePushStatusLabel,
  usePushSettings,
} from "./usePushSettings";
import styles from "./SettingsScreen.module.css";

interface SettingsScreenProps {
  readonly username?: string | null;
  readonly isMobileViewport?: boolean;
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

function SettingsSectionFallback({ label }: Readonly<{ label: string }>) {
  return (
    <div className={styles.sectionSkeletonStack} aria-busy="true" aria-label={label} role="status">
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m7 4 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function getInitials(username?: string | null): string {
  const value = username?.trim();
  if (!value) return "S";
  return value.slice(0, 2).toUpperCase();
}

export function SettingsScreen({
  username,
  isMobileViewport = false,
  onClose,
}: SettingsScreenProps) {
  const { t, locale, setLocale } = useI18n();
  const {
    themeMode,
    accentColor,
    setThemeMode,
    setAccentColor,
  } = useAppearanceSettings();
  const {
    callSecurityMode,
    autoDecryptMedia,
    setCallSecurityMode,
    setAutoDecryptMedia,
  } = useSecuritySettings();
  const pushSettings = usePushSettings();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appearance");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    void loadAppearanceSettingsSection();
    void loadNotificationsSettingsSectionContainer();
    void loadSecuritySettingsSection();
  }, []);

  const notificationsSummary = resolvePushStatusLabel(pushSettings.pushStatus, t);

  const sectionEntries = useMemo(() => [
    {
      id: "appearance",
      title: t("settings.sections.appearance"),
      description: t("settings.sections.appearance.description"),
      summary: [
        t(`settings.theme.${themeMode}`),
        t(`settings.colors.${accentColor}`),
      ].join(" · "),
      icon: <SparklesIcon />,
    },
    {
      id: "notifications",
      title: t("settings.sections.notifications"),
      description: t("settings.sections.notifications.description"),
      summary: notificationsSummary,
      icon: <BellIcon />,
    },
    {
      id: "security",
      title: t("settings.sections.security"),
      description: t("settings.sections.security.description"),
      summary: [
        t(`settings.callSecurity.${callSecurityMode}`),
        t(`settings.autoDecryptMedia.${autoDecryptMedia}`),
      ].join(" · "),
      icon: <ShieldIcon />,
    },
  ] satisfies Array<{
    id: SettingsSectionId;
    title: string;
    description: string;
    summary: string;
    icon: ReactNode;
  }>, [
    accentColor,
    autoDecryptMedia,
    callSecurityMode,
    notificationsSummary,
    t,
    themeMode,
  ]);

  const active = sectionEntries.find((section) => section.id === activeSection) ?? sectionEntries[0]!;

  const handleBack = () => {
    if (isMobileViewport && mobileDetailOpen) {
      setMobileDetailOpen(false);
      return;
    }
    onClose();
  };

  const handleSectionClick = (section: SettingsSectionId) => {
    setActiveSection(section);
    if (isMobileViewport) {
      setMobileDetailOpen(true);
    }
  };

  const sectionContent = (
    <Suspense fallback={<SettingsSectionFallback label={t("app.loading")} />}>
      {activeSection === "appearance" ? (
        <AppearanceSettingsSection
          locale={locale}
          setLocale={setLocale}
          themeMode={themeMode}
          accentColor={accentColor}
          setThemeMode={setThemeMode}
          setAccentColor={setAccentColor}
        />
      ) : null}

      {activeSection === "notifications" ? (
        <NotificationsSettingsSectionContainer {...pushSettings} />
      ) : null}

      {activeSection === "security" ? (
        <SecuritySettingsSection
          callSecurityMode={callSecurityMode}
          autoDecryptMedia={autoDecryptMedia}
          setCallSecurityMode={setCallSecurityMode}
          setAutoDecryptMedia={setAutoDecryptMedia}
        />
      ) : null}
    </Suspense>
  );

  return (
    <section className={styles.root} aria-label={t("settings.title")}>
      <header className={`${styles.header} ${isMobileViewport ? "" : styles.headerDesktop}`}>
        {isMobileViewport ? (
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
            aria-label={mobileDetailOpen ? t("chat.back") : t("settings.closeAria")}
          >
            <BackIcon />
          </button>
        ) : null}
        <h1 className={styles.title}>{isMobileViewport && mobileDetailOpen ? active.title : t("settings.title")}</h1>
        {isMobileViewport ? <span aria-hidden="true" /> : (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("settings.closeAria")}
          >
            <CloseIcon />
          </button>
        )}
      </header>

      <div className={styles.layout} data-detail-open={isMobileViewport && mobileDetailOpen ? "true" : "false"}>
        <aside className={styles.menuPane}>
          <div className={styles.accountRow}>
            <span className={styles.accountAvatar} aria-hidden="true">{getInitials(username)}</span>
            <div className={styles.accountCopy}>
              <strong className={styles.accountName}>{username || t("settings.title")}</strong>
              <span className={styles.accountMeta}>{t("settings.appliedInstantly")}</span>
            </div>
          </div>

          <nav className={styles.sectionList} aria-label={t("settings.sections.ariaLabel")}>
            {sectionEntries.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`${styles.sectionButton} ${isActive ? styles.sectionButtonActive : ""}`}
                  onClick={() => handleSectionClick(section.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.sectionIcon} aria-hidden="true">{section.icon}</span>
                  <span className={styles.sectionCopy}>
                    <span className={styles.sectionTitle}>{section.title}</span>
                    <span className={styles.sectionDescription}>{section.description}</span>
                  </span>
                  <span className={styles.sectionChevron}><ChevronIcon /></span>
                </button>
              );
            })}
          </nav>

          <p className={styles.menuNote}>{t("settings.appliedInstantly")}</p>
        </aside>

        <main className={styles.detailPane} aria-label={active.title}>
          <div className={styles.detailHeader}>
            <div className={styles.detailHeading}>
              <h2 className={styles.detailTitle}>{active.title}</h2>
              <p className={styles.detailDescription}>{active.description}</p>
            </div>
            <div className={styles.detailSummary}>{active.summary}</div>
          </div>
          {sectionContent}
        </main>
      </div>
    </section>
  );
}
