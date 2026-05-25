/**
 * call-media-state — media state types and wire–local bridge utilities.
 *
 * Owns:
 *   - Re-exports of protocol wire types (CallMediaSource, CallMediaState, etc.)
 *     so the rest of the app imports from one local location instead of the protocol package
 *   - LastIncomingMediaState / IncomingMediaStateHint — advisory hint types derived
 *     from incoming peer media-state signals (seq/revision ordered, not commanding)
 *   - OutgoingCallMediaStateSnapshot — snapshot of what we last sent to the peer
 *   - Pure functions: shouldApplyIncomingMediaState, toIncomingMediaStateHint,
 *     toRemoteVisualSlotHintStatus, shouldClearSlotFromHint,
 *     resolveOutgoingCallMediaState, isSameOutgoingCallMediaState
 *
 * Does not own slot lifecycle, transceiver state, or any React hooks. Hint values
 * produced here are ADVISORY — actual slot lifecycle is owned by
 * useDirectCallRemoteMediaRuntime.
 */
import type {
  CallMediaActivity as WireCallMediaActivity,
  CallMediaSource as WireCallMediaSource,
  CallMediaState as WireCallMediaState,
  CallMediaStateReason as WireCallMediaStateReason,
} from "@seclettr/protocol";
import type { RemoteMediaSlotStatus } from "./call-media-slots";

export type CallMediaSource = WireCallMediaSource;
export type DirectCallVisualMediaSource = Extract<CallMediaSource, "camera" | "screen">;
export type CallMediaState = WireCallMediaState;
export type CallMediaStateReason = WireCallMediaStateReason;
export type CallMediaActivity = WireCallMediaActivity;

/**
 * Represents the last incoming media state for a specific source.
 * This is stored for debugging/observability purposes and to provide
 * hints to the remote media runtime about expected remote state.
 */
export interface LastIncomingMediaState {
  seq: number;
  streamRevision: number;
  state: CallMediaState;
  activity: CallMediaActivity;
  reason: CallMediaStateReason | null;
  mid: string | null;
}

/**
 * Hints derived from incoming media state signals.
 * These are ADVISORY and should NOT directly command slot status changes.
 * The actual slot lifecycle is owned by useDirectCallRemoteMediaRuntime.
 */
export interface IncomingMediaStateHint {
  /** Whether the peer signaled their intent to stop sending this source */
  signaledStopping: boolean;
  /** Whether the peer signaled they've ended this source permanently */
  signaledEnded: boolean;
  /** The peer's advertised activity level */
  activity: CallMediaActivity;
  /** The reason for state change if provided */
  reason: CallMediaStateReason | null;
  /** The MID the peer associated with this source */
  mid: string | null;
}

/**
 * Check if an incoming media state update should be applied based on
 * sequence number and stream revision ordering.
 * 
 * A newer message (higher seq) should be applied unless the revision
 * explicitly indicates an older state.
 */
export function shouldApplyIncomingMediaState(
  prevSeq: number,
  prevRevision: number,
  nextSeq: number,
  nextRevision?: number
): boolean {
  if (nextSeq <= prevSeq) {
    return false;
  }
  // Only reject if nextRevision is explicitly provided AND is less than prevRevision
  // Missing revision means we can't compare, so accept the sequence order
  if (nextRevision !== undefined && nextRevision < prevRevision) {
    return false;
  }
  return true;
}

/**
 * Convert incoming media state signal to a hint for the remote media runtime.
 * This is purely advisory - actual slot lifecycle is controlled by
 * useDirectCallRemoteMediaRuntime based on track events and telemetry.
 */
export function toIncomingMediaStateHint(params: {
  state: Extract<CallMediaState, "on" | "off" | "ended">;
  activity: CallMediaActivity;
  reason: CallMediaStateReason | null;
  mid: string | null;
}): IncomingMediaStateHint {
  return {
    signaledStopping: params.state === "off",
    signaledEnded: params.state === "ended",
    activity: params.activity,
    reason: params.reason,
    mid: params.mid,
  };
}

/**
 * Map track state to slot hint status.
 * This is used internally by the remote media runtime when processing
 * track events, NOT when processing signaling messages.
 */
export function toRemoteVisualSlotHintStatus(
  trackId: string | null,
  state: Extract<CallMediaState, "on" | "off" | "ended">
): RemoteMediaSlotStatus {
  if (state === "on") {
    return "starting";
  }
  if (!trackId) {
    return "inactive";
  }
  return "stopping";
}

/**
 * Determine if a slot should be cleared based on incoming hints.
 * This respects the hint layer principle: hints inform decisions but
 * don't directly command actions.
 * 
 * A slot should be cleared when:
 * 1. The peer has explicitly ended the source AND
 * 2. The track is already gone or ended
 * 
 * Returns true if the slot should transition to inactive/ended.
 */
export function shouldClearSlotFromHint(params: {
  slotHasTrack: boolean;
  trackEnded: boolean;
  hint: IncomingMediaStateHint;
}): boolean {
  // If the peer has explicitly ended this source
  if (params.hint.signaledEnded) {
    // Only clear if the track is actually gone
    return !params.slotHasTrack || params.trackEnded;
  }

  // If the peer signaled stopping but still has a track, wait for track events
  if (params.hint.signaledStopping && params.slotHasTrack && !params.trackEnded) {
    return false;
  }

  return false;
}

// ─── Outgoing media state ─────────────────────────────────────────────────────

export interface OutgoingCallMediaStateSnapshot {
  callId: string;
  source: CallMediaSource;
  state: CallMediaState;
  activity: CallMediaActivity;
  mid: string | null;
  trackId: string | null;
  reason: CallMediaStateReason | null;
}

export function resolveOutgoingCallMediaState(params: {
  source: CallMediaSource;
  track: Pick<MediaStreamTrack, "readyState" | "enabled"> | null;
  explicitState?: CallMediaState;
}): {
  state: CallMediaState;
  activity: CallMediaActivity;
} {
  if (params.explicitState) {
    return {
      state: params.explicitState,
      activity: params.explicitState === "on" && params.track?.readyState === "live" && params.track?.enabled
        ? "active"
        : "inactive",
    };
  }

  if (params.source === "mic") {
    return {
      state: params.track?.readyState === "live" && params.track?.enabled
        ? "on"
        : "muted",
      activity: params.track?.readyState === "live" && params.track?.enabled
        ? "active"
        : "inactive",
    };
  }

  if (!params.track) {
    return {
      state: "off",
      activity: "inactive",
    };
  }

  if (params.track.readyState !== "live") {
    return {
      state: "ended",
      activity: "inactive",
    };
  }

  if (!params.track.enabled) {
    return {
      state: "off",
      activity: "inactive",
    };
  }

  return {
    state: "on",
    activity: "active",
  };
}

export function isSameOutgoingCallMediaState(
  left: OutgoingCallMediaStateSnapshot | null,
  right: OutgoingCallMediaStateSnapshot
): boolean {
  if (!left) {
    return false;
  }
  return (
    left.callId === right.callId &&
    left.source === right.source &&
    left.state === right.state &&
    left.activity === right.activity &&
    left.mid === right.mid &&
    left.trackId === right.trackId &&
    left.reason === right.reason
  );
}
