-- ============================================================================
-- QA Scenarios Seed Script: ADMIN Role — Hour Tracking (Control de Horas)
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: admin
-- Total Scenarios: 19
-- Date Created: 2026-02-26
-- Feature Area: hour_tracking
--
-- CATEGORIES:
--   - Hour Allocation (HT-A-01 to HT-A-03)
--   - Ledger & Export (HT-A-04 to HT-A-05)
--   - Session Badges & Warnings (HT-A-06 to HT-A-07)
--   - Consultant Rates (HT-A-08 to HT-A-09)
--   - Earnings Dashboard (HT-A-10)
--   - School Hours Report (HT-A-11 to HT-A-13)
--   - Cancellation Sub-Badges (HT-A-14)
--   - Bulk Tag Sessions (HT-A-15 to HT-A-18)
--   - Sidebar Navigation (HT-A-19)
--
-- PRIORITIES:
--   1 = Critical (allocation, ledger, rates)
--   2 = High (reports, earnings, bulk tag)
--   3 = Medium (badges, warnings, navigation)
--   4 = Low (edge cases)
-- ============================================================================

BEGIN;

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- ============================================================================
-- HOUR ALLOCATION — 3 SCENARIOS (HT-A-01 to HT-A-03)
-- ============================================================================

-- HT-A-01: View hour allocations on a contract
(
  'admin',
  'HT-A-01: Admin ve las asignaciones de horas de un contrato',
  'Verificar que el panel de Asignación de Horas muestra correctamente los 3 bloques con horas asignadas, disponibles y consumidas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato con asignaciones de horas (QA Test School)"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la sección de Contratos en el sidebar","expectedOutcome":"Se muestra la lista de contratos"},{"index":2,"instruction":"Buscar y abrir el contrato ''QA-HT-2026-001'' de QA Test School","expectedOutcome":"Se abre la página de detalle del contrato"},{"index":3,"instruction":"Ubicar el panel ''Asignación de Horas''","expectedOutcome":"Se muestra el panel con 3 bloques de horas: Asesoría Técnica Online (40h), Asesoría Técnica Presencial (35h), Asesoría Directiva Online (25h)"},{"index":4,"instruction":"Verificar que cada bloque muestra horas asignadas, reservadas, consumidas y disponibles","expectedOutcome":"Los valores numéricos son visibles y coherentes (asignadas = reservadas + consumidas + disponibles)"}]'::jsonb,
  1, 5, true, false, false
),

-- HT-A-02: Create a new hour allocation bucket
(
  'admin',
  'HT-A-02: Admin crea un nuevo bloque de horas en un contrato',
  'Verificar que un administrador puede agregar un nuevo tipo de hora a un contrato existente.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato activo"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de un contrato y ubicar el panel de Asignación de Horas","expectedOutcome":"Se muestra el panel con los bloques existentes"},{"index":2,"instruction":"Hacer clic en el botón para agregar un nuevo bloque de horas","expectedOutcome":"Se abre un formulario o modal para crear una nueva asignación"},{"index":3,"instruction":"Seleccionar un tipo de hora del desplegable (ej. ''Talleres Presenciales'') e ingresar la cantidad de horas","expectedOutcome":"Los campos aceptan los datos ingresados"},{"index":4,"instruction":"Hacer clic en ''Guardar''","expectedOutcome":"Aparece un mensaje de éxito y el nuevo bloque se muestra en el panel con las horas asignadas"}]'::jsonb,
  2, 5, true, false, false
),

-- HT-A-03: Reallocate hours between buckets
(
  'admin',
  'HT-A-03: Admin reasigna horas entre bloques',
  'Verificar que un administrador puede mover horas de un bloque a otro dentro del mismo contrato.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato con al menos 2 bloques de horas con horas disponibles"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al panel de Asignación de Horas de un contrato","expectedOutcome":"Se muestran los bloques con sus saldos"},{"index":2,"instruction":"Hacer clic en el botón ''Reasignar Horas'' o ícono de reasignación","expectedOutcome":"Se abre un modal de reasignación con campos para origen, destino y cantidad"},{"index":3,"instruction":"Seleccionar bloque de origen, bloque de destino e ingresar la cantidad de horas a mover","expectedOutcome":"Los campos aceptan los datos"},{"index":4,"instruction":"Confirmar la reasignación","expectedOutcome":"Aparece un mensaje de éxito y los saldos de ambos bloques se actualizan (el origen disminuye y el destino aumenta)"}]'::jsonb,
  2, 5, true, false, false
),

