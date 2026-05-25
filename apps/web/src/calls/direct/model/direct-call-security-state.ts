/**
 * direct-call-security-state — security state mutation helpers for 1:1 calls.
 *
 * Owns:
 *   - applySignalVerificationToActiveCall — stamps the active call with a signal
 *     verification result (verified | invalid); resets e2eeActive while the code
 *     is being verified, marks verificationError when the result is "invalid"
 *   - applyMissingSecurityCodesToActiveCall — clears verification codes when the
 *     crypto bridge could not produce them (device key missing, key exchange failed)
 *   - applyComputedSecurityCodesToActiveCall — terminal state merge after the full
 *     applyCallSecurityState flow completes; sets e2eeActive, verificationCode,
 *     and verificationHash in one atomic update
 *
 * All functions are pure immutable updates to ActiveCall. Does not own WebSocket
 * dispatch, key derivation, or React hooks.
 */
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import type { ActiveCall } from "./direct-call-types";

type ComputedCallSecurityCodes = {
  shortCode: string;
  safetyHash: string;
};

export function applySignalVerificationToActiveCall(
  active: ActiveCall,
  result: CallSignalVerificationResult,
  invalidCodeMessage: string
): ActiveCall {
  return {
    ...active,
    signalingVerified: result.state === "verified",
    e2eeActive: false,
    verificationError: result.state === "invalid" ? invalidCodeMessage : active.verificationError,
  };
}

export function applyMissingSecurityCodesToActiveCall(
  active: ActiveCall,
  invalidCodeMessage: string
): ActiveCall {
  return {
    ...active,
    e2eeActive: false,
    verificationCode: null,
    verificationHash: null,
    verificationError: invalidCodeMessage,
  };
}

export function applyComputedSecurityCodesToActiveCall(
  active: ActiveCall,
  codes: ComputedCallSecurityCodes
): ActiveCall {
  return {
    ...active,
    e2eeActive: active.signalingVerified,
    verificationCode: codes.shortCode,
    verificationHash: codes.safetyHash,
    verificationError: active.signalingVerified ? null : active.verificationError,
  };
}
