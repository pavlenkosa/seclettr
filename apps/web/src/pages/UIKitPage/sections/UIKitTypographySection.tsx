import { LabelPill, SurfacePanel } from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import styles from "../../UIKitPage.module.css";

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
    </SurfacePanel>
  );
}
