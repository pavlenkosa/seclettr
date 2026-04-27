import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { resolveCallDurationSeconds } from "@/calls/shared/model/call-duration";

export function beginDirectCallLifecycleToken(currentToken: number): number {
  return currentToken + 1;
}

export function isCurrentDirectCallLifecycleToken(
  currentToken: number,
  expectedToken: number
): boolean {
  return currentToken === expectedToken;
}

interface DirectCallDisconnectRecoveryParams {
  connectionState: RTCPeerConnectionState;
  negotiationReady: boolean;
  renegotiationUnsupported: boolean;
  hasPeerTarget: boolean;
  hasAttemptedIceRestart: boolean;
}

export function shouldAttemptDirectCallIceRestart(
  params: DirectCallDisconnectRecoveryParams
): boolean {
  return (
    params.connectionState === "disconnected" &&
    params.negotiationReady &&
    !params.renegotiationUnsupported &&
    params.hasPeerTarget &&
    !params.hasAttemptedIceRestart
  );
}

export function shouldResetDirectCallAfterDisconnectGrace(
  connectionState: RTCPeerConnectionState
): boolean {
  return connectionState === "disconnected" || connectionState === "failed";
}

export function resolveDirectCallDurationSeconds(
  active: Pick<ActiveCall, "duration" | "durationStartedAtMs">,
  nowMs = Date.now()
): number {
  return resolveCallDurationSeconds({
    baseSeconds: active.duration,
    startedAtMs: active.durationStartedAtMs,
  }, nowMs);
}

export type DirectCallNegotiationRole = "polite" | "impolite";

export function resolveDirectCallNegotiationRole(
  direction: "outbound" | "inbound"
): DirectCallNegotiationRole {
  return direction === "inbound" ? "polite" : "impolite";
}

export function isStaleRenegotiationRevision(
  lastAppliedRevision: number,
  nextRevision: number
): boolean {
  return nextRevision <= lastAppliedRevision;
}

export function shouldIgnoreIncomingRenegotiationOffer(params: {
  role: DirectCallNegotiationRole;
  makingOffer: boolean;
  signalingState: RTCSignalingState;
  isSettingRemoteAnswerPending: boolean;
}): boolean {
  const readyForOffer =
    !params.makingOffer &&
    (params.signalingState === "stable" || params.isSettingRemoteAnswerPending);
  const offerCollision = !readyForOffer;
  return params.role === "impolite" && offerCollision;
}
