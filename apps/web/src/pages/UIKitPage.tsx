import { useEffect, useState } from "react";
import styles from "./UIKitPage.module.css";
import {
  accentSnapshots,
  readCssVariable,
  themeSnapshots,
  type DensityMode,
  type ResolvedAccentSnapshot,
  type ResolvedThemeSnapshot,
  type ThreadFilter,
} from "./UIKitPage/helpers/uikitDemoData";
import { UIKitActionsSection } from "./UIKitPage/sections/UIKitActionsSection";
import { UIKitAccessibilitySection } from "./UIKitPage/sections/UIKitAccessibilitySection";
import { UIKitCallExamplesSection } from "./UIKitPage/sections/UIKitCallExamplesSection";
import { UIKitChatExamplesSection } from "./UIKitPage/sections/UIKitChatExamplesSection";
import { UIKitControlPanelSection } from "./UIKitPage/sections/UIKitControlPanelSection";
import { UIKitFeedbackSection } from "./UIKitPage/sections/UIKitFeedbackSection";
import { UIKitFormsSection } from "./UIKitPage/sections/UIKitFormsSection";
import { UIKitIdentitySection } from "./UIKitPage/sections/UIKitIdentitySection";
import { UIKitMobileDenseSection } from "./UIKitPage/sections/UIKitMobileDenseSection";
import { UIKitMotionSection } from "./UIKitPage/sections/UIKitMotionSection";
import { UIKitPreviewColumn } from "./UIKitPage/sections/UIKitPreviewColumn";
import { UIKitSurfacesSection } from "./UIKitPage/sections/UIKitSurfacesSection";
import { UIKitTokensSection } from "./UIKitPage/sections/UIKitTokensSection";
import { UIKitTypographySection } from "./UIKitPage/sections/UIKitTypographySection";

export function UIKitPage() {
  const [densityMode, setDensityMode] = useState<DensityMode>("compact");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [securityMode, setSecurityMode] = useState("balanced");
  const [resolvedThemes, setResolvedThemes] = useState<ResolvedThemeSnapshot[]>(() =>
    themeSnapshots.map((theme) => ({
      ...theme,
      resolvedBg: "",
      resolvedSurface: "",
      resolvedText: "",
      resolvedAccent: "",
    }))
  );
  const [resolvedAccents, setResolvedAccents] = useState<ResolvedAccentSnapshot[]>(() =>
    accentSnapshots.map((accent) => ({
      ...accent,
      resolvedValue: "",
    }))
  );

  const isCompact = densityMode === "compact";

  useEffect(() => {
    const root = document.documentElement;

    const sampleSnapshots = () => {
      const previousTheme = root.dataset.theme;
      const previousAccent = root.dataset.accent;

      try {
        const nextThemes = themeSnapshots.map((theme) => {
          root.dataset.theme = theme.theme;
          if (previousAccent) {
            root.dataset.accent = previousAccent;
          } else {
            delete root.dataset.accent;
          }
          const computedStyle = getComputedStyle(root);
          return {
            ...theme,
            resolvedBg: readCssVariable(computedStyle, theme.bgVar),
            resolvedSurface: readCssVariable(computedStyle, theme.surfaceVar),
            resolvedText: readCssVariable(computedStyle, theme.textVar),
            resolvedAccent: readCssVariable(computedStyle, theme.accentVar),
          };
        });

        const nextAccents = accentSnapshots.map((accent) => {
          if (previousTheme) {
            root.dataset.theme = previousTheme;
          } else {
            delete root.dataset.theme;
          }
          root.dataset.accent = accent.accent;
          const computedStyle = getComputedStyle(root);
          return {
            ...accent,
            resolvedValue: readCssVariable(computedStyle, accent.token),
          };
        });

        setResolvedThemes(nextThemes);
        setResolvedAccents(nextAccents);
      } finally {
        if (previousTheme) {
          root.dataset.theme = previousTheme;
        } else {
          delete root.dataset.theme;
        }
        if (previousAccent) {
          root.dataset.accent = previousAccent;
        } else {
          delete root.dataset.accent;
        }
      }
    };

    sampleSnapshots();
    const intervalId = window.setInterval(sampleSnapshots, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div
      className={[
        styles.root,
        isCompact ? styles.rootCompact : styles.rootAiry,
      ].filter(Boolean).join(" ")}
    >
      <UIKitPreviewColumn />

      <main className={styles.catalogColumn}>
        <UIKitControlPanelSection
          densityMode={densityMode}
          threadFilter={threadFilter}
          securityMode={securityMode}
          setDensityMode={setDensityMode}
          setThreadFilter={setThreadFilter}
          setSecurityMode={setSecurityMode}
        />

        <div className={styles.sectionGrid}>
          <UIKitTokensSection
            resolvedThemes={resolvedThemes}
            resolvedAccents={resolvedAccents}
          />
          <UIKitTypographySection />
          <UIKitActionsSection />
          <UIKitAccessibilitySection />
          <UIKitFormsSection
            securityMode={securityMode}
            setSecurityMode={setSecurityMode}
          />
          <UIKitFeedbackSection />
          <UIKitMotionSection />
          <UIKitIdentitySection />
          <UIKitSurfacesSection />
          <UIKitChatExamplesSection />
          <UIKitCallExamplesSection />
          <UIKitMobileDenseSection isCompact={isCompact} />
        </div>
      </main>
    </div>
  );
}
