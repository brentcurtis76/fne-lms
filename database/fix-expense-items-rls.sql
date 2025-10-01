-- Fix for Expense Items RLS Policy
-- Problem: The WITH CHECK clause for INSERT creates a circular dependency
-- when trying to insert expense_items for a newly created report
--
-- Solution: Simplify the policy to check parent report ownership more directly

------------------------------------------------------------
-- Drop existing policies (both old and new names)
------------------------------------------------------------
DROP POLICY IF EXISTS "expense_items_access" ON expense_items;
DROP POLICY IF EXISTS "expense_items_select" ON expense_items;
DROP POLICY IF EXISTS "expense_items_insert" ON expense_items;
DROP POLICY IF EXISTS "expense_items_update" ON expense_items;
DROP POLICY IF EXISTS "expense_items_delete" ON expense_items;

------------------------------------------------------------
-- Create separate policies for better control
------------------------------------------------------------

-- SELECT: Can read expense items if you can read the parent report
CREATE POLICY "expense_items_select" ON expense_items
  FOR SELECT
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
  );

-- INSERT: Can create expense items if:
-- 1. The parent report belongs to you (submitted_by = you)
-- 2. You have expense_report_access OR you're admin
-- 3. The report is in draft status (can't add items to submitted/approved reports)
CREATE POLICY "expense_items_insert" ON expense_items
  FOR INSERT
  WITH CHECK (
    -- Must be for a report you submitted
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND er.submitted_by = auth.uid()
        AND er.status = 'draft'
    )
    AND (
      -- And you must have permission to submit expense reports
      EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
      OR COALESCE(is_global_admin(auth.uid()), FALSE)
    )
  );

-- UPDATE: Can update expense items for draft reports you own (with access permission)
CREATE POLICY "expense_items_update" ON expense_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND er.submitted_by = auth.uid()
        AND er.status = 'draft'
    )
    AND (
      EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
      OR COALESCE(is_global_admin(auth.uid()), FALSE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND er.submitted_by = auth.uid()
        AND er.status = 'draft'
    )
    AND (
      EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
      OR COALESCE(is_global_admin(auth.uid()), FALSE)
    )
  );

-- DELETE: Can delete expense items for draft reports you own (with access permission)
CREATE POLICY "expense_items_delete" ON expense_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expense_reports er
      WHERE er.id = expense_items.report_id
        AND er.submitted_by = auth.uid()
        AND er.status = 'draft'
    )
    AND (
      EXISTS (
        SELECT 1 FROM expense_report_access
        WHERE user_id = auth.uid()
          AND can_submit = TRUE
      )
      OR COALESCE(is_global_admin(auth.uid()), FALSE)
    )
  );

------------------------------------------------------------
-- Verify policies are active
------------------------------------------------------------
-- Run this query to verify:
-- SELECT * FROM pg_policies WHERE tablename = 'expense_items';