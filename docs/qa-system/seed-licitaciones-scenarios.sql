-- ============================================================================
-- QA Scenarios Seed Script: Licitaciones Module
-- ============================================================================
-- Feature Area: licitaciones
-- Roles: admin, encargado_licitacion
-- Total Scenarios: 8
-- Date Created: 2026-02-20
-- Phase: 2 (Creation + Publicacion)
--
-- SCENARIO GROUPS:
--   LIC-CA  : Correct Access (admin can access, encargado can access own school)
--   LIC-CE  : Encargado Access (correct scope enforcement)
--   LIC-PB  : Permission Boundaries (denied access scenarios)
--   LIC-SV  : Sidebar Visibility
-- ============================================================================

BEGIN;

-- ============================================================================
-- LIC-CA: CORRECT ACCESS (ADMIN)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- LIC-CA-1: Admin ve el listado de licitaciones
(
  'admin',
  'LIC-CA-1: Admin accede al listado de licitaciones',
  'Verificar que el administrador puede ver todas las licitaciones de todas las escuelas en el listado.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"navigation","description":"El admin debe estar autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion con la cuenta de administrador (admin.qa@fne.cl)","expectedOutcome":"El sistema muestra el panel principal del admin"},{"index":2,"instruction":"Hacer clic en el item \"Licitaciones\" en la barra lateral de navegacion","expectedOutcome":"Se abre la pagina de Licitaciones con el listado de todos los procesos"},{"index":3,"instruction":"Verificar que se muestra una tabla con columnas: Numero, Escuela, Nombre, Estado, Ano, Fecha Publicacion","expectedOutcome":"La tabla muestra licitaciones de todas las escuelas con las columnas indicadas"},{"index":4,"instruction":"Verificar que el boton \"Nueva Licitacion\" aparece en la parte superior derecha","expectedOutcome":"El boton \"Nueva Licitacion\" es visible y esta habilitado"}]'::jsonb,
  1, 3, true, false, false
),

-- LIC-CA-2: Admin crea una nueva licitacion
(
  'admin',
  'LIC-CA-2: Admin crea una nueva licitacion exitosamente',
  'Verificar el flujo completo de creacion de licitacion: formulario, validacion, y redireccion al detalle.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir al menos una escuela con cliente vinculado (con representante legal, RUT, escritura y notario completos)"},{"type":"data","description":"Debe existir al menos un programa activo en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Licitaciones y hacer clic en \"Nueva Licitacion\"","expectedOutcome":"Se abre el formulario de creacion de licitacion con 4 secciones"},{"index":2,"instruction":"En la seccion Escuela, seleccionar una escuela que tenga cliente vinculado","expectedOutcome":"Aparece un recuadro con la informacion del cliente (nombre legal, RUT, representante, comuna)"},{"index":3,"instruction":"Seleccionar el ano de licitacion y el programa FNE correspondiente","expectedOutcome":"Los campos quedan seleccionados correctamente"},{"index":4,"instruction":"Completar el nombre de la licitacion, correo de contacto, monto minimo (10 UF), monto maximo (100 UF), duracion minima (6 meses), duracion maxima (12 meses)","expectedOutcome":"Todos los campos se completan sin errores"},{"index":5,"instruction":"Ajustar el peso de evaluacion tecnica al 70% usando el deslizador","expectedOutcome":"Se muestra Tecnica: 70%, Economica: 30%"},{"index":6,"instruction":"Hacer clic en el boton \"Crear Licitacion\"","expectedOutcome":"La pagina carga el detalle de la nueva licitacion con estado \"Publicacion Pendiente\" y el numero generado (LIC-AAAA-CODIGO-001)"}]'::jsonb,
  1, 8, true, false, false
),

