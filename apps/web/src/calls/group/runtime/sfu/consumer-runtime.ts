/**
 * consumer-runtime — SFU consumer lifecycle manager for group calls.
 *
 * Owns:
 *   - createSfuConsumerRuntime — factory that returns GroupSfuConsumerRuntime
 *   - GroupSfuConsumerRuntime interface (syncRemoteProducers, removeParticipantMedia,
 *     setRemoteMediaKey, getDebugSnapshot, close)
 *   - Consumer creation, retry state, and grace-period logic for remote producers
 *   - WebSocket signal subscription for producer_state events
 *   - 30-second reconciliation timer as a safety net for missed signals
 *   - Per-consumer frame-decryption handle lifecycle (attach / detach / key update)
 *
 * Does not own producer-side publishing (see producer-runtime.ts), RTP parameter
 * negotiation (see rtp-parameters.ts), or the SFU HTTP client (see http-client.ts).
 *
 * Invariant: WS producer_state signals are the primary change driver; the periodic
 * reconciliation sync is only a fallback and runs every 30 seconds.
 */
import type {
  SfuRoomProducer,
  WsServerMessage,
} from "@seclettr/protocol";
import { type types as MediasoupTypes } from "mediasoup-client";
import {
  bindReceiverFrameDecryption,
  type GroupCallFrameCryptoHandle,
} from "@/calls/shared/crypto/frame-crypto";
import type { ReceivedGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import {
  logGroupCallError,
  logGroupCallInfo,
  logGroupCallWarn,
} from "@/calls/group/runtime/media-key/logger";
import {
  computeConsumeRetryDelayMs,
  dedupeRemoteProducersBySlot,
  filterRemoteProducersForConsume,
  getProducerRemovalGracePeriodMs,
} from "./remote-producers";
import type { SfuHttpClient } from "./http-client";
import {
  emitRemoteMediaUpdate,
  mergeRemoteFrameKeyContexts,
  snapshotMediaTrack,
  toFrameKeyContext,
  upsertRemoteEntry,
  type GroupCallRemoteMedia,
  type RemoteParticipantMediaInternal,
} from "./runtime-common";
import type {
  GroupCallMediaEncryptionMode,
  ManagedConsumer,
  RecvTransport,
} from "./types";

/**
 * Simplified consumer runtime for group calls.
 * 
 * Design principles:
 * 1. WS signals are authoritative for topology changes
 * 2. Producer list is cached and only refreshed on sync
 * 3. Single reconciliation timer as safety net
 * 4. Simple retry delays (no exponential backoff)
 */

interface CreateSfuConsumerRuntimeOptions {
  roomId: string;
  userId: string;
  deviceId: string;
  recvTransport: RecvTransport;
  rtpCapabilities: MediasoupTypes.RtpCapabilities;
  mediaEncryptionMode: GroupCallMediaEncryptionMode;
  getLocalProducerIds: () => Set<string>;
  onRemoteMediaUpdate?: (participants: GroupCallRemoteMedia[]) => void;
  sfuHttpClient: Pick<SfuHttpClient, "consume" | "resumeConsumer" | "listRoomProducers">;
  wsClient: {
    on: (listener: (message: WsServerMessage) => void) => () => void;
  };
}

type ConsumeRetryState = { retryAt: number; attempts: number };

export interface GroupSfuConsumerRuntime {
  syncRemoteProducers: () => Promise<void>;
  removeParticipantMedia: (userId: string) => void;
  setRemoteMediaKey: (senderDeviceId: string, mediaKey: ReceivedGroupCallMediaKey | null) => void;
  getDebugSnapshot: () => Record<string, unknown>;
  close: () => void;
}

export function createSfuConsumerRuntime(
  options: CreateSfuConsumerRuntimeOptions
): GroupSfuConsumerRuntime {
  const frameCryptoEnabled = options.mediaEncryptionMode !== "off";
  const frameCryptoRequired = options.mediaEncryptionMode === "required";
  
  // Core state
  const remoteMediaByUserId = new Map<string, RemoteParticipantMediaInternal>();
  const consumersByProducerId = new Map<string, ManagedConsumer>();
  const remoteFrameCryptoByProducerId = new Map<string, GroupCallFrameCryptoHandle>();
  const remoteFrameKeyContextsByDeviceId = new Map<string, ReturnType<typeof mergeRemoteFrameKeyContexts>>();
  
  // Retry state for failed consume operations
  const consumeRetryByProducerId = new Map<string, ConsumeRetryState>();
  
  // Producer removal grace period - prevents rapid add/remove cycles
  const removedProducerGraceById = new Map<string, number>();
  
  // Cached producer list - refreshed on sync only
  let cachedProducerList: SfuRoomProducer[] = [];
  let cachedProducerListVersion = 0;
  
  // Runtime state
  let closed = false;
  let syncInFlight = false;
  let syncQueued = false;
  let reconciliationTimer: number | null = null;
  let lastSyncCompletedAt = 0;
  const hasDocument = typeof document !== "undefined";

  // ============================================
  // Timer management
  // ============================================

  const clearReconciliationTimer = () => {
    if (reconciliationTimer !== null) {
      clearTimeout(reconciliationTimer);
      reconciliationTimer = null;
    }
  };

  const scheduleReconciliation = () => {
    if (closed) return;
    clearReconciliationTimer();
    
    // Schedule next reconciliation
    reconciliationTimer = globalThis.window.setTimeout(() => {
      reconciliationTimer = null;
      queueRemoteSync().catch((error) => {
        logGroupCallError("[group-call] failed to sync remote producers", error);
      });
    }, 30_000); // 30 second reconciliation interval
  };

  // ============================================
  // Sync request logic
  // ============================================

  const requestRemoteSync = () => {
    if (closed) return;
    
    if (syncInFlight) {
      syncQueued = true;
      return;
    }

    queueRemoteSync().catch((error) => {
      logGroupCallError("[group-call] failed to sync remote producers", error);
    });
  };

  // ============================================
  // Producer grace period helpers
  // ============================================

  const markProducerInGracePeriod = (producerId: string) => {
    const gracePeriod = getProducerRemovalGracePeriodMs();
    removedProducerGraceById.set(producerId, Date.now() + gracePeriod);
  };

  const isProducerInGracePeriod = (producerId: string, now: number): boolean => {
    const graceUntil = removedProducerGraceById.get(producerId);
    if (!graceUntil) return false;
    
    if (graceUntil <= now) {
      removedProducerGraceById.delete(producerId);
      return false;
    }
    return true;
  };

  // ============================================
  // Consumer management
  // ============================================

  const removeManagedConsumer = (producerId: string) => {
    const managed = consumersByProducerId.get(producerId);
    if (!managed) return;

    consumersByProducerId.delete(producerId);
    
    if (remoteFrameCryptoByProducerId.has(producerId)) {
      logGroupCallInfo("[group-call] receiver frame transform detached", {
        roomId: options.roomId,
        producerId,
        userId: managed.userId,
        deviceId: managed.deviceId,
        kind: managed.kind,
        source: managed.source,
      });
    }
    
    remoteFrameCryptoByProducerId.get(producerId)?.close();
    remoteFrameCryptoByProducerId.delete(producerId);

    const participant = remoteMediaByUserId.get(managed.userId);
    if (participant) {
      if (managed.kind === "audio") {
        participant.audioStreamsByProducerId.delete(producerId);
      }
      if (managed.kind === "video") {
        participant.videoSlotsByProducerId.delete(producerId);
      }
      if (
        participant.audioStreamsByProducerId.size === 0 &&
        participant.videoSlotsByProducerId.size === 0
      ) {
        remoteMediaByUserId.delete(managed.userId);
      }
    }

    managed.consumer.track.removeEventListener("ended", managed.onTrackEnded);
    managed.consumer.close();
    emitRemoteMediaUpdate(remoteMediaByUserId, options.onRemoteMediaUpdate);
  };

  const closePartialConsumer = (consumer: MediasoupTypes.Consumer | null) => {
    if (!consumer) return;
    consumer.close();
  };

  const closeReceiverFrameCrypto = (receiverFrameCrypto: GroupCallFrameCryptoHandle | null) => {
    if (!receiverFrameCrypto) return;
    receiverFrameCrypto.close();
  };

  const consumeRemoteProducer = async (producer: SfuRoomProducer): Promise<void> => {
    if (closed || consumersByProducerId.has(producer.producerId)) {
      return;
    }

    let receiverFrameCrypto: GroupCallFrameCryptoHandle | null = null;
    let consumer: MediasoupTypes.Consumer | null = null;
    try {
      const consumed = await options.sfuHttpClient.consume(
        options.roomId,
        options.userId,
        options.recvTransport.id,
        producer.producerId,
        options.rtpCapabilities
      );

      consumer = await options.recvTransport.consume({
        id: consumed.consumerId,
        producerId: consumed.producerId,
        kind: consumed.kind,
        rtpParameters: consumed.rtpParameters as MediasoupTypes.RtpParameters,
        onRtpReceiver: producer.deviceId
          ? (rtpReceiver) => {
              if (!frameCryptoEnabled) return;
              receiverFrameCrypto = bindReceiverFrameDecryption(
                rtpReceiver,
                {
                  roomId: options.roomId,
                  deviceId: producer.deviceId!,
                  kind: consumed.kind,
                  source: producer.source ?? null,
                },
                remoteFrameKeyContextsByDeviceId.get(producer.deviceId!) ?? [],
                () => {
                  logGroupCallWarn("[sfu] receiver frame-crypto pipeline failed", {
                    roomId: options.roomId,
                    producerId: producer.producerId,
                    userId: producer.userId,
                    deviceId: producer.deviceId,
                    kind: consumed.kind,
                  });
                }
              );
              if (frameCryptoRequired && !receiverFrameCrypto.supported) {
                throw new Error("Group call frame encryption is required but unsupported by this browser");
              }
              logGroupCallInfo("[group-call] receiver frame transform attached", {
                roomId: options.roomId,
                producerId: producer.producerId,
                userId: producer.userId,
                deviceId: producer.deviceId,
                kind: consumed.kind,
                source: producer.source ?? null,
                supported: receiverFrameCrypto.supported,
              });
            }
          : undefined,
      });

      if (frameCryptoRequired && !producer.deviceId) {
        throw new Error("Group call frame encryption requires device-scoped producer metadata");
      }

      await options.sfuHttpClient.resumeConsumer(consumed.consumerId, {
        roomId: options.roomId,
        userId: options.userId,
      });

      const onTrackEnded = () => {
        removeManagedConsumer(producer.producerId);
      };

      const managed: ManagedConsumer = {
        producerId: producer.producerId,
        consumer,
        userId: producer.userId,
        deviceId: producer.deviceId ?? null,
        kind: consumed.kind,
        source: producer.source ?? null,
        onTrackEnded,
      };

      consumersByProducerId.set(producer.producerId, managed);
      if (receiverFrameCrypto) {
        remoteFrameCryptoByProducerId.set(producer.producerId, receiverFrameCrypto);
      }

      consumer.on("transportclose", () => {
        removeManagedConsumer(producer.producerId);
      });
      consumer.track.addEventListener("ended", onTrackEnded);

      const remoteEntry = upsertRemoteEntry(remoteMediaByUserId, producer.userId);
      const mediaStream = new MediaStream([consumer.track]);
      if (consumed.kind === "audio") {
        remoteEntry.audioStreamsByProducerId.set(producer.producerId, mediaStream);
      } else {
        remoteEntry.videoSlotsByProducerId.set(producer.producerId, {
          producerId: producer.producerId,
          stream: mediaStream,
          source: producer.source ?? null,
          deviceId: producer.deviceId ?? null,
        });
      }

      emitRemoteMediaUpdate(remoteMediaByUserId, options.onRemoteMediaUpdate);
    } catch (error) {
      closeReceiverFrameCrypto(receiverFrameCrypto);
      closePartialConsumer(consumer);
      throw error;
    }
  };

  const pruneInvisibleProducers = (visibleProducerIds: Set<string>) => {
    for (const producerId of consumeRetryByProducerId.keys()) {
      if (!visibleProducerIds.has(producerId)) {
        consumeRetryByProducerId.delete(producerId);
      }
    }

    for (const producerId of consumersByProducerId.keys()) {
      if (!visibleProducerIds.has(producerId)) {
        removeManagedConsumer(producerId);
      }
    }
  };

  const pruneExpiredProducerGracePeriods = (now: number) => {
    for (const [producerId, graceUntil] of removedProducerGraceById.entries()) {
      if (graceUntil <= now) {
        removedProducerGraceById.delete(producerId);
      }
    }
  };

  const shouldSkipRemoteProducer = (
    producer: SfuRoomProducer,
    retryState: ConsumeRetryState | undefined,
    now: number
  ): boolean => {
    if (consumersByProducerId.has(producer.producerId)) return true;
    if ((retryState?.retryAt ?? 0) > now) return true;
    return isProducerInGracePeriod(producer.producerId, now);
  };

  const handleConsumeRemoteProducerFailure = (
    producer: SfuRoomProducer,
    retryState: ConsumeRetryState | undefined,
    error: unknown
  ): void => {
    const previousAttempts = retryState?.attempts ?? 0;
    const nextAttempts = previousAttempts + 1;
    const retryDelayMs = computeConsumeRetryDelayMs(nextAttempts);
    consumeRetryByProducerId.set(producer.producerId, {
      retryAt: Date.now() + retryDelayMs,
      attempts: nextAttempts,
    });
    logGroupCallError(
      "[group-call] skipping remote producer after consume failure",
      {
        producerId: producer.producerId,
        userId: producer.userId,
        deviceId: producer.deviceId ?? null,
        source: producer.source ?? null,
        attempts: nextAttempts,
        retryDelayMs,
        error,
      }
    );
  };

  // ============================================
  // Core sync logic
  // ============================================

  const doSyncRemoteProducers = async (): Promise<void> => {
    if (closed) return;

    // Refresh producer list from SFU
    const producers = await options.sfuHttpClient.listRoomProducers(options.roomId);
    cachedProducerList = producers;
    cachedProducerListVersion++;

    const remoteProducers = filterRemoteProducersForConsume(producers, {
      userId: options.userId,
      deviceId: options.deviceId,
      localProducerIds: options.getLocalProducerIds(),
    });
    const nextRemoteProducers = dedupeRemoteProducersBySlot(remoteProducers);
    const visibleProducerIds = new Set(nextRemoteProducers.map((p) => p.producerId));
    const now = Date.now();

    pruneInvisibleProducers(visibleProducerIds);
    pruneExpiredProducerGracePeriods(now);

    // Try to consume visible producers
    for (const producer of nextRemoteProducers) {
      const retryState = consumeRetryByProducerId.get(producer.producerId);
      if (shouldSkipRemoteProducer(producer, retryState, now)) {
        continue;
      }

      try {
        await consumeRemoteProducer(producer);
        consumeRetryByProducerId.delete(producer.producerId);
      } catch (error) {
        handleConsumeRemoteProducerFailure(producer, retryState, error);
      }
    }

    lastSyncCompletedAt = Date.now();
    emitRemoteMediaUpdate(remoteMediaByUserId, options.onRemoteMediaUpdate);
  };

  const queueRemoteSync = async (): Promise<void> => {
    if (closed) return;
    if (syncInFlight) {
      syncQueued = true;
      return;
    }

    syncInFlight = true;
    try {
      do {
        syncQueued = false;
        await doSyncRemoteProducers();
      } while (syncQueued && !closed);
    } finally {
      syncInFlight = false;
      scheduleReconciliation();
    }
  };

  // ============================================
  // WebSocket signal handling
  // ============================================

  const unsubscribeProducerSignals = options.wsClient.on((message) => {
    if (message.type !== "group.call.producer_state") {
      return;
    }
    if (message.callId !== options.roomId) {
      return;
    }
    if (message.deviceId === options.deviceId) {
      return;
    }

    if (message.state === "removed") {
      // Producer was explicitly removed
      consumeRetryByProducerId.delete(message.producerId);
      markProducerInGracePeriod(message.producerId);
      
      const managed = consumersByProducerId.get(message.producerId);
      if (
        managed?.userId === message.userId &&
        managed?.deviceId === message.deviceId
      ) {
        removeManagedConsumer(message.producerId);
      }
      return;
    }

    // Producer added or updated - trigger sync
    removedProducerGraceById.delete(message.producerId);
    requestRemoteSync();
  });

  // ============================================
  // Media key handling
  // ============================================

  const handleVisibilityChange = () => {
    if (closed || typeof document === "undefined") return;
    
    // Trigger sync when page becomes visible
    // (WS signals should handle most cases, this is a fallback)
    if (!document.hidden) {
      requestRemoteSync();
    }
  };

  if (hasDocument) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  // ============================================
  // Public API
  // ============================================

  return {
    syncRemoteProducers: async () => {
      await queueRemoteSync();
    },
    removeParticipantMedia: (userId: string) => {
      // Collect all producer IDs belonging to this user before mutating the map.
      const producerIds = [...consumersByProducerId.entries()]
        .filter(([, managed]) => managed.userId === userId)
        .map(([producerId]) => producerId);

      for (const producerId of producerIds) {
        // Grace period prevents the next sync from immediately re-consuming a
        // producer that may still appear in the SFU's producer list.
        markProducerInGracePeriod(producerId);
        consumeRetryByProducerId.delete(producerId);
        removeManagedConsumer(producerId);
      }

      // Safety net: clear the participant entry if it survived without consumers
      // (shouldn't happen in normal flow, but prevents stale snapshot emissions).
      if (remoteMediaByUserId.has(userId)) {
        remoteMediaByUserId.delete(userId);
        emitRemoteMediaUpdate(remoteMediaByUserId, options.onRemoteMediaUpdate);
      }
    },
    setRemoteMediaKey: (senderDeviceId, mediaKey) => {
      if (!frameCryptoEnabled || !senderDeviceId) return;

      const nextKeyContexts = mergeRemoteFrameKeyContexts(
        remoteFrameKeyContextsByDeviceId.get(senderDeviceId),
        mediaKey ? toFrameKeyContext(mediaKey) : null
      );
      if (nextKeyContexts.length > 0) {
        remoteFrameKeyContextsByDeviceId.set(senderDeviceId, nextKeyContexts);
      } else {
        remoteFrameKeyContextsByDeviceId.delete(senderDeviceId);
      }

      for (const managed of consumersByProducerId.values()) {
        if (managed.deviceId !== senderDeviceId) continue;
        remoteFrameCryptoByProducerId.get(managed.producerId)?.setKeyContexts(nextKeyContexts);
      }
      logGroupCallInfo("[group-call] remote media key applied", {
        roomId: options.roomId,
        senderDeviceId,
        keyId: mediaKey?.keyId,
      });
    },
    getDebugSnapshot: () => ({
      roomId: options.roomId,
      cachedProducerListVersion,
      cachedProducerCount: cachedProducerList.length,
      consumers: [...consumersByProducerId.values()].map((managed) => ({
        producerId: managed.producerId,
        consumerId: managed.consumer.id,
        userId: managed.userId,
        deviceId: managed.deviceId,
        kind: managed.kind,
        source: managed.source,
        paused: managed.consumer.paused,
        producerPaused: "producerPaused" in managed.consumer
          ? (managed.consumer as MediasoupTypes.Consumer & { producerPaused?: boolean }).producerPaused ?? null
          : null,
        closed: managed.consumer.closed,
        track: snapshotMediaTrack(managed.consumer.track),
      })),
      retryStates: [...consumeRetryByProducerId.entries()].map(([producerId, retryState]) => ({
        producerId,
        retryAt: retryState.retryAt,
        attempts: retryState.attempts,
      })),
      gracePeriodStates: [...removedProducerGraceById.entries()].map(([producerId, graceUntil]) => ({
        producerId,
        graceUntil,
      })),
      remoteFrameCryptoByProducerId: [...remoteFrameCryptoByProducerId.entries()].map(([producerId, handle]) => ({
        producerId,
        supported: handle.supported,
      })),
      participants: [...remoteMediaByUserId.values()].map((participant) => ({
        userId: participant.userId,
        audioStreams: [...participant.audioStreamsByProducerId.keys()],
        videoSlots: [...participant.videoSlotsByProducerId.values()].map((slot) => ({
          producerId: slot.producerId,
          source: slot.source,
        })),
      })),
      lastSyncCompletedAt,
      syncInFlight,
    }),
    close: () => {
      if (closed) return;
      closed = true;
      clearReconciliationTimer();
      unsubscribeProducerSignals();
      if (hasDocument) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }

      for (const producerId of consumersByProducerId.keys()) {
        removeManagedConsumer(producerId);
      }
    },
  };
}
