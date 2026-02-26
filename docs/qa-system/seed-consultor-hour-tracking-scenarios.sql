-- ============================================================================
-- QA Scenarios Seed Script: CONSULTOR Role — Hour Tracking (Control de Horas)
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: consultor
-- Total Scenarios: 9
-- Date Created: 2026-02-26
-- Feature Area: hour_tracking
--
-- CATEGORIES:
--   - My Hours / Earnings (HT-C-01 to HT-C-04)
--   - Session Reports (HT-C-05)
--   - Sidebar Navigation (HT-C-06)
--   - Access Denied (HT-C-07 to HT-C-09)
--
-- Login as: consultor.qa@fne.cl
--
-- PRIORITIES:
--   1 = Critical (access denied / security)
--   2 = High (earnings, reports)
--   3 = Medium (navigation, filters)
-- ============================================================================

BEGIN;

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- ============================================================================
-- MY HOURS / EARNINGS — 4 SCENARIOS (HT-C-01 to HT-C-04)
-- ============================================================================

-- HT-C-01: View own earnings dashboard
(
  'consultor',
  'HT-C-01: Consultor ve su dashboard de ganancias',
  'Verificar que el consultor puede ver sus propias ganancias en EUR y CLP desde la página Mis Horas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"},{"type":"data","description":"Deben existir sesiones completadas con tarifas configuradas para este consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a ''Mis Horas'' en el sidebar o menú principal","expectedOutcome":"Se muestra la página de ganancias del consultor"},{"index":2,"instruction":"Verificar que la tabla muestra los tipos de hora con sus totales","expectedOutcome":"Se muestran filas con: tipo de hora, horas totales, tarifa EUR, total EUR y total CLP"},{"index":3,"instruction":"Verificar que los montos en CLP reflejan la conversión con la tasa de cambio vigente","expectedOutcome":"Los montos CLP son coherentes con los EUR multiplicados por la tasa de cambio"}]'::jsonb,
  2, 4, true, false, false
),

-- HT-C-02: Filter earnings by date range
(
  'consultor',
  'HT-C-02: Consultor filtra ganancias por rango de fechas',
  'Verificar que el consultor puede cambiar el rango de fechas y ver las ganancias actualizadas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"},{"type":"data","description":"Deben existir sesiones en diferentes meses"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Horas","expectedOutcome":"Se muestra la página de ganancias"},{"index":2,"instruction":"Cambiar la fecha de inicio a un mes anterior (ej. enero 2026)","expectedOutcome":"Las ganancias se actualizan para incluir el período ampliado"},{"index":3,"instruction":"Cambiar la fecha de fin a un mes futuro","expectedOutcome":"Las ganancias se actualizan reflejando el nuevo rango de fechas"},{"index":4,"instruction":"Verificar que los totales cambian según el período seleccionado","expectedOutcome":"Los montos totales se ajustan al rango de fechas seleccionado"}]'::jsonb,
  3, 4, true, false, false
),

-- HT-C-03: Export earnings to PDF
(
  'consultor',
  'HT-C-03: Consultor exporta sus ganancias a PDF',
  'Verificar que el consultor puede descargar un PDF con el desglose de sus ganancias.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"},{"type":"data","description":"Deben existir ganancias para el consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Horas","expectedOutcome":"Se muestra la página de ganancias"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar PDF''","expectedOutcome":"Se descarga un archivo PDF"},{"index":3,"instruction":"Abrir el PDF descargado","expectedOutcome":"El PDF muestra el desglose de ganancias por tipo de hora con montos en EUR y CLP"}]'::jsonb,
  2, 3, true, false, false
),

