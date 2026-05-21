/**
 * direct-call-stage-layout — stage / companion source layout resolution for 1:1 calls.
 *
 * Owns:
 *   - DirectCallStageLayout — describes which source occupies the main stage
 *     (camera | screen | audio) and an optional companion pip source
 *   - resolveDirectCallStageLayout — pure function that picks the stage and companion
 *     source given what is renderable, the user's preferred source, and whether the
 *     remote screen share is temporarily suppressed
 *
 * Layout policy:
 *   - No renderable remote video → "audio" stage (avatar mode)
 *   - Remote screen active → screen is primary by default (content beats camera)
 *   - User explicit preference honoured when the preferred source is renderable
 *   - Both sources renderable → non-stage source becomes companion pip
 *
 * Does not own React state, preference persistence, or viewer-dialog lifecycle.
 * Those are owned by useDirectCallStagePresentation.
 */
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
