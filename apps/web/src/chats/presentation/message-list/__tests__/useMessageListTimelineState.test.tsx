// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/stores/messages";
import {
  useMessageListTimelineState,
  type MessageListVirtualizer,
} from "../useMessageListTimelineState";

interface HookValue extends ReturnType<typeof useMessageListTimelineState> {}

interface JumpState {
  visible: boolean;
  pendingCount: number;
}

interface HarnessProps {
  readonly hookRef: MutableRefObject<HookValue | null>;
  readonly messages: Message[];
  readonly highlightMessageId?: string;
  readonly highlightRowIndex?: number;
  readonly shouldVirtualize: boolean;
  readonly virtualizer: MessageListVirtualizer;
  readonly onJumpToBottomStateChange?: (state: JumpState) => void;
}

function HookHarness({
  hookRef,
  messages,
  highlightMessageId,
  highlightRowIndex,
  shouldVirtualize,
  virtualizer,
  onJumpToBottomStateChange,
}: HarnessProps) {
  const hook = useMessageListTimelineState({
    messages,
    highlightMessageId,
    highlightRowIndex,
    shouldVirtualize,
    virtualizer,
    onJumpToBottomStateChange,
  });
  hookRef.current = hook;

  return (
    <div ref={hook.containerRef}>
      {messages.map((message) => (
        <div key={message.id} data-mid={message.id}>
          {message.content}
        </div>
      ))}
      <div ref={hook.bottomRef} />
    </div>
  );
}

function createMessage(
  id: string,
  overrides: Partial<Message> = {}
): Message {
  return {
    id,
    senderId: "peer",
    senderDeviceId: "device-1",
    content: id,
    type: "text",
    timestamp: 1,
    status: "sent",
    isOwn: false,
    ...overrides,
  };
}

describe("useMessageListTimelineState", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;
  let virtualizer: MessageListVirtualizer;
  let onJumpToBottomStateChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    virtualizer = {
      scrollToIndex: vi.fn(),
    };
    onJumpToBottomStateChange = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function defineScrollMetrics(
    scrollHeight: number,
    clientHeight: number,
    scrollTop: number
  ) {
    const scrollHost = hookRef.current?.containerRef.current;
    expect(scrollHost).not.toBeNull();
    Object.defineProperties(scrollHost!, {
      scrollHeight: { configurable: true, value: scrollHeight },
      clientHeight: { configurable: true, value: clientHeight },
      scrollTop: { configurable: true, writable: true, value: scrollTop },
    });
    return scrollHost!;
  }

  it("autoscrolls when a new message arrives near the bottom", () => {
    const messages = [createMessage("m1")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    scrollIntoViewSpy.mockClear();
    defineScrollMetrics(600, 500, 40);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[...messages, createMessage("m2")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it("forces scroll to bottom when the local user sends a message from older history", () => {
    const messages = [createMessage("m1")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    scrollIntoViewSpy.mockClear();
    defineScrollMetrics(900, 500, 100);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[
            ...messages,
            createMessage("m2", {
              isOwn: true,
              senderId: "me",
            }),
          ]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it("tracks pending incoming messages while the user is away from the bottom", () => {
    const messages = [createMessage("m1")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    const scrollHost = defineScrollMetrics(1000, 400, 200);

    act(() => {
      scrollHost.dispatchEvent(new Event("scroll"));
    });

    expect(onJumpToBottomStateChange).toHaveBeenLastCalledWith({
      visible: true,
      pendingCount: 0,
    });

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[...messages, createMessage("m2")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(onJumpToBottomStateChange).toHaveBeenLastCalledWith({
      visible: true,
      pendingCount: 1,
    });
  });

  it("clears pending incoming messages after jumping to the latest message", () => {
    const messages = [createMessage("m1")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    const scrollHost = defineScrollMetrics(1000, 400, 200);

    act(() => {
      scrollHost.dispatchEvent(new Event("scroll"));
    });

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[...messages, createMessage("m2")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(onJumpToBottomStateChange).toHaveBeenLastCalledWith({
      visible: true,
      pendingCount: 1,
    });

    act(() => {
      hookRef.current?.handleJumpToBottom();
    });

    expect(onJumpToBottomStateChange).toHaveBeenLastCalledWith({
      visible: false,
      pendingCount: 0,
    });
  });

  it("scrolls to highlighted messages for virtualized and non-virtualized paths", () => {
    const messages = [createMessage("m1"), createMessage("m2")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          highlightMessageId="m2"
          highlightRowIndex={1}
          shouldVirtualize={true}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(1, {
      align: "center",
      behavior: "smooth",
    });

    scrollIntoViewSpy.mockClear();

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          highlightMessageId="m1"
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it("uses row indexes instead of raw message indexes for virtualized highlights", () => {
    const messages = [createMessage("m1"), createMessage("m2"), createMessage("m3")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          highlightMessageId="m3"
          highlightRowIndex={1}
          shouldVirtualize={true}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(1, {
      align: "center",
      behavior: "smooth",
    });
  });

  it("clears the active media key when the matching message disappears", () => {
    const messages = [createMessage("m1"), createMessage("m2")];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={messages}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    act(() => {
      hookRef.current?.handleActiveMediaChange("voice:m2");
    });

    expect(hookRef.current?.activeMediaKey).toBe("voice:m2");

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[createMessage("m1")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    expect(hookRef.current?.activeMediaKey).toBeNull();
  });

  it("clears pending state when the user manually returns to the bottom", () => {
    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[createMessage("m1")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    const scrollHost = defineScrollMetrics(1000, 400, 200);

    act(() => {
      scrollHost.dispatchEvent(new Event("scroll"));
    });

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          messages={[createMessage("m1"), createMessage("m2")]}
          shouldVirtualize={false}
          virtualizer={virtualizer}
          onJumpToBottomStateChange={onJumpToBottomStateChange}
        />
      );
    });

    Object.defineProperty(scrollHost, "scrollTop", {
      configurable: true,
      writable: true,
      value: 650,
    });

    act(() => {
      scrollHost.dispatchEvent(new Event("scroll"));
    });

    expect(onJumpToBottomStateChange).toHaveBeenLastCalledWith({
      visible: false,
      pendingCount: 0,
    });
  });
});
