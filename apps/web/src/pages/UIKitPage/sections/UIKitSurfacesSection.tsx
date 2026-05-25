import type { CSSProperties } from "react";
import {
  Avatar,
  CallIdentityBlock,
  EntityRow,
  FieldSection,
  HeaderBar,
  IconButton,
  InputField,
  InlineNotice,
  LabelPill,
  ModalShell,
  PillButton,
  SecurityModeBadge,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { CallPanelShell } from "@/calls/shared/presentation/CallPanelShell";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import { MoreIcon, SearchIcon } from "../helpers/uikitDemoIcons";
import styles from "../../UIKitPage.module.css";

export function UIKitSurfacesSection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader eyebrow="Surfaces" title="Panels, header bars, rows, modal shell, and call shell" />

      <div className={styles.surfaceStack}>
        <SurfacePanel tone="strong" padding="md" radius="xl">
          <HeaderBar
            leading={(
              <CallIdentityBlock
                leading={<Avatar label="Release room" size={40} fontSize={13} ariaHidden />}
                eyebrow="HeaderBar"
                title="Release room"
                meta="Call summary shell"
              />
            )}
            trailing={(
              <div className={styles.inlineCluster}>
                <IconButton size={36} aria-label="Search header">
                  <SearchIcon />
                </IconButton>
                <IconButton size={36} aria-label="More header">
                  <MoreIcon />
                </IconButton>
              </div>
            )}
          />
        </SurfacePanel>

        <EntityRow
          as="div"
          leading={<Avatar label="Entity row" size={42} fontSize={13} ariaHidden />}
          title="EntityRow"
          subtitle="Shared row structure for lists, sheets, and summaries"
          meta={<LabelPill size="xs">Surface</LabelPill>}
          trailing={<StatusBadge tone="accent" dot size="sm">Live</StatusBadge>}
        />

        <div className={styles.modalPreviewViewport}>
          <ModalShell
            isClosing={false}
            onClose={() => {}}
            ariaLabel="UIKit modal shell preview"
            closeAriaLabel="Close UIKit modal preview"
            title="ModalShell preview"
            overlayClassName={styles.modalPreviewOverlay}
            surfaceClassName={styles.modalPreviewSurface}
            bodyClassName={styles.modalPreviewBody}
            footerClassName={styles.modalPreviewFooter}
            style={{
              "--modal-width": "100%",
              "--modal-max-height": "100%",
              "--modal-overlay-padding": "0.7rem",
              "--modal-z-index": "var(--z-0)",
            } as CSSProperties}
            footer={(
              <div className={styles.modalFooterActions}>
                <PillButton tone="neutral" appearance="soft" size="sm">Cancel</PillButton>
                <PillButton tone="accent" appearance="strong" size="sm">Save changes</PillButton>
              </div>
            )}
          >
            <div className={styles.modalPreviewStack}>
              <FieldSection
                label="Modal content"
                description="Shared shell for dialogs and mobile sheets."
              >
                <InputField
                  aria-label="Modal input showcase"
                  placeholder="Group name"
                />
              </FieldSection>
              <InlineNotice tone="warning" size="sm">
                Use the shell for framing only. Feature logic stays local.
              </InlineNotice>
            </div>
          </ModalShell>
        </div>

        <div className={styles.modalPreviewViewport}>
          <CallPanelShell
            ariaLabel="UIKit call panel shell preview"
            backdropClassName={styles.modalPreviewOverlay}
            panelClassName={styles.modalPreviewSurface}
          >
            <div className={styles.modalPreviewBody}>
              <CallIdentityBlock
                leading={<Avatar label="Release room" size={42} fontSize={13} ariaHidden />}
                eyebrow="CallPanelShell preview"
                title="Release room"
                meta="Fullscreen call shell for media-first surfaces"
                metaAccessory={<SecurityModeBadge tone="frame">Frame encrypted</SecurityModeBadge>}
              />
              <InlineNotice tone="info" size="sm">
                Use the call shell for fullscreen call containers. Standard dialogs and sheets stay on ModalShell.
              </InlineNotice>
              <div className={styles.modalFooterActions}>
                <PillButton tone="neutral" appearance="soft" size="sm">Minimize</PillButton>
                <PillButton tone="danger" appearance="soft" size="sm">Leave call</PillButton>
              </div>
            </div>
          </CallPanelShell>
        </div>
      </div>
    </SurfacePanel>
  );
}