-- HT-C-04: Cannot see other consultants' data
(
  'consultor',
  'HT-C-04: Consultor solo ve sus propios datos',
  'Verificar que el consultor no tiene acceso a datos de otros consultores — no aparece selector de consultor.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Horas","expectedOutcome":"Se muestra la página de ganancias del consultor"},{"index":2,"instruction":"Verificar que NO existe un desplegable para seleccionar otro consultor","expectedOutcome":"No hay selector de consultor visible — la página solo muestra los datos propios"},{"index":3,"instruction":"Verificar que el nombre del consultor aparece en el encabezado de la página","expectedOutcome":"Se muestra el nombre del consultor logueado, confirmando que solo ve su propia información"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- SESSION REPORTS — 1 SCENARIO (HT-C-05)
-- ============================================================================

-- HT-C-05: View own sessions with hours
(
  'consultor',
  'HT-C-05: Consultor ve sus sesiones con horas asignadas',
  'Verificar que el consultor puede ver sus sesiones y las horas asociadas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"},{"type":"data","description":"Deben existir sesiones asignadas al consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la sección de sesiones del consultor (Mis Sesiones o Sesiones)","expectedOutcome":"Se muestra la lista de sesiones asignadas al consultor"},{"index":2,"instruction":"Verificar que las sesiones muestran información de horas cuando tienen tipo de hora asignado","expectedOutcome":"Las sesiones clasificadas muestran el tipo de hora y las horas consumidas"},{"index":3,"instruction":"Verificar que las sesiones muestran el estado correcto con badges de color","expectedOutcome":"Los estados (Completada, Programada, Cancelada) tienen sus badges correspondientes"}]'::jsonb,
  2, 4, true, false, false
),

-- ============================================================================
-- SIDEBAR NAVIGATION — 1 SCENARIO (HT-C-06)
-- ============================================================================

-- HT-C-06: Sidebar shows Mis Horas
(
  'consultor',
  'HT-C-06: Consultor ve ''Mis Horas'' en el sidebar',
  'Verificar que el ítem de navegación Mis Horas aparece en el sidebar del consultor.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral (sidebar) del sistema","expectedOutcome":"El sidebar es visible"},{"index":2,"instruction":"Verificar que aparece el ítem ''Mis Horas'' en la navegación","expectedOutcome":"El ítem ''Mis Horas'' es visible y clickeable"},{"index":3,"instruction":"Hacer clic en ''Mis Horas''","expectedOutcome":"Se navega a la página de ganancias del consultor"}]'::jsonb,
  3, 2, true, false, false
),

-- ============================================================================
-- ACCESS DENIED — 3 SCENARIOS (HT-C-07 to HT-C-09)
-- ============================================================================

-- HT-C-07: Cannot access admin rates page
(
  'consultor',
  'HT-C-07: Consultor no puede acceder a Tarifas de admin',
  'Verificar que el consultor no tiene acceso a la página de administración de tarifas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones del navegador la URL /admin/consultant-rates","expectedOutcome":"El sistema no permite el acceso — se muestra una página de error de permisos o se redirige al dashboard del consultor"},{"index":2,"instruction":"Verificar que el ítem ''Tarifas'' NO aparece en el sidebar del consultor","expectedOutcome":"El ítem de Tarifas no es visible en la navegación del consultor"}]'::jsonb,
  1, 2, true, false, false
),

-- HT-C-08: Cannot access bulk tag page
(
  'consultor',
  'HT-C-08: Consultor no puede acceder a Clasificar Sesiones',
  'Verificar que el consultor no tiene acceso a la página de clasificación en lote de sesiones.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones del navegador la URL /admin/bulk-tag-sessions","expectedOutcome":"El sistema no permite el acceso — se muestra una página de error de permisos o se redirige al dashboard del consultor"},{"index":2,"instruction":"Verificar que el ítem ''Clasificar Sesiones'' NO aparece en el sidebar del consultor","expectedOutcome":"El ítem no es visible en la navegación del consultor"}]'::jsonb,
  1, 2, true, false, false
),

-- HT-C-09: Cannot access admin earnings page
(
  'consultor',
  'HT-C-09: Consultor no puede acceder a Ganancias de admin',
  'Verificar que el consultor no tiene acceso al dashboard de ganancias de administración (donde se ven todos los consultores).',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como consultor.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones del navegador la URL /admin/consultant-earnings","expectedOutcome":"El sistema no permite el acceso — se muestra una página de error de permisos o se redirige al dashboard del consultor"},{"index":2,"instruction":"Verificar que el ítem ''Ganancias'' (de admin) NO aparece en el sidebar del consultor","expectedOutcome":"El ítem de Ganancias administrativo no es visible en la navegación del consultor"}]'::jsonb,
  1, 2, true, false, false
);

COMMIT;
