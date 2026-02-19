-- ============================================================================
-- QA Scenarios Seed Script: ADMIN Role — Consultor Sessions
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: admin
-- Total Scenarios: 38
-- Date Created: 2026-02-16
-- Feature Area: consultor_sessions
--
-- CATEGORIES:
--   - Session CRUD (CS-A-01 to CS-A-08)
--   - Recurring Sessions / Series (CS-A-09 to CS-A-14)
--   - Lifecycle & Approvals (CS-A-15 to CS-A-22)
--   - Edit Request Management (CS-A-23 to CS-A-26)
--   - Analytics & Reports (CS-A-27 to CS-A-30)
--   - iCal Export (CS-A-31 to CS-A-33)
--   - Mobile Responsiveness (CS-A-34 to CS-A-36)
--   - Edge Cases (CS-A-37 to CS-A-38)
--
-- PRIORITIES:
--   1 = Critical (security, lifecycle)
--   2 = High (CRUD, approvals)
--   3 = Medium (UI, analytics, iCal)
--   4 = Low (edge cases, mobile)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SESSION CRUD — 8 SCENARIOS (CS-A-01 to CS-A-08)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CS-A-01: Admin creates individual session
(
  'admin',
  'CS-A-01: Admin crea sesión individual',
  'Verificar que un administrador puede crear una sesión individual completando todos los campos obligatorios.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"Acceder a Consultorías > Sesiones en el sidebar"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones en el sidebar","expectedOutcome":"Se muestra la lista de sesiones con el encabezado ''Sesiones de Consultoría''"},{"index":2,"instruction":"Hacer clic en el botón ''Nueva Sesión''","expectedOutcome":"Se abre el formulario de creación de sesión con campos vacíos"},{"index":3,"instruction":"Seleccionar un colegio del desplegable ''Colegio''","expectedOutcome":"Se actualiza el desplegable de comunidades de crecimiento para mostrar las del colegio seleccionado"},{"index":4,"instruction":"Seleccionar una comunidad de crecimiento","expectedOutcome":"El campo se completa correctamente"},{"index":5,"instruction":"Completar el título, descripción, objetivos, fecha, hora inicio (09:00), hora fin (10:00)","expectedOutcome":"Todos los campos aceptan los datos ingresados"},{"index":6,"instruction":"Seleccionar modalidad ''Presencial'' y completar el campo de ubicación","expectedOutcome":"El campo de ubicación aparece y acepta texto"},{"index":7,"instruction":"Agregar al menos un facilitador usando el desplegable de consultores","expectedOutcome":"El facilitador aparece en la lista con opción de marcarlo como líder"},{"index":8,"instruction":"Hacer clic en el botón ''Guardar borrador''","expectedOutcome":"Aparece un mensaje de éxito y se redirige a la lista de sesiones donde la nueva sesión aparece con estado ''Borrador'' (badge gris)"}]'::jsonb,
  2, 8, true, false, false
),

-- CS-A-02: Admin creates session and submits for approval
(
  'admin',
  'CS-A-02: Admin crea sesión y la envía a aprobación',
  'Verificar que un administrador puede crear una sesión y enviarla directamente a estado pendiente de aprobación.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"Estar en la página de creación de sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones y hacer clic en ''Nueva Sesión''","expectedOutcome":"Se abre el formulario de creación"},{"index":2,"instruction":"Completar todos los campos obligatorios (colegio, comunidad, título, fecha, hora inicio/fin, modalidad, facilitador)","expectedOutcome":"Todos los campos están completos"},{"index":3,"instruction":"Hacer clic en el botón ''Programar sesión''","expectedOutcome":"Aparece un mensaje de éxito y la sesión se muestra en la lista con estado ''Pendiente de Aprobación'' (badge amarillo)"}]'::jsonb,
  2, 6, true, false, false
),

