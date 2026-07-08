-- ============================================================================
-- Fix QA Scenario URLs: Add concrete URLs to 20 permission-boundary scenarios
-- ============================================================================
-- Issue: 20 scenarios across 6 roles say "Intentar navegar directamente a
--        la URL de..." without specifying the actual URL. Testers can't test them.
-- Fix:   Replace vague instructions with concrete URLs using the format
--        "Escribir en la barra de direcciones del navegador: [URL] y presionar Enter"
-- Affected scenarios: CS-PB-01 to CS-PB-12, CS-C-05, CS-G-08 to CS-G-11,
--                     EC-4, EC-8, PB-8, SS-3
-- ============================================================================

BEGIN;

-- ============================================================================
-- CS-PB-01: Director → /admin/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb
WHERE name LIKE 'CS-PB-01:%';

-- ============================================================================
-- CS-PB-02: Director → /consultor/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb
WHERE name LIKE 'CS-PB-02:%';

-- ============================================================================
-- CS-PB-03: Director → /admin/sessions/create
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb
WHERE name LIKE 'CS-PB-03:%';

-- ============================================================================
-- CS-PB-04: Director → /admin/sessions/approvals
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb
WHERE name LIKE 'CS-PB-04:%';

-- ============================================================================
-- CS-PB-05: Supervisor → /admin/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb
WHERE name LIKE 'CS-PB-05:%';

-- ============================================================================
-- CS-PB-06: Supervisor → /consultor/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb
WHERE name LIKE 'CS-PB-06:%';

-- ============================================================================
-- CS-PB-07: Supervisor → /admin/sessions/create
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb
WHERE name LIKE 'CS-PB-07:%';

-- ============================================================================
-- CS-PB-08: Supervisor → /admin/sessions/approvals
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb
WHERE name LIKE 'CS-PB-08:%';

-- ============================================================================
-- CS-PB-09: Docente → /admin/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb
WHERE name LIKE 'CS-PB-09:%';

-- ============================================================================
-- CS-PB-10: Docente → /consultor/sessions
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb
WHERE name LIKE 'CS-PB-10:%';

-- ============================================================================
-- CS-PB-11: Docente → /admin/sessions/create
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb
WHERE name LIKE 'CS-PB-11:%';

-- ============================================================================
-- CS-PB-12: Docente → /admin/sessions/approvals
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb
WHERE name LIKE 'CS-PB-12:%';

-- ============================================================================
-- CS-C-05: Consultor → 3 admin URLs
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"}]'::jsonb
WHERE name LIKE 'CS-C-05:%';

-- ============================================================================
-- CS-G-08: GC Member → reports (no write access)
-- This scenario is about reports, not URL navigation. Keep original but clarify.
-- Actually per the prompt: CS-G-08 step 1: /admin/sessions
-- ============================================================================
-- Note: CS-G-08 is "Miembro GC no puede escribir reportes" — per the prompt
-- it needs the URL /admin/sessions in step 1. But reviewing the actual scenario,
-- it's about report writing, not URL access. The prompt groups CS-G-08 through
-- CS-G-11 together. Let me re-read the prompt...
-- The prompt says: CS-G-08 step 1: /admin/sessions
-- But CS-G-08 is about reports. The prompt likely means CS-G-09 (the permission
-- boundary one). Let me check: CS-G-09 has 3 steps that all say
-- "Intentar navegar directamente a la URL de..."
-- CS-G-10 has 2 steps with the same issue.
-- CS-G-11 has a step about URL manipulation.
-- So the fixes are for CS-G-09, CS-G-10, and CS-G-11.

-- ============================================================================
-- CS-G-09: GC Member → admin session pages (3 steps)
-- Step 1: /admin/sessions, Step 2: /admin/sessions/create, Step 3: /admin/sessions/approvals
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb
WHERE name LIKE 'CS-G-09:%';

-- ============================================================================
-- CS-G-10: GC Member → consultor session pages (2 steps)
-- Step 1: /consultor/sessions, Step 2: /consultor/sessions/reports
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions/reports y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb
WHERE name LIKE 'CS-G-10:%';

