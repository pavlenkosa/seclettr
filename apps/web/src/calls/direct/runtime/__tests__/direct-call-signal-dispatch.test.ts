import { describe, expect, it, vi } from "vitest";
import {
  dispatchDirectCallSignal,
  type DirectCallSignalHandlers,
} from "@/calls/direct/runtime/signal/direct-call-signal-dispatch";

function createHandlers(): DirectCallSignalHandlers {
  return {
    onOffer: vi.fn(),
    onAnswered: vi.fn(),
    onRenegotiationOffer: vi.fn(),
    onRenegotiationAnswer: vi.fn(),
    onIceCandidate: vi.fn(),
    onMediaState: vi.fn(),
    onHangup: vi.fn(),
    onRejected: vi.fn(),
    onError: vi.fn(),
  };
}

describe("dispatchDirectCallSignal", () => {
  it("routes direct-call signaling messages to the matching handlers", () => {
    const handlers = createHandlers();

    const offer = {
      type: "call.offer",
      callId: "11111111-1111-4111-8111-111111111111",
      callerUserId: "22222222-2222-4222-8222-222222222222",
      callerDeviceId: "33333333-3333-4333-8333-333333333333",
      targetUserId: "44444444-4444-4444-8444-444444444444",
      sdp: "offer-sdp",
      callType: "audio",
    } as const;
    const answered = {
      type: "call.answered",
      callId: offer.callId,
      answererUserId: "55555555-5555-4555-8555-555555555555",
      sdp: "answer-sdp",
    } as const;
    const renegotiateOffer = {
      type: "call.renegotiate.offer",
      callId: offer.callId,
      revision: 1,
      senderUserId: offer.callerUserId,
      senderDeviceId: offer.callerDeviceId,
      sdp: "renegotiate-offer",
    } as const;
    const renegotiateAnswer = {
      type: "call.renegotiate.answer",
      callId: offer.callId,
      revision: 1,
      senderUserId: offer.targetUserId,
      senderDeviceId: "66666666-6666-4666-8666-666666666666",
      sdp: "renegotiate-answer",
    } as const;
    const mediaState = {
      type: "call.media_state",
      callId: offer.callId,
      senderUserId: offer.callerUserId,
      senderDeviceId: offer.callerDeviceId,
      source: "camera",
      state: "on",
      activity: "active",
      seq: 1,
      changedAt: "2026-03-08T00:00:00.000Z",
    } as const;
    const hangup = {
      type: "call.hangup",
      callId: offer.callId,
    } as const;
    const rejected = {
      type: "call.rejected",
      callId: offer.callId,
    } as const;
    const error = {
      type: "error",
      code: "CALL_RENEGOTIATION_UNSUPPORTED",
      message: "unsupported",
    } as const;

    dispatchDirectCallSignal(offer, handlers);
    dispatchDirectCallSignal(answered, handlers);
    dispatchDirectCallSignal(renegotiateOffer, handlers);
    dispatchDirectCallSignal(renegotiateAnswer, handlers);
    dispatchDirectCallSignal(mediaState, handlers);
    dispatchDirectCallSignal(hangup, handlers);
    dispatchDirectCallSignal(rejected, handlers);
    dispatchDirectCallSignal(error, handlers);

    expect(handlers.onOffer).toHaveBeenCalledWith(offer);
    expect(handlers.onAnswered).toHaveBeenCalledWith(answered);
    expect(handlers.onRenegotiationOffer).toHaveBeenCalledWith(renegotiateOffer);
    expect(handlers.onRenegotiationAnswer).toHaveBeenCalledWith(renegotiateAnswer);
    expect(handlers.onMediaState).toHaveBeenCalledWith(mediaState);
    expect(handlers.onHangup).toHaveBeenCalledWith(offer.callId);
    expect(handlers.onRejected).toHaveBeenCalledWith(offer.callId);
    expect(handlers.onError).toHaveBeenCalledWith(error);
  });

  it("parses single and batched ICE candidates before dispatch", () => {
    const handlers = createHandlers();

    dispatchDirectCallSignal({
      type: "call.ice",
      callId: "11111111-1111-4111-8111-111111111111",
      candidate: JSON.stringify({ candidate: "candidate-a", sdpMid: "0" }),
    }, handlers);
    dispatchDirectCallSignal({
      type: "call.ice.batch",
      callId: "11111111-1111-4111-8111-111111111111",
      candidates: [
        JSON.stringify({ candidate: "candidate-b", sdpMid: "0" }),
        JSON.stringify({ candidate: "candidate-c", sdpMid: "1" }),
      ],
    }, handlers);

    expect(handlers.onIceCandidate).toHaveBeenCalledTimes(3);
    expect(handlers.onIceCandidate).toHaveBeenNthCalledWith(1, "11111111-1111-4111-8111-111111111111", {
      candidate: "candidate-a",
      sdpMid: "0",
    });
    expect(handlers.onIceCandidate).toHaveBeenNthCalledWith(3, "11111111-1111-4111-8111-111111111111", {
      candidate: "candidate-c",
      sdpMid: "1",
    });
  });

  it("drops malformed ICE payloads and keeps valid batch entries", () => {
    const handlers = createHandlers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    dispatchDirectCallSignal({
      type: "call.ice",
      callId: "11111111-1111-4111-8111-111111111111",
      candidate: "{broken",
    }, handlers);
    dispatchDirectCallSignal({
      type: "call.ice.batch",
      callId: "11111111-1111-4111-8111-111111111111",
      candidates: ["{broken", JSON.stringify({ candidate: "candidate-ok", sdpMid: "0" })],
    }, handlers);

    expect(handlers.onIceCandidate).toHaveBeenCalledTimes(1);
    expect(handlers.onIceCandidate).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      candidate: "candidate-ok",
      sdpMid: "0",
    });
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});