-- LIC-CA-3: Admin ve el detalle de una licitacion con el stepper
(
  'admin',
  'LIC-CA-3: Admin ve el detalle con el paso a paso de 7 etapas',
  'Verificar que el detalle muestra el stepper de 7 pasos y que los pasos 3-7 aparecen bloqueados.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir al menos una licitacion en estado publicacion_pendiente"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Licitaciones y hacer clic en cualquier fila de la tabla","expectedOutcome":"Se abre el detalle de la licitacion"},{"index":2,"instruction":"Verificar que aparece un indicador de progreso con 7 pasos etiquetados: Creacion, Publicacion, Bases, Propuestas, Evaluacion, Adjudicacion, Contrato","expectedOutcome":"Se muestra el stepper de 7 pasos con los nombres correctos"},{"index":3,"instruction":"Verificar que los pasos 3 al 7 muestran un icono de candado y el texto \"Disponible en una fase futura\"","expectedOutcome":"Los pasos 3-7 aparecen bloqueados con icono de candado"},{"index":4,"instruction":"Verificar que el Paso 1 (Creacion) muestra el resumen de la licitacion: numero, programa, monto, duracion","expectedOutcome":"Se muestra toda la informacion de creacion en modo lectura"}]'::jsonb,
  2, 5, true, false, false
),

-- ============================================================================
-- LIC-CE: ENCARGADO ACCESS (CORRECT SCOPE)
-- ============================================================================

-- LIC-CE-1: Encargado ve solo las licitaciones de su escuela
(
  'encargado_licitacion',
  'LIC-CE-1: Encargado ve solo licitaciones de su escuela',
  'Verificar que el encargado de licitacion solo puede ver las licitaciones de la escuela a la que pertenece.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion asignado a una escuela especifica"},{"type":"data","description":"Deben existir licitaciones de multiples escuelas en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como encargado_licitacion (encargado.lic@escuela.cl)","expectedOutcome":"El sistema muestra el panel principal del encargado"},{"index":2,"instruction":"Hacer clic en el item \"Licitaciones\" en la barra lateral","expectedOutcome":"Se abre la pagina con el titulo \"Mis Licitaciones\" (no \"Licitaciones\") y solo muestra las licitaciones de su escuela"},{"index":3,"instruction":"Verificar que NO aparece el boton \"Nueva Licitacion\"","expectedOutcome":"El boton de crear no es visible para el encargado"},{"index":4,"instruction":"Verificar que la tabla NO muestra la columna \"Escuela\" (ya que solo ve su propia escuela)","expectedOutcome":"La columna Escuela no aparece en la vista del encargado"}]'::jsonb,
  1, 4, true, false, false
),

-- LIC-CE-2: Encargado confirma publicacion en su licitacion
(
  'encargado_licitacion',
  'LIC-CE-2: Encargado registra la publicacion de una licitacion',
  'Verificar que el encargado puede confirmar la publicacion ingresando la fecha y opcionalmente subiendo una imagen.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion"},{"type":"data","description":"Debe existir una licitacion en estado publicacion_pendiente para la escuela del encargado"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Mis Licitaciones y hacer clic en una licitacion con estado \"Publicacion Pendiente\"","expectedOutcome":"Se abre el detalle con el Paso 2 activo"},{"index":2,"instruction":"En el Paso 2, verificar que aparece el texto de publicacion generado automaticamente","expectedOutcome":"Se muestra el texto con el nombre de la escuela, la comuna y el correo de licitacion"},{"index":3,"instruction":"Hacer clic en el boton \"Copiar texto\"","expectedOutcome":"Aparece el mensaje \"Copiado!\" y el texto queda en el portapapeles"},{"index":4,"instruction":"Hacer clic en el campo de fecha y seleccionar la fecha de hoy","expectedOutcome":"Aparece un cronograma calculado con 5 fechas en dias habiles, excluyendo fines de semana y feriados chilenos"},{"index":5,"instruction":"Hacer clic en el boton \"Confirmar Publicacion\"","expectedOutcome":"Aparece un mensaje de exito y el estado de la licitacion cambia a \"Recepcion de Bases\""}]'::jsonb,
  1, 8, true, false, false
),

-- ============================================================================
-- LIC-PB: PERMISSION BOUNDARIES
-- ============================================================================

-- LIC-PB-1: Encargado intenta crear licitacion (debe ser rechazado)
(
  'encargado_licitacion',
  'LIC-PB-1: Encargado no puede crear licitaciones',
  'Verificar que el encargado es redirigido al listado si intenta acceder al formulario de creacion.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar directamente a la URL /licitaciones/nueva en el navegador","expectedOutcome":"El sistema muestra un mensaje de error de permisos y redirige al listado de licitaciones (o al dashboard)"},{"index":2,"instruction":"Verificar que NO aparece el formulario de creacion","expectedOutcome":"El formulario de nueva licitacion no es accesible para el encargado"}]'::jsonb,
  1, 3, true, false, false
),

