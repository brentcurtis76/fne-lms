-- ============================================================================
-- QA Scenarios Seed Script: CONSULTOR Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: consultor
-- Total Scenarios: 63
-- Date Created: 2026-02-07
-- Source: QA_SCENARIOS_CONSULTOR.md (audited 2026-02-07)
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 12 scenarios (PB-1 to PB-12)
--   - Correct Access (Should ALLOW): 13 scenarios (CA-1 to CA-13)
--   - School Assignment Scoping: 4 scenarios (SS-1 to SS-4)
--   - Sidebar Visibility: 25 scenarios (SV-1 to SV-25)
--   - Edge Cases: 7 scenarios (EC-1 to EC-7)
--
-- PRIORITIES:
--   1 = Critical (security, authentication)
--   2 = High (role-based permissions)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'consultor' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (except EC-7)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERMISSION BOUNDARIES - 12 SCENARIOS (PB-1 to PB-12)
-- Testing: What consultors CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1: Consultor tries to create a new course
(
  'consultor',
  'PB-1: Consultor intenta crear un nuevo curso',
  'Verificar que consultores no pueden crear cursos. El acceso debe ser denegado con mensaje de acceso denegado.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"navigation","description":"El usuario consultor debe estar autenticado"},{"type":"custom","description":"El sidebar no debe mostrar el menú Cursos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard del consultor"},{"index":2,"instruction":"Intentar acceder a la página de Creación de Curso","expectedOutcome":"Se muestra página de acceso denegado o se redirige al dashboard"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo curso","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Cursos NO aparece en la barra lateral","expectedOutcome":"El elemento Cursos no es visible en el sidebar"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-2: Consultor tries to create a user
(
  'consultor',
  'PB-2: Consultor intenta crear un usuario',
  'Verificar que consultores no pueden crear usuarios. El acceso debe ser denegado.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como consultor"},{"type":"navigation","description":"El usuario está autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Usuarios","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo usuario","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Usuarios NO aparece en la barra lateral","expectedOutcome":"El elemento Usuarios no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-3: Consultor tries to edit another user's profile
(
  'consultor',
  'PB-3: Consultor intenta editar el perfil de otro usuario',
  'Verificar que consultores no pueden editar perfiles de otros usuarios.',
  'user_management',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Existe un usuario diferente en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos modificados","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay formulario de edición de usuario disponible","expectedOutcome":"El formulario no está accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-4: Consultor tries to assign roles to users
(
  'consultor',
  'PB-4: Consultor intenta asignar roles a usuarios',
  'Verificar que consultores no pueden asignar roles.',
  'role_assignment',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos de asignación de rol","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay opción de asignar roles en la UI","expectedOutcome":"La opción no es accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-5: Consultor tries to manage schools
(
  'consultor',
  'PB-5: Consultor intenta gestionar colegios',
  'Verificar que consultores no pueden acceder a gestión de colegios.',
  'school_management',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Escuelas","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Escuelas NO aparece en la barra lateral","expectedOutcome":"El elemento Escuelas no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-6: Consultor tries to manage network of schools
(
  'consultor',
  'PB-6: Consultor intenta gestionar red de colegios',
  'Verificar que consultores no pueden acceder a gestión de redes.',
  'network_management',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Redes","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Redes de Colegios NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-7: Consultor tries to create an assessment template
(
  'consultor',
  'PB-7: Consultor intenta crear una plantilla de evaluación',
  'Verificar que consultores no pueden crear plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos de nueva plantilla","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que los botones Crear/Editar NO aparecen en el constructor de evaluaciones","expectedOutcome":"Los botones no son visibles"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-8: Consultor tries to create/edit news items
(
  'consultor',
  'PB-8: Consultor intenta crear o editar noticias',
  'Verificar que consultores no pueden gestionar noticias.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /admin/community y presionar Enter","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Verificar que el menú Noticias NO aparece en la barra lateral","expectedOutcome":"El elemento Noticias no es visible (solo para community_manager)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-9: Consultor tries to create/edit events
(
  'consultor',
  'PB-9: Consultor intenta crear o editar eventos',
  'Verificar que consultores no pueden gestionar eventos.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Eventos","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Eventos NO aparece en la barra lateral","expectedOutcome":"El elemento Eventos no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-10: Consultor tries to manage contracts
(
  'consultor',
  'PB-10: Consultor intenta gestionar contratos',
  'Verificar que consultores no pueden acceder a gestión de contratos.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Contratos","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Gestión NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-11: Consultor tries to access system configuration
(
  'consultor',
  'PB-11: Consultor intenta acceder a configuración del sistema',
  'Verificar que consultores no pueden acceder a configuración.',
  'role_assignment',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Configuración","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Configuración NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (requiere manage_system_settings)"}]'::jsonb,
  1, 2, true, false, false
),

-- PB-12: Consultor tries to assign other consultants
(
  'consultor',
  'PB-12: Consultor intenta asignar otros consultores',
  'Verificar que consultores no pueden asignar otros consultores.',
  'role_assignment',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Asignación de Consultores","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Verificar que el menú Asignación de Consultores NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (adminOnly: true)"}]'::jsonb,
  2, 2, true, false, false
);

-- ============================================================================
-- CORRECT ACCESS - 13 SCENARIOS (CA-1 to CA-13)
-- Testing: What consultors CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1: Consultor views their dashboard
(
  'consultor',
  'CA-1: Consultor visualiza su panel de control',
  'Verificar que consultores pueden acceder a su dashboard con datos del colegio asignado.',
  'docente_experience',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Consultor tiene escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard correctamente"},{"index":2,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"La página carga correctamente con datos del colegio asignado"},{"index":3,"instruction":"Verificar que se muestran estadísticas de la escuela asignada","expectedOutcome":"Los datos mostrados corresponden solo a la escuela asignada"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-2: Consultor views their profile
(
  'consultor',
  'CA-2: Consultor visualiza su perfil',
  'Verificar que consultores pueden ver y acceder a su perfil.',
  'user_management',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Perfil","expectedOutcome":"La página de perfil carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del consultor autenticado","expectedOutcome":"El perfil muestra información correcta"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-3: Consultor views 'Mi Aprendizaje'
(
  'consultor',
  'CA-3: Consultor visualiza Mi Aprendizaje',
  'Verificar que consultores pueden ver la página de aprendizaje.',
  'course_enrollment',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay cursos asignados"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Mi Aprendizaje o hacer clic en menú Mi Aprendizaje","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los cursos inscritos","expectedOutcome":"Se listan los cursos disponibles para el consultor"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-4: Consultor views assessment templates (read-only)
(
  'consultor',
  'CA-4: Consultor visualiza plantillas de evaluación (solo lectura)',
  'Verificar que consultores pueden ver plantillas pero no crearlas/editarlas.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Existen plantillas de evaluación disponibles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestra la lista de plantillas","expectedOutcome":"Se listan las plantillas disponibles"},{"index":4,"instruction":"Verificar que no hay botones Crear/Editar/Eliminar","expectedOutcome":"Solo aparecen opciones de lectura (Ver, Descargar)"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-5: Consultor accesses quiz review page
(
  'consultor',
  'CA-5: Consultor accede a página de revisión de quizzes',
  'Verificar que consultores pueden ver y acceder a quizzes pendientes de revisión.',
  'quiz_submission',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay quizzes pendientes de calificar en la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Revisión de Quizzes o hacer clic en menú Revisión de Quizzes","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran quizzes pendientes de la escuela asignada","expectedOutcome":"Se listan los quizzes con estado pendiente"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-6: Consultor grades an open-ended quiz question
(
  'consultor',
  'CA-6: Consultor califica una pregunta de quiz abierta',
  'Verificar que consultores pueden calificar preguntas abiertas de quizzes.',
  'quiz_submission',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay un quiz con pregunta abierta pendiente de calificación"},{"type":"navigation","description":"Consultor está en página de revisión de quizzes"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Revisión de Quizzes","expectedOutcome":"Se muestra lista de quizzes pendientes"},{"index":3,"instruction":"Seleccionar un quiz y abrir una pregunta abierta","expectedOutcome":"Se muestra el formulario de calificación"},{"index":4,"instruction":"Ingresar una calificación y guardar","expectedOutcome":"La calificación se guarda exitosamente"}]'::jsonb,
  2, 5, true, false, false
),

-- CA-7: Consultor views detailed reports
(
  'consultor',
  'CA-7: Consultor visualiza reportes detallados',
  'Verificar que consultores pueden ver reportes de su escuela asignada.',
  'reporting',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay datos de reporte disponibles para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados o hacer clic en menú Reportes","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran reportes filtrados por escuela asignada","expectedOutcome":"Los datos mostrados corresponden solo a la escuela asignada"}]'::jsonb,
  2, 5, true, false, false
),

-- CA-8: Consultor views Contexto Transversal
(
  'consultor',
  'CA-8: Consultor visualiza Contexto Transversal',
  'Verificar que consultores pueden ver el Contexto Transversal en modo solo lectura.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay contexto transversal para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Escuela/transversal-context o acceder desde menú Procesos de Cambio","expectedOutcome":"La página carga en modo solo lectura"},{"index":3,"instruction":"Verificar que se muestran los datos de contexto","expectedOutcome":"La página muestra contenido sin opciones de edición"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-9: Consultor views Plan de Migración
(
  'consultor',
  'CA-9: Consultor visualiza Plan de Migración',
  'Verificar que consultores pueden ver el Plan de Migración.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay plan de migración para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Escuela/migration-plan o acceder desde menú Procesos de Cambio","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del plan","expectedOutcome":"Se visualiza la información del plan"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-10: Consultor views Assignment Overview
(
  'consultor',
  'CA-10: Consultor visualiza Vista de Tareas',
  'Verificar que consultores pueden ver la vista de tareas/asignaciones.',
  'docente_experience',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay asignaciones disponibles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Vista de Tareas o acceder desde menú Consultorías","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran las asignaciones de grupo","expectedOutcome":"Se visualiza el monitor de asignaciones"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-11: Consultor accesses Espacio Colaborativo
(
  'consultor',
  'CA-11: Consultor accede a Espacio Colaborativo',
  'Verificar que consultores pueden acceder a workspace colaborativo.',
  'collaborative_space',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Consultor es miembro de una comunidad"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Community/workspace o hacer clic en menú Espacio Colaborativo","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran las comunidades del consultor","expectedOutcome":"Se visualizan los espacios colaborativos disponibles"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-12: Consultor views Feedback page
(
  'consultor',
  'CA-12: Consultor visualiza página de Feedback',
  'Verificar que consultores pueden ver el feedback con datos de su escuela.',
  'docente_experience',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay feedback disponible para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Docente/assessments o hacer clic en menú Feedback","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran datos filtrados por escuela asignada","expectedOutcome":"Se visualiza feedback solo de la escuela del consultor"}]'::jsonb,
  3, 3, true, false, false
),

-- CA-13: Consultor assigns a course to students
-- DEACTIVATED 2026-02-18: No UI exists for course assignment by consultors. Feature may be built later.
(
  'consultor',
  'CA-13: Consultor asigna un curso a estudiantes',
  'Verificar que consultores pueden asignar cursos (can_assign_courses: true).',
  'course_enrollment',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay cursos disponibles y estudiantes para asignar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a pantalla de asignación de cursos","expectedOutcome":"Se muestra la interfaz de asignación"},{"index":3,"instruction":"Seleccionar un curso y asignarlo a estudiantes","expectedOutcome":"La asignación se realiza exitosamente"},{"index":4,"instruction":"Verificar que la acción funciona correctamente","expectedOutcome":"Los datos se muestran correctamente"}]'::jsonb,
  2, 5, false, false, false
);

-- ============================================================================
-- SCHOOL ASSIGNMENT SCOPING - 4 SCENARIOS (SS-1 to SS-4)
-- Testing: Data filtering by assigned school
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SS-1: Consultor views reports — only sees data from assigned school
(
  'consultor',
  'SS-1: Consultor visualiza reportes solo de escuela asignada',
  'Verificar que los reportes filtran datos por escuela asignada del consultor.',
  'reporting',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay múltiples escuelas en el sistema"},{"type":"data","description":"El consultor está asignado a una escuela específica"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página de reportes"},{"index":3,"instruction":"Observar que el filtro de escuela está preestablecido a la escuela asignada","expectedOutcome":"El filtro no se puede cambiar a otra escuela"},{"index":4,"instruction":"Verificar que no hay datos de otras escuelas visibles","expectedOutcome":"Solo se muestran datos de la escuela asignada"}]'::jsonb,
  2, 5, true, false, false
),

-- SS-2: Consultor tries to view reports for a different school (URL manipulation)
(
  'consultor',
  'SS-2: Consultor intenta ver reportes de otra escuela (manipulación de URL)',
  'Verificar que la API rechaza consultas de datos de otras escuelas.',
  'reporting',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay otra escuela en el sistema diferente a la asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Reportes Detallados","expectedOutcome":"La página se carga pero no muestra datos"},{"index":3,"instruction":"Verificar que la página no muestra datos de escuelas a las que el consultor no está asignado","expectedOutcome":"No aparecen datos ni registros de la otra escuela en ninguna sección de la página"}]'::jsonb,
  2, 3, true, false, false
),

-- SS-3: Consultor views Contexto Transversal for another school (URL manipulation)
(
  'consultor',
  'SS-3: Consultor intenta ver Contexto Transversal de otra escuela',
  'Verificar que acceso al contexto está restringido a escuela asignada.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay otra escuela en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Escribir en la barra de direcciones del navegador: /school/transversal-context?school_id=00000000-0000-0000-0000-000000000001 y presionar Enter (un ID de escuela diferente a la asignada)","expectedOutcome":"Se muestra acceso denegado o se redirige al dashboard del consultor"},{"index":3,"instruction":"Verificar que solo los datos de la escuela asignada son accesibles","expectedOutcome":"Solo la escuela asignada es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- SS-4: Consultor views assessment templates — sees all templates (not school-scoped)
(
  'consultor',
  'SS-4: Consultor visualiza plantillas de evaluación (no son limitadas por escuela)',
  'Verificar que las plantillas de evaluación son globales y no filtradas por escuela.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Hay plantillas de evaluación publicadas"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestra la página"},{"index":3,"instruction":"Verificar que se muestran TODAS las plantillas publicadas","expectedOutcome":"Las plantillas no están filtradas por escuela asignada"},{"index":4,"instruction":"Confirmar que este es el comportamiento esperado (plantillas globales)","expectedOutcome":"Se entiende que las plantillas son recursos compartidos a nivel de sistema"}]'::jsonb,
  3, 4, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 27 SCENARIOS (SV-1 to SV-27)
-- Testing: Navigation menu visibility
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- VISIBLE ITEMS: 10 scenarios (SV-1 to SV-10)

-- SV-1: Consultor sees 'Mi Panel' in sidebar
(
  'consultor',
  'SV-1: Consultor ve Mi Panel en la barra lateral',
  'Verificar que el elemento Mi Panel es visible en el sidebar del consultor.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral izquierda","expectedOutcome":"El elemento Mi Panel es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-2: Consultor sees 'Mi Perfil' in sidebar
(
  'consultor',
  'SV-2: Consultor ve Mi Perfil en la barra lateral',
  'Verificar que el elemento Mi Perfil es visible.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Perfil es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-3: Consultor sees 'Mi Aprendizaje' in sidebar
(
  'consultor',
  'SV-3: Consultor ve Mi Aprendizaje en la barra lateral',
  'Verificar que el elemento Mi Aprendizaje es visible.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Aprendizaje es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-4: Consultor sees 'Revisión de Quizzes' in sidebar
(
  'consultor',
  'SV-4: Consultor ve Revisión de Quizzes en la barra lateral',
  'Verificar que Revisión de Quizzes es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Revisión de Quizzes es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-5: Consultor sees 'Procesos de Cambio' submenu in sidebar
(
  'consultor',
  'SV-5: Consultor ve submenu Procesos de Cambio en la barra lateral',
  'Verificar que Procesos de Cambio es visible con subelementos.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Procesos de Cambio es visible"},{"index":3,"instruction":"Expandir o verificar submenu Procesos de Cambio","expectedOutcome":"Se muestran subelementos: Constructor de Evaluaciones, Contexto Transversal, Plan de Migración"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-6: Consultor sees 'Vista de Tareas' in sidebar
(
  'consultor',
  'SV-6: Consultor ve Vista de Tareas en la barra lateral',
  'Verificar que Vista de Tareas es visible bajo Consultorías.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"Se visualiza menú Consultorías"},{"index":3,"instruction":"Expandir menú Consultorías","expectedOutcome":"Vista de Tareas es visible como elemento hijo"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-7: Consultor sees 'Reportes' in sidebar
(
  'consultor',
  'SV-7: Consultor ve Reportes en la barra lateral',
  'Verificar que Reportes es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Reportes es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-8: Consultor sees 'Feedback' in sidebar
(
  'consultor',
  'SV-8: Consultor ve Feedback en la barra lateral',
  'Verificar que Feedback es visible (restrictedRoles incluye consultor).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Feedback es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-9: Consultor sees 'Espacio Colaborativo' in sidebar
(
  'consultor',
  'SV-9: Consultor ve Espacio Colaborativo en la barra lateral',
  'Verificar que Espacio Colaborativo es visible (consultores exentos de requisito de comunidad).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Espacio Colaborativo es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-10: Consultor sees 'Consultorías' parent in sidebar
(
  'consultor',
  'SV-10: Consultor ve menú padre Consultorías en la barra lateral',
  'Verificar que Consultorías es visible como elemento padre.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Consultorías es visible"},{"index":3,"instruction":"Verificar que contiene subelementos como Vista de Tareas","expectedOutcome":"Consultorías actúa como menú padre con opciones hijo"}]'::jsonb,
  3, 2, true, false, false
),

-- HIDDEN ITEMS: 14 scenarios (SV-11 to SV-24)

-- SV-11: Consultor does NOT see 'Cursos' in sidebar
(
  'consultor',
  'SV-11: Consultor NO ve Cursos en la barra lateral',
  'Verificar que Cursos no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Cursos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-12: Consultor does NOT see 'Usuarios' in sidebar
(
  'consultor',
  'SV-12: Consultor NO ve Usuarios en la barra lateral',
  'Verificar que Usuarios no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Usuarios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-13: Consultor does NOT see 'Escuelas' in sidebar
(
  'consultor',
  'SV-13: Consultor NO ve Escuelas en la barra lateral',
  'Verificar que Escuelas no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Escuelas NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-14: Consultor does NOT see 'Redes de Colegios' in sidebar
(
  'consultor',
  'SV-14: Consultor NO ve Redes de Colegios en la barra lateral',
  'Verificar que Redes de Colegios no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Redes de Colegios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-15: Consultor does NOT see 'Noticias' in sidebar
(
  'consultor',
  'SV-15: Consultor NO ve Noticias en la barra lateral',
  'Verificar que Noticias no es visible (solo admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Noticias NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-16: Consultor does NOT see 'Eventos' in sidebar
(
  'consultor',
  'SV-16: Consultor NO ve Eventos en la barra lateral',
  'Verificar que Eventos no es visible (solo admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Eventos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-17: Consultor does NOT see 'Gestión' in sidebar
(
  'consultor',
  'SV-17: Consultor NO ve Gestión en la barra lateral',
  'Verificar que Gestión no es visible (solo admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Gestión NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-18: Consultor does NOT see 'Configuración' in sidebar
(
  'consultor',
  'SV-18: Consultor NO ve Configuración en la barra lateral',
  'Verificar que Configuración no es visible (requiere manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Configuración NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-19: Consultor does NOT see 'Asignación de Consultores' in sidebar
(
  'consultor',
  'SV-19: Consultor NO ve Asignación de Consultores en la barra lateral',
  'Verificar que Asignación de Consultores no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Expandir menú Consultorías","expectedOutcome":"El elemento Asignación de Consultores NO es visible en el submenu"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-20: Consultor does NOT see 'Rutas de Aprendizaje' in sidebar
(
  'consultor',
  'SV-20: Consultor NO ve Rutas de Aprendizaje en la barra lateral',
  'Verificar que Rutas de Aprendizaje no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Rutas de Aprendizaje NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-21: Consultor does NOT see 'Matriz de Asignaciones' in sidebar
(
  'consultor',
  'SV-21: Consultor NO ve Matriz de Asignaciones en la barra lateral',
  'Verificar que Matriz de Asignaciones no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Matriz de Asignaciones NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-22: Consultor does NOT see 'QA Testing' in sidebar
(
  'consultor',
  'SV-22: Consultor NO ve QA Testing en la barra lateral',
  'Verificar que QA Testing no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento QA Testing NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-23: Consultor does NOT see 'Vías de Transformación' in sidebar
(
  'consultor',
  'SV-23: Consultor NO ve Vías de Transformación en la barra lateral',
  'Verificar que Vías de Transformación no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Vías de Transformación NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-24: Consultor does NOT see 'Roles y Permisos' in sidebar
(
  'consultor',
  'SV-24: Consultor NO ve Roles y Permisos en la barra lateral',
  'Verificar que Roles y Permisos no es visible (superadminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Roles y Permisos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- INTEGRITY CHECK: 1 scenario (SV-25)

-- SV-25: No duplicate sidebar items for Consultor
(
  'consultor',
  'SV-25: Verificación de integridad: No hay elementos duplicados en el sidebar',
  'Verificar que cada elemento del menú aparece exactamente una vez.',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"Se ve la estructura del menú"},{"index":3,"instruction":"Contar cada elemento de menú visible","expectedOutcome":"Cada elemento aparece exactamente una vez (sin duplicados)"}]'::jsonb,
  3, 3, true, false, false
),

-- NEW TOP-LEVEL ITEMS: 2 scenarios (SV-26 to SV-27)

-- SV-26: Consultor sees 'Mis Sesiones' as top-level sidebar item
(
  'consultor',
  'SV-26: Consultor ve Mis Sesiones como ítem de nivel superior',
  'Verificar que Mis Sesiones aparece como enlace de nivel superior en la barra lateral (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral del sistema","expectedOutcome":"Se ve el ítem Mis Sesiones como enlace de nivel superior (no dentro de un grupo)"},{"index":2,"instruction":"Hacer clic en Mis Sesiones","expectedOutcome":"Se navega a la página /consultor/sessions con la lista de sesiones del consultor"}]'::jsonb,
  2, 2, true, false, false
),

-- SV-27: Consultor sees 'Mis Reportes' as top-level sidebar item
(
  'consultor',
  'SV-27: Consultor ve Mis Reportes como ítem de nivel superior',
  'Verificar que Mis Reportes aparece como enlace de nivel superior en la barra lateral (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Observar la barra lateral del sistema","expectedOutcome":"Se ve el ítem Mis Reportes como enlace de nivel superior (no dentro de un grupo)"},{"index":2,"instruction":"Hacer clic en Mis Reportes","expectedOutcome":"Se navega a la página /consultor/sessions/reports con las analíticas de sesiones del consultor"}]'::jsonb,
  2, 2, true, false, false
);

-- ============================================================================
-- EDGE CASES - 7 SCENARIOS (EC-1 to EC-7)
-- Testing: Unusual but realistic scenarios
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- EC-1: Consultor with no school assignment tries to access dashboard
(
  'consultor',
  'EC-1: Consultor sin escuela asignada intenta acceder al dashboard',
  'Verificar que consultor sin escuela asignada recibe error o estado vacío apropiado.',
  'docente_experience',
  '[{"type":"role","description":"Existe consultor sin escuela asignada"},{"type":"navigation","description":"El consultor no tiene school_id válido"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl sin escuela asignada","expectedOutcome":"Se accede al sistema"},{"index":2,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"Se muestra mensaje de error o estado vacío apropiado"},{"index":3,"instruction":"Verificar que el sistema maneja correctamente la ausencia de escuela","expectedOutcome":"Se muestra un estado coherente sin errores de runtime"}]'::jsonb,
  4, 3, true, false, false
),

-- EC-2: Consultor assigned to school with no assessments views assessment builder
(
  'consultor',
  'EC-2: Consultor ve constructor de evaluaciones sin plantillas disponibles',
  'Verificar que se muestra estado vacío cuando no hay plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"data","description":"Escuela asignada no tiene plantillas de evaluación"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestra la página del constructor"},{"index":3,"instruction":"Verificar que se muestra estado vacío","expectedOutcome":"Se muestra mensaje como No hay plantillas de evaluación o similar"}]'::jsonb,
  4, 2, true, false, false
),

-- EC-3: Consultor has multiple role records (e.g., consultor + docente)
(
  'consultor',
  'EC-3: Consultor tiene múltiples registros de rol (consultor + docente)',
  'Verificar que los múltiples roles funcionan correctamente con validaciones.',
  'role_assignment',
  '[{"type":"role","description":"El usuario tiene roles consultor y docente asignados"},{"type":"custom","description":"Permisos se validan usando roles.some()"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como usuario con roles consultor y docente","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que las funcionalidades de consultor son accesibles","expectedOutcome":"Se muestran opciones de consultor"},{"index":3,"instruction":"Verificar que las funcionalidades de docente también son accesibles","expectedOutcome":"Se muestran opciones de docente"},{"index":4,"instruction":"Verificar que los controles de permiso validan correctamente","expectedOutcome":"Los roles se validan con roles.some() correctamente"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-4: Consultor accesses restricted pages directly via URL (bypass sidebar)
(
  'consultor',
  'EC-4: Consultor accede a páginas restringidas directamente por URL',
  'Verificar que los controles de permiso server-side se aplican cuando el consultor navega directamente a URLs restringidas.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"navigation","description":"Se accede directamente a URLs sin usar el sidebar"}]'::jsonb,
  '[{"index":1,"instruction":"Escribir directamente en la barra de direcciones la URL /admin/courses y presionar Enter","expectedOutcome":"Se redirige al dashboard del consultor o se muestra una página de acceso denegado"},{"index":2,"instruction":"Escribir directamente la URL /admin/sessions y presionar Enter","expectedOutcome":"Se redirige al dashboard del consultor o se muestra acceso denegado"},{"index":3,"instruction":"Escribir directamente la URL /admin/users y presionar Enter","expectedOutcome":"Se redirige al dashboard del consultor o se muestra acceso denegado"}]'::jsonb,
  1, 3, true, false, false
),

-- EC-5: Consultor tries to access /admin/qa pages
(
  'consultor',
  'EC-5: Consultor intenta acceder a páginas administrativas de QA',
  'Verificar que el sistema de QA administrativo está protegido.',
  'role_assignment',
  '[{"type":"role","description":"Consultor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Escenarios QA","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Intentar acceder a la página de Ejecuciones de Pruebas QA","expectedOutcome":"Se muestra página de acceso denegado"}]'::jsonb,
  1, 2, true, false, false
),

-- EC-6: Consultor session expires while on assessment builder page
(
  'consultor',
  'EC-6: Sesión del consultor expira en página de constructor de evaluaciones',
  'Verificar que el sistema maneja expiración de sesión correctamente.',
  'assessment_builder',
  '[{"type":"role","description":"Consultor autenticado"},{"type":"custom","description":"Sesión va a expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como consultor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestra la página"},{"index":3,"instruction":"Esperar a que la sesión expire (o simular expiración)","expectedOutcome":"Se redirige a página de login"},{"index":4,"instruction":"Verificar que no hay datos obsoletos visibles","expectedOutcome":"No se muestra contenido antiguo de sesión anterior"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-7: Two consultors assigned to different schools view same assessment template
(
  'consultor',
  'EC-7: Dos consultores de diferentes escuelas ven la misma plantilla de evaluación',
  'Verificar que dos consultores de escuelas diferentes pueden ver la misma plantilla global.',
  'assessment_builder',
  '[{"type":"role","description":"Dos consultores autenticados en diferentes pestañas"},{"type":"data","description":"Ambos consultores están asignados a escuelas diferentes"},{"type":"data","description":"Hay una plantilla de evaluación publicada"}]'::jsonb,
  '[{"index":1,"instruction":"Pestaña 1: Iniciar sesión como consultor.qa1@fne.cl (escuela A)","expectedOutcome":"Se accede al dashboard del consultor 1"},{"index":2,"instruction":"Pestaña 2: Iniciar sesión como consultor.qa2@fne.cl (escuela B)","expectedOutcome":"Se accede al dashboard del consultor 2"},{"index":3,"instruction":"Pestaña 1: Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestran plantillas globales"},{"index":4,"instruction":"Pestaña 2: Navegar a la página de Constructor de Evaluaciones","expectedOutcome":"Se muestran las MISMAS plantillas"},{"index":5,"instruction":"Verificar que ambos ven datos idénticos","expectedOutcome":"Las plantillas son idénticas en ambas pestañas"},{"index":6,"instruction":"Verificar que ninguno puede editar","expectedOutcome":"Ambos tienen acceso solo lectura"}]'::jsonb,
  2, 7, true, false, true
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
-- WHERE role_required = 'consultor' AND is_active = true;
