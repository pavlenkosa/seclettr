import { LabelPill, SurfacePanel } from "@/components/ui";
import { RecipeItem, SectionHeader } from "../helpers/uikitDemoBlocks";
import type { DensityMode } from "../helpers/uikitDemoData";
import styles from "../../UIKitPage.module.css";

interface UIKitMobileDenseSectionProps {
  readonly isCompact: boolean;
}

export function UIKitMobileDenseSection({
  isCompact,
}: Readonly<UIKitMobileDenseSectionProps>) {
  return (
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
  );
}
