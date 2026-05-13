-- Fix QA scenarios with incorrect expected outcomes
-- Based on diagnostic findings from PROMPT_D:
--
-- Diagnostics confirmed:
--   1. Middleware redirects unauthorized /admin/* to /dashboard (not /404)
--   2. /noticias is a public page (no auth needed)
--   3. docente.qa@fne.cl HAS community_id so sees Espacio Colaborativo (correct)
--   4. Sidebar filtering is working correctly for all roles tested
--   5. /community/workspace middleware matcher works for base path too

-- PB-18: CM accessing /admin/role-management redirects to /dashboard, not /404
UPDATE qa_scenarios
SET steps = '[{"index": 1, "instruction": "Verificar sidebar", "expectedOutcome": "\"Roles y Permisos\" NO aparece"}, {"index": 2, "instruction": "Intentar navegar a /admin/role-management", "expectedOutcome": "El sistema redirige al Panel Principal (dashboard)"}]'::jsonb,
    updated_at = now()
WHERE id = '52fe1e62-b6d4-4506-8c06-95b5911fc175';

-- EC-1 (CM without user_roles): Clarify that dashboard loads correctly
-- (session is maintained, no redirect to /login). The automation matcher
-- was checking for redirects that don't happen for authenticated users.
UPDATE qa_scenarios
SET steps = '[{"index": 1, "instruction": "Intentar login con usuario sin user_roles", "expectedOutcome": "Login exitoso pero sin rol"}, {"index": 2, "instruction": "Intentar navegar a /dashboard", "expectedOutcome": "El dashboard carga correctamente (el usuario mantiene su sesión activa, no se redirige a /login)"}, {"index": 3, "instruction": "Verificar que auth checks fallan", "expectedOutcome": "Páginas protegidas muestran contenido limitado o vacío"}]'::jsonb,
    updated_at = now()
WHERE id = '42ac4b66-1e31-428a-8f47-52606519d392';
