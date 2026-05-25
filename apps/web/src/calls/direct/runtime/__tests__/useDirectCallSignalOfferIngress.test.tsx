// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessagesState = {
  conversations: Record<string, unknown>;
};

type PlainMessagesState = {
  conversations: Record<string, unknown>;
};

const messagesState = vi.hoisted<MessagesState>(() => ({
  conversations: {},
}));

const plainMessagesState = vi.hoisted<PlainMessagesState>(() => ({
  conversations: {},
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: {
    getState: () => messagesState,
  },
}));

vi.mock("@/stores/plain", () => ({
  usePlainMessagesStore: {
    getState: () => plainMessagesState,
  },
}));

import { useDirectCallSignalOfferIngress } from "@/calls/direct/runtime/signal/useDirectCallSignalOfferIngress";
import type { IncomingCall } from "@/calls/direct/model/direct-call-types";

describe("useDirectCallSignalOfferIngress", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    messagesState.conversations = {};
    plainMessagesState.conversations = {};
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("marks inbound call as plain and opens the dock when only plain conversation exists", () => {
    plainMessagesState.conversations = {
      "peer-plain": { id: "peer-plain" },
    };

    const callChatKindRef = { current: null as "plain" | "e2ee" | null };
    const setIncoming = vi.fn();
    const setActive = vi.fn();
    const setIsMinimized = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const capture = vi.fn();

    function Harness() {
      const handlers = useDirectCallSignalOfferIngress({
        activeRef: { current: null },
        incomingRef: { current: null },
        acceptingIncomingCallRef: { current: null },
        setActive,
        setIncoming,
        setIsMinimized,
        ensureConversationUsername: vi.fn(async () => null),
        resetMinimizedDockState,
        resolvePeerLabel: (userId: string) => userId,
        callChatKindRef,
        rejectIncomingCall: vi.fn(),
        debugCallMedia: vi.fn(),
      });
      capture(handlers);
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    const handlers = capture.mock.calls[0][0] as ReturnType<typeof useDirectCallSignalOfferIngress>;

    act(() => {
      handlers.handleIncomingOfferSignal({
        type: "call.offer",
        callId: "call-plain",
        callerUserId: "peer-plain",
        callerDeviceId: "device-plain",
        targetUserId: "user-1",
        sdp: "offer-sdp",
        callType: "audio",
      });
    });

    expect(callChatKindRef.current).toBe("plain");
    expect(setIsMinimized).toHaveBeenCalledWith(false);
    expect(resetMinimizedDockState).toHaveBeenCalled();
    expect(setIncoming).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-plain",
      callerUserId: "peer-plain",
      callerLabel: "peer-plain",
      callType: "audio",
      offerSdp: "offer-sdp",
    } satisfies Partial<IncomingCall>));
  });

  it("prefers advertised inbound chat kind over local conversation heuristic", () => {
    messagesState.conversations = {
      "peer-mixed": { id: "peer-mixed" },
    };
    plainMessagesState.conversations = {
      "peer-mixed": { id: "peer-mixed" },
    };

    const callChatKindRef = { current: null as "plain" | "e2ee" | null };
    const capture = vi.fn();

    function Harness() {
      const handlers = useDirectCallSignalOfferIngress({
        activeRef: { current: null },
        incomingRef: { current: null },
        acceptingIncomingCallRef: { current: null },
        setActive: vi.fn(),
        setIncoming: vi.fn(),
        setIsMinimized: vi.fn(),
        ensureConversationUsername: vi.fn(async () => null),
        resetMinimizedDockState: vi.fn(),
        resolvePeerLabel: (userId: string) => userId,
        callChatKindRef,
        rejectIncomingCall: vi.fn(),
        debugCallMedia: vi.fn(),
      });
      capture(handlers);
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    const handlers = capture.mock.calls[0][0] as ReturnType<typeof useDirectCallSignalOfferIngress>;

    act(() => {
      handlers.handleIncomingOfferSignal({
        type: "call.offer",
        callId: "call-mixed",
        callerUserId: "peer-mixed",
        callerDeviceId: "device-mixed",
        targetUserId: "user-1",
        sdp: "offer-sdp",
        callType: "audio",
        chatKind: "plain",
      });
    });

    expect(callChatKindRef.current).toBe("plain");
  });
});
