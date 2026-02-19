-- ============================================================================
-- QA Scenarios Seed Script: LIDER_COMUNIDAD Role — Consultor Sessions
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: lider_comunidad (GC Member / Community Leader)
-- Total Scenarios: 12
-- Date Created: 2026-02-16
-- Feature Area: consultor_sessions
--
-- CATEGORIES:
--   - Workspace Sessions Tab (CS-G-01 to CS-G-04)
--   - Session Detail (CS-G-05 to CS-G-08)
--   - Permission Boundaries (CS-G-09 to CS-G-12)
--
-- PRIORITIES:
--   1 = Critical (security, permissions)
--   2 = High (core read access)
--   3 = Medium (UI, integration)
--   4 = Low (edge cases)
-- ============================================================================

BEGIN;

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- ============================================================================
-- WORKSPACE SESSIONS TAB — 4 SCENARIOS (CS-G-01 to CS-G-04)
-- ============================================================================

-- CS-G-01: GC member sees sessions tab in workspace
(
  'lider_comunidad',
  'CS-G-01: Miembro GC ve pestaña de sesiones en espacio de trabajo',
  'Verificar que la pestaña ''Sesiones'' aparece en la navegación del espacio de trabajo de la comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"El usuario debe pertenecer a una comunidad de crecimiento con sesiones"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al espacio de trabajo (workspace) de la comunidad","expectedOutcome":"Se muestra el espacio de trabajo con las pestañas de navegación"},{"index":2,"instruction":"Verificar que existe una pestaña ''Sesiones'' en la barra de pestañas, con tooltip ''Refrescar sesiones''","expectedOutcome":"La pestaña ''Sesiones'' es visible y clickeable, con botón de actualización"},{"index":3,"instruction":"Hacer clic en la pestaña ''Sesiones''","expectedOutcome":"Se muestra la lista de sesiones de la comunidad (vacía o con sesiones)"}]'::jsonb,
  2, 3, true, false, false
),

