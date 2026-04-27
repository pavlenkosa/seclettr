import { z } from "zod";
import {
  GROUPS_PROTOCOL_VERSION,
  type StripVersion,
  versionedWireObject,
  wireObject,
} from "./common.js";
import { MessageTypeSchema } from "./messages.js";

export { GROUPS_PROTOCOL_VERSION } from "./common.js";

export const GroupMemberRoleSchema = z.enum(["owner", "admin", "member"]);
export type GroupMemberRole = z.infer<typeof GroupMemberRoleSchema>;

export const CreateGroupRequestSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
  name: z.string().min(1).max(128),
  memberUserIds: z.array(z.string().uuid()).min(1).max(255),
  }
);
export type CreateGroupRequestWire = z.infer<typeof CreateGroupRequestSchema>;
export type CreateGroupRequest = StripVersion<CreateGroupRequestWire>;

export const GroupSchema = wireObject({
  groupId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  members: z.array(
    wireObject({
      userId: z.string().uuid(),
      username: z.string(),
      joinedAt: z.string().datetime(),
      role: GroupMemberRoleSchema.optional(),
    })
  ),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupMemberPublicDeviceSchema = wireObject({
  deviceId: z.string().uuid(),
  identityKeyPublic: z.string(),
  signingKeyPublic: z.string(),
});
export type GroupMemberPublicDevice = z.infer<typeof GroupMemberPublicDeviceSchema>;

export const GroupMemberDevicesEntrySchema = wireObject({
  userId: z.string().uuid(),
  devices: z.array(GroupMemberPublicDeviceSchema),
});
export type GroupMemberDevicesEntry = z.infer<typeof GroupMemberDevicesEntrySchema>;

export const GroupMemberDevicesResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    members: z.array(GroupMemberDevicesEntrySchema),
  }
);
export type GroupMemberDevicesResponseWire = z.infer<
  typeof GroupMemberDevicesResponseSchema
>;
export type GroupMemberDevicesResponse = StripVersion<
  GroupMemberDevicesResponseWire
>;

export const GroupListResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    groups: z.array(
      wireObject({
        groupId: z.string().uuid(),
        name: z.string(),
        createdAt: z.string().datetime(),
      })
    ),
    /** Opaque cursor for the next page; absent when there are no more results. */
    nextCursor: z.string().optional(),
  }
);
export type GroupListResponseWire = z.infer<typeof GroupListResponseSchema>;
export type GroupListResponse = StripVersion<GroupListResponseWire>;

export const GroupResponseSchema = versionedWireObject(GROUPS_PROTOCOL_VERSION, {
  groupId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  members: z.array(
    wireObject({
      userId: z.string().uuid(),
      username: z.string(),
      joinedAt: z.string().datetime(),
      role: GroupMemberRoleSchema.optional(),
    })
  ),
});
export type GroupResponseWire = z.infer<typeof GroupResponseSchema>;
export type GroupResponse = StripVersion<GroupResponseWire>;

export const AddMemberRequestSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
  userIds: z.array(z.string().uuid()).min(1).max(50),
  role: GroupMemberRoleSchema.optional(),
  }
);
export type AddMemberRequestWire = z.infer<typeof AddMemberRequestSchema>;
export type AddMemberRequest = StripVersion<AddMemberRequestWire>;

export const UpdateGroupMemberRoleRequestSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
  role: z.enum(["admin", "member"]),
  }
);
export type UpdateGroupMemberRoleRequestWire = z.infer<
  typeof UpdateGroupMemberRoleRequestSchema
>;
export type UpdateGroupMemberRoleRequest = StripVersion<
  UpdateGroupMemberRoleRequestWire
>;

export const GroupActiveCallSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
  callId: z.string().uuid(),
  callType: z.enum(["audio", "video"]),
  status: z.enum(["ringing", "active"]),
  callerUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  answeredAt: z.string().datetime().nullable(),
  }
);
export type GroupActiveCallWire = z.infer<typeof GroupActiveCallSchema>;
export type GroupActiveCall = StripVersion<GroupActiveCallWire>;

