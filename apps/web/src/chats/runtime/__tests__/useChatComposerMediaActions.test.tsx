// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { messageStoreState, groupStoreState } = vi.hoisted(() => ({
  messageStoreState: {
    sendVoiceNote: vi.fn(),
    sendVideoNote: vi.fn(),
    sendSenderKeyDistribution: vi.fn(),
  },
  groupStoreState: {
    sendGroupVoiceNote: vi.fn(),
    sendGroupVideoNote: vi.fn(),
  },
}));

vi.mock("@/stores/messages", () => {
  const hook = Object.assign(
    (
      selector: ((state: typeof messageStoreState) => unknown) | undefined
    ) => {
      if (typeof selector === "function") {
        return selector(messageStoreState);
      }
      return messageStoreState;
    },
    { getState: () => messageStoreState }
  );
  return { useMessagesStore: hook };
});

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

import { useChatComposerMediaActions } from "../useChatComposerMediaActions";

interface HookValue {
  sendVoiceBlob: (blob: Blob, durationMs: number) => Promise<void>;
  sendVideoBlob: (blob: Blob, durationMs: number) => Promise<void>;
}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  recipientUserId?: string;
  groupId?: string;
}) {
  props.hookRef.current = useChatComposerMediaActions({
    recipientUserId: props.recipientUserId,
    groupId: props.groupId,
  });
  return null;
}

describe("useChatComposerMediaActions", () => {
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
    messageStoreState.sendVoiceNote.mockReset();
    messageStoreState.sendVideoNote.mockReset();
    groupStoreState.sendGroupVoiceNote.mockReset();
    groupStoreState.sendGroupVideoNote.mockReset();
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

  it("sends voice and video blobs in direct threads", async () => {
    act(() => {
      root.render(
        <HookHarness hookRef={hookRef} recipientUserId="user-peer" />
      );
    });

    await act(async () => {
      await hookRef.current?.sendVoiceBlob(
        new Blob(["voice"], { type: "audio/webm" }),
        1_000
      );
      await hookRef.current?.sendVideoBlob(
        new Blob(["video"], { type: "video/webm" }),
        2_000
      );
    });

    expect(messageStoreState.sendVoiceNote).toHaveBeenCalledWith(
      "user-peer",
      expect.any(Blob),
      1_000
    );
    expect(messageStoreState.sendVideoNote).toHaveBeenCalledWith(
      "user-peer",
      expect.any(Blob),
      2_000
    );
  });

  it("routes voice and video blobs to group store in group threads", async () => {
    groupStoreState.sendGroupVoiceNote.mockResolvedValue(undefined);
    groupStoreState.sendGroupVideoNote.mockResolvedValue(undefined);
    act(() => {
      root.render(<HookHarness hookRef={hookRef} groupId="group-1" />);
    });

    await act(async () => {
      await hookRef.current?.sendVoiceBlob(
        new Blob(["voice"], { type: "audio/webm" }),
        1_000
      );
      await hookRef.current?.sendVideoBlob(
        new Blob(["video"], { type: "video/webm" }),
        2_000
      );
    });

    expect(groupStoreState.sendGroupVoiceNote).toHaveBeenCalledWith(
      "group-1",
      expect.any(Blob),
      1_000
    );
    expect(groupStoreState.sendGroupVideoNote).toHaveBeenCalledWith(
      "group-1",
      expect.any(Blob),
      2_000
    );
    expect(messageStoreState.sendVoiceNote).not.toHaveBeenCalled();
    expect(messageStoreState.sendVideoNote).not.toHaveBeenCalled();
  });
});
