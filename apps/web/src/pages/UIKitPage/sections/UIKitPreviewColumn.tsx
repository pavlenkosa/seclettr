import {
  Avatar,
  AvatarSummaryButton,
  BottomDockSurface,
  CallIdentityBlock,
  EntityRow,
  FloatingDock,
  HeaderBar,
  IconButton,
  InlineNotice,
  InputField,
  LabelPill,
  PillButton,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { MetricCard, SectionHeader } from "../helpers/uikitDemoBlocks";
import {
  BellIcon,
  ChatIcon,
  HangupIcon,
  MicIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "../helpers/uikitDemoIcons";
import { noopPointerHandler } from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

export function UIKitPreviewColumn() {
  return (
    <aside className={styles.previewColumn}>
      <SurfacePanel
        as="section"
        tone="accent"
        padding="lg"
        radius="xl"
        className={styles.heroPanel}
      >
        <div className={styles.heroHeader}>
          <LabelPill size="sm">Seclettr UI kit</LabelPill>
          <StatusBadge tone="accent" dot size="sm">
            Existing flat product language
          </StatusBadge>
        </div>

        <h1 className={styles.heroTitle}>Living showcase for shared Seclettr primitives</h1>
        <p className={styles.heroCopy}>
          This page demonstrates the current token contract, shared UI layer,
          and product-state composition without introducing a separate visual system.
        </p>

        <div className={styles.heroMetrics}>
          <MetricCard value="5" label="primitive groups" />
          <MetricCard value="8" label="migration slices" />
          <MetricCard value="0" label="runtime changes" />
        </div>
      </SurfacePanel>

      <SurfacePanel
        as="section"
        tone="strong"
        padding="lg"
        radius="xl"
        className={styles.previewPanel}
      >
        <SectionHeader
          eyebrow="Mobile reference"
          title="Compact shell preview"
          meta={<StatusBadge tone="success" dot size="sm">Current pattern</StatusBadge>}
        />

        <SurfacePanel
          tone="strong"
          padding="md"
          radius="xl"
          className={styles.mobileHeaderPanel}
        >
          <HeaderBar
            leading={(
              <CallIdentityBlock
                leading={<Avatar label="Seclettr" size={40} fontSize={13} ariaHidden />}
                eyebrow="Workspace"
                title="Unified shell"
                meta="Mobile-first rhythm"
              />
            )}
            trailing={(
              <div className={styles.inlineCluster}>
                <IconButton size={36} aria-label="Search showcase">
                  <SearchIcon />
                </IconButton>
                <IconButton size={36} aria-label="Alerts showcase">
                  <BellIcon />
                </IconButton>
              </div>
            )}
          />
        </SurfacePanel>

        <InputField
          aria-label="Search threads"
          placeholder="Search chats, groups, and calls"
          leading={<SearchIcon />}
          size="pill"
          wrapperClassName={styles.mobileSearch}
        />

        <div className={styles.previewList}>
          <EntityRow
            as="div"
            leading={<Avatar label="Lena Petrova" size={40} fontSize={13} ariaHidden />}
            title="Lena Petrova"
            subtitle="Voice note received"
            meta={<LabelPill size="xs">Encrypted</LabelPill>}
            trailing={<span className={styles.rowTime}>2m</span>}
            className={styles.previewRow}
          />
          <EntityRow
            as="div"
            leading={<Avatar label="Design Circle" size={40} fontSize={13} ariaHidden />}
            title="Design Circle"
            subtitle="Dock pattern approved"
            meta={<StatusBadge tone="accent" dot size="sm">Group</StatusBadge>}
            trailing={<span className={styles.rowTime}>12m</span>}
            className={styles.previewRow}
          />
          <EntityRow
            as="div"
            leading={<Avatar label="Ops Relay" size={40} fontSize={13} ariaHidden />}
            title="Ops Relay"
            subtitle="Call route bridge next"
            meta={<StatusBadge tone="warning" dot size="sm">Action</StatusBadge>}
            trailing={<span className={styles.rowTime}>1h</span>}
            className={styles.previewRow}
          />
        </div>

        <InlineNotice tone="info" size="md">
          Shared surfaces, compact rows, and dock treatment should stay aligned between
          web and mobile layouts.
        </InlineNotice>

        <FloatingDock
          dialogAriaLabel="UIKit minimized call preview"
          dragAriaLabel="Drag minimized call preview"
          summary={(
            <AvatarSummaryButton
              avatarLabel="Quartz sync"
              primaryText="Quartz sync"
              secondaryText="Voice call · protected"
              className={styles.previewDockSummary}
            />
          )}
          actions={(
            <>
              <IconButton size={36} aria-label="Mute preview">
                <MicIcon />
              </IconButton>
              <IconButton tone="danger" size={36} aria-label="Leave preview">
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
          className={styles.previewDock}
        />

        <BottomDockSurface placement="inline" className={styles.previewTabBar}>
          <PillButton
            leading={<ChatIcon />}
            tone="neutral"
            appearance="strong"
            className={styles.previewTabAction}
            fullWidth
          >
            Chats
          </PillButton>
          <PillButton
            leading={<PlusIcon />}
            tone="accent"
            appearance="strong"
            className={styles.previewTabAction}
            fullWidth
          >
            Create
          </PillButton>
          <PillButton
            leading={<SettingsIcon />}
            tone="neutral"
            appearance="soft"
            className={styles.previewTabAction}
            fullWidth
          >
            Settings
          </PillButton>
        </BottomDockSurface>
      </SurfacePanel>
    </aside>
  );
}
