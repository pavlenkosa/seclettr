/**
 * group-call-bootstrap — async boot sequence for joining a group call room.
 *
 * Owns:
 *   - GroupCallSessionAbortError — sentinel thrown to unwind stale session runs
 *   - BootstrapContext / BootstrapCallState — data contracts for the bootstrap phase
 *   - resolveCallIdAndHost — resolves or creates a call ID via the API
 *   - handleStartGroupCallFailure — unified cleanup path for bootstrap errors
 *   - runGroupCallBootstrap — the main async loop: resolves the call, acquires
 *     local media, joins as a participant, activates the room, creates the SFU
 *     client, and dispatches SESSION_READY — with up to two retry attempts for
 *     recoverable errors (timeouts, network blips, 409 conflicts)
 *
 * Does not own the SFU client internals (see session/sfu-client.ts), the
 * rejoin logic after initial join (see session/rejoin.ts), or the React hook
 * that drives this sequence (see useGroupCallSessionLifecycle.ts).
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { api } from "@/lib/api";
import type { GroupSfuClient, GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import {
  GROUP_CALL_SETUP_TIMEOUTS,
  GroupCallSetupTimeoutError,
} from "@/calls/group/model/group-call-setup-timeouts";
import { withSetupStageTimeout } from "@/calls/shared/model/call-setup-timeout";
import { isMediaCaptureError, resolveErrorMessage } from "@/calls/group/runtime/runtime-utils";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import type { GroupCallStatusAction } from "@/calls/group/model/group-call-types";
import { createSfuClientWithRetry, wait, type CreateSfuClientWithRetryContext } from "./sfu-client";

export class GroupCallSessionAbortError extends Error {
  constructor() {
    super("Group call session run is stale");
  }
}

type CreateGroupCallResponse = {
  callId: string;
  created?: boolean;
  callerUserId?: string;
};

export interface BootstrapContext {
  userId: string;
  groupId: string;
  callType: string;
  sfuClientCtx: CreateSfuClientWithRetryContext;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  callIdRef: MutableRefObject<string | null>;
  joinedParticipantRef: MutableRefObject<boolean>;
  ownsServerCallRef: MutableRefObject<boolean>;
  isCurrentSessionRun: () => boolean;
  abortIfStaleSessionRun: (onAbort?: () => void | Promise<void>) => Promise<void>;
  syncParticipantDevices: (participantDevices: Awaited<ReturnType<typeof api.getGroupCallParticipantDevices>>) => void;
  stopLocalStream: (stream: MediaStream | null) => void;
  ensureLocalStream: () => Promise<MediaStream>;
  endCreatedCall: () => Promise<void>;
  leaveJoinedCall: () => Promise<void>;
  cleanupLocalMedia: () => void;
  leaveCurrentCall: () => Promise<void>;
  endServerRoom: (nextStatus?: "ended" | "missed" | "rejected", options?: { force?: boolean }) => Promise<void>;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setCallId: Dispatch<SetStateAction<string | null>>;
  setCallHostUserId: Dispatch<SetStateAction<string | null>>;
  setAccessGranted: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
  setActiveParticipantDeviceIdsByUserId: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRemoteParticipantMediaModes: Dispatch<SetStateAction<Record<string, GroupCallRuntimeMediaEncryptionMode>>>;
  setRemoteMedia: Dispatch<SetStateAction<GroupCallRemoteMedia[]>>;
  startErrorMessage: string;
  mediaPermissionErrorMessage: string;
  frameUnsupportedStrictMessage: string;
  strictFrameEncryptionUnsupported: boolean;
  attemptSfuRejoin: () => void;
}

export interface BootstrapCallState {
  createdCallId: string | null;
  createdHere: boolean;
  joinedHere: boolean;
  localStream: MediaStream | null;
}

export async function resolveCallIdAndHost(
  ctx: BootstrapContext
): Promise<{
  resolvedCallId: string;
  nextHostUserId: string;
  serverCreatedCall: boolean;
  existingCall: Awaited<ReturnType<typeof api.getActiveGroupCall>>;
}> {
  const existing = await withSetupStageTimeout(
    api.getActiveGroupCall(ctx.groupId),
    GROUP_CALL_SETUP_TIMEOUTS.checkActiveCallMs,
    "check-active-call"
  );
  await ctx.abortIfStaleSessionRun();
  let nextHostUserId = existing?.callerUserId ?? ctx.userId;
  let resolvedCallId = existing?.callId ?? null;
  let serverCreatedCall = existing === null;
  if (!resolvedCallId) {
    const created = await withSetupStageTimeout(
      api.post<CreateGroupCallResponse>("/calls", {
        groupId: ctx.groupId,
        callType: ctx.callType,
      }),
      GROUP_CALL_SETUP_TIMEOUTS.apiCallMs,
      "api-create-call"
    );
    resolvedCallId = created.callId;
    serverCreatedCall = created.created ?? true;
    if (created.callerUserId) {
      nextHostUserId = created.callerUserId;
    } else if (!serverCreatedCall) {
      const activeCall = await withSetupStageTimeout(
        api.getActiveGroupCall(ctx.groupId),
        GROUP_CALL_SETUP_TIMEOUTS.checkActiveCallMs,
        "check-active-call"
      );
      await ctx.abortIfStaleSessionRun();
      if (activeCall?.callId === resolvedCallId) {
        nextHostUserId = activeCall.callerUserId;
      }
    }
  }
  return { resolvedCallId, nextHostUserId, serverCreatedCall, existingCall: existing };
}

export async function handleStartGroupCallFailure(
  error: unknown,
  ctx: BootstrapContext,
  state: BootstrapCallState
): Promise<void> {
  if (!ctx.isCurrentSessionRun()) {
    ctx.stopLocalStream(state.localStream);
    await ctx.leaveJoinedCall();
    await ctx.endCreatedCall();
    return;
  }
  ctx.cleanupLocalMedia();
  await ctx.leaveCurrentCall();

  if (state.createdCallId && state.createdHere) {
    ctx.callIdRef.current = state.createdCallId;
    await ctx.endServerRoom("ended");
  }

  if (ctx.isCurrentSessionRun()) {
    ctx.dispatchStatus({ type: "SESSION_ERROR" });
    ctx.setAccessGranted(false);
    ctx.setError(
      resolveErrorMessage(
        error,
        isMediaCaptureError(error)
          ? ctx.mediaPermissionErrorMessage
          : ctx.startErrorMessage
      )
    );
  }
}

const INITIAL_CALL_BOOTSTRAP_ATTEMPTS = 2;

function readApiErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRecoverableGroupCallBootstrapError(error: unknown): boolean {
  if (error instanceof GroupCallSetupTimeoutError) {
    return true;
  }
  const status = readApiErrorStatus(error);
  if (status === 401 || status === 403 || status === 404 || status === 409) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("call not found")
    || message.includes("forbidden")
    || message.includes("missing access token")
    || message.includes("network");
}

export async function runGroupCallBootstrap(
  ctx: BootstrapContext,
  state: BootstrapCallState
): Promise<void> {
  if (ctx.strictFrameEncryptionUnsupported) {
    await handleStartGroupCallFailure(new Error(ctx.frameUnsupportedStrictMessage), ctx, state);
    return;
  }

  for (
    let bootstrapAttempt = 1;
    bootstrapAttempt <= INITIAL_CALL_BOOTSTRAP_ATTEMPTS;
    bootstrapAttempt += 1
  ) {
    try {
      const { resolvedCallId, nextHostUserId, serverCreatedCall, existingCall } = await resolveCallIdAndHost(ctx);
      state.createdCallId = resolvedCallId;
      state.createdHere = existingCall === null && serverCreatedCall;
      state.joinedHere = false;
      await ctx.abortIfStaleSessionRun(ctx.endCreatedCall);

      ctx.ownsServerCallRef.current = state.createdHere;
      ctx.setCallHostUserId(nextHostUserId);
      ctx.setCallId(resolvedCallId);
      ctx.callIdRef.current = resolvedCallId;

      const stream = await withSetupStageTimeout(
        ctx.ensureLocalStream(),
        GROUP_CALL_SETUP_TIMEOUTS.localMediaMs,
        "local-media"
      );
      await ctx.abortIfStaleSessionRun(async () => {
        ctx.stopLocalStream(stream);
        await ctx.endCreatedCall();
      });

      const [participants, participantDevices] = await Promise.all([
        withSetupStageTimeout(
          api.joinGroupCall(resolvedCallId),
          GROUP_CALL_SETUP_TIMEOUTS.apiCallMs,
          "join-call"
        ),
        api.getGroupCallParticipantDevices(resolvedCallId).catch(() => []),
      ]);
      state.joinedHere = true;
      await ctx.abortIfStaleSessionRun(async () => {
        await ctx.leaveJoinedCall();
        ctx.stopLocalStream(stream);
        await ctx.endCreatedCall();
      });
      ctx.joinedParticipantRef.current = true;
      ctx.setActiveParticipantUserIds(
        participants.map((participant) => participant.userId)
      );
      ctx.syncParticipantDevices(participantDevices);

      try {
        await api.put<{ ok: boolean }>(`/calls/${resolvedCallId}/status`, {
          status: "active",
        });
      } catch {
        // Best-effort room state update.
      }

      await ctx.abortIfStaleSessionRun(async () => {
        await ctx.leaveJoinedCall();
        ctx.stopLocalStream(stream);
        await ctx.endCreatedCall();
      });

      const sfuClient = await createSfuClientWithRetry(
        resolvedCallId,
        stream,
        ctx.attemptSfuRejoin,
        ctx.sfuClientCtx
      );
      await ctx.abortIfStaleSessionRun(() => {
        sfuClient.close();
      });
      ctx.sfuClientRef.current = sfuClient;

      await ctx.abortIfStaleSessionRun();
      ctx.dispatchStatus({ type: "SESSION_READY" });
      return;
    } catch (error) {
      if (error instanceof GroupCallSessionAbortError) {
        return;
      }
      const canRetryBootstrap =
        bootstrapAttempt < INITIAL_CALL_BOOTSTRAP_ATTEMPTS
        && isRecoverableGroupCallBootstrapError(error);
      if (!canRetryBootstrap) {
        await handleStartGroupCallFailure(error, ctx, state);
        return;
      }

      ctx.sfuClientRef.current?.close();
      ctx.sfuClientRef.current = null;
      await ctx.leaveJoinedCall();
      await ctx.endCreatedCall();

      state.createdCallId = null;
      state.createdHere = false;
      state.joinedHere = false;
      ctx.joinedParticipantRef.current = false;
      ctx.ownsServerCallRef.current = false;
      ctx.callIdRef.current = null;
      ctx.setCallId(null);
      ctx.setActiveParticipantUserIds([]);
      ctx.setActiveParticipantDeviceIdsByUserId({});
      ctx.setRemoteParticipantMediaModes({});
      ctx.setRemoteMedia([]);
      ctx.setAccessGranted(state.localStream !== null);
      await ctx.abortIfStaleSessionRun();
      await wait(250 * bootstrapAttempt);
    }
  }
}
