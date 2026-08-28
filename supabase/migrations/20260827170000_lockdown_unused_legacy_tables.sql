-- =============================================================================
-- 20260827170000_lockdown_unused_legacy_tables.sql — W-B2b-01 (lote B2b)
--
-- Atomic lockdown of exactly the fourteen repository-unused legacy tables
-- approved by the Santa Marta B2b governance split (PR #58, merge commit
-- 6b7561d4). Committed-baseline state for all fourteen
-- (00000000000000_baseline.sql): GRANT ALL to anon / authenticated /
-- service_role, RLS not enabled, zero policies, zero PUBLIC grants, and no
-- product-code consumer (repository reference search re-run at this base;
-- evidence in docs/planning/reviews/fase-b2b-review-request.md).
--
-- Per table, exactly three statements:
--   1. REVOKE ALL … FROM PUBLIC, anon, authenticated — removes every table
--      privilege from the application roles. PUBLIC is included as
--      belt-and-braces; the baseline grants it nothing.
--   2. ALTER TABLE … ENABLE ROW LEVEL SECURITY — deny-by-default. NO
--      permissive policy is created, so the application roles have no path
--      back: they are denied at the ACL layer, and enabled RLS with zero
--      permissive policies grants nothing to anybody.
--   3. SELECT public.apply_forced_password_change_guard('public', '<table>');
--      — the repository-wide authentication-security boundary (migration
--      20260819120200) requires EVERY row-secured public table to carry the
--      restrictive forced_password_change_guard policy, and its pgTAP catalog
--      invariant (supabase/tests/053) fails CI for any row-secured table
--      without it. The helper installs exactly one policy per table:
--      forced_password_change_guard, AS RESTRICTIVE, FOR ALL, TO
--      authenticated, USING / WITH CHECK
--      ((SELECT public.password_change_gate_ok())). A restrictive policy can
--      only further constrain access that a permissive policy would grant —
--      there is none here — so it cannot re-open these tables; it exists so
--      the authentication boundary stays uniform across the catalog.
--
-- Final locked state per table: zero permissive policies; exactly one
-- repository-required restrictive authentication-boundary guard; no policy
-- targeting anon or service_role.
--
-- service_role is untouched: it is not named in any REVOKE, keeps its baseline
-- GRANT ALL, and retains its required SELECT/INSERT/UPDATE/DELETE access.
-- No data, column, constraint, index, trigger, sequence, function, ownership
-- or schema change; no new or modified helper function. Additive only — no
-- DROP, no TRUNCATE, no destructive ALTER.
--
-- Emergency restore path (reviewed artifact, NOT an active migration, requires
-- explicit Brent authorization before any use):
-- docs/planning/reviews/fase-b2b-compensating-migration.sql
--
-- pgTAP evidence: supabase/tests/062-unused-legacy-lockdown.sql (this
-- migration, table-by-table), supabase/tests/001-rls-enabled.sql (allowlist
-- shrunk 22 → 8) and supabase/tests/053-forced-password-change-data-layer.sql
-- (catalog invariant now covering these fourteen; no-RLS pin re-set 22 → 8).
-- =============================================================================

REVOKE ALL ON TABLE public.answers FROM PUBLIC, anon, authenticated;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'answers');

REVOKE ALL ON TABLE public.assignments FROM PUBLIC, anon, authenticated;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'assignments');

REVOKE ALL ON TABLE public.course_prerequisites FROM PUBLIC, anon, authenticated;
ALTER TABLE public.course_prerequisites ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'course_prerequisites');

REVOKE ALL ON TABLE public.deleted_blocks FROM PUBLIC, anon, authenticated;
ALTER TABLE public.deleted_blocks ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'deleted_blocks');

REVOKE ALL ON TABLE public.deleted_courses FROM PUBLIC, anon, authenticated;
ALTER TABLE public.deleted_courses ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'deleted_courses');

REVOKE ALL ON TABLE public.deleted_lessons FROM PUBLIC, anon, authenticated;
ALTER TABLE public.deleted_lessons ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'deleted_lessons');

REVOKE ALL ON TABLE public.deleted_modules FROM PUBLIC, anon, authenticated;
ALTER TABLE public.deleted_modules ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'deleted_modules');

REVOKE ALL ON TABLE public.menu_permissions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'menu_permissions');

REVOKE ALL ON TABLE public.metadata_sync_log FROM PUBLIC, anon, authenticated;
ALTER TABLE public.metadata_sync_log ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'metadata_sync_log');

REVOKE ALL ON TABLE public.profiles_role_backup FROM PUBLIC, anon, authenticated;
ALTER TABLE public.profiles_role_backup ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'profiles_role_backup');

REVOKE ALL ON TABLE public.questions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'questions');

REVOKE ALL ON TABLE public.quizzes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'quizzes');

REVOKE ALL ON TABLE public.student_answers FROM PUBLIC, anon, authenticated;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'student_answers');

REVOKE ALL ON TABLE public.submissions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'submissions');
