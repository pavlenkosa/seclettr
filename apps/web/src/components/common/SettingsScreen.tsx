/**
 * SettingsScreen — settings shell and section orchestrator.
 *
 * Owns:
 *   - top-level settings navigation between appearance / notifications /
 *     security sections
 *   - mobile detail-frame behavior
 *   - lazy loading of section bodies
 *   - wiring shared settings state hooks into the active section
 *
 * Does not own:
 *   - individual section business logic
 *   - auth/session state
 *   - app-level routing
 *   - reusable field primitive contracts
 */
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n";
import { useNativeBackAction } from "@/lib/hooks";
import { useAppearanceSettings, useSecuritySettings } from "@/ui-settings";
import {
  BellIcon,
  PersonIcon,
  ShieldIcon,
  SparklesIcon,
  StorageIcon,
} from "./settings/SettingsSectionPrimitives";
import { SettingsAccountSummary } from "./settings/SettingsAccountSummary";
import { SettingsMobileDetailFrame } from "./settings/SettingsMobileDetailFrame";
import { SettingsScreenHeader } from "./settings/SettingsScreenHeader";
import { SettingsSectionFallback } from "./settings/SettingsSectionFallback";
import {
  SettingsSectionNav,
  type SettingsSectionEntry,
} from "./settings/SettingsSectionNav";
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

type SettingsSectionId = "profile" | "notifications" | "appearance" | "security" | "cache";

const loadProfileSettingsSection = () =>
  import("./settings/ProfileSettingsSection").then(({ ProfileSettingsSection: Section }) => ({
    default: Section,
  }));

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

const loadCacheSettingsSection = () =>
  import("./settings/CacheSettingsSection").then(({ CacheSettingsSection: Section }) => ({
    default: Section,
  }));

const ProfileSettingsSection = lazy(loadProfileSettingsSection);
const AppearanceSettingsSection = lazy(loadAppearanceSettingsSection);
const NotificationsSettingsSectionContainer = lazy(loadNotificationsSettingsSectionContainer);
const SecuritySettingsSection = lazy(loadSecuritySettingsSection);
const CacheSettingsSection = lazy(loadCacheSettingsSection);

export function SettingsScreen({
  username,
  isMobileViewport = false,
  onClose,
}: SettingsScreenProps) {
  const { t, locale, setLocale } = useI18n();
  const {
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
  } = useAppearanceSettings();
  const {
    callSecurityMode,
    autoDecryptMedia,
    setCallSecurityMode,
    setAutoDecryptMedia,
  } = useSecuritySettings();
  const pushSettings = usePushSettings();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("profile");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    void loadProfileSettingsSection();
    void loadAppearanceSettingsSection();
    void loadNotificationsSettingsSectionContainer();
    void loadSecuritySettingsSection();
    void loadCacheSettingsSection();
  }, []);

  const notificationsSummary = resolvePushStatusLabel(pushSettings.pushStatus, t);

  const sectionEntries = useMemo(() => [
    {
      id: "profile",
      title: t("settings.sections.profile"),
      description: t("settings.sections.profile.description"),
      summary: username ?? "",
      icon: <PersonIcon />,
    },
    {
      id: "appearance",
      title: t("settings.sections.appearance"),
      description: t("settings.sections.appearance.description"),
      summary: themeMode === "custom"
        ? [t("settings.theme.custom"), customThemeBg].join(" · ")
        : [t(`settings.theme.${themeMode}`), t(`settings.colors.${accentColor}`)].join(" · "),
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
    {
      id: "cache",
      title: t("settings.sections.cache"),
      description: t("settings.sections.cache.description"),
      summary: "",
      icon: <StorageIcon />,
    },
  ] satisfies SettingsSectionEntry[], [
    accentColor,
    autoDecryptMedia,
    callSecurityMode,
    customThemeBg,
    notificationsSummary,
    t,
    themeMode,
    username,
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

  useNativeBackAction(handleBack);

  // Move focus into the settings panel on mount so keyboard users don't have
  // to Tab through the entire main layout. Restore focus on unmount.
  useLayoutEffect(() => {
    prevFocusRef.current = document.activeElement;
    rootRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => {
      if (prevFocusRef.current instanceof HTMLElement) {
        prevFocusRef.current.focus();
      }
    };
  }, []);

  const sectionContent = (
    <Suspense fallback={<SettingsSectionFallback label={t("app.loading")} />}>
      {activeSection === "profile" ? (
        <ProfileSettingsSection />
      ) : null}

      {activeSection === "appearance" ? (
        <AppearanceSettingsSection
          locale={locale}
          setLocale={setLocale}
          themeMode={themeMode}
          accentColor={accentColor}
          fontSize={fontSize}
          customThemeBg={customThemeBg}
          customThemeAccent={customThemeAccent}
          setThemeMode={setThemeMode}
          setAccentColor={setAccentColor}
          setFontSize={setFontSize}
          setCustomThemeBg={setCustomThemeBg}
          setCustomThemeAccent={setCustomThemeAccent}
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

      {activeSection === "cache" ? (
        <CacheSettingsSection />
      ) : null}
    </Suspense>
  );

  return (
    <section ref={rootRef} className={styles.root} aria-label={t("settings.title")}>
      <SettingsScreenHeader
        title={isMobileViewport && mobileDetailOpen ? active.title : t("settings.title")}
        isMobileViewport={isMobileViewport}
        mobileDetailOpen={mobileDetailOpen}
        onBack={handleBack}
        onClose={onClose}
        backLabel={t("chat.back")}
        closeLabel={t("settings.closeAria")}
      />

      <div className={styles.layout} data-detail-open={isMobileViewport && mobileDetailOpen ? "true" : "false"}>
        <aside className={styles.menuPane}>
          <SettingsAccountSummary username={username} onClick={() => handleSectionClick("profile")} />
          <SettingsSectionNav
            sections={sectionEntries}
            activeSection={activeSection}
            onSelect={handleSectionClick}
            ariaLabel={t("settings.sections.ariaLabel")}
            note={t("settings.appliedInstantly")}
            showActive={!isMobileViewport || mobileDetailOpen}
          />
        </aside>

        <SettingsMobileDetailFrame
          title={active.title}
          description={active.description}
        >
          {sectionContent}
        </SettingsMobileDetailFrame>
      </div>
    </section>
  );
}