-- LIC-PB-2: Usuario sin rol de licitacion no ve el menu
(
  'docente',
  'LIC-PB-2: Docente no tiene acceso al menu de licitaciones',
  'Verificar que el item Licitaciones NO aparece en la barra lateral para roles que no son admin ni encargado_licitacion.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como docente"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como docente (docente.qa@escuela.cl)","expectedOutcome":"El sistema muestra el panel del docente"},{"index":2,"instruction":"Revisar todos los items del menu en la barra lateral de navegacion","expectedOutcome":"El item \"Licitaciones\" NO aparece en el menu para el docente"},{"index":3,"instruction":"Navegar directamente a la URL /licitaciones","expectedOutcome":"El sistema redirige al dashboard o muestra un mensaje de acceso denegado"}]'::jsonb,
  1, 3, true, false, false
),

-- ============================================================================
-- LIC-SV: SIDEBAR VISIBILITY
-- ============================================================================

-- LIC-SV-1: Sidebar muestra Licitaciones para admin y encargado
(
  'admin',
  'LIC-SV-1: Item Licitaciones visible para admin y encargado_licitacion',
  'Verificar que el item Licitaciones aparece en el sidebar para admin y encargado, pero no para otros roles.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesion como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como admin y revisar la barra lateral de navegacion","expectedOutcome":"El item \"Licitaciones\" con el icono de balanza aparece en el menu"},{"index":2,"instruction":"Cerrar sesion y volver a iniciar sesion como encargado_licitacion","expectedOutcome":"El item \"Licitaciones\" tambien aparece en el menu para el encargado"},{"index":3,"instruction":"Cerrar sesion y volver a iniciar sesion como consultor","expectedOutcome":"El item \"Licitaciones\" NO aparece en el menu para el consultor"},{"index":4,"instruction":"Cerrar sesion y volver a iniciar sesion como docente","expectedOutcome":"El item \"Licitaciones\" NO aparece en el menu para el docente"}]'::jsonb,
  2, 6, true, false, false
);

-- ============================================================================
-- PHASE 6: NOTIFICATIONS + DASHBOARD POLISH
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- LIC-CA-20: Admin ve notificaciones de licitaciones
(
  'admin',
  'LIC-CA-20: Admin recibe notificacion al crear una licitacion',
  'Verificar que el administrador recibe una notificacion en la campana al crear una nueva licitacion.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir una escuela con cliente vinculado y al menos un programa activo"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como administrador y navegar a Licitaciones","expectedOutcome":"Se muestra el listado de licitaciones"},{"index":2,"instruction":"Hacer clic en \"Nueva Licitacion\" y completar el formulario con los datos requeridos","expectedOutcome":"La licitacion se crea exitosamente y aparece en el listado"},{"index":3,"instruction":"Verificar el icono de campana en la barra superior y hacer clic sobre el","expectedOutcome":"Se muestra una notificacion con el texto que incluye el numero de la licitacion recien creada"},{"index":4,"instruction":"Verificar que la notificacion indica el nombre de la escuela","expectedOutcome":"La notificacion muestra el nombre de la escuela correctamente"}]'::jsonb,
  2, 5, true, false, false
),

-- LIC-CA-21: Admin exporta licitaciones a Excel
(
  'admin',
  'LIC-CA-21: Admin exporta el listado de licitaciones a Excel',
  'Verificar que el boton Exportar a Excel descarga un archivo .xlsx con todas las licitaciones visibles.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Deben existir al menos 3 licitaciones en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Licitaciones como administrador","expectedOutcome":"Se muestra el listado con el boton \"Exportar a Excel\" en la parte superior"},{"index":2,"instruction":"Hacer clic en el boton \"Exportar a Excel\"","expectedOutcome":"El navegador descarga automaticamente un archivo con extension .xlsx"},{"index":3,"instruction":"Abrir el archivo descargado con Excel u otro programa compatible","expectedOutcome":"El archivo contiene una hoja llamada Licitaciones con 19 columnas de encabezado y una fila por cada licitacion"},{"index":4,"instruction":"Verificar que las columnas incluyen: Numero, Escuela, Programa, Nombre, Estado y Ano","expectedOutcome":"Las 19 columnas aparecen con los encabezados correctos en espanol"}]'::jsonb,
  2, 6, true, false, false
),