-- CS-A-03: Admin views session list in list view
(
  'admin',
  'CS-A-03: Admin ve lista de sesiones en vista de lista',
  'Verificar que la vista de lista muestra todas las sesiones con información correcta.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir al menos 5 sesiones en diferentes estados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la página de sesiones"},{"index":2,"instruction":"Seleccionar la vista ''Lista'' usando los botones de vista (ícono de lista)","expectedOutcome":"Se muestra la tabla/lista de sesiones con columnas de título, fecha, escuela, estado"},{"index":3,"instruction":"Verificar que cada sesión muestra su badge de estado con el color correcto","expectedOutcome":"Borrador=gris, Pendiente Aprobación=amarillo, Programada=azul, En Progreso=ámbar, Pendiente Informe=naranja, Completada=verde, Cancelada=rojo"},{"index":4,"instruction":"Verificar que se muestra el total de sesiones y la paginación","expectedOutcome":"Se ve el contador total y los controles de paginación"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-04: Admin views session list in calendar month view
(
  'admin',
  'CS-A-04: Admin ve sesiones en vista calendario mensual',
  'Verificar que la vista de calendario mensual muestra sesiones en sus fechas correctas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones en el mes actual"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la página de sesiones"},{"index":2,"instruction":"Seleccionar la vista ''Mes'' usando los botones de vista (ícono de calendario)","expectedOutcome":"Se muestra una grilla de 7 columnas con los días del mes"},{"index":3,"instruction":"Verificar que las sesiones aparecen en sus días correspondientes","expectedOutcome":"Cada día muestra las sesiones programadas con su título y badge de estado"},{"index":4,"instruction":"Navegar al mes siguiente usando la flecha derecha","expectedOutcome":"El calendario avanza al mes siguiente mostrando las sesiones de ese mes"},{"index":5,"instruction":"Navegar al mes anterior usando la flecha izquierda","expectedOutcome":"El calendario retrocede al mes anterior"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-05: Admin views session list in week view
(
  'admin',
  'CS-A-05: Admin ve sesiones en vista semanal',
  'Verificar que la vista semanal muestra las sesiones de la semana actual.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones en la semana actual"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la página de sesiones"},{"index":2,"instruction":"Seleccionar la vista ''Semana''","expectedOutcome":"Se muestra la vista semanal con los 7 días de la semana"},{"index":3,"instruction":"Verificar que las sesiones aparecen en sus días correspondientes","expectedOutcome":"Se muestran las sesiones de la semana con título, hora y estado"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-A-06: Admin filters sessions
(
  'admin',
  'CS-A-06: Admin filtra sesiones por estado y escuela',
  'Verificar que los filtros de la lista de sesiones funcionan correctamente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones en diferentes estados y escuelas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la lista completa de sesiones"},{"index":2,"instruction":"Hacer clic en el botón de filtros y seleccionar un estado específico (ej. ''Programada'')","expectedOutcome":"La lista se actualiza mostrando solo sesiones con estado ''Programada''"},{"index":3,"instruction":"Seleccionar un colegio específico del filtro de escuela","expectedOutcome":"La lista se filtra adicionalmente por el colegio seleccionado"},{"index":4,"instruction":"Limpiar todos los filtros","expectedOutcome":"La lista vuelve a mostrar todas las sesiones"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-07: Admin views session detail
(
  'admin',
  'CS-A-07: Admin ve detalle completo de una sesión',
  'Verificar que la página de detalle de sesión muestra toda la información correctamente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión con facilitadores asignados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Hacer clic en una sesión de la lista","expectedOutcome":"Se abre la página de detalle de la sesión"},{"index":3,"instruction":"Verificar que se muestra el título, descripción, objetivos, fecha, hora, modalidad","expectedOutcome":"Toda la información de la sesión es visible y correcta"},{"index":4,"instruction":"Verificar que se muestra el badge de estado con el color correspondiente","expectedOutcome":"El badge de estado es visible y tiene el color correcto"},{"index":5,"instruction":"Verificar que se muestra la lista de facilitadores","expectedOutcome":"Los nombres de los facilitadores aparecen listados"},{"index":6,"instruction":"Verificar que las horas muestran ''(hora Chile)''","expectedOutcome":"Las horas tienen el sufijo (hora Chile) para indicar la zona horaria"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-A-08: Admin verifies detail page without direct edit option
(
  'admin',
  'CS-A-08: Admin verifica página de detalle sin opción de edición directa',
  'Verificar que el administrador puede ver toda la información de la sesión pero no tiene opción de editar directamente; los cambios van través del flujo de solicitud de edición.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión programada"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión programada","expectedOutcome":"Se muestra la página de detalle con toda la información de la sesión"},{"index":2,"instruction":"Verificar que se muestra el título, descripción, objetivos, fecha, hora, modalidad y facilitadores","expectedOutcome":"Toda la información de la sesión es visible y clara"},{"index":3,"instruction":"Verificar que NO hay un botón ''Editar'' o ícono de edición en la página","expectedOutcome":"No existe opción para editar directamente los campos de la sesión"},{"index":4,"instruction":"Verificar que se muestran opciones de aprobación, cancelación o cambio de estado según el estado actual","expectedOutcome":"Los únicos botones de acción disponibles son para gestionar el ciclo de vida (aprobar, cancelar, iniciar) pero no para editar campos directamente"}]'::jsonb,
  2, 5, true, false, false
),

-- ============================================================================
-- RECURRING SESSIONS / SERIES — 6 SCENARIOS (CS-A-09 to CS-A-14)
-- ============================================================================

-- CS-A-09: Admin creates weekly recurring sessions
(
  'admin',
  'CS-A-09: Admin crea sesiones recurrentes semanales',
  'Verificar que un administrador puede crear una serie de sesiones recurrentes con frecuencia semanal.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"Estar en la página de creación de sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones y hacer clic en ''Nueva Sesión''","expectedOutcome":"Se abre el formulario de creación"},{"index":2,"instruction":"Completar todos los campos obligatorios de la sesión","expectedOutcome":"Campos completados correctamente"},{"index":3,"instruction":"Seleccionar la opción ''Serie recurrente'' (en lugar de ''Sesión única'')","expectedOutcome":"Aparecen los campos de configuración de recurrencia: frecuencia, cantidad de sesiones"},{"index":4,"instruction":"Seleccionar frecuencia ''Semanal'' y cantidad 4","expectedOutcome":"Se muestra una vista previa con las 4 fechas calculadas"},{"index":5,"instruction":"Verificar que las fechas de vista previa son correctas (cada 7 días)","expectedOutcome":"Las fechas están separadas por exactamente una semana"},{"index":6,"instruction":"Hacer clic en ''Guardar borrador'' o ''Programar serie (4 sesiones)''","expectedOutcome":"Aparece un mensaje de éxito indicando que se crearon las sesiones de la serie y se redirige a la lista"}]'::jsonb,
  2, 8, true, false, false
),

-- CS-A-10: Admin creates biweekly recurring sessions
(
  'admin',
  'CS-A-10: Admin crea sesiones recurrentes quincenales',
  'Verificar que se pueden crear sesiones con frecuencia quincenal.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"Estar en la página de creación de sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al formulario de nueva sesión, seleccionar ''Serie recurrente'' y completar los campos obligatorios","expectedOutcome":"Formulario listo con opción de recurrencia seleccionada"},{"index":2,"instruction":"Seleccionar frecuencia ''Quincenal'' y cantidad 3","expectedOutcome":"La vista previa muestra 3 fechas separadas por 14 días cada una"},{"index":3,"instruction":"Hacer clic en ''Guardar''","expectedOutcome":"Se crean las 3 sesiones de la serie exitosamente"}]'::jsonb,
  3, 5, true, false, false
),

-- CS-A-11: Admin views series panel in session detail
(
  'admin',
  'CS-A-11: Admin ve el panel de serie en detalle de sesión',
  'Verificar que el panel de serie aparece en sesiones que pertenecen a una serie recurrente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una serie de sesiones recurrentes (al menos 3 sesiones)"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión que pertenece a una serie recurrente","expectedOutcome":"Se muestra la página de detalle con un banner indicando ''Serie de sesiones — Sesión {N} de {total}''"},{"index":2,"instruction":"Hacer clic en el panel colapsable de la serie","expectedOutcome":"Se expande el panel mostrando la lista de todas las sesiones de la serie"},{"index":3,"instruction":"Verificar que cada sesión de la serie muestra su estado con pill de color","expectedOutcome":"Cada sesión tiene un indicador de estado visible"},{"index":4,"instruction":"Verificar que se muestran estadísticas de la serie (total, completadas, pendientes)","expectedOutcome":"Los contadores de estadísticas son visibles y correctos"},{"index":5,"instruction":"Hacer clic en otra sesión de la lista del panel","expectedOutcome":"Se navega al detalle de esa otra sesión manteniendo el contexto de serie"}]'::jsonb,
  3, 5, true, false, false
),

-- CS-A-12: Admin cancels future sessions in a series
(
  'admin',
  'CS-A-12: Admin cancela sesiones futuras de una serie',
  'Verificar que un administrador puede cancelar las sesiones restantes/futuras de una serie.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una serie con sesiones futuras en estado ''programada''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión que pertenece a una serie","expectedOutcome":"Se muestra el detalle con el panel de serie"},{"index":2,"instruction":"Hacer clic en el botón ''Cancelar sesiones futuras'' en el panel de serie","expectedOutcome":"Se abre un modal titulado ''Cancelar Sesiones Futuras de la Serie'' preguntando si desea confirmar"},{"index":3,"instruction":"Confirmar la cancelación en el modal","expectedOutcome":"Aparece un mensaje de éxito indicando cuántas sesiones fueron canceladas"},{"index":4,"instruction":"Verificar que las sesiones futuras ahora muestran estado ''Cancelada'' (badge rojo)","expectedOutcome":"Las sesiones futuras de la serie tienen el badge rojo de cancelada"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-A-13: Admin bulk approves series sessions
(
  'admin',
  'CS-A-13: Admin aprueba en lote las sesiones de una serie',
  'Verificar que un administrador puede aprobar todas las sesiones pendientes de una serie de una vez.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una serie con sesiones en estado ''pendiente_aprobacion''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión de la serie que está pendiente de aprobación","expectedOutcome":"Se muestra el detalle con el panel de serie"},{"index":2,"instruction":"Buscar y hacer clic en el botón de aprobación en lote (''Aprobar Serie'' o similar)","expectedOutcome":"Se abre un modal o confirmación para aprobar todas las sesiones pendientes de la serie"},{"index":3,"instruction":"Confirmar la aprobación en lote","expectedOutcome":"Aparece un mensaje de éxito indicando cuántas sesiones fueron aprobadas"},{"index":4,"instruction":"Verificar que las sesiones de la serie ahora muestran estado ''Programada'' (badge azul)","expectedOutcome":"Todas las sesiones previamente pendientes ahora tienen badge azul de ''Programada''"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-A-14: Admin creates custom-date recurring sessions
(
  'admin',
  'CS-A-14: Admin crea sesiones recurrentes con fechas personalizadas',
  'Verificar que se pueden crear sesiones recurrentes seleccionando fechas individuales manualmente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"Estar en la página de creación de sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al formulario de nueva sesión y completar los campos obligatorios","expectedOutcome":"Formulario listo con datos"},{"index":2,"instruction":"Seleccionar ''Serie recurrente'' y frecuencia ''Fechas personalizadas''","expectedOutcome":"Aparecen campos para agregar fechas individuales"},{"index":3,"instruction":"Agregar 3 fechas específicas usando el selector de fecha","expectedOutcome":"Las 3 fechas aparecen listadas en la vista previa"},{"index":4,"instruction":"Hacer clic en ''Guardar''","expectedOutcome":"Se crean 3 sesiones en las fechas seleccionadas con mensaje de éxito"}]'::jsonb,
  3, 6, true, false, false
),

-- ============================================================================
-- LIFECYCLE & APPROVALS — 8 SCENARIOS (CS-A-15 to CS-A-22)
-- ============================================================================

-- CS-A-15: Admin approves individual session
(
  'admin',
  'CS-A-15: Admin aprueba una sesión individual',
  'Verificar que un administrador puede aprobar una sesión que está pendiente de aprobación.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión en estado ''pendiente_aprobacion''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión con estado ''Pendiente de Aprobación'' (badge amarillo)","expectedOutcome":"Se muestra la sesión con su badge amarillo"},{"index":2,"instruction":"Hacer clic en el botón ''Aprobar'' o ícono de aprobación","expectedOutcome":"Se solicita confirmación de la acción"},{"index":3,"instruction":"Confirmar la aprobación","expectedOutcome":"Aparece un mensaje de éxito y el estado cambia a ''Programada'' (badge azul)"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-A-16: Admin cancels a session
(
  'admin',
  'CS-A-16: Admin cancela una sesión',
  'Verificar que un administrador puede cancelar una sesión desde cualquier estado.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión en estado ''programada''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión programada","expectedOutcome":"Se muestra la sesión con badge azul"},{"index":2,"instruction":"Hacer clic en el botón ''Cancelar Sesión'' o en el menú de acciones","expectedOutcome":"Se abre un modal o confirmación de cancelación"},{"index":3,"instruction":"Confirmar la cancelación","expectedOutcome":"Aparece un mensaje de éxito y el estado cambia a ''Cancelada'' (badge rojo)"},{"index":4,"instruction":"Verificar que los botones de edición y acciones ya no están disponibles","expectedOutcome":"Las opciones de edición están deshabilitadas o no visibles"}]'::jsonb,
  1, 4, true, false, false
),

-- CS-A-17: Admin transitions session to en_progreso
(
  'admin',
  'CS-A-17: Admin inicia una sesión programada',
  'Verificar que un administrador puede cambiar el estado de una sesión de programada a en progreso.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión en estado ''programada''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión programada","expectedOutcome":"Se muestra la sesión con badge azul ''Programada''"},{"index":2,"instruction":"Hacer clic en el botón ''Iniciar Sesión''","expectedOutcome":"Se solicita confirmación"},{"index":3,"instruction":"Confirmar el inicio de la sesión","expectedOutcome":"El estado cambia a ''En Progreso'' (badge ámbar) y se habilitan opciones de asistencia, materiales y reportes"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-A-18: Admin views approvals page
(
  'admin',
  'CS-A-18: Admin ve la página de aprobaciones de solicitudes',
  'Verificar que la página de aprobaciones muestra las solicitudes de edición pendientes, aprobadas, rechazadas y todas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir solicitudes de edición en diferentes estados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Aprobaciones en el sidebar","expectedOutcome":"Se abre la página ''Aprobaciones de Sesiones'' con el subtítulo ''Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores''"},{"index":2,"instruction":"Verificar la pestaña ''Pendientes''","expectedOutcome":"Se muestran las solicitudes de edición pendientes con información del solicitante, sesión y campos a modificar"},{"index":3,"instruction":"Verificar la pestaña ''Aprobadas''","expectedOutcome":"Se muestran las solicitudes previamente aprobadas"},{"index":4,"instruction":"Verificar la pestaña ''Rechazadas''","expectedOutcome":"Se muestran las solicitudes rechazadas"},{"index":5,"instruction":"Verificar la pestaña ''Todas''","expectedOutcome":"Se muestran todas las solicitudes de edición sin importar su estado"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-A-19: Admin approves edit request
(
  'admin',
  'CS-A-19: Admin aprueba una solicitud de edición de un consultor',
  'Verificar que al aprobar una solicitud de edición, los cambios se aplican automáticamente a la sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una solicitud de edición pendiente de un consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Aprobaciones","expectedOutcome":"Se muestra la lista de solicitudes pendientes"},{"index":2,"instruction":"Revisar los detalles de una solicitud pendiente (sección ''Cambios propuestos:'' con valores actuales tachados en rojo y nuevos en verde)","expectedOutcome":"Se muestra toda la información de la solicitud: qué campos quiere cambiar el consultor (con formato de cambio visible) y por qué"},{"index":3,"instruction":"Hacer clic en el botón ''Aprobar''","expectedOutcome":"Aparece un mensaje de éxito y la solicitud se mueve a la pestaña ''Aprobadas''"},{"index":4,"instruction":"Navegar al detalle de la sesión afectada","expectedOutcome":"Los cambios solicitados están aplicados en la sesión"}]'::jsonb,
  1, 5, true, false, false
),

-- CS-A-20: Admin rejects edit request
(
  'admin',
  'CS-A-20: Admin rechaza una solicitud de edición de un consultor',
  'Verificar que al rechazar una solicitud, la sesión no se modifica.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una solicitud de edición pendiente"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Aprobaciones","expectedOutcome":"Se muestra la lista de solicitudes pendientes"},{"index":2,"instruction":"Hacer clic en el botón ''Rechazar'' de una solicitud pendiente","expectedOutcome":"Se abre un campo de notas con la etiqueta ''Notas (opcional para aprobar, requerido para rechazar)''"},{"index":3,"instruction":"Completar el campo de notas/razón del rechazo","expectedOutcome":"El campo acepta el texto de la razón"},{"index":4,"instruction":"Confirmar el rechazo","expectedOutcome":"Aparece un mensaje de éxito ''Por favor ingrese una razón para el rechazo'' si está vacío, o confirma el rechazo si tiene contenido; la solicitud se mueve a la pestaña ''Rechazadas''"},{"index":5,"instruction":"Navegar al detalle de la sesión afectada","expectedOutcome":"La sesión no fue modificada, mantiene sus datos originales"}]'::jsonb,
  1, 4, true, false, false
),

-- CS-A-21: Admin verifies sidebar navigation items
(
  'admin',
  'CS-A-21: Admin verifica ítems de navegación en sidebar',
  'Verificar que el sidebar muestra todas las opciones correctas bajo la sección Consultorías.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral (sidebar) del sistema","expectedOutcome":"Se ve una sección ''Consultorías'' en el sidebar con 5 ítems"},{"index":2,"instruction":"Verificar que aparece el ítem ''Asignación de Consultores''","expectedOutcome":"El ítem es visible y clickeable"},{"index":3,"instruction":"Verificar que aparece el ítem ''Vista de Tareas''","expectedOutcome":"El ítem es visible y clickeable"},{"index":4,"instruction":"Verificar que aparece el ítem ''Sesiones''","expectedOutcome":"El ítem es visible y navega a /admin/sessions"},{"index":5,"instruction":"Verificar que aparece el ítem ''Aprobaciones''","expectedOutcome":"El ítem es visible y navega a /admin/sessions/approvals"},{"index":6,"instruction":"Verificar que aparece el ítem ''Reportes''","expectedOutcome":"El ítem es visible y navega a /consultor/sessions/reports"}]'::jsonb,
  2, 3, true, false, false
),

-- CS-A-22: Invalid lifecycle transition is prevented
(
  'admin',
  'CS-A-22: El sistema previene transiciones de estado inválidas',
  'Verificar que no se permiten transiciones de estado fuera del flujo definido.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión en estado ''completada''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión completada","expectedOutcome":"Se muestra la sesión con badge verde ''Completada''"},{"index":2,"instruction":"Verificar que no hay botones para cambiar el estado (no se puede volver a ''en_progreso'' o ''borrador'')","expectedOutcome":"No aparecen opciones de cambio de estado, solo se puede ver la información"},{"index":3,"instruction":"Verificar que los campos no son editables","expectedOutcome":"La sesión está en modo solo lectura"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- EDIT REQUEST MANAGEMENT — 4 SCENARIOS (CS-A-23 to CS-A-26)
-- ============================================================================

-- CS-A-23: Admin views edit request details
(
  'admin',
  'CS-A-23: Admin ve los detalles de una solicitud de edición',
  'Verificar que los detalles de la solicitud muestran valores actuales y solicitados.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una solicitud de edición pendiente con cambios en fecha y modalidad"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Aprobaciones","expectedOutcome":"Se muestra la lista de solicitudes pendientes"},{"index":2,"instruction":"Hacer clic en una solicitud para ver sus detalles","expectedOutcome":"Se muestra la información completa: nombre del consultor solicitante, sesión afectada, sección ''Cambios propuestos:'' con valores actuales (tachados en rojo) y nuevos (en verde y negrita), y la justificación escrita por el consultor"}]'::jsonb,
  2, 3, true, false, false
),

-- CS-A-24: Admin filters approvals by tab
(
  'admin',
  'CS-A-24: Admin filtra aprobaciones por estado usando pestañas',
  'Verificar que las pestañas de la página de aprobaciones funcionan correctamente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir solicitudes en los 4 estados: pendiente, aprobada, rechazada y todas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Aprobaciones","expectedOutcome":"Se muestra la página con 4 pestañas: Pendientes, Aprobadas, Rechazadas, Todas"},{"index":2,"instruction":"Hacer clic en la pestaña ''Pendientes''","expectedOutcome":"Se muestran solo las solicitudes pendientes o mensaje ''No hay solicitudes pendientes'' si está vacía"},{"index":3,"instruction":"Hacer clic en la pestaña ''Aprobadas''","expectedOutcome":"Se muestran solo las solicitudes aprobadas o mensaje ''No hay solicitudes aprobadas'' si está vacía"},{"index":4,"instruction":"Hacer clic en la pestaña ''Rechazadas''","expectedOutcome":"Se muestran solo las solicitudes rechazadas o mensaje ''No hay solicitudes rechazadas'' si está vacía"},{"index":5,"instruction":"Hacer clic en la pestaña ''Todas''","expectedOutcome":"Se muestran todas las solicitudes o mensaje ''No hay solicitudes de cambio'' si está vacía"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-A-25: Notification sent to consultor after approval
(
  'admin',
  'CS-A-25: Notificación enviada al consultor tras aprobación',
  'Verificar que el consultor recibe una notificación cuando su solicitud de edición es aprobada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una solicitud de edición pendiente"}]'::jsonb,
  '[{"index":1,"instruction":"Aprobar una solicitud de edición desde la página de Aprobaciones","expectedOutcome":"La solicitud se aprueba exitosamente"},{"index":2,"instruction":"Cerrar sesión e iniciar sesión como el consultor que hizo la solicitud","expectedOutcome":"Se accede al dashboard del consultor"},{"index":3,"instruction":"Revisar la campana de notificaciones","expectedOutcome":"Aparece una notificación informando que la solicitud de edición fue aprobada"}]'::jsonb,
  2, 5, true, false, true
),

-- CS-A-26: Notification sent to consultor after rejection
(
  'admin',
  'CS-A-26: Notificación enviada al consultor tras rechazo',
  'Verificar que el consultor recibe una notificación cuando su solicitud de edición es rechazada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una solicitud de edición pendiente"}]'::jsonb,
  '[{"index":1,"instruction":"Rechazar una solicitud de edición desde la página de Aprobaciones","expectedOutcome":"La solicitud se rechaza exitosamente"},{"index":2,"instruction":"Cerrar sesión e iniciar sesión como el consultor que hizo la solicitud","expectedOutcome":"Se accede al dashboard del consultor"},{"index":3,"instruction":"Revisar la campana de notificaciones","expectedOutcome":"Aparece una notificación informando que la solicitud de edición fue rechazada"}]'::jsonb,
  2, 5, true, false, true
),

-- ============================================================================
-- ANALYTICS & REPORTS — 4 SCENARIOS (CS-A-27 to CS-A-30)
-- ============================================================================

-- CS-A-27: Admin views analytics page with all data
(
  'admin',
  'CS-A-27: Admin ve la página de analíticas con datos globales',
  'Verificar que el administrador ve analíticas de TODAS las sesiones del sistema.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones completadas con datos de asistencia"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la sección de reportes/analíticas de sesiones (Consultorías > Reportes o Analíticas)","expectedOutcome":"Se muestra la página de analíticas titulada ''Reportes de Sesiones'' con subtítulo ''Estadísticas y métricas de todas las sesiones de consultoría''"},{"index":2,"instruction":"Verificar las 7 tarjetas KPI: Total Sesiones, Tasa de Completación, Horas Programadas, Asistencia Promedio, Pendientes de Informe, Próximas Sesiones, Sesiones Canceladas","expectedOutcome":"Se muestran los 7 KPIs con sus valores actualizados"},{"index":3,"instruction":"Verificar que se cargan los 6 gráficos: Sesiones por Mes, Distribución por Estado, Distribución por Modalidad, Tendencia de Asistencia, Sesiones por Escuela, Top Consultores","expectedOutcome":"Se muestran todos los gráficos con datos visuales correctos"},{"index":4,"instruction":"Verificar que se muestran los filtros: Desde (date), Hasta (date), Escuela (select), Consultor (select)","expectedOutcome":"Los filtros están disponibles y funcionales"},{"index":5,"instruction":"Verificar que los datos son globales (todas las escuelas y consultores)","expectedOutcome":"Los datos no están filtrados por una escuela o consultor específico"}]'::jsonb,
  3, 5, true, false, false
),

-- CS-A-28: Admin KPI grid responsive layout
(
  'admin',
  'CS-A-28: Grilla de KPIs con diseño responsivo',
  'Verificar que las tarjetas KPI se adaptan correctamente a diferentes tamaños de pantalla.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe haber datos de sesiones para generar métricas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la página de analíticas de sesiones en pantalla de escritorio","expectedOutcome":"Las tarjetas KPI se muestran en 4 columnas"},{"index":2,"instruction":"Reducir el ancho de la ventana del navegador a tamaño tablet","expectedOutcome":"Las tarjetas KPI se reorganizan a 3 columnas"},{"index":3,"instruction":"Reducir el ancho a tamaño móvil","expectedOutcome":"Las tarjetas KPI se muestran en 2 columnas"}]'::jsonb,
  4, 4, true, false, false
),

-- CS-A-29: Admin exports CSV from analytics
(
  'admin',
  'CS-A-29: Admin exporta datos de sesiones recientes como CSV',
  'Verificar que se puede descargar un archivo CSV con los datos de sesiones recientes.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones con datos"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la página de analíticas de sesiones y desplazarse hasta la sección de tabla de ''Sesiones Recientes''","expectedOutcome":"Se muestra la tabla con sesiones recientes"},{"index":2,"instruction":"Buscar y hacer clic en el botón ''Exportar CSV'' o ícono de descarga en la tabla","expectedOutcome":"Se descarga un archivo CSV con los datos"},{"index":3,"instruction":"Abrir el archivo CSV descargado","expectedOutcome":"El archivo contiene datos de sesiones con columnas de Fecha, Título, Escuela, Comunidad, Estado, Asistencia"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-30: Admin views recent sessions table in analytics
(
  'admin',
  'CS-A-30: Admin ve tabla de sesiones recientes en analíticas',
  'Verificar que la tabla de sesiones recientes se muestra con scroll horizontal en pantallas pequeñas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir sesiones recientes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la página de analíticas y desplazarse hasta la tabla de sesiones recientes","expectedOutcome":"Se muestra una tabla con las sesiones más recientes"},{"index":2,"instruction":"En pantalla móvil, verificar que la tabla permite scroll horizontal","expectedOutcome":"La tabla se puede desplazar horizontalmente sin romper el diseño de la página"}]'::jsonb,
  4, 3, true, false, false
),

-- ============================================================================
-- iCAL EXPORT — 3 SCENARIOS (CS-A-31 to CS-A-33)
-- ============================================================================

-- CS-A-31: Admin exports single session to iCal
(
  'admin',
  'CS-A-31: Admin exporta sesión individual a calendario',
  'Verificar que se puede descargar un archivo .ics para una sesión individual.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una sesión programada"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión programada","expectedOutcome":"Se muestra la página de detalle de la sesión"},{"index":2,"instruction":"Hacer clic en el botón ''Agregar al Calendario'' o ícono de calendario","expectedOutcome":"Se descarga un archivo .ics"},{"index":3,"instruction":"Abrir el archivo .ics descargado","expectedOutcome":"El evento del calendario muestra el título, fecha, hora (zona horaria Chile), ubicación y facilitadores correctos"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-32: Admin exports batch of sessions to iCal
(
  'admin',
  'CS-A-32: Admin exporta lote de sesiones a calendario',
  'Verificar que se pueden exportar múltiples sesiones filtradas a un archivo .ics.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Deben existir múltiples sesiones"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la lista de sesiones y aplicar filtros si se desea","expectedOutcome":"Se muestra la lista de sesiones filtrada"},{"index":2,"instruction":"Buscar y hacer clic en el enlace ''Exportar Calendario''","expectedOutcome":"Se descarga un archivo .ics con todas las sesiones filtradas"},{"index":3,"instruction":"Verificar que el archivo contiene múltiples eventos","expectedOutcome":"El archivo .ics incluye un evento por cada sesión exportada"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-A-33: Admin exports entire series to iCal
(
  'admin',
  'CS-A-33: Admin exporta serie completa a calendario',
  'Verificar que se puede exportar una serie recurrente completa a un archivo .ics.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Debe existir una serie de sesiones recurrentes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión que pertenece a una serie","expectedOutcome":"Se muestra el detalle con el panel de serie"},{"index":2,"instruction":"Hacer clic en el botón ''Exportar Serie'' en el panel de serie","expectedOutcome":"Se descarga un archivo .ics con todas las sesiones de la serie"},{"index":3,"instruction":"Verificar que el archivo contiene un evento por cada sesión de la serie","expectedOutcome":"El archivo .ics contiene todos los eventos de la serie con sus fechas correspondientes"}]'::jsonb,
  3, 4, true, false, false
),

-- ============================================================================
-- MOBILE RESPONSIVENESS — 3 SCENARIOS (CS-A-34 to CS-A-36)
-- ============================================================================

-- CS-A-34: Admin calendar view on mobile
(
  'admin',
  'CS-A-34: Vista de calendario en móvil',
  'Verificar que la vista de calendario se adapta a formato de agenda/tarjetas en pantalla móvil.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin en dispositivo móvil o ventana reducida"},{"type":"data","description":"Deben existir sesiones en el mes actual"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones en un dispositivo móvil","expectedOutcome":"La página carga correctamente sin desbordamiento horizontal"},{"index":2,"instruction":"Seleccionar vista de calendario/mes","expectedOutcome":"En móvil se muestra un formato de agenda o tarjetas en lugar de la grilla de 7 columnas"},{"index":3,"instruction":"Verificar que las tarjetas de sesión tienen áreas de toque de al menos 44px","expectedOutcome":"Las sesiones son fáciles de tocar/hacer clic sin errores de precisión"}]'::jsonb,
  4, 4, true, false, false
),

-- CS-A-35: Admin action buttons layout on mobile
(
  'admin',
  'CS-A-35: Botones de acción en móvil se apilan verticalmente',
  'Verificar que los botones de acción se muestran en columna en pantallas pequeñas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin en dispositivo móvil"},{"type":"data","description":"Debe existir una sesión programada"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión en dispositivo móvil","expectedOutcome":"La página carga correctamente"},{"index":2,"instruction":"Verificar que los botones de acción (Aprobar, Cancelar, Iniciar Sesión) se muestran apilados verticalmente","expectedOutcome":"Los botones están en formato de columna (flex-col) y no se desbordan horizontalmente"},{"index":3,"instruction":"Verificar que cada botón tiene un tamaño de toque adecuado","expectedOutcome":"Los botones son fáciles de presionar en pantalla táctil"}]'::jsonb,
  4, 3, true, false, false
),

-- CS-A-36: Admin reports charts on mobile
(
  'admin',
  'CS-A-36: Gráficos de analíticas responsivos en móvil',
  'Verificar que los gráficos de la página de analíticas se adaptan a pantallas móviles.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin en dispositivo móvil"},{"type":"data","description":"Deben existir datos de sesiones para generar gráficos"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la página de analíticas en dispositivo móvil","expectedOutcome":"La página carga sin desbordamiento"},{"index":2,"instruction":"Verificar que los gráficos se muestran en una sola columna","expectedOutcome":"Los gráficos están apilados verticalmente (1 columna) en móvil"},{"index":3,"instruction":"Verificar que las etiquetas del eje X están rotadas para mejor legibilidad","expectedOutcome":"Las etiquetas están inclinadas o ajustadas para no solaparse"}]'::jsonb,
  4, 3, true, false, false
),

-- ============================================================================
-- EDGE CASES — 2 SCENARIOS (CS-A-37 to CS-A-38)
-- ============================================================================

-- CS-A-37: Empty states display correctly
(
  'admin',
  'CS-A-37: Estados vacíos se muestran correctamente',
  'Verificar que se muestra un mensaje apropiado cuando no hay sesiones, materiales o reportes.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Usar filtros que no retornen resultados o un entorno sin sesiones"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Consultorías > Sesiones y aplicar un filtro que no tenga resultados","expectedOutcome":"Se muestra un mensaje indicando que no hay sesiones que coincidan con los filtros"},{"index":2,"instruction":"Navegar a Aprobaciones cuando no hay solicitudes pendientes","expectedOutcome":"Se muestra un mensaje indicando que no hay solicitudes pendientes de revisión"}]'::jsonb,
  4, 3, true, false, false
),

-- CS-A-38: Long content in session title and description
(
  'admin',
  'CS-A-38: Contenido largo en título y descripción de sesión',
  'Verificar que títulos y descripciones muy largos no rompen el diseño.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Crear una nueva sesión con un título muy largo (más de 100 caracteres)","expectedOutcome":"El formulario acepta el texto largo"},{"index":2,"instruction":"Agregar una descripción muy extensa (más de 500 caracteres)","expectedOutcome":"El campo de descripción acepta el texto"},{"index":3,"instruction":"Guardar la sesión y verificar la lista","expectedOutcome":"El título largo se muestra truncado o ajustado en la lista sin romper el diseño"},{"index":4,"instruction":"Abrir el detalle de la sesión","expectedOutcome":"El título y descripción completos se muestran correctamente sin desbordamiento"}]'::jsonb,
  4, 5, true, false, false
);

COMMIT;
