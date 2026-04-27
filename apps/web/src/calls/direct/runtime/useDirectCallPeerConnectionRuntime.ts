/**
 * useDirectCallPeerConnectionRuntime — RTCPeerConnection factory and event handler.
 *
 * Owns createPeerConnection(), which:
 *   - Fetches TURN credentials and builds the RTCConfiguration
 *   - Wires all PeerConnection event handlers (icecandidate, iceconnectionstatechange,
 *     connectionstatechange, negotiationneeded, track)
 *   - Manages disconnect/reconnect grace timer (disconnectResetTimerRef)
 *   - Triggers ICE restart or call reset on persistent disconnection
 *
 * Side effects: fires enqueueOutgoingIceCandidate, flushOutgoingIceBatch,
 * sendRenegotiationOffer (via ref), ingestRemoteReceiverTrack, and setActiveIfCurrent.
 * Does NOT own the PeerConnection reference — peerConnectionRef is set by the caller.
 */
import { useCallback, type MutableRefObject } from "react";
import {
  resolveDirectCallDurationSeconds,
  shouldAttemptDirectCallIceRestart,
  shouldResetDirectCallAfterDisconnectGrace,
} from "@/calls/direct/model/direct-call-lifecycle";
import {
  DISCONNECT_RESET_GRACE_MS,
  type ActiveCall,
  type CallNotice,
} from "@/calls/direct/model/direct-call-types";
import { logger } from "@/lib/logger.js";

type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;

interface TurnCredentials {
  username: string;
  password: string;
  uris: string[];
}

interface UseDirectCallPeerConnectionRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  disconnectResetTimerRef: MutableRefObject<number | null>;
  disconnectRecoveryAttemptedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  sendRenegotiationOfferRef: MutableRefObject<((callId: string, reason: string) => Promise<void>) | null>;
  flushPendingRenegotiationOfferRef: MutableRefObject<((callId: string, trigger: string) => Promise<void>) | null>;
  getTurnCredentials: () => Promise<TurnCredentials>;
  enqueueOutgoingIceCandidate: (callId: string, candidateJson: string) => void;
  flushOutgoingIceBatch: (callId: string) => void;
  ingestRemoteReceiverTrack: (
    callId: string,
    receiver: RTCRtpReceiver,
    transceiver?: RTCRtpTransceiver | null
  ) => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  setActiveIfCurrent: (
    callId: string,
    update: (current: ActiveCall) => ActiveCall
  ) => void;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  t: Translate;
}

