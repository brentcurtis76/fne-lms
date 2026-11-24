# Sesiones y consultorías (sessions, approvals, video meetings)

Area `06-sesiones`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `297c129d4` (2026-11-25).

11 screen files, 34 API files, 75 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/bulk-tag-sessions` | `pages/admin/bulk-tag-sessions.tsx` | 513 | Consultorías › Clasificar Sesiones |  |
| `/admin/consultant-assignments` | `pages/admin/consultant-assignments.tsx` | 637 | Consultorías › Asignación de Consultores |  |
| `/admin/sessions/[id]` | `pages/admin/sessions/[id].tsx` | 1322 | — |  |
| `/admin/sessions/approvals` | `pages/admin/sessions/approvals.tsx` | 518 | Consultorías › Aprobaciones |  |
| `/admin/sessions/create` | `pages/admin/sessions/create.tsx` | 90 | — |  |
| `/admin/sessions` | `pages/admin/sessions/index.tsx` | 1261 | Consultorías › Sesiones |  |
| `/consultor/sessions/[id]` | `pages/consultor/sessions/[id].tsx` | 170 | — |  |
| `/consultor/sessions` | `pages/consultor/sessions/index.tsx` | 45 | Mi Trabajo › Mis Sesiones |  |
| `/consultor/sessions/reports` | `pages/consultor/sessions/reports.tsx` | 942 | Mi Trabajo › Mis Reportes; Consultorías › Reportes |  |
| `/meet/diag` | `pages/meet/diag.tsx` | 1047 | — | Looks like a leftover but is in use |
| `/meet/session/[id]` | `pages/meet/session/[id].tsx` | 198 | — |  |

## /admin/bulk-tag-sessions

File `pages/admin/bulk-tag-sessions.tsx` · 513 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Clasificar Sesiones» → `/admin/bulk-tag-sessions` — admin only; the group: admin or consultor (`Sidebar.tsx` l.532)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.111 `router.push → /login  (when !session?.user)`
  - l.116 `role = await getUserPrimaryRole(session.user.id)`
  - l.118 `router.push → /dashboard  (when role !== 'admin')`
  - l.123 `router.push → /login`
  - l.164 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:534`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/admin/bulkTag.sameRequests.test.tsx`, `__tests__/pages/admin/bulkTag.views.test.tsx`.
- QA scenarios that name this address: admin 2, consultor 1, equipo_directivo 2.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `!isAdmin` | BulkTagSessionsPage · l.252 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronLeft]» · aria «Página anterior» | `{() => { setSelectedIds(new Set()); setPage((p) => Math.max(1, p - 1)); }}` | `totalPages > 1` | `{page === 1}` |  | BulkTagSessionsPage · l.449 |
| «[icon ChevronRight]» · aria «Página siguiente» | `{() => { setSelectedIds(new Set()); setPage((p) => Math.min(totalPages, p + 1));…}` | `totalPages > 1` | `{page === totalPages}` |  | BulkTagSessionsPage · l.457 |
| «Clasificando... / Clasificar Seleccionadas» | `{handleBulkTag}` | `selectedIds.size > 0` | `{saving \|\| !selectedHourTypeKey}` |  | BulkTagSessionsPage · l.490 |
| «Deseleccionar» | `{() => setSelectedIds(new Set())}` | `selectedIds.size > 0` |  |  | BulkTagSessionsPage · l.499 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Fecha desde» | date |  |  |  | `id=filter-date-from (id used by code)` | BulkTagSessionsPage · l.329 |
| «Fecha hasta» | date |  |  |  | `id=filter-date-to (id used by code)` | BulkTagSessionsPage · l.339 |
| «Colegio» | select |  | «Todos los colegios», «(lista) {s.name}» |  | `id=filter-school (id used by code)` | BulkTagSessionsPage · l.349 |
| «Seleccionar todas las sesiones» | checkbox |  |  |  |  | BulkTagSessionsPage · l.376 |
| «{`Seleccionar sesión ${session.title}`}» | checkbox |  |  | `!(sessions.length === 0) && each sessions` |  | BulkTagSessionsPage · l.405 |
| «Tipo de hora para clasificación» | select |  | «Seleccione tipo de hora», «(lista) {ht.display_name}» | `selectedIds.size > 0` |  | BulkTagSessionsPage · l.477 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» |  | BulkTagSessionsPage · l.384 |
| «Título» |  | BulkTagSessionsPage · l.385 |
| «Colegio» |  | BulkTagSessionsPage · l.386 |
| «Consultor» |  | BulkTagSessionsPage · l.387 |
| «Estado» |  | BulkTagSessionsPage · l.388 |

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar sesiones» | `!res.ok` | BulkTagSessionsPage · l.89 |
| error | «Error de red al cargar sesiones» |  | BulkTagSessionsPage · l.95 |
| error | «Debe seleccionar al menos una sesión» | `selectedIds.size === 0` | handleBulkTag · l.186 |
| error | «Debe seleccionar un tipo de hora» | `!selectedHourTypeKey` | handleBulkTag · l.190 |
| error | «Error al clasificar sesiones» | `!res.ok` | handleBulkTag · l.207 |
| success | «Sesiones clasificadas correctamente» |  | handleBulkTag · l.211 |
| error | «Error de red al clasificar sesiones» |  | handleBulkTag · l.215 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initAuth · l.111 |
| `/dashboard` | `router.push` | `role !== 'admin'` | initAuth · l.118 |
| `/login` | `router.push` |  | initAuth · l.123 |
| `/login` | `router.push` |  | handleLogout · l.164 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | initAuth · l.116 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!res.ok` | BulkTagSessionsPage · l.132 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `isNuevo` |  | BulkTagSessionsPage · l.261 |
| `BulkTagNuevo` |  | `isNuevo` |  | BulkTagSessionsPage · l.269 |
| `MainLayout` |  |  |  | BulkTagSessionsPage · l.299 |
| `ResponsiveFunctionalPageHeader` | title: Clasificar Sesiones · subtitle: Asignar tipo de hora a sesiones históricas sin clasificar |  |  | BulkTagSessionsPage · l.307 |
| `Info` | aria-hidden: true |  |  | BulkTagSessionsPage · l.316 |

**Values shown from data** (5)

- `{formatDate(session.scheduled_date)}` — BulkTagSessionsPage · l.413, when `!(sessions.length === 0) && each sessions`
- `{session.title}` — BulkTagSessionsPage · l.416, when `!(sessions.length === 0) && each sessions`
- `{session.schools?.name} / —` — BulkTagSessionsPage · l.419, when `!(sessions.length === 0) && each sessions`
- `{getFacilitatorName(session)}` — BulkTagSessionsPage · l.422, when `!(sessions.length === 0) && each sessions`
- `{badge.label}` — BulkTagSessionsPage · l.429, when `!(sessions.length === 0) && each sessions`

**Other texts on screen** (12)

- «No tiene permisos para acceder a esta página.» — BulkTagSessionsPage · l.253, when `!isAdmin`
- «Las sesiones clasificadas aquí aparecerán en reportes pero» — BulkTagSessionsPage · l.317
- «NO» — BulkTagSessionsPage · l.317
- «afectarán los saldos de horas del contrato.» — BulkTagSessionsPage · l.317
- «Filtros» — BulkTagSessionsPage · l.324
- «Fecha desde» (label) — BulkTagSessionsPage · l.328
- «Fecha hasta» (label) — BulkTagSessionsPage · l.338
- «Colegio» (label) — BulkTagSessionsPage · l.348
- «{total} sesión(es) sin clasificar» — BulkTagSessionsPage · l.367
- «No hay sesiones sin clasificar con los filtros actuales» — BulkTagSessionsPage · l.395, when `sessions.length === 0`
- «Página {page} de {totalPages}» — BulkTagSessionsPage · l.445, when `totalPages > 1`
- «{selectedIds.size} sesión(es) seleccionada(s)» — BulkTagSessionsPage · l.473, when `selectedIds.size > 0`

**Reads and writes the database directly:** `table:schools` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/admin-nuevo/BulkTagNuevo.tsx`
- `components/sessions/admin-nuevo/adminNuevoStyles.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/bulk-tag-sessions` | GET, PATCH | `pages/admin/bulk-tag-sessions.tsx:196`, `pages/admin/bulk-tag-sessions.tsx:86` |
| `/api/hour-types` | GET | `pages/admin/bulk-tag-sessions.tsx:131` |

## /admin/consultant-assignments

File `pages/admin/consultant-assignments.tsx` · 637 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Asignación de Consultores» → `/admin/consultant-assignments` — admin only; permission: assign_consultants_all; the group: admin or consultor (`Sidebar.tsx` l.477)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.117 `router.push → /login  (when !session?.user)`
  - l.129 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.134 `router.push → /dashboard  (when profileData && !isAdminUser)`
  - l.144 `router.push → /login`
  - l.154 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:479`, `middleware.ts:224`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/admin/consultantAssignments.clasico.test.tsx`, `__tests__/pages/admin/consultantAssignments.nuevo.test.tsx`, `__tests__/pages/admin/consultantAssignments.sameRequests.test.tsx`.
- QA scenarios that name this address: admin 3, community_manager 2, consultor 2, equipo_directivo 1, lider_generacion 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `!isAdmin` | ConsultantAssignmentsPage · l.395 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editar» | `{() => handleEditAssignment(assignment)}` | `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments` |  |  | ConsultantAssignmentsPage · l.602 |
| «Eliminar» | `{() => handleDeleteAssignment(assignment.id)}` | `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments` |  |  | ConsultantAssignmentsPage · l.608 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Todos los tipos», «Completa», «Monitoreo», «Mentoría», «Evaluación», «Apoyo» | `!(isNuevo)` |  | ConsultantAssignmentsPage · l.451 |
|  | select |  | «Todas las asignaciones», «Solo activas», «Solo inactivas» | `!(isNuevo)` |  | ConsultantAssignmentsPage · l.463 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «Consultor» | `!(isNuevo)` | ConsultantAssignmentsPage · l.507 |
| «Estudiante» | `!(isNuevo)` | ConsultantAssignmentsPage · l.508 |
| «Tipo» | `!(isNuevo)` | ConsultantAssignmentsPage · l.509 |
| «Permisos» | `!(isNuevo)` | ConsultantAssignmentsPage · l.510 |
| «Duración» | `!(isNuevo)` | ConsultantAssignmentsPage · l.511 |
| «Estado» | `!(isNuevo)` | ConsultantAssignmentsPage · l.512 |
| «Acciones» | `!(isNuevo)` | ConsultantAssignmentsPage · l.513 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConsultantAssignmentModal` | component | `{isModalOpen}` |  | ConsultantAssignmentsPage · l.627 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Está seguro de que desea eliminar esta asignación?» |  | handleDeleteAssignment · l.264 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | fetchAssignments · l.163 |
| error | «Error al cargar asignaciones» |  | fetchAssignments · l.259 |
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | handleDeleteAssignmentConfirmed · l.277 |
| success | «Asignación eliminada exitosamente» |  | handleDeleteAssignmentConfirmed · l.293 |
| error | «Error al eliminar asignación» |  | handleDeleteAssignmentConfirmed · l.297 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch assignments» | `throw (shown by whoever catches it)` | `!response.ok` | fetchAssignments · l.175 |
| «Failed to delete assignment» | `throw (shown by whoever catches it)` | `!response.ok` | handleDeleteAssignmentConfirmed · l.290 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.117 |
| `/dashboard` | `router.push` | `profileData && !isAdminUser` | initializeAuth · l.134 |
| `/login` | `router.push` |  | initializeAuth · l.144 |
| `/login` | `router.push` |  | handleLogout · l.154 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.129 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ConsultantAssignmentsPage · l.405 |
| `AssignmentsNuevo` |  | `isNuevo` |  | ConsultantAssignmentsPage · l.415 |
| `ResponsiveFunctionalPageHeader` | title: Consultorías · subtitle: Gestión de asignaciones consultor-estudiante para seguimiento y mentorías · searchPlaceholder: Buscar por nombre o email... · primaryAction: Nueva Asignación | `!(isNuevo)` |  | ConsultantAssignmentsPage · l.433 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `BREADCRUMBS_NUEVO` | «Consultorías», «Asignación de Consultores» | l.16 |
| `assignmentTypeLabels` | «Monitoreo», «Mentoría», «Evaluación», «Apoyo», «Completa» | ConsultantAssignmentsPage · l.86 |
| `formatDateTime()` | «Sin límite» | formatDateTime · l.360 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | ConsultantAssignmentsPage · l.169 |
| «Progreso» | ConsultantAssignmentsPage · l.353 |
| «Asignar» | ConsultantAssignmentsPage · l.354 |
| «Mensajes» | ConsultantAssignmentsPage · l.355 |
| «Sin límite» | ConsultantAssignmentsPage · l.360 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.152 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.153 |

**Values shown from data** (8)

- `{assignments.filter(a => a.is_active…}` — ConsultantAssignmentsPage · l.477, when `!(isNuevo)`
- `{assignments.filter(a => a.assignmen…}` — ConsultantAssignmentsPage · l.483, when `!(isNuevo)`
- `{new Set(assignments.map(a => a.cons…}` — ConsultantAssignmentsPage · l.489, when `!(isNuevo)`
- `{assignments.reduce((total, a) => to…}` — ConsultantAssignmentsPage · l.495, when `!(isNuevo)`
- `{assignment.student.first_name} {assignment.student.last_name}` — ConsultantAssignmentsPage · l.543, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.student`
- `{assignment.student.email}` — ConsultantAssignmentsPage · l.546, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments && assignment.student`
- `{assignmentTypeLabels[assignment.ass…} / {assignment.assignment_type}` — ConsultantAssignmentsPage · l.567, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`
- `{permission}` — ConsultantAssignmentsPage · l.576, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments && each getPermissionBadges(assignment)`

**Other texts on screen** (13)

- «No tiene permisos para acceder a esta página.» — ConsultantAssignmentsPage · l.396, when `!isAdmin`
- «Asignaciones Activas» — ConsultantAssignmentsPage · l.480, when `!(isNuevo)`
- «Completas» — ConsultantAssignmentsPage · l.486, when `!(isNuevo)`
- «Consultores Únicos» — ConsultantAssignmentsPage · l.492, when `!(isNuevo)`
- «Estudiantes Afectados» — ConsultantAssignmentsPage · l.498, when `!(isNuevo)`
- «No se encontraron asignaciones que coincidan con los filtros. / No hay asignaciones creadas aún.» — ConsultantAssignmentsPage · l.519, when `!(isNuevo) && filteredAssignments.length === 0`
- «{`${assignment.consultant?.first_nam…} / Sin nombre» — ConsultantAssignmentsPage · l.531, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`
- «{assignment.consultant?.email} / Sin email» — ConsultantAssignmentsPage · l.536, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Comunidad: {assignment.community.name} / Generación: {assignment.generation.name} / Escuela: {assignment.school.name} / Asignación Grupal» — ConsultantAssignmentsPage · l.554, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments && !(assignment.student)`
- «{assignment.affected_students_count} estudiante s afectado s» — ConsultantAssignmentsPage · l.559, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments && !(assignment.student)`
- «Inicio: {formatDateTime(assignment.starts_at)}» — ConsultantAssignmentsPage · l.587, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Fin: {formatDateTime(assignment.ends_at)}» — ConsultantAssignmentsPage · l.588, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`
- «Activa / Inactiva» — ConsultantAssignmentsPage · l.592, when `!(isNuevo) && !(filteredAssignments.length === 0) && each filteredAssignments`

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:profiles` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ConsultantAssignmentModal.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/assignments-nuevo/AssignmentsNuevo.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultant-assignment-users` | GET | `components/ConsultantAssignmentModal.tsx:100` |
| `/api/admin/consultant-assignments` | DELETE, GET | `components/ConsultantAssignmentModal.tsx:586`, `pages/admin/consultant-assignments.tsx:167`, `pages/admin/consultant-assignments.tsx:281` |

## /admin/sessions/[id]

File `pages/admin/sessions/[id].tsx` · 1322 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.263 `router.push → /login  (when !session?.user)`
  - l.268 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.273 `router.push → /dashboard  (when !isAdminUser)`
  - l.278 `router.push → /login`
  - l.450 `router.push → /login`
- Linked from: `hooks/useSessionCreate.ts:585`, `hooks/useSessionCreate.ts:718`, `pages/admin/sessions/index.tsx:329`
- Tests: browser tests that CI runs: `tests/e2e/look-sessions.spec.ts`; unit tests of the page: `__tests__/pages/admin/sessions/adminDetail.latch.test.tsx`, `__tests__/pages/admin/sessions/adminDetail.question.test.tsx`, `__tests__/pages/admin/sessions/adminDetail.sameRequests.test.tsx`, `__tests__/pages/admin/sessions/adminDetail.views.test.tsx`.

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

**Titles** (17)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `!isAdmin` | SessionDetailPage · l.703 |
| «Título» | h3 |  | SessionDetailPage · l.1001 |
| «Modalidad» | h3 |  | SessionDetailPage · l.1006 |
| «Fecha» | h3 |  | SessionDetailPage · l.1011 |
| «Horario» | h3 |  | SessionDetailPage · l.1016 |
| «Ubicación» | h3 | `session.location` | SessionDetailPage · l.1025 |
| «Reunión Zoom» | h3 | `session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)` | SessionDetailPage · l.1032 |
| «Reunión Zoom» | h3 | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)` | SessionDetailPage · l.1039 |
| «Enlace de reunión» | h3 | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && !(session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)) && session.has_meeting && session.join_path` | SessionDetailPage · l.1048 |
| «Descripción» | h3 | `session.description` | SessionDetailPage · l.1063 |
| «Objetivos» | h3 | `session.objectives` | SessionDetailPage · l.1070 |
| «Razón de cancelación» | h3 | `session.cancellation_reason` | SessionDetailPage · l.1077 |
| «Consultores» | h3 |  | SessionDetailPage · l.1086 |
| «Consultores actuales» | h4 | `!(!editingFacilitators)` | SessionDetailPage · l.1132 |
| «Añadir consultor» | h4 | `!(!editingFacilitators)` | SessionDetailPage · l.1178 |
| «Cancelar Sesión» | h2 | `showCancelModal` | SessionDetailPage · l.1242 |
| «Cancelar Sesiones Futuras de la Serie» | h2 | `showSeriesCancelModal` | SessionDetailPage · l.1284 |

**Buttons** (13)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todas las sesiones de la serie» · aria «{showSeriesPanel ? "Ocultar sesiones de la serie" : "Ver todas las sesiones de l…}» | `{() => setShowSeriesPanel(!showSeriesPanel)}` | `session.recurrence_group_id && session.session_number` |  |  | SessionDetailPage · l.818 |
| «Ver» | `{() => router.push('/admin/sessions/${s.id}')}` | `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions` |  |  | SessionDetailPage · l.891 |
| «Cancelar sesiones futuras» | `{() => setShowSeriesCancelModal(true)}` | `session.recurrence_group_id && session.session_number && showSeriesPanel && !(seriesLoading)` | `{actionInProgress}` |  | SessionDetailPage · l.906 |
| «Aprobar» | `{handleApprove}` | `(session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion')` | `{actionInProgress}` |  | SessionDetailPage · l.951 |
| «Cancelar» | `{() => setShowCancelModal(true)}` | `session.status !== 'completada' && session.status !== 'cancelada'` | `{actionInProgress}` |  | SessionDetailPage · l.986 |
| «Editar consultores» | `{() => handleStartEditFacilitators()}` | `session.status !== 'completada' && session.status !== 'cancelada' && !editingFacilitators` |  |  | SessionDetailPage · l.1088 |
| «Quitar» | `{() => handleRemoveEditFacilitator(facilitator.user_id)}` | `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators` |  |  | SessionDetailPage · l.1160 |
| «Cancelar» | `{() => handleCancelEditFacilitators()}` | `!(!editingFacilitators)` | `{savingFacilitators}` |  | SessionDetailPage · l.1208 |
| «Guardando... / Guardar» | `{() => handleSaveFacilitators()}` | `!(!editingFacilitators)` | `{savingFacilitators \|\| editFacilitators.length === 0}` |  | SessionDetailPage · l.1215 |
| «Cerrar» | `{() => setShowCancelModal(false)}` | `showCancelModal` | `{actionInProgress}` |  | SessionDetailPage · l.1256 |
| «Confirmar Cancelación» | `{handleCancelSubmit}` | `showCancelModal` | `{actionInProgress \|\| !cancellationReason.trim()}` |  | SessionDetailPage · l.1263 |
| «Cerrar» | `{() => setShowSeriesCancelModal(false)}` | `showSeriesCancelModal` | `{actionInProgress}` |  | SessionDetailPage · l.1299 |
| «Confirmar Cancelación de Serie» | `{handleSeriesCancelSubmit}` | `showSeriesCancelModal` | `{actionInProgress \|\| !seriesCancellationReason.trim()}` |  | SessionDetailPage · l.1306 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Agregar al Calendario» | `/api/sessions/[*]/ical` | `(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status)` |  | SessionDetailPage · l.928 |
| «Exportar Serie» | `/api/sessions/series/[*]/ical` | `session.recurrence_group_id` |  | SessionDetailPage · l.940 |
| «Ir a Zoom» | `{buildSessionJoinPath(session.id)}` | `session.status === 'en_progreso' && session.is_zoom_managed === true && managedMeetingIsReady(managedMeetingStatus)` | `testid=session-zoom-entry-button` | SessionDetailPage · l.975 |
| «Unirse a la reunión Zoom / Abrir reunión» | `{session.join_path}` | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && !(session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)) && session.has_meeting && session.join_path` | `testid=session-join-link` | SessionDetailPage · l.1051 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Consultor principal» | checkbox |  |  | `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators` |  | SessionDetailPage · l.1152 |
|  | select | disabled: `{availableConsultants.length === 0}` | «Seleccionar consultor...», «(lista) {consultant.first_name} {consultant.last_name} ( {consultant.email} )» | `!(!editingFacilitators) && !(loadingConsultants)` |  | SessionDetailPage · l.1185 |
| «Razón de cancelación...» | textarea | «Razón de cancelación...» |  | `showCancelModal` |  | SessionDetailPage · l.1248 |
| «Razón de cancelación...» | textarea | «Razón de cancelación...» |  | `showSeriesCancelModal` |  | SessionDetailPage · l.1291 |

**Pop-ups** (4)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Cancelar Sesión» | written in this file | `showCancelModal` |  | SessionDetailPage · l.1235 |
| «Cancelar Sesión» | written in this file | `showCancelModal` |  | SessionDetailPage · l.1236 |
| «Cancelar Sesiones Futuras de la Serie» | written in this file | `showSeriesCancelModal` |  | SessionDetailPage · l.1277 |
| «Cancelar Sesiones Futuras de la Serie» | written in this file | `showSeriesCancelModal` |  | SessionDetailPage · l.1278 |

**Browser confirm()** (2)

| Question | When | Where |
|---|---|---|
| «¿Está seguro que desea aprobar esta sesión?» |  | handleApprove · l.324 |
| «¿Está seguro que desea iniciar esta sesión?» |  | handleStartSession · l.369 |

**Toasts** (24)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `!authSession?.access_token` | fetchSession · l.290 |
| error | «Error al cargar sesión» |  | fetchSession · l.317 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleApproveConfirmed · l.339 |
| success | «Sesión aprobada exitosamente» |  | handleApproveConfirmed · l.356 |
| error | «Error al aprobar sesión» |  | handleApproveConfirmed · l.360 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleStartSessionConfirmed · l.384 |
| success | «{message}» |  | handleStartSessionConfirmed · l.395 |
| error | «{message}» |  | handleStartSessionConfirmed · l.396 |
| error | «Error al iniciar sesión» |  | handleStartSessionConfirmed · l.400 |
| error | «Debe ingresar una razón de cancelación» | `!cancellationReason.trim()` | handleCancelSubmit · l.408 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleCancelSubmit · l.418 |
| success | «Sesión cancelada exitosamente» |  | handleCancelSubmit · l.436 |
| error | «Error al cancelar sesión» |  | handleCancelSubmit · l.442 |
| error | «Error de autenticación» | `!authSession?.access_token` | fetchSeriesData · l.460 |
| error | «Error al cargar serie» | `error instanceof Error` | fetchSeriesData · l.482 |
| error | «Debe ingresar una razón de cancelación» | `!seriesCancellationReason.trim()` | handleSeriesCancelSubmit · l.491 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleSeriesCancelSubmit · l.503 |
| success | «{message}» |  | handleSeriesCancelSubmit · l.529 |
| error | «Error al cancelar serie» | `error instanceof Error` | handleSeriesCancelSubmit · l.541 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleStartEditFacilitators · l.587 |
| error | «Error al cargar consultores» | `error instanceof Error` | handleStartEditFacilitators · l.609 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleSaveFacilitators · l.656 |
| success | «Consultores actualizados exitosamente» |  | handleSaveFacilitators · l.676 |
| error | «Error al guardar consultores» | `error instanceof Error` | handleSaveFacilitators · l.684 |

**Messages set on the page** (7)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | fetchSession · l.302 |
| «Error al aprobar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleApproveConfirmed · l.353 |
| «Error al cancelar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleCancelSubmit · l.433 |
| «Error al cargar serie» | `throw (shown by whoever catches it)` | `!response.ok` | fetchSeriesData · l.472 |
| «Error al cancelar serie» | `throw (shown by whoever catches it)` | `!response.ok` | handleSeriesCancelSubmit · l.521 |
| «Error al cargar consultores» | `throw (shown by whoever catches it)` | `!response.ok` | handleStartEditFacilitators · l.600 |
| «Error al guardar consultores» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveFacilitators · l.673 |

**Downloads and printing** (2)

| How | When | Where |
|---|---|---|
| `<a download> Agregar al Calendario` | `(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status)` | SessionDetailPage · l.928 |
| `<a download> Exportar Serie` | `session.recurrence_group_id` | SessionDetailPage · l.940 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.263 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.273 |
| `/login` | `router.push` |  | initializeAuth · l.278 |
| `{path}` | `router.push` |  | handleStartSessionConfirmed · l.393 |
| `/login` | `router.push` |  | handleLogout · l.450 |
| `/admin/sessions/[*]` | `router.push` | `isNuevo` | SessionDetailPage · l.780 |
| `/admin/sessions/[*]` | `router.push` | `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions` | SessionDetailPage · l.892 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.268 |

**Draws nothing when** (5)

| Condition | Where |
|---|---|
| `!session \|\| !managedMeetingNeedsPolling( session.status, session.is_zoom_managed === true, managedMeetingStatus )` | SessionDetailPage · l.149 |
| `!showCancelModal \|\| isNuevo` | SessionDetailPage · l.167 |
| `!modal` | SessionDetailPage · l.176 |
| `!showSeriesCancelModal \|\| isNuevo` | SessionDetailPage · l.213 |
| `!modal` | SessionDetailPage · l.222 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `!session` |  | SessionDetailPage · l.712 |
| `HoursComparisonPanel` |  | `hoursHost` |  | SessionDetailPage · l.730 |
| `MainLayout` |  | `isNuevo` |  | SessionDetailPage · l.734 |
| `AdminSessionDetailNuevo` |  | `isNuevo` |  | SessionDetailPage · l.743 |
| `MainLayout` |  |  |  | SessionDetailPage · l.789 |
| `ResponsiveFunctionalPageHeader` | title: Detalle de Sesión |  |  | SessionDetailPage · l.798 |
| `SessionStartControl` |  | `session.status === 'programada'` |  | SessionDetailPage · l.962 |
| `Link2` | aria-hidden: true | `session.status === 'en_progreso' && session.is_zoom_managed === true && managedMeetingIsReady(managedMeetingStatus)` |  | SessionDetailPage · l.980 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `message` | «1 sesión cancelada exitosamente / {count} sesiones canceladas exitosamente» | handleSeriesCancelSubmit · l.526 |
| `label` | «Borradores / s» | SessionDetailPage · l.847 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | SessionDetailPage · l.296 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (19)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, 3000)` | SessionDetailPage · l.157 |
| lookup | `querySelector([role="dialog"])` | SessionDetailPage · l.175 |
| lookup | `querySelectorAll(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]))` | SessionDetailPage · l.178 |
| focus | `lastElement.focus()` | handleTab · l.189 |
| focus | `firstElement.focus()` | handleTab · l.194 |
| focus | `firstElement.focus()` | SessionDetailPage · l.200 |
| listener | `document.addEventListener('keydown')` | SessionDetailPage · l.202 |
| listener | `document.addEventListener('keydown')` | SessionDetailPage · l.203 |
| lookup | `querySelector([role="dialog"][aria-labelledby="series-cancel-modal-title"])` | SessionDetailPage · l.221 |
| lookup | `querySelectorAll(button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]))` | SessionDetailPage · l.224 |
| focus | `lastElement.focus()` | handleTab · l.235 |
| focus | `firstElement.focus()` | handleTab · l.240 |
| focus | `firstElement.focus()` | SessionDetailPage · l.246 |
| listener | `document.addEventListener('keydown')` | SessionDetailPage · l.248 |
| listener | `document.addEventListener('keydown')` | SessionDetailPage · l.249 |
| role | `role=region` | SessionDetailPage · l.832 |
| role | `role=alert` | SessionDetailPage · l.1033 |
| role | `role=status` | SessionDetailPage · l.1040 |
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (16)

- `{badge.label}` — getStatusBadge · l.551
- `{count} {label}` — SessionDetailPage · l.851, when `showSeriesPanel && !(seriesLoading) && seriesStats && each (Object.entries(seriesStats) as [SessionStatus, n…`
- `{format(new Date(s.session_date + 'T…}` — SessionDetailPage · l.882, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- `{s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)}` — SessionDetailPage · l.885, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- `{getStatusBadge(session.status)}` — SessionDetailPage · l.924
- `{session.title}` — SessionDetailPage · l.1002
- `{session.modality}` — SessionDetailPage · l.1007
- `{formatDate(session.session_date)}` — SessionDetailPage · l.1012
- `{session.location}` — SessionDetailPage · l.1026, when `session.location`
- `{session.description}` — SessionDetailPage · l.1064, when `session.description`
- `{session.objectives}` — SessionDetailPage · l.1071, when `session.objectives`
- `{session.cancellation_reason}` — SessionDetailPage · l.1078, when `session.cancellation_reason`
- `{displayName}` — SessionDetailPage · l.1112, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators`
- `{facilitator.facilitator_role.replac…}` — SessionDetailPage · l.1119, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators`
- `{displayName}` — SessionDetailPage · l.1147, when `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators`
- `{consultant.email}` — SessionDetailPage · l.1148, when `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators && consultant`

**Other texts on screen** (18)

- «No tiene permisos para acceder a esta página.» — SessionDetailPage · l.704, when `!isAdmin`
- «Cargando sesión...» — SessionDetailPage · l.722, when `!session`
- «Serie de sesiones — Sesión {session.session_number} [de {seriesTotalSessions}]» — SessionDetailPage · l.813, when `session.recurrence_group_id && session.session_number`
- «Sesiones de la serie» (aria-label) — SessionDetailPage · l.832, when `session.recurrence_group_id && session.session_number && showSeriesPanel`
- «No se encontraron sesiones en esta serie.» — SessionDetailPage · l.862, when `session.recurrence_group_id && session.session_number && showSeriesPanel && !(seriesLoading) && seriesSessions.length === 0`
- «Sesión {s.session_number}» — SessionDetailPage · l.874, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- «Actual» — SessionDetailPage · l.879, when `!(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions && s.id === session.id`
- «(hora Chile)» — SessionDetailPage · l.1019
- «min)» — SessionDetailPage · l.1019
- «La reunión terminó o fue cancelada. Cancela o reprograma la sesión.» — SessionDetailPage · l.1034, when `session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)`
- «No se pudo verificar el estado de Zoom. Reintentando… / Preparando la reunión Zoom…» — SessionDetailPage · l.1040, when `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)`
- «Consultor principal» — SessionDetailPage · l.1115, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators && facilitator.is_lead`
- «Sin consultores asignados» — SessionDetailPage · l.1127, when `!editingFacilitators && !(session.facilitators.length > 0)`
- «Consultor principal» (label) — SessionDetailPage · l.1151, when `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators`
- «No hay consultores añadidos» — SessionDetailPage · l.1172, when `!(!editingFacilitators) && !(editFacilitators.length > 0)`
- «Cargando consultores...» — SessionDetailPage · l.1182, when `!(!editingFacilitators) && loadingConsultants`
- «Por favor, ingrese la razón de la cancelación:» — SessionDetailPage · l.1246, when `showCancelModal`
- «Esto cancelará todas las sesiones futuras de esta serie que aún no estén completadas o canceladas. Por favor, ingrese la razón de la cancelación:» — SessionDetailPage · l.1288, when `showSeriesCancelModal`

**Reads and writes the database directly:** `table:session_meetings_public` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/HoursComparisonPanel.tsx`
- `components/sessions/SessionStartControl.tsx`
- `components/sessions/admin-nuevo/AdminSessionDetailNuevo.tsx`
- `components/sessions/admin-nuevo/adminNuevoStyles.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/PageHeader.tsx`
- `lib/utils/session-start-workflow.ts`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultants` | GET | `pages/admin/sessions/[id].tsx:592` |
| `/api/admin/sessions/[id]/hour-override` | POST | `components/sessions/HoursComparisonPanel.tsx:93` |
| `/api/admin/sessions/[id]/hours-comparison` | GET | `components/sessions/HoursComparisonPanel.tsx:58` |
| `/api/sessions/[id]` | GET, PUT | `lib/utils/session-start-workflow.ts:38`, `pages/admin/sessions/[id].tsx:294` |
| `/api/sessions/[id]/approve` | POST | `pages/admin/sessions/[id].tsx:343` |
| `/api/sessions/[id]/cancel` | POST | `pages/admin/sessions/[id].tsx:422` |
| `/api/sessions/[id]/facilitators` | PUT | `pages/admin/sessions/[id].tsx:660` |
| `/api/sessions/[id]/ical` | ? | `components/sessions/admin-nuevo/AdminSessionDetailNuevo.tsx:490`, `pages/admin/sessions/[id].tsx:929` |
| `/api/sessions/series/[groupId]` | GET | `pages/admin/sessions/[id].tsx:464` |
| `/api/sessions/series/[groupId]/cancel` | POST | `pages/admin/sessions/[id].tsx:507` |
| `/api/sessions/series/[groupId]/ical` | ? | `components/sessions/admin-nuevo/AdminSessionDetailNuevo.tsx:498`, `pages/admin/sessions/[id].tsx:941` |

## /admin/sessions/approvals

File `pages/admin/sessions/approvals.tsx` · 518 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Aprobaciones» → `/admin/sessions/approvals` — admin only; the group: admin or consultor (`Sidebar.tsx` l.500)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.73 `router.push → /login  (when !session?.user)`
  - l.78 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.83 `router.push → /dashboard  (when !isAdminUser)`
  - l.88 `router.push → /login`
  - l.126 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:502`, `lib/notificationEvents.ts:560`, `lib/notifications/catalog.ts:356`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/admin/sessions/approvals.adminOnly.test.tsx`, `__tests__/pages/admin/sessions/approvals.sameRequests.test.tsx`, `__tests__/pages/admin/sessions/approvals.views.test.tsx`.
- QA scenarios that name this address: admin 6, consultor 2, lider_comunidad 1, director 1, supervisor 1, docente 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Aprobaciones de Sesiones» | h1 |  | SessionApprovalsPage · l.339 |
| «{request.consultor_sessions?.title} / Sesión sin título» | h3 | `!(editRequests.length === 0) && each editRequests` | SessionApprovalsPage · l.393 |
| «Cambios propuestos:» | h4 | `!(editRequests.length === 0) && each editRequests` | SessionApprovalsPage · l.435 |
| «Razón:» | h4 | `!(editRequests.length === 0) && each editRequests && request.reason` | SessionApprovalsPage · l.464 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{tab.label}» | `{() => setStatusFilter(tab.id as StatusFilter)}` | `each [ { id: 'pending', label: 'Pendientes', icon: Clo…` |  |  | SessionApprovalsPage · l.356 |
| «Rechazar» | `{() => handleReject(request.id)}` | `!(editRequests.length === 0) && each editRequests && request.status === 'pending'` | `{actionInProgress}` |  | SessionApprovalsPage · l.490 |
| «Aprobar» | `{() => handleApprove(request.id)}` | `!(editRequests.length === 0) && each editRequests && request.status === 'pending'` | `{actionInProgress}` |  | SessionApprovalsPage · l.498 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Notas (opcional para aprobar, requerido para rechazar)» | textarea | «Ingrese notas para el consultor...» |  | `!(editRequests.length === 0) && each editRequests && request.status === 'pending'` |  | SessionApprovalsPage · l.475 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `!authSession?.access_token` | fetchEditRequests · l.100 |
| error | «{errorMessage}» |  | fetchEditRequests · l.120 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleApprove · l.138 |
| success | «Solicitud aprobada correctamente» |  | handleApprove · l.159 |
| error | «{errorMessage}» |  | handleApprove · l.169 |
| error | «Por favor ingrese una razón para el rechazo» | `!notes \|\| !notes.trim()` | handleReject · l.180 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleReject · l.190 |
| success | «Solicitud rechazada correctamente» |  | handleReject · l.211 |
| error | «{errorMessage}» |  | handleReject · l.221 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar solicitudes de cambio» | `throw (shown by whoever catches it)` | `!response.ok` | fetchEditRequests · l.112 |
| «Error al aprobar solicitud» | `throw (shown by whoever catches it)` | `!response.ok` | handleApprove · l.156 |
| «Error al rechazar solicitud» | `throw (shown by whoever catches it)` | `!response.ok` | handleReject · l.208 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.73 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.83 |
| `/login` | `router.push` |  | initializeAuth · l.88 |
| `/login` | `router.push` |  | handleLogout · l.126 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.78 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | SessionApprovalsPage · l.304 |
| `MainLayout` |  | `isNuevo && user && isAdmin` |  | SessionApprovalsPage · l.316 |
| `ApprovalsNuevo` |  | `isNuevo && user && isAdmin` |  | SessionApprovalsPage · l.317 |
| `MainLayout` |  |  |  | SessionApprovalsPage · l.335 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (6)

| Name | Texts | Where |
|---|---|---|
| `errorMessage` | «Error al cargar solicitudes de cambio» | fetchEditRequests · l.119 |
| `errorMessage` | «Error al aprobar solicitud» | handleApprove · l.168 |
| `errorMessage` | «Error al rechazar solicitud» | handleReject · l.220 |
| `labels` | «Fecha», «Hora de inicio», «Hora de término», «Modalidad», «Comunidad de crecimiento», «Escuela» | formatFieldLabel · l.228 |
| `modalityLabels` | «Presencial», «En línea», «Híbrida» | formatValue · l.291 |
| `formatValue()` | «No definido» | formatValue · l.280 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | SessionApprovalsPage · l.106 |
| «Pendientes» | SessionApprovalsPage · l.349 |
| «Aprobadas» | SessionApprovalsPage · l.350 |
| «Rechazadas» | SessionApprovalsPage · l.351 |
| «Todas» | SessionApprovalsPage · l.352 |

**Values shown from data** (5)

- `{format(parseISO(request.created_at)…}` — SessionApprovalsPage · l.413, when `!(editRequests.length === 0) && each editRequests`
- `{formatFieldLabel(field)} :` — SessionApprovalsPage · l.448, when `!(editRequests.length === 0) && each editRequests && each Object.keys(parsedChanges)`
- `{formatValue(field, change.old)}` — SessionApprovalsPage · l.450, when `!(editRequests.length === 0) && each editRequests && each Object.keys(parsedChanges)`
- `{formatValue(field, change.new)}` — SessionApprovalsPage · l.452, when `!(editRequests.length === 0) && each editRequests && each Object.keys(parsedChanges)`
- `{request.reason}` — SessionApprovalsPage · l.465, when `!(editRequests.length === 0) && each editRequests && request.reason`

**Other texts on screen** (8)

- «Cargando...» — SessionApprovalsPage · l.306, when `loading`
- «Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores» — SessionApprovalsPage · l.341
- «No hay solicitudes pendientes / No hay solicitudes aprobadas / No hay solicitudes rechazadas / No hay solicitudes de cambio» — SessionApprovalsPage · l.377, when `editRequests.length === 0`
- «Fecha de sesión: {format(parseISO(request.consultor_s…} / N/A» — SessionApprovalsPage · l.397, when `!(editRequests.length === 0) && each editRequests`
- «Solicitado por: {request.profiles.first_name} {request.profiles.last_name} / Usuario desconocido» — SessionApprovalsPage · l.406, when `!(editRequests.length === 0) && each editRequests`
- «Pendiente / Aprobada / Rechazada» — SessionApprovalsPage · l.416, when `!(editRequests.length === 0) && each editRequests`
- «Formato de cambios inválido» — SessionApprovalsPage · l.441, when `!(editRequests.length === 0) && each editRequests && Object.keys(parsedChanges).length === 0`
- «Notas (opcional para aprobar, requerido para rechazar)» (label) — SessionApprovalsPage · l.472, when `!(editRequests.length === 0) && each editRequests && request.status === 'pending'`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/sessions/admin-nuevo/ApprovalsNuevo.tsx`
- `components/sessions/admin-nuevo/adminNuevoStyles.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Tabs.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/sessions/edit-requests` | GET | `pages/admin/sessions/approvals.tsx:104` |
| `/api/sessions/edit-requests/[eid]` | PUT | `pages/admin/sessions/approvals.tsx:142`, `pages/admin/sessions/approvals.tsx:194` |

## /admin/sessions/create

File `pages/admin/sessions/create.tsx` · 90 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `pages/admin/sessions/index.tsx:522`, `pages/admin/sessions/index.tsx:643`
- Tests: browser tests that CI runs: `tests/e2e/look-sessions.spec.ts`; browser tests CI skips: `tests/e2e/reservation.spec.ts`; unit tests of the page: `__tests__/pages/admin/sessions/create-earliest-date.test.tsx`, `__tests__/pages/admin/sessions/create-timezone.test.tsx`, `__tests__/pages/admin/sessions/create-zoom-managed.test.tsx`, `__tests__/pages/admin/sessions/create.clasico.test.tsx`, `__tests__/pages/admin/sessions/create.nuevo.test.tsx`, `__tests__/pages/admin/sessions/create.sameForm.test.tsx`.
- QA scenarios that name this address: consultor 1, lider_comunidad 1, director 1, supervisor 1, docente 1.

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

### Approved changes (decided by Brent with the mock-ups; not losses)

- New shape: six numbered cards. New section titles «Colegio y consultores», «Datos de la sesión», «Fecha y hora», «Horas y contrato» («Tipo de sesión» with the series box and «Modalidad» are today's). (crear-sesion.md 'Changed on purpose', Shape and 'New texts' bullet 1; approved by Brent 13 Nov 2026 10:32)
- New «Resumen» card holding the buttons, in view on the right from 1024 px and last on a phone. New texts: «Resumen», «Colegio», «Comunidad», «Consultores», «Fecha» / «Fechas», «Sesiones», «Horario», «Modalidad», «Horas», «· principal», «· Zoom», «{k} en fin de semana», «Sin seguimiento de horas». (crear-sesion.md 'Changed on purpose', Shape and 'New texts' bullet 5; approved by Brent 13 Nov 2026 10:32)
- Checks: all 12 show next to their field and together in a red box at the top with links to each field; none is a toast any more, and all failures show at once (today only the first). New text: «Revise lo siguiente antes de continuar:». (crear-sesion.md 'Changed on purpose', Checks and 'New texts' bullet 3; approved by Brent 13 Nov 2026 10:32)
- Type and contract: choosing only one is still refused with today's message, now also shown under the two selects, and section 6 says the rule up front. New text: «Elija ambos para registrar las horas, o deje los dos vacíos.» (crear-sesion.md 'Changed on purpose', Type and contract and 'New texts' bullet 2; approved by Brent 13 Nov 2026 10:32)
- The browser confirm() becomes a pop-up: title = the question of today's text, body «Se notificará a los participantes.» plus a short summary; its main button carries the same label as the page's. (crear-sesion.md 'Changed on purpose', Confirmation; approved by Brent 13 Nov 2026 10:32)
- The page is a real form: Enter opens the confirmation. (crear-sesion.md 'Changed on purpose', Behaviour; approved by Brent 13 Nov 2026 10:32)
- Changing the school also clears the community (today it stays and the server refuses it). (crear-sesion.md 'Changed on purpose', Behaviour; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:32 (told it changes behaviour))
- The earliest allowed date is today in Chile, not the UTC date. (crear-sesion.md 'Changed on purpose', Behaviour; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:32 (told it changes behaviour))
- «Consultor principal» is a radio: exactly one consultant can be lead and unticking is impossible. Removing the lead still leaves none. (crear-sesion.md 'Changed on purpose', Behaviour; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:32 (told it changes behaviour))
- The bare «Externo» / «Interno» toggle becomes a labelled two-option switch. New screen-reader labels: «Tipo de consultor de {nombre}», and «Fecha {n}» for custom date rows. (crear-sesion.md 'Changed on purpose', Behaviour and 'New texts' bullet 6; approved by Brent 13 Nov 2026 10:32)
- Modality label «Hibrida» becomes «Híbrida». (crear-sesion.md 'Changed on purpose', Wording and look; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:32)
- Hour numbers use a decimal comma (42,5) instead of a dot. (crear-sesion.md 'Changed on purpose', Wording and look; approved by Brent 13 Nov 2026 10:32)
- The hours chip and the series box become the shared notice pieces (the series box no longer blue: grey with a black left border). (crear-sesion.md 'Changed on purpose', Wording and look; approved by Brent 13 Nov 2026 10:32)
- New breadcrumbs «Sesiones › Programar Sesión» (today none). (crear-sesion.md 'Changed on purpose', Frame; approved by Brent 13 Nov 2026 10:32)
- New small «Cancelar» under the two save buttons (today there is none). (crear-sesion.md 'Changed on purpose', Frame and 'New texts' bullet 6; approved by Brent 13 Nov 2026 10:32)
- Loading and access denied are shown inside the frame (skeleton cards; «Acceso Denegado» in an empty-state card). (crear-sesion.md 'Changed on purpose', Frame; approved by Brent 13 Nov 2026 10:32)
- The summary shows the hours of one session and the series total, with a warning when the total exceeds the hours available. New texts: «{h} h por sesión · {total} h en total», «Más de lo disponible en este tipo ({n} h)». (crear-sesion.md 'Changed on purpose', Summary hours and 'New texts' bullet 5; approved by Brent 13 Nov 2026 10:32)
- If creating works but approving fails, a notice says the drafts already exist. New texts: «Las sesiones quedaron guardadas como borrador. Revise la lista de sesiones antes de volver a programar, para no crearlas dos veces.» / «La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.» (crear-sesion.md 'Changed on purpose', Approval failure and 'New texts' bullet 4; approved by Brent 13 Nov 2026 10:32)

### Notes

- The eight sample-state strips are folded into one closed block «Maqueta · estados de muestra» at the foot; a mock-up tool, not design. (crear-sesion.md 'Changed on purpose', 'By the phase 1 session')
- No place in the mock-up, must survive: the redirects to /login and /dashboard, the request body, and the fields the form never sends (program_enrollment_id, attendees). (crear-sesion.md 'No place in the mock-up')

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `!isAdmin` | SessionCreatePage · l.61 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading && isNuevo` |  | SessionCreatePage · l.24 |
| `SessionCreateSkeleton` |  | `loading && isNuevo` |  | SessionCreatePage · l.32 |
| `MainLayout` |  | `!isAdmin && isNuevo` |  | SessionCreatePage · l.46 |
| `SessionCreateDenied` |  | `!isAdmin && isNuevo` |  | SessionCreatePage · l.54 |
| `MainLayout` |  |  |  | SessionCreatePage · l.72 |
| `SessionCreateNuevo` |  | `isNuevo` |  | SessionCreatePage · l.81 |
| `SessionCreateClasico` |  | `!(isNuevo)` |  | SessionCreatePage · l.83 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `BREADCRUMBS_NUEVO` | «Sesiones», «Programar Sesión» | l.10 |

**Other texts on screen** (1)

- «No tiene permisos para acceder a esta página.» — SessionCreatePage · l.62, when `!isAdmin`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/SessionCreateClasico.tsx`
- `components/sessions/SessionCreateNuevo.tsx`
- `components/sessions/create-nuevo/ConsultantsNuevo.tsx`
- `components/sessions/create-nuevo/HoursNuevo.tsx`
- `components/sessions/create-nuevo/RecurrenceNuevo.tsx`
- `components/sessions/create-nuevo/SectionNuevo.tsx`
- `components/sessions/create-nuevo/SessionCreateStates.tsx`
- `components/sessions/create-nuevo/SummaryNuevo.tsx`
- `components/sessions/create-nuevo/createNuevoText.ts`
- `components/sessions/create-nuevo/fieldRow.ts`
- `components/sessions/sessionCreateChecks.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `hooks/useSessionCreate.ts`
- `lib/utils/recurrence.ts`
- `lib/utils/session-timezone.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultants` | GET | `hooks/useSessionCreate.ts:226` |
| `/api/hour-types` | GET | `hooks/useSessionCreate.ts:266` |
| `/api/sessions` | POST | `hooks/useSessionCreate.ts:559`, `hooks/useSessionCreate.ts:660` |
| `/api/sessions/[id]/approve` | POST | `hooks/useSessionCreate.ts:703` |
| `/api/sessions/bulk-approve` | POST | `hooks/useSessionCreate.ts:680` |

## /admin/sessions

File `pages/admin/sessions/index.tsx` · 1261 lines · frame: MainLayout

### Who reaches it

- Menu: Consultorías › «Sesiones» → `/admin/sessions` — admin only; the group: admin or consultor (`Sidebar.tsx` l.492)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.177 `router.push → /login  (when !session?.user)`
  - l.182 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.187 `router.push → /dashboard  (when !isAdminUser)`
  - l.192 `router.push → /login`
  - l.418 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:494`, `components/sessions/SessionCreateNuevo.tsx:534`, `components/sessions/admin-nuevo/adminNuevoStyles.ts:10`, `hooks/useSessionCreate.ts:582`, `hooks/useSessionCreate.ts:696`, `pages/admin/sessions/create.tsx:10`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/admin/sessions/adminList.ledgerRead.test.tsx`, `__tests__/pages/admin/sessions/adminList.sameRequests.test.tsx`, `__tests__/pages/admin/sessions/adminList.views.test.tsx`.
- QA scenarios that name this address: admin 5, consultor 4, lider_comunidad 6, director 1, supervisor 1, docente 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | no | sent to /dashboard |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `!isAdmin` | SessionsPage · l.498 |
| «Cancelar Sesión» | h2 | `showCancelModal` | clasicoView · l.766 |
| «{format(currentDate, 'MMMM yyyy', { …}» | h3 |  | MonthView · l.1028 |
| «{format(weekStart, 'dd MMM', { local…} - {format(weekEnd, 'dd MMM yyyy', { lo…}» | h3 |  | WeekView · l.1149 |
| «{format(day, 'EEEE, dd MMMM', { loca…}» | h4 | `each weekDays` · screen size: `md:hidden` | WeekView · l.1168 |
| «{format(day, 'EEEE, dd MMMM', { loca…}» | h4 | `each weekDays` · screen size: `hidden md:block` | WeekView · l.1216 |

**Buttons** (16)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Lista» | `{() => setViewMode('list')}` |  |  |  | clasicoView · l.606 |
| «Mes» | `{() => setViewMode('month')}` |  |  |  | clasicoView · l.617 |
| «Semana» | `{() => setViewMode('week')}` |  |  |  | clasicoView · l.628 |
| «Nueva Sesión» | `{() => router.push('/admin/sessions/create')}` |  |  |  | clasicoView · l.642 |
| «Cerrar» | `{() => { setShowCancelModal(false); setCancellationReason(''); setSelectedSessio…}` | `showCancelModal` | `{actionInProgress}` |  | clasicoView · l.780 |
| «Confirmar Cancelación» | `{handleCancelSubmit}` | `showCancelModal` | `{actionInProgress \|\| !cancellationReason.trim()}` |  | clasicoView · l.791 |
| «[icon MoreVertical]» | `{(e) => { e.stopPropagation(); setDropdownOpen(dropdownOpen === session.id ? nul…}` | `!(sessions.length === 0) && each sessions` |  |  | ListView · l.944 |
| «Ver detalle» | `{(e) => { e.stopPropagation(); handleViewSession(session.id); setDropdownOpen(nu…}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id` |  |  | ListView · l.955 |
| «Aprobar» | `{(e) => { e.stopPropagation(); handleApprove(session.id); setDropdownOpen(null);…}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && ((session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion'))` |  |  | ListView · l.967 |
| «Cancelar» | `{(e) => { e.stopPropagation(); handleCancelClick(session.id); setDropdownOpen(nu…}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && session.status !== 'completada' && session.status !== 'cancelada'` |  |  | ListView · l.980 |
| «[icon ChevronLeft]» | `{() => setCurrentDate(addMonths(currentDate, -1))}` |  |  |  | MonthView · l.1022 |
| «[icon ChevronRight]» | `{() => setCurrentDate(addMonths(currentDate, 1))}` |  |  |  | MonthView · l.1031 |
| «{formatTime(session.start_time)} {session.title}» · tooltip «{session.title}» | `{() => handleViewSession(session.id)}` | `each days && each daySessions.slice(0, 2)` · screen size: `hidden md:grid` |  |  | MonthView · l.1090 |
| «+ {daySessions.length - 2} más» | `{() => { // Set filter to show only this day's sessions handleFilterChange('date…}` | `each days && daySessions.length > 2` · screen size: `hidden md:grid` |  |  | MonthView · l.1106 |
| «[icon ChevronLeft]» | `{() => setCurrentDate(addWeeks(currentDate, -1))}` |  |  |  | WeekView · l.1143 |
| «[icon ChevronRight]» | `{() => setCurrentDate(addWeeks(currentDate, 1))}` |  |  |  | WeekView · l.1152 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Exportar Calendario» | `/api/sessions/ical?[*]` | `sessions.length > 0` |  | clasicoView · l.659 |

**Other things that react to a click** (4)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{formatDateShort(session.session_dat…} {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) {sessi…» | `{() => handleViewSession(session.id)}` | `!(sessions.length === 0) && each sessions` | ListView · l.899 |
| `div` | «{session.title} {getStatusBadge(session.status)} {formatDateShort(session.session_dat…} • {formatTime(session.start_tim…» | `{() => handleViewSession(session.id)}` | `!(sessions.length === 0) && each sessions` · screen size: `md:hidden` | MonthView · l.1045 |
| `div` | «{session.title} [{getSeriesInfo(session)}] {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) \| …» | `{() => handleViewSession(session.id)}` | `each weekDays && !(daySessions.length === 0) && each daySessions` · screen size: `md:hidden` | WeekView · l.1176 |
| `div` | «{session.title} [{getSeriesInfo(session)}] {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) \| …» | `{() => handleViewSession(session.id)}` | `each weekDays && !(daySessions.length === 0) && each daySessions` · screen size: `hidden md:block` | WeekView · l.1224 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Todos los colegios», «(lista) {school.name}» |  |  | clasicoView · l.672 |
|  | select |  | «Todas las comunidades», «(lista) {community.name}» |  |  | clasicoView · l.685 |
|  | select |  | «Todos los consultores», «(lista) {consultant.first_name} {consultant.last_name}» |  |  | clasicoView · l.698 |
|  | select |  | «Todos los estados», «Borrador», «Pendiente Aprobación», «Programada», «En Progreso», «Pendiente Informe», «Completada», «Cancelada» |  |  | clasicoView · l.711 |
| «Desde» | date | «Desde» |  | `viewMode === 'list'` |  | clasicoView · l.728 |
| «Hasta» | date | «Hasta» |  | `viewMode === 'list'` |  | clasicoView · l.736 |
| «Razón de cancelación...» | textarea | «Razón de cancelación...» |  | `showCancelModal` |  | clasicoView · l.772 |

**Table columns** (9)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» |  | ListView · l.879 |
| «Hora» |  | ListView · l.880 |
| «Título» |  | ListView · l.881 |
| «Colegio» |  | ListView · l.882 |
| «Comunidad» |  | ListView · l.883 |
| «Consultor(es)» |  | ListView · l.884 |
| «Estado» |  | ListView · l.885 |
| «Serie» |  | ListView · l.886 |
| «Acciones» |  | ListView · l.887 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Cancelar Sesión» | written in this file | `showCancelModal` |  | clasicoView · l.760 |
| «Cancelar Sesión» | written in this file | `showCancelModal` |  | clasicoView · l.761 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar sesiones» |  | fetchSessions · l.319 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleApprove · l.339 |
| success | «Sesión aprobada exitosamente» |  | handleApprove · l.356 |
| error | «Error al aprobar sesión» |  | handleApprove · l.361 |
| error | «Debe ingresar una razón de cancelación» | `!selectedSessionId \|\| !cancellationReason.trim()` | handleCancelSubmit · l.374 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleCancelSubmit · l.384 |
| success | «Sesión cancelada exitosamente» |  | handleCancelSubmit · l.402 |
| error | «Error al cancelar sesión» |  | handleCancelSubmit · l.410 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar sesiones» | `throw (shown by whoever catches it)` | `!response.ok` | fetchSessions · l.311 |
| «Error al aprobar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleApprove · l.353 |
| «Error al cancelar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleCancelSubmit · l.399 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar Calendario` | `sessions.length > 0` | clasicoView · l.659 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `{{ pathname: router.pathname, query }}` | `router.replace` |  | SessionsPage · l.168 |
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.177 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.187 |
| `/login` | `router.push` |  | initializeAuth · l.192 |
| `/admin/sessions/[*]` | `router.push` |  | handleViewSession · l.329 |
| `/login` | `router.push` |  | handleLogout · l.418 |
| `/admin/sessions/create` | `router.push` |  | SessionsPage · l.522 |
| `/admin/sessions/create` | `router.push` |  | clasicoView · l.643 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.182 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!data` | ListView · l.833 |
| `!dropdownOpen` | ListView · l.849 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | nuevoView · l.545 |
| `AdminSessionsListNuevo` |  |  |  | nuevoView · l.553 |
| `AdminSessionsRowsNuevo` |  | `viewMode === 'list' && listHost && view === 'nuevo'` |  | keptRows · l.563 |
| `MainLayout` |  |  |  | clasicoView · l.570 |
| `ResponsiveFunctionalPageHeader` | title: Sesiones de Consultoría · subtitle: Gestión de sesiones con consultores externos e internos |  |  | clasicoView · l.578 |
| `FollowedView` |  |  |  | SessionsPage · l.805 |

**Other texts written in the code (safety net: not tied to an element by the script)** (8)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | SessionsPage · l.235 |
| «Lun» | SessionsPage · l.1068 |
| «Mar» | SessionsPage · l.1068 |
| «Mié» | SessionsPage · l.1068 |
| «Jue» | SessionsPage · l.1068 |
| «Vie» | SessionsPage · l.1068 |
| «Sáb» | SessionsPage · l.1068 |
| «Dom» | SessionsPage · l.1068 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (8)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('click')` | ListView · l.861 |
| listener | `document.addEventListener('keydown')` | ListView · l.863 |
| address value | `?consultant_id` | l.1 |
| address value | `?date_from` | l.1 |
| address value | `?date_to` | l.1 |
| address value | `?growth_community_id` | l.1 |
| address value | `?school_id` | l.1 |
| address value | `?status` | l.1 |

**Values shown from data** (19)

- `{badge.label}` — getStatusBadge · l.424
- `{stats.total}` — clasicoView · l.589
- `{stats.programada}` — clasicoView · l.593
- `{stats.pendiente}` — clasicoView · l.597
- `{formatDateShort(session.session_dat…}` — ListView · l.904, when `!(sessions.length === 0) && each sessions`
- `{session.title}` — ListView · l.911, when `!(sessions.length === 0) && each sessions`
- `{session.schools?.name} / -` — ListView · l.914, when `!(sessions.length === 0) && each sessions`
- `{session.growth_communities?.name} / -` — ListView · l.917, when `!(sessions.length === 0) && each sessions`
- `{getFacilitatorNames(session.session…}` — ListView · l.920, when `!(sessions.length === 0) && each sessions`
- `{getStatusBadge(session.status)} [{(() => { const ledger = cancellatio…}]` — ListView · l.924, when `!(sessions.length === 0) && each sessions`
- `{session.title}` — MonthView · l.1051, when `!(sessions.length === 0) && each sessions`, screen size: `md:hidden`
- `{formatDateShort(session.session_dat…} • {formatTime(session.start_time)} - {formatTime(session.end_time)}` — MonthView · l.1054, when `!(sessions.length === 0) && each sessions`, screen size: `md:hidden`
- `{session.schools?.name}` — MonthView · l.1057, when `!(sessions.length === 0) && each sessions`, screen size: `md:hidden`
- `{day}` — MonthView · l.1069, when `each ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']`, screen size: `hidden md:grid`
- `{day.getDate()}` — MonthView · l.1087, when `each days`, screen size: `hidden md:grid`
- `{session.title}` — WeekView · l.1184, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `md:hidden`
- `{getStatusBadge(session.status)}` — WeekView · l.1197, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `md:hidden`
- `{session.title}` — WeekView · l.1232, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `hidden md:block`
- `{getStatusBadge(session.status)}` — WeekView · l.1245, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `hidden md:block`

**Other texts on screen** (13)

- «No tiene permisos para acceder a esta página.» — SessionsPage · l.499, when `!isAdmin`
- «Total Sesiones» — clasicoView · l.588
- «Programadas» — clasicoView · l.592
- «Pendientes» — clasicoView · l.596
- «Filtros» — clasicoView · l.656
- «Por favor, ingrese la razón de la cancelación:» — clasicoView · l.770, when `showCancelModal`
- «No se encontraron sesiones» — ListView · l.894, when `sessions.length === 0`
- «(Chile)» — ListView · l.909, when `!(sessions.length === 0) && each sessions`
- «No hay sesiones este mes» — MonthView · l.1042, when `sessions.length === 0`, screen size: `md:hidden`
- «No hay sesiones» — WeekView · l.1172, when `each weekDays && daySessions.length === 0`, screen size: `md:hidden`
- «(Chile)» — WeekView · l.1194, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `md:hidden`
- «No hay sesiones programadas» — WeekView · l.1220, when `each weekDays && daySessions.length === 0`, screen size: `hidden md:block`
- «(Chile)» — WeekView · l.1242, when `each weekDays && !(daySessions.length === 0) && each daySessions`, screen size: `hidden md:block`

**Reads and writes the database directly:** `table:contract_hours_ledger` (select), `table:growth_communities` (select), `table:schools` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/admin-nuevo/AdminSessionsListNuevo.tsx`
- `components/sessions/admin-nuevo/adminNuevoStyles.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/consultants` | GET | `pages/admin/sessions/index.tsx:233` |
| `/api/sessions` | GET | `pages/admin/sessions/index.tsx:304` |
| `/api/sessions/[id]/approve` | POST | `pages/admin/sessions/index.tsx:343` |
| `/api/sessions/[id]/cancel` | POST | `pages/admin/sessions/index.tsx:388` |
| `/api/sessions/ical` | ? | `components/sessions/admin-nuevo/AdminSessionsListNuevo.tsx:544`, `pages/admin/sessions/index.tsx:660` |
| `/api/sessions/stats` | GET | `pages/admin/sessions/index.tsx:255` |

## /consultor/sessions/[id]

File `pages/consultor/sessions/[id].tsx` · 170 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/dashboard/unified/UpcomingSessionsCard.tsx:77`, `components/sessions/SessionsListNuevo.tsx:101`, `components/sessions/SessionsListNuevo.tsx:102`, `components/workspace/WorkspaceSessionsTab.tsx:264`, `components/workspace/WorkspaceSessionsTab.tsx:268`, `hooks/useSessionsList.ts:326`, `lib/notifications/catalog.ts:197`, `pages/consultor/sessions/reports.tsx:368`, `pages/consultor/sessions/reports.tsx:861`, `pages/consultor/sessions/reports.tsx:865`
- Tests: browser tests that CI runs: `tests/e2e/look-sessions.spec.ts`; browser tests CI skips: `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/session-reminders.spec.ts`; unit tests of the page: `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.latch.test.tsx`, `__tests__/pages/consultor/sessions/detail.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx`, `__tests__/pages/consultor/sessions/detail.test.tsx`.
- QA scenarios that name this address: lider_comunidad 1.

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

- «Finalizar Sesión» is the one yellow button, inside a visible checklist card; missing conditions are always shown instead of a hover box. The card and its disabled button also appear while the session is «En Progreso» (today only at «Pendiente Informe»). New texts: «Para finalizar la sesión», «Condiciones faltantes: {n}», met-condition lines «Sesión en estado "Pendiente de Informe"», «Informe de sesión creado», «Asistencia marcada para todos». (sesiones.md 'Changed on purpose', B bullet 1 and 'New texts' B bullet 1; LEDGER Brent's decisions, approved by Brent 13 Nov 2026 10:02 (the «En Progreso» card was told to him))
- The reason «Solicitar Cambios» is disabled while a request is pending («Ya existe una solicitud de cambio pendiente para esta sesión.») is visible text under the button, not a hover box. (sesiones.md 'Changed on purpose', B bullet 2; approved by Brent 13 Nov 2026 10:02)
- The edit-request history moves from above the tabs into the «Actividad» tab. New text: heading «Actividad» over the activity list when the history is shown above it. (sesiones.md 'Changed on purpose', B bullet 3 and 'New texts' B bullet 4; approved by Brent 13 Nov 2026 10:02)
- New breadcrumbs «Mi Trabajo › Mis Sesiones › {title}» give a way back to the list. (sesiones.md 'Changed on purpose', B bullet 4; approved by Brent 13 Nov 2026 10:02)
- Header Spain time: «13:00 (hora España) - 14:00 (hora España)» becomes the modal's shorter line, e.g. «En España: 13:30 a 15:00 (hora España)». (sesiones.md 'Changed on purpose', B bullet 5; approved by Brent 13 Nov 2026 10:02)
- Arrival status in read mode is in Spanish: «On time» becomes «A tiempo», plus «Tarde», «Salió temprano». (sesiones.md 'Changed on purpose', B bullet 6; approved by Brent 13 Nov 2026 10:02)
- Modality «Hibrida» becomes «Híbrida». (sesiones.md 'Changed on purpose', B bullet 6; approved by Brent 13 Nov 2026 10:02)
- Edit-request history values are formatted (dates «13 noviembre 2026», times HH:MM, modality words) instead of raw values. (sesiones.md 'Changed on purpose', B bullet 6; approved by Brent 13 Nov 2026 10:02)
- Activity actions in Spanish instead of raw English (e.g. «Status changed»). New texts: «Sesión creada», «Sesión vista», «Sesión editada», «Cambio de estado», «Material subido», «Material eliminado», «Informe registrado», «Informe actualizado», «Asistencia registrada», «Asistencia actualizada», «Comunicación agregada», «Cambio solicitado», «Cambio aprobado», «Cambio rechazado», «Aprobación de cambio bloqueada», «Facilitadores actualizados», «Sesión cancelada», «Sesión finalizada». (sesiones.md 'Changed on purpose', B bullet 6 and 'New texts' B bullet 3; approved by Brent 13 Nov 2026 10:02)
- «Guardar asistencia», «Subir material», «Crear» / «Actualizar» are black, not yellow; «Finalizar» in its pop-up is yellow (green today). Status colours follow the palette: no green, orange or blue buttons. (sesiones.md 'Changed on purpose', B bullet 7; approved by Brent 13 Nov 2026 10:02)
- The materials table stacks on phones and icon buttons have labels. New aria-labels / titles: «Abrir {archivo}», «Eliminar {archivo}», «Asistió: {nombre}», «Estado de llegada: {nombre}», «Notas: {nombre}», screen-reader «Sí» / «No». (sesiones.md 'Changed on purpose', B bullet 8 and 'New texts' B bullet 2 (labels); approved by Brent 13 Nov 2026 10:02)
- The material delete confirm() «¿Está seguro que desea eliminar "{file_name}"?» becomes a pop-up with that text as title and a new button «Eliminar». The Finalize pop-up closes with Escape and has a close X. (sesiones.md 'Changed on purpose', B bullet 9 and 'New texts' B bullet 2 («Eliminar»); approved by Brent 13 Nov 2026 10:02)

### Notes

- «Planificación» and «Comunicaciones» stay empty placeholders as today; Brent was told so when approving. (LEDGER Brent's decisions, 13 Nov 2026 10:02)
- Mock-up-only texts, not for the build: sample server message «No se pudo transcribir el archivo de prueba.»; toasts «Maqueta: aquí se abre la página para unirse a la sesión.», «Maqueta: aquí se descarga el archivo .ics de esta sesión.», «Maqueta: aquí se abre el archivo en otra pestaña.» (sesiones.md 'New texts', B bullet 5)

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso denegado» | h2 | `fetchError === 'forbidden'` | SessionDetailScreen · l.72 |
| «Sesión no encontrada» | h2 | `fetchError === 'not_found' \|\| !session` | SessionDetailScreen · l.84 |
| «Finalizar Sesión» | h3 | `!(picked === 'nuevo') && showFinalizeModal` | SessionDetailScreen · l.130 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{closeFinalize}` | `picked === 'nuevo'` | `{finalizing}` |  | SessionDetailScreen · l.114 |
| «Finalizando... / Finalizar» | `{handleFinalize}` | `picked === 'nuevo'` | `{finalizing}` |  | SessionDetailScreen · l.117 |
| «Cancelar» | `{closeFinalize}` | `!(picked === 'nuevo') && showFinalizeModal` | `{finalizing}` |  | SessionDetailScreen · l.135 |
| «Finalizando... / Finalizar» | `{handleFinalize}` | `!(picked === 'nuevo') && showFinalizeModal` | `{finalizing}` |  | SessionDetailScreen · l.142 |

**Pop-ups** (3)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{showFinalizeModal}` | title: Finalizar Sesión | SessionDetailScreen · l.106 |
| «Finalizar Sesión» | written in this file | `!(picked === 'nuevo') && showFinalizeModal` |  | SessionDetailScreen · l.128 |
| `EditRequestModal` | component | `showEditRequestModal && session` |  | SessionDetailScreen · l.157 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | SessionDetailScreen · l.59 |
| `MainLayout` |  | `fetchError === 'forbidden'` |  | SessionDetailScreen · l.69 |
| `MainLayout` |  | `fetchError === 'not_found' \|\| !session` |  | SessionDetailScreen · l.81 |
| `MainLayout` |  |  |  | SessionDetailScreen · l.95 |
| `SessionDetailNuevo` |  | `picked === 'nuevo'` |  | SessionDetailScreen · l.98 |
| `SessionDetailClasico` |  | `!(picked === 'nuevo')` |  | SessionDetailScreen · l.100 |
| `CheckCircle2` | aria-hidden: true | `picked === 'nuevo'` |  | SessionDetailScreen · l.118 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `CRUMBS_NUEVO` | «Mi Trabajo», «Mis Sesiones» | l.13 |

**Other texts on screen** (5)

- «Cargando...» — SessionDetailScreen · l.61, when `loading`
- «No tiene permisos para ver esta sesión.» — SessionDetailScreen · l.73, when `fetchError === 'forbidden'`
- «La sesión solicitada no existe o fue eliminada.» — SessionDetailScreen · l.85, when `fetchError === 'not_found' \|\| !session`
- «¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.» — SessionDetailScreen · l.124, when `picked === 'nuevo'`
- «¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.» — SessionDetailScreen · l.132, when `!(picked === 'nuevo') && showFinalizeModal`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/sessions/AttendanceSuggestionsPanel.tsx`
- `components/sessions/AudioPlayer.tsx`
- `components/sessions/AudioReportUploader.tsx`
- `components/sessions/EditRequestModal.tsx`
- `components/sessions/SessionDetailClasico.tsx`
- `components/sessions/SessionDetailNuevo.tsx`
- `components/sessions/detail-nuevo/ActivityNuevo.tsx`
- `components/sessions/detail-nuevo/AttendanceNuevo.tsx`
- `components/sessions/detail-nuevo/HeaderNuevo.tsx`
- `components/sessions/detail-nuevo/MaterialsNuevo.tsx`
- `components/sessions/detail-nuevo/ReportNuevo.tsx`
- `components/sessions/sessionTextNuevo.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/Table.tsx`
- `components/ui/kit/Tabs.tsx`
- `hooks/useSessionDetail.ts`
- `lib/services/audio-transcription.ts`
- `lib/utils/session-timezone.ts`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/sessions/[id]` | GET | `hooks/useSessionDetail.ts:127` |
| `/api/sessions/[id]/attendance-suggestions` | GET | `components/sessions/AttendanceSuggestionsPanel.tsx:55` |
| `/api/sessions/[id]/attendees` | PUT | `components/sessions/AttendanceSuggestionsPanel.tsx:117`, `hooks/useSessionDetail.ts:307` |
| `/api/sessions/[id]/audio-report` | POST | `components/sessions/AudioReportUploader.tsx:114` |
| `/api/sessions/[id]/edit-requests` | POST | `hooks/useSessionDetail.ts:568` |
| `/api/sessions/[id]/finalize` | POST | `hooks/useSessionDetail.ts:503` |
| `/api/sessions/[id]/ical` | ? | `components/sessions/SessionDetailClasico.tsx:714`, `components/sessions/detail-nuevo/HeaderNuevo.tsx:116` |
| `/api/sessions/[id]/materials` | POST | `hooks/useSessionDetail.ts:422` |
| `/api/sessions/[id]/materials/[mid]` | DELETE | `hooks/useSessionDetail.ts:470` |
| `/api/sessions/[id]/reports` | ? | `hooks/useSessionDetail.ts:356` |
| `/api/sessions/[id]/reports/[rid]` | GET | `hooks/useSessionDetail.ts:222`, `hooks/useSessionDetail.ts:355` |

## /consultor/sessions

File `pages/consultor/sessions/index.tsx` · 45 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Trabajo › «Mis Sesiones» → `/consultor/sessions` — admin or consultor; the group: admin or consultor (`Sidebar.tsx` l.178)
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/dashboard/unified/UpcomingSessionsCard.tsx:81`, `components/layout/Sidebar.tsx:180`, `lib/notificationEvents.ts:488`, `lib/notificationEvents.ts:525`, `lib/notificationEvents.ts:543`, `lib/notificationEvents.ts:576`, `lib/notificationEvents.ts:590`, `lib/notificationEvents.ts:605`, `lib/notificationEvents.ts:619`, `lib/notifications/catalog.ts:184`, `lib/notifications/catalog.ts:232`, `pages/consultor/sessions/[id].tsx:13`
- Tests: browser tests that CI runs: `tests/e2e/look-sessions.spec.ts`; unit tests of the page: `__tests__/pages/consultor/sessions/list.clasico.test.tsx`, `__tests__/pages/consultor/sessions/list.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/list.sameList.test.tsx`, `__tests__/pages/consultor/sessions/list.test.tsx`.
- QA scenarios that name this address: consultor 8, lider_comunidad 3, director 1, supervisor 1, docente 1.

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

### Approved changes (decided by Brent with the mock-ups; not losses)

- The two columns become two tabs «Mis Sesiones» / «Otras Sesiones en Mis Colegios», each with its count; each list has the full width. (sesiones.md 'Changed on purpose', A bullet 1; approved by Brent 13 Nov 2026 10:02)
- Sessions are agenda rows (date block with weekday, day, month, start time) instead of cards, and rows are real links reachable by keyboard. New text: «Hoy» in the date block of today's rows. (sesiones.md 'Changed on purpose', A bullet 2 and 'New texts' A; approved by Brent 13 Nov 2026 10:02)
- Grouping changes from one heading per date, newest first (e.g. «jueves, 13 noviembre 2026») to «Esta semana» (ascending), «Próximas» (ascending), «Pasadas» (newest first). New texts: «Esta semana», «Próximas», «Pasadas». (sesiones.md 'Changed on purpose', A bullet 3 and 'New texts' A; approved by Brent 13 Nov 2026 10:02)
- «Otras Sesiones…» rows are no longer dimmed. (sesiones.md 'Changed on purpose', A bullet 4; approved by Brent 13 Nov 2026 10:02)
- «Pendiente Informe» and «En Progreso» rows in «Mis Sesiones» say what the session needs, using today's status helper words. (sesiones.md 'Changed on purpose', A bullet 5; approved by Brent 13 Nov 2026 10:02)
- «Exportar Calendario» moves from the filter card to the page header as a secondary button; «Cargar más» becomes an outline button (yellow kept for one main action, and the list has none). (sesiones.md 'Changed on purpose', A bullet 6; approved by Brent 13 Nov 2026 10:02)

### Notes

- screen-map.md C4 lists consultor/sessions/reports.tsx, but no link to it was found from the list or the detail screen; it has no place in these mock-ups. (sesiones.md 'Odd things' item 18)
- Mock-up-only text, not for the build: toast «Maqueta: aquí se descarga el archivo .ics con las sesiones filtradas.» (sesiones.md 'New texts', A bullet)
- The dark Variantes strips («Maqueta · …») on both session mock-ups are mock-up tools, not design. (sesiones.md 'New texts', 'Both' bullet)

### What the page file itself draws

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | ConsultorSessionsPage · l.22 |
| `MainLayout` |  |  |  | ConsultorSessionsPage · l.34 |
| `SessionsListNuevo` |  | `isNuevo` |  | ConsultorSessionsPage · l.36 |
| `SessionsListClasico` |  | `!(isNuevo)` |  | ConsultorSessionsPage · l.38 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `FRAME_NUEVO` | «Mi Trabajo», «Mis Sesiones» | l.9 |

**Other texts on screen** (1)

- «Cargando...» — ConsultorSessionsPage · l.24, when `loading`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/sessions/SessionsListClasico.tsx`
- `components/sessions/SessionsListNuevo.tsx`
- `components/sessions/sessionTextNuevo.ts`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `components/ui/kit/Badge.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Tabs.tsx`
- `hooks/useSessionsList.ts`
- `lib/tutorials/content.ts`
- `lib/utils/session-timezone.ts`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/sessions` | GET | `hooks/useSessionsList.ts:162` |
| `/api/sessions/ical` | ? | `hooks/useSessionsList.ts:318` |

## /consultor/sessions/reports

File `pages/consultor/sessions/reports.tsx` · 942 lines · frame: MainLayout

### Who reaches it

- Menu: Mi Trabajo › «Mis Reportes» → `/consultor/sessions/reports` — admin or consultor; the group: admin or consultor (`Sidebar.tsx` l.186)
- Menu: Consultorías › «Reportes» → `/consultor/sessions/reports` — admin only; the group: admin or consultor (`Sidebar.tsx` l.508)
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.283 `router.push → /login  (when !session?.user)`
  - l.287 `role = await getUserPrimaryRole(session.user.id)`
  - l.289 `router.push → /dashboard  (when !role \|\| !['admin', 'consultor'].includes(role))`
  - l.349 `isAdmin = userRole === 'admin'`
  - l.403 `router.push → /dashboard  (when error && isNuevo)`
  - l.417 `router.push → /dashboard  (when error)`
- Linked from: `components/layout/Sidebar.tsx:188`, `components/layout/Sidebar.tsx:510`, `lib/notifications/catalog.ts:184`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/consultor/sessions/reports.clasico.test.tsx`, `__tests__/pages/consultor/sessions/reports.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/reports.sameRequests.test.tsx`.
- QA scenarios that name this address: admin 5, community_manager 1, consultor 7, equipo_directivo 6, lider_comunidad 2, lider_generacion 3, supervisor_de_red 6.

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

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h2 | `error` | SessionReportsPage · l.412 |
| «Reportes de Sesiones» | h1 |  | renderHeader · l.474 |
| «Filtros» | h3 |  | renderFilters · l.499 |
| «Sesiones por Mes» | h3 |  | renderCharts · l.662 |
| «Distribución por Estado» | h3 |  | renderCharts · l.679 |
| «Distribución por Modalidad» | h3 |  | renderCharts · l.704 |
| «Tendencia de Asistencia» | h3 |  | renderCharts · l.729 |
| «Sesiones por Escuela» | h3 | `isAdmin && analyticsData.sessions_by_school.length > 0` | renderCharts · l.750 |
| «Top Consultores» | h3 | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` | renderCharts · l.777 |
| «Sesiones Recientes» | h3 |  | renderRecentSessionsTable · l.821 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Dashboard» | `{() => router.push('/dashboard')}` | `error` |  |  | SessionReportsPage · l.416 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{format(parseISO(session.session_dat…} {session.title} {session.school_name} {session.gc_name} {badge.label} {session.a…» · also `onKeyDown={(e) => { if (e.key === 'Enter' \|\| e.key === ' ') { e.preventDefault(); router.p…}` | `{() => router.push('/consultor/sessions/${session.id}')}` | `each analyticsData.recent_sessions` | renderRecentSessionsTable · l.856 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Desde» | date |  |  |  | `id=date-from (id used by code)` | renderFilters · l.504 |
| «Hasta» | date |  |  |  | `id=date-to (id used by code)` | renderFilters · l.514 |
| «Escuela» | select |  | «Todas», «(lista) {s.school_name}» |  | `id=school-filter (id used by code)` | renderFilters · l.524 |
| «Consultor» | select |  | «Todos», «(lista) {c.name}» | `isAdmin && consultants.length > 0` | `id=consultant-filter (id used by code)` | renderFilters · l.541 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» |  | renderRecentSessionsTable · l.832 |
| «Título» |  | renderRecentSessionsTable · l.835 |
| «Escuela» |  | renderRecentSessionsTable · l.838 |
| «Comunidad» |  | renderRecentSessionsTable · l.841 |
| «Estado» |  | renderRecentSessionsTable · l.844 |
| «Asistencia» |  | renderRecentSessionsTable · l.847 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error cargando datos» | `!response.ok` | fetchAnalytics · l.336 |
| error | «Error al cargar datos de reportes» |  | fetchAnalytics · l.343 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los datos del usuario» | `setError` |  | initAuth · l.296 |

**Charts** (6)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| BarChart | Bar `completed` «Completadas»; Bar `cancelled` «Canceladas»; Bar `other` «Otras» |  | renderCharts · l.664 |
| PieChart | Pie `count` (slices: one colour per data row) |  | renderCharts · l.681 |
| PieChart | Pie `count` (slices: one colour per data row) |  | renderCharts · l.706 |
| AreaChart | Area `avg_attendance_rate` «Asistencia (%)» |  | renderCharts · l.731 |
| BarChart | Bar `total` «Total»; Bar `completed` «Completadas» | `isAdmin && analyticsData.sessions_by_school.length > 0` | renderCharts · l.752 |
| BarChart | Bar `sessions_led` «Sesiones dirigidas» | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` | renderCharts · l.779 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initAuth · l.283 |
| `/dashboard` | `router.push` | `!role \|\| !['admin', 'consultor'].includes(role)` | initAuth · l.289 |
| `/consultor/sessions/[*]` | `router.push` |  | SessionReportsPage · l.368 |
| `/dashboard` | `router.push` | `error && isNuevo` | SessionReportsPage · l.403 |
| `/dashboard` | `router.push` | `error` | SessionReportsPage · l.417 |
| `/consultor/sessions/[*]` | `router.push` | `each analyticsData.recent_sessions` | renderRecentSessionsTable · l.861 |
| `/consultor/sessions/[*]` | `router.push` | `each analyticsData.recent_sessions && (e.key === 'Enter' \|\| e.key === ' ')` | renderRecentSessionsTable · l.865 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | initAuth · l.287 |
| `isAdmin = userRole === 'admin'` | SessionReportsPage · l.349 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | SessionReportsPage · l.275 |
| `!userRole` | SessionReportsPage · l.306 |

**Pieces placed here, with the texts and settings handed to them** (64)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | SessionReportsPage · l.376 |
| `LoadingSkeleton` |  | `loading` |  | SessionReportsPage · l.379 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | SessionReportsPage · l.382 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | SessionReportsPage · l.387 |
| `MainLayout` |  | `error && isNuevo` |  | SessionReportsPage · l.402 |
| `ReportsErrorNuevo` |  | `error && isNuevo` |  | SessionReportsPage · l.403 |
| `MainLayout` |  | `error` |  | SessionReportsPage · l.408 |
| `MainLayout` |  | `!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0 && isNuevo` |  | SessionReportsPage · l.435 |
| `ReportsNuevo` |  | `!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0 && isNuevo` |  | SessionReportsPage · l.436 |
| `MainLayout` |  | `!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0` |  | SessionReportsPage · l.441 |
| `HelpButton` | sectionId: mis-reportes |  |  | renderHeader · l.475 |
| `KPICard` | title: Total Sesiones |  |  | renderKPICards · l.572 |
| `KPICard` | title: Tasa de Completación |  |  | renderKPICards · l.578 |
| `KPICard` | title: Horas Programadas |  |  | renderKPICards · l.584 |
| `KPICard` | title: Asistencia Promedio |  |  | renderKPICards · l.590 |
| `KPICard` | title: Pendientes de Informe |  |  | renderKPICards · l.600 |
| `KPICard` | title: Próximas Sesiones |  |  | renderKPICards · l.606 |
| `KPICard` | title: Sesiones Canceladas |  |  | renderKPICards · l.612 |
| `ResponsiveContainer` |  |  |  | renderCharts · l.663 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | renderCharts · l.665 |
| `XAxis` |  |  |  | renderCharts · l.666 |
| `YAxis` |  |  |  | renderCharts · l.667 |
| `Tooltip` |  |  |  | renderCharts · l.668 |
| `Legend` |  |  |  | renderCharts · l.669 |
| `Bar` |  |  |  | renderCharts · l.670 |
| `Bar` |  |  |  | renderCharts · l.671 |
| `Bar` |  |  |  | renderCharts · l.672 |
| `ResponsiveContainer` |  |  |  | renderCharts · l.680 |
| `Pie` | cx: 50% · cy: 50% |  |  | renderCharts · l.682 |
| `Cell` |  | `each statusData` |  | renderCharts · l.693 |
| `Tooltip` |  |  |  | renderCharts · l.696 |
| `Legend` |  |  |  | renderCharts · l.697 |
| `ResponsiveContainer` |  |  |  | renderCharts · l.705 |
| `Pie` | cx: 50% · cy: 50% |  |  | renderCharts · l.707 |
| `Cell` |  | `each modalityData` |  | renderCharts · l.718 |
| `Tooltip` |  |  |  | renderCharts · l.721 |
| `Legend` |  |  |  | renderCharts · l.722 |
| `ResponsiveContainer` |  |  |  | renderCharts · l.730 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | renderCharts · l.732 |
| `XAxis` |  |  |  | renderCharts · l.733 |
| `YAxis` | unit: % |  |  | renderCharts · l.734 |
| `Tooltip` |  |  |  | renderCharts · l.735 |
| `Area` |  |  |  | renderCharts · l.736 |
| `ResponsiveContainer` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.751 |
| `CartesianGrid` | strokeDasharray: 3 3 | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.757 |
| `XAxis` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.758 |
| `YAxis` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.759 |
| `Tooltip` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.765 |
| `Legend` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.766 |
| `Bar` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.767 |
| `Bar` |  | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | renderCharts · l.768 |
| `ResponsiveContainer` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.778 |
| `CartesianGrid` | strokeDasharray: 3 3 | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.784 |
| `XAxis` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.785 |
| `YAxis` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.786 |
| `Tooltip` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.792 |
| `Legend` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.793 |
| `Bar` |  | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | renderCharts · l.794 |
| `ExportDropdown` | tabName: Sesiones Recientes · headers: Fecha / Título / Escuela / Comunidad / Estado / Asistencia |  |  | renderRecentSessionsTable · l.822 |
| `MainLayout` |  | `isNuevo` |  | SessionReportsPage · l.904 |
| `ReportsNuevo` |  | `isNuevo` |  | SessionReportsPage · l.905 |
| `MainLayout` |  |  |  | SessionReportsPage · l.911 |
| `LoadingSkeleton` |  | `dataLoading && each Array.from({ length: 4 })` |  | SessionReportsPage · l.920 |
| `LoadingSkeleton` |  | `dataLoading && each Array.from({ length: 4 })` |  | SessionReportsPage · l.925 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `BREADCRUMBS_NUEVO_ADMIN` | «Consultorías», «Reportes» | l.137 |
| `BREADCRUMBS_NUEVO_CONSULTOR` | «Mi Trabajo», «Mis Reportes» | l.138 |
| `MODALITY_COLORS` | «rgb(var(--color-serie-1, var(--color-blue-500)))», «rgb(var(--color-serie-2, var(--color-legacy-10b981)))», «rgb(var(--color-serie-3, 245 158 11))» | l.140 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | SessionReportsPage · l.330 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | SessionReportsPage · l.269 |

**Values shown from data** (13)

- `{title}` — KPICard · l.165
- `{value}` — KPICard · l.166
- `{icon}` — KPICard · l.169
- `{label}` — CustomChartTooltip · l.196, when `active && payload && payload.length`
- `{entry.name} : {entry.value}` — CustomChartTooltip · l.198, when `active && payload && payload.length && each payload`
- `{(percent * 100).toFixed(0)}%` — renderPieLabel · l.230
- `{error}` — SessionReportsPage · l.415, when `error`
- `{format(parseISO(session.session_dat…}` — renderRecentSessionsTable · l.869, when `each analyticsData.recent_sessions`
- `{session.title}` — renderRecentSessionsTable · l.872, when `each analyticsData.recent_sessions`
- `{session.school_name}` — renderRecentSessionsTable · l.875, when `each analyticsData.recent_sessions`
- `{session.gc_name}` — renderRecentSessionsTable · l.878, when `each analyticsData.recent_sessions`
- `{badge.label}` — renderRecentSessionsTable · l.882, when `each analyticsData.recent_sessions`
- `{session.attendance_rate}% / -` — renderRecentSessionsTable · l.886, when `each analyticsData.recent_sessions`

**Other texts on screen** (13)

- «No hay sesiones en el período seleccionado» — SessionReportsPage · l.447, when `!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0`
- «No hay sesiones que coincidan con los filtros seleccionados. Intenta ajustar los filtros para ver más resultados.» — SessionReportsPage · l.448, when `!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0`
- «Estadísticas y métricas de todas las sesiones de consultoría / Estadísticas y métricas de tus sesiones de consultoría» — renderHeader · l.477
- «Desde» (label) — renderFilters · l.503
- «Hasta» (label) — renderFilters · l.513
- «Escuela» (label) — renderFilters · l.523
- «Consultor» (label) — renderFilters · l.540, when `isAdmin && consultants.length > 0`
- «Sesiones por Mes - Gráfico de barras» (aria-label) — renderCharts · l.661
- «Distribución por Estado - Gráfico circular» (aria-label) — renderCharts · l.678
- «Distribución por Modalidad - Gráfico circular» (aria-label) — renderCharts · l.703
- «Tendencia de Asistencia - Gráfico de área» (aria-label) — renderCharts · l.728
- «Sesiones por Escuela - Gráfico de barras horizontal» (aria-label) — renderCharts · l.749, when `isAdmin && analyticsData.sessions_by_school.length > 0`
- «Top Consultores - Gráfico de barras horizontal» (aria-label) — renderCharts · l.776, when `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/reports/ExportDropdown.tsx`
- `components/sessions/reports-nuevo/ReportsNuevo.tsx`
- `components/tutorials/HelpButton.tsx`
- `components/tutorials/HelpDrawer.tsx`
- `components/tutorials/VimeoEmbed.tsx`
- `components/ui/dialog.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `lib/colorAlpha.ts`
- `lib/exportUtils.ts`
- `lib/tutorials/content.ts`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/sessions/reports/analytics` | GET | `pages/consultor/sessions/reports.tsx:328` |

## /meet/diag

File `pages/meet/diag.tsx` · 1047 lines · frame: none · getServerSideProps

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.1035 `server redirect → /login?next=[*]  (when !user)`
- Linked from: nothing in the code (reached by typing the address, or from outside)
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`, `__tests__/pages/meet-diag-join-section.test.ts`, `__tests__/pages/meet/diag-join-passcode.test.tsx`, `__tests__/pages/meet/diag-ssr.test.ts`, `__tests__/pages/meet/diag.nuevo.test.tsx`.

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

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Diagnóstico del equipo» | h1 |  | MeetDiagPage · l.767 |
| «Mediciones» | h2 |  | MeetDiagPage · l.783 |
| «Prueba de cámara y micrófono» | h2 |  | MeetDiagPage · l.855 |
| «Prueba de conexión» | h2 | `!joinAvailable` | MeetDiagPage · l.872 |
| «Prueba de conexión» | h2 | `!(!joinAvailable)` | MeetDiagPage · l.883 |
| «Resultados» | h2 |  | MeetDiagPage · l.968 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Probar cámara y micrófono» | `{runMediaProbe}` |  |  | `testid=diag-media-probe-button` | MeetDiagPage · l.860 |
| «Entrando… / Entrar a la reunión» | `{runTestJoin}` | `!(!joinAvailable)` | `{joinState === 'joining' \|\| joinState === 'joined' \|\| passcode.trim().length ===…}` | `testid=diag-join-button` | MeetDiagPage · l.921 |
| «Salir de la reunión» | `{leaveTestJoin}` | `!(!joinAvailable) && joinState === 'joined'` |  | `testid=diag-join-leave-button` | MeetDiagPage · l.935 |
| «Copiar resultados» | `{copyReport}` |  |  | `testid=diag-copy-button` | MeetDiagPage · l.973 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver al inicio» | `/dashboard` |  | `testid=diag-back-link` | MeetDiagPage · l.1003 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Número de reunión» | text | «Por ejemplo: 87239242778» |  | `!(!joinAvailable)` | `testid=diag-join-meeting-number` | MeetDiagPage · l.893 |
| «Clave de la reunión» | text | «Obligatoria — cópiala tal cual» · required |  | `!(!joinAvailable)` | `testid=diag-join-passcode` | MeetDiagPage · l.906 |
| «Resultados en formato JSON» | textarea | `readOnly=true` |  |  | `testid=diag-report-json` | MeetDiagPage · l.992 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «Medición» |  | MeetDiagPage · l.794 |
| «Resultado» |  | MeetDiagPage · l.797 |
| «Estado» |  | MeetDiagPage · l.800 |
| «{probe.label}» | `each allProbes` | MeetDiagPage · l.812 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «El SDK se descargó pero no quedó disponible en la página.» | `throw (shown by whoever catches it)` | `!window.ZoomMtgEmbedded` | loadMeetingSdk · l.146 |
| «Esta instalación no tiene credenciales de Zoom configuradas. / No se pudo firmar la entrada (HTTP {signatureResponse.status}).» | `throw (shown by whoever catches it)` | `!signatureResponse.ok` | MeetDiagPage · l.645 |
| «No se encontró el contenedor de la reunión.» | `throw (shown by whoever catches it)` | `!root` | MeetDiagPage · l.658 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!user` | getServerSideProps · l.1035 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `cancelled` | MeetDiagPage · l.503 |
| `cancelled` | MeetDiagPage · l.515 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `STATUS_LABEL` | «OK», «Atención», «Falla», «Dato», «Sin medir» | l.194 |
| `timezone` | «No informada» | collectPassiveProbes · l.420 |
| `resolution` | «· {settings.width}×{settings.height}» | MeetDiagPage · l.557 |
| `explanation` | «Permiso denegado por la persona usuaria o bloqueado por la política del navegador. / El equipo no tiene cámara o micrófono disponibles. / Otra aplicación está usando la cámara o el micrófono. / Revisa la consola del navegador para el detalle.» | MeetDiagPage · l.571 |

**Other texts written in the code (safety net: not tied to an element by the script)** (46)

| Text | Where |
|---|---|
| «Desconocido» | identifyBrowser · l.223 |
| «Navegador» | collectPassiveProbes · l.289 |
| «La matriz de pruebas cubre Chrome, Edge, Firefox y Safari.» | collectPassiveProbes · l.292 |
| «User agent» | collectPassiveProbes · l.297 |
| «Plataforma» | collectPassiveProbes · l.304 |
| «Núcleos de CPU» | collectPassiveProbes · l.312 |
| «Mínimo del equipo P0: {FLOORS.cores.warn} núcleos. Recomendado: {FLOORS.cores.pass}.» | collectPassiveProbes · l.315 |
| «Memoria RAM (aprox.)» | collectPassiveProbes · l.321 |
| «No informada (solo Chrome/Edge)» | collectPassiveProbes · l.322 |
| «Mínimo P0/P1: {FLOORS.memoryGb.warn} GB. El navegador redondea este valor hacia abajo.» | collectPassiveProbes · l.324 |
| «Pantalla» | collectPassiveProbes · l.332 |
| «Bajo {FLOORS.screenWidth.warn} px de ancho la vista embebida de escritorio no es usable.» | collectPassiveProbes · l.335 |
| «Ancho de banda estimado» | collectPassiveProbes · l.341 |
| «Perfiles de la prueba: fibra · 4 Mbps · 1,5 Mbps. Es una estimación del navegador, no una medición de red.» | collectPassiveProbes · l.344 |
| «En Firefox y Safari mide la red con la herramienta indicada en el protocolo.» | collectPassiveProbes · l.352 |
| «Latencia estimada (RTT)» | collectPassiveProbes · l.359 |
| «Perfiles de la prueba: 80 ms y 300 ms. Es una estimación del navegador.» | collectPassiveProbes · l.362 |
| «Modo ahorro de datos» | collectPassiveProbes · l.376 |
| «Activado» | collectPassiveProbes · l.377 |
| «Desactivado» | collectPassiveProbes · l.377 |
| «Con ahorro de datos activado el navegador degrada video sin avisar.» | collectPassiveProbes · l.379 |
| «Disponible» | collectPassiveProbes · l.387 |
| «El SDK de video lo necesita. Sin WebAssembly no hay experiencia embebida.» | collectPassiveProbes · l.389 |
| «WebGL / aceleración gráfica» | collectPassiveProbes · l.396 |
| «Un renderizador por software (SwiftShader, llvmpipe) sube mucho el uso de CPU con varias cámaras.» | collectPassiveProbes · l.399 |
| «Solo medición. Sin aislamiento se pierden envío en 720p, supresión de ruido y audio de pestaña; la reunión funciona igual.» | collectPassiveProbes · l.408 |
| «Solo medición. Esta página no modifica ninguna cabecera para habilitarlo.» | collectPassiveProbes · l.417 |
| «Zona horaria del equipo» | collectPassiveProbes · l.428 |
| «Las sesiones se agendan en hora de Chile. Un equipo con otra zona muestra horarios corridos.» | collectPassiveProbes · l.431 |
| «Uso de CPU durante la reunión» | collectPassiveProbes · l.436 |
| «Se mide en el equipo (Administrador de tareas) durante la llamada, según el protocolo. Umbral: bajo 90%.» | collectPassiveProbes · l.439 |
| «Tiempo hasta entrar a la reunión» | MeetDiagPage · l.476 |
| «Umbral del protocolo (B1): menos de 20 segundos desde el clic hasta ver y escuchar.» | MeetDiagPage · l.479 |
| «Cámara y micrófono» | MeetDiagPage · l.485 |
| «Presiona "Probar cámara y micrófono". El navegador pedirá permiso.» | MeetDiagPage · l.488 |
| «Almacenamiento disponible» | MeetDiagPage · l.508 |
| «Referencial. El SDK guarda pocos megabytes en caché.» | MeetDiagPage · l.511 |
| «Suele indicar un contexto no seguro (sin HTTPS) o un navegador demasiado antiguo.» | MeetDiagPage · l.546 |
| «Permiso concedido y ambos dispositivos entregados. Esto confirma que la política de permisos de /meet permite la videollamada.» | MeetDiagPage · l.566 |
| «Falta uno de los dos dispositivos. Revisa que el equipo tenga cámara y micrófono conectados.» | MeetDiagPage · l.567 |
| «Error» | MeetDiagPage · l.570 |
| «El número de la reunión tiene entre 9 y 11 dígitos. Cópialo sin espacios.» | MeetDiagPage · l.611 |
| «La reunión de prueba debe tener clave. Si la que te pasaron no la tiene, pide otra: una reunión sin clave no se usa en este protocolo.» | MeetDiagPage · l.628 |
| «Prueba de equipo» | MeetDiagPage · l.676 |
| «Umbral del protocolo (B1): menos de 20 segundos. Medido desde el clic hasta que el SDK confirma la entrada. SDK {SDK_VERSION}.» | MeetDiagPage · l.689 |
| «Anota este mensaje completo en la planilla: distingue un problema de red de un problema de la cuenta de Zoom.» | MeetDiagPage · l.699 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (10)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector(script[data-sdk-src="{src}"])` | loadScript · l.107 |
| listener | `script.addEventListener('load')` | loadScript · l.113 |
| listener | `script.addEventListener('error')` | loadScript · l.121 |
| mark | `testid=diag-summary` | MeetDiagPage · l.784 |
| mark | `testid=diag-row-{probe.id}` | MeetDiagPage · l.807 |
| mark | `testid=diag-join-placeholder` | MeetDiagPage · l.873 |
| mark | `testid=diag-join-status` | MeetDiagPage · l.944 |
| mark | `testid=diag-join-sdk-root` | MeetDiagPage · l.959 |
| mark | `testid=diag-copy-ok` | MeetDiagPage · l.982 |
| mark | `testid=diag-copy-error` | MeetDiagPage · l.987 |

**Values shown from data** (4)

- `{probe.value}` — MeetDiagPage · l.816, when `each allProbes`
- `{probe.note}` — MeetDiagPage · l.818, when `each allProbes && probe.note`
- `{STATUS_LABEL[probe.status]}` — MeetDiagPage · l.822, when `each allProbes`
- `{joinProbe.value}` — MeetDiagPage · l.944, when `!(!joinAvailable)`

**Other texts on screen** (26)

- «Diagnóstico de equipo — Reuniones \| GENERA» — MeetDiagPage · l.757
- «Reuniones · Diagnóstico» — MeetDiagPage · l.765
- «Esta página revisa si este computador y esta red pueden sostener una videollamada dentro de GENERA. No inicia ninguna reunión ni graba nada.» — MeetDiagPage · l.771
- «Sigue el protocolo de la visita, presiona» — MeetDiagPage · l.775
- «Probar cámara y micrófono» — MeetDiagPage · l.776
- «y luego» — MeetDiagPage · l.776
- «Copiar resultados» — MeetDiagPage · l.777
- «{counts.pass} OK · {counts.warn} con atención · {counts.fail} con falla» — MeetDiagPage · l.784
- «Midiendo…» — MeetDiagPage · l.837, when `allProbes.length === 0`
- «Referencia de equipos:» — MeetDiagPage · l.846
- «P0» — MeetDiagPage · l.846
- «= Windows 10 con 4 GB y doble núcleo, o Windows 11 con procesador i5.» — MeetDiagPage · l.846
- «P1» — MeetDiagPage · l.848
- «= Chromebook con 4 GB o tablet Android. Un resultado &ldquo;Atención&rdquo; no impide usar la plataforma: significa que el equipo está en el mínimo y hay que anotarlo en la planilla.» — MeetDiagPage · l.848
- «El navegador pedirá permiso. Acepta para que la prueba sea válida. La cámara se apaga apenas termina la medición.» — MeetDiagPage · l.857
- «Prueba de conexión: disponible próximamente.» — MeetDiagPage · l.874, when `!joinAvailable`
- «Este bloque necesita las credenciales de Zoom configuradas en el servidor. El resto del diagnóstico funciona igual: continúa con la Parte A del protocolo.» — MeetDiagPage · l.877, when `!joinAvailable`
- «Escribe el número y la clave de la reunión de prueba que te pasaron, y presiona» — MeetDiagPage · l.885, when `!(!joinAvailable)`
- «Entrar a la reunión» — MeetDiagPage · l.886, when `!(!joinAvailable)`
- «. El tiempo se mide solo y queda en el bloque de resultados.» — MeetDiagPage · l.886, when `!(!joinAvailable)`
- «Número de reunión» (label) — MeetDiagPage · l.891, when `!(!joinAvailable)`
- «Clave de la reunión» (label) — MeetDiagPage · l.904, when `!(!joinAvailable)`
- «Para la medición B2 del protocolo, entra y sal tres veces seguidas y anota si las tres funcionaron. El video se abre dentro de esta misma página.» — MeetDiagPage · l.950, when `!(!joinAvailable)`
- «Copia este bloque y pégalo en la planilla de la visita.» — MeetDiagPage · l.970
- «Copiado.» — MeetDiagPage · l.983, when `copyState === 'ok'`
- «No se pudo copiar automáticamente. Selecciona el texto de abajo y cópialo a mano.» — MeetDiagPage · l.988, when `copyState === 'error'`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/meet/meetLookNuevo.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/meet/diag-signature` | POST | `pages/meet/diag.tsx:639` |

## /meet/session/[id]

File `pages/meet/session/[id].tsx` · 198 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: signed-in only. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.184 `server redirect → /login?next=[*]  (when access.kind === 'unauthenticated')`
- Linked from: `lib/notifications/catalog.ts:197`, `lib/utils/session-disclosure.ts:111`
- Tests: browser tests that CI runs: `tests/e2e/session-disclosure.spec.ts`, `tests/e2e/session-ical.spec.ts`, `tests/e2e/zoom-join-authz.spec.ts`, `tests/e2e/zoom-managed-join.spec.ts`; browser tests CI skips: `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/session-reminders.spec.ts`; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`, `__tests__/pages/meet/session-managed-join.test.tsx`, `__tests__/pages/meet/session-ssr.test.ts`, `__tests__/pages/meet/session.nuevo.test.tsx`.

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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{session.title}» | h1 |  | MeetSessionPage · l.95 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Abrir enlace de reunión» | `{session.meeting_link}` (new tab) | `!(session.join_access === 'closed') && !(session.join_access === 'disabled') && !(session.is_zoom_managed) && session.meeting_link` | `testid=meet-join-link` | MeetSessionPage · l.131 |
| «Volver al inicio» | `/dashboard` |  | `testid=meet-back-link` | MeetSessionPage · l.152 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `access.kind === 'unauthenticated'` | getServerSideProps · l.184 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Calendar` | aria-hidden: true |  |  | MeetSessionPage · l.101 |
| `Clock` | aria-hidden: true |  |  | MeetSessionPage · l.106 |
| `JoinMeetingButton` |  | `!(session.join_access === 'denied') && !(session.join_access === 'closed') && !(session.join_access === 'disabled') && session.is_zoom_managed` |  | MeetSessionPage · l.128 |
| `ExternalLink` | aria-hidden: true | `!(session.join_access === 'closed') && !(session.join_access === 'disabled') && !(session.is_zoom_managed) && session.meeting_link` |  | MeetSessionPage · l.138 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `JOIN_DISABLED_MESSAGE` | «Las videollamadas están temporalmente deshabilitadas» | l.71 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| mark | `testid=meet-join-denied` | MeetSessionPage · l.116 |
| mark | `testid=meet-join-closed` | MeetSessionPage · l.120 |
| mark | `testid=meet-join-disabled` | MeetSessionPage · l.124 |
| mark | `testid=meet-no-link` | MeetSessionPage · l.146 |

**Values shown from data** (4)

- `{dateLabel}` — MeetSessionPage · l.103
- `{session.join_denial_message} / {JOIN_NOT_AUTHORIZED_MESSAGE}` — MeetSessionPage · l.116, when `session.join_access === 'denied'`
- `{session.join_denial_message} / {MEETING_CLOSED_MESSAGE}` — MeetSessionPage · l.120, when `!(session.join_access === 'denied') && session.join_access === 'closed'`
- `{JOIN_DISABLED_MESSAGE}` — MeetSessionPage · l.124, when `!(session.join_access === 'denied') && !(session.join_access === 'closed') && session.join_access === 'disabled'`

**Other texts on screen** (7)

- «{session.title} — Reunión \| GENERA» — MeetSessionPage · l.88
- «Reunión» — MeetSessionPage · l.94
- «Fecha» — MeetSessionPage · l.102, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Horario» — MeetSessionPage · l.107, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «(hora Chile)» — MeetSessionPage · l.110
- «El enlace abre un servicio de reuniones externo a GENERA, en una pestaña nueva.» — MeetSessionPage · l.142, when `!(session.join_access === 'closed') && !(session.join_access === 'disabled') && !(session.is_zoom_managed) && session.meeting_link`
- «Esta sesión no tiene enlace de reunión.» — MeetSessionPage · l.147, when `!(session.join_access === 'closed') && !(session.join_access === 'disabled') && !(session.is_zoom_managed) && !(session.meeting_link)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/meet/meetLookNuevo.ts`
- `components/sessions/JoinMeetingButton.tsx`
- `components/sessions/MeetingDialIn.tsx`
- `components/sessions/PreJoinCheck.tsx`
- `lib/api-auth.ts`
- `lib/meet/zoom-client-view-loader.ts`
- `lib/meet/zoom-sdk-loader.ts`
- `lib/utils/meeting-join-policy.ts`
- `lib/utils/session-meet-access.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/meet/session/[id]/join` | POST | `components/sessions/JoinMeetingButton.tsx:452`, `components/sessions/JoinMeetingButton.tsx:481` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/ConsultantAssignmentModal.tsx

Used by: `/admin/consultant-assignments`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Asignación de Consultor / Nueva Asignación de Consultor» | h2 |  | ConsultantAssignmentModal · l.662 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{() => { toast.dismiss(t.id); resolve(false); }}` | `formData.assignment_scope !== 'individual' && affectedCount > 0` |  |  | handleSubmit · l.486 |
| «Confirmar» | `{() => { toast.dismiss(t.id); resolve(true); }}` | `formData.assignment_scope !== 'individual' && affectedCount > 0` |  |  | handleSubmit · l.495 |
|  | `{onClose}` |  |  |  | ConsultantAssignmentModal · l.665 |
| «Cancelar» | `{onClose}` | `!(dataLoading)` |  |  | ConsultantAssignmentModal · l.993 |
| «Guardando... / Actualizar Asignación / Crear Asignación» (submits the form) |  | `!(dataLoading)` | `{loading}` |  | ConsultantAssignmentModal · l.1000 |

**Fields** (13)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Consultor *» | select | required | «Seleccionar consultor...», «(lista) {consultant.first_name} {consultant.last_name} ( {consultant.email} )» | `!(dataLoading)` |  | ConsultantAssignmentModal · l.687 |
| «Individual» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.709 |
| «Comunidad» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.720 |
| «Generación» | radio | `assignment_scope` · disabled: `{!!formData.school_id && !shouldShowGenerationField()}` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.737 |
| «Escuela» | radio | `assignment_scope` |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.749 |
| «Usuario a Asignar *» | select | required | «Seleccionar usuario...», «(lista) {student.first_name} {student.last_name} ( {student.email} ) - {student.role}» | `!(dataLoading) && !fixedUser && formData.assignment_scope === 'individual'` |  | ConsultantAssignmentModal · l.783 |
| «Usuario (Opcional - para asignar a la comunidad de un usuario específico)» | select |  | «Seleccionar usuario...», «(lista) {student.first_name} {student.last_name} ( {student.email} ) - {student.role}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !fixedUser && formData.assignment_scope === 'community'` |  | ConsultantAssignmentModal · l.809 |
| «Escuela *» | select | required | «Seleccionar escuela...», «(lista) {school.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !(formData.assignment_scope === 'community' && formData.student_id && formData.school_id)` |  | ConsultantAssignmentModal · l.835 |
| «Generación *» | select | required · disabled: `{!formData.school_id}` | «Seleccionar generación...», «Esta escuela no tiene generaciones», «(lista) {generation.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && ((formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community') && shouldShowGenerationField())` |  | ConsultantAssignmentModal · l.857 |
| «Comunidad de Crecimiento *» | select | required · disabled: `{!formData.school_id \|\| (shouldShowGenerationField() && !formData.generation_id)}` | «Seleccionar comunidad...», «No hay comunidades disponibles», «(lista) {community.name}» | `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && !(formData.student_id && formData.community_id)` |  | ConsultantAssignmentModal · l.890 |
| «Puede asignar cursos» | checkbox |  |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.939 |
| «Establecer fecha de finalización» | checkbox |  |  | `!(dataLoading)` |  | ConsultantAssignmentModal · l.955 |
| «Fecha de finalización» | datetime-local | required · `min={(() => { const d = new Date(); const year = d.getFullYear(); const month = Stri…}` |  | `!(dataLoading) && formData.has_end_date` |  | ConsultantAssignmentModal · l.966 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` | `!(dataLoading)` | ConsultantAssignmentModal · l.681 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Asignación de Consultor / Nueva Asignación de Consultor» | written in this file |  |  | ConsultantAssignmentModal · l.658 |

**Toasts** (19)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | fetchData · l.95 |
| error | «Error al cargar datos de asignación» |  | fetchData · l.119 |
| error | «Debe seleccionar un consultor» | `!formData.consultant_id` | validateForm · l.384 |
| error | «Debe seleccionar un usuario» | `formData.assignment_scope === 'individual' && !formData.student_id` | validateForm · l.391 |
| error | «El consultor no puede asignarse a sí mismo» | `formData.assignment_scope === 'individual' && formData.consultant_id === formData.student_id` | validateForm · l.395 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'school' && !formData.school_id` | validateForm · l.401 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'generation' && !formData.school_id` | validateForm · l.407 |
| error | «Debe seleccionar una generación» | `formData.assignment_scope === 'generation' && shouldShowGenerationField() && !formData.generation_id` | validateForm · l.411 |
| error | «Debe seleccionar una escuela» | `formData.assignment_scope === 'community' && !formData.school_id` | validateForm · l.417 |
| error | «Debe seleccionar una generación» | `formData.assignment_scope === 'community' && shouldShowGenerationField() && !formData.generation_id` | validateForm · l.421 |
| error | «Debe seleccionar una comunidad» | `formData.assignment_scope === 'community' && !formData.community_id` | validateForm · l.425 |
| error | «Debe especificar una fecha de finalización» | `formData.has_end_date && !formData.ends_at` | validateForm · l.432 |
| plain | «¿Está seguro de que desea asignar el consultor a TODOS los {affectedCount} usuarios de {entityName} ? Esta acción asignará el consultor a todos los usuarios actuales y futuros de {entityName} . Cancelar Confirmar» | `formData.assignment_scope !== 'individual' && affectedCount > 0` | handleSubmit · l.480 |
| error | «Error de autenticación» | `sessionError \|\| !session?.access_token` | handleSubmit · l.533 |
| error | «{errorMessage}» | `!response.ok` | handleSubmit · l.612 |
| success | «{successMessage}» |  | handleSubmit · l.624 |
| error | «Error: {error.message}» | `error instanceof Error` | handleSubmit · l.644 |
| error | «{error}» | `!(error instanceof Error) && typeof error === 'string'` | handleSubmit · l.646 |
| error | «Error al guardar la asignación» | `!(error instanceof Error) && !(typeof error === 'string')` | handleSubmit · l.648 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch assignment data» | `throw (shown by whoever catches it)` | `!response.ok` | fetchData · l.108 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | ConsultantAssignmentModal · l.655 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `tempSchool` | «Escuela del usuario» | handleInputChange · l.271 |
| `method` | «PUT / POST» | handleSubmit · l.587 |
| `successMessage` | «Asignación creada exitosamente» | handleSubmit · l.617 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | ConsultantAssignmentModal · l.102 |
| «Asignación actualizada exitosamente» | ConsultantAssignmentModal · l.619 |
| «Consultor asignado exitosamente a {affectedCount} usuarios de {entityName}» | ConsultantAssignmentModal · l.621 |
| «Esta asignación se aplicará a TODOS los usuarios de la comunidad seleccionada.» | ConsultantAssignmentModal · l.926 |

**Values shown from data** (1)

- `{fixedUser.first_name} {fixedUser.last_name} ( {fixedUser.email} )` — ConsultantAssignmentModal · l.768, when `!(dataLoading) && fixedUser`

**Other texts on screen** (26)

- «¿Está seguro de que desea asignar el consultor a TODOS los {affectedCount} usuarios de {entityName} ?» — handleSubmit · l.483, when `formData.assignment_scope !== 'individual' && affectedCount > 0`
- «Esta acción asignará el consultor a todos los usuarios actuales y futuros de {entityName} .» — handleSubmit · l.484, when `formData.assignment_scope !== 'individual' && affectedCount > 0`
- «Cargando datos...» — ConsultantAssignmentModal · l.678, when `dataLoading`
- «Consultor *» (label) — ConsultantAssignmentModal · l.684, when `!(dataLoading)`
- «Tipo de Asignación *» (label) — ConsultantAssignmentModal · l.704, when `!(dataLoading)`
- «Individual» (label) — ConsultantAssignmentModal · l.708, when `!(dataLoading)`
- «Comunidad» (label) — ConsultantAssignmentModal · l.719, when `!(dataLoading)`
- «Generación» (label) — ConsultantAssignmentModal · l.730, when `!(dataLoading)`
- «Escuela» (label) — ConsultantAssignmentModal · l.748, when `!(dataLoading)`
- «Usuario Seleccionado» (label) — ConsultantAssignmentModal · l.765, when `!(dataLoading) && fixedUser`
- «La asignación se aplicará según el tipo seleccionado arriba» — ConsultantAssignmentModal · l.772, when `!(dataLoading) && fixedUser`
- «Usuario a Asignar *» (label) — ConsultantAssignmentModal · l.780, when `!(dataLoading) && !fixedUser && formData.assignment_scope === 'individual'`
- «Usuario (Opcional - para asignar a la comunidad de un usuario específico)» (label) — ConsultantAssignmentModal · l.806, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && !fixedUser && formData.assignment_scope === 'community'`
- «Escuela *» (label) — ConsultantAssignmentModal · l.825, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community'))`
- «{schools.find(s => s.id === formData…} / Escuela del usuario» — ConsultantAssignmentModal · l.830, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && formData.student_id && formData.school_id`
- «Generación *» (label) — ConsultantAssignmentModal · l.854, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && ((formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community') && shouldShowGenerationField())`
- «Comunidad de Crecimiento *» (label) — ConsultantAssignmentModal · l.880, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community'`
- «{communities.find(c => c.id === form…} / Comunidad del usuario» — ConsultantAssignmentModal · l.885, when `!(dataLoading) && ((formData.assignment_scope === 'school' \|\| formData.assignment_scope === 'generation' \|\| formData.assignment_scope === 'community')) && formData.assignment_scope === 'community' && formData.student_id && formData.community_id`
- «Advertencia: Asignación Masiva» — ConsultantAssignmentModal · l.921, when `!(dataLoading) && formData.assignment_scope !== 'individual'`
- «[Esta asignación se aplicará a TODOS los usuarios de la escuela seleccionada.] [Esta asignación se aplicará a TODOS los usuarios de la generación seleccionada.] [Esta asignación se aplicará a TODOS los usuarios de la comunidad seleccionada…» — ConsultantAssignmentModal · l.923, when `!(dataLoading) && formData.assignment_scope !== 'individual'`
- «Permisos» (label) — ConsultantAssignmentModal · l.935, when `!(dataLoading)`
- «Puede asignar cursos» (label) — ConsultantAssignmentModal · l.938, when `!(dataLoading)`
- «Duración» (label) — ConsultantAssignmentModal · l.951, when `!(dataLoading)`
- «Establecer fecha de finalización» (label) — ConsultantAssignmentModal · l.954, when `!(dataLoading)`
- «Fecha de finalización» (label) — ConsultantAssignmentModal · l.965, when `!(dataLoading) && formData.has_end_date`
- «La asignación será indefinida hasta que se elimine manualmente.» — ConsultantAssignmentModal · l.986, when `!(dataLoading) && !formData.has_end_date`

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions`

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

### components/meet/meetLookNuevo.ts

Used by: `/meet/diag`, `/meet/session/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `MEET_SESSION_NUEVO` | «mt-6 {MEET_NUEVO.notice}», «w-full {MEET_NUEVO.buttonDefault}» | l.33 |
| `MEET_DIAG_NUEVO` | «mt-5 {MEET_NUEVO.card}» | l.51 |

### components/reports/ExportDropdown.tsx

Used by: `/consultor/sessions/reports`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Exportando... / Exportar» | `{() => setIsOpen(!isOpen)}` |  | `{exporting !== null}` |  | ExportDropdown · l.73 |
| «Exportar como CSV .csv» | `{() => handleExport('csv')}` | `isOpen` | `{exporting !== null}` |  | ExportDropdown · l.107 |
| «Exportar como Excel .xls» | `{() => handleExport('excel')}` | `isOpen` | `{exporting !== null}` |  | ExportDropdown · l.120 |
| «Exportar como PDF .pdf» | `{() => handleExport('pdf')}` | `isOpen` | `{exporting !== null}` |  | ExportDropdown · l.133 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No hay datos para exportar» | `data.length === 0` | handleExport · l.42 |
| success | «{result.message}» | `result.success` | handleExport · l.59 |
| error | «{result.message}» | `!(result.success)` | handleExport · l.61 |
| error | «Error al exportar reporte» |  | handleExport · l.65 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('mousedown')` | ExportDropdown · l.34 |
| role | `role=menu` | ExportDropdown · l.102 |

**Other texts on screen** (1)

- «{data.length} registros disponibles» — ExportDropdown · l.103, when `isOpen`

### components/sessions/AttendanceSuggestionsPanel.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sugerencias de asistencia (Zoom)» | h2 |  | AttendanceSuggestionsPanel · l.143 |
| «Participantes sin identificar (confirmar a mano)» | h3 | `payload.unmatched_rows.length > 0` | AttendanceSuggestionsPanel · l.198 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Aplicando… / Aplicar sugerencias ({definite.length})» | `{() => void applySuggestions()}` |  | `{applying \|\| definite.length === 0}` | `testid=attendance-apply-suggestions` | AttendanceSuggestionsPanel · l.213 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error inesperado» |  | AttendanceSuggestionsPanel · l.77 |
| success | «Asistencia sugerida aplicada» |  | applySuggestions · l.126 |
| error | «Error inesperado» |  | applySuggestions · l.130 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudieron cargar las sugerencias de asistencia» | `throw (shown by whoever catches it)` | `!response.ok` | AttendanceSuggestionsPanel · l.62 |
| «No se pudo aplicar la asistencia sugerida» | `throw (shown by whoever catches it)` | `!response.ok` | applySuggestions · l.124 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!visible` | AttendanceSuggestionsPanel · l.88 |
| `!payload \|\| payload.state === 'no_meeting'` | AttendanceSuggestionsPanel · l.101 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Users` | aria-hidden: true |  |  | AttendanceSuggestionsPanel · l.144 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `STATE_COPY` | «Informe de Zoom consolidado», «Datos provisionales (webhook) — el informe de Zoom aún no se consolida; las ausencias no se sugieren todavía», «Sin datos de asistencia de Zoom todavía» | l.35 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| mark | `testid=attendance-suggestions-panel` | AttendanceSuggestionsPanel · l.92 |
| mark | `testid=attendance-suggestions-panel` | AttendanceSuggestionsPanel · l.139 |
| mark | `testid=attendance-suggestions-state` | AttendanceSuggestionsPanel · l.148 |
| mark | `testid=attendance-suggestions-list` | AttendanceSuggestionsPanel · l.156 |
| mark | `testid=attendance-suggestion-{suggestion.user_id}` | AttendanceSuggestionsPanel · l.158 |
| mark | `testid=attendance-open-{suggestion.user_id}` | AttendanceSuggestionsPanel · l.184 |
| mark | `testid=attendance-unmatched` | AttendanceSuggestionsPanel · l.197 |

**Values shown from data** (1)

- `{stateCopy}` — AttendanceSuggestionsPanel · l.148, when `stateCopy`

**Other texts on screen** (8)

- «Cargando sugerencias de Zoom…» — AttendanceSuggestionsPanel · l.96, when `loading`
- «{suggestion.name} / Participante» — AttendanceSuggestionsPanel · l.163, when `each payload.suggestions`
- «Presente · {suggestion.observed_minutes} min» — AttendanceSuggestionsPanel · l.166, when `each payload.suggestions && suggestion.suggestion === 'present'`
- «Ausente según informe» — AttendanceSuggestionsPanel · l.175, when `each payload.suggestions && suggestion.suggestion === 'absent'`
- «Sin datos» — AttendanceSuggestionsPanel · l.180, when `each payload.suggestions && suggestion.suggestion === 'no_data'`
- «Sin salida registrada» — AttendanceSuggestionsPanel · l.188, when `each payload.suggestions && suggestion.has_open_interval`
- «{row.display_name} / Sin nombre · {row.observed_minutes} min · sin salida registrada» — AttendanceSuggestionsPanel · l.203, when `payload.unmatched_rows.length > 0 && each payload.unmatched_rows`
- «Solo se aplican las filas con sugerencia definida; el resto queda para marcar a mano.» — AttendanceSuggestionsPanel · l.225

### components/sessions/AudioPlayer.tsx

Used by: `/consultor/sessions/[id]`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Transcripción» | `{() => setShowTranscript(!showTranscript)}` | `transcript` |  |  | AudioPlayer · l.28 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| audio |  |  | AudioPlayer · l.17 |

**Values shown from data** (1)

- `{transcript}` — AudioPlayer · l.45, when `transcript && showTranscript`

**Other texts on screen** (1)

- «Tu navegador no soporta la reproducción de audio.» — AudioPlayer · l.21

### components/sessions/AudioReportUploader.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Informe por Audio» | h3 |  | AudioReportUploader · l.211 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Seleccionar Archivo» | `{() => fileInputRef.current?.click()}` | `processingState === 'idle'` |  |  | AudioReportUploader · l.234 |
| «Grabar Audio» | `{startRecording}` | `processingState === 'idle' && canRecord && !isRecording` |  |  | AudioReportUploader · l.256 |
| «Detener» | `{stopRecording}` | `processingState === 'idle' && isRecording` |  |  | AudioReportUploader · l.275 |
| «Intentar de nuevo» | `{retry}` | `processingState === 'error'` |  |  | AudioReportUploader · l.324 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Seleccionar archivo de audio» | file | accepts `audio/*` |  | `processingState === 'idle'` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | AudioReportUploader · l.242 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onDrop={handleDrop} · onDragOver={handleDrag} · onDragEnter={handleDrag} · onDragLeave={handleDrag}` | `processingState === 'idle'` | AudioReportUploader · l.216 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «El archivo debe ser de tipo audio (MP3, WAV, M4A, OGG, WEBM, AAC)» | `!file.type.startsWith('audio/')` | handleFileUpload · l.93 |
| error | «El archivo excede el tamaño máximo de 25 MB (tamaño: {(file.size / 1024 / 1024).t…} MB)» | `file.size > MAX_FILE_SIZE` | handleFileUpload · l.98 |
| success | «Informe de audio creado exitosamente» |  | uploadAudio · l.129 |
| error | «{errorMsg}» |  | uploadAudio · l.137 |
| success | «Grabación iniciada» |  | startRecording · l.172 |
| error | «Error al acceder al micrófono. Verifica los permisos.» |  | startRecording · l.175 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al procesar el audio» | `throw (shown by whoever catches it)` | `!response.ok` | uploadAudio · l.125 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `disabled` | AudioReportUploader · l.205 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `errorMsg` | «Error al procesar el audio» | uploadAudio · l.135 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, 1000)` | startRecording · l.168 |
| role | `role=status aria-live=polite` | AudioReportUploader · l.289 |

**Values shown from data** (2)

- `{formatTime(recordingTime)}` — AudioReportUploader · l.274, when `processingState === 'idle' && isRecording`
- `{errorMessage}` — AudioReportUploader · l.322, when `processingState === 'error' && errorMessage`

**Other texts on screen** (9)

- «Arrastra un archivo de audio aquí o haz clic para seleccionar» — AudioReportUploader · l.229, when `processingState === 'idle'`
- «MP3, WAV, M4A, OGG, WEBM, AAC (máx. 25 MB)» — AudioReportUploader · l.232, when `processingState === 'idle'`
- «o» — AudioReportUploader · l.255, when `processingState === 'idle' && canRecord && !isRecording`
- «Grabando» — AudioReportUploader · l.272, when `processingState === 'idle' && isRecording`
- «Subiendo audio...» — AudioReportUploader · l.293, when `processingState === 'uploading'`
- «Procesando audio (transcripción y resumen con IA)...» — AudioReportUploader · l.301, when `processingState === 'processing'`
- «Esto puede tomar hasta 1 minuto» — AudioReportUploader · l.303, when `processingState === 'processing'`
- «Informe creado exitosamente» — AudioReportUploader · l.310, when `processingState === 'complete'`
- «Error al procesar el audio» — AudioReportUploader · l.319, when `processingState === 'error'`

### components/sessions/EditRequestModal.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Solicitar Cambios a la Sesión» | h3 |  | EditRequestModal · l.117 |
| «Cambios propuestos:» | h4 | `changedFields.length > 0` | EditRequestModal · l.200 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{submitting}` |  | EditRequestModal · l.118 |
| «Cancelar» | `{onClose}` |  | `{submitting}` |  | EditRequestModal · l.244 |
| «Enviando... / Enviar Solicitud» (submits the form) |  |  | `{submitting \|\| changedFields.length === 0}` |  | EditRequestModal · l.252 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Fecha de la sesión» | date |  |  |  |  | EditRequestModal · l.142 |
| «Hora de inicio (hora Chile)» | time |  |  |  |  | EditRequestModal · l.155 |
| «Hora de término (hora Chile)» | time |  |  |  |  | EditRequestModal · l.168 |
| «Modalidad» | select |  | «Presencial», «En línea», «Híbrida» |  |  | EditRequestModal · l.186 |
| «Razón del cambio (opcional)» | textarea | «Explique por qué necesita estos cambios...» |  |  |  | EditRequestModal · l.233 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | EditRequestModal · l.127 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Solicitar Cambios a la Sesión» | written in this file |  |  | EditRequestModal · l.114 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `labels` | «Fecha», «Hora de inicio», «Hora de término», «Modalidad», «Comunidad de crecimiento», «Escuela» | formatFieldLabel · l.72 |
| `modalityLabels` | «Presencial», «En línea», «Híbrida» | formatValue · l.96 |
| `formatValue()` | «No definido» | formatValue · l.85 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=edit-request-spain-preview` | EditRequestModal · l.178 |

**Values shown from data** (4)

- `{spainTimePreview}` — EditRequestModal · l.179, when `spainTimePreview`
- `{formatFieldLabel(field)} :` — EditRequestModal · l.215, when `changedFields.length > 0 && each changedFields`
- `{formatValue(field, oldVal)}` — EditRequestModal · l.217, when `changedFields.length > 0 && each changedFields`
- `{formatValue(field, newVal)}` — EditRequestModal · l.219, when `changedFields.length > 0 && each changedFields`

**Other texts on screen** (8)

- «Cambios estructurales requieren aprobación» — EditRequestModal · l.131
- «Los campos marcados a continuación requieren aprobación del administrador. Los demás campos (título, descripción, objetivos, etc.) pueden editarse directamente.» — EditRequestModal · l.133
- «Fecha de la sesión» (label) — EditRequestModal · l.141
- «Hora de inicio (hora Chile)» (label) — EditRequestModal · l.152
- «Hora de término (hora Chile)» (label) — EditRequestModal · l.165
- «En España:» — EditRequestModal · l.179, when `spainTimePreview`
- «Modalidad» (label) — EditRequestModal · l.185
- «Razón del cambio (opcional)» (label) — EditRequestModal · l.230

### components/sessions/HoursComparisonPanel.tsx

Used by: `/admin/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Horas: planificado vs. Zoom» | h2 |  | HoursComparisonPanel · l.157 |
| «Historial de ajustes» | h3 | `payload.overrides.length > 0` | HoursComparisonPanel · l.342 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ajustar horas descontadas» | `{() => { setFormOpen((open) => !open); setRequestId(crypto.randomUUID()); }}` |  | `{!canOverride}` | `testid=override-open-button` | HoursComparisonPanel · l.249 |
| «Aplicando… / Aplicar ajuste» (submits the form) |  | `formOpen && canOverride` | `{submitting \|\| reason.trim() === '' \|\| minutes === ''}` | `testid=override-submit` | HoursComparisonPanel · l.327 |
| «Revertir» · tooltip «Requiere un motivo escrito en el formulario de ajuste» | `{() => void submitOverride(override.id)}` | `payload.overrides.length > 0 && each payload.overrides && reversible?.id === override.id` | `{submitting \|\| reason.trim() === ''}` | `testid=override-reverse-{override.id}` | HoursComparisonPanel · l.362 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Minutos a descontar (0 = sesión eximida)» | number | required · `min={0} step={1}` |  | `formOpen && canOverride` | `testid=override-minutes-input id=override-minutes (id used by code)` | HoursComparisonPanel · l.280 |
| «Categoría del motivo» | select |  | «(lista) {label}» | `formOpen && canOverride` | `testid=override-category-select id=override-category (id used by code)` | HoursComparisonPanel · l.299 |
| «Motivo (obligatorio)» | textarea | required |  | `formOpen && canOverride` | `testid=override-reason-input id=override-reason (id used by code)` | HoursComparisonPanel · l.317 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); void submitOverride(null); }}` | `formOpen && canOverride` | HoursComparisonPanel · l.268 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Ajuste revertido correctamente / Horas ajustadas correctamente» |  | submitOverride · l.102 |
| error | «Error inesperado» |  | submitOverride · l.111 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudo cargar la comparación de horas» | `throw (shown by whoever catches it)` | `!response.ok` | HoursComparisonPanel · l.60 |
| «Error inesperado» | `setLoadError` |  | HoursComparisonPanel · l.65 |
| «No se pudo aplicar el ajuste» | `throw (shown by whoever catches it)` | `!response.ok` | submitOverride · l.100 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Clock` | aria-hidden: true |  |  | HoursComparisonPanel · l.158 |
| `RotateCcw` | aria-hidden: true | `payload.overrides.length > 0 && each payload.overrides && reversible?.id === override.id` |  | HoursComparisonPanel · l.370 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `OVERRIDE_CATEGORY_LABELS` | «Presencia parcial del consultor», «Solicitud del colegio», «Falla técnica», «Otro» | l.23 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (13)

| Kind | What | Where |
|---|---|---|
| mark | `testid=hours-comparison-panel` | HoursComparisonPanel · l.119 |
| mark | `testid=hours-comparison-panel` | HoursComparisonPanel · l.127 |
| mark | `testid=hours-comparison-panel` | HoursComparisonPanel · l.153 |
| mark | `testid=hours-invariant-banner` | HoursComparisonPanel · l.163 |
| mark | `testid=hours-planned` | HoursComparisonPanel · l.173 |
| mark | `testid=hours-zoom-elapsed` | HoursComparisonPanel · l.179 |
| mark | `testid=hours-presence` | HoursComparisonPanel · l.187 |
| mark | `testid=hours-delta` | HoursComparisonPanel · l.195 |
| mark | `testid=hours-provisional-badge` | HoursComparisonPanel · l.207 |
| mark | `testid=hours-open-badge` | HoursComparisonPanel · l.220 |
| mark | `testid=hours-effective` | HoursComparisonPanel · l.235 |
| mark | `testid=override-history` | HoursComparisonPanel · l.341 |
| mark | `testid=override-row-{override.id}` | HoursComparisonPanel · l.345 |

**Values shown from data** (2)

- `{formatMinutes(planned)}` — HoursComparisonPanel · l.173
- `{override.reason}` — HoursComparisonPanel · l.382, when `payload.overrides.length > 0 && each payload.overrides`

**Other texts on screen** (24)

- «Cargando comparación de horas…» — HoursComparisonPanel · l.120, when `loading`
- «{loadError} / Error inesperado» — HoursComparisonPanel · l.128, when `loadError \|\| !payload`
- «Las horas descontadas siguen siendo las planificadas salvo ajuste manual.» — HoursComparisonPanel · l.167
- «Planificado» — HoursComparisonPanel · l.172
- «Zoom (reunión)» — HoursComparisonPanel · l.178
- «[Sin reunión Zoom] [Reunión en curso] [{formatMinutes(payload.zoom.elapsed_…}]» — HoursComparisonPanel · l.179
- «Zoom (presencia facilitador)» — HoursComparisonPanel · l.186
- «Sin facilitador principal / Sin datos de presencia / {formatMinutes(presence)}» — HoursComparisonPanel · l.187
- «Δ + {delta} min ({deltaPct > 0 ? '+' : ''}{deltaPct}%) · revisar» — HoursComparisonPanel · l.195, when `delta !== null`
- «Datos provisionales (webhook) — el informe de Zoom aún no se consolida» — HoursComparisonPanel · l.211, when `payload.attendance.state === 'webhook_provisional'`
- «Sin datos de asistencia todavía» — HoursComparisonPanel · l.216, when `payload.attendance.state === 'none' && payload.zoom.state !== 'none'`
- «Hay intervalos sin salida registrada — presencia incompleta» — HoursComparisonPanel · l.224, when `payload.attendance.has_open_intervals`
- «El facilitador tiene un intervalo abierto» — HoursComparisonPanel · l.229, when `lead?.has_open_interval`
- «Horas descontadas: valor planificado» — HoursComparisonPanel · l.236
- «Sesión eximida (0 min descontados)» — HoursComparisonPanel · l.238, when `effectiveMinutes === 0`
- «Horas descontadas ajustadas:» — HoursComparisonPanel · l.242, when `effectiveMinutes !== null && effectiveMinutes > 0`
- «{effectiveMinutes} min» — HoursComparisonPanel · l.242, when `effectiveMinutes !== null && effectiveMinutes > 0`
- «Disponible cuando la sesión esté finalizada (horas consumidas).» — HoursComparisonPanel · l.263, when `!canOverride`
- «Minutos a descontar (0 = sesión eximida)» (label) — HoursComparisonPanel · l.277, when `formOpen && canOverride`
- «Valor anterior: planificado / {effectiveMinutes} min» — HoursComparisonPanel · l.291, when `formOpen && canOverride`
- «Categoría del motivo» (label) — HoursComparisonPanel · l.296, when `formOpen && canOverride`
- «Motivo (obligatorio)» (label) — HoursComparisonPanel · l.314, when `formOpen && canOverride`
- «[Reversión:] planificado / {override.previous_minutes} min → planificado / Sesión eximida (0 min) / {override.new_minutes} min» — HoursComparisonPanel · l.351, when `payload.overrides.length > 0 && each payload.overrides`
- «{OVERRIDE_CATEGORY_LABELS[override.r…} / {override.reason_category} · {override.created_by_name} / Administrador · {new Date(override.created_at).toLoc…}» — HoursComparisonPanel · l.375, when `payload.overrides.length > 0 && each payload.overrides`

### components/sessions/JoinMeetingButton.tsx

Used by: `/meet/session/[id]`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Unirse a la reunión» | `{handleJoin}` | `outcome.kind !== 'preflight' && outcome.kind !== 'joining'` | `{busy}` | `testid=meet-join-button` | JoinMeetingButton · l.744 |
| «{USE_LINK_LABEL}» | `{handleLeaveEmbedForLink}` | `outcome.kind === 'joining'` |  | `testid=meet-embed-use-link` | JoinMeetingButton · l.799 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{USE_LINK_LABEL}» | `{outcome.url}` (new tab) | `outcome.kind === 'link'` | `testid=meet-join-open-link` | JoinMeetingButton · l.845 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · Reunión de Zoom · {CLIENT_VIEW_FRAME_SRC} | `clientFrameOpen` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `testid=meet-client-root` | JoinMeetingButton · l.892 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «embed context missing» | `throw (shown by whoever catches it)` | `!root` | joinWithComponentView · l.505 |
| «embed context missing» | `throw (shown by whoever catches it)` | `!frame` | joinWithClientView · l.568 |
| «embed context missing» | `throw (shown by whoever catches it)` | `!credentials` | runEmbeddedJoin · l.651 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `router.replace` | `response.status === 401` | handleJoinResponse · l.377 |
| `/404` | `router.replace` | `response.status === 404` | handleJoinResponse · l.382 |
| `{payload.join_url}` | `window.open` | `payload?.mode === 'link' && typeof payload.join_url === 'string'` | handleJoinResponse · l.402 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!pendingClientJoinRef.current` | JoinMeetingButton · l.690 |
| `outcome.kind !== 'joining' \|\| outcome.view !== 'client'` | JoinMeetingButton · l.691 |
| `!clientFrameRef.current` | JoinMeetingButton · l.692 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Loader2` | aria-hidden: true | `outcome.kind !== 'preflight' && outcome.kind !== 'joining' && busy` |  | JoinMeetingButton · l.752 |
| `ExternalLink` | aria-hidden: true | `outcome.kind !== 'preflight' && outcome.kind !== 'joining' && !(busy)` |  | JoinMeetingButton · l.754 |
| `PreJoinCheck` |  | `outcome.kind === 'preflight'` |  | JoinMeetingButton · l.761 |
| `ExternalLink` | aria-hidden: true | `outcome.kind === 'joining'` |  | JoinMeetingButton · l.805 |
| `ExternalLink` | aria-hidden: true | `outcome.kind === 'link'` |  | JoinMeetingButton · l.852 |
| `MeetingDialIn` |  |  |  | JoinMeetingButton · l.912 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (6)

| Name | Texts | Where |
|---|---|---|
| `PENDING_MESSAGE` | «Enlace en preparación» | l.166 |
| `REQUEST_FAILED_MESSAGE` | «No pudimos preparar el acceso a la reunión. Intenta nuevamente.» | l.169 |
| `USE_LINK_LABEL` | «Abrir Zoom en otra pestaña» | l.172 |
| `LINK_OPENED_MESSAGE` | «Abrimos Zoom en una pestaña nueva. Si no la ves, usa el enlace:» | l.188 |
| `EMBED_CONNECTING_MESSAGE` | «Conectando a la reunión…» | l.191 |
| `EMBED_USE_LINK_HINT` | «¿Prefieres abrir Zoom aparte?» | l.200 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (10)

| Kind | What | Where |
|---|---|---|
| listener | `frame.addEventListener('load')` | joinWithClientView · l.625 |
| role | `role=status` | JoinMeetingButton · l.769 |
| mark | `testid=meet-embed-connecting` | JoinMeetingButton · l.769 |
| role | `role=status` | JoinMeetingButton · l.812 |
| mark | `testid=meet-join-pending` | JoinMeetingButton · l.812 |
| role | `role=alert` | JoinMeetingButton · l.822 |
| mark | `testid=meet-join-error` | JoinMeetingButton · l.822 |
| role | `role=status` | JoinMeetingButton · l.839 |
| mark | `testid=meet-join-link` | JoinMeetingButton · l.839 |
| mark | `testid=meet-embed-root` | JoinMeetingButton · l.865 |

**Values shown from data** (5)

- `{EMBED_CONNECTING_MESSAGE}` — JoinMeetingButton · l.769, when `outcome.kind === 'joining'`
- `{EMBED_USE_LINK_HINT}` — JoinMeetingButton · l.798, when `outcome.kind === 'joining'`
- `{PENDING_MESSAGE}` — JoinMeetingButton · l.812, when `outcome.kind === 'pending'`
- `{outcome.message}` — JoinMeetingButton · l.822, when `outcome.kind === 'denied'`
- `{LINK_OPENED_MESSAGE}` — JoinMeetingButton · l.844, when `outcome.kind === 'link'`

**Other texts on screen** (1)

- «La reunión se abre en un servicio externo a GENERA, en una pestaña nueva.» — JoinMeetingButton · l.908, when `!embedActive`

### components/sessions/MeetingDialIn.tsx

Used by: `/meet/session/[id]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Unirse por teléfono» | h2 |  | MeetingDialIn · l.45 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!dialIn` | MeetingDialIn · l.36 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Phone` | aria-hidden: true |  |  | MeetingDialIn · l.46 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| mark | `testid=meet-dial-in` | MeetingDialIn · l.41 |
| mark | `testid=meet-dial-in-numbers` | MeetingDialIn · l.54 |
| mark | `testid=meet-dial-in-meeting-number` | MeetingDialIn · l.70 |
| mark | `testid=meet-dial-in-passcode` | MeetingDialIn · l.80 |

**Values shown from data** (4)

- `{entry.number}` — MeetingDialIn · l.57, when `each dialIn.numbers`
- `{locationLabel(entry)}` — MeetingDialIn · l.61, when `each dialIn.numbers && locationLabel(entry)`
- `{dialIn.meeting_number}` — MeetingDialIn · l.70
- `{dialIn.passcode}` — MeetingDialIn · l.80, when `dialIn.passcode`

**Other texts on screen** (3)

- «Si la conexión a internet falla, puedes llamar a uno de estos números y luego marcar el número de la reunión y la clave.» — MeetingDialIn · l.50
- «Número de la reunión» — MeetingDialIn · l.69
- «Clave de la reunión» — MeetingDialIn · l.79, when `dialIn.passcode`

### components/sessions/PreJoinCheck.tsx

Used by: `/meet/session/[id]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Revisión antes de entrar» | h3 |  | PreJoinCheck · l.159 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Entrar a la reunión» | `{onContinue}` |  | `{busy}` | `testid=meet-prejoin-continue` | PreJoinCheck · l.186 |
| «Abrir Zoom en otra pestaña» | `{onUseLink}` |  | `{busy}` | `testid=meet-prejoin-use-link` | PreJoinCheck · l.200 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `cancelled` | PreJoinCheck · l.127 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Loader2` | aria-hidden: true | `busy` |  | PreJoinCheck · l.194 |
| `Video` | aria-hidden: true | `!(busy)` |  | PreJoinCheck · l.196 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `TONE_LABEL` | «Listo», «Atención», «Falla», «Revisando» | l.51 |
| `label` | «Cámara / Micrófono» | describeDevice · l.70 |
| `noun` | «la cámara / el micrófono» | describeDevice · l.71 |
| `rows` | «Motor de video», «Este navegador puede mostrar la reunión dentro de GENERA. [if engineAvailable]», «Este navegador no puede mostrar la reunión aquí. Abre Zoom en otra pestaña. [if not engineAvailable]» | PreJoinCheck · l.140 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Este navegador ya tiene permiso para usar {noun}.» | describeDevice · l.83 |
| «Puedes entrar igual, pero sin {noun}. Para habilitarlo, revisa el candado de la barra de direcciones.» | describeDevice · l.90 |
| «El navegador va a preguntar por {noun} al entrar. Acepta para que te vean y te escuchen.» | describeDevice · l.97 |
| «Este equipo no puede entregar audio ni video a la página. Conviene abrir Zoom en otra pestaña.» | describeDevice · l.104 |
| «Este navegador no informa el estado del permiso. Se pedirá {noun} al entrar.» | describeDevice · l.111 |
| «Compatible» | PreJoinCheck · l.146 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=meet-prejoin-check` | PreJoinCheck · l.155 |
| mark | `testid=meet-prejoin-{row.id}` | PreJoinCheck · l.166 |

**Values shown from data** (4)

- `{row.label}` — PreJoinCheck · l.172, when `each rows`
- `{row.value}` — PreJoinCheck · l.173, when `each rows`
- `{row.note}` — PreJoinCheck · l.174, when `each rows && row.note`
- `{TONE_LABEL[row.tone]}` — PreJoinCheck · l.176, when `each rows`

**Other texts on screen** (1)

- «La reunión se abre dentro de esta misma página. Esto revisa que el equipo esté listo.» — PreJoinCheck · l.161

### components/sessions/SessionCreateClasico.tsx

Used by: `/admin/sessions/create`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Error al cargar consultores» | h4 | `showConsultants && showConsultantsError()` | SessionCreateClasico · l.268 |
| «Configuración de recurrencia» | h4 | `showRecurrence` | SessionCreateClasico · l.504 |
| «Vista previa ( {previewDates.length} sesiones)» | h5 | `showRecurrence && showPreview()` | SessionCreateClasico · l.583 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{retryConsultants}` | `showConsultants && showConsultantsError()` |  |  | SessionCreateClasico · l.271 |
| «{facilitatorRoleLabel(facilitator)}» | `{() => handleToggleRole(facilitator.user_id)}` | `showConsultants && showFacilitators() && each facilitators` |  |  | SessionCreateClasico · l.311 |
| «Quitar» · aria «{`Quitar consultor ${consultant.first_name} ${consultant.last_name}`}» | `{() => handleRemoveFacilitator(facilitator.user_id)}` | `showConsultants && showFacilitators() && each facilitators` |  |  | SessionCreateClasico · l.329 |
| «[icon X]» · aria «Eliminar fecha» | `{() => handleRemoveCustomDate(index)}` | `showRecurrence && showCustomDates() && each customDates && canRemoveCustomDate()` |  |  | SessionCreateClasico · l.557 |
| «Agregar fecha» | `{handleAddCustomDate}` | `showRecurrence && showCustomDates()` |  |  | SessionCreateClasico · l.569 |
| «Guardar serie como borrador ({previewDates.length} sesiones) / Guardar borrador» | `{handleSaveDraft}` |  | `{draftDisabled}` |  | SessionCreateClasico · l.725 |
| «Programar serie ({previewDates.length} sesiones) / Programar sesión» | `{handleScheduleSession}` |  | `{scheduleDisabled}` |  | SessionCreateClasico · l.736 |

**Fields** (22)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Colegio *» | select | `school_id` · required | «Seleccione un colegio», «(lista) {school.name}» |  |  | SessionCreateClasico · l.118 |
| «Comunidad de Crecimiento *» | select | `growth_community_id` · required · disabled: `{communitySelectDisabled}` | «Seleccione una comunidad», «(lista) {community.name}» |  |  | SessionCreateClasico · l.138 |
| «Tipo de Hora» | select |  | «Seleccione tipo de hora», «(lista) {ht.display_name}» | `showHourTypeSelects` | `id=hour-type-select (id used by code)` | SessionCreateClasico · l.171 |
| «Contrato» | select | disabled: `{contratoSelectDisabled()}` | «Seleccione un contrato», «(lista) {c.nombre}» | `showHourTypeSelects` | `id=contrato-select (id used by code)` | SessionCreateClasico · l.190 |
| «Consultor principal» | checkbox |  |  | `showConsultants && showFacilitators() && each facilitators` |  | SessionCreateClasico · l.320 |
| «Consultor(es) asignados *» | select | disabled: `{consultantSelectorDisabled()}` | «Agregar consultor...», «(lista) {consultant.first_name} {consultant.last_name} ( {consultant.email} )» | `showConsultants && showConsultantSelector()` |  | SessionCreateClasico · l.346 |
| «Título de la Sesión *» | text | `title` · «Ej: Sesión de planificación trimestral» · required · `maxLength={200}` |  |  |  | SessionCreateClasico · l.368 |
| «Descripción» | textarea | `description` · «Descripción de la sesión...» |  |  |  | SessionCreateClasico · l.385 |
| «Objetivos» | textarea | `objectives` · «Objetivos de la sesión...» |  |  |  | SessionCreateClasico · l.400 |
| «Fecha *» | date | `session_date` · required · `min={earliestDate}` |  |  |  | SessionCreateClasico · l.416 |
| «Hora de inicio (hora Chile) *» | time | `start_time` · required |  |  |  | SessionCreateClasico · l.432 |
| «Hora de término (hora Chile) *» | time | `end_time` · required |  |  |  | SessionCreateClasico · l.447 |
| «Sesión única» | radio |  |  |  |  | SessionCreateClasico · l.481 |
| «Serie recurrente» | radio |  |  |  |  | SessionCreateClasico · l.490 |
| «Frecuencia» | select |  | «Semanal», «Quincenal», «Mensual», «Fechas personalizadas» | `showRecurrence` |  | SessionCreateClasico · l.511 |
| «Número de sesiones (2-52)» | number | `min={2} max={52}` |  | `showRecurrence && showRecurrenceCount()` |  | SessionCreateClasico · l.529 |
| «Fechas personalizadas» | date | `min={customDateEarliest[index]}` |  | `showRecurrence && showCustomDates() && each customDates` |  | SessionCreateClasico · l.549 |
| «{mod}» | radio | `modality` |  | `each (['presencial', 'online', 'hibrida'] as const)` |  | SessionCreateClasico · l.624 |
| «Generar reunión Zoom» | checkbox | `is_zoom_managed` |  | `showMeetingFields && zoomManagedAvailable` | `testid=session-zoom-managed` | SessionCreateClasico · l.644 |
| «Enlace de reunión *» | url | `meeting_link` · «https://zoom.us/j/123456789» |  | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateClasico · l.673 |
| «Proveedor de reunión» | select | `meeting_provider` | «Auto-detectar», «Zoom», «Google Meet», «Microsoft Teams», «Otro» | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateClasico · l.687 |
| «Ubicación *» | text | `location` · «Ej: Sala de profesores» |  | `showLocation` |  | SessionCreateClasico · l.711 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!consultant` | SessionCreateClasico · l.296 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ResponsiveFunctionalPageHeader` | title: Programar Sesión · subtitle: Crear una nueva sesión de consultoría para una comunidad de crecimiento |  |  | SessionCreateClasico · l.100 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `badgeText` | «Sin horas disponibles en este tipo (se registrará como sobrepresupuesto) / {(availableHours as number).…} horas disponibles en este tipo — ¡Quedan menos del 25%! / {(availableHours as number).…} horas disponibles en este tipo» | SessionCreateClasico · l.227 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=create-session-spain-preview` | SessionCreateClasico · l.466 |
| mark | `testid=session-zoom-managed-help` | SessionCreateClasico · l.657 |

**Values shown from data** (6)

- `{badgeText}` — SessionCreateClasico · l.233, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket()`
- `{consultantsError}` — SessionCreateClasico · l.269, when `showConsultants && showConsultantsError()`
- `{consultant.first_name} {consultant.last_name}` — SessionCreateClasico · l.304, when `showConsultants && showFacilitators() && each facilitators`
- `{consultant.email}` — SessionCreateClasico · l.307, when `showConsultants && showFacilitators() && each facilitators`
- `{spainTimePreview}` — SessionCreateClasico · l.470, when `spainTimePreview`
- `{format(parsedDate, 'EEEE, dd MMMM y…}` — SessionCreateClasico · l.598, when `showRecurrence && showPreview() && each previewDates`

**Other texts on screen** (37)

- «* Campos obligatorios» — SessionCreateClasico · l.109
- «Colegio *» (label) — SessionCreateClasico · l.115
- «Comunidad de Crecimiento *» (label) — SessionCreateClasico · l.135
- «Cargando tipos de hora...» — SessionCreateClasico · l.158, when `showHourTypesLoading`
- «No se pudieron cargar los tipos de hora. La sesión puede crearse sin seguimiento de horas.» — SessionCreateClasico · l.162, when `showHourTypesError`
- «Tipo de Hora» (label) — SessionCreateClasico · l.168, when `showHourTypeSelects`
- «Contrato» (label) — SessionCreateClasico · l.187, when `showHourTypeSelects`
- «No hay contratos activos para este colegio.» — SessionCreateClasico · l.206, when `showHourTypeSelects && showNoContratos()`
- «Cargando horas disponibles...» — SessionCreateClasico · l.218, when `showHoursChip && availableHoursLoading`
- «No hay asignación de horas para este tipo en el contrato seleccionado» — SessionCreateClasico · l.239, when `showHoursChip && !(availableHoursLoading) && !(hasHoursBucket())`
- «Consultor(es) asignados *» (label) — SessionCreateClasico · l.248, when `showConsultants`
- «Debe asignar al menos un consultor antes de crear la sesión.» — SessionCreateClasico · l.252, when `showConsultants`
- «Cargando consultores...» — SessionCreateClasico · l.259, when `showConsultants && showConsultantsLoading()`
- «No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.» — SessionCreateClasico · l.286, when `showConsultants && showConsultantsEmpty()`
- «Consultor principal» (label) — SessionCreateClasico · l.319, when `showConsultants && showFacilitators() && each facilitators`
- «Título de la Sesión *» (label) — SessionCreateClasico · l.365
- «Descripción» (label) — SessionCreateClasico · l.382
- «Objetivos» (label) — SessionCreateClasico · l.397
- «Fecha *» (label) — SessionCreateClasico · l.413
- «Hora de inicio (hora Chile) *» (label) — SessionCreateClasico · l.428
- «Hora de término (hora Chile) *» (label) — SessionCreateClasico · l.443
- «En España:» — SessionCreateClasico · l.470, when `spainTimePreview`
- «Tipo de sesión» (label) — SessionCreateClasico · l.476
- «Sesión única» (label) — SessionCreateClasico · l.480
- «Serie recurrente» (label) — SessionCreateClasico · l.489
- «Frecuencia» (label) — SessionCreateClasico · l.508, when `showRecurrence`
- «Número de sesiones (2-52)» (label) — SessionCreateClasico · l.526, when `showRecurrence && showRecurrenceCount()`
- «Fechas personalizadas» (label) — SessionCreateClasico · l.543, when `showRecurrence && showCustomDates()`
- «Sesión {index + 1}» — SessionCreateClasico · l.597, when `showRecurrence && showPreview() && each previewDates`
- «Fin de semana» — SessionCreateClasico · l.604, when `showRecurrence && showPreview() && each previewDates && isWeekend`
- «Modalidad *» (label) — SessionCreateClasico · l.618
- «{mod}» (label) — SessionCreateClasico · l.623, when `each (['presencial', 'online', 'hibrida'] as const)`
- «Generar reunión Zoom» (label) — SessionCreateClasico · l.643, when `showMeetingFields && zoomManagedAvailable`
- «GENERA crea la reunión y su enlace cuando se apruebe la sesión.» — SessionCreateClasico · l.661, when `showMeetingFields && zoomManagedAvailable && showZoomManagedHelp()`
- «Enlace de reunión *» (label) — SessionCreateClasico · l.670, when `showMeetingFields && showManualMeetingFields()`
- «Proveedor de reunión» (label) — SessionCreateClasico · l.684, when `showMeetingFields && showManualMeetingFields()`
- «Ubicación *» (label) — SessionCreateClasico · l.708, when `showLocation`

### components/sessions/SessionCreateNuevo.tsx

Used by: `/admin/sessions/create`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{scheduleLabel}» (submits the form) |  |  | `{scheduleDisabled}` |  | SessionCreateNuevo · l.521 |
| «{draftLabel}» | `{onDraft}` |  | `{draftDisabled}` |  | SessionCreateNuevo · l.530 |
| «Cancelar» |  |  | `{submitting}` |  | SessionCreateNuevo · l.534 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{failure.message}» | `#[*]` | `failures.length > 0 && each placed` |  | SessionCreateNuevo · l.244 |

**Fields** (12)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «school_id» | select | `school_id` |  |  |  | SessionCreateNuevo · l.270 |
| «growth_community_id» | select | `growth_community_id` · disabled: `{communitySelectDisabled}` |  |  |  | SessionCreateNuevo · l.287 |
| «Ej: Sesión de planificación trimestral» | text | `title` · «Ej: Sesión de planificación trimestral» · `maxLength={200}` |  |  |  | SessionCreateNuevo · l.317 |
| «Descripción de la sesión...» | textarea | `description` · «Descripción de la sesión...» |  |  |  | SessionCreateNuevo · l.330 |
| «Objetivos de la sesión...» | textarea | `objectives` · «Objetivos de la sesión...» |  |  |  | SessionCreateNuevo · l.339 |
| «session_date» | date | `session_date` · `min={earliestDate}` |  |  |  | SessionCreateNuevo · l.354 |
| «start_time» | time | `start_time` |  |  |  | SessionCreateNuevo · l.374 |
| «end_time» | time | `end_time` |  |  |  | SessionCreateNuevo · l.393 |
| «is_zoom_managed» | checkbox | `is_zoom_managed` |  | `showMeetingFields && zoomManagedAvailable` | `testid=session-zoom-managed` | SessionCreateNuevo · l.457 |
| «https://zoom.us/j/123456789» | url | `meeting_link` · «https://zoom.us/j/123456789» |  | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateNuevo · l.475 |
| «meeting_provider» | select | `meeting_provider` |  | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateNuevo · l.486 |
| «Ej: Sala de profesores» | text | `location` · «Ej: Sala de profesores» |  | `showLocation` |  | SessionCreateNuevo · l.501 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{onSubmit}` |  | SessionCreateNuevo · l.219 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmDialog` | component | `{confirmOpen}` | cancelLabel: Cancelar | SessionCreateNuevo · l.541 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `presses === 0` | SessionCreateNuevo · l.149 |
| `!box` | SessionCreateNuevo · l.151 |
| `!draftsLeft \|\| !notice \|\| typeof notice.scrollIntoView !== 'function'` | SessionCreateNuevo · l.166 |

**Pieces placed here, with the texts and settings handed to them** (30)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PageHeader` | title: Programar Sesión · description: Crear una nueva sesión de consultoría para una comunidad de crecimiento |  |  | SessionCreateNuevo · l.213 |
| `Notice` | tone: error | `failures.length > 0` | `testid=session-create-nuevo-checks` | SessionCreateNuevo · l.233 |
| `Notice` | tone: warning | `draftsLeft` | `testid=session-create-nuevo-drafts-left` | SessionCreateNuevo · l.261 |
| `SectionNuevo` | title: Colegio y consultores |  | `id=create-session-s1` | SessionCreateNuevo · l.267 |
| `Field` | label: Colegio |  |  | SessionCreateNuevo · l.269 |
| `Field` | label: Comunidad de Crecimiento |  |  | SessionCreateNuevo · l.286 |
| `ConsultantsNuevo` |  | `showConsultants` |  | SessionCreateNuevo · l.306 |
| `SectionNuevo` | title: Datos de la sesión |  | `id=create-session-s2` | SessionCreateNuevo · l.315 |
| `Field` | label: Título de la Sesión |  |  | SessionCreateNuevo · l.316 |
| `Field` | label: Descripción |  |  | SessionCreateNuevo · l.329 |
| `Field` | label: Objetivos |  |  | SessionCreateNuevo · l.338 |
| `SectionNuevo` | title: Fecha y hora |  | `id=create-session-s3` | SessionCreateNuevo · l.351 |
| `Field` | label: Fecha |  |  | SessionCreateNuevo · l.353 |
| `Field` |  |  |  | SessionCreateNuevo · l.364 |
| `Field` |  |  |  | SessionCreateNuevo · l.383 |
| `SectionNuevo` | title: Tipo de sesión |  | `id=create-session-s4 (id used by code)` | SessionCreateNuevo · l.412 |
| `Radio` | label: Sesión única |  |  | SessionCreateNuevo · l.414 |
| `Radio` | label: Serie recurrente |  |  | SessionCreateNuevo · l.415 |
| `RecurrenceNuevo` |  | `showRecurrence` |  | SessionCreateNuevo · l.418 |
| `SectionNuevo` |  |  | `id=create-session-s5 (id used by code)` | SessionCreateNuevo · l.428 |
| `Radio` |  | `each (['presencial', 'online', 'hibrida'] as const)` |  | SessionCreateNuevo · l.442 |
| `Field` | label: Enlace de reunión | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateNuevo · l.474 |
| `Field` | label: Proveedor de reunión | `showMeetingFields && showManualMeetingFields()` |  | SessionCreateNuevo · l.485 |
| `Field` | label: Ubicación | `showLocation` |  | SessionCreateNuevo · l.500 |
| `SectionNuevo` | title: Horas y contrato |  | `id=create-session-s6` | SessionCreateNuevo · l.515 |
| `HoursNuevo` |  |  |  | SessionCreateNuevo · l.516 |
| `SummaryNuevo` |  |  |  | SessionCreateNuevo · l.520 |
| `Send` | aria-hidden: true | `!(submitting && working === 'schedule')` |  | SessionCreateNuevo · l.527 |
| `Save` | aria-hidden: true | `!(submitting && working === 'draft')` |  | SessionCreateNuevo · l.531 |
| `Send` | aria-hidden: true |  |  | SessionCreateNuevo · l.563 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `kind` | «serie / una» | onConfirm · l.190 |
| `scheduleLabel` | «Programar serie ({previewDates.length} sesiones) / Programar sesión» | SessionCreateNuevo · l.204 |
| `draftLabel` | «Guardar serie como borrador ({previewDates.length} sesiones) / Guardar borrador» | SessionCreateNuevo · l.205 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Generar reunión Zoom» | SessionCreateNuevo · l.462 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (9)

| Kind | What | Where |
|---|---|---|
| scroll | `box.scrollIntoView()` | SessionCreateNuevo · l.152 |
| scroll | `notice.scrollIntoView()` | SessionCreateNuevo · l.167 |
| mark | `testid=session-create-nuevo` | SessionCreateNuevo · l.211 |
| mark | `id=create-session-form-title` | SessionCreateNuevo · l.226 |
| mark | `testid=create-session-spain-preview` | SessionCreateNuevo · l.405 |
| role | `role=radiogroup` | SessionCreateNuevo · l.413 |
| role | `role=radiogroup` | SessionCreateNuevo · l.440 |
| mark | `testid=session-zoom-managed-help` | SessionCreateNuevo · l.465 |
| scroll | `field.scrollIntoView()` | moveTo · l.587 |

**Values shown from data** (7)

- `{DRAFTS_LEFT_TEXT[draftsLeft]}` — SessionCreateNuevo · l.261, when `draftsLeft`
- `{spainTimePreview}` — SessionCreateNuevo · l.406, when `spainTimePreview`
- `{question.body}` — SessionCreateNuevo · l.546
- `{facts.schoolName}` — SessionCreateNuevo · l.549
- `{facts.communityName}` — SessionCreateNuevo · l.551
- `{facts.dateTerm}` — SessionCreateNuevo · l.552
- `{facts.dateText}` — SessionCreateNuevo · l.553

**Other texts on screen** (14)

- «Programar Sesión» — SessionCreateNuevo · l.227, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «* Campos obligatorios» — SessionCreateNuevo · l.230
- «Hora de inicio» — SessionCreateNuevo · l.367
- «(hora Chile)» — SessionCreateNuevo · l.367
- «Hora de término» — SessionCreateNuevo · l.386
- «(hora Chile)» — SessionCreateNuevo · l.386
- «En España:» — SessionCreateNuevo · l.406, when `spainTimePreview`
- «Modalidad» — SessionCreateNuevo · l.433
- «GENERA crea la reunión y su enlace cuando se apruebe la sesión.» — SessionCreateNuevo · l.466, when `showMeetingFields && zoomManagedAvailable && showZoomManagedHelp()`
- «Colegio» — SessionCreateNuevo · l.548
- «Comunidad» — SessionCreateNuevo · l.550
- «Horario» — SessionCreateNuevo · l.554
- «a» — SessionCreateNuevo · l.556
- «(hora Chile)» — SessionCreateNuevo · l.556

### components/sessions/SessionDetailClasico.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Descripción» | h3 | `activeTab === 'details'` | renderTabContent · l.126 |
| «Objetivos» | h3 | `activeTab === 'details'` | renderTabContent · l.132 |
| «Facilitadores» | h3 | `activeTab === 'details'` | renderTabContent · l.138 |
| «Asistencia ( {attendeeCount()} )» | h3 | `activeTab === 'details'` | renderTabContent · l.169 |
| «{fullName}» | h4 | `activeTab === 'details' && each session.attendees` · screen size: `md:hidden` | renderTabContent · l.320 |
| «{session.title}» | h1 |  | SessionDetailClasico · l.695 |
| «Historial de Solicitudes de Cambio» | h3 | `showEditRequests` | SessionDetailClasico · l.832 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Marcar todos presentes» | `{handleMarkAllPresent}` | `activeTab === 'details' && canChange()` |  |  | renderTabContent · l.174 |
| «Guardando... / Guardar asistencia» | `{handleSaveAttendance}` | `activeTab === 'details' && canChange()` | `{savingAttendance}` |  | renderTabContent · l.180 |
| «[icon Trash2]» | `{() => handleDeleteMaterial(material.id, material.file_name)}` | `activeTab === 'materials' && !(materials.length === 0) && each materials && canDeleteMaterial(material)` |  |  | renderTabContent · l.478 |
| «Crear Informe» | `{startEditingReport}` | `activeTab === 'report' && showCreateReportButton()` |  |  | renderTabContent · l.519 |
| «Editar Informe» | `{startEditingReport}` | `activeTab === 'report' && showEditReportButton()` |  |  | renderTabContent · l.528 |
| «Guardando... / Actualizar / Crear» | `{handleSaveReport}` | `activeTab === 'report' && showReportEditor()` | `{savingReport \|\| !reportContent.trim()}` |  | renderTabContent · l.560 |
| «Cancelar» | `{cancelEditingReport}` | `activeTab === 'report' && showReportEditor() && editingReport` |  |  | renderTabContent · l.568 |
| «Recargar» | `{reload}` | `conflictVisible` |  |  | SessionDetailClasico · l.673 |
| «Solicitar Cambios» | `{openEditRequest}` | `showEditRequestButton` | `{hasPendingEditRequest()}` |  | SessionDetailClasico · l.726 |
| «Finalizar Sesión» | `{openFinalize}` | `showFinalizeButton` | `{!finalizeCheck.can}` |  | SessionDetailClasico · l.749 |
| «{tab.label}» | `{() => selectTab(tab.id)}` | `each tabs` |  |  | SessionDetailClasico · l.892 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon ExternalLink]» | `{material.download_url}` (new tab) | `activeTab === 'materials' && !(materials.length === 0) && each materials && material.download_url` |  | renderTabContent · l.468 |
| «Agregar al Calendario» | `/api/sessions/[*]/ical` | `showCalendarLink` |  | SessionDetailClasico · l.713 |
| «Enlace» | `{session.join_path}` | `showJoinLink` | `testid=session-join-link` | SessionDetailClasico · l.797 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | renderTabContent · l.251 |
|  | select |  | «—», «A tiempo», «Tarde», «Salió temprano» | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | renderTabContent · l.267 |
| «Notas opcionales» | text | «Notas opcionales» |  | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | renderTabContent · l.289 |
| «— Asistió» | checkbox |  |  | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `md:hidden` |  | renderTabContent · l.340 |
| «Estado de llegada» | select |  | «—», «A tiempo», «Tarde», «Salió temprano» | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `md:hidden` |  | renderTabContent · l.361 |
| «Notas» | text | «Notas opcionales» |  | `activeTab === 'details' && each session.attendees && !(readMode())` · screen size: `md:hidden` |  | renderTabContent · l.386 |
| «Subiendo... / Subir material» | file | disabled: `{uploadingMaterial}` |  | `activeTab === 'materials' && canChange()` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | renderTabContent · l.423 |
| «Contenido del informe» | textarea | «Escriba el informe de la sesión...» |  | `activeTab === 'report' && showReportEditor()` |  | renderTabContent · l.540 |
| «Visibilidad» | select |  | «Solo facilitadores», «Todos los participantes» | `activeTab === 'report' && showReportEditor()` |  | renderTabContent · l.550 |

**Table columns** (11)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `activeTab === 'details'` · screen size: `hidden md:block` | renderTabContent · l.212 |
| «Esperado» | `activeTab === 'details'` · screen size: `hidden md:block` | renderTabContent · l.213 |
| «Asistió» | `activeTab === 'details'` · screen size: `hidden md:block` | renderTabContent · l.214 |
| «Estado de llegada» | `activeTab === 'details'` · screen size: `hidden md:block` | renderTabContent · l.215 |
| «Notas» | `activeTab === 'details'` · screen size: `hidden md:block` | renderTabContent · l.216 |
| «Archivo» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.444 |
| «Tipo» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.445 |
| «Tamaño» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.446 |
| «Subido por» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.447 |
| «Fecha» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.448 |
| «Acciones» | `activeTab === 'materials' && !(materials.length === 0)` | renderTabContent · l.449 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Agregar al Calendario` | `showCalendarLink` | SessionDetailClasico · l.713 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AttendanceSuggestionsPanel` |  | `activeTab === 'details'` |  | renderTabContent · l.164 |
| `AudioReportUploader` |  | `activeTab === 'report' && showAudioUploader()` |  | renderTabContent · l.511 |
| `AudioPlayer` |  | `activeTab === 'report' && !(showReportEditor()) && existingReport && signedAudioUrl` |  | renderTabContent · l.581 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=list` | renderTabContent · l.308 |
| role | `role=alert` | SessionDetailClasico · l.665 |

**Values shown from data** (31)

- `{f.profiles?.first_name} {f.profiles?.last_name}` — renderTabContent · l.143, when `activeTab === 'details' && each session.facilitators`
- `( {f.facilitator_role.replace(/_/g, ' …} )` — renderTabContent · l.151, when `activeTab === 'details' && each session.facilitators`
- `{fullName}` — renderTabContent · l.233, when `activeTab === 'details' && each session.attendees`, screen size: `hidden md:block`
- `{attendee.arrival_status?.replace(/_…} / —` — renderTabContent · l.263, when `activeTab === 'details' && each session.attendees && readMode()`, screen size: `hidden md:block`
- `{attendee.notes} / —` — renderTabContent · l.287, when `activeTab === 'details' && each session.attendees && readMode()`, screen size: `hidden md:block`
- `{attendee.arrival_status?.replace(/_…} / —` — renderTabContent · l.357, when `activeTab === 'details' && each session.attendees && readMode()`, screen size: `md:hidden`
- `{attendee.notes} / —` — renderTabContent · l.384, when `activeTab === 'details' && each session.attendees && readMode()`, screen size: `md:hidden`
- `{material.file_name}` — renderTabContent · l.458, when `activeTab === 'materials' && !(materials.length === 0) && each materials`
- `{material.file_type}` — renderTabContent · l.459, when `activeTab === 'materials' && !(materials.length === 0) && each materials`
- `{formatFileSize(material.file_size)}` — renderTabContent · l.460, when `activeTab === 'materials' && !(materials.length === 0) && each materials`
- `{uploaderNameText}` — renderTabContent · l.461, when `activeTab === 'materials' && !(materials.length === 0) && each materials`
- `{format(parseISO(material.created_at…}` — renderTabContent · l.462, when `activeTab === 'materials' && !(materials.length === 0) && each materials`
- `{format(parseISO(existingReport.crea…}` — renderTabContent · l.590, when `activeTab === 'report' && !(showReportEditor()) && existingReport`
- `{existingReport.content}` — renderTabContent · l.606, when `activeTab === 'report' && !(showReportEditor()) && existingReport`
- `{log.profiles?.first_name} {log.profiles?.last_name}` — renderTabContent · l.636, when `activeTab === 'activity' && hasActivity() && each session.activity_log`
- `{log.action.replace(/_/g, ' ')}` — renderTabContent · l.639, when `activeTab === 'activity' && hasActivity() && each session.activity_log`
- `{format(parseISO(log.created_at), 'd…}` — renderTabContent · l.642, when `activeTab === 'activity' && hasActivity() && each session.activity_log`
- `{badge.label}` — SessionDetailClasico · l.697
- `{reason}` — SessionDetailClasico · l.766, when `showFinalizeButton && !finalizeCheck.can && each finalizeCheck.reasons`
- `{format(parseISO(session.session_dat…}` — SessionDetailClasico · l.779
- `{formatSessionTimeForConsultant(sess…} - {formatSessionTimeForConsultant(sess…}` — SessionDetailClasico · l.788
- `{session.modality}` — SessionDetailClasico · l.795
- `{session.schools.name}` — SessionDetailClasico · l.808, when `session.schools`
- `{session.growth_communities.name}` — SessionDetailClasico · l.811, when `session.growth_communities`
- `{helperText}` — SessionDetailClasico · l.817, when `helperText`
- `{statusLabel}` — SessionDetailClasico · l.847, when `showEditRequests && each session.edit_requests`
- `{format(parseISO(request.created_at)…}` — SessionDetailClasico · l.850, when `showEditRequests && each session.edit_requests`
- `{fieldLabel} :` — SessionDetailClasico · l.861, when `showEditRequests && each session.edit_requests && each Object.keys(request.changes)`
- `{String(change.old)}` — SessionDetailClasico · l.862, when `showEditRequests && each session.edit_requests && each Object.keys(request.changes)`
- `{String(change.new)}` — SessionDetailClasico · l.863, when `showEditRequests && each session.edit_requests && each Object.keys(request.changes)`
- `{renderTabContent()}` — SessionDetailClasico · l.908

**Other texts on screen** (30)

- «{session.description} / Sin descripción» — renderTabContent · l.127, when `activeTab === 'details'`
- «{session.objectives} / Sin objetivos definidos» — renderTabContent · l.133, when `activeTab === 'details'`
- «Líder» — renderTabContent · l.148, when `activeTab === 'details' && each session.facilitators && f.is_lead`
- «Presentes:» — renderTabContent · l.196, when `activeTab === 'details'`
- «Ausentes:» — renderTabContent · l.200, when `activeTab === 'details'`
- «Sin marcar: {unmarkedCount()}» — renderTabContent · l.202, when `activeTab === 'details'`
- «Lista de asistencia» (aria-label) — renderTabContent · l.308, when `activeTab === 'details'`, screen size: `md:hidden`
- «Esperado» — renderTabContent · l.322, when `activeTab === 'details' && each session.attendees && attendee.expected`, screen size: `md:hidden`
- «No esperado» — renderTabContent · l.324, when `activeTab === 'details' && each session.attendees && !(attendee.expected)`, screen size: `md:hidden`
- «— Asistió» (label) — renderTabContent · l.330, when `activeTab === 'details' && each session.attendees`, screen size: `md:hidden`
- «Estado de llegada» (label) — renderTabContent · l.355, when `activeTab === 'details' && each session.attendees`, screen size: `md:hidden`
- «Notas» (label) — renderTabContent · l.382, when `activeTab === 'details' && each session.attendees`, screen size: `md:hidden`
- «Notas de planificación disponibles próximamente» — renderTabContent · l.410, when `activeTab === 'planning'`
- «Subiendo... / Subir material» (label) — renderTabContent · l.420, when `activeTab === 'materials' && canChange()`
- «No hay materiales subidos» — renderTabContent · l.437, when `activeTab === 'materials' && materials.length === 0`
- «Solo los facilitadores pueden crear informes» — renderTabContent · l.502, when `activeTab === 'report' && onlyFacilitatorsReport()`
- «Contenido del informe» (label) — renderTabContent · l.539, when `activeTab === 'report' && showReportEditor()`
- «Visibilidad» (label) — renderTabContent · l.549, when `activeTab === 'report' && showReportEditor()`
- «Todos los participantes / Solo facilitadores» — renderTabContent · l.593, when `activeTab === 'report' && !(showReportEditor()) && existingReport`
- «No hay informe creado» — renderTabContent · l.614, when `activeTab === 'report' && !(showReportEditor()) && !(existingReport)`
- «Comunicaciones disponibles próximamente» — renderTabContent · l.624, when `activeTab === 'communications'`
- «No hay actividad registrada» — renderTabContent · l.650, when `activeTab === 'activity' && !(hasActivity())`
- «Otra persona editó esta sesión mientras trabajabas en ella. Recarga para ver los últimos cambios.» — SessionDetailClasico · l.671, when `conflictVisible`
- «Está viendo esta sesión en modo lectura. No está asignado como facilitador.» — SessionDetailClasico · l.686, when `showReadOnlyBand`
- «Sesión {session.session_number}» — SessionDetailClasico · l.703, when `seriesNumberShown`
- «Ya existe una solicitud de cambio pendiente para esta sesión.» — SessionDetailClasico · l.740, when `showEditRequestButton && hasPendingEditRequest()`
- «Condiciones faltantes:» — SessionDetailClasico · l.763, when `showFinalizeButton && !finalizeCheck.can`
- «(hora Chile)» — SessionDetailClasico · l.786
- «Razón:» — SessionDetailClasico · l.870, when `showEditRequests && each session.edit_requests && request.reason`
- «Nota del revisor:» — SessionDetailClasico · l.875, when `showEditRequests && each session.edit_requests && showReviewNotes(request)`

### components/sessions/SessionDetailNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Descripción» | h3 | `activeTab === 'details'` | renderTabContent · l.55 |
| «Objetivos» | h3 | `activeTab === 'details'` | renderTabContent · l.59 |
| «Facilitadores» | h3 | `activeTab === 'details'` | renderTabContent · l.63 |

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «{tab.label}» |  | `each tabs` | SessionDetailNuevo · l.150 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Recargar» | `{reload}` | `conflictVisible` |  |  | SessionDetailNuevo · l.128 |

**Pieces placed here, with the texts and settings handed to them** (16)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Users` | aria-hidden: true | `activeTab === 'details' && each session.facilitators` |  | renderTabContent · l.67 |
| `Badge` | tone: accent | `activeTab === 'details' && each session.facilitators && f.is_lead` |  | renderTabContent · l.72 |
| `AttendanceSuggestionsPanel` |  | `activeTab === 'details'` |  | renderTabContent · l.85 |
| `AttendanceNuevo` |  | `activeTab === 'details'` |  | renderTabContent · l.86 |
| `PenLine` | aria-hidden: true | `activeTab === 'planning'` |  | renderTabContent · l.95 |
| `MaterialsNuevo` |  | `activeTab === 'materials'` |  | renderTabContent · l.101 |
| `ReportNuevo` |  | `activeTab === 'report'` |  | renderTabContent · l.104 |
| `MessageSquare` | aria-hidden: true | `activeTab === 'communications'` |  | renderTabContent · l.109 |
| `ActivityNuevo` |  | `activeTab === 'activity'` |  | renderTabContent · l.115 |
| `Notice` | tone: error | `conflictVisible` |  | SessionDetailNuevo · l.125 |
| `Notice` | tone: warning | `showReadOnlyBand` |  | SessionDetailNuevo · l.136 |
| `HeaderNuevo` |  |  |  | SessionDetailNuevo · l.141 |
| `Card` |  |  |  | SessionDetailNuevo · l.143 |
| `Tabs` |  |  |  | SessionDetailNuevo · l.144 |
| `TabList` | label: Secciones de la sesión |  |  | SessionDetailNuevo · l.146 |
| `TabPanel` |  |  |  | SessionDetailNuevo · l.158 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector([role="tab"][aria-selected="true"])` | SessionDetailNuevo · l.39 |
| mark | `testid=session-detail-nuevo` | SessionDetailNuevo · l.123 |

**Values shown from data** (3)

- `{f.profiles?.first_name} {f.profiles?.last_name}` — renderTabContent · l.68, when `activeTab === 'details' && each session.facilitators`
- `( {f.facilitator_role.replace(/_/g, ' …} )` — renderTabContent · l.76, when `activeTab === 'details' && each session.facilitators`
- `{renderTabContent()}` — SessionDetailNuevo · l.158

**Other texts on screen** (7)

- «{session.description} / Sin descripción» — renderTabContent · l.56, when `activeTab === 'details'`
- «{session.objectives} / Sin objetivos definidos» — renderTabContent · l.60, when `activeTab === 'details'`
- «Líder» — renderTabContent · l.73, when `activeTab === 'details' && each session.facilitators && f.is_lead`
- «Notas de planificación disponibles próximamente» — renderTabContent · l.96, when `activeTab === 'planning'`
- «Comunicaciones disponibles próximamente» — renderTabContent · l.110, when `activeTab === 'communications'`
- «Otra persona editó esta sesión mientras trabajabas en ella. Recarga para ver los últimos cambios.» — SessionDetailNuevo · l.127, when `conflictVisible`
- «Está viendo esta sesión en modo lectura. No está asignado como facilitador.» — SessionDetailNuevo · l.137, when `showReadOnlyBand`

### components/sessions/SessionStartControl.tsx

Used by: `/admin/sessions/[id]`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Zoom no disponible / Preparando Zoom… / Iniciar y continuar a Zoom / Iniciar Sesión» | `{onStart}` |  | `{actionInProgress \|\| waitingForZoom}` | `testid=session-start-button` | SessionStartControl · l.35 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AlertTriangle` | aria-hidden: true | `zoomUnavailable` |  | SessionStartControl · l.43 |
| `RefreshCw` | aria-hidden: true | `!(zoomUnavailable) && waitingForZoom` |  | SessionStartControl · l.45 |
| `Play` | aria-hidden: true | `!(zoomUnavailable) && !(waitingForZoom)` |  | SessionStartControl · l.51 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | SessionStartControl · l.67 |

**Other texts on screen** (2)

- «La sesión pasará a En Progreso y luego podrás unirte a Zoom.» — SessionStartControl · l.63, when `isManagedZoom && !waitingForZoom`
- «La reunión terminó o fue cancelada. Cancela o reprograma la sesión. / No pudimos verificar la reunión. Reintentaremos automáticamente. / La sesión se podrá iniciar cuando Zoom confirme la reunión.» — SessionStartControl · l.67, when `waitingForZoom`

### components/sessions/SessionsListClasico.tsx

Used by: `/consultor/sessions`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{session.title}» | h3 |  | renderSessionCard · l.65 |
| «Filtros» | h3 |  | SessionsListClasico · l.138 |
| «Mis Sesiones» | h2 |  | SessionsListClasico · l.217 |
| «{format(parseISO(date), 'EEEE, dd MM…}» | h3 | `!(noMySessions) && each sortedMyDates` | SessionsListClasico · l.226 |
| «Otras Sesiones en Mis Colegios» | h2 |  | SessionsListClasico · l.240 |
| «{format(parseISO(date), 'EEEE, dd MM…}» | h3 | `!(noOtherSessions) && each sortedOtherDates` | SessionsListClasico · l.249 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar filtros» | `{handleClearFilters}` |  |  |  | SessionsListClasico · l.193 |
| «Cargar más» | `{handleLoadMore}` | `showLoadMore` |  |  | SessionsListClasico · l.265 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Exportar Calendario» | `{icalHref()}` | `showExportCalendar` |  | SessionsListClasico · l.201 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{session.title} [# {session.session_number}] {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) …» · aria «{`Ver detalles de ${session.title}`}» | `{() => openSession(session.id)}` |  | renderSessionCard · l.52 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Filtrar por colegio» | select |  | «Todos», «(lista) {school.name}» |  |  | SessionsListClasico · l.143 |
| «Filtrar por estado» | select |  | «Todos», «Borrador», «Pendiente Aprobación», «Programada», «En Progreso», «Pendiente Informe», «Completada», «Cancelada» |  |  | SessionsListClasico · l.158 |
| «Fecha desde» | date |  |  |  |  | SessionsListClasico · l.175 |
| «Fecha hasta» | date |  |  |  |  | SessionsListClasico · l.184 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar Calendario` | `showExportCalendar` | SessionsListClasico · l.201 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ResponsiveFunctionalPageHeader` | title: Mis Sesiones · subtitle: Vista de sesiones de consultoría asignadas |  |  | SessionsListClasico · l.110 |
| `HelpButton` | sectionId: mis-sesiones |  |  | SessionsListClasico · l.115 |

**Values shown from data** (8)

- `# {session.session_number}` — renderSessionCard · l.69, when `seriesNumberShown(session)`
- `{session.modality}` — renderSessionCard · l.83
- `{badge.label}` — renderSessionCard · l.88
- `{totalSessions}` — SessionsListClasico · l.122
- `{pendingReportsCount}` — SessionsListClasico · l.126
- `{nextSessionCountdown}` — SessionsListClasico · l.130
- `{mySessionsByDate[date].map((session…}` — SessionsListClasico · l.229, when `!(noMySessions) && each sortedMyDates`
- `{otherSessionsByDate[date].map((sess…}` — SessionsListClasico · l.252, when `!(noOtherSessions) && each sortedOtherDates`

**Other texts on screen** (10)

- «(Chile)» — renderSessionCard · l.78
- «Total Sesiones» — SessionsListClasico · l.121
- «Informes Pendientes» — SessionsListClasico · l.125
- «Próxima Sesión» — SessionsListClasico · l.129
- «Filtrar por colegio» (label) — SessionsListClasico · l.142
- «Filtrar por estado» (label) — SessionsListClasico · l.157
- «Fecha desde» (label) — SessionsListClasico · l.174
- «Fecha hasta» (label) — SessionsListClasico · l.183
- «No está asignado como facilitador en ninguna sesión» — SessionsListClasico · l.220, when `noMySessions`
- «No hay otras sesiones en sus colegios asignados» — SessionsListClasico · l.243, when `noOtherSessions`

### components/sessions/SessionsListNuevo.tsx

Used by: `/consultor/sessions`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{group.title} {group.rows.length}» | h3 | `each agendaGroups(rows, today)` | Agenda · l.215 |
| «Filtros» | h2 |  | SessionsListNuevo · l.304 |

**Tabs** (2)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «Mis Sesiones» |  |  | SessionsListNuevo · l.349 |
| «Otras Sesiones en Mis Colegios» |  |  | SessionsListNuevo · l.352 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar filtros» | `{handleClearFilters}` |  |  |  | SessionsListNuevo · l.337 |
| «Cargar más» | `{handleLoadMore}` | `showLoadMore` |  |  | SessionsListNuevo · l.380 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Hoy / {block.weekday} {block.day} {block.month} [{block.year}] {formatTime(session.start_time)} {session.title} [# {session.session_number}] {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) {getModalityIcon(session…» · aria «{`Ver detalles de ${session.title}`}» | `/consultor/sessions/[*]` |  |  | AgendaRow · l.101 |
| «Exportar Calendario» | `{icalHref()}` | `showExportCalendar` |  | SessionsListNuevo · l.267 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  |  |  |  | SessionsListNuevo · l.310 |
|  | select |  |  |  |  | SessionsListNuevo · l.320 |
|  | date |  |  |  |  | SessionsListNuevo · l.332 |
|  | date |  |  |  |  | SessionsListNuevo · l.335 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar Calendario` | `showExportCalendar` | SessionsListNuevo · l.267 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `event.metaKey \|\| event.ctrlKey \|\| event.shiftKey \|\| event.altKey \|\| event.button !== 0` | AgendaRow · l.107 |

**Pieces placed here, with the texts and settings handed to them** (33)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Link2` | aria-hidden: true | `seriesNumberShown(session)` · screen size: `sm:flex` |  | AgendaRow · l.132 |
| `Clock` | aria-hidden: true | screen size: `sm:flex` |  | AgendaRow · l.139 |
| `MapPin` | aria-hidden: true | `((session.schools \|\| session.growth_communities)) && session.schools` · screen size: `sm:flex` |  | AgendaRow · l.154 |
| `Users` | aria-hidden: true | `((session.schools \|\| session.growth_communities)) && session.growth_communities` · screen size: `sm:flex` |  | AgendaRow · l.160 |
| `Badge` |  | screen size: `sm:flex` |  | AgendaRow · l.170 |
| `Badge` |  | `ledger?.status` · screen size: `sm:flex` |  | AgendaRow · l.173 |
| `Badge` | tone: neutral | `ledger?.status && ledger.admin_override` · screen size: `sm:flex` |  | AgendaRow · l.177 |
| `Card` |  | `each agendaGroups(rows, today)` |  | Agenda · l.219 |
| `PageHeader` | title: Mis Sesiones · description: Vista de sesiones de consultoría asignadas |  |  | SessionsListNuevo · l.260 |
| `CalendarPlus` | aria-hidden: true | `showExportCalendar` |  | SessionsListNuevo · l.268 |
| `HelpButton` | sectionId: mis-sesiones |  |  | SessionsListNuevo · l.272 |
| `Card` |  |  |  | SessionsListNuevo · l.279 |
| `CardBody` |  |  |  | SessionsListNuevo · l.280 |
| `Card` |  |  |  | SessionsListNuevo · l.285 |
| `CardBody` |  |  |  | SessionsListNuevo · l.286 |
| `Card` |  |  |  | SessionsListNuevo · l.293 |
| `CardBody` |  |  |  | SessionsListNuevo · l.294 |
| `Card` |  |  |  | SessionsListNuevo · l.302 |
| `CardBody` |  |  |  | SessionsListNuevo · l.303 |
| `FilterIcon` | aria-hidden: true |  |  | SessionsListNuevo · l.305 |
| `Field` | label: Filtrar por colegio |  |  | SessionsListNuevo · l.309 |
| `Field` | label: Filtrar por estado |  |  | SessionsListNuevo · l.319 |
| `Field` | label: Fecha desde |  |  | SessionsListNuevo · l.331 |
| `Field` | label: Fecha hasta |  |  | SessionsListNuevo · l.334 |
| `X` | aria-hidden: true |  |  | SessionsListNuevo · l.338 |
| `Tabs` |  |  |  | SessionsListNuevo · l.347 |
| `TabList` | label: Listas de sesiones |  |  | SessionsListNuevo · l.348 |
| `Count` |  |  |  | SessionsListNuevo · l.350 |
| `Count` |  |  |  | SessionsListNuevo · l.353 |
| `TabPanel` |  |  |  | SessionsListNuevo · l.356 |
| `Agenda` | empty: No está asignado como facilitador en ninguna sesión · idPrefix: grupo-mias |  |  | SessionsListNuevo · l.357 |
| `TabPanel` |  |  |  | SessionsListNuevo · l.366 |
| `Agenda` | empty: No hay otras sesiones en sus colegios asignados · idPrefix: grupo-otras |  |  | SessionsListNuevo · l.367 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `opening` | «otras / mias» | useOpeningTab · l.65 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Penalizada» | AgendaRow · l.174 |
| «Devuelta» | AgendaRow · l.174 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, OPENING_WAIT_MS)` | useOpeningTab · l.75 |
| mark | `testid=sessions-list-nuevo` | SessionsListNuevo · l.259 |

**Values shown from data** (4)

- `{empty}` — Agenda · l.208, when `rows.length === 0`
- `{totalSessions}` — SessionsListNuevo · l.282
- `{pendingReportsCount}` — SessionsListNuevo · l.288
- `{nextSessionCountdown}` — SessionsListNuevo · l.296

**Other texts on screen** (5)

- «Total Sesiones» — SessionsListNuevo · l.281
- «Informes Pendientes» — SessionsListNuevo · l.287
- «Próxima Sesión» — SessionsListNuevo · l.295
- «Mis Sesiones» — SessionsListNuevo · l.350
- «Otras Sesiones en Mis Colegios» — SessionsListNuevo · l.353

### components/sessions/admin-nuevo/AdminSessionDetailNuevo.tsx

Used by: `/admin/sessions/[id]`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | Detail · l.117 |
| «Consultores» | h2 |  | Consultants · l.254 |
| «Consultores actuales» | h3 | `!(!editingFacilitators)` | Consultants · l.291 |
| «Añadir consultor» | h3 | `!(!editingFacilitators) && loadingConsultants` | Consultants · l.330 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todas las sesiones de la serie» · aria «{showSeriesPanel ? 'Ocultar sesiones de la serie' : 'Ver todas las sesiones de l…}» | `{() => setShowSeriesPanel(!showSeriesPanel)}` |  |  |  | SeriesBand · l.146 |
| «Ver» | `{() => openSession(s.id)}` | `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions` |  |  | SeriesBand · l.212 |
| «Cancelar sesiones futuras» | `{() => setShowSeriesCancelModal(true)}` | `showSeriesPanel && !(seriesLoading)` | `{actionInProgress}` |  | SeriesBand · l.223 |
| «Editar consultores» | `{() => handleStartEditFacilitators()}` | `session.status !== 'completada' && session.status !== 'cancelada' && !editingFacilitators` |  |  | Consultants · l.256 |
| «Quitar» | `{() => handleRemoveEditFacilitator(facilitator.user_id)}` | `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators` |  |  | Consultants · l.314 |
| «Cancelar» | `{() => handleCancelEditFacilitators()}` | `!(!editingFacilitators)` | `{savingFacilitators}` |  | Consultants · l.362 |
| «Guardando... / Guardar» | `{() => handleSaveFacilitators()}` | `!(!editingFacilitators)` | `{savingFacilitators \|\| editFacilitators.length === 0}` |  | Consultants · l.365 |
| «Cerrar» | `{onClose}` |  | `{actionInProgress}` |  | CancelDialog · l.412 |
| «{confirmText}» | `{onConfirm}` |  | `{actionInProgress \|\| !reason.trim()}` |  | CancelDialog · l.415 |
| «Aprobar» | `{() => setAskApprove(session.id)}` | `(session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion')` | `{actionInProgress}` |  | AdminSessionDetailNuevo · l.508 |
| «Cancelar» | `{() => setShowCancelModal(true)}` | `session.status !== 'completada' && session.status !== 'cancelada'` | `{actionInProgress}` |  | AdminSessionDetailNuevo · l.540 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Agregar al Calendario» | `/api/sessions/[*]/ical` | `(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status)` |  | AdminSessionDetailNuevo · l.490 |
| «Exportar Serie» | `/api/sessions/series/[*]/ical` | `session.recurrence_group_id` |  | AdminSessionDetailNuevo · l.497 |
| «Ir a Zoom» | `{buildSessionJoinPath(session.id)}` | `session.status === 'en_progreso' && session.is_zoom_managed === true && managedMeetingIsReady(managedMeetingStatus)` | `testid=session-zoom-entry-button` | AdminSessionDetailNuevo · l.529 |
| «Unirse a la reunión Zoom / Abrir reunión» | `{session.join_path}` | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && !(session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)) && session.has_meeting && session.join_path` | `testid=session-join-link` | AdminSessionDetailNuevo · l.586 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  | `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators` |  | Consultants · l.308 |
|  | select | disabled: `{availableConsultants.length === 0}` |  | `!(!editingFacilitators) && !(loadingConsultants)` |  | Consultants · l.338 |
| «{title}» | textarea | «Razón de cancelación...» |  |  |  | CancelDialog · l.422 |

**Pop-ups** (5)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | CancelDialog · l.405 |
| `CancelDialog` | component | `{showCancelModal}` | title: Cancelar Sesión · sentence: Por favor, ingrese la razón de la cancelación: · confirmText: Confirmar Cancelación | AdminSessionDetailNuevo · l.619 |
| `CancelDialog` | component | `{showSeriesCancelModal}` | title: Cancelar Sesiones Futuras de la Serie · sentence: Esto cancelará todas las sesiones futuras de esta serie que aún no estén completadas o canceladas. Por favor, ingrese la razón de la cancelación: · confirmText: Confirmar Cancelación de Serie | AdminSessionDetailNuevo · l.631 |
| `ConfirmDialog` | component | `{approveOpen}` |  | AdminSessionDetailNuevo · l.644 |
| `ConfirmDialog` | component | `{startOpen}` |  | AdminSessionDetailNuevo · l.656 |

**Downloads and printing** (2)

| How | When | Where |
|---|---|---|
| `<a download> Agregar al Calendario` | `(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status)` | AdminSessionDetailNuevo · l.490 |
| `<a download> Exportar Serie` | `session.recurrence_group_id` | AdminSessionDetailNuevo · l.497 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `target === null \|\| target !== shownAndAddressed` | AdminSessionDetailNuevo · l.651 |
| `target === null \|\| target !== shownAndAddressed` | AdminSessionDetailNuevo · l.663 |

**Pieces placed here, with the texts and settings handed to them** (32)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Badge` |  |  |  | StatusBadge · l.111 |
| `Link2` | aria-hidden: true |  |  | SeriesBand · l.140 |
| `ChevronUp` | aria-hidden: true | `showSeriesPanel` |  | SeriesBand · l.154 |
| `ChevronDown` | aria-hidden: true | `!(showSeriesPanel)` |  | SeriesBand · l.154 |
| `Spinner` |  | `showSeriesPanel && seriesLoading` |  | SeriesBand · l.162 |
| `Badge` |  | `showSeriesPanel && !(seriesLoading) && seriesStats && each (Object.entries(seriesStats) as [SessionStatus, n…` |  | SeriesBand · l.177 |
| `Badge` | tone: accent | `!(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions && s.id === session.id` |  | SeriesBand · l.199 |
| `Eye` | aria-hidden: true | `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions` |  | SeriesBand · l.213 |
| `XCircle` | aria-hidden: true | `showSeriesPanel && !(seriesLoading)` |  | SeriesBand · l.224 |
| `Badge` | tone: accent | `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators && facilitator.is_lead` |  | Consultants · l.275 |
| `Spinner` |  | `!(!editingFacilitators) && loadingConsultants` |  | Consultants · l.332 |
| `Field` | label: Añadir consultor | `!(!editingFacilitators) && !(loadingConsultants)` |  | Consultants · l.337 |
| `PageHeader` | title: Detalle de Sesión |  |  | AdminSessionDetailNuevo · l.473 |
| `Card` |  |  |  | AdminSessionDetailNuevo · l.479 |
| `CardBody` |  |  |  | AdminSessionDetailNuevo · l.480 |
| `CalendarPlus` | aria-hidden: true | `(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status)` |  | AdminSessionDetailNuevo · l.491 |
| `CalendarPlus` | aria-hidden: true | `session.recurrence_group_id` |  | AdminSessionDetailNuevo · l.502 |
| `CheckCircle` | aria-hidden: true | `(session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion')` |  | AdminSessionDetailNuevo · l.509 |
| `SessionStartControl` |  | `session.status === 'programada'` |  | AdminSessionDetailNuevo · l.517 |
| `Link2` | aria-hidden: true | `session.status === 'en_progreso' && session.is_zoom_managed === true && managedMeetingIsReady(managedMeetingStatus)` |  | AdminSessionDetailNuevo · l.534 |
| `XCircle` | aria-hidden: true | `session.status !== 'completada' && session.status !== 'cancelada'` |  | AdminSessionDetailNuevo · l.541 |
| `Detail` | title: Título |  |  | AdminSessionDetailNuevo · l.550 |
| `Detail` | title: Modalidad |  |  | AdminSessionDetailNuevo · l.553 |
| `Detail` | title: Fecha |  |  | AdminSessionDetailNuevo · l.556 |
| `Detail` | title: Horario |  |  | AdminSessionDetailNuevo · l.559 |
| `Detail` | title: Ubicación | `session.location` |  | AdminSessionDetailNuevo · l.566 |
| `Detail` | title: Reunión Zoom | `session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)` |  | AdminSessionDetailNuevo · l.572 |
| `Detail` | title: Reunión Zoom | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)` |  | AdminSessionDetailNuevo · l.578 |
| `Detail` | title: Enlace de reunión | `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && !(session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)) && session.has_meeting && session.join_path` |  | AdminSessionDetailNuevo · l.584 |
| `Detail` | title: Descripción | `session.description` |  | AdminSessionDetailNuevo · l.597 |
| `Detail` | title: Objetivos | `session.objectives` |  | AdminSessionDetailNuevo · l.602 |
| `Detail` | title: Razón de cancelación | `session.cancellation_reason` |  | AdminSessionDetailNuevo · l.607 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `APPROVE_QUESTION` | «¿Está seguro que desea aprobar esta sesión?» | l.107 |
| `START_QUESTION` | «¿Está seguro que desea iniciar esta sesión?» | l.108 |
| `label` | «Borradores / s» | SeriesBand · l.172 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| role | `role=region` | SeriesBand · l.159 |
| mark | `testid=admin-session-detail-nuevo` | AdminSessionDetailNuevo · l.472 |
| role | `role=alert` | AdminSessionDetailNuevo · l.573 |
| role | `role=status` | AdminSessionDetailNuevo · l.579 |

**Values shown from data** (17)

- `{getStatusBadge(status).label}` — StatusBadge · l.111
- `{count} {label}` — SeriesBand · l.177, when `showSeriesPanel && !(seriesLoading) && seriesStats && each (Object.entries(seriesStats) as [SessionStatus, n…`
- `{format(new Date(s.session_date + 'T…}` — SeriesBand · l.203, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- `{s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)}` — SeriesBand · l.206, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- `{displayName}` — Consultants · l.273, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators`
- `{facilitator.facilitator_role.replac…}` — Consultants · l.280, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators`
- `{displayName}` — Consultants · l.303, when `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators`
- `{consultant.email}` — Consultants · l.304, when `!(!editingFacilitators) && editFacilitators.length > 0 && each editFacilitators && consultant`
- `{sentence}` — CancelDialog · l.421
- `{session.title}` — AdminSessionDetailNuevo · l.476
- `{session.title}` — AdminSessionDetailNuevo · l.551
- `{session.modality}` — AdminSessionDetailNuevo · l.554
- `{formatDate(session.session_date)}` — AdminSessionDetailNuevo · l.557
- `{session.location}` — AdminSessionDetailNuevo · l.567, when `session.location`
- `{session.description}` — AdminSessionDetailNuevo · l.598, when `session.description`
- `{session.objectives}` — AdminSessionDetailNuevo · l.603, when `session.objectives`
- `{session.cancellation_reason}` — AdminSessionDetailNuevo · l.608, when `session.cancellation_reason`

**Other texts on screen** (13)

- «Serie de sesiones — Sesión {session.session_number} [de {seriesTotalSessions}]» — SeriesBand · l.141
- «Sesiones de la serie» (aria-label) — SeriesBand · l.159, when `showSeriesPanel`
- «No se encontraron sesiones en esta serie.» — SeriesBand · l.187, when `showSeriesPanel && !(seriesLoading) && seriesSessions.length === 0`
- «Sesión {s.session_number}» — SeriesBand · l.197, when `showSeriesPanel && !(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions`
- «Actual» — SeriesBand · l.200, when `!(seriesLoading) && !(seriesSessions.length === 0) && each seriesSessions && s.id === session.id`
- «Consultor principal» — Consultants · l.276, when `!editingFacilitators && session.facilitators.length > 0 && each session.facilitators && facilitator.is_lead`
- «Sin consultores asignados» — Consultants · l.286, when `!editingFacilitators && !(session.facilitators.length > 0)`
- «No hay consultores añadidos» — Consultants · l.322, when `!(!editingFacilitators) && !(editFacilitators.length > 0)`
- «Cargando consultores...» — Consultants · l.333, when `!(!editingFacilitators) && loadingConsultants`
- «(hora Chile)» — AdminSessionDetailNuevo · l.562
- «min)» — AdminSessionDetailNuevo · l.562
- «La reunión terminó o fue cancelada. Cancela o reprograma la sesión.» — AdminSessionDetailNuevo · l.574, when `session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)`
- «No se pudo verificar el estado de Zoom. Reintentando… / Preparando la reunión Zoom…» — AdminSessionDetailNuevo · l.579, when `!(session.is_zoom_managed && managedMeetingIsUnavailable(managedMeetingStatus)) && session.is_zoom_managed && !managedMeetingIsReady(managedMeetingStatus)`

### components/sessions/admin-nuevo/AdminSessionsListNuevo.tsx

Used by: `/admin/sessions`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{format(currentDate, 'MMMM yyyy', { …}» | h3 |  | MonthNuevo · l.364 |
| «{format(day, 'EEEE, dd MMMM', { loca…}» | h4 | `each weekDays` | days · l.459 |
| «{format(weekStart, 'dd MMM', { local…} - {format(weekEnd, 'dd MMM yyyy', { lo…}» | h3 |  | WeekNuevo · l.489 |
| «Filtros» | h2 |  | AdminSessionsListNuevo · l.597 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon MoreVertical]» · aria «{`Acciones de ${session.title}`}» | `{(e) => { e.stopPropagation(); setDropdownOpen(dropdownOpen === session.id ? nul…}` | `!(sessions.length === 0) && each sessions` |  |  | ListTable · l.229 |
| «Ver detalle» | `{(e) => { e.stopPropagation(); handleViewSession(session.id); setDropdownOpen(nu…}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id` |  |  | ListTable · l.244 |
| «Aprobar» | `{(e) => { e.stopPropagation(); handleApprove(session.id); setDropdownOpen(null);…}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && ((session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion'))` |  |  | ListTable · l.257 |
| «Cancelar» | `{(e) => { e.stopPropagation(); onCancelRow(session.id); setDropdownOpen(null); }}` | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && session.status !== 'completada' && session.status !== 'cancelada'` |  |  | ListTable · l.271 |
| «{children}» · aria «{label}» | `{onClick}` |  |  |  | Arrow · l.308 |
| «{session.title} [{props.getSeriesInfo(session)}] {when}» | `{() => props.handleViewSession(session.id)}` |  |  |  | AgendaLine · l.325 |
| «{formatTime(session.start_time)} {session.title}» · tooltip «{session.title}» | `{() => handleViewSession(session.id)}` | `each days && each daySessions.slice(0, 2)` · screen size: `hidden md:grid` |  |  | MonthNuevo · l.410 |
| «+ {daySessions.length - 2} más» | `{() => { // As today: only this day's sessions, in «Lista». handleFilterChange('…}` | `each days && daySessions.length > 2` · screen size: `hidden md:grid` |  |  | MonthNuevo · l.424 |
| «{view.label}» | `{() => setViewMode(view.id)}` | `each VIEWS` |  |  | AdminSessionsListNuevo · l.581 |
| «Nueva Sesión» | `{openNewSession}` |  |  |  | AdminSessionsListNuevo · l.588 |
| «Cerrar» | `{closeCancelModal}` |  | `{actionInProgress}` |  | AdminSessionsListNuevo · l.706 |
| «Confirmar Cancelación» | `{handleCancelSubmit}` |  | `{actionInProgress \|\| !cancellationReason.trim()}` |  | AdminSessionsListNuevo · l.709 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Exportar Calendario» | `{icalHref}` | `sessions.length > 0` |  | AdminSessionsListNuevo · l.602 |

**Other things that react to a click** (5)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `TableRow` | «{formatDateShort(session.session_dat…} {formatTime(session.start_time)} - {formatTime(session.end_time)} (Chile) {sessi…» | `{() => handleViewSession(session.id)}` | `!(sessions.length === 0) && each sessions` | ListTable · l.200 |
| `Arrow` | «[icon ChevronLeft]» | `{() => setCurrentDate(addMonths(currentDate, -1))}` |  | MonthNuevo · l.361 |
| `Arrow` | «[icon ChevronRight]» | `{() => setCurrentDate(addMonths(currentDate, 1))}` |  | MonthNuevo · l.365 |
| `Arrow` | «[icon ChevronLeft]» | `{() => setCurrentDate(addWeeks(currentDate, -1))}` |  | WeekNuevo · l.486 |
| `Arrow` | «[icon ChevronRight]» | `{() => setCurrentDate(addWeeks(currentDate, 1))}` |  | WeekNuevo · l.492 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Colegio» | select |  |  |  |  | AdminSessionsListNuevo · l.609 |
| «Comunidad» | select |  |  |  |  | AdminSessionsListNuevo · l.622 |
| «Consultor» | select |  |  |  |  | AdminSessionsListNuevo · l.635 |
| «Estado» | select |  |  |  |  | AdminSessionsListNuevo · l.648 |
| «Desde» | date | «Desde» |  | `viewMode === 'list'` |  | AdminSessionsListNuevo · l.666 |
| «Hasta» | date | «Hasta» |  | `viewMode === 'list'` |  | AdminSessionsListNuevo · l.675 |
| «Cancelar Sesión» | textarea | «Razón de cancelación...» |  |  |  | AdminSessionsListNuevo · l.716 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{showCancelModal}` | title: Cancelar Sesión | AdminSessionsListNuevo · l.699 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar Calendario` | `sessions.length > 0` | AdminSessionsListNuevo · l.602 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!mark` | LedgerBadges · l.131 |

**Pieces placed here, with the texts and settings handed to them** (53)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Badge` |  |  |  | StatusBadge · l.127 |
| `Badge` |  |  |  | LedgerBadges · l.134 |
| `Badge` | tone: neutral | `mark.admin_override` |  | LedgerBadges · l.138 |
| `Table` |  |  |  | ListTable · l.175 |
| `TableHead` |  |  |  | ListTable · l.176 |
| `TableRow` |  |  |  | ListTable · l.177 |
| `TableHeaderCell` |  |  |  | ListTable · l.178 |
| `TableHeaderCell` |  |  |  | ListTable · l.179 |
| `TableHeaderCell` |  |  |  | ListTable · l.180 |
| `TableHeaderCell` |  |  |  | ListTable · l.181 |
| `TableHeaderCell` |  |  |  | ListTable · l.182 |
| `TableHeaderCell` |  |  |  | ListTable · l.183 |
| `TableHeaderCell` |  |  |  | ListTable · l.184 |
| `TableHeaderCell` |  |  |  | ListTable · l.185 |
| `TableHeaderCell` |  |  |  | ListTable · l.186 |
| `TableBody` |  |  |  | ListTable · l.189 |
| `TableRow` |  | `sessions.length === 0` |  | ListTable · l.191 |
| `TableCell` |  | `sessions.length === 0` |  | ListTable · l.192 |
| `TableRow` |  | `!(sessions.length === 0) && each sessions` |  | ListTable · l.200 |
| `TableCell` | label: Fecha | `!(sessions.length === 0) && each sessions` |  | ListTable · l.201 |
| `TableCell` | label: Hora | `!(sessions.length === 0) && each sessions` |  | ListTable · l.202 |
| `TableCell` |  | `!(sessions.length === 0) && each sessions` |  | ListTable · l.206 |
| `TableCell` | label: Colegio | `!(sessions.length === 0) && each sessions` |  | ListTable · l.209 |
| `TableCell` | label: Comunidad | `!(sessions.length === 0) && each sessions` |  | ListTable · l.210 |
| `TableCell` | label: Consultor(es) | `!(sessions.length === 0) && each sessions` |  | ListTable · l.211 |
| `TableCell` | label: Estado | `!(sessions.length === 0) && each sessions` |  | ListTable · l.214 |
| `TableCell` | label: Serie | `!(sessions.length === 0) && each sessions` |  | ListTable · l.220 |
| `Link2` | aria-hidden: true | `!(sessions.length === 0) && each sessions && session.recurrence_group_id` |  | ListTable · l.223 |
| `TableCell` | label: Acciones | `!(sessions.length === 0) && each sessions` |  | ListTable · l.228 |
| `MoreVertical` | aria-hidden: true | `!(sessions.length === 0) && each sessions` |  | ListTable · l.240 |
| `Eye` | aria-hidden: true | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id` |  | ListTable · l.253 |
| `CheckCircle` | aria-hidden: true | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && ((session.status === 'borrador' \|\| session.status === 'pendiente_aprobacion'))` |  | ListTable · l.266 |
| `XCircle` | aria-hidden: true | `!(sessions.length === 0) && each sessions && dropdownOpen === session.id && session.status !== 'completada' && session.status !== 'cancelada'` |  | ListTable · l.280 |
| `Link2` | aria-hidden: true | `session.recurrence_group_id` |  | AgendaLine · l.335 |
| `Arrow` | label: Mes anterior |  |  | MonthNuevo · l.361 |
| `ChevronLeft` | aria-hidden: true |  |  | MonthNuevo · l.362 |
| `Arrow` | label: Mes siguiente |  |  | MonthNuevo · l.365 |
| `ChevronRight` | aria-hidden: true |  |  | MonthNuevo · l.366 |
| `Arrow` | label: Semana anterior |  |  | WeekNuevo · l.486 |
| `ChevronLeft` | aria-hidden: true |  |  | WeekNuevo · l.487 |
| `Arrow` | label: Semana siguiente |  |  | WeekNuevo · l.492 |
| `ChevronRight` | aria-hidden: true |  |  | WeekNuevo · l.493 |
| `PageHeader` | title: Sesiones de Consultoría · description: Gestión de sesiones con consultores externos e internos |  |  | AdminSessionsListNuevo · l.550 |
| `Card` |  | `each [ ['Total Sesiones', stats.total], ['Programadas'…` |  | AdminSessionsListNuevo · l.563 |
| `CardBody` |  | `each [ ['Total Sesiones', stats.total], ['Programadas'…` |  | AdminSessionsListNuevo · l.564 |
| `Card` |  |  |  | AdminSessionsListNuevo · l.572 |
| `CardBody` |  |  |  | AdminSessionsListNuevo · l.573 |
| `Icon` | aria-hidden: true | `each VIEWS` |  | AdminSessionsListNuevo · l.582 |
| `Plus` | aria-hidden: true |  |  | AdminSessionsListNuevo · l.589 |
| `Filter` | aria-hidden: true |  |  | AdminSessionsListNuevo · l.598 |
| `CalendarPlus` | aria-hidden: true | `sessions.length > 0` |  | AdminSessionsListNuevo · l.603 |
| `Field` | label: Desde | `viewMode === 'list'` |  | AdminSessionsListNuevo · l.665 |
| `Field` | label: Hasta | `viewMode === 'list'` |  | AdminSessionsListNuevo · l.674 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `VIEWS` | «Lista», «Mes», «Semana» | l.502 |

**Other texts written in the code (safety net: not tied to an element by the script)** (10)

| Text | Where |
|---|---|
| «Lun» | MonthNuevo · l.393 |
| «Mar» | MonthNuevo · l.393 |
| «Mié» | MonthNuevo · l.393 |
| «Jue» | MonthNuevo · l.393 |
| «Vie» | MonthNuevo · l.393 |
| «Sáb» | MonthNuevo · l.393 |
| «Dom» | MonthNuevo · l.393 |
| «Total Sesiones» | AdminSessionsListNuevo · l.559 |
| «Programadas» | AdminSessionsListNuevo · l.560 |
| «Pendientes» | AdminSessionsListNuevo · l.561 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll([data-row-menu])` | AdminSessionsListNuevo · l.538 |
| focus | `button.focus()` | AdminSessionsListNuevo · l.539 |
| mark | `testid=admin-sessions-nuevo` | AdminSessionsListNuevo · l.549 |
| role | `role=group` | AdminSessionsListNuevo · l.576 |

**Values shown from data** (14)

- `{getStatusBadge(status).label}` — StatusBadge · l.127
- `{formatDateShort(session.session_dat…}` — ListTable · l.201, when `!(sessions.length === 0) && each sessions`
- `{session.title}` — ListTable · l.207, when `!(sessions.length === 0) && each sessions`
- `{session.schools?.name} / -` — ListTable · l.209, when `!(sessions.length === 0) && each sessions`
- `{session.growth_communities?.name} / -` — ListTable · l.210, when `!(sessions.length === 0) && each sessions`
- `{names}` — ListTable · l.212, when `!(sessions.length === 0) && each sessions`
- `{session.schools.name}` — MonthNuevo · l.383, when `!(sessions.length === 0) && each sessions && session.schools?.name`, screen size: `md:hidden`
- `{day}` — MonthNuevo · l.394, when `each ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']`, screen size: `hidden md:grid`
- `{day.getDate()}` — MonthNuevo · l.407, when `each days`, screen size: `hidden md:grid`
- `{empty}` — days · l.461, when `each weekDays && daySessions.length === 0`
- `{days('No hay sesiones')}` — WeekNuevo · l.496, screen size: `md:hidden`
- `{days('No hay sesiones programadas')}` — WeekNuevo · l.497, screen size: `hidden md:grid`
- `{label}` — AdminSessionsListNuevo · l.565, when `each [ ['Total Sesiones', stats.total], ['Programadas'…`
- `{value}` — AdminSessionsListNuevo · l.566, when `each [ ['Total Sesiones', stats.total], ['Programadas'…`

**Other texts on screen** (17)

- «Penalizada / Devuelta» — LedgerBadges · l.134
- «Admin» — LedgerBadges · l.139, when `mark.admin_override`
- «Fecha» — ListTable · l.178
- «Hora» — ListTable · l.179
- «Título» — ListTable · l.180
- «Colegio» — ListTable · l.181
- «Comunidad» — ListTable · l.182
- «Consultor(es)» — ListTable · l.183
- «Estado» — ListTable · l.184
- «Serie» — ListTable · l.185
- «Acciones» — ListTable · l.186
- «No se encontraron sesiones» — ListTable · l.193, when `sessions.length === 0`
- «(Chile)» — ListTable · l.204, when `!(sessions.length === 0) && each sessions`
- «No hay sesiones este mes» — MonthNuevo · l.373, when `sessions.length === 0`, screen size: `md:hidden`
- «(Chile)» — days · l.472, when `each weekDays && !(daySessions.length === 0) && each daySessions`
- «Vista» (aria-label) — AdminSessionsListNuevo · l.576
- «Por favor, ingrese la razón de la cancelación:» — AdminSessionsListNuevo · l.715

### components/sessions/admin-nuevo/ApprovalsNuevo.tsx

Used by: `/admin/sessions/approvals`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{request.consultor_sessions?.title} / Sesión sin título» | h3 |  | RequestCard · l.75 |
| «Cambios propuestos:» | h4 |  | RequestCard · l.102 |
| «Razón:» | h4 | `request.reason` | RequestCard · l.128 |

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «{tab.label}» |  | `each TABS` | ApprovalsNuevo · l.179 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Rechazar» | `{() => handleReject(request.id)}` | `request.status === 'pending'` | `{actionInProgress}` |  | RequestCard · l.146 |
| «Aprobar» | `{() => handleApprove(request.id)}` | `request.status === 'pending'` | `{actionInProgress}` |  | RequestCard · l.150 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Ingrese notas para el consultor...» | textarea | «Ingrese notas para el consultor...» |  | `request.status === 'pending'` |  | RequestCard · l.135 |

**Pieces placed here, with the texts and settings handed to them** (13)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  |  | RequestCard · l.71 |
| `CardBody` |  |  |  | RequestCard · l.72 |
| `Badge` |  |  |  | RequestCard · l.96 |
| `Field` | label: Notas (opcional para aprobar, requerido para rechazar) | `request.status === 'pending'` |  | RequestCard · l.134 |
| `XCircle` | aria-hidden: true | `request.status === 'pending'` |  | RequestCard · l.147 |
| `CheckCircle` | aria-hidden: true | `request.status === 'pending'` |  | RequestCard · l.151 |
| `PageHeader` | title: Aprobaciones de Sesiones · description: Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores |  |  | ApprovalsNuevo · l.165 |
| `Tabs` |  |  |  | ApprovalsNuevo · l.170 |
| `TabList` | label: Estado de las solicitudes |  |  | ApprovalsNuevo · l.175 |
| `Icon` | aria-hidden: true | `each TABS` |  | ApprovalsNuevo · l.180 |
| `TabPanel` |  | `each TABS` |  | ApprovalsNuevo · l.187 |
| `Card` |  | `each TABS && editRequests.length === 0` |  | ApprovalsNuevo · l.189 |
| `EmptyState` |  | `each TABS && editRequests.length === 0` |  | ApprovalsNuevo · l.190 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `TABS` | «Pendientes», «Aprobadas», «Rechazadas», «Todas» | l.42 |
| `STATUS` | «Pendiente», «Aprobada», «Rechazada» | l.49 |
| `emptyText()` | «No hay solicitudes pendientes / No hay solicitudes aprobadas / No hay solicitudes rechazadas / No hay solicitudes de cambio» | emptyText · l.56 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=approvals-nuevo` | ApprovalsNuevo · l.164 |

**Values shown from data** (6)

- `{format(parseISO(request.created_at)…}` — RequestCard · l.93
- `{status.label}` — RequestCard · l.96
- `{formatFieldLabel(field)} :` — RequestCard · l.111, when `!(Object.keys(parsedChanges).length === 0) && each Object.keys(parsedChanges)`
- `{formatValue(field, change.old)}` — RequestCard · l.113, when `!(Object.keys(parsedChanges).length === 0) && each Object.keys(parsedChanges)`
- `{formatValue(field, change.new)}` — RequestCard · l.117, when `!(Object.keys(parsedChanges).length === 0) && each Object.keys(parsedChanges)`
- `{request.reason}` — RequestCard · l.129, when `request.reason`

**Other texts on screen** (3)

- «Fecha de sesión: {format(parseISO(request.consultor_s…} / N/A» — RequestCard · l.79
- «Solicitado por: {request.profiles.first_name} {request.profiles.last_name} / Usuario desconocido» — RequestCard · l.88
- «Formato de cambios inválido» — RequestCard · l.105, when `Object.keys(parsedChanges).length === 0`

### components/sessions/admin-nuevo/BulkTagNuevo.tsx

Used by: `/admin/bulk-tag-sessions`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Filtros» | h2 |  | BulkTagNuevo · l.123 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronLeft]» · aria «Página anterior» | `{() => { setSelectedIds(new Set()); setPage((p) => Math.max(1, p - 1)); }}` | `totalPages > 1` | `{page === 1}` |  | BulkTagNuevo · l.174 |
| «[icon ChevronRight]» · aria «Página siguiente» | `{() => { setSelectedIds(new Set()); setPage((p) => Math.min(totalPages, p + 1));…}` | `totalPages > 1` | `{page === totalPages}` |  | BulkTagNuevo · l.183 |
| «Clasificando... / Clasificar Seleccionadas» | `{handleBulkTag}` | `selectedIds.size > 0` | `{saving \|\| !selectedHourTypeKey}` |  | BulkTagNuevo · l.269 |
| «Deseleccionar» | `{() => setSelectedIds(new Set())}` | `selectedIds.size > 0` |  |  | BulkTagNuevo · l.274 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  |  |  | TickBox · l.77 |
|  | date |  |  |  | `id=filter-date-from` | BulkTagNuevo · l.129 |
|  | date |  |  |  | `id=filter-date-to` | BulkTagNuevo · l.138 |
|  | select |  |  |  | `id=filter-school` | BulkTagNuevo · l.147 |
| «Tipo de hora para clasificación» | select |  |  | `selectedIds.size > 0` |  | BulkTagNuevo · l.256 |

**Pieces placed here, with the texts and settings handed to them** (35)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PageHeader` | title: Clasificar Sesiones · description: Asignar tipo de hora a sesiones históricas sin clasificar |  |  | BulkTagNuevo · l.111 |
| `Notice` | tone: neutral |  |  | BulkTagNuevo · l.117 |
| `Card` |  |  |  | BulkTagNuevo · l.121 |
| `CardBody` |  |  |  | BulkTagNuevo · l.122 |
| `Filter` | aria-hidden: true |  |  | BulkTagNuevo · l.124 |
| `Field` | label: Fecha desde |  |  | BulkTagNuevo · l.128 |
| `Field` | label: Fecha hasta |  |  | BulkTagNuevo · l.137 |
| `Field` | label: Colegio |  |  | BulkTagNuevo · l.146 |
| `Table` |  |  |  | BulkTagNuevo · l.166 |
| `ChevronLeft` | aria-hidden: true | `totalPages > 1` |  | BulkTagNuevo · l.181 |
| `ChevronRight` | aria-hidden: true | `totalPages > 1` |  | BulkTagNuevo · l.190 |
| `TableHead` |  |  |  | BulkTagNuevo · l.197 |
| `TableRow` |  |  |  | BulkTagNuevo · l.198 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.199 |
| `TickBox` | aria-label: Seleccionar todas las sesiones |  |  | BulkTagNuevo · l.200 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.206 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.207 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.208 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.209 |
| `TableHeaderCell` |  |  |  | BulkTagNuevo · l.210 |
| `TableBody` |  |  |  | BulkTagNuevo · l.213 |
| `TableRow` |  | `sessions.length === 0` |  | BulkTagNuevo · l.215 |
| `TableCell` |  | `sessions.length === 0` |  | BulkTagNuevo · l.216 |
| `TableRow` |  | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.225 |
| `TableCell` | label: Seleccionar | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.226 |
| `TickBox` | aria-label: Seleccionar sesión {session.title} | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.227 |
| `TableCell` | label: Fecha | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.233 |
| `TableCell` | label: Título | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.234 |
| `TableCell` | label: Colegio | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.237 |
| `TableCell` | label: Consultor | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.238 |
| `TableCell` | label: Estado | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.239 |
| `Badge` |  | `!(sessions.length === 0) && each sessions` |  | BulkTagNuevo · l.240 |
| `Card` |  | `selectedIds.size > 0` |  | BulkTagNuevo · l.252 |
| `CardBody` |  | `selectedIds.size > 0` |  | BulkTagNuevo · l.253 |
| `Tag` | aria-hidden: true | `selectedIds.size > 0` |  | BulkTagNuevo · l.270 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=bulk-tag-nuevo` | BulkTagNuevo · l.110 |

**Values shown from data** (5)

- `{formatDate(session.scheduled_date)}` — BulkTagNuevo · l.233, when `!(sessions.length === 0) && each sessions`
- `{session.title}` — BulkTagNuevo · l.234, when `!(sessions.length === 0) && each sessions`
- `{session.schools?.name} / —` — BulkTagNuevo · l.237, when `!(sessions.length === 0) && each sessions`
- `{getFacilitatorName(session)}` — BulkTagNuevo · l.238, when `!(sessions.length === 0) && each sessions`
- `{badge.label}` — BulkTagNuevo · l.240, when `!(sessions.length === 0) && each sessions`

**Other texts on screen** (12)

- «Las sesiones clasificadas aquí aparecerán en reportes pero» — BulkTagNuevo · l.118
- «NO» — BulkTagNuevo · l.118
- «afectarán los saldos de horas del contrato.» — BulkTagNuevo · l.118
- «{total} sesión(es) sin clasificar» — BulkTagNuevo · l.164
- «Página {page} de {totalPages}» — BulkTagNuevo · l.170, when `totalPages > 1`
- «Fecha» — BulkTagNuevo · l.206
- «Título» — BulkTagNuevo · l.207
- «Colegio» — BulkTagNuevo · l.208
- «Consultor» — BulkTagNuevo · l.209
- «Estado» — BulkTagNuevo · l.210
- «No hay sesiones sin clasificar con los filtros actuales» — BulkTagNuevo · l.217, when `sessions.length === 0`
- «{selectedIds.size} sesión(es) seleccionada(s)» — BulkTagNuevo · l.254, when `selectedIds.size > 0`

### components/sessions/admin-nuevo/adminNuevoStyles.ts

Used by: `/admin/bulk-tag-sessions`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions`

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `CRUMBS_LIST` | «Consultorías», «Sesiones» | l.8 |
| `CRUMBS_DETAIL` | «Sesiones», «Detalle de Sesión» | l.10 |
| `CRUMBS_APPROVALS` | «Consultorías», «Aprobaciones» | l.12 |
| `CRUMBS_BULK_TAG` | «Consultorías», «Clasificar Sesiones» | l.14 |

### components/sessions/assignments-nuevo/AssignmentsNuevo.tsx

Used by: `/admin/consultant-assignments`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editar» | `{() => onEdit(assignment)}` | `!(filteredAssignments.length === 0) && each filteredAssignments` |  |  | AssignmentsNuevo · l.225 |
| «Eliminar» | `{() => setToDelete(assignment.id)}` | `!(filteredAssignments.length === 0) && each filteredAssignments` |  |  | AssignmentsNuevo · l.228 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Tipo» | select |  |  |  |  | AssignmentsNuevo · l.111 |
| «Estado» | select |  |  |  |  | AssignmentsNuevo · l.119 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmDialog` | component | `{toDelete !== null}` | title: ¿Está seguro de que desea eliminar esta asignación? · tone: danger | AssignmentsNuevo · l.240 |

**Pieces placed here, with the texts and settings handed to them** (28)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PageHeader` | title: Consultorías · description: Gestión de asignaciones consultor-estudiante para seguimiento y mentorías · searchPlaceholder: Buscar por nombre o email... · primaryAction: Nueva Asignación |  |  | AssignmentsNuevo · l.99 |
| `Plus` | aria-hidden: true |  |  | AssignmentsNuevo · l.106 |
| `Card` |  | `each stats` |  | AssignmentsNuevo · l.129 |
| `CardBody` |  | `each stats` |  | AssignmentsNuevo · l.130 |
| `Table` |  |  |  | AssignmentsNuevo · l.138 |
| `TableHead` |  |  |  | AssignmentsNuevo · l.139 |
| `TableRow` |  |  |  | AssignmentsNuevo · l.140 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.141 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.142 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.143 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.144 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.145 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.146 |
| `TableHeaderCell` |  |  |  | AssignmentsNuevo · l.147 |
| `TableBody` |  |  |  | AssignmentsNuevo · l.150 |
| `TableRow` |  | `filteredAssignments.length === 0` |  | AssignmentsNuevo · l.152 |
| `TableCell` |  | `filteredAssignments.length === 0` |  | AssignmentsNuevo · l.153 |
| `TableRow` |  | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.164 |
| `TableCell` |  | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.165 |
| `TableCell` | label: Estudiante | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.175 |
| `TableCell` | label: Tipo | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.200 |
| `Badge` |  | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.201 |
| `TableCell` | label: Permisos | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.205 |
| `Badge` | tone: neutral | `!(filteredAssignments.length === 0) && each filteredAssignments && each getPermissionBadges(assignment)` |  | AssignmentsNuevo · l.208 |
| `TableCell` | label: Duración | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.214 |
| `TableCell` | label: Estado | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.220 |
| `Badge` |  | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.221 |
| `TableCell` | label: Acciones | `!(filteredAssignments.length === 0) && each filteredAssignments` |  | AssignmentsNuevo · l.223 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `stats` | «Asignaciones Activas», «Completas», «Consultores Únicos», «Estudiantes Afectados» | AssignmentsNuevo · l.90 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=assignments-nuevo` | AssignmentsNuevo · l.98 |

**Values shown from data** (6)

- `{stat.value}` — AssignmentsNuevo · l.131, when `each stats`
- `{stat.label}` — AssignmentsNuevo · l.132, when `each stats`
- `{assignment.student.first_name} {assignment.student.last_name}` — AssignmentsNuevo · l.178, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.student`
- `{assignment.student.email}` — AssignmentsNuevo · l.181, when `!(filteredAssignments.length === 0) && each filteredAssignments && assignment.student`
- `{assignmentTypeLabels[assignment.ass…} / {assignment.assignment_type}` — AssignmentsNuevo · l.201, when `!(filteredAssignments.length === 0) && each filteredAssignments`
- `{permission}` — AssignmentsNuevo · l.208, when `!(filteredAssignments.length === 0) && each filteredAssignments && each getPermissionBadges(assignment)`

**Other texts on screen** (15)

- «Consultor» — AssignmentsNuevo · l.141
- «Estudiante» — AssignmentsNuevo · l.142
- «Tipo» — AssignmentsNuevo · l.143
- «Permisos» — AssignmentsNuevo · l.144
- «Duración» — AssignmentsNuevo · l.145
- «Estado» — AssignmentsNuevo · l.146
- «Acciones» — AssignmentsNuevo · l.147
- «No se encontraron asignaciones que coincidan con los filtros. / No hay asignaciones creadas aún.» — AssignmentsNuevo · l.153, when `filteredAssignments.length === 0`
- «{`${assignment.consultant?.first_nam…} / Sin nombre» — AssignmentsNuevo · l.167, when `!(filteredAssignments.length === 0) && each filteredAssignments`
- «{assignment.consultant?.email} / Sin email» — AssignmentsNuevo · l.172, when `!(filteredAssignments.length === 0) && each filteredAssignments`
- «Comunidad: {assignment.community.name} / Generación: {assignment.generation.name} / Escuela: {assignment.school.name} / Asignación Grupal» — AssignmentsNuevo · l.185, when `!(filteredAssignments.length === 0) && each filteredAssignments && !(assignment.student)`
- «{count} estudiante s afectado s» — AssignmentsNuevo · l.194, when `!(filteredAssignments.length === 0) && each filteredAssignments && !(assignment.student)`
- «Inicio: {formatDateTime(assignment.starts_at)}» — AssignmentsNuevo · l.216, when `!(filteredAssignments.length === 0) && each filteredAssignments`
- «Fin: {formatDateTime(assignment.ends_at)}» — AssignmentsNuevo · l.217, when `!(filteredAssignments.length === 0) && each filteredAssignments`
- «Activa / Inactiva» — AssignmentsNuevo · l.221, when `!(filteredAssignments.length === 0) && each filteredAssignments`

### components/sessions/create-nuevo/ConsultantsNuevo.tsx

Used by: `/admin/sessions/create`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{retryConsultants}` | `showConsultantsError()` |  |  | ConsultantsNuevo · l.83 |
| «{option}» | `{() => { if (!chosen) handleToggleRole(facilitator.user_id); }}` | `showFacilitators() && each facilitators && each (['Externo', 'Interno'] as const)` |  |  | ConsultantsNuevo · l.125 |
| «Quitar» · aria «{`Quitar consultor ${consultant.first_name} ${consultant.last_name}`}» | `{() => handleRemoveFacilitator(facilitator.user_id)}` | `showFacilitators() && each facilitators` |  |  | ConsultantsNuevo · l.154 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Consultor principal» | radio | `create-session-lead` |  | `showFacilitators() && each facilitators` |  | ConsultantsNuevo · l.144 |
|  | select | disabled: `{consultantSelectorDisabled()}` |  | `showConsultantSelector()` |  | ConsultantsNuevo · l.170 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!consultant` | ConsultantsNuevo · l.100 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Spinner` | label: Cargando consultores... | `showConsultantsLoading()` |  | ConsultantsNuevo · l.72 |
| `Notice` | tone: error | `showConsultantsError()` |  | ConsultantsNuevo · l.76 |
| `Notice` | tone: warning | `showConsultantsEmpty()` |  | ConsultantsNuevo · l.91 |
| `FieldMessage` |  | `messages.length > 0 && each messages` |  | ConsultantsNuevo · l.188 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Externo» | ConsultantsNuevo · l.122 |
| «Interno» | ConsultantsNuevo · l.122 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| role | `role=group` | ConsultantsNuevo · l.55 |
| mark | `id={CREATE_FIELD_IDS.consultants}-label` | ConsultantsNuevo · l.63 |
| role | `role=group` | ConsultantsNuevo · l.117 |
| mark | `id={CREATE_FIELD_IDS.consultants}-error` | ConsultantsNuevo · l.186 |

**Values shown from data** (3)

- `{consultant.first_name} {consultant.last_name}` — ConsultantsNuevo · l.110, when `showFacilitators() && each facilitators`
- `{consultant.email}` — ConsultantsNuevo · l.113, when `showFacilitators() && each facilitators`
- `{message}` — ConsultantsNuevo · l.188, when `messages.length > 0 && each messages`

**Other texts on screen** (5)

- «Consultor(es) asignados» — ConsultantsNuevo · l.64
- «Debe asignar al menos un consultor antes de crear la sesión.» — ConsultantsNuevo · l.69
- «Error al cargar consultores» — ConsultantsNuevo · l.79, when `showConsultantsError()`
- «No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.» — ConsultantsNuevo · l.92, when `showConsultantsEmpty()`
- «Consultor principal» (label) — ConsultantsNuevo · l.143, when `showFacilitators() && each facilitators`

### components/sessions/create-nuevo/HoursNuevo.tsx

Used by: `/admin/sessions/create`

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  |  | `showHourTypeSelects` | `id=hour-type-select` | HoursNuevo · l.61 |
|  | select | disabled: `{contratoSelectDisabled()}` |  | `showHourTypeSelects` | `id=contrato-select` | HoursNuevo · l.76 |

**Pieces placed here, with the texts and settings handed to them** (11)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Spinner` | label: Cargando tipos de hora... | `showHourTypesLoading` |  | HoursNuevo · l.50 |
| `Notice` | tone: warning | `showHourTypesError` |  | HoursNuevo · l.52 |
| `Field` | label: Tipo de Hora | `showHourTypeSelects` |  | HoursNuevo · l.60 |
| `Field` | label: Contrato · help: No hay contratos activos para este colegio. | `showHourTypeSelects` |  | HoursNuevo · l.71 |
| `AlertCircle` | aria-hidden: true | `showHourTypeSelects && pairRefusal` |  | HoursNuevo · l.98 |
| `Notice` | tone: neutral | `showHoursChip && availableHoursLoading` |  | HoursNuevo · l.108 |
| `Spinner` |  | `showHoursChip && availableHoursLoading` |  | HoursNuevo · l.108 |
| `Notice` | tone: error | `showHoursChip && !(availableHoursLoading) && hasHoursBucket() && isExhausted` |  | HoursNuevo · l.116 |
| `Notice` | tone: warning | `showHoursChip && !(availableHoursLoading) && hasHoursBucket() && isWarning` |  | HoursNuevo · l.120 |
| `Notice` | tone: success | `showHoursChip && !(availableHoursLoading) && hasHoursBucket()` |  | HoursNuevo · l.126 |
| `Notice` | tone: warning | `showHoursChip && !(availableHoursLoading) && !(hasHoursBucket())` |  | HoursNuevo · l.132 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=session-create-nuevo-pair-refusal id=hour-pair-refusal` | HoursNuevo · l.93 |
| mark | `testid=session-create-nuevo-hours` | HoursNuevo · l.106 |

**Values shown from data** (2)

- `{decimalComma(hours)}` — HoursNuevo · l.121, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket() && isWarning`
- `{decimalComma(hours)}` — HoursNuevo · l.127, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket()`

**Other texts on screen** (7)

- «No se pudieron cargar los tipos de hora. La sesión puede crearse sin seguimiento de horas.» — HoursNuevo · l.53, when `showHourTypesError`
- «Elija ambos para registrar las horas, o deje los dos vacíos.» — HoursNuevo · l.58, when `showHourTypeSelects`
- «Cargando horas disponibles...» — HoursNuevo · l.109, when `showHoursChip && availableHoursLoading`
- «Sin horas disponibles en este tipo (se registrará como sobrepresupuesto)» — HoursNuevo · l.116, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket() && isExhausted`
- «horas disponibles en este tipo — ¡Quedan menos del 25%!» — HoursNuevo · l.121, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket() && isWarning`
- «horas disponibles en este tipo» — HoursNuevo · l.127, when `showHoursChip && !(availableHoursLoading) && hasHoursBucket()`
- «No hay asignación de horas para este tipo en el contrato seleccionado» — HoursNuevo · l.132, when `showHoursChip && !(availableHoursLoading) && !(hasHoursBucket())`

### components/sessions/create-nuevo/RecurrenceNuevo.tsx

Used by: `/admin/sessions/create`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Configuración de recurrencia» | h3 |  | RecurrenceNuevo · l.48 |
| «Vista previa ( {previewDates.length} sesiones)» | h4 | `showPreview()` | RecurrenceNuevo · l.120 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» · aria «Eliminar fecha» | `{() => handleRemoveCustomDate(index)}` | `showCustomDates() && each customDates && canRemoveCustomDate()` |  |  | RecurrenceNuevo · l.95 |
| «Agregar fecha» | `{handleAddCustomDate}` | `showCustomDates()` |  |  | RecurrenceNuevo · l.109 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  |  |  |  | RecurrenceNuevo · l.52 |
|  | number | `min={2} max={52}` |  | `showRecurrenceCount()` |  | RecurrenceNuevo · l.62 |
| «{`Fecha ${index + 1}`}» | date | `min={customDateEarliest[index]}` |  | `showCustomDates() && each customDates` |  | RecurrenceNuevo · l.83 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: Frecuencia · controlId: create-session-frequency |  |  | RecurrenceNuevo · l.51 |
| `Field` | label: Número de sesiones (2-52) | `showRecurrenceCount()` |  | RecurrenceNuevo · l.61 |
| `X` | aria-hidden: true | `showCustomDates() && each customDates && canRemoveCustomDate()` |  | RecurrenceNuevo · l.102 |
| `Plus` | aria-hidden: true | `showCustomDates()` |  | RecurrenceNuevo · l.110 |
| `FieldMessage` |  | `showCustomDates() && customDatesMessage` | `id=create-session-custom-dates-error` | RecurrenceNuevo · l.114 |
| `AlertTriangle` | aria-hidden: true | `showPreview() && each previewDates && isWeekend` |  | RecurrenceNuevo · l.140 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| mark | `testid=session-create-nuevo-recurrence` | RecurrenceNuevo · l.44 |
| role | `role=group` | RecurrenceNuevo · l.76 |
| mark | `id=create-session-custom-dates-label` | RecurrenceNuevo · l.77 |

**Values shown from data** (2)

- `{customDatesMessage}` — RecurrenceNuevo · l.114, when `showCustomDates() && customDatesMessage`
- `{format(parsedDate, 'EEEE, dd MMMM y…}` — RecurrenceNuevo · l.137, when `showPreview() && each previewDates`

**Other texts on screen** (3)

- «Fechas personalizadas» — RecurrenceNuevo · l.78, when `showCustomDates()`
- «Sesión {index + 1}» — RecurrenceNuevo · l.136, when `showPreview() && each previewDates`
- «Fin de semana» — RecurrenceNuevo · l.141, when `showPreview() && each previewDates && isWeekend`

### components/sessions/create-nuevo/SectionNuevo.tsx

Used by: `/admin/sessions/create`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{n} {title}» | h2 |  | SectionNuevo · l.29 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid={testId}` | SectionNuevo · l.27 |
| `AlertCircle` | aria-hidden: true |  |  | FieldMessage · l.48 |

**Values shown from data** (1)

- `{children}` — FieldMessage · l.49

### components/sessions/create-nuevo/SessionCreateStates.tsx

Used by: `/admin/sessions/create`

**Pieces placed here, with the texts and settings handed to them** (11)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Skeleton` |  |  |  | SessionCreateSkeleton · l.15 |
| `Card` |  | `each [1, 2, 3]` |  | SessionCreateSkeleton · l.17 |
| `Skeleton` |  | `each [1, 2, 3]` |  | SessionCreateSkeleton · l.18 |
| `Skeleton` |  | `each [1, 2, 3]` |  | SessionCreateSkeleton · l.19 |
| `Skeleton` |  | `each [1, 2, 3]` |  | SessionCreateSkeleton · l.20 |
| `Card` |  |  |  | SessionCreateSkeleton · l.24 |
| `Skeleton` |  |  |  | SessionCreateSkeleton · l.25 |
| `Skeleton` |  |  |  | SessionCreateSkeleton · l.26 |
| `Skeleton` |  |  |  | SessionCreateSkeleton · l.27 |
| `Card` |  |  |  | SessionCreateDenied · l.41 |
| `EmptyState` | title: Acceso Denegado · description: No tiene permisos para acceder a esta página. |  |  | SessionCreateDenied · l.42 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | SessionCreateSkeleton · l.11 |
| mark | `testid=session-create-nuevo-loading` | SessionCreateSkeleton · l.11 |
| mark | `testid=session-create-nuevo-denied` | SessionCreateDenied · l.40 |

**Other texts on screen** (1)

- «Cargando...» — SessionCreateSkeleton · l.12, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/sessions/create-nuevo/SummaryNuevo.tsx

Used by: `/admin/sessions/create`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Resumen» | h2 |  | SummaryNuevo · l.66 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!person` | SummaryNuevo · l.87 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid=session-create-nuevo-summary` | SummaryNuevo · l.60 |
| `Badge` | tone: neutral | `showSeriesCountInButtons()` |  | SummaryNuevo · l.70 |
| `AlertTriangle` | aria-hidden: true | `weekends > 0` |  | SummaryNuevo · l.101 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Fechas» | summaryFacts · l.22 |
| «Fecha» | summaryFacts · l.22 |

**Values shown from data** (6)

- `{facts.schoolName} / —` — SummaryNuevo · l.78
- `{facts.communityName} / —` — SummaryNuevo · l.80
- `{facts.dateTerm}` — SummaryNuevo · l.96
- `{facts.sessions}` — SummaryNuevo · l.107
- `{spainTimePreview}` — SummaryNuevo · l.117, when `spainTimePreview`
- `{children}` — SummaryNuevo · l.145

**Other texts on screen** (17)

- «Serie recurrente» — SummaryNuevo · l.71, when `showSeriesCountInButtons()`
- «Colegio» — SummaryNuevo · l.77
- «Comunidad» — SummaryNuevo · l.79
- «Consultores» — SummaryNuevo · l.81
- «· principal» — SummaryNuevo · l.91, when `!(facilitators.length === 0) && each facilitators && f.is_lead`
- «en fin de semana» — SummaryNuevo · l.102, when `weekends > 0`
- «Sesiones» — SummaryNuevo · l.106
- «Horario» — SummaryNuevo · l.108
- «a» — SummaryNuevo · l.112, when `facts.hasTimes`
- «(hora Chile)» — SummaryNuevo · l.112, when `facts.hasTimes`
- «Modalidad» — SummaryNuevo · l.119
- «· Zoom» — SummaryNuevo · l.123, when `showMeetingFields && zoomManagedAvailable && formData.is_zoom_managed`
- «Horas» — SummaryNuevo · l.126
- «Sin seguimiento de horas» — SummaryNuevo · l.128
- «h por sesión ·» — SummaryNuevo · l.130, when `withHours && perSession > 0`
- «h en total» — SummaryNuevo · l.130, when `withHours && perSession > 0`
- «Más de lo disponible en este tipo ( {decimalComma(Math.max(availableHour…} h)» — SummaryNuevo · l.138, when `overBudget`

### components/sessions/create-nuevo/createNuevoText.ts

Used by: `/admin/sessions/create`

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `MODALITY_LABELS` | «Presencial», «Online», «Híbrida» | l.11 |
| `DRAFTS_LEFT_TEXT` | «La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.», «Las sesiones quedaron guardadas como borrador. Revise la lista de sesiones antes de volver a programar, para no crearlas dos veces.» | l.18 |
| `HOUR_PAIR_REFUSAL` | «El contrato y el tipo de hora deben configurarse juntos.» | l.31 |
| `CHECKS_TITLE` | «Revise lo siguiente antes de continuar:» | l.34 |

### components/sessions/create-nuevo/fieldRow.ts

Used by: `/admin/sessions/create`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `ROW_FIELD` | «row-span-3 {SUBGRID}» | l.16 |
| `ROW_FIELD_WITH_HELP` | «row-span-4 {SUBGRID}» | l.19 |

### components/sessions/detail-nuevo/ActivityNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Historial de Solicitudes de Cambio» | h3 | `showEditRequests` | ActivityNuevo · l.28 |
| «Actividad» | h3 | `showEditRequests` | ActivityNuevo · l.69 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  | `showEditRequests` |  | ActivityNuevo · l.31 |
| `Badge` |  | `showEditRequests && each (session.edit_requests as SessionEditRequest[])` |  | ActivityNuevo · l.35 |
| `Card` |  | `hasActivity()` |  | ActivityNuevo · l.71 |
| `Activity` | aria-hidden: true | `hasActivity() && each (session.activity_log ?? [])` |  | ActivityNuevo · l.74 |

**Values shown from data** (8)

- `{editRequestStatusLabel(request)}` — ActivityNuevo · l.35, when `showEditRequests && each (session.edit_requests as SessionEditRequest[])`
- `{format(parseISO(request.created_at)…}` — ActivityNuevo · l.36, when `showEditRequests && each (session.edit_requests as SessionEditRequest[])`
- `{editRequestFieldLabel(field)} :` — ActivityNuevo · l.45, when `showEditRequests && each (session.edit_requests as SessionEditRequest[]) && each Object.keys(request.changes)`
- `{requestValueText(field, change.old)}` — ActivityNuevo · l.46, when `showEditRequests && each (session.edit_requests as SessionEditRequest[]) && each Object.keys(request.changes)`
- `{requestValueText(field, change.new)}` — ActivityNuevo · l.47, when `showEditRequests && each (session.edit_requests as SessionEditRequest[]) && each Object.keys(request.changes)`
- `{log.profiles?.first_name} {log.profiles?.last_name}` — ActivityNuevo · l.77, when `hasActivity() && each (session.activity_log ?? [])`
- `{activityText(log.action)}` — ActivityNuevo · l.80, when `hasActivity() && each (session.activity_log ?? [])`
- `{format(parseISO(log.created_at), 'd…}` — ActivityNuevo · l.82, when `hasActivity() && each (session.activity_log ?? [])`

**Other texts on screen** (3)

- «Razón:» — ActivityNuevo · l.54, when `showEditRequests && each (session.edit_requests as SessionEditRequest[]) && request.reason`
- «Nota del revisor:» — ActivityNuevo · l.59, when `showEditRequests && each (session.edit_requests as SessionEditRequest[]) && showReviewNotes(request)`
- «No hay actividad registrada» — ActivityNuevo · l.88, when `!(hasActivity())`

### components/sessions/detail-nuevo/AttendanceNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Asistencia ( {attendeeCount()} )» | h3 |  | AttendanceNuevo · l.53 |
| «{fullName}» | h4 | `each session.attendees` · screen size: `md:hidden` | AttendanceNuevo · l.175 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Marcar todos presentes» | `{handleMarkAllPresent}` | `canChange()` |  |  | AttendanceNuevo · l.58 |
| «Guardando... / Guardar asistencia» | `{handleSaveAttendance}` | `canChange()` | `{savingAttendance}` |  | AttendanceNuevo · l.61 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{`Asistió: ${fullName}`}» | checkbox |  |  | `each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | AttendanceNuevo · l.117 |
| «{`Estado de llegada: ${fullName}`}» | select |  | «—», «A tiempo», «Tarde», «Salió temprano» | `each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | AttendanceNuevo · l.130 |
| «{`Notas: ${fullName}`}» | text | «Notas opcionales» |  | `each session.attendees && !(readMode())` · screen size: `hidden md:block` |  | AttendanceNuevo · l.147 |
| «Asistió» | checkbox |  |  | `each session.attendees && !(readMode())` · screen size: `md:hidden` |  | AttendanceNuevo · l.185 |
| «Asistió» | select |  | «—», «A tiempo», «Tarde», «Salió temprano» | `each session.attendees && !(readMode())` · screen size: `md:hidden` |  | AttendanceNuevo · l.200 |
| «Asistió» | text | «Notas opcionales» |  | `each session.attendees && !(readMode())` · screen size: `md:hidden` |  | AttendanceNuevo · l.219 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | screen size: `hidden md:block` | AttendanceNuevo · l.86 |
| «Esperado» | screen size: `hidden md:block` | AttendanceNuevo · l.87 |
| «Asistió» | screen size: `hidden md:block` | AttendanceNuevo · l.88 |
| «Estado de llegada» | screen size: `hidden md:block` | AttendanceNuevo · l.89 |
| «Notas» | screen size: `hidden md:block` | AttendanceNuevo · l.90 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Check` | aria-hidden: true | `attended === true` |  | AttendedMark · l.17 |
| `X` | aria-hidden: true | `attended === false` |  | AttendedMark · l.25 |
| `Save` | aria-hidden: true | `canChange()` |  | AttendanceNuevo · l.62 |
| `CheckCircle2` | aria-hidden: true |  |  | AttendanceNuevo · l.71 |
| `X` | aria-hidden: true |  |  | AttendanceNuevo · l.75 |
| `Check` | aria-hidden: true | `each session.attendees && attendee.expected` · screen size: `hidden md:block` |  | AttendanceNuevo · l.103 |
| `X` | aria-hidden: true | `each session.attendees && !(attendee.expected)` · screen size: `hidden md:block` |  | AttendanceNuevo · l.108 |
| `Badge` |  | `each session.attendees` · screen size: `md:hidden` |  | AttendanceNuevo · l.176 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=list` | AttendanceNuevo · l.165 |

**Values shown from data** (5)

- `{fullName}` — AttendanceNuevo · l.99, when `each session.attendees`, screen size: `hidden md:block`
- `{arrivalText(attendee.arrival_status)}` — AttendanceNuevo · l.128, when `each session.attendees && readMode()`, screen size: `hidden md:block`
- `{attendee.notes} / —` — AttendanceNuevo · l.145, when `each session.attendees && readMode()`, screen size: `hidden md:block`
- `{arrivalText(attendee.arrival_status)}` — AttendanceNuevo · l.198, when `each session.attendees && readMode()`, screen size: `md:hidden`
- `{attendee.notes} / —` — AttendanceNuevo · l.217, when `each session.attendees && readMode()`, screen size: `md:hidden`

**Other texts on screen** (12)

- «Sí» — AttendedMark · l.18, when `attended === true`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «No» — AttendedMark · l.26, when `attended === false`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Presentes:» — AttendanceNuevo · l.72
- «Ausentes:» — AttendanceNuevo · l.76
- «Sin marcar: {unmarkedCount()}» — AttendanceNuevo · l.78
- «Esperado» — AttendanceNuevo · l.104, when `each session.attendees && attendee.expected`, screen size: `hidden md:block sr-only`
- «No esperado» — AttendanceNuevo · l.109, when `each session.attendees && !(attendee.expected)`, screen size: `hidden md:block sr-only`
- «Lista de asistencia» (aria-label) — AttendanceNuevo · l.165, screen size: `md:hidden`
- «Esperado / No esperado» — AttendanceNuevo · l.176, when `each session.attendees`, screen size: `md:hidden`
- «Asistió» (label) — AttendanceNuevo · l.181, when `each session.attendees`, screen size: `md:hidden`
- «Estado de llegada» — AttendanceNuevo · l.196, when `each session.attendees`, screen size: `md:hidden`
- «Notas» — AttendanceNuevo · l.215, when `each session.attendees`, screen size: `md:hidden`

### components/sessions/detail-nuevo/HeaderNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{session.title}» | h1 |  | HeaderNuevo · l.59 |
| «Para finalizar la sesión» | h2 | `showFinalizeCard` | HeaderNuevo · l.141 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Solicitar Cambios» | `{openEditRequest}` | `((showCalendarLink \|\| showEditRequestButton)) && showEditRequestButton` | `{hasPendingEditRequest()}` |  | HeaderNuevo · l.122 |
| «Finalizar Sesión» | `{openFinalize}` | `showFinalizeCard` | `{!finalizeCheck.can}` |  | HeaderNuevo · l.159 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Enlace» | `{session.join_path as string}` | `showJoinLink` | `testid=session-join-link` | HeaderNuevo · l.81 |
| «Agregar al Calendario» | `/api/sessions/[*]/ical` | `((showCalendarLink \|\| showEditRequestButton)) && showCalendarLink` |  | HeaderNuevo · l.116 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Agregar al Calendario` | `((showCalendarLink \|\| showEditRequestButton)) && showCalendarLink` | HeaderNuevo · l.116 |

**Pieces placed here, with the texts and settings handed to them** (14)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  |  | HeaderNuevo · l.47 |
| `Badge` |  |  |  | HeaderNuevo · l.51 |
| `Link2` | aria-hidden: true | `seriesNumberShown` |  | HeaderNuevo · l.54 |
| `Calendar` | aria-hidden: true |  |  | HeaderNuevo · l.63 |
| `Clock` | aria-hidden: true |  |  | HeaderNuevo · l.67 |
| `ExternalLink` | aria-hidden: true | `showJoinLink` |  | HeaderNuevo · l.86 |
| `MapPin` | aria-hidden: true | `session.schools` |  | HeaderNuevo · l.94 |
| `Users` | aria-hidden: true | `session.growth_communities` |  | HeaderNuevo · l.100 |
| `Notice` |  | `helperText` |  | HeaderNuevo · l.107 |
| `CalendarPlus` | aria-hidden: true | `((showCalendarLink \|\| showEditRequestButton)) && showCalendarLink` |  | HeaderNuevo · l.117 |
| `Edit` | aria-hidden: true | `((showCalendarLink \|\| showEditRequestButton)) && showEditRequestButton` |  | HeaderNuevo · l.123 |
| `CheckCircle2` | aria-hidden: true | `showFinalizeCard && each finalizeChecklist(finalizeCheck.reasons) && item.met` |  | HeaderNuevo · l.151 |
| `Circle` | aria-hidden: true | `showFinalizeCard && each finalizeChecklist(finalizeCheck.reasons) && !(item.met)` |  | HeaderNuevo · l.153 |
| `CheckCircle2` | aria-hidden: true | `showFinalizeCard` |  | HeaderNuevo · l.160 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=session-finalize-card` | HeaderNuevo · l.136 |

**Values shown from data** (8)

- `{badge.label}` — HeaderNuevo · l.51
- `{format(parseISO(session.session_dat…}` — HeaderNuevo · l.64
- `{getModalityIcon(session.modality)}` — HeaderNuevo · l.77
- `{modalityText(session.modality)}` — HeaderNuevo · l.79
- `{session.schools.name}` — HeaderNuevo · l.95, when `session.schools`
- `{session.growth_communities.name}` — HeaderNuevo · l.101, when `session.growth_communities`
- `{helperText}` — HeaderNuevo · l.107, when `helperText`
- `{item.text}` — HeaderNuevo · l.155, when `showFinalizeCard && each finalizeChecklist(finalizeCheck.reasons)`

**Other texts on screen** (5)

- «Sesión {session.session_number}» — HeaderNuevo · l.55, when `seriesNumberShown`
- «(hora Chile)» — HeaderNuevo · l.71
- «En España: {spain}» — HeaderNuevo · l.73, when `spain`
- «Ya existe una solicitud de cambio pendiente para esta sesión.» — HeaderNuevo · l.129, when `((showCalendarLink \|\| showEditRequestButton)) && pending`
- «Condiciones faltantes: {finalizeCheck.reasons.length}» — HeaderNuevo · l.145, when `showFinalizeCard && finalizeCheck.reasons.length > 0`

### components/sessions/detail-nuevo/MaterialsNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ExternalLink]» · aria «{`Abrir ${material.file_name}`}» |  | `!(materials.length === 0) && each materials && material.download_url` |  |  | MaterialsNuevo · l.71 |
| «[icon Trash2]» · aria «{`Eliminar ${material.file_name}`}» | `{() => setToDelete({ id: material.id, name: material.file_name })}` | `!(materials.length === 0) && each materials && canDeleteMaterial(material)` |  |  | MaterialsNuevo · l.83 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Subiendo... / Subir material» | file | disabled: `{uploadingMaterial}` |  | `canChange()` · hidden by its class (`sr-only`); another control opens it or it is for screen readers |  | MaterialsNuevo · l.32 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmDialog` | component | `{toDelete !== null}` | title: ¿Está seguro que desea eliminar "{toDelete.name}"? · confirmLabel: Eliminar · tone: danger | MaterialsNuevo · l.101 |

**Pieces placed here, with the texts and settings handed to them** (21)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Upload` | aria-hidden: true | `canChange()` |  | MaterialsNuevo · l.30 |
| `Paperclip` | aria-hidden: true | `materials.length === 0` |  | MaterialsNuevo · l.39 |
| `Table` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.43 |
| `TableHead` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.44 |
| `TableRow` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.45 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.46 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.47 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.48 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.49 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.50 |
| `TableHeaderCell` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.51 |
| `TableBody` |  | `!(materials.length === 0)` |  | MaterialsNuevo · l.54 |
| `TableRow` |  | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.58 |
| `TableCell` |  | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.59 |
| `TableCell` | label: Tipo | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.62 |
| `TableCell` | label: Tamaño | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.65 |
| `TableCell` | label: Subido por | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.66 |
| `TableCell` | label: Fecha | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.67 |
| `TableCell` | label: Acciones | `!(materials.length === 0) && each materials` |  | MaterialsNuevo · l.68 |
| `ExternalLink` | aria-hidden: true | `!(materials.length === 0) && each materials && material.download_url` |  | MaterialsNuevo · l.79 |
| `Trash2` | aria-hidden: true | `!(materials.length === 0) && each materials && canDeleteMaterial(material)` |  | MaterialsNuevo · l.89 |

**Values shown from data** (5)

- `{material.file_name}` — MaterialsNuevo · l.60, when `!(materials.length === 0) && each materials`
- `{material.file_type}` — MaterialsNuevo · l.63, when `!(materials.length === 0) && each materials`
- `{formatFileSize(material.file_size)}` — MaterialsNuevo · l.65, when `!(materials.length === 0) && each materials`
- `{uploaderNameText}` — MaterialsNuevo · l.66, when `!(materials.length === 0) && each materials`
- `{format(parseISO(material.created_at…}` — MaterialsNuevo · l.67, when `!(materials.length === 0) && each materials`

**Other texts on screen** (8)

- «Subiendo... / Subir material» (label) — MaterialsNuevo · l.27, when `canChange()`
- «No hay materiales subidos» — MaterialsNuevo · l.40, when `materials.length === 0`
- «Archivo» — MaterialsNuevo · l.46, when `!(materials.length === 0)`
- «Tipo» — MaterialsNuevo · l.47, when `!(materials.length === 0)`
- «Tamaño» — MaterialsNuevo · l.48, when `!(materials.length === 0)`
- «Subido por» — MaterialsNuevo · l.49, when `!(materials.length === 0)`
- «Fecha» — MaterialsNuevo · l.50, when `!(materials.length === 0)`
- «Acciones» — MaterialsNuevo · l.51, when `!(materials.length === 0)`

### components/sessions/detail-nuevo/ReportNuevo.tsx

Used by: `/consultor/sessions/[id]`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Crear Informe» | `{startEditingReport}` | `showCreateReportButton()` |  |  | ReportNuevo · l.67 |
| «Editar Informe» | `{startEditingReport}` | `showEditReportButton()` |  |  | ReportNuevo · l.74 |
| «Guardando... / Actualizar / Crear» | `{handleSaveReport}` | `showReportEditor()` | `{savingReport \|\| !reportContent.trim()}` |  | ReportNuevo · l.98 |
| «Cancelar» | `{cancelEditingReport}` | `showReportEditor() && editingReport` |  |  | ReportNuevo · l.103 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Escriba el informe de la sesión...» | textarea | «Escriba el informe de la sesión...» |  | `showReportEditor()` |  | ReportNuevo · l.84 |
|  | select |  |  | `showReportEditor()` |  | ReportNuevo · l.92 |

**Pieces placed here, with the texts and settings handed to them** (15)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `FileText` | aria-hidden: true | `onlyFacilitatorsReport()` |  | ReportNuevo · l.54 |
| `AudioReportUploader` |  | `showAudioUploader()` |  | ReportNuevo · l.63 |
| `FileText` | aria-hidden: true | `showCreateReportButton()` |  | ReportNuevo · l.68 |
| `Edit` | aria-hidden: true | `showEditReportButton()` |  | ReportNuevo · l.75 |
| `Card` |  | `showReportEditor()` |  | ReportNuevo · l.81 |
| `CardBody` |  | `showReportEditor()` |  | ReportNuevo · l.82 |
| `Field` | label: Contenido del informe | `showReportEditor()` |  | ReportNuevo · l.83 |
| `Field` | label: Visibilidad | `showReportEditor()` |  | ReportNuevo · l.91 |
| `Save` | aria-hidden: true | `showReportEditor()` |  | ReportNuevo · l.99 |
| `AudioPlayer` |  | `!(showReportEditor()) && existingReport && signedAudioUrl` |  | ReportNuevo · l.112 |
| `Card` |  | `!(showReportEditor()) && existingReport` |  | ReportNuevo · l.113 |
| `CardHeader` |  | `!(showReportEditor()) && existingReport` |  | ReportNuevo · l.114 |
| `Badge` |  | `!(showReportEditor()) && existingReport` |  | ReportNuevo · l.119 |
| `CardBody` |  | `!(showReportEditor()) && existingReport` |  | ReportNuevo · l.124 |
| `FileText` | aria-hidden: true | `!(showReportEditor()) && !(existingReport)` |  | ReportNuevo · l.129 |

**Values shown from data** (2)

- `{format(parseISO(existingReport.crea…}` — ReportNuevo · l.116, when `!(showReportEditor()) && existingReport`
- `{existingReport.content}` — ReportNuevo · l.124, when `!(showReportEditor()) && existingReport`

**Other texts on screen** (3)

- «Solo los facilitadores pueden crear informes» — ReportNuevo · l.55, when `onlyFacilitatorsReport()`
- «Todos los participantes / Solo facilitadores» — ReportNuevo · l.119, when `!(showReportEditor()) && existingReport`
- «No hay informe creado» — ReportNuevo · l.130, when `!(showReportEditor()) && !(existingReport)`

### components/sessions/reports-nuevo/ReportsNuevo.tsx

Used by: `/consultor/sessions/reports`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h2 |  | ChartCard · l.187 |
| «Filtros» | h2 |  | ReportsNuevo · l.214 |
| «Sesiones Recientes» | h2 | `recent.length > 0` | ReportsNuevo · l.428 |
| «Acceso Denegado» | h2 |  | ReportsErrorNuevo · l.489 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Dashboard» | `{onBack}` |  |  |  | ReportsErrorNuevo · l.491 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `TableRow` | «{format(parseISO(session.session_dat…} {session.title} {session.school_name} {session.gc_name} {badge.label} {session.a…» · also `onKeyDown={(e) => { if (e.key === 'Enter' \|\| e.key === ' ') { e.preventDefault(); onOpenSe…}` | `{() => onOpenSession(session.id)}` | `recent.length > 0 && each recent` | ReportsNuevo · l.448 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | date |  |  |  | `id=date-from` | ReportsNuevo · l.220 |
|  | date |  |  |  | `id=date-to` | ReportsNuevo · l.223 |
|  | select |  |  |  | `id=school-filter` | ReportsNuevo · l.226 |
|  | select |  |  | `isAdmin && consultants.length > 0` | `id=consultant-filter` | ReportsNuevo · l.237 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!active \|\| !payload \|\| !payload.length` | ChartTooltip · l.140 |

**Pieces placed here, with the texts and settings handed to them** (59)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  |  | Kpi · l.169 |
| `CardBody` |  |  |  | Kpi · l.170 |
| `Card` |  |  |  | ChartCard · l.185 |
| `CardBody` |  |  |  | ChartCard · l.186 |
| `PageHeader` | title: Reportes de Sesiones · description: Estadísticas y métricas de todas las sesiones de consultoría / Estadísticas y métricas de tus sesiones de consultoría |  |  | ReportsNuevo · l.199 |
| `HelpButton` | sectionId: mis-reportes |  |  | ReportsNuevo · l.205 |
| `Card` |  |  |  | ReportsNuevo · l.212 |
| `CardBody` |  |  |  | ReportsNuevo · l.213 |
| `Filter` | aria-hidden: true |  |  | ReportsNuevo · l.215 |
| `Field` | label: Desde |  |  | ReportsNuevo · l.219 |
| `Field` | label: Hasta |  |  | ReportsNuevo · l.222 |
| `Field` | label: Escuela |  |  | ReportsNuevo · l.225 |
| `Field` | label: Consultor | `isAdmin && consultants.length > 0` |  | ReportsNuevo · l.236 |
| `EmptyState` | title: No hay sesiones en el período seleccionado · description: No hay sesiones que coincidan con los filtros seleccionados. Intenta ajustar los filtros para ver más resultados. | `mode === 'empty'` |  | ReportsNuevo · l.262 |
| `LoadingSkeleton` |  | `dataLoading && each Array.from({ length: 4 })` |  | ReportsNuevo · l.276 |
| `LoadingSkeleton` |  | `dataLoading && each Array.from({ length: 4 })` |  | ReportsNuevo · l.281 |
| `Kpi` | title: Total Sesiones |  |  | ReportsNuevo · l.325 |
| `Kpi` | title: Tasa de Completación |  |  | ReportsNuevo · l.326 |
| `Kpi` | title: Horas Programadas |  |  | ReportsNuevo · l.327 |
| `Kpi` | title: Asistencia Promedio |  |  | ReportsNuevo · l.328 |
| `Kpi` | title: Pendientes de Informe |  |  | ReportsNuevo · l.331 |
| `Kpi` | title: Próximas Sesiones |  |  | ReportsNuevo · l.332 |
| `Kpi` | title: Sesiones Canceladas |  |  | ReportsNuevo · l.333 |
| `ChartCard` | title: Sesiones por Mes · ariaLabel: Sesiones por Mes - Gráfico de barras |  |  | ReportsNuevo · l.338 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | ReportsNuevo · l.341 |
| `ChartCard` | title: Distribución por Estado · ariaLabel: Distribución por Estado - Gráfico circular |  |  | ReportsNuevo · l.353 |
| `Pie` | cx: 50% · cy: 50% |  |  | ReportsNuevo · l.356 |
| `ChartCard` | title: Distribución por Modalidad · ariaLabel: Distribución por Modalidad - Gráfico circular |  |  | ReportsNuevo · l.367 |
| `Pie` | cx: 50% · cy: 50% |  |  | ReportsNuevo · l.370 |
| `ChartCard` | title: Tendencia de Asistencia · ariaLabel: Tendencia de Asistencia - Gráfico de área |  |  | ReportsNuevo · l.381 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | ReportsNuevo · l.384 |
| `YAxis` | unit: % |  |  | ReportsNuevo · l.386 |
| `ChartCard` | title: Sesiones por Escuela · ariaLabel: Sesiones por Escuela - Gráfico de barras horizontal | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | ReportsNuevo · l.394 |
| `CartesianGrid` | strokeDasharray: 3 3 | `isAdmin && analyticsData.sessions_by_school.length > 0` |  | ReportsNuevo · l.397 |
| `ChartCard` | title: Top Consultores · ariaLabel: Top Consultores - Gráfico de barras horizontal | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | ReportsNuevo · l.410 |
| `CartesianGrid` | strokeDasharray: 3 3 | `isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0` |  | ReportsNuevo · l.413 |
| `ExportDropdown` | tabName: Sesiones Recientes · headers: Fecha / Título / Escuela / Comunidad / Estado / Asistencia | `recent.length > 0` |  | ReportsNuevo · l.431 |
| `Table` |  | `recent.length > 0` |  | ReportsNuevo · l.433 |
| `TableHead` |  | `recent.length > 0` |  | ReportsNuevo · l.434 |
| `TableRow` |  | `recent.length > 0` |  | ReportsNuevo · l.435 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.436 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.437 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.438 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.439 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.440 |
| `TableHeaderCell` |  | `recent.length > 0` |  | ReportsNuevo · l.441 |
| `TableBody` |  | `recent.length > 0` |  | ReportsNuevo · l.444 |
| `TableRow` |  | `recent.length > 0 && each recent` |  | ReportsNuevo · l.448 |
| `TableCell` | label: Fecha | `recent.length > 0 && each recent` |  | ReportsNuevo · l.461 |
| `TableCell` |  | `recent.length > 0 && each recent` |  | ReportsNuevo · l.462 |
| `TableCell` | label: Escuela | `recent.length > 0 && each recent` |  | ReportsNuevo · l.465 |
| `TableCell` | label: Comunidad | `recent.length > 0 && each recent` |  | ReportsNuevo · l.466 |
| `TableCell` | label: Estado | `recent.length > 0 && each recent` |  | ReportsNuevo · l.467 |
| `Badge` |  | `recent.length > 0 && each recent` |  | ReportsNuevo · l.468 |
| `TableCell` | label: Asistencia | `recent.length > 0 && each recent` |  | ReportsNuevo · l.470 |
| `Card` |  |  |  | ReportsErrorNuevo · l.486 |
| `CardBody` |  |  |  | ReportsErrorNuevo · l.487 |
| `AlertCircle` | aria-hidden: true |  |  | ReportsErrorNuevo · l.488 |
| `ArrowLeft` | aria-hidden: true |  |  | ReportsErrorNuevo · l.492 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=reports-nuevo` | shell · l.253 |
| mark | `testid=reports-nuevo-error` | ReportsErrorNuevo · l.485 |

**Values shown from data** (14)

- `{label}` — ChartTooltip · l.143
- `{(percent * 100).toFixed(0)}%` — renderPieLabel · l.161
- `{title}` — Kpi · l.172
- `{value}` — Kpi · l.173
- `{icon}` — Kpi · l.175
- `{children}` — ChartCard · l.188
- `{header} {filters} {body}` — shell · l.253
- `{format(parseISO(session.session_dat…}` — ReportsNuevo · l.461, when `recent.length > 0 && each recent`
- `{session.title}` — ReportsNuevo · l.462, when `recent.length > 0 && each recent`
- `{session.school_name}` — ReportsNuevo · l.465, when `recent.length > 0 && each recent`
- `{session.gc_name}` — ReportsNuevo · l.466, when `recent.length > 0 && each recent`
- `{badge.label}` — ReportsNuevo · l.468, when `recent.length > 0 && each recent`
- `{session.attendance_rate}% / -` — ReportsNuevo · l.470, when `recent.length > 0 && each recent`
- `{message}` — ReportsErrorNuevo · l.490

**Other texts on screen** (6)

- «Fecha» — ReportsNuevo · l.436, when `recent.length > 0`
- «Título» — ReportsNuevo · l.437, when `recent.length > 0`
- «Escuela» — ReportsNuevo · l.438, when `recent.length > 0`
- «Comunidad» — ReportsNuevo · l.439, when `recent.length > 0`
- «Estado» — ReportsNuevo · l.440, when `recent.length > 0`
- «Asistencia» — ReportsNuevo · l.441, when `recent.length > 0`

### components/sessions/sessionCreateChecks.ts

Used by: `/admin/sessions/create`

**Other texts written in the code (safety net: not tied to an element by the script)** (12)

| Text | Where |
|---|---|
| «Debe seleccionar un colegio» | formChecks · l.86 |
| «Debe seleccionar una comunidad de crecimiento» | formChecks · l.88 |
| «Debe ingresar un título» | formChecks · l.90 |
| «Debe seleccionar una fecha» | formChecks · l.91 |
| «Debe ingresar hora de inicio y término» | formChecks · l.97 |
| «La hora de término debe ser posterior a la hora de inicio» | formChecks · l.104 |
| «Debe ingresar un enlace de reunión para modalidad online o híbrida» | formChecks · l.114 |
| «Debe ingresar una ubicación para modalidad presencial o híbrida» | formChecks · l.119 |
| «Debe asignar al menos un facilitador a la sesión» | formChecks · l.127 |
| «Debe haber exactamente un facilitador principal» | formChecks · l.134 |
| «Debe ingresar al menos 2 fechas personalizadas» | formChecks · l.143 |
| «El número de sesiones debe estar entre 2 y 52» | formChecks · l.146 |

### components/sessions/sessionTextNuevo.ts

Used by: `/consultor/sessions/[id]`, `/consultor/sessions`

**Texts kept in lists and helpers in the code (labels, options, status names)** (9)

| Name | Texts | Where |
|---|---|---|
| `ARRIVAL_NUEVO` | «A tiempo», «Tarde», «Salió temprano» | l.14 |
| `ACTIVITY_NUEVO` | «Sesión creada», «Sesión vista», «Sesión editada», «Cambio de estado», «Material subido», «Material eliminado», «Informe registrado», «Informe actualizado», «Asistencia registrada», «Asistencia actualizada», «Comunicación agregada», «Cambio solicitado», «Cambio aprobado», «Cambio rechazado», «Aprobación de cambio bloqueada», «Facilitadores actualizados», «Sesión cancelada», «Sesión finalizada» | l.27 |
| `MODALITY_NUEVO` | «Presencial», «Online», «Híbrida» | l.54 |
| `ROW_HELPER_TEXT` | «Sesión en curso.», «Sesión finalizada. Debe completar el informe y la asistencia.» | l.69 |
| `REQUEST_MODALITY` | «Presencial», «En línea», «Híbrida» | l.97 |
| `FINALIZE_STATUS_UNMET` | «La sesión debe estar en estado "Pendiente de Informe"» | l.123 |
| `FINALIZE_REPORT_UNMET` | «Falta informe de sesión» | l.124 |
| `FINALIZE_MET` | «Informe de sesión creado», «Asistencia marcada para todos» | l.125 |
| `AGENDA_GROUP_TITLE` | «Esta semana», «Próximas», «Pasadas» | l.159 |

### components/tutorials/HelpButton.tsx

Used by: `/consultor/sessions`, `/consultor/sessions/reports`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon HelpCircle]» · aria «Ayuda y tutoriales» | `{() => setOpen(true)}` |  |  |  | HelpButton · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `HelpDrawer` | component | `{open}` |  | HelpButton · l.23 |

### components/tutorials/HelpDrawer.tsx

Used by: `/consultor/sessions`, `/consultor/sessions/reports`

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

Used by: `/consultor/sessions`, `/consultor/sessions/reports`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {`https://player.vimeo.com/video/${vimeoId}?dnt=1`} |  |  | VimeoEmbed · l.21 |

**Other texts on screen** (1)

- «Video próximamente» — VimeoEmbed · l.13, when `!vimeoId`

### components/ui/dialog.tsx

Used by: `/consultor/sessions`, `/consultor/sessions/reports`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Badge.tsx

Used by: `/consultor/sessions`

**Values shown from data** (2)

- `{value}` — l.68, when `label`
- `{label}` — l.69, when `label`, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Button.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{content}» | `{(event) => { if (loading) { // Not clickable while it works; also keeps a submi…}` |  |  |  | l.159 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{content}» |  | `typeof rest.href === 'string' && inert` |  | l.131 |
| «{content}» | `{href}` | `typeof rest.href === 'string' && href.startsWith('/')` |  | l.145 |
| «{content}» | `{href}` | `typeof rest.href === 'string'` |  | l.151 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SpinnerMark` |  | `loading` |  | l.120 |

### components/ui/kit/Card.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{children}» |  |  |  |  | l.68 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{children}» | `{href}` | `typeof rest.href === 'string'` |  | l.60 |

**Values shown from data** (1)

- `{children}` — l.50, when `!rest.interactive`

### components/ui/kit/ConfirmDialog.tsx

Used by: `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/create`, `/consultor/sessions/[id]`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{cancelLabel}» | `{onCancel}` |  | `{loading}` | `testid={testId ? '${testId}-cancel' : undefined}` | ConfirmDialog · l.80 |
| «{confirmLabel}» | `{onConfirm}` |  |  | `testid={testId ? '${testId}-confirm' : undefined}` | ConfirmDialog · l.89 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | ConfirmDialog · l.68 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Cancelar» | ConfirmDialog · l.49 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| focus | `cancelRef.current.focus()` | ConfirmDialog · l.65 |

**Values shown from data** (1)

- `{message}` — ConfirmDialog · l.100, when `message && typeof message === 'string'`

### components/ui/kit/Dialog.tsx

Used by: `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RadixDialog.Close` | aria-label: Cerrar | `dismissable` | `testid={testId ? '${testId}-close' : undefined}` | Dialog · l.193 |
| `X` | aria-hidden: true | `dismissable` |  | Dialog · l.204 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll({FOCUSABLE})` | firstFocusable · l.75 |
| mark | `testid={testId}` | Dialog · l.130 |
| focus | `candidate.focus()` | Dialog · l.151 |
| focus | `box.focus()` | Dialog · l.154 |
| focus | `target.focus()` | Dialog · l.160 |

**Values shown from data** (5)

- `{eyebrow}` — Dialog · l.179, when `eyebrow`
- `{title}` — Dialog · l.180
- `{description}` — Dialog · l.189, when `description`
- `{children}` — Dialog · l.208
- `{footer}` — Dialog · l.218, when `footer`

### components/ui/kit/EmptyState.tsx

Used by: `/admin/sessions/approvals`, `/admin/sessions/create`, `/consultor/sessions/reports`

**Values shown from data** (3)

- `{title}` — l.43
- `{description}` — l.52, when `description`
- `{action}` — l.54, when `action`

### components/ui/kit/Field.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | {type} |  |  |  |  | l.229 |
|  | textarea |  |  |  |  | l.237 |
|  | select |  |  |  |  | l.248 |
|  | {type} |  |  |  |  | l.268 |
| «{label}» | {kind} | required |  |  |  | Choice · l.304 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AlertCircle` | aria-hidden: true | `error` |  | Field · l.133 |
| `ChevronDown` | aria-hidden: true | hidden by its class (`hidden`); another control opens it or it is for screen readers |  | l.251 |
| `Search` | aria-hidden: true |  |  | l.264 |
| `Check` | aria-hidden: true | `kind === 'checkbox'` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | Choice · l.314 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `AT_LEAST_ONE` | «Marca al menos una opción.» | l.181 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(input[type="checkbox"])` | boxes · l.194 |
| listener | `group.addEventListener('change')` | useAtLeastOneTicked · l.203 |
| listener | `form.addEventListener('reset')` | useAtLeastOneTicked · l.204 |

**Values shown from data** (4)

- `{help}` — Field · l.127, when `help`
- `{children}` — Field · l.157, when `group`
- `{children}` — Field · l.170
- `{help}` — Choice · l.330, when `help`

**Other texts on screen** (3)

- «{label} {mark}» (label) — Field · l.152, when `group`
- «{label} {mark}» (label) — Field · l.166
- «{label}» (label) — Choice · l.302

### components/ui/kit/Loading.tsx

Used by: `/admin/sessions/[id]`, `/admin/sessions/create`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | l.46 |

**Values shown from data** (1)

- `{label}` — l.53, when `label`

**Other texts on screen** (1)

- «Cargando…» — l.53, when `!(label)`, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Notice.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/sessions/create`, `/consultor/sessions/[id]`

**Values shown from data** (1)

- `{title}` — l.68, when `title`

### components/ui/kit/PageHeader.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions`, `/consultor/sessions/reports`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h1 |  | l.93 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{secondaryAction.icon} {secondaryAction.label}» | `{secondaryAction.onClick}` | `hasActions && secondaryAction` |  | `testid={secondaryAction['data-testid']}` | l.110 |
| «{primaryAction.icon} {primaryAction.label}» | `{primaryAction.onClick}` | `hasActions && primaryAction` |  | `testid={primaryAction['data-testid']}` | l.116 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SearchInput` |  | `hasActions && onSearchChange` |  | l.100 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Buscar...» | PageHeader · l.59 |
| «Buscar» | PageHeader · l.60 |

**Values shown from data** (4)

- `{eyebrow}` — l.78, when `eyebrow`
- `{icon}` — l.88, when `icon`
- `{description}` — l.94, when `description`
- `{children}` — l.124, when `children`

### components/ui/kit/Table.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions/reports`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{children}» | `{onSort}` | `sortable` |  |  | l.148 |

**Table columns** (1)

| Text | Shown when | Where |
|---|---|---|
| «{children} / {children}» |  | l.139 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Icon` | aria-hidden: true | `sortable` |  | l.158 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| role | `role=table` | l.47 |
| role | `role=rowgroup` | l.72 |
| role | `role=rowgroup` | l.81 |
| role | `role=row` | l.98 |
| role | `role=cell` | l.189 |

**Values shown from data** (2)

- `{children}` — l.47
- `{label}` — l.213, when `named`

### components/ui/kit/Tabs.tsx

Used by: `/admin/sessions/approvals`, `/consultor/sessions/[id]`, `/consultor/sessions`

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
|  | `{(event) => { onClick?.(event); if (!event.defaultPrevented) select(value); }}` |  | l.150 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `event.defaultPrevented` | TabList · l.112 |
| `at < 0 \|\| tabs.length === 0` | TabList · l.115 |
| `to < 0` | TabList · l.126 |
| `current !== value` | TabPanel · l.175 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Tab» | Tab · l.144 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll([role="tab"])` | TabList · l.96 |
| role | `role=tablist` | TabList · l.104 |
| lookup | `querySelectorAll([role="tab"]:not([disabled]))` | TabList · l.113 |
| focus | `tabs[to].focus()` | TabList · l.128 |
| role | `role=tabpanel` | TabPanel · l.177 |

**Values shown from data** (2)

- `{children}` — Tabs · l.60
- `{children}` — TabList · l.104

### hooks/useSessionCreate.ts

Used by: `/admin/sessions/create`

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «{scheduleConfirmText(sessionCount)}» |  | handleScheduleSession · l.735 |

**Toasts** (26)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar colegios» |  | fetchSchools · l.191 |
| error | «Error al cargar comunidades» |  | fetchCommunities · l.207 |
| error | «{errorMsg}» | `!session?.access_token` | fetchConsultants · l.221 |
| error | «{errorMsg}» | `!response.ok` | fetchConsultants · l.236 |
| error | «{errorMsg}» |  | fetchConsultants · l.248 |
| error | «Este consultor ya está asignado» | `facilitators.find((f) => f.user_id === consultantId)` | handleAddFacilitator · l.377 |
| success | «Facilitador agregado» |  | handleAddFacilitator · l.389 |
| error | «Debe seleccionar un colegio» | `formData.school_id <= 0` | validateForm · l.435 |
| error | «Debe seleccionar una comunidad de crecimiento» | `!formData.growth_community_id` | validateForm · l.440 |
| error | «Debe ingresar un título» | `!formData.title.trim()` | validateForm · l.445 |
| error | «Debe seleccionar una fecha» | `!formData.session_date` | validateForm · l.450 |
| error | «Debe ingresar hora de inicio y término» | `!formData.start_time \|\| !formData.end_time` | validateForm · l.455 |
| error | «La hora de término debe ser posterior a la hora de inicio» | `endHour * 60 + endMin <= startHour * 60 + startMin` | validateForm · l.462 |
| error | «Debe ingresar un enlace de reunión para modalidad online o híbrida» | `(formData.modality === 'online' \|\| formData.modality === 'hibrida') && !formData.is_zoom_managed && !formData.meeting_link` | validateForm · l.474 |
| error | «Debe ingresar una ubicación para modalidad presencial o híbrida» | `(formData.modality === 'presencial' \|\| formData.modality === 'hibrida') && !formData.location` | validateForm · l.482 |
| error | «Debe asignar al menos un facilitador a la sesión» | `facilitators.length === 0` | validateForm · l.488 |
| error | «Debe haber exactamente un facilitador principal» | `leadCount !== 1` | validateForm · l.495 |
| error | «Debe ingresar al menos 2 fechas personalizadas» | `isRecurring && recurrenceFrequency === 'custom' && validDates.length < 2` | validateForm · l.504 |
| error | «El número de sesiones debe estar entre 2 y 52» | `isRecurring && !(recurrenceFrequency === 'custom') && (recurrenceCount < 2 \|\| recurrenceCount > 52)` | validateForm · l.509 |
| error | «Error de autenticación» | `!session?.access_token` | handleSaveDraft · l.527 |
| success | «{sessionCount} sesiones guardadas como borrador / Sesión guardada como borrador» |  | handleSaveDraft · l.575 |
| error | «Error al guardar borrador» |  | handleSaveDraft · l.589 |
| error | «Error de autenticación» | `!session?.access_token` | scheduleConfirmedSession · l.627 |
| success | «{sessionCount} sesiones programadas exitosamente» | `isRecurring && createResult.data.recurrence_group_id` | scheduleConfirmedSession · l.695 |
| success | «Sesión programada exitosamente» | `!(isRecurring && createResult.data.recurrence_group_id)` | scheduleConfirmedSession · l.717 |
| error | «Error al programar sesión» |  | scheduleConfirmedSession · l.722 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al crear sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveDraft · l.570 |
| «Error al crear sesión» | `throw (shown by whoever catches it)` | `!createResponse.ok` | scheduleConfirmedSession · l.672 |
| «Error al aprobar sesiones» | `throw (shown by whoever catches it)` | `isRecurring && createResult.data.recurrence_group_id && !approveResponse.ok` | scheduleConfirmedSession · l.691 |
| «Error al aprobar sesión» | `throw (shown by whoever catches it)` | `!(isRecurring && createResult.data.recurrence_group_id) && !approveResponse.ok` | scheduleConfirmedSession · l.713 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.159 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.169 |
| `/login` | `router.push` |  | initializeAuth · l.174 |
| `/admin/sessions` | `router.push` | `isRecurring` | handleSaveDraft · l.582 |
| `/admin/sessions/[*]` | `router.push` | `!(isRecurring)` | handleSaveDraft · l.585 |
| `/admin/sessions` | `router.push` | `isRecurring && createResult.data.recurrence_group_id` | scheduleConfirmedSession · l.696 |
| `/admin/sessions/[*]` | `router.push` | `!(isRecurring && createResult.data.recurrence_group_id)` | scheduleConfirmedSession · l.718 |
| `/login` | `router.push` |  | handleLogout · l.746 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.164 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `errorMsg` | «Error de autenticación» | fetchConsultants · l.219 |
| `errorMsg` | «Error al cargar consultores» | fetchConsultants · l.246 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | useSessionCreate · l.228 |
| «¿Está seguro de que desea programar estas {sessionCount} sesiones? Se notificará a los participantes.» | useSessionCreate · l.598 |
| «¿Está seguro de que desea programar esta sesión? Se notificará a los participantes.» | useSessionCreate · l.599 |
| «Externo» | useSessionCreate · l.835 |
| «Interno» | useSessionCreate · l.836 |

**Reads and writes the database directly:** `rpc:get_bucket_summary`, `table:contratos` (select), `table:growth_communities` (select), `table:schools` (select)

### hooks/useSessionDetail.ts

Used by: `/consultor/sessions/[id]`

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Está seguro que desea eliminar "{fileName}"?» |  | handleDeleteMaterial · l.452 |

**Toasts** (23)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar sesión» |  | fetchSession · l.213 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleSaveAttendance · l.303 |
| error | «Otra persona editó esta sesión. Recarga para ver los últimos cambios.» | `response.status === 409` | handleSaveAttendance · l.318 |
| success | «Asistencia guardada correctamente» |  | handleSaveAttendance · l.327 |
| error | «Error al guardar asistencia» |  | handleSaveAttendance · l.331 |
| error | «El contenido del informe es requerido» | `!session \|\| !reportContent.trim()` | handleSaveReport · l.339 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleSaveReport · l.349 |
| error | «Otra persona editó esta sesión. Recarga para ver los últimos cambios.» | `response.status === 409` | handleSaveReport · l.375 |
| success | «Informe actualizado correctamente / Informe creado correctamente» |  | handleSaveReport · l.384 |
| error | «Error al guardar informe» |  | handleSaveReport · l.389 |
| error | «El archivo excede el tamaño máximo de 25 MB» | `file.size > 25 * 1024 * 1024` | handleUploadMaterial · l.404 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleUploadMaterial · l.414 |
| success | «Material subido correctamente» |  | handleUploadMaterial · l.435 |
| error | «Error al subir material» |  | handleUploadMaterial · l.439 |
| error | «Error de autenticación» | `!authSession?.access_token` | deleteMaterialConfirmed · l.466 |
| success | «Material eliminado correctamente» |  | deleteMaterialConfirmed · l.482 |
| error | «Error al eliminar material» |  | deleteMaterialConfirmed · l.486 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleFinalize · l.499 |
| success | «Sesión finalizada correctamente» |  | handleFinalize · l.516 |
| error | «Error al finalizar sesión» |  | handleFinalize · l.521 |
| error | «Error de autenticación» | `!authSession?.access_token` | handleSubmitEditRequest · l.564 |
| success | «Solicitud de cambio enviada correctamente» |  | handleSubmitEditRequest · l.582 |
| error | «Error al crear solicitud de cambio» |  | handleSubmitEditRequest · l.587 |

**Messages set on the page** (10)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | fetchSessionData · l.152 |
| «Error al guardar asistencia» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveAttendance · l.324 |
| «Error al guardar informe» | `throw (shown by whoever catches it)` | `!response.ok` | handleSaveReport · l.381 |
| «Error al subir material» | `throw (shown by whoever catches it)` | `!response.ok` | handleUploadMaterial · l.432 |
| «Error al eliminar material» | `throw (shown by whoever catches it)` | `!response.ok` | deleteMaterialConfirmed · l.479 |
| «Error al finalizar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | handleFinalize · l.513 |
| «La sesión debe estar en estado "Pendiente de Informe"» | `reasons.push` | `session.status !== 'pendiente_informe'` | canFinalizeSession · l.533 |
| «Falta informe de sesión» | `reasons.push` | `sessionReports.length === 0` | canFinalizeSession · l.540 |
| «Hay {unmarkedCount} asistente(s) sin marcar» | `reasons.push` | `unmarkedCount > 0` | canFinalizeSession · l.546 |
| «Error al crear solicitud de cambio» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmitEditRequest · l.579 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!authSession?.user \|\| !authSession.access_token` | loadSessionPage · l.87 |
| `/dashboard` | `router.push` | `!allowed` | loadSessionPage · l.101 |
| `/login` | `router.push` | `!cancelled` | loadSessionPage · l.109 |
| `/login` | `router.push` | `response.status === 401` | fetchSessionData · l.137 |
| `/login` | `router.push` | `!authSession?.access_token` | fetchSession · l.206 |
| `/login` | `router.push` |  | handleLogout · l.261 |

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(authSession.user.id)` | loadSessionPage · l.94 |
| `canEdit = isFacilitator \|\| userRole === 'admin'` | useSessionDetail · l.607 |
| `isReadOnly = session!.status === 'completada' \|\| session!.status === 'cancelada'` | decide · l.653 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (5)

| Name | Texts | Where |
|---|---|---|
| `texts` | «Esta sesión está en borrador. El administrador debe aprobarla.», «Esta sesión está pendiente de aprobación por el administrador.», «Sesión programada para {format(parseISO(session.ses…}. [if session]», «Sesión programada. [if not session]», «Sesión en curso.», «Sesión finalizada. Debe completar el informe y la asistencia.», «Sesión completada.», «Esta sesión fue cancelada. Razón: {session.cancellation_reason} [if session?.cancellation_reason]», «Esta sesión fue cancelada. [if not session?.cancellation_reason]» | getStatusHelperText · l.265 |
| `method` | «PUT / POST» | handleSaveReport · l.357 |
| `tabs` | «Detalles», «Planificación [if canEdit]», «Materiales», «Informe», «Comunicaciones», «Actividad» | decide · l.640 |
| `attendeeName()` | «Usuario desconocido» | attendeeName · l.695 |
| `uploaderName()` | «Usuario desconocido» | uploaderName · l.704 |

**Other texts written in the code (safety net: not tied to an element by the script)** (10)

| Text | Where |
|---|---|
| «Bearer {accessToken}» | useSessionDetail · l.129 |
| «Bearer {authSession.access_token}» | useSessionDetail · l.224 |
| «Sesión no cargada» | useSessionDetail · l.528 |
| «Aprobada» | useSessionDetail · l.673 |
| «Rechazada» | useSessionDetail · l.674 |
| «Fecha» | useSessionDetail · l.677 |
| «Hora inicio» | useSessionDetail · l.679 |
| «Hora término» | useSessionDetail · l.681 |
| «Modalidad» | useSessionDetail · l.683 |
| «Usuario desconocido» | useSessionDetail · l.697 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `?id` | l.1 |

### hooks/useSessionsList.ts

Used by: `/consultor/sessions`

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{errorMessage}» |  | fetchSessions · l.192 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar sesiones» | `throw (shown by whoever catches it)` | `!response.ok` | fetchSessions · l.169 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `{{ pathname: router.pathname, query }}` | `router.replace` |  | useSessionsList · l.115 |
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.124 |
| `/dashboard` | `router.push` | `!allowed` | initializeAuth · l.134 |
| `/login` | `router.push` |  | initializeAuth · l.139 |
| `/login` | `router.push` |  | handleLogout · l.198 |
| `/consultor/sessions/[*]` | `router.push` |  | openSession · l.326 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.129 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `errorMessage` | «Error al cargar sesiones» | fetchSessions · l.191 |
| `getNextSessionCountdown()` | «Sin sesiones próximas», «Hoy», «Hoy a las {formatTime(next.start_time)}», «Mañana», «En {diffDays} días» | getNextSessionCountdown · l.275 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | useSessionsList · l.164 |
| «Sin sesiones próximas» | useSessionsList · l.275 |
| «Hoy» | useSessionsList · l.283 |
| «Hoy a las {formatTime(next.start_time)}» | useSessionsList · l.284 |
| «Mañana» | useSessionsList · l.286 |
| «En {diffDays} días» | useSessionsList · l.287 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| address value | `?date_from` | l.1 |
| address value | `?date_to` | l.1 |
| address value | `?school_id` | l.1 |
| address value | `?status` | l.1 |

**Reads and writes the database directly:** `table:contract_hours_ledger` (select)

### lib/api-auth.ts

Used by: `/meet/session/[id]`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

### lib/colorAlpha.ts

Used by: `/consultor/sessions/reports`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «withAlpha expects two hex characters, got "{hh}"» | `throw (shown by whoever catches it)` | `!TWO_HEX.test(hh)` | alphaFromHex · l.19 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `withAlpha()` | «rgb({named[1]} / {alpha})» | withAlpha · l.26 |

### lib/exportUtils.ts

Used by: `/consultor/sessions/reports`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al exportar a Excel» | `throw (shown by whoever catches it)` |  | exportToExcel · l.110 |
| «Error al exportar a PDF» | `throw (shown by whoever catches it)` |  | exportToPDF · l.181 |
| «Tipo de exportación no soportado» | `throw (shown by whoever catches it)` |  | exportReport · l.227 |

**Downloads and printing** (3)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | exportToCSV · l.71 |
| `URL.createObjectURL()` |  | exportToExcel · l.101 |
| `doc.save()` |  | exportToPDF · l.178 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `exportData` | «Reporte FNE - {tabName}», «Sistema Genera» | exportReport · l.203 |
| `csvEscape()` | «"{safeValue.replace(/"/g, '""…}"» | csvEscape · l.30 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Período: {metadata.dateRange}» | ReportExporter · l.132 |
| «Generado por: {metadata.generatedBy}» | ReportExporter · l.137 |
| «Total de registros: {metadata.totalRecords}» | ReportExporter · l.142 |
| «Fecha de generación: {new Date().toLocaleDateStri…}» | ReportExporter · l.146 |
| «Reporte exportado como {type.toUpperCase()}» | ReportExporter · l.230 |
| «Error al exportar reporte» | ReportExporter · l.235 |

### lib/meet/zoom-client-view-loader.ts

Used by: `/meet/session/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (5)

| Name | Texts | Where |
|---|---|---|
| `CLIENT_VIEW_STYLE_FAILED_MESSAGE` | «[zoom-client-view] Zoom stylesheet did not load:» | l.103 |
| `CLIENT_VIEW_INTERACTIVE_SELECTOR` | «button, [role="button"], a[href], input, select, textarea» | l.139 |
| `CLIENT_VIEW_FRAME_FAILED_MESSAGE` | «No se pudo preparar la reunión en esta página.» | l.146 |
| `CLIENT_VIEW_ABSENT_MESSAGE` | «El componente de video se descargó pero no quedó disponible.» | l.148 |
| `CLIENT_VIEW_JOIN_FAILED_MESSAGE` | «No se pudo entrar a la reunión en esta página.» | l.157 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (9)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector(link[href="{href}"])` | appendClientViewStyles · l.228 |
| listener | `link.addEventListener('load')` | appendClientViewStyles · l.233 |
| listener | `link.addEventListener('error')` | appendClientViewStyles · l.237 |
| timer | `setInterval(…, CLIENT_VIEW_RENDER_POLL_MS)` | awaitClientViewFrame · l.343 |
| timer | `setTimeout(…, SDK_CALL_TIMEOUT_MS)` | awaitClientViewFrame · l.350 |
| listener | `frame.addEventListener('error')` | awaitClientViewFrame · l.355 |
| lookup | `querySelectorAll({CLIENT_VIEW_INTERACTIVE_SELECTOR})` | clientViewIsInteractive · l.414 |
| timer | `setTimeout(…, SDK_CALL_TIMEOUT_MS)` | awaitClientViewJoin · l.488 |
| timer | `setInterval(…, CLIENT_VIEW_RENDER_POLL_MS)` | awaitClientViewJoin · l.492 |

### lib/meet/zoom-sdk-loader.ts

Used by: `/meet/session/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `SDK_DOWNLOAD_FAILED_MESSAGE` | «No se pudo descargar el componente de video de Zoom.» | l.67 |
| `SDK_ABSENT_MESSAGE` | «El componente de video se descargó pero no quedó disponible.» | l.70 |
| `SDK_TIMEOUT_MESSAGE` | «La reunión no respondió a tiempo en esta página.» | l.91 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, ms)` | withTimeout · l.103 |
| lookup | `querySelector(script[data-zoom-embed-src="{src}"])` | loadZoomCdnScript · l.176 |
| listener | `script.addEventListener('load')` | loadZoomCdnScript · l.195 |
| listener | `script.addEventListener('error')` | loadZoomCdnScript · l.204 |
| timer | `setTimeout(…, SDK_DOWNLOAD_TIMEOUT_MS)` | loadZoomCdnScript · l.205 |

### lib/services/audio-transcription.ts

Used by: `/consultor/sessions/[id]`

**Messages set on the page** (6)

| Text | Set by | When | Where |
|---|---|---|---|
| «OPENAI_API_KEY no está configurada en las variables de entorno» | `throw (shown by whoever catches it)` | `!process.env.OPENAI_API_KEY` | transcribeAudio · l.45 |
| «El archivo de audio excede el límite de 25 MB (tamaño actual: {(audioBuffer.length / 1024 …} MB)» | `throw (shown by whoever catches it)` | `audioBuffer.length > MAX_AUDIO_SIZE` | transcribeAudio · l.50 |
| «La transcripción no devolvió texto válido» | `throw (shown by whoever catches it)` | `!transcription \|\| typeof transcription !== 'string'` | transcribeAudio · l.74 |
| «Error al transcribir el audio: {error.message}» | `throw (shown by whoever catches it)` | `error instanceof Error` | transcribeAudio · l.81 |
| «Error desconocido al transcribir el audio» | `throw (shown by whoever catches it)` |  | transcribeAudio · l.83 |
| «Respuesta de Claude no es de tipo texto» | `throw (shown by whoever catches it)` | `responseContent.type !== 'text'` | generateReportSummary · l.166 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `systemPrompt` | «Eres un asistente experto en resumir sesiones de consultoría educativa en Chile. Tu tarea es analizar la transcripción de una sesión y generar un informe estructurado en español profesional. CONTEXTO DE LA SESIÓN: - Título: {sessionContext.title} - Fecha: {sessionContext.date} - Escuela: {sessionCo…» | generateReportSummary · l.124 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «- Objetivos: {sessionContext.objectives}» | generateReportSummary · l.131 |
| «Analiza esta transcripción de sesión y genera un informe estructurado: {transcript}» | generateReportSummary · l.158 |

### lib/tutorials/content.ts

Used by: `/consultor/sessions`, `/consultor/sessions/reports`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TUTORIALS` | «Mi Aprendizaje», «Cómo encontrar y retomar tus cursos», «Qué significa cada estado: Comenzar / Continuar / Completado», «Mis Sesiones», «Tu día a día en Mis Sesiones», «Las 6 pestañas de una sesión», «Exportar sesiones a tu calendario (iCal)», «Mis Reportes», «Leer tus reportes de sesiones», «Mis Horas», «Revisar tus horas y exportarlas», «Por qué mis horas ejecutadas vs. penalizadas difieren», «Proceso de Cambio», «Cómo completar un Proceso de Cambio de principio a fin», «Entender la jerarquía: Objetivos, Acciones e Indicadores», «Los 5 tipos de indicador», «Cobertura como gate», «Guardado automático, progreso y envío», «Ver tus resultados», «Espacio Colaborativo», «Tu comunidad de crecimiento», «Documentos: subir, carpetas, permisos», «Mensajería: hilos, menciones, adjuntos», «Reuniones: crear acta» | l.23 |

### lib/utils/meeting-join-policy.ts

Used by: `/meet/session/[id]`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(service, userId)` | authorizeMeetingJoin · l.217 |
| `highestRole = getHighestRole(userRoles)` | authorizeMeetingJoin · l.218 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `NOT_IN_ATTENDEES_MESSAGE` | «No estás en la lista de asistentes de esta sesión. Pídele a un facilitador que te agregue.» | l.68 |
| `CONSULTOR_NOT_FACILITATOR_MESSAGE` | «No tienes acceso para unirte a esta reunión.» | l.76 |
| `MEETING_CLOSED_MESSAGE` | «Esta reunión ya no está disponible» | l.174 |

**Reads and writes the database directly:** `table:consultor_sessions` (select), `table:session_attendees` (select), `table:session_facilitators` (select)

### lib/utils/recurrence.ts

Used by: `/admin/sessions/create`

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Custom recurrence requires at least one date» | `throw (shown by whoever catches it)` | `pattern.frequency === 'custom' && (!pattern.dates \|\| pattern.dates.length === 0)` | generateRecurrenceDates · l.35 |
| «No valid dates provided for custom recurrence» | `throw (shown by whoever catches it)` | `pattern.frequency === 'custom' && validatedDates.length === 0` | generateRecurrenceDates · l.50 |
| «Count must be between 2 and 52 for non-custom recurrence» | `throw (shown by whoever catches it)` | `!pattern.count \|\| pattern.count < 2 \|\| pattern.count > 52` | generateRecurrenceDates · l.63 |
| «Unsupported frequency: {pattern.frequency}» | `throw (shown by whoever catches it)` |  | generateRecurrenceDates · l.90 |

### lib/utils/session-meet-access.ts

Used by: `/meet/session/[id]`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(service, userId)` | resolveMeetSessionAccess · l.137 |
| `highestRole = getHighestRole(userRoles)` | resolveMeetSessionAccess · l.138 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `JOIN_NOT_AUTHORIZED_MESSAGE` | «No tienes acceso para unirte a esta reunión.» | l.72 |
| `joinAccess` | «denied / closed / disabled / allowed» | resolveMeetSessionAccess · l.194 |

**Reads and writes the database directly:** `table:consultor_sessions` (select), `table:session_facilitators` (select)

### lib/utils/session-start-workflow.ts

Used by: `/admin/sessions/[id]`

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Sesión iniciada. Continuando a Zoom…» | `isManagedZoom` | startSessionWorkflow · l.53 |
| error | «La sesión se inició, pero no pudimos abrir Zoom. Usa “Ir a Zoom”.» | `isManagedZoom` | startSessionWorkflow · l.59 |
| success | «Sesión iniciada exitosamente» |  | startSessionWorkflow · l.65 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al iniciar sesión» | `throw (shown by whoever catches it)` | `!response.ok` | startSessionWorkflow · l.49 |
| «Meeting navigation was cancelled» | `throw (shown by whoever catches it)` | `isManagedZoom && !navigated` | startSessionWorkflow · l.57 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{buildSessionJoinPath(sessionId)}` | `navigate` | `isManagedZoom` | startSessionWorkflow · l.56 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {accessToken}» | startSessionWorkflow · l.41 |

### lib/utils/session-timezone.ts

Used by: `/admin/sessions/create`, `/consultor/sessions/[id]`, `/consultor/sessions`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Invalid session date format: {sessionDate}» | `throw (shown by whoever catches it)` | `!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)` | getSessionDateTime · l.39 |
| «Invalid time format: {timeString}» | `throw (shown by whoever catches it)` | `!/^\d{2}:\d{2}(:\d{2})?$/.test(timeString)` | getSessionDateTime · l.42 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «{hours}:{minutes} (hora España)» | formatSessionTimeForConsultant · l.88 |

### lib/utils/session-ui-helpers.tsx

Used by: `/admin/bulk-tag-sessions`, `/admin/sessions/[id]`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `badges` | «Borrador», «Pendiente Aprobación», «Programada», «En Progreso», «Pendiente Informe», «Completada», «Cancelada» | getStatusBadge · l.23 |
| `label` | «Penalizada / Devuelta» | getCancellationSubBadge · l.90 |

**Values shown from data** (1)

- `{label}` — getCancellationSubBadge · l.94

**Other texts on screen** (1)

- «Admin» — getCancellationSubBadge · l.99, when `adminOverride`

### types/roles.ts

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`, `/meet/session/[id]`

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

Used by: `/admin/bulk-tag-sessions`, `/admin/consultant-assignments`, `/admin/sessions/[id]`, `/admin/sessions/approvals`, `/admin/sessions/create`, `/admin/sessions`, `/consultor/sessions/[id]`, `/consultor/sessions`, `/consultor/sessions/reports`, `/meet/session/[id]`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/bulk-tag-sessions` | `pages/api/admin/bulk-tag-sessions.ts` | GET, PATCH | `/admin/bulk-tag-sessions` | `__tests__/api/hour-tracking/bulk-tag.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/bulkTag.sameRequests.test.tsx`, `pages/admin/bulk-tag-sessions.tsx` |
| `/api/admin/consultant-assignment-users` | `pages/api/admin/consultant-assignment-users.ts` | GET | `/admin/consultant-assignments`, `/admin/consultant-earnings`, `/admin/consultant-rates`, `/admin/user-management` | `components/ConsultantAssignmentModal.tsx`, `components/admin/ConsultantRateManager.tsx`, `pages/admin/consultant-earnings.tsx` |
| `/api/admin/consultant-assignments` | `pages/api/admin/consultant-assignments.ts` | DELETE, GET, POST, PUT | `/admin/consultant-assignments`, `/admin/user-management` | `__tests__/api/admin/consultant-assignments.test.ts`, `__tests__/pages/admin/consultantAssignments.clasico.test.tsx`, `__tests__/pages/admin/consultantAssignments.fixtures.ts`, `__tests__/pages/admin/consultantAssignments.nuevo.test.tsx`, `components/ConsultantAssignmentModal.tsx` +1 |
| `/api/admin/consultants` | `pages/api/admin/consultants.ts` | GET | `/admin/sessions`, `/admin/sessions/[id]`, `/admin/sessions/create` | `__tests__/api/admin/consultants.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/sessions/adminDetail.sameRequests.test.tsx`, `__tests__/pages/admin/sessions/adminDetail.views.test.tsx`, `__tests__/pages/admin/sessions/create-timezone.test.tsx` +8 |
| `/api/admin/sessions/[id]/hour-override` | `pages/api/admin/sessions/[id]/hour-override.ts` | POST | `/admin/sessions/[id]` | `__tests__/api/admin/hour-override.test.ts`, `__tests__/lib/services/comparison-billing-isolation.test.ts`, `components/sessions/HoursComparisonPanel.tsx`, `scripts/redesign/harness/seed/30-sesiones-horas.mjs` |
| `/api/admin/sessions/[id]/hours-comparison` | `pages/api/admin/sessions/[id]/hours-comparison.ts` | GET | `/admin/sessions/[id]` | `__tests__/api/admin/hours-comparison.test.ts`, `__tests__/components/sessions/HoursComparisonPanel.test.tsx`, `__tests__/lib/services/comparison-billing-isolation.test.ts`, `__tests__/pages/admin/sessions/adminDetail.latch.test.tsx`, `components/sessions/HoursComparisonPanel.tsx` |
| `/api/meet/diag-signature` | `pages/api/meet/diag-signature.ts` | POST | `/meet/diag` | `__tests__/api/forged-session-sweep.test.ts`, `__tests__/api/meet/diag-signature.test.ts`, `__tests__/pages/meet-diag-join-section.test.ts`, `__tests__/pages/meet/diag-ssr.test.ts`, `pages/meet/diag.tsx` |
| `/api/meet/session/[id]/join` | `pages/api/meet/session/[id]/join.ts` | POST | `/meet/session/[id]` | `__tests__/api/meet/session-join-sdk.test.ts`, `__tests__/api/meet/session-join-zak.test.ts`, `__tests__/api/meet/session-join.test.ts`, `__tests__/components/sessions/JoinMeetingButton.clientview.test.tsx`, `__tests__/components/sessions/JoinMeetingButton.prejoin-screen.test.tsx` +8 |
| `/api/sessions/[id]/approve` | `pages/api/sessions/[id]/approve.ts` | POST | `/admin/sessions`, `/admin/sessions/[id]`, `/admin/sessions/create` | `__tests__/api/sessions/session-approval-hours-fail-closed.test.ts`, `__tests__/api/sessions/session-approve-facilitators.test.ts`, `__tests__/api/sessions/session-approve-zoom-provision.test.ts`, `__tests__/api/sessions/session-lifecycle-notifications.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx` +9 |
| `/api/sessions/[id]/attendance-suggestions` | `pages/api/sessions/[id]/attendance-suggestions.ts` | GET | `/consultor/sessions/[id]` | `__tests__/api/sessions/attendance-suggestions.test.ts`, `components/sessions/AttendanceSuggestionsPanel.tsx`, `tests/e2e/look-sessions.spec.ts` |
| `/api/sessions/[id]/attendees` | `pages/api/sessions/[id]/attendees.ts` | GET, PUT | `/consultor/sessions/[id]` | `__tests__/api/sessions/attendees.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx`, `__tests__/pages/consultor/sessions/detail.test.tsx` +3 |
| `/api/sessions/[id]/audio-report` | `pages/api/sessions/[id]/audio-report.ts` | POST | `/consultor/sessions/[id]` | `__tests__/api/sessions/session-audio-report.test.ts`, `components/sessions/AudioReportUploader.tsx` |
| `/api/sessions/[id]/cancel` | `pages/api/sessions/[id]/cancel.ts` | POST | `/admin/sessions`, `/admin/sessions/[id]` | `__tests__/api/hour-tracking/cancellation.test.ts`, `__tests__/api/sessions/session-cancel-zoom-delete.test.ts`, `__tests__/api/sessions/session-lifecycle-notifications.test.ts`, `__tests__/api/sessions/session-notification-recipients.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx` +4 |
| `/api/sessions/[id]/edit-requests` | `pages/api/sessions/[id]/edit-requests.ts` | GET, POST | `/consultor/sessions/[id]` | `__tests__/api/sessions/edit-requests.test.ts`, `__tests__/api/sessions/session-notification-recipients.test.ts`, `__tests__/api/sessions/session-notifications.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx` +1 |
| `/api/sessions/[id]/facilitators` | `pages/api/sessions/[id]/facilitators.ts` | PUT | `/admin/sessions/[id]` | `__tests__/api/sessions/facilitators.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/sessions/adminDetail.sameRequests.test.tsx`, `pages/admin/sessions/[id].tsx` |
| `/api/sessions/[id]/finalize` | `pages/api/sessions/[id]/finalize.ts` | POST | `/consultor/sessions/[id]` | `__tests__/api/sessions/finalize.test.ts`, `__tests__/api/sessions/session-notification-recipients.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx` +1 |
| `/api/sessions/[id]/ical` | `pages/api/sessions/[id]/ical.ts` | GET | `/admin/sessions/[id]`, `/consultor/sessions/[id]` | `__tests__/api/sessions/cached-roles-never-authorize.test.ts`, `__tests__/api/sessions/ical-attendee-disclosure.test.ts`, `__tests__/api/sessions/ical-sequence.test.ts`, `__tests__/api/sessions/session-ical-export.test.ts`, `__tests__/pages/admin/sessions/adminDetail.views.test.tsx` +7 |
| `/api/sessions/[id]` | `pages/api/sessions/[id]/index.ts` | GET, PUT | `/admin/sessions/[id]`, `/consultor/sessions/[id]` | `__tests__/api/reports/qa-tenant-exclusion-contract.test.ts`, `__tests__/api/sessions/cached-roles-never-authorize.test.ts`, `__tests__/api/sessions/ical-scope-union.test.ts`, `__tests__/api/sessions/reschedule-hours-sync.test.ts`, `__tests__/api/sessions/role-revocation-fail-closed.test.ts` +36 |
| `/api/sessions/[id]/materials` | `pages/api/sessions/[id]/materials.ts` | GET, POST | `/consultor/sessions/[id]` | `__tests__/api/sessions/materials.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx`, `hooks/useSessionDetail.ts`, `tests/e2e/look-sessions.spec.ts` +1 |
| `/api/sessions/[id]/materials/[mid]` | `pages/api/sessions/[id]/materials/[mid].ts` | DELETE | `/consultor/sessions/[id]` | `__tests__/api/sessions/materials-detail.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.nuevo.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx`, `hooks/useSessionDetail.ts` |
| `/api/sessions/[id]/reports` | `pages/api/sessions/[id]/reports.ts` | GET, POST | `/consultor/sessions/[id]` | `__tests__/api/sessions/reports.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx`, `hooks/useSessionDetail.ts`, `tests/e2e/session-disclosure.spec.ts` |
| `/api/sessions/[id]/reports/[rid]` | `pages/api/sessions/[id]/reports/[rid].ts` | GET, PUT | `/consultor/sessions/[id]` | `__tests__/api/sessions/cached-roles-never-authorize.test.ts`, `__tests__/api/sessions/report-detail-disclosure.test.ts`, `__tests__/api/sessions/reports-detail.test.ts`, `__tests__/pages/consultor/sessions/detail.clasico.test.tsx`, `__tests__/pages/consultor/sessions/detail.sameSession.test.tsx` +2 |
| `/api/sessions/bulk-approve` | `pages/api/sessions/bulk-approve.ts` | POST | `/admin/sessions/create` | `__tests__/api/sessions/session-approval-hours-fail-closed.test.ts`, `__tests__/api/sessions/session-bulk-approve-facilitators.test.ts`, `__tests__/api/sessions/session-bulk-approve-zoom-provision.test.ts`, `__tests__/api/sessions/session-lifecycle-notifications.test.ts`, `__tests__/pages/admin/sessions/create.clasico.test.tsx` +4 |
| `/api/sessions/capabilities` | `pages/api/sessions/capabilities.ts` | GET | **no screen** | `__tests__/api/sessions/session-zoom-capabilities.test.ts` |
| `/api/sessions/edit-requests/[eid]` | `pages/api/sessions/edit-requests/[eid].ts` | GET, PUT | `/admin/sessions/approvals` | `__tests__/api/sessions/edit-requests-detail.test.ts`, `__tests__/api/sessions/reschedule-hours-sync.test.ts`, `__tests__/api/sessions/session-lifecycle-notifications.test.ts`, `__tests__/api/sessions/session-notifications.test.ts`, `__tests__/api/sessions/session-reschedule-zoom-sync.test.ts` +5 |
| `/api/sessions/edit-requests` | `pages/api/sessions/edit-requests/index.ts` | GET | `/admin/sessions/approvals` | `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/sessions/approvals.sameRequests.test.tsx`, `__tests__/pages/admin/sessions/approvals.views.test.tsx`, `pages/admin/sessions/approvals.tsx` |
| `/api/sessions/ical` | `pages/api/sessions/ical.ts` | GET | `/admin/sessions`, `/consultor/sessions` | `__tests__/api/sessions/cached-roles-never-authorize.test.ts`, `__tests__/api/sessions/ical-attendee-disclosure.test.ts`, `__tests__/api/sessions/ical-scope-union.test.ts`, `__tests__/api/sessions/ical-sequence.test.ts`, `__tests__/api/sessions/session-ical-export.test.ts` +8 |
| `/api/sessions` | `pages/api/sessions/index.ts` | GET, POST | `/admin/sessions`, `/admin/sessions/create`, `/community/workspace`, `/consultor/sessions` | `__tests__/api/sessions/role-revocation-fail-closed.test.ts`, `__tests__/api/sessions/session-create-facilitators.test.ts`, `__tests__/api/sessions/session-custom-dates-chile.test.ts`, `__tests__/api/sessions/session-detail-disclosure.test.ts`, `__tests__/api/sessions/session-managed-intent-create.test.ts` +27 |
| `/api/sessions/reports/analytics` | `pages/api/sessions/reports/analytics.ts` | GET | `/consultor/sessions/reports` | `__tests__/api/sessions/session-reports-analytics.test.ts`, `__tests__/pages/consultor/sessions/reports.fixtures.ts`, `pages/consultor/sessions/reports.tsx` |
| `/api/sessions/series/[groupId]` | `pages/api/sessions/series/[groupId].ts` | GET | `/admin/sessions/[id]` | `__tests__/api/sessions/session-series.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/sessions/adminDetail.views.test.tsx`, `pages/admin/sessions/[id].tsx` |
| `/api/sessions/series/[groupId]/cancel` | `pages/api/sessions/series/[groupId]/cancel.ts` | POST | `/admin/sessions/[id]` | `__tests__/api/sessions/session-cancel-zoom-delete.test.ts`, `__tests__/api/sessions/session-lifecycle-notifications.test.ts`, `__tests__/api/sessions/session-series.test.ts`, `__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/pages/admin/sessions/adminDetail.sameRequests.test.tsx` +1 |
| `/api/sessions/series/[groupId]/ical` | `pages/api/sessions/series/[groupId]/ical.ts` | GET | `/admin/sessions/[id]` | `__tests__/api/sessions/ical-attendee-disclosure.test.ts`, `__tests__/api/sessions/ical-sequence.test.ts`, `__tests__/api/sessions/session-ical-export.test.ts`, `__tests__/pages/admin/sessions/adminDetail.views.test.tsx`, `components/sessions/admin-nuevo/AdminSessionDetailNuevo.tsx` +1 |
| `/api/sessions/stats` | `pages/api/sessions/stats.ts` | GET | `/admin/sessions` | `__tests__/helpers/adminSessionsFakes.tsx`, `pages/admin/sessions/index.tsx` |
| `/api/zoom/webhook` | `pages/api/zoom/webhook.ts` | POST | **no screen** | `__tests__/api/zoom/webhook-oversize.server.test.ts`, `__tests__/api/zoom/webhook.test.ts`, `__tests__/middleware.forced-password-change.test.ts` |

