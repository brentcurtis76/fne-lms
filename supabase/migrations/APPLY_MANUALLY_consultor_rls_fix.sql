-- ============================================================
-- CONSULTOR SECURITY FIX - Run in Supabase Dashboard SQL Editor
-- Prompt ID: consultor-security-fix-002
-- Run ALL statements in ONE execution
-- ============================================================

-- ============================================================
-- STEP 1: Drop ALL old conflicting policies
-- ============================================================

-- Old assessment_templates policies (use auth_is_assessment_admin which includes consultor)
DROP POLICY IF EXISTS "assessment_templates_insert" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_update" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_delete" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_select" ON assessment_templates;

-- Old contratos policy (FOR ALL, qual=true — allows EVERYONE)
DROP POLICY IF EXISTS "Permitir todo en contratos" ON contratos;

-- Old news policy (FOR ALL, includes consultor)
DROP POLICY IF EXISTS "Admins all access to news" ON news_articles;

-- Drop CCVSC-created INSERT-only policies (will be replaced by complete set)
DROP POLICY IF EXISTS "assessment_templates_insert_admin_only" ON assessment_templates;
DROP POLICY IF EXISTS "news_articles_insert_admin_cm_only" ON news_articles;
DROP POLICY IF EXISTS "contratos_insert_admin_only" ON contratos;

-- ============================================================
-- STEP 2: Update auth_is_assessment_admin() to admin-only
-- ============================================================
CREATE OR REPLACE FUNCTION auth_is_assessment_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
  );
END;
$$;

-- ============================================================
-- STEP 3: Ensure RLS is enabled on all three tables
-- ============================================================
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 4: Create new policies - news_articles
-- ============================================================

-- Drop if exists (safety for re-runs)
DROP POLICY IF EXISTS "news_articles_admin_cm_all" ON news_articles;

-- Admin + community_manager get full access on news_articles
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

-- Public can read published news (idempotent)
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
-- STEP 5: Create new policies - assessment_templates
-- ============================================================

-- Drop if exists (safety for re-runs)
DROP POLICY IF EXISTS "assessment_templates_insert_admin_only" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_update_admin_only" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_delete_admin_only" ON assessment_templates;
DROP POLICY IF EXISTS "assessment_templates_select_admin_consultor" ON assessment_templates;

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

-- Consultor + admin can SELECT (read access stays)
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
-- STEP 6: Create new policies - contratos
-- ============================================================

-- Drop if exists (safety for re-runs)
DROP POLICY IF EXISTS "contratos_insert_admin_only" ON contratos;
DROP POLICY IF EXISTS "contratos_update_admin_only" ON contratos;
DROP POLICY IF EXISTS "contratos_delete_admin_only" ON contratos;
DROP POLICY IF EXISTS "contratos_select_admin_only" ON contratos;

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

-- ============================================================
-- STEP 7: Verify final state
-- ============================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('assessment_templates', 'news_articles', 'contratos')
ORDER BY tablename, policyname;
