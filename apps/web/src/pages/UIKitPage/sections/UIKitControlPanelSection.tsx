import type { Dispatch, SetStateAction } from "react";
import {
  FieldSection,
  IconPill,
  Listbox,
  SegmentedControl,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import { LayersIcon, ShieldIcon } from "../helpers/uikitDemoIcons";
import {
  densityOptions,
  listboxOptions,
  threadFilterOptions,
  type DensityMode,
  type ThreadFilter,
} from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

interface UIKitControlPanelSectionProps {
  readonly densityMode: DensityMode;
  readonly threadFilter: ThreadFilter;
  readonly securityMode: string;
  readonly setDensityMode: Dispatch<SetStateAction<DensityMode>>;
  readonly setThreadFilter: Dispatch<SetStateAction<ThreadFilter>>;
  readonly setSecurityMode: Dispatch<SetStateAction<string>>;
}

export function UIKitControlPanelSection({
  densityMode,
  threadFilter,
  securityMode,
  setDensityMode,
  setThreadFilter,
  setSecurityMode,
}: Readonly<UIKitControlPanelSectionProps>) {
  return (
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
  );
}
