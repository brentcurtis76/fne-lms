-- N1-02: per-category notification email preferences.
--
-- Why: the legacy public.user_notification_preferences table is keyed by
-- notification_type and only stores email/in-app booleans, so users cannot
-- choose immediate, digest or off per app category. This adds a separate
-- table holding one email mode per user per notification category.
--
-- Owners manage only their own rows. Server code uses service_role, which
-- bypasses RLS. Additive only: the legacy table and every other existing
-- object are left as they are.

-- 1. Table. The primary key enforces one row per user per category.
CREATE TABLE public.user_notification_category_prefs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  email_mode text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notification_category_prefs_pkey PRIMARY KEY (user_id, category),
  CONSTRAINT user_notification_category_prefs_category_check CHECK (
    category IN ('courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'qa_support', 'system')
  ),
  CONSTRAINT user_notification_category_prefs_email_mode_check CHECK (
    email_mode IN ('default', 'immediate', 'digest', 'off')
  )
);

-- 2. RLS on immediately, before any grant or policy.
ALTER TABLE public.user_notification_category_prefs ENABLE ROW LEVEL SECURITY;

-- 3. Install the restrictive forced_password_change_guard required on every
--    row-secured public table (checked by pgTAP 053).
SELECT public.apply_forced_password_change_guard('public', 'user_notification_category_prefs');

-- 4. Keep updated_at current (same trigger pattern as the legacy table).
CREATE TRIGGER update_user_notification_category_prefs_updated_at
  BEFORE UPDATE ON public.user_notification_category_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Table privileges. Supabase default privileges grant ALL on new public
--    tables to anon, authenticated and service_role. anon loses everything;
--    authenticated keeps only DML (RLS limits it to its own rows);
--    service_role keeps its default privileges and gets DML explicitly.
REVOKE ALL ON TABLE public.user_notification_category_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_notification_category_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_notification_category_prefs TO service_role;

-- 6. Permissive owner policies for authenticated, AND-ed with the restrictive
--    guard from step 3. UPDATE checks both the old and the new row so a row
--    cannot be transferred to another user. No anon, PUBLIC or admin policy;
--    service_role bypasses RLS and needs none.
CREATE POLICY user_notification_category_prefs_select_own ON public.user_notification_category_prefs
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_notification_category_prefs_insert_own ON public.user_notification_category_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_notification_category_prefs_update_own ON public.user_notification_category_prefs
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_notification_category_prefs_delete_own ON public.user_notification_category_prefs
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 7. Documentation.
COMMENT ON TABLE public.user_notification_category_prefs IS
  'One email mode per user per notification category. ''default'' means follow the catalog/legacy rules; precedence between this table, the catalog and user_notification_preferences is resolved in application code (N1-03).';
