// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupActiveCall } from "@seclettr/protocol";
import type { GroupChat } from "@/stores/groups";
import { useGroupCallChatEntry } from "@/calls/group/runtime/useGroupCallChatEntry";

const hookMocks = vi.hoisted(() => ({
  useGroupCallSync: vi.fn(),
  useGroupCallSession: vi.fn(),
}));

vi.mock("@/calls/group/runtime/useGroupCallSync", () => ({
  useGroupCallSync: hookMocks.useGroupCallSync,
}));

vi.mock("@/calls/group/runtime/useGroupCallSession", () => ({
  useGroupCallSession: hookMocks.useGroupCallSession,
}));

function createGroup(overrides?: Partial<GroupChat>): GroupChat {
  return {
    groupId: "group-1",
    name: "Core Team",
    createdAt: "2026-03-01T00:00:00.000Z",
    members: [
      {
        userId: "user-1",
        username: "alice",
        joinedAt: "2026-03-01T00:00:00.000Z",
      },
    ],
    memberDeviceLabels: {},
    messages: [],
    lastMessageAt: 0,
    unreadCount: 0,
    historyLoaded: true,
    ...overrides,
  };
}

function createActiveGroupCall(overrides?: Partial<GroupActiveCall>): GroupActiveCall {
  return {
    callId: "call-1",
    callType: "audio",
    status: "ringing",
    callerUserId: "user-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    answeredAt: null,
    ...overrides,
  };
}

type GroupCallChatEntryApi = ReturnType<typeof useGroupCallChatEntry>;

function HookHarness(props: {
  activeGroup: GroupChat | null;
  groups: Record<string, GroupChat>;
  userId: string | null;
  capture: (api: GroupCallChatEntryApi) => void;
}) {
  const api = useGroupCallChatEntry({
    activeGroup: props.activeGroup,
    groups: props.groups,
    userId: props.userId,
  });
  props.capture(api);
  return null;
}

describe("useGroupCallChatEntry", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: GroupCallChatEntryApi | null;

  const startSpy = vi.fn();
  const joinSpy = vi.fn();
  const closeSpy = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    startSpy.mockReset();
    joinSpy.mockReset();
    closeSpy.mockReset();

    hookMocks.useGroupCallSync.mockReset();
    hookMocks.useGroupCallSession.mockReset();
    hookMocks.useGroupCallSync.mockReturnValue({
      activeGroupCall: null,
      activeGroupCallParticipantIds: [],
      callSyncDegraded: false,
      participantCountUncertain: false,
    });
    hookMocks.useGroupCallSession.mockReturnValue({
      groupCallSession: null,
      handleStartGroupCall: startSpy,
      handleJoinActiveGroupCall: joinSpy,
      handleCloseGroupCallPanel: closeSpy,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function render(props?: Partial<React.ComponentProps<typeof HookHarness>>) {
    const activeGroup = props?.activeGroup ?? createGroup();
    const groups = props?.groups ?? { [activeGroup.groupId]: activeGroup };
    const userId = props?.userId ?? "local-user";

    act(() => {
      root.render(
        <HookHarness
          activeGroup={activeGroup}
          groups={groups}
          userId={userId}
          capture={(next) => {
            api = next;
          }}
        />
      );
    });
  }

  it("composes sync and session inputs from the active group context", () => {
    const activeGroup = createGroup({ groupId: "group-42" });
    const activeGroupCall = createActiveGroupCall({ callId: "call-42" });
    hookMocks.useGroupCallSync.mockReturnValue({
      activeGroupCall,
      activeGroupCallParticipantIds: ["user-1"],
      callSyncDegraded: false,
      participantCountUncertain: false,
    });

    render({
      activeGroup,
      groups: { [activeGroup.groupId]: activeGroup },
      userId: "user-7",
    });

    expect(hookMocks.useGroupCallSync).toHaveBeenCalledWith("group-42", "user-7");
    expect(hookMocks.useGroupCallSession).toHaveBeenCalledWith({
      activeGroup,
      activeGroupCall,
      userId: "user-7",
      groups: { [activeGroup.groupId]: activeGroup },
    });
    expect(api?.activeGroupCall).toEqual(activeGroupCall);
    expect(api?.activeGroupCallParticipantIds).toEqual(["user-1"]);
  });

  it("shows the banner notice when an active call exists and no panel session is open", () => {
    hookMocks.useGroupCallSync.mockReturnValue({
      activeGroupCall: createActiveGroupCall(),
      activeGroupCallParticipantIds: ["user-1", "user-2"],
      callSyncDegraded: false,
      participantCountUncertain: false,
    });

    render();

    expect(api?.groupCallNoticeSurface).toBe("banner");
  });

  it("hides the notice when the group-call panel session is already open", () => {
    hookMocks.useGroupCallSync.mockReturnValue({
      activeGroupCall: createActiveGroupCall(),
      activeGroupCallParticipantIds: ["user-1", "user-2"],
      callSyncDegraded: false,
      participantCountUncertain: false,
    });
    hookMocks.useGroupCallSession.mockReturnValue({
      groupCallSession: {
        groupId: "group-1",
        groupName: "Core Team",
        members: createGroup().members,
        hostUserId: "user-1",
        callType: "audio",
      },
      handleStartGroupCall: startSpy,
      handleJoinActiveGroupCall: joinSpy,
      handleCloseGroupCallPanel: closeSpy,
    });

    render();

    expect(api?.groupCallNoticeSurface).toBe("hidden");
  });

  it("forwards start, join, and close handlers from the session owner", () => {
    render();

    act(() => {
      api?.handleStartGroupCall();
      api?.handleJoinActiveGroupCall();
      api?.handleCloseGroupCallPanel();
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
