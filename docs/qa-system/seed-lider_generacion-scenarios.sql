-- ============================================================================
-- QA Scenarios Seed Script: LIDER_GENERACION Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: lider_generacion
-- Total Scenarios: 62
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_LIDER_GENERACION.md (audited 2026-02-08)
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 16 scenarios (PB-1 to PB-16)
--   - Correct Access (Should ALLOW): 11 scenarios (CA-1 to CA-11)
--   - Generation Assignment Scoping: 5 scenarios (GS-1 to GS-5)
--   - Sidebar Visibility: 23 scenarios (SV-1 to SV-23)
--   - Edge Cases: 7 scenarios (EC-1 to EC-7)
--
-- PRIORITIES:
--   1 = Critical (security, authentication)
--   2 = High (role-based permissions)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'lider_generacion' for all rows
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
-- PERMISSION BOUNDARIES - 16 SCENARIOS (PB-1 to PB-16)
-- Testing: What lider_generacion CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1: Create a new course
(
  'lider_generacion',
  'PB-1: Lider Generacion intenta crear un nuevo curso',
  'Verificar que lider_generacion no puede crear cursos (can_create_courses: false).',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como lider_generacion"},{"type":"navigation","description":"El usuario debe estar autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Creación de Curso","expectedOutcome":"Se muestra acceso denegado o se redirige"},{"index":3,"instruction":"Verificar que el menú Cursos NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (adminOnly: true)"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-2: Create a user
(
  'lider_generacion',
  'PB-2: Lider Generacion intenta crear un usuario',
  'Verificar que lider_generacion no puede crear usuarios (can_create_users: false).',
  'user_management',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Usuarios","expectedOutcome":"Acceso denegado"},{"index":3,"instruction":"Verificar que Usuarios NO aparece en sidebar","expectedOutcome":"No visible (adminOnly)"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-3: Edit user profile
(
  'lider_generacion',
  'PB-3: Lider Generacion intenta editar perfil de otro usuario',
  'Verificar que lider_generacion no puede editar perfiles de otros (can_edit_users: false).',
  'user_management',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Existe otro usuario en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar realizar la acción con datos modificados","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-4: Assign roles
(
  'lider_generacion',
  'PB-4: Lider Generacion intenta asignar roles a usuarios',
  'Verificar que lider_generacion no puede asignar roles (can_assign_roles: false).',
  'role_assignment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":"aparece un mensaje de error de permisos"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-5: Manage schools
(
  'lider_generacion',
  'PB-5: Lider Generacion intenta gestionar colegios',
  'Verificar que lider_generacion no puede gestionar escuelas (can_manage_schools: false).',
  'school_management',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar acceder a la página de Escuelas","expectedOutcome":"Acceso denegado"},{"index":3,"instruction":"Verificar que Escuelas NO aparece en sidebar","expectedOutcome":"No visible (adminOnly)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-6: Manage networks
(
  'lider_generacion',
  'PB-6: Lider Generacion intenta gestionar redes de colegios',
  'Verificar que lider_generacion no puede gestionar redes (can_manage_schools: false).',
  'network_management',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar que Redes NO aparece en sidebar","expectedOutcome":"No visible (adminOnly)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-7: Create assessment template
(
  'lider_generacion',
  'PB-7: Lider Generacion intenta crear plantilla de evaluación',
  'Verificar que lider_generacion no puede crear plantillas (hasAssessmentWritePermission: admin-only).',
  'assessment_builder',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":"aparece un mensaje de error de permisos"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-8: VIEW assessment templates
(
  'lider_generacion',
  'PB-8: Lider Generacion intenta VER plantillas de evaluación',
  'Verificar que lider_generacion no puede VER plantillas (hasAssessmentReadPermission: admin+consultor only).',
  'assessment_builder',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":"aparece un mensaje de error de permisos (lider_generacion excluido)"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-9: Access quiz reviews
(
  'lider_generacion',
  'PB-9: Lider Generacion intenta acceder a revisión de quizzes',
  'Verificar que lider_generacion no puede acceder a quiz reviews (allowedRoles: admin+consultor+equipo_directivo only).',
  'quiz_submission',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar acceder a la página de Revisión de Quizzes","expectedOutcome":"Acceso denegado"},{"index":3,"instruction":"Intentar realizar la acción","expectedOutcome":"aparece un mensaje de error de permisos"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-10 to PB-16: Other permission boundaries
(
  'lider_generacion',
  'PB-10: Lider Generacion intenta crear/editar noticias',
  'Verificar que lider_generacion no puede gestionar noticias (restrictedRoles: admin+community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar que Noticias NO aparece en sidebar","expectedOutcome":"No visible"}]'::jsonb,
  2, 2, true, false, false
),
(
  'lider_generacion',
  'PB-11: Lider Generacion intenta crear/editar eventos',
  'Verificar que lider_generacion no puede gestionar eventos (restrictedRoles: admin+community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar que Eventos NO aparece en sidebar","expectedOutcome":"No visible"}]'::jsonb,
  2, 2, true, false, false
),
(
  'lider_generacion',
  'PB-12: Lider Generacion intenta gestionar contratos',
  'Verificar que lider_generacion no puede gestionar contratos (restrictedRoles: admin+community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar que Gestión NO aparece en sidebar","expectedOutcome":"No visible"}]'::jsonb,
  2, 2, true, false, false
),
(
  'lider_generacion',
  'PB-13: Lider Generacion intenta acceder a configuración del sistema',
  'Verificar que lider_generacion no puede acceder a configuración (permission: manage_system_settings).',
  'role_assignment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar que Configuración NO aparece en sidebar","expectedOutcome":"No visible"}]'::jsonb,
  1, 2, true, false, false
),
(
  'lider_generacion',
  'PB-14: Lider Generacion intenta asignar consultores',
  'Verificar que lider_generacion no puede asignar consultores (adminOnly).',
  'role_assignment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar acceder a la página de Asignación de Consultores","expectedOutcome":"Acceso denegado"}]'::jsonb,
  2, 2, true, false, false
),
(
  'lider_generacion',
  'PB-15: Lider Generacion intenta acceder a páginas de QA',
  'Verificar que lider_generacion no puede acceder a QA testing (adminOnly).',
  'role_assignment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar acceder a la página de Escenarios QA","expectedOutcome":"Acceso denegado"}]'::jsonb,
  1, 2, true, false, false
),
(
  'lider_generacion',
  'PB-16: Lider Generacion intenta asignar cursos masivamente',
  'Verificar que lider_generacion no puede batch-assign courses (hasAssignPermission: admin+consultor only).',
  'course_enrollment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":"aparece un mensaje de error de permisos"}]'::jsonb,
  2, 3, true, false, false
);

-- ============================================================================
-- CORRECT ACCESS - 11 SCENARIOS (CA-1 to CA-11)
-- Testing: What lider_generacion CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'lider_generacion',
  'CA-1: Lider Generacion visualiza su panel de control',
  'Verificar que lider_generacion puede acceder al dashboard con datos de su generación.',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Tiene generation_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga correctamente"},{"index":2,"instruction":"Verificar que se muestran datos de la generación asignada","expectedOutcome":"Datos visibles corresponden solo a su generación"}]'::jsonb,
  1, 3, true, false, false
),
(
  'lider_generacion',
  'CA-2: Lider Generacion visualiza su perfil',
  'Verificar que lider_generacion puede ver su perfil.',
  'user_management',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Perfil","expectedOutcome":"Perfil carga correctamente"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'CA-3: Lider Generacion visualiza Mi Aprendizaje',
  'Verificar que lider_generacion puede ver Mi Aprendizaje.',
  'course_enrollment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Mi Aprendizaje","expectedOutcome":"Página carga con cursos"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'CA-4: Lider Generacion visualiza reportes detallados',
  'Verificar que lider_generacion puede ver reportes con datos de su generación (scoped by user_roles.generation_id).',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Tiene generation_id en user_roles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Reportes cargan con datos de generación"},{"index":3,"instruction":"Verificar que solo se muestran datos de la generación asignada","expectedOutcome":"Datos filtrados por generation_id"}]'::jsonb,
  2, 5, true, false, false
),
(
  'lider_generacion',
  'CA-5: Lider Generacion visualiza resumen de reportes',
  'Verificar que lider_generacion puede ver overview con datos de su generación (scoped by profiles.generation_id).',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Tiene generation_id en profiles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con datos de generación"}]'::jsonb,
  2, 5, true, false, false
),
(
  'lider_generacion',
  'CA-6: Lider Generacion visualiza opciones de filtro de reportes',
  'Verificar que lider_generacion puede ver filter-options (requiere school_id Y generation_id en profiles).',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Tiene school_id Y generation_id en profiles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con opciones"}]'::jsonb,
  2, 3, true, false, false
),
(
  'lider_generacion',
  'CA-7: Lider Generacion visualiza estadísticas de dashboard unificado',
  'Verificar que lider_generacion puede ver unified dashboard (devuelve solo [userId], no generation-scoped).',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con solo datos propios"}]'::jsonb,
  3, 3, true, false, false
),
(
  'lider_generacion',
  'CA-8: Lider Generacion accede a página de tareas como docente',
  'Verificar que lider_generacion puede ver assignments como teacher (isTeacher incluye lider_generacion).',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Assignments","expectedOutcome":"Página carga con vista de teacher"}]'::jsonb,
  2, 4, true, false, false
),
(
  'lider_generacion',
  'CA-9: Lider Generacion visualiza entregas de tareas',
  'Verificar que lider_generacion puede ver assignment submissions.',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Existen tareas con entregas"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Assignments/[id]/submissions","expectedOutcome":"Página carga con entregas"}]'::jsonb,
  2, 4, true, false, false
),
(
  'lider_generacion',
  'CA-10: Lider Generacion accede a página de Feedback',
  'Verificar que lider_generacion puede acceder a /docente/assessments (no role restriction, by user_id).',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Tiene assessment instances asignados"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Docente/assessments","expectedOutcome":"Página carga con assessments"}]'::jsonb,
  3, 3, true, false, false
),
(
  'lider_generacion',
  'CA-11: Lider Generacion visualiza detalles de usuario de su generación',
  'Verificar que lider_generacion puede ver user-details de usuarios de su generación (scoped by user_roles.generation_id).',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Existe usuario en misma generación"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con detalles"},{"index":3,"instruction":"realizar la acción correspondiente","expectedOutcome":"o vacío"}]'::jsonb,
  2, 5, true, false, false
);

-- ============================================================================
-- GENERATION ASSIGNMENT SCOPING - 5 SCENARIOS (GS-1 to GS-5)
-- Testing: Data filtering by assigned generation
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'lider_generacion',
  'GS-1: Reportes solo muestran datos de generación asignada',
  'Verificar que los reportes filtran datos por generation_id del lider_generacion.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Hay múltiples generaciones"},{"type":"data","description":"Lider tiene generation_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Reportes cargan"},{"index":3,"instruction":"Verificar que solo se muestran datos de la generación asignada","expectedOutcome":"Sin datos de otras generaciones"}]'::jsonb,
  2, 5, true, false, false
),
(
  'lider_generacion',
  'GS-2: Manipulación de URL con diferente generation_id rechazada',
  'Verificar que la API rechaza consultas de datos de otras generaciones.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Hay otra generación diferente"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente con filters.generation_id=OTRA_GEN","expectedOutcome":"El sistema no muestra datos o muestra un mensaje de error de permisos"}]'::jsonb,
  2, 3, true, false, false
),
(
  'lider_generacion',
  'GS-3: Consistencia de fuente de datos (detailed vs overview)',
  'Verificar inconsistencia: detailed usa user_roles.generation_id, overview usa profiles.generation_id.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"generation_id en AMBOS user_roles y profiles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"Datos de generation_id via user_roles"},{"index":3,"instruction":"realizar la acción correspondiente","expectedOutcome":"Datos de generation_id via profiles"},{"index":4,"instruction":"Verificar consistencia de datos","expectedOutcome":"Datos deben coincidir si ambos tienen generation_id"}]'::jsonb,
  2, 5, true, false, false
),
(
  'lider_generacion',
  'GS-4: filter-options requiere school_id Y generation_id',
  'Verificar que filter-options API requiere AMBOS school_id y generation_id en profiles.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Perfil con school_id Y generation_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con opciones"},{"index":3,"instruction":"Simular falta de generation_id en profiles","expectedOutcome":"Opciones vacías"}]'::jsonb,
  2, 4, true, false, false
),
(
  'lider_generacion',
  'GS-5: Dashboard unificado NO es generation-scoped',
  'Verificar que unified dashboard NO tiene caso lider_generacion, devuelve solo [userId].',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Hay otros usuarios en la generación"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"la operación se completa correctamente con solo datos propios"},{"index":3,"instruction":"Verificar que NO se muestran datos de otros usuarios de la generación","expectedOutcome":"Solo userId propio en respuesta"}]'::jsonb,
  3, 4, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 23 SCENARIOS (SV-1 to SV-23)
-- Testing: Navigation menu visibility
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- VISIBLE ITEMS: 4 scenarios
(
  'lider_generacion',
  'SV-1: Lider Generacion ve Mi Panel en sidebar',
  'Verificar que Mi Panel es visible en el sidebar.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Mi Panel visible"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-2: Lider Generacion ve Mi Perfil en sidebar',
  'Verificar que Mi Perfil es visible.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Mi Perfil visible"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-3: Lider Generacion ve Mi Aprendizaje en sidebar',
  'Verificar que Mi Aprendizaje es visible.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Mi Aprendizaje visible"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-4: Lider Generacion ve Espacio Colaborativo SI tiene community_id',
  'Verificar que Espacio Colaborativo es visible SOLO si el usuario tiene community_id.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"data","description":"Usuario tiene community_id asignado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl con community_id","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Espacio Colaborativo visible"}]'::jsonb,
  3, 2, true, false, false
),

-- HIDDEN ITEMS: 18 scenarios (SV-5 to SV-22)
(
  'lider_generacion',
  'SV-5: Cursos NO visible en sidebar',
  'Verificar que Cursos NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Cursos NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-6: Usuarios NO visible en sidebar',
  'Verificar que Usuarios NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Usuarios NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-7: Escuelas NO visible en sidebar',
  'Verificar que Escuelas NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Escuelas NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-8: Redes de Colegios NO visible en sidebar',
  'Verificar que Redes de Colegios NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Redes de Colegios NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-9: Revisión de Quizzes NO visible en sidebar',
  'Verificar que Revisión de Quizzes NO aparece en sidebar (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Revisión de Quizzes NO visible (consultantOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-10: Procesos de Cambio NO visible en sidebar',
  'Verificar que Procesos de Cambio NO aparece en sidebar (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Procesos de Cambio NO visible (consultantOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-11: Reportes NO visible en sidebar',
  'Verificar que Reportes NO aparece en sidebar (consultantOnly: true). Gap #1: accesible via URL directa.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Reportes NO visible (consultantOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-12: Consultorías NO visible en sidebar',
  'Verificar que Consultorías NO aparece en sidebar (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Consultorías NO visible (consultantOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-13: Feedback NO visible en sidebar',
  'Verificar que Feedback NO aparece en sidebar (restrictedRoles: docente/admin/consultor). Gap #3: accesible via URL.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Feedback NO visible (restrictedRoles)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-14: Noticias NO visible en sidebar',
  'Verificar que Noticias NO aparece en sidebar (restrictedRoles: admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Noticias NO visible (restrictedRoles)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-15: Eventos NO visible en sidebar',
  'Verificar que Eventos NO aparece en sidebar (restrictedRoles: admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Eventos NO visible (restrictedRoles)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-16: Gestión NO visible en sidebar',
  'Verificar que Gestión NO aparece en sidebar (restrictedRoles: admin/community_manager).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Gestión NO visible (restrictedRoles)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-17: Configuración NO visible en sidebar',
  'Verificar que Configuración NO aparece en sidebar (permission: manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Configuración NO visible (permission check)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-18: Rutas de Aprendizaje NO visible en sidebar',
  'Verificar que Rutas de Aprendizaje NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Rutas de Aprendizaje NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-19: Matriz de Asignaciones NO visible en sidebar',
  'Verificar que Matriz de Asignaciones NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Matriz de Asignaciones NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-20: QA Testing NO visible en sidebar',
  'Verificar que QA Testing NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"QA Testing NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-21: Vías de Transformación NO visible en sidebar',
  'Verificar que Vías de Transformación NO aparece en sidebar (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Vías de Transformación NO visible (adminOnly)"}]'::jsonb,
  3, 2, true, false, false
),
(
  'lider_generacion',
  'SV-22: Roles y Permisos NO visible en sidebar',
  'Verificar que Roles y Permisos NO aparece en sidebar (superadminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Observar sidebar","expectedOutcome":"Roles y Permisos NO visible (superadminOnly)"}]'::jsonb,
  3, 2, true, false, false
),

-- INTEGRITY CHECK
(
  'lider_generacion',
  'SV-23: Verificación de integridad - No hay elementos duplicados',
  'Verificar que cada elemento del sidebar aparece exactamente una vez.',
  'navigation',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Contar cada elemento visible","expectedOutcome":"Cada elemento aparece exactamente una vez"}]'::jsonb,
  3, 3, true, false, false
);

-- ============================================================================
-- EDGE CASES - 7 SCENARIOS (EC-1 to EC-7)
-- Testing: Unusual but realistic scenarios
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

(
  'lider_generacion',
  'EC-1: Lider sin generation_id intenta acceder al dashboard',
  'Verificar que dashboard carga pero reportes devuelven vacío sin generation_id.',
  'docente_experience',
  '[{"type":"role","description":"Lider_generacion sin generation_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl sin generation_id","expectedOutcome":"Dashboard carga normalmente"},{"index":2,"instruction":"Intentar acceder a reportes","expectedOutcome":"Reportes devuelven vacío"}]'::jsonb,
  4, 3, true, false, false
),
(
  'lider_generacion',
  'EC-2: generation_id en user_roles pero NO en profiles',
  'Verificar inconsistencia: detailed funciona, overview/filter-options devuelven vacío.',
  'reporting',
  '[{"type":"role","description":"Lider con generation_id SOLO en user_roles"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión con generation_id en user_roles","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"realizar la acción correspondiente","expectedOutcome":"Funciona"},{"index":3,"instruction":"realizar la acción correspondiente","expectedOutcome":"Vacío"}]'::jsonb,
  3, 5, true, false, false
),
(
  'lider_generacion',
  'EC-3: Lider con múltiples roles (lider_generacion + docente)',
  'Verificar que múltiples roles funcionan correctamente con roles.some().',
  'role_assignment',
  '[{"type":"role","description":"Usuario con roles lider_generacion y docente"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión con ambos roles","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Verificar funcionalidades de ambos roles","expectedOutcome":"Ambos roles funcionan"}]'::jsonb,
  3, 5, true, false, false
),
(
  'lider_generacion',
  'EC-4: Acceso directo a API bypass de sidebar',
  'Verificar que controles server-side se aplican sin importar cómo se accede.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar directamente a /detailed-reports","expectedOutcome":"Reportes cargan (Gap #1: visible via URL)"}]'::jsonb,
  2, 3, true, false, false
),
(
  'lider_generacion',
  'EC-5: Intento de acceso a páginas de QA',
  'Verificar que páginas de QA están protegidas (adminOnly).',
  'role_assignment',
  '[{"type":"role","description":"Lider_generacion autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Intentar acceder a la página de Escenarios QA","expectedOutcome":"Acceso denegado"}]'::jsonb,
  1, 2, true, false, false
),
(
  'lider_generacion',
  'EC-6: Expiración de sesión en página de reportes',
  'Verificar manejo de expiración de sesión.',
  'reporting',
  '[{"type":"role","description":"Lider_generacion autenticado"},{"type":"custom","description":"Sesión va a expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como lider-gen.qa@fne.cl","expectedOutcome":"Dashboard carga"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Reportes cargan"},{"index":3,"instruction":"Esperar expiración de sesión","expectedOutcome":"Redirige a login"}]'::jsonb,
  3, 5, true, false, false
),
(
  'lider_generacion',
  'EC-7: requiresGeneration validation gap',
  'Verificar que requiresGeneration=false permite asignación sin generation_id (Gap #2).',
  'role_assignment',
  '[{"type":"custom","description":"requiresGeneration=false en types/roles.ts"}]'::jsonb,
  '[{"index":1,"instruction":"Revisar types/roles.ts line 326","expectedOutcome":"requiresGeneration: false"},{"index":2,"instruction":"Revisar description line 328","expectedOutcome":"Dice que requiere generation"},{"index":3,"instruction":"Documentar inconsistencia","expectedOutcome":"Gap de validación confirmado"}]'::jsonb,
  2, 3, true, false, false
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
-- WHERE role_required = 'lider_generacion' AND is_active = true;
