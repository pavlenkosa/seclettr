const DEFAULT_AUTO_SCROLL_THRESHOLD_PX = 96;

interface MessageListAutoScrollOptions {
  previousMessageCount: number;
  nextMessageCount: number;
  distanceFromBottomPx: number;
  prefersReducedMotion?: boolean;
  thresholdPx?: number;
  forceScroll?: boolean;
}

export function getMessageListAutoScrollBehavior({
  previousMessageCount,
  nextMessageCount,
  distanceFromBottomPx,
  prefersReducedMotion = false,
  thresholdPx = DEFAULT_AUTO_SCROLL_THRESHOLD_PX,
  forceScroll = false,
}: MessageListAutoScrollOptions): ScrollBehavior | null {
  if (nextMessageCount <= 0 || nextMessageCount === previousMessageCount) {
    return null;
  }

  if (previousMessageCount <= 0) {
    return "auto";
  }

  if (forceScroll) {
    return prefersReducedMotion ? "auto" : "smooth";
  }

  const nearBottomScrollBehavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
  return distanceFromBottomPx <= thresholdPx ? nearBottomScrollBehavior : null;
}
