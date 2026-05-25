// @vitest-environment jsdom

import { useCallback, useEffect, useRef, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsServerMessage } from "@seclettr/protocol";
import { useGroupCallSessionSubscriptions } from "@/calls/group/runtime/useGroupCallSessionSubscriptions";
import type { GroupCallStatusAction } from "@/calls/group/model/group-call-types";
import type {
  GroupCallRemoteMedia,
  GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";

const wsMocks = vi.hoisted(() => {
  const messageHandlers: Array<(msg: unknown) => void> = [];
  const connectionHandlers: Array<(connected: boolean) => void> = [];

  return {
    messageHandlers,
    connectionHandlers,
    on: vi.fn((handler: (msg: unknown) => void) => {
      messageHandlers.push(handler);
      return () => {
        const index = messageHandlers.indexOf(handler);
        if (index >= 0) {
          messageHandlers.splice(index, 1);
        }
      };
    }),
    onConnectionChange: vi.fn((handler: (connected: boolean) => void) => {
      connectionHandlers.push(handler);
      return () => {
        const index = connectionHandlers.indexOf(handler);
        if (index >= 0) {
          connectionHandlers.splice(index, 1);
        }
      };
    }),
  };
});

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    on: wsMocks.on,
    onConnectionChange: wsMocks.onConnectionChange,
  },
}));

const SESSION_A = {
  groupId: "group-a",
  groupName: "Alpha",
  members: [],
  callType: "audio" as const,
  hostUserId: "host-a",
};

const SESSION_B = {
  groupId: "group-b",
  groupName: "Beta",
  members: [],
  callType: "audio" as const,
  hostUserId: "host-b",
};

interface SubscriptionSnapshot {
  activeParticipantUserIds: string[];
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  remoteParticipantMediaModes: Record<string, GroupCallRuntimeMediaEncryptionMode>;
  remoteMedia: GroupCallRemoteMedia[];
  accessGranted: boolean;
}

function createRemoteMedia(userId = "remote-user", deviceId = "remote-device"): GroupCallRemoteMedia {
  return {
    mediaId: `${userId}:audio`,
    userId,
    deviceId,
    hasAudio: false,
    hasVideo: false,
    audioStream: null,
    videoStream: null,
    videoSource: null,
  };
}

function createFakeSfuClient(): GroupSfuClient {
  return {
    rtpCapabilities: {},
    syncRemoteProducers: vi.fn(async () => undefined),
    removeParticipantMedia: vi.fn(),
    setVideoTrack: vi.fn(async () => undefined),
    setLocalMediaKey: vi.fn(),
    setRemoteMediaKey: vi.fn(),
    getDebugSnapshot: vi.fn(() => ({})),
    close: vi.fn(),
  } as unknown as GroupSfuClient;
}

function SubscriptionsHarness(props: {
  session: typeof SESSION_A | typeof SESSION_B;
  callId: string;
  sfuClient: GroupSfuClient;
  onSnapshot: (snapshot: SubscriptionSnapshot) => void;
  onStatus: (action: GroupCallStatusAction) => void;
  cleanupLocalMedia: () => void;
  resetMinimizedDock: () => void;
  onClose: () => void;
}) {
  const [accessGranted, setAccessGranted] = useState(true);
  const [activeParticipantUserIds, setActiveParticipantUserIds] = useState([
    "remote-user",
  ]);
  const [
    activeParticipantDeviceIdsByUserId,
    setActiveParticipantDeviceIdsByUserId,
  ] = useState<Record<string, string[]>>({
    "remote-user": ["remote-device"],
  });
  const [remoteParticipantMediaModes, setRemoteParticipantMediaModes] =
    useState<Record<string, GroupCallRuntimeMediaEncryptionMode>>({
      "remote-device": "required",
    });
  const [remoteMedia, setRemoteMedia] = useState<GroupCallRemoteMedia[]>([
    createRemoteMedia(),
  ]);

  const joinedParticipantRef = useRef(true);
  const ownsServerCallRef = useRef(true);
  const sfuClientRef = useRef<GroupSfuClient | null>(props.sfuClient);
  sfuClientRef.current = props.sfuClient;

  const performUnloadCleanup = useCallback(() => undefined, []);

  useEffect(() => {
    props.onSnapshot({
      activeParticipantUserIds,
      activeParticipantDeviceIdsByUserId,
      remoteParticipantMediaModes,
      remoteMedia,
      accessGranted,
    });
  }, [
    accessGranted,
    activeParticipantDeviceIdsByUserId,
    activeParticipantUserIds,
    props,
    remoteMedia,
    remoteParticipantMediaModes,
  ]);

  useGroupCallSessionSubscriptions({
    session: props.session,
    callId: props.callId,
    deviceId: "local-device",
    cleanupLocalMedia: props.cleanupLocalMedia,
    resetMinimizedDock: props.resetMinimizedDock,
    dispatchStatus: props.onStatus,
    setAccessGranted,
    setActiveParticipantUserIds,
    setActiveParticipantDeviceIdsByUserId,
    setRemoteParticipantMediaModes,
    setRemoteMedia,
    joinedParticipantRef,
    ownsServerCallRef,
    sfuClientRef,
    performUnloadCleanup,
    onClose: props.onClose,
  });

  return null;
}

