-- ============================================================================
-- QA Scenarios Seed Script: Permission Boundaries — Consultor Sessions
-- ============================================================================
-- Database: FNE Learning Management System
-- Roles: director, supervisor, docente (ALL should be DENIED)
-- Total Scenarios: 12
-- Date Created: 2026-02-16
-- Feature Area: consultor_sessions
--
-- CATEGORIES:
--   - Director denied (CS-PB-01 to CS-PB-04)
--   - Supervisor denied (CS-PB-05 to CS-PB-08)
--   - Docente denied (CS-PB-09 to CS-PB-12)
--
-- PRIORITIES:
--   1 = Critical (all permission boundary tests)
-- ============================================================================

BEGIN;

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- ============================================================================
-- DIRECTOR DENIED — 4 SCENARIOS (CS-PB-01 to CS-PB-04)
-- ============================================================================

-- CS-PB-01: Director cannot access admin sessions page
(
  'director',
  'CS-PB-01: Director no puede acceder a sesiones admin',
  'Verificar que un director no puede acceder a la página de sesiones de administración.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como director"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-02: Director cannot access consultor sessions page
(
  'director',
  'CS-PB-02: Director no puede acceder a sesiones de consultor',
  'Verificar que un director no puede acceder a la página de sesiones del consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como director"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-03: Director cannot access session creation page
(
  'director',
  'CS-PB-03: Director no puede acceder a creación de sesiones',
  'Verificar que un director no puede acceder a la página de creación de sesiones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como director"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-04: Director cannot access approvals page
(
  'director',
  'CS-PB-04: Director no puede acceder a aprobaciones de sesiones',
  'Verificar que un director no puede acceder a la página de aprobaciones de solicitudes de edición.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como director"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del director"}]'::jsonb,
  1, 2, true, false, false
),

-- ============================================================================
-- SUPERVISOR DENIED — 4 SCENARIOS (CS-PB-05 to CS-PB-08)
-- ============================================================================

-- CS-PB-05: Supervisor cannot access admin sessions page
(
  'supervisor',
  'CS-PB-05: Supervisor no puede acceder a sesiones admin',
  'Verificar que un supervisor no puede acceder a la página de sesiones de administración.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-06: Supervisor cannot access consultor sessions page
(
  'supervisor',
  'CS-PB-06: Supervisor no puede acceder a sesiones de consultor',
  'Verificar que un supervisor no puede acceder a la página de sesiones del consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-07: Supervisor cannot access session creation page
(
  'supervisor',
  'CS-PB-07: Supervisor no puede acceder a creación de sesiones',
  'Verificar que un supervisor no puede acceder a la página de creación de sesiones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-08: Supervisor cannot access approvals page
(
  'supervisor',
  'CS-PB-08: Supervisor no puede acceder a aprobaciones de sesiones',
  'Verificar que un supervisor no puede acceder a la página de aprobaciones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del supervisor"}]'::jsonb,
  1, 2, true, false, false
),

-- ============================================================================
-- DOCENTE DENIED — 4 SCENARIOS (CS-PB-09 to CS-PB-12)
-- ============================================================================

-- CS-PB-09: Docente cannot access admin sessions page
(
  'docente',
  'CS-PB-09: Docente no puede acceder a sesiones admin',
  'Verificar que un docente no puede acceder a la página de sesiones de administración.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como docente"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-10: Docente cannot access consultor sessions page
(
  'docente',
  'CS-PB-10: Docente no puede acceder a sesiones de consultor',
  'Verificar que un docente no puede acceder a la página de sesiones del consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como docente"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-11: Docente cannot access session creation page
(
  'docente',
  'CS-PB-11: Docente no puede acceder a creación de sesiones',
  'Verificar que un docente no puede acceder a la página de creación de sesiones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como docente"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-PB-12: Docente cannot access approvals page
(
  'docente',
  'CS-PB-12: Docente no puede acceder a aprobaciones de sesiones',
  'Verificar que un docente no puede acceder a la página de aprobaciones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como docente"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del docente"}]'::jsonb,
  1, 2, true, false, false
);

COMMIT;
