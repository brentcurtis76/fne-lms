-- ============================================================================
-- QA Scenarios Seed Script: COMMUNITY_MANAGER Role
-- ============================================================================
-- Database: FNE Learning Management System
-- Role: community_manager
-- Total Scenarios: 67
-- Date Created: 2026-02-08
-- Source: QA_SCENARIOS_COMMUNITY_MANAGER.md (audited 2026-02-08)
--
-- CATEGORIES:
--   - Permission Boundaries (Should DENY): 19 scenarios (PB-1 to PB-19)
--   - Correct Access (Should ALLOW): 14 scenarios (CA-1 to CA-14)
--   - Content Management Scoping: 6 scenarios (CMS-1 to CMS-6)
--   - Sidebar Visibility: 28 scenarios (SV-1 to SV-28)
--   - Edge Cases: 7 scenarios (EC-1 to EC-7)
--
-- PRIORITIES:
--   1 = Critical (security, authentication)
--   2 = High (role-based permissions)
--   3 = Medium (access control, features)
--   4 = Low (edge cases, nice-to-have)
--
-- COLUMNS:
--   - role_required: 'community_manager' for all rows
--   - name: Spanish scenario name (short, descriptive)
--   - description: Spanish description (what's being tested)
--   - feature_area: Must match FeatureArea enum from types/qa/index.ts
--   - preconditions: JSON array of {type, description, value?}
--   - steps: JSON array of {index, instruction, expectedOutcome}
--   - priority: 1-4 (see above)
--   - estimated_duration_minutes: realistic estimate
--   - is_active: true (all active)
--   - automated_only: false (manual QA tester scenarios)
--   - is_multi_user: false (except EC-6)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERMISSION BOUNDARIES - 19 SCENARIOS (PB-1 to PB-19)
-- Testing: What community_manager CANNOT do (should deny access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- PB-1: CM tries to create a new course
(
  'community_manager',
  'CM no puede crear cursos',
  'Verificar que community_manager no puede acceder a la página de Creación de Curso ni crear cursos vía API. El menú "Cursos" no debe ser visible en sidebar.',
  'course_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar al Panel Principal y verificar la barra lateral","expectedOutcome":"El menú \"Cursos\" NO debe aparecer en el sidebar"},
    {"index":2,"instruction":"Intentar acceder directamente a la página de Creación de Curso","expectedOutcome":"El usuario es redirigido al Panel Principal o recibe un mensaje de error"},
    {"index":3,"instruction":"Intentar realizar la acción con datos de curso","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"}
  ]',
  1,
  5,
  true,
  false,
  false
),

-- PB-2: CM tries to create a user
(
  'community_manager',
  'CM no puede crear usuarios',
  'Verificar que community_manager no puede acceder a /admin/user-management ni crear usuarios vía API. El menú "Usuarios" no debe ser visible.',
  'user_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar la barra lateral en el Panel Principal","expectedOutcome":"El menú \"Usuarios\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Gestión de Usuarios","expectedOutcome":"Redirigido o"},
    {"index":3,"instruction":"Intentar realizar la acción con datos de usuario","expectedOutcome":"La operación se completa correctamente"}
  ]',
  1,
  5,
  true,
  false,
  false
),

-- PB-3: CM tries to edit another user's profile
(
  'community_manager',
  'CM no puede editar perfiles ajenos',
  'Verificar que community_manager no puede editar el perfil de otros usuarios vía API.',
  'user_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe otro usuario en el sistema con ID conocido"}
  ]',
  '[
    {"index":1,"instruction":"Obtener ID de otro usuario del sistema","expectedOutcome":"ID obtenido correctamente"},
    {"index":2,"instruction":"Intentar realizar la acción con cambios","expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción"}
  ]',
  1,
  5,
  true,
  false,
  false
),

-- PB-4: CM tries to assign roles to users
(
  'community_manager',
  'CM no puede asignar roles',
  'Verificar que community_manager no puede asignar roles a usuarios.',
  'role_assignment',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe un usuario sin rol asignado"}
  ]',
  '[
    {"index":1,"instruction":"Obtener ID de usuario sin rol","expectedOutcome":"ID obtenido"},
    {"index":2,"instruction":"Intentar asignar el rol de docente a un usuario desde la interfaz","expectedOutcome":"El sistema muestra un mensaje de error indicando que no tiene permisos"}
  ]',
  1,
  5,
  true,
  false,
  false
),

