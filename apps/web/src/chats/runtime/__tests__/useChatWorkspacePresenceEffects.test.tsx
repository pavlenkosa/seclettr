// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, PeerIdentityAlert } from "@/stores/messages";
import { useMessagesStore } from "@/stores/messages";
import type { PlainConversation } from "@/stores/plain";
import { usePlainMessagesStore } from "@/stores/plain";
import { useChatWorkspacePresenceEffects } from "../useChatWorkspacePresenceEffects";

interface HookValue extends ReturnType<typeof useChatWorkspacePresenceEffects> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspacePresenceEffects>[0];
}) {
  props.hookRef.current = useChatWorkspacePresenceEffects(props.options);
  return null;
}

describe("useChatWorkspacePresenceEffects", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;
  let originalPlainMarkRead: ReturnType<typeof usePlainMessagesStore.getState>["markRead"];

  beforeEach(() => {
    vi.useFakeTimers();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };

    originalPlainMarkRead = usePlainMessagesStore.getState().markRead;
    useMessagesStore.setState({
      presenceByUser: {},
      typingByUser: {},
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    usePlainMessagesStore.setState({ markRead: originalPlainMarkRead });
    usePlainMessagesStore.getState().reset();
    container.remove();
    vi.useRealTimers();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("polls encrypted direct presence, marks read, and exposes selector state", () => {
    const fetchUserPresence = vi.fn().mockResolvedValue(undefined);
    const markConversationRead = vi.fn().mockResolvedValue(undefined);

    useMessagesStore.setState({
      presenceByUser: {
        "user-1": {
          online: true,
          updatedAt: 1,
        },
      },
      typingByUser: {
        "user-1": {
          typing: true,
          updatedAt: 2,
        },
      },
    });

    const activeConversation = {
      userId: "user-1",
      username: "alice",
      messages: [],
      lastMessageAt: 0,
      unreadCount: 0,
      peerIdentityAlertsByDevice: {
        "device-1": {
          deviceId: "device-1",
          previousIdentityKey: "a",
          currentIdentityKey: "b",
          detectedAt: 1,
        },
      } satisfies Record<string, PeerIdentityAlert>,
    } as Conversation;

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={{
            activeConversation,
            activePlainConversation: null,
            fetchUserPresence,
            loadPlainHistory: vi.fn().mockResolvedValue(undefined),
            markConversationRead,
          }}
        />
      );
    });

    expect(fetchUserPresence).toHaveBeenCalledTimes(1);
    expect(fetchUserPresence).toHaveBeenCalledWith("user-1");
    expect(markConversationRead).toHaveBeenCalledWith("user-1");
    expect(hookRef.current?.activePresence?.online).toBe(true);
    expect(hookRef.current?.activeTyping).toBe(true);
    expect(hookRef.current?.activePeerIdentityAlertCount).toBe(1);
    expect(hookRef.current?.directTrustBlocked).toBe(true);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(fetchUserPresence).toHaveBeenCalledTimes(2);
  });

  it("loads plain-direct history before hydration and marks plain threads read after hydrate", () => {
    const fetchUserPresence = vi.fn().mockResolvedValue(undefined);
    const loadPlainHistory = vi.fn().mockResolvedValue(undefined);
    const plainMarkRead = vi.fn();

    usePlainMessagesStore.setState({ markRead: plainMarkRead });
    useMessagesStore.setState({
      presenceByUser: {
        peer: {
          online: false,
          updatedAt: 10,
        },
      },
      typingByUser: {
        peer: {
          typing: false,
          updatedAt: 11,
        },
      },
    });

    const baseConversation = {
      userId: "peer",
      username: "Peer",
      messages: [],
      lastMessageAt: 0,
      unreadCount: 2,
      hasMore: false,
    };

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={{
            activeConversation: null,
            activePlainConversation: {
              ...baseConversation,
              historyLoaded: false,
            } as PlainConversation,
            fetchUserPresence,
            loadPlainHistory,
            markConversationRead: vi.fn().mockResolvedValue(undefined),
          }}
        />
      );
    });

    expect(loadPlainHistory).toHaveBeenCalledWith("peer", "Peer");
    expect(fetchUserPresence).toHaveBeenCalledWith("peer");
    expect(hookRef.current?.plainActivePresence?.online).toBe(false);
    expect(hookRef.current?.plainActiveTyping).toBe(false);
    expect(plainMarkRead).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={{
            activeConversation: null,
            activePlainConversation: {
              ...baseConversation,
              historyLoaded: true,
            } as PlainConversation,
            fetchUserPresence,
            loadPlainHistory,
            markConversationRead: vi.fn().mockResolvedValue(undefined),
          }}
        />
      );
    });

    expect(plainMarkRead).toHaveBeenCalledWith("peer");
  });
});
