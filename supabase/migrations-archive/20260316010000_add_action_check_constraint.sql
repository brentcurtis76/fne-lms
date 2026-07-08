-- Add CHECK constraint on action column
ALTER TABLE school_change_history
  ADD CONSTRAINT school_change_history_action_check
  CHECK (action IN ('initial_save', 'update'));