-- PB-5: CM tries to manage schools
(
  'community_manager',
  'CM no puede gestionar escuelas',
  'Verificar que community_manager no puede acceder a /admin/schools. El menú "Escuelas" no debe ser visible.',
  'school_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"El menú \"Escuelas\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Escuelas","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-6: CM tries to manage network of schools
(
  'community_manager',
  'CM no puede gestionar redes',
  'Verificar que community_manager no puede acceder a /admin/network-management. El menú "Redes de Colegios" no debe ser visible.',
  'network_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Redes de Colegios\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Gestión de Redes","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-7: CM tries to create an assessment template
(
  'community_manager',
  'CM no puede crear plantillas evaluación',
  'Verificar que community_manager no puede crear plantillas de evaluación vía API. hasAssessmentWritePermission debe retornar false.',
  'assessment_builder',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Sistema tiene plantillas de evaluación existentes"}
  ]',
  '[
    {"index":1,"instruction":"Intentar realizar la acción con datos de plantilla","expectedOutcome":"La operación se completa correctamente"}
  ]',
  1,
  5,
  true,
  false,
  false
),

-- PB-8: CM tries to access quiz reviews
(
  'community_manager',
  'CM no puede revisar quizzes',
  'Verificar que community_manager no puede acceder a la página de Revisión de Quizzes. El menú "Revisión de Quizzes" no debe ser visible (consultantOnly).',
  'quiz_submission',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Revisión de Quizzes\" NO aparece (consultantOnly: true)"},
    {"index":2,"instruction":"Intentar acceder a la página de Revisión de Quizzes","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-9: CM tries to access Procesos de Cambio
(
  'community_manager',
  'CM no puede acceder Procesos Cambio',
  'Verificar que community_manager no puede acceder a la página del Constructor de Evaluaciones. El menú "Procesos de Cambio" no debe ser visible (consultantOnly).',
  'assessment_builder',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Procesos de Cambio\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Constructor de Evaluaciones","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-10: CM tries to access Contexto Transversal
(
  'community_manager',
  'CM no puede acceder Contexto Transversal',
  'Verificar que community_manager no puede acceder a la página de Contexto Transversal (consultantOnly).',
  'assessment_builder',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar que el menú Contexto Transversal NO aparece en sidebar","expectedOutcome":"No visible (child de Procesos de Cambio)"},
    {"index":2,"instruction":"Intentar acceder a la página de Escuela/transversal-context","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-11: CM tries to access Plan de Migración
(
  'community_manager',
  'CM no puede acceder Plan Migración',
  'Verificar que community_manager no puede acceder a la página del Plan de Migración (consultantOnly).',
  'assessment_builder',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar que Plan de Migración NO aparece en sidebar","expectedOutcome":"No visible"},
    {"index":2,"instruction":"Intentar acceder a la página de Escuela/migration-plan","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-12: CM tries to access Consultorías
(
  'community_manager',
  'CM no puede acceder Consultorías',
  'Verificar que community_manager no puede acceder al menú Consultorías (consultantOnly: true).',
  'user_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"Menú \"Consultorías\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Asignación de Consultores","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-13: CM tries to access Reportes
(
  'community_manager',
  'CM no puede acceder Reportes',
  'Verificar que community_manager no puede acceder a la página de Reportes Detallados. El menú "Reportes" no debe ser visible (consultantOnly).',
  'reporting',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Reportes\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Reportes Detallados","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-14: CM tries to access Vías de Transformación
(
  'community_manager',
  'CM no puede acceder Vías Transformación',
  'Verificar que community_manager no puede acceder a /vias-transformacion. Página verifica ALLOWED_ROLES = [\"admin\"].',
  'transformation_assessment',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Vías de Transformación\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Vias Transformacion","expectedOutcome":"Redirigido al Panel Principal (ALLOWED_ROLES check)"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-15: CM tries to manage Learning Paths
(
  'community_manager',
  'CM no puede gestionar Rutas Aprendizaje',
  'Verificar que community_manager no puede acceder a la página de Rutas de Aprendizaje. El menú "Rutas de Aprendizaje" no debe ser visible (adminOnly).',
  'course_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Rutas de Aprendizaje\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Rutas de Aprendizaje","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-16: CM tries to access Assignment Matrix
(
  'community_manager',
  'CM no puede acceder Matriz Asignaciones',
  'Verificar que community_manager no puede acceder a /admin/assignment-matrix. El menú no debe ser visible (adminOnly).',
  'course_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Matriz de Asignaciones\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Assignment Matrix","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-17: CM tries to access QA Testing
(
  'community_manager',
  'CM no puede acceder QA Testing',
  'Verificar que community_manager no puede acceder a la página de QA Testing. El menú "QA Testing" no debe ser visible (adminOnly).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"QA Testing\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Qa","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-18: CM tries to access RBAC management
(
  'community_manager',
  'CM no puede acceder Roles y Permisos',
  'Verificar que community_manager no puede acceder a /admin/role-management. El menú "Roles y Permisos" no debe ser visible (superadminOnly + feature flag).',
  'role_assignment',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Roles y Permisos\" NO aparece"},
    {"index":2,"instruction":"Intentar acceder a la página de Role Management","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- PB-19: CM tries to assign consultants
(
  'community_manager',
  'CM no puede asignar consultores',
  'Verificar que community_manager no puede acceder a /admin/consultant-assignments (child de Consultorías, adminOnly + permission).',
  'user_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar que Asignación de Consultores NO aparece en sidebar","expectedOutcome":"No visible (adminOnly child)"},
    {"index":2,"instruction":"Intentar acceder a la página de Asignación de Consultores","expectedOutcome":"Redirigido o"}
  ]',
  2,
  5,
  true,
  false,
  false
);

-- ============================================================================
-- CORRECT ACCESS - 14 SCENARIOS (CA-1 to CA-14)
-- Testing: What community_manager CAN do (should allow access)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CA-1: CM views their dashboard
(
  'community_manager',
  'CM puede ver su dashboard',
  'Verificar que community_manager puede acceder al Panel Principal sin restricciones.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"Dashboard carga correctamente sin errores"},
    {"index":2,"instruction":"Verificar que el sidebar muestra Mi Panel","expectedOutcome":"Mi Panel visible y activo"}
  ]',
  3,
  3,
  true,
  false,
  false
),

-- CA-2: CM views their profile
(
  'community_manager',
  'CM puede ver su perfil',
  'Verificar que community_manager puede acceder a /profile y ver su información personal.',
  'user_management',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Perfil","expectedOutcome":"Página de perfil carga correctamente"},
    {"index":2,"instruction":"Verificar que se muestra información personal del usuario","expectedOutcome":"Nombre, email, avatar visibles"}
  ]',
  3,
  3,
  true,
  false,
  false
),

-- CA-3: CM views Mi Aprendizaje
(
  'community_manager',
  'CM puede ver Mi Aprendizaje',
  'Verificar que community_manager puede acceder a /mi-aprendizaje y ver cursos asignados.',
  'course_enrollment',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Mi Aprendizaje","expectedOutcome":"Página carga con cursos enrollados"},
    {"index":2,"instruction":"Verificar que el sidebar muestra Mi Aprendizaje","expectedOutcome":"Visible con children (Mis Cursos, Mis Tareas)"}
  ]',
  3,
  5,
  true,
  false,
  false
),

-- CA-4: CM accesses Noticias page
(
  'community_manager',
  'CM puede acceder a Noticias',
  'Verificar que community_manager puede acceder a /admin/news. ALLOWED_ROLES = [\"admin\", \"community_manager\"].',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Noticias\" aparece en el sidebar"},
    {"index":2,"instruction":"Click en Noticias en sidebar","expectedOutcome":"Navega a la página de Noticias exitosamente"},
    {"index":3,"instruction":"Verificar que la página carga","expectedOutcome":"Lista de noticias visible con botón Nueva Noticia"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- CA-5: CM creates a news article
(
  'community_manager',
  'CM puede crear noticias',
  'Verificar que community_manager puede crear artículos de noticias vía API. Role check en news.ts line 136.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Noticias"}
  ]',
  '[
    {"index":1,"instruction":"Click en botón Nueva Noticia","expectedOutcome":"Modal de creación aparece"},
    {"index":2,"instruction":"Llenar título, contenido, fecha","expectedOutcome":"Formulario válido"},
    {"index":3,"instruction":"Click en Publicar","expectedOutcome":"Aparece un mensaje de éxito y el artículo se muestra en la lista"},
    {"index":4,"instruction":"Verificar que el artículo aparece en la lista","expectedOutcome":"Artículo visible"}
  ]',
  2,
  8,
  true,
  false,
  false
),

-- CA-6: CM edits a news article
(
  'community_manager',
  'CM puede editar noticias',
  'Verificar que community_manager puede editar artículos existentes vía API.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe al menos un artículo de noticias"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Noticias","expectedOutcome":"Lista de noticias visible"},
    {"index":2,"instruction":"Click en Editar en un artículo","expectedOutcome":"Modal de edición aparece con datos"},
    {"index":3,"instruction":"Modificar título o contenido","expectedOutcome":"Cambios reflejados en formulario"},
    {"index":4,"instruction":"Click en Guardar","expectedOutcome":"Aparece un mensaje de éxito y los cambios se reflejan en la lista"}
  ]',
  2,
  8,
  true,
  false,
  false
),

-- CA-7: CM deletes a news article
(
  'community_manager',
  'CM puede eliminar noticias',
  'Verificar que community_manager puede eliminar artículos vía API.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe al menos un artículo de noticias"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Noticias","expectedOutcome":"Lista visible"},
    {"index":2,"instruction":"Click en Eliminar en un artículo","expectedOutcome":"Modal de confirmación aparece"},
    {"index":3,"instruction":"Confirmar eliminación","expectedOutcome":"El artículo se elimina y desaparece de la lista"},
    {"index":4,"instruction":"Verificar que el artículo ya no aparece","expectedOutcome":"Artículo removido de lista"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- CA-8: CM accesses Eventos page
(
  'community_manager',
  'CM puede acceder a Eventos',
  'Verificar que community_manager puede acceder a /admin/events. Line 66: [\"admin\", \"community_manager\"].includes(primaryRole).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Eventos\" aparece en el sidebar"},
    {"index":2,"instruction":"Click en Eventos","expectedOutcome":"Navega a la página de Eventos exitosamente"},
    {"index":3,"instruction":"Verificar que la página carga","expectedOutcome":"Lista de eventos visible"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- CA-9: CM creates an event
(
  'community_manager',
  'CM puede crear eventos',
  'Verificar que community_manager puede crear eventos. events.tsx line 77 usa Supabase client directo. RLS policy requerida.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Eventos"}
  ]',
  '[
    {"index":1,"instruction":"Click en Nuevo Evento","expectedOutcome":"Modal de creación aparece"},
    {"index":2,"instruction":"Llenar título, ubicación, fecha_inicio","expectedOutcome":"Formulario válido"},
    {"index":3,"instruction":"Click en Guardar","expectedOutcome":"Evento creado en tabla events vía client"},
    {"index":4,"instruction":"Verificar que el evento aparece en la lista","expectedOutcome":"Evento visible"}
  ]',
  2,
  8,
  true,
  false,
  false
),

-- CA-10: CM lists quotes
(
  'community_manager',
  'CM puede listar cotizaciones',
  'Verificar que community_manager puede ver todas las cotizaciones.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario autenticado"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar: Gestión > Propuestas Pasantías","expectedOutcome":"Visible SI CM tiene permission view_internship_proposals_*"},
    {"index":2,"instruction":"Navegar a la página de Quotes","expectedOutcome":"Página carga exitosamente"},
    {"index":3,"instruction":"Verificar que realizar la acción correspondiente retorna datos","expectedOutcome":"Lista de cotizaciones visible (todas, sin filtro de school)"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- CA-11: CM creates a quote
(
  'community_manager',
  'CM puede crear cotizaciones',
  'Verificar que community_manager puede crear cotizaciones.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Cotizaciones"}
  ]',
  '[
    {"index":1,"instruction":"Click en Nueva Cotización","expectedOutcome":"Navega a la página de Nueva Cotización"},
    {"index":2,"instruction":"Llenar formulario de cotización","expectedOutcome":"Formulario válido"},
    {"index":3,"instruction":"Click en Crear","expectedOutcome":"Aparece un mensaje de éxito y la cotización se muestra en la lista"},
    {"index":4,"instruction":"Verificar que la cotización aparece en lista","expectedOutcome":"Cotización creada visible"}
  ]',
  2,
  10,
  true,
  false,
  false
),

-- CA-12: CM edits a quote
(
  'community_manager',
  'CM puede editar cotizaciones',
  'Verificar que community_manager puede editar cotizaciones.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe al menos una cotización"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Quotes","expectedOutcome":"Lista visible"},
    {"index":2,"instruction":"Click en Editar en una cotización","expectedOutcome":"Navega a la página de Edición de Cotización"},
    {"index":3,"instruction":"Modificar datos","expectedOutcome":"Formulario actualizado"},
    {"index":4,"instruction":"Click en Guardar","expectedOutcome":"Aparece un mensaje de éxito y los cambios se guardan correctamente"}
  ]',
  2,
  10,
  true,
  false,
  false
),

-- CA-13: CM deletes a quote
(
  'community_manager',
  'CM puede eliminar cotizaciones',
  'Verificar que community_manager puede eliminar cotizaciones.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existe al menos una cotización"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Quotes","expectedOutcome":"Lista visible"},
    {"index":2,"instruction":"Click en Eliminar en una cotización","expectedOutcome":"Modal de confirmación aparece"},
    {"index":3,"instruction":"Confirmar eliminación","expectedOutcome":"La cotización se elimina y desaparece de la lista"},
    {"index":4,"instruction":"Verificar que la cotización ya no aparece","expectedOutcome":"Cotización removida"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- CA-14: CM accesses expense reports
(
  'community_manager',
  'CM puede acceder rendiciones de gasto',
  'Verificar que community_manager puede acceder a /expense-reports. CM obtiene acceso vía tabla expense_report_access.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Usuario tiene registros en expense_report_access O es admin"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar: Gestión > Rendición de Gastos","expectedOutcome":"Visible SI CM tiene permission view_expense_reports_*"},
    {"index":2,"instruction":"Click en Rendición de Gastos","expectedOutcome":"Navega a /expense-reports"},
    {"index":3,"instruction":"Verificar que la página carga con reportes","expectedOutcome":"Página carga. CM ve solo reportes en expense_report_access table"}
  ]',
  2,
  8,
  true,
  false,
  false
);

-- ============================================================================
-- CONTENT MANAGEMENT SCOPING - 6 SCENARIOS (CMS-1 to CMS-6)
-- Testing: CM content visibility (no school/generation/community filters)
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- CMS-1: CM views news — no school filter
(
  'community_manager',
  'CM ve todas las noticias (sin filtro)',
  'Verificar que community_manager puede ver TODAS las noticias del sistema sin filtro de school_id. news.ts line 151: no school filter.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existen noticias asociadas a diferentes escuelas"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Noticias","expectedOutcome":"Página carga"},
    {"index":2,"instruction":"Verificar lista de noticias","expectedOutcome":"CM ve TODAS las noticias, independiente de school_id"},
    {"index":3,"instruction":"Verificar que no hay filtro de escuela activo","expectedOutcome":"No hay selector de escuela en UI"}
  ]',
  3,
  5,
  true,
  false,
  false
),

-- CMS-2: CM creates news for any school
(
  'community_manager',
  'CM crea noticias sin restricción de escuela',
  'Verificar que community_manager puede crear noticias para cualquier escuela (o sin school_id). No hay validación de school matching.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Noticias"}
  ]',
  '[
    {"index":1,"instruction":"Click en Nueva Noticia","expectedOutcome":"Modal aparece"},
    {"index":2,"instruction":"Llenar formulario con school_id arbitrario (o ninguno)","expectedOutcome":"Formulario acepta cualquier valor"},
    {"index":3,"instruction":"Crear noticia","expectedOutcome":"Noticia creada exitosamente sin restricción de school"}
  ]',
  3,
  8,
  true,
  false,
  false
),

-- CMS-3: CM views events — no school filter
(
  'community_manager',
  'CM ve todos los eventos (sin filtro)',
  'Verificar que community_manager puede ver TODOS los eventos sin filtro de school_id. events.tsx line 77: .select(\'*\') sin filtro.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existen eventos en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Eventos","expectedOutcome":"Página carga"},
    {"index":2,"instruction":"Verificar lista de eventos","expectedOutcome":"CM ve TODOS los eventos sin filtro"},
    {"index":3,"instruction":"Verificar que no hay filtro organizacional","expectedOutcome":"No hay selector de escuela/generación"}
  ]',
  3,
  5,
  true,
  false,
  false
),

-- CMS-4: CM creates events for any context
(
  'community_manager',
  'CM crea eventos sin contexto organizacional',
  'Verificar que community_manager puede crear eventos globales sin school/generation/community. formData no tiene school_id.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Eventos"}
  ]',
  '[
    {"index":1,"instruction":"Click en Nuevo Evento","expectedOutcome":"Modal aparece"},
    {"index":2,"instruction":"Llenar formulario sin contexto organizacional","expectedOutcome":"Formulario acepta datos"},
    {"index":3,"instruction":"Crear evento","expectedOutcome":"Evento creado globalmente"}
  ]',
  3,
  8,
  true,
  false,
  false
),

-- CMS-5: CM views quotes — no school filter
(
  'community_manager',
  'CM ve todas las cotizaciones (sin filtro)',
  'Verificar que community_manager puede ver TODAS las cotizaciones sin filtro de school_id. quotes/list.ts: no school filter.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existen cotizaciones en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Quotes","expectedOutcome":"Página carga"},
    {"index":2,"instruction":"Verificar lista de cotizaciones","expectedOutcome":"CM ve TODAS las cotizaciones sin filtro"},
    {"index":3,"instruction":"Verificar que no hay filtro de escuela","expectedOutcome":"Visibilidad global"}
  ]',
  3,
  5,
  true,
  false,
  false
),

-- CMS-6: CM expense reports — own or granted
(
  'community_manager',
  'CM ve rendiciones: propias o con acceso',
  'Verificar que community_manager ve rendiciones propias O aquellas en tabla expense_report_access. Admin ve todas. expense-reports.tsx lines 100-127.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"Existen rendiciones en el sistema"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Expense Reports","expectedOutcome":"Página carga"},
    {"index":2,"instruction":"Verificar lista de rendiciones","expectedOutcome":"CM ve solo reportes donde: user_id = CM.id OR existe en expense_report_access"},
    {"index":3,"instruction":"Intentar ver reporte de otro usuario sin acceso concedido","expectedOutcome":"No aparece en lista (access table model)"}
  ]',
  3,
  8,
  true,
  false,
  false
);

-- ============================================================================
-- SIDEBAR VISIBILITY - 28 SCENARIOS (SV-1 to SV-28)
-- Testing: What CM SEES and DOES NOT SEE in sidebar
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- SV-1: CM sees Mi Panel
(
  'community_manager',
  'CM ve Mi Panel en sidebar',
  'Verificar que el menú Mi Panel es visible para community_manager (no restrictions).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Navegar a la página de Panel Principal","expectedOutcome":"Dashboard carga"},
    {"index":2,"instruction":"Verificar sidebar","expectedOutcome":"\"Mi Panel\" visible y activo"}
  ]',
  3,
  2,
  true,
  false,
  false
),

