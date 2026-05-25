import {
  FieldSection,
  InputField,
  Listbox,
  SelectField,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import { ChatIcon, SearchIcon, ShieldIcon } from "../helpers/uikitDemoIcons";
import { listboxOptions } from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

interface UIKitFormsSectionProps {
  readonly securityMode: string;
  readonly setSecurityMode: (value: string) => void;
}

export function UIKitFormsSection({
  securityMode,
  setSecurityMode,
}: Readonly<UIKitFormsSectionProps>) {
  return (
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
  );
}
