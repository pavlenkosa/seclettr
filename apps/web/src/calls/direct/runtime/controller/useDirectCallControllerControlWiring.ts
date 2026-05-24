import { useCallback, type MutableRefObject } from "react";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallSetup } from "../useDirectCallSetup";
import {
  useDirectCallOutgoingMediaState,
  useDirectCallVisualMediaControls,
} from "../media";

/**
 * useDirectCallControllerControlWiring — direct-call setup and media-control bundle.
 *
 * Owns:
 *   - outbound/incoming setup boundary actions
 *   - outgoing media-state dispatch wiring
 *   - camera / screen-share / camera-switch visual controls
 *   - mute toggle callback
 *
 * Does not own negotiation runtime ordering, signal ingress, peer-connection
 * bootstrap, or presentation bindings.
 */
type UseDirectCallControllerControlWiringOptions = {
  setupControl: Parameters<typeof useDirectCallSetup>[0];
  outgoingMediaState: Parameters<typeof useDirectCallOutgoingMediaState>[0];
  visualMediaControls: Omit<
    Parameters<typeof useDirectCallVisualMediaControls>[0],
    "sendCallMediaState" | "syncOutgoingVisualMediaStateTrackBindings" | "clearOutgoingVisualMediaStateTrackBinding"
  > & {
    active: ActiveCall | null;
  };
  activeRef: MutableRefObject<ActiveCall | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  setActiveIfCurrent: (callId: string, updater: (prev: ActiveCall) => ActiveCall) => void;
};

export function useDirectCallControllerControlWiring({
  setupControl,
  outgoingMediaState,
  visualMediaControls,
  activeRef,
  localStreamRef,
  setActiveIfCurrent,
}: UseDirectCallControllerControlWiringOptions) {
  const {
    startCall,
    acceptCall,
    rejectCall,
    hangup,
  } = useDirectCallSetup(setupControl);

  const {
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
  } = useDirectCallOutgoingMediaState(outgoingMediaState);

  const {
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
    toggleVideo,
    toggleScreenShare,
    selectedScreenResolution,
    handleSelectScreenResolution,
  } = useDirectCallVisualMediaControls({
    ...visualMediaControls,
    active: visualMediaControls.active,
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
  });

  const toggleMute = useCallback(() => {
    if (!activeRef.current || !localStreamRef.current) return;
    const nextMuted = !activeRef.current.muted;
    const activeCallId = activeRef.current.callId;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setActiveIfCurrent(activeCallId, (prev) => ({ ...prev, muted: nextMuted }));
    sendCallMediaState("mic", nextMuted ? "muted" : "on", undefined, "user-toggle");
  }, [activeRef, localStreamRef, sendCallMediaState, setActiveIfCurrent]);

  return {
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingMediaStateTrackBindings,
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
    toggleVideo,
    toggleScreenShare,
    selectedScreenResolution,
    handleSelectScreenResolution,
    toggleMute,
  };
}