-- SV-2: CM sees Mi Perfil
(
  'community_manager',
  'CM ve Mi Perfil en sidebar',
  'Verificar que el menú Mi Perfil es visible (no restrictions).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Mi Perfil\" visible"}
  ]',
  3,
  2,
  true,
  false,
  false
),

-- SV-3: CM sees Mi Aprendizaje
(
  'community_manager',
  'CM ve Mi Aprendizaje en sidebar',
  'Verificar que el menú Mi Aprendizaje y sus children son visibles (no restrictions).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Mi Aprendizaje\" visible con children (Mis Cursos, Mis Tareas)"}
  ]',
  3,
  2,
  true,
  false,
  false
),

-- SV-4: CM sees Noticias
(
  'community_manager',
  'CM ve Noticias en sidebar',
  'Verificar que el menú Noticias es visible. restrictedRoles: [\"admin\", \"community_manager\"] + permission: view_news_all.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene permission view_news_all en role_permissions table"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Noticias\" visible (restrictedRoles incluye CM)"}
  ]',
  2,
  2,
  true,
  false,
  false
),

-- SV-5: CM sees Eventos
(
  'community_manager',
  'CM ve Eventos en sidebar',
  'Verificar que el menú Eventos es visible. restrictedRoles: [\"admin\", \"community_manager\"] + permission: view_events_all.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene permission view_events_all en role_permissions table"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Eventos\" visible"}
  ]',
  2,
  2,
  true,
  false,
  false
),

