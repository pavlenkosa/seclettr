/**
 * runtime-common — shared SFU runtime utilities used by both consumer and producer runtimes.
 *
 * Owns:
 *   - emitRemoteMediaUpdate — builds and emits a GroupCallRemoteMedia[] snapshot via callback
 *   - upsertRemoteEntry — idempotently creates a RemoteParticipantMediaInternal entry
 *   - toFrameKeyContext — converts a media key to a GroupCallFrameKeyContext (via cloneKeyContext)
 *   - mergeRemoteFrameKeyContexts — maintains a bounded window (max 4) of key contexts
 *     for a remote device, deduplicating by keyId+epoch; used for graceful key rotation
 *   - snapshotMediaTrack — serializes a MediaStreamTrack to a plain debug record
 *   - Re-exports: GroupCallRemoteMedia, RemoteParticipantMediaInternal, RemoteVideoSlot
 *
 * Does not own consumer or producer lifecycle — this file contains only stateless helpers.
 */
import { cloneKeyContext, type GroupCallFrameKeyContext } from "@/calls/shared/crypto/frame-crypto-core";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/media-key/media-key";
import {
  buildRemoteMediaSnapshot,
  type GroupCallRemoteMedia,
  type RemoteParticipantMediaInternal,
  type RemoteVideoSlot,
} from "@/calls/group/runtime/media-key/remote-media";
export type { GroupCallRemoteMedia, RemoteParticipantMediaInternal, RemoteVideoSlot } from "@/calls/group/runtime/media-key/remote-media";

export function emitRemoteMediaUpdate(
  remoteMediaByUserId: Map<string, RemoteParticipantMediaInternal>,
  callback: ((participants: GroupCallRemoteMedia[]) => void) | undefined
): void {
  if (!callback) {
    return;
  }
  callback(buildRemoteMediaSnapshot(remoteMediaByUserId));
}

export function upsertRemoteEntry(
  remoteMediaByUserId: Map<string, RemoteParticipantMediaInternal>,
  userId: string
): RemoteParticipantMediaInternal {
  const existing = remoteMediaByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const created: RemoteParticipantMediaInternal = {
    userId,
    audioStreamsByProducerId: new Map<string, MediaStream>(),
    videoSlotsByProducerId: new Map<string, RemoteVideoSlot>(),
  };
  remoteMediaByUserId.set(userId, created);
  return created;
}

export function toFrameKeyContext(
  mediaKey: Pick<LocalGroupCallMediaKey | ReceivedGroupCallMediaKey, "keyId" | "epoch" | "keyBytes">
): GroupCallFrameKeyContext {
  return cloneKeyContext(mediaKey);
}

export function mergeRemoteFrameKeyContexts(
  currentKeyContexts: readonly GroupCallFrameKeyContext[] | undefined,
  nextKeyContext: GroupCallFrameKeyContext | null
): GroupCallFrameKeyContext[] {
  if (!nextKeyContext) {
    return [];
  }

  const next = cloneKeyContext(nextKeyContext);
  return [
    next,
    ...(currentKeyContexts ?? [])
      .filter((existing) => !(existing.keyId === next.keyId && existing.epoch === next.epoch))
      .map(cloneKeyContext)
      .slice(0, 3),
  ];
}

export function snapshotMediaTrack(
  track: MediaStreamTrack | null | undefined
): Record<string, unknown> | null {
  if (!track) {
    return null;
  }
  return {
    id: track.id,
    kind: track.kind,
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
  };
}
