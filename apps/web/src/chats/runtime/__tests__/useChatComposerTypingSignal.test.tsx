// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messageStoreState } = vi.hoisted(() => ({
  messageStoreState: {
    sendTypingSignal: vi.fn(),
  },
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: (
    selector:
      | ((state: typeof messageStoreState) => unknown)
      | undefined = undefined
  ) => {
    if (typeof selector === "function") {
      return selector(messageStoreState);
    }
    return messageStoreState;
  },
}));

import { useChatComposerTypingSignal } from "../useChatComposerTypingSignal";

interface HookValue {
  handleTypingState: (nextValue: string) => void;
  stopTyping: () => void;
  cleanupTypingSignal: () => void;
}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  recipientUserId?: string;
  groupId?: string;
  chatKind?: "plain" | "e2ee";
}) {
  props.hookRef.current = useChatComposerTypingSignal({
    recipientUserId: props.recipientUserId,
    groupId: props.groupId,
    chatKind: props.chatKind,
  });
  return null;
}

describe("useChatComposerTypingSignal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00.000Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    messageStoreState.sendTypingSignal.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("refreshes typing.start while the user keeps typing longer than the remote TTL", () => {
    act(() => {
      root.render(
        <HookHarness hookRef={hookRef} recipientUserId="user-peer" chatKind="e2ee" />
      );
    });

    act(() => {
      hookRef.current?.handleTypingState("h");
    });

    expect(messageStoreState.sendTypingSignal).toHaveBeenNthCalledWith(
      1,
      "user-peer",
      true,
      "e2ee"
    );

    act(() => {
      vi.advanceTimersByTime(1500);
      hookRef.current?.handleTypingState("he");
    });

    expect(messageStoreState.sendTypingSignal).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(600);
      hookRef.current?.handleTypingState("hel");
    });

    expect(messageStoreState.sendTypingSignal).toHaveBeenCalledTimes(2);
    expect(messageStoreState.sendTypingSignal).toHaveBeenNthCalledWith(
      2,
      "user-peer",
      true,
      "e2ee"
    );

    act(() => {
      vi.advanceTimersByTime(2400);
    });

    expect(messageStoreState.sendTypingSignal).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(messageStoreState.sendTypingSignal).toHaveBeenCalledTimes(3);
    expect(messageStoreState.sendTypingSignal).toHaveBeenLastCalledWith(
      "user-peer",
      false,
      "e2ee"
    );
  });

  it("does not emit typing signals for group composers", () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} groupId="group-1" />);
    });

    act(() => {
      hookRef.current?.handleTypingState("hello");
      hookRef.current?.handleTypingState("");
    });

    expect(messageStoreState.sendTypingSignal).not.toHaveBeenCalled();
  });

  it("does not emit typing signals without explicit chat kind", () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} recipientUserId="user-peer" />);
    });

    act(() => {
      hookRef.current?.handleTypingState("hello");
      hookRef.current?.cleanupTypingSignal();
    });

    expect(messageStoreState.sendTypingSignal).not.toHaveBeenCalled();
  });
});
