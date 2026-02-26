-- ============================================================================
-- QA Scenarios Seed Script: EQUIPO_DIRECTIVO Role — Hour Tracking (Control de Horas)
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: equipo_directivo
-- Total Scenarios: 8
-- Date Created: 2026-02-26
-- Feature Area: hour_tracking
--
-- CATEGORIES:
--   - School Report (HT-D-01 to HT-D-03)
--   - PDF Export (HT-D-04)
--   - Data Isolation (HT-D-05)
--   - Access Denied (HT-D-06 to HT-D-07)
--   - Sidebar Navigation (HT-D-08)
--
-- Login as: directivo.qa@fne.cl
--
-- PRIORITIES:
--   1 = Critical (access denied / security)
--   2 = High (report, export)
--   3 = Medium (navigation, warnings)
-- ============================================================================

BEGIN;

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- ============================================================================
-- SCHOOL REPORT — 3 SCENARIOS (HT-D-01 to HT-D-03)
-- ============================================================================

-- HT-D-01: View own school's hours report
(
  'equipo_directivo',
  'HT-D-01: Directivo ve el reporte de horas de su escuela',
  'Verificar que el directivo puede acceder al reporte de horas y que carga automáticamente los datos de su escuela.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"},{"type":"data","description":"Debe existir un contrato con sesiones para QA Test School"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a ''Reporte de Horas'' en el sidebar o menú principal","expectedOutcome":"Se muestra la página del reporte de horas con los datos de QA Test School cargados automáticamente"},{"index":2,"instruction":"Verificar que NO aparece un selector de colegio","expectedOutcome":"No hay desplegable de colegios — el reporte muestra directamente los datos de la escuela del directivo"},{"index":3,"instruction":"Verificar que se muestra el nombre de la escuela en el encabezado","expectedOutcome":"El nombre ''QA Test School'' es visible en el encabezado del reporte"}]'::jsonb,
  2, 4, true, false, false
),

-- HT-D-02: Report shows programs, contracts, and buckets
(
  'equipo_directivo',
  'HT-D-02: Directivo verifica contenido del reporte de horas',
  'Verificar que el reporte muestra el desglose completo de programas, contratos, bloques y sesiones.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"},{"type":"data","description":"Deben existir contratos con asignaciones de horas para la escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Reporte de Horas","expectedOutcome":"Se carga el reporte de la escuela del directivo"},{"index":2,"instruction":"Verificar que se muestran los programas asociados a la escuela","expectedOutcome":"Los nombres de los programas son visibles"},{"index":3,"instruction":"Verificar que cada programa muestra sus contratos","expectedOutcome":"Los contratos aparecen bajo cada programa con número de contrato y estado"},{"index":4,"instruction":"Verificar que cada contrato muestra sus bloques de horas con totales","expectedOutcome":"Los bloques muestran horas asignadas, consumidas y disponibles"},{"index":5,"instruction":"Verificar que se puede expandir un bloque para ver las sesiones individuales","expectedOutcome":"Las sesiones del bloque se muestran con fecha, consultor y horas"}]'::jsonb,
  2, 5, true, false, false
),

-- HT-D-03: Warning colors on progress bars
(
  'equipo_directivo',
  'HT-D-03: Directivo verifica colores de alerta en barras de progreso',
  'Verificar que las barras de progreso de horas muestran colores de alerta correctos.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"},{"type":"data","description":"Deben existir bloques con diferentes niveles de consumo"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Reporte de Horas","expectedOutcome":"Se carga el reporte con barras de progreso"},{"index":2,"instruction":"Verificar que los bloques con más del 25% de horas disponibles muestran barra verde","expectedOutcome":"La barra de progreso es de color verde"},{"index":3,"instruction":"Verificar que los bloques con menos del 25% disponible muestran barra amarilla","expectedOutcome":"La barra de progreso es de color amarillo"},{"index":4,"instruction":"Verificar que los bloques sin horas disponibles muestran barra roja y badge ''Agotado''","expectedOutcome":"La barra es roja y el texto ''Agotado'' es visible"}]'::jsonb,
  3, 4, true, false, false
),

-- ============================================================================
-- PDF EXPORT — 1 SCENARIO (HT-D-04)
-- ============================================================================