-- ============================================================================
-- LEDGER & EXPORT — 2 SCENARIOS (HT-A-04 to HT-A-05)
-- ============================================================================

-- HT-A-04: View hour ledger for a contract
(
  'admin',
  'HT-A-04: Admin ve el libro de horas de un contrato',
  'Verificar que el libro de horas muestra todas las entradas con estados correctos y badges de colores.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato con entradas en el libro de horas (QA Test School)"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle del contrato QA-HT-2026-001","expectedOutcome":"Se abre la página del contrato"},{"index":2,"instruction":"Ubicar la sección del libro de horas (ledger)","expectedOutcome":"Se muestra una tabla con las entradas de horas"},{"index":3,"instruction":"Verificar que cada entrada muestra: fecha, consultor, horas, tipo de hora y estado","expectedOutcome":"Todas las columnas están visibles con datos correctos"},{"index":4,"instruction":"Verificar los colores de los badges de estado: ''Consumida'' en verde, ''Reservada'' en azul, ''Devuelta'' en amarillo, ''Penalizada'' en rojo","expectedOutcome":"Los badges muestran los colores correctos según el estado"}]'::jsonb,
  1, 5, true, false, false
),

-- HT-A-05: Export ledger to CSV
(
  'admin',
  'HT-A-05: Admin exporta el libro de horas a CSV',
  'Verificar que se puede descargar un archivo CSV con las entradas del libro de horas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato con entradas en el libro de horas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al libro de horas de un contrato","expectedOutcome":"Se muestra la tabla de entradas"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar CSV'' o ícono de descarga","expectedOutcome":"Se descarga un archivo .csv"},{"index":3,"instruction":"Abrir el archivo CSV descargado","expectedOutcome":"El archivo contiene las columnas: fecha, consultor, tipo de hora, horas, estado y notas"}]'::jsonb,
  2, 4, true, false, false
),

-- ============================================================================
-- SESSION BADGES & WARNINGS — 2 SCENARIOS (HT-A-06 to HT-A-07)
-- ============================================================================

-- HT-A-06: Three-state availability badge on session creation
(
  'admin',
  'HT-A-06: Admin ve badge de disponibilidad al crear sesión',
  'Verificar que al crear una sesión aparece un indicador de disponibilidad de horas según el contrato del colegio.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un colegio con contrato y asignación de horas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones y hacer clic en ''Nueva Sesión''","expectedOutcome":"Se abre el formulario de creación de sesión"},{"index":2,"instruction":"Seleccionar QA Test School del desplegable de colegio","expectedOutcome":"El colegio se selecciona correctamente"},{"index":3,"instruction":"Observar si aparece un indicador de disponibilidad de horas (badge verde, amarillo o rojo)","expectedOutcome":"Se muestra un badge indicando la disponibilidad de horas del contrato: verde si hay horas suficientes, amarillo si quedan pocas, rojo si están agotadas"}]'::jsonb,
  3, 4, true, false, false
),

-- HT-A-07: Warning colors on allocation progress bars
(
  'admin',
  'HT-A-07: Admin verifica colores de alerta en barras de progreso',
  'Verificar que las barras de progreso de asignación de horas muestran colores de alerta correctos.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato con diferentes niveles de consumo en sus bloques"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al panel de Asignación de Horas de un contrato","expectedOutcome":"Se muestran los bloques con barras de progreso"},{"index":2,"instruction":"Verificar que un bloque con más del 25% de horas disponibles muestra barra verde","expectedOutcome":"La barra de progreso es de color verde"},{"index":3,"instruction":"Verificar que un bloque con menos del 25% de horas disponibles muestra barra amarilla","expectedOutcome":"La barra de progreso es de color amarillo"},{"index":4,"instruction":"Verificar que un bloque sin horas disponibles muestra barra roja y badge ''Agotado''","expectedOutcome":"La barra es roja y aparece el texto ''Agotado''"}]'::jsonb,
  3, 5, true, false, false
),

