BEGIN;

ALTER TABLE group_members
  ADD COLUMN role TEXT;

UPDATE group_members gm
SET role = CASE
  WHEN g.creator_id = gm.user_id THEN 'owner'
  ELSE 'member'
END
FROM groups g
WHERE g.id = gm.group_id;

ALTER TABLE group_members
  ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE group_members
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE group_members
  ADD CONSTRAINT group_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

CREATE INDEX gm_group_role_active
  ON group_members (group_id, role)
  WHERE removed_at IS NULL;

COMMIT;
