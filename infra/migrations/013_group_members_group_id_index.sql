-- Partial index on group_members(group_id) for active members.
-- Speeds up roster queries (GET /groups/:id, member-devices, add-member count checks).
CREATE INDEX IF NOT EXISTS gm_group_active
  ON group_members (group_id)
  WHERE removed_at IS NULL;
