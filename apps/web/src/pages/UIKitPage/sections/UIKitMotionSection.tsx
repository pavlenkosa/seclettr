import {
  IconPill,
  InlineNotice,
  LabelPill,
  PillButton,
  StatusBadge,
  SurfacePanel,
} from "@/components/ui";
import { RecipeItem, SectionHeader } from "../helpers/uikitDemoBlocks";
import { LayersIcon } from "../helpers/uikitDemoIcons";
import styles from "../../UIKitPage.module.css";

export function UIKitMotionSection() {
  return (
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
        <PillButton tone="neutral" appearance="soft" disabled>Disabled shell</PillButton>
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
  );
}
