-- QA Scenario Fixes — Run in Supabase SQL Editor
-- Date: 2026-03-06

-- ============================================================
-- 1. Scenario data fixes: Add route fields (CS-PB-09 to CS-PB-12)
-- ============================================================

UPDATE qa_scenarios SET steps = jsonb_set(steps, '{0,route}', '"/admin/sessions"')
WHERE name LIKE 'CS-PB-09%';

UPDATE qa_scenarios SET steps = jsonb_set(steps, '{0,route}', '"/consultor/sessions"')
WHERE name LIKE 'CS-PB-10%';

UPDATE qa_scenarios SET steps = jsonb_set(steps, '{0,route}', '"/consultor/sessions/create"')
WHERE name LIKE 'CS-PB-11%';

UPDATE qa_scenarios SET steps = jsonb_set(steps, '{0,route}', '"/admin/sessions/approvals"')
WHERE name LIKE 'CS-PB-12%';

-- ============================================================
-- 2. Mark 5 unbuilt-feature scenarios as inactive
-- ============================================================

UPDATE qa_scenarios SET is_active = false
WHERE name IN (
  'HT-A-02: Admin crea un nuevo bloque de horas en un contrato',
  'HT-A-03: Admin reasigna horas entre bloques',
  'HT-A-05: Admin exporta el libro de horas a CSV',
  'CA-11: CM puede crear cotizaciones',
  'CA-14: CM puede acceder rendiciones de gasto'
);

-- ============================================================
-- 3. Fix 6: CS-A-25 — Reset stale edit request test data
--    Create a fresh edit request for the test session so approval
--    doesn't fail with "session_date has changed" error.
--    (Adjust the session_id UUID to match actual test data)
-- ============================================================

-- Example: Delete any stale pending edit requests for the test session
-- UPDATE consultor_session_edit_requests
-- SET status = 'cancelled'
-- WHERE session_id = '<TEST_SESSION_UUID>'
--   AND status = 'pending';
