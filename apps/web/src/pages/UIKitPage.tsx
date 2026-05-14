import { useState, type CSSProperties, type PointerEventHandler, type ReactNode } from "react";
import {
  Avatar,
  AvatarSummaryButton,
  BottomDockSurface,
  CallIdentityBlock,
  EntityRow,
  FieldSection,
  FloatingDock,
  HeaderBar,
  IconButton,
  IconPill,
  InfoStack,
  InlineNotice,
  InputField,
  LabelPill,
  Listbox,
  MessageDeliveryStatusIcon,
  ModalShell,
  PillButton,
  SegmentedControl,
  SecurityModeBadge,
  SelectField,
  StatusBadge,
  SurfacePanel,
  type MessageDeliveryStatus,
} from "@/components/ui";
import styles from "./UIKitPage.module.css";

type DensityMode = "compact" | "airy";
type ThreadFilter = "all" | "media" | "secure";

const densityOptions = [
  { value: "compact", label: "Compact" },
  { value: "airy", label: "Airy" },
] satisfies Array<{ value: DensityMode; label: string }>;

const threadFilterOptions = [
  { value: "all", label: "All threads" },
  { value: "media", label: "Media heavy" },
  { value: "secure", label: "Secure only" },
] satisfies Array<{ value: ThreadFilter; label: string }>;

const listboxOptions = [
  { value: "balanced", label: "Balanced" },
  { value: "strict", label: "Strict" },
  { value: "compatibility", label: "Compatibility" },
];

const themeSnapshots = [
  {
    id: "dark",
    label: "Dark",
    bg: "#0b1526",
    surface: "#152236",
    text: "#edf4ff",
    accent: "#3b82f6",
  },
  {
    id: "light",
    label: "Light",
    bg: "#eef3fa",
    surface: "#ffffff",
    text: "#0f172a",
    accent: "#2563eb",
  },
] as const;

const accentSnapshots = [
  { id: "blue", label: "Blue", value: "#2563eb" },
  { id: "emerald", label: "Emerald", value: "#047857" },
  { id: "rose", label: "Rose", value: "#e11d48" },
  { id: "violet", label: "Violet", value: "#7c3aed" },
] as const;

const noopPointerHandler: PointerEventHandler<HTMLButtonElement> = () => {};