-- SV-6: CM sees Gestión (parent)
(
  'community_manager',
  'CM ve Gestión en sidebar',
  'Verificar que el menú Gestión (parent) es visible. restrictedRoles: [\"admin\", \"community_manager\"] + OR permissions.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene al menos una permission del OR array"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Gestión\" visible como parent"}
  ]',
  2,
  2,
  true,
  false,
  false
),

-- SV-7: CM sees Propuestas Pasantías (child)
(
  'community_manager',
  'CM ve Propuestas Pasantías (condicional)',
  'Verificar que Propuestas Pasantías aparece SI CM tiene permission view_internship_proposals_*. Sidebar.tsx lines 315-324.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene view_internship_proposals_all en role_permissions"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar: Gestión > children","expectedOutcome":"\"Propuestas Pasantías\" visible SI permission presente"}
  ]',
  2,
  3,
  true,
  false,
  false
),

-- SV-8: CM sees Rendición de Gastos (child)
(
  'community_manager',
  'CM ve Rendición de Gastos (condicional)',
  'Verificar que Rendición de Gastos aparece SI CM tiene permission view_expense_reports_*. Sidebar.tsx lines 327-336.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene view_expense_reports_own en role_permissions"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar: Gestión > children","expectedOutcome":"\"Rendición de Gastos\" visible SI permission presente"}
  ]',
  2,
  3,
  true,
  false,
  false
),