-- ============================================================================
-- CONSULTANT RATES — 2 SCENARIOS (HT-A-08 to HT-A-09)
-- ============================================================================

-- HT-A-08: CRUD consultant rates
(
  'admin',
  'HT-A-08: Admin gestiona tarifas de consultores',
  'Verificar que un administrador puede ver la lista de tarifas y crear una nueva tarifa para un consultor.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Tarifas en el sidebar","expectedOutcome":"Se muestra la página de tarifas con la tabla de tarifas existentes"},{"index":2,"instruction":"Verificar que la tabla muestra: consultor, tipo de hora, tarifa en EUR, fecha de inicio y fecha de fin","expectedOutcome":"Las columnas son visibles y muestran datos correctos"},{"index":3,"instruction":"Hacer clic en el botón para crear una nueva tarifa","expectedOutcome":"Se abre un formulario con campos: consultor, tipo de hora, monto en EUR, fecha de inicio"},{"index":4,"instruction":"Completar el formulario seleccionando un consultor, tipo de hora, ingresando monto (ej. 90 EUR) y fecha de inicio","expectedOutcome":"Los campos aceptan los datos"},{"index":5,"instruction":"Guardar la nueva tarifa","expectedOutcome":"Aparece un mensaje de éxito y la tarifa se muestra en la tabla"}]'::jsonb,
  1, 6, true, false, false
),

-- HT-A-09: Export rates to CSV
(
  'admin',
  'HT-A-09: Admin exporta tarifas a CSV',
  'Verificar que se puede descargar un archivo CSV con todas las tarifas de consultores.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir tarifas de consultores"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Tarifas","expectedOutcome":"Se muestra la tabla de tarifas"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar CSV''","expectedOutcome":"Se descarga un archivo .csv"},{"index":3,"instruction":"Abrir el archivo descargado","expectedOutcome":"El archivo contiene columnas con consultor, tipo de hora, tarifa EUR, fechas de vigencia"}]'::jsonb,
  3, 3, true, false, false
),

-- ============================================================================
-- EARNINGS DASHBOARD — 1 SCENARIO (HT-A-10)
-- ============================================================================

-- HT-A-10: View earnings dashboard
(
  'admin',
  'HT-A-10: Admin ve el dashboard de ganancias de un consultor',
  'Verificar que el dashboard de ganancias muestra los montos en EUR y CLP desglosados por tipo de hora.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones completadas con tarifas configuradas para el consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Ganancias en el sidebar","expectedOutcome":"Se muestra la página de ganancias de consultores"},{"index":2,"instruction":"Seleccionar un consultor del desplegable (ej. Consultor QA Test)","expectedOutcome":"Se carga la tabla de ganancias para ese consultor"},{"index":3,"instruction":"Seleccionar un rango de fechas que incluya sesiones completadas (ej. febrero 2026)","expectedOutcome":"La tabla se actualiza mostrando las ganancias del período"},{"index":4,"instruction":"Verificar que la tabla muestra: tipo de hora, horas totales, tarifa EUR, total EUR y total CLP","expectedOutcome":"Todos los montos son visibles y el total CLP refleja la conversión con la tasa de cambio actual"}]'::jsonb,
  2, 5, true, false, false
),

-- ============================================================================
-- SCHOOL HOURS REPORT — 3 SCENARIOS (HT-A-11 to HT-A-13)
-- ============================================================================

-- HT-A-11: View school hours report
(
  'admin',
  'HT-A-11: Admin ve el reporte de horas por escuela',
  'Verificar que el reporte muestra el desglose completo de programas, contratos, bloques y sesiones para un colegio.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un colegio con contrato y sesiones (QA Test School)"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Reporte de Horas en el sidebar o menú principal","expectedOutcome":"Se muestra la página del reporte de horas con un selector de colegio"},{"index":2,"instruction":"Seleccionar ''QA Test School'' del desplegable de colegios","expectedOutcome":"Se carga el reporte mostrando los programas del colegio"},{"index":3,"instruction":"Verificar que se muestran los contratos del colegio con sus bloques de horas","expectedOutcome":"Cada contrato muestra sus bloques con horas asignadas, consumidas y disponibles"},{"index":4,"instruction":"Verificar que se muestra el desglose de sesiones por bloque","expectedOutcome":"Las sesiones individuales son visibles con fecha, consultor y horas"}]'::jsonb,
  2, 6, true, false, false
),

