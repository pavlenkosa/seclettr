// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessagesState = {
  conversations: Record<string, { username?: string }>;
  recordCallEvent: ReturnType<typeof vi.fn>;
};

const messagesState = vi.hoisted<MessagesState>(() => ({
  conversations: {},
  recordCallEvent: vi.fn(),
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: {
    getState: () => messagesState,
  },
}));

import { useDirectCallUiFeedback } from "@/calls/direct/runtime/useDirectCallUiFeedback";
import type { CallNotice } from "@/calls/direct/model/direct-call-types";

type UiFeedbackHandlers = ReturnType<typeof useDirectCallUiFeedback>;

function createStateDispatch<T>(
  ref: MutableRefObject<T>,
  sink: MutableRefObject<T>
) {
  return vi.fn((next: T | ((prev: T) => T)) => {
    const value = typeof next === "function"
      ? (next as (prev: T) => T)(sink.current)
      : next;
    sink.current = value;
    ref.current = value;
  });
}

function HookHarness(props: {
  setNotice: (next: CallNotice | null | ((prev: CallNotice | null) => CallNotice | null)) => void;
  noticeTimerRef: MutableRefObject<number | null>;
  capture: (handlers: UiFeedbackHandlers) => void;
}) {
  const handlers = useDirectCallUiFeedback({
    setNotice: props.setNotice,
    noticeTimerRef: props.noticeTimerRef,
  });

  props.capture(handlers);
  return null;
}

describe("useDirectCallUiFeedback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    messagesState.conversations = {};
    messagesState.recordCallEvent.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("records call events with resolved conversation labels", () => {
    const uuidLikeUserId = "32a520dc-6f08-4b9f-afde-04abee3f1e52";
    messagesState.conversations = {
      [uuidLikeUserId]: {
        username: "Seclettr Peer",
      },
    };

    const noticeState = { current: null as CallNotice | null };
    const setNotice = createStateDispatch(
      noticeState as MutableRefObject<CallNotice | null>,
      noticeState
    );
    const handlersRef = { current: null as UiFeedbackHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          setNotice={setNotice}
          noticeTimerRef={{ current: null }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.recordCallEvent({
        userId: uuidLikeUserId,
        fallbackLabel: "Fallback Name",
        mode: "video",
        direction: "outbound",
        outcome: "ended",
        durationSec: 12,
      });
    });

    expect(messagesState.recordCallEvent).toHaveBeenCalledWith({
      userId: uuidLikeUserId,
      username: "Seclettr Peer",
      mode: "video",
      direction: "outbound",
      outcome: "ended",
      durationSec: 12,
    });
  });

  it("falls back to sanitized non-placeholder labels when conversation label should hydrate", () => {
    const uuidLikeUserId = "32a520dc-6f08-4b9f-afde-04abee3f1e52";
    messagesState.conversations = {
      [uuidLikeUserId]: {
        username: uuidLikeUserId,
      },
    };

    const noticeState = { current: null as CallNotice | null };
    const setNotice = createStateDispatch(
      noticeState as MutableRefObject<CallNotice | null>,
      noticeState
    );
    const handlersRef = { current: null as UiFeedbackHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          setNotice={setNotice}
          noticeTimerRef={{ current: null }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.recordCallEvent({
        userId: uuidLikeUserId,
        fallbackLabel: "  Seclettr Fallback  ",
        mode: "audio",
        direction: "inbound",
        outcome: "missed",
      });
    });

    expect(messagesState.recordCallEvent).toHaveBeenCalledWith({
      userId: uuidLikeUserId,
      username: "Seclettr Fallback",
      mode: "audio",
      direction: "inbound",
      outcome: "missed",
      durationSec: undefined,
    });
  });

  it("pushes timed notices and clears them after timeout", () => {
    const noticeState = { current: null as CallNotice | null };
    const setNotice = createStateDispatch(
      noticeState as MutableRefObject<CallNotice | null>,
      noticeState
    );
    const noticeTimerRef = { current: null as number | null };
    const handlersRef = { current: null as UiFeedbackHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          setNotice={setNotice}
          noticeTimerRef={noticeTimerRef}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.pushNotice({ kind: "info", message: "hello" }, 1200);
    });

    expect(noticeState.current).toEqual({ kind: "info", message: "hello" });
    expect(noticeTimerRef.current).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(noticeState.current).toBeNull();
    expect(noticeTimerRef.current).toBeNull();
  });
});
