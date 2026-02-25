-- ============================================================================
-- QA Scenarios Seed Script: Licitaciones Configuration Pages
-- ============================================================================
-- Feature Area: licitaciones_config
-- Roles: admin (only)
-- Total Scenarios: 10
-- Date Created: 2026-02-21
-- Task: Admin Configuration Pages — Templates + Feriados
--
-- SCENARIO GROUPS:
--   LCC-PT  : Plantillas Templates page scenarios
--   LCC-FE  : Feriados page scenarios
--   LCC-SB  : Sidebar navigation scenarios
--   LCC-PB  : Permission Boundaries (non-admin denied access)
-- ============================================================================

BEGIN;

-- ============================================================================
-- LCC-PT: PLANTILLAS DE BASES (TEMPLATES PAGE)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- LCC-PT-1: Admin accede a la pagina de plantillas
(
  'admin',
  'LCC-PT-1: Admin accede a la pagina de Plantillas de Bases',
  'Verificar que el administrador puede acceder a la pagina de gestion de plantillas y que se muestra la lista de programas.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"navigation","description":"El admin debe estar autenticado en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como administrador","expectedOutcome":"El sistema muestra el panel principal del admin"},{"index":2,"instruction":"Hacer clic en \"Licitaciones\" en la barra lateral de navegacion","expectedOutcome":"Se despliega el menu de Licitaciones con tres opciones: Procesos, Plantillas de Bases, Feriados"},{"index":3,"instruction":"Hacer clic en \"Plantillas de Bases\" dentro del menu de Licitaciones","expectedOutcome":"Se abre la pagina de Plantillas de Bases mostrando la lista de programas con sus plantillas"},{"index":4,"instruction":"Verificar que cada programa muestra un interruptor (toggle) junto a su nombre","expectedOutcome":"Cada fila de programa muestra un interruptor que indica si la plantilla esta activa o inactiva"}]'::jsonb,
  1, 4, true, false, false
),

-- LCC-PT-2: Admin activa y desactiva una plantilla con el toggle
(
  'admin',
  'LCC-PT-2: Admin cambia el estado activo de una plantilla',
  'Verificar que el admin puede activar y desactivar plantillas usando el interruptor en la lista.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir al menos un programa con una plantilla de bases guardada"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Plantillas de Bases","expectedOutcome":"Se muestra la lista de programas con sus plantillas"},{"index":2,"instruction":"Identificar un programa que tenga una plantilla activa (interruptor verde/encendido) y hacer clic en el interruptor para desactivarla","expectedOutcome":"El interruptor cambia a gris/apagado y aparece un mensaje de exito \"Plantilla desactivada\""},{"index":3,"instruction":"Hacer clic nuevamente en el interruptor para activar la plantilla","expectedOutcome":"El interruptor vuelve a verde/encendido y aparece el mensaje \"Plantilla activada\""},{"index":4,"instruction":"Recargar la pagina y verificar que el estado del interruptor se mantiene","expectedOutcome":"El estado del interruptor coincide con el ultimo cambio guardado"}]'::jsonb,
  1, 5, true, false, false
),

-- LCC-PT-3: Admin filtra plantillas por programa
(
  'admin',
  'LCC-PT-3: Admin filtra la lista de plantillas por programa',
  'Verificar que el menu desplegable de filtro por programa funciona correctamente.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Deben existir al menos 2 programas activos en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Plantillas de Bases","expectedOutcome":"Se muestra la lista completa de programas"},{"index":2,"instruction":"Verificar que existe un selector con la opcion \"Todos los programas\" al inicio de la pagina","expectedOutcome":"El selector desplegable esta visible con la opcion por defecto \"Todos los programas\""},{"index":3,"instruction":"Hacer clic en el selector y elegir un programa especifico de la lista","expectedOutcome":"La lista se filtra mostrando solo el programa seleccionado"},{"index":4,"instruction":"Hacer clic en el enlace \"Limpiar filtro\" o seleccionar nuevamente \"Todos los programas\"","expectedOutcome":"La lista vuelve a mostrar todos los programas"}]'::jsonb,
  2, 4, true, false, false
),