-- SV-9: CM sees Feedback (conditional)
(
  'community_manager',
  'CM Feedback (verificar visibilidad)',
  'Verificar si Feedback es visible. Sidebar.tsx line 130: restrictedRoles: [\"docente\", \"admin\", \"consultor\"]. CM NO incluido.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Feedback\" NO VISIBLE per code (CM no en restrictedRoles). PM spec discrepancy noted."}
  ]',
  3,
  3,
  true,
  false,
  false
),

-- SV-10 to SV-27: NOT VISIBLE items
(
  'community_manager',
  'CM NO ve Cursos',
  'Verificar que Cursos NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Cursos\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Revisión de Quizzes',
  'Verificar que Revisión de Quizzes NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Revisión de Quizzes\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Procesos de Cambio',
  'Verificar que Procesos de Cambio NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Procesos de Cambio\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Rutas de Aprendizaje',
  'Verificar que Rutas de Aprendizaje NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Rutas de Aprendizaje\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Matriz de Asignaciones',
  'Verificar que Matriz de Asignaciones NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Matriz de Asignaciones\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Usuarios',
  'Verificar que Usuarios NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Usuarios\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Escuelas',
  'Verificar que Escuelas NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Escuelas\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Redes de Colegios',
  'Verificar que Redes de Colegios NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Redes de Colegios\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Consultorías',
  'Verificar que Consultorías NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Consultorías\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Reportes',
  'Verificar que Reportes NO es visible (consultantOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Reportes\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve QA Testing',
  'Verificar que QA Testing NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"QA Testing\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Vías de Transformación',
  'Verificar que Vías de Transformación NO es visible (adminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Vías de Transformación\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Configuración',
  'Verificar que Configuración NO es visible (permission: manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Configuración\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Roles y Permisos',
  'Verificar que Roles y Permisos NO es visible (superadminOnly: true).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar","expectedOutcome":"\"Roles y Permisos\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Clientes (child)',
  'Verificar que Clientes NO es visible SI CM carece permission view_contracts_*.',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"},{"type":"data","description":"CM NO tiene view_contracts_all o _school"}]',
  '[{"index":1,"instruction":"Verificar sidebar: Gestión > children","expectedOutcome":"\"Clientes\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Contratos (child)',
  'Verificar que Contratos NO es visible SI CM carece permission view_contracts_*.',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"},{"type":"data","description":"CM NO tiene view_contracts permissions"}]',
  '[{"index":1,"instruction":"Verificar sidebar: Gestión > children","expectedOutcome":"\"Contratos\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Soporte Técnico (child)',
  'Verificar que Soporte Técnico NO es visible (permission: manage_system_settings).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar: Gestión > children","expectedOutcome":"\"Soporte Técnico\" NO visible"}]',
  3, 2, true, false, false
),

