import { useEffect } from "react";
import { wsClient } from "@/lib/websocket";
import {
  dispatchDirectCallSignal,
  type DirectCallSignalHandlers,
} from "@/calls/direct/runtime/direct-call-signal-dispatch";

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
