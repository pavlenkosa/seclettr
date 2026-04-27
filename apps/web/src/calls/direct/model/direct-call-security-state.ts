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
