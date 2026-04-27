import type { SfuRoomProducer } from "@seclettr/protocol";
export type { SfuProducerSource } from "@seclettr/protocol";

/**
 * Simplified producer sync utilities.
 * 
 * Design principles:
 * 1. WS signals are authoritative for topology changes
 * 2. Periodic reconciliation as a safety net only
 * 3. Simple retry delays (no exponential backoff)
 * 4. Clear producer state transitions
 */

// Reasonable retry delay for failed consume operations
const CONSUME_RETRY_DELAY_MS = 2_000;
// Time to wait before allowing re-subscription after explicit removal
const PRODUCER_REMOVAL_GRACE_PERIOD_MS = 5_000;
// Periodic reconciliation interval as safety net (much longer than before)
const RECONCILIATION_INTERVAL_MS = 30_000;

/**
 * Build a unique slot key for a producer.
 * This is used to deduplicate producers by user+device+kind+source.
 */
function buildRemoteProducerSlotKey(producer: SfuRoomProducer): string {
  const sourceKey = producer.source ?? "none";
  const deviceKey = producer.deviceId ?? producer.sessionId ?? producer.producerId;
  return `${producer.userId}:${deviceKey}:${producer.kind}:${sourceKey}`;
}

/**
 * Deduplicate producers by slot.
 * If multiple producers exist for the same slot, keep the most recent one.
 */
export function dedupeRemoteProducersBySlot(
  producers: SfuRoomProducer[]
): SfuRoomProducer[] {
  const dedupedRemoteProducers = new Map<string, SfuRoomProducer>();
  for (const producer of producers) {
    dedupedRemoteProducers.set(buildRemoteProducerSlotKey(producer), producer);
  }
  return [...dedupedRemoteProducers.values()];
}

/**
 * Filter producers to only include remote producers that should be consumed.
 * Excludes local producers and own device's producers.
 */
export function filterRemoteProducersForConsume(
  producers: SfuRoomProducer[],
  options: {
    userId: string;
    deviceId: string;
    localProducerIds: ReadonlySet<string>;
  }
): SfuRoomProducer[] {
  return producers.filter((producer) => {
    // Exclude local producers
    if (options.localProducerIds.has(producer.producerId)) {
      return false;
    }
    // Exclude own device's producers
    return !(producer.userId === options.userId && producer.deviceId === options.deviceId);
  });
}

/**
 * Compute retry delay for failed consume operations.
 * Simplified: fixed delay instead of exponential backoff.
 */
export function computeConsumeRetryDelayMs(_attempts: number): number {
  return CONSUME_RETRY_DELAY_MS;
}

/**
 * Get the next retry time from a map of producer retry states.
 */
export function getNextRemoteConsumeRetryAt(
  retryStates: ReadonlyMap<string, { retryAt: number; attempts: number }>
): number | null {
  let nextRetryAt: number | null = null;
  for (const retryState of retryStates.values()) {
    if (nextRetryAt === null || retryState.retryAt < nextRetryAt) {
      nextRetryAt = retryState.retryAt;
    }
  }
  return nextRetryAt;
}

/**
 * Compute the next reconciliation delay.
 * Simplified: single interval, no visibility-dependent delays.
 */
export function computeRemoteSyncDelayMs(_options: {
  now: number;
  nextRetryAt: number | null;
  pageHidden: boolean;
}): number {
  // Simplified: return the reconciliation interval
  // The visibility-dependent fallback polling has been removed
  return RECONCILIATION_INTERVAL_MS;
}

/**
 * Get the grace period for producer removal.
 */
export function getProducerRemovalGracePeriodMs(): number {
  return PRODUCER_REMOVAL_GRACE_PERIOD_MS;
}


