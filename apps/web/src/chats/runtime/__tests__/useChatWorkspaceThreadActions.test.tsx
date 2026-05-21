// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatWorkspaceThreadActions } from "../useChatWorkspaceThreadActions";

const { setPlainMessagesState } = vi.hoisted(() => ({
  setPlainMessagesState: vi.fn(),
}));

vi.mock("@/stores/plain", () => ({
  usePlainMessagesStore: Object.assign(vi.fn(), {
    setState: setPlainMessagesState,
  }),
}));

interface HookValue extends ReturnType<typeof useChatWorkspaceThreadActions> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceThreadActions>[0];
}) {
  props.hookRef.current = useChatWorkspaceThreadActions(props.options);
  return null;
}

describe("useChatWorkspaceThreadActions", () => {
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
    setPlainMessagesState.mockReset();
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

  function createOptions(
    overrides?: Partial<Parameters<typeof useChatWorkspaceThreadActions>[0]>
  ): Parameters<typeof useChatWorkspaceThreadActions>[0] {
    return {
      plainConversations: {},
      activeThreadKind: "direct",
      activeConversationUserId: "user-1",
      activeGroupId: "group-1",
      activePlainConversationId: "plain-1",
      activePlainGroupId: "plain-group-1",
      retryDirectMessage: vi.fn().mockResolvedValue(undefined),
      retryGroupMessage: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("upserts a missing plain conversation placeholder", () => {
    act(() => {
      root.render(
        <HookHarness hookRef={hookRef} options={createOptions()} />
      );
    });

    act(() => {
      hookRef.current?.upsertPlainConversation({
        userId: "user-2",
        username: "zoe",
      });
    });

    expect(setPlainMessagesState).toHaveBeenCalledTimes(1);
    const updater = setPlainMessagesState.mock.calls[0]?.[0] as (
      state: {
        conversations: Record<string, unknown>;
      }
    ) => unknown;
    expect(
      updater({
        conversations: {},
      })
    ).toEqual({
      conversations: {
        "user-2": {
          userId: "user-2",
          username: "zoe",
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          hasMore: false,
          historyLoaded: false,
        },
      },
    });
  });

  it("ensures a plain conversation only when missing", () => {
    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            plainConversations: {
              "user-2": {
                userId: "user-2",
                username: "zoe",
              },
            },
          })}
        />
      );
    });

    act(() => {
      hookRef.current?.ensurePlainConversation("user-2", "zoe");
    });

    expect(setPlainMessagesState).not.toHaveBeenCalled();
  });

  it("routes retry by active thread kind", () => {
    const retryDirectMessage = vi.fn().mockResolvedValue(undefined);
    const retryGroupMessage = vi.fn().mockResolvedValue(undefined);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            activeThreadKind: "group",
            retryDirectMessage,
            retryGroupMessage,
          })}
        />
      );
    });

    act(() => {
      hookRef.current?.handleRetryMessage("msg-1");
    });

    expect(retryDirectMessage).not.toHaveBeenCalled();
    expect(retryGroupMessage).toHaveBeenCalledWith("group-1", "msg-1");
  });

  it("keeps plain retry actions as no-op", () => {
    const retryDirectMessage = vi.fn().mockResolvedValue(undefined);
    const retryGroupMessage = vi.fn().mockResolvedValue(undefined);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            activeThreadKind: "plain-direct",
            retryDirectMessage,
            retryGroupMessage,
          })}
        />
      );
    });

    act(() => {
      hookRef.current?.handleRetryMessage("msg-1");
    });

    expect(retryDirectMessage).not.toHaveBeenCalled();
    expect(retryGroupMessage).not.toHaveBeenCalled();
  });
});
