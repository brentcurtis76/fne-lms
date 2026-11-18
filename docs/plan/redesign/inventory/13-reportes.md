# Reportes

Area `13-reportes`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `0a7ad8795` (2026-11-18).

3 screen files, 10 API files, 21 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/detailed-reports` | `pages/detailed-reports.tsx` | 816 | Reportes › Reportes |  |
| `/reporte-horas` | `pages/reporte-horas.tsx` | 196 | Reportes › Reporte de Horas |  |
| `/reports` | `pages/reports.tsx` | 900 | Reportes › Rutas de Aprendizaje |  |

## /detailed-reports

File `pages/detailed-reports.tsx` · 816 lines · frame: MainLayout

### Who reaches it

- Menu: Reportes › «Reportes» → `/detailed-reports` — roles: admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red; the group: everyone signed in (`Sidebar.tsx` l.629)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.148 `router.push → /login  (when !session?.user)`
  - l.154 `userRoles = await getUserRoles(supabase, session.user.id)`
  - l.155 `highestRole = getHighestRole(userRoles)`
  - l.172 `router.push → /dashboard  (when highestRole && effectiveRole === 'docente')`
  - l.178 `router.push → /dashboard  (when highestRole && !hasReportingAccess(effectiveRole))`
  - l.200 `router.push → /login`
  - l.262 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:37`, `components/layout/Sidebar.tsx:631`, `lib/auth/forced-password-change.ts:145`, `middleware.ts:340`, `pages/api/qa/seed-codebase-index.ts:299`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 5, community_manager 1, consultor 4, equipo_directivo 6, lider_comunidad 1, lider_generacion 4, supervisor_de_red 6.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | yes | pass |
| lider_comunidad | yes | pass |
| supervisor_de_red | yes | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Vista Inteligente: Top 10 Usuarios Más Activos» | h3 | `pagination?.is_smart_default && userRole === 'admin'` | DetailedReports · l.374 |
| «Datos Filtrados por Rol» | h3 | `userRole && userRole !== 'admin'` | DetailedReports · l.408 |
| «Top 10 Usuarios Más Activos / Usuarios» | h3 | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.576 |
| «Progreso Detallado» | h3 | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.678 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todos los usuarios» | `{() => { setSortBy('last_activity_date'); setSortOrder('desc'); setCurrentPage(1…}` | `pagination?.is_smart_default && userRole === 'admin'` |  |  | DetailedReports · l.382 |
| «Resumen General» | `{() => setActiveTab('overview')}` |  |  |  | DetailedReports · l.428 |
| «Progreso Detallado» | `{() => setActiveTab('detailed')}` |  |  |  | DetailedReports · l.438 |
| «Ver todos los usuarios →» | `{() => setActiveTab('detailed')}` | `activeTab === 'overview' && summary && users.length > 0 && users.length > 10` |  |  | DetailedReports · l.631 |
| «Ver Detalles» | `{() => handleUserClick(userData.user_id)}` | `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)` |  |  | DetailedReports · l.786 |

**Table columns** (15)

| Text | Shown when | Where |
|---|---|---|
| «Usuario» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.584 |
| «Escuela» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.585 |
| «Progreso» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.586 |
| «Tareas» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.587 |
| «Lecciones» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.588 |
| «Tiempo» | `activeTab === 'overview' && summary && users.length > 0` | DetailedReports · l.589 |
| «Usuario» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.684 |
| «Organización» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.687 |
| «Progreso [↑ / ↓]» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.690 |
| «Tareas» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.697 |
| «Cursos» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.700 |
| «Tiempo» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.703 |
| «Quiz» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.706 |
| «Última Actividad» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.709 |
| «Acciones» | `activeTab === 'detailed' && !(isMobile)` | DetailedReports · l.712 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `UserDetailModal` | component | `{showUserModal}` |  | DetailedReports · l.805 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No tienes permisos para acceder a los reportes.» | `highestRole && !hasReportingAccess(effectiveRole)` | initializeAuth · l.177 |
| error | «Failed to load report: {error.message}» |  | fetchDetailedProgress · l.247 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch report data» | `throw (shown by whoever catches it)` | `!response.ok` | fetchDetailedProgress · l.235 |