(
  'community_manager',
  'CM NO ve Asignación Consultores (child)',
  'Verificar que Asignación de Consultores NO es visible (adminOnly child + permission).',
  'navigation',
  '[{"type":"role","description":"Usuario con rol community_manager activo"}]',
  '[{"index":1,"instruction":"Verificar sidebar: Consultorías > children (si parent visible)","expectedOutcome":"\"Asignación de Consultores\" NO visible"}]',
  3, 2, true, false, false
),

-- SV-28: Espacio Colaborativo (conditional)
(
  'community_manager',
  'CM ve Espacio Colaborativo (condicional)',
  'Verificar que Espacio Colaborativo aparece SOLO si CM tiene community_id. requiresCommunity: true. workspaceUtils.ts lines 124-138.',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"data","description":"CM tiene community_id en user_roles O NO tiene"}
  ]',
  '[
    {"index":1,"instruction":"Verificar user_roles.community_id para CM","expectedOutcome":"Anotar si es NULL o tiene valor"},
    {"index":2,"instruction":"Verificar sidebar","expectedOutcome":"\"Espacio Colaborativo\" visible SOLO si community_id presente"},
    {"index":3,"instruction":"Si NO visible, asignar community_id y re-verificar","expectedOutcome":"Ahora visible"}
  ]',
  2,
  8,
  true,
  false,
  false
);

