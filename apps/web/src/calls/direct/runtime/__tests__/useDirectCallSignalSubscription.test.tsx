// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IncomingCallAnsweredSignal,
  IncomingCallMediaStateSignal,
  IncomingCallOfferSignal,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";

const wsMock = vi.hoisted(() => {
  const cleanup = vi.fn();
  const on = vi.fn(() => cleanup);
  return { on, cleanup };
});

const dispatchMock = vi.hoisted(() => ({
  dispatchDirectCallSignal: vi.fn(),
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: { on: wsMock.on },
}));

vi.mock(
  "@/calls/direct/runtime/signal/direct-call-signal-dispatch",
  () => dispatchMock,
);

import { useDirectCallSignalSubscription } from "@/calls/direct/runtime/signal/useDirectCallSignalSubscription";

function createOffer(): IncomingCallOfferSignal {
  return {
    type: "call.offer",
    callId: "11111111-1111-4111-8111-111111111111",
    callerUserId: "22222222-2222-4222-8222-222222222222",
    callerDeviceId: "33333333-3333-4333-8333-333333333333",
    callerLabel: "Alice",
    callType: "video",
    targetUserId: "44444444-4444-4444-8444-444444444444",
    sdp: "offer-sdp",
    mediaEncryptionOffer: {
      preferredMode: "transport",
      supportedModes: ["transport"],
    },
    supportsRenegotiationV1: true,
  };
}

function HookHarness(props: { onOffer: () => void }) {
  useDirectCallSignalSubscription({
    onOffer: props.onOffer,
    onAnswered: vi.fn(),
    onRenegotiationOffer: vi.fn(),
    onRenegotiationAnswer: vi.fn(),
    onIceCandidate: vi.fn(),
    onMediaState: vi.fn(),
    onHangup: vi.fn(),
    onRejected: vi.fn(),
    onError: vi.fn(),
  });
  return null;
}

describe("useDirectCallSignalSubscription", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
    wsMock.on.mockClear();
    wsMock.cleanup.mockClear();
    dispatchMock.dispatchDirectCallSignal.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("subscribes to wsClient.on on mount", () => {
    act(() =>
      root.render(<HookHarness onOffer={vi.fn()} />),
    );

    expect(wsMock.on).toHaveBeenCalledTimes(1);
    expect(typeof wsMock.on.mock.calls[0][0]).toBe("function");
  });

  it("calls cleanup function on unmount", () => {
    act(() =>
      root.render(<HookHarness onOffer={vi.fn()} />),
    );

    act(() => root.unmount());

    expect(wsMock.cleanup).toHaveBeenCalledTimes(1);
  });

  it("forwards incoming messages to dispatchDirectCallSignal", () => {
    const onOffer = vi.fn();

    act(() =>
      root.render(<HookHarness onOffer={onOffer} />),
    );

    const callback = wsMock.on.mock.calls[0][0];
    const offer = createOffer();
    callback(offer);

    expect(dispatchMock.dispatchDirectCallSignal).toHaveBeenCalledTimes(1);
    expect(dispatchMock.dispatchDirectCallSignal).toHaveBeenCalledWith(
      offer,
      expect.objectContaining({ onOffer }),
    );
  });

  it("resubscribes when handlers change", () => {
    const onOffer1 = vi.fn();
    const onOffer2 = vi.fn();

    act(() =>
      root.render(<HookHarness onOffer={onOffer1} />),
    );
    expect(wsMock.on).toHaveBeenCalledTimes(1);

    act(() =>
      root.render(<HookHarness onOffer={onOffer2} />),
    );
    expect(wsMock.cleanup).toHaveBeenCalledTimes(1);
    expect(wsMock.on).toHaveBeenCalledTimes(2);

    const callback = wsMock.on.mock.calls[1][0];
    callback(createOffer());

    expect(dispatchMock.dispatchDirectCallSignal).toHaveBeenCalledWith(
      createOffer(),
      expect.objectContaining({ onOffer: onOffer2 }),
    );
  });
});