-- HT-A-12: Export school report to PDF
(
  'admin',
  'HT-A-12: Admin exporta reporte de horas a PDF',
  'Verificar que se puede descargar un PDF del reporte de horas de un colegio.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe haber un colegio seleccionado en el reporte de horas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al Reporte de Horas y seleccionar un colegio","expectedOutcome":"Se carga el reporte del colegio"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar PDF''","expectedOutcome":"Se descarga un archivo PDF"},{"index":3,"instruction":"Abrir el PDF descargado","expectedOutcome":"El PDF muestra el reporte completo con programas, contratos, bloques y totales de horas"}]'::jsonb,
  2, 4, true, false, false
),

-- HT-A-13: Over-budget badge
(
  'admin',
  'HT-A-13: Admin ve badge de ''Sobre presupuesto'' en reporte',
  'Verificar que aparece un indicador cuando las horas consumidas superan las horas asignadas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir un contrato donde las horas consumidas superen las asignadas en algún bloque"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al Reporte de Horas y seleccionar un colegio con horas sobrepasadas","expectedOutcome":"Se carga el reporte"},{"index":2,"instruction":"Buscar un bloque donde las horas consumidas sean mayores que las asignadas","expectedOutcome":"El bloque muestra un badge ''Sobre presupuesto'' o indicador visual en rojo"},{"index":3,"instruction":"Verificar que la barra de progreso excede el 100%","expectedOutcome":"La barra visual indica claramente que se superó el presupuesto de horas"}]'::jsonb,
  3, 4, true, false, false
),

-- ============================================================================
-- CANCELLATION SUB-BADGES — 1 SCENARIO (HT-A-14)
-- ============================================================================

-- HT-A-14: Cancellation sub-badges on session list
(
  'admin',
  'HT-A-14: Admin ve sub-badges de cancelación en lista de sesiones',
  'Verificar que las sesiones canceladas muestran sub-badges indicando si las horas fueron devueltas o penalizadas.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones canceladas con horas devueltas y penalizadas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Filtrar por estado ''Cancelada'' o buscar sesiones canceladas","expectedOutcome":"Se muestran las sesiones con badge rojo ''Cancelada''"},{"index":3,"instruction":"Verificar que las sesiones canceladas con horas devueltas muestran un sub-badge verde ''Devuelta''","expectedOutcome":"El sub-badge verde es visible junto al badge de cancelada"},{"index":4,"instruction":"Verificar que las sesiones canceladas por penalización muestran un sub-badge rojo ''Penalizada''","expectedOutcome":"El sub-badge rojo es visible junto al badge de cancelada"}]'::jsonb,
  3, 4, true, false, false
),

-- ============================================================================
-- BULK TAG SESSIONS — 4 SCENARIOS (HT-A-15 to HT-A-18)
-- ============================================================================

-- HT-A-15: View bulk tag page
(
  'admin',
  'HT-A-15: Admin ve la página de Clasificar Sesiones',
  'Verificar que la página de clasificación en lote muestra las sesiones sin tipo de hora asignado.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones sin tipo de hora asignado (hour_type_key vacío)"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Clasificar Sesiones en el sidebar","expectedOutcome":"Se muestra la página ''Clasificar Sesiones'' con una tabla de sesiones sin clasificar"},{"index":2,"instruction":"Verificar que la tabla muestra columnas: fecha, colegio, consultor y estado","expectedOutcome":"Las columnas son visibles con datos correctos"},{"index":3,"instruction":"Verificar que solo se muestran sesiones que no tienen tipo de hora asignado","expectedOutcome":"Ninguna de las sesiones listadas tiene un tipo de hora visible — todas están pendientes de clasificación"}]'::jsonb,
  2, 4, true, false, false
),

