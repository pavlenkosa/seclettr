import { api } from "@/lib/api";
import {
  GROUPS_PROTOCOL_VERSION,
  GroupResponseSchema,
  safeParseVersionedWire,
} from "@seclettr/protocol";
import type { GroupDetailsDto, GroupMember } from "./types";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";

/**
 * group-roster-runtime — authoritative group detail and member-device label fetch helpers.
 *
 * Owns:
 *   - group detail fetch + versioned protocol parse
 *   - member-device label hydration from authoritative API roster
 *
 * Does not own chat projection, history message mapping, or sender-key delivery.
 */

export async function fetchGroupDetails(
  groupId: string
): Promise<GroupDetailsDto | null> {
  try {
    const raw = await api.get<unknown>(`/groups/${encodeURIComponent(groupId)}`);
    const parsed = safeParseVersionedWire(GroupResponseSchema, raw, GROUPS_PROTOCOL_VERSION);
    if (!parsed.success) {
      return null;
    }
    return parsed.data as GroupDetailsDto;
  } catch {
    return null;
  }
}

export async function fetchGroupMemberDeviceLabels(
  groupId: string,
  members: GroupMember[]
): Promise<Record<string, string>> {
  const memberDevices = await api.getGroupMemberDevices(groupId);
  const usernames = new Map(
    members.map((member) => [
      member.userId,
      sanitizeDisplayTextOrFallback(member.username, member.userId),
    ])
  );
  const labels: Record<string, string> = {};
  for (const member of memberDevices) {
    const safeUsername = usernames.get(member.userId);
    if (!safeUsername) continue;
    for (const device of member.devices) {
      labels[device.deviceId] = safeUsername;
    }
  }
  return labels;
}
