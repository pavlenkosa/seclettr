import type { WsClientMessage, WsServerMessage } from "@seclettr/protocol";
import type { WsSendResult } from "@/lib/websocket";

const DEFAULT_RETRY_DELAYS_MS = [1_500, 4_000, 9_000] as const;
const DEFAULT_QUEUE_TTL_MS = 15_000;

type MediaKeyShareMessage = Extract<WsClientMessage, { type: "group.call.media-key" }>;
type MediaKeyAckMessage = Extract<WsServerMessage, { type: "group.call.media-key.ack" }>;

interface PendingDelivery {
  payload: MediaKeyShareMessage;
  nextRetryIndex: number;
  timer: ReturnType<typeof globalThis.setTimeout> | null;
  exhausted: boolean;
}

type ShareSendStatus = WsSendResult["status"] | "already-delivered" | "already-pending";

export interface GroupCallMediaKeyDeliveryTracker {
  share: (payload: MediaKeyShareMessage) => ShareSendStatus;
  acknowledge: (signal: MediaKeyAckMessage) => string | null;
  isDelivered: (targetDeviceId: string, keyId: string) => boolean;
  clear: () => void;
}

function buildDeliveryKey(targetDeviceId: string, keyId: string): string {
  return `${targetDeviceId}:${keyId}`;
}

function buildQueueKey(callId: string, targetDeviceId: string, keyId: string): string {
  return `group.call.media-key:${callId}:${targetDeviceId}:${keyId}`;
}

export interface GroupCallMediaKeyDeliveryStore {
  load: () => Set<string>;
  add: (deliveryKey: string) => void;
  clear: () => void;
}

export function createGroupCallMediaKeyDeliveryTracker(params: {
  callId: string;
  localDeviceId: string;
  send: (message: MediaKeyShareMessage, options: { queueIfDisconnected: true; queueKey: string; ttlMs: number }) => WsSendResult;
  retryDelaysMs?: readonly number[];
  queueTtlMs?: number;
  onDeliveryExhausted?: (payload: MediaKeyShareMessage) => void;
  deliveredStore?: GroupCallMediaKeyDeliveryStore;
}): GroupCallMediaKeyDeliveryTracker {
  const retryDelaysMs = params.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const queueTtlMs = params.queueTtlMs ?? DEFAULT_QUEUE_TTL_MS;
  const store = params.deliveredStore;
  const pending = new Map<string, PendingDelivery>();
  const delivered: Set<string> = store ? store.load() : new Set<string>();

  const sendAndScheduleRetry = (deliveryKey: string): WsSendResult["status"] => {
    const current = pending.get(deliveryKey);
    if (!current) {
      return "dropped";
    }

    const sendResult = params.send(current.payload, {
      queueIfDisconnected: true,
      queueKey: buildQueueKey(params.callId, current.payload.targetDeviceId, current.payload.keyId),
      ttlMs: queueTtlMs,
    }).status;

    if (current.timer) {
      clearTimeout(current.timer);
      current.timer = null;
    }

    if (current.nextRetryIndex >= retryDelaysMs.length) {
      current.exhausted = true;
      pending.set(deliveryKey, current);
      params.onDeliveryExhausted?.(current.payload);
      return sendResult;
    }

    const delayMs = retryDelaysMs[current.nextRetryIndex] ?? 0;
    current.nextRetryIndex += 1;
    current.timer = globalThis.setTimeout(() => {
      const latest = pending.get(deliveryKey);
      if (!latest || latest.exhausted) return;
      sendAndScheduleRetry(deliveryKey);
    }, delayMs);
    pending.set(deliveryKey, current);
    return sendResult;
  };

  return {
    share(payload) {
      if (payload.callId !== params.callId) {
        return "dropped";
      }

      const deliveryKey = buildDeliveryKey(payload.targetDeviceId, payload.keyId);
      if (delivered.has(deliveryKey)) {
        return "already-delivered";
      }

      const existing = pending.get(deliveryKey);
      if (existing && !existing.exhausted) {
        return "already-pending";
      }

      const next = existing ?? {
        payload,
        nextRetryIndex: 0,
        timer: null,
        exhausted: false,
      };
      next.payload = payload;
      next.exhausted = false;
      next.nextRetryIndex = 0;
      pending.set(deliveryKey, next);
      return sendAndScheduleRetry(deliveryKey);
    },

    acknowledge(signal) {
      if (signal.callId !== params.callId) return null;
      if (signal.targetDeviceId !== params.localDeviceId) return null;

      const deliveryKey = buildDeliveryKey(signal.senderDeviceId, signal.keyId);
      const entry = pending.get(deliveryKey);
      if (!entry) return null;

      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      pending.delete(deliveryKey);
      delivered.add(deliveryKey);
      store?.add(deliveryKey);
      return signal.senderDeviceId;
    },

    isDelivered(targetDeviceId, keyId) {
      return delivered.has(buildDeliveryKey(targetDeviceId, keyId));
    },

    clear() {
      for (const entry of pending.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
      }
      pending.clear();
      delivered.clear();
      store?.clear();
    },
  };
}
