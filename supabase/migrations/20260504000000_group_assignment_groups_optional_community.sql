-- Make group_assignment_groups.community_id optional and add school_id.
--
-- Student-led groups can now be created by users who belong to a school but
-- do not have a growth community context (e.g. school-level roles without a
-- community assignment). To support that, group_assignment_groups gains a
-- school_id column and community_id becomes nullable.
--
-- This migration is additive and idempotent:
--   1. Add school_id (nullable) with FK + index.
--   2. Backfill school_id from growth_communities for existing rows.
--   3. Enforce school_id NOT NULL once backfilled.
--   4. Drop NOT NULL from community_id so school-only groups are allowed.

-- 1. Add school_id column ---------------------------------------------------

ALTER TABLE group_assignment_groups
  ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- Add FK constraint guarded for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'group_assignment_groups_school_id_fkey'
       AND conrelid = 'group_assignment_groups'::regclass
  ) THEN
    ALTER TABLE group_assignment_groups
      ADD CONSTRAINT group_assignment_groups_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS group_assignment_groups_school_id_idx
  ON group_assignment_groups(school_id);

COMMENT ON COLUMN group_assignment_groups.school_id IS
  'School the group belongs to. Required. Independent of community_id so school-only users can create groups.';

-- 2. Backfill school_id from growth_communities -----------------------------

UPDATE group_assignment_groups g
   SET school_id = gc.school_id
  FROM growth_communities gc
 WHERE g.community_id = gc.id
   AND g.school_id IS NULL;

-- 3. Enforce NOT NULL on school_id ------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'group_assignment_groups'
       AND column_name = 'school_id'
       AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE group_assignment_groups
      ALTER COLUMN school_id SET NOT NULL;
  END IF;
END
$$;

-- 4. Drop NOT NULL from community_id ----------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'group_assignment_groups'
       AND column_name = 'community_id'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE group_assignment_groups
      ALTER COLUMN community_id DROP NOT NULL;
  END IF;
END
$$;

COMMENT ON COLUMN group_assignment_groups.community_id IS
  'Optional growth community context. Null for school-only group creators with no community role.';
