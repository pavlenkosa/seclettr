import {
  InlineNotice,
  LabelPill,
  SecurityModeBadge,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { DeliveryStatusItem, SectionHeader } from "../helpers/uikitDemoBlocks";
import styles from "../../UIKitPage.module.css";

export function UIKitFeedbackSection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Feedback"
        title="Notices, badges, security states, and delivery"
        meta={<LabelPill size="sm">Flat state language</LabelPill>}
      />

      <div className={styles.inlineCluster}>
        <StatusBadge tone="success" dot size="sm">Protected</StatusBadge>
        <StatusBadge tone="warning" dot size="sm">Waiting for peer</StatusBadge>
        <StatusBadge tone="danger" dot size="sm">Reconnect required</StatusBadge>
        <StatusBadge tone="neutral" dot size="sm">Queued</StatusBadge>
      </div>

      <div className={styles.inlineCluster}>
        <SecurityModeBadge tone="frame">Frame encrypted</SecurityModeBadge>
        <SecurityModeBadge tone="transport">Transport only</SecurityModeBadge>
      </div>

      <div className={styles.deliveryRow}>
        <DeliveryStatusItem label="Sending" status="sending" />
        <DeliveryStatusItem label="Sent" status="sent" />
        <DeliveryStatusItem label="Delivered" status="delivered" />
        <DeliveryStatusItem label="Read" status="read" />
      </div>

      <InlineNotice tone="info" size="md">
        Notices should stay terse, product-focused, and free of decorative UI treatment.
      </InlineNotice>
      <InlineNotice tone="warning" size="md">
        Security, delivery, and connection states should reuse the same compact feedback grammar.
      </InlineNotice>
      <InlineNotice tone="error" size="md">
        Error states stay on the same shared notice system instead of spawning feature-local alert styles.
      </InlineNotice>
    </SurfacePanel>
  );
}
