-- Expense Report Access Control
-- Creates per-user permissions for managing expense reports

------------------------------------------------------------
-- 1. Table definition
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_report_access (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  can_submit BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Maintain updated_at automatically
CREATE OR REPLACE FUNCTION set_expense_report_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_report_access_set_updated
  ON expense_report_access;

CREATE TRIGGER trg_expense_report_access_set_updated
BEFORE UPDATE ON expense_report_access
FOR EACH ROW
EXECUTE FUNCTION set_expense_report_access_updated_at();

------------------------------------------------------------
-- 2. Row Level Security policies
------------------------------------------------------------
ALTER TABLE expense_report_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_report_access_admin_manage"
  ON expense_report_access;
CREATE POLICY "expense_report_access_admin_manage" ON expense_report_access
  FOR ALL
  USING (COALESCE(is_global_admin(auth.uid()), FALSE))
  WITH CHECK (COALESCE(is_global_admin(auth.uid()), FALSE));

DROP POLICY IF EXISTS "expense_report_access_self_read"
  ON expense_report_access;
CREATE POLICY "expense_report_access_self_read" ON expense_report_access
  FOR SELECT
  USING (user_id = auth.uid());

------------------------------------------------------------
-- 3. Expense report table policies
------------------------------------------------------------
DROP POLICY IF EXISTS "expense_reports_own"
  ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_access"
  ON expense_reports;

CREATE POLICY "expense_reports_access" ON expense_reports
  FOR ALL
  USING (
    (
      submitted_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
    )
    OR COALESCE(is_global_admin(auth.uid()), FALSE)
  )
  WITH CHECK (
    (
      submitted_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
    )
    OR COALESCE(is_global_admin(auth.uid()), FALSE)
  );

------------------------------------------------------------
-- 4. Expense items table policies
------------------------------------------------------------
DROP POLICY IF EXISTS "expense_items_own_reports"
  ON expense_items;
DROP POLICY IF EXISTS "expense_items_access"
  ON expense_items;

CREATE POLICY "expense_items_access" ON expense_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND (
          (
            er.submitted_by = auth.uid()
            AND EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
          )
          OR COALESCE(is_global_admin(auth.uid()), FALSE)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND (
          (
            er.submitted_by = auth.uid()
            AND EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
          )
          OR COALESCE(is_global_admin(auth.uid()), FALSE)
        )
    )
  );

------------------------------------------------------------
-- 5. Helper for granting access
------------------------------------------------------------
-- Example:
-- INSERT INTO expense_report_access (user_id, can_submit, granted_by, notes)
-- VALUES ('<USER_UUID>', TRUE, '<ADMIN_UUID>', 'Expense reports enabled')
-- ON CONFLICT (user_id)
--   DO UPDATE SET can_submit = EXCLUDED.can_submit,
--                 notes = EXCLUDED.notes,
--                 granted_by = EXCLUDED.granted_by,
--                 updated_at = NOW();
