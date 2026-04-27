import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  ActiveCall,
  CallNotice,
  CallType,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import type { DirectCallErrorSignal } from "@/calls/direct/runtime/direct-call-signal-dispatch";
import { resolveDirectCallDurationSeconds } from "@/calls/direct/model/direct-call-lifecycle";
import { logger } from "@/lib/logger.js";
import { type DirectCallFinishSession } from "./direct-call-runtime-types";

type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;

type CallEventOutcome = "ended" | "declined" | "missed";

type RecordCallEvent = (params: {
  userId: string;
  fallbackLabel?: string;
  mode: CallType;
  direction: "inbound" | "outbound";
  outcome: CallEventOutcome;
  durationSec?: number;
}) => void;

type PushNotice = (next: CallNotice, timeoutMs?: number) => void;

type DebugCallMedia = (event: string, payload: Record<string, unknown>) => void;

type UseDirectCallSignalOutcomeHandlersOptions = {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  finishCallSession: DirectCallFinishSession;
  pushNotice: PushNotice;
  recordCallEvent: RecordCallEvent;
  debugCallMedia: DebugCallMedia;
  t: Translate;
};

const UNSUPPORTED_RENEGOTIATION_MESSAGE =
  "Peer does not support in-call video/screen renegotiation. Reload both tabs.";
const EXPIRED_CALL_AUTH_REASONS = new Set([
  "invalid_signed_at",
  "signed_at_in_future",
  "signed_at_expired",
]);

function resolveInvalidCallAuthNoticeKey(params: {
  signalingReason?: string | null;
  pendingRenegotiationReason?: string | null;
}): string {
  if (params.pendingRenegotiationReason?.startsWith("screen-")) {
    return "call.notice.invalidCallAuthScreenShare";
  }
  if (params.signalingReason === "replayed_call_auth") {
    return "call.notice.invalidCallAuthReplay";
  }
  if (params.signalingReason === "context_mismatch") {
    return "call.notice.invalidCallAuthContext";
  }
  if (
    params.signalingReason &&
    EXPIRED_CALL_AUTH_REASONS.has(params.signalingReason)
  ) {
    return "call.notice.invalidCallAuthExpired";
  }
  return "call.notice.invalidCallAuth";
}