-- CS-G-02: GC member views session list in workspace
(
  'lider_comunidad',
  'CS-G-02: Miembro GC ve lista de sesiones de su comunidad',
  'Verificar que la lista de sesiones muestra solo las sesiones de la comunidad del usuario en formato de tarjetas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Deben existir sesiones en la comunidad del usuario en diferentes estados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al espacio de trabajo y hacer clic en la pestaña ''Sesiones''","expectedOutcome":"Se muestra la lista de sesiones de la comunidad en formato de tarjetas"},{"index":2,"instruction":"Verificar que cada tarjeta muestra: título truncado, icono de modalidad, badge de estado, fecha en formato ''EEEE dd ''de'' MMMM yyyy'', rango de horas, nombre de escuela (con icono de MapPin), y nombre de comunidad (con icono de Users)","expectedOutcome":"Toda la información de cada sesión es visible en la tarjeta"},{"index":3,"instruction":"Verificar que las sesiones son solo de la comunidad del usuario","expectedOutcome":"No aparecen sesiones de otras comunidades de crecimiento"},{"index":4,"instruction":"Verificar que las sesiones están agrupadas en ''Próximas Sesiones'' (ordenadas ascendentemente por fecha) y ''Sesiones Pasadas'' (ordenadas descendentemente)","expectedOutcome":"Las sesiones están organizadas en dos grupos claramente identificados"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-G-03: GC member does NOT see borrador sessions
(
  'lider_comunidad',
  'CS-G-03: Miembro GC no ve sesiones en estado borrador',
  'Verificar que las sesiones con estado ''borrador'' no aparecen para los miembros de la comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Deben existir sesiones en estado ''borrador'' en la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Sesiones'' del espacio de trabajo","expectedOutcome":"Se muestra la lista de sesiones en tarjetas"},{"index":2,"instruction":"Revisar todas las sesiones visibles y verificar sus badges de estado","expectedOutcome":"Ninguna sesión muestra el badge gris de ''Borrador''"},{"index":3,"instruction":"Verificar que las sesiones visibles tienen badges de estado como ''Programada'' (azul), ''En Progreso'' (ámbar) o ''Completada'' (verde)","expectedOutcome":"Solo se ven sesiones en estados posteriores a borrador"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-G-04: GC member sees dashboard widget for upcoming sessions
(
  'lider_comunidad',
  'CS-G-04: Miembro GC ve widget de próximas sesiones en dashboard',
  'Verificar que el dashboard unificado muestra un widget con las próximas sesiones de la comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Deben existir sesiones programadas futuras en la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al dashboard principal","expectedOutcome":"Se muestra el dashboard con widgets"},{"index":2,"instruction":"Buscar el widget ''Próximas Sesiones'' o similar","expectedOutcome":"Se muestra un widget con las próximas sesiones de consultoría en formato de tarjetas"},{"index":3,"instruction":"Verificar que el widget muestra título, fecha, hora y modalidad de las sesiones","expectedOutcome":"La información básica de las próximas sesiones es visible"},{"index":4,"instruction":"Hacer clic en una sesión del widget","expectedOutcome":"Se navega al detalle de la sesión en /consultor/sessions/${id}"}]'::jsonb,
  3, 3, true, false, false
),

-- ============================================================================
-- SESSION DETAIL — 4 SCENARIOS (CS-G-05 to CS-G-08)
-- ============================================================================

-- CS-G-05: GC member views session detail read-only
(
  'lider_comunidad',
  'CS-G-05: Miembro GC ve detalle de sesión en solo lectura',
  'Verificar que el miembro de la comunidad puede ver el detalle de una sesión en modo de solo lectura, en la misma página de detalle que el consultor pero sin permisos de edición.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Debe existir una sesión programada en la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Sesiones'' del espacio de trabajo y hacer clic en una sesión","expectedOutcome":"Se abre la página de detalle de la sesión en /consultor/sessions/${id}"},{"index":2,"instruction":"Verificar que aparece el mensaje ''Está viendo esta sesión en modo lectura. No está asignado como facilitador.''","expectedOutcome":"El mensaje de modo lectura es visible"},{"index":3,"instruction":"Verificar que se muestra el título, descripción, fecha, hora, modalidad y facilitadores","expectedOutcome":"Toda la información de la sesión es visible"},{"index":4,"instruction":"Verificar que NO hay botones de editar, guardar o modificar","expectedOutcome":"La página está en modo completamente de solo lectura"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-G-06: GC member cannot edit session
(
  'lider_comunidad',
  'CS-G-06: Miembro GC no puede editar ningún campo de la sesión',
  'Verificar que no hay controles de edición disponibles para miembros de comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Sesión de la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión de la comunidad","expectedOutcome":"Se muestra el detalle en modo lectura"},{"index":2,"instruction":"Verificar que no existe botón ''Editar'' ni ''Solicitar Cambio''","expectedOutcome":"No hay opciones de edición ni solicitud de cambio"},{"index":3,"instruction":"Verificar que no existe botón ''Finalizar Sesión''","expectedOutcome":"No hay opción de finalización"},{"index":4,"instruction":"Verificar que no hay opciones de marcar asistencia","expectedOutcome":"La sección de asistencia (si visible) está en modo solo lectura"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-G-07: GC member cannot upload materials
(
  'lider_comunidad',
  'CS-G-07: Miembro GC no puede subir materiales',
  'Verificar que los miembros de comunidad no pueden subir ni eliminar materiales.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Sesión con materiales existentes en la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión y buscar la sección de materiales","expectedOutcome":"Se muestran los materiales existentes (si aplica)"},{"index":2,"instruction":"Verificar que no hay área de subida de archivos ni botón de ''Subir Material''","expectedOutcome":"No hay opciones para agregar materiales"},{"index":3,"instruction":"Verificar que no hay botones de eliminar en los materiales existentes","expectedOutcome":"Los materiales se muestran en solo lectura"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-G-08: GC member cannot write reports
(
  'lider_comunidad',
  'CS-G-08: Miembro GC no puede escribir reportes',
  'Verificar que los miembros de comunidad no pueden crear ni editar reportes de sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Sesión con reportes existentes (visibilidad ''all_participants'')"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión y buscar la sección de reportes","expectedOutcome":"Se muestran los reportes visibles para participantes"},{"index":2,"instruction":"Verificar que no hay botón de ''Nuevo Reporte'' ni ''Escribir Reporte''","expectedOutcome":"No hay opción de crear reportes"},{"index":3,"instruction":"Verificar que los reportes existentes no tienen botón de editar","expectedOutcome":"Los reportes están en modo solo lectura"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- PERMISSION BOUNDARIES — 4 SCENARIOS (CS-G-09 to CS-G-12)
-- ============================================================================

-- CS-G-09: GC member cannot access admin session pages
(
  'lider_comunidad',
  'CS-G-09: Miembro GC no puede acceder a páginas admin de sesiones',
  'Verificar que las URLs de administración de sesiones son inaccesibles para miembros de comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-G-10: GC member cannot access consultor session pages
(
  'lider_comunidad',
  'CS-G-10: Miembro GC no puede acceder a páginas de consultor',
  'Verificar que las URLs de sesiones del consultor son inaccesibles para miembros de comunidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions/reports y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb,
  1, 2, true, false, false
),

-- CS-G-11: GC member can only see sessions from own community
(
  'lider_comunidad',
  'CS-G-11: Miembro GC solo ve sesiones de su propia comunidad',
  'Verificar que el filtrado por comunidad es correcto y no se filtran sesiones de otras comunidades.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Deben existir sesiones en múltiples comunidades de crecimiento"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Sesiones'' del espacio de trabajo","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Verificar que todas las sesiones pertenecen a la comunidad de crecimiento del usuario","expectedOutcome":"Cada sesión listada corresponde a la comunidad del usuario, no a otras"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /consultor/sessions/00000000-0000-0000-0000-000000000001 y presionar Enter (un ID de sesión que no pertenece a la comunidad del usuario)","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del miembro de comunidad"}]'::jsonb,
  1, 4, true, false, false
),

-- CS-G-12: GC member can export single session iCal
(
  'lider_comunidad',
  'CS-G-12: Miembro GC puede exportar sesión individual a calendario',
  'Verificar que el miembro de comunidad puede descargar un archivo .ics de una sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como líder de comunidad"},{"type":"data","description":"Sesión programada en la comunidad del usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión de la comunidad","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Buscar y hacer clic en el botón ''Agregar al Calendario''","expectedOutcome":"Se descarga un archivo .ics con los datos de la sesión"},{"index":3,"instruction":"Verificar que el archivo contiene la información correcta de la sesión","expectedOutcome":"El evento del calendario tiene título, fecha, hora y ubicación correctos"}]'::jsonb,
  3, 3, true, false, false
);

COMMIT;
