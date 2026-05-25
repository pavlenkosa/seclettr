// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatWorkspaceRoutingBootstrap } from "../useChatWorkspaceRoutingBootstrap";

const { apiGetMock, loggerWarnMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
  },
}));

vi.mock("@/lib/logger.js", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

interface HookValue extends ReturnType<typeof useChatWorkspaceRoutingBootstrap> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceRoutingBootstrap>[0];
  initialEntry: string;
}) {
  return (
    <MemoryRouter initialEntries={[props.initialEntry]}>
      <InnerHarness hookRef={props.hookRef} options={props.options} />
    </MemoryRouter>
  );
}

function InnerHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceRoutingBootstrap>[0];
}) {
  props.hookRef.current = useChatWorkspaceRoutingBootstrap(props.options);
  return null;
}

describe("useChatWorkspaceRoutingBootstrap", () => {
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
    apiGetMock.mockReset();
    loggerWarnMock.mockReset();
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
    overrides?: Partial<Parameters<typeof useChatWorkspaceRoutingBootstrap>[0]>
  ): Parameters<typeof useChatWorkspaceRoutingBootstrap>[0] {
    return {
      conversations: {},
      activeConversationId: null,
      activeGroupId: null,
      setActiveConversation: vi.fn(),
      setActiveGroup: vi.fn(),
      loadGroupMessages: vi.fn().mockResolvedValue(undefined),
      getGroupsState: () => ({ groups: {}, activeGroupId: null }),
      plainConversations: {},
      activePlainConversationId: null,
      activePlainGroupId: null,
      setActivePlainConversation: vi.fn(),
      setActivePlainGroup: vi.fn(),
      loadPlainGroupMessages: vi.fn().mockResolvedValue(undefined),
      savedThreadActive: false,
      setSavedThreadActive: vi.fn(),
      setMobileShowConversation: vi.fn(),
      setMobileCreateMenuOpen: vi.fn(),
      upsertConversation: vi.fn(),
      upsertPlainConversation: vi.fn(),
      ...overrides,
    };
  }

  it("bootstraps missing encrypted direct route through user lookup", async () => {
    apiGetMock.mockResolvedValue({
      userId: "user-9",
      username: "  zoe  ",
    });

    const options = createOptions();

    await act(async () => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={options}
          initialEntry="/chat?chat=user-9"
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiGetMock).toHaveBeenCalledWith("/users/user-9", expect.any(Object));
    expect(options.upsertConversation).toHaveBeenCalledWith({
      userId: "user-9",
      username: "zoe",
      messages: [],
      lastMessageAt: 0,
      unreadCount: 0,
    });
    expect(options.setActiveConversation).toHaveBeenCalledWith("user-9");
    expect(options.setMobileShowConversation).toHaveBeenCalledWith(true);
  });

  it("bootstraps missing plain direct route through user lookup", async () => {
    apiGetMock.mockResolvedValue({
      userId: "user-5",
      username: "peer",
    });

    const options = createOptions();

    await act(async () => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={options}
          initialEntry="/chat?plain-chat=user-5"
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiGetMock).toHaveBeenCalledWith("/users/user-5", expect.any(Object));
    expect(options.upsertPlainConversation).toHaveBeenCalledWith({
      userId: "user-5",
      username: "peer",
    });
    expect(options.setActivePlainConversation).toHaveBeenCalledWith("user-5");
    expect(options.setMobileShowConversation).toHaveBeenCalledWith(true);
  });
});
