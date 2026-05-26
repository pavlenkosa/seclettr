import type { CSSProperties } from "react";
import { LabelPill, SurfacePanel } from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import styles from "../../UIKitPage.module.css";

const textScale = [
  { token: "--text-xs", rem: "0.6875rem", px: "11px", use: "tab labels, caption badges" },
  { token: "--text-sm", rem: "0.8125rem", px: "13px", use: "metadata, subtitles" },
  { token: "--text-base", rem: "0.9375rem", px: "15px", use: "body text, composer textarea" },
  { token: "--text-md", rem: "1rem", px: "16px", use: "form labels, section headings" },
  { token: "--text-lg", rem: "1.0625rem", px: "17px", use: "sidebar title, modal headers" },
];

const weightTokens = [
  { token: "--weight-regular", value: 400, label: "Regular", sample: "The quick brown fox" },
  { token: "--weight-medium", value: 500, label: "Medium", sample: "The quick brown fox" },
  { token: "--weight-semibold", value: 600, label: "Semibold", sample: "The quick brown fox" },
  { token: "--weight-bold", value: 700, label: "Bold", sample: "The quick brown fox" },
];

const leadingTokens = [
  { token: "--leading-tight", value: 1.2, use: "Headings, short UI strings" },
  { token: "--leading-base", value: 1.5, use: "Default body text, readability" },
  { token: "--leading-relaxed", value: 1.6, use: "Longer form content, settings help" },
];

export function UIKitTypographySection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Typography"
        title="Readable hierarchy for dense product surfaces"
        meta={<LabelPill size="sm">Sans + mono only</LabelPill>}
      />

      <div className={styles.typographyStack}>
        <div>
          <p className={styles.typeEyebrow}>Eyebrow / section label</p>
          <h2 className={styles.typeHeading}>Primary section heading</h2>
          <p className={styles.typeBody}>
            Body copy should stay calm and direct so notices, settings help text, and shell guidance
            remain readable inside compact layouts.
          </p>
        </div>
        <div className={styles.typeRow}>
          <span className={styles.typeCaption}>Caption / muted</span>
          <code className={styles.typeCode}>var(--font-mono)</code>
        </div>
      </div>

      <div className={styles.tokenScaleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>Text Scale</span>
            <h2 className={styles.sectionTitle}>--text-xs through --text-lg</h2>
          </div>
          <LabelPill size="sm">Added F-02</LabelPill>
        </div>

        <div className={styles.typographyScale}>
          {textScale.map((item) => (
            <div key={item.token} className={styles.typeScaleRow}>
              <span
                className={styles.typeScaleSample}
                style={{
                  fontSize: `var(${item.token})`,
                } as CSSProperties}
              >
                {item.use}
              </span>
              <span className={styles.typeScaleLabel}>
                <strong>var({item.token})</strong><br />
                {item.rem} ({item.px})
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tokenScaleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>Font Weight</span>
            <h2 className={styles.sectionTitle}>--weight-* tokens</h2>
          </div>
          <LabelPill size="sm">Added F-02</LabelPill>
        </div>

        <div className={styles.weightGrid}>
          {weightTokens.map((item) => (
            <div
              key={item.token}
              className={styles.weightSample}
              style={{ fontWeight: `var(${item.token})` } as CSSProperties}
            >
              {item.label}: {item.sample}
              <span>var({item.token}) = {item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tokenScaleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>Line Height</span>
            <h2 className={styles.sectionTitle}>--leading-* tokens</h2>
          </div>
          <LabelPill size="sm">Added F-02</LabelPill>
        </div>

        <div className={styles.typographyScale}>
          {leadingTokens.map((item) => (
            <div key={item.token} className={styles.typeScaleRow}>
              <div
                className={styles.typeScaleSample}
                style={{ lineHeight: `var(${item.token})` } as CSSProperties}
              >
                The quick brown fox jumps over the lazy dog. This is sample text demonstrating line height.
              </div>
              <span className={styles.typeScaleLabel}>
                <strong>var({item.token})</strong><br />
                {item.use}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SurfacePanel>
  );
}
