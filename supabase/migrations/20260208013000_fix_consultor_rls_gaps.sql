-- Fix Consultor RLS INSERT Gaps
-- QA Pipeline: consultor-security-fix-001
-- Bugs: BUG-1, BUG-2, BUG-3 from QA_TEST_RESULTS_CONSULTOR.md
--
-- BUG-1: assessment_templates - no INSERT policy (consultor can insert via REST API)
-- BUG-2: news_articles - existing "Admins all access" policy includes consultor via FOR ALL
-- BUG-3: contratos - no INSERT policy (consultor can insert via REST API)

-- Ensure RLS is enabled on all three tables (idempotent)
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BUG-2 FIX: Drop the overly-permissive "Admins all access to news" policy
-- that grants consultor FOR ALL (SELECT, INSERT, UPDATE, DELETE).
-- Replace with scoped policies.
-- ============================================================
DROP POLICY IF EXISTS "Admins all access to news" ON news_articles;

-- Preserve: admin + community_manager get full read/write on news_articles
CREATE POLICY "news_articles_admin_cm_all"
  ON news_articles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type IN ('admin', 'community_manager')
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type IN ('admin', 'community_manager')
        AND user_roles.is_active = true
    )
  );

-- Preserve: public can read published news (already exists, use IF NOT EXISTS pattern)
-- Note: "Public read published news" may already exist from setup-news.tsx
-- If it fails, it means the policy already exists — that's fine.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'news_articles' AND policyname = 'Public read published news'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read published news" ON news_articles FOR SELECT USING (is_published = true)';
  END IF;
END $$;

-- ============================================================
-- BUG-1 FIX: assessment_templates — admin-only INSERT/UPDATE/DELETE
-- ============================================================
-- Drop any existing overly-permissive policies (safety)
DROP POLICY IF EXISTS "assessment_templates_insert_admin_only" ON assessment_templates;

CREATE POLICY "assessment_templates_insert_admin_only"
  ON assessment_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "assessment_templates_update_admin_only"
  ON assessment_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "assessment_templates_delete_admin_only"
  ON assessment_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- Consultor + admin can SELECT assessment_templates (read access stays)
CREATE POLICY "assessment_templates_select_admin_consultor"
  ON assessment_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type IN ('admin', 'consultor')
        AND user_roles.is_active = true
    )
  );

-- ============================================================
-- BUG-3 FIX: contratos — admin-only INSERT/UPDATE/DELETE
-- ============================================================
DROP POLICY IF EXISTS "contratos_insert_admin_only" ON contratos;

CREATE POLICY "contratos_insert_admin_only"
  ON contratos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "contratos_update_admin_only"
  ON contratos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "contratos_delete_admin_only"
  ON contratos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- Admin can SELECT contratos
CREATE POLICY "contratos_select_admin_only"
  ON contratos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );
