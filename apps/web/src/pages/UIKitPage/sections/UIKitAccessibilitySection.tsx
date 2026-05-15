import type { ReactNode } from "react";
import {
  AvatarSummaryButton,
  EntityRow,
  IconButton,
  IconPill,
  InputField,
  Listbox,
  ModalShell,
  PillButton,
  SegmentedControl,
  SelectField,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import {
  ArchiveIcon,
  BellIcon,
  ChatIcon,
  LayersIcon,
  SearchIcon,
  ShieldIcon,
} from "../helpers/uikitDemoIcons";
import { listboxOptions } from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

const noop = () => {};

export function UIKitAccessibilitySection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Accessibility"
        title="Keyboard, focus, and disabled states"
      />

      <p className={styles.a11yLead}>
        Each live target below uses the primitive exactly as it exists today. If the focus treatment is missing
        or feels wrong here, that is a primitive bug to file separately, not a UIKit-only styling gap.
      </p>

      <div className={styles.a11yGrid}>
        <A11yCard
          title="IconButton"
          caption="Hover keeps the circular surface flat with only border/background tint. Keyboard focus currently falls back to the browser default outline."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space"]}
          focusNote="Current focus contract: browser default button focus."
          restExample={<IconButton size={36} aria-label="Search action example"><SearchIcon /></IconButton>}
          focusExample={<IconButton size={36} aria-label="Keyboard focus target"><BellIcon /></IconButton>}
          disabledExample={<IconButton size={36} aria-label="Disabled icon action" disabled><ArchiveIcon /></IconButton>}
        />

        <A11yCard
          title="PillButton"
          caption="Hover uses the same compact pill recipe; keyboard focus uses the primitive's real focus-visible outline."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space"]}
          focusNote="Current focus contract: custom :focus-visible ring."
          restExample={<PillButton tone="accent" appearance="strong">Start call</PillButton>}
          focusExample={<PillButton tone="neutral" appearance="soft">Focus with Tab</PillButton>}
          disabledExample={<PillButton tone="neutral" appearance="soft" disabled>Disabled action</PillButton>}
        />

        <A11yCard
          title="IconPill"
          caption="This is a presentational label, not a button. It has no keyboard, focus, or disabled state by design."
          keyboardKeys={["None — non-interactive"]}
          focusNote="Current focus contract: n/a by design."
          restExample={<IconPill icon={<ShieldIcon />} size="sm">Protected</IconPill>}
          focusExample={<StaticA11yNote>Non-interactive label</StaticA11yNote>}
          disabledExample={<StaticA11yNote>Disabled state not applicable</StaticA11yNote>}
        />

        <A11yCard
          title="InputField"
          caption="Hover is intentionally subtle. The field shell highlights on keyboard entry through the primitive's existing focus-within treatment."
          keyboardKeys={["Tab", "Shift+Tab", "ArrowLeft/Right", "Home", "End", "Typing"]}
          focusNote="Current focus contract: shell-level :focus-within, not dedicated :focus-visible."
          restExample={<InputField aria-label="Workspace name example" placeholder="Workspace name" leading={<ChatIcon />} />}
          focusExample={<InputField aria-label="Focus target input" placeholder="Press Tab into this field" leading={<SearchIcon />} />}
          disabledExample={<InputField aria-label="Disabled input example" placeholder="Locked by policy" leading={<ShieldIcon />} disabled />}
        />

        <A11yCard
          title="SelectField"
          caption="This stays on native select semantics. Keyboard focus currently follows the shared shell's focus-within treatment."
          keyboardKeys={["Tab", "Shift+Tab", "ArrowUp/Down", "Alt+ArrowDown", "Space"]}
          focusNote="Current focus contract: shell-level :focus-within, not dedicated :focus-visible."
          restExample={(
            <SelectField defaultValue="balanced" aria-label="Call policy example">
              <option value="compatibility">Compatibility</option>
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
            </SelectField>
          )}
          focusExample={(
            <SelectField defaultValue="balanced" aria-label="Focus target select">
              <option value="compatibility">Compatibility</option>
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
            </SelectField>
          )}
          disabledExample={(
            <SelectField defaultValue="balanced" aria-label="Disabled call policy example" disabled>
              <option value="compatibility">Compatibility</option>
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
            </SelectField>
          )}
        />

        <A11yCard
          title="Listbox"
          caption="Keyboard focus is explicit on the trigger. When opened, the popup supports roving active option state rather than fake styling in UIKit."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space", "ArrowUp/Down", "Home", "End", "Esc"]}
          focusNote="Current focus contract: custom :focus-visible ring on the trigger."
          restExample={<Listbox aria-label="Media security example" value="balanced" options={listboxOptions} onChange={noop} leading={<ShieldIcon />} />}
          focusExample={<Listbox aria-label="Focus target listbox" value="strict" options={listboxOptions} onChange={noop} leading={<LayersIcon />} />}
          disabledExample={<Listbox aria-label="Disabled listbox example" value="balanced" options={listboxOptions} onChange={noop} disabled />}
        />

        <A11yCard
          title="SegmentedControl"
          caption="The current control exposes individual buttons. Keyboard focus uses the browser's default button behavior; arrow-key roving is not a built-in contract."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space"]}
          focusNote="Current focus contract: browser default button focus."
          restExample={(
            <SegmentedControl
              value="compact"
              options={[{ value: "compact", label: "Compact" }, { value: "airy", label: "Airy" }]}
              onChange={noop}
              ariaLabel="Density example"
              grouped
            />
          )}
          focusExample={(
            <SegmentedControl
              value="all"
              options={[{ value: "all", label: "All" }, { value: "media", label: "Media" }, { value: "secure", label: "Secure" }]}
              onChange={noop}
              ariaLabel="Focus target segmented control"
              grouped
            />
          )}
          disabledExample={(
            <SegmentedControl
              value="all"
              options={[{ value: "all", label: "All", disabled: true }, { value: "media", label: "Media", disabled: true }]}
              onChange={noop}
              ariaLabel="Disabled segmented control"
              grouped
            />
          )}
        />

        <A11yCard
          title="EntityRow"
          caption="The row stays clickable without adding a second local focus recipe. Keyboard focus uses the primitive's real focus-visible outline."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space"]}
          focusNote="Current focus contract: custom :focus-visible ring."
          restExample={<EntityRow as="button" title="Release room" subtitle="Entity-like action row" meta="Live row" leading={<span className={styles.a11yEmoji}>#</span>} />}
          focusExample={<EntityRow as="button" title="Keyboard target row" subtitle="Press Tab to inspect the row outline" meta="Focus-visible" leading={<span className={styles.a11yEmoji}>→</span>} />}
          disabledExample={<EntityRow as="button" title="Disabled row" subtitle="Unavailable action" meta="Disabled" leading={<span className={styles.a11yEmoji}>×</span>} disabled />}
        />

        <A11yCard
          title="AvatarSummaryButton"
          caption="The minimized-dock summary keeps its own compact focus-visible outline instead of relying on a feature-local wrapper."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space"]}
          focusNote="Current focus contract: custom :focus-visible ring."
          restExample={<AvatarSummaryButton avatarLabel="Quartz sync" primaryText="Quartz sync" secondaryText="Voice call · protected" />}
          focusExample={<AvatarSummaryButton avatarLabel="Keyboard target" primaryText="Keyboard target" secondaryText="Press Tab to inspect the summary button" />}
          disabledExample={<AvatarSummaryButton avatarLabel="Unavailable" primaryText="Unavailable" secondaryText="Disabled summary" disabled />}
        />

        <A11yCard
          title="ModalShell close button"
          caption="The shell close affordance is the real modal close button. It currently relies on the browser's default button focus while the shell itself also supports Esc to close."
          keyboardKeys={["Tab", "Shift+Tab", "Enter", "Space", "Esc (shell)"]}
          focusNote="Current focus contract: browser default button focus on the close button."
          restExample={<ModalShellPreview variant="rest" />}
          focusExample={<ModalShellPreview variant="focus" />}
          disabledExample={<StaticA11yNote>Disabled state not applicable to the standard close button</StaticA11yNote>}
        />
      </div>
    </SurfacePanel>
  );
}

interface A11yCardProps {
  readonly title: string;
  readonly caption: string;
  readonly keyboardKeys: readonly string[];
  readonly focusNote: string;
  readonly restExample: ReactNode;
  readonly focusExample: ReactNode;
  readonly disabledExample: ReactNode;
}

function A11yCard({
  title,
  caption,
  keyboardKeys,
  focusNote,
  restExample,
  focusExample,
  disabledExample,
}: Readonly<A11yCardProps>) {
  return (
    <div className={styles.a11yCard}>
      <div className={styles.a11yHeader}>
        <strong>{title}</strong>
        <p>{caption}</p>
      </div>

      <div className={styles.a11yStates}>
        <A11yState label="Default">{restExample}</A11yState>
        <A11yState label="Keyboard target">{focusExample}</A11yState>
        <A11yState label="Disabled / n.a.">{disabledExample}</A11yState>
      </div>

      <p className={styles.a11yNote}>{focusNote}</p>

      <div className={styles.a11yKeys}>
        {keyboardKeys.map((key) => (
          <span key={key} className={styles.a11yKey}>{key}</span>
        ))}
      </div>
    </div>
  );
}

function A11yState({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className={styles.a11yState}>
      <span className={styles.a11yStateLabel}>{label}</span>
      <div className={styles.a11yStatePreview}>{children}</div>
    </div>
  );
}

function StaticA11yNote({ children }: Readonly<{ children: ReactNode }>) {
  return <span className={styles.a11yStaticNote}>{children}</span>;
}

function ModalShellPreview({ variant }: Readonly<{ variant: "rest" | "focus" }>) {
  return (
    <div className={styles.modalPreviewViewport}>
      <ModalShell
        isClosing={false}
        onClose={noop}
        ariaLabel={`UIKit modal shell ${variant} preview`}
        closeAriaLabel={variant === "focus" ? "Focus target modal close button" : "Close modal preview"}
        title="ModalShell"
        overlayClassName={styles.modalPreviewOverlay}
        surfaceClassName={styles.modalPreviewSurface}
        bodyClassName={styles.modalPreviewBody}
        footerClassName={styles.modalPreviewFooter}
        style={{
          "--modal-width": "100%",
          "--modal-max-height": "100%",
          "--modal-overlay-padding": "0.7rem",
          "--modal-z-index": 1,
        } as React.CSSProperties}
      >
        <div className={styles.modalPreviewStack}>
          <p className={styles.a11yModalText}>
            {variant === "focus"
              ? "Tab into the close button to inspect its current focus treatment."
              : "Standard modal close affordance preview."}
          </p>
        </div>
      </ModalShell>
    </div>
  );
}
