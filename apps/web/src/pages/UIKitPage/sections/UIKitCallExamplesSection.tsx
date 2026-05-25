import {
  Avatar,
  AvatarSummaryButton,
  CallIdentityBlock,
  FloatingDock,
  IconButton,
  IconPill,
  SecurityModeBadge,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import { HangupIcon, MicIcon, VideoIcon } from "../helpers/uikitDemoIcons";
import { noopPointerHandler } from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

export function UIKitCallExamplesSection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Call examples"
        title="Participant tile, controls, and minimized dock"
        meta={<StatusBadge tone="success" dot size="sm">Call UI slice</StatusBadge>}
      />

      <div className={styles.callExampleGrid}>
        <div className={styles.callTile}>
          <div className={styles.callTileTop}>
            <CallIdentityBlock
              leading={<Avatar label="Elena Smirnova" size={42} fontSize={13} ariaHidden />}
              eyebrow="Participant tile"
              title="Elena Smirnova"
              meta="Speaking · camera on"
              metaAccessory={<SecurityModeBadge tone="frame">Frame encrypted</SecurityModeBadge>}
            />
            <IconPill icon={<VideoIcon />} size="sm">Video</IconPill>
          </div>

          <div className={styles.callTileStage}>
            <Avatar label="Elena Smirnova" size={72} fontSize={24} ariaHidden />
          </div>

          <div className={styles.inlineCluster}>
            <IconButton size={40} aria-label="Mute participant">
              <MicIcon />
            </IconButton>
            <IconButton size={40} aria-label="Camera enabled">
              <VideoIcon />
            </IconButton>
            <IconButton size={40} tone="danger" aria-label="End participant preview">
              <HangupIcon />
            </IconButton>
          </div>
        </div>

        <FloatingDock
          dialogAriaLabel="UIKit dock example"
          dragAriaLabel="Drag UIKit dock"
          summary={(
            <AvatarSummaryButton
              avatarLabel="Release room"
              primaryText="Release room"
              secondaryText="Group call · 3 participants"
            />
          )}
          actions={(
            <>
              <IconButton size={36} aria-label="Mute dock">
                <MicIcon />
              </IconButton>
              <IconButton size={36} aria-label="Camera dock">
                <VideoIcon />
              </IconButton>
              <IconButton size={36} tone="danger" aria-label="Leave dock">
                <HangupIcon />
              </IconButton>
            </>
          )}
          onDragStart={noopPointerHandler}
          onDragMove={noopPointerHandler}
          onDragEnd={noopPointerHandler}
          style={{
            position: "static",
            left: "auto",
            right: "auto",
            bottom: "auto",
            transform: "none",
            width: "100%",
          }}
          className={styles.callDockPreview}
        />
      </div>
    </SurfacePanel>
  );
}