export function useDirectCallPeerConnectionRuntime({
  activeRef,
  disconnectResetTimerRef,
  disconnectRecoveryAttemptedRef,
  negotiationReadyRef,
  renegotiationUnsupportedRef,
  sendRenegotiationOfferRef,
  flushPendingRenegotiationOfferRef,
  getTurnCredentials,
  enqueueOutgoingIceCandidate,
  flushOutgoingIceBatch,
  ingestRemoteReceiverTrack,
  isCurrentActiveCallContext,
  setActiveIfCurrent,
  resetCallStateIfCurrent,
  debugCallMedia,
  t,
}: UseDirectCallPeerConnectionRuntimeOptions) {
  const createPeerConnection = useCallback(async (callId: string): Promise<RTCPeerConnection> => {
    const creds = await getTurnCredentials();
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: creds.uris,
          username: creds.username,
          credential: creds.password,
        },
      ],
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    const cancelDisconnectReset = () => {
      if (!disconnectResetTimerRef.current) {
        return;
      }
      clearTimeout(disconnectResetTimerRef.current);
      disconnectResetTimerRef.current = null;
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        flushOutgoingIceBatch(callId);
        return;
      }
      enqueueOutgoingIceCandidate(callId, JSON.stringify(candidate.toJSON()));
    };

    pc.ontrack = (event) => {
      ingestRemoteReceiverTrack(callId, event.receiver, event.transceiver);
    };

    pc.onconnectionstatechange = () => {
      debugCallMedia("pc-connection-state", {
        callId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      });
      if (!isCurrentActiveCallContext(callId, pc)) {
        cancelDisconnectReset();
        return;
      }
      if (pc.connectionState === "connected") {
        cancelDisconnectReset();
        disconnectRecoveryAttemptedRef.current = false;
        const nowMs = Date.now();
        setActiveIfCurrent(callId, (prev) => ({
          ...prev,
          state: "active",
          durationStartedAtMs: prev.durationStartedAtMs ?? nowMs,
        }));
        return;
      }

      if (pc.connectionState === "connecting") {
        cancelDisconnectReset();
        const nowMs = Date.now();
        setActiveIfCurrent(callId, (prev) => ({
          ...prev,
          state: "connecting",
          duration: resolveDirectCallDurationSeconds(prev, nowMs),
          durationStartedAtMs: null,
        }));
        return;
      }

      if (pc.connectionState === "failed") {
        cancelDisconnectReset();
        resetCallStateIfCurrent(callId, {
          notice: { kind: "error", message: t("call.notice.connectionFailed") },
        }, pc);
        return;
      }

      if (pc.connectionState === "closed") {
        cancelDisconnectReset();
        resetCallStateIfCurrent(callId, {
          notice: { kind: "info", message: t("call.notice.ended") },
        }, pc);
        return;
      }

      if (pc.connectionState !== "disconnected") {
        return;
      }

      cancelDisconnectReset();
      const currentActive = activeRef.current;
      const shouldAttemptRecovery = shouldAttemptDirectCallIceRestart({
        connectionState: pc.connectionState,
        negotiationReady: negotiationReadyRef.current,
        renegotiationUnsupported: renegotiationUnsupportedRef.current,
        hasPeerTarget: Boolean(currentActive?.peerUserId && currentActive?.peerDeviceId),
        hasAttemptedIceRestart: disconnectRecoveryAttemptedRef.current,
      });
      if (shouldAttemptRecovery) {
        disconnectRecoveryAttemptedRef.current = true;
        setActiveIfCurrent(callId, (prev) => ({ ...prev, state: "connecting" }));
        try {
          pc.restartIce();
          debugCallMedia("pc-ice-restart-requested", {
            callId,
            reason: "disconnect-recovery",
            signalingState: pc.signalingState,
          });
          sendRenegotiationOfferRef.current?.(callId, "disconnect-recovery");
        } catch (error) {
          logger.warn("[CALL] failed to request ICE restart for disconnect recovery", error);
        }
      }
      disconnectResetTimerRef.current = globalThis.window.setTimeout(() => {
        if (!isCurrentActiveCallContext(callId, pc)) {
          return;
        }
        if (!shouldResetDirectCallAfterDisconnectGrace(pc.connectionState)) {
          return;
        }
        resetCallStateIfCurrent(callId, {
          notice: { kind: "info", message: t("call.notice.ended") },
        }, pc);
      }, DISCONNECT_RESET_GRACE_MS);
    };

    pc.oniceconnectionstatechange = () => {
      debugCallMedia("pc-ice-state", {
        callId,
        iceConnectionState: pc.iceConnectionState,
      });
    };

    pc.onsignalingstatechange = () => {
      debugCallMedia("pc-signaling-state", {
        callId,
        signalingState: pc.signalingState,
      });
      if (!isCurrentActiveCallContext(callId, pc)) {
        return;
      }
      if (pc.signalingState === "stable") {
        flushPendingRenegotiationOfferRef.current?.(callId, "signaling-stable");
      }
    };

    pc.onicegatheringstatechange = () => {
      debugCallMedia("pc-ice-gathering-state", {
        callId,
        iceGatheringState: pc.iceGatheringState,
      });
    };

    pc.onnegotiationneeded = () => {
      debugCallMedia("negotiationneeded-fired", {
        callId,
        negotiationReady: negotiationReadyRef.current,
        renegotiationUnsupportedConfirmed: renegotiationUnsupportedRef.current,
        signalingState: pc.signalingState,
      });
      if (!isCurrentActiveCallContext(callId, pc)) {
        return;
      }
      if (!negotiationReadyRef.current || renegotiationUnsupportedRef.current) {
        return;
      }
      sendRenegotiationOfferRef.current?.(callId, "negotiationneeded");
    };

    return pc;
  }, [
    activeRef,
    debugCallMedia,
    disconnectRecoveryAttemptedRef,
    disconnectResetTimerRef,
    enqueueOutgoingIceCandidate,
    flushOutgoingIceBatch,
    flushPendingRenegotiationOfferRef,
    getTurnCredentials,
    ingestRemoteReceiverTrack,
    isCurrentActiveCallContext,
    negotiationReadyRef,
    renegotiationUnsupportedRef,
    resetCallStateIfCurrent,
    sendRenegotiationOfferRef,
    setActiveIfCurrent,
    t,
  ]);

  return {
    createPeerConnection,
  };
}
