import { useState, type PointerEventHandler } from "react";
import {
  Avatar,
  AvatarSummaryButton,
  BottomDockSurface,
  EntityRow,
  FloatingDock,
  HeaderBar,
  IconButton,
  InlineNotice,
  InputField,
  LabelPill,
  PillButton,
  SegmentedControl,
  SelectField,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import styles from "./UIKitPage.module.css";

type DensityMode = "compact" | "airy";

const densityOptions = [
  { value: "compact", label: "Compact" },
  { value: "airy", label: "Airy" },
] satisfies Array<{ value: DensityMode; label: string }>;

const conversationSamples = [
  {
    id: "lena",
    name: "Lena Petrova",
    subtitle: "Voice note received",
    meta: "2m ago",
    tone: "success" as const,
    unread: "Encrypted",
  },
  {
    id: "design",
    name: "Design Circle",
    subtitle: "Dock pattern approved",
    meta: "12m ago",
    tone: "accent" as const,
    unread: "Group",
  },
  {
    id: "ops",
    name: "Ops Relay",
    subtitle: "Call route bridge next",
    meta: "1h ago",
    tone: "warning" as const,
    unread: "Action",
  },
];

const noopPointerHandler: PointerEventHandler<HTMLButtonElement> = () => {};

export function UIKitPage() {
  const [densityMode, setDensityMode] = useState<DensityMode>("compact");

  return (
    <div
      className={[
        styles.root,
        densityMode === "airy" ? styles.rootAiry : styles.rootCompact,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside className={styles.previewColumn}>
        <SurfacePanel
          as="section"
          tone="accent"
          padding="lg"
          radius="xl"
          className={styles.heroPanel}
        >
          <div className={styles.heroHeader}>
            <LabelPill size="sm">Web UI kit</LabelPill>
            <StatusBadge tone="accent" dot>
              Mobile-first foundation
            </StatusBadge>
          </div>

          <h1 className={styles.heroTitle}>Mobile exterior, reusable web primitives</h1>
          <p className={styles.heroCopy}>
            Reference surface for buttons, rows, badges, docks, and flat panels
            built from the same compact language as the mobile shell.
          </p>

          <div className={styles.heroMetrics}>
            <div>
              <span className={styles.metricValue}>5</span>
              <span className={styles.metricLabel}>UI domains</span>
            </div>
            <div>
              <span className={styles.metricValue}>1</span>
              <span className={styles.metricLabel}>shared visual grammar</span>
            </div>
            <div>
              <span className={styles.metricValue}>/ui-kit</span>
              <span className={styles.metricLabel}>reference route</span>
            </div>
          </div>
        </SurfacePanel>

        <div className={styles.deviceFrame}>
          <div className={styles.deviceBezel}>
            <div className={styles.deviceScreen}>
              <div className={styles.statusStrip}>
                <span>9:41</span>
                <span>Seclettr Mobile Reference</span>
                <span>5G</span>
              </div>

              <SurfacePanel
                tone="strong"
                padding="md"
                radius="xl"
                className={styles.previewHeaderPanel}
              >
                <HeaderBar
                  leading={(
                    <div className={styles.headerIdentity}>
                      <Avatar label="Seclettr" size={42} fontSize={14} />
                      <div className={styles.headerCopy}>
                        <span className={styles.headerEyebrow}>Workspace preview</span>
                        <strong>Mobile shell</strong>
                      </div>
                    </div>
                  )}
                  trailing={(
                    <div className={styles.headerActions}>
                      <IconButton
                        size={36}
                        aria-label="Search showcase"
                      >
                        <SearchIcon />
                      </IconButton>
                      <IconButton
                        size={36}
                        aria-label="Toggle notifications"
                      >
                        <BellIcon />
                      </IconButton>
                    </div>
                  )}
                />
              </SurfacePanel>

              <SurfacePanel
                tone="strong"
                padding="sm"
                radius="xl"
                className={styles.previewSearchPanel}
              >
                <InputField
                  aria-label="Search threads"
                  placeholder="Search chats, groups, and calls"
                  leading={<SearchIcon />}
                  size="pill"
                />
              </SurfacePanel>

              <div className={styles.previewList}>
                {conversationSamples.map((item) => (
                  <EntityRow
                    key={item.id}
                    as="div"
                    leading={<Avatar label={item.name} size={42} fontSize={14} />}
                    title={item.name}
                    subtitle={item.subtitle}
                    meta={(
                      <div className={styles.rowMeta}>
                        <StatusBadge tone={item.tone} size="sm" dot>
                          {item.unread}
                        </StatusBadge>
                      </div>
                    )}
                    trailing={<span className={styles.rowTime}>{item.meta}</span>}
                    className={styles.previewRow}
                  />
                ))}
              </div>

              <InlineNotice tone="info" size="md" className={styles.previewNotice}>
                Dock, row density, and flat surfaces stay aligned with the mobile
                shell even when composed as web primitives.
              </InlineNotice>

              <FloatingDock
                dialogAriaLabel="Example minimized call dock"
                dragAriaLabel="Drag dock"
                summary={(
                  <AvatarSummaryButton
                    avatarLabel="Quartz call"
                    primaryText="Quartz sync"
                    secondaryText="Voice call - protected"
                    className={styles.previewDockSummary}
                  />
                )}
                actions={(
                  <>
                    <IconButton
                      size={36}
                      aria-label="Mute call"
                    >
                      <MicIcon />
                    </IconButton>
                    <IconButton
                      tone="danger"
                      size={36}
                      aria-label="Leave call"
                    >
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
                  bottom: "auto",
                  transform: "none",
                  width: "100%",
                  marginTop: "auto",
                }}
                className={styles.previewDock}
              />

              <div className={styles.previewTabBarWrap}>
                <BottomDockSurface placement="inline" className={styles.previewTabBar}>
                  <button type="button" className={styles.previewTabButton}>
                    <ChatIcon />
                    <span>Chats</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.previewTabButton} ${styles.previewTabButtonPrimary}`}
                  >
                    <PlusIcon />
                    <span>Create</span>
                  </button>
                  <button type="button" className={styles.previewTabButton}>
                    <SettingsIcon />
                    <span>Settings</span>
                  </button>
                </BottomDockSurface>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.catalogColumn}>
        <SurfacePanel
          as="section"
          tone="strong"
          padding="lg"
          radius="xl"
          className={styles.controlPanel}
        >
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>Foundation controls</span>
              <h2 className={styles.sectionTitle}>Tune the reference surface</h2>
            </div>
            <PillButton tone="accent" appearance="strong">
              Export recipes
            </PillButton>
          </div>

          <div className={styles.controlGrid}>
            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>Density</span>
              <SegmentedControl
                value={densityMode}
                options={densityOptions}
                onChange={setDensityMode}
                ariaLabel="Select showcase density"
                grouped
              />
            </div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>Usage focus</span>
              <SelectField defaultValue="chat" size="pill" aria-label="Choose usage focus">
                <option value="chat">Chat shell</option>
                <option value="calling">Calling overlays</option>
                <option value="settings">Settings and forms</option>
              </SelectField>
            </div>
          </div>
        </SurfacePanel>

        <div className={styles.sectionGrid}>
          <SurfacePanel
            as="section"
            tone="default"
            padding="lg"
            radius="xl"
            className={styles.sectionPanel}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Actions</span>
                <h2 className={styles.sectionTitle}>Compact CTA language</h2>
              </div>
              <StatusBadge tone="accent" dot>
                Toolbar ready
              </StatusBadge>
            </div>

            <div className={styles.inlineCluster}>
              <PillButton tone="accent" appearance="strong">
                Start call
              </PillButton>
              <PillButton tone="neutral" appearance="soft">
                Pin thread
              </PillButton>
              <PillButton tone="danger" appearance="soft">
                Leave room
              </PillButton>
            </div>

            <div className={styles.inlineCluster}>
              <IconButton variant="default" aria-label="Mute notifications">
                <BellIcon />
              </IconButton>
              <IconButton aria-label="Search">
                <SearchIcon />
              </IconButton>
              <IconButton variant="ghost" aria-label="Archive">
                <ArchiveIcon />
              </IconButton>
            </div>
          </SurfacePanel>

          <SurfacePanel
            as="section"
            tone="default"
            padding="lg"
            radius="xl"
            className={styles.sectionPanel}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Feedback</span>
                <h2 className={styles.sectionTitle}>Status, pills, and inline notices</h2>
              </div>
              <LabelPill>Release candidate</LabelPill>
            </div>

            <div className={styles.inlineCluster}>
              <StatusBadge tone="success" dot>
                Protected
              </StatusBadge>
              <StatusBadge tone="warning" dot>
                Waiting for peer
              </StatusBadge>
              <StatusBadge tone="danger" dot>
                Reconnect required
              </StatusBadge>
            </div>

            <div className={styles.inlineCluster}>
              <LabelPill size="xs">Voice</LabelPill>
              <LabelPill size="sm">Stage</LabelPill>
              <LabelPill tone="overlay" size="sm">
                Live
              </LabelPill>
            </div>

            <InlineNotice tone="warning" size="md">
              Mobile-inspired surfaces work best when notices stay terse and action-oriented.
            </InlineNotice>
          </SurfacePanel>

          <SurfacePanel
            as="section"
            tone="default"
            padding="lg"
            radius="xl"
            className={styles.sectionPanel}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Forms</span>
                <h2 className={styles.sectionTitle}>Dense controls without desktop heaviness</h2>
              </div>
            </div>

            <div className={styles.formStack}>
              <InputField
                aria-label="Workspace name"
                placeholder="Workspace name"
                leading={<ChatIcon />}
                size="lg"
              />
              <InputField
                aria-label="Quick search"
                placeholder="Jump to user or group"
                leading={<SearchIcon />}
                size="pill"
              />
              <SelectField defaultValue="balanced" aria-label="Security mode">
                <option value="compatibility">Compatibility</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </SelectField>
            </div>
          </SurfacePanel>

          <SurfacePanel
            as="section"
            tone="default"
            padding="lg"
            radius="xl"
            className={styles.sectionPanel}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Identity</span>
                <h2 className={styles.sectionTitle}>Rows and summaries for mobile-sized lists</h2>
              </div>
            </div>

            <div className={styles.identityStack}>
              <AvatarSummaryButton
                avatarLabel="Elena Smirnova"
                primaryText="Elena Smirnova"
                secondaryText="Security review lead"
              />
              <EntityRow
                leading={<Avatar label="Ops Circle" size={42} fontSize={14} />}
                title="Ops Circle"
                subtitle="7 members - secure group"
                meta={<LabelPill size="xs">Group</LabelPill>}
                trailing={<StatusBadge tone="accent" dot>Live</StatusBadge>}
              />
              <EntityRow
                leading={<Avatar label="QA Relay" size={42} fontSize={14} />}
                title="QA Relay"
                subtitle="Last active 5m ago"
                meta={<LabelPill size="xs">Direct</LabelPill>}
                trailing={<span className={styles.rowTime}>14:24</span>}
              />
            </div>
          </SurfacePanel>

          <SurfacePanel
            as="section"
            tone="accent"
            padding="lg"
            radius="xl"
            className={styles.sectionPanel}
          >
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Composition recipe</span>
                <h2 className={styles.sectionTitle}>How to use this foundation</h2>
              </div>
            </div>

            <div className={styles.recipeList}>
              <div className={styles.recipeItem}>
                <strong>1. Start from surfaces.</strong>
                <p>Pick the panel/dock shell first, then fill it with rows, badges, and actions.</p>
              </div>
              <div className={styles.recipeItem}>
                <strong>2. Stay compact by default.</strong>
                <p>Mobile rhythm on web should feel dense and tactile, not cramped or desktop-heavy.</p>
              </div>
              <div className={styles.recipeItem}>
                <strong>3. Promote only stable patterns.</strong>
                <p>Keep orchestration local. Move only repeatable visual recipes into the shared kit.</p>
              </div>
            </div>
          </SurfacePanel>
        </div>
      </main>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11.4 11.4 14.75 14.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 3.25a3.25 3.25 0 0 0-3.25 3.25v1.32c0 .69-.21 1.37-.6 1.93L4 11.5h10l-1.15-1.75a3.5 3.5 0 0 1-.6-1.93V6.5A3.25 3.25 0 0 0 9 3.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.25 13.25a1.9 1.9 0 0 0 3.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="6.15" y="2.5" width="5.7" height="8.5" rx="2.85" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.75 8.7a4.25 4.25 0 0 0 8.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 13v2.5M6.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HangupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.25 10.8c1.2-1.3 3.3-2.05 5.75-2.05 2.45 0 4.55.75 5.75 2.05"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5.3 10.7v2.15a1 1 0 0 0 1 1h.75m5.65-3.15v2.15a1 1 0 0 1-1 1h-.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.25A1.75 1.75 0 0 1 5.25 3.5h7.5A1.75 1.75 0 0 1 14.5 5.25v4.4A1.75 1.75 0 0 1 12.75 11.4H8l-2.8 2.35v-2.35H5.25A1.75 1.75 0 0 1 3.5 9.65v-4.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="m7.95 2.8.25.82a1.18 1.18 0 0 0 1.6.76l.74-.39c1-.53 2.1.57 1.58 1.58l-.39.74a1.18 1.18 0 0 0 .76 1.6l.82.25c1.12.33 1.12 1.92 0 2.25l-.82.25a1.18 1.18 0 0 0-.76 1.6l.39.74c.53 1-.57 2.1-1.58 1.58l-.74-.39a1.18 1.18 0 0 0-1.6.76l-.25.82c-.33 1.12-1.92 1.12-2.25 0l-.25-.82a1.18 1.18 0 0 0-1.6-.76l-.74.39c-1 .53-2.1-.57-1.58-1.58l.39-.74a1.18 1.18 0 0 0-.76-1.6l-.82-.25c-1.12-.33-1.12-1.92 0-2.25l.82-.25a1.18 1.18 0 0 0 .76-1.6l-.39-.74c-.53-1 .57-2.1 1.58-1.58l.74.39a1.18 1.18 0 0 0 1.6-.76l.25-.82c.33-1.12 1.92-1.12 2.25 0Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="12" height="10.25" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 6.75h12M7 9.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 3.25v11.5M3.25 9h11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
