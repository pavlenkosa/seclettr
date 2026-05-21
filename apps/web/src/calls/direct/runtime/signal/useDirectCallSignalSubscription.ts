import { useEffect } from "react";
import { wsClient } from "@/lib/websocket";
import {
  type DirectCallSignalHandlers,
  dispatchDirectCallSignal,
} from "@/calls/direct/runtime/signal/direct-call-signal-dispatch";

export function useDirectCallSignalSubscription(params: DirectCallSignalHandlers): void {
  const {
    onOffer,
    onAnswered,
    onRenegotiationOffer,
    onRenegotiationAnswer,
    onIceCandidate,
    onMediaState,
    onHangup,
    onRejected,
    onError,
  } = params;

  useEffect(() => {
    return wsClient.on((message) => {
      dispatchDirectCallSignal(message, {
        onOffer,
        onAnswered,
        onRenegotiationOffer,
        onRenegotiationAnswer,
        onIceCandidate,
        onMediaState,
        onHangup,
        onRejected,
        onError,
      });
    });
  }, [
    onAnswered,
    onError,
    onHangup,
    onIceCandidate,
    onMediaState,
    onOffer,
    onRejected,
    onRenegotiationAnswer,
    onRenegotiationOffer,
  ]);
}