-- ============================================================================
-- EDGE CASES - 7 SCENARIOS (EC-1 to EC-7)
-- Testing: Unusual or boundary conditions
-- ============================================================================

INSERT INTO qa_scenarios (
  role_required, name, description, feature_area, preconditions, steps,
  priority, estimated_duration_minutes, is_active, automated_only, is_multi_user
) VALUES

-- EC-1: CM with no user_roles record
(
  'community_manager',
  'CM sin user_roles no puede acceder',
  'Verificar que un usuario sin registro en user_roles no puede acceder a páginas protegidas (redirect/403).',
  'authentication',
  '[
    {"type":"data","description":"Usuario en auth.users y profiles pero sin user_roles record"}
  ]',
  '[
    {"index":1,"instruction":"Intentar login con usuario sin user_roles","expectedOutcome":"Login exitoso pero sin rol"},
    {"index":2,"instruction":"Intentar acceder a la página de Panel Principal","expectedOutcome":"Redirigido a la página de inicio de sesión o se muestra un mensaje de error"},
    {"index":3,"instruction":"Verificar que auth checks fallan","expectedOutcome":"Páginas protegidas inaccesibles"}
  ]',
  1,
  8,
  true,
  false,
  false
),

-- EC-2: CM with multiple roles
(
  'community_manager',
  'CM con múltiples roles (prioridad)',
  'Verificar que un usuario con community_manager + otro rol tiene el rol de mayor prioridad como primary. ROLE_PRIORITY: CM es 7mo.',
  'role_assignment',
  '[
    {"type":"data","description":"Usuario tiene user_roles con community_manager + docente activos"}
  ]',
  '[
    {"index":1,"instruction":"Verificar user_roles table para usuario","expectedOutcome":"CM y docente ambos is_active: true"},
    {"index":2,"instruction":"Verificar primary role via getUserPrimaryRole()","expectedOutcome":"community_manager es primary (priority 7 > docente priority 8)"},
    {"index":3,"instruction":"Verificar sidebar","expectedOutcome":"Sidebar muestra unión de permisos de ambos roles"}
  ]',
  3,
  10,
  true,
  false,
  false
),

