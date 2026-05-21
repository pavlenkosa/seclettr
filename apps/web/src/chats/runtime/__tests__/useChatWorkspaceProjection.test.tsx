// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Conversation, Message } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import type { PlainConversation, PlainGroup } from "@/stores/plain";
import type { SavedMessage } from "@/stores/saved";
import { useChatWorkspaceProjection } from "../useChatWorkspaceProjection";

interface HookValue extends ReturnType<typeof useChatWorkspaceProjection> {}

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  options: Parameters<typeof useChatWorkspaceProjection>[0];
}) {
  props.hookRef.current = useChatWorkspaceProjection(props.options);
  return null;
}

describe("useChatWorkspaceProjection", () => {
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
    overrides?: Partial<Parameters<typeof useChatWorkspaceProjection>[0]>
  ): Parameters<typeof useChatWorkspaceProjection>[0] {
    return {
      activeConversation: null,
      activeGroup: null,
      activePlainConversation: null,
      activePlainGroup: null,
      conversations: {},
      groups: {},
      plainConversations: {},
      plainGroups: {},
      savedThreadActive: false,
      savedMessages: [],
      userId: "user-self",
      ...overrides,
    };
  }

  it("projects saved-thread attachments into chat messages", () => {
    const savedMessages: SavedMessage[] = [
      {
        id: "saved-1",
        content: "voice",
        timestamp: 10,
        attachment: {
          fileName: "note.ogg",
          mimeType: "audio/ogg",
          size: 123,
          kind: "voice_note",
          durationMs: 4567,
          dataUrl: "blob:saved",
        },
      },
    ];

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            savedThreadActive: true,
            savedMessages,
          })}
        />
      );
    });

    expect(hookRef.current?.activeListId).toBe("saved:saved");
    expect(hookRef.current?.activeMessages).toEqual([
      {
        id: "saved-1",
        senderId: "user-self",
        senderDeviceId: "user-self",
        content: "voice",
        type: "attachment",
        timestamp: 10,
        status: "sent",
        isOwn: true,
        attachment: {
          attachmentId: "saved-1",
          key: "",
          digest: "",
          mimeType: "audio/ogg",
          fileName: "note.ogg",
          size: 123,
          kind: "voice_note",
          durationMs: 4567,
          isPlain: true,
          localUrl: "blob:saved",
        },
      },
    ]);
  });

  it("builds plain-group sender labels and loading state", () => {
    const activePlainGroup: PlainGroup = {
      groupId: "g-1",
      name: "Group",
      creatorId: "owner",
      members: [],
      messages: [
        {
          id: "m-1",
          clientId: "m-1",
          senderId: "peer",
          senderName: "alice",
          content: "hello",
          type: "text",
          timestamp: 1,
          isOwn: false,
          status: "sent",
        },
      ],
      lastMessageAt: 1,
      unreadCount: 0,
      hasMore: false,
      historyLoaded: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            activePlainGroup,
            plainGroups: { "g-1": activePlainGroup },
          })}
        />
      );
    });

    expect(hookRef.current?.activeListId).toBe("plain-group:g-1");
    expect(hookRef.current?.groupSenderLabels).toEqual({ "m-1": "@alice" });
    expect(hookRef.current?.activeHistoryLoading).toBe(true);
  });

  it("projects encrypted group messages into chat message shape", () => {
    const activeGroup: GroupChat = {
      groupId: "group-1",
      name: "Encrypted",
      cryptoEpoch: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      lastMessageAt: 0,
      unreadCount: 0,
      members: [],
      memberDeviceLabels: {},
      messages: [
        {
          id: "gmsg-1",
          senderDeviceId: "device-peer",
          senderLabel: "@peer",
          content: "hi",
          timestamp: 20,
          status: "sent",
          isOwn: false,
        } as GroupChat["messages"][number],
      ],
      historyLoaded: true,
    };

    act(() => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          options={createOptions({
            activeGroup,
            groups: { "group-1": activeGroup },
          })}
        />
      );
    });

    expect(hookRef.current?.activeListId).toBe("group:group-1");
    expect(hookRef.current?.groupSenderLabels).toEqual({ "gmsg-1": "@peer" });
    expect(hookRef.current?.activeMessages).toEqual([
      {
        id: "gmsg-1",
        senderId: "device-peer",
        senderDeviceId: "device-peer",
        content: "hi",
        type: "text",
        attachment: undefined,
        timestamp: 20,
        status: "sent",
        isOwn: false,
        replyTo: undefined,
      } satisfies Message,
    ]);
  });
});
