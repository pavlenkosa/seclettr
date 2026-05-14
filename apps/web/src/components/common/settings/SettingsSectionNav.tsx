import type { ReactNode } from "react";
import { EntityRow } from "@/components/ui";
import styles from "../SettingsScreen.module.css";

export interface SettingsSectionEntry {
  readonly id: "notifications" | "appearance" | "security";
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly icon: ReactNode;
}

interface SettingsSectionNavProps {
  readonly sections: readonly SettingsSectionEntry[];
  readonly activeSection: SettingsSectionEntry["id"];
  readonly onSelect: (section: SettingsSectionEntry["id"]) => void;
  readonly ariaLabel: string;
  readonly note: string;
}

export function SettingsSectionNav({
  sections,
  activeSection,
  onSelect,
  ariaLabel,
  note,
}: Readonly<SettingsSectionNavProps>) {
  return (
    <>
      <nav className={styles.sectionList} aria-label={ariaLabel}>
        {sections.map((section) => {
          const isActive = section.id === activeSection;
          return (
            <EntityRow
              key={section.id}
              as="button"
              size="md"
              align="center"
              className={`${styles.sectionButton} ${isActive ? styles.sectionButtonActive : ""}`}
              leading={<span className={styles.sectionIcon} aria-hidden="true">{section.icon}</span>}
              title={section.title}
              subtitle={section.description}
              meta={section.summary}
              mainClassName={styles.sectionCopy}
              titleClassName={styles.sectionTitle}
              subtitleClassName={styles.sectionDescription}
              metaClassName={styles.sectionSummary}
              trailing={<span className={styles.sectionChevron} aria-hidden="true"><ChevronIcon /></span>}
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? "page" : undefined}
            />
          );
        })}
      </nav>

      <p className={styles.menuNote}>{note}</p>
    </>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m7 4 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