-- HT-A-16: Tag sessions in bulk
(
  'admin',
  'HT-A-16: Admin clasifica sesiones en lote',
  'Verificar que se pueden seleccionar múltiples sesiones y asignarles un tipo de hora.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones sin clasificar"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Clasificar Sesiones","expectedOutcome":"Se muestra la tabla de sesiones sin clasificar"},{"index":2,"instruction":"Seleccionar 2 o más sesiones usando los checkboxes de la tabla","expectedOutcome":"Las sesiones quedan seleccionadas (checkbox marcado) y aparece un panel de acción"},{"index":3,"instruction":"Seleccionar un tipo de hora del desplegable (ej. ''Asesoría Técnica Online'')","expectedOutcome":"El tipo de hora queda seleccionado"},{"index":4,"instruction":"Hacer clic en el botón ''Aplicar'' o ''Clasificar''","expectedOutcome":"Aparece un mensaje de éxito y las sesiones clasificadas desaparecen de la lista (ya tienen tipo de hora asignado)"}]'::jsonb,
  2, 5, true, false, false
),

-- HT-A-17: Filter bulk tag page
(
  'admin',
  'HT-A-17: Admin filtra sesiones en página de clasificación',
  'Verificar que los filtros de colegio y rango de fechas funcionan correctamente.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones sin clasificar de diferentes colegios y fechas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Clasificar Sesiones","expectedOutcome":"Se muestra la tabla completa de sesiones sin clasificar"},{"index":2,"instruction":"Seleccionar un colegio del filtro desplegable de escuela","expectedOutcome":"La tabla se actualiza mostrando solo sesiones del colegio seleccionado"},{"index":3,"instruction":"Aplicar un rango de fechas en los filtros de fecha","expectedOutcome":"La tabla se filtra adicionalmente por las fechas seleccionadas"},{"index":4,"instruction":"Limpiar los filtros","expectedOutcome":"La tabla vuelve a mostrar todas las sesiones sin clasificar"}]'::jsonb,
  3, 4, true, false, false
),

-- HT-A-18: Pagination on bulk tag page
(
  'admin',
  'HT-A-18: Admin verifica paginación en clasificación de sesiones',
  'Verificar que la paginación funciona y las selecciones se reinician al cambiar de página.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir más de 50 sesiones sin clasificar para ver paginación"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Clasificar Sesiones","expectedOutcome":"Se muestra la primera página de sesiones con controles de paginación"},{"index":2,"instruction":"Seleccionar algunas sesiones con checkboxes en la primera página","expectedOutcome":"Las sesiones quedan seleccionadas"},{"index":3,"instruction":"Hacer clic en el botón de siguiente página","expectedOutcome":"Se muestra la segunda página de sesiones y las selecciones previas se reinician (checkboxes desmarcados)"},{"index":4,"instruction":"Volver a la primera página","expectedOutcome":"Los checkboxes están desmarcados — la selección no persiste entre páginas"}]'::jsonb,
  3, 4, true, false, false
),

-- ============================================================================
-- SIDEBAR NAVIGATION — 1 SCENARIO (HT-A-19)
-- ============================================================================

-- HT-A-19: Admin sidebar nav items for hour tracking
(
  'admin',
  'HT-A-19: Admin verifica ítems de navegación de Control de Horas',
  'Verificar que el sidebar muestra todos los ítems relacionados con Control de Horas bajo Consultorías.',
  'hour_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral (sidebar) y expandir la sección ''Consultorías''","expectedOutcome":"Se despliegan los ítems del menú de Consultorías"},{"index":2,"instruction":"Verificar que aparece el ítem ''Sesiones''","expectedOutcome":"El ítem es visible y clickeable"},{"index":3,"instruction":"Verificar que aparece el ítem ''Aprobaciones''","expectedOutcome":"El ítem es visible y clickeable"},{"index":4,"instruction":"Verificar que aparece el ítem ''Reportes''","expectedOutcome":"El ítem es visible y clickeable"},{"index":5,"instruction":"Verificar que aparece el ítem ''Tarifas''","expectedOutcome":"El ítem es visible y navega a la página de tarifas de consultores"},{"index":6,"instruction":"Verificar que aparece el ítem ''Ganancias''","expectedOutcome":"El ítem es visible y navega a la página de ganancias"},{"index":7,"instruction":"Verificar que aparece el ítem ''Clasificar Sesiones''","expectedOutcome":"El ítem es visible y navega a la página de clasificación en lote"}]'::jsonb,
  3, 3, true, false, false
);

COMMIT;
