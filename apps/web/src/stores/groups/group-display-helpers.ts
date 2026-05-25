import {
  sanitizeDisplayText,
  sanitizeDisplayTextOrFallback,
} from "@/lib/display-text";
import type { GroupChat, GroupDetailsDto, GroupMember } from "./types";
import { parseTimestamp } from "./group-message-mapping";

/**
 * group-display-helpers — group chat display/name/label projection helpers.
 *
 * Owns:
 *   - fallback group naming for unknown/stub group shells
 *   - sender label projection for own/peer group messages
 *   - group member username sanitization
 *   - group-chat projection from GroupDetailsDto + existing runtime state
 *   - guarded refresh scheduling for missing device-label hydration
 *
 * Does not own history decryption, group-message mapping, or sender-key delivery.
 */

export const GROUP_UNKNOWN_SENDER_LABEL = "Participant";
export const GROUP_OWN_SENDER_LABEL = "You";

const GROUP_LABEL_REFRESH_IN_FLIGHT = new Set<string>();

export function formatUnknownGroupName(groupId: string): string {
  return `Group ${groupId.slice(0, 8)}`;
}

function sanitizeGroupMember(member: GroupMember): GroupMember {
  return {
    ...member,
    username: sanitizeDisplayTextOrFallback(member.username, member.userId),
  };
}

export function formatSenderLabel(
  senderDeviceId: string,
  isOwn: boolean,
  memberDeviceLabels?: Record<string, string>
): string {
  if (isOwn) return GROUP_OWN_SENDER_LABEL;
  const mapped = sanitizeDisplayText(memberDeviceLabels?.[senderDeviceId]);
  if (mapped) return `@${mapped}`;
  return GROUP_UNKNOWN_SENDER_LABEL;
}

export function scheduleGroupLabelRefresh(
  groupId: string,
  refreshGroup: (groupId: string) => Promise<void>
): void {
  if (!groupId || GROUP_LABEL_REFRESH_IN_FLIGHT.has(groupId)) return;
  GROUP_LABEL_REFRESH_IN_FLIGHT.add(groupId);
  void refreshGroup(groupId).finally(() => {
    GROUP_LABEL_REFRESH_IN_FLIGHT.delete(groupId);
  });
}

export function toGroupChat(
  detail: GroupDetailsDto,
  existing?: GroupChat
): GroupChat {
  const safeMembers = detail.members.map(sanitizeGroupMember);
  const memberDeviceLabels =
    detail.memberDeviceLabels ?? existing?.memberDeviceLabels ?? {};
  const messages = (existing?.messages ?? []).map((message) => {
    if (message.isOwn) return message;
    return {
      ...message,
      senderLabel: formatSenderLabel(
        message.senderDeviceId,
        false,
        memberDeviceLabels
      ),
    };
  });

  return {
    groupId: detail.groupId,
    name: sanitizeDisplayTextOrFallback(
      detail.name,
      formatUnknownGroupName(detail.groupId)
    ),
    createdAt: detail.createdAt,
    cryptoEpoch: detail.cryptoEpoch ?? existing?.cryptoEpoch ?? 1,
    members: safeMembers,
    memberDeviceLabels,
    messages,
    lastMessageAt: existing?.lastMessageAt ?? parseTimestamp(detail.createdAt),
    unreadCount: existing?.unreadCount ?? 0,
    historyLoaded: existing?.historyLoaded ?? false,
  };
}