describe("useGroupCallSessionSubscriptions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    wsMocks.messageHandlers.length = 0;
    wsMocks.connectionHandlers.length = 0;
    wsMocks.on.mockClear();
    wsMocks.onConnectionChange.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("ignores stale websocket subscription callbacks after session replacement", () => {
    const oldClient = createFakeSfuClient();
    const newClient = createFakeSfuClient();
    const onStatus = vi.fn();
    const onSnapshot = vi.fn();
    const cleanupLocalMedia = vi.fn();
    const resetMinimizedDock = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <SubscriptionsHarness
          session={SESSION_A}
          callId="call-a"
          sfuClient={oldClient}
          onSnapshot={onSnapshot}
          onStatus={onStatus}
          cleanupLocalMedia={cleanupLocalMedia}
          resetMinimizedDock={resetMinimizedDock}
          onClose={onClose}
        />
      );
    });

    const oldMessageHandler = wsMocks.messageHandlers[0] as
      | ((msg: WsServerMessage) => void)
      | undefined;
    const oldConnectionHandler = wsMocks.connectionHandlers[0];
    expect(oldMessageHandler).toEqual(expect.any(Function));
    expect(oldConnectionHandler).toEqual(expect.any(Function));

    act(() => {
      root.render(
        <SubscriptionsHarness
          session={SESSION_B}
          callId="call-b"
          sfuClient={newClient}
          onSnapshot={onSnapshot}
          onStatus={onStatus}
          cleanupLocalMedia={cleanupLocalMedia}
          resetMinimizedDock={resetMinimizedDock}
          onClose={onClose}
        />
      );
    });

    act(() => {
      oldConnectionHandler?.(false);
      oldMessageHandler?.({
        type: "group.call.participant_left",
        groupId: "group-a",
        callId: "call-a",
        userId: "remote-user",
      } as WsServerMessage);
      oldMessageHandler?.({
        type: "group.call.ended",
        groupId: "group-a",
        callId: "call-a",
        wasMissed: false,
      } as WsServerMessage);
    });

    const latestSnapshot = onSnapshot.mock.calls.at(-1)?.[0] as
      | SubscriptionSnapshot
      | undefined;
    expect(latestSnapshot?.activeParticipantUserIds).toEqual(["remote-user"]);
    expect(latestSnapshot?.activeParticipantDeviceIdsByUserId).toEqual({
      "remote-user": ["remote-device"],
    });
    expect(latestSnapshot?.remoteMedia).toHaveLength(1);
    expect(oldClient.removeParticipantMedia).not.toHaveBeenCalled();
    expect(newClient.removeParticipantMedia).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalledWith({ type: "RECONNECT_START" });
    expect(onStatus).not.toHaveBeenCalledWith({ type: "CALL_ENDED_BY_HOST" });
    expect(cleanupLocalMedia).not.toHaveBeenCalled();
    expect(resetMinimizedDock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
