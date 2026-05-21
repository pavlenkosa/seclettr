/**
 * group-call-rejoin — SFU transport-failure recovery and automatic rejoin logic.
 *
 * Owns:
 *   - RejoinContext / RejoinState — data contracts for the rejoin phase
 *   - resolveActiveRejoinCallId — re-joins the existing call (or discovers a replacement
 *     call if the original 404s/403s) and refreshes participant state
 *   - runSfuRejoinAttempt — closes the stale SFU client, resolves the call ID, creates a
 *     new SFU client, and dispatches SESSION_READY on success
 *   - buildAttemptSfuRejoin — closure factory that caps rejoin attempts at maxRejoinAttempts
 *     and applies exponential back-off (1 s / 2 s / 4 s)
 *
 * Does not own the initial bootstrap sequence (see session/bootstrap.ts) or the React
 * lifecycle hook that wires everything together (see useGroupCallSessionLifecycle.ts).
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { api } from "@/lib/api";
import {
  startGroupSfuClient,
  type GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import {
  GROUP_CALL_SETUP_TIMEOUTS,
} from "@/calls/group/model/group-call-setup-timeouts";
import { withSetupStageTimeout } from "@/calls/shared/model/call-setup-timeout";
import type { GroupCallStatusAction } from "@/calls/group/model/group-call-types";
import type { CreateSfuClientWithRetryContext } from "./sfu-client";

function readApiErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export interface RejoinContext {
  userId: string;
  groupId: string;
  sfuClientCtx: CreateSfuClientWithRetryContext;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  activeStreamRef: MutableRefObject<MediaStream | null>;
  callIdRef: MutableRefObject<string | null>;
  joinedParticipantRef: MutableRefObject<boolean>;
  ownsServerCallRef: MutableRefObject<boolean>;
  isCurrentSessionRun: () => boolean;
  abortIfStaleSessionRun: (onAbort?: () => void | Promise<void>) => Promise<void>;
  syncParticipantDevices: (participantDevices: Awaited<ReturnType<typeof api.getGroupCallParticipantDevices>>) => void;
  failSessionStart: (cleanupMedia: boolean) => void;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setCallId: Dispatch<SetStateAction<string | null>>;
  setCallHostUserId: Dispatch<SetStateAction<string | null>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
}

export interface RejoinState {
  rejoinAttempts: number;
  rejoinTimerId: ReturnType<typeof setTimeout> | null;
}

export async function resolveActiveRejoinCallId(
  fallbackCallId: string,
  ctx: RejoinContext
): Promise<string | null> {
  try {
    const [participants, participantDevices] = await Promise.all([
      withSetupStageTimeout(
        api.joinGroupCall(fallbackCallId),
        GROUP_CALL_SETUP_TIMEOUTS.apiCallMs,
        "join-call"
      ),
      api.getGroupCallParticipantDevices(fallbackCallId).catch(() => []),
    ]);
    await ctx.abortIfStaleSessionRun();
    ctx.joinedParticipantRef.current = true;
    ctx.setActiveParticipantUserIds(
      participants.map((participant) => participant.userId)
    );
    ctx.syncParticipantDevices(participantDevices);
    return fallbackCallId;
  } catch (joinError) {
    const status = readApiErrorStatus(joinError);
    if (status !== 401 && status !== 403 && status !== 404) {
      throw joinError;
    }
  }

  const nextActiveCall = await withSetupStageTimeout(
    api.getActiveGroupCall(ctx.groupId),
    GROUP_CALL_SETUP_TIMEOUTS.checkActiveCallMs,
    "check-active-call"
  );
  await ctx.abortIfStaleSessionRun();
  if (!nextActiveCall) {
    return null;
  }

  const [participants, participantDevices] = await Promise.all([
    withSetupStageTimeout(
      api.joinGroupCall(nextActiveCall.callId),
      GROUP_CALL_SETUP_TIMEOUTS.apiCallMs,
      "join-call"
    ),
    api.getGroupCallParticipantDevices(nextActiveCall.callId).catch(() => []),
  ]);
  await ctx.abortIfStaleSessionRun();
  ctx.joinedParticipantRef.current = true;
  ctx.callIdRef.current = nextActiveCall.callId;
  ctx.setCallId(nextActiveCall.callId);
  ctx.setCallHostUserId(nextActiveCall.callerUserId);
  ctx.ownsServerCallRef.current = nextActiveCall.callerUserId === ctx.userId;
  ctx.setActiveParticipantUserIds(
    participants.map((participant) => participant.userId)
  );
  ctx.syncParticipantDevices(participantDevices);
  return nextActiveCall.callId;
}

function createSfuClient(
  roomId: string,
  stream: MediaStream,
  sfuClientCtx: CreateSfuClientWithRetryContext,
  onTransportFailed: () => void
): Promise<GroupSfuClient> {
  return startGroupSfuClient({
    roomId,
    userId: sfuClientCtx.userId,
    deviceId: sfuClientCtx.deviceId,
    callType: sfuClientCtx.callType,
    localStream: stream,
    initialLocalMediaKey: sfuClientCtx.initialLocalMediaKey,
    mediaEncryptionMode: sfuClientCtx.mediaEncryptionMode,
    onRemoteMediaUpdate: sfuClientCtx.onRemoteMediaUpdate,
    onTransportFailed,
  });
}

export async function runSfuRejoinAttempt(
  ctx: RejoinContext,
  attemptSfuRejoin: () => void
): Promise<void> {
  if (!ctx.isCurrentSessionRun()) return;
  const currentStream = ctx.activeStreamRef.current;
  const fallbackCallId = ctx.callIdRef.current;
  if (!currentStream || !fallbackCallId) {
    ctx.failSessionStart(false);
    return;
  }
  ctx.sfuClientRef.current?.close();
  ctx.sfuClientRef.current = null;
  try {
    const resolvedCallId = await resolveActiveRejoinCallId(fallbackCallId, ctx);
    if (!resolvedCallId) {
      ctx.failSessionStart(true);
      return;
    }
    const nextSfuClient = await withSetupStageTimeout(
      createSfuClient(resolvedCallId, currentStream, ctx.sfuClientCtx, attemptSfuRejoin),
      GROUP_CALL_SETUP_TIMEOUTS.sfuConnectMs,
      "sfu-connect"
    );
    if (!ctx.isCurrentSessionRun()) {
      nextSfuClient.close();
      return;
    }
    ctx.sfuClientRef.current = nextSfuClient;
    ctx.dispatchStatus({ type: "SESSION_READY" });
  } catch {
    if (ctx.isCurrentSessionRun()) {
      attemptSfuRejoin();
    }
  }
}

export function buildAttemptSfuRejoin(
  ctx: RejoinContext,
  state: RejoinState,
  maxRejoinAttempts: number
): () => void {
  const attemptSfuRejoin = (): void => {
    if (!ctx.isCurrentSessionRun()) return;
    if (state.rejoinAttempts >= maxRejoinAttempts) {
      ctx.failSessionStart(true);
      return;
    }
    state.rejoinAttempts += 1;
    ctx.dispatchStatus({ type: "RECONNECT_START" });
    const delayMs = Math.pow(2, state.rejoinAttempts - 1) * 1000;
    state.rejoinTimerId = setTimeout(() => {
      state.rejoinTimerId = null;
      void runSfuRejoinAttempt(ctx, attemptSfuRejoin);
    }, delayMs);
  };
  return attemptSfuRejoin;
}
