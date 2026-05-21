/**
 * accept-call-media-runtime owns the peer/media bootstrap stage of inbound
 * direct-call acceptance after offer verification has already succeeded.
 *
 * It does not own media-security fallback, ICE drain, or answer dispatch.
 */

import {
  DIRECT_CALL_SETUP_TIMEOUTS,
  withSetupStageTimeout,
} from "@/calls/direct/model/direct-call-setup-timeouts";
import type { ActiveCall, IncomingCall } from "@/calls/direct/model/direct-call-types";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { DirectCallSetupRuntimeOptions } from "./direct-call-setup-shared";
import { stopMediaStream } from "./call-setup-utils";

type EnsureCurrentLifecycle = (teardown: () => void) => void;

interface BootstrapAcceptedIncomingCallOptions {
  currentIncoming: IncomingCall;
  offerVerificationState: ActiveCall["signalingVerified"] extends boolean
    ? "verified" | "unverified" | "invalid"
    : never;
  resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode;
  acceptingIncomingCallRef: DirectCallSetupRuntimeOptions["acceptingIncomingCallRef"];
  peerConnectionRef: DirectCallSetupRuntimeOptions["peerConnectionRef"];
  commitActiveState: DirectCallSetupRuntimeOptions["commitActiveState"];
  setIsMinimized: DirectCallSetupRuntimeOptions["setIsMinimized"];
  clearNotice: DirectCallSetupRuntimeOptions["clearNotice"];
  createPeerConnection: DirectCallSetupRuntimeOptions["createPeerConnection"];
  ensureVideoSenders: DirectCallSetupRuntimeOptions["ensureVideoSenders"];
  requestLocalStream: DirectCallSetupRuntimeOptions["requestLocalStream"];
  attachLocalTracksToPeer: DirectCallSetupRuntimeOptions["attachLocalTracksToPeer"];
  syncVisualTransceiverBindings: DirectCallSetupRuntimeOptions["syncVisualTransceiverBindings"];
  syncVisualTransceiverDirections: DirectCallSetupRuntimeOptions["syncVisualTransceiverDirections"];
  syncOutgoingVisualMediaStateTrackBindings: DirectCallSetupRuntimeOptions["syncOutgoingVisualMediaStateTrackBindings"];
  refreshRemoteVideoTracksFromPeer: DirectCallSetupRuntimeOptions["refreshRemoteVideoTracksFromPeer"];
  debugCallMedia: DirectCallSetupRuntimeOptions["debugCallMedia"];
  ensureCurrentLifecycle: EnsureCurrentLifecycle;
}

export interface AcceptedIncomingCallBootstrapResult {
  pc: RTCPeerConnection;
  stream: MediaStream;
}

export async function bootstrapAcceptedIncomingCall({
  currentIncoming,
  offerVerificationState,
  resolvedMediaEncryptionMode,
  acceptingIncomingCallRef,
  peerConnectionRef,
  commitActiveState,
  setIsMinimized,
  clearNotice,
  createPeerConnection,
  ensureVideoSenders,
  requestLocalStream,
  attachLocalTracksToPeer,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  syncOutgoingVisualMediaStateTrackBindings,
  refreshRemoteVideoTracksFromPeer,
  debugCallMedia,
  ensureCurrentLifecycle,
}: BootstrapAcceptedIncomingCallOptions): Promise<AcceptedIncomingCallBootstrapResult> {
  const {
    callId,
    callerUserId,
    callerLabel,
    callType,
    offerSdp,
    callerDeviceId,
    supportsRenegotiationV1,
  } = currentIncoming;

  clearNotice();
  setIsMinimized(false);
  commitActiveState({
    callId,
    peerUserId: callerUserId,
    peerDeviceId: callerDeviceId ?? null,
    peerLabel: callerLabel,
    callType,
    direction: "inbound",
    state: "connecting",
    muted: false,
    videoOff: callType !== "video",
    screenSharing: false,
    duration: 0,
    signalingVerified: offerVerificationState === "verified",
    e2eeActive: false,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: resolvedMediaEncryptionMode,
    peerSupportsRenegotiationV1: supportsRenegotiationV1,
  });
  acceptingIncomingCallRef.current = null;

  const pc = await createPeerConnection(callId);
  ensureCurrentLifecycle(() => { pc.close(); });
  peerConnectionRef.current = pc;

  await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
  ensureCurrentLifecycle(() => { pc.close(); });
  ensureVideoSenders(pc);
  syncVisualTransceiverBindings();
  refreshRemoteVideoTracksFromPeer(callId, "initial-offer-remote-description");
  debugCallMedia("remote-description-set", {
    callId,
    kind: "initial-offer",
    supportsRenegotiationV1,
  });

  const stream = await withSetupStageTimeout(
    requestLocalStream({ withVideo: callType === "video" }),
    DIRECT_CALL_SETUP_TIMEOUTS.localMediaMs,
    "local-media"
  );
  ensureCurrentLifecycle(() => {
    stopMediaStream(stream);
    pc.close();
  });
  await attachLocalTracksToPeer(pc, stream);
  ensureCurrentLifecycle(() => {
    stopMediaStream(stream);
    pc.close();
  });
  syncOutgoingVisualMediaStateTrackBindings(callId);
  refreshRemoteVideoTracksFromPeer(callId, "initial-answer-local-tracks");
  syncVisualTransceiverDirections(callId);

  return { pc, stream };
}
