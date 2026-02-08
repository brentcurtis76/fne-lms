-- ============================================================================
-- QA Scenarios Seed Script: EQUIPO_DIRECTIVO Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: equipo_directivo
-- Total Scenarios: 68
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_EQUIPO_DIRECTIVO.md
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 14 scenarios (PB-1 to PB-14)
--   - Correct Access (Should ALLOW): 14 scenarios (CA-1 to CA-14)
--   - School Assignment Scoping: 6 scenarios (SS-1 to SS-6)
--   - Sidebar Visibility: 26 scenarios (SV-1 to SV-26)
--   - Edge Cases: 8 scenarios (EC-1 to EC-8)
--
-- PRIORITIES:
--   1 = Critical (security, authentication)
--   2 = High (role-based permissions)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'equipo_directivo' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (except if specified)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERMISSION BOUNDARIES - 14 SCENARIOS (PB-1 to PB-14)
-- Testing: What equipo_directivo CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1: Equipo Directivo tries to create a new course
(
  'equipo_directivo',
  'PB-1: Equipo Directivo intenta crear un nuevo curso',
  'Verificar que equipo directivo no puede crear cursos. El acceso debe ser denegado con error 403.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como equipo_directivo"},{"type":"navigation","description":"El usuario debe estar autenticado"},{"type":"custom","description":"El sidebar no debe mostrar el menú Cursos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard del equipo directivo"},{"index":2,"instruction":"Intentar navegar a /admin/create-course","expectedOutcome":"Se muestra página de acceso denegado o se redirige al dashboard"},{"index":3,"instruction":"Intentar POST /api/admin/courses con datos de nuevo curso","expectedOutcome":"API devuelve 403 Forbidden"},{"index":4,"instruction":"Verificar que el menú Cursos NO aparece en la barra lateral","expectedOutcome":"El elemento Cursos no es visible en el sidebar"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-2: Equipo Directivo tries to create a user
(
  'equipo_directivo',
  'PB-2: Equipo Directivo intenta crear un usuario',
  'Verificar que equipo directivo no puede crear usuarios. El acceso debe ser denegado.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como equipo_directivo"},{"type":"navigation","description":"El usuario está autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/user-management","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Intentar POST /api/admin/users con datos de nuevo usuario","expectedOutcome":"API devuelve 403 Forbidden"},{"index":4,"instruction":"Verificar que el menú Usuarios NO aparece en la barra lateral","expectedOutcome":"El elemento Usuarios no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-3: Equipo Directivo tries to edit another user's profile
(
  'equipo_directivo',
  'PB-3: Equipo Directivo intenta editar el perfil de otro usuario',
  'Verificar que equipo directivo no puede editar perfiles de otros usuarios.',
  'user_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Existe un usuario diferente en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar PUT /api/admin/update-user con datos modificados","expectedOutcome":"API devuelve 403 Forbidden"},{"index":3,"instruction":"Verificar que no hay formulario de edición de usuario disponible","expectedOutcome":"El formulario no está accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-4: Equipo Directivo tries to assign roles to users
(
  'equipo_directivo',
  'PB-4: Equipo Directivo intenta asignar roles a usuarios',
  'Verificar que equipo directivo no puede asignar roles.',
  'role_assignment',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar POST /api/admin/assign-role con datos de asignación de rol","expectedOutcome":"API devuelve 403 Forbidden"},{"index":3,"instruction":"Verificar que no hay opción de asignar roles en la UI","expectedOutcome":"La opción no es accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-5: Equipo Directivo tries to manage schools
(
  'equipo_directivo',
  'PB-5: Equipo Directivo intenta gestionar colegios',
  'Verificar que equipo directivo no puede acceder a gestión de colegios.',
  'school_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/schools","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Escuelas NO aparece en la barra lateral","expectedOutcome":"El elemento Escuelas no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-6: Equipo Directivo tries to manage network of schools
(
  'equipo_directivo',
  'PB-6: Equipo Directivo intenta gestionar red de colegios',
  'Verificar que equipo directivo no puede acceder a gestión de redes.',
  'network_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/network-management","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Redes de Colegios NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-7: Equipo Directivo tries to create an assessment template
(
  'equipo_directivo',
  'PB-7: Equipo Directivo intenta crear una plantilla de evaluación',
  'Verificar que equipo directivo no puede crear plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar POST /api/admin/assessment-builder/templates con datos de nueva plantilla","expectedOutcome":"API devuelve 403 Forbidden (hasAssessmentWritePermission retorna false)"},{"index":3,"instruction":"Verificar que los botones Crear/Editar NO aparecen en el constructor de evaluaciones","expectedOutcome":"Los botones no son visibles"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-8: Equipo Directivo tries to view assessment builder page
(
  'equipo_directivo',
  'PB-8: Equipo Directivo intenta ver página constructor de evaluaciones',
  'Verificar que equipo directivo no puede acceder al constructor de evaluaciones.',
  'assessment_builder',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/assessment-builder","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que Procesos de Cambio NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (consultantOnly: true)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-9: Equipo Directivo tries to create/edit news items
(
  'equipo_directivo',
  'PB-9: Equipo Directivo intenta crear o editar noticias',
  'Verificar que equipo directivo no puede gestionar noticias.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/news","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Noticias NO aparece en la barra lateral","expectedOutcome":"El elemento Noticias no es visible (solo para admin/community_manager)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-10: Equipo Directivo tries to create/edit events
(
  'equipo_directivo',
  'PB-10: Equipo Directivo intenta crear o editar eventos',
  'Verificar que equipo directivo no puede gestionar eventos.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/events","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Eventos NO aparece en la barra lateral","expectedOutcome":"El elemento Eventos no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-11: Equipo Directivo tries to manage contracts
(
  'equipo_directivo',
  'PB-11: Equipo Directivo intenta gestionar contratos',
  'Verificar que equipo directivo no puede acceder a gestión de contratos.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /contracts","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Gestión NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-12: Equipo Directivo tries to access system configuration
(
  'equipo_directivo',
  'PB-12: Equipo Directivo intenta acceder a configuración del sistema',
  'Verificar que equipo directivo no puede acceder a configuración.',
  'role_assignment',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/configuration","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Configuración NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (requiere manage_system_settings)"}]'::jsonb,
  1, 2, true, false, false
),

-- PB-13: Equipo Directivo tries to assign consultants
(
  'equipo_directivo',
  'PB-13: Equipo Directivo intenta asignar consultores',
  'Verificar que equipo directivo no puede asignar consultores.',
  'role_assignment',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/consultant-assignments","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Verificar que el menú Consultorías NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (consultantOnly: true)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-14: Equipo Directivo tries to assign courses to students
(
  'equipo_directivo',
  'PB-14: Equipo Directivo intenta asignar cursos a estudiantes',
  'Verificar que equipo directivo no puede asignar cursos.',
  'course_enrollment',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar POST /api/courses/batch-assign con datos de asignación","expectedOutcome":"API devuelve 403 Forbidden (can_assign_courses: false)"},{"index":3,"instruction":"Verificar que no hay interfaz de asignación de cursos disponible","expectedOutcome":"La funcionalidad no está accesible"}]'::jsonb,
  2, 3, true, false, false
);

-- ============================================================================
-- CORRECT ACCESS - 14 SCENARIOS (CA-1 to CA-14)
-- Testing: What equipo_directivo CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1: Equipo Directivo views their dashboard
(
  'equipo_directivo',
  'CA-1: Equipo Directivo visualiza su panel de control',
  'Verificar que equipo directivo puede acceder a su dashboard con datos del colegio asignado.',
  'docente_experience',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Equipo Directivo tiene escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard correctamente"},{"index":2,"instruction":"Navegar a /dashboard","expectedOutcome":"La página carga correctamente con datos del colegio asignado"},{"index":3,"instruction":"Verificar que se muestran estadísticas de la escuela asignada","expectedOutcome":"Los datos mostrados corresponden solo a la escuela asignada"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-2: Equipo Directivo views their profile
(
  'equipo_directivo',
  'CA-2: Equipo Directivo visualiza su perfil',
  'Verificar que equipo directivo puede ver y acceder a su perfil.',
  'user_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /profile","expectedOutcome":"La página de perfil carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del usuario autenticado","expectedOutcome":"El perfil muestra información correcta"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-3: Equipo Directivo views 'Mi Aprendizaje'
(
  'equipo_directivo',
  'CA-3: Equipo Directivo visualiza Mi Aprendizaje',
  'Verificar que equipo directivo puede ver la página de aprendizaje.',
  'course_enrollment',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay cursos asignados"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /mi-aprendizaje o hacer clic en menú Mi Aprendizaje","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los cursos inscritos","expectedOutcome":"Se listan los cursos disponibles"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-4: Equipo Directivo accesses quiz review page
(
  'equipo_directivo',
  'CA-4: Equipo Directivo accede a página de revisión de quizzes',
  'Verificar que equipo directivo puede ver y acceder a quizzes pendientes de revisión.',
  'quiz_submission',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay quizzes pendientes de calificar en la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /quiz-reviews (vía URL directa)","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran quizzes pendientes de la escuela asignada","expectedOutcome":"Se listan los quizzes con estado pendiente"},{"index":4,"instruction":"Nota: El sidebar NO muestra este elemento (consultantOnly: true)","expectedOutcome":"Acceso vía URL directa funciona correctamente"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-5: Equipo Directivo grades an open-ended quiz question
(
  'equipo_directivo',
  'CA-5: Equipo Directivo califica una pregunta de quiz abierta',
  'Verificar que equipo directivo puede calificar preguntas abiertas de quizzes.',
  'quiz_submission',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay un quiz con pregunta abierta pendiente de calificación"},{"type":"navigation","description":"Usuario está en página de revisión de quizzes"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /quiz-reviews","expectedOutcome":"Se muestra lista de quizzes pendientes"},{"index":3,"instruction":"Seleccionar un quiz y abrir una pregunta abierta","expectedOutcome":"Se muestra el formulario de calificación"},{"index":4,"instruction":"Ingresar una calificación y guardar","expectedOutcome":"La calificación se guarda exitosamente"}]'::jsonb,
  2, 5, true, false, false
),

-- CA-6: Equipo Directivo views pending quiz reviews
(
  'equipo_directivo',
  'CA-6: Equipo Directivo visualiza quizzes pendientes de revisión',
  'Verificar que equipo directivo puede obtener la lista de quizzes pendientes vía API.',
  'quiz_submission',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay quizzes pendientes en la escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/quiz-reviews/pending","expectedOutcome":"API devuelve 200 con lista de quizzes pendientes"},{"index":3,"instruction":"Verificar que los datos están filtrados por contexto de la escuela","expectedOutcome":"Solo se muestran quizzes de la escuela asignada"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-7: Equipo Directivo views detailed reports
(
  'equipo_directivo',
  'CA-7: Equipo Directivo visualiza reportes detallados',
  'Verificar que equipo directivo puede ver reportes de su escuela asignada.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay datos de reporte disponibles para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /detailed-reports (vía URL directa)","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran reportes filtrados por escuela asignada","expectedOutcome":"Los datos mostrados corresponden solo a la escuela asignada"},{"index":4,"instruction":"Nota: El sidebar NO muestra Reportes (consultantOnly: true)","expectedOutcome":"Acceso vía URL directa funciona correctamente"}]'::jsonb,
  2, 5, true, false, false
),

-- CA-8: Equipo Directivo views report overview
(
  'equipo_directivo',
  'CA-8: Equipo Directivo visualiza resumen de reportes',
  'Verificar que equipo directivo puede obtener resumen de reportes vía API.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay datos de reporte en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/reports/overview","expectedOutcome":"API devuelve 200 con datos de resumen"},{"index":3,"instruction":"Verificar que los datos están filtrados por escuela asignada","expectedOutcome":"Solo se muestran métricas de la escuela del usuario"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-9: Equipo Directivo views Contexto Transversal
(
  'equipo_directivo',
  'CA-9: Equipo Directivo visualiza Contexto Transversal',
  'Verificar que equipo directivo puede ver el Contexto Transversal de su escuela.',
  'school_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay contexto transversal para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /school/transversal-context (vía URL directa)","expectedOutcome":"La página carga para la escuela asignada"},{"index":3,"instruction":"Verificar que se muestran los datos de contexto","expectedOutcome":"La página muestra contenido de la escuela asignada"},{"index":4,"instruction":"Nota: El sidebar NO muestra Procesos de Cambio (consultantOnly: true)","expectedOutcome":"Acceso vía URL directa funciona correctamente"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-10: Equipo Directivo views Plan de Migración
(
  'equipo_directivo',
  'CA-10: Equipo Directivo visualiza Plan de Migración',
  'Verificar que equipo directivo puede ver el Plan de Migración de su escuela.',
  'school_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay plan de migración para la escuela asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /school/migration-plan (vía URL directa)","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del plan","expectedOutcome":"Se visualiza la información del plan de la escuela asignada"}]'::jsonb,
  3, 4, true, false, false
),

-- CA-11: Equipo Directivo views school results dashboard
(
  'equipo_directivo',
  'CA-11: Equipo Directivo visualiza dashboard de resultados escolares',
  'Verificar que equipo directivo puede acceder al dashboard de evaluaciones directivas.',
  'transformation_assessment',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay resultados de evaluación disponibles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /directivo/assessments/dashboard (vía URL directa)","expectedOutcome":"Dashboard carga con datos de transformación escolar"},{"index":3,"instruction":"Verificar que se muestran resultados de la escuela asignada","expectedOutcome":"Se visualizan métricas y evaluaciones del colegio"},{"index":4,"instruction":"Nota: El sidebar NO muestra Vías de Transformación (adminOnly: true)","expectedOutcome":"Acceso vía URL directa funciona correctamente"}]'::jsonb,
  1, 5, true, false, false
),

-- CA-12: Equipo Directivo views school assessment results API
(
  'equipo_directivo',
  'CA-12: Equipo Directivo obtiene resultados de evaluaciones escolares',
  'Verificar que equipo directivo puede obtener resultados de evaluaciones vía API.',
  'transformation_assessment',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay resultados de evaluación en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/directivo/assessments/school-results","expectedOutcome":"API devuelve 200 con resultados de la escuela"},{"index":3,"instruction":"Verificar que los datos están limitados a la escuela asignada","expectedOutcome":"Solo se muestran resultados del colegio del usuario"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-13: Equipo Directivo views course assessment results API
(
  'equipo_directivo',
  'CA-13: Equipo Directivo obtiene resultados de evaluaciones por curso',
  'Verificar que equipo directivo puede obtener resultados por curso vía API.',
  'transformation_assessment',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay resultados de evaluación por curso"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/directivo/assessments/course-results","expectedOutcome":"API devuelve 200 con resultados por curso"},{"index":3,"instruction":"Verificar que los datos están filtrados por escuela asignada","expectedOutcome":"Solo se muestran cursos de la escuela del usuario"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-14: Equipo Directivo views assignment audit log
(
  'equipo_directivo',
  'CA-14: Equipo Directivo visualiza registro de auditoría de asignaciones',
  'Verificar que equipo directivo puede acceder al log de auditoría de asignaciones.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay registros de auditoría en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/admin/assignment-matrix/audit-log","expectedOutcome":"API devuelve 200 con datos de auditoría"},{"index":3,"instruction":"Verificar que los datos están filtrados apropiadamente","expectedOutcome":"Se visualizan registros relevantes para el contexto del usuario"}]'::jsonb,
  3, 3, true, false, false
);

-- ============================================================================
-- SCHOOL ASSIGNMENT SCOPING - 6 SCENARIOS (SS-1 to SS-6)
-- Testing: Data filtering by assigned school
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SS-1: Equipo Directivo views reports — only sees data from assigned school
(
  'equipo_directivo',
  'SS-1: Equipo Directivo visualiza reportes solo de escuela asignada',
  'Verificar que los reportes filtran datos por escuela asignada del directivo.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay múltiples escuelas en el sistema"},{"type":"data","description":"El directivo está asignado a una escuela específica"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /detailed-reports","expectedOutcome":"Se muestra la página de reportes"},{"index":3,"instruction":"Observar que el filtro de escuela está preestablecido a la escuela asignada","expectedOutcome":"El filtro no se puede cambiar a otra escuela"},{"index":4,"instruction":"Verificar que no hay datos de otras escuelas visibles","expectedOutcome":"Solo se muestran datos de la escuela asignada"}]'::jsonb,
  2, 5, true, false, false
),

-- SS-2: Equipo Directivo tries to view reports for a different school (URL manipulation)
(
  'equipo_directivo',
  'SS-2: Equipo Directivo intenta ver reportes de otra escuela (manipulación de URL)',
  'Verificar que la API rechaza consultas de datos de otras escuelas.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay otra escuela en el sistema diferente a la asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /detailed-reports?school_id=OTRA_ESCUELA","expectedOutcome":"La página se carga pero no muestra datos"},{"index":3,"instruction":"Verificar la respuesta de la API para la otra escuela","expectedOutcome":"API devuelve datos vacíos (validación server-side impide acceso)"}]'::jsonb,
  2, 3, true, false, false
),

-- SS-3: Equipo Directivo views Contexto Transversal for another school (URL manipulation)
(
  'equipo_directivo',
  'SS-3: Equipo Directivo intenta ver Contexto Transversal de otra escuela',
  'Verificar que acceso al contexto está restringido a escuela asignada.',
  'school_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay otra escuela en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /school/transversal-context?school_id=OTRA_ESCUELA","expectedOutcome":"Se muestra página de acceso denegado o error 403"},{"index":3,"instruction":"Verificar que solo los datos de la escuela asignada son accesibles","expectedOutcome":"Solo la escuela asignada es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- SS-4: Equipo Directivo views filter options — only sees own school
(
  'equipo_directivo',
  'SS-4: Equipo Directivo ve opciones de filtro solo de su escuela',
  'Verificar que las opciones de filtro están limitadas a la escuela asignada.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay múltiples escuelas en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Realizar GET /api/reports/filter-options","expectedOutcome":"API devuelve opciones de filtro"},{"index":3,"instruction":"Verificar que solo aparece la escuela asignada","expectedOutcome":"Solo se muestra la escuela del directivo y sus generaciones/comunidades relacionadas"},{"index":4,"instruction":"Confirmar que no hay opción de seleccionar otras escuelas","expectedOutcome":"Las opciones están limitadas a la escuela asignada"}]'::jsonb,
  2, 4, true, false, false
),

-- SS-5: Equipo Directivo tries to view school results for another school (query param manipulation)
(
  'equipo_directivo',
  'SS-5: Equipo Directivo intenta ver resultados de otra escuela (manipulación de parámetros)',
  'Verificar que la API de resultados escolares usa school_id del usuario, no de query params.',
  'transformation_assessment',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay resultados de múltiples escuelas"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar GET /api/directivo/assessments/school-results?school_id=OTRA_ESCUELA","expectedOutcome":"API devuelve resultados solo de la escuela asignada"},{"index":3,"instruction":"Verificar que el parámetro school_id es ignorado","expectedOutcome":"La API usa school_id de user_roles, no de query params"}]'::jsonb,
  2, 3, true, false, false
),

-- SS-6: Equipo Directivo views quiz reviews — sees reviews scoped to their context
(
  'equipo_directivo',
  'SS-6: Equipo Directivo ve revisiones de quizzes limitadas a su contexto',
  'Verificar que las revisiones de quizzes están filtradas por escuela asignada.',
  'quiz_submission',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Hay quizzes pendientes de múltiples escuelas"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /quiz-reviews","expectedOutcome":"Se muestra lista de quizzes pendientes"},{"index":3,"instruction":"Verificar que solo se muestran quizzes de estudiantes de la escuela asignada","expectedOutcome":"No hay quizzes de otras escuelas visibles"},{"index":4,"instruction":"Nota: Comentario en código indica return all for now — verificar comportamiento real","expectedOutcome":"Confirmar que el filtrado funciona correctamente en runtime"}]'::jsonb,
  2, 5, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 26 SCENARIOS (SV-1 to SV-26)
-- Testing: Navigation menu visibility
-- Note: Only including key scenarios; SV-6 through SV-24 follow similar pattern
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SV-1: Equipo Directivo sees 'Mi Panel' in sidebar
(
  'equipo_directivo',
  'SV-1: Equipo Directivo ve Mi Panel en la barra lateral',
  'Verificar que el elemento Mi Panel es visible en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral izquierda","expectedOutcome":"El elemento Mi Panel es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-2: Equipo Directivo sees 'Mi Perfil' in sidebar
(
  'equipo_directivo',
  'SV-2: Equipo Directivo ve Mi Perfil en la barra lateral',
  'Verificar que el elemento Mi Perfil es visible.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Perfil es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-3: Equipo Directivo sees 'Mi Aprendizaje' in sidebar
(
  'equipo_directivo',
  'SV-3: Equipo Directivo ve Mi Aprendizaje en la barra lateral',
  'Verificar que el elemento Mi Aprendizaje es visible.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Aprendizaje es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-4: Equipo Directivo sees 'Espacio Colaborativo' in sidebar (if community member)
(
  'equipo_directivo',
  'SV-4: Equipo Directivo ve Espacio Colaborativo en la barra lateral (si tiene comunidad)',
  'Verificar que Espacio Colaborativo es visible solo si el usuario tiene community_id.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Usuario tiene community_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl con community_id","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Espacio Colaborativo es visible"},{"index":3,"instruction":"Nota: requiresCommunity: true — equipo_directivo NO está exento","expectedOutcome":"Solo visible si hay community_id"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-5: Equipo Directivo does NOT see 'Espacio Colaborativo' if no community
(
  'equipo_directivo',
  'SV-5: Equipo Directivo NO ve Espacio Colaborativo sin comunidad',
  'Verificar que Espacio Colaborativo NO es visible si no hay community_id.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Usuario NO tiene community_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl sin community_id","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Espacio Colaborativo NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-6: Feedback NOT visible
(
  'equipo_directivo',
  'SV-6: Equipo Directivo NO ve Feedback en sidebar',
  'Verificar que Feedback no es visible. restrictedRoles: [docente, admin, consultor] — equipo_directivo NO está en la lista (línea 130).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Feedback NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-7: Revisión de Quizzes NOT visible
(
  'equipo_directivo',
  'SV-7: Equipo Directivo NO ve Revisión de Quizzes en sidebar',
  'Verificar que Revisión de Quizzes no es visible. consultantOnly: true — equipo_directivo NO es admin/consultor (línea 691).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Revisión de Quizzes NO es visible (aunque la página permite acceso por URL directo)"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-8: Cursos NOT visible
(
  'equipo_directivo',
  'SV-8: Equipo Directivo NO ve Cursos en sidebar',
  'Verificar que Cursos no es visible. adminOnly: true (línea 145).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Cursos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-9: Procesos de Cambio NOT visible
(
  'equipo_directivo',
  'SV-9: Equipo Directivo NO ve Procesos de Cambio en sidebar',
  'Verificar que Procesos de Cambio no es visible. consultantOnly: true (línea 169).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Procesos de Cambio NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-10: Noticias NOT visible
(
  'equipo_directivo',
  'SV-10: Equipo Directivo NO ve Noticias en sidebar',
  'Verificar que Noticias no es visible. restrictedRoles: [admin, community_manager] (línea 200).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Noticias NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-11: Eventos NOT visible
(
  'equipo_directivo',
  'SV-11: Equipo Directivo NO ve Eventos en sidebar',
  'Verificar que Eventos no es visible. restrictedRoles: [admin, community_manager] (línea 209).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Eventos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-12: Rutas de Aprendizaje NOT visible
(
  'equipo_directivo',
  'SV-12: Equipo Directivo NO ve Rutas de Aprendizaje en sidebar',
  'Verificar que Rutas de Aprendizaje no es visible. adminOnly: true (línea 218).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Rutas de Aprendizaje NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-13: Matriz de Asignaciones NOT visible
(
  'equipo_directivo',
  'SV-13: Equipo Directivo NO ve Matriz de Asignaciones en sidebar',
  'Verificar que Matriz de Asignaciones no es visible. adminOnly: true (línea 227).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Matriz de Asignaciones NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-14: Usuarios NOT visible
(
  'equipo_directivo',
  'SV-14: Equipo Directivo NO ve Usuarios en sidebar',
  'Verificar que Usuarios no es visible. adminOnly: true (línea 235).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Usuarios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-15: Escuelas NOT visible
(
  'equipo_directivo',
  'SV-15: Equipo Directivo NO ve Escuelas en sidebar',
  'Verificar que Escuelas no es visible. adminOnly: true (línea 244).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Escuelas NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-16: Redes de Colegios NOT visible
(
  'equipo_directivo',
  'SV-16: Equipo Directivo NO ve Redes de Colegios en sidebar',
  'Verificar que Redes de Colegios no es visible. adminOnly: true (línea 253).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Redes de Colegios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-17: Consultorías NOT visible
(
  'equipo_directivo',
  'SV-17: Equipo Directivo NO ve Consultorías en sidebar',
  'Verificar que Consultorías no es visible. consultantOnly: true (línea 261).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Consultorías NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-18: Gestión NOT visible
(
  'equipo_directivo',
  'SV-18: Equipo Directivo NO ve Gestión en sidebar',
  'Verificar que Gestión no es visible. restrictedRoles: [admin, community_manager] (línea 285).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Gestión NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-19: Reportes NOT visible
(
  'equipo_directivo',
  'SV-19: Equipo Directivo NO ve Reportes en sidebar',
  'Verificar que Reportes no es visible. consultantOnly: true (línea 354). Nota: las páginas de reportes SÍ permiten acceso por URL directo.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Reportes NO es visible (aunque las páginas sí permiten acceso)"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-20: QA Testing NOT visible
(
  'equipo_directivo',
  'SV-20: Equipo Directivo NO ve QA Testing en sidebar',
  'Verificar que QA Testing no es visible. adminOnly: true (línea 362).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento QA Testing NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-21: Vías de Transformación NOT visible
(
  'equipo_directivo',
  'SV-21: Equipo Directivo NO ve Vías de Transformación en sidebar',
  'Verificar que Vías de Transformación no es visible. adminOnly: true (línea 414). Nota: las páginas subyacentes SÍ permiten acceso por URL directo.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Vías de Transformación NO es visible (aunque /directivo/assessments/dashboard sí permite acceso)"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-22: Configuración NOT visible
(
  'equipo_directivo',
  'SV-22: Equipo Directivo NO ve Configuración en sidebar',
  'Verificar que Configuración no es visible. permission: manage_system_settings (línea 474).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Configuración NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-23: Roles y Permisos NOT visible
(
  'equipo_directivo',
  'SV-23: Equipo Directivo NO ve Roles y Permisos en sidebar',
  'Verificar que Roles y Permisos no es visible. superadminOnly: true (línea 482).',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Roles y Permisos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-24: Asignación de Consultores NOT visible
(
  'equipo_directivo',
  'SV-24: Equipo Directivo NO ve Asignación de Consultores en sidebar',
  'Verificar que Asignación de Consultores no es visible. consultantOnly: true en parent Consultorías bloquea visibilidad.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Asignación de Consultores NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-25: No duplicate sidebar items
(
  'equipo_directivo',
  'SV-25: No hay elementos duplicados en sidebar para Equipo Directivo',
  'Verificar que cada elemento del menú aparece exactamente una vez.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Contar todos los elementos de la barra lateral","expectedOutcome":"Cada elemento aparece exactamente una vez, sin duplicados"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-26: Design issue — sidebar/page access mismatches
(
  'equipo_directivo',
  'SV-26: Equipo Directivo puede acceder a páginas por URL directa sin link en sidebar',
  'Verificar y documentar que hay 6 páginas accesibles por URL sin enlace en sidebar.',
  'navigation',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar directamente a /quiz-reviews","expectedOutcome":"Página carga correctamente (sidebar no muestra el enlace)"},{"index":3,"instruction":"Navegar directamente a /detailed-reports","expectedOutcome":"Página carga correctamente (sidebar no muestra Reportes)"},{"index":4,"instruction":"Navegar directamente a /admin/learning-paths","expectedOutcome":"Página carga correctamente (sidebar no muestra Rutas de Aprendizaje)"},{"index":5,"instruction":"Navegar directamente a /school/transversal-context","expectedOutcome":"Página carga correctamente (sidebar no muestra Procesos de Cambio)"},{"index":6,"instruction":"Navegar directamente a /directivo/assessments/dashboard","expectedOutcome":"Página carga correctamente (sidebar no muestra Vías de Transformación)"},{"index":7,"instruction":"Documentar este comportamiento como hallazgo, no como bug","expectedOutcome":"Decisión de PM requerida: mantener oculto o agregar enlaces específicos"}]'::jsonb,
  3, 10, true, false, false
);

-- ============================================================================
-- EDGE CASES - 8 SCENARIOS (EC-1 to EC-8)
-- Testing: Unusual but realistic scenarios
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- EC-1: Equipo Directivo with no school assignment tries to access reports
(
  'equipo_directivo',
  'EC-1: Equipo Directivo sin escuela asignada intenta acceder a reportes',
  'Verificar que directivo sin escuela asignada recibe estado vacío apropiado.',
  'reporting',
  '[{"type":"role","description":"Existe equipo_directivo sin escuela asignada"},{"type":"navigation","description":"El directivo no tiene school_id válido"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl sin school_id","expectedOutcome":"Se accede al sistema"},{"index":2,"instruction":"Navegar a /detailed-reports","expectedOutcome":"Se muestra estado vacío apropiado"},{"index":3,"instruction":"Verificar que el sistema maneja correctamente la ausencia de escuela","expectedOutcome":"Se muestra un estado coherente sin errores de runtime"}]'::jsonb,
  4, 3, true, false, false
),

-- EC-2: Equipo Directivo with no school assignment tries to access transversal context
(
  'equipo_directivo',
  'EC-2: Equipo Directivo sin escuela intenta acceder a contexto transversal',
  'Verificar que la API devuelve error 400 apropiado.',
  'school_management',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Usuario NO tiene school_id en user_roles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl sin school_id","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /school/transversal-context","expectedOutcome":"API devuelve 400: No se encontró escuela asociada al usuario"},{"index":3,"instruction":"Verificar que el error es manejado gracefully","expectedOutcome":"Se muestra mensaje de error apropiado al usuario"}]'::jsonb,
  4, 2, true, false, false
),

-- EC-3: Equipo Directivo has multiple role records
(
  'equipo_directivo',
  'EC-3: Equipo Directivo tiene múltiples registros de rol',
  'Verificar que los múltiples roles funcionan correctamente con validaciones.',
  'role_assignment',
  '[{"type":"role","description":"El usuario tiene roles equipo_directivo y docente asignados"},{"type":"custom","description":"Permisos se validan usando roles.some()"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como usuario con roles equipo_directivo y docente","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que las funcionalidades de equipo_directivo son accesibles","expectedOutcome":"Se muestran opciones de equipo directivo"},{"index":3,"instruction":"Verificar que las funcionalidades de docente también son accesibles","expectedOutcome":"Se muestran opciones de docente"},{"index":4,"instruction":"Verificar que getUserPrimaryRole devuelve equipo_directivo (prioridad #3)","expectedOutcome":"Los roles se priorizan correctamente"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-4: Equipo Directivo accesses API endpoints directly via URL
(
  'equipo_directivo',
  'EC-4: Equipo Directivo accede a API directamente (bypass de UI)',
  'Verificar que los controles de permiso server-side se aplican sin importar cómo se accede.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"navigation","description":"Se accede directamente a API sin UI"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se obtiene sesión válida"},{"index":2,"instruction":"Intentar POST /api/admin/courses directamente","expectedOutcome":"API devuelve 403 Forbidden (permiso denegado)"},{"index":3,"instruction":"Intentar GET /api/reports/detailed directamente","expectedOutcome":"API devuelve 200 OK (lectura permitida)"},{"index":4,"instruction":"Verificar que todos los endpoints tienen auth independiente","expectedOutcome":"Cada API valida roles server-side"}]'::jsonb,
  2, 3, true, false, false
),

-- EC-5: Equipo Directivo tries to access /admin/qa pages
(
  'equipo_directivo',
  'EC-5: Equipo Directivo intenta acceder a páginas administrativas de QA',
  'Verificar que el sistema de QA administrativo está protegido.',
  'role_assignment',
  '[{"type":"role","description":"Equipo Directivo autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /admin/qa-scenarios","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que se renderiza mensaje: Solo administradores pueden acceder al panel de QA","expectedOutcome":"Mensaje de error apropiado es visible"}]'::jsonb,
  1, 2, true, false, false
),

-- EC-6: Equipo Directivo session expires while on reports page
(
  'equipo_directivo',
  'EC-6: Sesión del Equipo Directivo expira en página de reportes',
  'Verificar que el sistema maneja expiración de sesión correctamente.',
  'reporting',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"custom","description":"Sesión va a expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /detailed-reports","expectedOutcome":"Se muestra la página"},{"index":3,"instruction":"Esperar a que la sesión expire (o simular expiración)","expectedOutcome":"Se redirige a página de login"},{"index":4,"instruction":"Verificar que no hay datos obsoletos visibles","expectedOutcome":"No se muestra contenido antiguo de sesión anterior"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-7: Equipo Directivo with community_id accesses Espacio Colaborativo
(
  'equipo_directivo',
  'EC-7: Equipo Directivo con community_id accede a Espacio Colaborativo',
  'Verificar que el workspace carga correctamente para miembros de comunidad.',
  'collaborative_space',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Usuario tiene community_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl con community_id","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a /community/workspace","expectedOutcome":"Workspace carga correctamente"},{"index":3,"instruction":"Verificar que getUserWorkspaceAccess retorna community_member accessType","expectedOutcome":"El usuario tiene acceso apropiado al workspace"}]'::jsonb,
  3, 4, true, false, false
),

-- EC-8: Equipo Directivo without community_id tries to access workspace
(
  'equipo_directivo',
  'EC-8: Equipo Directivo sin community_id intenta acceder a workspace',
  'Verificar que el acceso es denegado sin membresía de comunidad.',
  'collaborative_space',
  '[{"type":"role","description":"Equipo Directivo autenticado"},{"type":"data","description":"Usuario NO tiene community_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como directivo.qa@fne.cl sin community_id","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar navegar a /community/workspace","expectedOutcome":"Se muestra página de acceso denegado o error"},{"index":3,"instruction":"Verificar que requiresCommunity filter funciona correctamente","expectedOutcome":"Acceso denegado sin community_id"}]'::jsonb,
  3, 3, true, false, false
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
-- WHERE role_required = 'equipo_directivo' AND is_active = true;
