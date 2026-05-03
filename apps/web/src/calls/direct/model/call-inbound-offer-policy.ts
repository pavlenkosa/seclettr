import type { CallSignalVerificationState } from "@/calls/direct/runtime/crypto/call-auth-material";
import type { CallSecurityMode } from "@/ui-settings";

export type InboundOfferPolicyDecision =
  | { allow: true; degraded: boolean }
  | { allow: false; reasonKey: string };

/**
 * Decides whether an inbound call offer may proceed based on its verification
 * state and the local security mode.
 *
 * Rules:
 *  - "invalid"    — auth was present but the signature/context did not match.
 *                   This is a security event (MITM, replay, SDP substitution).
 *                   Reject in every mode without exception.
 *  - "unverified" — auth fields were absent or the peer signing key is unknown
 *                   (legacy / unsigned offer from an older client).
 *                   strict:               reject.
 *                   balanced/compat:      allow with a degraded warning.
 *  - "verified"   — signature checks out. Allow unconditionally.
 */
export function resolveInboundOfferPolicy(
  verificationState: CallSignalVerificationState,
  securityMode: CallSecurityMode
): InboundOfferPolicyDecision {
  if (verificationState === "invalid") {
    return { allow: false, reasonKey: "call.error.unableVerifyCode" };
  }

  if (verificationState === "unverified") {
    if (securityMode === "strict") {
      return { allow: false, reasonKey: "call.error.unableVerifyCode" };
    }
    return { allow: true, degraded: true };
  }

  // "verified"
  return { allow: true, degraded: false };
}
