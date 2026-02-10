-- ============================================================================
-- QA Scenarios Seed Script: LIDER DE COMUNIDAD Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: lider_comunidad
-- Total Scenarios: 59
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_LIDER_COMUNIDAD.md (audited 2026-02-08)
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 14 scenarios (PB-1 to PB-14)
--   - Correct Access (Should ALLOW): 10 scenarios (CA-1 to CA-10)
--   - Community Assignment Scoping: 6 scenarios (CS-1 to CS-6)
--   - Sidebar Visibility: 23 scenarios (SV-1 to SV-23)
--   - Edge Cases: 6 scenarios (EC-1 to EC-6)
--
-- PRIORITIES:
--   1 = Critical (security, authentication, data leakage)
--   2 = High (role-based permissions, community scoping)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, UI consistency)
--
-- COLUMNS:
--   - role_required: 'lider_comunidad' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (except where noted)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERMISSION BOUNDARIES - 14 SCENARIOS (PB-1 to PB-14)
-- Testing: What lider_comunidad CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1
(
  'lider_comunidad',
  'PB-1: Lider de Comunidad intenta crear un nuevo curso',
  'Verificar que líderes de comunidad no pueden crear cursos. El acceso debe ser denegado con error 403.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"navigation","description":"El usuario debe estar autenticado"},{"type":"custom","description":"El sidebar no debe mostrar el menú Cursos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard del líder de comunidad"},{"index":2,"instruction":"Intentar acceder a la página de Creación de Curso","expectedOutcome":"Se muestra página de acceso denegado o se redirige al dashboard"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo curso","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Cursos NO aparece en la barra lateral","expectedOutcome":"El elemento Cursos no es visible en el sidebar"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-2
(
  'lider_comunidad',
  'PB-2: Lider de Comunidad intenta crear un usuario',
  'Verificar que líderes de comunidad no pueden crear usuarios. El acceso debe ser denegado.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"navigation","description":"El usuario está autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Usuarios","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo usuario","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Usuarios NO aparece en la barra lateral","expectedOutcome":"El elemento Usuarios no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-3
(
  'lider_comunidad',
  'PB-3: Lider de Comunidad intenta editar el perfil de otro usuario',
  'Verificar que líderes de comunidad no pueden editar perfiles de otros usuarios.',
  'user_management',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existe un usuario diferente en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos modificados","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay formulario de edición de usuario disponible","expectedOutcome":"El formulario no está accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-4
(
  'lider_comunidad',
  'PB-4: Lider de Comunidad intenta asignar roles a usuarios',
  'Verificar que líderes de comunidad no pueden asignar roles.',
  'role_assignment',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos de asignación de rol","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay opción de asignar roles en la UI","expectedOutcome":"La opción no es accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-5
(
  'lider_comunidad',
  'PB-5: Lider de Comunidad intenta gestionar colegios',
  'Verificar que líderes de comunidad no pueden acceder a gestión de colegios.',
  'school_management',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Escuelas","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Escuelas NO aparece en la barra lateral","expectedOutcome":"El elemento Escuelas no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-6
(
  'lider_comunidad',
  'PB-6: Lider de Comunidad intenta gestionar redes de colegios',
  'Verificar que líderes de comunidad no pueden acceder a gestión de redes.',
  'network_management',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Redes","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Redes de Colegios NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-7
(
  'lider_comunidad',
  'PB-7: Lider de Comunidad intenta crear una plantilla de evaluación',
  'Verificar que líderes de comunidad no pueden crear plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Intentar realizar la acción con datos de nueva plantilla","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Procesos de Cambio NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-8
(
  'lider_comunidad',
  'PB-8: Lider de Comunidad intenta ver plantillas de evaluación',
  'Verificar que líderes de comunidad no pueden ver plantillas de evaluación (solo admin y consultor).',
  'assessment_builder',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existen plantillas de evaluación en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Intentar realizar la acción","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-9
(
  'lider_comunidad',
  'PB-9: Lider de Comunidad intenta acceder a revisión de quizzes',
  'Verificar que líderes de comunidad no pueden acceder al módulo de revisión de quizzes.',
  'quiz_submission',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Revisión de Quizzes","expectedOutcome":"Se muestra página de acceso denegado o redirige"},{"index":3,"instruction":"Intentar realizar la acción","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Revisión de Quizzes NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-10
(
  'lider_comunidad',
  'PB-10: Lider de Comunidad intenta crear/editar noticias',
  'Verificar que líderes de comunidad no pueden gestionar noticias (solo admin y community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Noticias","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Intentar realizar la acción con datos de nueva noticia","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Noticias NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-11
(
  'lider_comunidad',
  'PB-11: Lider de Comunidad intenta crear/editar eventos',
  'Verificar que líderes de comunidad no pueden gestionar eventos (solo admin y community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Eventos","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Eventos NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-12
(
  'lider_comunidad',
  'PB-12: Lider de Comunidad intenta gestionar contratos',
  'Verificar que líderes de comunidad no pueden acceder al módulo de gestión de contratos.',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Contratos","expectedOutcome":"Se muestra página de acceso denegado o redirige"},{"index":3,"instruction":"Verificar que el menú Gestión NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-13
(
  'lider_comunidad',
  'PB-13: Lider de Comunidad intenta acceder a configuración del sistema',
  'Verificar que líderes de comunidad no pueden acceder a la configuración del sistema.',
  'role_assignment',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Configuración","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Configuración NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-14
(
  'lider_comunidad',
  'PB-14: Lider de Comunidad intenta acceder a páginas de QA Testing',
  'Verificar que líderes de comunidad no pueden acceder al módulo de QA Testing (solo admin).',
  'role_assignment',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Qa","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú QA Testing NO aparece en el sidebar","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 3, true, false, false
);

-- ============================================================================
-- CORRECT ACCESS - 10 SCENARIOS (CA-1 to CA-10)
-- Testing: What lider_comunidad CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1
(
  'lider_comunidad',
  'CA-1: Lider de Comunidad visualiza su panel de control',
  'Verificar que líderes de comunidad pueden acceder al dashboard y ver datos de su comunidad.',
  'docente_experience',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"data","description":"El usuario tiene una comunidad asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que el dashboard carga correctamente","expectedOutcome":"Se muestran KPIs y datos de la comunidad"},{"index":3,"instruction":"Verificar que los datos mostrados corresponden a su comunidad asignada","expectedOutcome":"Solo se muestran datos de la comunidad del usuario"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-2
(
  'lider_comunidad',
  'CA-2: Lider de Comunidad visualiza su perfil',
  'Verificar que líderes de comunidad pueden acceder a su página de perfil.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Perfil","expectedOutcome":"La página de perfil carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del usuario","expectedOutcome":"Se muestra información del perfil"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-3
(
  'lider_comunidad',
  'CA-3: Lider de Comunidad visualiza Mi Aprendizaje',
  'Verificar que líderes de comunidad pueden acceder a la página Mi Aprendizaje.',
  'course_enrollment',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Mi Aprendizaje","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los cursos inscritos","expectedOutcome":"Se muestra lista de cursos"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-4
(
  'lider_comunidad',
  'CA-4: Lider de Comunidad accede a Espacio Colaborativo',
  'Verificar que líderes de comunidad pueden acceder al workspace de su comunidad.',
  'community_workspace',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"data","description":"El usuario tiene una comunidad asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Community/workspace","expectedOutcome":"El workspace carga correctamente"},{"index":3,"instruction":"Verificar que solo se muestra contenido de su comunidad","expectedOutcome":"Solo se muestra contenido de la comunidad asignada"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-5
(
  'lider_comunidad',
  'CA-5: Lider de Comunidad visualiza miembros de su comunidad',
  'Verificar que líderes de comunidad pueden ver la lista de miembros de su comunidad.',
  'community_workspace',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"data","description":"La comunidad tiene miembros"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema lista de miembros de su comunidad"},{"index":3,"instruction":"Verificar que solo se retornan miembros de su comunidad","expectedOutcome":"Todos los miembros tienen el mismo community_id"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-6
(
  'lider_comunidad',
  'CA-6: Lider de Comunidad accede a página de tareas',
  'Verificar que líderes de comunidad pueden acceder a la página de tareas (rol estudiante).',
  'docente_experience',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Assignments","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran tareas pendientes como estudiante","expectedOutcome":"Se muestra vista de tareas"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-7
(
  'lider_comunidad',
  'CA-7: Lider de Comunidad visualiza reportes detallados',
  'Verificar que líderes de comunidad pueden acceder a reportes detallados filtrados por su comunidad.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"data","description":"Existen datos de reporte en la comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"La página de reportes carga correctamente"},{"index":3,"instruction":"Verificar que solo se muestran datos de su comunidad","expectedOutcome":"Todos los datos están filtrados por community_id"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-8
(
  'lider_comunidad',
  'CA-8: Lider de Comunidad accede al dashboard unificado',
  'Verificar que líderes de comunidad pueden acceder al API de dashboard unificado con datos filtrados.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"},{"type":"data","description":"La comunidad tiene datos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente con token de autenticación","expectedOutcome":"El sistema datos del dashboard"},{"index":3,"instruction":"Verificar que los datos están filtrados por community_id","expectedOutcome":"Solo se retornan datos de la comunidad del usuario"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-9
(
  'lider_comunidad',
  'CA-9: Lider de Comunidad visualiza reportes de comunidad',
  'Verificar que líderes de comunidad pueden acceder al API de reportes de comunidad.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema datos de reporte"},{"index":3,"instruction":"Verificar que los datos corresponden a su comunidad","expectedOutcome":"Datos filtrados por community_id"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-10
(
  'lider_comunidad',
  'CA-10: Lider de Comunidad visualiza opciones de filtro de reportes',
  'Verificar que líderes de comunidad pueden obtener opciones de filtro para reportes.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como lider_comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema opciones de filtro disponibles"},{"index":3,"instruction":"Verificar que las opciones están filtradas por su comunidad","expectedOutcome":"Solo opciones relevantes a su comunidad"}]'::jsonb,
  3, 2, true, false, false
);

-- ============================================================================
-- COMMUNITY ASSIGNMENT SCOPING - 6 SCENARIOS (CS-1 to CS-6)
-- Testing: Community data isolation and scoping
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CS-1
(
  'lider_comunidad',
  'CS-1: Reportes filtrados por community_id',
  'Verificar que los reportes solo muestran datos de la comunidad asignada del líder.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existen múltiples comunidades con datos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema datos"},{"index":3,"instruction":"Verificar que todos los usuarios retornados pertenecen a la comunidad del líder","expectedOutcome":"Ningún dato de otras comunidades"},{"index":4,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema datos"},{"index":5,"instruction":"Verificar que los datos coinciden con la comunidad asignada","expectedOutcome":"Solo datos de su comunidad"}]'::jsonb,
  1, 4, true, false, false
),

-- CS-2
(
  'lider_comunidad',
  'CS-2: Intento de manipulación de URL con otro community_id',
  'Verificar que el sistema rechaza intentos de acceder a datos de otras comunidades.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existe otra comunidad en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":"El sistema aparece un mensaje de error de permisos o datos vacíos"},{"index":3,"instruction":"Verificar que el filtro de comunidad es aplicado server-side","expectedOutcome":"No se pueden obtener datos de otras comunidades"}]'::jsonb,
  1, 3, true, false, false
),

-- CS-3
(
  'lider_comunidad',
  'CS-3: Miembros solo de su propia comunidad',
  'Verificar que al consultar miembros, solo se retornan los de su comunidad.',
  'community_workspace',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existen múltiples comunidades"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente con su community_id","expectedOutcome":"El sistema miembros"},{"index":3,"instruction":"Verificar que todos tienen el mismo community_id que el líder","expectedOutcome":"Todos los miembros pertenecen a la misma comunidad"}]'::jsonb,
  2, 3, true, false, false
),

-- CS-4
(
  'lider_comunidad',
  'CS-4: Workspace solo de su comunidad',
  'Verificar que el workspace muestra solo contenido de la comunidad asignada.',
  'community_workspace',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existen workspaces de múltiples comunidades"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Community/workspace","expectedOutcome":"Workspace carga"},{"index":3,"instruction":"Verificar que solo se muestra contenido de su comunidad","expectedOutcome":"No hay contenido de otras comunidades visible"}]'::jsonb,
  2, 3, true, false, false
),

-- CS-5
(
  'lider_comunidad',
  'CS-5: Dashboard unificado filtrado por comunidad',
  'Verificar que el dashboard unificado resuelve community_id correctamente y filtra datos.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existen datos en múltiples comunidades"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema KPIs"},{"index":3,"instruction":"Verificar que los KPIs reflejan solo datos de su comunidad","expectedOutcome":"Solo datos de la comunidad asignada"},{"index":4,"instruction":"Verificar que no se usa placeholder user-community-id","expectedOutcome":"Se resuelve community_id real desde user_roles"}]'::jsonb,
  1, 4, true, false, false
),

-- CS-6
(
  'lider_comunidad',
  'CS-6: Consistencia entre reportes overview y detailed',
  'Verificar que ambos endpoints retornan el mismo conjunto de usuarios de la comunidad.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Comunidad tiene múltiples usuarios"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema lista de usuarios"},{"index":3,"instruction":"Realizar realizar la acción correspondiente","expectedOutcome":"El sistema lista de usuarios"},{"index":4,"instruction":"Verificar que ambas listas contienen los mismos user IDs","expectedOutcome":"Ambos endpoints usan user_roles.community_id, datos consistentes"}]'::jsonb,
  1, 4, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 23 SCENARIOS (SV-1 to SV-23)
-- Testing: Sidebar menu item visibility based on role
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SV-1
(
  'lider_comunidad',
  'SV-1: Lider de Comunidad ve Mi Panel en la barra lateral',
  'Verificar que el elemento Mi Panel es visible en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Mi Panel aparece en el sidebar","expectedOutcome":"El elemento es visible"}]'::jsonb,
  4, 1, true, false, false
),

-- SV-2
(
  'lider_comunidad',
  'SV-2: Lider de Comunidad ve Mi Perfil en la barra lateral',
  'Verificar que el elemento Mi Perfil es visible en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Mi Perfil aparece en el sidebar","expectedOutcome":"El elemento es visible"}]'::jsonb,
  4, 1, true, false, false
),

-- SV-3
(
  'lider_comunidad',
  'SV-3: Lider de Comunidad ve Mi Aprendizaje en la barra lateral',
  'Verificar que el elemento Mi Aprendizaje es visible en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Mi Aprendizaje aparece en el sidebar","expectedOutcome":"El elemento es visible"}]'::jsonb,
  4, 1, true, false, false
),

-- SV-4
(
  'lider_comunidad',
  'SV-4: Lider de Comunidad ve Espacio Colaborativo en la barra lateral',
  'Verificar que el elemento Espacio Colaborativo es visible (requiresCommunity: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Usuario tiene community_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Espacio Colaborativo aparece en el sidebar","expectedOutcome":"El elemento es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-5
(
  'lider_comunidad',
  'SV-5: Lider de Comunidad NO ve Feedback en la barra lateral',
  'Verificar que Feedback NO es visible (restrictedRoles: docente, admin, consultor).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Feedback NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-6
(
  'lider_comunidad',
  'SV-6: Lider de Comunidad NO ve Revisión de Quizzes en la barra lateral',
  'Verificar que Revisión de Quizzes NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Revisión de Quizzes NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-7
(
  'lider_comunidad',
  'SV-7: Lider de Comunidad NO ve Cursos en la barra lateral',
  'Verificar que Cursos NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Cursos NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-8
(
  'lider_comunidad',
  'SV-8: Lider de Comunidad NO ve Procesos de Cambio en la barra lateral',
  'Verificar que Procesos de Cambio NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Procesos de Cambio NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-9
(
  'lider_comunidad',
  'SV-9: Lider de Comunidad NO ve Noticias en la barra lateral',
  'Verificar que Noticias NO es visible (restrictedRoles: admin, community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Noticias NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-10
(
  'lider_comunidad',
  'SV-10: Lider de Comunidad NO ve Eventos en la barra lateral',
  'Verificar que Eventos NO es visible (restrictedRoles: admin, community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Eventos NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-11
(
  'lider_comunidad',
  'SV-11: Lider de Comunidad NO ve Rutas de Aprendizaje en la barra lateral',
  'Verificar que Rutas de Aprendizaje NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Rutas de Aprendizaje NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-12
(
  'lider_comunidad',
  'SV-12: Lider de Comunidad NO ve Matriz de Asignaciones en la barra lateral',
  'Verificar que Matriz de Asignaciones NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Matriz de Asignaciones NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-13
(
  'lider_comunidad',
  'SV-13: Lider de Comunidad NO ve Usuarios en la barra lateral',
  'Verificar que Usuarios NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Usuarios NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-14
(
  'lider_comunidad',
  'SV-14: Lider de Comunidad NO ve Escuelas en la barra lateral',
  'Verificar que Escuelas NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Escuelas NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-15
(
  'lider_comunidad',
  'SV-15: Lider de Comunidad NO ve Redes de Colegios en la barra lateral',
  'Verificar que Redes de Colegios NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Redes de Colegios NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-16
(
  'lider_comunidad',
  'SV-16: Lider de Comunidad NO ve Consultorías en la barra lateral',
  'Verificar que Consultorías NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Consultorías NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-17
(
  'lider_comunidad',
  'SV-17: Lider de Comunidad NO ve Gestión en la barra lateral',
  'Verificar que Gestión NO es visible (restrictedRoles: admin, community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Gestión NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-18
(
  'lider_comunidad',
  'SV-18: Lider de Comunidad NO ve Reportes en la barra lateral',
  'Verificar que Reportes NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Reportes NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-19
(
  'lider_comunidad',
  'SV-19: Lider de Comunidad NO ve QA Testing en la barra lateral',
  'Verificar que QA Testing NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que QA Testing NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-20
(
  'lider_comunidad',
  'SV-20: Lider de Comunidad NO ve Vías de Transformación en la barra lateral',
  'Verificar que Vías de Transformación NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Vías de Transformación NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-21
(
  'lider_comunidad',
  'SV-21: Lider de Comunidad NO ve Configuración en la barra lateral',
  'Verificar que Configuración NO es visible (permission: manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Configuración NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-22
(
  'lider_comunidad',
  'SV-22: Lider de Comunidad NO ve Roles y Permisos en la barra lateral',
  'Verificar que Roles y Permisos NO es visible (superadminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que Roles y Permisos NO aparece en el sidebar","expectedOutcome":"El elemento NO es visible"}]'::jsonb,
  3, 1, true, false, false
),

-- SV-23
(
  'lider_comunidad',
  'SV-23: No hay elementos duplicados en la barra lateral',
  'Verificar que cada elemento del menú aparece exactamente una vez en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Inspeccionar el sidebar con herramientas de desarrollador","expectedOutcome":"Cada elemento tiene un ID único"},{"index":3,"instruction":"Verificar que no hay elementos duplicados visualmente","expectedOutcome":"No hay duplicados"}]'::jsonb,
  4, 2, true, false, false
);

-- ============================================================================
-- EDGE CASES - 6 SCENARIOS (EC-1 to EC-6)
-- Testing: Edge cases and error handling
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- EC-1
(
  'lider_comunidad',
  'EC-1: Lider de Comunidad sin community_id asignado',
  'Verificar que el sistema maneja correctamente el caso de un líder sin comunidad asignada.',
  'reporting',
  '[{"type":"role","description":"Usuario con rol lider_comunidad"},{"type":"data","description":"user_roles.community_id es NULL"}]'::jsonb,
  '[{"index":1,"instruction":"Configurar usuario con rol lider_comunidad pero sin community_id","expectedOutcome":"Usuario puede iniciar sesión"},{"index":2,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"Dashboard carga sin errores"},{"index":3,"instruction":"Intentar realizar la acción","expectedOutcome":"El sistema error apropiado o datos vacíos"},{"index":4,"instruction":"Verificar que no hay crash ni información sensible expuesta","expectedOutcome":"Manejo de error apropiado"}]'::jsonb,
  2, 4, true, false, false
),

-- EC-2
(
  'lider_comunidad',
  'EC-2: Comunidad vacía sin miembros',
  'Verificar que el sistema maneja correctamente una comunidad sin miembros.',
  'community_workspace',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"La comunidad no tiene otros miembros"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Community/workspace","expectedOutcome":"Workspace carga sin errores"},{"index":3,"instruction":"Verificar que se muestra estado vacío apropiado","expectedOutcome":"Mensaje de estado vacío, sin crash"}]'::jsonb,
  3, 3, true, false, false
),

-- EC-3
(
  'lider_comunidad',
  'EC-3: Usuario con múltiples roles incluyendo lider_comunidad',
  'Verificar que un usuario con múltiples roles funciona correctamente.',
  'role_assignment',
  '[{"type":"role","description":"Usuario con roles lider_comunidad y docente"},{"type":"data","description":"Ambos roles activos en user_roles"}]'::jsonb,
  '[{"index":1,"instruction":"Configurar usuario con roles lider_comunidad y docente","expectedOutcome":"Usuario tiene ambos roles en user_roles"},{"index":2,"instruction":"Iniciar sesión","expectedOutcome":"Se accede al dashboard"},{"index":3,"instruction":"Verificar que getHighestRole retorna lider_comunidad","expectedOutcome":"Rol principal es lider_comunidad"},{"index":4,"instruction":"Verificar que ambos roles tienen permisos funcionales","expectedOutcome":"Permisos de ambos roles se aplican"}]'::jsonb,
  3, 4, true, false, false
),

-- EC-4
(
  'lider_comunidad',
  'EC-4: Acceso directo a API sin pasar por sidebar',
  'Verificar que los controles de permiso server-side se aplican independientemente del cliente.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl y obtener token","expectedOutcome":"Token obtenido"},{"index":2,"instruction":"Realizar peticiones API directamente con curl o Postman","expectedOutcome":"Todas las peticiones tienen auth checks"},{"index":3,"instruction":"Intentar acceder a endpoint restringido (e.g., )","expectedOutcome":"El sistema independientemente de sidebar"}]'::jsonb,
  2, 4, true, false, false
),

-- EC-5
(
  'lider_comunidad',
  'EC-5: Sesión expira mientras navega',
  'Verificar que el sistema maneja correctamente la expiración de sesión.',
  'authentication',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"custom","description":"Sesión va a expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a varias páginas","expectedOutcome":"Páginas cargan correctamente"},{"index":3,"instruction":"Esperar a que la sesión expire (o simular expiración)","expectedOutcome":"Se redirige a página de login"},{"index":4,"instruction":"Verificar que no hay datos obsoletos visibles","expectedOutcome":"No se muestra contenido antiguo"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-6
(
  'lider_comunidad',
  'EC-6: Intenta ver detalles de usuario de otra comunidad',
  'Verificar que no se pueden ver detalles de usuarios de otras comunidades.',
  'reporting',
  '[{"type":"role","description":"Lider de comunidad autenticado"},{"type":"data","description":"Existe un usuario en otra comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con user_id de otra comunidad","expectedOutcome":"El sistema o datos vacíos"},{"index":3,"instruction":"Verificar que checkUserAccessModern compara community_id","expectedOutcome":"Acceso denegado si community_id no coincide"}]'::jsonb,
  1, 3, true, false, false
);

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Uncomment to verify the import:
-- SELECT COUNT(*) as total_scenarios,
--        array_agg(DISTINCT feature_area) as feature_areas,
--        array_agg(DISTINCT priority) as priorities
-- FROM qa_scenarios
-- WHERE role_required = 'lider_comunidad' AND is_active = true;
