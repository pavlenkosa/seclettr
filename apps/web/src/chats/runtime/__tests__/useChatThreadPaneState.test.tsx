// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/stores/messages";
import { useChatThreadPaneState } from "../useChatThreadPaneState";

interface HookValue extends ReturnType<typeof useChatThreadPaneState> {}

function createMessage(
  id: string,
  content: string,
  overrides?: Partial<Message>
): Message {
  return {
    id,
    senderId: "sender-1",
    senderDeviceId: "device-1",
    content,
    type: "text",
    timestamp: 1,
    status: "sent",
    isOwn: false,
    ...overrides,
  };
}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  activeListId: string | null;
  activeMessages: Message[];
  username: string | null;
  groupSenderLabels?: Record<string, string>;
  activeConversationUsername?: string;
}) {
  props.hookRef.current = useChatThreadPaneState({
    activeListId: props.activeListId,
    activeMessages: props.activeMessages,
    username: props.username,
    groupSenderLabels: props.groupSenderLabels,
    activeConversationUsername: props.activeConversationUsername,
  });
  return null;
}

describe("useChatThreadPaneState", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
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

  it("clamps search index when matches shrink", async () => {
    const firstMessages = [
      createMessage("m1", "hello alpha"),
      createMessage("m2", "hello beta"),
    ];
    const firstMessage = firstMessages[0];
    if (!firstMessage) {
      throw new Error("Expected first message");
    }

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="direct:user-1"
          activeMessages={firstMessages}
          username="alice"
        />
      );
    });

    act(() => {
      hookRef.current?.handleSearchQueryChange("hello");
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(hookRef.current?.messageSearchMatches).toHaveLength(2);

    act(() => {
      hookRef.current?.handleSearchNext();
    });

    expect(hookRef.current?.messageSearchMatchIndex).toBe(1);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="direct:user-1"
          activeMessages={[firstMessage]}
          username="alice"
        />
      );
    });

    expect(hookRef.current?.messageSearchMatchIndex).toBe(0);
  });

  it("keeps search and media panel mutually exclusive", () => {
    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="direct:user-1"
          activeMessages={[createMessage("m1", "hello")]}
          username="alice"
        />
      );
    });

    act(() => {
      hookRef.current?.handleToggleSearch();
    });
    expect(hookRef.current?.messageSearchOpen).toBe(true);

    act(() => {
      hookRef.current?.handleToggleMediaPanel();
    });

    expect(hookRef.current?.mediaPanelOpen).toBe(true);
    expect(hookRef.current?.messageSearchOpen).toBe(false);
  });

  it("resets reply, search, media and highlight on active thread change", () => {
    const message = createMessage("m1", "hello");

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="direct:user-1"
          activeMessages={[message]}
          username="alice"
        />
      );
    });

    act(() => {
      hookRef.current?.handleToggleSearch();
      hookRef.current?.handleReply("m1");
      hookRef.current?.handleScrollToMessage("m1");
      hookRef.current?.handleToggleMediaPanel();
    });

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="group:group-1"
          activeMessages={[message]}
          username="alice"
        />
      );
    });

    expect(hookRef.current?.messageSearchOpen).toBe(false);
    expect(hookRef.current?.mediaPanelOpen).toBe(false);
    expect(hookRef.current?.highlightMessageId).toBeUndefined();
    expect(hookRef.current?.replyToMeta).toBeUndefined();
  });

  it("highlights message on scroll and clears it automatically", () => {
    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          activeListId="direct:user-1"
          activeMessages={[createMessage("m1", "hello")]}
          username="alice"
        />
      );
    });

    act(() => {
      hookRef.current?.handleScrollToMessage("m1");
    });

    expect(hookRef.current?.highlightMessageId).toBe("m1");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(hookRef.current?.highlightMessageId).toBeUndefined();
  });
});
