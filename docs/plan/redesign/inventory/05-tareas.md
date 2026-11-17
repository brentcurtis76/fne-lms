# Tareas y quizzes (assignments, group work, quiz review)

Area `05-tareas`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `9b113df42` (2026-11-17).

9 screen files, 14 API files, 19 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/assignment-overview` | `pages/admin/assignment-overview.tsx` | 619 | Consultorías › Vista de Tareas |  |
| `/admin/assignment-review/[id]` | `pages/admin/assignment-review/[id].tsx` | 607 | — |  |
| `/assignments` | `pages/assignments.tsx` | 360 | — |  |
| `/assignments/[id]` | `pages/assignments/[id]/index.tsx` | 360 | — |  |
| `/assignments/[id]/submissions` | `pages/assignments/[id]/submissions.tsx` | 421 | — |  |
| `/community/workspace/assignments/[id]/discussion` | `pages/community/workspace/assignments/[id]/discussion.tsx` | 405 | — |  |
| `/community/workspace/assignments/[id]/groups` | `pages/community/workspace/assignments/[id]/groups.tsx` | 296 | — |  |
| `/quiz-reviews` | `pages/quiz-reviews.tsx` | 239 | Mi Trabajo › Revisión de Quizzes |  |
| `/quiz-reviews/[id]` | `pages/quiz-reviews/[id].tsx` | 135 | — |  |

## /admin/assignment-overview

File `pages/admin/assignment-overview.tsx` · 619 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Vista de Tareas» → `/admin/assignment-overview` — everyone signed in; the group: admin or consultor (`Sidebar.tsx` l.485)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.113 `router.push → /login  (when !authUser)`
  - l.129 `role = await getUserPrimaryRole(authUser.id)`
  - l.132 `router.push → /dashboard  (when role !== 'admin' && role !== 'consultor')`
  - l.148 `router.push → /login`
  - l.283 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:487`, `lib/notifications/catalog.ts:304`, `middleware.ts:223`, `pages/admin/assignment-review/[id].tsx:348`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 3, consultor 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Filtros» | h2 |  | AssignmentOverview · l.396 |
| «No se encontraron tareas» | h3 | `!(loading) && assignments.length === 0` | AssignmentOverview · l.495 |
| «{assignment.title}» | h3 | `!(loading) && !(assignments.length === 0) && each assignments` | AssignmentOverview · l.512 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar filtros ( {activeFilterCount} )» | `{handleClearFilters}` | `activeFilterCount > 0` |  |  | AssignmentOverview · l.398 |
| «Ver detalles →» | `{() => handleViewDetails(assignment.id)}` | `!(loading) && !(assignments.length === 0) && each assignments` |  |  | AssignmentOverview · l.578 |
| «Cargando... / Cargar más ( {assignments.length} de {totalAssignments} )» | `{handleLoadMore}` | `!(loading) && !(assignments.length === 0) && hasMore` | `{loadingMore}` |  | AssignmentOverview · l.592 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Escuela» | select |  | «Todas las escuelas», «(lista) {school.name}» |  |  | AssignmentOverview · l.414 |
| «Comunidad» | select | disabled: `{loadingCommunities}` | «Todas las comunidades», «(lista) {community.name}» |  |  | AssignmentOverview · l.434 |
| «Generación» | select | disabled: `{!filters.school_id \|\| loadingGenerations \|\| generations.length === 0}` | «Selecciona una escuela primero / Sin generaciones / Todas las generaciones», «(lista) {generation.name}» |  |  | AssignmentOverview · l.459 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a esta página» | `role !== 'admin' && role !== 'consultor'` | checkAuth · l.131 |
| error | «Error al cargar los datos» |  | loadInitialData · l.162 |
| error | «Error al cargar las tareas» |  | loadAssignments · l.220 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No session token» | `throw (shown by whoever catches it)` | `!session?.access_token` | loadAssignments · l.183 |
| «Failed to fetch assignments» | `throw (shown by whoever catches it)` | `!response.ok` | loadAssignments · l.205 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!authUser` | checkAuth · l.113 |
| `/dashboard` | `router.push` | `role !== 'admin' && role !== 'consultor'` | checkAuth · l.132 |
| `/login` | `router.push` |  | checkAuth · l.148 |
| `/login` | `router.push` |  | handleLogout · l.283 |
| `/admin/assignment-review/[*]` | `router.push` |  | handleViewDetails · l.294 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(authUser.id)` | checkAuth · l.129 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Vista de Tareas Grupales |  |  | AssignmentOverview · l.323 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | AssignmentOverview · l.199 |

**Values shown from data** (12)

- `{totalAssignments}` — AssignmentOverview · l.356
- `{totalGroups}` — AssignmentOverview · l.366
- `{totalStudents}` — AssignmentOverview · l.376
- `{overallSubmissionRate} %` — AssignmentOverview · l.386
- `{assignment.course_title} - {assignment.lesson_title}` — AssignmentOverview · l.515, when `!(loading) && !(assignments.length === 0) && each assignments`
- `{assignment.description}` — AssignmentOverview · l.522, when `!(loading) && !(assignments.length === 0) && each assignments && assignment.description`
- `{assignment.community.school.name}` — AssignmentOverview · l.532, when `!(loading) && !(assignments.length === 0) && each assignments && assignment.community`
- `{assignment.community.name}` — AssignmentOverview · l.534, when `!(loading) && !(assignments.length === 0) && each assignments && assignment.community`
- `{assignment.community.generation.name}` — AssignmentOverview · l.538, when `!(assignments.length === 0) && each assignments && assignment.community && assignment.community.generation`
- `{assignment.groups_count}` — AssignmentOverview · l.548, when `!(loading) && !(assignments.length === 0) && each assignments`
- `{assignment.students_count}` — AssignmentOverview · l.552, when `!(loading) && !(assignments.length === 0) && each assignments`
- `{assignment.submission_rate} %` — AssignmentOverview · l.556, when `!(loading) && !(assignments.length === 0) && each assignments`

**Other texts on screen** (15)

- «Monitorea todas las tareas grupales de la plataforma / Monitorea las tareas grupales de tus estudiantes asignados» — AssignmentOverview · l.338
- «Total Tareas» — AssignmentOverview · l.355
- «Grupos Formados» — AssignmentOverview · l.365
- «Estudiantes» — AssignmentOverview · l.375
- «Tasa de Entrega» — AssignmentOverview · l.385
- «Escuela» (label) — AssignmentOverview · l.411
- «Comunidad» (label) — AssignmentOverview · l.431
- «Generación» (label) — AssignmentOverview · l.456
- «No hay tareas que coincidan con los filtros seleccionados. / No hay tareas grupales creadas aún.» — AssignmentOverview · l.496, when `!(loading) && assignments.length === 0`
- «Grupos» — AssignmentOverview · l.549, when `!(loading) && !(assignments.length === 0) && each assignments`
- «Estudiantes» — AssignmentOverview · l.553, when `!(loading) && !(assignments.length === 0) && each assignments`
- «Entregado» — AssignmentOverview · l.557, when `!(loading) && !(assignments.length === 0) && each assignments`
- «Progreso de entregas» — AssignmentOverview · l.564, when `!(loading) && !(assignments.length === 0) && each assignments`
- «{assignment.submitted_count} de {assignment.students_count}» — AssignmentOverview · l.565, when `!(loading) && !(assignments.length === 0) && each assignments`
- «Creada {formatDate(assignment.created_at)}» — AssignmentOverview · l.577, when `!(loading) && !(assignments.length === 0) && each assignments`

**Reads and writes the database directly:** `bucket:avatars` (getPublicUrl), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/assignmentFilters.js`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/assignments/admin-overview` | GET | `pages/admin/assignment-overview.tsx:195` |

## /admin/assignment-review/[id]

File `pages/admin/assignment-review/[id].tsx` · 607 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.73 `router.push → /login  (when !(!authLoading && user && assignmentId) && !authLoading && !user)`
  - l.79 `role = await getUserPrimaryRole(user!.id)`
  - l.82 `router.push → /dashboard  (when role !== 'admin' && role !== 'consultor')`
  - l.89 `router.push → /login`
- Linked from: `pages/admin/assignment-overview.tsx:294`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | sent to /dashboard |
| equipo_directivo | — | sent to /dashboard |
| lider_generacion | — | sent to /dashboard |
| lider_comunidad | — | sent to /dashboard |
| supervisor_de_red | — | sent to /dashboard |
| community_manager | — | sent to /dashboard |
| docente | — | sent to /dashboard |
| encargado_licitacion | — | sent to /dashboard |

