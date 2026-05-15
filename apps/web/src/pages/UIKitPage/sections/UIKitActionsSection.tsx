import {
  IconButton,
  IconPill,
  PillButton,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import {
  ArchiveIcon,
  BellIcon,
  CheckIcon,
  HangupIcon,
  SearchIcon,
  ShieldIcon,
  VideoIcon,
} from "../helpers/uikitDemoIcons";
import styles from "../../UIKitPage.module.css";

export function UIKitActionsSection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Actions"
        title="Compact CTA language"
        meta={<StatusBadge tone="accent" dot size="sm">Toolbar ready</StatusBadge>}
      />

      <div className={styles.inlineCluster}>
        <PillButton tone="accent" appearance="strong">Start call</PillButton>
        <PillButton tone="neutral" appearance="soft">Pin thread</PillButton>
        <PillButton tone="danger" appearance="soft">Leave room</PillButton>
      </div>

      <div className={styles.inlineCluster}>
        <IconButton size={36} aria-label="Search">
          <SearchIcon />
        </IconButton>
        <IconButton size={36} aria-label="Success marker" tone="success">
          <CheckIcon />
        </IconButton>
        <IconButton size={36} aria-label="Danger action" tone="danger">
          <HangupIcon />
        </IconButton>
        <IconButton size={36} variant="ghost" aria-label="Archive">
          <ArchiveIcon />
        </IconButton>
      </div>

      <div className={styles.inlineCluster}>
        <IconPill icon={<VideoIcon />} size="sm">Video</IconPill>
        <IconPill icon={<ShieldIcon />} size="sm">Protected</IconPill>
        <IconPill icon={<BellIcon />} size="sm">Notify</IconPill>
      </div>

      <div className={styles.inlineCluster}>
        <PillButton tone="neutral" appearance="soft" disabled>Disabled action</PillButton>
        <IconButton size={36} aria-label="Active toolbar item" active>
          <SearchIcon />
        </IconButton>
        <IconButton size={36} aria-label="Disabled toolbar item" disabled>
          <ArchiveIcon />
        </IconButton>
      </div>
    </SurfacePanel>
  );
}
