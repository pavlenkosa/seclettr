// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messageStoreState, groupStoreState } = vi.hoisted(() => ({
  messageStoreState: {
    sendMessage: vi.fn(),
    sendAttachment: vi.fn(),
  },
  groupStoreState: {
    sendGroupText: vi.fn(),
    sendGroupFileAttachment: vi.fn(),
  },
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: (
    selector: ((state: typeof messageStoreState) => unknown) | undefined
  ) => {
    if (typeof selector === "function") {
      return selector(messageStoreState);
    }
    return messageStoreState;
  },
}));

vi.mock("@/stores/groups", () => ({
  useGroupsStore: (
    selector: ((state: typeof groupStoreState) => unknown) | undefined
  ) => {
    if (typeof selector === "function") {
      return selector(groupStoreState);
    }
    return groupStoreState;
  },
}));

import { useChatComposerMessageActions } from "../useChatComposerMessageActions";

interface HookValue {
  sendTextMessage: (
    text: string,
    replyTo?: { id: string; content: string }
  ) => Promise<void>;
  sendFileAttachment: (file: File) => Promise<void>;
}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  recipientUserId?: string;
  groupId?: string;
}) {
  props.hookRef.current = useChatComposerMessageActions({
    recipientUserId: props.recipientUserId,
    groupId: props.groupId,
  });
  return null;
}

describe("useChatComposerMessageActions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    messageStoreState.sendMessage.mockReset();
    messageStoreState.sendAttachment.mockReset();
    groupStoreState.sendGroupText.mockReset();
    groupStoreState.sendGroupFileAttachment.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("sends direct text through messages store", async () => {
    act(() => {
      root.render(
        <HookHarness hookRef={hookRef} recipientUserId="user-peer" />
      );
    });

    await act(async () => {
      await hookRef.current?.sendTextMessage("hello", {
        id: "reply-1",
        content: "quoted",
      });
    });

    expect(messageStoreState.sendMessage).toHaveBeenCalledWith(
      "user-peer",
      "hello",
      { id: "reply-1", snippet: "quoted" }
    );
    expect(groupStoreState.sendGroupText).not.toHaveBeenCalled();
  });

  it("sends group text through groups store", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} groupId="group-1" />);
    });

    await act(async () => {
      await hookRef.current?.sendTextMessage("hello group");
    });

    expect(groupStoreState.sendGroupText).toHaveBeenCalledWith(
      "group-1",
      "hello group",
      undefined
    );
    expect(messageStoreState.sendMessage).not.toHaveBeenCalled();
  });

  it("routes file attachments to group store in group threads", async () => {
    groupStoreState.sendGroupFileAttachment.mockResolvedValue(undefined);
    act(() => {
      root.render(<HookHarness hookRef={hookRef} groupId="group-1" />);
    });

    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    await act(async () => {
      await hookRef.current?.sendFileAttachment(file);
    });

    expect(groupStoreState.sendGroupFileAttachment).toHaveBeenCalledWith(
      "group-1",
      file,
      undefined
    );
    expect(messageStoreState.sendAttachment).not.toHaveBeenCalled();
  });
});
