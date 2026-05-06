import type { FastifyInstance } from "fastify";
import type {
  CallMediaEncryptionAnswer,
  CallMediaEncryptionOffer,
  DirectCallFeatures,
  WsClientMessage,
  WsServerMessage,
} from "@seclettr/protocol";
import { query } from "../db/pool.js";
import type {
  CallSession,
  CallSessionStore,
  DirectCallLifecycleStatus,
  DirectCallLifecycleManager,
} from "./call-routing-state.js";
export {
  createDirectCallLifecycleManager,
  type CallSession,
  type CallSessionStore,
} from "./call-routing-state.js";
import {
  describeCallAuthFailure,
  verifyServerAnswerCallAuthProofDetailed,
  verifyServerOfferCallAuthProofDetailed,
  verifyServerRenegotiationCallAuthProofDetailed,
  type CallAuthVerificationReason,
} from "./call-auth.js";
import { claimCallAuthProofReplay } from "./call-auth-replay.js";

export interface DirectCallWsClient {
  userId: string;
  deviceId: string;
}

interface CreateDirectCallSignalRouterOptions {
  callSessionStore: CallSessionStore;
  directCallLifecycleManager: DirectCallLifecycleManager;
  hasActiveConnectionForDevice: (deviceId: string) => boolean;
  loadUserDeviceIds: (userId: string) => Promise<string[]>;
  routeToDevice: (deviceId: string, msg: WsServerMessage) => Promise<void>;
  routeToDevices: (deviceIds: string[], msg: WsServerMessage) => Promise<void>;
  disconnectGraceMs?: number;
}

type CallOfferMessage = Extract<WsClientMessage, { type: "call.offer" }>;
type CallAnswerMessage = Extract<WsClientMessage, { type: "call.answer" }>;
type CallRenegotiationOfferMessage = Extract<
  WsClientMessage,
  { type: "call.renegotiate.offer" }
>;
type CallRenegotiationAnswerMessage = Extract<
  WsClientMessage,
  { type: "call.renegotiate.answer" }
>;
type CallMediaStateMessage = Extract<
  WsClientMessage,
  { type: "call.media_state" }
>;
type CallOfferMessageCompat = CallOfferMessage & {
  mediaEncryption?: CallMediaEncryptionOffer;
  features?: DirectCallFeatures;
};
type CallAnswerMessageCompat = CallAnswerMessage & {
  mediaEncryption?: CallMediaEncryptionAnswer;
  features?: DirectCallFeatures;
};
type DirectCallRenegotiationMessage =
  | CallRenegotiationOfferMessage
  | CallRenegotiationAnswerMessage;
type ServerCallOfferMessage = Extract<
  WsServerMessage,
  { type: "call.offer" }
> & {
  mediaEncryption?: CallMediaEncryptionOffer;
  features?: DirectCallFeatures;
};
type ServerCallAnsweredMessage = Extract<
  WsServerMessage,
  { type: "call.answered" }
> & {
  mediaEncryption?: CallMediaEncryptionAnswer;
  features?: DirectCallFeatures;
};
type ServerCallRenegotiationOfferMessage = Extract<
  WsServerMessage,
  { type: "call.renegotiate.offer" }
>;
type ServerCallRenegotiationAnswerMessage = Extract<
  WsServerMessage,
  { type: "call.renegotiate.answer" }
>;
type ServerCallMediaStateMessage = Extract<
  WsServerMessage,
  { type: "call.media_state" }
>;
type CallSignalAuth = NonNullable<CallOfferMessage["auth"]>;
type InvalidCallAuthReason =
  | CallAuthVerificationReason
  | "replayed_call_auth";
type RenegotiationAuthKind = "renegotiate-offer" | "renegotiate-answer";

const DEFAULT_DIRECT_CALL_DISCONNECT_GRACE_MS = 10_000;

function isCallerSignal(senderDeviceId: string, session: CallSession): boolean {
  return senderDeviceId === session.callerDeviceId;
}

export function supportsRenegotiationV1(session: CallSession): boolean {
  return (
    session.callerSupportsRenegotiationV1 === true &&
    session.calleeSupportsRenegotiationV1 === true
  );
}