-- HT-D-04: Export school report to PDF
(
  'equipo_directivo',
  'HT-D-04: Directivo exporta reporte de horas a PDF',
  'Verificar que el directivo puede descargar un PDF con el reporte de horas de su escuela.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"},{"type":"data","description":"El reporte de horas debe tener datos cargados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Reporte de Horas","expectedOutcome":"Se carga el reporte de la escuela"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar PDF''","expectedOutcome":"Se descarga un archivo PDF"},{"index":3,"instruction":"Abrir el PDF descargado","expectedOutcome":"El PDF muestra el reporte completo con el nombre de la escuela, programas, contratos y totales de horas"}]'::jsonb,
  2, 3, true, false, false
),

-- ============================================================================
-- DATA ISOLATION — 1 SCENARIO (HT-D-05)
-- ============================================================================

-- HT-D-05: Cannot see other schools' data
(
  'equipo_directivo',
  'HT-D-05: Directivo no puede ver datos de otros colegios',
  'Verificar que el directivo solo tiene acceso a los datos de su propia escuela.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Reporte de Horas","expectedOutcome":"Se carga el reporte con datos únicamente de QA Test School"},{"index":2,"instruction":"Verificar que NO existe un desplegable o selector para cambiar de colegio","expectedOutcome":"No hay forma de seleccionar otro colegio — los datos son exclusivamente de la escuela del directivo"},{"index":3,"instruction":"Verificar que todos los contratos y sesiones mostrados corresponden a QA Test School","expectedOutcome":"Los datos son coherentes y corresponden únicamente a la escuela asignada al directivo"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- ACCESS DENIED — 2 SCENARIOS (HT-D-06 to HT-D-07)
-- ============================================================================

-- HT-D-06: Cannot access admin rates page
(
  'equipo_directivo',
  'HT-D-06: Directivo no puede acceder a Tarifas de consultores',
  'Verificar que el directivo no tiene acceso a la página de administración de tarifas (información confidencial).',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones del navegador la URL /admin/consultant-rates","expectedOutcome":"El sistema no permite el acceso — se muestra una página de error de permisos o se redirige al dashboard del directivo"},{"index":2,"instruction":"Verificar que el ítem ''Tarifas'' NO aparece en el sidebar","expectedOutcome":"El ítem de Tarifas no es visible en la navegación del directivo"}]'::jsonb,
  1, 2, true, false, false
),

-- HT-D-07: Cannot access bulk tag page
(
  'equipo_directivo',
  'HT-D-07: Directivo no puede acceder a Clasificar Sesiones',
  'Verificar que el directivo no tiene acceso a la página de clasificación en lote (función exclusiva de admin).',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones del navegador la URL /admin/bulk-tag-sessions","expectedOutcome":"El sistema no permite el acceso — se muestra una página de error de permisos o se redirige al dashboard del directivo"},{"index":2,"instruction":"Verificar que el ítem ''Clasificar Sesiones'' NO aparece en el sidebar","expectedOutcome":"El ítem no es visible en la navegación del directivo"}]'::jsonb,
  1, 2, true, false, false
),

-- ============================================================================
-- SIDEBAR NAVIGATION — 1 SCENARIO (HT-D-08)
-- ============================================================================

-- HT-D-08: Sidebar shows correct items
(
  'equipo_directivo',
  'HT-D-08: Directivo verifica navegación en sidebar',
  'Verificar que el sidebar muestra ''Reporte de Horas'' pero NO los ítems exclusivos de admin.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como directivo.qa@fne.cl"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral (sidebar) del sistema","expectedOutcome":"El sidebar es visible"},{"index":2,"instruction":"Verificar que aparece el ítem ''Reporte de Horas'' en la navegación","expectedOutcome":"El ítem ''Reporte de Horas'' es visible y clickeable"},{"index":3,"instruction":"Verificar que NO aparecen los ítems: ''Tarifas'', ''Ganancias'', ''Clasificar Sesiones''","expectedOutcome":"Ninguno de estos ítems administrativos es visible en el sidebar del directivo"}]'::jsonb,
  3, 2, true, false, false
);

COMMIT;
