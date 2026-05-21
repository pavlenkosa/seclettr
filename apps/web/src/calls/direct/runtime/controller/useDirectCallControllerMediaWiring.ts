import { useMemo } from "react";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import {
  useDirectCallLocalMedia,
  useDirectCallMediaElementBindings,
  useDirectCallRemoteTelemetry,
  useDirectCallVisualStateSummary,
} from "../media";

/**
 * useDirectCallControllerMediaWiring — media-facing direct-call composition bundle.
 *
 * Owns:
 *   - local media wiring
 *   - local media encryption capability summary
 *   - visual state summary for presentation
 *   - remote telemetry side effects
 *   - media element stream bindings
 *
 * Does not own signaling, negotiation ordering, or peer-connection bootstrap.
 */
type UseDirectCallControllerMediaWiringOptions = {
  localMedia: Parameters<typeof useDirectCallLocalMedia>[0];
  resolveLocalSupportedMediaEncryptionModes: () => DirectCallMediaEncryptionMode[];
  visualStateSummary: Omit<
    Parameters<typeof useDirectCallVisualStateSummary>[0],
    "localSupportedMediaEncryptionModes"
  >;
  remoteTelemetry: Parameters<typeof useDirectCallRemoteTelemetry>[0];
  mediaElementBindings: Omit<
    Parameters<typeof useDirectCallMediaElementBindings>[0],
    "isVideoCallActive" | "hasRenderableRemoteCamera" | "hasRenderableRemoteScreen"
  >;
};

export function useDirectCallControllerMediaWiring({
  localMedia,
  resolveLocalSupportedMediaEncryptionModes,
  visualStateSummary,
  remoteTelemetry,
  mediaElementBindings,
}: UseDirectCallControllerMediaWiringOptions) {
  const {
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    attachLocalTracksToPeer,
    syncVisualTransceiverDirections,
    requestLocalStream,
    syncLocalPreview,
    syncLocalScreenPreview,
  } = useDirectCallLocalMedia(localMedia);

  const localSupportedMediaEncryptionModes = useMemo(
    () => resolveLocalSupportedMediaEncryptionModes(),
    [resolveLocalSupportedMediaEncryptionModes],
  );

  const {
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    hasRemoteVisualMedia,
    isVideoCallActive,
    shouldRenderLocalCameraPreview,
    localSupportsFrameEncryption,
  } = useDirectCallVisualStateSummary({
    ...visualStateSummary,
    localSupportedMediaEncryptionModes,
  });

  useDirectCallRemoteTelemetry(remoteTelemetry);
  useDirectCallMediaElementBindings({
    ...mediaElementBindings,
    isVideoCallActive,
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
  });

  return {
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    attachLocalTracksToPeer,
    syncVisualTransceiverDirections,
    requestLocalStream,
    syncLocalPreview,
    syncLocalScreenPreview,
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    hasRemoteVisualMedia,
    isVideoCallActive,
    shouldRenderLocalCameraPreview,
    localSupportsFrameEncryption,
  };
}