**Moves to another page from code** (5)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.148 |
| `/dashboard` | `router.push` | `highestRole && effectiveRole === 'docente'` | initializeAuth · l.172 |
| `/dashboard` | `router.push` | `highestRole && !hasReportingAccess(effectiveRole)` | initializeAuth · l.178 |
| `/login` | `router.push` |  | initializeAuth · l.200 |
| `/login` | `router.push` |  | handleLogout · l.262 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, session.user.id)` | initializeAuth · l.154 |
| `highestRole = getHighestRole(userRoles)` | initializeAuth · l.155 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading && users.length === 0` |  | DetailedReports · l.320 |
| `LoadingSkeleton` |  | `loading && users.length === 0` |  | DetailedReports · l.330 |
| `LoadingSkeleton` |  | `loading && users.length === 0` |  | DetailedReports · l.331 |
| `LoadingSkeleton` |  | `loading && users.length === 0 && each Array.from({ length: 5 })` |  | DetailedReports · l.334 |
| `LoadingSkeleton` |  | `loading && users.length === 0` |  | DetailedReports · l.337 |
| `MainLayout` |  |  |  | DetailedReports · l.344 |
| `ResponsiveFunctionalPageHeader` | title: Reportes Detallados de Progreso · searchPlaceholder: Buscar usuarios, escuelas, comunidades... |  |  | DetailedReports · l.354 |
| `AdvancedFilters` |  | `(activeTab === 'overview' \|\| activeTab === 'detailed')` |  | DetailedReports · l.466 |
| `AnalyticsDashboard` |  | `activeTab === 'analytics' && user` |  | DetailedReports · l.646 |
| `MobileUserCard` |  | `activeTab === 'detailed' && isMobile && each filterUsersBySearch(users)` |  | DetailedReports · l.665 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatDate()` | «Nunca» | formatDate · l.297 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Nunca» | DetailedReports · l.297 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | DetailedReports · l.121 |
| storage | `localStorage: rememberMe` | handleLogout · l.260 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.261 |

**Values shown from data** (22)

- `{summary.total_users}` — DetailedReports · l.483, when `activeTab === 'overview' && summary`
- `{summary.active_users}` — DetailedReports · l.499, when `activeTab === 'overview' && summary`
- `{summary.average_completion} %` — DetailedReports · l.515, when `activeTab === 'overview' && summary`
- `{formatTime(summary.total_time_spent)}` — DetailedReports · l.536, when `activeTab === 'overview' && summary`
- `{summary.average_quiz_score} %` — DetailedReports · l.553, when `activeTab === 'overview' && summary && summary.average_quiz_score`
- `{userData.user_name}` — DetailedReports · l.596, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{userData.user_email}` — DetailedReports · l.597, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{userData.completion_percentage} %` — DetailedReports · l.610, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{userData.assignments_submit…}/{userData.assignments_total} / -` — DetailedReports · l.613, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{userData.total_lessons_completed}` — DetailedReports · l.618, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{formatTime(userData.total_time_spen…}` — DetailedReports · l.621, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- `{userData.user_name}` — DetailedReports · l.722, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{userData.user_email}` — DetailedReports · l.723, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{userData.user_role}` — DetailedReports · l.724, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{userData.school_name}` — DetailedReports · l.732, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users) && userData.school_name`
- `{userData.generation_name}` — DetailedReports · l.738, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users) && userData.generation_name`
- `{userData.community_name}` — DetailedReports · l.744, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users) && userData.community_name`
- `{userData.completion_percentage} %` — DetailedReports · l.757, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{userData.assignments_submit…}/{userData.assignments_total} / -` — DetailedReports · l.763, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{formatTime(userData.total_time_spen…}` — DetailedReports · l.776, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{userData.average_quiz_score}% / N/A` — DetailedReports · l.779, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- `{formatDate(userData.last_activity_d…}` — DetailedReports · l.782, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`

**Other texts on screen** (16)

- «Mostrando los usuarios con mayor actividad basado en lecciones completadas, tiempo dedicado y participación reciente.» — DetailedReports · l.378, when `pagination?.is_smart_default && userRole === 'admin'`
- «Como» — DetailedReports · l.412, when `userRole && userRole !== 'admin'`
- «Consultor / Equipo Directivo / Líder de Generación / Líder de Comunidad / {userRole}» — DetailedReports · l.412, when `userRole && userRole !== 'admin'`
- «, solo puedes ver datos de» — DetailedReports · l.415, when `userRole && userRole !== 'admin'`
- «Total Usuarios» — DetailedReports · l.484, when `activeTab === 'overview' && summary`
- «Usuarios en el sistema» — DetailedReports · l.491, when `activeTab === 'overview' && summary`
- «Usuarios Activos» — DetailedReports · l.500, when `activeTab === 'overview' && summary`
- «Activos últimos 30 días» — DetailedReports · l.507, when `activeTab === 'overview' && summary`
- «Progreso Promedio» — DetailedReports · l.516, when `activeTab === 'overview' && summary`
- «Tiempo Total» — DetailedReports · l.537, when `activeTab === 'overview' && summary`
- «Tiempo de estudio acumulado» — DetailedReports · l.544, when `activeTab === 'overview' && summary`
- «Quiz Promedio» — DetailedReports · l.554, when `activeTab === 'overview' && summary && summary.average_quiz_score`
- «{userData.school_name} / Sin escuela» — DetailedReports · l.599, when `activeTab === 'overview' && summary && users.length > 0 && each users.slice(0, 10)`
- «{userData.total_lessons_completed} lecciones» — DetailedReports · l.759, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- «{userData.total_courses_enrolled} inscritos» — DetailedReports · l.769, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`
- «{userData.completed_courses} completados • {userData.courses_in_progress} en progreso» — DetailedReports · l.772, when `activeTab === 'detailed' && !(isMobile) && each filterUsersBySearch(users)`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/reports/AdvancedFilters.tsx`
- `components/reports/AnalyticsDashboard.tsx`
- `components/reports/CollapsibleSection.tsx`
- `components/reports/MobileUserCard.tsx`
- `components/reports/UserDetailModal.tsx`
- `hooks/useDebounce.ts`
- `lib/colorAlpha.ts`
- `types/roles.ts`
- `utils/reportFilters.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/reports/analytics-data` | ? | `components/reports/AnalyticsDashboard.tsx:150` |
| `/api/reports/detailed` | POST | `pages/detailed-reports.tsx:219` |
| `/api/reports/filter-options` | GET | `components/reports/AdvancedFilters.tsx:48` |
| `/api/reports/user-details` | GET | `components/reports/UserDetailModal.tsx:141` |

## /reporte-horas

File `pages/reporte-horas.tsx` · 196 lines · frame: MainLayout

### Who reaches it

- Menu: Reportes › «Reporte de Horas» → `/reporte-horas` — roles: admin, equipo_directivo; the group: everyone signed in (`Sidebar.tsx` l.657)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.53 `router.push → /login  (when !session?.user)`
  - l.70 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.76 `router.push → /dashboard  (when !isAdminUser && userRole !== 'equipo_directivo')`
  - l.106 `router.push → /dashboard  (when !(isAdminUser) && !(roleData && roleData.length > 0))`
  - l.111 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:659`, `lib/auth/forced-password-change.ts:159`, `middleware.ts:354`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1, equipo_directivo 6.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | yes | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Reporte de Horas» | h1 |  | ReporteHorasPage · l.148 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Escuela:» | select |  | «(lista) {s.name}» | `isAdmin` | `id=school-selector (id used by code)` | ReporteHorasPage · l.160 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.53 |
| `/dashboard` | `router.push` | `!isAdminUser && userRole !== 'equipo_directivo'` | initializeAuth · l.76 |
| `/dashboard` | `router.push` | `!(isAdminUser) && !(roleData && roleData.length > 0)` | initializeAuth · l.106 |
| `/login` | `router.push` |  | initializeAuth · l.111 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.70 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | ReporteHorasPage · l.41 |
| `!user` | ReporteHorasPage · l.126 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ReporteHorasPage · l.135 |
| `SchoolHoursReport` |  | `effectiveSchoolId !== null` |  | ReporteHorasPage · l.178 |

**Other texts on screen** (4)

- «Cargando...» — ReporteHorasPage · l.121, when `loading`
- «Seguimiento del uso de horas contratadas por escuela.» — ReporteHorasPage · l.150
- «Escuela:» (label) — ReporteHorasPage · l.159, when `isAdmin`
- «Seleccione una escuela para ver el reporte. / No se encontró una escuela asignada a su cuenta.» — ReporteHorasPage · l.184, when `!(effectiveSchoolId !== null)`

**Reads and writes the database directly:** `table:profiles` (select), `table:schools` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/hours/SchoolHoursReport.tsx`
- `lib/exportUtils.ts`
- `lib/types/hour-tracking.types.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/school-hours-report/[school_id]` | GET | `components/hours/SchoolHoursReport.tsx:445` |
| `/api/school-hours-report/[school_id]/pdf` | ? | `components/hours/SchoolHoursReport.tsx:599` |

## /reports

File `pages/reports.tsx` · 900 lines · frame: MainLayout

### Who reaches it

- Menu: Reportes › «Rutas de Aprendizaje» → `/reports?tab=learning-paths` — roles: admin, consultor, equipo_directivo; the group: everyone signed in (`Sidebar.tsx` l.640)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.157 `router.push → /login  (when !session?.user)`
  - l.169 `role = await getUserPrimaryRole(session.user.id)`
  - l.186 `router.push → /dashboard  (when profileData && !reportingRoles.includes(role))`
  - l.211 `router.push → /login`
  - l.221 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:36`, `components/layout/Sidebar.tsx:642`, `lib/auth/forced-password-change.ts:160`, `middleware.ts:355`, `pages/api/qa/seed-codebase-index.ts:335`
- Tests: browser tests that CI runs: `tests/e2e/learning-path-governance.spec.ts`; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`, `tests/qa/auth-redirects.spec.ts`.
- QA scenarios that name this address: admin 3, community_manager 1, equipo_directivo 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | yes | pass |
| equipo_directivo | yes | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | no | pass |
| docente | no | pass |
| encargado_licitacion | no | pass |

### What the page file itself draws

**Titles** (9)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Progreso de Usuarios» | h3 | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` | ReportsPage · l.508 |
| «Configuración de Analytics» | h3 | `activeTab === 'analytics' && !dataLoading && !fetchError` | ReportsPage · l.614 |
| «Análisis por Comunidades» | h3 | `activeTab === 'community' && !dataLoading && !fetchError` | ReportsPage · l.684 |
| «{community.community_name}» | h4 | `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…` | ReportsPage · l.697 |
| «Análisis por Escuelas» | h3 | `activeTab === 'school' && !dataLoading && !fetchError` | ReportsPage · l.730 |
| «{school.school_name}» | h4 | `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])` | ReportsPage · l.743 |
| «Comunidades:» | h5 | `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name']) && school.communities.length > 0` | ReportsPage · l.768 |
| «Análisis de Rutas de Aprendizaje» | h3 | `activeTab === 'learning-paths' && !dataLoading && !fetchError` | ReportsPage · l.795 |
| «Análisis de Cursos» | h3 | `activeTab === 'courses' && !dataLoading && !fetchError` | ReportsPage · l.820 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{tab.icon} {tab.label}» | `{() => setActiveTab(tab.id)}` | `each [ { id: 'overview', label: 'Resumen General', ico…` |  |  | ReportsPage · l.404 |
| «Intentar de nuevo» | `{fetchReportingData}` | `fetchError && !dataLoading` |  |  | ReportsPage · l.446 |
| «{user.first_name} {user.last_name}» | `{(e) => { e.stopPropagation(); handleUserClick(user.id); }}` | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` |  |  | ReportsPage · l.527 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «Últimos 7 días», «Últimos 30 días», «Últimos 90 días», «Último año» |  |  | ReportsPage · l.377 |
| «Período de Tiempo» | select |  | «Últimos 7 días», «Últimos 30 días», «Últimos 90 días», «Último año» | `activeTab === 'analytics' && !dataLoading && !fetchError` |  | ReportsPage · l.620 |
| «Agrupar por» | select |  | «Día», «Semana», «Mes» | `activeTab === 'analytics' && !dataLoading && !fetchError` |  | ReportsPage · l.635 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `UserDetailModal` | component | `{userDetailModalOpen}` |  | ReportsPage · l.890 |

**Messages set on the page** (6)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error de autenticación. Por favor, inicia sesión nuevamente.» | `setFetchError` | `sessionError \|\| !session?.access_token` | fetchReportingData · l.233 |
| «No se pudieron cargar los reportes.» | `setFetchError` | `activeTab === 'overview' && !(response.ok)` | fetchReportingData · l.256 |
| «No se pudieron cargar los datos de comunidades.» | `setFetchError` | `!(activeTab === 'overview') && activeTab === 'community' && !(response.ok)` | fetchReportingData · l.265 |
| «No se pudieron cargar los datos de escuelas.» | `setFetchError` | `!(activeTab === 'overview') && !(activeTab === 'community') && activeTab === 'school' && !(response.ok)` | fetchReportingData · l.274 |
| «No se pudieron cargar los datos de cursos.» | `setFetchError` | `!(activeTab === 'community') && !(activeTab === 'school') && activeTab === 'courses' && !(response.ok)` | fetchReportingData · l.283 |
| «Error de conexión al cargar datos de reportes.» | `setFetchError` |  | fetchReportingData · l.288 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.157 |
| `/dashboard` | `router.push` | `profileData && !reportingRoles.includes(role)` | initializeAuth · l.186 |
| `/login` | `router.push` |  | initializeAuth · l.211 |
| `/login` | `router.push` |  | handleLogout · l.221 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.169 |

**Pieces placed here, with the texts and settings handed to them** (15)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ReportsPage · l.357 |
| `ResponsiveFunctionalPageHeader` | title: Dashboard de Reportes · subtitle: Reportes de progreso y analytics • {userScope} · searchPlaceholder: Buscar usuarios, cursos, comunidades... |  |  | ReportsPage · l.366 |
| `ExportDropdown` | tabName: Progreso-Usuarios · metadata: Últimos {dateRange} días | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` |  | ReportsPage · l.509 |
| `EnhancedTable` | columns: Usuario / Rol / Cursos / Completados / Tasa / Tiempo / Última Actividad / Consultor · searchPlaceholder: Buscar por nombre, email o rol... | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` |  | ReportsPage · l.519 |
| `StatusBadge` |  | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` |  | ReportsPage · l.563 |
| `ConsultantIndicator` |  | `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError` |  | ReportsPage · l.589 |
| `AdvancedFilters` |  | `activeTab === 'analytics' && !dataLoading && !fetchError` |  | ReportsPage · l.650 |
| `AnalyticsVisualization` |  | `activeTab === 'analytics' && !dataLoading && !fetchError` |  | ReportsPage · l.666 |
| `ExportDropdown` | tabName: Analisis-Comunidades · metadata: Últimos {dateRange} días | `activeTab === 'community' && !dataLoading && !fetchError` |  | ReportsPage · l.685 |
| `StatusBadge` |  | `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…` |  | ReportsPage · l.709 |
| `ExportDropdown` | tabName: Analisis-Escuelas · metadata: Últimos {dateRange} días | `activeTab === 'school' && !dataLoading && !fetchError` |  | ReportsPage · l.731 |
| `LearningPathAnalytics` |  | `activeTab === 'learning-paths' && !dataLoading && !fetchError && lpReportScope !== null` |  | ReportsPage · l.804 |
| `ExportDropdown` | tabName: Analisis-Cursos · metadata: Últimos {dateRange} días | `activeTab === 'courses' && !dataLoading && !fetchError` |  | ReportsPage · l.821 |
| `EnhancedTable` | columns: Curso / Categoría / Inscritos / Tasa Completación / Tiempo Promedio / Engagement / Ranking · searchPlaceholder: Buscar por curso o categoría... | `activeTab === 'courses' && !dataLoading && !fetchError` |  | ReportsPage · l.830 |
| `StatusBadge` |  | `activeTab === 'courses' && !dataLoading && !fetchError` |  | ReportsPage · l.857 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `headers` | «Bearer {session.access_token}» | fetchReportingData · l.238 |
| `formatTime()` | «No disponible», «0h 0m» | formatTime · l.296 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Acceso Global» | ReportsPage · l.192 |
| «Nivel Escuela» | ReportsPage · l.194 |
| «Nivel Generación» | ReportsPage · l.196 |
| «Nivel Comunidad» | ReportsPage · l.198 |
| «Estudiantes Asignados» | ReportsPage · l.200 |
| «Acceso Nivel Red» | ReportsPage · l.202 |
| «Resumen General» | ReportsPage · l.397 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (6)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | handleLogout · l.219 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.220 |
| mark | `testid=reports-learning-paths-tab` | ReportsPage · l.793 |
| mark | `testid=lp-analytics-scope-hint` | ReportsPage · l.800 |
| mark | `testid=lp-analytics-not-available` | ReportsPage · l.809 |
| address value | `?tab` | l.1 |

