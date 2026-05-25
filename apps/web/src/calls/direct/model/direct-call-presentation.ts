/**
 * direct-call-presentation — pure presentation state derivation for 1:1 calls.
 *
 * Owns:
 *   - DirectCallPresentationState — the complete flat bag of display strings and
 *     derived booleans consumed by the presentation layer (labels, initials, surface,
 *     security status, media control aria labels, etc.)
 *   - buildDirectCallPresentationState — single entry-point that derives all
 *     presentation values from active call state, incoming call state, UI toggles,
 *     security mode, and i18n translation function
 *
 * Internal helpers (resolveCallPeerLabels, resolveIncomingCallText,
 * resolveActiveCallSecurityLabels, resolveCallControlLabels) are private to this
 * module and keep buildDirectCallPresentationState declarative and testable.
 *
 * Does not own React state, hooks, or any side effects.
 * Consumed by useDirectCallPresentationBindings via useDirectCallVisualState.
 */
import { resolveDirectCallSurface, type DirectCallSurface, type ActiveCall, type IncomingCall } from "./direct-call-types";
import {
  callStateLabel,
  getPeerInitials,
  type DirectCallTranslator,
} from "./direct-call-ui-utils";
import {
  resolveDirectCallRuntimeState,
  type DirectCallRuntimeState,
} from "./direct-call-runtime-state";

interface BuildDirectCallPresentationStateInput {
  active: ActiveCall | null;
  incoming: IncomingCall | null;
  isMinimized: boolean;
  isSecurityCardOpen: boolean;
  t: DirectCallTranslator;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
}

export interface DirectCallPresentationState {
  runtimeState: DirectCallRuntimeState;
  surface: DirectCallSurface;
  peerDisplayName: string;
  peerDisplayInitials: string;
  incomingPeerDisplayName: string;
  incomingPeerInitials: string;
  incomingPromptText: string;
  incomingMinimizedMetaText: string;
  callSecurityStatusLabel: string;
  callSecurityToggleLabel: string;
  activeCallStateText: string;
  muteToggleAriaLabel: string;
  muteToggleLabel: string;
  videoToggleAriaLabel: string;
  videoToggleLabel: string;
  switchCameraLabel: string;
  screenShareToggleAriaLabel: string;
  screenShareToggleLabel: string;
}

function resolveCallPeerLabels({
  active,
  incoming,
  resolvePeerLabel,
}: Pick<BuildDirectCallPresentationStateInput, "active" | "incoming" | "resolvePeerLabel">) {
  const peerDisplayName = active
    ? resolvePeerLabel(active.peerUserId, active.peerLabel)
    : "";
  const incomingPeerDisplayName = incoming
    ? resolvePeerLabel(incoming.callerUserId, incoming.callerLabel)
    : "";
  return {
    peerDisplayName,
    peerDisplayInitials: getPeerInitials(peerDisplayName),
    incomingPeerDisplayName,
    incomingPeerInitials: getPeerInitials(incomingPeerDisplayName),
  };
}

function resolveIncomingCallText(
  incoming: IncomingCall | null,
  t: DirectCallTranslator
) {
  if (!incoming) {
    return {
      incomingPromptText: "",
      incomingMinimizedMetaText: "",
    };
  }
  const callTypeLabel = incoming.callType === "video"
    ? t("call.callType.video")
    : t("call.callType.voice");
  const incomingPromptText = t("call.incomingLabel", { type: callTypeLabel });
  return {
    incomingPromptText,
    incomingMinimizedMetaText: `${incomingPromptText} / ${t("call.state.ringing")}`,
  };
}

function resolveActiveCallSecurityLabels(
  active: ActiveCall | null,
  t: DirectCallTranslator
) {
  return {
    callSecurityStatusLabel: active?.e2eeActive
      ? t("callSecurity.verified")
      : t("callSecurity.pending"),
  };
}

function resolveCallControlLabels(
  active: ActiveCall | null,
  t: DirectCallTranslator
) {
  return {
    muteToggleAriaLabel: active?.muted ? t("call.unmute") : t("call.mute"),
    muteToggleLabel: active?.muted ? t("call.unmute") : t("call.mute"),
    videoToggleAriaLabel: active?.videoOff
      ? t("call.turnCameraOnAria")
      : t("call.turnCameraOffAria"),
    videoToggleLabel: active?.videoOff
      ? t("call.cameraOnLabel")
      : t("call.cameraOffLabel"),
    switchCameraLabel: t("call.switchCameraLabel"),
    screenShareToggleAriaLabel: active?.screenSharing
      ? t("call.stopScreenShare")
      : t("call.startScreenShare"),
    screenShareToggleLabel: active?.screenSharing
      ? t("call.stopScreenShare")
      : t("call.startScreenShare"),
  };
}

export function buildDirectCallPresentationState({
  active,
  incoming,
  isMinimized,
  isSecurityCardOpen,
  t,
  resolvePeerLabel,
}: BuildDirectCallPresentationStateInput): DirectCallPresentationState {
  const peerLabels = resolveCallPeerLabels({ active, incoming, resolvePeerLabel });
  const incomingText = resolveIncomingCallText(incoming, t);
  const surface = resolveDirectCallSurface({
    hasIncoming: Boolean(incoming),
    hasActive: Boolean(active),
    isMinimized,
  });
  const runtimeState = resolveDirectCallRuntimeState({
    active,
    incoming,
  });
  const securityLabels = resolveActiveCallSecurityLabels(active, t);
  const callSecurityToggleLabel = isSecurityCardOpen
    ? t("callSecurity.hideCode")
    : t("callSecurity.showCode");
  const activeCallStateText = active
    ? callStateLabel(runtimeState, active.duration, t)
    : "";
  const controlLabels = resolveCallControlLabels(active, t);

  return {
    runtimeState,
    surface,
    ...peerLabels,
    ...incomingText,
    ...securityLabels,
    callSecurityToggleLabel,
    activeCallStateText,
    ...controlLabels,
  };
}
