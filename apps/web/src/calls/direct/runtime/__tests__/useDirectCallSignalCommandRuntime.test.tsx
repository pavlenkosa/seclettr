// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectCallSignalCommandRuntime } from "@/calls/direct/runtime/signal/useDirectCallSignalCommandRuntime";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";

describe("useDirectCallSignalCommandRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("does not route renegotiation answer for a different active call", () => {
    const handleIncomingRenegotiationAnswer = vi.fn(async () => undefined);
    const capture = vi.fn();

    function Harness() {
      const handlers = useDirectCallSignalCommandRuntime({
        activeRef: {
          current: {
            callId: "call-active",
            peerUserId: "peer-1",
            peerDeviceId: "device-1",
            peerLabel: "Peer One",
            callType: "video",
            direction: "outbound",
            state: "active",
            muted: false,
            videoOff: false,
            screenSharing: false,
            duration: 0,
            signalingVerified: true,
            e2eeActive: true,
            verificationCode: null,
            verificationHash: null,
            verificationError: null,
            mediaEncryptionMode: "frame-v1",
            peerSupportsRenegotiationV1: true,
          } satisfies ActiveCall,
        },
        peerConnectionRef: { current: null },
        lastSignalingErrorRef: { current: null },
        lastRenegotiationAttemptRef: { current: null },
        debugCallMedia: vi.fn(),
        finishCallSession: vi.fn(),
        handleRemoteAnswer: vi.fn(async () => undefined),
        handleIncomingRenegotiationOffer: vi.fn(async () => undefined),
        handleIncomingRenegotiationAnswer,
        t: (key: string) => key,
      });
      capture(handlers);
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    const handlers = capture.mock.calls[0][0] as ReturnType<typeof useDirectCallSignalCommandRuntime>;

    act(() => {
      handlers.handleRenegotiationAnswerSignal({
        type: "call.renegotiate.answer",
        callId: "call-other",
        senderUserId: "peer-2",
        senderDeviceId: "device-2",
        revision: 7,
        sdp: "answer-sdp",
      });
    });

    expect(handleIncomingRenegotiationAnswer).not.toHaveBeenCalled();
  });
});
