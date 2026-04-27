import type { WsServerMessage } from "@seclettr/protocol";
import type {
  IncomingCallAnsweredSignal,
  IncomingCallMediaStateSignal,
  IncomingCallOfferSignal,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import { logger } from "@/lib/logger.js";

export type DirectCallErrorSignal = Extract<WsServerMessage, { type: "error" }>;

export interface DirectCallSignalHandlers {
  onOffer: (message: IncomingCallOfferSignal) => void;
  onAnswered: (message: IncomingCallAnsweredSignal) => void;
  onRenegotiationOffer: (message: IncomingCallRenegotiationOfferSignal) => void;
  onRenegotiationAnswer: (message: IncomingCallRenegotiationAnswerSignal) => void;
  onIceCandidate: (callId: string, candidate: RTCIceCandidateInit) => void;
  onMediaState: (message: IncomingCallMediaStateSignal) => void;
  onHangup: (callId: string) => void;
  onRejected: (callId: string) => void;
  onError: (message: DirectCallErrorSignal) => void;
}

export function dispatchDirectCallSignal(
  message: WsServerMessage,
  handlers: DirectCallSignalHandlers
): void {
  switch (message.type) {
    case "call.offer":
      handlers.onOffer(message);
      return;

    case "call.answered":
      handlers.onAnswered(message);
      return;

    case "call.renegotiate.offer":
      handlers.onRenegotiationOffer(message);
      return;

    case "call.renegotiate.answer":
      handlers.onRenegotiationAnswer(message);
      return;

    case "call.ice": {
      const candidate = parseIceCandidatePayload(message.candidate);
      if (!candidate) {
        logger.warn("[CALL] invalid ICE candidate payload");
        return;
      }
      handlers.onIceCandidate(message.callId, candidate);
      return;
    }

    case "call.ice.batch":
      for (const rawCandidate of message.candidates) {
        const candidate = parseIceCandidatePayload(rawCandidate);
        if (!candidate) {
          logger.warn("[CALL] invalid ICE candidate payload in batch");
          continue;
        }
        handlers.onIceCandidate(message.callId, candidate);
      }
      return;

    case "call.media_state":
      handlers.onMediaState(message);
      return;

    case "call.hangup":
      handlers.onHangup(message.callId);
      return;

    case "call.rejected":
      handlers.onRejected(message.callId);
      return;

    case "error":
      handlers.onError(message);
      return;

    default:
      return;
  }
}

function parseIceCandidatePayload(rawCandidate: string): RTCIceCandidateInit | null {
  try {
    return JSON.parse(rawCandidate) as RTCIceCandidateInit;
  } catch {
    return null;
  }
}
