import {
  forwardRef,
  type ReactNode,
  type Ref,
} from "react";
import { StatusBadge, type StatusBadgeTone } from "../feedback/StatusBadge";
import { SurfacePanel } from "./SurfacePanel";
import { ModalShell, type ModalShellProps } from "./ModalShell";
import styles from "./SectionedModal.module.css";

export interface SectionedModalSection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly summary?: string;
  readonly summaryTone?: StatusBadgeTone;
  readonly icon?: ReactNode;
}

export interface SectionedModalProps extends Omit<ModalShellProps, "children"> {
  readonly sections: readonly SectionedModalSection[];
  readonly activeSection: string;
  readonly onSectionChange: (id: string) => void;
  /** Content rendered in the right-side panel (below the hero). */
  readonly children: ReactNode;
  /** Optional footer panel text. */
  readonly footerNote?: string;
  /** Screen-reader label for the sidebar nav element. */
  readonly sidebarAriaLabel?: string;
  /** Eyebrow text shown above the hero title (defaults to modal title). */
  readonly heroEyebrow?: string;
}

function SectionedModalInner(
  {
    sections,
    activeSection,
    onSectionChange,
    children,
    footerNote,
    sidebarAriaLabel,
    heroEyebrow,
    ...shellProps
  }: SectionedModalProps,
  ref: Ref<HTMLElement>
) {
  const active = sections.find((s) => s.id === activeSection) ?? sections[0];

  return (
    <ModalShell ref={ref} {...shellProps}>
      <div className={styles.layout}>
        <nav className={styles.sidebar} aria-label={sidebarAriaLabel}>
          {sections.map((section) => {
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                className={`${styles.sectionTab} ${isActive ? styles.sectionTabActive : ""}`}
                onClick={() => onSectionChange(section.id)}
                aria-pressed={isActive}
                aria-current={isActive ? "page" : undefined}
              >
                {section.icon ? (
                  <span className={styles.sectionTabIcon} aria-hidden="true">
                    {section.icon}
                  </span>
                ) : null}
                <span className={styles.sectionTabBody}>
                  <span className={styles.sectionTabTitle}>{section.title}</span>
                  <span className={styles.sectionTabDescription}>{section.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className={styles.content}>
          <div className={styles.contentPane}>
            {active ? (
              <SurfacePanel
                className={styles.sectionHero}
                tone="accent"
                glass="strong"
                padding="lg"
                radius="xl"
              >
                {active.icon ? (
                  <div className={styles.sectionHeroIcon} aria-hidden="true">
                    {active.icon}
                  </div>
                ) : null}
                <div className={styles.sectionHeroBody}>
                  {heroEyebrow ? (
                    <div className={styles.sectionHeroEyebrow}>{heroEyebrow}</div>
                  ) : null}
                  <h2 className={styles.sectionHeroTitle}>{active.title}</h2>
                  <p className={styles.sectionHeroDescription}>{active.description}</p>
                  {active.summary ? (
                    <div className={styles.sectionHeroMeta}>
                      <StatusBadge tone={active.summaryTone ?? "neutral"} size="md" dot>
                        {active.summary}
                      </StatusBadge>
                    </div>
                  ) : null}
                </div>
              </SurfacePanel>
            ) : null}

            {children}

            {footerNote ? (
              <SurfacePanel className={styles.footerPanel} tone="strong" padding="md" radius="lg" glass="medium">
                <p className={styles.note}>{footerNote}</p>
              </SurfacePanel>
            ) : null}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export const SectionedModal = forwardRef<HTMLElement, SectionedModalProps>(SectionedModalInner);
