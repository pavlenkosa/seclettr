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

/**
 * Optional media descriptor for richer push body text.
 * Only known on plain (server-readable) messages — E2EE messages stay
 * with the generic "encrypted message" phrasing.
 */
export interface PushMediaSummary {
  messageType: "text" | "attachment" | "voice_note" | "video_note";
  mimeType?: string | undefined;
}

interface BuildDirectMessagePushPayloadArgs {
  senderUserId: string;
  senderUsername: string | null;
  hasAttachment: boolean;
  /** Plain-only: actual message text to show in the push body (text messages only). */
  messageText?: string | null;
  /** Plain-only: drives a typed body like "📷 Photo" instead of generic "attachment". */
  mediaSummary?: PushMediaSummary | null;
  preferences: PushPreferences;
}

interface BuildGroupMessagePushPayloadArgs {
  senderUserId: string;
  senderUsername: string | null;
  groupId: string;
  groupName: string | null;
  /** Plain-only: actual message text to show in the push body (text messages only). */
  messageText?: string | null;
  /** Plain-only: drives a typed body like "📷 Photo" instead of generic "attachment". */
  mediaSummary?: PushMediaSummary | null;
  preferences: PushPreferences;
}

const MAX_PUSH_TEXT_LEN = 200;

function truncateText(text: string): string {
  return text.length <= MAX_PUSH_TEXT_LEN ? text : text.slice(0, MAX_PUSH_TEXT_LEN) + "…";
}

const MARK_READ_ACTION = { action: "mark-read", title: "Mark as read" };

/**
 * Returns a short, emoji-prefixed description for a plain message body, or
 * `null` when the message is text-only and the caller should fall back to
 * the standard "sent a message" phrasing.
 */
function formatMediaSummary(summary: PushMediaSummary | null | undefined): string | null {
  if (!summary || summary.messageType === "text") return null;
  if (summary.messageType === "voice_note") return "🎤 Voice message";
  if (summary.messageType === "video_note") return "🎥 Video message";
  // Generic attachment — refine by mime when possible.
  const mime = summary.mimeType ?? "";
  if (mime.startsWith("image/")) return "📷 Photo";
  if (mime.startsWith("video/")) return "📹 Video";
  if (mime.startsWith("audio/")) return "🎵 Audio";
  return "📎 File";
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
  messageText,
  mediaSummary,
  preferences,
}: BuildDirectMessagePushPayloadArgs): PushPayload | null {
  if (!preferences.directMessagesEnabled) {
    return null;
  }

  const title = preferences.showSender && senderUsername
    ? `@${senderUsername}`
    : "Seclettr";
  const mediaLine = formatMediaSummary(mediaSummary);
  let body: string;
  if (messageText && !hasAttachment) {
    body = preferences.showSender && senderUsername
      ? truncateText(messageText)
      : truncateText(messageText);
  } else if (mediaLine) {
    body = mediaLine;
  } else if (hasAttachment) {
    body = preferences.showSender && senderUsername
      ? `@${senderUsername} sent an encrypted attachment`
      : "New encrypted attachment";
  } else {
    body = preferences.showSender && senderUsername
      ? `@${senderUsername} sent an encrypted message`
      : "New encrypted message";
  }

  return {
    title,
    body,
    tag: `msg:${senderUserId}`,
    timestamp: Date.now(),
    renotify: true,
    actions: [MARK_READ_ACTION],
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
  messageText,
  mediaSummary,
  preferences,
}: BuildGroupMessagePushPayloadArgs): PushPayload | null {
  if (!preferences.groupMessagesEnabled) {
    return null;
  }

  const normalizedGroupName = groupName?.trim() || "Group";
  const title = preferences.showSender && senderUsername
    ? `@${senderUsername}`
    : normalizedGroupName;
  const mediaLine = formatMediaSummary(mediaSummary);
  let body: string;
  if (messageText) {
    body = preferences.showSender && senderUsername
      ? `@${senderUsername}: ${truncateText(messageText)}`
      : truncateText(messageText);
  } else if (mediaLine) {
    body = preferences.showSender && senderUsername
      ? `@${senderUsername} in ${normalizedGroupName}: ${mediaLine}`
      : `${normalizedGroupName}: ${mediaLine}`;
  } else {
    body = preferences.showSender && senderUsername
      ? `@${senderUsername} sent a new group message in ${normalizedGroupName}`
      : "New encrypted group message";
  }

  return {
    title,
    body,
    tag: `group:${groupId}`,
    timestamp: Date.now(),
    renotify: true,
    actions: [MARK_READ_ACTION],
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

interface BuildMissedCallPushPayloadArgs {
  callerUserId: string;
  callerUsername: string | null;
  callId: string;
  callType: "audio" | "video";
  preferences: PushPreferences;
}

export function buildMissedCallPushPayload({
  callerUserId,
  callerUsername,
  callId,
  callType,
  preferences,
}: BuildMissedCallPushPayloadArgs): PushPayload | null {
  if (!preferences.callInvitesEnabled) return null;

  const callLabel = callType === "video" ? "video call" : "voice call";
  const title = "Missed call";
  const body = preferences.showSender && callerUsername
    ? `You missed a ${callLabel} from @${callerUsername}`
    : `You missed an encrypted ${callLabel}`;

  return {
    title,
    body,
    tag: `call:${callId}`,
    timestamp: Date.now(),
    data: {
      type: "missed_call",
      callId,
      callType,
      fromUserId: callerUserId,
      fromUsername: preferences.showSender ? (callerUsername ?? "") : "",
      url: `/?chat=${encodeURIComponent(callerUserId)}`,
    },
  };
}
