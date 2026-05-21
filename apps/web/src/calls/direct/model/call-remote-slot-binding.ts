/**
 * call-remote-slot-binding — transceiver-to-slot source resolution for 1:1 calls.
 *
 * Owns:
 *   - resolveRemoteReceiverSlotSource — determines which visual source (camera | screen)
 *     a receiver transceiver belongs to, using a priority cascade:
 *       1. Remote-signaled MID (most authoritative — peer explicitly labels the track)
 *       2. Local transceiver identity (we know what we're sending on each transceiver)
 *       3. Stable existing binding (preserves slots across renegotiations when MID matches)
 *       4. Negotiated order fallback (camera = first video MID, screen = second)
 *       5. Ultimate fallback to "camera"
 *   - detectSourceSwitch — detects when the peer reuses the same MID for a different source
 *
 * Does not own slot state, transceiver lifecycle, or media routing. This module is a
 * pure resolution function invoked by useDirectCallRemoteMediaRuntime.
 */
import type { DirectCallVisualMediaSource } from "./call-media-state";

interface ResolveRemoteReceiverSlotSourceParams {
  /** Whether this transceiver is our local camera transceiver (used for initial binding) */
  isCameraTransceiver: boolean;
  /** Whether this transceiver is our local screen transceiver (used for initial binding) */
  isScreenTransceiver: boolean;
  /** Existing binding from transceiver to source (if already bound) */
  existingTransceiverBinding: DirectCallVisualMediaSource | null;
  /** Current MID of the transceiver */
  transceiverMid: string | null | undefined;
  /** MID signaled by remote for camera source */
  remoteCameraSignaledMid?: string | null;
  /** MID signaled by remote for screen source */
  remoteScreenSignaledMid?: string | null;
  /** Existing binding from MID to source (if already bound) */
  existingMidBinding: DirectCallVisualMediaSource | null;
  /** Ordered list of negotiated video MIDs */
  negotiatedVideoMids: readonly string[];
}

interface ResolvedRemoteReceiverSlotSource {
  source: DirectCallVisualMediaSource;
  bindMid: string | null;
}

function resolveSignaledSlot(
  params: ResolveRemoteReceiverSlotSourceParams,
  transceiverMid: string
): ResolvedRemoteReceiverSlotSource | null {
  if (params.remoteCameraSignaledMid === transceiverMid) {
    return { source: "camera", bindMid: transceiverMid };
  }
  if (params.remoteScreenSignaledMid === transceiverMid) {
    return { source: "screen", bindMid: transceiverMid };
  }
  return null;
}

function resolveLocalTransceiverSlot(
  params: ResolveRemoteReceiverSlotSourceParams,
  transceiverMid: string | null | undefined
): ResolvedRemoteReceiverSlotSource | null {
  if (params.isCameraTransceiver) {
    return { source: "camera", bindMid: transceiverMid ?? null };
  }
  if (params.isScreenTransceiver) {
    return { source: "screen", bindMid: transceiverMid ?? null };
  }
  return null;
}

function resolveStableExistingSlot(
  params: ResolveRemoteReceiverSlotSourceParams,
  transceiverMid: string | null | undefined
): ResolvedRemoteReceiverSlotSource | null {
  if (transceiverMid && params.existingMidBinding) {
    return {
      source: params.existingMidBinding,
      bindMid: transceiverMid,
    };
  }
  if (params.existingTransceiverBinding) {
    return {
      source: params.existingTransceiverBinding,
      bindMid: transceiverMid ?? null,
    };
  }
  return null;
}

function resolveNegotiatedSlot(
  params: ResolveRemoteReceiverSlotSourceParams,
  transceiverMid: string | null | undefined
): ResolvedRemoteReceiverSlotSource | null {
  if (!transceiverMid) return null;
  const negotiatedIndex = params.negotiatedVideoMids.indexOf(transceiverMid);
  if (negotiatedIndex === -1) return null;
  return {
    source: negotiatedIndex === 0 ? "camera" : "screen",
    bindMid: transceiverMid,
  };
}

/**
 * Simplified remote receiver slot binding resolver.
 * 
 * Priority order:
 * 1. Remote signaling MID (most authoritative - peer tells us what they sent)
 * 2. Local transceiver identity (we know what we're sending on each transceiver)
 * 3. Stable existing binding (preserves slots across renegotiations)
 * 4. Negotiated order fallback (camera=first, screen=second)
 * 
 * This policy is symmetric: both caller and answerer use the same logic,
 * and renegotiation preserves existing bindings when MIDs match.
 */
export function resolveRemoteReceiverSlotSource(
  params: ResolveRemoteReceiverSlotSourceParams
): ResolvedRemoteReceiverSlotSource {
  const { transceiverMid } = params;

  if (transceiverMid) {
    const signaledSlot = resolveSignaledSlot(params, transceiverMid);
    if (signaledSlot) return signaledSlot;
  }

  const localSlot = resolveLocalTransceiverSlot(params, transceiverMid);
  if (localSlot) return localSlot;

  const existingSlot = resolveStableExistingSlot(params, transceiverMid);
  if (existingSlot) return existingSlot;

  const negotiatedSlot = resolveNegotiatedSlot(params, transceiverMid);
  if (negotiatedSlot) return negotiatedSlot;

  // Ultimate fallback: default to camera
  return {
    source: "camera",
    bindMid: transceiverMid ?? null,
  };
}

/**
 * Check if a source switch is happening for the same transceiver.
 * This helps detect when the peer switches from camera to screen or vice versa
 * on the same MID.
 */
export function detectSourceSwitch(params: {
  existingBinding: DirectCallVisualMediaSource | null;
  newBinding: DirectCallVisualMediaSource;
  sameMid: boolean;
}): boolean {
  return params.sameMid && params.existingBinding !== null && params.existingBinding !== params.newBinding;
}