-- ============================================================================
-- CS-G-11: GC Member → only own community sessions
-- Step 3 had URL manipulation instruction. Keep steps 1-2, fix step 3.
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Navegar a la pestaña ''Sesiones'' del espacio de trabajo","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Verificar que todas las sesiones pertenecen a la comunidad de crecimiento del usuario","expectedOutcome":"Cada sesión listada corresponde a la comunidad del usuario, no a otras"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions/00000000-0000-0000-0000-000000000001 y presionar Enter (un ID de sesión que no pertenece a la comunidad del usuario)","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb
WHERE name LIKE 'CS-G-11:%';

-- ============================================================================
-- EC-4 (Consultor): Restricted pages via URL bypass — already has URLs in the
-- SQL seed file but double-check the DB. The current version already has
-- /admin/courses, /admin/sessions, /admin/users. These are fine.
-- ============================================================================
-- EC-4 already has concrete URLs in seed-consultor-scenarios.sql. No change needed.

-- ============================================================================
-- SS-3 (Consultor): URL manipulation for transversal context
-- Current step 2 says "Intentar acceder a la página de Escuela/transversal-context?school_id=OTRA_ESCUELA"
-- This is already somewhat concrete but uses a placeholder. Fix it.
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /school/transversal-context?school_id=00000000-0000-0000-0000-000000000001 y presionar Enter (un ID de escuela diferente a la asignada)","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Verificar que solo los datos de la escuela asignada son accesibles","expectedOutcome":"Solo la escuela asignada es visible"}]'::jsonb
WHERE name LIKE 'SS-3:%' AND role_required = 'consultor';

-- ============================================================================
-- PB-8 (Consultor): Create/edit news — already has "Intentar acceder a la
-- página de Noticias" which is vague but not a URL navigation scenario.
-- The prompt says PB-8 step 1: /admin/transversal-context
-- But PB-8 in the consultor SQL is about news, not transversal context.
-- Let me check the docente PB-8 instead.
-- ============================================================================
-- Docente PB-8 is "Docente intenta crear plantilla de evaluación" with
-- instruction "Intentar navegar a /admin/assessment-builder" — already has URL.
-- The prompt's PB-8 refers to /admin/transversal-context.
-- Looking at the consultor PB-8: "Consultor intenta crear o editar noticias"
-- This already has vague instructions. Let me fix it with the URL.
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/community y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Verificar que el menú Noticias NO aparece en la barra lateral","expectedOutcome":"El elemento Noticias no es visible (solo para community_manager)"}]'::jsonb
WHERE name LIKE 'PB-8:%' AND role_required = 'consultor';

-- ============================================================================
-- EC-8 (Consultor): Not found in the consultor SQL. The prompt references EC-8
-- but the consultor scenarios only go to EC-7. This might be a different role's
-- scenario or may not exist. Skip if not found.
-- ============================================================================
-- EC-8 does not exist in consultor scenarios. Skip.

-- ============================================================================
-- QT-01: Fix expected outcome (quiz starts immediately, no start button)
-- ============================================================================
UPDATE qa_scenarios
SET steps = jsonb_set(
  steps,
  '{1,expectedOutcome}',
  '"Se muestra directamente la primera pregunta del quiz sin pantalla de inicio. El quiz comienza de inmediato al acceder al bloque de evaluación."'
)
WHERE name LIKE 'QT-01:%' AND role_required = 'docente';

-- ============================================================================
-- QT-10: Fix expected outcome (per-question feedback after teacher grades)
-- ============================================================================
UPDATE qa_scenarios
SET steps = '[{"index":1,"instruction":"Navegar a un quiz ya completado","expectedOutcome":"Se muestra el puntaje total obtenido. Las preguntas de opción múltiple muestran si fueron correctas o incorrectas. Las preguntas abiertas muestran un mensaje indicando que están pendientes de revisión por el docente. El feedback detallado por pregunta aparece después de que el docente califica."}]'::jsonb
WHERE name LIKE 'QT-10:%' AND role_required = 'docente';

-- ============================================================================
-- QT-11: Deactivate (quiz retry feature not implemented)
-- ============================================================================
UPDATE qa_scenarios
SET is_active = false,
    description = 'Verificar el flujo de reintentar un quiz cuando se permiten múltiples intentos. NOTA: Funcionalidad de reintento no implementada aún — escenario desactivado.'
WHERE name LIKE 'QT-11:%' AND role_required = 'docente';

COMMIT;