export function UIKitPage() {
  const [densityMode, setDensityMode] = useState<DensityMode>("compact");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [securityMode, setSecurityMode] = useState("balanced");

  const isCompact = densityMode === "compact";

  return (
    <div
      className={[
        styles.root,
        isCompact ? styles.rootCompact : styles.rootAiry,
      ].filter(Boolean).join(" ")}
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

      <main className={styles.catalogColumn}>
        <SurfacePanel
          as="section"
          tone="strong"
          padding="lg"
          radius="xl"
          className={styles.controlPanel}
        >
          <SectionHeader
            eyebrow="Showcase controls"
            title="Preview density and secure-state examples"
            meta={<IconPill icon={<LayersIcon />} size="sm">Real shared components</IconPill>}
          />

          <div className={styles.controlGrid}>
            <FieldSection
              label="Density"
              description="Switch between tighter and more relaxed spacing presets for the showcase layout."
            >
              <SegmentedControl
                value={densityMode}
                options={densityOptions}
                onChange={setDensityMode}
                ariaLabel="Select showcase density"
                grouped
              />
            </FieldSection>

            <FieldSection
              label="Security mode"
              description="Listbox example using the current shared compact dropdown control."
            >
              <Listbox
                aria-label="Choose security mode example"
                value={securityMode}
                options={listboxOptions}
                onChange={setSecurityMode}
                size="pill"
                leading={<ShieldIcon />}
              />
            </FieldSection>

            <FieldSection
              label="Thread filter"
              description="Segmented control stays compact and product-like in dense settings surfaces."
            >
              <SegmentedControl
                value={threadFilter}
                options={threadFilterOptions}
                onChange={setThreadFilter}
                ariaLabel="Select thread filter"
                grouped
              />
            </FieldSection>
          </div>
        </SurfacePanel>

        <div className={styles.sectionGrid}>
          <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader
              eyebrow="Tokens"
              title="Theme and accent contract"
              meta={<LabelPill size="sm">From global.css</LabelPill>}
            />

            <div className={styles.themeGrid}>
              {themeSnapshots.map((theme) => (
                <ThemeSnapshotCard
                  key={theme.id}
                  label={theme.label}
                  bg={theme.bg}
                  surface={theme.surface}
                  text={theme.text}
                  accent={theme.accent}
                />
              ))}
            </div>

            <div className={styles.accentRow}>
              {accentSnapshots.map((accent) => (
                <span
                  key={accent.id}
                  className={styles.accentChip}
                  style={{ "--accent-chip": accent.value } as CSSProperties}
                >
                  <span className={styles.accentDot} aria-hidden="true" />
                  <span>{accent.label}</span>
                  <code>{accent.value}</code>
                </span>
              ))}
            </div>

            <InlineNotice tone="info" size="sm">
              Existing token families cover surfaces, text, borders, radius, motion, accents,
              and feature states. New UI work should consume them instead of adding local color systems.
            </InlineNotice>
          </SurfacePanel>

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
              <PillButton tone="neutral" appearance="soft" disabled aria-busy="true">Busy action</PillButton>
              <IconButton size={36} aria-label="Active toolbar item" active>
                <SearchIcon />
              </IconButton>
              <IconButton size={36} aria-label="Disabled toolbar item" disabled>
                <MoreIcon />
              </IconButton>
            </div>
          </SurfacePanel>

          <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader eyebrow="Forms" title="Inputs, selects, and listbox states" />

            <div className={styles.formGrid}>
              <FieldSection
                label="Workspace name"
                description="Shared single-line input shell for regular text entry."
              >
                <InputField
                  aria-label="Workspace name showcase"
                  placeholder="Workspace name"
                  leading={<ChatIcon />}
                  size="lg"
                />
              </FieldSection>

              <FieldSection
                label="Quick search"
                description="Pill search field keeps compact composition aligned with chat chrome."
              >
                <InputField
                  aria-label="Quick search showcase"
                  placeholder="Jump to user or group"
                  leading={<SearchIcon />}
                  size="pill"
                />
              </FieldSection>

              <FieldSection
                label="Call policy"
                description="Native select shell for lower-friction option sets."
              >
                <SelectField defaultValue="balanced" aria-label="Call policy showcase">
                  <option value="compatibility">Compatibility</option>
                  <option value="balanced">Balanced</option>
                  <option value="strict">Strict</option>
                </SelectField>
              </FieldSection>

              <FieldSection
                label="Media security"
                description="Custom listbox for richer dropdown styling and keyboard control."
              >
                <Listbox
                  aria-label="Media security showcase"
                  value={securityMode}
                  options={listboxOptions}
                  onChange={setSecurityMode}
                  leading={<ShieldIcon />}
                />
              </FieldSection>

              <FieldSection
                label="Disabled input"
                description="Shared disabled field state stays flat and consistent."
              >
                <InputField
                  aria-label="Disabled input showcase"
                  placeholder="Locked by policy"
                  leading={<ShieldIcon />}
                  disabled
                />
              </FieldSection>

              <FieldSection
                label="Disabled select"
                description="Native select shell keeps the same disabled treatment."
              >
                <SelectField defaultValue="balanced" aria-label="Disabled call policy showcase" disabled>
                  <option value="compatibility">Compatibility</option>
                  <option value="balanced">Balanced</option>
                  <option value="strict">Strict</option>
                </SelectField>
              </FieldSection>
            </div>
          </SurfacePanel>

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

          <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader
              eyebrow="Motion"
              title="Functional fade and popover rhythm"
              meta={<LabelPill size="sm">Motion.module.css</LabelPill>}
            />

            <InlineNotice tone="info" size="md">
              Shared motion is intentionally low-key: `ModalShell`, `FloatingDock`, `BottomDockSurface`,
              and `Listbox` use fade, popover, and surface transitions for clarity, not decoration.
            </InlineNotice>

            <div className={styles.inlineCluster}>
              <StatusBadge tone="accent" dot size="sm">Modal fade</StatusBadge>
              <StatusBadge tone="neutral" dot size="sm">Dock fade</StatusBadge>
              <StatusBadge tone="warning" dot size="sm">Listbox popover</StatusBadge>
              <StatusBadge tone="success" dot size="sm">No layout jump</StatusBadge>
              <StatusBadge tone="neutral" dot size="sm">Loading</StatusBadge>
            </div>

            <div className={styles.inlineCluster}>
              <PillButton tone="neutral" appearance="soft" disabled aria-busy="true">Busy shell</PillButton>
              <IconPill icon={<LayersIcon />} size="sm">Opacity-first motion</IconPill>
            </div>

            <div className={styles.recipeList}>
              <RecipeItem
                title="Modal fade"
                body="Use `ModalShell` for framed overlays with soft opacity transitions instead of scale-heavy entrance effects."
              />
              <RecipeItem
                title="Popover clarity"
                body="Use shared `Listbox` motion so dropdowns read as functional overlays, not decorative floating cards."
              />
              <RecipeItem
                title="Dock stability"
                body="`FloatingDock` and `BottomDockSurface` should settle without hover movement or layout jumps."
              />
            </div>
          </SurfacePanel>

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

          <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader eyebrow="Surfaces" title="Panels, header bars, rows, and modal shell" />

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
                    "--modal-z-index": 1,
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
            </div>
          </SurfacePanel>

          <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader
              eyebrow="Chat examples"
              title="Message bubbles, attachment row, and outgoing status"
              meta={<LabelPill size="sm">Demo-only composition</LabelPill>}
            />

            <div className={styles.chatExample}>
              <div className={`${styles.messageBubble} ${styles.messageBubbleIncoming}`}>
                <p className={styles.messageText}>Updated the UI audit and queued the next migration slice.</p>
                <div className={styles.messageMeta}>
                  <span>09:41</span>
                </div>
              </div>

              <div className={`${styles.messageBubble} ${styles.messageBubbleOutgoing}`}>
                <p className={styles.messageText}>UIKit now demonstrates shared controls instead of local copies.</p>
                <div className={styles.attachmentCard}>
                  <div className={styles.attachmentIcon}>
                    <PaperclipIcon />
                  </div>
                  <div className={styles.attachmentCopy}>
                    <strong>ui-kit-audit.pdf</strong>
                    <span>248 KB · attachment row</span>
                  </div>
                </div>
                <div className={styles.messageMeta}>
                  <span>09:43</span>
                  <MessageDeliveryStatusIcon status="read" size={14} />
                </div>
              </div>
            </div>
          </SurfacePanel>

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

          <SurfacePanel as="section" tone="accent" padding="lg" radius="xl" className={styles.sectionPanel}>
            <SectionHeader
              eyebrow="Mobile and dense"
              title="Compact shells without banned patterns"
              meta={<LabelPill size="sm">{isCompact ? "Compact density" : "Airy density"}</LabelPill>}
            />

            <div className={styles.recipeList}>
              <RecipeItem
                title="Keep it flat"
                body="Use shared surfaces, borders, and tokenized accents. Do not add glass, decorative shadows, glow, or random gradients."
              />
              <RecipeItem
                title="Preserve behavior"
                body="UI migration should not rewrite chat, call, auth, or modal runtime ownership."
              />
              <RecipeItem
                title="Promote only stable patterns"
                body="If a control is reusable across slices, move the visual recipe into shared primitives. If it is feature-bound, keep it local."
              />
            </div>
          </SurfacePanel>
        </div>
      </main>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  meta = null,
}: Readonly<{
  eyebrow: string;
  title: string;
  meta?: ReactNode;
}>) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <span className={styles.sectionEyebrow}>{eyebrow}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {meta}
    </div>
  );
}

