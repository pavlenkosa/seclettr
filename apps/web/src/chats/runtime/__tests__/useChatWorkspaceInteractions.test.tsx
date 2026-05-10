// @vitest-environment jsdom

import { type MutableRefObject, type RefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectCallPanelHandle } from "@/calls/direct";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { useChatWorkspaceInteractions } from "../useChatWorkspaceInteractions";

interface HookValue extends ReturnType<typeof useChatWorkspaceInteractions> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceInteractions>[0];
}) {
  props.hookRef.current = useChatWorkspaceInteractions(props.options);
  return null;
}

describe("useChatWorkspaceInteractions", () => {
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
    overrides?: Partial<Parameters<typeof useChatWorkspaceInteractions>[0]>
  ): Parameters<typeof useChatWorkspaceInteractions>[0] {
    const directCallPanelRef: RefObject<DirectCallPanelHandle | null> = {
      current: {
        startCall: vi.fn().mockResolvedValue(undefined),
      },
    };

    return {
      activeConversation: { userId: "user-1", username: "alice" },
      activePlainConversation: null,
      activeGroup: { groupId: "group-1" },
      activeThreadKind: "direct",
      directCallPanelRef,
      showChatNotice: vi.fn(),
      ensureConversation: vi.fn(),
      ensurePlainConversation: vi.fn(),
      handleSelectThread: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      lock: vi.fn(),
      setMobileCreateMenuOpen: vi.fn(),
      openSettings: vi.fn(),
      openNewChat: vi.fn(),
      closeNewChat: vi.fn(),
      openNewGroup: vi.fn(),
      openGroupMembers: vi.fn(),
      closeGroupMembers: vi.fn(),
      openChatTypePicker: vi.fn(),
      closeChatTypePicker: vi.fn(),
      ...overrides,
    };
  }

  it("shows notice when direct call start is rejected", async () => {
    const showChatNotice = vi.fn();
    const startCall = vi.fn().mockRejectedValue(new Error("boom"));
    const options = createOptions({
      showChatNotice,
      directCallPanelRef: {
        current: {
          startCall,
        },
      },
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    await act(async () => {
      hookRef.current?.handleStartCall("audio");
      await Promise.resolve();
    });

    expect(startCall).toHaveBeenCalledWith("user-1", "audio", "alice");
    expect(showChatNotice).toHaveBeenCalledWith("call.error.unableStart");
  });

  it("opens chat type picker when a user is selected from new chat modal", () => {
    const closeNewChat = vi.fn();
    const openChatTypePicker = vi.fn();
    const options = createOptions({ closeNewChat, openChatTypePicker });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    act(() => {
      hookRef.current?.handleNewChatSelect("user-9", "zoe");
    });

    expect(closeNewChat).toHaveBeenCalled();
    expect(openChatTypePicker).toHaveBeenCalledWith({ userId: "user-9", username: "zoe" });
  });

  it("routes E2EE chat when encrypted option is chosen", () => {
    const ensureConversation = vi.fn();
    const handleSelectThread = vi.fn();
    const closeChatTypePicker = vi.fn();
    const options = createOptions({ ensureConversation, handleSelectThread, closeChatTypePicker });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    act(() => {
      hookRef.current?.handleNewChatSelectE2ee("user-9", "zoe");
    });

    expect(closeChatTypePicker).toHaveBeenCalled();
    expect(ensureConversation).toHaveBeenCalledWith("user-9", "zoe");
    expect(handleSelectThread).toHaveBeenCalledWith({ kind: "direct", id: "user-9" });
  });

  it("routes plain chat when regular option is chosen", () => {
    const ensurePlainConversation = vi.fn();
    const handleSelectThread = vi.fn();
    const closeChatTypePicker = vi.fn();
    const options = createOptions({ ensurePlainConversation, handleSelectThread, closeChatTypePicker });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    act(() => {
      hookRef.current?.handleNewChatSelectPlain("user-9", "zoe");
    });

    expect(closeChatTypePicker).toHaveBeenCalled();
    expect(ensurePlainConversation).toHaveBeenCalledWith("user-9", "zoe");
    expect(handleSelectThread).toHaveBeenCalledWith({ kind: "plain-direct", id: "user-9" });
  });
});
