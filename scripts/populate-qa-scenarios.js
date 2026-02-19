/**
 * Populate qa_scenarios table with 99 Docente QA scenarios
 *
 * Run with: node scripts/populate-qa-scenarios.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Shared preconditions
const PRECOND_DOCENTE = { type: 'role', description: 'Iniciar sesión como docente.qa@fne.cl / TestQA2026!' };
const PRECOND_NOSCHOOL = { type: 'role', description: 'Iniciar sesión como docente-noschool.qa@fne.cl / TestQA2026!' };
const PRECOND_MULTIROLE = { type: 'role', description: 'Iniciar sesión como docente-multirole.qa@fne.cl / TestQA2026!' };
const PRECOND_COMMUNITY = { type: 'data', description: 'El usuario docente.qa@fne.cl tiene comunidad asignada' };
const PRECOND_ENROLLED = { type: 'data', description: 'El usuario está inscrito en "Introducción a Los Pellines"' };

function step(index, instruction, expectedOutcome, route, captureOnPass = false) {
  return {
    index,
    instruction,
    expectedOutcome,
    route: route || undefined,
    captureOnFail: true,
    captureOnPass,
  };
}

// ============================================================
// ALL 99 SCENARIOS
// ============================================================

const scenarios = [

  // ============================================================
  // PERMISSION BOUNDARIES (12 scenarios) — priority 1
  // ============================================================

  {
    name: 'PB-01: Docente intenta crear un curso',
    description: 'Verificar que un docente no puede crear cursos ni acceder al constructor de cursos',
    feature_area: 'course_builder',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/course-builder', 'Acceso denegado o redirección al dashboard', '/admin/course-builder'),
      step(2, 'Verificar que no aparece el menú "Cursos" en el sidebar', 'El menú "Cursos" NO es visible en la barra lateral'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-02: Docente intenta crear un usuario',
    description: 'Verificar que un docente no puede acceder a la gestión de usuarios',
    feature_area: 'user_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/user-management', 'Acceso denegado / 403 o redirección', '/admin/user-management'),
      step(2, 'Verificar que "Usuarios" no aparece en el sidebar', '"Usuarios" NO es visible en la barra lateral'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-03: Docente intenta editar perfil de otro usuario',
    description: 'Verificar que un docente no puede editar perfiles de otros usuarios vía API',
    feature_area: 'user_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Abrir consola del navegador (F12 → Console)', 'Consola abierta'),
      step(2, 'Ejecutar: fetch("/api/admin/update-user", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userId:"test",name:"Hacked"})})', 'Respuesta HTTP 403 con mensaje "Solo los administradores pueden editar usuarios"'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-04: Docente intenta asignar roles',
    description: 'Verificar que un docente no puede asignar roles a otros usuarios',
    feature_area: 'role_assignment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/role-management', 'Acceso denegado o redirección', '/admin/role-management'),
      step(2, 'Verificar que no hay opción de asignar roles en la interfaz', 'Ninguna opción de asignación de roles visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-05: Docente intenta gestionar escuelas',
    description: 'Verificar que un docente no puede acceder a la gestión de escuelas',
    feature_area: 'school_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/schools', 'Acceso denegado / 403', '/admin/schools'),
      step(2, 'Verificar que "Escuelas" no aparece en el sidebar', '"Escuelas" NO es visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-06: Docente intenta gestionar redes de colegios',
    description: 'Verificar que un docente no puede acceder a la gestión de redes',
    feature_area: 'network_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/network-management', 'Acceso denegado / 403', '/admin/network-management'),
      step(2, 'Verificar que "Redes de Colegios" no aparece en el sidebar', '"Redes de Colegios" NO es visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-07: Docente intenta acceder a revisión de quizzes',
    description: 'Verificar que un docente no puede acceder a la revisión de quizzes (función de consultor)',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /quiz-reviews', 'Acceso denegado o redirección', '/quiz-reviews'),
      step(2, 'Verificar que "Revisión de Quizzes" no aparece en el sidebar', '"Revisión de Quizzes" NO es visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-08: Docente intenta crear plantilla de evaluación',
    description: 'Verificar que un docente no puede crear plantillas de evaluación',
    feature_area: 'assessment_builder',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/assessment-builder', 'Acceso denegado o redirección', '/admin/assessment-builder'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'PB-09: Docente intenta ver el constructor de evaluaciones',
    description: 'Verificar que "Procesos de Cambio" no es visible para docentes',
    feature_area: 'assessment_builder',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar el sidebar completo', '"Procesos de Cambio" NO es visible (consultantOnly)'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'PB-10: Docente intenta acceder a reportes',
    description: 'Verificar que un docente no puede acceder a los reportes detallados',
    feature_area: 'reporting',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /detailed-reports', 'Acceso denegado o redirección', '/detailed-reports'),
      step(2, 'Verificar que "Reportes" no aparece en el sidebar', '"Reportes" NO es visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-11: Docente intenta asignar cursos a otros',
    description: 'Verificar que un docente no puede asignar cursos a otros usuarios',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Verificar que no hay botón de "Asignar curso" en la vista de cursos', 'Ningún botón de asignación visible'),
      step(2, 'Verificar en la consola: fetch("/api/courses/batch-assign", {method:"POST"}).then(r=>r.status)', 'Retorna 401 o 403'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PB-12: Docente intenta acceder a QA Testing',
    description: 'Verificar que un docente no puede acceder al módulo de QA',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar a /admin/qa', 'Acceso denegado o redirección', '/admin/qa'),
      step(2, 'Verificar que "QA Testing" no aparece en el sidebar', '"QA Testing" NO es visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // CORRECT ACCESS (10 scenarios) — priority 1
  // ============================================================

  {
    name: 'CA-01: Docente ve su dashboard',
    description: 'Verificar que el docente puede ver su panel principal con datos individuales',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /dashboard', 'El dashboard carga con datos individuales del docente', '/dashboard', true),
      step(2, 'Verificar que se muestran estadísticas personales', 'Se ve progreso de cursos, tareas pendientes, etc.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CA-02: Docente ve su perfil',
    description: 'Verificar que el docente puede acceder a su página de perfil',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /profile', 'La página de perfil carga correctamente con la información del usuario', '/profile'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'CA-03: Docente edita su propio perfil',
    description: 'Verificar que el docente puede editar sus propios datos de perfil',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /profile', 'Página de perfil carga', '/profile'),
      step(2, 'Modificar algún campo editable (ej. nombre) y guardar', 'Los cambios se guardan exitosamente con mensaje de confirmación'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CA-04: Docente ve Mi Aprendizaje',
    description: 'Verificar que el docente puede acceder a la sección Mi Aprendizaje',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje', 'La página carga con los cursos inscritos del docente', '/mi-aprendizaje'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'CA-05: Docente ve Mis Cursos',
    description: 'Verificar que el docente puede ver la lista de cursos en los que está inscrito',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje?tab=cursos', 'Se muestra la lista de cursos inscritos', '/mi-aprendizaje?tab=cursos'),
      step(2, 'Verificar que aparece "Introducción a Los Pellines"', 'El curso aparece en la lista con título y progreso'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CA-06: Docente ve Mis Tareas',
    description: 'Verificar que el docente puede ver sus tareas pendientes',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje/tareas', 'La página de tareas carga correctamente', '/mi-aprendizaje/tareas'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'CA-07: Docente accede a Feedback',
    description: 'Verificar que el docente puede acceder a su página de evaluaciones/feedback',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /docente/assessments', 'La página de feedback carga mostrando evaluaciones del docente', '/docente/assessments'),
    ],
    priority: 1,
    estimated_duration_minutes: 1,
  },
  {
    name: 'CA-08: Docente toma un quiz en curso inscrito',
    description: 'Verificar que el docente puede tomar quizzes dentro de sus cursos',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar al curso "Introducción a Los Pellines"', 'El curso se abre mostrando módulos y lecciones'),
      step(2, 'Abrir la lección "Comienza el viaje" que contiene un quiz', 'La lección carga con el bloque de quiz visible'),
      step(3, 'Iniciar el quiz y responder las preguntas', 'Las respuestas se registran correctamente'),
    ],
    priority: 1,
    estimated_duration_minutes: 5,
  },
  {
    name: 'CA-09: Docente envía una tarea',
    description: 'Verificar que el docente puede enviar tareas/assignments',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje/tareas', 'Lista de tareas carga', '/mi-aprendizaje/tareas'),
      step(2, 'Seleccionar una tarea pendiente y completar la entrega', 'La entrega se guarda exitosamente'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CA-10: Docente ve contenido de curso inscrito',
    description: 'Verificar que el docente puede ver el contenido de las lecciones del curso',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar al curso "Introducción a Los Pellines" y seleccionar una lección', 'El contenido de la lección se muestra correctamente'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // SCHOOL ASSIGNMENT SCOPING (4 scenarios) — priority 1
  // ============================================================

  {
    name: 'SA-01: Docente solo ve cursos asignados a él',
    description: 'Verificar que el docente solo ve cursos donde está inscrito, no todos los cursos de la escuela',
    feature_area: 'school_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje?tab=cursos', 'Se muestra solo la lista de cursos inscritos'),
      step(2, 'Verificar que SOLO aparecen cursos donde el docente está inscrito', 'No aparecen cursos de otros usuarios de la misma escuela'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'SA-02: Docente no puede ver curso de otra escuela vía URL',
    description: 'Verificar que la manipulación de URL no permite acceder a cursos de otra escuela',
    feature_area: 'school_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Intentar navegar directamente a un ID de curso donde no está inscrito', 'Acceso denegado o datos vacíos. El filtro de escuela se aplica del lado del servidor'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'SA-03: Datos del docente aislados a su contexto escolar',
    description: 'Verificar que todas las vistas de datos están filtradas por school_id',
    feature_area: 'school_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar /mi-aprendizaje, /mi-aprendizaje/tareas, y /docente/assessments', 'Todos los datos mostrados pertenecen al contexto del docente'),
      step(2, 'Verificar que no se muestran datos de otros usuarios ni escuelas', 'Solo datos personales del docente son visibles'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'SA-04: Docente no puede ver entregas de otros docentes',
    description: 'Verificar que el scope individual se aplica: solo entregas propias son visibles',
    feature_area: 'school_management',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a tareas y entregas', 'Solo las entregas del docente actual son visibles'),
      step(2, 'Verificar que no hay forma de ver entregas de otros docentes de la misma escuela', 'Scope individual enforced correctamente'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // SIDEBAR VISIBLE (7 scenarios) — priority 2
  // ============================================================

  {
    name: 'SV-01: Docente ve "Mi Panel" en sidebar',
    description: 'Verificar que Mi Panel es visible en la barra lateral',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar la barra lateral izquierda', '"Mi Panel" es visible y enlaza a /dashboard'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-02: Docente ve "Mi Perfil" en sidebar',
    description: 'Verificar que Mi Perfil es visible en la barra lateral',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar la barra lateral', '"Mi Perfil" es visible y enlaza a /profile'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-03: Docente ve "Mi Aprendizaje" en sidebar',
    description: 'Verificar que Mi Aprendizaje es visible con sus hijos',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar la barra lateral', '"Mi Aprendizaje" es visible con submenú expandible'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-04: Docente ve "Mis Cursos" bajo Mi Aprendizaje',
    description: 'Verificar que Mis Cursos aparece como submenú de Mi Aprendizaje',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Expandir "Mi Aprendizaje" en el sidebar', '"Mis Cursos" aparece como submenú y enlaza a /mi-aprendizaje?tab=cursos'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-05: Docente ve "Mis Tareas" bajo Mi Aprendizaje',
    description: 'Verificar que Mis Tareas aparece como submenú de Mi Aprendizaje',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Expandir "Mi Aprendizaje" en el sidebar', '"Mis Tareas" aparece como submenú y enlaza a /mi-aprendizaje/tareas'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-06: Docente ve "Feedback" en sidebar',
    description: 'Verificar que Feedback es visible para el docente',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar la barra lateral', '"Feedback" es visible y enlaza a /docente/assessments'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SV-07: Docente CON comunidad ve "Espacio Colaborativo"',
    description: 'Verificar que un docente con community_id ve Espacio Colaborativo',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Revisar la barra lateral (usuario con comunidad)', '"Espacio Colaborativo" es visible en el sidebar'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },

  // ============================================================
  // SIDEBAR NOT VISIBLE (19 scenarios) — priority 2
  // ============================================================

  {
    name: 'SNV-01: Docente NO ve "Revisión de Quizzes"',
    description: 'Verificar que Revisión de Quizzes no aparece (consultantOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Revisión de Quizzes" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-02: Docente NO ve "Cursos" admin',
    description: 'Verificar que el menú admin de Cursos no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', 'El menú "Cursos" de admin NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-03: Docente NO ve "Procesos de Cambio"',
    description: 'Verificar que Procesos de Cambio no aparece (consultantOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Procesos de Cambio" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-04: Docente NO ve "Noticias"',
    description: 'Verificar que Noticias no aparece (solo admin/community_manager)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Noticias" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-05: Docente NO ve "Eventos"',
    description: 'Verificar que Eventos no aparece (solo admin/community_manager)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Eventos" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-06: Docente NO ve "Rutas de Aprendizaje"',
    description: 'Verificar que Rutas de Aprendizaje no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Rutas de Aprendizaje" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-07: Docente NO ve "Matriz de Asignaciones"',
    description: 'Verificar que Matriz de Asignaciones no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Matriz de Asignaciones" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-08: Docente NO ve "Usuarios"',
    description: 'Verificar que Usuarios no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Usuarios" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-09: Docente NO ve "Escuelas"',
    description: 'Verificar que Escuelas no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Escuelas" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-10: Docente NO ve "Redes de Colegios"',
    description: 'Verificar que Redes de Colegios no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Redes de Colegios" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-11: Docente NO ve "Consultorías"',
    description: 'Verificar que Consultorías no aparece (consultantOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Consultorías" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-12: Docente NO ve "Gestión"',
    description: 'Verificar que Gestión no aparece (solo admin/community_manager)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Gestión" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-13: Docente NO ve "Reportes"',
    description: 'Verificar que Reportes no aparece (consultantOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Reportes" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-14: Docente NO ve "QA Testing"',
    description: 'Verificar que QA Testing no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"QA Testing" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-15: Docente NO ve "Vías de Transformación"',
    description: 'Verificar que Vías de Transformación no aparece (adminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Vías de Transformación" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-16: Docente NO ve "Configuración"',
    description: 'Verificar que Configuración no aparece (requiere manage_system_settings)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Configuración" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-17: Docente NO ve "Roles y Permisos"',
    description: 'Verificar que Roles y Permisos no aparece (superadminOnly)',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [step(1, 'Revisar toda la barra lateral', '"Roles y Permisos" NO es visible')],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'SNV-18: Docente SIN comunidad NO ve "Espacio Colaborativo"',
    description: 'Verificar que un docente sin community_id no ve Espacio Colaborativo',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_NOSCHOOL],
    steps: [
      step(1, 'Iniciar sesión como docente-noschool.qa@fne.cl', 'Sesión iniciada correctamente'),
      step(2, 'Revisar la barra lateral', '"Espacio Colaborativo" NO es visible'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'SNV-19: Sin duplicados en sidebar para Docente',
    description: 'Verificar que cada ítem del menú aparece exactamente una vez',
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Revisar toda la barra lateral completa', 'Cada ítem del menú aparece EXACTAMENTE una vez. No hay duplicados.'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // EDGE CASES (7 scenarios) — priority 2
  // ============================================================

  {
    name: 'EC-01: Docente sin escuela accede al dashboard',
    description: 'Verificar que un docente sin school_id asignado no produce errores',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_NOSCHOOL],
    steps: [
      step(1, 'Iniciar sesión como docente-noschool.qa@fne.cl / TestQA2026!', 'Sesión inicia sin error'),
      step(2, 'Navegar a /dashboard', 'El dashboard muestra estado vacío o mensaje apropiado. Sin errores 500.', '/dashboard'),
    ],
    priority: 2,
    estimated_duration_minutes: 3,
  },
  {
    name: 'EC-02: Docente sin cursos inscritos ve Mi Aprendizaje',
    description: 'Verificar que se muestra estado vacío cuando no hay cursos inscritos',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_NOSCHOOL],
    steps: [
      step(1, 'Iniciar sesión como docente-noschool.qa@fne.cl', 'Sesión inicia'),
      step(2, 'Navegar a /mi-aprendizaje?tab=cursos', 'Se muestra estado vacío: "No tienes cursos asignados" o similar. Sin errores.'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'EC-03: Docente con múltiples roles funciona correctamente',
    description: 'Verificar que un usuario con docente + lider_comunidad funciona con ambos roles',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_MULTIROLE],
    steps: [
      step(1, 'Iniciar sesión como docente-multirole.qa@fne.cl / TestQA2026!', 'Sesión inicia correctamente'),
      step(2, 'Navegar a /mi-aprendizaje?tab=cursos', 'Se muestran los cursos inscritos'),
      step(3, 'Verificar que el sidebar muestra opciones de ambos roles', 'El sistema aplica lógica OR para permisos de ambos roles'),
    ],
    priority: 2,
    estimated_duration_minutes: 3,
  },
  {
    name: 'EC-04: Docente con comunidad accede a Espacio Colaborativo',
    description: 'Verificar que el docente con membership puede acceder al workspace',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Hacer clic en "Espacio Colaborativo" en el sidebar', 'El workspace se abre correctamente'),
      step(2, 'Verificar que se muestra contenido de la comunidad', 'Se ven miembros, documentos, y actividad reciente'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'EC-05: Docente sin comunidad intenta URL directa de workspace',
    description: 'Verificar que el acceso directo a /community/workspace es denegado sin comunidad',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_NOSCHOOL],
    steps: [
      step(1, 'Iniciar sesión como docente-noschool.qa@fne.cl', 'Sesión inicia'),
      step(2, 'Intentar navegar directamente a /community/workspace', 'Acceso denegado o redirección. requiresCommunity enforced.', '/community/workspace'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'EC-06: Docente accede a endpoints API directamente (bypass sidebar)',
    description: 'Verificar que la protección del lado del servidor funciona independiente del UI',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'En la consola del navegador, probar: fetch("/api/admin/users?limit=1").then(r=>console.log(r.status))', 'Retorna 401 o 403'),
      step(2, 'Probar: fetch("/api/admin/schools",{method:"POST"}).then(r=>console.log(r.status))', 'Retorna 401 o 403'),
      step(3, 'Verificar que ningún endpoint admin retorna datos', 'Todas las respuestas son de rechazo'),
    ],
    priority: 2,
    estimated_duration_minutes: 3,
  },
  {
    name: 'EC-07: Sesión del docente expira durante quiz',
    description: 'Verificar el comportamiento cuando la sesión expira durante un quiz',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Iniciar un quiz en la lección "Materiales y Recursos"', 'Quiz se inicia correctamente'),
      step(2, 'En otra pestaña, cerrar sesión (o esperar expiración)', 'Sesión termina'),
      step(3, 'Volver a la pestaña del quiz e intentar enviar', 'Redirección a login. Idealmente el progreso se preserva si hay auto-save.'),
    ],
    priority: 2,
    estimated_duration_minutes: 5,
  },

  // ============================================================
  // COURSE PARTICIPATION (10 scenarios) — priority 1
  // ============================================================

  {
    name: 'CP-01: Docente ve lista de cursos inscritos',
    description: 'Verificar que se muestra la lista de cursos con títulos, progreso y thumbnails',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje?tab=cursos', 'Se muestra la lista de cursos inscritos', '/mi-aprendizaje?tab=cursos'),
      step(2, 'Verificar que cada curso muestra título, progreso, y thumbnail', 'Información completa visible para cada curso'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CP-02: Docente accede a detalle de curso',
    description: 'Verificar que al hacer clic en un curso se muestra la página de detalle',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Desde la lista de cursos, hacer clic en "Introducción a Los Pellines"', 'Página de detalle carga mostrando módulos, lecciones y progreso general'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CP-03: Docente navega entre lecciones',
    description: 'Verificar la navegación anterior/siguiente entre lecciones',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Abrir la primera lección del curso', 'Lección carga correctamente'),
      step(2, 'Usar navegación anterior/siguiente para cambiar de lección', 'La navegación funciona. La lección actual se indica en el sidebar del curso.'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CP-04: Docente ve indicador de progreso del curso',
    description: 'Verificar que el indicador de progreso refleja el avance real',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Ver la card del curso en Mi Aprendizaje', 'Barra de progreso o porcentaje visible'),
      step(2, 'Verificar que el % refleja lecciones completadas / total', 'Ejemplo: "3 de 10 lecciones completadas"'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CP-05: Docente ve contenido de video',
    description: 'Verificar que las lecciones con video se reproducen correctamente',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a la lección "Comienza el viaje" que tiene un bloque de video', 'Lección carga'),
      step(2, 'Verificar que el reproductor de video carga y se puede reproducir', 'El video se reproduce correctamente. El progreso se registra al completar.'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CP-06: Docente ve contenido de texto',
    description: 'Verificar que las lecciones con bloques de texto se renderizan correctamente',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a la lección "Materiales y Recursos de Los Pellines"', 'Lección carga'),
      step(2, 'Verificar que el bloque de texto muestra HTML formateado correctamente', 'Se ve el título "Fundamentos del Enfoque Los Pellines" con contenido formateado (listas, negritas, párrafos)'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CP-07: Docente ve contenido de descarga/PDF',
    description: 'Verificar que los bloques de descarga muestran archivos disponibles',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a la lección "Materiales y Recursos de Los Pellines"', 'Lección carga'),
      step(2, 'Localizar el bloque de descarga "Guía de Recursos Los Pellines"', 'El bloque muestra el archivo PDF disponible para descargar'),
      step(3, 'Hacer clic en descargar', 'El archivo se descarga correctamente'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CP-08: Docente marca lección como completada',
    description: 'Verificar que se puede marcar una lección como completada y el progreso se actualiza',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Abrir una lección no completada del curso', 'Lección carga'),
      step(2, 'Completar los bloques requeridos y/o hacer clic en "Marcar como completado"', 'Lección marcada como completada. El progreso del curso se actualiza.'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CP-09: Docente retoma curso desde la última posición',
    description: 'Verificar que al volver a un curso se reanuda desde la última lección vista',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Abrir un curso ya iniciado', 'El curso se abre mostrando la última lección vista o sugiere continuar'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CP-10: Docente completa todas las lecciones del curso',
    description: 'Verificar el flujo de completar un curso al 100%',
    feature_area: 'course_enrollment',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Completar todas las lecciones pendientes del curso', 'Cada lección se marca como completada'),
      step(2, 'Verificar que el curso muestra 100% de progreso', 'Curso marcado como completo. Notificación de completación mostrada.'),
    ],
    priority: 1,
    estimated_duration_minutes: 5,
  },

  // ============================================================
  // QUIZ TAKING (11 scenarios) — priority 1
  // ============================================================

  {
    name: 'QT-01: Docente accede a quiz desde lección',
    description: 'Verificar que el quiz se puede iniciar desde dentro de una lección',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a la lección "Materiales y Recursos" del curso', 'Lección carga con bloques visibles'),
      step(2, 'Localizar el bloque de quiz "Reflexión sobre el Enfoque Pedagógico"', 'Se muestra directamente la primera pregunta del quiz sin pantalla de inicio. El quiz comienza de inmediato al acceder al bloque de evaluación.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-02: Docente ve instrucciones del quiz antes de iniciar',
    description: 'Verificar que se muestran las instrucciones antes de comenzar',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Abrir el quiz de la lección "Materiales y Recursos"', 'Se muestran instrucciones: cantidad de preguntas, límite de tiempo (10 min), intentos permitidos'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-03: Docente inicia quiz con temporizador',
    description: 'Verificar que al iniciar un quiz con timeLimit, el temporizador aparece',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Iniciar el quiz "Reflexión sobre el Enfoque Pedagógico" (timeLimit: 10 min)', 'Quiz se inicia y el temporizador cuenta regresivamente'),
      step(2, 'Verificar que el timer es visible durante todo el quiz', 'Temporizador visible en la interfaz'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-04: Docente responde pregunta de opción múltiple',
    description: 'Verificar el flujo de responder una pregunta MC',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'En el quiz, ir a la pregunta de opción múltiple sobre dimensiones del neurodesarrollo', 'Pregunta se muestra con 4 opciones'),
      step(2, 'Seleccionar "4 dimensiones"', 'Opción seleccionada con feedback visual. Se puede cambiar antes de enviar.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-05: Docente responde pregunta abierta',
    description: 'Verificar el flujo de responder una pregunta open-ended',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'En el quiz, ir a la primera pregunta abierta sobre pedagogía del encuentro', 'Área de texto visible con límite de 500 caracteres'),
      step(2, 'Escribir una respuesta', 'Texto guardado. Contador de caracteres visible si hay límite.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-06: Docente navega entre preguntas del quiz',
    description: 'Verificar la navegación entre preguntas dentro del quiz',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Usar navegación anterior/siguiente entre preguntas', 'Se puede navegar libremente. Las preguntas respondidas se marcan en el navegador.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-07: Docente envía quiz completado',
    description: 'Verificar el flujo de envío de quiz con confirmación',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Responder todas las preguntas del quiz', 'Todas las preguntas respondidas'),
      step(2, 'Hacer clic en "Enviar Quiz"', 'Aparece diálogo de confirmación'),
      step(3, 'Confirmar envío', 'Quiz enviado exitosamente. Mensaje de confirmación mostrado.'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
  },
  {
    name: 'QT-08: Docente ve score inmediato para preguntas auto-evaluadas',
    description: 'Verificar que el score de MC se muestra inmediatamente después del envío',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Después de enviar el quiz, revisar los resultados', 'Se muestra el puntaje para las preguntas de opción múltiple inmediatamente'),
      step(2, 'Verificar que el puntaje refleja las respuestas correctas', 'Porcentaje y cantidad de respuestas correctas visible'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-09: Docente ve "pendiente de revisión" para preguntas abiertas',
    description: 'Verificar que las preguntas open-ended muestran status de revisión pendiente',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Después de enviar un quiz con preguntas abiertas, revisar resultados', 'Se muestra mensaje indicando que las preguntas abiertas están pendientes de revisión manual por el consultor'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-10: Docente ve resultados del quiz después de completar',
    description: 'Verificar que se puede revisar los resultados de quizzes completados',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a un quiz ya completado', 'Se muestra el puntaje total obtenido. Las preguntas de opción múltiple muestran si fueron correctas o incorrectas. Las preguntas abiertas muestran un mensaje indicando que están pendientes de revisión por el docente. El feedback detallado por pregunta aparece después de que el docente califica.'),
    ],
    priority: 1,
    estimated_duration_minutes: 2,
  },
  {
    name: 'QT-11: Docente reintenta quiz (si múltiples intentos permitidos)',
    description: 'Verificar el flujo de reintentar un quiz cuando se permiten múltiples intentos. NOTA: Funcionalidad de reintento no implementada aún — escenario desactivado.',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a un quiz completado que permita reintentos', 'Botón "Reintentar Quiz" visible (si allowRetries es true)'),
      step(2, 'Si el quiz permite reintentos, iniciar un nuevo intento', 'Nuevo intento inicia. El intento anterior se preserva en el historial.'),
    ],
    priority: 1,
    estimated_duration_minutes: 3,
    is_active: false,
  },

  // ============================================================
  // ASSIGNMENT/TASK SUBMISSION (7 scenarios) — priority 2
  // ============================================================

  {
    name: 'TS-01: Docente ve lista de tareas pendientes',
    description: 'Verificar que la lista de tareas muestra información completa',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /mi-aprendizaje/tareas', 'Lista de tareas con títulos, fechas de vencimiento y fuentes de asignación', '/mi-aprendizaje/tareas'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'TS-02: Docente ve detalles de tarea',
    description: 'Verificar que los detalles de la tarea se muestran completos',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Hacer clic en una tarea de la lista', 'Detalle muestra: instrucciones completas, fecha de vencimiento, requisitos de entrega'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },
  {
    name: 'TS-03: Docente ve fecha y estado de tarea',
    description: 'Verificar que se muestran fecha de vencimiento y estado claramente',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Ver la lista de tareas o detalle de tarea', 'Fecha de vencimiento visible. Estado mostrado (no iniciado, en progreso, entregado, calificado).'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'TS-04: Docente sube archivo adjunto para tarea',
    description: 'Verificar el flujo de subir archivos para una tarea',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Abrir una tarea que requiera archivo', 'Formulario de entrega visible'),
      step(2, 'Hacer clic en subir y seleccionar un archivo', 'Archivo sube exitosamente. Vista previa mostrada. Se puede eliminar y re-subir antes de enviar.'),
    ],
    priority: 2,
    estimated_duration_minutes: 3,
  },
  {
    name: 'TS-05: Docente envía respuesta de texto para tarea',
    description: 'Verificar el flujo de enviar respuesta de texto',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Abrir una tarea con entrega de texto', 'Editor de texto visible'),
      step(2, 'Escribir respuesta y enviar', 'Respuesta guardada. Confirmación mostrada. Estado cambia a "Entregado".'),
    ],
    priority: 2,
    estimated_duration_minutes: 3,
  },
  {
    name: 'TS-06: Docente ve estado de entrega',
    description: 'Verificar que el estado de la entrega se muestra correctamente',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Ver una tarea después de enviarla', 'Estado muestra: "Entregado - Pendiente de revisión" o "Calificado" con fecha'),
    ],
    priority: 2,
    estimated_duration_minutes: 1,
  },
  {
    name: 'TS-07: Docente ve feedback del revisor',
    description: 'Verificar que se puede ver los comentarios del revisor en tareas calificadas',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Abrir una tarea calificada', 'Comentarios del revisor visibles. Se puede ver feedback específico sobre la entrega.'),
    ],
    priority: 2,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // COLLABORATIVE WORKSPACE (7 scenarios) — priority 3
  // ============================================================

  {
    name: 'CW-01: Docente ve overview del workspace',
    description: 'Verificar que la vista general del workspace de comunidad carga',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Navegar a /community/workspace?section=overview', 'Overview carga con resumen de la comunidad, actividad reciente, cuenta de miembros', '/community/workspace?section=overview'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CW-02: Docente ve lista de miembros de comunidad',
    description: 'Verificar que se muestra la lista de miembros de la comunidad',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'En el workspace, ver la sección de miembros', 'Lista de miembros con nombres y roles mostrada'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CW-03: Docente ve publicaciones en el feed de comunidad',
    description: 'Verificar que se muestran las publicaciones del feed',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Navegar a la sección de feed/publicaciones del workspace', 'Publicaciones de miembros se muestran en orden cronológico'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CW-04: Docente crea nueva publicación en comunidad',
    description: 'Verificar que el docente puede crear publicaciones en el feed',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Hacer clic en "Nueva Publicación" o equivalente', 'Formulario de nueva publicación se abre'),
      step(2, 'Escribir contenido y publicar', 'Publicación creada exitosamente. Aparece en el feed.'),
    ],
    priority: 3,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CW-05: Docente comenta en publicación existente',
    description: 'Verificar que el docente puede comentar en publicaciones',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Localizar una publicación en el feed y hacer clic en comentar', 'Campo de comentario se abre'),
      step(2, 'Escribir comentario y enviar', 'Comentario agregado. Visible para otros miembros.'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },
  {
    name: 'CW-06: Docente sube archivo al workspace',
    description: 'Verificar que el docente puede subir archivos al espacio compartido',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Usar la función de subir archivo en el workspace', 'Diálogo de selección de archivo aparece'),
      step(2, 'Seleccionar un archivo y subir', 'Archivo subido exitosamente. Aparece en el área de archivos compartidos.'),
    ],
    priority: 3,
    estimated_duration_minutes: 3,
  },
  {
    name: 'CW-07: Docente descarga archivo compartido del workspace',
    description: 'Verificar que el docente puede descargar archivos compartidos',
    feature_area: 'community_workspace',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_COMMUNITY],
    steps: [
      step(1, 'Localizar un archivo en el workspace y hacer clic en descargar', 'El archivo se descarga al dispositivo local exitosamente'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // PROFILE & NOTIFICATIONS (4 scenarios) — priority 3
  // ============================================================

  {
    name: 'PN-01: Docente edita información de perfil',
    description: 'Verificar que se pueden editar y guardar datos de perfil',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Navegar a /profile', 'Página de perfil carga', '/profile'),
      step(2, 'Editar campos (nombre, bio, información de contacto) y guardar', 'Cambios guardados: nombre, bio, contacto actualizados exitosamente'),
    ],
    priority: 3,
    estimated_duration_minutes: 3,
  },
  {
    name: 'PN-02: Docente actualiza avatar',
    description: 'Verificar que se puede cambiar la imagen de avatar',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'En /profile, subir nueva imagen de avatar', 'Avatar se actualiza. Nueva imagen mostrada en sidebar, publicaciones, etc.'),
    ],
    priority: 3,
    estimated_duration_minutes: 3,
  },
  {
    name: 'PN-03: Docente ve lista de notificaciones',
    description: 'Verificar que se puede ver la lista de notificaciones',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Hacer clic en el ícono de campana de notificaciones', 'Dropdown o página de notificaciones muestra notificaciones recientes con timestamps'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },
  {
    name: 'PN-04: Docente navega desde notificación',
    description: 'Verificar que al hacer clic en una notificación navega al contenido relevante',
    feature_area: 'docente_experience',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE],
    steps: [
      step(1, 'Hacer clic en una notificación', 'Navega al contenido relevante (ej. nuevo feedback → detalle de tarea)'),
    ],
    priority: 3,
    estimated_duration_minutes: 2,
  },

  // ============================================================
  // BONUS: QUIZ SCORING BUG (1 scenario) — priority 1
  // ============================================================

  {
    name: 'BUG-01: Verificación de auto-grading score para MC correcta',
    description: 'Verificar que al responder correctamente una pregunta MC, el auto_graded_score refleje los puntos correctos (se encontró score=0 para respuesta correcta)',
    feature_area: 'quiz_submission',
    role_required: 'docente',
    preconditions: [PRECOND_DOCENTE, PRECOND_ENROLLED],
    steps: [
      step(1, 'Navegar a la lección "Materiales y Recursos" → Iniciar quiz "Reflexión sobre el Enfoque Pedagógico"', 'Quiz se inicia'),
      step(2, 'Responder la pregunta MC "¿Cuántas dimensiones...?" con "4 dimensiones" (respuesta correcta)', 'Opción seleccionada'),
      step(3, 'Responder ambas preguntas abiertas con cualquier texto', 'Texto ingresado'),
      step(4, 'Enviar quiz', 'Quiz enviado exitosamente'),
      step(5, 'Revisar resultados: la pregunta MC debe mostrar como correcta con 5 puntos', 'auto_graded_score = 5 para la respuesta MC correcta'),
      step(6, 'Si auto_graded_score muestra 0 en lugar de 5, esto CONFIRMA el bug', 'Registrar si el bug se reproduce', undefined, true),
    ],
    priority: 1,
    estimated_duration_minutes: 5,
  },
];

// ============================================================
// INSERTION
// ============================================================

async function main() {
  console.log(`\n=== Populating qa_scenarios with ${scenarios.length} scenarios ===\n`);

  // First clear existing scenarios if any
  const { count: existing } = await supabase
    .from('qa_scenarios')
    .select('*', { count: 'exact', head: true });
  console.log(`Existing scenarios: ${existing || 0}`);

  if (existing > 0) {
    console.log('Clearing existing scenarios...');
    const { error: delError } = await supabase
      .from('qa_scenarios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    if (delError) {
      console.error('Error clearing:', delError.message);
    }
  }

  // Insert in batches of 10
  const batchSize = 10;
  let inserted = 0;
  let errors = [];
  const featureAreaCounts = {};

  for (let i = 0; i < scenarios.length; i += batchSize) {
    const batch = scenarios.slice(i, i + batchSize).map(s => ({
      name: s.name,
      description: s.description,
      feature_area: s.feature_area,
      role_required: s.role_required,
      preconditions: s.preconditions,
      steps: s.steps,
      priority: s.priority,
      estimated_duration_minutes: s.estimated_duration_minutes,
      is_active: true,
      automated_only: false,
      is_multi_user: false,
    }));

    const { data, error } = await supabase
      .from('qa_scenarios')
      .insert(batch)
      .select('id, feature_area');

    if (error) {
      console.error(`Batch ${Math.floor(i/batchSize)+1} error:`, error.message);
      errors.push(`Batch ${Math.floor(i/batchSize)+1}: ${error.message}`);
    } else {
      inserted += data.length;
      data.forEach(d => {
        featureAreaCounts[d.feature_area] = (featureAreaCounts[d.feature_area] || 0) + 1;
      });
      console.log(`  Batch ${Math.floor(i/batchSize)+1}: ${data.length} inserted (total: ${inserted})`);
    }
  }

  // Verify
  console.log('\n=== VERIFICATION ===\n');

  const { data: allScenarios, error: verifyError } = await supabase
    .from('qa_scenarios')
    .select('id, feature_area, priority')
    .eq('is_active', true);

  if (verifyError) {
    console.error('Verification error:', verifyError.message);
  } else {
    console.log(`Total active scenarios in DB: ${allScenarios.length}`);
  }

  // Print report
  console.log('\n## RESULTS');
  console.log(`- Total scenarios inserted: ${inserted}`);
  console.log(`- Feature area breakdown:`);
  Object.entries(featureAreaCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([area, count]) => {
      console.log(`    ${area}: ${count}`);
    });
  if (errors.length > 0) {
    console.log(`- Errors: ${errors.join('; ')}`);
  } else {
    console.log('- Errors: None');
  }

  console.log('\n## VERIFICATION');
  console.log(`- DB count of active scenarios: ${allScenarios?.length || 'ERROR'}`);
  console.log(`- Expected: ${scenarios.length}`);
  console.log(`- Match: ${allScenarios?.length === scenarios.length ? 'YES' : 'NO'}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