function MetricCard({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

function ThemeSnapshotCard({
  label,
  bg,
  surface,
  text,
  accent,
}: Readonly<{
  label: string;
  bg: string;
  surface: string;
  text: string;
  accent: string;
}>) {
  return (
    <div className={styles.themeCard} style={{ "--theme-bg": bg, "--theme-surface": surface, "--theme-text": text, "--theme-accent": accent } as CSSProperties}>
      <div className={styles.themeCardTop}>
        <strong>{label}</strong>
        <span>{accent}</span>
      </div>
      <div className={styles.themeSwatches}>
        <span className={styles.themeSwatch} data-swatch="bg" />
        <span className={styles.themeSwatch} data-swatch="surface" />
        <span className={styles.themeSwatch} data-swatch="accent" />
      </div>
      <code className={styles.themeCode}>{text}</code>
    </div>
  );
}

function DeliveryStatusItem({
  label,
  status,
}: Readonly<{
  label: string;
  status: MessageDeliveryStatus;
}>) {
  return (
    <span className={styles.deliveryChip}>
      <MessageDeliveryStatusIcon status={status} size={14} />
      <span>{label}</span>
    </span>
  );
}

function RecipeItem({
  title,
  body,
}: Readonly<{
  title: string;
  body: string;
}>) {
  return (
    <div className={styles.recipeItem}>
      <strong>{title}</strong>
      <p>{body}</p>
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

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2L14 4.8V8.2C14 11.2 11.9 13.95 9 14.8C6.1 13.95 4 11.2 4 8.2V4.8L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.1 8.9 8.45 10.25 11.2 7.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="8.5" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m11.5 7 3-1.75v7.5l-3-1.75" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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

function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m8 2 5 2.7L8 7.4 3 4.7 8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m3 7.2 5 2.7 5-2.7M3 9.8l5 2.7 5-2.7" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
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

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="4.25" cy="9" r="1.15" fill="currentColor" />
      <circle cx="9" cy="9" r="1.15" fill="currentColor" />
      <circle cx="13.75" cy="9" r="1.15" fill="currentColor" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 8.5 9.9 4.1a2.1 2.1 0 1 1 3 3L7.3 12.7a3.1 3.1 0 0 1-4.4-4.4l5.1-5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m4 9 3 3 7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
