# Mi Aprendizaje (the learner's courses, lessons and routes)

Area `03-aprendizaje`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `02daebb57` (2026-11-25).

Course system: the Course Review session owns this area's structure and its own checklist (docs/planning/courses/inventory.md, not yet on main). This file is the redesign's list of what is on screen today.

7 screen files, 1 API files, 25 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/course-manager` | `pages/course-manager.tsx` | 22 | — | Looks like a leftover but is in use |
| `/mi-aprendizaje` | `pages/mi-aprendizaje.tsx` | 526 | Mi Aprendizaje; Mi Aprendizaje › Mis Cursos |  |
| `/mi-aprendizaje/ruta/[id]` | `pages/mi-aprendizaje/ruta/[id].tsx` | 549 | — |  |
| `/mi-aprendizaje/tareas` | `pages/mi-aprendizaje/tareas.tsx` | 612 | Mi Aprendizaje › Mis Tareas |  |
| `/my-paths` | `pages/my-paths.tsx` | 22 | — | Looks like a leftover but is in use |
| `/student/course/[courseId]` | `pages/student/course/[courseId].tsx` | 708 | — |  |
| `/student/lesson/[lessonId]` | `pages/student/lesson/[lessonId].tsx` | 970 | — |  |

## /course-manager

File `pages/course-manager.tsx` · 22 lines · frame: none

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/notifications/NotificationDropdown.tsx:138`, `components/notifications/NotificationDropdown.tsx:148`, `lib/auth/forced-password-change.ts:139`, `middleware.ts:340`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/mi-aprendizaje` | `router.replace` |  | CourseManagerRedirect · l.10 |

**Other texts on screen** (1)

- «Redirigiendo a Mi Aprendizaje...» — CourseManagerRedirect · l.18

## /mi-aprendizaje

File `pages/mi-aprendizaje.tsx` · 526 lines · frame: MainLayout

### Who reaches it

- Menu: «Mi Aprendizaje» → `/mi-aprendizaje` — everyone signed in (`Sidebar.tsx` l.140)
- Menu: Mi Aprendizaje › «Mis Cursos» → `/mi-aprendizaje?tab=cursos` — everyone signed in; the group: everyone signed in (`Sidebar.tsx` l.147)
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.278 `router.push → /login  (when !session?.user)`
  - l.292 `role = await getUserPrimaryRole(session.user.id)`
  - l.347 `router.push → /login`
  - l.377 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:31`, `components/layout/Sidebar.tsx:143`, `components/layout/Sidebar.tsx:149`, `components/notifications/ModernNotificationCenter.tsx:309`, `components/notifications/ModernNotificationCenter.tsx:319`, `components/panel/PanelClasico.tsx:562`, `components/panel/PanelClasico.tsx:563`, `components/panel/PanelNuevo.tsx:130`, `lib/auth/forced-password-change.ts:152`, `lib/auth/forced-password-change.ts:182`, `lib/notificationEvents.ts:248`, `lib/notificationEvents.ts:262` and 14 more
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/notification-dispatch.spec.ts`, `tests/e2e/notification-mail-mirror.spec.ts`, `tests/e2e/panel-pin.spec.ts`.
- QA scenarios that name this address: admin 4, community_manager 2, consultor 1, equipo_directivo 1, lider_comunidad 1, lider_generacion 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | yes | pass |
| lider_comunidad | yes | pass |
| supervisor_de_red | yes | pass |
| community_manager | yes | pass |
| docente | yes | pass |
| encargado_licitacion | yes | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mis Rutas de Aprendizaje» | h2 | `activeTab === 'rutas'` | MiAprendizajePage · l.460 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Recargar página» | `{() => window.location.reload()}` | `error` |  |  | NetflixCoursesView · l.145 |
| «Mis Rutas de Aprendizaje» | `{() => { setActiveTab('rutas'); router.push('/mi-aprendizaje?tab=rutas', undefin…}` |  |  |  | MiAprendizajePage · l.427 |
| «Mis Cursos» | `{() => { setActiveTab('cursos'); router.push('/mi-aprendizaje?tab=cursos', undef…}` |  |  |  | MiAprendizajePage · l.440 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `LearningPathCard` |  | `{() => router.push('/mi-aprendizaje/ruta/${path.id}')}` | `activeTab === 'rutas' && !(pathsLoading) && !(learningPaths.length === 0) && (each learningPaths .filter(path => !searchQuery \|\| pat…)` | MiAprendizajePage · l.491 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudieron cargar tus cursos. Por favor, intenta de nuevo más tarde.» | `setCoursesError` | `!(response.ok)` | fetchMyCourses · l.257 |
| «Ocurrió un error al cargar tus cursos.» | `setCoursesError` |  | fetchMyCourses · l.261 |
| «Error al cargar las rutas de aprendizaje» | `throw (shown by whoever catches it)` | `!response.ok` | fetchLearningPaths · l.362 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.278 |
| `/login` | `router.push` |  | checkAuth · l.347 |
| `/login` | `router.push` |  | handleLogout · l.377 |
| `/mi-aprendizaje?tab=rutas` | `router.push` |  | MiAprendizajePage · l.435 |
| `/mi-aprendizaje?tab=cursos` | `router.push` |  | MiAprendizajePage · l.448 |
| `/mi-aprendizaje/ruta/[*]` | `router.push` | `activeTab === 'rutas' && !(pathsLoading) && !(learningPaths.length === 0) && (each learningPaths .filter(path => !searchQuery \|\| pat…)` | MiAprendizajePage · l.498 |
| `/student/course/[*]` | `router.push` | `activeTab === 'cursos'` | MiAprendizajePage · l.516 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | checkAuth · l.292 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NetflixCourseRow` | title: Continuar Aprendiendo · emptyMessage: No hay cursos en progreso | `inProgressCourses.length > 0` |  | NetflixCoursesView · l.174 |
| `NetflixCourseRow` | title: Comenzar · emptyMessage: No hay cursos pendientes | `notStartedCourses.length > 0` |  | NetflixCoursesView · l.184 |
| `NetflixCourseRow` | title: Todos Mis Cursos · emptyMessage: No hay cursos que coincidan con tu búsqueda | `inProgressCourses.length === 0 && notStartedCourses.length === 0 && completedCourses.length === 0` |  | NetflixCoursesView · l.194 |
| `NetflixCourseRow` | title: Completados · emptyMessage: No has completado ningún curso aún | `completedCourses.length > 0` |  | NetflixCoursesView · l.204 |
| `MainLayout` |  | `loading` |  | MiAprendizajePage · l.382 |
| `MainLayout` |  |  |  | MiAprendizajePage · l.402 |
| `ResponsiveFunctionalPageHeader` | title: Mi Aprendizaje · subtitle: Rutas de aprendizaje y cursos asignados · searchPlaceholder: Buscar en rutas y cursos... |  |  | MiAprendizajePage · l.411 |
| `HelpButton` | sectionId: mi-aprendizaje |  |  | MiAprendizajePage · l.419 |
| `LearningPathCard` |  | `activeTab === 'rutas' && !(pathsLoading) && !(learningPaths.length === 0) && (each learningPaths .filter(path => !searchQuery \|\| pat…)` |  | MiAprendizajePage · l.491 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `?tab` | l.1 |

**Values shown from data** (1)

- `{error}` — NetflixCoursesView · l.144, when `error`

**Other texts on screen** (8)

- «Cargando tus cursos...» — NetflixCoursesView · l.134, when `loading`
- «No tienes cursos asignados.» — NetflixCoursesView · l.161, when `courses.length === 0`
- «Cuando te inscribas en cursos, aparecerán aquí.» — NetflixCoursesView · l.163, when `courses.length === 0`
- «Cargando...» — MiAprendizajePage · l.394, when `loading`
- «Rutas de aprendizaje estructuradas asignadas a ti» — MiAprendizajePage · l.464, when `activeTab === 'rutas'`
- «Cargando rutas de aprendizaje...» — MiAprendizajePage · l.472, when `activeTab === 'rutas' && pathsLoading`
- «No tienes rutas de aprendizaje asignadas aún.» — MiAprendizajePage · l.477, when `activeTab === 'rutas' && !(pathsLoading) && learningPaths.length === 0`
- «Las rutas de aprendizaje organizan múltiples cursos en secuencias estructuradas.» — MiAprendizajePage · l.479, when `activeTab === 'rutas' && !(pathsLoading) && learningPaths.length === 0`

**Reads and writes the database directly:** `table:course_assignments` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/courses/CourseThumbnail.tsx`
- `components/courses/NetflixCourseCard.tsx`
- `components/courses/NetflixCourseRow.tsx`
- `components/courses/courseCardText.ts`
- `components/layout/FunctionalPageHeader.tsx`
- `components/learning-paths/LearningPathCard.tsx`
- `components/learning-paths/routeCardText.ts`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `lib/tutorials/content.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths/my-paths` | GET | `pages/mi-aprendizaje.tsx:359` |
| `/api/my-courses` | GET | `pages/mi-aprendizaje.tsx:252`, `pages/mi-aprendizaje.tsx:328` |

## /mi-aprendizaje/ruta/[id]

File `pages/mi-aprendizaje/ruta/[id].tsx` · 549 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.506 `server redirect → /auth/signin  (when !user)`
  - l.521 `server redirect → /auth/signin  (when !profileData)`
  - l.538 `isAdmin = userRoles?.some(role => role.role_type === 'admin') \|\| false`
- Linked from: `hooks/usePanel.ts:421`, `hooks/usePanel.ts:426`, `pages/api/qa/seed-codebase-index.ts:268`, `pages/mi-aprendizaje.tsx:498`
- Tests: browser tests that CI runs: `tests/e2e/look-panel.spec.ts`; browser tests CI skips: `tests/e2e/panel-pin.spec.ts`; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{pathDetails.name}» | h1 |  | PathDetailsPage · l.262 |
| «Cursos en esta ruta ( {pathDetails.courses.length} )» | h2 |  | PathDetailsPage · l.354 |
| «{course.title}» | h3 | `each pathDetails.courses` | PathDetailsPage · l.380 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Mis Rutas» | `{() => router.push('/my-paths')}` | `error \|\| !pathDetails` |  |  | PathDetailsPage · l.228 |
| «Volver a Mi Aprendizaje» | `{() => router.push('/mi-aprendizaje')}` |  |  |  | PathDetailsPage · l.250 |
| «Vista Básica / Vista Inteligente» | `{() => setShowEnhancedView(!showEnhancedView)}` | `enhancedProgress && !loadingEnhanced` |  |  | PathDetailsPage · l.267 |
| «{course.buttonText}» |  | `each pathDetails.courses && course.buttonDisabled` | `true` |  | PathDetailsPage · l.462 |
| «{course.buttonText}» | `{() => { if (course.buttonTargetCourseId) { updateActivity('course_start', cours…}` | `each pathDetails.courses && !(course.buttonDisabled)` |  |  | PathDetailsPage · l.472 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{course.buttonText}» | `{course.buttonHref}` | `each pathDetails.courses && !(course.buttonDisabled)` |  | PathDetailsPage · l.471 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los detalles de la ruta» | `throw (shown by whoever catches it)` | `!response.ok` | fetchPathDetails · l.105 |
| «Error al cargar los detalles de la ruta» | `setError` |  | fetchPathDetails · l.112 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/my-paths` | `router.push` | `error \|\| !pathDetails` | PathDetailsPage · l.231 |
| `/mi-aprendizaje` | `router.push` |  | PathDetailsPage · l.253 |
| `/auth/signin` | `server redirect` | `!user` | getServerSideProps · l.506 |
| `/auth/signin` | `server redirect` | `!profileData` | getServerSideProps · l.521 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = userRoles?.some(role => role.role_type === 'admin') \|\| false` | getServerSideProps · l.538 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | PathDetailsPage · l.199 |
| `MainLayout` |  | `error \|\| !pathDetails` |  | PathDetailsPage · l.217 |
| `MainLayout` |  |  |  | PathDetailsPage · l.242 |
| `EnhancedProgressIndicators` |  | `showEnhancedView && enhancedProgress && !loadingEnhanced` |  | PathDetailsPage · l.331 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `levels` | «Principiante», «Intermedio», «Avanzado» | getDifficultyBadge · l.181 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (4)

- `{pathDetails.description}` — PathDetailsPage · l.280
- `{course.sequence}` — PathDetailsPage · l.367, when `each pathDetails.courses`
- `{course.description}` — PathDetailsPage · l.383, when `each pathDetails.courses`
- `{course.completion_rate} %` — PathDetailsPage · l.413, when `each pathDetails.courses && course.status !== 'not_started' && course.completion_rate > 0`

**Other texts on screen** (18)

- «Completado» — getStatusBadge · l.153, when `status === 'completed'`
- «En progreso (» — getStatusBadge · l.160, when `status === 'in_progress'`
- «Inscrito» — getStatusBadge · l.167, when `status === 'enrolled'`
- «No iniciado» — getStatusBadge · l.174
- «Cargando detalles de la ruta...» — PathDetailsPage · l.208, when `loading`
- «{error} / Ruta de aprendizaje no encontrada» — PathDetailsPage · l.225, when `error \|\| !pathDetails`
- «Progreso general» — PathDetailsPage · l.285
- «Sesión activa» — PathDetailsPage · l.290, when `getCurrentSession()`
- «{pathDetails.progress.completed_cour…} de {pathDetails.progress.total_courses} cursos completados» — PathDetailsPage · l.293
- «{pathDetails.progress.progress_perce…} % completado» — PathDetailsPage · l.306
- «{Math.floor(pathDetails.timeTracking…} h {pathDetails.timeTracking.totalTimeS…} min invertidos» — PathDetailsPage · l.312, when `pathDetails.timeTracking && pathDetails.timeTracking.totalTimeSpent > 0`
- «¡Ruta completada!» — PathDetailsPage · l.321, when `pathDetails.progress.progress_percentage === 100`
- «Cargando análisis inteligente...» — PathDetailsPage · l.345, when `showEnhancedView && loadingEnhanced`
- «{course.duration_hours} horas» — PathDetailsPage · l.394, when `each pathDetails.courses`
- «Último acceso {formatDistanceToNow(new Date(course…}» — PathDetailsPage · l.398, when `each pathDetails.courses && course.last_accessed`
- «Progreso del curso» — PathDetailsPage · l.412, when `each pathDetails.courses && course.status !== 'not_started' && course.completion_rate > 0`
- «Curso actual - Continúa tu progreso» — PathDetailsPage · l.439, when `each pathDetails.courses && showEnhancedView && enhancedProgress && enhancedProgress.insights && course.sequence === pathDetails.progress.completed_courses + 1 && course.status === 'in_progress'`
- «Próximo paso - ¡Empezar ahora!» — PathDetailsPage · l.451, when `each pathDetails.courses && showEnhancedView && enhancedProgress && enhancedProgress.insights && course.status === 'not_started' && course.sequence === pathDetails.progress.completed_courses + 1`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/learning-paths/EnhancedProgressIndicators.tsx`
- `components/ui/button.tsx`
- `lib/services/learningPathSessionTracker.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths/[id]` | GET | `lib/services/learningPathSessionTracker.ts:38`, `pages/mi-aprendizaje/ruta/[id].tsx:102` |
| `/api/learning-paths/[id]/enhanced-progress` | GET | `pages/mi-aprendizaje/ruta/[id].tsx:122` |

## /mi-aprendizaje/tareas

File `pages/mi-aprendizaje/tareas.tsx` · 612 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Aprendizaje › «Mis Tareas» → `/mi-aprendizaje/tareas` — everyone signed in; the group: everyone signed in (`Sidebar.tsx` l.154)
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/layout/Sidebar.tsx:156`, `lib/notifications/catalog.ts:298`, `pages/api/assignments/collaborative-submit.ts:126`, `pages/community/workspace.tsx:274`, `pages/community/workspace/assignments/[id]/discussion.tsx:150`, `pages/community/workspace/assignments/[id]/discussion.tsx:279`, `pages/community/workspace/assignments/[id]/discussion.tsx:289`, `pages/community/workspace/assignments/[id]/groups.tsx:154`, `pages/community/workspace/assignments/[id]/groups.tsx:164`
- Tests: browser tests that CI runs: `tests/e2e/look-frame.spec.ts`.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | yes | pass |
| lider_comunidad | yes | pass |
| supervisor_de_red | yes | pass |
| community_manager | yes | pass |
| docente | yes | pass |
| encargado_licitacion | yes | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Bienvenido a Mis Tareas! 🎉» | h3 | `showOnboarding` | TareasPage · l.371 |
| «No hay tareas pendientes / entregadas / calificadas» | h3 | `!(loading) && filteredAssignments.length === 0` | TareasPage · l.467 |
| «{assignment.title}» | h3 | `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments` | TareasPage · l.497 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «← Volver al Espacio Colaborativo» | `{() => router.back()}` | `router.query.from === 'workspace'` |  |  | TareasPage · l.351 |
| «×» | `{() => setShowOnboarding(false)}` | `showOnboarding` |  |  | TareasPage · l.365 |
| «{tab.label} {count}» | `{() => setActiveTab(tab.id)}` | `each tabs` |  |  | TareasPage · l.395 |
| «{course.name}» | `{() => handleToggleCommunity(course.id)}` | `courses.length > 1 && each courses` |  |  | TareasPage · l.442 |
| «Ver Detalles / Editar Entrega» | `{() => handleSubmitAssignment(assignment)}` | `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments` |  |  | TareasPage · l.570 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver Trabajo» | `{assignment.file_url}` (new tab) | `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && ((assignment.status === 'submitted' \|\| assignment.status === 'graded') && assignment.file_url)` |  | TareasPage · l.578 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar tareas...» | text | «Buscar tareas...» |  |  |  | TareasPage · l.424 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `GroupSubmissionModalV2` | component | `showSubmissionModal && selectedAssignment` |  | TareasPage · l.596 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las tareas» | `error` | loadAssignments · l.71 |
| error | «Error al cargar las tareas» |  | loadAssignments · l.101 |
| loading | «Cargando detalles de la tarea...» |  | handleSubmitAssignment · l.176 |
| error | «Error al cargar los detalles de la tarea» | `assignmentError \|\| !fullAssignment` | handleSubmitAssignment · l.185 |
| error | «Error al cargar el grupo ({groupResponse.status})» | `!contentType \|\| !contentType.includes('application/json')` | handleSubmitAssignment · l.200 |
| error | «Error al cargar el grupo: {groupData.error \|\| groupRes…}» | `!groupResponse.ok` | handleSubmitAssignment · l.209 |
| error | «Error al cargar el grupo» |  | handleSubmitAssignment · l.218 |
| error | «Error al preparar la entrega» |  | handleSubmitAssignment · l.235 |
| success | «¡Trabajo enviado exitosamente!» |  | handleSubmissionSuccess · l.244 |
| error | «Error: usuario o tarea no encontrados» | `!user \|\| !selectedAssignment` | handleGroupSubmit · l.249 |
| error | «Debes crear un grupo antes de entregar» | `!groupToUse?.id` | handleGroupSubmit · l.257 |
| error | «{errorMessage}» | `result.error` | handleGroupSubmit · l.273 |
| error | «Error al enviar el trabajo» |  | handleGroupSubmit · l.280 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | TareasPage · l.340 |
| `ResponsiveFunctionalPageHeader` | title: Mi Aprendizaje · subtitle: Mis Tareas - Tareas de todos tus cursos |  |  | TareasPage · l.345 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `errorMessage` | «Error al enviar el trabajo» | handleGroupSubmit · l.269 |
| `tabs` | «Pendientes», «Entregadas», «Calificadas» | TareasPage · l.333 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: tareas_onboarding_seen` | checkOnboardingStatus · l.54 |
| address value | `?communityId` | l.1 |
| address value | `?from` | l.1 |

**Values shown from data** (4)

- `{date.toLocaleDateString('es-ES', { …}` — formatDueDate · l.308
- `{assignment.description}` — TareasPage · l.505, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.description`
- `{assignment.score} / {assignment.points}` — TareasPage · l.550, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'graded'`
- `{assignment.feedback}` — TareasPage · l.555, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'graded' && assignment.feedback`

**Other texts on screen** (15)

- «Venció hace {Math.abs(diffDays)} día s» — formatDueDate · l.292, when `diffDays < 0`
- «Vence hoy» — formatDueDate · l.297, when `!(diffDays < 0) && diffDays === 0`
- «Vence mañana» — formatDueDate · l.299, when `!(diffDays < 0) && !(diffDays === 0) && diffDays === 1`
- «Vence en {diffDays} días» — formatDueDate · l.302, when `!(diffDays < 0) && !(diffDays === 0) && !(diffDays === 1) && diffDays <= 7`
- «Aquí puedes ver todas tus tareas grupales de todos tus cursos en un solo lugar.» — TareasPage · l.375, when `showOnboarding`
- «Envía tus trabajos directamente desde esta página.» — TareasPage · l.377, when `showOnboarding`
- «Filtrar por Curso» (label) — TareasPage · l.436, when `courses.length > 1`
- «Intenta cambiar los filtros / Las tareas aparecerán aquí cuando sean asignadas» — TareasPage · l.470, when `!(loading) && filteredAssignments.length === 0`
- «Curso: {assignment.course_title}» — TareasPage · l.486, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Ruta de aprendizaje: {(assignment as any).learning_path_t…}» — TareasPage · l.490, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && (assignment as any).learning_path_title`
- «Trabajo enviado» — TareasPage · l.527, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'submitted'`
- «Compartido por {assignment.submitter_name}» — TareasPage · l.529, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'submitted' && !assignment.is_original && assignment.submitter_name`
- «Última entrega: {formatSubmissionTimestamp(assignmen…}» — TareasPage · l.534, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'submitted' && formatSubmissionTimestamp(assignment.submitted_at)`
- «Calificado» — TareasPage · l.548, when `!(loading) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'graded'`
- «Última actualización: {formatSubmissionTimestamp(assignmen…}» — TareasPage · l.560, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.status === 'graded' && formatSubmissionTimestamp(assignment.submitted_at)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assignments/GroupSubmissionModalV2.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/groupAssignmentsV2.js`
- `lib/services/userAssignments.ts`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/assignments/add-classmates` | ? | `components/assignments/GroupSubmissionModalV2.tsx:307` |
| `/api/assignments/create-group` | ? | `components/assignments/GroupSubmissionModalV2.tsx:306` |
| `/api/assignments/eligible-classmates` | ? | `components/assignments/GroupSubmissionModalV2.tsx:170`, `components/assignments/GroupSubmissionModalV2.tsx:171` |
| `/api/assignments/group-members` | DELETE, GET | `components/assignments/GroupSubmissionModalV2.tsx:381`, `components/assignments/GroupSubmissionModalV2.tsx:90` |
| `/api/assignments/submit-group` | POST | `lib/services/groupAssignmentsV2.js:429` |
| `/api/assignments/user-group` | GET | `pages/mi-aprendizaje/tareas.tsx:193` |

## /my-paths

File `pages/my-paths.tsx` · 22 lines · frame: none

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/DynamicFavicon.tsx:32`, `lib/auth/forced-password-change.ts:154`, `middleware.ts:355`, `pages/mi-aprendizaje/ruta/[id].tsx:231`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/mi-aprendizaje` | `router.replace` |  | MyPathsRedirect · l.10 |

**Other texts on screen** (1)

- «Redirigiendo a Mi Aprendizaje...» — MyPathsRedirect · l.18

## /student/course/[courseId]

File `pages/student/course/[courseId].tsx` · 708 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.76 `router.push → /login  (when !session?.user)`
  - l.83 `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')`
  - l.94 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.391 `router.push → /login`
- Linked from: `components/student/LessonSidebar.tsx:138`, `components/student/LessonSidebar.tsx:139`, `hooks/usePanel.ts:420`, `hooks/usePanel.ts:425`, `lib/services/learningPathsService.ts:705`, `lib/services/learningPathsService.ts:771`, `lib/services/learningPathsService.ts:777`, `lib/services/learningPathsService.ts:784`, `lib/services/learningPathsService.ts:796`, `lib/services/learningPathsService.ts:801`, `lib/services/learningPathsService.ts:806`, `pages/admin/course-builder/index.tsx:614` and 4 more
- Tests: browser tests that CI runs: `tests/e2e/look-panel.spec.ts`; browser tests CI skips: `tests/e2e/panel-pin.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### Approved changes (decided by Brent with the mock-ups; not losses)

- Header becomes a band with «Volver», an eyebrow with the instructor, title, description and the «Progreso:» bar and %. The «Continuar Aprendiendo» card sits inside the band on the right (under the header on phones), its button the screen's one main action; still hidden when every lesson is complete. (cursos.md §8.1 rows A1.3 and A1.4; approved by Brent 13 Nov 2026 09:23)
- Lessons are rows instead of a card grid, for both simple and module courses; each row keeps the same seven things (status icon, «Lección n», «Reciente», title, «{n} bloques», «{N}% completado», bar), is a link and is never locked. (cursos.md §8.1 rows A1.5 and 'Lesson card'; LEDGER Choices, Phase 1 Courses; approved by Brent 13 Nov 2026 09:23)
- New completion screen with certificate (/maqueta/curso-completado), opened from a new button «Ver certificado» added to the «¡Curso Completado!» box: certificate preview, download, badge earned, next course of the route. New texts: «Certificado de aprobación», «Tu certificado», «Descargar certificado (PDF)», «Se otorga a», «por haber aprobado el curso», «Insignia obtenida», «Sigue con tu ruta», «Ver certificado»; counts «lecciones», «bloques», «de estudio», «quizzes aprobados». Certificate wording, signature, which courses and whether hours show are still open (course plan, phase 5). (cursos.md §8.1 row A1.6 and §8.3 row 'Completion screen with certificate'; approved by Brent 13 Nov 2026 09:23 (wording shown as the session's proposal, no notes from him))
- Loading «Cargando curso...», failure «No se pudo cargar el curso» + «Volver» and the toast «Error cargando el curso» become skeleton rows inside the frame, the foundations' error notice and the shared error toast (not drawn). (cursos.md §8.1 row A1.1-2; approved by Brent 13 Nov 2026 09:23)

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Continuar Aprendiendo» | h2 | `nextLesson` | StudentCourseViewer · l.480 |
| «Lecciones del Curso» | h3 | `course?.structure_type === 'simple'` | StudentCourseViewer · l.524 |
| «{lesson.title}» | h4 | `course?.structure_type === 'simple' && each directLessons` | StudentCourseViewer · l.577 |
| «Módulo {module.order_number} : {module.title}» | h3 | `!(course?.structure_type === 'simple') && each modules` | StudentCourseViewer · l.609 |
| «{lesson.title}» | h4 | `!(course?.structure_type === 'simple') && each modules && each module.lessons` | StudentCourseViewer · l.662 |
| «¡Curso Completado!» | h3 | `getCourseProgressPercentage() === 100` | StudentCourseViewer · l.695 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` | `!course` |  |  | StudentCourseViewer · l.410 |
| «Volver» | `{() => router.back()}` |  |  |  | StudentCourseViewer · l.446 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Continuar Lección» | `/student/lesson/[*]` | `nextLesson` |  | StudentCourseViewer · l.501 |
| «Lección {lesson.order_number} [Reciente] {lesson.title} {lessonProgress?.totalBlocks} bloques {progressPercentage} % completado» | `/student/lesson/[*]` | `course?.structure_type === 'simple' && each directLessons` |  | StudentCourseViewer · l.548 |
| «Lección {lesson.order_number} [Reciente] {lesson.title} {lessonProgress?.totalBlocks} bloques {progressPercentage} % completado» | `/student/lesson/[*]` | `!(course?.structure_type === 'simple') && each modules && each module.lessons` |  | StudentCourseViewer · l.633 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error cargando el curso» |  | initializeCourseViewer · l.323 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeCourseViewer · l.76 |
| `/login` | `router.push` |  | handleLogout · l.391 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin')` | initializeCourseViewer · l.83 |
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeCourseViewer · l.94 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | StudentCourseViewer · l.432 |
| `ResponsiveFunctionalPageHeader` |  |  |  | StudentCourseViewer · l.441 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.389 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.390 |
| address value | `[courseId] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{getCourseProgressPercentage()} %` — StudentCourseViewer · l.464
- `{module.description}` — StudentCourseViewer · l.613, when `!(course?.structure_type === 'simple') && each modules && module.description`

**Other texts on screen** (10)

- «Cargando curso...» — StudentCourseViewer · l.399, when `loading`
- «No se pudo cargar el curso» — StudentCourseViewer · l.409, when `!course`
- «Progreso:» — StudentCourseViewer · l.456
- «Módulo {nextLesson.module.order_number} : {nextLesson.module.title}» — StudentCourseViewer · l.482, when `nextLesson && nextLesson.module`
- «Lección {nextLesson.lesson.order_number} : {nextLesson.lesson.title}» — StudentCourseViewer · l.486, when `nextLesson`
- «Progreso: {getLessonProgressPercentage(nextLes…} %» — StudentCourseViewer · l.490, when `nextLesson`
- «Este curso tiene {directLessons.length} lección / lecciones» — StudentCourseViewer · l.527, when `course?.structure_type === 'simple'`
- «{directLessons.filter(l => progress[…} / {directLessons.length} completadas» — StudentCourseViewer · l.532, when `course?.structure_type === 'simple'`
- «{module.lessons.filter(l => progress…} / {module.lessons.length} lecciones» — StudentCourseViewer · l.617, when `!(course?.structure_type === 'simple') && each modules`
- «Has completado todas las lecciones de este curso. ¡Felicitaciones!» — StudentCourseViewer · l.699, when `getCourseProgressPercentage() === 100`

**Reads and writes the database directly:** `table:blocks` (select), `table:courses` (select), `table:lesson_progress` (select), `table:lessons` (select), `table:modules` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /student/lesson/[lessonId]

File `pages/student/lesson/[lessonId].tsx` · 970 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.106 `router.push → /auth/login  (when !session?.user)`
  - l.120 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.575 `router.push → /login`
  - l.838 `router.push → /dashboard  (when showCompletionPage && !(previousLesson))`
  - l.862 `router.push → /dashboard  (when showCompletionPage && !(nextLesson) && courseCompleted && !(courseId))`
  - l.872 `router.push → /dashboard  (when showCompletionPage && !(nextLesson) && !(courseCompleted))`
- Linked from: `components/student/LessonSidebar.tsx:88`, `components/student/LessonSidebar.tsx:90`, `pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx:873`, `pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx:876`, `pages/admin/course-builder/[courseId]/lesson/[lessonId].tsx:429`, `pages/student/course/[courseId].tsx:428`, `pages/student/course/[courseId].tsx:501`, `pages/student/course/[courseId].tsx:502`, `pages/student/course/[courseId].tsx:548`, `pages/student/course/[courseId].tsx:550`, `pages/student/course/[courseId].tsx:633`, `pages/student/course/[courseId].tsx:635`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### Approved changes (decided by Brent with the mock-ups; not losses)

- The header becomes a white strip that stays under the top bar, on two lines: list button, «Módulo n · Lección n», title, «ADMIN», admin jump list, «Volver» / «Volver al Editor»; then «Bloque X de N» / «Lección completada», the two arrows, one segment per piece (done, current, to come) and «Progreso: N%». For an admin the segments are also buttons that jump. (cursos.md §8.2 row B1.5; LEDGER Choices, Phase 1 Courses; approved by Brent 13 Nov 2026 09:23)
- The lesson sidebar keeps its contents and behaviour (closed by default, left column on wide screens, drawer on phones), but its close button now has a label. (cursos.md §8.2 row B1.6 + B-S; approved by Brent 13 Nov 2026 09:23)
- Same piece-by-piece rules, but «Anterior» and «Siguiente» / «Finalizar» sit under the piece, and «Siguiente» turns gold (now yellow) once the piece is completed. (cursos.md §8.2 row B2; approved by Brent 13 Nov 2026 09:23)
- Each piece keeps its own completion control and 'done' text, now in a closing strip at the foot of the piece (text, video, gallery, files, links, bibliography, group work, quiz; admin «Continuar (Admin)»), all with today's texts. (cursos.md §8.2 row B4; approved by Brent 13 Nov 2026 09:23)
- Loading, not-found and no-content states become a skeleton inside the frame and the foundations' empty state with «Volver al Curso» (not drawn). (cursos.md §8.2 row B1.1-4; approved by Brent 13 Nov 2026 09:23)
- New quiz results screen for learners (/maqueta/quiz-resultados), opened from a new button «Ver mis resultados» on the completed quiz card and later from the «quiz revisado» notification; two states, just sent and reviewed. It reuses today's unreachable result texts. New texts: «Resultados del quiz», «Puntaje parcial», «Puntaje final», «1 correcta», «1 incorrecta», «1 pendiente de revisión», «1 revisada por tu profesor», «Retroalimentación de tu profesor», «{n} / {m} pts», «Volver a la lección», «Ver mis resultados». (cursos.md §8.2 row 'B4 quiz completed card' and §8.3 row 'Quiz results for learners'; approved by Brent 13 Nov 2026 09:23 (wording shown as the session's proposal, no notes from him))

### Notes

- Not drawn but must survive: the direct-file video with «Progreso del video» and the «Instrucción:» note, the single-image block, each block's empty text («No hay contenido disponible» …), the unknown-type block, the two quiz warnings for missing ids / no questions. They use the same closing strip. (cursos.md §8.2 row 'B4 not drawn')
- The quiz player is drawn as today with both review rounds, but its «Descripción» box is not drawn; it must survive. (cursos.md §8.2 row B5)
- The lesson completion screen is drawn as a dark card with today's texts, but only one variant (a lesson in the middle of the course); the other variants must survive. (cursos.md §8.2 row B3)

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Felicidades!» | h2 | `showCompletionPage` | StudentLessonViewer · l.797 |
| «Has completado la lección» | h3 | `showCompletionPage` | StudentLessonViewer · l.801 |

**Buttons** (15)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` | `!lesson` |  |  | StudentLessonViewer · l.594 |
| «Volver al Curso» | `{() => router.back()}` | `blocks.length === 0` |  |  | StudentLessonViewer · l.611 |
| «[icon List]» · tooltip «Ver lista de lecciones» | `{() => setShowSidebar(!showSidebar)}` |  |  |  | StudentLessonViewer · l.652 |
| «Volver al Editor / Volver» | `{() => { if (isAdmin && lesson?.module?.course_id && lesson?.module?.id) { route…}` |  |  |  | StudentLessonViewer · l.660 |
| «[icon ChevronLeft]» · tooltip «Bloque anterior» | `{goToPreviousBlock}` | `!showCompletionPage` | `{currentBlockIndex === 0}` |  | StudentLessonViewer · l.708 |
| «[icon ChevronRight]» · tooltip «Siguiente bloque» | `{goToNextBlock}` | `!showCompletionPage` | `{!canProceedToNext()}` |  | StudentLessonViewer · l.716 |
| «[icon X]» | `{() => setShowSidebar(false)}` | `showSidebar` · screen size: `lg:hidden` |  |  | StudentLessonViewer · l.746 |
| «Lección Anterior» | `{() => router.push('/student/lesson/${previousLesson.id}')}` | `showCompletionPage && previousLesson` |  |  | StudentLessonViewer · l.829 |
| «Volver a mi Panel» | `{() => router.push('/dashboard')}` | `showCompletionPage && !(previousLesson)` |  |  | StudentLessonViewer · l.837 |
| «Siguiente Lección» | `{() => router.push('/student/lesson/${nextLesson.id}')}` | `showCompletionPage && nextLesson` |  |  | StudentLessonViewer · l.848 |
| «Ver Curso Completado» | `{() => { const courseId = lesson?.module?.course_id \|\| lesson?.course_id; if (co…}` | `showCompletionPage && !(nextLesson) && courseCompleted` |  |  | StudentLessonViewer · l.856 |
| «Ir al Dashboard» | `{() => router.push('/dashboard')}` | `showCompletionPage && !(nextLesson) && !(courseCompleted)` |  |  | StudentLessonViewer · l.871 |
| «Anterior» | `{goToPreviousBlock}` | `showCompletionPage` |  |  | StudentLessonViewer · l.894 |
| «Anterior» | `{goToPreviousBlock}` | `!(showCompletionPage)` | `{currentBlockIndex === 0}` |  | StudentLessonViewer · l.931 |
| «Finalizar (Admin) / Finalizar / Siguiente (Admin) / Siguiente» | `{goToNextBlock}` | `!(showCompletionPage)` | `{!isAdmin && !canProceedToNext()}` |  | StudentLessonViewer · l.948 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{() => setShowSidebar(false)}` | `showSidebar` · screen size: `lg:hidden` | StudentLessonViewer · l.738 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «(lista) Bloque {index + 1} : {block.type}» | `!showCompletionPage && isAdmin` |  | StudentLessonViewer · l.678 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «(sin título)» | written in this file | `showSidebar` |  | StudentLessonViewer · l.736 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error cargando la lección: {error.message}» |  | initializeViewer · l.451 |
| error | «Error guardando progreso» |  | updateProgress · l.504 |

**Moves to another page from code** (10)

| Goes to | How | When | Where |
|---|---|---|---|
| `/auth/login` | `router.push` | `!session?.user` | initializeViewer · l.106 |
| `/login` | `router.push` |  | handleLogout · l.575 |
| `/admin/course-builder/[*]/[*]/[*]` | `router.push` | `isAdmin && lesson?.module?.course_id && lesson?.module?.id` | StudentLessonViewer · l.663 |
| `/admin/course-builder/[*]/[*]/[*]` | `router.push` | `!(isAdmin && lesson?.module?.course_id && lesson?.module?.id) && isAdmin && lesson?.module_id && lesson?.module?.course_id` | StudentLessonViewer · l.665 |
| `/student/lesson/[*]` | `router.push` | `showCompletionPage && previousLesson` | StudentLessonViewer · l.830 |
| `/dashboard` | `router.push` | `showCompletionPage && !(previousLesson)` | StudentLessonViewer · l.838 |
| `/student/lesson/[*]` | `router.push` | `showCompletionPage && nextLesson` | StudentLessonViewer · l.849 |
| `/student/course/[*]` | `router.push` | `showCompletionPage && !(nextLesson) && courseCompleted && courseId` | StudentLessonViewer · l.860 |
| `/dashboard` | `router.push` | `showCompletionPage && !(nextLesson) && courseCompleted && !(courseId)` | StudentLessonViewer · l.862 |
| `/dashboard` | `router.push` | `showCompletionPage && !(nextLesson) && !(courseCompleted)` | StudentLessonViewer · l.872 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeViewer · l.120 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | StudentLessonViewer · l.637 |
| `ResponsiveFunctionalPageHeader` | subtitle: Lección completada / Bloque {currentBlockIndex + 1} de {blocks.length} |  |  | StudentLessonViewer · l.646 |
| `LessonSidebar` |  | `showSidebar` |  | StudentLessonViewer · l.753 |
| `StudentBlockRenderer` |  | `!(showCompletionPage) && currentBlock` |  | StudentLessonViewer · l.910 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.573 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.574 |
| address value | `[lessonId] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{getProgressPercentage()} %` — StudentLessonViewer · l.700
- `{lesson?.title}` — StudentLessonViewer · l.805, when `showCompletionPage`

**Other texts on screen** (11)

- «Cargando lección...» — StudentLessonViewer · l.583, when `loading`
- «No se pudo cargar la lección» — StudentLessonViewer · l.593, when `!lesson`
- «Esta lección no tiene contenido aún» — StudentLessonViewer · l.609, when `blocks.length === 0`
- «La lección está en construcción» — StudentLessonViewer · l.610, when `blocks.length === 0`
- «Cargando lección...» — StudentLessonViewer · l.630, when `!showCompletionPage && (!blocks.length \|\| !currentBlock)`
- «Progreso:» — StudentLessonViewer · l.692
- «ADMIN» — StudentLessonViewer · l.729, when `isAdmin`
- «{blocks.length} bloques completados» — StudentLessonViewer · l.813, when `showCompletionPage`
- «{Math.floor( Object.values(progress)…} min total» — StudentLessonViewer · l.817, when `showCompletionPage`
- «¡Sigue así! Próxima lección: "{nextLesson.title}" / ¡Felicidades! Has completado todo el curso. / ¡Sigue así! Tu progreso ha sido guardado automáticamente.» — StudentLessonViewer · l.881, when `showCompletionPage`
- «Cargando bloque...» — StudentLessonViewer · l.925, when `!(showCompletionPage) && !(currentBlock)`

**Reads and writes the database directly:** `table:blocks` (select), `table:courses` (select), `table:lesson_progress` (select, upsert), `table:lessons` (select), `table:modules` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/quiz/LearningQuizTaker.tsx`
- `components/student/LessonSidebar.tsx`
- `components/student/StudentBlockRenderer.tsx`
- `lib/sanitize.ts`
- `lib/services/quizSubmissions.js`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quiz-reviews/notify-pending` | POST | `lib/services/quizSubmissions.js:22` |
| `/api/storage/download` | ? | `components/student/StudentBlockRenderer.tsx:752` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/assignments/GroupSubmissionModalV2.tsx

Used by: `/mi-aprendizaje/tareas`

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Ver Entrega Grupal / Entregar Tarea Grupal» | h2 |  | GroupSubmissionModalV2 · l.478 |
| «Detalles de la Tarea» | h3 | `!(loading)` | GroupSubmissionModalV2 · l.502 |
| «Instrucciones:» | h4 | `!(loading) && assignment.instructions` | GroupSubmissionModalV2 · l.506 |
| «Recursos:» | h4 | `!(loading) && assignment.resources && assignment.resources.length > 0` | GroupSubmissionModalV2 · l.563 |
| «Miembros del grupo» | h4 | `!(loading) && groupMembers.length > 0` | GroupSubmissionModalV2 · l.601 |
| «Invitar Compañeros» | h3 | `!(loading) && !isConsultantManaged` | GroupSubmissionModalV2 · l.655 |
| «Tu comunidad» | h4 | `!(loading) && !isConsultantManaged && !(loadingClassmates) && hasCommunitySection` | GroupSubmissionModalV2 · l.733 |
| «Tu escuela» | h4 | `!(loading) && !isConsultantManaged && !(loadingClassmates)` | GroupSubmissionModalV2 · l.746 |
| «Respuesta actual:» | h4 | `!(loading) && isSubmitted && existingSubmission && existingSubmission.content` | GroupSubmissionModalV2 · l.809 |
| «Archivo actual:» | h4 | `!(loading) && isSubmitted && existingSubmission && existingSubmission.file_url` | GroupSubmissionModalV2 · l.818 |
| «Calificación:» | h4 | `!(loading) && isSubmitted && existingSubmission && existingSubmission.grade` | GroupSubmissionModalV2 · l.840 |
| «Retroalimentación:» | h5 | `!(loading) && isSubmitted && existingSubmission && existingSubmission.grade && existingSubmission.feedback` | GroupSubmissionModalV2 · l.844 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | GroupSubmissionModalV2 · l.483 |
| «{resource.title} / Sin título [{resource.description}]» | `{(e) => handleResourceClick(e, resource)}` | `!(loading) && assignment.resources && assignment.resources.length > 0 && each assignment.resources .filter((resource: any) => n…` |  |  | GroupSubmissionModalV2 · l.568 |
| «Removiendo... / Remover» | `{() => handleRemoveMember(member.user_id)}` | `!(loading) && groupMembers.length > 0 && each groupMembers && !isConsultantManaged && !isCurrentUser` | `{removingMemberId === member.user_id}` |  | GroupSubmissionModalV2 · l.633 |
| «{classmate.full_name?.charAt(0).toUp…} / ? {classmate.full_name} / Usuario desconocido» | `{() => handleToggleClassmate(classmate.id)}` |  |  |  | renderPeer · l.693 |
| «Procesando... / Agregar al Grupo / Crear Grupo» | `{handleAddClassmates}` | `!(loading) && !isConsultantManaged && !(loadingClassmates) && eligibleClassmates.length > 0` | `{selectedClassmates.size === 0 \|\| loadingClassmates}` |  | GroupSubmissionModalV2 · l.773 |
| «Ver archivo adjunto» | `{(e) => handleResourceClick(e, { url: existingSubmission.file_url, type: 'docume…}` | `!(loading) && isSubmitted && existingSubmission && existingSubmission.file_url` |  |  | GroupSubmissionModalV2 · l.819 |
| «Eliminar archivo» | `{() => { setFileUrl(''); setUploadedFileName(''); }}` | `!(loading) && !(uploadingFile) && fileUrl` |  |  | GroupSubmissionModalV2 · l.901 |
| «Seleccionar archivo» | `{() => document.getElementById('file-upload')?.click()}` | `!(loading) && !(uploadingFile) && !(fileUrl)` | `{uploadingFile}` |  | GroupSubmissionModalV2 · l.925 |
| «Cancelar» | `{onClose}` |  |  |  | GroupSubmissionModalV2 · l.947 |
| «Subiendo archivo... / Actualizar Entrega / Entregar Tarea» | `{handleSubmit}` |  | `{loading \|\| uploadingFile}` |  | GroupSubmissionModalV2 · l.953 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Ver Entrega Grupal / Entregar Tarea Grupal {assignment.title} Detalles de la Tarea {assignment.description} [Instruccio…» | `{(e) => e.stopPropagation()}` |  | GroupSubmissionModalV2 · l.471 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar compañeros de clase...» | text | «Buscar compañeros de clase...» |  | `!(loading) && !isConsultantManaged` |  | GroupSubmissionModalV2 · l.663 |
|  | checkbox |  |  |  |  | renderPeer · l.702 |
| «Comentarios o Notas (opcional)» | textarea | «Agrega comentarios adicionales sobre tu entrega (opcional)...» |  | `!(loading)` |  | GroupSubmissionModalV2 · l.859 |
| «Archivo Adjunto (opcional para reediciones) / * Solo se permite un archivo» | file | disabled: `{uploadingFile}` · accepts `.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png` |  | `!(loading) && !(uploadingFile) && !(fileUrl)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=file-upload (id used by code)` | GroupSubmissionModalV2 · l.917 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {classmate.full_name \|\| 'User'} · {classmate.avatar_url} | `classmate.avatar_url` |  | renderPeer · l.709 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Ver Entrega Grupal / Entregar Tarea Grupal» | written in this file |  |  | GroupSubmissionModalV2 · l.467 |

**Toasts** (22)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar miembros del grupo» | `activeGroup?.id && !(membersResponse.ok)` | loadGroupData · l.109 |
| error | «Error al cargar miembros del grupo» | `activeGroup?.id` | loadGroupData · l.113 |
| error | «Error al cargar compañeros» | `!isManaged && user?.id && !(response.ok)` | loadGroupData · l.179 |
| error | «Error al cargar compañeros» | `!isManaged && user?.id` | loadGroupData · l.183 |
| error | «El archivo no debe superar los 10MB» | `file.size > 10 * 1024 * 1024` | handleFileUpload · l.201 |
| success | «Archivo subido exitosamente» |  | handleFileUpload · l.229 |
| error | «Error al subir el archivo» |  | handleFileUpload · l.232 |
| error | «Debes crear un grupo antes de entregar» | `!activeGroup?.id` | handleSubmit · l.242 |
| error | «Debes incluir un archivo en tu primera entrega» | `isNewSubmission && !fileUrl` | handleSubmit · l.250 |
| error | «Debes incluir al menos texto o un archivo en tu entrega» | `!hasText && !hasFile` | handleSubmit · l.260 |
| error | «Usuario no autenticado» | `!user?.id` | handleAddClassmates · l.291 |
| error | «Selecciona al menos un compañero» | `selectedClassmates.size === 0` | handleAddClassmates · l.297 |
| error | «{errorMsg}» | `!response.ok` | handleAddClassmates · l.342 |
| success | «Grupo creado exitosamente» | `isCreatingGroup` | handleAddClassmates · l.347 |
| success | «{data.count \|\| 0} compañero(s) agregado(s) al grupo» | `!(isCreatingGroup)` | handleAddClassmates · l.356 |
| error | «Error al agregar compañeros. Intenta nuevamente.» |  | handleAddClassmates · l.364 |
| error | «Usuario no autenticado» | `!user?.id` | handleRemoveMember · l.372 |
| error | «Error al remover al miembro» | `!response.ok` | handleRemoveMember · l.396 |
| success | «Miembro removido del grupo» |  | handleRemoveMember · l.400 |
| error | «Error al remover al miembro. Intenta nuevamente.» |  | handleRemoveMember · l.404 |
| error | «Este recurso no tiene un archivo disponible. Solicita al instructor que vuelva a cargarlo.» | `!normalizedUrl && resource?.type === 'document'` | handleResourceClick · l.449 |
| error | «El recurso no tiene un enlace disponible» | `!normalizedUrl && !(resource?.type === 'document')` | handleResourceClick · l.451 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{normalizedUrl}` | `window.open` |  | handleResourceClick · l.456 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!user?.id` | GroupSubmissionModalV2 · l.74 |
| `!trimmed` | GroupSubmissionModalV2 · l.514 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| lookup | `getElementById('file-upload')` | GroupSubmissionModalV2 · l.927 |

**Values shown from data** (11)

- `{assignment.title}` — GroupSubmissionModalV2 · l.481
- `{assignment.description}` — GroupSubmissionModalV2 · l.503, when `!(loading)`
- `{step.number} .` — GroupSubmissionModalV2 · l.550, when `!(loading) && assignment.instructions && each steps && step.number`
- `{step.content}` — GroupSubmissionModalV2 · l.553, when `!(loading) && assignment.instructions && each steps && !(step.number)`
- `{member.user?.first_name?.[0]} / {member.user?.last_name?.[0]} / U` — GroupSubmissionModalV2 · l.614, when `!(loading) && groupMembers.length > 0 && each groupMembers`
- `{communityPeers.map(renderPeer)}` — GroupSubmissionModalV2 · l.737, when `!isConsultantManaged && !(loadingClassmates) && hasCommunitySection && communityPeers.length > 0`
- `{schoolPeers.map(renderPeer)}` — GroupSubmissionModalV2 · l.750, when `!(loading) && !isConsultantManaged && !(loadingClassmates) && schoolPeers.length > 0`
- `{existingSubmission.grade} %` — GroupSubmissionModalV2 · l.841, when `!(loading) && isSubmitted && existingSubmission && existingSubmission.grade`
- `{existingSubmission.feedback}` — GroupSubmissionModalV2 · l.845, when `!(loading) && isSubmitted && existingSubmission && existingSubmission.grade && existingSubmission.feedback`
- `{uploadedFileName}` — GroupSubmissionModalV2 · l.884, when `!(loading) && uploadingFile && uploadedFileName`
- `{uploadedFileName}` — GroupSubmissionModalV2 · l.896, when `!(loading) && !(uploadingFile) && fileUrl && uploadedFileName`

**Other texts on screen** (18)

- «No hay recursos disponibles actualmente.» — GroupSubmissionModalV2 · l.594, when `!(loading) && assignment.resources && assignment.resources.length > 0 && assignment.resources.filter((resource: any) => normalizeUrl(resource.url)).length === 0`
- «Tú / {member.user?.full_name} / Usuario» — GroupSubmissionModalV2 · l.618, when `!(loading) && groupMembers.length > 0 && each groupMembers`
- «Miembro actual / Líder del grupo / Miembro» — GroupSubmissionModalV2 · l.621, when `!(loading) && groupMembers.length > 0 && each groupMembers`
- «Tú» — GroupSubmissionModalV2 · l.629, when `!(loading) && groupMembers.length > 0 && each groupMembers && isCurrentUser`
- «Sin coincidencias» — GroupSubmissionModalV2 · l.741, when `!isConsultantManaged && !(loadingClassmates) && hasCommunitySection && !(communityPeers.length > 0)`
- «Sin coincidencias» — GroupSubmissionModalV2 · l.754, when `!(loading) && !isConsultantManaged && !(loadingClassmates) && !(schoolPeers.length > 0)`
- «No hay compañeros disponibles para invitar» — GroupSubmissionModalV2 · l.763, when `!(loading) && !isConsultantManaged && !(loadingClassmates) && eligibleClassmates.length === 0`
- «{selectedClassmates.size} seleccionado s» — GroupSubmissionModalV2 · l.770, when `!(loading) && !isConsultantManaged && !(loadingClassmates) && eligibleClassmates.length > 0`
- «Tarea entregada» — GroupSubmissionModalV2 · l.795, when `!(loading) && isSubmitted && existingSubmission`
- «Última entrega: {formattedSubmissionTimestamp}» — GroupSubmissionModalV2 · l.797, when `!(loading) && isSubmitted && existingSubmission && formattedSubmissionTimestamp`
- «Puedes actualizar la entrega y volver a enviarla cuando lo necesites.» — GroupSubmissionModalV2 · l.802, when `!(loading) && isSubmitted && existingSubmission`
- «Edita el campo de comentarios para actualizarla.» — GroupSubmissionModalV2 · l.811, when `!(loading) && isSubmitted && existingSubmission && existingSubmission.content`
- «Comentarios o Notas (opcional)» (label) — GroupSubmissionModalV2 · l.856, when `!(loading)`
- «Archivo Adjunto (opcional para reediciones) / * Solo se permite un archivo» (label) — GroupSubmissionModalV2 · l.869, when `!(loading)`
- «Subiendo archivo...» — GroupSubmissionModalV2 · l.882, when `!(loading) && uploadingFile`
- «Archivo cargado exitosamente» — GroupSubmissionModalV2 · l.894, when `!(loading) && !(uploadingFile) && fileUrl`
- «Arrastra un archivo aquí o haz clic para seleccionar» — GroupSubmissionModalV2 · l.915, when `!(loading) && !(uploadingFile) && !(fileUrl)`
- «PDF, DOC, DOCX, TXT, JPG, PNG (máx. 10MB)» — GroupSubmissionModalV2 · l.934, when `!(loading) && !(uploadingFile) && !(fileUrl)`

**Reads and writes the database directly:** `bucket:assignments` (getPublicUrl, upload), `table:group_assignment_groups` (select), `table:group_assignment_submissions` (select)

### components/courses/CourseThumbnail.tsx

Used by: `/mi-aprendizaje`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{truncateTitle(title)}» | h3 |  | CourseThumbnail · l.88 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {instructorName} · {instructorPhotoUrl} | `instructorName && instructorPhotoUrl` |  | CourseThumbnail · l.103 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getDifficultyLabel()` | «Principiante», «Intermedio», «Avanzado» | getDifficultyLabel · l.44 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Principiante» | CourseThumbnail · l.44 |
| «Intermedio» | CourseThumbnail · l.46 |
| «Avanzado» | CourseThumbnail · l.48 |

**Values shown from data** (3)

- `{instructorName}` — CourseThumbnail · l.92, when `instructorName`
- `{getInitials(instructorName)}` — CourseThumbnail · l.110, when `instructorName && !(instructorPhotoUrl)`
- `{getDifficultyLabel(difficultyLevel)}` — CourseThumbnail · l.123, when `difficultyLevel && getDifficultyLabel(difficultyLevel)`

### components/courses/NetflixCourseCard.tsx

Used by: `/mi-aprendizaje`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 | `!isExpanded` | NetflixCourseCard · l.213 |
| «{course.title}» | h3 | `isExpanded` | NetflixCourseCard · l.255 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{getCTAText()}» | `{handleCTAClick}` | `isExpanded` |  |  | NetflixCourseCard · l.401 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «[Aprobado] [Completado] [{course.title} [{course.instructor.full_name}]] [{course.title} [{course.instructor.full_name}…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | NetflixCourseCard · l.144 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {picture.alt} · {picture.src} | `picture.kind === 'instructor'` |  | NetflixCourseCard · l.164 |
| img · alt {picture.alt} · {picture.src} | `!(picture.kind === 'instructor') && picture.kind === 'thumbnail'` |  | NetflixCourseCard · l.173 |
| img · alt {course.instructor.full_name} · {course.instructor.photo_url} | `isExpanded && course.instructor && course.instructor.photo_url` |  | NetflixCourseCard · l.263 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | NetflixCourseCard · l.45 |
| `isMobile` | NetflixCourseCard · l.59 |
| `isMobile` | NetflixCourseCard · l.67 |
| `!isMobile` | NetflixCourseCard · l.76 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CourseThumbnail` |  | `!(picture.kind === 'instructor') && !(picture.kind === 'thumbnail')` |  | NetflixCourseCard · l.181 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | NetflixCourseCard · l.39 |
| listener | `document.addEventListener('mousedown')` | NetflixCourseCard · l.53 |

**Values shown from data** (5)

- `{course.instructor.full_name}` — NetflixCourseCard · l.217, when `!isExpanded && course.instructor`
- `{course.instructor.full_name}` — NetflixCourseCard · l.273, when `isExpanded && course.instructor`
- `{enrollment.progress_percentage} %` — NetflixCourseCard · l.315, when `isExpanded && showsLessons(enrollment)`
- `{course.description}` — NetflixCourseCard · l.370, when `isExpanded && course.description`
- `{objective}` — NetflixCourseCard · l.384, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0 && each objectivesPreview(course.learning_objectives).sho…`

**Other texts on screen** (10)

- «Aprobado» — NetflixCourseCard · l.197, when `enrollment?.completion_status === 'aprobado'`
- «Completado» — NetflixCourseCard · l.205, when `enrollment?.completion_status === 'completado'`
- «lecciones» — NetflixCourseCard · l.303, when `isExpanded && showsLessons(enrollment)`
- «{enrollment.lessons_completed} de {enrollment.total_lessons} lecciones» — NetflixCourseCard · l.312, when `isExpanded && showsLessons(enrollment)`
- «Tareas: {enrollment.assignments_submitted} / {enrollment.assignments_total}» — NetflixCourseCard · l.344, when `isExpanded && showsAssignments(enrollment)`
- «Curso Aprobado» — NetflixCourseCard · l.353, when `isExpanded && enrollment?.completion_status === 'aprobado'`
- «Has completado todas las lecciones y tareas.» — NetflixCourseCard · l.356, when `isExpanded && enrollment?.completion_status === 'aprobado'`
- «Completa tus tareas pendientes para obtener la insignia.» — NetflixCourseCard · l.364, when `isExpanded && enrollment?.completion_status === 'completado'`
- «Objetivos de aprendizaje» — NetflixCourseCard · l.380, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0`
- «+ {objectivesPreview(course.learning_o…} más...» — NetflixCourseCard · l.392, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0 && objectivesPreview(course.learning_objectives).more > 0`

### components/courses/NetflixCourseRow.tsx

Used by: `/mi-aprendizaje`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h2 | `!courses \|\| courses.length === 0` | NetflixCourseRow · l.69 |
| «{title}» | h2 |  | NetflixCourseRow · l.88 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronLeft]» · aria «Desplazar izquierda» | `{() => handleScroll('left')}` |  |  |  | NetflixCourseRow · l.95 |
| «[icon ChevronRight]» · aria «Desplazar derecha» | `{() => handleScroll('right')}` |  |  |  | NetflixCourseRow · l.152 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `section` | `onMouseEnter={() => setIsHovering(true)} · onMouseLeave={() => setIsHovering(false)}` |  | NetflixCourseRow · l.82 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!container` | NetflixCourseRow · l.26 |
| `!container` | NetflixCourseRow · l.52 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NetflixCourseCard` |  | `each courses` |  | NetflixCourseRow · l.122 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| listener | `container.addEventListener('scroll')` | NetflixCourseRow · l.38 |
| listener | `window.addEventListener('resize')` | NetflixCourseRow · l.39 |
| scroll | `container.scrollTo()` | NetflixCourseRow · l.59 |

**Values shown from data** (1)

- `{emptyMessage}` — NetflixCourseRow · l.74, when `!courses \|\| courses.length === 0`

### components/courses/courseCardText.ts

Used by: `/mi-aprendizaje`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `getCTAText()` | «Ver Detalles», «Repasar», «Continuar», «Comenzar» | getCTAText · l.13 |
| `getDifficultyLabel()` | «Principiante», «Intermedio», «Avanzado» | getDifficultyLabel · l.24 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Ver Detalles» | getCTAText · l.13 |
| «Repasar» | getCTAText · l.14 |
| «Continuar» | getCTAText · l.15 |
| «Comenzar» | getCTAText · l.17 |
| «Principiante» | getDifficultyLabel · l.24 |
| «Intermedio» | getDifficultyLabel · l.26 |
| «Avanzado» | getDifficultyLabel · l.28 |

### components/layout/FunctionalPageHeader.tsx

Used by: `/mi-aprendizaje`, `/mi-aprendizaje/tareas`, `/student/course/[courseId]`, `/student/lesson/[lessonId]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h1 |  | FunctionalPageHeader · l.47 |
| «{title}» | h1 |  | MobileFunctionalPageHeader · l.122 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[{primaryAction.icon}] {primaryAction.label}» | `{primaryAction.onClick}` | `primaryAction` |  |  | FunctionalPageHeader · l.75 |
| «[{primaryAction.icon}] {primaryAction.label} +» | `{primaryAction.onClick}` | `primaryAction` |  |  | MobileFunctionalPageHeader · l.128 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `onSearchChange` |  | FunctionalPageHeader · l.60 |
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `onSearchChange` |  | MobileFunctionalPageHeader · l.147 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Buscar...» | FunctionalPageHeader · l.32 |

**Values shown from data** (5)

- `{icon}` — FunctionalPageHeader · l.44
- `{subtitle}` — FunctionalPageHeader · l.92, when `subtitle`
- `{icon}` — MobileFunctionalPageHeader · l.119
- `{children}` — MobileFunctionalPageHeader · l.159, when `children`
- `{subtitle}` — MobileFunctionalPageHeader · l.168, when `subtitle`

### components/learning-paths/EnhancedProgressIndicators.tsx

Used by: `/mi-aprendizaje/ruta/[id]`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Tu Progreso Inteligente» | h3 |  | EnhancedProgressIndicators · l.66 |
| «Logros y Hitos» | h3 |  | EnhancedProgressIndicators · l.130 |
| «Patrón de Estudio» | h3 |  | EnhancedProgressIndicators · l.185 |
| «Estadísticas Motivacionales» | h3 |  | EnhancedProgressIndicators · l.227 |
| «Comparación con Otros Estudiantes» | h3 | `insights.peerComparison && pathBenchmarks` | EnhancedProgressIndicators · l.285 |
| «Recomendaciones Personalizadas» | h3 | `insights.recommendations.length > 0` | EnhancedProgressIndicators · l.324 |
| «{rec.title}» | h4 | `insights.recommendations.length > 0 && each insights.recommendations.slice(0, 3)` | EnhancedProgressIndicators · l.351 |

**Values shown from data** (17)

- `{insights.paceAnalysis.message}` — EnhancedProgressIndicators · l.85
- `{insights.paceAnalysis.expectedProgr…} %` — EnhancedProgressIndicators · l.92, when `insights.paceAnalysis.status !== 'insufficient_data'`
- `{insights.timeForecasting.message}` — EnhancedProgressIndicators · l.120, when `!(insights.timeForecasting.estimatedDaysRemaining)`
- `{milestone.icon}` — EnhancedProgressIndicators · l.145, when `each insights.milestones.milestones`
- `{milestone.title}` — EnhancedProgressIndicators · l.146, when `each insights.milestones.milestones`
- `{milestone.threshold} %` — EnhancedProgressIndicators · l.149, when `each insights.milestones.milestones`
- `{userProgress.overallProgress} % / {insights.milestones.nextMilestone.t…} %` — EnhancedProgressIndicators · l.168, when `insights.milestones.nextMilestone`
- `{insights.sessionPattern.preferredDay}` — EnhancedProgressIndicators · l.206, when `insights.sessionPattern.preferredDay`
- `{insights.sessionPattern.totalSessio…}` — EnhancedProgressIndicators · l.214
- `{insights.sessionPattern.message}` — EnhancedProgressIndicators · l.219
- `{insights.motivationalMetrics.booksE…}` — EnhancedProgressIndicators · l.243
- `{insights.motivationalMetrics.coffee…}` — EnhancedProgressIndicators · l.251
- `{insights.peerComparison.totalPeers}` — EnhancedProgressIndicators · l.292, when `insights.peerComparison && pathBenchmarks`
- `{insights.peerComparison.pathAvgComp…} %` — EnhancedProgressIndicators · l.299, when `insights.peerComparison && pathBenchmarks`
- `{insights.peerComparison.completedPe…}` — EnhancedProgressIndicators · l.306, when `insights.peerComparison && pathBenchmarks`
- `{insights.peerComparison.message}` — EnhancedProgressIndicators · l.314, when `insights.peerComparison && pathBenchmarks`
- `{rec.message}` — EnhancedProgressIndicators · l.358, when `insights.recommendations.length > 0 && each insights.recommendations.slice(0, 3)`

**Other texts on screen** (23)

- «Sin actividad en 14 días» — EnhancedProgressIndicators · l.73, when `userProgress.isAtRisk === true`
- «Ritmo de Aprendizaje» — EnhancedProgressIndicators · l.83
- «Progreso esperado» — EnhancedProgressIndicators · l.91, when `insights.paceAnalysis.status !== 'insufficient_data'`
- «Predicción» — EnhancedProgressIndicators · l.108
- «{insights.timeForecasting.estimatedD…} días restantes» — EnhancedProgressIndicators · l.112, when `insights.timeForecasting.estimatedDaysRemaining`
- «Finalización: {new Date(insights.timeForecasting.e…}» — EnhancedProgressIndicators · l.115, when `insights.timeForecasting.estimatedDaysRemaining`
- «Próximo hito: {insights.milestones.nextMilestone.t…}» — EnhancedProgressIndicators · l.161, when `insights.milestones.nextMilestone`
- «Progreso actual» — EnhancedProgressIndicators · l.167, when `insights.milestones.nextMilestone`
- «Consistencia» — EnhancedProgressIndicators · l.192
- «Excelente / Buena / Calculando... / Irregular» — EnhancedProgressIndicators · l.193
- «Día preferido» — EnhancedProgressIndicators · l.205, when `insights.sessionPattern.preferredDay`
- «Sesiones recientes» — EnhancedProgressIndicators · l.213
- «{insights.motivationalMetrics.totalT…} h» — EnhancedProgressIndicators · l.235
- «Tiempo total» — EnhancedProgressIndicators · l.238
- «Libros equivalentes» — EnhancedProgressIndicators · l.246
- «Pausas de café» — EnhancedProgressIndicators · l.254
- «{Math.round(insights.motivationalMet…} min» — EnhancedProgressIndicators · l.259
- «Sesión más larga» — EnhancedProgressIndicators · l.262
- «¡Racha de {userProgress.completionStreak} días!» — EnhancedProgressIndicators · l.270, when `userProgress.completionStreak > 0`
- «¡Mantén el impulso para seguir creciendo!» — EnhancedProgressIndicators · l.275, when `userProgress.completionStreak > 0`
- «Estudiantes totales» — EnhancedProgressIndicators · l.295, when `insights.peerComparison && pathBenchmarks`
- «Promedio de finalización» — EnhancedProgressIndicators · l.302, when `insights.peerComparison && pathBenchmarks`
- «Han completado la ruta» — EnhancedProgressIndicators · l.309, when `insights.peerComparison && pathBenchmarks`

### components/learning-paths/LearningPathCard.tsx

Used by: `/mi-aprendizaje`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{name}» | h3 |  | LearningPathCard · l.101 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Nivel {routeLevel(totalCourses)} [Completado] {name} [{description}] Progreso {routePercent(progressPercentage)} % {com…» | `{onClick}` |  | LearningPathCard · l.62 |

**Values shown from data** (4)

- `{description}` — LearningPathCard · l.107, when `description`
- `{routePercent(progressPercentage)} %` — LearningPathCard · l.123
- `{timeSinceAssigned(assigned_at)}` — LearningPathCard · l.155
- `{routeActionText(isStarted)}` — LearningPathCard · l.172, when `!isCompleted`

**Other texts on screen** (4)

- «Nivel {routeLevel(totalCourses)}» — LearningPathCard · l.82
- «Completado» — LearningPathCard · l.95, when `isCompleted`
- «Progreso» — LearningPathCard · l.121
- «{completedCourses} de {totalCourses} cursos» — LearningPathCard · l.151

### components/learning-paths/routeCardText.ts

Used by: `/mi-aprendizaje`

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Continuar aprendiendo» | routeActionText · l.34 |
| «Comenzar ruta» | routeActionText · l.34 |

### components/quiz/LearningQuizTaker.tsx

Used by: `/student/lesson/[lessonId]`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{question.question}» | h3 |  | renderQuestion · l.209 |
| «Revisa tus respuestas» | h3 | `attemptStage === 'tier1-feedback'` | renderFeedback · l.290 |
| «Preguntas marcadas para revisión» | h3 | `attemptStage === 'tier2-feedback'` | renderFeedback · l.316 |
| «¡Felicitaciones!» | h2 |  | renderCompleted · l.369 |
| «Detalle por pregunta» | h3 |  | renderCompleted · l.387 |
| «{quiz.title}» | h2 |  | LearningQuizTaker · l.453 |
| «Descripción» | h3 | `quiz.description` | LearningQuizTaker · l.469 |
| «Instrucciones» | h3 | `quiz.instructions` | LearningQuizTaker · l.481 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Revisar respuestas» | `{handleRetry}` | `attemptStage === 'tier1-feedback'` |  |  | renderFeedback · l.297 |
| «Intentar de nuevo» | `{handleRetry}` | `attemptStage === 'tier2-feedback'` |  |  | renderFeedback · l.324 |
| «Enviar como está» | `{handleSubmit}` | `attemptStage === 'tier2-feedback'` |  |  | renderFeedback · l.331 |
| «Continuar con la lección» | `{() => window.location.reload()}` |  |  |  | renderCompleted · l.432 |
| «Anterior» | `{handlePrevious}` |  | `{currentQuestionIndex === 0}` |  | LearningQuizTaker · l.500 |
| «{index + 1}» | `{() => setCurrentQuestionIndex(index)}` | `each questions` |  |  | LearningQuizTaker · l.510 |
| «Enviando... / Enviar Quiz» | `{handleSubmit}` | `isLastQuestion` | `{isSubmitting \|\| attemptStage !== 'answering'}` |  | LearningQuizTaker · l.529 |
| «Siguiente» | `{handleNext}` | `!(isLastQuestion)` |  |  | LearningQuizTaker · l.544 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Escribe tu respuesta aquí...» | textarea | «Escribe tu respuesta aquí...» · disabled: `{false}` · `maxLength={question.characterLimit \|\| 5000}` |  | `question.type === 'open-ended'` |  | renderQuestion · l.223 |
| «{option.text}» | radio | `{'question-${question.id}'}` · disabled: `{attemptStage !== 'answering'}` |  | `!(question.type === 'open-ended') && each options` · hidden by its class (`sr-only`); another control opens it or it is for screen readers |  | renderQuestion · l.252 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor responde todas las preguntas. Faltan {unansweredQuestions.length} preguntas.» | `unansweredQuestions.length > 0` | handleSubmit · l.119 |
| success | «¡Quiz completado! Las preguntas abiertas serán revisadas por tu profesor.» | `openEndedQuestions.length > 0` | handleSubmit · l.173 |
| success | «¡Excelente! Has completado el quiz correctamente.» | `!(openEndedQuestions.length > 0)` | handleSubmit · l.175 |
| error | «Error al enviar el quiz. Por favor intenta de nuevo.» |  | handleSubmit · l.179 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, 1000)` | LearningQuizTaker · l.54 |

**Values shown from data** (9)

- `{currentQuestionIndex + 1}` — renderQuestion · l.205
- `{index + 1} . {result.question.question}` — renderCompleted · l.404, when `each questionResults`
- `{result.correctAnswer}` — renderCompleted · l.412, when `each questionResults && result.isCorrect === false && result.correctAnswer`
- `{result.question.explanation}` — renderCompleted · l.421, when `each questionResults && result.question.explanation && result.isCorrect !== null`
- `{Math.floor(timeSpent / 60)} : {(timeSpent % 60).toString().padStar…}` — LearningQuizTaker · l.460
- `{quiz.description}` — LearningQuizTaker · l.470, when `quiz.description`
- `{quiz.instructions}` — LearningQuizTaker · l.482, when `quiz.instructions`
- `{renderFeedback()}` — LearningQuizTaker · l.489
- `{renderQuestion(currentQuestion)}` — LearningQuizTaker · l.494

**Other texts on screen** (12)

- «Por favor revisa esta pregunta» — renderQuestion · l.215, when `showError`
- «{answer?.text?.length} / {question.characterLimit} caracteres» — renderQuestion · l.234, when `question.type === 'open-ended' && question.characterLimit`
- «{option.text}» (label) — renderQuestion · l.242, when `!(question.type === 'open-ended') && each options`
- «Algunas respuestas necesitan revisión. Te recomendamos revisar el material de la lección y volver a intentar las preguntas. El aprendizaje es un proceso, ¡sigue adelante!» — renderFeedback · l.294, when `attemptStage === 'tier1-feedback'`
- «Hemos marcado las preguntas que necesitan más atención. Tómate tu tiempo para revisar estas preguntas específicas. Puedes continuar cuando estés listo.» — renderFeedback · l.320, when `attemptStage === 'tier2-feedback'`
- «Has completado el quiz exitosamente.» — renderCompleted · l.373
- «Las preguntas abiertas serán revisadas por tu profesor. Recibirás retroalimentación pronto.» — renderCompleted · l.378, when `openEndedQuestions.length > 0`
- «Tu respuesta:» — renderCompleted · l.408, when `each questionResults`
- «{result.studentAnswer} / (sin respuesta)» — renderCompleted · l.408, when `each questionResults`
- «Respuesta correcta:» — renderCompleted · l.412, when `each questionResults && result.isCorrect === false && result.correctAnswer`
- «Pendiente de revisión por el profesor» — renderCompleted · l.417, when `each questionResults && result.isCorrect === null`
- «Pregunta {currentQuestionIndex + 1} de {questions.length}» — LearningQuizTaker · l.454

### components/student/LessonSidebar.tsx

Used by: `/student/lesson/[lessonId]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{courseTitle}» | h2 |  | LessonSidebar · l.144 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «M {module.order_number} : {module.title} {module.lessons.filter(l => getLesso…} / {module.lessons.length}» | `{() => toggleModule(module.id)}` | `!(structureType === 'simple') && each modules` |  |  | LessonSidebar · l.162 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{lesson.order_number} . {lesson.title}» | `/student/lesson/[*]` |  |  | renderLessonItem · l.88 |
| «← Volver al curso» | `/student/course/[*]` |  |  | LessonSidebar · l.138 |

**Values shown from data** (3)

- `{directLessons.map(lesson => renderL…}` — LessonSidebar · l.153, when `structureType === 'simple'`
- `{module.lessons.map(lesson => render…}` — LessonSidebar · l.181, when `!(structureType === 'simple') && each modules && expandedModules[module.id]`
- `{(() => { const allLessons = structu…}` — LessonSidebar · l.208

**Other texts on screen** (1)

- «Progreso del curso» — LessonSidebar · l.193

### components/student/StudentBlockRenderer.tsx

Used by: `/student/lesson/[lessonId]`

**Titles** (14)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{block.payload?.title} / Video de la lección» | h3 |  | renderVideoBlock · l.237 |
| «{block.payload?.title} / Galería de Imágenes [( {currentImageIndex + 1} de {allImages.length} )]» | h3 |  | renderImageBlock · l.383 |
| «{block.payload?.title} / Quiz Interactivo» | h3 | `!lessonId \|\| !courseId \|\| !studentId` | renderQuizBlock · l.519 |
| «{block.payload?.title} / Quiz Interactivo» | h3 | `!Array.isArray(quizQuestions) \|\| quizQuestions.length === 0` | renderQuizBlock · l.538 |
| «{block.payload?.title} / Quiz Interactivo - Completado» | h3 | `isCompleted` | renderQuizBlock · l.564 |
| «{title}» | h3 |  | renderExternalLinkBlock · l.611 |
| «{link.title} / Enlace» | h4 | `links.length > 0 && each links` | renderExternalLinkBlock · l.646 |
| «Bloque {block.type}» | h3 |  | renderDefaultBlock · l.713 |
| «{title}» | h3 |  | renderDownloadBlock · l.794 |
| «Tarea Grupal: {title} / Tarea Grupal» | h3 |  | renderGroupAssignmentBlock · l.869 |
| «Instrucciones:» | h4 | `instructions` | renderGroupAssignmentBlock · l.879 |
| «{title}» | h2 |  | renderBibliographyBlock · l.991 |
| «{group.category}» | h3 | `each groupedItems && group.category` | renderBibliographyBlock · l.1000 |
| «{item.title} / Sin título» | h4 | `each groupedItems && each group.items` | renderBibliographyBlock · l.1033 |

**Buttons** (15)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Continuar (Admin) / Continuar» | `{() => onComplete({ timeSpent, hasRead: isAdmin \|\| hasRead })}` | `!isCompleted` | `{!isAdmin && !hasRead}` |  | renderTextBlock · l.162 |
| «Marcar como visto» | `{() => setVideoWatched(true)}` | `videoUrl && videoUrl !== '' && isEmbedVideo && !isAdmin && !videoWatched` |  |  | renderVideoBlock · l.291 |
| «Continuar (Admin) / Video Completado - Continuar» | `{() => onComplete({ videoProgress, watchedComplete: isAdmin \|\| videoWatched, tim…}` | `!isCompleted && (videoWatched \|\| isAdmin)` |  |  | renderVideoBlock · l.325 |
|  | `{prevImage}` | `allImages.length > 0 && allImages.length > 1` |  |  | renderImageBlock · l.406 |
|  | `{nextImage}` | `allImages.length > 0 && allImages.length > 1` |  |  | renderImageBlock · l.414 |
|  | `{() => goToImage(index)}` | `allImages.length > 0 && allImages.length > 1 && each allImages` |  |  | renderImageBlock · l.440 |
|  | `{() => goToImage(index)}` | `allImages.length > 0 && allImages.length > 1 && each allImages` |  |  | renderImageBlock · l.465 |
| «Continuar (Admin) / He revisado las imágenes - Continuar / He revisado esta imagen - Continuar» | `{() => onComplete({ hasViewed: true, timeSpent, totalImages: allImages.length, c…}` | `!isCompleted && (hasViewed \|\| isAdmin)` |  |  | renderImageBlock · l.487 |
| «Continuar» | `{() => onComplete()}` | `(!Array.isArray(quizQuestions) \|\| quizQuestions.length === 0) && !isCompleted` |  |  | renderQuizBlock · l.545 |
| «Continuar (Admin) / He visitado los enlaces - Continuar» | `{() => onComplete({ hasVisited: true, timeSpent })}` | `!isCompleted && (hasVisited \|\| isAdmin)` |  |  | renderExternalLinkBlock · l.685 |
| «Marcar como completado» | `{() => onComplete({ timeSpent })}` | `!isCompleted` |  |  | renderDefaultBlock · l.721 |
| «Descargando... / Descargar» | `{() => handleDownload(file)}` | `files.length > 0 && each files` | `{downloadingFile === (file.id \|\| file.url)}` |  | renderDownloadBlock · l.812 |
| «Continuar (Admin) / Marcar como Completado» | `{() => onComplete({ filesAccessed: files.length > 0, timeSpent })}` | `!isCompleted` |  |  | renderDownloadBlock · l.832 |
| «Entendido - Continuar con la lección» | `{() => onComplete({ acknowledged: true, timeSpent })}` | `!isCompleted` |  |  | renderGroupAssignmentBlock · l.927 |
| «He revisado los recursos - Continuar» | `{() => onComplete({ timeSpent, resourcesViewed: items.length })}` | `!isCompleted` |  |  | renderBibliographyBlock · l.1140 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Visitar enlace» | `{link.url}` (new tab) | `links.length > 0 && each links && isExternalUrl(link.url)` |  | renderExternalLinkBlock · l.656 |
| «{item.title} / Sin título [[{item.author}] [•] [{item.year}]] [{item.description}] [📎 {(() => { // Use filename if availab…} [• {(item.filesize / 1024 / 102…} MB]] PDF Descargar / Imagen / Enlace» | `{item.url}` (new tab) | `each groupedItems && each group.items` |  | renderBibliographyBlock · l.1008 |
| «Descargar» · tooltip «Descargar PDF» | `{item.url}` | `each groupedItems && each group.items && item.type === 'pdf'` |  | renderBibliographyBlock · l.1103 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «He leído este contenido» | checkbox |  |  | `!isCompleted && !isAdmin` |  | renderTextBlock · l.152 |

**Embedded media** (7)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {block.payload?.title \|\| 'Video de la lección'} · {embedUrl} | `videoUrl && videoUrl !== '' && isEmbedVideo` |  | renderVideoBlock · l.246 |
| video · {videoUrl} | `videoUrl && videoUrl !== '' && !(isEmbedVideo)` |  | renderVideoBlock · l.265 |
| img · alt {allImages[currentImageIndex].alt \|\| `Imagen ${currentImageIndex + 1}`} · {allImages[currentImageIndex].src} | `allImages.length > 0` |  | renderImageBlock · l.396 |
| img · alt {image.alt \|\| `Miniatura ${index + 1}`} · {image.src} | `allImages.length > 0 && allImages.length > 1 && each allImages` |  | renderImageBlock · l.449 |
| iframe · Vista previa del enlace · {link.url} | `links.length > 0 && each links && isSafeForIframe(link.url)` |  | renderExternalLinkBlock · l.623 |
| Image | `each groupedItems && each group.items && !(item.type === 'pdf') && item.type === 'image'` |  | renderBibliographyBlock · l.1027 |
| img · alt {item.title \|\| 'Imagen de bibliografía'} · {item.url} | `each groupedItems && each group.items && item.type === 'image' && item.url` |  | renderBibliographyBlock · l.1081 |

**Downloads and printing** (3)

| How | When | Where |
|---|---|---|
| `window.URL.createObjectURL()` |  | handleDownload · l.770 |
| `archivo: {filename}` |  | handleDownload · l.774 |
| `<a download> Descargar` | `each groupedItems && each group.items && item.type === 'pdf'` | renderBibliographyBlock · l.1103 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `{file.url}` | `window.open` | `!session?.access_token` | handleDownload · l.747 |
| `{file.url}` | `window.open` | `!response.ok` | handleDownload · l.764 |
| `{file.url}` | `window.open` |  | handleDownload · l.785 |
| `{item.url}` | `window.open` | `each groupedItems && each group.items && item.type === 'pdf' && item.url` | renderBibliographyBlock · l.1018 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `LearningQuizTaker` |  |  |  | renderQuizBlock · l.585 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `renderBibliographyBlock()` | «Archivo cargado» | renderBibliographyBlock · l.1071 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Enlaces Externos» | StudentBlockRenderer · l.605 |
| «Archivos para descargar» | StudentBlockRenderer · l.735 |
| «Bearer {session.access_token}» | StudentBlockRenderer · l.757 |
| «Bibliografía & Recursos» | StudentBlockRenderer · l.947 |
| «Sin categoría» | StudentBlockRenderer · l.977 |
| «Archivo cargado» | StudentBlockRenderer · l.1069 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, 1000)` | StudentBlockRenderer · l.113 |

**Values shown from data** (10)

- `{Math.round(videoProgress)} %` — renderVideoBlock · l.306, when `videoUrl && videoUrl !== '' && !(isEmbedVideo)`
- `{allImages[currentImageIndex].caption}` — renderImageBlock · l.429, when `allImages.length > 0 && allImages[currentImageIndex].caption`
- `{description}` — renderExternalLinkBlock · l.613, when `description`
- `{link.description}` — renderExternalLinkBlock · l.648, when `links.length > 0 && each links && link.description`
- `{link.url}` — renderExternalLinkBlock · l.652, when `links.length > 0 && each links`
- `{JSON.stringify(block.payload, null,…}` — renderDefaultBlock · l.715
- `{description}` — renderDownloadBlock · l.796, when `description`
- `{description}` — renderGroupAssignmentBlock · l.874, when `description`
- `{instructions}` — renderGroupAssignmentBlock · l.880, when `instructions`
- `{description}` — renderBibliographyBlock · l.993, when `description`

**Other texts on screen** (39)

- «He leído este contenido» (label) — renderTextBlock · l.151, when `!isCompleted && !isAdmin`
- «Contenido leído» — renderTextBlock · l.180, when `isCompleted`
- «Tu navegador no soporta el elemento de video.» — renderVideoBlock · l.274, when `videoUrl && videoUrl !== '' && !(isEmbedVideo)`
- «Video marcado como completado / Confirma cuando hayas visto todo el video» — renderVideoBlock · l.286, when `videoUrl && videoUrl !== '' && isEmbedVideo && !isAdmin`
- «Progreso del video» — renderVideoBlock · l.305, when `videoUrl && videoUrl !== '' && !(isEmbedVideo)`
- «No hay URL de video configurada» — renderVideoBlock · l.319, when `!(videoUrl && videoUrl !== '')`
- «Instrucción:» — renderVideoBlock · l.341, when `!isCompleted && !videoWatched && !isAdmin`
- «Debes ver el video completo para continuar con la siguiente parte de la lección.» — renderVideoBlock · l.341, when `!isCompleted && !videoWatched && !isAdmin`
- «Video completado» — renderVideoBlock · l.349, when `isCompleted`
- «No hay imágenes configuradas» — renderImageBlock · l.481, when `!(allImages.length > 0)`
- «Galería revisada / Imagen revisada» — renderImageBlock · l.504, when `isCompleted`
- «El sistema de quiz está siendo actualizado. Por favor, contacta a tu profesor si necesitas completar este quiz.» — renderQuizBlock · l.523, when `!lessonId \|\| !courseId \|\| !studentId`
- «Este quiz aún no tiene preguntas. Por favor, contacta a tu profesor.» — renderQuizBlock · l.542, when `!Array.isArray(quizQuestions) \|\| quizQuestions.length === 0`
- «¡Has completado este quiz exitosamente!» — renderQuizBlock · l.568, when `isCompleted`
- «Puntos totales del quiz: {block.payload.totalPoints}» — renderQuizBlock · l.571, when `isCompleted && block.payload?.totalPoints`
- «Puedes continuar con el siguiente contenido de la lección.» — renderQuizBlock · l.576, when `isCompleted`
- «Vista previa no disponible para este enlace.» — renderExternalLinkBlock · l.635, when `links.length > 0 && each links && !(isSafeForIframe(link.url))`
- «Haz clic en &quot;Visitar enlace&quot; para ver el contenido.» — renderExternalLinkBlock · l.638, when `links.length > 0 && each links && !(isSafeForIframe(link.url))`
- «Enlace no válido» — renderExternalLinkBlock · l.669, when `links.length > 0 && each links && !(isExternalUrl(link.url))`
- «No hay enlaces disponibles» — renderExternalLinkBlock · l.679, when `!(links.length > 0)`
- «Enlaces visitados» — renderExternalLinkBlock · l.697, when `isCompleted`
- «Tipo de bloque no implementado en vista de estudiante» — renderDefaultBlock · l.714
- «{file.name} / {file.originalName} / Archivo» — renderDownloadBlock · l.806, when `files.length > 0 && each files`
- «{(file.size / 1024 / 1024).t…} MB • {file.type}» — renderDownloadBlock · l.807, when `files.length > 0 && each files`
- «No hay archivos disponibles para descargar» — renderDownloadBlock · l.826, when `!(files.length > 0)`
- «Archivos revisados» — renderDownloadBlock · l.847, when `isCompleted`
- «Esta es una tarea grupal que debes completar con tu equipo.» — renderGroupAssignmentBlock · l.891
- «Para trabajar en esta tarea, dirígete a tu» — renderGroupAssignmentBlock · l.894
- «Espacio Colaborativo» — renderGroupAssignmentBlock · l.894
- «donde encontrarás:» — renderGroupAssignmentBlock · l.894
- «Los detalles completos de la tarea» — renderGroupAssignmentBlock · l.899
- «Tu grupo asignado y compañeros de equipo» — renderGroupAssignmentBlock · l.903
- «El espacio de discusión grupal» — renderGroupAssignmentBlock · l.907
- «La opción para entregar el trabajo» — renderGroupAssignmentBlock · l.911
- «Nota:» — renderGroupAssignmentBlock · l.919
- «Completar esta tarea grupal no es requisito para continuar con la siguiente lección. Sin embargo, es importante realizarla para tu aprendizaje y evaluación del curso.» — renderGroupAssignmentBlock · l.919
- «Información de tarea grupal revisada» — renderGroupAssignmentBlock · l.939, when `isCompleted`
- «No hay recursos disponibles» — renderBibliographyBlock · l.1135, when `items.length === 0`
- «Recursos bibliográficos revisados» — renderBibliographyBlock · l.1152, when `isCompleted`

### components/tutorials/HelpButton.tsx

Used by: `/mi-aprendizaje`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon HelpCircle]» · aria «Ayuda y tutoriales» | `{() => setOpen(true)}` |  |  |  | HelpButton · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `HelpDrawer` | component | `{open}` |  | HelpButton · l.23 |

### components/tutorials/HelpDrawer.tsx

Used by: `/mi-aprendizaje`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{section.overview.title} ( {section.overview.durationMin} min)» | h3 |  | HelpDrawer · l.32 |
| «Otros videos cortos» | h3 | `section.deepDives.length > 0` | HelpDrawer · l.43 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | HelpDrawer · l.23 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | HelpDrawer · l.24 |
| `DialogHeader` |  |  |  | HelpDrawer · l.25 |
| `DialogTitle` |  |  |  | HelpDrawer · l.26 |
| `DialogDescription` |  |  |  | HelpDrawer · l.27 |
| `VimeoEmbed` |  |  |  | HelpDrawer · l.38 |
| `VimeoEmbed` |  | `section.deepDives.length > 0 && each section.deepDives` |  | HelpDrawer · l.55 |

**Values shown from data** (1)

- `{step}` — HelpDrawer · l.59, when `section.deepDives.length > 0 && each section.deepDives && dive.textSteps && dive.textSteps.length > 0 && each dive.textSteps`

**Other texts on screen** (3)

- «Ayuda — {section.title}» — HelpDrawer · l.26
- «Videos y guías para {section.title.toLowerCase()}» — HelpDrawer · l.27
- «{dive.title} {dive.durationMin} min» (label) — HelpDrawer · l.47, when `section.deepDives.length > 0 && each section.deepDives`

### components/tutorials/VimeoEmbed.tsx

Used by: `/mi-aprendizaje`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {`https://player.vimeo.com/video/${vimeoId}?dnt=1`} |  |  | VimeoEmbed · l.21 |

**Other texts on screen** (1)

- «Video próximamente» — VimeoEmbed · l.13, when `!vimeoId`

### components/ui/button.tsx

Used by: `/mi-aprendizaje/ruta/[id]`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Button» | l.54 |

### components/ui/dialog.tsx

Used by: `/mi-aprendizaje`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### lib/sanitize.ts

Used by: `/student/lesson/[lessonId]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `postProcessLinks()` | «<a {attrs}>» | postProcessLinks · l.234 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(iframe)` | filterUnsafeIframes · l.147 |
| lookup | `querySelectorAll(a)` | postProcessLinks · l.212 |

### lib/services/groupAssignmentsV2.js

Used by: `/mi-aprendizaje/tareas`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Group assignment block not found» | `throw (shown by whoever catches it)` | `!blockRecord` | getGroupAssignment · l.280 |
| «Requested block is not a group assignment» | `throw (shown by whoever catches it)` | `blockRecord.type !== 'group-assignment' && blockRecord.type !== 'group_assignment'` | getGroupAssignment · l.284 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `isAdmin = roles.includes('admin')` | getAllAssignmentsForAdmin · l.493 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Tarea Grupal Sin Título» | GroupAssignmentsV2Service · l.196 |
| «Usuario desconocido» | GroupAssignmentsV2Service · l.403 |
| «Error al enviar el trabajo» | GroupAssignmentsV2Service · l.444 |

**Reads and writes the database directly:** `table:blocks` (select), `table:community_messages` (select), `table:consultant_assignments` (select), `table:course_assignments` (select), `table:course_enrollments` (select), `table:courses` (select), `table:group_assignment_discussions` (select), `table:group_assignment_groups` (select), `table:group_assignment_members` (select), `table:group_assignment_settings` (select), `table:group_assignment_submissions` (select), `table:growth_communities` (select), `table:learning_path_courses` (select), `table:lessons` (select), `table:profiles` (select), `table:user_roles` (select)

### lib/services/learningPathSessionTracker.ts

Used by: `/mi-aprendizaje/ruta/[id]`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to start session: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | startSession · l.74 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, this.config.heartbeatInterval)` | startHeartbeat · l.266 |
| timer | `setTimeout(…, this.config.inactivityThresho…)` | resetInactivityTimer · l.310 |
| timer | `setTimeout(…, limit)` | throttle · l.352 |

### lib/services/quizSubmissions.js

Used by: `/student/lesson/[lessonId]`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | requestPendingReviewNotification · l.26 |

**Reads and writes the database directly:** `rpc:submit_quiz`, `table:quiz_submissions` (select)

### lib/services/userAssignments.ts

Used by: `/mi-aprendizaje/tareas`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Error desconocido» | UserAssignmentsService · l.527 |

**Reads and writes the database directly:** `table:assignment_submission_shares` (insert), `table:course_enrollments` (select), `table:lesson_assignment_submissions` (insert, select, update), `table:lesson_assignments` (select), `table:profiles` (select), `table:user_roles` (select)

### lib/tutorials/content.ts

Used by: `/mi-aprendizaje`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TUTORIALS` | «Mi Aprendizaje», «Cómo encontrar y retomar tus cursos», «Qué significa cada estado: Comenzar / Continuar / Completado», «Mis Sesiones», «Tu día a día en Mis Sesiones», «Las 6 pestañas de una sesión», «Exportar sesiones a tu calendario (iCal)», «Mis Reportes», «Leer tus reportes de sesiones», «Mis Horas», «Revisar tus horas y exportarlas», «Por qué mis horas ejecutadas vs. penalizadas difieren», «Proceso de Cambio», «Cómo completar un Proceso de Cambio de principio a fin», «Entender la jerarquía: Objetivos, Acciones e Indicadores», «Los 5 tipos de indicador», «Cobertura como gate», «Guardado automático, progreso y envío», «Ver tus resultados», «Espacio Colaborativo», «Tu comunidad de crecimiento», «Documentos: subir, carpetas, permisos», «Mensajería: hilos, menciones, adjuntos», «Reuniones: crear acta» | l.23 |

### types/roles.ts

Used by: `/mi-aprendizaje`, `/mi-aprendizaje/tareas`, `/student/course/[courseId]`, `/student/lesson/[lessonId]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `ROLE_NAMES` | «Administrador Global», «Consultor FNE», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Supervisor de Red», «Community Manager», «Docente», «Encargado de Licitacion» | l.305 |
| `ROLE_DESCRIPTIONS` | «Staff de FNE con control total de la plataforma. Pueden pertenecer a comunidades para colaboración.», «Consultores FNE asignados a colegios específicos. Pueden pertenecer a comunidades para colaboración.», «Administradores a nivel de colegio. Pueden pertenecer a comunidades para colaboración.», «Líderes de generaciones Tractor/Innova. Pueden pertenecer a comunidades para colaboración.», «Líderes de Comunidades de Crecimiento (2-16 miembros). Crean automáticamente su propia comunidad.», «Supervisores con acceso limitado a reportes de una red específica de colegios. Pueden inscribirse en cursos como estudiantes.», «Gestores de comunidad con acceso a panel, perfil, aprendizaje, cursos y rendición de gastos.», «Docentes participantes en cursos. Pueden pertenecer a comunidades para colaboración.», «Encargados de procesos de licitacion en establecimientos educacionales. Gestionan el proceso de contratacion de ATEs bajo Ley SEP.» | l.318 |
| `ROLE_ORGANIZATIONAL_REQUIREMENTS` | «Global role - no organizational scope required», «Must be assigned to a specific school», «Must be assigned to a specific school and generation», «Must be assigned to a school (community auto-created)», «Network-level role - no specific school required», «Content management role - no organizational scope required», «Must be assigned to a specific school for procurement management» | l.342 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Unknown role type: {roleType}» | validateRoleAssignment · l.413 |
| «Role "{ROLE_NAMES[roleType]}" requires a school assignment» | validateRoleAssignment · l.421 |
| «Role "{ROLE_NAMES[roleType]}" requires a generation assignment» | validateRoleAssignment · l.429 |
| «Role "{ROLE_NAMES[roleType]}" requires a community assignment» | validateRoleAssignment · l.437 |

### utils/roleUtils.ts

Used by: `/mi-aprendizaje`, `/student/course/[courseId]`, `/student/lesson/[lessonId]`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/my-courses` | `pages/api/my-courses.ts` | GET | `/mi-aprendizaje` | `__tests__/api/forged-session-sweep.test.ts`, `pages/mi-aprendizaje.tsx`, `scripts/seed-qa-phase2-final.js`, `scripts/seed-qa-phase2-retest.js`, `scripts/seed-qa-phase2.js` +1 |