-- LCC-PT-4: Admin edita y guarda una plantilla (flujo existente — no regresion)
(
  'admin',
  'LCC-PT-4: Admin edita y guarda una nueva version de plantilla',
  'Verificar que el flujo de edicion y guardado de plantilla sigue funcionando correctamente tras los cambios en la pagina.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"Debe existir al menos un programa activo"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Plantillas de Bases","expectedOutcome":"Se muestra la lista de programas"},{"index":2,"instruction":"Hacer clic en el boton \"Editar plantilla\" de cualquier programa","expectedOutcome":"Se despliega el formulario de edicion con los campos de la plantilla"},{"index":3,"instruction":"Modificar el campo \"Nombre del Servicio\" y completar los campos requeridos","expectedOutcome":"Los cambios se reflejan en el formulario"},{"index":4,"instruction":"Hacer clic en el boton \"Guardar como nueva version\"","expectedOutcome":"Aparece el mensaje \"Plantilla guardada como nueva version\" y el numero de version del programa aumenta en 1"}]'::jsonb,
  1, 6, true, false, false
),

-- ============================================================================
-- LCC-FE: FERIADOS PAGE
-- ============================================================================

-- LCC-FE-1: Admin accede a la pagina de feriados
(
  'admin',
  'LCC-FE-1: Admin accede a la pagina de Feriados Chile',
  'Verificar que el administrador puede acceder a la pagina de gestion de feriados.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como administrador y hacer clic en \"Licitaciones\" en la barra lateral","expectedOutcome":"Se despliega el menu con las opciones de Licitaciones"},{"index":2,"instruction":"Hacer clic en \"Feriados\" dentro del menu de Licitaciones","expectedOutcome":"Se abre la pagina de Feriados Chile con el selector de ano y la tabla de feriados"},{"index":3,"instruction":"Verificar que la pagina muestra un selector de ano y los botones \"Cargar feriados\" y \"Agregar Feriado\"","expectedOutcome":"El selector de ano, el boton \"Cargar feriados AAAA\" y el boton \"Agregar Feriado\" son visibles"}]'::jsonb,
  1, 3, true, false, false
),

-- LCC-FE-2: Admin carga feriados en masa para un ano
(
  'admin',
  'LCC-FE-2: Admin carga automaticamente los feriados de Chile para un ano',
  'Verificar que el boton \"Cargar feriados\" inserta los 16 feriados nacionales chilenos para el ano seleccionado.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"El ano seleccionado no debe tener feriados cargados previamente"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Feriados","expectedOutcome":"Se muestra la pagina de Feriados con el selector de ano"},{"index":2,"instruction":"Seleccionar un ano en el que no haya feriados (por ejemplo 2030) usando el selector de ano","expectedOutcome":"La tabla muestra el mensaje \"No hay feriados registrados para el ano 2030\""},{"index":3,"instruction":"Hacer clic en el boton \"Cargar feriados 2030\"","expectedOutcome":"Aparece un mensaje de exito indicando cuantos feriados fueron agregados (ej: \"16 feriados agregados para 2030\") y la tabla se actualiza con los feriados"},{"index":4,"instruction":"Verificar que la tabla muestra feriados incluyendo Ano Nuevo (1 enero), Viernes Santo, Dia del Trabajo (1 mayo) y Navidad (25 diciembre)","expectedOutcome":"Los feriados correctos aparecen en la tabla con sus fechas y nombres en espanol"}]'::jsonb,
  1, 5, true, false, false
),

-- LCC-FE-3: Carga de feriados duplicados (idempotencia)
(
  'admin',
  'LCC-FE-3: Cargar feriados cuando ya existen no genera duplicados',
  'Verificar que al hacer clic en \"Cargar feriados\" cuando el ano ya tiene feriados, el sistema informa que ya estaban registrados.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"},{"type":"data","description":"El ano seleccionado ya debe tener feriados cargados"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Feriados y seleccionar un ano que ya tenga feriados cargados","expectedOutcome":"La tabla muestra los feriados ya existentes"},{"index":2,"instruction":"Hacer clic en el boton \"Cargar feriados AAAA\"","expectedOutcome":"Aparece un mensaje indicando que todos los feriados ya estaban registrados, sin duplicar ninguno"},{"index":3,"instruction":"Verificar que la cantidad de feriados en la tabla no aumenta","expectedOutcome":"El numero de feriados permanece igual al que habia antes de hacer clic"}]'::jsonb,
  2, 4, true, false, false
),

