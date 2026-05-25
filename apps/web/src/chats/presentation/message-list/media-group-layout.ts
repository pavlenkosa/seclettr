/**
 * Pure geometry for message-list media groups (albums).
 *
 * This module owns only the math that turns attachment aspect ratios into
 * absolute cell frames. It has no React, runtime, or styling dependencies, so
 * it can be unit-tested and reasoned about in isolation from
 * `MediaGroupAttachment.tsx` presentation.
 */

export const MAX_COLLAPSED = 5;
const MEDIA_GROUP_GAP_PX = 2;
export const DEFAULT_MEDIA_GROUP_WIDTH_PX = 320;

export type MediaGroupLayout = "single" | "pair" | "triple" | "quad" | "quint" | "grid";

export function resolveMediaGroupLayout(count: number): MediaGroupLayout {
  if (count <= 1) return "single";
  if (count === 2) return "pair";
  if (count === 3) return "triple";
  if (count === 4) return "quad";
  if (count === 5) return "quint";
  return "grid";
}

interface AbsoluteMediaGroupCellFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AbsoluteMediaGroupPlan {
  height: number;
  cells: AbsoluteMediaGroupCellFrame[];
}

export function clampMediaRatio(ratio?: number | null): number {
  if (!ratio || !Number.isFinite(ratio)) return 1;
  return Math.max(0.58, Math.min(1.91, ratio));
}

function toVisualMediaRatio(ratio?: number | null): number {
  return Math.pow(clampMediaRatio(ratio), 0.74);
}

function roundMediaPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildTripleTopPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [heroRatio = 1, leftRatio = 1, rightRatio = 1] = ratios.map(toVisualMediaRatio);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX) / (leftRatio + rightRatio);
  const topHeight = width / heroRatio;
  const leftWidth = leftRatio * bottomHeight;
  const rightWidth = width - MEDIA_GROUP_GAP_PX - leftWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: leftWidth, height: bottomHeight },
      { left: leftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: rightWidth, height: bottomHeight },
    ],
  };
}

function buildTripleSidePlan(
  width: number,
  heroRatio: number,
  topRatio: number,
  bottomRatio: number,
  heroOnRight: boolean
): AbsoluteMediaGroupPlan {
  const heroVisualRatio = toVisualMediaRatio(heroRatio);
  const topVisualRatio = toVisualMediaRatio(topRatio);
  const bottomVisualRatio = toVisualMediaRatio(bottomRatio);
  const inverseStack = (1 / topVisualRatio) + (1 / bottomVisualRatio);
  const stackWidth = (
    width - MEDIA_GROUP_GAP_PX * (1 + heroVisualRatio)
  ) / (
    1 + heroVisualRatio * inverseStack
  );
  const totalHeight = stackWidth * inverseStack + MEDIA_GROUP_GAP_PX;
  const heroWidth = width - MEDIA_GROUP_GAP_PX - stackWidth;
  const topHeight = stackWidth / topVisualRatio;
  const bottomHeight = stackWidth / bottomVisualRatio;

  if (heroOnRight) {
    return {
      height: roundMediaPixels(totalHeight),
      cells: [
        { left: 0, top: 0, width: stackWidth, height: topHeight },
        { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: stackWidth, height: bottomHeight },
        { left: stackWidth + MEDIA_GROUP_GAP_PX, top: 0, width: heroWidth, height: totalHeight },
      ],
    };
  }

  return {
    height: roundMediaPixels(totalHeight),
    cells: [
      { left: 0, top: 0, width: heroWidth, height: totalHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: 0, width: stackWidth, height: topHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: stackWidth, height: bottomHeight },
    ],
  };
}

function buildTriplePlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [firstRatio = 1, secondRatio = 1, thirdRatio = 1] = ratios.map(clampMediaRatio);
  if (firstRatio < 0.82 && secondRatio > 0.95 && thirdRatio > 0.95) {
    return buildTripleSidePlan(width, firstRatio, secondRatio, thirdRatio, false);
  }
  if (thirdRatio < 0.82 && firstRatio > 0.95 && secondRatio > 0.95) {
    return buildTripleSidePlan(width, thirdRatio, firstRatio, secondRatio, true);
  }
  return buildTripleTopPlan(width, ratios);
}

function buildQuadPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [topLeftRatio = 1, topRightRatio = 1, bottomLeftRatio = 1, bottomRightRatio = 1] = ratios.map(toVisualMediaRatio);
  const topHeight = (width - MEDIA_GROUP_GAP_PX) / (topLeftRatio + topRightRatio);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX) / (bottomLeftRatio + bottomRightRatio);
  const topLeftWidth = topLeftRatio * topHeight;
  const topRightWidth = width - MEDIA_GROUP_GAP_PX - topLeftWidth;
  const bottomLeftWidth = bottomLeftRatio * bottomHeight;
  const bottomRightWidth = width - MEDIA_GROUP_GAP_PX - bottomLeftWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width: topLeftWidth, height: topHeight },
      { left: topLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: topRightWidth, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomLeftWidth, height: bottomHeight },
      { left: bottomLeftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomRightWidth, height: bottomHeight },
    ],
  };
}

function buildQuintTopPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [r1 = 1, r2 = 1, r3 = 1, r4 = 1, r5 = 1] = ratios.map(toVisualMediaRatio);
  const topHeight = (width - MEDIA_GROUP_GAP_PX) / (r1 + r2);
  const bottomHeight = (width - MEDIA_GROUP_GAP_PX * 2) / (r3 + r4 + r5);
  const topLeftWidth = r1 * topHeight;
  const topRightWidth = width - MEDIA_GROUP_GAP_PX - topLeftWidth;
  const bottomLeftWidth = r3 * bottomHeight;
  const bottomCenterWidth = r4 * bottomHeight;
  const bottomRightWidth = width - MEDIA_GROUP_GAP_PX * 2 - bottomLeftWidth - bottomCenterWidth;

  return {
    height: roundMediaPixels(topHeight + MEDIA_GROUP_GAP_PX + bottomHeight),
    cells: [
      { left: 0, top: 0, width: topLeftWidth, height: topHeight },
      { left: topLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: topRightWidth, height: topHeight },
      { left: 0, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomLeftWidth, height: bottomHeight },
      { left: bottomLeftWidth + MEDIA_GROUP_GAP_PX, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomCenterWidth, height: bottomHeight },
      { left: bottomLeftWidth + bottomCenterWidth + MEDIA_GROUP_GAP_PX * 2, top: topHeight + MEDIA_GROUP_GAP_PX, width: bottomRightWidth, height: bottomHeight },
    ],
  };
}

function buildQuintSidePlan(
  width: number,
  heroRatio: number,
  rowOneLeftRatio: number,
  rowOneRightRatio: number,
  rowTwoLeftRatio: number,
  rowTwoRightRatio: number,
  heroOnRight: boolean
): AbsoluteMediaGroupPlan {
  const heroVisualRatio = toVisualMediaRatio(heroRatio);
  const rowOneLeftVisualRatio = toVisualMediaRatio(rowOneLeftRatio);
  const rowOneRightVisualRatio = toVisualMediaRatio(rowOneRightRatio);
  const rowTwoLeftVisualRatio = toVisualMediaRatio(rowTwoLeftRatio);
  const rowTwoRightVisualRatio = toVisualMediaRatio(rowTwoRightRatio);
  const rowOneSum = rowOneLeftVisualRatio + rowOneRightVisualRatio;
  const rowTwoSum = rowTwoLeftVisualRatio + rowTwoRightVisualRatio;
  const inverseRows = (1 / rowOneSum) + (1 / rowTwoSum);
  const stackWidth = (
    width - MEDIA_GROUP_GAP_PX * (1 + heroVisualRatio * (1 - inverseRows))
  ) / (
    1 + heroVisualRatio * inverseRows
  );
  const rowOneHeight = (stackWidth - MEDIA_GROUP_GAP_PX) / rowOneSum;
  const rowTwoHeight = (stackWidth - MEDIA_GROUP_GAP_PX) / rowTwoSum;
  const totalHeight = rowOneHeight + MEDIA_GROUP_GAP_PX + rowTwoHeight;
  const heroWidth = width - MEDIA_GROUP_GAP_PX - stackWidth;
  const rowOneLeftWidth = rowOneLeftVisualRatio * rowOneHeight;
  const rowOneRightWidth = stackWidth - MEDIA_GROUP_GAP_PX - rowOneLeftWidth;
  const rowTwoLeftWidth = rowTwoLeftVisualRatio * rowTwoHeight;
  const rowTwoRightWidth = stackWidth - MEDIA_GROUP_GAP_PX - rowTwoLeftWidth;

  if (heroOnRight) {
    return {
      height: roundMediaPixels(totalHeight),
      cells: [
        { left: 0, top: 0, width: rowOneLeftWidth, height: rowOneHeight },
        { left: rowOneLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneRightWidth, height: rowOneHeight },
        { left: 0, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoLeftWidth, height: rowTwoHeight },
        { left: rowTwoLeftWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoRightWidth, height: rowTwoHeight },
        { left: stackWidth + MEDIA_GROUP_GAP_PX, top: 0, width: heroWidth, height: totalHeight },
      ],
    };
  }

  return {
    height: roundMediaPixels(totalHeight),
    cells: [
      { left: 0, top: 0, width: heroWidth, height: totalHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneLeftWidth, height: rowOneHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX + rowOneLeftWidth + MEDIA_GROUP_GAP_PX, top: 0, width: rowOneRightWidth, height: rowOneHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoLeftWidth, height: rowTwoHeight },
      { left: heroWidth + MEDIA_GROUP_GAP_PX + rowTwoLeftWidth + MEDIA_GROUP_GAP_PX, top: rowOneHeight + MEDIA_GROUP_GAP_PX, width: rowTwoRightWidth, height: rowTwoHeight },
    ],
  };
}

function buildQuintPlan(width: number, ratios: number[]): AbsoluteMediaGroupPlan {
  const [r1 = 1, r2 = 1, r3 = 1, r4 = 1, r5 = 1] = ratios.map(clampMediaRatio);
  if (r1 < 0.82 && r2 > 0.9 && r3 > 0.9 && r4 > 0.9 && r5 > 0.9) {
    return buildQuintSidePlan(width, r1, r2, r3, r4, r5, false);
  }
  if (r5 < 0.82 && r1 > 0.9 && r2 > 0.9 && r3 > 0.9 && r4 > 0.9) {
    return buildQuintSidePlan(width, r5, r1, r2, r3, r4, true);
  }
  return buildQuintTopPlan(width, ratios);
}

export function buildAbsoluteMediaGroupPlan(
  layout: MediaGroupLayout,
  width: number,
  ratios: number[]
): AbsoluteMediaGroupPlan | null {
  if (width <= 0) return null;
  if (layout === "triple" && ratios.length === 3) {
    return buildTriplePlan(width, ratios);
  }
  if (layout === "quad" && ratios.length === 4) {
    return buildQuadPlan(width, ratios);
  }
  if (layout === "quint" && ratios.length === 5) {
    return buildQuintPlan(width, ratios);
  }
  return null;
}
