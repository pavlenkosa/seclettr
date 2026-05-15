import {
  Avatar,
  AvatarSummaryButton,
  CallIdentityBlock,
  InfoStack,
  LabelPill,
  SecurityModeBadge,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import styles from "../../UIKitPage.module.css";

export function UIKitIdentitySection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Identity"
        title="Avatar, info stack, and call identity composition"
        meta={<StatusBadge tone="accent" dot size="sm">Reusable identity</StatusBadge>}
      />

      <div className={styles.identityStack}>
        <div className={styles.inlineCluster}>
          <Avatar label="Elena Smirnova" size={44} fontSize={14} />
          <Avatar label="Design Circle" size={52} fontSize={16} />
          <Avatar label="QA Relay" size={60} fontSize={18} />
        </div>

        <AvatarSummaryButton
          avatarLabel="Elena Smirnova"
          primaryText="Elena Smirnova"
          secondaryText="Security review lead"
        />

        <InfoStack
          eyebrow="InfoStack"
          title="Compact title and meta hierarchy"
          meta="Used inside call surfaces, summaries, and notices"
          titleAccessory={<LabelPill size="xs">Shared</LabelPill>}
        />

        <CallIdentityBlock
          leading={<Avatar label="Ops Circle" size={46} fontSize={14} ariaHidden />}
          eyebrow="CallIdentityBlock"
          title="Ops Circle"
          meta="7 participants · voice call"
          metaAccessory={<SecurityModeBadge tone="frame">Frame encrypted</SecurityModeBadge>}
        />
      </div>
    </SurfacePanel>
  );
}
