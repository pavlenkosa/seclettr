import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
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
  readonly note?: string;
}

export function SettingsSectionNav({
  sections,
  activeSection,
  onSelect,
  ariaLabel,
  note,
}: Readonly<SettingsSectionNavProps>) {
  const navRef = useRef<HTMLElement | null>(null);
  const activeIndex = useMemo(
    () => Math.max(0, sections.findIndex((section) => section.id === activeSection)),
    [activeSection, sections]
  );

  const focusSection = (index: number) => {
    const button = navRef.current?.querySelector<HTMLButtonElement>(
      `button[data-settings-section-index="${index}"]`
    );
    if (!button) return;
    button.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % sections.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + sections.length) % sections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sections.length - 1;
    }

    if (nextIndex === null || nextIndex === index) return;

    event.preventDefault();
    onSelect(sections[nextIndex]!.id);
    focusSection(nextIndex);
  };

  return (
    <>
      <nav ref={navRef} className={styles.sectionList} aria-label={ariaLabel}>
        {sections.map((section, index) => {
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
              onKeyDown={(event) => handleKeyDown(event, index)}
              aria-current={isActive ? "page" : undefined}
              tabIndex={index === activeIndex ? 0 : -1}
              data-settings-section-index={index}
            />
          );
        })}
      </nav>

      {note ? <p className={styles.menuNote}>{note}</p> : null}
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
