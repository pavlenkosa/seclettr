import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { WsServerMessage } from "@seclettr/protocol";
import { wsClient } from "@/lib/websocket";
import { logGroupCallError } from "@/calls/group/runtime/group-call/logger";
import type {
  GroupCallRemoteMedia,
  GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/group-call/media-encryption-negotiation";
import type {
  GroupCallPanelSession,
  GroupCallStatusAction,
} from "@/calls/group/model/group-call-types";

interface UseGroupCallSessionSubscriptionsOptions {
  session: GroupCallPanelSession | null;
  callId: string | null;
  deviceId: string | null;
  cleanupLocalMedia: () => void;
  resetMinimizedDock: () => void;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setAccessGranted: Dispatch<SetStateAction<boolean>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
  setActiveParticipantDeviceIdsByUserId: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRemoteParticipantMediaModes: Dispatch<
    SetStateAction<Record<string, GroupCallRuntimeMediaEncryptionMode>>
  >;
  setRemoteMedia: Dispatch<SetStateAction<GroupCallRemoteMedia[]>>;
  joinedParticipantRef: MutableRefObject<boolean>;
  ownsServerCallRef: MutableRefObject<boolean>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  performUnloadCleanup: () => void;
  onClose: () => void;
}

type ParticipantDevicesByUserId = Record<string, string[]>;
type RemoteParticipantMediaModes = Record<
  string,
  GroupCallRuntimeMediaEncryptionMode
>;
type GroupCallSessionMessage = Extract<
  WsServerMessage,
  {
    type:
      | "group.call.participant_joined"
      | "group.call.participant_device_joined"
      | "group.call.participant_device_left"
      | "group.call.participant_left"
      | "group.call.media-mode"
      | "group.call.ended";
  }
>;
type GroupCallMessageWithScope = Extract<
  GroupCallSessionMessage,
  { groupId: string; callId: string }
>;

interface GroupCallSessionMessageContext {
  groupId: string;
  callId: string;
  deviceId: string | null;
  cleanupLocalMedia: () => void;
  resetMinimizedDock: () => void;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setAccessGranted: Dispatch<SetStateAction<boolean>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
  setActiveParticipantDeviceIdsByUserId: Dispatch<
    SetStateAction<ParticipantDevicesByUserId>
  >;
  setRemoteParticipantMediaModes: Dispatch<
    SetStateAction<RemoteParticipantMediaModes>
  >;
  setRemoteMedia: Dispatch<SetStateAction<GroupCallRemoteMedia[]>>;
  joinedParticipantRef: MutableRefObject<boolean>;
  ownsServerCallRef: MutableRefObject<boolean>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  syncRemoteProducers: (
    client: GroupSfuClient | null,
    failureMessage: string
  ) => void;
  onClose: () => void;
}

function compareDeviceIds(left: string, right: string) {
  return left.localeCompare(right);
}

function addParticipantUser(current: string[], userId: string) {
  return current.includes(userId) ? current : [...current, userId];
}

function addParticipantDevice(
  current: ParticipantDevicesByUserId,
  userId: string,
  deviceId: string
) {
  const existing = current[userId] ?? [];
  if (existing.includes(deviceId)) {
    return current;
  }

  return {
    ...current,
    [userId]: [...existing, deviceId].sort(compareDeviceIds),
  };
}

function removeParticipantDevice(
  current: ParticipantDevicesByUserId,
  userId: string,
  deviceId: string
) {
  const existing = current[userId];
  if (!existing?.includes(deviceId)) {
    return current;
  }

  const nextDevices = existing.filter(
    (deviceIdValue) => deviceIdValue !== deviceId
  );
  if (nextDevices.length === 0) {
    const next = { ...current };
    delete next[userId];
    return next;
  }

  return {
    ...current,
    [userId]: nextDevices,
  };
}

function removeParticipantUserDevices(
  current: ParticipantDevicesByUserId,
  userId: string
) {
  if (!(userId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[userId];
  return next;
}

function removeRemoteMediaForDevice(
  current: GroupCallRemoteMedia[],
  deviceId: string
) {
  return current.filter((media) => media.deviceId !== deviceId);
}

function removeRemoteMediaForUser(
  current: GroupCallRemoteMedia[],
  userId: string
) {
  return current.filter((media) => media.userId !== userId);
}

function removeRemoteMediaMode(
  current: RemoteParticipantMediaModes,
  deviceId: string
) {
  if (!(deviceId in current)) {
    return current;
  }

  const next = { ...current };
  delete next[deviceId];
  return next;
}

function setRemoteMediaMode(
  current: RemoteParticipantMediaModes,
  deviceId: string,
  mode: GroupCallRuntimeMediaEncryptionMode
) {
  return current[deviceId] === mode
    ? current
    : {
        ...current,
        [deviceId]: mode,
      };
}

function isCurrentGroupCallMessage(
  context: GroupCallSessionMessageContext,
  msg: GroupCallMessageWithScope
) {
  return msg.groupId === context.groupId && msg.callId === context.callId;
}

function handleParticipantJoined(
  msg: Extract<GroupCallSessionMessage, { type: "group.call.participant_joined" }>,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;

  context.setActiveParticipantUserIds((current) =>
    addParticipantUser(current, msg.userId)
  );
  context.syncRemoteProducers(
    context.sfuClientRef.current,
    "[group-call] failed to refresh after participant joined"
  );
}

function handleParticipantDeviceJoined(
  msg: Extract<
    GroupCallSessionMessage,
    { type: "group.call.participant_device_joined" }
  >,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;

  context.setActiveParticipantDeviceIdsByUserId((current) =>
    addParticipantDevice(current, msg.userId, msg.deviceId)
  );
}

function handleParticipantDeviceLeft(
  msg: Extract<
    GroupCallSessionMessage,
    { type: "group.call.participant_device_left" }
  >,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;

  context.setActiveParticipantDeviceIdsByUserId((current) =>
    removeParticipantDevice(current, msg.userId, msg.deviceId)
  );
  context.setRemoteMedia((current) =>
    removeRemoteMediaForDevice(current, msg.deviceId)
  );
  context.setRemoteParticipantMediaModes((current) =>
    removeRemoteMediaMode(current, msg.deviceId)
  );
}

function handleParticipantLeft(
  msg: Extract<GroupCallSessionMessage, { type: "group.call.participant_left" }>,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;

  // All three updaters are pure; React 18 batches them into one re-render.
  context.setActiveParticipantDeviceIdsByUserId((current) =>
    removeParticipantUserDevices(current, msg.userId)
  );
  context.setActiveParticipantUserIds((current) =>
    current.filter((userIdValue) => userIdValue !== msg.userId)
  );
  context.setRemoteMedia((current) =>
    removeRemoteMediaForUser(current, msg.userId)
  );

  const sfuClient = context.sfuClientRef.current;
  sfuClient?.removeParticipantMedia(msg.userId);
  context.syncRemoteProducers(
    sfuClient,
    "[group-call] failed to refresh after participant left"
  );
}

function handleMediaMode(
  msg: Extract<GroupCallSessionMessage, { type: "group.call.media-mode" }>,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;
  if (msg.deviceId === context.deviceId) return;

  context.setRemoteParticipantMediaModes((current) =>
    setRemoteMediaMode(current, msg.deviceId, msg.mode)
  );
}

function handleCallEnded(
  msg: Extract<GroupCallSessionMessage, { type: "group.call.ended" }>,
  context: GroupCallSessionMessageContext
) {
  if (!isCurrentGroupCallMessage(context, msg)) return;

  context.joinedParticipantRef.current = false;
  context.ownsServerCallRef.current = false;
  context.dispatchStatus({ type: "CALL_ENDED_BY_HOST" });
  context.setAccessGranted(false);
  context.resetMinimizedDock();
  context.cleanupLocalMedia();
  context.onClose();
}

function handleGroupCallSessionMessage(
  msg: WsServerMessage,
  context: GroupCallSessionMessageContext
) {
  switch (msg.type) {
    case "group.call.participant_joined":
      handleParticipantJoined(msg, context);
      break;
    case "group.call.participant_device_joined":
      handleParticipantDeviceJoined(msg, context);
      break;
    case "group.call.participant_device_left":
      handleParticipantDeviceLeft(msg, context);
      break;
    case "group.call.participant_left":
      handleParticipantLeft(msg, context);
      break;
    case "group.call.media-mode":
      handleMediaMode(msg, context);
      break;
    case "group.call.ended":
      handleCallEnded(msg, context);
      break;
  }
}

export function useGroupCallSessionSubscriptions({
  session,
  callId,
  deviceId,
  cleanupLocalMedia,
  resetMinimizedDock,
  dispatchStatus,
  setAccessGranted,
  setActiveParticipantUserIds,
  setActiveParticipantDeviceIdsByUserId,
  setRemoteParticipantMediaModes,
  setRemoteMedia,
  joinedParticipantRef,
  ownsServerCallRef,
  sfuClientRef,
  performUnloadCleanup,
  onClose,
}: UseGroupCallSessionSubscriptionsOptions) {
  const unloadSubscriptionRunIdRef = useRef(0);
  const connectionSubscriptionRunIdRef = useRef(0);
  const messageSubscriptionRunIdRef = useRef(0);

  useEffect(() => {
    if (!session || !callId) {
      return;
    }

    const subscriptionRunId = unloadSubscriptionRunIdRef.current + 1;
    unloadSubscriptionRunIdRef.current = subscriptionRunId;
    const isCurrentSubscription = () =>
      unloadSubscriptionRunIdRef.current === subscriptionRunId;

    const handlePageUnload = () => {
      if (!isCurrentSubscription()) return;
      performUnloadCleanup();
    };

    globalThis.addEventListener("pagehide", handlePageUnload);
    globalThis.addEventListener("beforeunload", handlePageUnload);

    return () => {
      if (isCurrentSubscription()) {
        unloadSubscriptionRunIdRef.current += 1;
      }
      globalThis.removeEventListener("pagehide", handlePageUnload);
      globalThis.removeEventListener("beforeunload", handlePageUnload);
    };
  }, [callId, performUnloadCleanup, session]);

  // Show "Reconnecting…" during WS dropout and return to ready when signaling
  // reconnects. SFU transport failures are handled by the lifecycle runtime,
  // which reopens the SFU client with the existing local stream and call id.
  useEffect(() => {
    if (!session || !callId) {
      return;
    }

    const subscriptionRunId = connectionSubscriptionRunIdRef.current + 1;
    connectionSubscriptionRunIdRef.current = subscriptionRunId;
    const isCurrentSubscription = () =>
      connectionSubscriptionRunIdRef.current === subscriptionRunId;

    const unsubscribe = wsClient.onConnectionChange((connected) => {
      if (!isCurrentSubscription()) return;
      if (connected) {
        dispatchStatus({ type: "SESSION_READY" });
      } else {
        dispatchStatus({ type: "RECONNECT_START" });
      }
    });

    return () => {
      if (isCurrentSubscription()) {
        connectionSubscriptionRunIdRef.current += 1;
      }
      unsubscribe();
    };
  }, [callId, dispatchStatus, session]);

  useEffect(() => {
    if (!session || !callId) {
      return;
    }

    const subscriptionRunId = messageSubscriptionRunIdRef.current + 1;
    messageSubscriptionRunIdRef.current = subscriptionRunId;
    const isCurrentSubscription = () =>
      messageSubscriptionRunIdRef.current === subscriptionRunId;
    const syncRemoteProducers = (
      client: GroupSfuClient | null,
      failureMessage: string
    ) => {
      if (!client) return;
      client.syncRemoteProducers().catch((syncError) => {
        if (!isCurrentSubscription() || sfuClientRef.current !== client) return;
        logGroupCallError(failureMessage, syncError);
      });
    };
    const messageContext: GroupCallSessionMessageContext = {
      groupId: session.groupId,
      callId,
      deviceId,
      cleanupLocalMedia,
      resetMinimizedDock,
      dispatchStatus,
      setAccessGranted,
      setActiveParticipantUserIds,
      setActiveParticipantDeviceIdsByUserId,
      setRemoteParticipantMediaModes,
      setRemoteMedia,
      joinedParticipantRef,
      ownsServerCallRef,
      sfuClientRef,
      syncRemoteProducers,
      onClose,
    };

    const unsubscribe = wsClient.on((msg) => {
      if (!isCurrentSubscription()) return;
      handleGroupCallSessionMessage(msg, messageContext);
    });

    return () => {
      if (isCurrentSubscription()) {
        messageSubscriptionRunIdRef.current += 1;
      }
      unsubscribe();
    };
  }, [
    callId,
    cleanupLocalMedia,
    deviceId,
    joinedParticipantRef,
    onClose,
    ownsServerCallRef,
    resetMinimizedDock,
    session,
    setAccessGranted,
    setActiveParticipantDeviceIdsByUserId,
    setActiveParticipantUserIds,
    setRemoteParticipantMediaModes,
    setRemoteMedia,
    dispatchStatus,
    sfuClientRef,
  ]);
}
