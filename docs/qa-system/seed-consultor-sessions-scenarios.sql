-- ============================================================================
-- QA Scenarios Seed Script: CONSULTOR Role — Consultor Sessions
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: consultor
-- Total Scenarios: 37
-- Date Created: 2026-02-16
-- Feature Area: consultor_sessions
--
-- CATEGORIES:
--   - Session List & Navigation (CS-C-01 to CS-C-05)
--   - Session Detail & Editing (CS-C-06 to CS-C-10)
--   - Edit Requests (CS-C-11 to CS-C-14)
--   - Attendance (CS-C-15 to CS-C-19)
--   - Materials (CS-C-20 to CS-C-23)
--   - Reports & Audio (CS-C-24 to CS-C-29)
--   - Finalization (CS-C-30 to CS-C-31)
--   - Analytics & iCal (CS-C-32 to CS-C-35)
--   - Additional Coverage (CS-C-36 to CS-C-37)
--
-- PRIORITIES:
--   1 = Critical (security, permissions)
--   2 = High (core workflows)
--   3 = Medium (UI, analytics)
--   4 = Low (edge cases, mobile)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SESSION LIST & NAVIGATION — 5 SCENARIOS (CS-C-01 to CS-C-05)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CS-C-01: Consultor views session list with tabs
(
  'consultor',
  'CS-C-01: Consultor ve lista de sesiones con pestañas',
  'Verificar que el consultor ve sus sesiones organizadas en pestañas ''Mis Sesiones'' y ''Otras Sesiones''.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe estar asignado como facilitador en al menos una sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Sesiones en el sidebar","expectedOutcome":"Se muestra la página de sesiones del consultor con el encabezado correspondiente"},{"index":2,"instruction":"Verificar la pestaña ''Mis Sesiones'' (sesiones donde el consultor es facilitador)","expectedOutcome":"Se muestran solo las sesiones donde el consultor está asignado como facilitador"},{"index":3,"instruction":"Verificar la pestaña ''Otras Sesiones'' (sesiones de su escuela donde no es facilitador)","expectedOutcome":"Se muestran sesiones de los colegios asignados al consultor donde no participa como facilitador"},{"index":4,"instruction":"Verificar que cada sesión muestra título, fecha, hora, escuela y badge de estado","expectedOutcome":"La información de cada sesión es visible y correcta"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-C-02: Consultor filters sessions
(
  'consultor',
  'CS-C-02: Consultor filtra sesiones por estado y escuela',
  'Verificar que los filtros funcionan correctamente en la lista de sesiones del consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Deben existir sesiones en diferentes estados y escuelas asignadas al consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Sesiones","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Usar el filtro de estado y seleccionar ''Programada''","expectedOutcome":"Solo se muestran sesiones con estado ''Programada'' (badge azul)"},{"index":3,"instruction":"Usar el filtro de escuela y seleccionar un colegio específico","expectedOutcome":"La lista se filtra adicionalmente por el colegio seleccionado"},{"index":4,"instruction":"Limpiar todos los filtros","expectedOutcome":"La lista vuelve a mostrar todas las sesiones del consultor"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-C-03: Consultor sidebar navigation items
(
  'consultor',
  'CS-C-03: Consultor verifica ítems de navegación en sidebar',
  'Verificar que el sidebar muestra las opciones correctas para el consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral del sistema","expectedOutcome":"Se ve ''Mis Sesiones'' como ítem de nivel superior"},{"index":2,"instruction":"Verificar que ''Mis Sesiones'' es clickeable y lleva a /consultor/sessions","expectedOutcome":"El ítem ''Mis Sesiones'' es visible y funcional"},{"index":3,"instruction":"Verificar que existe ''Mis Reportes'' como ítem de nivel superior","expectedOutcome":"El ítem ''Mis Reportes'' es visible y clickeable"},{"index":4,"instruction":"Verificar que NO aparecen ítems de admin como ''Aprobaciones'', ''Sesiones'' o ''Asignación de Consultores''","expectedOutcome":"No se ve ningún ítem de administración de sesiones"},{"index":5,"instruction":"Verificar que el grupo Consultorías aparece en la barra lateral con sub-ítems visibles","expectedOutcome":"Se muestra Consultorías como grupo expandible que contiene Vista de Tareas como sub-ítem visible"}]'::jsonb,
  2, 2, true, false, false
),

-- CS-C-04: Consultor only sees own school sessions
(
  'consultor',
  'CS-C-04: Consultor solo ve sesiones de sus colegios asignados',
  'Verificar que el consultor no puede ver sesiones de colegios a los que no está asignado.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Deben existir sesiones en colegios donde el consultor NO está asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Sesiones","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Revisar todas las sesiones visibles y verificar los nombres de los colegios","expectedOutcome":"Todas las sesiones pertenecen a colegios donde el consultor está asignado"},{"index":3,"instruction":"Verificar que no aparecen sesiones de otros colegios","expectedOutcome":"No hay sesiones de colegios no asignados al consultor"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-C-05: Consultor cannot access admin session pages
(
  'consultor',
  'CS-C-05: Consultor no puede acceder a páginas de admin de sesiones',
  'Verificar que el consultor no puede navegar a las páginas de administración de sesiones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/create y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Escribir en la barra de direcciones del navegador: /admin/sessions/approvals y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- SESSION DETAIL & EDITING — 5 SCENARIOS (CS-C-06 to CS-C-10)
-- ============================================================================

-- CS-C-06: Consultor views session detail with tabs
(
  'consultor',
  'CS-C-06: Consultor ve detalle de sesión con pestañas',
  'Verificar que el detalle de sesión muestra las pestañas correctas: Detalles, Planificación (solo si es facilitador), Materiales, Informe, Comunicaciones, Actividad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe ser facilitador de la sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Sesiones y hacer clic en una sesión","expectedOutcome":"Se abre la página de detalle de la sesión"},{"index":2,"instruction":"Verificar que se muestran las pestañas: Detalles, Planificación, Materiales, Informe, Comunicaciones, Actividad","expectedOutcome":"Todas las pestañas están visibles en la barra de pestañas"},{"index":3,"instruction":"Verificar que la pestaña ''Planificación'' solo aparece si el usuario es facilitador","expectedOutcome":"La pestaña Planificación es visible para facilitadores"},{"index":4,"instruction":"Hacer clic en cada pestaña para verificar que carga contenido","expectedOutcome":"Cada pestaña muestra su contenido correspondiente sin errores"},{"index":5,"instruction":"Verificar que la hora muestra ''(hora Chile)''","expectedOutcome":"Las horas incluyen el indicador de zona horaria ''(hora Chile)''"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-C-07: Consultor views dual timezone display
(
  'consultor',
  'CS-C-07: Consultor ve doble zona horaria (Chile y España)',
  'Verificar que los consultores de Barcelona ven tanto la hora de Chile como la hora de España.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor basado en Barcelona"},{"type":"data","description":"Debe existir una sesión asignada al consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión asignada","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Verificar que se muestra la hora en zona chilena ''(hora Chile)''","expectedOutcome":"Se ve la hora con sufijo ''(hora Chile)''"},{"index":3,"instruction":"Verificar que también se muestra la hora en zona española ''(hora España)''","expectedOutcome":"Se muestra una segunda línea o indicador con la hora en zona de España/Barcelona"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-08: Consultor edits non-structural fields
(
  'consultor',
  'CS-C-08: Consultor edita campos no estructurales de una sesión',
  'Verificar que un consultor facilitador puede editar campos como descripción y objetivos directamente.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe ser facilitador de una sesión en estado ''programada'' o ''en_progreso''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión donde el consultor es facilitador","expectedOutcome":"Se muestra la página de detalle con opción de edición"},{"index":2,"instruction":"Hacer clic en editar y modificar la descripción de la sesión","expectedOutcome":"El campo de descripción es editable y acepta cambios"},{"index":3,"instruction":"Modificar los objetivos de la sesión","expectedOutcome":"El campo de objetivos acepta los cambios"},{"index":4,"instruction":"Guardar los cambios","expectedOutcome":"Aparece un mensaje de éxito y los cambios se reflejan en la sesión"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-C-09: Consultor cannot edit structural fields directly
(
  'consultor',
  'CS-C-09: Consultor no puede editar campos estructurales directamente',
  'Verificar que los campos como fecha, hora, modalidad y colegio no son editables directamente por el consultor.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe ser facilitador de una sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión donde el consultor es facilitador","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Verificar que los campos de fecha, hora de inicio/fin, modalidad y colegio NO son editables","expectedOutcome":"Estos campos aparecen como solo lectura o no tienen botón de edición"},{"index":3,"instruction":"Verificar que existe un botón o enlace para ''Solicitar Cambios'' para estos campos","expectedOutcome":"Se muestra una opción para enviar una solicitud de edición al administrador"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-C-10: Non-facilitator consultor sees read-only detail
(
  'consultor',
  'CS-C-10: Consultor no facilitador ve sesión en solo lectura',
  'Verificar que un consultor que no es facilitador solo puede ver la información sin editarla.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Debe existir una sesión del colegio del consultor donde NO es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a ''Otras Sesiones'' y hacer clic en una sesión donde el consultor no es facilitador","expectedOutcome":"Se abre el detalle de la sesión"},{"index":2,"instruction":"Verificar que no hay botones de edición","expectedOutcome":"No se muestran botones de editar, guardar o modificar"},{"index":3,"instruction":"Verificar que las pestañas de asistencia y materiales son solo lectura","expectedOutcome":"No hay opciones para marcar asistencia ni subir materiales"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- EDIT REQUESTS — 4 SCENARIOS (CS-C-11 to CS-C-14)
-- ============================================================================

-- CS-C-11: Consultor submits edit request
(
  'consultor',
  'CS-C-11: Consultor envía solicitud de edición para campos estructurales',
  'Verificar que el consultor puede solicitar cambios en fecha, hora, modalidad u otros campos estructurales.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe ser facilitador de una sesión en estado ''programada''"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión donde es facilitador","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Hacer clic en el botón ''Solicitar Cambios''","expectedOutcome":"Se abre un modal titulado ''Solicitar Cambios a la Sesión''"},{"index":3,"instruction":"En el modal, verificar que aparecen cuatro campos editables: Fecha de la sesión, Hora de inicio, Hora de término, Modalidad (Presencial/En línea/Híbrida)","expectedOutcome":"Los campos están disponibles para edición"},{"index":4,"instruction":"Modificar al menos uno de los campos (ej. cambiar la fecha)","expectedOutcome":"El campo acepta el nuevo valor"},{"index":5,"instruction":"Completar el campo ''Razón del cambio (opcional)'' con una justificación","expectedOutcome":"Se muestra una sección ''Cambios propuestos:'' con los valores antiguos (rojo tachado) y nuevos (verde)"},{"index":6,"instruction":"Hacer clic en ''Enviar Solicitud''","expectedOutcome":"Aparece un mensaje de éxito indicando que la solicitud fue enviada al administrador para su revisión"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-C-12: Edit request validation - no required fields
(
  'consultor',
  'CS-C-12: Botón enviar deshabilitado hasta cambiar al menos un campo',
  'Verificar que el botón de enviar solicitud está deshabilitado cuando no hay cambios, y se habilita cuando se modifica algún campo.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor es facilitador de una sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Abrir el modal de solicitud de edición en el detalle de una sesión","expectedOutcome":"Se muestra el modal con campos de edición"},{"index":2,"instruction":"Verificar el estado del botón ''Enviar Solicitud'' sin hacer cambios","expectedOutcome":"El botón está deshabilitado (grisado) cuando ningún campo ha cambiado"},{"index":3,"instruction":"Modificar un campo (ej. cambiar la fecha a una diferente)","expectedOutcome":"El botón ''Enviar Solicitud'' se habilita inmediatamente"},{"index":4,"instruction":"Restaurar el campo al valor original","expectedOutcome":"El botón vuelve a deshabilitarse cuando todos los campos vuelven a sus valores originales"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-13: Consultor sees status of submitted edit requests
(
  'consultor',
  'CS-C-13: Consultor ve el estado de sus solicitudes de edición',
  'Verificar que el consultor puede ver si sus solicitudes están pendientes, aprobadas o rechazadas.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe haber enviado solicitudes de edición en diferentes estados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de la sesión para la cual envió una solicitud","expectedOutcome":"Se muestra información sobre solicitudes de edición enviadas"},{"index":2,"instruction":"Verificar que se muestra el estado de la solicitud (pendiente, aprobada o rechazada)","expectedOutcome":"El estado de la solicitud es visible con un indicador claro"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-14: Consultor receives notification when request is resolved
(
  'consultor',
  'CS-C-14: Consultor recibe notificación cuando la solicitud se resuelve',
  'Verificar que el consultor recibe notificación de aprobación o rechazo de su solicitud.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Un admin debe haber resuelto (aprobado o rechazado) una solicitud del consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor que tiene una solicitud recientemente resuelta","expectedOutcome":"Se accede al dashboard del consultor"},{"index":2,"instruction":"Hacer clic en la campana de notificaciones","expectedOutcome":"Aparece una notificación sobre la resolución de la solicitud de edición"},{"index":3,"instruction":"Verificar que la notificación indica si fue aprobada o rechazada","expectedOutcome":"La notificación muestra claramente el resultado de la solicitud"}]'::jsonb,
  2, 3, true, false, false
),

-- ============================================================================
-- ATTENDANCE — 5 SCENARIOS (CS-C-15 to CS-C-19)
-- ============================================================================

-- CS-C-15: Consultor views attendance list
(
  'consultor',
  'CS-C-15: Consultor ve la lista de asistencia',
  'Verificar que la asistencia se muestra en la pestaña Detalles con columnas de nombre, estado y hora.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor es facilitador de una sesión en estado ''en_progreso'' con participantes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión en progreso donde es facilitador","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Hacer clic en la pestaña ''Detalles''","expectedOutcome":"Se muestra la sección de asistencia con columnas de Nombre, Esperado, Asistió, Estado de llegada, Notas"},{"index":3,"instruction":"Verificar que cada participante tiene opciones de marcar presente, ausente o tarde","expectedOutcome":"Los controles de asistencia están visibles para cada participante"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-C-16: Consultor marks attendance
(
  'consultor',
  'CS-C-16: Consultor marca asistencia de participantes',
  'Verificar que el consultor puede marcar presente, ausente o tarde a cada participante.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión en estado ''en_progreso'' con participantes sin marcar"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña de ''Detalles'' de una sesión en progreso","expectedOutcome":"Se muestra la lista de participantes con controles de asistencia"},{"index":2,"instruction":"Marcar un participante como ''Presente''","expectedOutcome":"El estado del participante cambia a presente con indicador visual"},{"index":3,"instruction":"Marcar otro participante como ''Ausente''","expectedOutcome":"El estado cambia a ausente"},{"index":4,"instruction":"Marcar otro participante como ''Tarde''","expectedOutcome":"El estado cambia a tarde"},{"index":5,"instruction":"Agregar una nota a un participante","expectedOutcome":"La nota se guarda y es visible junto al registro del participante"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-C-17: Attendance on mobile shows card layout
(
  'consultor',
  'CS-C-17: Asistencia en móvil muestra diseño de tarjetas',
  'Verificar que la lista de asistencia usa tarjetas en lugar de tabla en dispositivos móviles.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor en dispositivo móvil"},{"type":"data","description":"Sesión en progreso con participantes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Detalles'' de la sesión en un dispositivo móvil","expectedOutcome":"La asistencia se muestra como tarjetas individuales por participante en lugar de tabla"},{"index":2,"instruction":"Verificar que los botones de estado tienen áreas de toque de al menos 44px","expectedOutcome":"Los botones son suficientemente grandes para interacción táctil"},{"index":3,"instruction":"Marcar asistencia en una tarjeta","expectedOutcome":"El cambio se registra correctamente desde la vista de tarjeta"}]'::jsonb,
  4, 4, true, false, false
),

-- CS-C-18: Attendance locked after session completed
(
  'consultor',
  'CS-C-18: Asistencia bloqueada tras completar sesión',
  'Verificar que no se puede modificar la asistencia una vez que la sesión está completada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Debe existir una sesión completada donde el consultor fue facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión completada","expectedOutcome":"Se muestra la sesión con badge verde ''Completada''"},{"index":2,"instruction":"Ver la sección de asistencia en la pestaña ''Detalles''","expectedOutcome":"Se muestra la lista de asistencia en modo solo lectura"},{"index":3,"instruction":"Verificar que los controles de marcar asistencia no están activos","expectedOutcome":"No hay botones para cambiar estados de asistencia, solo visualización de datos registrados"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-C-19: Non-facilitator sees read-only attendance
(
  'consultor',
  'CS-C-19: Consultor no facilitador ve asistencia en solo lectura',
  'Verificar que un consultor que no es facilitador no puede editar la asistencia.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión del colegio del consultor donde NO es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión donde el consultor no es facilitador","expectedOutcome":"Se muestra la página de detalle en modo lectura"},{"index":2,"instruction":"Ver la asistencia en la pestaña ''Detalles''","expectedOutcome":"La asistencia se muestra en modo solo lectura sin controles de edición"}]'::jsonb,
  1, 2, true, false, false
),

-- ============================================================================
-- MATERIALS — 4 SCENARIOS (CS-C-20 to CS-C-23)
-- ============================================================================

-- CS-C-20: Consultor uploads material
(
  'consultor',
  'CS-C-20: Consultor sube material a una sesión',
  'Verificar que un consultor facilitador puede subir archivos como materiales de sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión en estado ''en_progreso'' donde el consultor es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión en progreso y hacer clic en la pestaña ''Materiales''","expectedOutcome":"Se muestra la sección de materiales"},{"index":2,"instruction":"Hacer clic en el botón ''Subir material''","expectedOutcome":"Se abre el selector de archivo o área de drag-and-drop"},{"index":3,"instruction":"Seleccionar y subir un archivo (máx. 25 MB)","expectedOutcome":"El archivo se carga y aparece el mensaje ''Material subido correctamente''"},{"index":4,"instruction":"Verificar que el material aparece en la lista con columnas Archivo, Tipo, Tamaño, Subido por, Fecha, Acciones","expectedOutcome":"El material es visible con toda su información"}]'::jsonb,
  2, 5, true, false, false
),

-- CS-C-21: Consultor downloads material
(
  'consultor',
  'CS-C-21: Consultor descarga un material',
  'Verificar que se puede descargar un material previamente subido.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión con al menos un material subido"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Materiales'' de una sesión","expectedOutcome":"Se muestra la lista de materiales"},{"index":2,"instruction":"Hacer clic en el botón de descarga o en el nombre del archivo","expectedOutcome":"Se descarga el archivo al dispositivo"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-22: Consultor deletes own material
(
  'consultor',
  'CS-C-22: Consultor elimina material que subió',
  'Verificar que el consultor puede eliminar solo los materiales que él mismo subió.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión con materiales subidos por el consultor actual"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Materiales'' de una sesión","expectedOutcome":"Se muestran los materiales"},{"index":2,"instruction":"Hacer clic en el botón de eliminar del material que el consultor subió","expectedOutcome":"Se muestra un diálogo de confirmación: ''¿Está seguro que desea eliminar ''{filename}''?''"},{"index":3,"instruction":"Confirmar la eliminación","expectedOutcome":"Aparece el mensaje ''Material eliminado correctamente'' y el archivo desaparece de la lista"},{"index":4,"instruction":"Verificar que materiales subidos por otros usuarios no tienen botón de eliminar","expectedOutcome":"Solo los materiales propios muestran la opción de eliminar"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-C-23: Material upload locked after completion
(
  'consultor',
  'CS-C-23: Subida de materiales bloqueada tras completar sesión',
  'Verificar que no se pueden subir materiales cuando la sesión está completada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión completada con materiales existentes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Materiales'' de una sesión completada","expectedOutcome":"Se muestran los materiales existentes"},{"index":2,"instruction":"Verificar que el área de subida de archivos no está disponible","expectedOutcome":"No hay opción para subir nuevos archivos, solo para ver y descargar los existentes"}]'::jsonb,
  1, 2, true, false, false
),

-- ============================================================================
-- REPORTS & AUDIO — 6 SCENARIOS (CS-C-24 to CS-C-29)
-- ============================================================================

-- CS-C-24: Consultor writes text report
(
  'consultor',
  'CS-C-24: Consultor escribe informe de texto',
  'Verificar que un consultor facilitador puede crear un informe escrito con contenido y visibilidad.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión en estado ''en_progreso'' o ''pendiente_informe'' donde el consultor es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de la sesión y hacer clic en la pestaña ''Informe''","expectedOutcome":"Se muestra la sección de informe"},{"index":2,"instruction":"Si no existe informe, verificar que aparece el botón ''Crear Informe''","expectedOutcome":"Se ve el botón ''Crear Informe''"},{"index":3,"instruction":"Hacer clic en ''Crear Informe''","expectedOutcome":"Se abre el formulario con campos de texto para el contenido"},{"index":4,"instruction":"Escribir contenido en el campo ''Contenido del informe'' (placeholder: ''Escriba el informe de la sesión...'')","expectedOutcome":"El texto se acepta correctamente"},{"index":5,"instruction":"Seleccionar la visibilidad: ''Solo facilitadores'' o ''Todos los participantes''","expectedOutcome":"La opción de visibilidad se selecciona"},{"index":6,"instruction":"Hacer clic en ''Crear''","expectedOutcome":"Aparece un mensaje de éxito y el informe aparece en la sección"}]'::jsonb,
  2, 6, true, false, false
),

-- CS-C-25: Consultor edits own report
(
  'consultor',
  'CS-C-25: Consultor edita su propio informe',
  'Verificar que el autor de un informe puede modificarlo.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe ser autor de un informe existente"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Informe'' de la sesión","expectedOutcome":"Se muestra el informe existente"},{"index":2,"instruction":"Hacer clic en el botón ''Editar Informe''","expectedOutcome":"El informe se abre en modo edición"},{"index":3,"instruction":"Modificar el contenido del informe","expectedOutcome":"Los cambios se aceptan en el campo de texto"},{"index":4,"instruction":"Hacer clic en ''Actualizar''","expectedOutcome":"Aparece un mensaje de éxito y el informe muestra el contenido actualizado"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-C-26: Consultor uploads audio report
(
  'consultor',
  'CS-C-26: Consultor sube informe de audio',
  'Verificar que el consultor puede subir un archivo de audio como informe, con transcripción automática.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión en estado adecuado donde el consultor es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Informe'' de una sesión","expectedOutcome":"Se muestra la sección de informe"},{"index":2,"instruction":"Buscar la sección ''Informe por Audio''","expectedOutcome":"Se muestra el área de subida de audio con texto ''Arrastra un archivo de audio aquí o haz clic para seleccionar''"},{"index":3,"instruction":"Hacer clic en ''Seleccionar Archivo'' o usar drag-and-drop (formatos MP3, WAV, M4A, OGG, WEBM, AAC, máx. 25 MB)","expectedOutcome":"Se selecciona un archivo de audio"},{"index":4,"instruction":"Esperar a que se complete la transcripción","expectedOutcome":"Se muestra el mensaje ''Procesando audio (transcripción y resumen con IA)...'' seguido de ''Esto puede tomar hasta 1 minuto''"},{"index":5,"instruction":"Verificar que aparece el mensaje ''Informe creado exitosamente''","expectedOutcome":"Se muestra la transcripción y resumen generados automáticamente"}]'::jsonb,
  2, 8, true, false, false
),

-- CS-C-27: Audio report playback
(
  'consultor',
  'CS-C-27: Reproducción de informe de audio',
  'Verificar que el reproductor de audio funciona con controles de play/pause y toggle de transcripción.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Debe existir un informe de audio en la sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Informe'' donde existe un informe de audio","expectedOutcome":"Se muestra el reproductor de audio"},{"index":2,"instruction":"Hacer clic en el botón de reproducir (play)","expectedOutcome":"El audio comienza a reproducirse y el botón cambia a pausa"},{"index":3,"instruction":"Hacer clic en pausa","expectedOutcome":"El audio se pausa"},{"index":4,"instruction":"Hacer clic en el botón ''Transcripción'' (con icono ChevronUp/Down)","expectedOutcome":"Se muestra u oculta la transcripción del audio"}]'::jsonb,
  3, 4, true, false, false
),

-- CS-C-28: Report visibility controls
(
  'consultor',
  'CS-C-28: Control de visibilidad de informes funciona correctamente',
  'Verificar que los informes solo son visibles según la configuración de visibilidad seleccionada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Deben existir informes con diferentes niveles de visibilidad en una sesión"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Informe'' de una sesión","expectedOutcome":"Se muestran los informes según la visibilidad configurada"},{"index":2,"instruction":"Verificar que un informe marcado como ''Solo facilitadores'' es visible para el consultor facilitador","expectedOutcome":"El informe es visible porque el consultor es facilitador"},{"index":3,"instruction":"Verificar la etiqueta de visibilidad en cada informe","expectedOutcome":"Cada informe muestra un indicador de su nivel de visibilidad: ''Solo facilitadores'' o ''Todos los participantes''"}]'::jsonb,
  2, 4, true, false, false
),

-- CS-C-29: Reports locked after completion
(
  'consultor',
  'CS-C-29: Escritura de informes bloqueada tras completar sesión',
  'Verificar que no se pueden crear ni editar informes cuando la sesión está completada.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión completada con informes existentes"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Informe'' de una sesión completada","expectedOutcome":"Se muestran los informes existentes en modo lectura"},{"index":2,"instruction":"Verificar que no hay botón de ''Crear Informe''","expectedOutcome":"La opción de crear informe no está disponible"},{"index":3,"instruction":"Verificar que los informes existentes no tienen botón de editar","expectedOutcome":"Los informes están en modo solo lectura"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- FINALIZATION — 2 SCENARIOS (CS-C-30 to CS-C-31)
-- ============================================================================

-- CS-C-30: Consultor finalizes a session
(
  'consultor',
  'CS-C-30: Consultor finaliza una sesión',
  'Verificar que un consultor facilitador puede finalizar una sesión en estado pendiente_informe, bloqueando todas las operaciones de escritura.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión en estado ''pendiente_informe'' donde el consultor es facilitador, con asistencia e informe registrados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión en estado pendiente_informe donde es facilitador","expectedOutcome":"Se muestra la sesión con badge naranja ''Pendiente Informe'' y un botón ''Finalizar Sesión''"},{"index":2,"instruction":"Hacer clic en el botón ''Finalizar Sesión''","expectedOutcome":"Se muestra una confirmación preguntando si desea finalizar"},{"index":3,"instruction":"Confirmar la finalización","expectedOutcome":"Aparece un mensaje de éxito y el estado cambia a ''Completada'' (badge verde ''Completada'')"},{"index":4,"instruction":"Verificar que los botones de edición, asistencia y materiales están deshabilitados","expectedOutcome":"Todas las operaciones de escritura están bloqueadas"}]'::jsonb,
  1, 5, true, false, false
),

-- CS-C-31: Post-finalization all writes locked
(
  'consultor',
  'CS-C-31: Todas las escrituras bloqueadas tras finalización',
  'Verificar que después de finalizar no se puede editar asistencia, subir materiales ni escribir informes.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión recién finalizada/completada donde el consultor era facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pestaña ''Detalles'' de la sesión completada","expectedOutcome":"La asistencia se muestra en modo solo lectura"},{"index":2,"instruction":"Navegar a la pestaña ''Materiales''","expectedOutcome":"No hay opción de subir nuevos materiales"},{"index":3,"instruction":"Navegar a la pestaña ''Informe''","expectedOutcome":"No hay opción de crear nuevos informes ni editar los existentes"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- ANALYTICS & iCAL — 4 SCENARIOS (CS-C-32 to CS-C-35)
-- ============================================================================

-- CS-C-32: Consultor views own analytics
(
  'consultor',
  'CS-C-32: Consultor ve analíticas de sus propias sesiones',
  'Verificar que la página de Mis Reportes del consultor muestra métricas solo de sus sesiones.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor debe tener sesiones completadas con datos de asistencia"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Reportes en el sidebar","expectedOutcome":"Se muestra la página titulada ''Reportes de Sesiones'' con subtítulo ''Estadísticas y métricas de tus sesiones de consultoría''"},{"index":2,"instruction":"Verificar las tarjetas KPI","expectedOutcome":"Se muestran métricas de las sesiones propias del consultor, no datos globales"},{"index":3,"instruction":"Verificar que los gráficos muestran datos solo de sus sesiones","expectedOutcome":"Los gráficos reflejan únicamente las sesiones donde el consultor fue facilitador"},{"index":4,"instruction":"Verificar la tabla de sesiones recientes","expectedOutcome":"Solo se muestran sesiones propias del consultor"}]'::jsonb,
  3, 5, true, false, false
),

-- CS-C-33: Consultor analytics charts responsive
(
  'consultor',
  'CS-C-33: Gráficos de analíticas responsivos en móvil',
  'Verificar que los gráficos se adaptan correctamente a pantallas móviles.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor en dispositivo móvil"},{"type":"data","description":"El consultor tiene sesiones con datos"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Reportes en dispositivo móvil","expectedOutcome":"La página carga sin desbordamiento horizontal"},{"index":2,"instruction":"Verificar que los gráficos se muestran en una columna","expectedOutcome":"Los gráficos están apilados verticalmente con altura adaptada (256px en móvil)"},{"index":3,"instruction":"Verificar que las etiquetas del eje X están ajustadas","expectedOutcome":"Las etiquetas están rotadas o ajustadas para no solaparse"}]'::jsonb,
  4, 3, true, false, false
),

-- CS-C-34: Consultor exports single session to iCal
(
  'consultor',
  'CS-C-34: Consultor exporta sesión individual a calendario',
  'Verificar que el consultor puede descargar un archivo .ics para una sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Sesión programada asignada al consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión asignada","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Hacer clic en el botón ''Agregar al Calendario''","expectedOutcome":"Se descarga un archivo .ics con los datos de la sesión"},{"index":3,"instruction":"Verificar que el archivo contiene la zona horaria correcta (America/Santiago)","expectedOutcome":"El evento del calendario usa la zona horaria de Chile"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-35: Consultor exports batch of own sessions to iCal
(
  'consultor',
  'CS-C-35: Consultor exporta lote de sesiones propias a calendario',
  'Verificar que el consultor puede exportar múltiples de sus sesiones a un archivo .ics.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"El consultor tiene múltiples sesiones programadas"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la lista de Mis Sesiones","expectedOutcome":"Se muestra la lista de sesiones"},{"index":2,"instruction":"Buscar y hacer clic en el enlace ''Exportar Calendario''","expectedOutcome":"Se descarga un archivo .ics con todas las sesiones visibles"},{"index":3,"instruction":"Verificar que el archivo contiene solo las sesiones del consultor","expectedOutcome":"El archivo .ics no incluye sesiones de otros consultores"}]'::jsonb,
  3, 3, true, false, false
);

-- ============================================================================
-- ADDITIONAL COVERAGE — 2 SCENARIOS (CS-C-36 to CS-C-37)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CS-C-36: Consultor views session activity history
(
  'consultor',
  'CS-C-36: Consultor ve historial de actividad de una sesión',
  'Verificar que la pestaña Actividad muestra el registro de acciones realizadas en la sesión.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Debe existir una sesión con registros de actividad"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar al detalle de una sesión donde es facilitador","expectedOutcome":"Se muestra la página de detalle"},{"index":2,"instruction":"Hacer clic en la pestaña Actividad","expectedOutcome":"Se muestra una lista cronológica de acciones realizadas en la sesión"},{"index":3,"instruction":"Verificar que cada entrada muestra fecha/hora, tipo de acción y usuario","expectedOutcome":"Las entradas del historial incluyen información completa de cada acción"}]'::jsonb,
  3, 3, true, false, false
),

-- CS-C-37: Consultor navigates to 'Otras Sesiones' tab and verifies content
(
  'consultor',
  'CS-C-37: Consultor navega a Otras Sesiones y verifica contenido',
  'Verificar que la pestaña Otras Sesiones muestra sesiones del mismo colegio donde el consultor no es facilitador, en modo solo lectura.',
  'consultor_sessions',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"data","description":"Deben existir sesiones en el colegio del consultor donde otro consultor es facilitador"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a Mis Sesiones","expectedOutcome":"Se muestra la página con pestañas"},{"index":2,"instruction":"Hacer clic en la pestaña Otras Sesiones","expectedOutcome":"Se muestran sesiones del colegio del consultor donde no participa como facilitador"},{"index":3,"instruction":"Hacer clic en una de las sesiones listadas","expectedOutcome":"Se abre el detalle de la sesión en modo solo lectura, sin botones de edición"}]'::jsonb,
  2, 4, true, false, false
);

COMMIT;