-- LCC-FE-4: Admin agrega un feriado individual
(
  'admin',
  'LCC-FE-4: Admin agrega un feriado individual manualmente',
  'Verificar que el formulario de agregar feriado sigue funcionando correctamente.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a la pagina Licitaciones > Feriados","expectedOutcome":"Se muestra la pagina de feriados"},{"index":2,"instruction":"Hacer clic en el boton \"Agregar Feriado\"","expectedOutcome":"Aparece el formulario de nuevo feriado con campos de fecha y nombre"},{"index":3,"instruction":"Completar el campo de fecha con una fecha no existente (ej: el dia de manana) y escribir un nombre de feriado especial","expectedOutcome":"Los campos se completan correctamente"},{"index":4,"instruction":"Hacer clic en el boton \"Guardar\"","expectedOutcome":"Aparece el mensaje \"Feriado agregado exitosamente\" y el nuevo feriado aparece en la tabla"}]'::jsonb,
  2, 5, true, false, false
),

-- ============================================================================
-- LCC-SB: SIDEBAR NAVIGATION
-- ============================================================================

-- LCC-SB-1: Admin ve el menu de Licitaciones con subitems
(
  'admin',
  'LCC-SB-1: Admin ve los subitems de Licitaciones en el menu lateral',
  'Verificar que el menu lateral muestra Licitaciones como padre con tres hijos: Procesos, Plantillas de Bases y Feriados.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como administrador","expectedOutcome":"Se muestra el panel principal con la barra lateral"},{"index":2,"instruction":"Hacer clic en el item \"Licitaciones\" en la barra lateral","expectedOutcome":"Se despliega un submenu con tres opciones: \"Procesos\", \"Plantillas de Bases\" y \"Feriados\""},{"index":3,"instruction":"Verificar que los tres subitems son visibles y tienen los nombres correctos","expectedOutcome":"Aparecen los tres subitems: Procesos, Plantillas de Bases, Feriados"},{"index":4,"instruction":"Hacer clic en \"Procesos\" para navegar al listado principal de licitaciones","expectedOutcome":"Se navega a la pagina de listado de licitaciones sin errores"}]'::jsonb,
  1, 4, true, false, false
),

-- ============================================================================
-- LCC-PB: PERMISSION BOUNDARIES (NON-ADMIN DENIED)
-- ============================================================================

-- LCC-PB-1: Encargado de licitacion no ve Plantillas ni Feriados en el menu
(
  'encargado_licitacion',
  'LCC-PB-1: Encargado no puede acceder a Plantillas ni Feriados',
  'Verificar que el encargado de licitacion ve el item Licitaciones en el menu pero NO ve los subitems de Plantillas de Bases ni Feriados.',
  'licitaciones_config',
  '[{"type":"role","description":"Iniciar sesion como encargado_licitacion"},{"type":"navigation","description":"El encargado debe estar autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesion como encargado de licitacion","expectedOutcome":"El sistema muestra el panel principal del encargado"},{"index":2,"instruction":"Hacer clic en \"Licitaciones\" en la barra lateral","expectedOutcome":"Se muestra el submenu de Licitaciones con solo el item \"Procesos\" visible; Plantillas de Bases y Feriados no aparecen"},{"index":3,"instruction":"Intentar navegar directamente a la URL /admin/licitaciones/templates en el navegador","expectedOutcome":"El sistema redirige al panel principal o muestra un mensaje de que solo administradores pueden acceder"},{"index":4,"instruction":"Intentar navegar directamente a la URL /admin/licitaciones/feriados en el navegador","expectedOutcome":"El sistema redirige al panel principal o muestra un mensaje de que solo administradores pueden acceder"}]'::jsonb,
  1, 5, true, false, false
);

COMMIT;