-- LIC-SV-2: Panel de proximos vencimientos visible en dashboard
(
  'admin',
  'LIC-SV-2: Dashboard muestra panel de proximos vencimientos',
  'Verificar que el panel de alertas de plazos proximos aparece en el listado cuando hay licitaciones con fechas limite en los proximos 3 dias habiles.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir al menos una licitacion con una fecha limite dentro de los proximos 3 dias"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Licitaciones como administrador","expectedOutcome":"Si hay licitaciones con plazos proximos, aparece un recuadro amarillo encima de la tabla con el titulo \"Proximos Vencimientos\""},{"index":2,"instruction":"Verificar el contenido del recuadro amarillo","expectedOutcome":"Se muestran hasta 5 licitaciones con numero, nombre de escuela, tipo de plazo y fecha exacta"},{"index":3,"instruction":"Verificar que las licitaciones que vencen hoy muestran la etiqueta HOY en rojo","expectedOutcome":"Las licitaciones con vencimiento hoy tienen la etiqueta HOY resaltada en rojo"}]'::jsonb,
  2, 5, true, false, false
),

-- LIC-SV-3: Columna Accion Requerida en tabla
(
  'admin',
  'LIC-SV-3: Tabla muestra columna de Accion Requerida',
  'Verificar que la tabla de licitaciones incluye la columna \"Accion Requerida\" con el texto de accion correspondiente al estado de cada licitacion.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Deben existir licitaciones en distintos estados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina de Licitaciones como administrador","expectedOutcome":"La tabla muestra la columna \"Accion Requerida\" entre Estado y Ano"},{"index":2,"instruction":"Verificar las licitaciones con estado \"Publicacion Pendiente\"","expectedOutcome":"La columna muestra el texto \"Registrar publicacion\" en azul"},{"index":3,"instruction":"Verificar las licitaciones con estado \"Evaluacion Pendiente\"","expectedOutcome":"La columna muestra el texto \"Completar evaluacion\" en azul"},{"index":4,"instruction":"Verificar las licitaciones con estado \"Cerrada\" o \"Contrato Generado\"","expectedOutcome":"La columna muestra un guion (—) indicando que no hay accion requerida"}]'::jsonb,
  2, 4, true, false, false
),

-- LIC-SV-4: Encargado ve subtitulo con nombre de escuela
(
  'encargado_licitacion',
  'LIC-SV-4: Encargado ve subtitulo con nombre de su escuela',
  'Verificar que el encargado de licitacion ve el subtitulo \"Licitaciones de {nombre_escuela}\" en el listado.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion asignado a una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como encargado_licitacion","expectedOutcome":"El sistema muestra el panel principal"},{"index":2,"instruction":"Hacer clic en Licitaciones en el menu lateral","expectedOutcome":"Se abre la pagina con el titulo \"Mis Licitaciones\" y debajo aparece el subtitulo \"Licitaciones de {nombre de la escuela}\""},{"index":3,"instruction":"Verificar que NO aparece el filtro de Escuela en los filtros","expectedOutcome":"El encargado solo ve los filtros de Estado, Ano y Programa (no el filtro de Escuela)"}]'::jsonb,
  2, 4, true, false, false
),

-- LIC-WF-6: Panel de accion requerida para encargado
(
  'encargado_licitacion',
  'LIC-WF-6: Encargado ve tarjeta de acciones requeridas',
  'Verificar que el encargado ve una tarjeta azul con las licitaciones que requieren su atencion.',
  'licitaciones',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion"},{"type":"data","description":"Debe existir al menos una licitacion en estado que requiere accion (por ejemplo Propuestas Pendientes o Evaluacion Pendiente)"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como encargado_licitacion y navegar a Licitaciones","expectedOutcome":"Aparece una tarjeta azul con el titulo \"Acciones Requeridas\" encima de la tabla"},{"index":2,"instruction":"Verificar el contenido de la tarjeta azul","expectedOutcome":"Se muestra una lista con el numero de licitacion y la accion pendiente para cada una"},{"index":3,"instruction":"Hacer clic en una de las licitaciones listadas en la tarjeta","expectedOutcome":"El sistema navega al detalle de esa licitacion"}]'::jsonb,
  2, 5, true, false, false
);

COMMIT;