**Values shown from data** (18)

- `{fetchError}` — ReportsPage · l.445, when `fetchError && !dataLoading`
- `{overviewData.summary.total_users}` — ReportsPage · l.474, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{overviewData.summary.active_users}` — ReportsPage · l.480, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{overviewData.summary.total_courses}` — ReportsPage · l.486, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{formatPercentage(overviewData.summa…}` — ReportsPage · l.492, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{formatTime(overviewData.summary.tot…}` — ReportsPage · l.498, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{user.email}` — ReportsPage · l.536, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{role}` — ReportsPage · l.544, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- `{community.total_users}` — ReportsPage · l.701, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- `{community.active_users}` — ReportsPage · l.705, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- `{Math.round(community.engagement_sco…} /100` — ReportsPage · l.717, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- `{school.total_teachers}` — ReportsPage · l.746, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- `{school.active_teachers}` — ReportsPage · l.750, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- `{formatPercentage(school.avg_lesson_…}` — ReportsPage · l.754, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- `{Math.round(school.avg_assessment_sc…} %` — ReportsPage · l.760, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- `{community.name} ( {community.user_count} )` — ReportsPage · l.771, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name']) && school.communities.length > 0 && each school.communities`
- `{title}` — ReportsPage · l.837, when `activeTab === 'courses' && !dataLoading && !fetchError`
- `{category}` — ReportsPage · l.844, when `activeTab === 'courses' && !dataLoading && !fetchError`

**Other texts on screen** (22)

- «Algunos datos pueden estar incompletos: {warnings.join(', ')}» — ReportsPage · l.423, when `warnings.length > 0`
- «Cargando datos...» — ReportsPage · l.433, when `dataLoading`
- «No hay datos disponibles para tu nivel de acceso.» — ReportsPage · l.463, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users === 0 && !dataLoading && !fetchError`
- «Contacta al administrador si crees que deberías ver reportes aquí.» — ReportsPage · l.464, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users === 0 && !dataLoading && !fetchError`
- «Total Usuarios» — ReportsPage · l.477, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «Usuarios Activos» — ReportsPage · l.483, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «Total Cursos» — ReportsPage · l.489, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «Tasa Promedio» — ReportsPage · l.495, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «Tiempo Total» — ReportsPage · l.501, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «{new Date(activity).toLocaleDateStri…} / Nunca» — ReportsPage · l.579, when `activeTab === 'overview' && overviewData && overviewData.summary.total_users > 0 && !dataLoading && !fetchError`
- «Período de Tiempo» (label) — ReportsPage · l.617, when `activeTab === 'analytics' && !dataLoading && !fetchError`
- «Agrupar por» (label) — ReportsPage · l.632, when `activeTab === 'analytics' && !dataLoading && !fetchError`
- «Total Usuarios:» — ReportsPage · l.700, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- «Usuarios Activos:» — ReportsPage · l.704, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- «Tasa Completación:» — ReportsPage · l.708, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- «Engagement:» — ReportsPage · l.716, when `activeTab === 'community' && !dataLoading && !fetchError && each filterDataBySearch(communityData, ['community_nam…`
- «Total Docentes» — ReportsPage · l.747, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- «Docentes Activos» — ReportsPage · l.751, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- «Lecciones Completadas» — ReportsPage · l.757, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- «Puntaje Evaluaciones» — ReportsPage · l.763, when `activeTab === 'school' && !dataLoading && !fetchError && each filterDataBySearch(schoolData, ['school_name'])`
- «Nivel escuela: solo ves a las personas de tu escuela.» — ReportsPage · l.801, when `activeTab === 'learning-paths' && !dataLoading && !fetchError && lpReportScope !== null && lpReportScope === 'school'`
- «Las analíticas de rutas de aprendizaje están disponibles solo para administración, consultores y equipo directivo.» — ReportsPage · l.810, when `activeTab === 'learning-paths' && !dataLoading && !fetchError && !(lpReportScope !== null)`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/reports/AdvancedFilters.tsx`
- `components/reports/AnalyticsVisualization.tsx`
- `components/reports/ConsultantIndicator.tsx`
- `components/reports/EnhancedTable.tsx`
- `components/reports/ExportDropdown.tsx`
- `components/reports/LearningPathAnalytics.tsx`
- `components/reports/StatusBadge.tsx`
- `components/reports/UserDetailModal.tsx`
- `lib/colorAlpha.ts`
- `lib/exportUtils.ts`
- `types/roles.ts`
- `utils/insightGenerator.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/learning-paths/analytics` | GET | `components/reports/LearningPathAnalytics.tsx:84` |
| `/api/reports/analytics-data` | GET | `components/reports/AnalyticsVisualization.tsx:107` |
| `/api/reports/community` | GET | `pages/reports.tsx:259` |
| `/api/reports/course-analytics` | GET | `pages/reports.tsx:277` |
| `/api/reports/filter-options` | GET | `components/reports/AdvancedFilters.tsx:48` |
| `/api/reports/overview` | GET | `pages/reports.tsx:250` |
| `/api/reports/school` | GET | `pages/reports.tsx:268` |
| `/api/reports/user-details` | GET | `components/reports/UserDetailModal.tsx:141` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/hours/SchoolHoursReport.tsx

Used by: `/reporte-horas`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{bucket.display_name}» | h4 |  | BucketCard · l.175 |
| «{selectedContract.numero_contrato}» | h3 |  | ProgramView · l.360 |
| «{schoolDisplayName}» | h1 |  | SchoolHoursReport · l.622 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ocultar / Ver Detalle ( {bucket.sessions.length} sesiones)» | `{() => setExpanded((v) => !v)}` | `bucket.sessions.length > 0` |  |  | BucketCard · l.231 |
| «Descargar Reporte PDF» | `{handleDownloadPDF}` | `selectedContract` |  |  | SchoolHoursReport · l.626 |
| «Descargar CSV» | `{handleExportCSV}` | `selectedContract` |  |  | SchoolHoursReport · l.633 |
| «{prog.programa_name}» | `{() => { setActiveProgram(prog.programa_id); setSelectedContractId(null); }}` | `(!(!data \|\| data.programs.length === 0)) && data.programs.length > 1 && each data.programs` |  |  | SchoolHoursReport · l.657 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Contrato:» | select |  | «(lista) {c.numero_contrato} (Anexo)» | `program.contracts.length > 1` | `id=contract-selector (id used by code)` | ProgramView · l.331 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» | `expanded` | BucketCard · l.245 |
| «Consultor» | `expanded` | BucketCard · l.246 |
| «Título» | `expanded` | BucketCard · l.247 |
| «Horas» | `expanded` | BucketCard · l.248 |
| «Estado» | `expanded` | BucketCard · l.249 |
| «Asistencia» | `expanded` | BucketCard · l.250 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No hay un contrato seleccionado para exportar.» | `!data \|\| !activeProgData \|\| !selectedContract` | handleExportCSV · l.480 |
| error | «No se pudo generar el CSV.» |  | handleExportCSV · l.585 |
| success | «CSV descargado correctamente» |  | handleExportCSV · l.589 |
| error | «No hay un contrato seleccionado para descargar.» | `!selectedContract` | handleDownloadPDF · l.595 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar el reporte» | `setError` | `!res.ok` | SchoolHoursReport · l.449 |
| «Error de red al cargar el reporte.» | `setError` |  | SchoolHoursReport · l.459 |

**Charts** (1)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| PieChart | Pie `value` (slices: one colour per data row) |  | RingChart · l.91 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/api/school-hours-report/[*]/pdf[*]` | `window.open` |  | handleDownloadPDF · l.599 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `allocated <= 0` | ProgressBar · l.134 |
| `requestId !== requestSeqRef.current` | SchoolHoursReport · l.447 |
| `requestId !== requestSeqRef.current` | SchoolHoursReport · l.458 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ResponsiveContainer` |  |  |  | RingChart · l.90 |
| `Pie` | cx: 50% · cy: 50% |  |  | RingChart · l.92 |
| `Cell` |  | `each data` |  | RingChart · l.102 |
| `Tooltip` |  |  |  | RingChart · l.105 |
| `AlertTriangle` | aria-hidden: true | `bucket.sessions_truncated` |  | BucketCard · l.225 |
| `AlertTriangle` | aria-hidden: true | `error` |  | SchoolHoursReport · l.609 |
| `FileText` | aria-hidden: true | `selectedContract` |  | SchoolHoursReport · l.630 |
| `Download` | aria-hidden: true | `selectedContract` |  | SchoolHoursReport · l.637 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `COLOR_CONSUMED` | «rgb(var(--color-serie-1, var(--color-legacy-003a5b)))» | l.35 |
| `COLOR_RESERVED` | «rgb(var(--color-serie-2, var(--color-legacy-0066a4)))» | l.36 |
| `COLOR_AVAILABLE` | «rgb(var(--color-serie-5, var(--color-legacy-e0f0ff)))» | l.37 |
| `STATUS_BADGE` | «Consumida», «Reservada», «Penalizada», «Devuelta», «Sin registro de horas» | l.50 |

**Other texts written in the code (safety net: not tied to an element by the script)** (21)

| Text | Where |
|---|---|
| «Sin datos» | RingChart · l.82 |
| «Resumen del contrato» | SchoolHoursReport · l.517 |
| «Contrato sin categorías» | SchoolHoursReport · l.529 |
| «Categoría sin sesiones» | SchoolHoursReport · l.534 |
| «Aviso de detalle parcial» | SchoolHoursReport · l.545 |
| «Sin registro de horas (horas programadas)» | SchoolHoursReport · l.561 |
| «Sesión» | SchoolHoursReport · l.565 |
| «Reporte de Horas — {data.school_name} · {activeProgData.programa_name} · Contrato {selectedContract.numero_con…} ({dateStr})» | SchoolHoursReport · l.579 |
| «Programa» | SchoolHoursReport · l.580 |
| «Categoría» | SchoolHoursReport · l.580 |
| «Horas de sesión» | SchoolHoursReport · l.580 |
| «Sobre Presupuesto» | SchoolHoursReport · l.580 |
| «Asistencia Esperada» | SchoolHoursReport · l.580 |
| «Asistencia Real» | SchoolHoursReport · l.580 |
| «Tipo de fila» | SchoolHoursReport · l.580 |
| «Horas contratadas» | SchoolHoursReport · l.580 |
| «Horas consumidas» | SchoolHoursReport · l.580 |
| «Horas reservadas» | SchoolHoursReport · l.580 |
| «Horas disponibles» | SchoolHoursReport · l.580 |
| «Tipo de contrato» | SchoolHoursReport · l.580 |
| «Escuela» | SchoolHoursReport · l.602 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=img` | RingChart · l.85 |
| mark | `testid=bucket-partial-detail-notice` | BucketCard · l.221 |

**Values shown from data** (12)

- `{total.toFixed(0)}` — RingChart · l.112
- `{bucket.consumed.toFixed(1)}` — BucketCard · l.201
- `{bucket.reserved.toFixed(1)}` — BucketCard · l.205
- `{bucket.available.toFixed(1)}` — BucketCard · l.209
- `{PARTIAL_SESSION_DETAIL_NOTICE}` — BucketCard · l.226, when `bucket.sessions_truncated`
- `{format(new Date(session.date + 'T00…} / —` — BucketCard · l.258, when `expanded && each bucket.sessions`
- `{session.consultant_name}` — BucketCard · l.263, when `expanded && each bucket.sessions`
- `{session.title}` — BucketCard · l.264, when `expanded && each bucket.sessions`
- `{session.hours.toFixed(2)}` — BucketCard · l.265, when `expanded && each bucket.sessions`
- `{badge.label}` — BucketCard · l.268, when `expanded && each bucket.sessions`
- `{session.attendance.attended}/{session.attendance.expected} / —` — BucketCard · l.283, when `expanded && each bucket.sessions`
- `{error}` — SchoolHoursReport · l.612, when `error`

**Other texts on screen** (24)

- «horas» — RingChart · l.113
- «Agotado» — BucketCard · l.178, when `warningLevel === 'exhausted'`
- «+ {bucket.annex_hours.toFixed(1)} h Anexo» — BucketCard · l.183, when `bucket.annex_hours > 0`
- «Consumidas» — BucketCard · l.202
- «Reservadas» — BucketCard · l.206
- «Disponibles» — BucketCard · l.210
- «{bucket.consumed.toFixed(1)} / {bucket.allocated.toFixed(1)} horas» — BucketCard · l.214
- «Sobre presupuesto» — BucketCard · l.273, when `expanded && each bucket.sessions && session.is_over_budget`
- «Horas programadas» — BucketCard · l.279, when `expanded && each bucket.sessions && session.status === 'sin_registro'`
- «No hay sesiones registradas en esta categoría» — BucketCard · l.295, when `expanded && bucket.sessions.length === 0`
- «Este programa no tiene contratos activos» — ProgramView · l.320, when `!selectedContract`
- «Contrato:» (label) — ProgramView · l.330, when `program.contracts.length > 1`
- «Consumidas:» — ProgramView · l.365
- «{selectedContract.total_consumed.toF…} h» — ProgramView · l.366
- «Reservadas:» — ProgramView · l.370
- «{selectedContract.total_reserved.toF…} h» — ProgramView · l.371
- «Disponibles:» — ProgramView · l.375
- «{selectedContract.total_available.to…} h» — ProgramView · l.376
- «Contratadas:» — ProgramView · l.380
- «{selectedContract.total_contracted_h…} h» — ProgramView · l.381
- «No hay categorías de horas para este contrato.» — ProgramView · l.391, when `selectedContract.buckets.length === 0`
- «Error al cargar el reporte» — SchoolHoursReport · l.611, when `error`
- «Esta escuela no tiene programas activos» — SchoolHoursReport · l.648, when `!data \|\| data.programs.length === 0`
- «Seleccione un programa para ver el detalle» — SchoolHoursReport · l.685, when `(!(!data \|\| data.programs.length === 0)) && !(activeProgData)`

### components/layout/FunctionalPageHeader.tsx

Used by: `/detailed-reports`, `/reports`

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

### components/reports/AdvancedFilters.tsx

Used by: `/detailed-reports`, `/reports`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Filtros de Búsqueda» | h3 |  | AdvancedFilters · l.117 |
| «Filtros por Fecha» | h4 | `showAdvanced` | AdvancedFilters · l.331 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar Filtros» | `{clearAllFilters}` | `hasActiveFilters` |  |  | AdvancedFilters · l.120 |
| «Ocultar / Mostrar Filtros Avanzados» | `{() => setShowAdvanced(!showAdvanced)}` |  |  |  | AdvancedFilters · l.127 |
| «×» | `{() => handleFilterChange('search', '')}` | `hasActiveFilters && filters.search` |  |  | AdvancedFilters · l.238 |
| «×» | `{() => handleFilterChange('school_id', 'all')}` | `hasActiveFilters && filters.school_id !== 'all'` |  |  | AdvancedFilters · l.251 |
| «×» | `{() => handleFilterChange('generation_id', 'all')}` | `hasActiveFilters && filters.generation_id !== 'all'` |  |  | AdvancedFilters · l.264 |
| «×» | `{() => handleFilterChange('community_id', 'all')}` | `hasActiveFilters && filters.community_id !== 'all'` |  |  | AdvancedFilters · l.277 |
| «×» | `{() => handleFilterChange('status', 'all')}` | `hasActiveFilters && filters.status !== 'all'` |  |  | AdvancedFilters · l.292 |
| «×» | `{() => { handleFilterChange('date_from', ''); handleFilterChange('date_to', '');…}` | `hasActiveFilters && ((filters.date_from \|\| filters.date_to))` |  |  | AdvancedFilters · l.305 |
| «🗑️ Limpiar todos» | `{clearAllFilters}` | `hasActiveFilters` |  |  | AdvancedFilters · l.318 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «🏫 Escuela» | select |  | «Todas las escuelas», «(lista) {school.name}» | `(isAdmin \|\| userRole === 'consultor')` |  | AdvancedFilters · l.152 |
| «👥 Generación» | select | disabled: `{filteredGenerations.length === 0}` | «Todas las generaciones», «(lista) {generation.name}» | `(isAdmin \|\| ['equipo_directivo'].includes(userRole))` |  | AdvancedFilters · l.173 |
| «👥 Comunidad» | select | disabled: `{filteredCommunities.length === 0}` | «Todas las comunidades», «(lista) {community.name}» | `(isAdmin \|\| ['equipo_directivo', 'lider_generacion'].includes(userRole))` |  | AdvancedFilters · l.195 |
| «📊 Estado del Usuario» | select |  | «Todos los estados», «Activos (estudiando)», «Completados», «Inactivos (30+ días)» |  |  | AdvancedFilters · l.215 |
| «📅 Fecha Desde» | date |  |  | `showAdvanced` |  | AdvancedFilters · l.338 |
| «📅 Fecha Hasta» | date |  |  | `showAdvanced` |  | AdvancedFilters · l.350 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch filter options» | `throw (shown by whoever catches it)` | `!response.ok` | fetchFilterData · l.57 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | AdvancedFilters · l.42 |

**Other texts on screen** (13)

- «🏫 Escuela» (label) — AdvancedFilters · l.149, when `(isAdmin \|\| userRole === 'consultor')`
- «👥 Generación» (label) — AdvancedFilters · l.170, when `(isAdmin \|\| ['equipo_directivo'].includes(userRole))`
- «👥 Comunidad» (label) — AdvancedFilters · l.192, when `(isAdmin \|\| ['equipo_directivo', 'lider_generacion'].includes(userRole))`
- «📊 Estado del Usuario» (label) — AdvancedFilters · l.212
- «Filtros aplicados:» — AdvancedFilters · l.232, when `hasActiveFilters`
- «🔍 &quot;» — AdvancedFilters · l.237, when `hasActiveFilters && filters.search`
- «&quot;» — AdvancedFilters · l.237, when `hasActiveFilters && filters.search`
- «Escuela seleccionada» — AdvancedFilters · l.250, when `hasActiveFilters && filters.school_id !== 'all'`
- «Generación seleccionada» — AdvancedFilters · l.263, when `hasActiveFilters && filters.generation_id !== 'all'`
- «Comunidad seleccionada» — AdvancedFilters · l.276, when `hasActiveFilters && filters.community_id !== 'all'`
- «Activos / Completados / Inactivos» — AdvancedFilters · l.289, when `hasActiveFilters && filters.status !== 'all'`
- «📅 Fecha Desde» (label) — AdvancedFilters · l.335, when `showAdvanced`
- «📅 Fecha Hasta» (label) — AdvancedFilters · l.347, when `showAdvanced`

### components/reports/AnalyticsDashboard.tsx

Used by: `/detailed-reports`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Vista Previa del Dashboard Analítico» | h3 |  | AnalyticsDashboard · l.298 |
| «Tendencia de Progreso» | h3 |  | AnalyticsDashboard · l.375 |
| «Tiempo de Estudio» | h3 |  | AnalyticsDashboard · l.416 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Exportar» | `{() => exportChart('progress-trends')}` |  |  |  | AnalyticsDashboard · l.376 |
| «Exportar» | `{() => exportChart('time-trends')}` |  |  |  | AnalyticsDashboard · l.417 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Período de Tiempo» | select |  | «Última semana», «Últimos 30 días», «Últimos 3 meses», «Último año» |  |  | AnalyticsDashboard · l.255 |
| «Agrupar por» | select |  | «Día», «Semana», «Mes» |  |  | AnalyticsDashboard · l.271 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error cargando datos analíticos» | `!(response.ok)` | fetchAnalyticsData · l.184 |
| error | «Error cargando datos analíticos» |  | fetchAnalyticsData · l.188 |
| success | «Funcionalidad de exportación para {chartType} próximamente» |  | exportChart · l.197 |
| error | «Error exportando gráfico» |  | exportChart · l.199 |

**Charts** (2)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| LineChart | Line `lessons_completed` «Lecciones Completadas»; Line `unique_users` «Usuarios Activos» |  | AnalyticsDashboard · l.384 |
| AreaChart | Area `total_time_hours` «Total Horas»; Area `avg_time_per_user` «Promedio por Usuario» |  | AnalyticsDashboard · l.425 |

**Pieces placed here, with the texts and settings handed to them** (11)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `LoadingSkeleton` |  | `loading` |  | AnalyticsDashboard · l.206 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | AnalyticsDashboard · l.209 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | AnalyticsDashboard · l.214 |
| `CollapsibleSection` | title: Métricas Clave |  |  | AnalyticsDashboard · l.309 |
| `KPICard` | title: Usuarios Activos · subtitle: de 200 totales |  |  | AnalyticsDashboard · l.315 |
| `KPICard` | title: Tasa de Finalización · subtitle: de cursos completados |  |  | AnalyticsDashboard · l.327 |
| `KPICard` | title: Progreso Promedio · subtitle: de avance general |  |  | AnalyticsDashboard · l.339 |
| `KPICard` | title: Tiempo Promedio · subtitle: por usuario |  |  | AnalyticsDashboard · l.351 |
| `CollapsibleSection` | title: Gráficos de Análisis |  |  | AnalyticsDashboard · l.366 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsDashboard · l.390 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsDashboard · l.431 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Sem 1» | AnalyticsDashboard · l.385 |
| «Sem 2» | AnalyticsDashboard · l.386 |
| «Sem 3» | AnalyticsDashboard · l.387 |
| «Sem 4» | AnalyticsDashboard · l.388 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | AnalyticsDashboard · l.135 |

**Values shown from data** (7)

- `{title}` — KPICard · l.83
- `{value}` — KPICard · l.85
- `↑ / ↓ {Math.abs(trend.value)} %` — KPICard · l.87, when `trend`
- `{subtitle}` — KPICard · l.92, when `subtitle`
- `{icon}` — KPICard · l.95
- `{label}` — CustomTooltip · l.233, when `active && payload && payload.length`
- `{entry.name} : {entry.value}` — CustomTooltip · l.235, when `active && payload && payload.length && each payload`

**Other texts on screen** (5)

- «No se pudieron cargar los datos analíticos» — AnalyticsDashboard · l.224, when `!analyticsData`
- «Período de Tiempo» (label) — AnalyticsDashboard · l.252
- «Agrupar por» (label) — AnalyticsDashboard · l.268
- «Datos de {analyticsData.metadata?.total_users} usuarios» — AnalyticsDashboard · l.283
- «Este dashboard está listo para mostrar datos reales una vez que se implemente la API de analytics correspondiente.» — AnalyticsDashboard · l.302

### components/reports/AnalyticsVisualization.tsx

Used by: `/reports`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Tendencias de Progreso» | h3 |  | AnalyticsVisualization · l.260 |
| «Tasas por Escuela» | h3 |  | AnalyticsVisualization · l.302 |
| «Distribución de Rendimiento» | h3 |  | AnalyticsVisualization · l.335 |
| «Tendencias de Tiempo» | h3 |  | AnalyticsVisualization · l.362 |
| «Análisis de Rendimiento en Evaluaciones» | h3 |  | AnalyticsVisualization · l.404 |
| «Insights Automáticos» | h3 |  | AnalyticsVisualization · l.453 |
| «{insight.title}» | h4 | `automaticInsights.length > 0 && each automaticInsights` | AnalyticsVisualization · l.515 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Vista» | select |  | «Período Actual», «Comparación Períodos» |  |  | AnalyticsVisualization · l.187 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error de autenticación» | `!session?.access_token` | fetchAnalyticsData · l.95 |
| error | «Error al cargar datos analíticos» | `!(response.ok)` | fetchAnalyticsData · l.123 |
| error | «Error al cargar datos analíticos» |  | fetchAnalyticsData · l.127 |

**Charts** (5)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| LineChart | Line `completedLessons` «Lecciones Completadas»; Line `activeUsers` «Usuarios Activos» |  | AnalyticsVisualization · l.269 |
| BarChart | Bar `completionRate` «Tasa de Completación (%)» |  | AnalyticsVisualization · l.311 |
| BarChart | Bar `count` «Número de Estudiantes» |  | AnalyticsVisualization · l.344 |
| AreaChart | Area `totalHours` «Total Horas»; Area `avgHoursPerUser` «Promedio por Usuario» |  | AnalyticsVisualization · l.371 |
| ScatterChart | Scatter `avgScore` |  | AnalyticsVisualization · l.413 |

**Pieces placed here, with the texts and settings handed to them** (13)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | AnalyticsVisualization · l.157 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | AnalyticsVisualization · l.162 |
| `ExportDropdown` | tabName: Tendencias-Progreso |  |  | AnalyticsVisualization · l.261 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsVisualization · l.270 |
| `ExportDropdown` | tabName: Tasas-Escuela |  |  | AnalyticsVisualization · l.303 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsVisualization · l.312 |
| `XAxis` | textAnchor: end |  |  | AnalyticsVisualization · l.313 |
| `ExportDropdown` | tabName: Distribucion-Rendimiento |  |  | AnalyticsVisualization · l.336 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsVisualization · l.345 |
| `ExportDropdown` | tabName: Tendencias-Tiempo |  |  | AnalyticsVisualization · l.363 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsVisualization · l.372 |
| `ExportDropdown` | tabName: Rendimiento-Evaluaciones |  |  | AnalyticsVisualization · l.405 |
| `CartesianGrid` | strokeDasharray: 3 3 |  |  | AnalyticsVisualization · l.414 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | AnalyticsVisualization · l.109 |
| «Usuarios Activos» | AnalyticsVisualization · l.208 |
| «Tasa Completación» | AnalyticsVisualization · l.216 |
| «Tiempo Total» | AnalyticsVisualization · l.224 |

**Values shown from data** (10)

- `{label}` — CustomTooltip · l.137, when `active && payload && payload.length`
- `{entry.name} : {formatter(entry.value)} / {entry.value}` — CustomTooltip · l.139, when `active && payload && payload.length && each payload`
- `{kpi.title}` — AnalyticsVisualization · l.235, when `each [ { title: 'Usuarios Activos', current: analytics…`
- `/ {kpi.total}` — AnalyticsVisualization · l.239, when `each [ { title: 'Usuarios Activos', current: analytics… && kpi.total`
- `↗ / ↘ {Math.abs(kpi.trend).toFixed(1)} %` — AnalyticsVisualization · l.241, when `each [ { title: 'Usuarios Activos', current: analytics…`
- `{kpi.icon}` — AnalyticsVisualization · l.247, when `each [ { title: 'Usuarios Activos', current: analytics…`
- `{iconSvgs[insight.type]}` — AnalyticsVisualization · l.509, when `automaticInsights.length > 0 && each automaticInsights`
- `{insight.metric.toFixed(1)} %` — AnalyticsVisualization · l.517, when `automaticInsights.length > 0 && each automaticInsights && insight.metric !== undefined && insight.metric !== null`
- `{insight.message}` — AnalyticsVisualization · l.522, when `automaticInsights.length > 0 && each automaticInsights`
- `💡 {insight.recommendation}` — AnalyticsVisualization · l.526, when `automaticInsights.length > 0 && each automaticInsights && insight.recommendation`

**Other texts on screen** (10)

- «No se pudieron cargar los datos analíticos» — AnalyticsVisualization · l.172, when `!analyticsData`
- «Vista» (label) — AnalyticsVisualization · l.184
- «Datos de {analyticsData.metadata?.timeRange} días • {analyticsData.kpiData.current.total…} usuarios» — AnalyticsVisualization · l.198
- «Usuario: {data.userId}» — AnalyticsVisualization · l.432, when `active && payload && payload.length`
- «Evaluaciones: {data.quizzesCompleted}» — AnalyticsVisualization · l.433, when `active && payload && payload.length`
- «Puntaje Promedio: {data.avgScore} %» — AnalyticsVisualization · l.434, when `active && payload && payload.length`
- «Tiempo Promedio: {data.timeSpent} min» — AnalyticsVisualization · l.435, when `active && payload && payload.length`
- «Tendencia: + {data.improvementTrend} %» — AnalyticsVisualization · l.436, when `active && payload && payload.length`
- «Generando insights basados en datos...» — AnalyticsVisualization · l.541, when `!(automaticInsights.length > 0)`
- «Los insights aparecerán cuando haya suficientes datos» — AnalyticsVisualization · l.542, when `!(automaticInsights.length > 0)`

### components/reports/CollapsibleSection.tsx

Used by: `/detailed-reports`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | CollapsibleSection · l.43 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.button` | «[{icon}] {title} [{badge}]» | `{onToggle}` |  | CollapsibleSection · l.32 |

**Values shown from data** (3)

- `{icon}` — CollapsibleSection · l.39, when `icon`
- `{badge}` — CollapsibleSection · l.45, when `badge`
- `{children}` — CollapsibleSection · l.71, when `isExpanded`

### components/reports/ConsultantIndicator.tsx

Used by: `/reports`

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Monitoreo» | ConsultantIndicator · l.39 |
| «Mentoría» | ConsultantIndicator · l.45 |
| «Evaluación» | ConsultantIndicator · l.51 |
| «Apoyo» | ConsultantIndicator · l.57 |
| «Consultoría» | ConsultantIndicator · l.63 |

**Values shown from data** (1)

- `{typeConfig.icon}` — ConsultantIndicator · l.79

**Other texts on screen** (2)

- «Sin Consultor» — ConsultantIndicator · l.29, when `!hasConsultant`
- «(Inactivo)» — ConsultantIndicator · l.83, when `!isActive`

### components/reports/EnhancedTable.tsx

Used by: `/reports`

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Anterior» | `{() => goToPage(currentPage - 1)}` | `totalPages > 1` · screen size: `sm:hidden` | `{currentPage === 1}` |  | EnhancedTable · l.213 |
| «Siguiente» | `{() => goToPage(currentPage + 1)}` | `totalPages > 1` · screen size: `sm:hidden` | `{currentPage === totalPages}` |  | EnhancedTable · l.220 |
|  | `{() => goToPage(currentPage - 1)}` | `totalPages > 1` · screen size: `hidden sm:flex` | `{currentPage === 1}` |  | EnhancedTable · l.241 |
| «{page}» | `{() => goToPage(page)}` | `totalPages > 1` · screen size: `hidden sm:flex` |  |  | EnhancedTable · l.265 |
|  | `{() => goToPage(currentPage + 1)}` | `totalPages > 1` · screen size: `hidden sm:flex` | `{currentPage === totalPages}` |  | EnhancedTable · l.279 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `tr` | «{column.render(getNestedValue(row, c…} / {String(getNestedValue(row, column.k…}» | `{() => onRowClick?.(row)}` | `paginatedData.length > 0 && each paginatedData` | EnhancedTable · l.181 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{searchPlaceholder}» | text | «{searchPlaceholder}» |  | `searchable` |  | EnhancedTable · l.141 |

**Table columns** (1)

| Text | Shown when | Where |
|---|---|---|
| «{column.label} [{getSortIcon(column.key)}]» | `each columns` | EnhancedTable · l.163 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Buscar...» | EnhancedTable · l.25 |

**Values shown from data** (4)

- `{column.render(getNestedValue(row, c…} / {String(getNestedValue(row, column.k…}` — EnhancedTable · l.189, when `paginatedData.length > 0 && each paginatedData && each columns`
- `{(currentPage - 1) * pageSize + 1}` — EnhancedTable · l.232, when `totalPages > 1`, screen size: `hidden sm:flex`
- `{Math.min(currentPage * pageSize, so…}` — EnhancedTable · l.233, when `totalPages > 1`, screen size: `hidden sm:flex`
- `{sortedData.length}` — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`

**Other texts on screen** (6)

- «Mostrando {sortedData.length} de {data.length} registros» — EnhancedTable · l.150, when `searchable && searchTerm`
- «No se encontraron resultados / No hay datos disponibles» — EnhancedTable · l.199, when `!(paginatedData.length > 0)`
- «Mostrando» — EnhancedTable · l.231, when `totalPages > 1`, screen size: `hidden sm:flex`
- «a» — EnhancedTable · l.232, when `totalPages > 1`, screen size: `hidden sm:flex`
- «de» — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`
- «resultados» — EnhancedTable · l.236, when `totalPages > 1`, screen size: `hidden sm:flex`

### components/reports/ExportDropdown.tsx

Used by: `/reports`

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

### components/reports/LearningPathAnalytics.tsx

Used by: `/reports`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Rendimiento por Ruta de Aprendizaje» | h3 | `ratedPaths.length > 0` | LearningPathAnalytics · l.216 |
| «Rutas sin población asignada» | h3 | `unratedPaths.length > 0` | LearningPathAnalytics · l.241 |
| «Tendencias de Completación (Últimos {dateRange} días)» | h3 | `data.completionTrends.length > 0` | LearningPathAnalytics · l.258 |
| «Rutas con Bajo Rendimiento» | h4 | `data.lowPerformingPaths.length > 0` | LearningPathAnalytics · l.281 |
| «Progresión por Curso» | h3 | `data.courseProgression.length > 0` | PathSpecificView · l.332 |

**Charts** (2)

| Chart | Series | Shown when | Where |
|---|---|---|---|
| BarChart | Bar `completionRate` «Tasa de Completación (%)» | `ratedPaths.length > 0` | LearningPathAnalytics · l.220 |
| LineChart | Line `completions` «Completaciones de curso»; Line `enrollments` «Nuevas asignaciones» | `data.completionTrends.length > 0` | LearningPathAnalytics · l.262 |

**Pieces placed here, with the texts and settings handed to them** (15)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SummaryCard` | title: Rutas Totales |  |  | LearningPathAnalytics · l.167 |
| `SummaryCard` | title: Usuarios Asignados |  |  | LearningPathAnalytics · l.168 |
| `SummaryCard` | title: Completados |  |  | LearningPathAnalytics · l.169 |
| `SummaryCard` | title: Tasa Promedio |  |  | LearningPathAnalytics · l.170 |
| `SummaryCard` | title: Tiempo Total |  |  | LearningPathAnalytics · l.178 |
| `SummaryCard` | title: En riesgo |  |  | LearningPathAnalytics · l.185 |
| `CartesianGrid` | strokeDasharray: 3 3 | `ratedPaths.length > 0` |  | LearningPathAnalytics · l.221 |
| `XAxis` | textAnchor: end | `ratedPaths.length > 0` |  | LearningPathAnalytics · l.224 |
| `Legend` | verticalAlign: top | `ratedPaths.length > 0` |  | LearningPathAnalytics · l.232 |
| `CartesianGrid` | strokeDasharray: 3 3 | `data.completionTrends.length > 0` |  | LearningPathAnalytics · l.263 |
| `SummaryCard` | title: Usuarios Asignados |  |  | PathSpecificView · l.305 |
| `SummaryCard` | title: Completados |  |  | PathSpecificView · l.306 |
| `SummaryCard` | title: Tasa de Completación |  |  | PathSpecificView · l.307 |
| `SummaryCard` | title: Tiempo Promedio |  |  | PathSpecificView · l.315 |
| `SummaryCard` | title: En riesgo |  |  | PathSpecificView · l.316 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `UNAVAILABLE` | «No disponible» | l.56 |
| `AT_RISK_HINT` | «Sin actividad en 14 días y sin terminar la ruta» | l.57 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Las analíticas de rutas de aprendizaje están temporalmente no disponibles.» | LearningPathAnalytics · l.98 |
| «Error de conexión» | LearningPathAnalytics · l.113 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (15)

| Kind | What | Where |
|---|---|---|
| mark | `testid=lp-analytics-loading` | LearningPathAnalytics · l.123 |
| mark | `testid=lp-analytics-denied` | LearningPathAnalytics · l.132 |
| mark | `testid=lp-analytics-error` | LearningPathAnalytics · l.143 |
| mark | `testid=lp-analytics-summary` | LearningPathAnalytics · l.166 |
| mark | `testid=lp-analytics-empty` | LearningPathAnalytics · l.197 |
| mark | `testid=lp-analytics-empty` | LearningPathAnalytics · l.205 |
| mark | `testid=lp-analytics-performance-chart` | LearningPathAnalytics · l.215 |
| mark | `testid=lp-analytics-unrated` | LearningPathAnalytics · l.240 |
| mark | `testid=lp-analytics-trends` | LearningPathAnalytics · l.257 |
| mark | `testid=lp-analytics-low-performing` | LearningPathAnalytics · l.277 |
| mark | `testid=lp-analytics-path` | PathSpecificView · l.303 |
| mark | `testid=lp-analytics-summary` | PathSpecificView · l.304 |
| mark | `testid=lp-analytics-empty` | PathSpecificView · l.326 |
| mark | `testid={testId}` | SummaryCard · l.363 |
| mark | `testid={testId ? '${testId}-hint' : undefined}` | SummaryCard · l.364 |

**Values shown from data** (7)

- `{state.relation}` — LearningPathAnalytics · l.148, when `state.kind === 'error' && state.relation`
- `{p.pathName}` — LearningPathAnalytics · l.248, when `unratedPaths.length > 0 && each unratedPaths`
- `{path.pathName}` — LearningPathAnalytics · l.288, when `data.lowPerformingPaths.length > 0 && each data.lowPerformingPaths`
- `{title}` — SummaryCard · l.362
- `{value}` — SummaryCard · l.363
- `{hint}` — SummaryCard · l.364, when `hint`
- `{icon}` — SummaryCard · l.366

**Other texts on screen** (13)

- «Las analíticas de rutas de aprendizaje están disponibles solo para administración, consultores y equipo directivo.» — LearningPathAnalytics · l.135, when `state.kind === 'denied'`
- «Error al cargar analíticas: {state.message}» — LearningPathAnalytics · l.147, when `state.kind === 'error'`
- «(consulta fallida:» — LearningPathAnalytics · l.148, when `state.kind === 'error' && state.relation`
- «Sin rutas de aprendizaje registradas: no hay datos que analizar en este período.» — LearningPathAnalytics · l.200, when `data.summary.totalPaths === 0`
- «Tasa promedio no disponible: ninguna ruta tiene usuarios asignados todavía.» — LearningPathAnalytics · l.208, when `data.summary.totalPaths > 0 && data.summary.averageCompletionRate === null`
- «La tasa de completación no está definida para una ruta sin usuarios asignados; no se muestra como 0.» — LearningPathAnalytics · l.243, when `unratedPaths.length > 0`
- «(sin población asignada)» — LearningPathAnalytics · l.248, when `unratedPaths.length > 0 && each unratedPaths`
- «Las siguientes rutas tienen tasas de completación inferiores al 40%:» — LearningPathAnalytics · l.283, when `data.lowPerformingPaths.length > 0`
- «completación (» — LearningPathAnalytics · l.288, when `data.lowPerformingPaths.length > 0 && each data.lowPerformingPaths`
- «usuarios asignados)» — LearningPathAnalytics · l.288, when `data.lowPerformingPaths.length > 0 && each data.lowPerformingPaths`
- «Esta ruta no tiene usuarios asignados: las tasas no están disponibles.» — PathSpecificView · l.327, when `data.pathInfo.totalAssignedUsers === 0`
- «{c.courseName} / Curso sin título» — PathSpecificView · l.336, when `data.courseProgression.length > 0 && each data.courseProgression`
- «usuarios alcanzados · alcance» — PathSpecificView · l.336, when `data.courseProgression.length > 0 && each data.courseProgression`

### components/reports/MobileUserCard.tsx

Used by: `/detailed-reports`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{user.user_name}» | h3 |  | MobileUserCard · l.47 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver Detalles» | `{() => onUserClick(user.user_id)}` |  |  |  | MobileUserCard · l.53 |

**Values shown from data** (9)

- `{user.user_email}` — MobileUserCard · l.48
- `{user.user_role}` — MobileUserCard · l.49
- `{user.school_name}` — MobileUserCard · l.67, when `((user.school_name \|\| user.generation_name \|\| user.community_name)) && user.school_name`
- `{user.generation_name}` — MobileUserCard · l.73, when `((user.school_name \|\| user.generation_name \|\| user.community_name)) && user.generation_name`
- `{user.community_name}` — MobileUserCard · l.79, when `((user.school_name \|\| user.generation_name \|\| user.community_name)) && user.community_name`
- `{user.completion_percentage} %` — MobileUserCard · l.89
- `{user.total_courses_enrolled}` — MobileUserCard · l.118
- `{formatTime(user.total_time_spent_mi…}` — MobileUserCard · l.126
- `{formatDate(user.last_activity_date)}` — MobileUserCard · l.141

**Other texts on screen** (9)

- «Progreso General» — MobileUserCard · l.88
- «{user.total_lessons_completed} lecciones completadas» — MobileUserCard · l.98
- «⚠️ Revisar» — MobileUserCard · l.104, when `user.engagement_quality === 'passive'`
- «✓ Activo» — MobileUserCard · l.109, when `user.engagement_quality === 'high'`
- «Cursos Inscritos» — MobileUserCard · l.119
- «{user.completed_courses} completados • {user.courses_in_progress} en progreso» — MobileUserCard · l.120
- «Tiempo Total» — MobileUserCard · l.129
- «Quiz: {user.average_quiz_score} %» — MobileUserCard · l.131, when `user.average_quiz_score`
- «Última actividad:» — MobileUserCard · l.140

### components/reports/StatusBadge.tsx

Used by: `/reports`

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Excelente» | StatusBadge · l.24 |
| «Bueno» | StatusBadge · l.31 |
| «Regular» | StatusBadge · l.38 |
| «Bajo» | StatusBadge · l.45 |

**Values shown from data** (3)

- `{config.icon}` — StatusBadge · l.68, when `showProgress`
- `{percentage} %` — StatusBadge · l.69, when `showProgress`
- `{config.icon}` — StatusBadge · l.86

### components/reports/UserDetailModal.tsx

Used by: `/detailed-reports`, `/reports`

**Titles** (11)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{userDetails.basic_info.firs…} {userDetails.basic_info.last…} / Detalles del Usuario» | h2 |  | UserDetailModal · l.210 |
| «Información Personal» | h3 | `!(loading) && userDetails && activeTab === 'overview'` | UserDetailModal · l.309 |
| «Actividad Reciente» | h3 | `!(loading) && userDetails && activeTab === 'overview'` | UserDetailModal · l.352 |
| «Progreso de Cursos» | h3 | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.381 |
| «Resultados de Evaluaciones» | h3 | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.435 |
| «Historial de Actividad» | h3 | `!(loading) && userDetails && activeTab === 'activity'` | UserDetailModal · l.484 |
| «Lecciones Completadas» | h3 | `!(loading) && userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0` | UserDetailModal · l.513 |
| «Asignaciones de Consultoría» | h3 | `!(loading) && userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0` | UserDetailModal · l.557 |
| «{assignment.consultant.first_name} {assignment.consultant.last_name}» | h4 | `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments` | UserDetailModal · l.565 |
| «Sin Asignaciones de Consultoría» | h3 | `!(loading) && userDetails && activeTab === 'consultants' && !(userDetails.consultant_assignments.length > 0)` | UserDetailModal · l.609 |
| «Error al Cargar Datos» | h3 | `!(loading) && !(userDetails)` | UserDetailModal · l.624 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{onClose}` |  |  |  | UserDetailModal · l.222 |
| «{tab.icon} {tab.label}» | `{() => setActiveTab(tab.id)}` | `!(loading) && userDetails && each [ { id: 'overview', label: 'Resumen', icon: '📊' …` |  |  | UserDetailModal · l.286 |
| «Cerrar» | `{onClose}` |  |  |  | UserDetailModal · l.633 |

**Table columns** (14)

| Text | Shown when | Where |
|---|---|---|
| «Curso» | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.387 |
| «Nivel» | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.388 |
| «Progreso» | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.389 |
| «Última Visita» | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.390 |
| «Inscrito» | `!(loading) && userDetails && activeTab === 'courses'` | UserDetailModal · l.391 |
| «Lección» | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.441 |
| «Curso» | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.442 |
| «Puntaje» | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.443 |
| «Porcentaje» | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.444 |
| «Fecha» | `!(loading) && userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0` | UserDetailModal · l.445 |
| «Lección» | `!(loading) && userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0` | UserDetailModal · l.519 |
| «Curso» | `!(loading) && userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0` | UserDetailModal · l.520 |
| «Tiempo» | `!(loading) && userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0` | UserDetailModal · l.521 |
| «Completado» | `!(loading) && userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0` | UserDetailModal · l.522 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{userDetails.basic_info.firs…} {userDetails.basic_info.last…} / Detalles del Usuario» | written in this file |  |  | UserDetailModal · l.204 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar detalles del usuario» | `!(response.ok)` | fetchUserDetails · l.152 |
| error | «Error al cargar detalles del usuario» |  | fetchUserDetails · l.156 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | UserDetailModal · l.201 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 4 })` |  | UserDetailModal · l.239 |
| `LoadingSkeleton` |  | `loading` |  | UserDetailModal · l.242 |
| `LoadingSkeleton` |  | `loading` |  | UserDetailModal · l.243 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `roleMap` | «Administrador», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Consultor», «Docente» | getRoleDisplayName · l.180 |
| `typeMap` | «Monitoreo», «Mentoría», «Evaluación», «Apoyo» | getAssignmentTypeDisplayName · l.192 |
| `formatTime()` | «0h 0m» | formatTime · l.163 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Resumen» | UserDetailModal · l.281 |
| «Consultorías» | UserDetailModal · l.284 |

**Values shown from data** (29)

- `{getRoleDisplayName(userDetails.basi…} • {userDetails.basic_info.email}` — UserDetailModal · l.217, when `userDetails?.basic_info`
- `{userDetails.summary.total_courses}` — UserDetailModal · l.251, when `!(loading) && userDetails`
- `{userDetails.summary.completed_cours…}` — UserDetailModal · l.257, when `!(loading) && userDetails`
- `{formatPercentage(userDetails.summar…}` — UserDetailModal · l.263, when `!(loading) && userDetails`
- `{formatTime(userDetails.summary.tota…}` — UserDetailModal · l.269, when `!(loading) && userDetails`
- `{userDetails.basic_info.first_name} {userDetails.basic_info.last_name}` — UserDetailModal · l.313, when `!(loading) && userDetails && activeTab === 'overview'`
- `{userDetails.basic_info.email}` — UserDetailModal · l.317, when `!(loading) && userDetails && activeTab === 'overview'`
- `{getRoleDisplayName(userDetails.basi…}` — UserDetailModal · l.321, when `!(loading) && userDetails && activeTab === 'overview'`
- `{userDetails.basic_info.phone}` — UserDetailModal · l.326, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.phone`
- `{userDetails.basic_info.schools.name}` — UserDetailModal · l.332, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.schools`
- `{userDetails.basic_info.generations.…}` — UserDetailModal · l.338, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.generations`
- `{userDetails.basic_info.growth_commu…}` — UserDetailModal · l.344, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.growth_communities`
- `{activity.description}` — UserDetailModal · l.357, when `!(loading) && userDetails && activeTab === 'overview' && each userDetails.recent_activity.slice(0, 5)`
- `{new Date(activity.completed_at \|\| a…}` — UserDetailModal · l.358, when `!(loading) && userDetails && activeTab === 'overview' && each userDetails.recent_activity.slice(0, 5)`
- `{formatPercentage(course.completion_…}` — UserDetailModal · l.413, when `!(loading) && userDetails && activeTab === 'courses' && each userDetails.course_progress`
- `{new Date(course.enrolled_at).toLoca…}` — UserDetailModal · l.421, when `!(loading) && userDetails && activeTab === 'courses' && each userDetails.course_progress`
- `{quiz.score} / {quiz.max_score}` — UserDetailModal · l.458, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- `{formatPercentage(quiz.percentage_sc…}` — UserDetailModal · l.462, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- `{new Date(quiz.attempted_at).toLocal…}` — UserDetailModal · l.466, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- `✓ / ?` — UserDetailModal · l.490, when `!(loading) && userDetails && activeTab === 'activity' && each userDetails.recent_activity`
- `{activity.description}` — UserDetailModal · l.498, when `!(loading) && userDetails && activeTab === 'activity' && each userDetails.recent_activity`
- `{new Date(activity.completed_at \|\| a…}` — UserDetailModal · l.499, when `!(loading) && userDetails && activeTab === 'activity' && each userDetails.recent_activity`
- `{formatTime(lesson.time_spent_minute…}` — UserDetailModal · l.535, when `userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0 && each userDetails.lesson_completions.slice(0, 10)`
- `{new Date(lesson.completed_at).toLoc…}` — UserDetailModal · l.538, when `userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0 && each userDetails.lesson_completions.slice(0, 10)`
- `{assignment.consultant.email}` — UserDetailModal · l.568, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- `{getAssignmentTypeDisplayName(assign…}` — UserDetailModal · l.581, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- `{new Date(assignment.start_date).toL…}` — UserDetailModal · l.585, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- `{new Date(assignment.end_date).toLoc…}` — UserDetailModal · l.589, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- `{assignment.notes}` — UserDetailModal · l.594, when `activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments && assignment.notes`

**Other texts on screen** (27)

- «Cursos Inscritos» — UserDetailModal · l.254, when `!(loading) && userDetails`
- «Cursos Completados» — UserDetailModal · l.260, when `!(loading) && userDetails`
- «Tasa Promedio» — UserDetailModal · l.266, when `!(loading) && userDetails`
- «Tiempo Total» — UserDetailModal · l.272, when `!(loading) && userDetails`
- «Nombre Completo:» — UserDetailModal · l.312, when `!(loading) && userDetails && activeTab === 'overview'`
- «Email:» — UserDetailModal · l.316, when `!(loading) && userDetails && activeTab === 'overview'`
- «Rol:» — UserDetailModal · l.320, when `!(loading) && userDetails && activeTab === 'overview'`
- «Teléfono:» — UserDetailModal · l.325, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.phone`
- «Escuela:» — UserDetailModal · l.331, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.schools`
- «Generación:» — UserDetailModal · l.337, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.generations`
- «Comunidad:» — UserDetailModal · l.343, when `!(loading) && userDetails && activeTab === 'overview' && userDetails.basic_info.growth_communities`
- «Lección / Quiz» — UserDetailModal · l.362, when `!(loading) && userDetails && activeTab === 'overview' && each userDetails.recent_activity.slice(0, 5)`
- «{course.courses?.title} / Curso no encontrado» — UserDetailModal · l.398, when `!(loading) && userDetails && activeTab === 'courses' && each userDetails.course_progress`
- «{course.courses?.difficulty_level} / Sin nivel» — UserDetailModal · l.401, when `!(loading) && userDetails && activeTab === 'courses' && each userDetails.course_progress`
- «{new Date(course.last_accessed).toLo…} / Nunca» — UserDetailModal · l.418, when `!(loading) && userDetails && activeTab === 'courses' && each userDetails.course_progress`
- «{quiz.lessons?.title} / Lección no encontrada» — UserDetailModal · l.452, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- «{quiz.lessons?.modules?.title} / Módulo no encontrado» — UserDetailModal · l.453, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- «{quiz.lessons?.modules?.courses?.tit…} / Curso no encontrado» — UserDetailModal · l.455, when `userDetails && activeTab === 'courses' && userDetails.quiz_results.length > 0 && each userDetails.quiz_results.slice(0, 10)`
- «{lesson.lessons?.title} / Lección no encontrada» — UserDetailModal · l.529, when `userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0 && each userDetails.lesson_completions.slice(0, 10)`
- «Orden: {lesson.lessons?.order_index} / N/A» — UserDetailModal · l.530, when `userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0 && each userDetails.lesson_completions.slice(0, 10)`
- «{lesson.lessons?.modules?.courses?.t…} / Curso no encontrado» — UserDetailModal · l.532, when `userDetails && activeTab === 'activity' && userDetails.lesson_completions.length > 0 && each userDetails.lesson_completions.slice(0, 10)`
- «Activo / Inactivo» — UserDetailModal · l.570, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- «Tipo:» — UserDetailModal · l.580, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- «Inicio:» — UserDetailModal · l.584, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- «Fin:» — UserDetailModal · l.588, when `userDetails && activeTab === 'consultants' && userDetails.consultant_assignments.length > 0 && each userDetails.consultant_assignments`
- «Este usuario no tiene consultores asignados actualmente.» — UserDetailModal · l.610, when `!(loading) && userDetails && activeTab === 'consultants' && !(userDetails.consultant_assignments.length > 0)`
- «No se pudieron cargar los detalles del usuario.» — UserDetailModal · l.625, when `!(loading) && !(userDetails)`

### hooks/useDebounce.ts

Used by: `/detailed-reports`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, delay)` | useDebounce · l.7 |

### lib/colorAlpha.ts

Used by: `/detailed-reports`, `/reports`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «withAlpha expects two hex characters, got "{hh}"» | `throw (shown by whoever catches it)` | `!TWO_HEX.test(hh)` | alphaFromHex · l.19 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `withAlpha()` | «rgb({named[1]} / {alpha})» | withAlpha · l.26 |

### lib/exportUtils.ts

Used by: `/reporte-horas`, `/reports`

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

### lib/types/hour-tracking.types.ts

Used by: `/reporte-horas`

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Detalle parcial: se muestran las 500 sesiones más recientes de esta categoría.» | PARTIAL_SESSION_DETAIL_NOTICE · l.338 |
| «Hay sesiones anteriores no incluidas. Los totales de horas corresponden al registro» | PARTIAL_SESSION_DETAIL_NOTICE · l.339 |

### types/roles.ts

Used by: `/detailed-reports`, `/reporte-horas`, `/reports`

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

### utils/insightGenerator.ts

Used by: `/reports`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `mainTrend` | «participación / completación» | generateTrendInsights · l.114 |
| `problemArea` | «participación / completación» | generateTrendInsights · l.127 |

**Other texts written in the code (safety net: not tied to an element by the script)** (40)

| Text | Where |
|---|---|
| «Excelente Rendimiento» | InsightGenerator · l.67 |
| «Buen Rendimiento» | InsightGenerator · l.76 |
| «Continuar con estrategias actuales y apoyar a usuarios con menor rendimiento» | InsightGenerator · l.79 |
| «Rendimiento Requiere Atención» | InsightGenerator · l.93 |
| «Implementar sesiones de apoyo y seguimiento personalizado» | InsightGenerator · l.96 |
| «Tendencia Positiva» | InsightGenerator · l.119 |
| «La {mainTrend} muestra una mejora del {trendValue.toFixed(1)}% respecto al período anterior» | InsightGenerator · l.120 |
| «Tendencia Decreciente» | InsightGenerator · l.132 |
| «La {problemArea} ha disminuido {Math.abs(trendValue).toFixe…}% en las últimas semanas» | InsightGenerator · l.133 |
| «Investigar causas de la disminución en {problemArea} y tomar acciones correctivas» | InsightGenerator · l.135 |
| «Mejora en Engagement» | InsightGenerator · l.143 |
| «Aceleración en Completación» | InsightGenerator · l.162 |
| «Las completaciones de lecciones han aumentado significativamente en las últimas semanas» | InsightGenerator · l.163 |
| «Alta Participación» | InsightGenerator · l.187 |
| «Baja Participación» | InsightGenerator · l.194 |
| «Solo {engagementRate.toFixed(1)}% de usuarios han estado activos» | InsightGenerator · l.195 |
| «Implementar estrategias de reactivación y comunicación directa» | InsightGenerator · l.197 |
| «Excelente Tasa de Completación» | InsightGenerator · l.205 |
| «La tasa promedio de completación es del {avgCompletionRate.toFixed(1)}%» | InsightGenerator · l.206 |
| «Completación Crítica» | InsightGenerator · l.212 |
| «La tasa de completación promedio es solo del {avgCompletionRate.toFixed(1)}%» | InsightGenerator · l.213 |
| «Revisar dificultad del contenido y proporcionar más apoyo» | InsightGenerator · l.215 |
| «Dedicación de Tiempo Adecuada» | InsightGenerator · l.234 |
| «Los usuarios dedican en promedio {avgTimePerUser.toFixed(1)} horas por período» | InsightGenerator · l.235 |
| «Tiempo de Estudio Insuficiente» | InsightGenerator · l.241 |
| «Motivar mayor dedicación de tiempo y facilitar acceso a contenidos» | InsightGenerator · l.244 |
| «Incremento en Tiempo de Estudio» | InsightGenerator · l.259 |
| «El tiempo total de estudio aumentó {timeChange.toFixed(1)}% esta semana» | InsightGenerator · l.260 |
| «Disminución en Tiempo de Estudio» | InsightGenerator · l.266 |
| «El tiempo de estudio disminuyó {Math.abs(timeChange).toFixe…}% esta semana» | InsightGenerator · l.267 |
| «Investigar barreras y proporcionar flexibilidad en horarios» | InsightGenerator · l.269 |
| «Escuela Destacada» | InsightGenerator · l.299 |
| «{topSchool.name} lidera con {topSchool.completionRate}% de completación» | InsightGenerator · l.300 |
| «Analizar y replicar mejores prácticas de esta escuela» | InsightGenerator · l.302 |
| «Escuela Requiere Apoyo» | InsightGenerator · l.310 |
| «{bottomSchool.name} tiene solo {bottomSchool.completionRate}% de completación» | InsightGenerator · l.311 |
| «Proporcionar apoyo especializado y recursos adicionales» | InsightGenerator · l.313 |
| «Disparidad Entre Escuelas» | InsightGenerator · l.325 |
| «Existe una brecha de {gap.toFixed(1)}% entre la mejor y peor escuela» | InsightGenerator · l.326 |
| «Implementar programa de nivelación y intercambio de experiencias» | InsightGenerator · l.328 |

### utils/reportFilters.ts

Used by: `/detailed-reports`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getReportScopeDescription()` | «Vista global de toda la plataforma», «Estudiantes bajo tu supervisión», «Escuelas de tu red asignada», «Todos los usuarios de tu escuela», «Usuarios de tu generación», «Miembros de tu comunidad de crecimiento», «Sin acceso a reportes» | getReportScopeDescription · l.141 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Vista global de toda la plataforma» | getReportScopeDescription · l.141 |
| «Estudiantes bajo tu supervisión» | getReportScopeDescription · l.143 |
| «Escuelas de tu red asignada» | getReportScopeDescription · l.145 |
| «Todos los usuarios de tu escuela» | getReportScopeDescription · l.147 |
| «Usuarios de tu generación» | getReportScopeDescription · l.149 |
| «Miembros de tu comunidad de crecimiento» | getReportScopeDescription · l.151 |
| «Sin acceso a reportes» | getReportScopeDescription · l.153 |

### utils/roleUtils.ts

Used by: `/detailed-reports`, `/reporte-horas`, `/reports`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/reports/analytics-data` | `pages/api/reports/analytics-data.ts` | GET | `/detailed-reports`, `/reports` | `components/reports/AnalyticsDashboard.tsx`, `components/reports/AnalyticsVisualization.tsx` |
| `/api/reports/community` | `pages/api/reports/community.ts` | GET | `/reports` | `pages/reports.tsx`, `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts` |
| `/api/reports/course-analytics` | `pages/api/reports/course-analytics.ts` | GET | `/reports` | `pages/reports.tsx` |
| `/api/reports/detailed` | `pages/api/reports/detailed.ts` | POST | `/detailed-reports` | `__tests__/api/reports/forged-session.test.ts`, `pages/detailed-reports.tsx` |
| `/api/reports/filter-options` | `pages/api/reports/filter-options.ts` | GET | `/admin/assignment-matrix`, `/detailed-reports`, `/reports` | `__tests__/api/reports/forged-session.test.ts`, `components/admin/assignment-matrix/BatchAssignModal.tsx`, `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts`, `components/reports/AdvancedFilters.tsx` |
| `/api/reports/overview` | `pages/api/reports/overview.ts` | GET | `/reports` | `__tests__/api/reports/overview-learning-path-gate.test.ts`, `pages/reports.tsx`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/reports/school` | `pages/api/reports/school.ts` | GET | `/reports` | `pages/reports.tsx`, `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts` |
| `/api/reports/user-details` | `pages/api/reports/user-details.ts` | GET | `/detailed-reports`, `/reports` | `__tests__/api/reports/forged-session.test.ts`, `components/reports/UserDetailModal.tsx` |
| `/api/school-hours-report/[school_id]` | `pages/api/school-hours-report/[school_id]/index.ts` | GET | `/reporte-horas` | `__tests__/api/hour-tracking/school-report.test.ts`, `__tests__/components/hours/SchoolHoursReport.export-scope.test.tsx`, `components/hours/SchoolHoursReport.tsx`, `tests/e2e/finance-messaging-access.spec.ts` |
| `/api/school-hours-report/[school_id]/pdf` | `pages/api/school-hours-report/[school_id]/pdf.ts` | GET | `/reporte-horas` | `__tests__/api/hour-tracking/school-report-contract-export.test.ts`, `__tests__/api/hour-tracking/school-report-pdf.test.ts`, `__tests__/api/hour-tracking/school-report-totals.test.ts`, `__tests__/components/hours/SchoolHoursReport.export-scope.test.tsx`, `components/hours/SchoolHoursReport.tsx` +1 |

