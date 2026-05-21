/**
 * accept-call-offer-runtime owns inbound offer verification, policy gating,
 * and negotiated media-encryption selection for direct-call accept flow.
 *
 * It does not own peer-connection/media bootstrap, lifecycle teardown, or
 * answer dispatch.
 */

import { verifyIncomingCallOffer } from "@/calls/direct/runtime/crypto/call-auth-actions";
import { resolveInboundOfferPolicy } from "@/calls/direct/model/call-inbound-offer-policy";
import {
  negotiateDirectCallMediaEncryptionMode,
  resolvePreferredDirectCallMediaEncryptionMode,
  type DirectCallMediaEncryptionMode,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import type {
  IncomingCall,
  IncomingCallOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import { DIRECT_CALL_FEATURES } from "@/calls/direct/model/direct-call-types";
import type { DirectCallSetupRuntimeOptions } from "./direct-call-setup-shared";

type RejectInboundSetup = (params: {
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  callId: string;
  t: DirectCallSetupRuntimeOptions["t"];
  reasonKey?: string;
}) => void;

export interface PreparedInboundOfferAcceptance {
  offerVerification: Awaited<ReturnType<typeof verifyIncomingCallOffer>>;
  localSupportedMediaEncryptionModes: readonly DirectCallMediaEncryptionMode[];
  selectedMediaEncryptionMode: DirectCallMediaEncryptionMode;
}

interface PrepareInboundOfferAcceptanceOptions {
  currentIncoming: IncomingCall;
  callSecurityMode: DirectCallSetupRuntimeOptions["callSecurityMode"];
  resolveLocalSupportedMediaEncryptionModes: DirectCallSetupRuntimeOptions["resolveLocalSupportedMediaEncryptionModes"];
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  pushNotice: DirectCallSetupRuntimeOptions["pushNotice"];
  t: DirectCallSetupRuntimeOptions["t"];
  rejectInboundSetup: RejectInboundSetup;
}

function buildIncomingOfferSignal(currentIncoming: IncomingCall): IncomingCallOfferSignal {
  return {
    type: "call.offer",
    callId: currentIncoming.callId,
    callerUserId: currentIncoming.callerUserId,
    callerDeviceId: currentIncoming.callerDeviceId ?? undefined,
    targetUserId: currentIncoming.targetUserId ?? undefined,
    sdp: currentIncoming.offerSdp,
    callType: currentIncoming.callType,
    mediaEncryption: {
      preferredMode: currentIncoming.mediaEncryptionOffer.preferredMode,
      supportedModes: [...currentIncoming.mediaEncryptionOffer.supportedModes],
      // Must round-trip the ephemeral public key so the auth-proof
      // verification material matches what the caller signed.
      ephemeralPublicKey: currentIncoming.mediaEncryptionOffer.ephemeralPublicKey,
    },
    features: currentIncoming.supportsRenegotiationV1 ? DIRECT_CALL_FEATURES : undefined,
    auth: currentIncoming.auth,
  };
}

export async function prepareInboundOfferAcceptance({
  currentIncoming,
  callSecurityMode,
  resolveLocalSupportedMediaEncryptionModes,
  finishCallSession,
  pushNotice,
  t,
  rejectInboundSetup,
}: PrepareInboundOfferAcceptanceOptions): Promise<PreparedInboundOfferAcceptance | null> {
  const incomingOfferSignal = buildIncomingOfferSignal(currentIncoming);
  const offerVerification = await verifyIncomingCallOffer(incomingOfferSignal);

  const decision = resolveInboundOfferPolicy(
    offerVerification.state,
    callSecurityMode
  );
  if (!decision.allow) {
    rejectInboundSetup({
      finishCallSession,
      callId: currentIncoming.callId,
      t,
      reasonKey: decision.reasonKey,
    });
    return null;
  }

  if (decision.degraded) {
    pushNotice({ kind: "error", message: t("call.error.unableVerifyCode") });
  }

  const localSupportedMediaEncryptionModes = resolveLocalSupportedMediaEncryptionModes();
  const localPreferredMediaEncryptionMode = resolvePreferredDirectCallMediaEncryptionMode(
    callSecurityMode,
    localSupportedMediaEncryptionModes
  );
  const selectedMediaEncryptionMode = negotiateDirectCallMediaEncryptionMode(
    currentIncoming.mediaEncryptionOffer,
    localSupportedMediaEncryptionModes,
    { localPreferredMode: localPreferredMediaEncryptionMode }
  );

  if (!selectedMediaEncryptionMode) {
    rejectInboundSetup({
      finishCallSession,
      callId: currentIncoming.callId,
      t,
    });
    return null;
  }

  if (callSecurityMode === "strict" && selectedMediaEncryptionMode !== "frame-v1") {
    rejectInboundSetup({
      finishCallSession,
      callId: currentIncoming.callId,
      t,
    });
    return null;
  }

  return {
    offerVerification,
    localSupportedMediaEncryptionModes,
    selectedMediaEncryptionMode,
  };
}
