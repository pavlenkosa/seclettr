import { useCallback, type MutableRefObject } from "react";
import { wsClient } from "@/lib/websocket";
import {
  ICE_BATCH_FLUSH_MS,
  ICE_BATCH_MAX_ITEMS,
  type DirectCallOutgoingIceBatchState,
} from "@/calls/direct/model/direct-call-types";

export function useDirectCallIceBatch(
  outgoingIceBatchRef: MutableRefObject<DirectCallOutgoingIceBatchState>
) {
  const flushOutgoingIceBatch = useCallback((callId?: string) => {
    const batch = outgoingIceBatchRef.current;
    if (!batch.callId || batch.candidates.length === 0) return;
    if (callId && batch.callId !== callId) return;

    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    const candidates = batch.candidates.splice(0, batch.candidates.length);
    if (candidates.length === 1) {
      wsClient.send({
        type: "call.ice",
        callId: batch.callId,
        candidate: candidates[0]!,
      });
      return;
    }

    wsClient.send({
      type: "call.ice.batch",
      callId: batch.callId,
      candidates,
    });
  }, [outgoingIceBatchRef]);

  const resetOutgoingIceBatch = useCallback(() => {
    const batch = outgoingIceBatchRef.current;
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }
    batch.callId = null;
    batch.candidates = [];
  }, [outgoingIceBatchRef]);

  const enqueueOutgoingIceCandidate = useCallback((callId: string, candidate: string) => {
    const batch = outgoingIceBatchRef.current;

    if (batch.callId && batch.callId !== callId) {
      if (batch.timer) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
      batch.candidates = [];
    }

    batch.callId = callId;
    batch.candidates.push(candidate);

    if (batch.candidates.length >= ICE_BATCH_MAX_ITEMS) {
      flushOutgoingIceBatch(callId);
      return;
    }

    batch.timer ??= globalThis.window.setTimeout(() => {
      outgoingIceBatchRef.current.timer = null;
      flushOutgoingIceBatch(callId);
    }, ICE_BATCH_FLUSH_MS);
  }, [flushOutgoingIceBatch, outgoingIceBatchRef]);

  return {
    flushOutgoingIceBatch,
    resetOutgoingIceBatch,
    enqueueOutgoingIceCandidate,
  };
}
