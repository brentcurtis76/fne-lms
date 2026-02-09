-- ============================================================================
-- QA Scenarios Seed Script: ADMIN Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: admin
-- Total Scenarios: 129
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_ADMIN.md (created 2026-02-08)
--
-- CATEGORIES:
--   - Correct Access (Should ALLOW): 40 scenarios (CA-1 to CA-40)
--   - Sidebar Visibility (Should be VISIBLE): 47 scenarios (SV-1 to SV-47)
--   - Sidebar Visibility (Should NOT be visible): 2 scenarios (SV-48 to SV-49)
--   - CRUD Operations: 15 scenarios (CRUD-1 to CRUD-15)
--   - Global Scope Verification: 8 scenarios (GS-1 to GS-8)
--   - Regression Tests: 10 scenarios (RG-1 to RG-10)
--   - Edge Cases: 7 scenarios (EC-1 to EC-7)
--
-- PRIORITIES:
--   1 = Critical (security, authentication, global access)
--   2 = High (role-based permissions, CRUD operations)
--   3 = Medium (sidebar visibility, reporting scope)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'admin' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (single-user scenarios)
-- ============================================================================

BEGIN;

-- ============================================================================
-- CORRECT ACCESS - 40 SCENARIOS (CA-1 to CA-40)
-- Testing: What admins CAN do (should allow full access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1: Admin views dashboard
(
  'admin',
  'CA-1: Admin ve el dashboard con datos globales',
  'Verificar que administradores pueden ver el dashboard con datos de todas las escuelas (alcance global).',
  'dashboard',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"navigation","description":"El usuario admin debe estar autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como admin.qa@fne.cl","expectedOutcome":"Se accede al dashboard del admin"},{"index":2,"instruction":"Verificar que el dashboard muestra métricas globales (todas las escuelas)","expectedOutcome":"Se muestran datos de todas las escuelas, no filtrados por escuela"},{"index":3,"instruction":"Verificar que no hay restricciones de alcance","expectedOutcome":"El alcance de reportes es global"}]'::jsonb,
  1, 2, true, false, false
),

-- CA-2: Admin views profile
(
  'admin',
  'CA-2: Admin ve su perfil',
  'Verificar que administradores pueden ver su página de perfil.',
  'user_profile',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /profile","expectedOutcome":"La página de perfil carga correctamente"},{"index":2,"instruction":"Verificar que se muestran los datos del perfil","expectedOutcome":"Se muestra información personal del admin"}]'::jsonb,
  3, 1, true, false, false
),

