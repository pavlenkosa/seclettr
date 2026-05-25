/**
 * group-call-sfu-client — SFU client creation with automatic retry.
 *
 * Owns:
 *   - CreateSfuClientWithRetryContext — parameters shared between bootstrap and rejoin
 *   - wait — simple setTimeout-based delay helper
 *   - createSfuClientWithRetry — wraps startGroupSfuClient with up to 3 attempts,
 *     15-second timeout per attempt, and 350ms / 700ms back-off between attempts
 *
 * Does not own the SFU client itself (see sfu/index.ts) or the bootstrap/rejoin
 * sequences that call this helper (see session/bootstrap.ts, session/rejoin.ts).
 */
import {
  startGroupSfuClient,
  type GroupCallRemoteMedia,
  type GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import {
  GROUP_CALL_SETUP_TIMEOUTS,
} from "@/calls/group/model/group-call-setup-timeouts";
import { withSetupStageTimeout } from "@/calls/shared/model/call-setup-timeout";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import type { CallType } from "@/calls/group/model/group-call-types";

export interface CreateSfuClientWithRetryContext {
  userId: string;
  deviceId: string;
  callType: CallType;
  initialLocalMediaKey: LocalGroupCallMediaKey | null;
  mediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  onRemoteMediaUpdate: (participants: GroupCallRemoteMedia[]) => void;
  startErrorMessage: string;
  abortIfStaleSessionRun: (onAbort?: () => void | Promise<void>) => Promise<void>;
}

export function wait(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

const INITIAL_SFU_START_ATTEMPTS = 3;

function createSfuClient(
  roomId: string,
  stream: MediaStream,
  ctx: CreateSfuClientWithRetryContext,
  onTransportFailed: () => void
): Promise<GroupSfuClient> {
  return startGroupSfuClient({
    roomId,
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    callType: ctx.callType,
    localStream: stream,
    initialLocalMediaKey: ctx.initialLocalMediaKey,
    mediaEncryptionMode: ctx.mediaEncryptionMode,
    onRemoteMediaUpdate: ctx.onRemoteMediaUpdate,
    onTransportFailed,
  });
}

export async function createSfuClientWithRetry(
  roomId: string,
  stream: MediaStream,
  onTransportFailed: () => void,
  ctx: CreateSfuClientWithRetryContext
): Promise<GroupSfuClient> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= INITIAL_SFU_START_ATTEMPTS; attempt += 1) {
    try {
      return await withSetupStageTimeout(
        createSfuClient(roomId, stream, ctx, onTransportFailed),
        GROUP_CALL_SETUP_TIMEOUTS.sfuConnectMs,
        "sfu-connect"
      );
    } catch (caughtError) {
      lastError = caughtError;
      if (attempt >= INITIAL_SFU_START_ATTEMPTS) {
        break;
      }
      await ctx.abortIfStaleSessionRun();
      await wait(350 * attempt);
    }
  }
  throw lastError ?? new Error(ctx.startErrorMessage);
}