function isEstablishedDirectCallParticipant(
  senderDeviceId: string,
  session: CallSession
): boolean {
  return (
    senderDeviceId === session.callerDeviceId ||
    senderDeviceId === session.calleeDeviceId
  );
}

export function isAllowedDirectCallCalleeSignalSender(
  senderUserId: string,
  senderDeviceId: string,
  session: CallSession,
  options?: { allowPendingTargets?: boolean }
): boolean {
  if (senderUserId !== session.calleeUserId) {
    return false;
  }

  if (session.calleeDeviceId) {
    return senderDeviceId === session.calleeDeviceId;
  }

  return (
    options?.allowPendingTargets === true &&
    session.calleeDeviceIds.includes(senderDeviceId)
  );
}

export function buildIcePayload(
  msg: WsClientMessage & { callId: string }
): WsServerMessage | null {
  if (msg.type === "call.ice.batch") {
    return {
      type: "call.ice.batch",
      callId: msg.callId,
      candidates: msg.candidates,
    };
  }
  if (msg.type === "call.ice") {
    return {
      type: "call.ice",
      callId: msg.callId,
      candidate: msg.candidate,
    };
  }
  return null;
}

function getRenegotiationAuthKind(
  msg: DirectCallRenegotiationMessage
): RenegotiationAuthKind {
  return msg.type === "call.renegotiate.offer"
    ? "renegotiate-offer"
    : "renegotiate-answer";
}

function getRenegotiationRecipientUserId(
  targetDeviceId: string,
  session: CallSession
): string {
  return targetDeviceId === session.callerDeviceId
    ? session.callerUserId
    : session.calleeUserId;
}

function markRenegotiationSupportAdvertised(
  session: CallSession,
  senderDeviceId: string
): CallSession {
  const updatedSession: CallSession = { ...session };
  if (
    senderDeviceId === session.callerDeviceId ||
    session.callerSupportsRenegotiationV1 === true
  ) {
    updatedSession.callerSupportsRenegotiationV1 = true;
  }
  if (
    senderDeviceId === session.calleeDeviceId ||
    session.calleeSupportsRenegotiationV1 === true
  ) {
    updatedSession.calleeSupportsRenegotiationV1 = true;
  }
  return updatedSession;
}

function buildServerRenegotiationPayload(
  msg: DirectCallRenegotiationMessage,
  sender: DirectCallWsClient
): ServerCallRenegotiationOfferMessage | ServerCallRenegotiationAnswerMessage {
  const payload = {
    callId: msg.callId,
    revision: msg.revision,
    senderUserId: sender.userId,
    senderDeviceId: sender.deviceId,
    sdp: msg.sdp,
    auth: msg.auth,
  };
  return msg.type === "call.renegotiate.offer"
    ? { type: "call.renegotiate.offer", ...payload }
    : { type: "call.renegotiate.answer", ...payload };
}

function hasValidCallSignalAuthContext(
  auth: CallSignalAuth | undefined,
  expected: {
    senderUserId: string;
    senderDeviceId: string;
    recipientUserId: string;
  }
): boolean {
  if (!auth) return true;
  return (
    auth.version === 1 &&
    auth.senderUserId === expected.senderUserId &&
    auth.senderDeviceId === expected.senderDeviceId &&
    auth.recipientUserId === expected.recipientUserId
  );
}

async function loadDeviceSigningPublicKey(
  deviceId: string,
  userId: string
): Promise<string | null> {
  const devices = await query<{ signing_key_public: string | null }>(
    `SELECT signing_key_public
     FROM devices
     WHERE id = $1
       AND user_id = $2`,
    [deviceId, userId]
  );
  return devices[0]?.signing_key_public ?? null;
}

