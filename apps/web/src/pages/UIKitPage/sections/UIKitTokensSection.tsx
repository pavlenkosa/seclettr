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

      <InlineNotice tone="info" size="sm">
        Existing token families cover surfaces, text, borders, radius, motion, accents,
        and feature states. New UI work should consume them instead of adding local color systems.
      </InlineNotice>
    </SurfacePanel>
  );
}
