/**
 * call-lifecycle-contract — shared lifecycle phase definitions for all call types.
 *
 * Owns:
 *   - SharedCallLifecyclePhase — 8-phase enum used by both direct and group call lifecycle mappers
 *   - SharedCallUnloadPolicy — "none" | "leave-participant" | "end-owned-session"
 *   - SharedCallLifecycleDefinition — per-phase metadata record
 *   - SHARED_CALL_LIFECYCLE_CONTRACT — canonical definitions table (description, unloadPolicy,
 *     allowsMediaMutation, allowsRetry) for all 8 phases
 *   - canMutateCallMedia — guard predicate for the allowsMediaMutation flag
 *   - canRetryCallLifecycle — guard predicate for the allowsRetry flag
 *
 * Does not own call-type-specific state machines (see group-call-lifecycle.ts or direct equivalents).
 * This contract is purely descriptive; enforcement is each call type's responsibility.
 */
export type SharedCallLifecyclePhase =
  | "idle"
  | "inviting"
  | "joining"
  | "live"
  | "reconnecting"
  | "leaving"
  | "ended"
  | "failed";

export type SharedCallUnloadPolicy =
  | "none"
  | "leave-participant"
  | "end-owned-session";

export interface SharedCallLifecycleDefinition {
  description: string;
  unloadPolicy: SharedCallUnloadPolicy;
  allowsMediaMutation: boolean;
  allowsRetry: boolean;
}

const SHARED_CALL_LIFECYCLE_CONTRACT: Record<
  SharedCallLifecyclePhase,
  SharedCallLifecycleDefinition
> = {
  idle: {
    description: "No local call session is open.",
    unloadPolicy: "none",
    allowsMediaMutation: false,
    allowsRetry: false,
  },
  inviting: {
    description: "A direct invite is ringing or an incoming invite is waiting for user choice.",
    unloadPolicy: "end-owned-session",
    allowsMediaMutation: false,
    allowsRetry: false,
  },
  joining: {
    description: "Local media, auth, or transport setup is in progress.",
    unloadPolicy: "leave-participant",
    allowsMediaMutation: false,
    allowsRetry: false,
  },
  live: {
    description: "The call is joined and media/signaling are usable.",
    unloadPolicy: "leave-participant",
    allowsMediaMutation: true,
    allowsRetry: false,
  },
  reconnecting: {
    description: "A previously live call is recovering signaling or media transport.",
    unloadPolicy: "leave-participant",
    allowsMediaMutation: false,
    allowsRetry: true,
  },
  leaving: {
    description: "Local teardown has started and should be idempotent.",
    unloadPolicy: "leave-participant",
    allowsMediaMutation: false,
    allowsRetry: false,
  },
  ended: {
    description: "The call reached a terminal non-error state.",
    unloadPolicy: "none",
    allowsMediaMutation: false,
    allowsRetry: false,
  },
  failed: {
    description: "The call reached a terminal or user-recoverable error state.",
    unloadPolicy: "none",
    allowsMediaMutation: false,
    allowsRetry: true,
  },
};

export function canMutateCallMedia(phase: SharedCallLifecyclePhase): boolean {
  return SHARED_CALL_LIFECYCLE_CONTRACT[phase].allowsMediaMutation;
}

export function canRetryCallLifecycle(phase: SharedCallLifecyclePhase): boolean {
  return SHARED_CALL_LIFECYCLE_CONTRACT[phase].allowsRetry;
}