-- CA-3: Admin views Mi Aprendizaje
(
  'admin',
  'CA-3: Admin accede a Mi Aprendizaje',
  'Verificar que administradores pueden ver la página Mi Aprendizaje con todos los cursos.',
  'learning',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /mi-aprendizaje","expectedOutcome":"La página Mi Aprendizaje carga correctamente"},{"index":2,"instruction":"Verificar que se muestran todos los cursos disponibles","expectedOutcome":"Se muestra la lista completa de cursos"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-4: Admin creates course
(
  'admin',
  'CA-4: Admin crea un nuevo curso',
  'Verificar que administradores pueden crear cursos nuevos. El acceso debe ser permitido con éxito.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_create_courses: true"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/create-course","expectedOutcome":"La página de creación de curso carga correctamente"},{"index":2,"instruction":"Completar el formulario de nuevo curso con datos válidos","expectedOutcome":"El formulario acepta los datos"},{"index":3,"instruction":"Enviar POST /api/admin/courses con datos de nuevo curso","expectedOutcome":"API devuelve 201 Created"},{"index":4,"instruction":"Verificar que el curso aparece en la lista de cursos","expectedOutcome":"El nuevo curso es visible"}]'::jsonb,
  1, 5, true, false, false
),

-- CA-5: Admin edits course
(
  'admin',
  'CA-5: Admin edita un curso existente',
  'Verificar que administradores pueden editar cualquier curso existente.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un curso en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/course-builder/[courseId]/edit","expectedOutcome":"La página de edición carga correctamente"},{"index":2,"instruction":"Modificar datos del curso","expectedOutcome":"Los cambios se guardan exitosamente"},{"index":3,"instruction":"Verificar que los cambios se reflejan en el curso","expectedOutcome":"El curso muestra los datos actualizados"}]'::jsonb,
  2, 4, true, false, false
),

-- CA-6: Admin deletes course
(
  'admin',
  'CA-6: Admin elimina un curso',
  'Verificar que administradores pueden eliminar cursos.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe un curso sin dependencias"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un curso para eliminar","expectedOutcome":"El curso es seleccionado"},{"index":2,"instruction":"Enviar DELETE /api/admin/courses/[id]","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que el curso ya no aparece en la lista","expectedOutcome":"El curso fue eliminado"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-7: Admin creates user
(
  'admin',
  'CA-7: Admin crea un nuevo usuario',
  'Verificar que administradores pueden crear usuarios nuevos.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_create_users: true"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/user-management","expectedOutcome":"La página de gestión de usuarios carga"},{"index":2,"instruction":"Hacer clic en crear nuevo usuario","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y enviar POST /api/admin/create-user","expectedOutcome":"API devuelve 201 Created"},{"index":4,"instruction":"Verificar que el usuario aparece en la lista","expectedOutcome":"El nuevo usuario es visible"}]'::jsonb,
  1, 4, true, false, false
),

-- CA-8: Admin edits user
(
  'admin',
  'CA-8: Admin edita el perfil de cualquier usuario',
  'Verificar que administradores pueden editar perfiles de cualquier usuario.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un usuario en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un usuario para editar","expectedOutcome":"Se abre el formulario de edición"},{"index":2,"instruction":"Modificar datos del usuario y enviar PUT /api/admin/update-user","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"El perfil muestra los datos actualizados"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-9: Admin deletes user
(
  'admin',
  'CA-9: Admin elimina un usuario',
  'Verificar que administradores pueden eliminar usuarios.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe un usuario sin dependencias críticas"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un usuario para eliminar","expectedOutcome":"El usuario es seleccionado"},{"index":2,"instruction":"Enviar DELETE /api/admin/delete-user","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que el usuario ya no aparece","expectedOutcome":"El usuario fue eliminado"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-10: Admin assigns roles
(
  'admin',
  'CA-10: Admin asigna roles a usuarios',
  'Verificar que administradores pueden asignar roles a cualquier usuario.',
  'role_assignment',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_assign_roles: true"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un usuario para asignar rol","expectedOutcome":"El usuario es seleccionado"},{"index":2,"instruction":"Seleccionar un rol y enviar POST /api/admin/roles/permissions","expectedOutcome":"API devuelve 201 Created"},{"index":3,"instruction":"Verificar que el rol fue asignado","expectedOutcome":"El usuario muestra el nuevo rol"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-11 through CA-15: School and Network Management
(
  'admin',
  'CA-11: Admin crea una nueva escuela',
  'Verificar que administradores pueden crear escuelas nuevas.',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_manage_schools: true"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/schools","expectedOutcome":"La página de escuelas carga"},{"index":2,"instruction":"Hacer clic en crear nueva escuela","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y enviar POST /api/admin/schools","expectedOutcome":"API devuelve 201 Created"},{"index":4,"instruction":"Verificar que la escuela aparece en la lista","expectedOutcome":"La nueva escuela es visible"}]'::jsonb,
  1, 4, true, false, false
),

(
  'admin',
  'CA-12: Admin edita una escuela',
  'Verificar que administradores pueden editar cualquier escuela.',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar una escuela para editar","expectedOutcome":"Se abre el formulario de edición"},{"index":2,"instruction":"Modificar datos y enviar PUT /api/admin/schools/[id]","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"La escuela muestra los datos actualizados"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-13: Admin elimina una escuela',
  'Verificar que administradores pueden eliminar escuelas sin dependencias.',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe una escuela sin dependencias"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar una escuela para eliminar","expectedOutcome":"La escuela es seleccionada"},{"index":2,"instruction":"Enviar DELETE /api/admin/schools/[id]","expectedOutcome":"API devuelve 200 OK o error si hay dependencias"},{"index":3,"instruction":"Verificar resultado","expectedOutcome":"Si no hay dependencias, la escuela fue eliminada"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-14: Admin crea una red de colegios',
  'Verificar que administradores pueden crear redes de colegios.',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/network-management","expectedOutcome":"La página de redes carga"},{"index":2,"instruction":"Hacer clic en crear nueva red","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y enviar POST /api/admin/networks","expectedOutcome":"API devuelve 201 Created"},{"index":4,"instruction":"Verificar que la red aparece en la lista","expectedOutcome":"La nueva red es visible"}]'::jsonb,
  1, 4, true, false, false
),

(
  'admin',
  'CA-15: Admin asigna escuelas a una red',
  'Verificar que administradores pueden asignar escuelas a redes.',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una red y una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar una red","expectedOutcome":"La red es seleccionada"},{"index":2,"instruction":"Seleccionar escuelas para asignar y enviar POST /api/admin/networks/schools","expectedOutcome":"API devuelve 201 Created"},{"index":3,"instruction":"Verificar que las escuelas fueron asignadas","expectedOutcome":"Las escuelas aparecen en la red"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-16 through CA-21: Assessment and Quiz Management
(
  'admin',
  'CA-16: Admin ve plantillas de evaluación',
  'Verificar que administradores pueden ver todas las plantillas de evaluación globalmente.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/assessment-builder","expectedOutcome":"La página de evaluaciones carga"},{"index":2,"instruction":"Verificar que se muestran todas las plantillas","expectedOutcome":"Se ven plantillas de todas las escuelas"},{"index":3,"instruction":"Enviar GET /api/admin/assessment-builder/templates","expectedOutcome":"API devuelve 200 OK con todas las plantillas"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-17: Admin crea plantilla de evaluación',
  'Verificar que administradores pueden crear plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"En /admin/assessment-builder, hacer clic en crear plantilla","expectedOutcome":"El formulario de creación se muestra"},{"index":2,"instruction":"Completar formulario y enviar POST /api/admin/assessment-builder/templates","expectedOutcome":"API devuelve 201 Created (hasAssessmentWritePermission=true para admin)"},{"index":3,"instruction":"Verificar que la plantilla aparece en la lista","expectedOutcome":"La nueva plantilla es visible"}]'::jsonb,
  1, 5, true, false, false
),

(
  'admin',
  'CA-18: Admin edita plantilla de evaluación',
  'Verificar que administradores pueden editar cualquier plantilla de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una plantilla"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar una plantilla para editar","expectedOutcome":"Se abre el editor de plantilla"},{"index":2,"instruction":"Modificar datos y enviar PUT /api/admin/assessment-builder/templates/[id]","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"La plantilla muestra los datos actualizados"}]'::jsonb,
  2, 4, true, false, false
),

(
  'admin',
  'CA-19: Admin elimina plantilla de evaluación',
  'Verificar que administradores pueden eliminar plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe una plantilla sin dependencias"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar una plantilla para eliminar","expectedOutcome":"La plantilla es seleccionada"},{"index":2,"instruction":"Enviar DELETE /api/admin/assessment-builder/templates/[id]","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que la plantilla ya no aparece","expectedOutcome":"La plantilla fue eliminada"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-20: Admin accede a revisión de quizzes',
  'Verificar que administradores pueden acceder a la página de revisión de quizzes.',
  'quiz_grading',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /quiz-reviews","expectedOutcome":"La página de revisión de quizzes carga"},{"index":2,"instruction":"Verificar que se muestran quizzes pendientes de todas las escuelas","expectedOutcome":"Se ven quizzes de todas las escuelas (alcance global)"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-21: Admin califica un quiz abierto',
  'Verificar que administradores pueden calificar preguntas abiertas de quizzes.',
  'quiz_grading',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un quiz pendiente de calificación"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un quiz para calificar","expectedOutcome":"Se abre la interfaz de calificación"},{"index":2,"instruction":"Ingresar calificación y comentarios","expectedOutcome":"Los datos son aceptados"},{"index":3,"instruction":"Enviar calificación (allowedRoles incluye admin)","expectedOutcome":"La calificación se guarda exitosamente"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-22 through CA-29: Reporting and Planning
(
  'admin',
  'CA-22: Admin ve reportes detallados con alcance global',
  'Verificar que administradores ven reportes con datos de TODAS las escuelas (alcance global).',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /detailed-reports","expectedOutcome":"La página de reportes carga"},{"index":2,"instruction":"Enviar POST /api/reports/detailed sin filtros de escuela","expectedOutcome":"API devuelve 200 OK con datos de TODAS las escuelas"},{"index":3,"instruction":"Verificar que no hay filtro de escuela pre-aplicado","expectedOutcome":"El reporte muestra alcance global"}]'::jsonb,
  1, 3, true, false, false
),

(
  'admin',
  'CA-23: Admin ve opciones de filtro globales',
  'Verificar que administradores ven TODAS las escuelas/generaciones/comunidades en filtros (sin restricción).',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar GET /api/reports/filter-options","expectedOutcome":"API devuelve 200 OK"},{"index":2,"instruction":"Verificar que se retornan TODAS las escuelas sin filtro","expectedOutcome":"La lista de escuelas es completa (alcance global)"},{"index":3,"instruction":"Verificar que se retornan TODAS las generaciones y comunidades","expectedOutcome":"Las listas son completas sin restricción"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-24: Admin ve detalles de cualquier usuario',
  'Verificar que administradores pueden ver detalles de CUALQUIER usuario sin restricción.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un usuario en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un usuario cualquiera","expectedOutcome":"El usuario es seleccionado"},{"index":2,"instruction":"Enviar GET /api/reports/user-details?userId=X","expectedOutcome":"API devuelve 200 OK con detalles completos (admin bypass en línea 137)"},{"index":3,"instruction":"Verificar que no hay restricción de acceso","expectedOutcome":"Se muestran todos los detalles del usuario"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-25: Admin ve Contexto Transversal de cualquier escuela',
  'Verificar que administradores pueden ver el Contexto Transversal de CUALQUIER escuela.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una escuela con contexto transversal"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /school/transversal-context?school_id=X (cualquier ID)","expectedOutcome":"La página carga exitosamente"},{"index":2,"instruction":"Verificar que se muestra el contexto de la escuela seleccionada","expectedOutcome":"El contexto transversal es visible"},{"index":3,"instruction":"Probar con otra escuela diferente","expectedOutcome":"Funciona sin restricción para cualquier escuela"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-26: Admin edita Contexto Transversal de cualquier escuela',
  'Verificar que administradores pueden editar el Contexto Transversal de CUALQUIER escuela.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"En /school/transversal-context?school_id=X, modificar datos","expectedOutcome":"Los cambios son aceptados"},{"index":2,"instruction":"Enviar POST /api/school/transversal-context con school_id","expectedOutcome":"API devuelve 200 OK (hasDirectivoPermission permite admin)"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"El contexto muestra los datos actualizados"}]'::jsonb,
  2, 4, true, false, false
),

(
  'admin',
  'CA-27: Admin ve Plan de Migración de cualquier escuela',
  'Verificar que administradores pueden ver el Plan de Migración de CUALQUIER escuela.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /school/migration-plan?school_id=X (cualquier ID)","expectedOutcome":"La página carga exitosamente"},{"index":2,"instruction":"Verificar que se muestra el plan de la escuela seleccionada","expectedOutcome":"El plan de migración es visible"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-28: Admin edita Plan de Migración de cualquier escuela',
  'Verificar que administradores pueden editar el Plan de Migración de CUALQUIER escuela.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"En /school/migration-plan, modificar datos del plan","expectedOutcome":"Los cambios son aceptados"},{"index":2,"instruction":"Enviar POST /api/school/migration-plan","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"El plan muestra los datos actualizados"}]'::jsonb,
  2, 4, true, false, false
),

(
  'admin',
  'CA-29: Admin ve vista de tareas grupales',
  'Verificar que administradores pueden acceder a la vista de monitoreo de tareas grupales.',
  'group_assignments',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/assignment-overview","expectedOutcome":"La página de vista de tareas carga"},{"index":2,"instruction":"Verificar que se muestran tareas de todas las escuelas","expectedOutcome":"Se ven tareas grupales globalmente"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-30 through CA-40: News, Events, Paths, Contracts, Workspace
(
  'admin',
  'CA-30: Admin crea artículo de noticias',
  'Verificar que administradores pueden crear artículos de noticias.',
  'news_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/news","expectedOutcome":"La página de noticias carga"},{"index":2,"instruction":"Hacer clic en crear nuevo artículo","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y enviar POST /api/admin/news","expectedOutcome":"API devuelve 201 Created (admin en allowed roles)"},{"index":4,"instruction":"Verificar que el artículo aparece en la lista","expectedOutcome":"El nuevo artículo es visible"}]'::jsonb,
  2, 4, true, false, false
),

(
  'admin',
  'CA-31: Admin edita artículo de noticias',
  'Verificar que administradores pueden editar artículos de noticias existentes.',
  'news_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un artículo"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar un artículo para editar","expectedOutcome":"Se abre el editor"},{"index":2,"instruction":"Modificar datos y enviar PUT /api/admin/news/[id]","expectedOutcome":"API devuelve 200 OK"},{"index":3,"instruction":"Verificar que los cambios se guardaron","expectedOutcome":"El artículo muestra los datos actualizados"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-32: Admin crea evento',
  'Verificar que administradores pueden crear eventos.',
  'event_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/events","expectedOutcome":"La página de eventos carga"},{"index":2,"instruction":"Hacer clic en crear nuevo evento","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y guardar","expectedOutcome":"El evento se crea exitosamente (RLS permite admin + community_manager)"}]'::jsonb,
  2, 4, true, false, false
),

(
  'admin',
  'CA-33: Admin crea ruta de aprendizaje',
  'Verificar que administradores pueden crear rutas de aprendizaje.',
  'learning_paths',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/learning-paths/new","expectedOutcome":"La página de creación de ruta carga"},{"index":2,"instruction":"Completar formulario de nueva ruta","expectedOutcome":"El formulario acepta los datos"},{"index":3,"instruction":"Guardar la ruta","expectedOutcome":"La ruta se crea exitosamente"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CA-34: Admin asigna ruta de aprendizaje',
  'Verificar que administradores pueden asignar rutas de aprendizaje a usuarios.',
  'learning_paths',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una ruta y un usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/learning-paths/[id]/assign","expectedOutcome":"La página de asignación carga"},{"index":2,"instruction":"Seleccionar usuarios y asignar la ruta","expectedOutcome":"La asignación se completa exitosamente"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-35: Admin crea contrato',
  'Verificar que administradores pueden crear contratos.',
  'contract_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /contracts","expectedOutcome":"La página de contratos carga"},{"index":2,"instruction":"Hacer clic en crear nuevo contrato","expectedOutcome":"El formulario de creación se muestra"},{"index":3,"instruction":"Completar formulario y guardar","expectedOutcome":"El contrato se crea exitosamente (RLS admin-only INSERT)"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CA-36: Admin asigna consultor a escuela',
  'Verificar que administradores pueden asignar consultores a escuelas.',
  'consultant_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un consultor y una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/consultant-assignments","expectedOutcome":"La página de asignaciones carga"},{"index":2,"instruction":"Seleccionar consultor y escuela","expectedOutcome":"La selección es aceptada"},{"index":3,"instruction":"Enviar POST /api/admin/consultant-assignments","expectedOutcome":"API devuelve 201 Created (checkIsAdmin en línea 18)"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'CA-37: Admin accede a configuración del sistema',
  'Verificar que administradores pueden acceder a la configuración del sistema.',
  'system_configuration',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/configuration","expectedOutcome":"La página de configuración carga (admin check en línea 82-97)"},{"index":2,"instruction":"Verificar que se muestran opciones de configuración","expectedOutcome":"Las opciones de configuración son visibles"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'CA-38: Admin gestiona tipos de notificaciones',
  'Verificar que administradores pueden gestionar tipos de notificaciones del sistema.',
  'notification_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Acceder a gestión de notificaciones","expectedOutcome":"La interfaz de gestión se muestra"},{"index":2,"instruction":"Enviar POST /api/admin/notification-types con datos de tipo","expectedOutcome":"API devuelve 200 OK (metadataHasRole admin en línea 64-71)"}]'::jsonb,
  3, 3, true, false, false
),

(
  'admin',
  'CA-39: Admin accede a Espacio Colaborativo',
  'Verificar que administradores pueden acceder al Espacio Colaborativo sin restricción de comunidad.',
  'workspace',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /community/workspace","expectedOutcome":"El workspace carga sin restricción"},{"index":2,"instruction":"Verificar que admin bypassa requiresCommunity","expectedOutcome":"El acceso es permitido (hasCommunity=true en Sidebar línea 561-563)"}]'::jsonb,
  3, 2, true, false, false
),

(
  'admin',
  'CA-40: Admin accede a evaluaciones de transformación',
  'Verificar que administradores pueden acceder a todas las evaluaciones de transformación.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/transformation/assessments","expectedOutcome":"La página de evaluaciones carga"},{"index":2,"instruction":"Verificar que se muestran evaluaciones de todas las escuelas","expectedOutcome":"Se ven evaluaciones globalmente"}]'::jsonb,
  2, 2, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - SHOULD BE VISIBLE - 47 SCENARIOS (SV-1 to SV-47)
-- Testing: Navigation items that admin SHOULD see
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SV-1 through SV-47: All sidebar visibility scenarios (47 total)
(
  'admin',
  'SV-1: Admin ve Mi Panel en sidebar',
  'Verificar que el menú Mi Panel es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Mi Panel aparece en la barra lateral","expectedOutcome":"El elemento Mi Panel es visible (sin restricciones)"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-2: Admin ve Mi Perfil en sidebar',
  'Verificar que el menú Mi Perfil es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Mi Perfil aparece en la barra lateral","expectedOutcome":"El elemento Mi Perfil es visible (sin restricciones)"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-3: Admin ve Mi Aprendizaje (parent) en sidebar',
  'Verificar que el menú Mi Aprendizaje es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Mi Aprendizaje aparece en la barra lateral","expectedOutcome":"El elemento Mi Aprendizaje es visible (sin restricciones)"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-4: Admin ve Mis Cursos en sidebar',
  'Verificar que el submenú Mis Cursos es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Mi Aprendizaje","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Mis Cursos aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-5: Admin ve Mis Tareas en sidebar',
  'Verificar que el submenú Mis Tareas es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Mi Aprendizaje","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Mis Tareas aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-6: Admin ve Feedback en sidebar',
  'Verificar que el menú Feedback es visible para administradores (restrictedRoles incluye admin).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Feedback aparece en la barra lateral","expectedOutcome":"El elemento Feedback es visible (admin en restrictedRoles, Sidebar línea 720)"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-7: Admin ve Revisión de Quizzes en sidebar',
  'Verificar que el menú Revisión de Quizzes es visible para administradores (bypassa consultantOnly).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Revisión de Quizzes aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa consultantOnly, Sidebar línea 691)"}]'::jsonb,
  3, 1, true, false, false
),

(
  'admin',
  'SV-8: Admin ve Cursos (parent) en sidebar',
  'Verificar que el menú Cursos es visible para administradores (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Cursos aparece en la barra lateral","expectedOutcome":"El elemento Cursos es visible (isAdmin=true, Sidebar línea 686)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-9: Admin ve Constructor de Cursos en sidebar',
  'Verificar que el submenú Constructor de Cursos es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Cursos","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Constructor de Cursos aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-10: Admin ve Próximos Cursos en sidebar',
  'Verificar que el submenú Próximos Cursos es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Cursos","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Próximos Cursos aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-11: Admin ve Procesos de Cambio (parent) en sidebar',
  'Verificar que el menú Procesos de Cambio es visible para administradores (bypassa consultantOnly).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Procesos de Cambio aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa consultantOnly)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-12: Admin ve Constructor en sidebar',
  'Verificar que el submenú Constructor es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Procesos de Cambio","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Constructor aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-13: Admin ve Contexto Transversal en sidebar',
  'Verificar que el submenú Contexto Transversal es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Procesos de Cambio","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Contexto Transversal aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-14: Admin ve Plan de Migración en sidebar',
  'Verificar que el submenú Plan de Migración es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Procesos de Cambio","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Plan de Migración aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-15: Admin ve Noticias en sidebar',
  'Verificar que el menú Noticias es visible para administradores (restrictedRoles incluye admin).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Noticias aparece en la barra lateral","expectedOutcome":"El elemento Noticias es visible (admin en restrictedRoles)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-16: Admin ve Eventos en sidebar',
  'Verificar que el menú Eventos es visible para administradores (restrictedRoles incluye admin).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Eventos aparece en la barra lateral","expectedOutcome":"El elemento Eventos es visible (admin en restrictedRoles)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-17: Admin ve Rutas de Aprendizaje en sidebar',
  'Verificar que el menú Rutas de Aprendizaje es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Rutas de Aprendizaje aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-18: Admin ve Matriz de Asignaciones en sidebar',
  'Verificar que el menú Matriz de Asignaciones es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Matriz de Asignaciones aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-19: Admin ve Usuarios en sidebar',
  'Verificar que el menú Usuarios es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Usuarios aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-20: Admin ve Escuelas en sidebar',
  'Verificar que el menú Escuelas es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Escuelas aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-21: Admin ve Redes de Colegios en sidebar',
  'Verificar que el menú Redes de Colegios es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Redes de Colegios aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-22: Admin ve Consultorías (parent) en sidebar',
  'Verificar que el menú Consultorías es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Consultorías aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa consultantOnly)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-23: Admin ve Asignación de Consultores en sidebar',
  'Verificar que el submenú Asignación de Consultores es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Consultorías","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Asignación de Consultores aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-24: Admin ve Vista de Tareas en sidebar',
  'Verificar que el submenú Vista de Tareas es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Consultorías","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Vista de Tareas aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-25: Admin ve Gestión (parent) en sidebar',
  'Verificar que el menú Gestión es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Gestión aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin en restrictedRoles)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-26: Admin ve Clientes en sidebar',
  'Verificar que el submenú Clientes es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Gestión","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Clientes aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-27: Admin ve Contratos en sidebar',
  'Verificar que el submenú Contratos es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Gestión","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Contratos aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-28: Admin ve Propuestas Pasantías en sidebar',
  'Verificar que el submenú Propuestas Pasantías es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Gestión","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Propuestas Pasantías aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-29: Admin ve Rendición de Gastos en sidebar',
  'Verificar que el submenú Rendición de Gastos es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Gestión","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Rendición de Gastos aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-30: Admin ve Soporte Técnico en sidebar',
  'Verificar que el submenú Soporte Técnico es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Gestión","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Soporte Técnico aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-31: Admin ve Reportes en sidebar',
  'Verificar que el menú Reportes es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Reportes aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa consultantOnly y permission)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-32: Admin ve QA Testing (parent) en sidebar',
  'Verificar que el menú QA Testing es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que QA Testing aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-33: Admin ve Ejecutar Pruebas en sidebar',
  'Verificar que el submenú Ejecutar Pruebas es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Ejecutar Pruebas aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-34: Admin ve Panel de QA en sidebar',
  'Verificar que el submenú Panel de QA es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Panel de QA aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-35: Admin ve Escenarios en sidebar',
  'Verificar que el submenú Escenarios es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Escenarios aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-36: Admin ve Importar en sidebar',
  'Verificar que el submenú Importar es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Importar aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-37: Admin ve Registro de Horas en sidebar',
  'Verificar que el submenú Registro de Horas es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Registro de Horas aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-38: Admin ve Generador en sidebar',
  'Verificar que el submenú Generador es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú QA Testing","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Generador aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-39: Admin ve Vías de Transformación (parent) en sidebar',
  'Verificar que el menú Vías de Transformación es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Vías de Transformación aparece en la barra lateral","expectedOutcome":"El elemento es visible (adminOnly: true)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-40: Admin ve Mis Evaluaciones en sidebar',
  'Verificar que el submenú Mis Evaluaciones es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Vías de Transformación","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Mis Evaluaciones aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-41: Admin ve Contexto Transversal (Vías) en sidebar',
  'Verificar que el submenú Contexto Transversal es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Vías de Transformación","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Contexto Transversal aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-42: Admin ve Panel de Resultados en sidebar',
  'Verificar que el submenú Panel de Resultados es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Vías de Transformación","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Panel de Resultados aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-43: Admin ve Todas las Evaluaciones en sidebar',
  'Verificar que el submenú Todas las Evaluaciones es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Vías de Transformación","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Todas las Evaluaciones aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-44: Admin ve Espacio Colaborativo (parent) en sidebar',
  'Verificar que el menú Espacio Colaborativo es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Espacio Colaborativo aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa requiresCommunity)"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-45: Admin ve Vista General en sidebar',
  'Verificar que el submenú Vista General es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Espacio Colaborativo","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Vista General aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-46: Admin ve Gestión Comunidades en sidebar',
  'Verificar que el submenú Gestión Comunidades es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Expandir menú Espacio Colaborativo","expectedOutcome":"El menú se expande"},{"index":2,"instruction":"Verificar que Gestión Comunidades aparece","expectedOutcome":"El submenú es visible"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-47: Admin ve Configuración en sidebar',
  'Verificar que el menú Configuración es visible para administradores.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Configuración aparece en la barra lateral","expectedOutcome":"El elemento es visible (admin bypassa permission)"}]'::jsonb,
  2, 1, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - SHOULD NOT BE VISIBLE - 2 SCENARIOS (SV-48 to SV-49)
-- Testing: Items admin should NOT see (unless superadmin)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'admin',
  'SV-48: Admin NO ve Roles y Permisos si no es superadmin',
  'Verificar que admin normal NO ve el menú Roles y Permisos (requiere superadminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"custom","description":"Admin NO está en tabla superadmins"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que Roles y Permisos NO aparece en sidebar","expectedOutcome":"El elemento NO es visible (superadminOnly bloquea, Sidebar línea 670-682)"},{"index":2,"instruction":"Verificar que feature flag FEATURE_SUPERADMIN_RBAC está revisado","expectedOutcome":"Solo visible si admin en superadmins Y flag enabled"}]'::jsonb,
  2, 1, true, false, false
),

(
  'admin',
  'SV-49: Admin sidebar NO tiene items duplicados',
  'Verificar que no hay elementos duplicados en el sidebar del admin.',
  'navigation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Revisar todos los items del sidebar","expectedOutcome":"24 items únicos de nivel superior: dashboard, profile, mi-aprendizaje, docente-assessments, quiz-reviews, courses, assessment-builder, news, events, learning-paths, assignment-matrix, users, schools, networks, consultants, gestion, reports, qa-testing, vias-transformacion, workspace, admin, rbac"},{"index":2,"instruction":"Verificar que no hay duplicados","expectedOutcome":"Cada item aparece exactamente una vez"}]'::jsonb,
  3, 2, true, false, false
);

-- ============================================================================
-- CRUD OPERATIONS - 15 SCENARIOS (CRUD-1 to CRUD-15)
-- Testing: Full create/read/update/delete on major entities
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'admin',
  'CRUD-1: Admin CRUD completo en cursos',
  'Verificar que admin puede crear, leer, actualizar y eliminar cursos.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_create_courses, can_edit_all_courses, can_delete_courses = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear un curso nuevo","expectedOutcome":"API devuelve 201, RLS permite INSERT"},{"index":2,"instruction":"READ: Leer lista de cursos","expectedOutcome":"Se ven todos los cursos globalmente"},{"index":3,"instruction":"UPDATE: Editar el curso creado","expectedOutcome":"API devuelve 200, RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar el curso","expectedOutcome":"API devuelve 200, RLS permite DELETE"}]'::jsonb,
  1, 6, true, false, false
),

(
  'admin',
  'CRUD-2: Admin CRUD completo en usuarios',
  'Verificar que admin puede crear, leer, actualizar y eliminar usuarios.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_create_users, can_edit_users, can_delete_users = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear un usuario nuevo vía API","expectedOutcome":"API devuelve 201"},{"index":2,"instruction":"READ: Leer lista de usuarios","expectedOutcome":"Se ven todos los usuarios"},{"index":3,"instruction":"UPDATE: Editar perfil del usuario","expectedOutcome":"API devuelve 200, RLS permite UPDATE en profiles"},{"index":4,"instruction":"DELETE: Eliminar el usuario","expectedOutcome":"API devuelve 200"}]'::jsonb,
  1, 6, true, false, false
),

(
  'admin',
  'CRUD-3: Admin CRUD completo en user_roles',
  'Verificar que admin puede asignar, leer, actualizar y eliminar roles de usuarios.',
  'role_assignment',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_assign_roles = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Asignar rol a usuario","expectedOutcome":"API devuelve 201, RLS permite INSERT en user_roles"},{"index":2,"instruction":"READ: Leer roles del usuario","expectedOutcome":"Se ven los roles asignados"},{"index":3,"instruction":"UPDATE: Modificar rol (cambiar is_active)","expectedOutcome":"RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar rol del usuario","expectedOutcome":"RLS permite DELETE"}]'::jsonb,
  1, 5, true, false, false
),

(
  'admin',
  'CRUD-4: Admin CRUD completo en escuelas',
  'Verificar que admin puede crear, leer, actualizar y eliminar escuelas.',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_manage_schools = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear escuela nueva","expectedOutcome":"API devuelve 201, RLS permite INSERT en schools"},{"index":2,"instruction":"READ: Leer lista de escuelas","expectedOutcome":"Se ven todas las escuelas"},{"index":3,"instruction":"UPDATE: Editar datos de escuela","expectedOutcome":"API devuelve 200, RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar escuela sin dependencias","expectedOutcome":"API devuelve 200, RLS permite DELETE"}]'::jsonb,
  1, 6, true, false, false
),

(
  'admin',
  'CRUD-5: Admin CRUD completo en redes de colegios',
  'Verificar que admin puede crear, leer, actualizar y eliminar redes (RLS bypass en migración 20260208160000).',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear red nueva","expectedOutcome":"API devuelve 201, RLS permite INSERT en redes_de_colegios"},{"index":2,"instruction":"READ: Leer lista de redes","expectedOutcome":"Se ven todas las redes (RLS bypass línea 72-78)"},{"index":3,"instruction":"UPDATE: Editar datos de red","expectedOutcome":"RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar red sin dependencias","expectedOutcome":"RLS permite DELETE"}]'::jsonb,
  1, 6, true, false, false
),

(
  'admin',
  'CRUD-6: Admin CRUD completo en asignaciones red-escuela',
  'Verificar que admin puede asignar escuelas a redes, leer, actualizar y eliminar asignaciones (RLS bypass en migración 20260208160000).',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos una red y una escuela"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Asignar escuela a red","expectedOutcome":"API devuelve 201, RLS permite INSERT en red_escuelas (bypass línea 49-55)"},{"index":2,"instruction":"READ: Leer asignaciones","expectedOutcome":"Se ven todas las asignaciones"},{"index":3,"instruction":"UPDATE: Modificar asignación","expectedOutcome":"RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar asignación","expectedOutcome":"RLS permite DELETE"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-7: Admin CRUD completo en plantillas de evaluación',
  'Verificar que admin puede crear, leer, actualizar y eliminar plantillas (hasAssessmentWritePermission = admin only).',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear plantilla nueva","expectedOutcome":"API devuelve 201 (hasAssessmentWritePermission true para admin línea 33)"},{"index":2,"instruction":"READ: Leer plantillas","expectedOutcome":"Se ven todas las plantillas (hasAssessmentReadPermission línea 19)"},{"index":3,"instruction":"UPDATE: Editar plantilla","expectedOutcome":"API devuelve 200 (write permission)"},{"index":4,"instruction":"DELETE: Eliminar plantilla","expectedOutcome":"API devuelve 200"}]'::jsonb,
  1, 6, true, false, false
),

(
  'admin',
  'CRUD-8: Admin CRUD completo en artículos de noticias',
  'Verificar que admin puede crear, leer, actualizar y eliminar noticias (RLS FOR ALL admin + community_manager).',
  'news_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear artículo nuevo","expectedOutcome":"API devuelve 201, RLS permite INSERT"},{"index":2,"instruction":"READ: Leer artículos","expectedOutcome":"Se ven todos los artículos"},{"index":3,"instruction":"UPDATE: Editar artículo","expectedOutcome":"API devuelve 200, RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar artículo","expectedOutcome":"RLS permite DELETE"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-9: Admin CRUD completo en eventos',
  'Verificar que admin puede crear, leer, actualizar y eliminar eventos (RLS admin + community_manager).',
  'event_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear evento nuevo","expectedOutcome":"RLS permite INSERT"},{"index":2,"instruction":"READ: Leer eventos","expectedOutcome":"Se ven todos los eventos"},{"index":3,"instruction":"UPDATE: Editar evento","expectedOutcome":"RLS permite UPDATE"},{"index":4,"instruction":"DELETE: Eliminar evento","expectedOutcome":"RLS permite DELETE"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-10: Admin CRUD completo en contratos',
  'Verificar que admin puede crear, leer, actualizar y eliminar contratos (RLS admin-only INSERT/UPDATE/DELETE).',
  'contract_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear contrato nuevo","expectedOutcome":"RLS permite INSERT (admin-only policy)"},{"index":2,"instruction":"READ: Leer contratos","expectedOutcome":"Se ven todos los contratos"},{"index":3,"instruction":"UPDATE: Editar contrato","expectedOutcome":"RLS permite UPDATE (admin-only)"},{"index":4,"instruction":"DELETE: Eliminar contrato","expectedOutcome":"RLS permite DELETE (admin-only)"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-11: Admin CRUD completo en rutas de aprendizaje',
  'Verificar que admin puede crear, leer, actualizar y eliminar rutas de aprendizaje.',
  'learning_paths',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear ruta nueva","expectedOutcome":"API devuelve 201"},{"index":2,"instruction":"READ: Leer rutas","expectedOutcome":"Se ven todas las rutas"},{"index":3,"instruction":"UPDATE: Editar ruta","expectedOutcome":"API devuelve 200"},{"index":4,"instruction":"DELETE: Eliminar ruta","expectedOutcome":"API devuelve 200"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-12: Admin CRUD completo en asignaciones de consultores',
  'Verificar que admin puede asignar, leer, actualizar y eliminar asignaciones de consultores.',
  'consultant_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Asignar consultor a escuela","expectedOutcome":"API devuelve 201 (checkIsAdmin línea 18)"},{"index":2,"instruction":"READ: Leer asignaciones","expectedOutcome":"Se ven todas las asignaciones"},{"index":3,"instruction":"UPDATE: Modificar asignación","expectedOutcome":"API devuelve 200"},{"index":4,"instruction":"DELETE: Eliminar asignación","expectedOutcome":"API devuelve 200"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-13: Admin CRUD completo en generaciones',
  'Verificar que admin puede crear, leer, actualizar y eliminar generaciones (gestionado vía schools API).',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_manage_generations = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear generación nueva en una escuela","expectedOutcome":"La generación se crea exitosamente"},{"index":2,"instruction":"READ: Leer generaciones","expectedOutcome":"Se ven todas las generaciones"},{"index":3,"instruction":"UPDATE: Editar generación","expectedOutcome":"Los cambios se guardan"},{"index":4,"instruction":"DELETE: Eliminar generación","expectedOutcome":"La generación se elimina"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-14: Admin CRUD completo en comunidades de crecimiento',
  'Verificar que admin puede crear, leer, actualizar y eliminar comunidades (gestionado vía workspace).',
  'community_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"permission","description":"can_manage_communities = true"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear comunidad nueva","expectedOutcome":"La comunidad se crea exitosamente"},{"index":2,"instruction":"READ: Leer comunidades","expectedOutcome":"Se ven todas las comunidades"},{"index":3,"instruction":"UPDATE: Editar comunidad","expectedOutcome":"Los cambios se guardan"},{"index":4,"instruction":"DELETE: Eliminar comunidad","expectedOutcome":"La comunidad se elimina"}]'::jsonb,
  2, 5, true, false, false
),

(
  'admin',
  'CRUD-15: Admin CRUD completo en tipos de notificaciones',
  'Verificar que admin puede crear, leer, actualizar y eliminar tipos de notificaciones.',
  'notification_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"CREATE: Crear tipo de notificación nuevo","expectedOutcome":"API devuelve 201 (metadataHasRole admin línea 64-71)"},{"index":2,"instruction":"READ: Leer tipos de notificaciones","expectedOutcome":"Se ven todos los tipos"},{"index":3,"instruction":"UPDATE: Editar tipo","expectedOutcome":"API devuelve 200"},{"index":4,"instruction":"DELETE: Eliminar tipo","expectedOutcome":"API devuelve 200"}]'::jsonb,
  3, 4, true, false, false
);

-- ============================================================================
-- GLOBAL SCOPE VERIFICATION - 8 SCENARIOS (GS-1 to GS-8)
-- Testing: Admin sees ALL data globally (no scoping restrictions)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'admin',
  'GS-1: Admin ve reportes con alcance global (todas las escuelas)',
  'Verificar que admin ve datos de TODAS las escuelas en reportes detallados sin filtro de escuela.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar POST /api/reports/detailed sin filtro de escuela","expectedOutcome":"API devuelve 200 (admin en allowedRoles línea 68)"},{"index":2,"instruction":"Verificar que getReportableUsers retorna TODOS los usuarios","expectedOutcome":"No hay filtro de escuela aplicado (alcance global)"},{"index":3,"instruction":"Verificar que reporting_scope = global en ROLE_HIERARCHY","expectedOutcome":"Confirmado en types/roles.ts línea 159"}]'::jsonb,
  1, 3, true, false, false
),

(
  'admin',
  'GS-2: Admin ve opciones de filtro globales sin restricción',
  'Verificar que admin ve TODAS las escuelas/generaciones/comunidades en filtros (listas completas).',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar GET /api/reports/filter-options","expectedOutcome":"API devuelve 200 (admin check línea 57)"},{"index":2,"instruction":"Verificar que retorna TODAS las escuelas sin filtro","expectedOutcome":"Lista completa de escuelas (líneas 57-159)"},{"index":3,"instruction":"Verificar que retorna TODAS las generaciones y comunidades","expectedOutcome":"Listas completas sin restricción"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'GS-3: Admin ve dashboard con datos globales',
  'Verificar que el dashboard muestra métricas globales de TODAS las escuelas.',
  'dashboard',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar GET /api/dashboard/unified","expectedOutcome":"API devuelve 200 (admin en allowedRoles línea 48)"},{"index":2,"instruction":"Verificar que admin scope logic retorna datos globales","expectedOutcome":"Scope global verificado (línea 159 de unified.ts)"},{"index":3,"instruction":"Verificar que no hay filtro de escuela pre-aplicado","expectedOutcome":"Dashboard muestra alcance global"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'GS-4: Admin accede a detalles de cualquier usuario sin restricción',
  'Verificar que admin puede ver detalles de CUALQUIER usuario (admin bypass en API).',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe al menos un usuario"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar GET /api/reports/user-details?userId=X (cualquier ID)","expectedOutcome":"API devuelve 200"},{"index":2,"instruction":"Verificar admin bypass en línea 137: if (highestRole === admin) return true","expectedOutcome":"Admin bypassa checkUserAccessModern"},{"index":3,"instruction":"Verificar que se retornan detalles completos del usuario","expectedOutcome":"No hay restricción de acceso"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'GS-5: Admin ve todas las plantillas de evaluación globalmente',
  'Verificar que admin ve TODAS las plantillas sin filtro de escuela.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar GET /api/admin/assessment-builder/templates","expectedOutcome":"API devuelve 200"},{"index":2,"instruction":"Verificar que NO hay filtro de school_id en query","expectedOutcome":"Plantillas globales retornadas"},{"index":3,"instruction":"Verificar que hasAssessmentReadPermission incluye admin","expectedOutcome":"Admin puede leer todas las plantillas (línea 19)"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'GS-6: Admin ve quizzes pendientes de todas las escuelas',
  'Verificar que admin ve quizzes pendientes de TODAS las escuelas (alcance global).',
  'quiz_grading',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /quiz-reviews","expectedOutcome":"Página carga"},{"index":2,"instruction":"Verificar que allowedRoles incluye admin","expectedOutcome":"Admin tiene acceso"},{"index":3,"instruction":"Verificar que se muestran quizzes de TODAS las escuelas","expectedOutcome":"No hay filtro de escuela (alcance global)"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'GS-7: Admin ve evaluaciones de transformación de todas las escuelas',
  'Verificar que admin ve evaluaciones de transformación globalmente.',
  'transformation',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/transformation/assessments","expectedOutcome":"Página carga (admin-only)"},{"index":2,"instruction":"Verificar que se muestran evaluaciones de TODAS las escuelas","expectedOutcome":"Alcance global verificado"}]'::jsonb,
  2, 2, true, false, false
),

(
  'admin',
  'GS-8: Admin ve matriz de asignaciones global',
  'Verificar que admin ve asignaciones de TODOS los usuarios globalmente.',
  'assignment_tracking',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/assignment-matrix","expectedOutcome":"Página carga (admin-only)"},{"index":2,"instruction":"Verificar que se muestran asignaciones de TODOS los usuarios","expectedOutcome":"Datos globales sin restricción"}]'::jsonb,
  2, 2, true, false, false
);

-- ============================================================================
-- REGRESSION TESTS - 10 SCENARIOS (RG-1 to RG-10)
-- Testing: Verify other role fixes did NOT block admin access
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'admin',
  'RG-1: Admin RLS bypass en red_escuelas (migración supervisor)',
  'Verificar que migración 20260208160000 incluye bypass RLS para admin en red_escuelas.',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer migración 20260208160000 líneas 49-55","expectedOutcome":"Existe cláusula admin bypass: EXISTS (SELECT 1 FROM user_roles WHERE role_type = admin AND is_active = true)"},{"index":2,"instruction":"Verificar SELECT en red_escuelas","expectedOutcome":"Admin ve TODOS los registros sin restricción"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-2: Admin RLS bypass en redes_de_colegios (migración supervisor)',
  'Verificar que migración 20260208160000 incluye bypass RLS para admin en redes_de_colegios.',
  'network_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer migración 20260208160000 líneas 72-78","expectedOutcome":"Existe cláusula admin bypass: EXISTS (SELECT 1 FROM user_roles WHERE role_type = admin AND is_active = true)"},{"index":2,"instruction":"Verificar SELECT en redes_de_colegios","expectedOutcome":"Admin ve TODAS las redes sin restricción"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-3: Admin INSERT en assessment_templates (migración consultor fix)',
  'Verificar que migración consultor fix preserva INSERT para admin en assessment_templates.',
  'assessment_builder',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar policy admin-only INSERT en assessment_templates","expectedOutcome":"RLS permite INSERT para admin"},{"index":2,"instruction":"Verificar hasAssessmentWritePermission línea 33","expectedOutcome":"Retorna true para admin ONLY"},{"index":3,"instruction":"Intentar INSERT directo vía Supabase REST API","expectedOutcome":"201 Created (admin allowed)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-4: Admin INSERT en news_articles (migración consultor fix)',
  'Verificar que migración consultor fix preserva INSERT para admin en news_articles.',
  'news_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar policy FOR ALL admin + community_manager","expectedOutcome":"RLS permite INSERT/UPDATE/DELETE para admin"},{"index":2,"instruction":"Verificar API /api/admin/news allowed roles","expectedOutcome":"Admin está en allowed roles"},{"index":3,"instruction":"Intentar INSERT directo vía Supabase REST API","expectedOutcome":"201 Created (admin allowed)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-5: Admin INSERT en contratos (migración consultor fix)',
  'Verificar que migración consultor fix incluye policy admin-only INSERT en contratos.',
  'contract_management',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar policy admin-only INSERT en contratos","expectedOutcome":"RLS permite INSERT para admin solamente"},{"index":2,"instruction":"Intentar INSERT directo vía Supabase REST API","expectedOutcome":"201 Created (admin allowed)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-6: Admin en allowedRoles de reports/detailed.ts',
  'Verificar que API reports/detailed.ts modificada para supervisor incluye admin en allowedRoles.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer pages/api/reports/detailed.ts línea 68","expectedOutcome":"allowedRoles = [admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red]"},{"index":2,"instruction":"Enviar POST /api/reports/detailed","expectedOutcome":"API devuelve 200 (admin en array)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-7: Admin en allowedRoles de reports/overview.ts',
  'Verificar que API reports/overview.ts modificada para supervisor incluye admin en allowedRoles.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer pages/api/reports/overview.ts línea 45","expectedOutcome":"allowedRoles incluye admin"},{"index":2,"instruction":"Enviar POST /api/reports/overview","expectedOutcome":"API devuelve 200 (admin en array)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-8: Admin obtiene alcance global en filter-options.ts',
  'Verificar que API filter-options.ts modificada para supervisor da alcance global a admin.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer pages/api/reports/filter-options.ts línea 57","expectedOutcome":"if (highestRole === admin) → retorna listas sin filtro"},{"index":2,"instruction":"Enviar GET /api/reports/filter-options","expectedOutcome":"API devuelve listas completas (alcance global)"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-9: Admin bypass existe en user-details.ts',
  'Verificar que API user-details.ts modificada para supervisor incluye admin bypass.',
  'reporting',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer pages/api/reports/user-details.ts línea 137","expectedOutcome":"if (highestRole === admin) return true;"},{"index":2,"instruction":"Verificar que supervisorCanAccessUser NO aplica a admin","expectedOutcome":"Admin bypassa función supervisor-specific (línea 10)"},{"index":3,"instruction":"Enviar GET /api/reports/user-details?userId=X","expectedOutcome":"API devuelve 200 para cualquier userId"}]'::jsonb,
  1, 2, true, false, false
),

(
  'admin',
  'RG-10: Admin en allowedRoles + alcance global en dashboard/unified.ts',
  'Verificar que API dashboard/unified.ts modificada para supervisor preserva admin access + alcance global.',
  'dashboard',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Leer pages/api/dashboard/unified.ts línea 48","expectedOutcome":"allowedRoles incluye admin"},{"index":2,"instruction":"Leer línea 159 (admin scope logic)","expectedOutcome":"Admin obtiene alcance global"},{"index":3,"instruction":"Enviar GET /api/dashboard/unified","expectedOutcome":"API devuelve 200 con datos globales"}]'::jsonb,
  1, 2, true, false, false
);

-- ============================================================================
-- EDGE CASES - 7 SCENARIOS (EC-1 to EC-7)
-- Testing: Admin edge cases and boundary conditions
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'admin',
  'EC-1: Admin sin school_id ve dashboard correctamente',
  'Verificar que admin sin school_id en profile puede ver dashboard (requiresSchool: false).',
  'dashboard',
  '[{"type":"role","description":"Admin sin school_id en profiles"},{"type":"custom","description":"requiresSchool: false en types/roles.ts"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que profile.school_id es NULL","expectedOutcome":"Admin no tiene school_id asignado"},{"index":2,"instruction":"Navegar a /dashboard","expectedOutcome":"Dashboard carga exitosamente (no requiere school)"},{"index":3,"instruction":"Verificar que no hay error por falta de school_id","expectedOutcome":"Funciona correctamente (alcance global no requiere school)"}]'::jsonb,
  3, 2, true, false, false
),

(
  'admin',
  'EC-2: Admin sin school_id puede gestionar escuelas',
  'Verificar que admin sin school_id puede ver y gestionar TODAS las escuelas (alcance global).',
  'school_management',
  '[{"type":"role","description":"Admin sin school_id"}]'::jsonb,
  '[{"index":1,"instruction":"Navegar a /admin/schools","expectedOutcome":"Página carga exitosamente"},{"index":2,"instruction":"Verificar que se muestran TODAS las escuelas","expectedOutcome":"Lista completa visible (no filtrada por school_id del admin)"},{"index":3,"instruction":"Intentar crear/editar una escuela","expectedOutcome":"Operación exitosa (can_manage_schools: true)"}]'::jsonb,
  3, 2, true, false, false
),

(
  'admin',
  'EC-3: Admin con múltiples roles (admin + docente) funciona correctamente',
  'Verificar que admin con rol adicional docente mantiene permisos admin (getUserPrimaryRole retorna admin).',
  'role_management',
  '[{"type":"role","description":"Admin con user_roles: admin + docente activos"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que getUserPrimaryRole retorna admin","expectedOutcome":"Admin tiene prioridad más alta en ROLE_HIERARCHY"},{"index":2,"instruction":"Verificar que todos los permisos admin aplican","expectedOutcome":"can_create_courses, can_manage_schools, etc. todos true"},{"index":3,"instruction":"Verificar que ambos roles funcionan independientemente","expectedOutcome":"roles.some() checks trabajan correctamente para multi-rol"}]'::jsonb,
  3, 2, true, false, false
),

(
  'admin',
  'EC-4: Admin con sesión expirada en course builder redirige a login',
  'Verificar que si sesión de admin expira, se redirige a login sin data stale.',
  'authentication',
  '[{"type":"role","description":"Admin con sesión por expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Estar en /admin/course-builder cuando sesión expira","expectedOutcome":"Página detecta sesión expirada"},{"index":2,"instruction":"Verificar que redirige a /login","expectedOutcome":"Redirección automática a login"},{"index":3,"instruction":"Verificar que no queda data stale visible","expectedOutcome":"No hay data visible post-expiración (SessionContextProvider usa autoRefreshToken: true)"}]'::jsonb,
  4, 2, true, false, false
),

(
  'admin',
  'EC-5: Admin accede a endpoints API directamente (bypass sidebar)',
  'Verificar que admin puede acceder a endpoints API directamente vía URL (auth server-side funciona).',
  'api_access',
  '[{"type":"role","description":"Iniciar sesión como admin"}]'::jsonb,
  '[{"index":1,"instruction":"Enviar request directo a POST /api/admin/courses (bypass UI)","expectedOutcome":"Server-side auth funciona, admin en allowedRoles, API devuelve 200"},{"index":2,"instruction":"Enviar request directo a PUT /api/admin/schools/[id]","expectedOutcome":"Auth independiente funciona, admin bypassa checks"},{"index":3,"instruction":"Verificar que TODOS los 65 admin API routes tienen auth server-side","expectedOutcome":"Ningún endpoint depende solo de UI sidebar para auth"}]'::jsonb,
  2, 3, true, false, false
),

(
  'admin',
  'EC-6: Admin con rol inactivo (is_active: false) pierde privilegios',
  'Verificar que si admin role está is_active=false, admin pierde privilegios.',
  'role_management',
  '[{"type":"role","description":"Admin con is_active=false en user_roles"}]'::jsonb,
  '[{"index":1,"instruction":"Verificar que getUserRoles filtra por is_active=true","expectedOutcome":"Rol admin inactivo no es retornado"},{"index":2,"instruction":"Si no hay otros roles activos, verificar redirección","expectedOutcome":"Redirige a pending approval (no active roles)"},{"index":3,"instruction":"Verificar que privilegios admin se pierden","expectedOutcome":"No puede acceder a rutas adminOnly"}]'::jsonb,
  3, 2, true, false, false
),

(
  'admin',
  'EC-7: Admin intenta eliminar escuela con dependencias falla gracefully',
  'Verificar que al intentar eliminar escuela con dependencias, API retorna error manejado.',
  'school_management',
  '[{"type":"role","description":"Iniciar sesión como admin"},{"type":"data","description":"Existe escuela con usuarios/cursos asignados"}]'::jsonb,
  '[{"index":1,"instruction":"Seleccionar escuela con dependencias (usuarios, cursos, etc)","expectedOutcome":"Escuela seleccionada"},{"index":2,"instruction":"Intentar DELETE /api/admin/schools/[id]","expectedOutcome":"API devuelve error por foreign key constraints (PostgreSQL)"},{"index":3,"instruction":"Verificar que error es manejado gracefully","expectedOutcome":"Mensaje de error claro: No se puede eliminar escuela con dependencias. Admin puede retry después de eliminar dependencias"}]'::jsonb,
  4, 2, true, false, false
);

COMMIT;

-- ============================================================================
-- SEED SCRIPT COMPLETED
-- Total scenarios inserted: 129
-- ============================================================================
