export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, string>;
  timestamp?: number;
  renotify?: boolean;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
  }>;
}

export interface PushPreferences {
  directMessagesEnabled: boolean;
  groupMessagesEnabled: boolean;
  callInvitesEnabled: boolean;
  showSender: boolean;
}

interface BuildDirectMessagePushPayloadArgs {
  senderUserId: string;
  senderUsername: string | null;
  hasAttachment: boolean;
  preferences: PushPreferences;
}

interface BuildGroupMessagePushPayloadArgs {
  senderUserId: string;
  senderUsername: string | null;
  groupId: string;
  groupName: string | null;
  preferences: PushPreferences;
}

interface BuildCallInvitePushPayloadArgs {
  callerUserId: string;
  callerUsername: string | null;
  callId: string;
  callType: "audio" | "video";
  preferences: PushPreferences;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  directMessagesEnabled: true,
  groupMessagesEnabled: true,
  callInvitesEnabled: true,
  showSender: true,
};

export function buildDirectMessagePushPayload({
  senderUserId,
  senderUsername,
  hasAttachment,
  preferences,
}: BuildDirectMessagePushPayloadArgs): PushPayload | null {
  if (!preferences.directMessagesEnabled) {
    return null;
  }

  const title = preferences.showSender && senderUsername
    ? `@${senderUsername}`
    : "Seclettr";
  const attachmentBody = preferences.showSender && senderUsername
    ? `@${senderUsername} sent an encrypted attachment`
    : "New encrypted attachment";
  const messageBody = preferences.showSender && senderUsername
    ? `@${senderUsername} sent an encrypted message`
    : "New encrypted message";
  const body = hasAttachment ? attachmentBody : messageBody;

  return {
    title,
    body,
    tag: `msg:${senderUserId}`,
    timestamp: Date.now(),
    renotify: true,
    data: {
      type: "message",
      fromUserId: senderUserId,
      fromUsername: preferences.showSender ? (senderUsername ?? "") : "",
      messageKind: hasAttachment ? "attachment" : "text",
      url: `/?chat=${encodeURIComponent(senderUserId)}`,
    },
  };
}

export function buildGroupMessagePushPayload({
  senderUserId,
  senderUsername,
  groupId,
  groupName,
  preferences,
}: BuildGroupMessagePushPayloadArgs): PushPayload | null {
  if (!preferences.groupMessagesEnabled) {
    return null;
  }

  const normalizedGroupName = groupName?.trim() || "Group";
  const title = preferences.showSender && senderUsername
    ? `@${senderUsername}`
    : normalizedGroupName;
  const body = preferences.showSender && senderUsername
    ? `@${senderUsername} sent a new group message in ${normalizedGroupName}`
    : "New encrypted group message";

  return {
    title,
    body,
    tag: `group:${groupId}`,
    timestamp: Date.now(),
    renotify: true,
    data: {
      type: "group_message",
      groupId,
      groupName: normalizedGroupName,
      fromUserId: senderUserId,
      fromUsername: preferences.showSender ? (senderUsername ?? "") : "",
      url: `/?group=${encodeURIComponent(groupId)}`,
    },
  };
}

interface BuildGroupCallStartedPushPayloadArgs {
  callerUserId: string;
  callerUsername: string | null;
  groupId: string;
  groupName: string | null;
  callId: string;
  callType: "audio" | "video";
  preferences: PushPreferences;
}

export function buildGroupCallStartedPushPayload({
  callerUserId,
  callerUsername,
  groupId,
  groupName,
  callId,
  callType,
  preferences,
}: BuildGroupCallStartedPushPayloadArgs): PushPayload | null {
  if (!preferences.callInvitesEnabled) return null;

  const normalizedGroupName = groupName?.trim() || "Group";
  const callLabel = callType === "video" ? "video call" : "voice call";
  const title = preferences.showSender && callerUsername
    ? `Incoming ${callLabel} in ${normalizedGroupName}`
    : `Incoming ${callLabel}`;
  const body = preferences.showSender && callerUsername
    ? `@${callerUsername} started a group ${callLabel}`
    : `A group ${callLabel} has started in ${normalizedGroupName}`;

  return {
    title,
    body,
    tag: `call:${callId}`,
    timestamp: Date.now(),
    renotify: true,
    requireInteraction: true,
    data: {
      type: "group_call_invite",
      callId,
      callType,
      groupId,
      fromUserId: callerUserId,
      fromUsername: preferences.showSender ? (callerUsername ?? "") : "",
      url: `/?group=${encodeURIComponent(groupId)}`,
    },
  };
}

export function buildCallInvitePushPayload({
  callerUserId,
  callerUsername,
  callId,
  callType,
  preferences,
}: BuildCallInvitePushPayloadArgs): PushPayload | null {
  if (!preferences.callInvitesEnabled) {
    return null;
  }

  const callLabel = callType === "video" ? "video call" : "voice call";
  const title = preferences.showSender && callerUsername
    ? `Incoming ${callLabel}`
    : "Incoming call";
  const body = preferences.showSender && callerUsername
    ? `@${callerUsername} is calling you`
    : "Open Seclettr to answer the encrypted call";

  return {
    title,
    body,
    tag: `call:${callId}`,
    timestamp: Date.now(),
    renotify: true,
    requireInteraction: true,
    data: {
      type: "call_invite",
      callId,
      callType,
      fromUserId: callerUserId,
      fromUsername: preferences.showSender ? (callerUsername ?? "") : "",
      url: `/?chat=${encodeURIComponent(callerUserId)}`,
    },
  };
}
