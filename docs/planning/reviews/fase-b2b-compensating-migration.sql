-- =============================================================================
-- ⚠️⚠️⚠️  EMERGENCY COMPENSATING FORWARD MIGRATION — DO NOT APPLY  ⚠️⚠️⚠️
-- ⚠️
-- ⚠️  This file MUST NOT be applied to any database — local, staging or
-- ⚠️  production — without separate, explicit authorization from Brent.
-- ⚠️  It is a reviewed emergency artifact required by W-B2b-01's class-2
-- ⚠️  migration rule ("compensating additive migration written and tested
-- ⚠️  BEFORE merging"). It deliberately lives under docs/planning/reviews/ and
-- ⚠️  is NOT an active migration: it must never be copied into
-- ⚠️  supabase/migrations/ except as its own explicitly authorized,
-- ⚠️  freshly-timestamped forward migration.
-- ⚠️
-- =============================================================================
--
-- fase-b2b-compensating-migration.sql — compensates W-B2b-01
-- (supabase/migrations/20260827170000_lockdown_unused_legacy_tables.sql)
--
-- If the fourteen-table lockdown must be reverted in an emergency, this
-- artifact restores the PRE-lockdown application-role behavior through purely
-- additive forward SQL while KEEPING row level security enabled:
--
--   1. GRANT ALL back to anon and authenticated — the exact table grants the
--      committed baseline (00000000000000_baseline.sql) gave them. PUBLIC held
--      no grants before the lockdown, so nothing is granted to PUBLIC.
--   2. One narrowly named, explicit PERMISSIVE compensating policy per role
--      per table (28 policies, prefix w_b2b01_comp_), FOR ALL TO anon /
--      authenticated with USING (true) WITH CHECK (true) — under enabled RLS
--      this reproduces the prior unrestricted behavior for exactly those roles.
--   3. The restrictive authentication-boundary policy
--      forced_password_change_guard, installed on all fourteen tables by the
--      lockdown migration, is LEFT INTACT: this artifact never creates,
--      replaces, alters or removes it. During compensation each table
--      therefore carries exactly THREE policies — the one restrictive guard
--      plus the two permissive compensation policies — and the guard stays
--      effective: an authenticated account flagged must_change_password=true
--      remains denied. That is deliberate. Before the lockdown these tables
--      had no row security at all, so the repository-wide forced-password
--      boundary (migration 20260819120200) could not bind them; the boundary
--      is mandatory on every row-secured public table, and this compensator
--      restores application-role access WITHOUT reproducing that historical
--      gap. anon is unaffected by the guard (it is TO authenticated, and
--      password_change_gate_ok() allows a NULL auth.uid()).
--   4. service_role is untouched: not named in any statement here; its
--      baseline GRANT ALL was never revoked and it bypasses RLS.
--
-- Additive only: no DROP, no TRUNCATE, no destructive ALTER, and row level
-- security is never turned off — every table keeps RLS enabled throughout.
-- Test evidence (rollback-only local transaction): see
-- docs/planning/reviews/fase-b2b-review-request.md §"Compensating-migration
-- test evidence".
-- =============================================================================

-- ── answers ──────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.answers TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_answers ON public.answers
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_answers ON public.answers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── assignments ──────────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.assignments TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_assignments ON public.assignments
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_assignments ON public.assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── course_prerequisites ─────────────────────────────────────────────────────
GRANT ALL ON TABLE public.course_prerequisites TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_course_prerequisites ON public.course_prerequisites
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_course_prerequisites ON public.course_prerequisites
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── deleted_blocks ───────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.deleted_blocks TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_deleted_blocks ON public.deleted_blocks
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_deleted_blocks ON public.deleted_blocks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── deleted_courses ──────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.deleted_courses TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_deleted_courses ON public.deleted_courses
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_deleted_courses ON public.deleted_courses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── deleted_lessons ──────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.deleted_lessons TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_deleted_lessons ON public.deleted_lessons
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_deleted_lessons ON public.deleted_lessons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── deleted_modules ──────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.deleted_modules TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_deleted_modules ON public.deleted_modules
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_deleted_modules ON public.deleted_modules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── menu_permissions ─────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.menu_permissions TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_menu_permissions ON public.menu_permissions
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_menu_permissions ON public.menu_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── metadata_sync_log ────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.metadata_sync_log TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_metadata_sync_log ON public.metadata_sync_log
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_metadata_sync_log ON public.metadata_sync_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── profiles_role_backup ─────────────────────────────────────────────────────
GRANT ALL ON TABLE public.profiles_role_backup TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_profiles_role_backup ON public.profiles_role_backup
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_profiles_role_backup ON public.profiles_role_backup
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── questions ────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.questions TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_questions ON public.questions
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_questions ON public.questions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── quizzes ──────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.quizzes TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_quizzes ON public.quizzes
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_quizzes ON public.quizzes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── student_answers ──────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.student_answers TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_student_answers ON public.student_answers
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_student_answers ON public.student_answers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── submissions ──────────────────────────────────────────────────────────────
GRANT ALL ON TABLE public.submissions TO anon, authenticated;
CREATE POLICY w_b2b01_comp_anon_submissions ON public.submissions
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY w_b2b01_comp_authenticated_submissions ON public.submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
