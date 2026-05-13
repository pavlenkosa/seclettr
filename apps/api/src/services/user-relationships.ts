import { query } from "../db/pool.js";

export type UserRelationshipBasis =
  | "self"
  | "direct_relationship"
  | "shared_group"
  | "prior_direct_message"
  | "prior_plain_direct_message"
  | "shared_plain_group"
  | "active_direct_call"
  | "none";

export interface UserRelationshipAccessResult {
  allowed: boolean;
  basis: UserRelationshipBasis;
}

function normalizeRelationshipPair(userIdA: string, userIdB: string): [string, string] {
  return userIdA <= userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export async function resolveUserRelationshipAccess(
  requesterUserId: string,
  targetUserId: string
): Promise<UserRelationshipAccessResult> {
  if (requesterUserId === targetUserId) {
    return {
      allowed: true,
      basis: "self",
    };
  }

  const [userLow, userHigh] = normalizeRelationshipPair(
    requesterUserId,
    targetUserId
  );

  const rows = await query<{ basis: UserRelationshipBasis }>(
    `SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM direct_relationships dr
          WHERE dr.user_low = $3
            AND dr.user_high = $4
          LIMIT 1
        ) THEN 'direct_relationship'
        WHEN EXISTS (
          SELECT 1
          FROM group_members gm_self
          INNER JOIN group_members gm_target
            ON gm_target.group_id = gm_self.group_id
          WHERE gm_self.user_id = $1
            AND gm_target.user_id = $2
            AND gm_self.removed_at IS NULL
            AND gm_target.removed_at IS NULL
          LIMIT 1
        ) THEN 'shared_group'
        WHEN EXISTS (
          SELECT 1
          FROM messages m
          INNER JOIN devices sender_device ON sender_device.id = m.sender_device_id
          INNER JOIN devices recipient_device ON recipient_device.id = m.recipient_device_id
          WHERE (sender_device.user_id = $1 AND recipient_device.user_id = $2)
             OR (sender_device.user_id = $2 AND recipient_device.user_id = $1)
          LIMIT 1
        ) THEN 'prior_direct_message'
        WHEN EXISTS (
          SELECT 1
          FROM plain_messages pm
          WHERE pm.recipient_user_id IS NOT NULL
            AND pm.deleted_at IS NULL
            AND (
              (pm.sender_user_id = $1 AND pm.recipient_user_id = $2)
              OR (pm.sender_user_id = $2 AND pm.recipient_user_id = $1)
            )
          LIMIT 1
        ) THEN 'prior_plain_direct_message'
        WHEN EXISTS (
          SELECT 1
          FROM plain_group_members pgm_self
          INNER JOIN plain_group_members pgm_target
            ON pgm_target.group_id = pgm_self.group_id
          WHERE pgm_self.user_id = $1
            AND pgm_target.user_id = $2
            AND pgm_self.removed_at IS NULL
            AND pgm_target.removed_at IS NULL
          LIMIT 1
        ) THEN 'shared_plain_group'
        WHEN EXISTS (
          SELECT 1
          FROM call_sessions c
          WHERE c.group_id IS NULL
            AND c.status IN ('ringing', 'active')
            AND (
              (c.caller_user_id = $1 AND c.callee_user_id = $2)
              OR (c.caller_user_id = $2 AND c.callee_user_id = $1)
            )
          LIMIT 1
        ) THEN 'active_direct_call'
        ELSE 'none'
      END AS basis`,
    [requesterUserId, targetUserId, userLow, userHigh]
  );

  const basis = rows[0]?.basis ?? "none";
  return {
    allowed: basis !== "none",
    basis,
  };
}

export async function ensureDirectRelationship(
  initiatorUserId: string,
  targetUserId: string
): Promise<void> {
  if (initiatorUserId === targetUserId) return;
  const [userLow, userHigh] = normalizeRelationshipPair(initiatorUserId, targetUserId);
  await query(
    `INSERT INTO direct_relationships (user_low, user_high, initiated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_low, user_high) DO NOTHING`,
    [userLow, userHigh, initiatorUserId]
  );
}
