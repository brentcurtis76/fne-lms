-- ============================================================================
-- QA Scenarios Seed Script: SUPERVISOR_DE_RED Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: supervisor_de_red
-- Total Scenarios: 60
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_SUPERVISOR_DE_RED.md
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 13 scenarios (PB-1 to PB-13)
--   - Correct Access (Should ALLOW): 10 scenarios (CA-1 to CA-10)
--   - Network Scoping: 8 scenarios (NS-1 to NS-8)
--   - Sidebar Visibility: 22 scenarios (SV-1 to SV-22)
--   - Edge Cases: 7 scenarios (EC-1 to EC-7)
--
-- PRIORITIES:
--   1 = Critical (security, authentication)
--   2 = High (role-based permissions)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'supervisor_de_red' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (except EC-6, EC-7)
--
-- CRITICAL NOTE: Migration 20260208160000_add_supervisor_network_support.sql
--                MUST be applied before testing these scenarios.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERMISSION BOUNDARIES - 13 SCENARIOS (PB-1 to PB-13)
-- Testing: What supervisors CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1: Supervisor tries to create a new course
(
  'supervisor_de_red',
  'PB-1: Supervisor intenta crear un nuevo curso',
  'Verificar que supervisores de red no pueden crear cursos. El acceso debe ser denegado con error 403.',
  'course_builder',
  '[{"type":"role","description":"Iniciar sesión como supervisor_de_red"},{"type":"navigation","description":"El usuario supervisor debe estar autenticado"},{"type":"custom","description":"El sidebar no debe mostrar el menú Cursos"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard del supervisor"},{"index":2,"instruction":"Intentar acceder a la página de Creación de Curso","expectedOutcome":"Se muestra página de acceso denegado o se redirige al dashboard"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo curso","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Cursos NO aparece en la barra lateral","expectedOutcome":"El elemento Cursos no es visible en el sidebar"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-2: Supervisor tries to create a user
(
  'supervisor_de_red',
  'PB-2: Supervisor intenta crear un usuario',
  'Verificar que supervisores de red no pueden crear usuarios. El acceso debe ser denegado.',
  'user_management',
  '[{"type":"role","description":"Iniciar sesión como supervisor_de_red"},{"type":"navigation","description":"El usuario está autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Usuarios","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Intentar realizar la acción con datos de nuevo usuario","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":4,"instruction":"Verificar que el menú Usuarios NO aparece en la barra lateral","expectedOutcome":"El elemento Usuarios no es visible"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-3: Supervisor tries to edit another user's profile
(
  'supervisor_de_red',
  'PB-3: Supervisor intenta editar el perfil de otro usuario',
  'Verificar que supervisores de red no pueden editar perfiles de otros usuarios.',
  'user_management',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Existe un usuario diferente en el sistema"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos modificados","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay formulario de edición de usuario disponible","expectedOutcome":"El formulario no está accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-4: Supervisor tries to assign roles to users
(
  'supervisor_de_red',
  'PB-4: Supervisor intenta asignar roles a usuarios',
  'Verificar que supervisores de red no pueden asignar roles.',
  'role_assignment',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos de asignación de rol","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que no hay opción de asignar roles en la UI","expectedOutcome":"La opción no es accesible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-5: Supervisor tries to manage schools
(
  'supervisor_de_red',
  'PB-5: Supervisor intenta gestionar colegios',
  'Verificar que supervisores de red no pueden acceder a gestión de colegios.',
  'school_management',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Escuelas","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Escuelas NO aparece en la barra lateral","expectedOutcome":"El elemento Escuelas no es visible"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-6: Supervisor tries to manage network of schools
(
  'supervisor_de_red',
  'PB-6: Supervisor intenta gestionar red de colegios (página admin)',
  'Verificar que supervisores de red no pueden acceder a gestión de redes (página administrativa).',
  'network_management',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Gestión de Redes","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Redes de Colegios NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (gestión es admin-only)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-7: Supervisor tries to create an assessment template
(
  'supervisor_de_red',
  'PB-7: Supervisor intenta crear una plantilla de evaluación',
  'Verificar que supervisores de red no pueden crear plantillas de evaluación.',
  'assessment_builder',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con datos de nueva plantilla","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que supervisor NO está en la lista de roles con permiso de escritura","expectedOutcome":"Solo admin tiene permiso de escritura en assessment-permissions.ts"}]'::jsonb,
  2, 3, true, false, false
),

-- PB-8: Supervisor tries to access quiz review page
(
  'supervisor_de_red',
  'PB-8: Supervisor intenta acceder a página de revisión de quizzes',
  'Verificar que supervisores de red no pueden acceder a revisión de quizzes.',
  'quiz_submission',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Revisión de Quizzes","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Verificar que supervisor NO está en allowedRoles","expectedOutcome":"Solo admin, consultor, equipo_directivo permitidos (quiz-reviews.tsx:28, pending.ts:56)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-9: Supervisor tries to grade a quiz review
(
  'supervisor_de_red',
  'PB-9: Supervisor intenta calificar una revisión de quiz',
  'Verificar que supervisores de red no pueden calificar quizzes.',
  'quiz_submission',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar realizar la acción con calificación","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que supervisor NO está en allowedRoles del endpoint","expectedOutcome":"Solo admin, consultor, equipo_directivo permitidos"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-10: Supervisor tries to assign consultants to schools
(
  'supervisor_de_red',
  'PB-10: Supervisor intenta asignar consultores a colegios',
  'Verificar que supervisores de red no pueden asignar consultores.',
  'role_assignment',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Asignación de Consultores","expectedOutcome":"Se muestra página de acceso denegado o se redirige"},{"index":3,"instruction":"Verificar que el menú Asignación de Consultores NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (adminOnly: true)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-11: Supervisor tries to access system configuration
(
  'supervisor_de_red',
  'PB-11: Supervisor intenta acceder a configuración del sistema',
  'Verificar que supervisores de red no pueden acceder a configuración.',
  'role_assignment',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Configuración","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Configuración NO aparece en la barra lateral","expectedOutcome":"El elemento no es visible (requiere manage_system_settings)"}]'::jsonb,
  1, 2, true, false, false
),

-- PB-12: Supervisor tries to create/edit news items
(
  'supervisor_de_red',
  'PB-12: Supervisor intenta crear o editar noticias',
  'Verificar que supervisores de red no pueden gestionar noticias.',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Noticias","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Noticias NO aparece en la barra lateral","expectedOutcome":"El elemento Noticias no es visible (solo para admin/community_manager)"}]'::jsonb,
  2, 2, true, false, false
),

-- PB-13: Supervisor tries to create/edit events
(
  'supervisor_de_red',
  'PB-13: Supervisor intenta crear o editar eventos',
  'Verificar que supervisores de red no pueden gestionar eventos.',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a la página de Eventos","expectedOutcome":"Se muestra página de acceso denegado"},{"index":3,"instruction":"Verificar que el menú Eventos NO aparece en la barra lateral","expectedOutcome":"El elemento Eventos no es visible (solo para admin/community_manager)"}]'::jsonb,
  2, 2, true, false, false
);

-- ============================================================================
-- CORRECT ACCESS - 10 SCENARIOS (CA-1 to CA-10)
-- Testing: What supervisors CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1: Supervisor views their dashboard
(
  'supervisor_de_red',
  'CA-1: Supervisor visualiza su panel de control',
  'Verificar que supervisores de red pueden acceder a su dashboard con datos de su red de colegios.',
  'docente_experience',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Supervisor tiene red asignada (red_id en user_roles)"},{"type":"custom","description":"La red tiene colegios asignados en red_escuelas"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard correctamente"},{"index":2,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"La página carga correctamente con datos de la red asignada"},{"index":3,"instruction":"Verificar que se muestran estadísticas solo de colegios de la red","expectedOutcome":"Los datos mostrados corresponden solo a los colegios de la red asignada"}]'::jsonb,
  1, 3, true, false, false
),

-- CA-2: Supervisor views their profile
(
  'supervisor_de_red',
  'CA-2: Supervisor visualiza su perfil',
  'Verificar que supervisores de red pueden ver y acceder a su perfil.',
  'user_management',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Perfil","expectedOutcome":"La página de perfil carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los datos del supervisor autenticado","expectedOutcome":"El perfil muestra información correcta"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-3: Supervisor views 'Mi Aprendizaje' (dual behavior - student)
(
  'supervisor_de_red',
  'CA-3: Supervisor visualiza Mi Aprendizaje (comportamiento dual)',
  'Verificar que supervisores de red pueden ver la página de aprendizaje e inscribirse como estudiantes.',
  'course_enrollment',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Hay cursos disponibles"},{"type":"custom","description":"Supervisor puede inscribirse en cursos como estudiante (dual behavior)"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Mi Aprendizaje o hacer clic en menú Mi Aprendizaje","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran los cursos disponibles","expectedOutcome":"Se listan los cursos (supervisor puede inscribirse como estudiante per role description)"}]'::jsonb,
  3, 2, true, false, false
),

-- CA-4: Supervisor views detailed reports
(
  'supervisor_de_red',
  'CA-4: Supervisor visualiza reportes detallados',
  'Verificar que supervisores de red pueden ver reportes detallados de su red.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Supervisor tiene red asignada con colegios"},{"type":"data","description":"Hay datos de reporte disponibles para los colegios de la red"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados o hacer clic en menú Reportes","expectedOutcome":"La página carga correctamente"},{"index":3,"instruction":"Verificar que se muestran reportes filtrados por red asignada","expectedOutcome":"Los datos mostrados corresponden solo a colegios de la red (detailed.ts:694-722 usa 3-step pattern)"}]'::jsonb,
  2, 5, true, false, false
),

-- CA-5: Supervisor views report overview
(
  'supervisor_de_red',
  'CA-5: Supervisor visualiza resumen de reportes',
  'Verificar que supervisores de red pueden ver el resumen de reportes de su red.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Supervisor tiene red asignada con colegios"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que la funcionalidad opera correctamente","expectedOutcome":"Los datos se muestran correctamente con datos de la red"},{"index":3,"instruction":"Verificar que solo se retornan usuarios de colegios de la red","expectedOutcome":"overview.ts:- usa 3-step pattern para filtrar por red"}]'::jsonb,
  2, 4, true, false, false
),

-- CA-6: Supervisor views report filter options
(
  'supervisor_de_red',
  'CA-6: Supervisor visualiza opciones de filtro de reportes',
  'Verificar que supervisores de red ven opciones de filtro limitadas a su red.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Supervisor tiene red asignada con colegios"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que la funcionalidad opera correctamente","expectedOutcome":"Los datos se muestran correctamente con opciones de filtro"},{"index":3,"instruction":"Verificar que solo se listan colegios de la red","expectedOutcome":"filter-options.ts:166-194 filtra por red_id del supervisor"}]'::jsonb,
  2, 3, true, false, false
),

-- CA-7: Supervisor views school-level reports (functionality gap)
(
  'supervisor_de_red',
  'CA-7: Supervisor visualiza reportes a nivel de colegio',
  'Verificar que supervisores de red pueden acceder a reportes por colegio (FUNCTIONALITY GAP - retorna vacío).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Hay datos de reporte disponibles"},{"type":"custom","description":"FUNCTIONALITY GAP: getAccessibleSchools() solo maneja admin/consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a realizar la acción correspondiente","expectedOutcome":"Los datos se muestran correctamente pero data vacía (supervisor en allowedRoles pero getAccessibleSchools no lo maneja)"},{"index":3,"instruction":"Documentar como functionality gap, no como bug de seguridad","expectedOutcome":"Feature incompleta, no data leak"}]'::jsonb,
  3, 3, true, false, false
),

-- CA-8: Supervisor views community reports (functionality gap)
(
  'supervisor_de_red',
  'CA-8: Supervisor visualiza reportes de comunidad',
  'Verificar que supervisores de red pueden acceder a reportes de comunidad (FUNCTIONALITY GAP - retorna vacío).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"FUNCTIONALITY GAP: getAccessibleCommunities() solo maneja admin/consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a realizar la acción correspondiente","expectedOutcome":"Los datos se muestran correctamente pero data vacía"},{"index":3,"instruction":"Documentar como functionality gap","expectedOutcome":"Feature incompleta"}]'::jsonb,
  3, 3, true, false, false
),

-- CA-9: Supervisor views course analytics (functionality gap)
(
  'supervisor_de_red',
  'CA-9: Supervisor visualiza analíticas de cursos',
  'Verificar que supervisores de red pueden acceder a analíticas de cursos (FUNCTIONALITY GAP - retorna vacío).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"FUNCTIONALITY GAP: getReportableUsers() solo maneja admin/consultor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar acceder a realizar la acción correspondiente","expectedOutcome":"Los datos se muestran correctamente pero data vacía"},{"index":3,"instruction":"Documentar como functionality gap","expectedOutcome":"Feature incompleta"}]'::jsonb,
  3, 3, true, false, false
),

-- CA-10: Supervisor views unified dashboard
(
  'supervisor_de_red',
  'CA-10: Supervisor visualiza dashboard unificado',
  'Verificar que supervisores de red pueden ver el dashboard unificado con datos de su red.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Supervisor tiene red asignada con colegios"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que la funcionalidad opera correctamente","expectedOutcome":"Los datos se muestran correctamente con datos agregados"},{"index":3,"instruction":"Verificar que solo se retornan datos de colegios de la red","expectedOutcome":"unified.ts:166-193 usa 3-step pattern para filtrar usuarios"}]'::jsonb,
  2, 4, true, false, false
);

-- ============================================================================
-- NETWORK SCOPING - 8 SCENARIOS (NS-1 to NS-8)
-- Testing: Data filtering by assigned network (CRITICAL SECURITY BOUNDARY)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- NS-1: Reports only show assigned network schools
(
  'supervisor_de_red',
  'NS-1: Reportes solo muestran colegios de la red asignada',
  'Verificar que los reportes filtran datos por red asignada del supervisor (FIXED: migration añadió user_roles.red_id).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Hay múltiples redes en el sistema"},{"type":"data","description":"El supervisor está asignado a una red específica (user_roles.red_id)"},{"type":"custom","description":"CRITICAL FIX: 4 API routes reescritos para usar red_id -> red_escuelas.red_id -> school_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página de reportes"},{"index":3,"instruction":"Observar que solo se muestran datos de colegios de la red asignada","expectedOutcome":"Sin datos de otras redes (verified by red_id filtering in El sistema)"},{"index":4,"instruction":"Verificar que no hay datos de colegios fuera de la red","expectedOutcome":"Solo datos de la red asignada"}]'::jsonb,
  1, 5, true, false, false
),

-- NS-2: Supervisor with no network assignment (red_id is null)
(
  'supervisor_de_red',
  'NS-2: Supervisor sin asignación de red (red_id es null)',
  'Verificar que supervisor sin red asignada recibe datos vacíos sin errores.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"user_roles.red_id es NULL para este supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor con red_id NULL","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página sin datos"},{"index":3,"instruction":"Verificar que APIs retornan arrays vacíos (no errores)","expectedOutcome":"Todas las APIs tienen early return: if (!supervisorRole?.red_id) return []"}]'::jsonb,
  2, 3, true, false, false
),

-- NS-3: URL manipulation to access different network
(
  'supervisor_de_red',
  'NS-3: Supervisor intenta ver datos de otra red (manipulación de URL)',
  'Verificar que la API rechaza consultas de datos de otras redes.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Hay otra red en el sistema diferente a la asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Intentar manipular parámetros de URL o payload para acceder a otra red","expectedOutcome":"El sistema server-side por user_roles.red_id del supervisor"},{"index":3,"instruction":"Verificar que red_id del supervisor se usa en TODOS los queries","expectedOutcome":"Sin acceso cross-network (RLS policies también enforzan)"}]'::jsonb,
  1, 3, true, false, false
),

-- NS-4: View user details for user IN network
(
  'supervisor_de_red',
  'NS-4: Supervisor visualiza detalles de usuario DENTRO de su red',
  'Verificar que supervisor puede ver detalles de usuarios en su red (FIXED: user-details.ts).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Existe usuario en un colegio de la red del supervisor"},{"type":"custom","description":"CRITICAL FIX: user-details.ts ahora llama supervisor_can_access_user() DB function"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que la funcionalidad opera correctamente","expectedOutcome":"Los datos se muestran correctamente con detalles completos del usuario"},{"index":3,"instruction":"Verificar que supervisor_can_access_user() retorna true","expectedOutcome":"DB function verifica que school del usuario está en red del supervisor"}]'::jsonb,
  1, 4, true, false, false
),

-- NS-5: View user details for user OUTSIDE network
(
  'supervisor_de_red',
  'NS-5: Supervisor intenta ver detalles de usuario FUERA de su red',
  'Verificar que supervisor NO puede ver detalles de usuarios fuera de su red (FIXED: user-details.ts).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Existe usuario en un colegio NO en la red del supervisor"},{"type":"custom","description":"CRITICAL FIX: user-details.ts línea 150 ya no retorna true incondicional"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que la funcionalidad opera correctamente","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Verificar que supervisor_can_access_user() retorna false","expectedOutcome":"DB function verifica que school del usuario NO está en red del supervisor"}]'::jsonb,
  1, 4, true, false, false
),

-- NS-6: Network with zero schools assigned
(
  'supervisor_de_red',
  'NS-6: Red con cero colegios asignados',
  'Verificar que supervisor en red sin colegios recibe datos vacíos sin errores.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"user_roles.red_id apunta a red válida"},{"type":"custom","description":"red_escuelas no tiene filas para esta red_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor con red vacía","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página sin datos"},{"index":3,"instruction":"Verificar que queries retornan arrays vacíos","expectedOutcome":"if (networkSchools && networkSchools.length > 0) {} no ejecuta"}]'::jsonb,
  3, 3, true, false, false
),

-- NS-7: Two supervisors of different networks view same endpoint
(
  'supervisor_de_red',
  'NS-7: Dos supervisores de diferentes redes ven el mismo endpoint',
  'Verificar que cada supervisor solo ve datos de su propia red (no cross-network leakage).',
  'reporting',
  '[{"type":"role","description":"Dos supervisores autenticados en diferentes sesiones"},{"type":"data","description":"Cada supervisor asignado a red diferente"},{"type":"data","description":"Hay datos de reportes en ambas redes"}]'::jsonb,
  '[{"index":1,"instruction":"Sesión 1: Iniciar sesión como supervisor.qa1@fne.cl (red A)","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Sesión 2: Iniciar sesión como supervisor.qa2@fne.cl (red B)","expectedOutcome":"Se accede al dashboard"},{"index":3,"instruction":"Ambas sesiones: Verificar que la funcionalidad opera correctamente","expectedOutcome":"Cada supervisor ve solo sus propios datos de red"},{"index":4,"instruction":"Verificar que red_id filtering es per-user via session.user.id","expectedOutcome":"Sin shared state, sin cross-network leakage"}]'::jsonb,
  1, 7, true, false, true
),

-- NS-8: Advanced filters load ALL schools (low severity info disclosure)
(
  'supervisor_de_red',
  'NS-8: Filtros avanzados cargan TODOS los colegios (info disclosure bajo)',
  'Verificar que AdvancedFilters.tsx carga todos los colegios para supervisor (nombres visibles en dropdown).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"LOW SEVERITY: school names visible, pero API enforza data scoping"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Abrir componente AdvancedFilters","expectedOutcome":"Dropdown de colegios muestra TODOS los colegios del sistema"},{"index":3,"instruction":"Verificar que supervisor puede VER nombres pero NO puede acceder a datos","expectedOutcome":"API-level data scoping enforza red_id (sin data leak, solo name leak)"}]'::jsonb,
  4, 3, true, false, false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 22 SCENARIOS (SV-1 to SV-22)
-- Testing: Navigation menu visibility
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- VISIBLE ITEMS: 7 scenarios (SV-1 to SV-7)

-- SV-1: Supervisor sees 'Mi Panel' in sidebar
(
  'supervisor_de_red',
  'SV-1: Supervisor ve Mi Panel en la barra lateral',
  'Verificar que el elemento Mi Panel es visible en el sidebar del supervisor.',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral izquierda","expectedOutcome":"El elemento Mi Panel es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-2: Supervisor sees 'Mi Perfil' in sidebar
(
  'supervisor_de_red',
  'SV-2: Supervisor ve Mi Perfil en la barra lateral',
  'Verificar que el elemento Mi Perfil es visible.',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Perfil es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-3: Supervisor sees 'Mi Aprendizaje' in sidebar
(
  'supervisor_de_red',
  'SV-3: Supervisor ve Mi Aprendizaje en la barra lateral',
  'Verificar que el elemento Mi Aprendizaje es visible (dual behavior - puede inscribirse como estudiante).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Mi Aprendizaje es visible"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-4: Supervisor sees 'Reportes' in sidebar (conditional - depends on RBAC)
(
  'supervisor_de_red',
  'SV-4: Supervisor ve Reportes en la barra lateral (condicional - RBAC)',
  'Verificar si Reportes es visible (supervisor NO en consultantOnly list, puede ser otorgado via RBAC).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"Supervisor NO está en consultantOnly list ([admin, consultor])"},{"type":"custom","description":"Visibilidad depende de RBAC permission grant en DB"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"Verificar si Reportes es visible"},{"index":3,"instruction":"Si visible: verificar permission en DB","expectedOutcome":"RBAC permission system otorgó acceso"},{"index":4,"instruction":"Si no visible: confirmar que supervisor no tiene permission","expectedOutcome":"Sin permission grant en DB"}]'::jsonb,
  3, 3, true, false, false
),

-- SV-5: Supervisor sees 'Feedback' in sidebar (conditional - depends on restrictedRoles)
(
  'supervisor_de_red',
  'SV-5: Supervisor ve Feedback en la barra lateral (condicional - restrictedRoles)',
  'Verificar si Feedback es visible (depende de lista restrictedRoles en Sidebar.tsx).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"Visibilidad depende de restrictedRoles config"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"Verificar si Feedback es visible"},{"index":3,"instruction":"Revisar Sidebar.tsx para restrictedRoles de docente-assessments","expectedOutcome":"Si supervisor en lista, visible; si no, oculto"}]'::jsonb,
  3, 2, true, false, false
),

-- SV-6: Supervisor sees 'Espacio Colaborativo' in sidebar (conditional - requires community)
(
  'supervisor_de_red',
  'SV-6: Supervisor ve Espacio Colaborativo en la barra lateral (condicional - comunidad)',
  'Verificar si Espacio Colaborativo es visible (supervisores NO exentos de requisito de comunidad).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"requiresCommunity: true para workspace"},{"type":"custom","description":"Supervisores NO exentos (solo consultors exentos en línea 702)"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"Verificar si Espacio Colaborativo es visible"},{"index":3,"instruction":"Si visible: confirmar que supervisor es miembro de comunidad","expectedOutcome":"Membership verificado"},{"index":4,"instruction":"Si no visible: confirmar que supervisor NO es miembro de comunidad","expectedOutcome":"No membership"}]'::jsonb,
  3, 3, true, false, false
),

-- SV-7: Supervisor sees dashboard cards (conditional - depends on populated data)
(
  'supervisor_de_red',
  'SV-7: Supervisor ve tarjetas de dashboard (condicional - datos poblados)',
  'Verificar que dashboard muestra tarjetas para supervisor (UnifiedDashboard.tsx:69-70).',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"Hay datos en la red del supervisor"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que se muestran tarjetas: schoolsOverview, communityHealth, performanceMetrics","expectedOutcome":"Tarjetas visibles con datos de red"}]'::jsonb,
  3, 3, true, false, false
),

-- NOT VISIBLE ITEMS: 15 scenarios (SV-8 to SV-22)

-- SV-8 to SV-22: All admin-only, consultantOnly, or community_manager-only items
-- Following the same pattern as consultor scenarios for brevity

(
  'supervisor_de_red',
  'SV-8: Supervisor NO ve Cursos en la barra lateral',
  'Verificar que Cursos no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral completa","expectedOutcome":"El elemento Cursos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-9: Supervisor NO ve Usuarios en la barra lateral',
  'Verificar que Usuarios no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Usuarios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-10: Supervisor NO ve Escuelas en la barra lateral',
  'Verificar que Escuelas no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Escuelas NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-11: Supervisor NO ve Redes de Colegios en la barra lateral',
  'Verificar que Redes de Colegios no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Redes de Colegios NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-12: Supervisor NO ve Revisión de Quizzes en la barra lateral',
  'Verificar que Revisión de Quizzes no es visible (consultantOnly: true, supervisor NO en lista).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Revisión de Quizzes NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-13: Supervisor NO ve Procesos de Cambio en la barra lateral',
  'Verificar que Procesos de Cambio no es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Procesos de Cambio NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-14: Supervisor NO ve Noticias en la barra lateral',
  'Verificar que Noticias no es visible (admin/community_manager only).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Noticias NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-15: Supervisor NO ve Eventos en la barra lateral',
  'Verificar que Eventos no es visible (admin/community_manager only).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Eventos NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-16: Supervisor NO ve Gestión en la barra lateral',
  'Verificar que Gestión no es visible (admin/community_manager only).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Gestión NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-17: Supervisor NO ve Configuración en la barra lateral',
  'Verificar que Configuración no es visible (requiere manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Configuración NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-18: Supervisor NO ve Asignación de Consultores en la barra lateral',
  'Verificar que Asignación de Consultores no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Expandir menú Consultorías si existe","expectedOutcome":"El elemento Asignación de Consultores NO es visible en el submenu"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-19: Supervisor NO ve Rutas de Aprendizaje en la barra lateral',
  'Verificar que Rutas de Aprendizaje no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Rutas de Aprendizaje NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-20: Supervisor NO ve Matriz de Asignaciones en la barra lateral',
  'Verificar que Matriz de Asignaciones no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Matriz de Asignaciones NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-21: Supervisor NO ve QA Testing en la barra lateral',
  'Verificar que QA Testing no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento QA Testing NO es visible"}]'::jsonb,
  3, 2, true, false, false
),

(
  'supervisor_de_red',
  'SV-22: Supervisor NO ve Vías de Transformación en la barra lateral',
  'Verificar que Vías de Transformación no es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Supervisor autenticado"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Observar la barra lateral","expectedOutcome":"El elemento Vías de Transformación NO es visible"}]'::jsonb,
  3, 2, true, false, false
);

-- ============================================================================
-- EDGE CASES - 7 SCENARIOS (EC-1 to EC-7)
-- Testing: Unusual but realistic scenarios
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- EC-1: Supervisor with no network assignment (red_id is null)
(
  'supervisor_de_red',
  'EC-1: Supervisor sin asignación de red (red_id es null) intenta acceder',
  'Verificar que supervisor sin red asignada recibe estado vacío apropiado.',
  'docente_experience',
  '[{"type":"role","description":"Existe supervisor con red_id NULL"},{"type":"navigation","description":"El supervisor no tiene red asignada"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor con red_id NULL","expectedOutcome":"Se accede al sistema"},{"index":2,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"Se muestra dashboard con estado vacío"},{"index":3,"instruction":"Verificar que el sistema maneja correctamente la ausencia de red","expectedOutcome":"APIs retornan arrays vacíos, sin errores de runtime"}]'::jsonb,
  4, 3, true, false, false
),

-- EC-2: Supervisor has multiple role records
(
  'supervisor_de_red',
  'EC-2: Supervisor tiene múltiples registros de rol (supervisor_de_red + docente)',
  'Verificar que los múltiples roles funcionan correctamente con validaciones.',
  'role_assignment',
  '[{"type":"role","description":"El usuario tiene roles supervisor_de_red y docente asignados"},{"type":"custom","description":"Permisos se validan usando roles.some()"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como usuario con roles supervisor_de_red y docente","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Verificar que las funcionalidades de supervisor son accesibles","expectedOutcome":"Se muestran opciones de supervisor"},{"index":3,"instruction":"Verificar que las funcionalidades de docente también son accesibles","expectedOutcome":"Se muestran opciones de docente"},{"index":4,"instruction":"Verificar que los controles de permiso validan correctamente","expectedOutcome":"Los roles se validan con roles.some() correctamente"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-3: Network with no schools assigned
(
  'supervisor_de_red',
  'EC-3: Red con cero colegios asignados',
  'Verificar que supervisor en red sin colegios recibe estado vacío sin errores.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"data","description":"user_roles.red_id apunta a red válida"},{"type":"custom","description":"red_escuelas no tiene filas para esta red_id"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor con red vacía","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página sin datos"},{"index":3,"instruction":"Verificar que no hay errores de runtime","expectedOutcome":"APIs retornan arrays vacíos gracefully"}]'::jsonb,
  4, 3, true, false, false
),

-- EC-4: Direct API access bypassing sidebar
(
  'supervisor_de_red',
  'EC-4: Supervisor accede a API directamente (bypass de UI)',
  'Verificar que los controles de permiso server-side se aplican sin importar cómo se accede.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"navigation","description":"Se accede directamente a API sin UI"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se obtiene sesión válida"},{"index":2,"instruction":"Intentar realizar la acción directamente","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"},{"index":3,"instruction":"Intentar realizar la acción directamente","expectedOutcome":"Los datos se muestran correctamente con datos filtrados por red"}]'::jsonb,
  2, 3, true, false, false
),

-- EC-5: Session expires on reports page
(
  'supervisor_de_red',
  'EC-5: Sesión del supervisor expira en página de reportes',
  'Verificar que el sistema maneja expiración de sesión correctamente.',
  'reporting',
  '[{"type":"role","description":"Supervisor autenticado"},{"type":"custom","description":"Sesión va a expirar"}]'::jsonb,
  '[{"index":1,"instruction":"Iniciar sesión como supervisor.qa@fne.cl","expectedOutcome":"Se accede al dashboard"},{"index":2,"instruction":"Navegar a la página de Reportes Detallados","expectedOutcome":"Se muestra la página"},{"index":3,"instruction":"Esperar a que la sesión expire (o simular expiración)","expectedOutcome":"Se redirige a página de login"},{"index":4,"instruction":"Verificar que no hay datos obsoletos visibles","expectedOutcome":"No se muestra contenido antiguo de sesión anterior"}]'::jsonb,
  3, 5, true, false, false
),

-- EC-6: Two supervisors of different networks view same dashboard
(
  'supervisor_de_red',
  'EC-6: Dos supervisores de diferentes redes ven el mismo dashboard',
  'Verificar que cada supervisor solo ve datos de su propia red (aislamiento).',
  'reporting',
  '[{"type":"role","description":"Dos supervisores autenticados en diferentes pestañas"},{"type":"data","description":"Cada supervisor asignado a red diferente"},{"type":"data","description":"Hay datos de reportes en ambas redes"}]'::jsonb,
  '[{"index":1,"instruction":"Pestaña 1: Iniciar sesión como supervisor.qa1@fne.cl (red A)","expectedOutcome":"Se accede al dashboard del supervisor 1"},{"index":2,"instruction":"Pestaña 2: Iniciar sesión como supervisor.qa2@fne.cl (red B)","expectedOutcome":"Se accede al dashboard del supervisor 2"},{"index":3,"instruction":"Ambas pestañas: Ver dashboard","expectedOutcome":"Cada supervisor ve solo sus propios datos de red"},{"index":4,"instruction":"Verificar que red_id filtering es per-user","expectedOutcome":"Sin shared state, sin cross-network leakage"}]'::jsonb,
  2, 7, true, false, true
),

-- EC-7: Admin assigns supervisor to school (school_id populated) - edge case
(
  'supervisor_de_red',
  'EC-7: Admin asigna supervisor a colegio específico (edge case conceptual)',
  'Verificar que asignar school_id a supervisor no causa errores (edge case conceptual, no diseño intencionado).',
  'role_assignment',
  '[{"type":"role","description":"Admin autenticado"},{"type":"custom","description":"supervisor_de_red requiresSchool: false pero admin puede poblar school_id"}]'::jsonb,
  '[{"index":1,"instruction":"Como admin: asignar supervisor_de_red con school_id poblado en user_roles","expectedOutcome":"Registro se crea sin errores"},{"index":2,"instruction":"Iniciar sesión como supervisor con school_id Y red_id poblados","expectedOutcome":"Se accede al dashboard"},{"index":3,"instruction":"Verificar que red_id es usado para filtrado (no school_id)","expectedOutcome":"APIs usan red_id, no school_id (migration comments clarify)"},{"index":4,"instruction":"Documentar como edge case conceptual","expectedOutcome":"No causa runtime error pero conceptualmente inconsistente con role definition"}]'::jsonb,
  4, 5, true, false, false
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
-- WHERE role_required = 'supervisor_de_red' AND is_active = true;
