export type DirectCallStageVisualSource = "camera" | "screen";

interface ResolveDirectCallStageLayoutInput {
  hasRenderableRemoteCamera: boolean;
  hasRenderableRemoteScreen: boolean;
  preferredSource: DirectCallStageVisualSource | null;
  isRemoteScreenSuppressed?: boolean;
}

export interface DirectCallStageLayout {
  stageSource: DirectCallStageVisualSource | "audio";
  companionSource: DirectCallStageVisualSource | null;
  hasRemoteVisualMedia: boolean;
}

export function resolveDirectCallStageLayout({
  hasRenderableRemoteCamera,
  hasRenderableRemoteScreen,
  preferredSource,
  isRemoteScreenSuppressed = false,
}: ResolveDirectCallStageLayoutInput): DirectCallStageLayout {
  const hasRemoteVisualMedia = hasRenderableRemoteCamera || hasRenderableRemoteScreen;
  const canUseRemoteScreen = hasRenderableRemoteScreen && !isRemoteScreenSuppressed;
  const hasVisibleRemoteVisualMedia = hasRenderableRemoteCamera || canUseRemoteScreen;

  if (!hasVisibleRemoteVisualMedia) {
    return {
      stageSource: "audio",
      companionSource: null,
      hasRemoteVisualMedia,
    };
  }

  let stageSource: DirectCallStageVisualSource;
  if (preferredSource === "camera" && hasRenderableRemoteCamera) {
    stageSource = "camera";
  } else if (preferredSource === "screen" && canUseRemoteScreen) {
    stageSource = "screen";
  } else if (canUseRemoteScreen) {
    // When the peer is actively sharing a screen, keep that content primary by default.
    stageSource = "screen";
  } else if (hasRenderableRemoteCamera) {
    stageSource = "camera";
  } else {
    stageSource = "camera";
  }

  const companionSourceWhenBothAvailable: DirectCallStageVisualSource = stageSource === "camera" ? "screen" : "camera";
  const companionSource = hasRenderableRemoteCamera && canUseRemoteScreen
    ? companionSourceWhenBothAvailable
    : null;

  return {
    stageSource,
    companionSource,
    hasRemoteVisualMedia,
  };
}
