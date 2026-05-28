import type { CSSProperties } from "react";
import {
  InlineNotice,
  LabelPill,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader, ThemeSnapshotCard } from "../helpers/uikitDemoBlocks";
import type {
  ResolvedAccentSnapshot,
  ResolvedThemeSnapshot,
} from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

interface UIKitTokensSectionProps {
  readonly resolvedThemes: readonly ResolvedThemeSnapshot[];
  readonly resolvedAccents: readonly ResolvedAccentSnapshot[];
}

const spacingScale = [
  { token: "--space-1", rem: "0.25rem", px: "4px", use: "icon gaps, micro spacing" },
  { token: "--space-2", rem: "0.5rem", px: "8px", use: "inline gaps, badge padding" },
  { token: "--space-3", rem: "0.75rem", px: "12px", use: "element padding, list gap" },
  { token: "--space-4", rem: "1rem", px: "16px", use: "section padding, card inset" },
  { token: "--space-5", rem: "1.25rem", px: "20px", use: "large inset" },
  { token: "--space-6", rem: "1.5rem", px: "24px", use: "section gap" },
  { token: "--space-8", rem: "2rem", px: "32px", use: "panel padding" },
  { token: "--space-10", rem: "2.5rem", px: "40px", use: "touch target base" },
  { token: "--space-12", rem: "3rem", px: "48px", use: "mobile row min height" },
];

export function UIKitTokensSection({
  resolvedThemes,
  resolvedAccents,
}: Readonly<UIKitTokensSectionProps>) {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Tokens"
        title="Theme and accent contract"
        meta={<LabelPill size="sm">From global.css</LabelPill>}
      />

      <div className={styles.themeGrid}>
        {resolvedThemes.map((theme) => (
          <ThemeSnapshotCard
            key={theme.id}
            label={theme.label}
            bgVar={theme.bgVar}
            surfaceVar={theme.surfaceVar}
            textVar={theme.textVar}
            accentVar={theme.accentVar}
            bgValue={theme.resolvedBg}
            surfaceValue={theme.resolvedSurface}
            textValue={theme.resolvedText}
            accentValue={theme.resolvedAccent}
          />
        ))}
      </div>

      <div className={styles.accentRow}>
        {resolvedAccents.map((accent) => (
          <span
            key={accent.id}
            className={styles.accentChip}
            style={{ "--accent-chip": accent.resolvedValue } as CSSProperties}
          >
            <span className={styles.accentDot} aria-hidden="true" />
            <span>{accent.label}</span>
            <code>{`var(${accent.token})`}</code>
          </span>
        ))}
      </div>

      <div className={styles.tokenScaleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>Spacing Scale</span>
            <h2 className={styles.sectionTitle}>--space-1 through --space-12</h2>
          </div>
          <LabelPill size="sm">Added F-01</LabelPill>
        </div>

        <div className={styles.spacingScale}>
          {spacingScale.map((item) => (
            <div key={item.token} className={styles.spacingRow}>
              <div
                className={styles.spacingSwatch}
                style={{
                  height: `var(${item.token})`,
                } as CSSProperties}
              />
              <div className={styles.spacingLabel}>
                <span className={styles.tokenName}>var({item.token})</span>
                <span className={styles.tokenValue}>{item.rem} ({item.px}) — {item.use}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <InlineNotice tone="info" size="sm">
        Existing token families cover surfaces, text, borders, radius, motion, accents,
        spacing, and feature states. New UI work should consume them instead of adding local systems.
      </InlineNotice>
    </SurfacePanel>
  );
}
