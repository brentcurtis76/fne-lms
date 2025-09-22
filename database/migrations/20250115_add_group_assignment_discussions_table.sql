-- Adds explicit mapping between group assignments and workspace discussion threads

BEGIN;

CREATE TABLE IF NOT EXISTS group_assignment_discussions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  group_id UUID NOT NULL REFERENCES group_assignment_groups(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_assignment_discussions_unique
  ON group_assignment_discussions (assignment_id, group_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_group_assignment_discussions_assignment
  ON group_assignment_discussions (assignment_id);

CREATE INDEX IF NOT EXISTS idx_group_assignment_discussions_group
  ON group_assignment_discussions (group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON group_assignment_discussions TO authenticated;
GRANT ALL ON group_assignment_discussions TO service_role;

COMMIT;
