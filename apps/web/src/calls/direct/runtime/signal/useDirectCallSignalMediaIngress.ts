import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { useAuthStore } from "@/stores/auth";
import {
  shouldApplyIncomingMediaState,
  toIncomingMediaStateHint,
  type CallMediaSource,
  type IncomingMediaStateHint,
  type LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import type { ActiveCall, IncomingCall, IncomingCallMediaStateSignal } from "@/calls/direct/model/direct-call-types";
import type { RemoteMediaSlot } from "@/calls/direct/model/call-media-slots";
import { logger } from "@/lib/logger.js";

/**
 * useDirectCallSignalMediaIngress owns direct-call media-related signal ingress.
 *
 * It stages inbound ICE candidates across accept-transition vs active-session
 * queues, validates incoming media-state ordering, and forwards advisory visual
 * media hints to the remote-media runtime.
 *
 * It does not own WebSocket subscription, active-session answered/
 * renegotiation routing, or inbound offer projection.
 */
interface UseDirectCallSignalMediaIngressOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  ignoreOfferRef: MutableRefObject<boolean>;
  remoteMediaStateSeqRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  lastIncomingMediaStateRef: MutableRefObject<Record<CallMediaSource, LastIncomingMediaState | null>>;
  remoteCameraSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteScreenSlotRef: MutableRefObject<RemoteMediaSlot>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  processIncomingMediaStateHint: (
    source: "camera" | "screen",
    hint: IncomingMediaStateHint,
    trackId: string | null,
    trackEnded: boolean
  ) => void;
}

export function useDirectCallSignalMediaIngress({
  activeRef,
  incomingRef,
  acceptingIncomingCallRef,
  peerConnectionRef,
  incomingIceCandidatesRef,
  pendingIceCandidatesRef,
  ignoreOfferRef,
  remoteMediaStateSeqRef,
  remoteMediaStateRevisionRef,
  lastIncomingMediaStateRef,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  debugCallMedia,
  shouldIgnoreUnexpectedPeerSignal,
  processIncomingMediaStateHint,
}: UseDirectCallSignalMediaIngressOptions) {
  const applyIncomingIceCandidate = useCallback((callId: string, candidate: RTCIceCandidateInit) => {
    const currentActive = activeRef.current;
    if (currentActive?.callId !== callId) {
      if (
        incomingRef.current?.callId === callId ||
        acceptingIncomingCallRef.current?.callId === callId
      ) {
        const queued = incomingIceCandidatesRef.current.get(callId) ?? [];
        queued.push(candidate);
        incomingIceCandidatesRef.current.set(callId, queued);
      }
      return;
    }

    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (!pc.remoteDescription) {
      const queued = pendingIceCandidatesRef.current.get(callId) ?? [];
      queued.push(candidate);
      pendingIceCandidatesRef.current.set(callId, queued);
      return;
    }

    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
      if (ignoreOfferRef.current) {
        debugCallMedia("ice-candidate-ignored", {
          callId,
          reason: "ignored-offer-collision",
        });
        return;
      }
      logger.warn("[CALL] failed to add ICE candidate", error);
    });
  }, [
    acceptingIncomingCallRef,
    activeRef,
    debugCallMedia,
    ignoreOfferRef,
    incomingIceCandidatesRef,
    incomingRef,
    pendingIceCandidatesRef,
    peerConnectionRef,
  ]);

  const applyIncomingCallMediaState = useCallback((message: IncomingCallMediaStateSignal) => {
    const currentActive = activeRef.current;
    if (currentActive?.callId !== message.callId) return;
    if (shouldIgnoreUnexpectedPeerSignal({
      callId: message.callId,
      signalType: "call.media_state",
      senderUserId: message.senderUserId ?? null,
      senderDeviceId: message.senderDeviceId ?? null,
      source: message.source,
    })) {
      return;
    }

    const localDeviceId = useAuthStore.getState().deviceId;
    if (localDeviceId && message.senderDeviceId === localDeviceId) return;

    const prevSeq = remoteMediaStateSeqRef.current[message.source];
    const prevRevision = remoteMediaStateRevisionRef.current[message.source];
    if (!shouldApplyIncomingMediaState(prevSeq, prevRevision, message.seq, message.streamRevision)) {
      return;
    }
    remoteMediaStateSeqRef.current[message.source] = message.seq;
    remoteMediaStateRevisionRef.current[message.source] = message.streamRevision ?? prevRevision;
    lastIncomingMediaStateRef.current[message.source] = {
      seq: message.seq,
      streamRevision: message.streamRevision ?? prevRevision,
      state: message.state,
      activity: message.activity,
      reason: message.reason ?? null,
      mid: message.mid ?? null,
    };
    debugCallMedia("media-state-in", {
      callId: message.callId,
      source: message.source,
      state: message.state,
      activity: message.activity,
      mid: message.mid ?? null,
      seq: message.seq,
      streamRevision: message.streamRevision ?? prevRevision,
      reason: message.reason ?? null,
    });

    if (message.source === "mic") {
      return;
    }

    const hint = toIncomingMediaStateHint({
      state: message.state === "ended" ? "ended" : message.state === "off" ? "off" : "on",
      activity: message.activity,
      reason: message.reason ?? null,
      mid: message.mid ?? null,
    });

    const slotRef = message.source === "camera" ? remoteCameraSlotRef : remoteScreenSlotRef;
    const currentSlot = slotRef.current;
    const currentTrack = currentSlot.stream?.getVideoTracks()[0] ?? null;
    const trackEnded = currentTrack ? currentTrack.readyState !== "live" : true;

    processIncomingMediaStateHint(message.source, hint, currentSlot.trackId, trackEnded);
  }, [
    activeRef,
    debugCallMedia,
    lastIncomingMediaStateRef,
    processIncomingMediaStateHint,
    remoteCameraSlotRef,
    remoteMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteScreenSlotRef,
    shouldIgnoreUnexpectedPeerSignal,
  ]);

  return {
    applyIncomingIceCandidate,
    applyIncomingCallMediaState,
  };
}
