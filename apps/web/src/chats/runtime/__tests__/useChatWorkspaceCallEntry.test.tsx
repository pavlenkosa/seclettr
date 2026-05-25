// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatWorkspaceCallEntry } from "../useChatWorkspaceCallEntry";

const {
  useGroupCallChatEntryMock,
  useGroupCallGlobalAlertsMock,
} = vi.hoisted(() => ({
  useGroupCallChatEntryMock: vi.fn(),
  useGroupCallGlobalAlertsMock: vi.fn(),
}));

vi.mock("@/calls/group/runtime/useGroupCallChatEntry", () => ({
  useGroupCallChatEntry: useGroupCallChatEntryMock,
}));

vi.mock("@/calls/group/runtime/useGroupCallGlobalAlerts", () => ({
  useGroupCallGlobalAlerts: useGroupCallGlobalAlertsMock,
}));

interface HookValue extends ReturnType<typeof useChatWorkspaceCallEntry> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceCallEntry>[0];
}) {
  props.hookRef.current = useChatWorkspaceCallEntry(props.options);
  return null;
}

describe("useChatWorkspaceCallEntry", () => {
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
    useGroupCallChatEntryMock.mockReset();
    useGroupCallGlobalAlertsMock.mockReset();
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
    overrides?: Partial<Parameters<typeof useChatWorkspaceCallEntry>[0]>
  ): Parameters<typeof useChatWorkspaceCallEntry>[0] {
    return {
      activeGroup: null,
      activeGroupId: null,
      groups: {},
      userId: "user-1",
      ...overrides,
    };
  }

  it("composes active-group call entry and global alerts", () => {
    const handleStartGroupCall = vi.fn();
    const handleJoinActiveGroupCall = vi.fn();
    const handleCloseGroupCallPanel = vi.fn();

    useGroupCallChatEntryMock.mockReturnValue({
      activeGroupCall: { callId: "call-1" },
      activeGroupCallParticipantIds: ["user-1", "user-2"],
      callSyncDegraded: false,
      participantCountUncertain: false,
      missedCall: null,
      clearMissedCall: vi.fn(),
      groupCallSession: { kind: "active" },
      groupCallNoticeSurface: "banner",
      handleStartGroupCall,
      handleJoinActiveGroupCall,
      handleCloseGroupCallPanel,
    });
    useGroupCallGlobalAlertsMock.mockReturnValue([
      { groupId: "other-group", callId: "call-2" },
    ]);

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            activeGroup: { groupId: "group-1" } as Parameters<
              typeof useChatWorkspaceCallEntry
            >[0]["activeGroup"],
            activeGroupId: "group-1",
            groups: { "group-1": { groupId: "group-1" } as never },
          })}
        />
      );
    });

    expect(useGroupCallChatEntryMock).toHaveBeenCalledWith({
      activeGroup: { groupId: "group-1" },
      groups: { "group-1": { groupId: "group-1" } },
      userId: "user-1",
    });
    expect(useGroupCallGlobalAlertsMock).toHaveBeenCalledWith(
      "user-1",
      "group-1"
    );
    expect(hookRef.current?.groupCallNoticeSurface).toBe("banner");
    expect(hookRef.current?.globalGroupCallAlerts).toEqual([
      { groupId: "other-group", callId: "call-2" },
    ]);
    expect(hookRef.current?.handleStartGroupCall).toBe(handleStartGroupCall);
    expect(hookRef.current?.handleJoinActiveGroupCall).toBe(
      handleJoinActiveGroupCall
    );
    expect(hookRef.current?.handleCloseGroupCallPanel).toBe(
      handleCloseGroupCallPanel
    );
  });
});