-- EC-3: CM session expiry while editing news
(
  'community_manager',
  'CM sesión expira durante edición',
  'Verificar que si la sesión de CM expira mientras edita noticias, el siguiente API call devuelve 401 y usuario es redirigido.',
  'authentication',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"},
    {"type":"navigation","description":"Usuario en la página de Noticias editando artículo"}
  ]',
  '[
    {"index":1,"instruction":"Abrir modal de edición de noticia","expectedOutcome":"Modal abierto"},
    {"index":2,"instruction":"Simular expiración de sesión (borrar cookies o esperar timeout)","expectedOutcome":"Sesión expirada"},
    {"index":3,"instruction":"Intentar guardar cambios","expectedOutcome":"La operación se completa correctamente"},
    {"index":4,"instruction":"Verificar redirect","expectedOutcome":"Usuario redirigido a la página de inicio de sesión"}
  ]',
  4,
  8,
  true,
  false,
  false
),

-- EC-4: CM accesses API endpoints directly via URL
(
  'community_manager',
  'CM accede API directamente (URL)',
  'Verificar que los API endpoints bloquean acceso no autorizado cuando CM intenta acceder directamente vía URL.',
  'authentication',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Intentar realizar la acción directamente (curl o Postman)","expectedOutcome":"La operación se completa correctamente"},
    {"index":2,"instruction":"Intentar realizar la acción","expectedOutcome":""},
    {"index":3,"instruction":"Verificar que role checks funcionan","expectedOutcome":"Todos los endpoints admin-only niegan acceso"}
  ]',
  2,
  8,
  true,
  false,
  false
),

-- EC-5: CM tries to access QA Testing via URL manipulation
(
  'community_manager',
  'CM intenta acceder a QA Testing vía URL',
  'Verificar que CM no puede acceder a la página de QA Testing manipulando URL directamente (adminOnly page).',
  'navigation',
  '[
    {"type":"role","description":"Usuario con rol community_manager activo"}
  ]',
  '[
    {"index":1,"instruction":"Navegar directamente a la página de QA Testing","expectedOutcome":"Redirigido al Panel Principal o se muestra un error de permisos"},
    {"index":2,"instruction":"Intentar acceder a la página de Escenarios QA","expectedOutcome":"Redirigido al Panel Principal o se muestra un error de permisos"},
    {"index":3,"instruction":"Verificar que adminOnly checks funcionan","expectedOutcome":"Todas las subpages QA inaccesibles"}
  ]',
  2,
  5,
  true,
  false,
  false
),

-- EC-6: Two CMs editing same news simultaneously
(
  'community_manager',
  'Dos CMs editan misma noticia (last-write-wins)',
  'Verificar comportamiento cuando dos community_managers editan el mismo artículo simultáneamente. No hay optimistic locking.',
  'navigation',
  '[
    {"type":"role","description":"Dos usuarios con rol community_manager activo"},
    {"type":"data","description":"Existe un artículo de noticias"}
  ]',
  '[
    {"index":1,"instruction":"CM1 abre artículo en edición","expectedOutcome":"Modal abierto con datos"},
    {"index":2,"instruction":"CM2 abre el mismo artículo en edición","expectedOutcome":"Modal abierto con mismos datos"},
    {"index":3,"instruction":"CM1 modifica título y guarda","expectedOutcome":"Guardado exitoso"},
    {"index":4,"instruction":"CM2 modifica contenido y guarda","expectedOutcome":"Guardado exitoso. Cambios de CM1 sobrescritos (last-write-wins)"},
    {"index":5,"instruction":"Verificar que no hay conflicto/error","expectedOutcome":"Última escritura prevalece. Toast de éxito para ambos."}
  ]',
  4,
  15,
  true,
  false,
  true
),

-- EC-7: CM assigned with school_id despite requiresSchool: false
(
  'community_manager',
  'CM asignado con school_id (inconsistencia)',
  'Verificar comportamiento cuando CM es asignado con school_id a pesar de requiresSchool: false. assign-role.ts line 268 vincula school_id.',
  'role_assignment',
  '[
    {"type":"role","description":"Usuario community_manager"},
    {"type":"data","description":"CM asignado con school_id en user_roles"}
  ]',
  '[
    {"index":1,"instruction":"Verificar user_roles.school_id para CM","expectedOutcome":"school_id presente aunque requiresSchool: false"},
    {"index":2,"instruction":"Navegar a la página de Noticias","expectedOutcome":"CM ve TODAS las noticias (no filtrado por school_id)"},
    {"index":3,"instruction":"Navegar a la página de Eventos","expectedOutcome":"CM ve TODOS los eventos (no filtrado)"},
    {"index":4,"instruction":"Documentar comportamiento","expectedOutcome":"school_id presente pero no afecta funcionalidad actual. Arquitectural debt."}
  ]',
  4,
  10,
  true,
  false,
  false
);

COMMIT;

-- ============================================================================
-- END OF SEED SCRIPT
-- ============================================================================
-- Total scenarios inserted: 67
-- Categories: PB (19), CA (14), CMS (6), SV (28), EC (7)
-- All scenarios are active, manual QA (automated_only: false), single-user except EC-6
-- ============================================================================