export function createDirectCallSignalRouter(
  options: CreateDirectCallSignalRouterOptions
) {
  const pendingDisconnectCleanupTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  const disconnectGraceMs =
    options.disconnectGraceMs ?? DEFAULT_DIRECT_CALL_DISCONNECT_GRACE_MS;

  const rejectInvalidCallAuth = async (
    senderDeviceId: string,
    message = "Invalid or missing call auth proof",
    reason?: InvalidCallAuthReason
  ): Promise<void> => {
    await options.routeToDevice(senderDeviceId, {
      type: "error",
      code: "INVALID_CALL_AUTH",
      message,
      ...(reason ? { reason } : {}),
    });
  };

  const rejectDetailedInvalidCallAuth = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string },
    reason: CallAuthVerificationReason,
    details?: Record<string, unknown>
  ): Promise<void> => {
    fastify.log.warn(
      {
        callId: msg.callId,
        messageType: msg.type,
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
        reason,
        ...details,
      },
      "Rejected invalid call auth proof"
    );
    await rejectInvalidCallAuth(
      sender.deviceId,
      describeCallAuthFailure(reason),
      reason
    );
  };

  const maskBase64Url = (
    value: string | null | undefined,
    head = 8,
    tail = 6
  ): string | null => {
    if (!value) return null;
    if (value.length <= head + tail + 3) return value;
    return `${value.slice(0, head)}...${value.slice(-tail)}`;
  };

  const buildCallAuthLogContext = (
    auth: CallSignalAuth | undefined,
    expectedRecipientUserId: string,
    serverSigningPublicKey: string | null,
    computedSdpHash?: string
  ) => ({
    authVersion: auth?.version ?? null,
    authSenderUserId: auth?.senderUserId ?? null,
    authSenderDeviceId: auth?.senderDeviceId ?? null,
    authRecipientUserId: auth?.recipientUserId ?? null,
    authSignedAt: auth?.signedAt ?? null,
    authSdpHash: auth?.sdpHash ?? null,
    computedSdpHash: computedSdpHash ?? null,
    signaturePreview: maskBase64Url(auth?.signature),
    expectedRecipientUserId,
    serverSigningKeyPresent: serverSigningPublicKey != null,
    serverSigningKeyPreview: maskBase64Url(serverSigningPublicKey),
  });

  const rejectReplayedCallAuth = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string }
  ): Promise<void> => {
    fastify.log.warn(
      {
        callId: msg.callId,
        messageType: msg.type,
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
      },
      "Rejected replayed call auth proof"
    );
    await rejectInvalidCallAuth(
      sender.deviceId,
      "Call auth proof already used",
      "replayed_call_auth"
    );
  };

  const rejectForbiddenDirectCallSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string },
    message: string
  ): Promise<void> => {
    fastify.log.warn(
      {
        callId: msg.callId,
        messageType: msg.type,
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
      },
      message
    );
    await options.routeToDevice(sender.deviceId, {
      type: "error",
      code: "CALL_PARTICIPANT_FORBIDDEN",
      message,
    });
  };

  const rejectStaleDirectCallSignal = async (
    senderDeviceId: string,
    message = "Direct call transport state is no longer recoverable"
  ): Promise<void> => {
    await options.routeToDevice(senderDeviceId, {
      type: "error",
      code: "CALL_SESSION_STALE",
      message,
    });
  };

  const rejectDirectCallStateConflict = async (
    senderDeviceId: string,
    message = "Direct call is no longer in the required lifecycle state"
  ): Promise<void> => {
    await options.routeToDevice(senderDeviceId, {
      type: "error",
      code: "CALL_STATE_CONFLICT",
      message,
    });
  };

  const getCalleeTargets = (session: CallSession): string[] => {
    // Post-answer: route only to the device that answered.
    if (session.calleeDeviceId) return [session.calleeDeviceId];
    // Pre-answer: route only to the device(s) that received the offer.
    // Do NOT fall back to loading all callee devices from the DB — doing so
    // would fan ICE to devices that never saw the offer, which is both noisy
    // and incorrect. If no offer recipients are recorded, return an empty list
    // and let the ICE candidate be silently dropped (the offer never arrived).
    return session.calleeDeviceIds;
  };

  const getEstablishedPeerTarget = async (
    senderDeviceId: string,
    session: CallSession
  ): Promise<string | null> => {
    if (!session.calleeDeviceId) return null;
    if (!isEstablishedDirectCallParticipant(senderDeviceId, session)) return null;
    if (senderDeviceId === session.callerDeviceId) {
      return session.calleeDeviceId;
    }
    return session.callerDeviceId;
  };

  const replayPendingOffers = async (
    fastify: FastifyInstance,
    client: DirectCallWsClient
  ): Promise<void> => {
    const replayedOffers = await options.directCallLifecycleManager.replayPendingOffers({
      deviceId: client.deviceId,
    });

    for (const replayedOffer of replayedOffers) {
      fastify.log.info(
        replayedOffer,
        "Replayed pending direct-call offer after websocket reconnect"
      );
    }
  };

  const cancelDisconnectCleanup = (deviceId: string): void => {
    const pendingTimer = pendingDisconnectCleanupTimers.get(deviceId);
    if (!pendingTimer) return;
    clearTimeout(pendingTimer);
    pendingDisconnectCleanupTimers.delete(deviceId);
  };

  const cancelAllDisconnectCleanup = (): void => {
    for (const timer of pendingDisconnectCleanupTimers.values()) {
      clearTimeout(timer);
    }
    pendingDisconnectCleanupTimers.clear();
  };

  const scheduleDisconnectCleanup = (
    fastify: FastifyInstance,
    client: DirectCallWsClient
  ): void => {
    cancelDisconnectCleanup(client.deviceId);
    const timer = setTimeout(() => {
      pendingDisconnectCleanupTimers.delete(client.deviceId);
      void (async () => {
        if (options.hasActiveConnectionForDevice(client.deviceId)) {
          fastify.log.debug(
            { deviceId: client.deviceId },
            "Skipped direct-call disconnect cleanup after reconnect"
          );
          return;
        }

        const callIds = await options.callSessionStore.listByDevice(client.deviceId);
        if (callIds.length === 0) return;
        const results =
          await options.directCallLifecycleManager.cleanupDisconnectedDevice({
            deviceId: client.deviceId,
          });

        for (const result of results) {
          fastify.log.info(
            {
              ...result,
              disconnectedDeviceId: client.deviceId,
            },
            "Cleaned up stale direct-call session after disconnect grace timeout"
          );
        }
      })().catch((err) => {
        fastify.log.warn(
          { err, deviceId: client.deviceId, userId: client.userId },
          "Failed to cleanup stale direct-call sessions after disconnect"
        );
      });
    }, disconnectGraceMs);

    pendingDisconnectCleanupTimers.set(client.deviceId, timer);
  };

  const rejectUnsupportedRenegotiation = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: DirectCallRenegotiationMessage,
    session: CallSession
  ): Promise<void> => {
    const signalKind =
      msg.type === "call.renegotiate.offer" ? "offer" : "answer";
    fastify.log.warn(
      {
        callId: msg.callId,
        senderDeviceId: sender.deviceId,
        callerDeviceId: session.callerDeviceId,
        calleeDeviceId: session.calleeDeviceId,
        callerSupportsRenegotiationV1:
          session.callerSupportsRenegotiationV1 ?? null,
        calleeSupportsRenegotiationV1:
          session.calleeSupportsRenegotiationV1 ?? null,
      },
      `Rejected direct-call renegotiation ${signalKind} as unsupported`
    );
    await options.routeToDevice(sender.deviceId, {
      type: "error",
      code: "CALL_RENEGOTIATION_UNSUPPORTED",
      message: "Direct call renegotiation not supported",
    });
  };

  const handleRenegotiationSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: DirectCallRenegotiationMessage
  ): Promise<void> => {
    const authorityResult =
      await options.directCallLifecycleManager.loadAuthoritativeSession({
        callId: msg.callId,
        allowedStatuses: ["active"],
      });
    if (!authorityResult.ok) {
      if (authorityResult.reason === "transport_missing") {
        await rejectStaleDirectCallSignal(sender.deviceId);
      }
      return;
    }

    const session = authorityResult.session;
    if (!session.calleeDeviceId) {
      await options.routeToDevice(sender.deviceId, {
        type: "error",
        code: "CALL_NOT_ESTABLISHED",
        message: "Direct call not established",
      });
      return;
    }

    if (!supportsRenegotiationV1(session)) {
      await rejectUnsupportedRenegotiation(fastify, sender, msg, session);
      return;
    }

    const targetDeviceId = await getEstablishedPeerTarget(
      sender.deviceId,
      session
    );
    if (!targetDeviceId) {
      await options.routeToDevice(sender.deviceId, {
        type: "error",
        code: "FORBIDDEN",
        message: "Forbidden",
      });
      return;
    }

    const recipientUserId = getRenegotiationRecipientUserId(
      targetDeviceId,
      session
    );
    if (
      !hasValidCallSignalAuthContext(msg.auth, {
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
        recipientUserId,
      })
    ) {
      await rejectInvalidCallAuth(
        sender.deviceId,
        "Invalid call auth context",
        "context_mismatch"
      );
      return;
    }

    const signingPublicKey = await loadDeviceSigningPublicKey(
      sender.deviceId,
      sender.userId
    );
    const authKind = getRenegotiationAuthKind(msg);
    const authResult = signingPublicKey
      ? await verifyServerRenegotiationCallAuthProofDetailed(
          {
            kind: authKind,
            callId: msg.callId,
            revision: msg.revision,
            senderUserId: sender.userId,
            senderDeviceId: sender.deviceId,
            recipientUserId,
            sdp: msg.sdp,
            auth: msg.auth,
          },
          signingPublicKey
        )
      : { ok: false as const, reason: "missing_signing_public_key" as const };
    if (!authResult.ok) {
      await rejectDetailedInvalidCallAuth(
        fastify,
        sender,
        msg,
        authResult.reason ?? "signature_verification_failed",
        buildCallAuthLogContext(
          msg.auth,
          recipientUserId,
          signingPublicKey,
          authResult.computedSdpHash
        )
      );
      return;
    }

    if (
      !msg.auth ||
      !(await claimCallAuthProofReplay({
        kind: authKind,
        callId: msg.callId,
        senderDeviceId: sender.deviceId,
        signature: msg.auth.signature,
      }))
    ) {
      await rejectReplayedCallAuth(fastify, sender, msg);
      return;
    }

    await options.callSessionStore.set(
      msg.callId,
      markRenegotiationSupportAdvertised(session, sender.deviceId)
    );
    await options.routeToDevice(
      targetDeviceId,
      buildServerRenegotiationPayload(msg, sender)
    );
  };

  const routePeerSignalPayload = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string },
    session: CallSession,
    payload: WsServerMessage,
    forbiddenMessage: string
  ): Promise<void> => {
    if (isCallerSignal(sender.deviceId, session)) {
      await options.routeToDevices(getCalleeTargets(session), payload);
      return;
    }

    if (
      !isAllowedDirectCallCalleeSignalSender(
        sender.userId,
        sender.deviceId,
        session,
        { allowPendingTargets: true }
      )
    ) {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        forbiddenMessage
      );
      return;
    }

    await options.routeToDevice(session.callerDeviceId, payload);
  };

  const verifyOfferSignalAuth = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallOfferMessageCompat
  ): Promise<boolean> => {
    if (
      !hasValidCallSignalAuthContext(msg.auth, {
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
        recipientUserId: msg.targetUserId,
      })
    ) {
      await rejectInvalidCallAuth(
        sender.deviceId,
        "Invalid call auth context",
        "context_mismatch"
      );
      return false;
    }

    const signingPublicKey = await loadDeviceSigningPublicKey(
      sender.deviceId,
      sender.userId
    );
    const authResult = signingPublicKey
      ? await verifyServerOfferCallAuthProofDetailed(
          {
            callId: msg.callId,
            senderUserId: sender.userId,
            senderDeviceId: sender.deviceId,
            recipientUserId: msg.targetUserId,
            callType: msg.callType,
            sdp: msg.sdp,
            auth: msg.auth,
            ...(msg.mediaEncryption
              ? { mediaEncryption: msg.mediaEncryption }
              : {}),
          },
          signingPublicKey
        )
      : { ok: false as const, reason: "missing_signing_public_key" as const };
    if (!authResult.ok) {
      await rejectDetailedInvalidCallAuth(
        fastify,
        sender,
        msg,
        authResult.reason ?? "signature_verification_failed",
        buildCallAuthLogContext(
          msg.auth,
          msg.targetUserId,
          signingPublicKey,
          authResult.computedSdpHash
        )
      );
      return false;
    }

    if (
      !msg.auth ||
      !(await claimCallAuthProofReplay({
        kind: "offer",
        callId: msg.callId,
        senderDeviceId: sender.deviceId,
        signature: msg.auth.signature,
      }))
    ) {
      await rejectReplayedCallAuth(fastify, sender, msg);
      return false;
    }

    return true;
  };

  const buildForwardedOffer = (
    sender: DirectCallWsClient,
    msg: CallOfferMessageCompat
  ): ServerCallOfferMessage => ({
    type: "call.offer",
    callId: msg.callId,
    callerUserId: sender.userId,
    callerDeviceId: sender.deviceId,
    targetUserId: msg.targetUserId,
    sdp: msg.sdp,
    callType: msg.callType,
    ...(msg.mediaEncryption ? { mediaEncryption: msg.mediaEncryption } : {}),
    ...(msg.features ? { features: msg.features } : {}),
    auth: msg.auth,
  });

  const handleOfferStoreFailure = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallOfferMessageCompat,
    reason: "forbidden" | "not_found" | "state_conflict"
  ): Promise<void> => {
    if (reason === "forbidden") {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        "Direct call offer does not match the authoritative call participants"
      );
      return;
    }
    await rejectDirectCallStateConflict(
      sender.deviceId,
      "Direct call is no longer awaiting an outbound offer"
    );
  };

  const handleOfferSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallOfferMessageCompat
  ): Promise<void> => {
    if (!(await verifyOfferSignalAuth(fastify, sender, msg))) return;

    const storeResult = await options.directCallLifecycleManager.storeOffer({
      callId: msg.callId,
      callerUserId: sender.userId,
      callerDeviceId: sender.deviceId,
      calleeUserId: msg.targetUserId,
      callerSupportsRenegotiationV1: msg.features?.renegotiationV1 === true,
      offer: {
        callType: msg.callType,
        sdp: msg.sdp,
        ...(msg.mediaEncryption ? { mediaEncryption: msg.mediaEncryption } : {}),
        ...(msg.features ? { features: msg.features } : {}),
        ...(msg.auth ? { auth: msg.auth } : {}),
      },
    });
    if (!storeResult.ok) {
      await handleOfferStoreFailure(fastify, sender, msg, storeResult.reason);
      return;
    }

    fastify.log.debug(
      {
        callId: msg.callId,
        callerDeviceId: sender.deviceId,
        callerSupportsRenegotiationV1:
          storeResult.session.callerSupportsRenegotiationV1 ?? null,
        calleeDeviceIds: storeResult.calleeDeviceIds,
      },
      "Stored direct-call offer session"
    );

    await options.routeToDevices(
      storeResult.calleeDeviceIds,
      buildForwardedOffer(sender, msg) as WsServerMessage
    );

    if (storeResult.calleeDeviceIds.length === 0) {
      fastify.log.debug(
        { callId: msg.callId, calleeUserId: msg.targetUserId },
        "No callee devices for call offer"
      );
    }
  };

  const verifyAnswerSignalAuth = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallAnswerMessageCompat,
    callerUserId: string
  ): Promise<boolean> => {
    if (
      !hasValidCallSignalAuthContext(msg.auth, {
        senderUserId: sender.userId,
        senderDeviceId: sender.deviceId,
        recipientUserId: callerUserId,
      })
    ) {
      await rejectInvalidCallAuth(
        sender.deviceId,
        "Invalid call auth context",
        "context_mismatch"
      );
      return false;
    }

    const signingPublicKey = await loadDeviceSigningPublicKey(
      sender.deviceId,
      sender.userId
    );
    const authResult = signingPublicKey
      ? await verifyServerAnswerCallAuthProofDetailed(
          {
            callId: msg.callId,
            senderUserId: sender.userId,
            senderDeviceId: sender.deviceId,
            recipientUserId: callerUserId,
            sdp: msg.sdp,
            auth: msg.auth,
            ...(msg.mediaEncryption
              ? { mediaEncryption: msg.mediaEncryption }
              : {}),
          },
          signingPublicKey
        )
      : { ok: false as const, reason: "missing_signing_public_key" as const };
    if (!authResult.ok) {
      await rejectDetailedInvalidCallAuth(
        fastify,
        sender,
        msg,
        authResult.reason ?? "signature_verification_failed",
        buildCallAuthLogContext(
          msg.auth,
          callerUserId,
          signingPublicKey,
          authResult.computedSdpHash
        )
      );
      return false;
    }

    if (
      !msg.auth ||
      !(await claimCallAuthProofReplay({
        kind: "answer",
        callId: msg.callId,
        senderDeviceId: sender.deviceId,
        signature: msg.auth.signature,
      }))
    ) {
      await rejectReplayedCallAuth(fastify, sender, msg);
      return false;
    }

    return true;
  };

  const buildForwardedAnswer = (
    sender: DirectCallWsClient,
    msg: CallAnswerMessageCompat,
    callerUserId: string
  ): ServerCallAnsweredMessage => ({
    type: "call.answered",
    callId: msg.callId,
    answererUserId: sender.userId,
    answererDeviceId: sender.deviceId,
    targetUserId: callerUserId,
    sdp: msg.sdp,
    ...(msg.mediaEncryption ? { mediaEncryption: msg.mediaEncryption } : {}),
    ...(msg.features ? { features: msg.features } : {}),
    auth: msg.auth,
  });

  const handleAnswerFailure = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallAnswerMessageCompat,
    reason: "forbidden" | "not_found" | "transport_missing" | "state_conflict"
  ): Promise<void> => {
    if (reason === "forbidden") {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        "Only invited callee devices may answer this call"
      );
      return;
    }
    if (reason === "transport_missing") {
      await rejectStaleDirectCallSignal(sender.deviceId);
      return;
    }
    await rejectDirectCallStateConflict(
      sender.deviceId,
      "Direct call is no longer awaiting an answer"
    );
  };

  const handleAnswerSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallAnswerMessageCompat
  ): Promise<void> => {
    const authorityResult =
      await options.directCallLifecycleManager.loadAuthoritativeSession({
        callId: msg.callId,
        allowedStatuses: ["ringing"],
      });
    if (!authorityResult.ok) {
      if (authorityResult.reason === "transport_missing") {
        await rejectStaleDirectCallSignal(sender.deviceId);
      }
      return;
    }

    const session = authorityResult.session;
    if (
      !isAllowedDirectCallCalleeSignalSender(
        sender.userId,
        sender.deviceId,
        session,
        { allowPendingTargets: true }
      )
    ) {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        "Only invited callee devices may answer this call"
      );
      return;
    }
    if (!(await verifyAnswerSignalAuth(fastify, sender, msg, session.callerUserId))) return;

    const forwardedAnswer = buildForwardedAnswer(sender, msg, session.callerUserId);
    const answerResult = await options.directCallLifecycleManager.acceptAnswer({
      callId: msg.callId,
      actorUserId: sender.userId,
      actorDeviceId: sender.deviceId,
      calleeSupportsRenegotiationV1:
        msg.features?.renegotiationV1 === true,
      answeredMessage:
        forwardedAnswer as WsServerMessage as ServerCallAnsweredMessage,
    });
    if (!answerResult.ok) {
      await handleAnswerFailure(fastify, sender, msg, answerResult.reason);
      return;
    }

    fastify.log.debug(
      {
        callId: msg.callId,
        callerDeviceId: answerResult.session.callerDeviceId,
        calleeDeviceId: answerResult.session.calleeDeviceId,
        callerSupportsRenegotiationV1:
          answerResult.session.callerSupportsRenegotiationV1 ?? null,
        calleeSupportsRenegotiationV1:
          answerResult.session.calleeSupportsRenegotiationV1 ?? null,
      },
      "Committed authoritative direct-call answer session"
    );
  };

  const loadRelaySession = async (
    senderDeviceId: string,
    callId: string,
    allowedStatuses: DirectCallLifecycleStatus[]
  ): Promise<CallSession | null> => {
    const authorityResult =
      await options.directCallLifecycleManager.loadAuthoritativeSession({
        callId,
        allowedStatuses,
      });
    if (!authorityResult.ok) {
      if (authorityResult.reason === "transport_missing") {
        await rejectStaleDirectCallSignal(senderDeviceId);
      }
      return null;
    }

    await options.callSessionStore.set(callId, authorityResult.session);
    return authorityResult.session;
  };

  const handleIceSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string }
  ): Promise<void> => {
    const session = await loadRelaySession(sender.deviceId, msg.callId, [
      "ringing",
      "active",
    ]);
    const icePayload = buildIcePayload(msg);
    if (!session || !icePayload) return;

    await routePeerSignalPayload(
      fastify,
      sender,
      msg,
      session,
      icePayload,
      "Only invited or selected callee devices may send direct-call ICE"
    );
  };

  const buildMediaStatePayload = (
    sender: DirectCallWsClient,
    msg: CallMediaStateMessage
  ): ServerCallMediaStateMessage => ({
    type: "call.media_state",
    callId: msg.callId,
    senderUserId: sender.userId,
    senderDeviceId: sender.deviceId,
    source: msg.source,
    state: msg.state,
    activity: msg.activity,
    mid: msg.mid ?? null,
    seq: msg.seq,
    streamRevision: msg.streamRevision,
    reason: msg.reason,
    changedAt: new Date().toISOString(),
  });

  const handleMediaStateSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: CallMediaStateMessage
  ): Promise<void> => {
    const session = await loadRelaySession(sender.deviceId, msg.callId, [
      "ringing",
      "active",
    ]);
    if (!session) return;

    await routePeerSignalPayload(
      fastify,
      sender,
      msg,
      session,
      buildMediaStatePayload(sender, msg),
      "Only invited or selected callee devices may send direct-call media state"
    );
  };

  const handleHangupSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string }
  ): Promise<void> => {
    const hangupResult = await options.directCallLifecycleManager.hangupCall({
      callId: msg.callId,
      actorUserId: sender.userId,
      actorDeviceId: sender.deviceId,
    });
    if (!hangupResult.ok && hangupResult.reason === "forbidden") {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        "Only direct-call participants may end this call"
      );
    }
  };

  const handleRejectSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string }
  ): Promise<void> => {
    const rejectResult = await options.directCallLifecycleManager.rejectCall({
      callId: msg.callId,
      actorUserId: sender.userId,
      actorDeviceId: sender.deviceId,
    });
    if (!rejectResult.ok && rejectResult.reason === "forbidden") {
      await rejectForbiddenDirectCallSignal(
        fastify,
        sender,
        msg,
        "Only invited callee devices may reject this call"
      );
    }
  };

  const handleSignal = async (
    fastify: FastifyInstance,
    sender: DirectCallWsClient,
    msg: WsClientMessage & { callId: string }
  ): Promise<void> => {
    if (msg.type === "call.offer") {
      await handleOfferSignal(fastify, sender, msg as CallOfferMessageCompat);
      return;
    }

    if (msg.type === "call.answer") {
      await handleAnswerSignal(fastify, sender, msg as CallAnswerMessageCompat);
      return;
    }

    if (msg.type === "call.renegotiate.offer" || msg.type === "call.renegotiate.answer") {
      await handleRenegotiationSignal(fastify, sender, msg);
      return;
    }

    if (msg.type === "call.ice" || msg.type === "call.ice.batch") {
      await handleIceSignal(fastify, sender, msg);
      return;
    }

    if (msg.type === "call.media_state") {
      await handleMediaStateSignal(fastify, sender, msg as CallMediaStateMessage);
      return;
    }

    if (msg.type === "call.hangup") {
      await handleHangupSignal(fastify, sender, msg);
      return;
    }

    if (msg.type === "call.reject") {
      await handleRejectSignal(fastify, sender, msg);
    }
  };

  return {
    replayPendingOffers,
    cancelDisconnectCleanup,
    cancelAllDisconnectCleanup,
    scheduleDisconnectCleanup,
    handleSignal,
  };
}
