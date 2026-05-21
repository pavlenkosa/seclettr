import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { resolveLegacyDirectCallMediaEncryptionOffer } from "@/calls/direct/model/call-media-encryption-negotiation";
import type {
  ActiveCall,
  CallType,
  IncomingCall,
  IncomingCallOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import { useMessagesStore } from "@/stores/messages";
import { usePlainMessagesStore } from "@/stores/plain";
import { logger } from "@/lib/logger.js";

/**
 * useDirectCallSignalOfferIngress owns inbound `call.offer` signal handling.
 *
 * It applies competing-offer guard rules, triggers late peer-label hydration,
 * shapes incoming-call state, and infers whether the related chat history should
 * be recorded against the plain or encrypted conversation store.
 *
 * It does not own WebSocket subscription, active-session answered/
 * renegotiation routing, or ICE/media-state ingress.
 */

function resolveInboundCallChatKind(callerUserId: string): "plain" | "e2ee" | null {
  const hasE2ee = !!useMessagesStore.getState().conversations[callerUserId];
  const hasPlain = !!usePlainMessagesStore.getState().conversations[callerUserId];
  if (hasPlain && !hasE2ee) return "plain";
  if (hasE2ee) return "e2ee";
  return null;
}

type EnsureConversationUsername = (
  userId: string,
  fallbackUsername?: string
) => Promise<string | null | undefined>;

interface UseDirectCallSignalOfferIngressOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  setIncoming: Dispatch<SetStateAction<IncomingCall | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  ensureConversationUsername: EnsureConversationUsername;
  resetMinimizedDockState: () => void;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
  callChatKindRef: MutableRefObject<"plain" | "e2ee" | null>;
  rejectIncomingCall: (callId: string) => void;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
}

export function useDirectCallSignalOfferIngress({
  activeRef,
  incomingRef,
  acceptingIncomingCallRef,
  setActive,
  setIncoming,
  setIsMinimized,
  ensureConversationUsername,
  resetMinimizedDockState,
  resolvePeerLabel,
  callChatKindRef,
  rejectIncomingCall,
  debugCallMedia,
}: UseDirectCallSignalOfferIngressOptions) {
  const handleIncomingOfferSignal = useCallback((message: IncomingCallOfferSignal) => {
    if (activeRef.current) {
      rejectIncomingCall(message.callId);
      return;
    }
    if (acceptingIncomingCallRef.current) {
      if (acceptingIncomingCallRef.current.callId !== message.callId) {
        rejectIncomingCall(message.callId);
      }
      return;
    }
    if (incomingRef.current && incomingRef.current.callId !== message.callId) {
      rejectIncomingCall(message.callId);
      return;
    }

    debugCallMedia("initial-offer-received", {
      callId: message.callId,
      callerUserId: message.callerUserId,
      supportsRenegotiationV1: !!message.features?.renegotiationV1,
    });

    ensureConversationUsername(message.callerUserId).then((resolvedLabel) => {
      if (!resolvedLabel) return;
      setIncoming((prev) => (
        prev?.callId === message.callId
          ? { ...prev, callerLabel: resolvedLabel }
          : prev
      ));
      setActive((prev) => (
        prev?.callId === message.callId
          ? { ...prev, peerLabel: resolvedLabel }
          : prev
      ));
    }).catch((err) => {
      logger.warn("[CALL] failed to resolve peer label for incoming call", err);
    });

    setIncoming({
      callId: message.callId,
      callerUserId: message.callerUserId,
      callerDeviceId: message.callerDeviceId ?? null,
      callerLabel: resolvePeerLabel(message.callerUserId),
      callType: message.callType as CallType,
      targetUserId: message.targetUserId ?? null,
      auth: message.auth,
      offerSdp: message.sdp,
      mediaEncryptionOffer: message.mediaEncryption ?? resolveLegacyDirectCallMediaEncryptionOffer(),
      supportsRenegotiationV1: !!message.features?.renegotiationV1,
    });
    callChatKindRef.current = resolveInboundCallChatKind(message.callerUserId);
    setIsMinimized(false);
    resetMinimizedDockState();
  }, [
    acceptingIncomingCallRef,
    activeRef,
    callChatKindRef,
    debugCallMedia,
    ensureConversationUsername,
    incomingRef,
    rejectIncomingCall,
    resetMinimizedDockState,
    resolvePeerLabel,
    setActive,
    setIncoming,
    setIsMinimized,
  ]);

  return {
    handleIncomingOfferSignal,
  };
}