export const GroupActiveCallEntrySchema = wireObject({
  groupId: z.string().uuid(),
  callId: z.string().uuid(),
  callType: z.enum(["audio", "video"]),
  status: z.enum(["ringing", "active"]),
  callerUserId: z.string().uuid(),
  createdAt: z.string().datetime(),
  answeredAt: z.string().datetime().nullable(),
});
export type GroupActiveCallEntry = z.infer<typeof GroupActiveCallEntrySchema>;

export const GroupActiveCallsResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  { calls: z.array(GroupActiveCallEntrySchema) }
);
export type GroupActiveCallsResponseWire = z.infer<typeof GroupActiveCallsResponseSchema>;
export type GroupActiveCallsResponse = StripVersion<GroupActiveCallsResponseWire>;

export const GroupCallParticipantSchema = wireObject({
  userId: z.string().uuid(),
  username: z.string(),
});
export type GroupCallParticipant = z.infer<typeof GroupCallParticipantSchema>;

export const GroupCallParticipantDeviceSchema = wireObject({
  userId: z.string().uuid(),
  deviceId: z.string().uuid(),
});
export type GroupCallParticipantDevice = z.infer<
  typeof GroupCallParticipantDeviceSchema
>;

export const GroupCallParticipantsResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    participants: z.array(GroupCallParticipantSchema),
  }
);
export type GroupCallParticipantsResponseWire = z.infer<
  typeof GroupCallParticipantsResponseSchema
>;
export type GroupCallParticipantsResponse = StripVersion<
  GroupCallParticipantsResponseWire
>;

export const GroupCallParticipantDevicesResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    participantDevices: z.array(GroupCallParticipantDeviceSchema),
  }
);
export type GroupCallParticipantDevicesResponseWire = z.infer<
  typeof GroupCallParticipantDevicesResponseSchema
>;
export type GroupCallParticipantDevicesResponse = StripVersion<
  GroupCallParticipantDevicesResponseWire
>;

export const GroupCallJoinResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    ok: z.literal(true),
    participants: z.array(GroupCallParticipantSchema),
  }
);
export type GroupCallJoinResponseWire = z.infer<
  typeof GroupCallJoinResponseSchema
>;
export type GroupCallJoinResponse = StripVersion<GroupCallJoinResponseWire>;

export const GroupHistoryMessageSchema = wireObject({
  id: z.string().uuid(),
  senderDeviceId: z.string().uuid(),
  distributionId: z.string().uuid(),
  chainId: z.number().int().min(0),
  messageId: z.number().int().min(0),
  messageType: MessageTypeSchema,
  ciphertext: z.string(),
  signature: z.string(),
  createdAt: z.string().datetime(),
  /** 0 = legacy empty AEAD AD; 1 = distributionId+chainId+messageId AD. Absent for historical rows → treat as 0. */
  aeadVersion: z.number().int().min(0).max(1).optional(),
});
export type GroupHistoryMessage = z.infer<typeof GroupHistoryMessageSchema>;

export const GroupHistoryResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    messages: z.array(GroupHistoryMessageSchema),
  }
);
export type GroupHistoryResponseWire = z.infer<typeof GroupHistoryResponseSchema>;
export type GroupHistoryResponse = StripVersion<GroupHistoryResponseWire>;

export const GroupMutationResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  {
    ok: z.literal(true),
  }
);
export type GroupMutationResponseWire = z.infer<
  typeof GroupMutationResponseSchema
>;
export type GroupMutationResponse = StripVersion<GroupMutationResponseWire>;

// ─── Missed direct (1:1) call notifications ───────────────────────────────────

export const DirectMissedCallEntrySchema = wireObject({
  callId: z.string().uuid(),
  callerUserId: z.string().uuid(),
  callerUsername: z.string(),
  callType: z.enum(["audio", "video"]),
  endedAt: z.string().datetime(),
});
export type DirectMissedCallEntry = z.infer<typeof DirectMissedCallEntrySchema>;

export const DirectMissedCallsResponseSchema = versionedWireObject(
  GROUPS_PROTOCOL_VERSION,
  { calls: z.array(DirectMissedCallEntrySchema) }
);
export type DirectMissedCallsResponseWire = z.infer<typeof DirectMissedCallsResponseSchema>;
export type DirectMissedCallsResponse = StripVersion<DirectMissedCallsResponseWire>;