### What the page file itself draws

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{assignment.title}» | h1 |  | AssignmentReviewPage · l.356 |
| «Instrucciones:» | h3 |  | AssignmentReviewPage · l.366 |
| «No hay grupos que mostrar» | h3 | `filteredSubmissions.length === 0` | AssignmentReviewPage · l.415 |
| «{submission.group_name}» | h3 | `!(filteredSubmissions.length === 0) && each filteredSubmissions` | AssignmentReviewPage · l.437 |
| «Miembros del grupo:» | h4 | `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id)` | AssignmentReviewPage · l.465 |
| «Contenido de la entrega:» | h4 | `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending'` | AssignmentReviewPage · l.483 |
| «Archivos adjuntos:» | h4 | `each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending' && submission.file_urls.length > 0` | AssignmentReviewPage · l.494 |
| «Calificación y retroalimentación:» | h4 | `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending'` | AssignmentReviewPage · l.514 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Vista de Tareas» | `{() => router.push('/admin/assignment-overview')}` |  |  |  | AssignmentReviewPage · l.347 |
| «Guardar calificación» (submits the form) |  |  |  |  | GradeForm · l.599 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Archivo {index + 1}» | `{url}` (new tab) | `expandedGroups.has(submission.id) && submission.status !== 'pending' && submission.file_urls.length > 0 && each submission.file_urls` |  | AssignmentReviewPage · l.497 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{submission.group_name} {submission.members.length} miembros {getStatusIcon(submission.status)} {getStatusLabel(submiss…» | `{() => toggleGroupExpanded(submission.id)}` | `!(filteredSubmissions.length === 0) && each filteredSubmissions` | AssignmentReviewPage · l.429 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por estado:» | select |  | «Todos los grupos», «Pendientes», «Entregados», «Revisados», «Devueltos» |  |  | AssignmentReviewPage · l.397 |
| «Calificación (0-100)» | number | required · `min=0 max=100` |  |  |  | GradeForm · l.575 |
| «Retroalimentación» | textarea | «Escribe comentarios para el grupo...» |  |  |  | GradeForm · l.590 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | GradeForm · l.570 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a esta página» | `role !== 'admin' && role !== 'consultor'` | checkAuth · l.81 |
| error | «Error al cargar los datos de la tarea» |  | loadAssignmentData · l.245 |
| success | «Calificación guardada exitosamente» |  | handleGradeSubmission · l.276 |
| error | «Error al guardar la calificación» |  | handleGradeSubmission · l.280 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(!authLoading && user && assignmentId) && !authLoading && !user` | AssignmentReviewPage · l.73 |
| `/dashboard` | `router.push` | `role !== 'admin' && role !== 'consultor'` | checkAuth · l.82 |
| `/login` | `router.push` |  | checkAuth · l.89 |
| `/admin/assignment-overview` | `router.push` |  | AssignmentReviewPage · l.348 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(user!.id)` | checkAuth · l.79 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!assignment` | AssignmentReviewPage · l.338 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `authLoading \|\| loading` |  | AssignmentReviewPage · l.330 |
| `MainLayout` |  |  |  | AssignmentReviewPage · l.343 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `assignmentDetails` | «Tarea Grupal» | loadAssignmentData · l.194 |
| `getStatusLabel()` | «Entregado», «Revisado», «Devuelto», «Pendiente» | getStatusLabel · l.318 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin nombre» | AssignmentReviewPage · l.225 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (10)

- `{assignment.course_title} - {assignment.lesson_title}` — AssignmentReviewPage · l.357
- `{assignment.description}` — AssignmentReviewPage · l.362, when `assignment.description`
- `{assignment.instructions}` — AssignmentReviewPage · l.367
- `{assignment.total_groups}` — AssignmentReviewPage · l.373
- `{assignment.submitted_groups}` — AssignmentReviewPage · l.377
- `{assignment.pending_groups}` — AssignmentReviewPage · l.381
- `{assignment.reviewed_groups}` — AssignmentReviewPage · l.385
- `{getStatusLabel(submission.status)}` — AssignmentReviewPage · l.449, when `!(filteredSubmissions.length === 0) && each filteredSubmissions`
- `{member.name}` — AssignmentReviewPage · l.470, when `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id) && each submission.members`
- `{submission.feedback}` — AssignmentReviewPage · l.525, when `expandedGroups.has(submission.id) && submission.status !== 'pending' && submission.status === 'reviewed' && submission.feedback`

**Other texts on screen** (14)

- «Grupos totales» — AssignmentReviewPage · l.374
- «Entregados» — AssignmentReviewPage · l.378
- «Pendientes» — AssignmentReviewPage · l.382
- «Revisados» — AssignmentReviewPage · l.386
- «Filtrar por estado:» (label) — AssignmentReviewPage · l.394
- «No se encontraron grupos con el estado seleccionado.» — AssignmentReviewPage · l.419, when `filteredSubmissions.length === 0`
- «{submission.members.length} miembros» — AssignmentReviewPage · l.440, when `!(filteredSubmissions.length === 0) && each filteredSubmissions`
- «(Líder)» — AssignmentReviewPage · l.472, when `each filteredSubmissions && expandedGroups.has(submission.id) && each submission.members && member.role === 'leader'`
- «{submission.submission_content} / Sin contenido de texto» — AssignmentReviewPage · l.485, when `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending'`
- «Calificado por: {submission.reviewed_by} el {new Date(submission.reviewed_at!).t…}» — AssignmentReviewPage · l.518, when `each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending' && submission.status === 'reviewed'`
- «Nota: {submission.grade} /100» — AssignmentReviewPage · l.521, when `each filteredSubmissions && expandedGroups.has(submission.id) && submission.status !== 'pending' && submission.status === 'reviewed'`
- «Este grupo aún no ha entregado su trabajo» — AssignmentReviewPage · l.541, when `!(filteredSubmissions.length === 0) && each filteredSubmissions && expandedGroups.has(submission.id) && submission.status === 'pending'`
- «Calificación (0-100)» (label) — GradeForm · l.572
- «Retroalimentación» (label) — GradeForm · l.587

**Reads and writes the database directly:** `table:blocks` (select), `table:group_assignment_groups` (select), `table:group_assignment_members` (select), `table:group_assignment_submissions` (select, update), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

## /assignments

File `pages/assignments.tsx` · 360 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.97 `role = await getUserPrimaryRole(session.user.id)`
  - l.115 `router.push → /login  (when !(session) && session === null)`
  - l.138 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:35`, `components/notifications/ModernNotificationCenter.tsx:311`, `components/notifications/ModernNotificationCenter.tsx:322`, `components/notifications/NotificationDropdown.tsx:140`, `components/notifications/NotificationDropdown.tsx:151`, `lib/auth/forced-password-change.ts:133`, `lib/notificationEvents.ts:314`, `lib/notificationEvents.ts:328`, `lib/notificationEvents.ts:345`, `lib/notifications/catalog.ts:279`, `lib/notifications/catalog.ts:288`, `lib/notifications/catalog.ts:290` and 15 more
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/notification-catalog-links.spec.ts`.

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

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Total de Tareas» | h3 | `isTeacher` | AssignmentsPage · l.182 |
| «Activas» | h3 | `isTeacher` | AssignmentsPage · l.186 |
| «Borradores» | h3 | `isTeacher` | AssignmentsPage · l.190 |
| «{assignment.title}» | h4 | `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments` | AssignmentsPage · l.236 |
| «{assignment.title}» | h3 | `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments` | AssignmentsPage · l.274 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Lista» | `{() => setActiveTab('list')}` |  |  |  | AssignmentsPage · l.216 |
| «Cuadrícula» | `{() => setActiveTab('grid')}` |  |  |  | AssignmentsPage · l.217 |
| «Editar» | `{() => router.push('/assignments/${assignment.id}/edit')}` | `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments && isTeacher` |  |  | AssignmentsPage · l.250 |
| «Eliminar» | `{() => handleDeleteAssignment(assignment.id)}` | `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments && isTeacher` |  |  | AssignmentsPage · l.251 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar tareas...» | text | «Buscar tareas...» |  |  |  | AssignmentsPage · l.197 |
|  | select |  | «Todos los tipos», «Tarea», «Cuestionario», «Proyecto» |  |  | AssignmentsPage · l.205 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de que quieres eliminar esta tarea?» |  | handleDeleteAssignment · l.123 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las tareas:» |  | AssignmentsPage · l.78 |
| error | «No se pudo encontrar el perfil del usuario.» | `session && !(profile)` | loadData · l.103 |
| error | «Error al cargar los datos:» | `session` | loadData · l.110 |
| success | «Tarea eliminada con éxito» | `window.confirm('¿Estás seguro de que quieres eliminar esta tarea?')` | handleDeleteAssignment · l.126 |
| error | «Error al eliminar la tarea:» | `window.confirm('¿Estás seguro de que quieres eliminar esta tarea?')` | handleDeleteAssignment · l.131 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(session) && session === null` | loadData · l.115 |
| `/login` | `router.push` |  | handleLogout · l.138 |
| `/assignments/new` | `router.push` | `isTeacher` | AssignmentsPage · l.174 |
| `/assignments/[*]` | `router.push` | `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments` | AssignmentsPage · l.236 |
| `/assignments/[*]/edit` | `router.push` | `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments && isTeacher` | AssignmentsPage · l.250 |
| `/assignments/[*]` | `router.push` | `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments` | AssignmentsPage · l.276 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | loadData · l.97 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!supabase` | AssignmentsPage · l.39 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | AssignmentsPage · l.160 |
| `ResponsiveFunctionalPageHeader` | title: Mis Tareas · subtitle: Bienvenido de vuelta, {profileName} · primaryAction: Nueva Tarea |  |  | AssignmentsPage · l.168 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | AssignmentsPage · l.99 |

**Values shown from data** (6)

- `{workStats.total}` — AssignmentsPage · l.183, when `isTeacher`
- `{workStats.active}` — AssignmentsPage · l.187, when `isTeacher`
- `{workStats.drafts}` — AssignmentsPage · l.191, when `isTeacher`
- `{assignment.courses.title}` — AssignmentsPage · l.237, when `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments`
- `{assignment.courses.title}` — AssignmentsPage · l.284, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments`
- `{member.full_name}` — AssignmentsPage · l.292, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.assignment_type === 'group' && assignment.student_group && isStudent && each assignment.student_group.members`

**Other texts on screen** (14)

- «Cargando...» — AssignmentsPage · l.148, when `loading`
- «Error: {error}» — AssignmentsPage · l.152, when `error`
- «Tareas - FNE» — AssignmentsPage · l.158
- «No se encontraron tareas.» — AssignmentsPage · l.225, when `activeTab === 'list' && filteredAssignments.length === 0`
- «Vence: {new Date(assignment.due_date).toLoc…}» — AssignmentsPage · l.241, when `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Entregado ({submission.status}) / Pendiente» — AssignmentsPage · l.244, when `activeTab === 'list' && !(filteredAssignments.length === 0) && each filteredAssignments`
- «No se encontraron tareas.» — AssignmentsPage · l.264, when `activeTab === 'grid' && filteredAssignments.length === 0`
- «Publicado / Borrador» — AssignmentsPage · l.280, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Trabajo en grupo: {assignment.student_group.name}» — AssignmentsPage · l.289, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.assignment_type === 'group' && assignment.student_group && isStudent`
- «⚠️ No estás asignado a ningún grupo para esta tarea. Contacta a tu profesor.» — AssignmentsPage · l.303, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.assignment_type === 'group' && !assignment.student_group && isStudent`
- «{assignment.points} puntos» — AssignmentsPage · l.310, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Venció: / Vence: {new Date(assignment.due_date).toLoc…}» — AssignmentsPage · l.312, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.due_date`
- «[Enviado: {new Date(submission.submitt…}]» — AssignmentsPage · l.326, when `activeTab === 'grid' && !(filteredAssignments.length === 0) && each filteredAssignments && isStudent && submission`
- «Nota: {submission.score} / {assignment.points}» — AssignmentsPage · l.336, when `!(filteredAssignments.length === 0) && each filteredAssignments && isStudent && submission && submission.score !== null`

**Reads and writes the database directly:** `table:lesson_assignment_submissions` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `hooks/useAvatar.ts`
- `lib/services/assignments.js`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /assignments/[id]

File `pages/assignments/[id]/index.tsx` · 360 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.38 `router.push → /login  (when !session?.user)`
  - l.52 `role = await getUserPrimaryRole(session.user.id)`
  - l.139 `router.push → /login`
- Linked from: `components/assignments/AssignmentCard.tsx:116`, `components/assignments/AssignmentCard.tsx:117`, `middleware.ts:328`, `pages/api/assignments/collaborative-submit.ts:155`, `pages/assignments.tsx:174`, `pages/assignments.tsx:236`, `pages/assignments.tsx:276`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/assessment-frequency-validation.spec.ts`, `tests/e2e/due-reminders.spec.ts`.

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

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Descripción» | h3 | `!isEditing && ((assignment.description \|\| assignment.instructions)) && assignment.description` | AssignmentDetailPage · l.237 |
| «Instrucciones» | h3 | `!isEditing && ((assignment.description \|\| assignment.instructions)) && assignment.instructions` | AssignmentDetailPage · l.243 |
| «Recursos» | h3 | `!isEditing && assignment.resources && assignment.resources.length > 0` | AssignmentDetailPage · l.255 |
| «Tu entrega» | h3 | `!isEditing && submission` | AssignmentDetailPage · l.278 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editar entrega» | `{() => setIsEditing(true)}` | `!isEditing && submission && ((submission.status === 'draft' \|\| submission.status === 'returned'))` |  |  | AssignmentDetailPage · l.322 |
| «Comenzar tarea» | `{() => setIsEditing(true)}` | `!isEditing && !submission && !isEditing` |  |  | AssignmentDetailPage · l.336 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Mis Tareas» | `/assignments` |  |  | AssignmentDetailPage · l.170 |
| «{resource.title}» | `{resource.url}` (new tab) | `!isEditing && assignment.resources && assignment.resources.length > 0 && each assignment.resources` |  | AssignmentDetailPage · l.258 |
| «Archivo {index + 1}» | `{url}` (new tab) | `!isEditing && submission && submission.attachment_urls && submission.attachment_urls.length > 0 && each submission.attachment_urls` |  | AssignmentDetailPage · l.294 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para ver esta página» | `profile && !['lider_comunidad', 'docente'].includes(role)` | checkSessionAndLoadData · l.58 |
| error | «Error al cargar los datos» |  | checkSessionAndLoadData · l.68 |
| error | «Tarea no encontrada» | `!assignmentData \|\| !assignmentData.is_published` | loadAssignmentAndSubmission · l.81 |
| error | «Error al cargar la tarea» |  | loadAssignmentAndSubmission · l.101 |
| success | «Borrador guardado / Tarea enviada exitosamente» |  | handleSubmitAssignment · l.128 |
| error | «Error al enviar la tarea» |  | handleSubmitAssignment · l.133 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSessionAndLoadData · l.38 |
| `/assignments` | `router.push` | `profile && !['lider_comunidad', 'docente'].includes(role)` | checkSessionAndLoadData · l.59 |
| `/assignments` | `router.push` |  | checkSessionAndLoadData · l.69 |
| `/assignments` | `router.push` | `!assignmentData \|\| !assignmentData.is_published` | loadAssignmentAndSubmission · l.82 |
| `/login` | `router.push` |  | handleLogout · l.139 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | checkSessionAndLoadData · l.52 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!id` | AssignmentDetailPage · l.32 |
| `!assignment` | AssignmentDetailPage · l.150 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | AssignmentDetailPage · l.160 |
| `ResponsiveFunctionalPageHeader` | subtitle: {assignmentUtils.getTypeLabe…} - {assignment.course?.title \|\|…} |  |  | AssignmentDetailPage · l.179 |
| `SubmissionForm` |  | `isEditing` |  | AssignmentDetailPage · l.349 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Sin curso» | AssignmentDetailPage · l.182 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (4)

- `{assignment.description}` — AssignmentDetailPage · l.238, when `!isEditing && ((assignment.description \|\| assignment.instructions)) && assignment.description`
- `{assignment.instructions}` — AssignmentDetailPage · l.244, when `!isEditing && ((assignment.description \|\| assignment.instructions)) && assignment.instructions`
- `{submission.content}` — AssignmentDetailPage · l.284, when `!isEditing && submission && submission.content`
- `{submission.feedback}` — AssignmentDetailPage · l.314, when `!isEditing && submission && submission.feedback`

**Other texts on screen** (10)

- «{assignment.title} - Genera» — AssignmentDetailPage · l.157
- «Fecha límite» — AssignmentDetailPage · l.194, when `!isEditing`
- «{assignmentUtils.formatDueDate(assig…} / Sin fecha límite» — AssignmentDetailPage · l.195, when `!isEditing`
- «Puntos» — AssignmentDetailPage · l.206, when `!isEditing`
- «{assignment.points} puntos» — AssignmentDetailPage · l.207, when `!isEditing`
- «Estado» — AssignmentDetailPage · l.218, when `!isEditing`
- «Sin entregar / Borrador / Enviado / Calificado: {submission.score}/{assignment.points} / Devuelto para revisión / Desconocido» — AssignmentDetailPage · l.219, when `!isEditing`
- «Respuesta:» — AssignmentDetailPage · l.282, when `!isEditing && submission && submission.content`
- «Archivos adjuntos:» — AssignmentDetailPage · l.291, when `!isEditing && submission && submission.attachment_urls && submission.attachment_urls.length > 0`
- «Retroalimentación del profesor:» — AssignmentDetailPage · l.311, when `!isEditing && submission && submission.feedback`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assignments/SubmissionForm.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assignments.js`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /assignments/[id]/submissions

File `pages/assignments/[id]/submissions.tsx` · 421 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.175 `router.push → /login  (when !session?.user)`
  - l.189 `role = await getUserPrimaryRole(session.user.id)`
  - l.286 `router.push → /login`
- Linked from: `components/assignments/AssignmentCard.tsx:117`
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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Calificar entrega de {submission.student?.name}» | h3 |  | GradeModal · l.38 |
| «Devolver tarea a {submission.student?.name}» | h3 |  | ReturnModal · l.114 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{onClose}` |  |  |  | GradeModal · l.73 |
| «Guardar calificación» (submits the form) |  |  |  |  | GradeModal · l.80 |
| «Cancelar» | `{onClose}` |  |  |  | ReturnModal · l.134 |
| «Devolver para revisión» (submits the form) |  |  |  |  | ReturnModal · l.141 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a Mis Tareas» | `/assignments` |  |  | SubmissionsPage · l.327 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Puntaje (máximo: {assignment.points} )» | number | required · `min=0 max={assignment.points} step=0.5` |  |  |  | GradeModal · l.47 |
| «Retroalimentación» | textarea | «Escribe comentarios para el estudiante...» |  |  |  | GradeModal · l.63 |
| «Retroalimentación para revisión *» | textarea | «Explica qué debe mejorar el estudiante...» · required |  |  |  | ReturnModal · l.123 |

**Forms** (2)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | GradeModal · l.42 |
| `{handleSubmit}` |  | ReturnModal · l.118 |

**Pop-ups** (4)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Calificar entrega de {submission.student?.name}» | written in this file |  |  | GradeModal · l.36 |
| «Devolver tarea a {submission.student?.name}» | written in this file |  |  | ReturnModal · l.112 |
| `GradeModal` | component | `gradeModal` |  | SubmissionsPage · l.397 |
| `ReturnModal` | component | `returnModal` |  | SubmissionsPage · l.409 |

**Toasts** (11)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor proporciona retroalimentación» | `!feedback.trim()` | handleSubmit · l.105 |
| error | «No tienes permisos para ver esta página» | `profile && !['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(role)` | checkSessionAndLoadData · l.195 |
| error | «Error al cargar los datos» |  | checkSessionAndLoadData · l.205 |
| error | «Tarea no encontrada» | `!assignmentData` | loadAssignmentAndSubmissions · l.218 |
| error | «No tienes permisos para ver estas entregas» | `assignmentData.created_by !== userId && userRole !== 'admin'` | loadAssignmentAndSubmissions · l.225 |
| error | «Error al cargar las entregas» |  | loadAssignmentAndSubmissions · l.239 |
| success | «Calificación guardada exitosamente» |  | handleGradeSubmission · l.248 |
| error | «Error al guardar la calificación» |  | handleGradeSubmission · l.257 |
| success | «Tarea devuelta para revisión» |  | handleReturnSubmission · l.266 |
| error | «Error al devolver la tarea» |  | handleReturnSubmission · l.275 |
| success | «Función de exportación próximamente» |  | handleExportSubmissions · l.281 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSessionAndLoadData · l.175 |
| `/assignments` | `router.push` | `profile && !['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(role)` | checkSessionAndLoadData · l.196 |
| `/assignments` | `router.push` |  | checkSessionAndLoadData · l.206 |
| `/assignments` | `router.push` | `!assignmentData` | loadAssignmentAndSubmissions · l.219 |
| `/assignments` | `router.push` | `assignmentData.created_by !== userId && userRole !== 'admin'` | loadAssignmentAndSubmissions · l.226 |
| `/login` | `router.push` |  | handleLogout · l.286 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | checkSessionAndLoadData · l.189 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!id` | SubmissionsPage · l.169 |
| `!assignment` | SubmissionsPage · l.307 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Entregas |  |  | SubmissionsPage · l.317 |
| `ResponsiveFunctionalPageHeader` | title: Entregas: {assignment.title} · subtitle: {submissions.length} entrega(s) recibida(s) · searchPlaceholder: Buscar por estudiante... · primaryAction: Exportar |  |  | SubmissionsPage · l.336 |
| `SubmissionList` |  |  |  | SubmissionsPage · l.382 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (3)

- `{assignment.points}` — SubmissionsPage · l.364
- `{submissions.filter(s => s.status !=…}` — SubmissionsPage · l.368
- `{submissions.filter(s => s.status ==…}` — SubmissionsPage · l.374

**Other texts on screen** (9)

- «Puntaje (máximo: {assignment.points} )» (label) — GradeModal · l.44
- «Retroalimentación» (label) — GradeModal · l.60
- «Retroalimentación para revisión *» (label) — ReturnModal · l.120
- «Entregas - {assignment.title} - Genera» — SubmissionsPage · l.314
- «Fecha límite:» — SubmissionsPage · l.354
- «{new Date(assignment.due_date).toLoc…} / Sin fecha límite» — SubmissionsPage · l.355
- «Puntos:» — SubmissionsPage · l.363
- «Enviadas:» — SubmissionsPage · l.367
- «Calificadas:» — SubmissionsPage · l.373

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/assignments/SubmissionList.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/services/assignments.js`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /community/workspace/assignments/[id]/discussion

File `pages/community/workspace/assignments/[id]/discussion.tsx` · 405 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the workspace rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.33 `router.push → /login  (when !(!authLoading && user && assignmentId) && !authLoading && !user)`
- Linked from: `pages/api/qa/seed-codebase-index.ts:511`
- Tests: browser tests that CI runs: `tests/e2e/finance-messaging-access.spec.ts`; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass if has a community, else /dashboard |
| equipo_directivo | — | pass if has a community, else /dashboard |
| lider_generacion | — | pass if has a community, else /dashboard |
| lider_comunidad | — | pass if has a community, else /dashboard |
| supervisor_de_red | — | pass if has a community, else /dashboard |
| community_manager | — | pass if has a community, else /dashboard |
| docente | — | pass if has a community, else /dashboard |
| encargado_licitacion | — | pass if has a community, else /dashboard |

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Discusión: {assignment.title}» | h1 |  | GroupDiscussionPage · l.300 |
| «Miembros del grupo ( {groupMembers.length} )» | h3 |  | GroupDiscussionPage · l.313 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Tareas Grupales» | `{() => router.push('/mi-aprendizaje/tareas')}` |  |  |  | GroupDiscussionPage · l.288 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {member.user.name} · {member.user.avatar_url} | `each groupMembers && member.user?.avatar_url` |  | GroupDiscussionPage · l.323 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No eres parte de ningún grupo para esta tarea» | `membershipError \|\| !userGroupData` | loadData · l.149 |
| error | «Error al cargar los datos» |  | loadData · l.204 |
| error | «Error al enviar el mensaje» |  | handleSendMessage · l.222 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «This is not a group assignment» | `throw (shown by whoever catches it)` | `blockData.type !== 'group-assignment' && blockData.type !== 'group_assignment'` | loadData · l.79 |
| «No se pudo verificar el grupo» | `throw (shown by whoever catches it)` | `groupError \|\| !group` | loadData · l.159 |
| «No se pudo abrir el espacio del grupo» | `throw (shown by whoever catches it)` | `group.community_id && (error \|\| !data)` | loadData · l.168 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(!authLoading && user && assignmentId) && !authLoading && !user` | GroupDiscussionPage · l.33 |
| `/mi-aprendizaje/tareas` | `router.push` | `membershipError \|\| !userGroupData` | loadData · l.150 |
| `/mi-aprendizaje/tareas` | `router.push` |  | GroupDiscussionPage · l.289 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!thread` | GroupDiscussionPage · l.38 |
| `!assignment \|\| !thread` | GroupDiscussionPage · l.264 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `authLoading \|\| loading` |  | GroupDiscussionPage · l.248 |
| `MainLayout` | pageTitle: Discusión del Grupo · breadcrumbs: Mis Tareas |  |  | GroupDiscussionPage · l.274 |
| `MessageCard` | message: Usuario | `!(messages.length === 0) && each messages` |  | GroupDiscussionPage · l.355 |
| `MessageComposer` |  |  |  | GroupDiscussionPage · l.390 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Tarea Grupal» | GroupDiscussionPage · l.126 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{assignment.course?.title} - {assignment.lesson?.title}` — GroupDiscussionPage · l.303

**Other texts on screen** (3)

- «Discusión - {assignment.title} - Genera» — GroupDiscussionPage · l.271
- «(Líder)» — GroupDiscussionPage · l.334, when `each groupMembers && member.role === 'leader'`
- «No hay mensajes aún. ¡Inicia la conversación!» — GroupDiscussionPage · l.350, when `messages.length === 0`

**Reads and writes the database directly:** `table:blocks` (select), `table:community_messages` (select), `table:community_workspaces` (select), `table:courses` (select), `table:group_assignment_groups` (select), `table:group_assignment_members` (select), `table:group_assignments_with_status` (select), `table:growth_communities` (select), `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/messaging/MentionPicker.tsx`
- `components/messaging/MessageCard.tsx`
- `components/messaging/MessageComposer.tsx`
- `lib/profile-cards.ts`
- `lib/services/groupAssignments.js`
- `lib/services/groupAssignmentsV2.js`
- `lib/utils/file-format.ts`
- `types/messaging.ts`
- `types/roles.ts`
- `utils/messagingUtils-simple.ts`
- `utils/messagingUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/assignments/submit-group` | POST | `lib/services/groupAssignmentsV2.js:429` |
| `/api/community/workspace-message-notifications` | POST | `utils/messagingUtils-simple.ts:829` |

## /community/workspace/assignments/[id]/groups

File `pages/community/workspace/assignments/[id]/groups.tsx` · 296 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the workspace rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.28 `router.push → /login  (when !(!authLoading && user && assignmentId) && !authLoading && !user)`
- Linked from: `pages/api/qa/seed-codebase-index.ts:471`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass if has a community, else /dashboard |
| equipo_directivo | — | pass if has a community, else /dashboard |
| lider_generacion | — | pass if has a community, else /dashboard |
| lider_comunidad | — | pass if has a community, else /dashboard |
| supervisor_de_red | — | pass if has a community, else /dashboard |
| community_manager | — | pass if has a community, else /dashboard |
| docente | — | pass if has a community, else /dashboard |
| encargado_licitacion | — | pass if has a community, else /dashboard |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{assignment.title}» | h1 |  | AssignmentGroupsPage · l.175 |
| «No hay grupos formados aún» | h3 | `groups.length === 0` | AssignmentGroupsPage · l.214 |
| «Grupo {index + 1}» | h3 | `!(groups.length === 0) && each groups` | AssignmentGroupsPage · l.231 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver a Tareas Grupales» | `{() => router.push('/mi-aprendizaje/tareas')}` |  |  |  | AssignmentGroupsPage · l.163 |
| «Salir del grupo» | `{handleLeaveGroup}` | `userGroup` |  |  | AssignmentGroupsPage · l.199 |
| «Unirse a este grupo» | `{() => handleJoinGroup(group.id)}` | `!(groups.length === 0) && each groups && canJoin` |  |  | AssignmentGroupsPage · l.280 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {member.user.name} · {member.user.avatar_url} | `!(groups.length === 0) && each groups && each group.members && member.user?.avatar_url` |  | AssignmentGroupsPage · l.255 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar los datos» |  | loadData · l.83 |
| success | «Te has unido al grupo exitosamente» |  | handleJoinGroup · l.100 |
| error | «Error al unirse al grupo» |  | handleJoinGroup · l.104 |
| success | «Has salido del grupo» |  | handleLeaveGroup · l.113 |
| error | «Error al salir del grupo» |  | handleLeaveGroup · l.117 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(!authLoading && user && assignmentId) && !authLoading && !user` | AssignmentGroupsPage · l.28 |
| `/mi-aprendizaje/tareas` | `router.push` |  | AssignmentGroupsPage · l.164 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!assignment` | AssignmentGroupsPage · l.139 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `authLoading \|\| loading` |  | AssignmentGroupsPage · l.123 |
| `MainLayout` | pageTitle: Grupos de Trabajo · breadcrumbs: Mis Tareas |  |  | AssignmentGroupsPage · l.149 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{assignment.courses?.title} - {assignment.lessons?.title}` — AssignmentGroupsPage · l.176
- `{member.user?.email}` — AssignmentGroupsPage · l.272, when `!(groups.length === 0) && each groups && each group.members`

**Other texts on screen** (10)

- «Grupos - {assignment.title} - Genera» — AssignmentGroupsPage · l.146
- «Comunidad: {assignment.community?.name}» — AssignmentGroupsPage · l.180
- «Grupos: {assignment.min_group_size} - {assignment.max_group_size} miembros» — AssignmentGroupsPage · l.182
- «Ya eres parte de un grupo ( {userGroup.members.length} miembros)» — AssignmentGroupsPage · l.195, when `userGroup`
- «Sé el primero en crear un grupo para esta tarea.» — AssignmentGroupsPage · l.218, when `groups.length === 0`
- «{group.members.length} de {assignment.max_group_size} miembros» — AssignmentGroupsPage · l.234, when `!(groups.length === 0) && each groups`
- «Tu grupo» — AssignmentGroupsPage · l.240, when `!(groups.length === 0) && each groups && isMyGroup`
- «Completo» — AssignmentGroupsPage · l.245, when `!(groups.length === 0) && each groups && isFull && !isMyGroup`
- «Usuario» — AssignmentGroupsPage · l.267, when `!(groups.length === 0) && each groups && each group.members`
- «Líder» — AssignmentGroupsPage · l.269, when `!(groups.length === 0) && each groups && each group.members && member.role === 'leader'`

**Reads and writes the database directly:** `table:community_workspaces` (select), `table:lesson_assignments` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/services/groupAssignments.js`
- `lib/services/groupAssignmentsV2.js`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/assignments/submit-group` | POST | `lib/services/groupAssignmentsV2.js:429` |

## /quiz-reviews

File `pages/quiz-reviews.tsx` · 239 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Trabajo › «Revisión de Quizzes» → `/quiz-reviews` — admin or consultor; the group: admin or consultor (`Sidebar.tsx` l.202)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.23 `router.push → /login  (when !user)`
  - l.28 `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…`
  - l.28 `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…`
  - l.28 `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…`
  - l.30 `router.push → /dashboard  (when !hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo'))`
  - l.111 `getHighestRole(userRoles) \|\| ''`
- Linked from: `components/DynamicFavicon.tsx:34`, `components/layout/Sidebar.tsx:204`, `lib/auth/forced-password-change.ts:158`, `lib/notifications/catalog.ts:310`, `middleware.ts:353`, `pages/quiz-reviews/[id].tsx:59`, `pages/quiz-reviews/[id].tsx:73`, `pages/quiz-reviews/[id].tsx:81`, `pages/quiz-reviews/[id].tsx:97`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.
- QA scenarios that name this address: admin 3, community_manager 1, consultor 2, equipo_directivo 4, lider_comunidad 1, lider_generacion 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | no | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Quizzes pendientes de revisión» | h2 |  | QuizReviewsPage · l.178 |
| «{review.student_name}» | h3 | `!(pendingReviews.length === 0) && each pendingReviews` | QuizReviewsPage · l.199 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Mis cursos» | `{() => setFilter('my_courses')}` |  |  |  | QuizReviewsPage · l.151 |
| «Todos los cursos» | `{() => setFilter('all')}` | `isAdmin` |  |  | QuizReviewsPage · l.162 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Revisar» | `/quiz-reviews/[*]` | `!(pendingReviews.length === 0) && each pendingReviews` |  | QuizReviewsPage · l.223 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a esta página» | `!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')` | initializePage · l.29 |
| error | «Error al cargar las revisiones pendientes» |  | loadPendingReviews · l.73 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No session token» | `throw (shown by whoever catches it)` | `!session?.access_token` | loadPendingReviews · l.48 |
| «Failed to fetch reviews» | `throw (shown by whoever catches it)` | `!response.ok` | loadPendingReviews · l.64 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | initializePage · l.23 |
| `/dashboard` | `router.push` | `!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')` | initializePage · l.30 |

**Access checks in the code** (4)

| Line of code | Where |
|---|---|
| `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…` | initializePage · l.28 |
| `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…` | initializePage · l.28 |
| `if (!hasRole('admin') && !hasRole('consultor') && !hasRole('equipo_directivo')) { toast.error('No tienes permisos para acceder a esta página'); route…` | initializePage · l.28 |
| `getHighestRole(userRoles) \|\| ''` | QuizReviewsPage · l.111 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Revisión de Quizzes |  |  | QuizReviewsPage · l.106 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getTimeAgo()` | «hace {diffDays} {diffDays === 1 ? 'día' : 'd…}», «hace {diffHours} {diffHours === 1 ? 'hora' : …}», «hace {diffMins} {diffMins === 1 ? 'minuto' :…}», «hace un momento» | getTimeAgo · l.86 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | QuizReviewsPage · l.58 |
| «hace {diffDays} {diffDays === 1 ? 'día' : 'd…}» | QuizReviewsPage · l.86 |

**Values shown from data** (5)

- `{pendingReviews.length}` — QuizReviewsPage · l.122
- `{review.student_email}` — QuizReviewsPage · l.201, when `!(pendingReviews.length === 0) && each pendingReviews`
- `{review.course_title}` — QuizReviewsPage · l.205, when `!(pendingReviews.length === 0) && each pendingReviews`
- `{review.lesson_title}` — QuizReviewsPage · l.206, when `!(pendingReviews.length === 0) && each pendingReviews`
- `{review.open_responses?.length}` — QuizReviewsPage · l.207, when `!(pendingReviews.length === 0) && each pendingReviews`

**Other texts on screen** (13)

- «Revisión de Quizzes - Genera» — QuizReviewsPage · l.103
- «Pendientes de revisión» — QuizReviewsPage · l.121
- «Tiempo promedio» — QuizReviewsPage · l.131
- «~15 min» — QuizReviewsPage · l.132
- «Revisados hoy» — QuizReviewsPage · l.141
- «Estos quizzes contienen preguntas abiertas que requieren calificación manual» — QuizReviewsPage · l.180
- «No hay quizzes pendientes de revisión» — QuizReviewsPage · l.188, when `pendingReviews.length === 0`
- «Los quizzes con preguntas abiertas aparecerán aquí cuando los estudiantes los completen» — QuizReviewsPage · l.190, when `pendingReviews.length === 0`
- «Curso:» — QuizReviewsPage · l.205, when `!(pendingReviews.length === 0) && each pendingReviews`
- «Lección:» — QuizReviewsPage · l.206, when `!(pendingReviews.length === 0) && each pendingReviews`
- «Preguntas abiertas:» — QuizReviewsPage · l.207, when `!(pendingReviews.length === 0) && each pendingReviews`
- «Enviado» — QuizReviewsPage · l.213, when `!(pendingReviews.length === 0) && each pendingReviews`
- «Alta carga de trabajo» — QuizReviewsPage · l.217, when `!(pendingReviews.length === 0) && each pendingReviews && review.reviewer_workload > 5`

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quiz-reviews/pending` | GET | `pages/quiz-reviews.tsx:54` |

## /quiz-reviews/[id]

File `pages/quiz-reviews/[id].tsx` · 135 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.35 `router.push → /login  (when !currentSession?.access_token)`
  - l.53 `router.push → /dashboard  (when !response.ok && response.status === 403)`
  - l.92 `router.push → /login`
- Linked from: `middleware.ts:353`, `pages/quiz-reviews.tsx:223`, `pages/quiz-reviews.tsx:224`
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

### What the page file itself draws

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Sesión no válida» | `!currentSession?.access_token` | loadData · l.34 |
| error | «No tienes permisos para acceder a esta página» | `!response.ok && response.status === 403` | loadData · l.52 |
| error | «Quiz no encontrado» | `!response.ok && response.status === 404` | loadData · l.58 |
| plain | «Este quiz ya ha sido revisado» | `submissionData.review_status && submissionData.review_status !== 'pending'` | loadData · l.72 |
| error | «Error al cargar los datos» |  | loadData · l.80 |
| success | «Quiz calificado exitosamente» |  | handleGradingComplete · l.96 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch quiz» | `throw (shown by whoever catches it)` | `!response.ok` | loadData · l.63 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!currentSession?.access_token` | loadData · l.35 |
| `/dashboard` | `router.push` | `!response.ok && response.status === 403` | loadData · l.53 |
| `/quiz-reviews` | `router.push` | `!response.ok && response.status === 404` | loadData · l.59 |
| `/quiz-reviews` | `router.push` | `submissionData.review_status && submissionData.review_status !== 'pending'` | loadData · l.73 |
| `/quiz-reviews` | `router.push` |  | loadData · l.81 |
| `/login` | `router.push` |  | handleLogout · l.92 |
| `/quiz-reviews` | `router.push` |  | handleGradingComplete · l.97 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!id \|\| !session` | QuizReviewDetailPage · l.25 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Revisar Quiz |  |  | QuizReviewDetailPage · l.114 |
| `QuizReviewPanel` |  | `submission` |  | QuizReviewDetailPage · l.125 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {currentSession.access_token}» | QuizReviewDetailPage · l.44 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Other texts on screen** (1)

- «Revisar Quiz - Genera» — QuizReviewDetailPage · l.111

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/quiz/QuizReviewPanel.tsx`
- `hooks/useAvatar.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quiz-reviews/[id]` | GET | `pages/quiz-reviews/[id].tsx:40` |
| `/api/quiz-reviews/submit-review` | POST | `components/quiz/QuizReviewPanel.tsx:60` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/assignments/SubmissionForm.tsx

Used by: `/assignments/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{assignment.title}» | h3 |  | SubmissionForm · l.63 |
| «Tu respuesta» | h3 |  | SubmissionForm · l.79 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{() => handleRemoveAttachment(index)}` | `formData.attachment_urls && formData.attachment_urls.length > 0 && each formData.attachment_urls` |  |  | SubmissionForm · l.107 |
| «[icon Upload]» | `{handleAddAttachment}` |  | `{!attachmentInput.trim()}` |  | SubmissionForm · l.133 |
| «Cancelar» | `{onCancel}` |  |  |  | SubmissionForm · l.186 |
| «Guardar borrador» | `{(e) => handleSubmit(e, true)}` | `(!submission?.status \|\| submission.status === 'draft' \|\| submission.status === 'returned')` | `{isLoading \|\| !canSubmit}` |  | SubmissionForm · l.197 |
| «Enviar tarea» (submits the form) |  | `(!submission?.status \|\| submission.status === 'draft' \|\| submission.status === 'returned')` | `{isLoading \|\| !canSubmit}` |  | SubmissionForm · l.207 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Contenido de la entrega» | textarea | «Escribe tu respuesta aquí...» |  |  |  | SubmissionForm · l.86 |
| «Archivos adjuntos» | url | «URL del archivo adjunto» · also `onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttachment(); } }}` |  |  |  | SubmissionForm · l.120 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => handleSubmit(e, false)}` |  | SubmissionForm · l.60 |

**Values shown from data** (3)

- `{assignment.instructions}` — SubmissionForm · l.65, when `assignment.instructions`
- `{url}` — SubmissionForm · l.106, when `formData.attachment_urls && formData.attachment_urls.length > 0 && each formData.attachment_urls`
- `{submission.feedback}` — SubmissionForm · l.178, when `submission?.status && submission.feedback`

**Other texts on screen** (10)

- «{assignment.points} puntos» — SubmissionForm · l.70
- «Fecha límite: {new Date(assignment.due_date).toLoc…}» — SubmissionForm · l.72, when `assignment.due_date`
- «Contenido de la entrega» (label) — SubmissionForm · l.83
- «Archivos adjuntos» (label) — SubmissionForm · l.97
- «Pega la URL de tu archivo (Google Drive, Dropbox, etc.)» — SubmissionForm · l.143
- «Estado: Borrador / Enviado / Calificado / Devuelto para revisión / {submission.status}» — SubmissionForm · l.159, when `submission?.status`
- «Calificación: {submission.score} / {assignment.points}» — SubmissionForm · l.169, when `submission?.status && submission.score !== undefined && submission.score !== null`
- «Retroalimentación:» — SubmissionForm · l.177, when `submission?.status && submission.feedback`
- «Tarea enviada - esperando calificación» — SubmissionForm · l.220, when `submission?.status === 'submitted'`
- «Tarea calificada» — SubmissionForm · l.226, when `submission?.status === 'graded'`

### components/assignments/SubmissionList.tsx

Used by: `/assignments/[id]/submissions`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Respuesta:» | h4 | `each submissions && selectedSubmission === submission.id && submission.content` | SubmissionList · l.165 |
| «Archivos adjuntos:» | h4 | `each submissions && selectedSubmission === submission.id && submission.attachment_urls && submission.attachment_urls.length > 0` | SubmissionList · l.174 |
| «Retroalimentación:» | h4 | `each submissions && selectedSubmission === submission.id && submission.feedback` | SubmissionList · l.193 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Check]» · tooltip «Calificar» | `{(e) => { e.stopPropagation(); onGrade(submission.id); }}` | `each submissions && submission.status === 'submitted'` |  |  | SubmissionList · l.120 |
| «[icon X]» · tooltip «Devolver para revisión» | `{(e) => { e.stopPropagation(); onReturn(submission.id); }}` | `each submissions && submission.status === 'submitted'` |  |  | SubmissionList · l.130 |
| «[icon MessageSquare]» · tooltip «Editar calificación» | `{(e) => { e.stopPropagation(); onGrade(submission.id); }}` | `each submissions && submission.status === 'graded'` |  |  | SubmissionList · l.143 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Archivo {index + 1} : {url}» | `{url}` (new tab) | `each submissions && selectedSubmission === submission.id && submission.attachment_urls && submission.attachment_urls.length > 0 && each submission.attachment_urls` |  | SubmissionList · l.177 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{submission.student?.name?.charAt(0)…} / U {submission.student?.name} / Usuario {submission.student?.email} {getStatusB…» | `{() => setSelectedSubmission( selectedSubmission === submission.id ? null : subm…}` | `each submissions` | SubmissionList · l.77 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Estudiante» |  | SubmissionList · l.66 |
| «Estado» |  | SubmissionList · l.67 |
| «Fecha de entrega» |  | SubmissionList · l.68 |
| «Tardía» |  | SubmissionList · l.69 |
| «Archivos» |  | SubmissionList · l.70 |
| «Acciones» |  | SubmissionList · l.71 |

**Values shown from data** (6)

- `{submission.student?.name?.charAt(0)…} / U` — SubmissionList · l.85, when `each submissions`
- `{submission.student?.email}` — SubmissionList · l.92, when `each submissions`
- `{getStatusBadge(submission.status, s…}` — SubmissionList · l.98, when `each submissions`
- `{formatDate(submission.submitted_at)} / -` — SubmissionList · l.101, when `each submissions`
- `{submission.content}` — SubmissionList · l.167, when `each submissions && selectedSubmission === submission.id && submission.content`
- `{submission.feedback}` — SubmissionList · l.195, when `each submissions && selectedSubmission === submission.id && submission.feedback`

**Other texts on screen** (12)

- «Enviado» — getStatusBadge · l.26, when `status === 'submitted'`
- «Calificado [({score}/{assignment.points})]» — getStatusBadge · l.29, when `status === 'graded'`
- «Devuelto» — getStatusBadge · l.34, when `status === 'returned'`
- «Borrador» — getStatusBadge · l.36, when `status === 'draft'`
- «No hay entregas para esta tarea aún.» — SubmissionList · l.55, when `submissions.length === 0`
- «{submission.student?.name} / Usuario» — SubmissionList · l.89, when `each submissions`
- «Sí» — SubmissionList · l.106, when `each submissions && submission.is_late`
- «No» — SubmissionList · l.108, when `each submissions && !(submission.is_late)`
- «{submission.attachment_urls?.length} archivo(s)» — SubmissionList · l.112, when `each submissions`
- «Creado:» — SubmissionList · l.203, when `each submissions && selectedSubmission === submission.id`
- «Calificado:» — SubmissionList · l.208, when `each submissions && selectedSubmission === submission.id && submission.graded_at`
- «Por:» — SubmissionList · l.214, when `each submissions && selectedSubmission === submission.id && submission.grader`

### components/layout/FunctionalPageHeader.tsx

Used by: `/assignments`, `/assignments/[id]`, `/assignments/[id]/submissions`

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

### components/messaging/MentionPicker.tsx

Used by: `/community/workspace/assignments/[id]/discussion`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{getRoleIcon(suggestion.role)} {suggestion.display_name} [{getRoleLabel(suggestion.role)}] [{suggestion.email}] [@todos] [@ {suggestion.role}]» | `{() => onSelect(suggestion)}` | `each filteredSuggestions` |  |  | MentionPicker · l.151 |
| «@todos Mencionar a todos en la comunidad Especial» | `{() => onSelect({ type: 'all' as MentionType, id: 'all', display_name: 'todos', …}` | `query === ''` |  |  | MentionPicker · l.216 |
| «@lideres Mencionar a los líderes de comunidad Rol» | `{() => onSelect({ type: 'role' as MentionType, id: 'lider_comunidad', display_na…}` | `query === ''` |  |  | MentionPicker · l.237 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {suggestion.display_name} · {suggestion.avatar} | `each filteredSuggestions && suggestion.avatar` |  | MentionPicker · l.161 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isVisible \|\| filteredSuggestions.length === 0` | MentionPicker · l.116 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getRoleLabel()` | «Administrador», «Líder de Comunidad», «Consultor», «Docente» | getRoleLabel · l.98 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Administrador» | MentionPicker · l.98 |
| «Líder de Comunidad» | MentionPicker · l.100 |
| «Consultor» | MentionPicker · l.102 |
| «Docente» | MentionPicker · l.104 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('mousedown')` | MentionPicker · l.47 |
| listener | `document.addEventListener('keydown')` | MentionPicker · l.63 |
| scroll | `selectedElement.scrollIntoView()` | MentionPicker · l.72 |

**Other texts on screen** (6)

- «Mencionar usuario» — MentionPicker · l.139
- «buscando &quot; {query} &quot;» — MentionPicker · l.141, when `query`
- «Menciones especiales» — MentionPicker · l.213, when `query === ''`
- «↑↓ navegar» — MentionPicker · l.266
- «Enter seleccionar» — MentionPicker · l.267
- «Esc cerrar» — MentionPicker · l.268

### components/messaging/MessageCard.tsx

Used by: `/community/workspace/assignments/[id]/discussion`

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «@ {displayName}» | `{() => onMentionClick && onMentionClick(part)}` | `each parts && index % 2 === 1` |  |  | renderContent · l.119 |
| «{emoji} [{count}] [{reactionSummary.users.slice(0, 5).m…} [y {reactionSummary.users.lengt…} más]]» · tooltip «{getReactionLabel(reactionType)}» · also `onMouseEnter={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: true }))} · onMouseLeave={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: false }))}` | `{() => handleReactionToggle(reactionType)}` |  |  |  | renderReactionButton · l.140 |
| «{message.author_name}» | `{() => onUserClick && onUserClick(message.author_id)}` |  |  |  | MessageCard · l.208 |
| «[icon Download]» · tooltip «Descargar» | `{(e) => { e.stopPropagation(); onDownloadAttachment && onDownloadAttachment(atta…}` | `message.attachments.length > 0 && message.attachments.filter(att => att.mime_type && att.mime_type.startsWith('image/')).length > 0 && each message.attachments .filter(att => att.mime_type …` |  |  | MessageCard · l.252 |
| «[icon Download]» · tooltip «Descargar» | `{() => onDownloadAttachment(attachment)}` | `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type … && onDownloadAttachment` |  |  | MessageCard · l.287 |
| «😊» · tooltip «Reaccionar» | `{() => setShowReactions(!showReactions)}` |  |  |  | MessageCard · l.316 |
| «{reaction.emoji}» · tooltip «{reaction.label}» | `{() => handleReactionToggle(reaction.type)}` | `showReactions && each REACTION_TYPES` |  |  | MessageCard · l.328 |
| «Responder» | `{() => onReply(message)}` | `permissions.can_send_messages && onReply` |  |  | MessageCard · l.343 |
| «Editar» | `{() => onEdit(message)}` | `isOwnMessage && permissions.can_edit_own_messages && onEdit` |  |  | MessageCard · l.355 |
| «Eliminar» | `{() => onDelete && onDelete(message.id)}` | `(isOwnMessage && permissions.can_delete_own_messages) \|\| permissions.can_moderate_messages` |  |  | MessageCard · l.367 |
| «[icon MoreHorizontal]» · tooltip «Más opciones» |  |  |  |  | MessageCard · l.378 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseEnter={() => setShowActions(true)} · onMouseLeave={() => setShowActions(false)}` |  | MessageCard · l.167 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `mimeType.startsWith('image/')` |  | getFileIcon · l.95 |
| img · alt {message.author_name} · {message.author_avatar} | `message.author_avatar` |  | MessageCard · l.192 |
| img · alt {attachment.file_name} · {attachment.storage_path} | `message.attachments.length > 0 && message.attachments.filter(att => att.mime_type && att.mime_type.startsWith('image/')).length > 0 && each message.attachments .filter(att => att.mime_type …` |  | MessageCard · l.245 |

**Values shown from data** (9)

- `{message.reply_to_message.author_name}` — MessageCard · l.179, when `message.reply_to_message && showReplyThread`
- `{formatRelativeTime(message.reply_to…}` — MessageCard · l.180, when `message.reply_to_message && showReplyThread`
- `{message.reply_to_message.content.su…} ...` — MessageCard · l.182, when `message.reply_to_message && showReplyThread`
- `{formatRelativeTime(message.created_…}` — MessageCard · l.214
- `{renderContent(message.content)}` — MessageCard · l.231
- `{getFileIcon(attachment.mime_type \|\|…}` — MessageCard · l.274, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{attachment.file_name}` — MessageCard · l.278, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{formatFileSize(attachment.file_size…}` — MessageCard · l.281, when `message.attachments.length > 0 && each message.attachments.filter(att => !att.mime_type …`
- `{message.reactions.map((reactionSumm…}` — MessageCard · l.303, when `message.reactions.length > 0`

**Other texts on screen** (3)

- «(editado)» — MessageCard · l.216, when `message.is_edited`
- «Sistema» — MessageCard · l.220, when `message.message_type === 'system'`
- «Anuncio» — MessageCard · l.225, when `message.message_type === 'announcement'`

### components/messaging/MessageComposer.tsx

Used by: `/community/workspace/assignments/[id]/discussion`

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{editingMessage ? onCancelEdit : onCancelReply}` | `(replyToMessage \|\| editingMessage)` |  |  | MessageComposer · l.372 |
| «[icon Loader2]» | `{handleSubmit}` |  | `{(!content.trim() && attachments.length === 0) \|\| isSubmitting \|\| disabled}` |  | MessageComposer · l.406 |
| «[icon X]» | `{() => removeAttachment(index)}` | `attachments.length > 0 && each attachments` |  |  | MessageComposer · l.468 |
| «[icon Paperclip]» · tooltip «Adjuntar archivo» | `{() => fileInputRef.current?.click()}` | `allowAttachments` | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.499 |
| «[icon Smile]» · tooltip «Agregar emoji» | `{() => setShowEmojiPicker(!showEmojiPicker)}` |  | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.520 |
| «{emoji}» | `{() => { setContent(prev => prev + emoji); setShowEmojiPicker(false); }}` | `showEmojiPicker && each quickEmojis` |  |  | MessageComposer · l.536 |
| «[icon AtSign]» · tooltip «Mencionar usuario» | `{() => { if (textareaRef.current) { const cursorPosition = textareaRef.current.s…}` | `allowMentions` | `{disabled \|\| isSubmitting}` |  | MessageComposer · l.553 |
| «Cancelar» | `{editingMessage ? onCancelEdit : onCancelReply}` | `(replyToMessage \|\| editingMessage)` | `{isSubmitting}` |  | MessageComposer · l.577 |
| «Enviando... / Guardar cambios / Enviar mensaje» | `{handleSubmit}` |  | `{(!content.trim() && attachments.length === 0) \|\| isSubmitting \|\| disabled}` |  | MessageComposer · l.585 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{placeholder}» | textarea | «{placeholder}» · disabled: `{disabled \|\| isSubmitting}` · `maxLength={maxLength}` · also `onKeyDown={handleKeyPress}` |  |  |  | MessageComposer · l.388 |
|  | file | accepts `{DEFAULT_MESSAGING_CONFIG.allowed_attachment_types.join(',')}` · `multiple=true` |  | `allowAttachments` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | MessageComposer · l.507 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onDrop={handleDrop} · onDragOver={handleDragOver}` |  | MessageComposer · l.382 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| Image | `attachments.length > 0 && each attachments && file.type.startsWith('image/')` |  | MessageComposer · l.461 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `MentionPicker` | component | `{showMentionPicker}` |  | MessageComposer · l.425 |

**Browser alert()** (4)

| Text | When | Where |
|---|---|---|
| «Archivo no válido: {file.name}» | `!isValidAttachment(file)` | MessageComposer · l.197 |
| «No se pueden adjuntar más de {DEFAULT_MESSAGING_CONFIG.ma…} archivos» | `attachments.length + validFiles.length > DEFAULT_MESSAGING_CONFIG.max_attachments_per_message` | MessageComposer · l.204 |
| «{validationResult.errors.join('\n')}» | `!validationResult.is_valid` | MessageComposer · l.270 |
| «Error al enviar el mensaje. Inténtalo de nuevo.» |  | MessageComposer · l.292 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!mentionPosition` | MessageComposer · l.162 |
| `!content.trim() && attachments.length === 0` | MessageComposer · l.241 |
| `isSubmitting \|\| disabled` | MessageComposer · l.242 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Escribe un mensaje...» | MessageComposer · l.70 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| focus | `textareaRef.current.focus()` | MessageComposer · l.112 |
| focus | `textareaRef.current.focus()` | MessageComposer · l.185 |
| listener | `document.addEventListener('mousedown')` | MessageComposer · l.343 |
| focus | `textareaRef.current.focus()` | MessageComposer · l.559 |

**Values shown from data** (6)

- `{replyToMessage.author_name}` — MessageComposer · l.359, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- `{replyToMessage.content.substring(0,…} ...` — MessageComposer · l.360, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- `{content.length} / {maxLength}` — MessageComposer · l.401
- `{file.name}` — MessageComposer · l.465, when `attachments.length > 0 && each attachments`
- `( {formatFileSize(file.size)} )` — MessageComposer · l.466, when `attachments.length > 0 && each attachments`
- `{error}` — MessageComposer · l.486, when `validation && !validation.is_valid && each validation.errors`

**Other texts on screen** (2)

- «Respondiendo a» — MessageComposer · l.359, when `((replyToMessage \|\| editingMessage)) && replyToMessage`
- «Editando mensaje» — MessageComposer · l.368, when `((replyToMessage \|\| editingMessage)) && editingMessage`

### components/quiz/QuizReviewPanel.tsx

Used by: `/quiz-reviews/[id]`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Revisión de Quiz» | h2 |  | QuizReviewPanel · l.98 |
| «{response.question}» | h3 | `each submission.open_responses` | QuizReviewPanel · l.133 |
| «Evaluación general» | h3 |  | QuizReviewPanel · l.182 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{() => window.history.back()}` |  |  |  | QuizReviewPanel · l.241 |
| «Guardando... / Guardar revisión» | `{handleSubmitReview}` |  | `{isSaving}` |  | QuizReviewPanel · l.247 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Retroalimentación para esta pregunta (opcional)» | textarea | «Proporciona retroalimentación específica sobre esta respuesta...» |  | `each submission.open_responses` |  | QuizReviewPanel · l.167 |
| «Aprobado El estudiante demuestra comprensión adecuada» | radio | `reviewStatus` |  |  |  | QuizReviewPanel · l.189 |
| «Necesita revisar El estudiante debe revisar el material» | radio | `reviewStatus` |  |  |  | QuizReviewPanel · l.205 |
| «Retroalimentación general [*]» | textarea | «{reviewStatus === 'pass' ? "Comentarios adicionales para el estudiante (opcional…}» |  |  |  | QuizReviewPanel · l.227 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor proporciona retroalimentación general cuando el estudiante necesita revisar» | `!generalFeedback.trim() && reviewStatus === 'needs_review'` | handleSubmitReview · l.37 |
| error | «Sesión no válida» | `!session?.access_token` | handleSubmitReview · l.55 |
| success | «Revisión guardada exitosamente» |  | handleSubmitReview · l.79 |
| error | «Error al guardar la revisión» |  | handleSubmitReview · l.86 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to save review» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmitReview · l.76 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | QuizReviewPanel · l.64 |
| «Comentarios adicionales para el estudiante (opcional)...» | QuizReviewPanel · l.232 |
| «Explica qué áreas necesita revisar el estudiante y proporciona orientación...» | QuizReviewPanel · l.233 |

**Values shown from data** (7)

- `{submission.student?.name}` — QuizReviewPanel · l.100
- `{submission.course?.title}` — QuizReviewPanel · l.101
- `{submission.lesson?.title}` — QuizReviewPanel · l.102
- `{new Date(submission.submitted_at).t…}` — QuizReviewPanel · l.103
- `{index + 1}` — QuizReviewPanel · l.130, when `each submission.open_responses`
- `{response.expectedAnswer}` — QuizReviewPanel · l.150, when `each submission.open_responses && ((response.expectedAnswer \|\| response.gradingGuidelines)) && response.expectedAnswer`
- `{response.gradingGuidelines}` — QuizReviewPanel · l.156, when `each submission.open_responses && ((response.expectedAnswer \|\| response.gradingGuidelines)) && response.gradingGuidelines`

**Other texts on screen** (15)

- «Estudiante:» — QuizReviewPanel · l.100
- «Curso:» — QuizReviewPanel · l.101
- «Lección:» — QuizReviewPanel · l.102
- «Enviado:» — QuizReviewPanel · l.103
- «Enfoque en el aprendizaje» — QuizReviewPanel · l.116
- «Revisa las respuestas del estudiante y proporciona retroalimentación constructiva. El objetivo es ayudar al estudiante a mejorar su comprensión del tema.» — QuizReviewPanel · l.117
- «Respuesta del estudiante:» — QuizReviewPanel · l.140, when `each submission.open_responses`
- «{response.response} / (Sin respuesta)» — QuizReviewPanel · l.141, when `each submission.open_responses`
- «Respuesta esperada:» — QuizReviewPanel · l.149, when `each submission.open_responses && ((response.expectedAnswer \|\| response.gradingGuidelines)) && response.expectedAnswer`
- «Guía de evaluación:» — QuizReviewPanel · l.155, when `each submission.open_responses && ((response.expectedAnswer \|\| response.gradingGuidelines)) && response.gradingGuidelines`
- «Retroalimentación para esta pregunta (opcional)» (label) — QuizReviewPanel · l.164, when `each submission.open_responses`
- «Estado de la revisión» — QuizReviewPanel · l.186
- «Aprobado El estudiante demuestra comprensión adecuada» (label) — QuizReviewPanel · l.188
- «Necesita revisar El estudiante debe revisar el material» (label) — QuizReviewPanel · l.204
- «Retroalimentación general [*]» (label) — QuizReviewPanel · l.224

### hooks/useAvatar.ts

Used by: `/assignments`, `/quiz-reviews/[id]`

**Reads and writes the database directly:** `table:profiles` (select)

### lib/profile-cards.ts

Used by: `/community/workspace/assignments/[id]/discussion`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | cardName · l.59 |

**Reads and writes the database directly:** `rpc:get_profile_cards`

### lib/services/assignments.js

Used by: `/assignments`, `/assignments/[id]`, `/assignments/[id]/submissions`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `assignmentUtils` | «Sin fecha límite», «Vencido hace {Math.abs(diffDays)} días», «Vence hoy», «Vence mañana», «Vence en {diffDays} días», «Tarea», «Cuestionario», «Proyecto», «Ensayo», «Presentación» | l.421 |
| `labels` | «Tarea», «Cuestionario», «Proyecto», «Ensayo», «Presentación» | getTypeLabel · l.476 |
| `formatDueDate()` | «Sin fecha límite», «Vencido hace {Math.abs(diffDays)} días», «Vence hoy», «Vence mañana», «Vence en {diffDays} días» | formatDueDate · l.440 |

**Reads and writes the database directly:** `table:course_enrollments` (select), `table:lesson_assignment_submissions` (insert, select, update), `table:lesson_assignments` (delete, insert, select, update)

### lib/services/groupAssignments.js

Used by: `/community/workspace/assignments/[id]/discussion`, `/community/workspace/assignments/[id]/groups`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudo abrir la discusión del grupo» | `throw (shown by whoever catches it)` | `!thread` | getOrCreateDiscussion · l.236 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `groupAssignmentService` | «Tarea Grupal», «Discusión grupal para {assignmentTitle} ({courseTitle}) [if courseTitle]», «Hilo de discusión para coordinar el trabajo grupal [if not courseTitle]», «No se pudo abrir la discusión del grupo» | l.4 |
| `assignmentTitle` | «Tarea Grupal» | getOrCreateDiscussion · l.208 |
| `threadDescription` | «Discusión grupal para {assignmentTitle} ({courseTitle}) / Hilo de discusión para coordinar el trabajo grupal» | getOrCreateDiscussion · l.221 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Discusión: {assignmentTitle}» | groupAssignmentService · l.231 |

**Reads and writes the database directly:** `rpc:get_or_create_group_discussion`, `table:group_assignment_members` (delete, insert, select), `table:group_assignment_submissions` (insert, select, update), `table:lesson_assignments` (select)

### lib/services/groupAssignmentsV2.js

Used by: `/community/workspace/assignments/[id]/discussion`, `/community/workspace/assignments/[id]/groups`

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

### lib/utils/file-format.ts

Used by: `/community/workspace/assignments/[id]/discussion`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `sizes` | «Bytes», «KB», «MB», «GB» | formatFileSize · l.25 |
| `formatFileSize()` | «0 Bytes» | formatFileSize · l.22 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «0 Bytes» | formatFileSize · l.22 |

### types/messaging.ts

Used by: `/community/workspace/assignments/[id]/discussion`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `REACTION_TYPES` | «Me gusta», «Me encanta», «Buena idea», «Excelente», «Interesante», «Tengo dudas» | l.25 |
| `THREAD_CATEGORIES` | «General», «Conversaciones generales», «Recursos», «Compartir recursos y materiales», «Preguntas», «Preguntas y respuestas», «Proyectos», «Colaboración en proyectos», «Ideas», «Compartir ideas y propuestas», «Tareas y trabajos asignados» | l.43 |

### types/roles.ts

Used by: `/admin/assignment-overview`, `/admin/assignment-review/[id]`, `/assignments`, `/assignments/[id]`, `/assignments/[id]/submissions`, `/community/workspace/assignments/[id]/discussion`, `/community/workspace/assignments/[id]/groups`, `/quiz-reviews`

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

### utils/assignmentFilters.js

Used by: `/admin/assignment-overview`

**Reads and writes the database directly:** `table:consultant_assignments` (select), `table:generations` (select), `table:growth_communities` (select), `table:schools` (select)

### utils/messagingUtils-simple.ts

Used by: `/community/workspace/assignments/[id]/discussion`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Messaging feature not yet implemented» | `throw (shown by whoever catches it)` | `error && (error?.code === '42P01' \|\| error?.message?.includes('does not exist'))` | sendMessage · l.563 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | requestMessageNotifications · l.833 |

**Reads and writes the database directly:** `bucket:message-attachments` (getPublicUrl, upload), `table:community_messages` (insert, select), `table:message_attachments` (insert, select), `table:message_threads` (update), `table:profiles` (select)

### utils/messagingUtils.ts

Used by: `/community/workspace/assignments/[id]/discussion`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `labels` | «Me gusta», «Me encanta», «Buena idea», «Excelente», «Interesante», «Tengo dudas» | getReactionLabel · l.41 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Reacción» | getReactionLabel · l.49 |

### utils/roleUtils.ts

Used by: `/admin/assignment-overview`, `/admin/assignment-review/[id]`, `/assignments`, `/assignments/[id]`, `/assignments/[id]/submissions`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/assignments/add-classmates` | `pages/api/assignments/add-classmates.ts` | POST | `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `components/assignments/GroupSubmissionModalV2.tsx` |
| `/api/assignments/admin-overview` | `pages/api/assignments/admin-overview.ts` | GET | `/admin/assignment-overview` | `__tests__/api/group-quiz-notifications.test.ts`, `pages/admin/assignment-overview.tsx` |
| `/api/assignments/collaborative-submit` | `pages/api/assignments/collaborative-submit.ts` | POST | **no screen** | `__tests__/api/forged-session-sweep.test.ts`, `components/assignments/CollaborativeSubmissionModal.tsx` |
| `/api/assignments/create-group` | `pages/api/assignments/create-group.ts` | POST | `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `components/assignments/GroupSubmissionModalV2.tsx` |
| `/api/assignments/eligible-classmates` | `pages/api/assignments/eligible-classmates.ts` | GET | `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `components/assignments/GroupSubmissionModalV2.tsx` |
| `/api/assignments/feedback` | `pages/api/assignments/feedback.ts` | POST | **no screen** | `__tests__/api/assignments/feedback-admin-only.test.ts` |
| `/api/assignments/group-members` | `pages/api/assignments/group-members.ts` | DELETE, GET | `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `components/assignments/GroupSubmissionModalV2.tsx` |
| `/api/assignments/shareable-members` | `pages/api/assignments/shareable-members.ts` | GET | **no screen** | `__tests__/api/assignments/forged-session.test.ts`, `components/assignments/CollaborativeSubmissionModal.tsx` |
| `/api/assignments/submit-group` | `pages/api/assignments/submit-group.ts` | POST | `/community/workspace/assignments/[id]/discussion`, `/community/workspace/assignments/[id]/groups`, `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `lib/services/groupAssignmentsV2.js` |
| `/api/assignments/user-group` | `pages/api/assignments/user-group.ts` | GET | `/mi-aprendizaje/tareas` | `__tests__/api/assignments/forged-session.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `pages/mi-aprendizaje/tareas.tsx` |
| `/api/quiz-reviews/[id]` | `pages/api/quiz-reviews/[id].ts` | GET | `/quiz-reviews/[id]` | `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/api/quiz-review-scope.test.ts`, `pages/quiz-reviews/[id].tsx` |
| `/api/quiz-reviews/notify-pending` | `pages/api/quiz-reviews/notify-pending.ts` | POST | `/student/lesson/[lessonId]` | `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/api/quiz-review-scope.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/lib/notificationService.source-context.test.ts`, `lib/services/quizSubmissions.js` |
| `/api/quiz-reviews/pending` | `pages/api/quiz-reviews/pending.ts` | GET | `/quiz-reviews` | `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/api/quiz-review-scope.test.ts`, `pages/quiz-reviews.tsx` |
| `/api/quiz-reviews/submit-review` | `pages/api/quiz-reviews/submit-review.ts` | POST | `/quiz-reviews/[id]` | `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/api/quiz-review-scope.test.ts`, `components/quiz/QuizReviewPanel.tsx` |