export function useDirectCallSignalOutcomeHandlers({
  activeRef,
  incomingRef,
  acceptingIncomingCallRef,
  renegotiationUnsupportedRef,
  supportsPeerRenegotiationV1Ref,
  lastSignalingErrorRef,
  lastRenegotiationAttemptRef,
  setActive,
  finishCallSession,
  pushNotice,
  recordCallEvent,
  debugCallMedia,
  t,
}: UseDirectCallSignalOutcomeHandlersOptions) {
  const handleIncomingHangupSignal = useCallback((callId: string) => {
    if (activeRef.current?.callId === callId) {
      const currentActive = activeRef.current;
      finishCallSession({
        reason: "remote-hangup",
        callId,
        notice: { kind: "info", message: t("call.notice.ended") },
        onBeforeReset: () => {
          if (!currentActive) {
            return;
          }
          recordCallEvent({
            userId: currentActive.peerUserId,
            fallbackLabel: currentActive.peerLabel,
            mode: currentActive.callType,
            direction: currentActive.direction,
            outcome: "ended",
            durationSec: resolveDirectCallDurationSeconds(currentActive),
          });
        },
      });
      return;
    }

    if (acceptingIncomingCallRef.current?.callId === callId) {
      finishCallSession({
        reason: "incoming-cancelled",
        callId,
        notice: { kind: "info", message: t("call.notice.incomingCancelled") },
      });
      return;
    }

    if (incomingRef.current?.callId === callId) {
      const currentIncoming = incomingRef.current;
      finishCallSession({
        reason: "incoming-cancelled",
        callId,
        notice: { kind: "info", message: t("call.notice.incomingCancelled") },
        onBeforeReset: () => {
          if (!currentIncoming) {
            return;
          }
          recordCallEvent({
            userId: currentIncoming.callerUserId,
            fallbackLabel: currentIncoming.callerLabel,
            mode: currentIncoming.callType,
            direction: "inbound",
            outcome: "missed",
          });
        },
      });
    }
  }, [
    acceptingIncomingCallRef,
    activeRef,
    incomingRef,
    recordCallEvent,
    t,
    finishCallSession,
  ]);

  const handleCallErrorSignal = useCallback((message: DirectCallErrorSignal) => {
    const lastRenegotiationAttempt = lastRenegotiationAttemptRef.current;
    const currentActive = activeRef.current;
    const errorPayload = {
      code: message.code,
      message: message.message,
      reason: message.reason ?? null,
      activeCallId: currentActive?.callId ?? null,
      activeScreenSharing: currentActive?.screenSharing ?? null,
      pendingRenegotiationReason:
        typeof lastRenegotiationAttempt?.reason === "string"
          ? lastRenegotiationAttempt.reason
          : null,
      pendingRenegotiationStage:
        typeof lastRenegotiationAttempt?.stage === "string"
          ? lastRenegotiationAttempt.stage
          : null,
      pendingRenegotiationRevision:
        typeof lastRenegotiationAttempt?.revision === "number"
          ? lastRenegotiationAttempt.revision
          : null,
    };
    lastSignalingErrorRef.current = {
      ...errorPayload,
      at: new Date().toISOString(),
    };
    debugCallMedia("ws-error", errorPayload);

    if (message.code === "INVALID_CALL_AUTH") {
      if (import.meta.env.DEV) {
        logger.warn("[CALL] signaling auth rejected", errorPayload);
      }
      const pendingReason =
        typeof lastRenegotiationAttempt?.reason === "string"
          ? lastRenegotiationAttempt.reason
          : null;
      const noticeMessage = t(
        resolveInvalidCallAuthNoticeKey({
          signalingReason: message.reason ?? null,
          pendingRenegotiationReason: pendingReason,
        })
      );
      // If the initial offer was rejected (caller still in pre-answer state),
      // the call will never connect — reset so the user can try again.
      const isPreAnswer = currentActive?.state === "ringing";
      if (isPreAnswer) {
        finishCallSession({
          reason: "invalid-call-auth",
          authority: "hangup",
          callId: currentActive?.callId ?? null,
          notice: { kind: "error", message: noticeMessage },
        });
      } else {
        pushNotice({ kind: "error", message: noticeMessage });
      }
      return;
    }

    if (message.code === "CALL_RENEGOTIATION_UNSUPPORTED") {
      renegotiationUnsupportedRef.current = true;
      supportsPeerRenegotiationV1Ref.current = false;
      setActive((prev) => {
        const next = prev
          ? { ...prev, peerSupportsRenegotiationV1: false }
          : prev;
        activeRef.current = next;
        return next;
      });
      pushNotice({
        kind: "info",
        message: UNSUPPORTED_RENEGOTIATION_MESSAGE,
      });
    }
  }, [
    activeRef,
    debugCallMedia,
    finishCallSession,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    pushNotice,
    renegotiationUnsupportedRef,
    setActive,
    supportsPeerRenegotiationV1Ref,
    t,
  ]);

  const handleCallRejectedSignal = useCallback((callId: string) => {
    if (acceptingIncomingCallRef.current?.callId === callId) {
      finishCallSession({
        reason: "remote-reject",
        callId,
        notice: { kind: "info", message: t("call.notice.declined") },
      });
      return;
    }
    if (activeRef.current?.callId !== callId) {
      return;
    }
    const currentActive = activeRef.current;
    finishCallSession({
      reason: "remote-reject",
      callId,
      notice: { kind: "info", message: t("call.notice.declined") },
      onBeforeReset: () => {
        if (!currentActive) {
          return;
        }
        recordCallEvent({
          userId: currentActive.peerUserId,
          fallbackLabel: currentActive.peerLabel,
          mode: currentActive.callType,
          direction: currentActive.direction,
          outcome: "declined",
        });
      },
    });
  }, [
    acceptingIncomingCallRef,
    activeRef,
    finishCallSession,
    recordCallEvent,
    t,
  ]);

  return {
    handleIncomingHangupSignal,
    handleCallErrorSignal,
    handleCallRejectedSignal,
  };
}
