// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupMember } from "@/stores/groups";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("../useDirectThreadSecurityStatus", () => ({
  useDirectThreadSecurityStatus: vi.fn(() => "unverified"),
}));

vi.mock("../useGroupThreadSecurityStatus", () => ({
  useGroupThreadSecurityStatus: vi.fn(() => "unverified"),
}));

import { useChatSecurityWorkspace } from "../useChatSecurityWorkspace";

type HookValue = ReturnType<typeof useChatSecurityWorkspace>;

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatSecurityWorkspace>[0];
}) {
  props.hookRef.current = useChatSecurityWorkspace(props.options);
  return null;
}

function createMember(overrides?: Partial<GroupMember>): GroupMember {
  return {
    userId: "user-2",
    username: "bob",
    joinedAt: "2026-03-30T10:00:00.000Z",
    ...overrides,
  };
}

function createOptions(
  overrides?: Partial<Parameters<typeof useChatSecurityWorkspace>[0]>
): Parameters<typeof useChatSecurityWorkspace>[0] {
  return {
    activeConversationUserId: "user-1",
    activePeerIdentityAlertCount: 0,
    identityDhKeyPair: null,
    userId: "me",
    deviceId: "my-device",
    activeGroupId: null,
    activeGroupMembers: null,
    activeThreadKind: "direct",
    groupSecurityDirectory: {
      fetchGroupSecurityDevices: vi.fn().mockResolvedValue({
        "user-2": [{ deviceId: "device-b", identityKeyPublic: "key-b" }],
      }),
    },
    showChatNotice: vi.fn(),
    ...overrides,
  };
}

describe("useChatSecurityWorkspace", () => {
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

  it("starts with security modals closed", () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={createOptions()} />);
    });

    expect(hookRef.current?.showSecurity).toBe(false);
    expect(hookRef.current?.groupSecurityTarget).toBeNull();
  });

  it("opens and closes direct security modal", () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={createOptions()} />);
    });

    act(() => { hookRef.current?.openSecurity(); });
    expect(hookRef.current?.showSecurity).toBe(true);

    act(() => { hookRef.current?.closeSecurity(); });
    expect(hookRef.current?.showSecurity).toBe(false);
  });

  it("auto-closes direct security when switching away from direct thread", () => {
    const options = createOptions({ activeThreadKind: "direct" });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    act(() => { hookRef.current?.openSecurity(); });
    expect(hookRef.current?.showSecurity).toBe(true);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={{ ...options, activeThreadKind: "group" }}
        />
      );
    });
    expect(hookRef.current?.showSecurity).toBe(false);
  });

  it("auto-clears group security target when leaving group thread", () => {
    const options = createOptions({
      activeThreadKind: "group",
      activeGroupId: "group-1",
      activeGroupMembers: [],
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    // Switch away from group
    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={{ ...options, activeThreadKind: "direct", activeGroupId: null }}
        />
      );
    });

    expect(hookRef.current?.groupSecurityTarget).toBeNull();
  });

  it("increments refresh ticks without throwing", () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={createOptions()} />);
    });

    expect(() => {
      act(() => { hookRef.current?.onDirectVerificationChanged(); });
      act(() => { hookRef.current?.onGroupVerificationChanged(); });
    }).not.toThrow();
  });

  it("sets group security target when handleVerifyGroupMember succeeds", async () => {
    const options = createOptions({
      activeThreadKind: "group",
      activeGroupId: "group-1",
      activeGroupMembers: [],
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    await act(async () => {
      await hookRef.current?.handleVerifyGroupMember(createMember());
    });

    expect(hookRef.current?.groupSecurityTarget).toEqual({
      recipientUserId: "user-2",
      recipientUsername: "bob",
      peerIdentityByDevice: { "device-b": "key-b" },
      preferredDeviceId: "device-b",
    });
  });

  it("shows notice when handleVerifyGroupMember fails", async () => {
    const showChatNotice = vi.fn();
    const options = createOptions({
      activeThreadKind: "group",
      activeGroupId: "group-1",
      activeGroupMembers: [],
      groupSecurityDirectory: {
        fetchGroupSecurityDevices: vi
          .fn()
          .mockRejectedValue(new Error("network error")),
      },
      showChatNotice,
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    await act(async () => {
      await hookRef.current?.handleVerifyGroupMember(createMember());
    });

    expect(showChatNotice).toHaveBeenCalledWith(
      "group.members.error.verifyFailed"
    );
  });

  it("shows notice when handleVerifyGroupMember called without active group", async () => {
    const showChatNotice = vi.fn();
    const options = createOptions({ activeGroupId: null, showChatNotice });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} options={options} />);
    });

    await act(async () => {
      await hookRef.current?.handleVerifyGroupMember(createMember());
    });

    expect(showChatNotice).toHaveBeenCalledWith(
      "group.members.error.verifyFailed"
    );
  });
});
