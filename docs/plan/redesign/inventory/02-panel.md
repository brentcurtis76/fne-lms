# Panel (Mi Panel)

Area `02-panel`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `58b8d169f` (2026-11-12).

3 screen files, 6 API files, 36 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/new-reporting` | `pages/admin/new-reporting.tsx` | 205 | — | Leftover (on the list for Brent) |
| `/dashboard-old` | `pages/dashboard-old.tsx` | 115 | — | Leftover (on the list for Brent) |
| `/dashboard` | `pages/dashboard.tsx` | 1094 | Mi Panel |  |

## /admin/new-reporting

File `pages/admin/new-reporting.tsx` · 205 lines · frame: MainLayout

**Leftover (on the list for Brent)** — «Vista Previa: Nuevo Dashboard de Reportes»: a preview of a reports dashboard that was never linked. The only user of components/dashboard/unified. Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.22 `router.push → /login  (when !user)`
  - l.27 `role = await getUserPrimaryRole(user.id)`
  - l.30 `allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red']`
  - l.87 `router.push → /dashboard  (when error)`
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h2 | `error` | NewReportingPreview · l.80 |
| «Vista Previa: Nuevo Dashboard de Reportes» | h1 |  | NewReportingPreview · l.106 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Dashboard» | `{() => router.push('/dashboard')}` | `error` |  |  | NewReportingPreview · l.86 |
| «Ver reportes actuales» | `{() => router.push('/reports')}` |  |  |  | NewReportingPreview · l.118 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No tienes permisos para acceder a los reportes» | `setError` | `!role \|\| !allowedRoles.includes(role)` | loadUserData · l.32 |
| «Error al cargar los datos del usuario» | `setError` |  | loadUserData · l.39 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | loadUserData · l.22 |
| `/dashboard` | `router.push` | `error` | NewReportingPreview · l.87 |
| `/reports` | `router.push` |  | NewReportingPreview · l.119 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(user.id)` | loadUserData · l.27 |
| `allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red']` | loadUserData · l.30 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | NewReportingPreview · l.51 |
| `LoadingSkeleton` |  | `loading` |  | NewReportingPreview · l.55 |
| `LoadingSkeleton` |  | `loading` |  | NewReportingPreview · l.56 |
| `LoadingSkeleton` |  | `loading && each Array.from({ length: 6 })` |  | NewReportingPreview · l.61 |
| `MainLayout` |  | `error` |  | NewReportingPreview · l.76 |
| `MainLayout` |  |  |  | NewReportingPreview · l.100 |
| `UnifiedDashboard` |  |  |  | NewReportingPreview · l.129 |

**Values shown from data** (1)

- `{error}` — NewReportingPreview · l.83, when `error`

**Other texts on screen** (34)

- «Esta es una vista previa del sistema de reportes rediseñado. Incluye analytics colaborativos y diseño basado en tarjetas modulares.» — NewReportingPreview · l.110
- «Rol: {userRole}» — NewReportingPreview · l.115
- «Características implementadas:» — NewReportingPreview · l.143
- «• Dashboard unificado con API consolidada» — NewReportingPreview · l.145
- «• Tarjetas modulares con divulgación progresiva» — NewReportingPreview · l.146
- «• Analytics de espacios colaborativos en tiempo real» — NewReportingPreview · l.147
- «• Filtros avanzados con sugerencias inteligentes» — NewReportingPreview · l.148
- «• Diseño responsivo optimizado para móviles» — NewReportingPreview · l.149
- «• Personalización basada en roles de usuario» — NewReportingPreview · l.150
- «Rendimiento objetivo:» — NewReportingPreview · l.154
- «• Comprensión en 5 segundos ✅» — NewReportingPreview · l.156
- «• Carga de tarjetas KPI: &lt;100ms ✅» — NewReportingPreview · l.157
- «• Dashboard completo: &lt;500ms ✅» — NewReportingPreview · l.158
- «• Diseño móvil responsivo ✅» — NewReportingPreview · l.159
- «📋 Notas de Desarrollo (Click para ver)» (label) — NewReportingPreview · l.167
- «Estado de implementación:» — NewReportingPreview · l.171
- «✅ API unificada funcionando con datos reales» — NewReportingPreview · l.173
- «✅ Componentes de tarjetas completamente implementados» — NewReportingPreview · l.174
- «✅ Integración con tablas activity_feed para analytics colaborativos» — NewReportingPreview · l.175
- «✅ Sistema de filtros avanzados con búsqueda inteligente» — NewReportingPreview · l.176
- «✅ Puntuación de salud de comunidades con insights automáticos» — NewReportingPreview · l.177
- «⏳ Scripts de generación de datos de prueba (próximo)» — NewReportingPreview · l.178
- «⏳ Integración WebSocket en tiempo real (fase futura)» — NewReportingPreview · l.179
- «Datos mostrados:» — NewReportingPreview · l.182
- «• KPIs: Datos reales de usuarios, cursos y progreso» — NewReportingPreview · l.184
- «• Salud de comunidades: Cálculo basado en participación real» — NewReportingPreview · l.185
- «• Actividad de espacios: Datos de activity_feed cuando disponibles» — NewReportingPreview · l.186
- «• Filtros: Escuelas, generaciones y comunidades reales del sistema» — NewReportingPreview · l.187
- «Próximos pasos:» — NewReportingPreview · l.190
- «1. Revisión y aprobación de esta vista previa» — NewReportingPreview · l.192
- «2. Generación de datos de prueba para testing completo» — NewReportingPreview · l.193
- «3. Pruebas de usuario con diferentes roles» — NewReportingPreview · l.194
- «4. Optimizaciones de rendimiento si es necesario» — NewReportingPreview · l.195
- «5. Migración gradual desde reportes actuales» — NewReportingPreview · l.196

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/dashboard/unified/AdvancedFilters.tsx`
- `components/dashboard/unified/CommunityHealthCard.tsx`
- `components/dashboard/unified/DashboardCard.tsx`
- `components/dashboard/unified/KPISummaryCard.tsx`
- `components/dashboard/unified/UnifiedDashboard.tsx`
- `components/dashboard/unified/UpcomingSessionsCard.tsx`
- `components/dashboard/unified/WorkspaceActivityCard.tsx`
- `lib/utils/session-ui-helpers.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/dashboard/unified` | GET | `components/dashboard/unified/UnifiedDashboard.tsx:107` |
| `/api/sessions` | GET | `components/dashboard/unified/UpcomingSessionsCard.tsx:44` |

## /dashboard-old

File `pages/dashboard-old.tsx` · 115 lines · frame: old Header

**Leftover (on the list for Brent)** — The old panel with the old header. A browser test that CI runs uses its notification bell (notification-settings.spec.ts): the test must change in the same release.

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.25 `router.push → /login  (when !session?.user)`
  - l.38 `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')`
  - l.65 `router.push → /login`
  - l.74 `router.push → /login`
- Linked from: `lib/auth/forced-password-change.ts:143`, `middleware.ts:338`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`.

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
| «Bienvenido a tu Dashboard» | h1 |  | Dashboard · l.103 |
| «Información de Usuario» | h2 |  | Dashboard · l.106 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.25 |
| `/login` | `router.push` |  | checkSession · l.65 |
| `/login` | `router.push` |  | handleLogout · l.74 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData?.user?.user_metadata, 'admin')` | checkSession · l.38 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Header` |  |  |  | Dashboard · l.95 |
| `CheckUserRole` |  |  |  | Dashboard · l.107 |

**Other texts on screen** (2)

- «Cargando...» — Dashboard · l.82, when `loading`
- «Dashboard - Genera» — Dashboard · l.91

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/Header.tsx`
- `components/notifications/NotificationBell.tsx`
- `components/notifications/NotificationDropdown.tsx`
- `src/components/CheckUserRole.tsx`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/notifications` | GET | `components/notifications/NotificationBell.tsx:41` |
| `/api/notifications/[id]/read` | POST | `components/notifications/NotificationBell.tsx:85` |
| `/api/notifications/mark-all-read` | POST | `components/notifications/NotificationBell.tsx:113` |

## /dashboard

File `pages/dashboard.tsx` · 1094 lines · frame: MainLayout

### Who reaches it

- Menu: «Mi Panel» → `/dashboard` — everyone signed in (`Sidebar.tsx` l.118)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.276 `router.push → /login  (when !session?.user)`
  - l.285 `adminRole = metadataHasRole(userData.user.user_metadata, 'admin')`
  - l.325 `router.push → /change-password  (when !userError && userData?.user && profileData.must_change_password === true)`
  - l.331 `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id)`
  - l.345 `roles = await getUserRoles(supabase, userData.user.id)`
  - l.446 `router.push → /login`
  - l.457 `router.push → /login`
  - l.990 `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')`
  - l.991 `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')`
- Linked from: `components/DynamicFavicon.tsx:17`, `components/LessonBreadcrumb.tsx:112`, `components/auth/AuthWrapper.tsx:54`, `components/auth/AuthWrapper.tsx:67`, `components/auth/ProtectedRoute.tsx:43`, `components/layout/Sidebar.tsx:121`, `components/notifications/ModernNotificationCenter.tsx:293`, `components/notifications/ModernNotificationCenter.tsx:318`, `components/notifications/NotificationDropdown.tsx:132`, `components/notifications/NotificationDropdown.tsx:157`, `components/workspace/WorkspaceSidebar.tsx:172`, `lib/auth/forced-password-change.ts:142` and 126 more
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/notification-settings.spec.ts`, `tests/e2e/pasantias-leads-admin.spec.ts`; browser tests CI skips: `tests/e2e/notification-bounce.spec.ts`, `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/notification-insert-boundary.spec.ts`, `tests/e2e/panel-pin.spec.ts`, `tests/qa/auth-redirects.spec.ts`.
- QA scenarios that name this address: admin 1, community_manager 2.

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

### Approved changes (decided by Brent with the mock-ups; not losses)

- New layout: a main column with what the person is doing, then a side column (under it on narrow screens) with the community card, the three statistics cards, «Últimas Noticias» (three compact rows) and «Videos Recientes» (two cards). Nothing was removed. (panel.md §8, 'rethink in one line' and table rows 1.2, 1.5, 1.3, 1.4; approved by Brent 13 Nov 2026 01:02)
- Order of sections changed: main column «Continuar Aprendiendo» (was 9th), «Mis Rutas de Aprendizaje», «Mis Cursos Abiertos», «Próximos Cursos», «Propuestas de Cursos», «Mis Logros». Conditions for showing each section are unchanged. (panel.md §8 table and behaviour change 5; approved by Brent 13 Nov 2026 01:02)
- The welcome band becomes an azul band (colours since changed to the brand kit) with avatar, «¡Hola, {nombre}!», subtitle, the consultor's partner-school line and «Mi Perfil»; «Mi Perfil» now also shows on phones. (panel.md §8 table row 1.1 and behaviour change 4; approved by Brent 13 Nov 2026 01:02)
- Course and upcoming cards no longer open on hover. Progress and the action («Continuar» / «Comenzar») are always visible; the description, pills, «Objetivos de aprendizaje» and «Disponible en {fecha}» open with a new button. New text: «Detalles». (panel.md §8 behaviour change 1 and table row 1.6; approved by Brent 13 Nov 2026 01:02)
- Every row that scrolls sideways shows the arrows «Desplazar izquierda» / «Desplazar derecha» whenever there is more, not only on hover and not only on the two course rows. (panel.md §8 behaviour change 2; approved by Brent 13 Nov 2026 01:02)
- The course card's picture is a link to the course (today a click on the card body does nothing on desktop). (panel.md §8 behaviour change 3; approved by Brent 13 Nov 2026 01:02)
- «Mis Rutas de Aprendizaje» shows up to 3 cards and the whole card is a link, with «Ver todas». (panel.md §8 table row 1.10; approved by Brent 13 Nov 2026 01:02)
- MemberProfileModal: the three rows that never fill in today («Colegio», «Generación», «Comunidad») are not drawn. (panel.md §8 table row 3.2; approved by Brent 13 Nov 2026 01:02)
- Proposal delete uses the shared confirmation («Eliminar Propuesta», same question, «Cancelar» / «Eliminar»); the browser alert() on failure becomes an error toast. (panel.md §8 table row 3.4; approved by Brent 13 Nov 2026 01:02)
- The full-page «Cargando...» before the screen renders becomes skeletons inside the frame (foundations sheet; not drawn on this page). (panel.md §8 table row 0; approved by Brent 13 Nov 2026 01:02)

### Notes

- The proposals section's empty, loading and error states are not drawn; they use the foundations' empty state, skeleton and error notice with «Reintentar». (panel.md §8 table row 1.7)
- The arrival toast «Contraseña actualizada exitosamente» becomes the shared success toast; it is not triggered in the mock-up but must survive. (panel.md §8 table, row 'Arrival toast')

### What the page file itself draws

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Hola, {profileName?.split(' ')[0]} / Usuario !» | h1 |  | Dashboard · l.505 |
| «Mi Comunidad de Crecimiento» | h2 | `userRoles.some(role => role.community_id)` | Dashboard · l.569 |
| «{selectedRole.school?.name} / {selectedRole.community!.name}» | h3 | `userRoles.some(role => role.community_id) && communityExpanded` | Dashboard · l.639 |
| «Últimas Noticias» | h2 |  | Dashboard · l.723 |
| «{article.title}» | h3 | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` | Dashboard · l.768 |
| «Videos Recientes» | h2 |  | Dashboard · l.792 |
| «{video.title}» | h3 | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` | Dashboard · l.836 |
| «{dashboardStats?.statsLabel} / Estadísticas de la Plataforma» | h2 |  | Dashboard · l.855 |
| «{dashboardStats.mostCompletedCourse.…}» | h3 | `!(loadingStats) && dashboardStats?.mostCompletedCourse` | Dashboard · l.881 |
| «{dashboardStats.topLearner.name}» | h3 | `!(loadingStats) && dashboardStats?.topLearner` | Dashboard · l.931 |
| «Próximos Cursos» | h2 | `!loadingUpcoming && upcomingCourses.length > 0` | Dashboard · l.968 |
| «Mis Rutas de Aprendizaje» | h2 | `learningPaths.length > 0` | Dashboard · l.1015 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Mi Comunidad de Crecimiento {selectedRole.school?.name} / {selectedRole.community!.name} • {members.length} miembros {member.first_name?.charAt(0)} / U [+ {members.length - 4}]» | `{() => setCommunityExpanded(!communityExpanded)}` | `userRoles.some(role => role.community_id)` |  |  | Dashboard · l.552 |
| «{comm.school?.name} / {comm.community?.name}» | `{(e) => { e.stopPropagation(); setSelectedCommunityId(comm.community_id!); }}` | `userRoles.some(role => role.community_id) && communityExpanded && userCommunities.length > 1 && each userCommunities` |  |  | Dashboard · l.619 |
| «[icon Settings]» · tooltip «Configuración» | `{(e) => { e.stopPropagation(); setSelectedWorkspace(workspace); setShowWorkspace…}` | `userRoles.some(role => role.community_id) && communityExpanded` |  |  | Dashboard · l.643 |
| «{member.first_name?.charAt(0)} / U {[member.first_name, member.last_nam…} / {(member as any).name} / Usuario [{roleLabel}] [{getExternalSchoolLabel(member.exter…}] [Tú]» | `{() => { setSelectedMember(member); setShowMemberProfile(true); }}` | `userRoles.some(role => role.community_id) && communityExpanded && each members` |  |  | Dashboard · l.668 |

**Links** (7)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Mi Perfil» | `/profile` | screen size: `hidden sm:flex` |  | Dashboard · l.519 |
| «Ver Espacio Completo →» | `/community/workspace` | `userRoles.some(role => role.community_id) && communityExpanded` |  | Dashboard · l.654 |
| «Ver todas» | `/noticias` |  |  | Dashboard · l.725 |
| «{formatTimeAgo(article.display_date …} {article.title} {getExcerpt(article.content_html)}» | `/noticias/[*]` (new tab) | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` |  | Dashboard · l.746 |
| «Ver canal» | `https://www.youtube.com/@NuevaEducacionFundacion` (new tab) |  |  | Dashboard · l.794 |
| «{video.title} {formatTimeAgo(video.publishedAt)}» | `https://www.youtube.com/watch?v=[*]` (new tab) | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | Dashboard · l.816 |
| «Ver todas» | `/mi-aprendizaje` | `learningPaths.length > 0` |  | Dashboard · l.1016 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `LearningPathCard` |  | `{() => router.push('/mi-aprendizaje/ruta/${path.id}')}` | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` | Dashboard · l.1026 |

**Embedded media** (6)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {workspace.custom_name \|\| selectedRole.community!.name} · {workspace.image_url} | `userRoles.some(role => role.community_id) && workspace?.image_url` |  | Dashboard · l.558 |
| img · {member.avatar_url} | `userRoles.some(role => role.community_id) && each members.slice(0, 4) && member.avatar_url` |  | Dashboard · l.582 |
| img · {member.avatar_url} | `userRoles.some(role => role.community_id) && communityExpanded && each members && member.avatar_url` |  | Dashboard · l.677 |
| img · alt {article.title} · {article.featured_image} | `!(loadingNews) && newsArticles.length > 0 && each newsArticles && article.featured_image` |  | Dashboard · l.757 |
| img · alt {video.title} · {video.thumbnail} | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | Dashboard · l.824 |
| img · {dashboardStats.topLearner.avatar_url} | `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.avatar_url` |  | Dashboard · l.918 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsModal` | component | `{showWorkspaceSettings}` |  | Dashboard · l.1060 |
| `MemberProfileModal` | component | `{showMemberProfile}` |  | Dashboard · l.1082 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Contraseña actualizada exitosamente» | `passwordChangeSuccess === 'true'` | Dashboard · l.187 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.276 |
| `/profile?from=dashboard&error=profile-fetch-failed` | `router.push` | `!userError && userData?.user && !profileData` | checkSession · l.320 |
| `/change-password` | `router.push` | `!userError && userData?.user && profileData.must_change_password === true` | checkSession · l.325 |
| `/login` | `router.push` |  | checkSession · l.446 |
| `/login` | `router.push` |  | handleLogout · l.457 |
| `/student/course/[*]` | `router.push` | `inProgressCourses.length > 0` | Dashboard · l.1007 |
| `/mi-aprendizaje/ruta/[*]` | `router.push` | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` | Dashboard · l.1039 |
| `/student/course/[*]` | `router.push` | `openCourses.length > 0` | Dashboard · l.1052 |

**Access checks in the code** (5)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData.user.user_metadata, 'admin')` | checkSession · l.285 |
| `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id)` | checkSession · l.331 |
| `roles = await getUserRoles(supabase, userData.user.id)` | checkSession · l.345 |
| `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')` | Dashboard · l.990 |
| `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')` | Dashboard · l.991 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!selectedRole \|\| !selectedRole.community` | Dashboard · l.543 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | Dashboard · l.462 |
| `MainLayout` |  |  |  | Dashboard · l.483 |
| `Avatar` |  |  |  | Dashboard · l.498 |
| `UpcomingCourseCard` |  | `!loadingUpcoming && upcomingCourses.length > 0 && each upcomingCourses` |  | Dashboard · l.981 |
| `CourseProposalSection` |  | `(metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor') \|\| userRoles.some(r => r.role_type === 'admin' \|\| r…` |  | Dashboard · l.993 |
| `BadgesSection` |  | `user?.id` |  | Dashboard · l.998 |
| `NetflixCourseRow` | title: Continuar Aprendiendo · emptyMessage: No tienes cursos en progreso | `inProgressCourses.length > 0` |  | Dashboard · l.1003 |
| `LearningPathCard` |  | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` |  | Dashboard · l.1026 |
| `NetflixCourseRow` | title: Mis Cursos Abiertos · emptyMessage: No tienes cursos asignados | `openCourses.length > 0` |  | Dashboard · l.1048 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatTimeAgo()` | «Hoy», «Ayer», «Hace {diffDays} días», «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.88 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Hoy» | formatTimeAgo · l.88 |
| «Ayer» | formatTimeAgo · l.89 |
| «Hace {diffDays} días» | formatTimeAgo · l.90 |
| «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.91 |
| «Bearer {statsSession.access_token}» | Dashboard · l.237 |
| «Sin instructor» | Dashboard · l.378 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-password-change-success` | Dashboard · l.184 |
| storage | `sessionStorage: fne-avatar-cache` | checkSession · l.290 |
| storage | `localStorage: rememberMe` | handleLogout · l.455 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.456 |

**Values shown from data** (6)

- `{getExternalSchoolLabel(profileData.…}` — Dashboard · l.514, when `userRole === 'consultor' && profileData?.external_school_affiliation`
- `{dashboardStats.mostCompletedCourse.…}` — Dashboard · l.890, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- `{dashboardStats.topLearner.name.char…}` — Dashboard · l.925, when `!(loadingStats) && dashboardStats?.topLearner && !(dashboardStats.topLearner.avatar_url)`
- `{dashboardStats.topLearner.role}` — Dashboard · l.935, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.role`
- `{dashboardStats.topLearner.school_na…}` — Dashboard · l.940, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.school_name`
- `{dashboardStats.topLearner.completed…}` — Dashboard · l.945, when `!(loadingStats) && dashboardStats?.topLearner`

**Other texts on screen** (15)

- «Cargando...» — Dashboard · l.475, when `loading`
- «Bienvenido de vuelta al hub de transformación de tu colegio» — Dashboard · l.509
- «Seleccionar comunidad:» — Dashboard · l.616, when `userRoles.some(role => role.community_id) && communityExpanded && userCommunities.length > 1`
- «No hay noticias disponibles» — Dashboard · l.780, when `!(loadingNews) && !(newsArticles.length > 0)`
- «No hay videos disponibles» — Dashboard · l.848, when `!(loadingVideos) && !(youtubeVideos.length > 0)`
- «Educadores Activos» — Dashboard · l.860
- «en tu alcance» — Dashboard · l.868
- «Curso Más Completado» — Dashboard · l.873
- «Relator: {dashboardStats.mostCompletedCourse.…}» — Dashboard · l.885, when `!(loadingStats) && dashboardStats?.mostCompletedCourse && dashboardStats.mostCompletedCourse.instructor_name`
- «completaciones» — Dashboard · l.893, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- «Sin datos disponibles» — Dashboard · l.897, when `!(loadingStats) && !(dashboardStats?.mostCompletedCourse)`
- «Usuario Destacado» — Dashboard · l.903
- «cursos completados» — Dashboard · l.948, when `!(loadingStats) && dashboardStats?.topLearner`
- «Sin datos disponibles» — Dashboard · l.954, when `!(loadingStats) && !(dashboardStats?.topLearner)`
- «Cursos que podrás tomar próximamente» — Dashboard · l.969, when `!loadingUpcoming && upcomingCourses.length > 0`

**Reads and writes the database directly:** `table:course_assignments` (select), `table:course_enrollments` (select), `table:courses` (select), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/badges/BadgeCard.tsx`
- `components/badges/BadgeIcon.tsx`
- `components/badges/BadgesSection.tsx`
- `components/common/Avatar.tsx`
- `components/community/MemberProfileModal.tsx`
- `components/community/WorkspaceSettingsModal.tsx`
- `components/course-proposals/ConfirmDialog.tsx`
- `components/course-proposals/CourseProposalCard.tsx`
- `components/course-proposals/CourseProposalModal.tsx`
- `components/course-proposals/CourseProposalSection.tsx`
- `components/courses/CourseThumbnail.tsx`
- `components/courses/NetflixCourseCard.tsx`
- `components/courses/NetflixCourseRow.tsx`
- `components/courses/UpcomingCourseCard.tsx`
- `components/learning-paths/LearningPathCard.tsx`
- `components/ui/dialog.tsx`
- `constants/externalSchools.ts`
- `constants/toastStyles.ts`
- `lib/services/badgeService.ts`
- `lib/services/communityWorkspace.js`
- `types/roles.ts`
- `utils/roleUtils.ts`
- `utils/toastUtils.ts`
- `utils/workspaceUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/community/ensure-workspace` | POST | `utils/workspaceUtils.ts:386` |
| `/api/community/members` | GET | `utils/roleUtils.ts:1015` |
| `/api/course-proposals` | GET, POST | `components/course-proposals/CourseProposalSection.tsx:27`, `components/course-proposals/CourseProposalSection.tsx:72` |
| `/api/course-proposals/[id]` | DELETE, PUT | `components/course-proposals/CourseProposalSection.tsx:108`, `components/course-proposals/CourseProposalSection.tsx:50` |
| `/api/dashboard/stats` | GET | `pages/dashboard.tsx:239` |
| `/api/learning-paths/my-paths` | GET | `pages/dashboard.tsx:432` |
| `/api/news` | GET | `pages/dashboard.tsx:198` |
| `/api/upcoming-courses` | GET | `pages/dashboard.tsx:257` |
| `/api/youtube/latest` | GET | `pages/dashboard.tsx:216` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/badges/BadgeCard.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{badge.badge_name}» | h4 |  | BadgeCard · l.84 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{badge.badge_name} [{courseName}] {formatDate(badge.earned_at)} [+ {badge.points_value}]» | `{onClick}` |  | BadgeCard · l.61 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `GeneraBadgeIcon` |  |  |  | BadgeCard · l.74 |

**Values shown from data** (3)

- `{courseName}` — BadgeCard · l.90, when `showCourseName && courseName`
- `{formatDate(badge.earned_at)}` — BadgeCard · l.96
- `+ {badge.points_value}` — BadgeCard · l.104, when `badge.points_value > 0 && size !== 'sm'`

### components/badges/BadgeIcon.tsx

Used by: `/dashboard`

**Other texts on screen** (1)

- «Genera Badge» (aria-label) — GeneraBadgeIcon · l.23

### components/badges/BadgesSection.tsx

Used by: `/dashboard`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mis Logros» | h2 |  | BadgesSection · l.73 |
| «Tus logros aparecerán aquí» | h3 | `!loading && !error && badges.length === 0` | BadgesSection · l.147 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver todos» | `/mi-aprendizaje/logros` | `showViewAll && badges.length > 0` |  | BadgesSection · l.82 |
| «+ {badges.length - maxDisplay} más» | `/mi-aprendizaje/logros` | `!loading && !error && badges.length > 0 && hasMore && showViewAll` |  | BadgesSection · l.125 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los logros» | `setError` |  | fetchBadges · l.47 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!loading && badges.length === 0` | BadgesSection · l.57 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BadgeCard` |  | `!loading && !error && badges.length > 0 && each displayedBadges` |  | BadgesSection · l.119 |
| `GeneraBadgeIcon` |  | `!loading && !error && badges.length === 0` |  | BadgesSection · l.146 |

**Values shown from data** (1)

- `{error}` — BadgesSection · l.105, when `error`

**Other texts on screen** (2)

- «{badges.length} insignia obtenida / insignias obtenidas [· {totalPoints} puntos]» — BadgesSection · l.74
- «Completa cursos para ganar insignias y reconocimientos» — BadgesSection · l.151, when `!loading && !error && badges.length === 0`

### components/common/Avatar.tsx

Used by: `/dashboard`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Avatar · {imageUrl} |  |  | Avatar · l.179 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `backgroundColor` | «hsl({hue}, 70%, 40%)» | generateLocalAvatar · l.56 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-avatar-cache` | Avatar · l.88 |

**Values shown from data** (1)

- `{initials}` — Avatar · l.159, when `!user \|\| (hasError && !isLoading) \|\| (!imageUrl && !isLoading && !propAvatarUrl)`

### components/community/MemberProfileModal.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{fullName} [(Tú)]» | h2 |  | MemberProfileModal · l.60 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar» | `{onClose}` |  |  |  | MemberProfileModal · l.157 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver Perfil Completo» | `/user/[*]` |  |  | MemberProfileModal · l.163 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {fullName} · {member.avatar_url} | `member.avatar_url` |  | MemberProfileModal · l.48 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` |  | MemberProfileModal · l.43 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!member` | MemberProfileModal · l.28 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | MemberProfileModal · l.44 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `roleLabel` | «Sin rol asignado» | MemberProfileModal · l.31 |
| `formatDate()` | «No disponible» | formatDate · l.36 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | MemberProfileModal · l.32 |

**Values shown from data** (8)

- `{initials}` — MemberProfileModal · l.55, when `!(member.avatar_url)`
- `{roleLabel}` — MemberProfileModal · l.66
- `{member.email}` — MemberProfileModal · l.81, when `member.email`
- `{member.school.name}` — MemberProfileModal · l.94, when `member.school`
- `{getExternalSchoolLabel(member.exter…}` — MemberProfileModal · l.107, when `memberRole === 'consultor' && member.external_school_affiliation`
- `{member.generation.name}` — MemberProfileModal · l.122, when `member.generation`
- `{member.community.name}` — MemberProfileModal · l.135, when `member.community`
- `{formatDate(member.created_at)}` — MemberProfileModal · l.148, when `member.created_at`

**Other texts on screen** (6)

- «Correo electrónico» — MemberProfileModal · l.80, when `member.email`
- «Colegio» — MemberProfileModal · l.93, when `member.school`
- «Escuela externa» — MemberProfileModal · l.106, when `memberRole === 'consultor' && member.external_school_affiliation`
- «Generación» — MemberProfileModal · l.121, when `member.generation`
- «Comunidad» — MemberProfileModal · l.134, when `member.community`
- «Miembro desde» — MemberProfileModal · l.147, when `member.created_at`

### components/community/WorkspaceSettingsModal.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Configuración de la Comunidad» | h3 |  | WorkspaceSettingsModal · l.128 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.131 |
| «[icon X]» | `{handleRemoveImage}` | `imagePreview` |  |  | WorkspaceSettingsModal · l.175 |
| «Cancelar» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.217 |
| «Guardando... / Guardar cambios» | `{handleSave}` |  | `{isLoading \|\| (!customName.trim() && !imageFile && !imageUrl)}` |  | WorkspaceSettingsModal · l.224 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre de la Comunidad» | text | «Ingresa un nombre personalizado» · `maxLength={100}` |  |  |  | WorkspaceSettingsModal · l.146 |
| «Subir imagen» | file | accepts `image/jpeg,image/jpg,image/png,image/webp` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=community-image-upload (id used by code)` | WorkspaceSettingsModal · l.192 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Vista previa · {imagePreview} | `imagePreview` |  | WorkspaceSettingsModal · l.170 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Configuración de la Comunidad» | written in this file |  |  | WorkspaceSettingsModal · l.125 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «La imagen debe ser menor a 5MB» | `file.size > 5 * 1024 * 1024` | handleImageSelect · l.42 |
| error | «Solo se permiten imágenes (JPEG, PNG, WebP)» | `!allowedTypes.includes(file.type)` | handleImageSelect · l.49 |
| success | «Configuración actualizada exitosamente» |  | handleSave · l.99 |
| error | «Error al guardar la configuración» |  | handleSave · l.107 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | WorkspaceSettingsModal · l.122 |

**Other texts on screen** (5)

- «Nombre de la Comunidad» (label) — WorkspaceSettingsModal · l.143
- «Cualquier miembro puede cambiar el nombre del grupo» — WorkspaceSettingsModal · l.155
- «Imagen de la Comunidad» (label) — WorkspaceSettingsModal · l.161
- «Subir imagen» (label) — WorkspaceSettingsModal · l.200
- «Máx. 5MB (JPEG, PNG, WebP)» — WorkspaceSettingsModal · l.208

### components/course-proposals/ConfirmDialog.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{cancelText}» | `{onClose}` |  | `{isLoading}` |  | ConfirmDialog · l.64 |
| «Eliminando... / {confirmText}» | `{handleConfirm}` |  | `{isLoading}` |  | ConfirmDialog · l.72 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` |  | ConfirmDialog · l.43 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | ConfirmDialog · l.44 |
| `DialogHeader` |  |  |  | ConfirmDialog · l.45 |
| `DialogTitle` |  |  |  | ConfirmDialog · l.54 |
| `DialogDescription` |  |  |  | ConfirmDialog · l.58 |
| `DialogFooter` |  |  |  | ConfirmDialog · l.63 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «¿Estás seguro?» | ConfirmDialog · l.30 |
| «Esta acción no se puede deshacer.» | ConfirmDialog · l.31 |
| «Confirmar» | ConfirmDialog · l.32 |
| «Cancelar» | ConfirmDialog · l.33 |

**Values shown from data** (2)

- `{title}` — ConfirmDialog · l.54
- `{description}` — ConfirmDialog · l.58

### components/course-proposals/CourseProposalCard.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{proposal.titulo}» | h3 |  | CourseProposalCard · l.81 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Pencil]» · tooltip «Editar propuesta» | `{handleEdit}` | `isOwner` |  |  | CourseProposalCard · l.64 |
| «[icon Trash2]» · tooltip «Eliminar propuesta» | `{handleDelete}` | `isOwner` |  |  | CourseProposalCard · l.71 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `statusConfig` | «Pendiente», «En Revisión», «Aprobada», «Rechazada» | getStatusBadge · l.21 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | CourseProposalCard · l.34 |

**Values shown from data** (6)

- `{statusBadge.label}` — CourseProposalCard · l.55
- `{proposal.descripcion_corta}` — CourseProposalCard · l.89
- `{proposal.competencias_desarrollar}` — CourseProposalCard · l.96
- `{proposal.tiempo_requerido_desarrollo}` — CourseProposalCard · l.104
- `{creatorName}` — CourseProposalCard · l.126
- `{formatDate(proposal.created_at)}` — CourseProposalCard · l.130

**Other texts on screen** (1)

- «Solicita ayuda con diseño instruccional» — CourseProposalCard · l.114, when `proposal.necesita_ayuda_diseno_instruccional`

### components/course-proposals/CourseProposalModal.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{handleClose}` |  | `{isSubmitting}` |  | CourseProposalModal · l.230 |
| «Guardando... / Guardar Cambios / Enviar Propuesta» (submits the form) |  |  | `{isSubmitting}` |  | CourseProposalModal · l.238 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del curso *» | text | `titulo` · «Ej: Estrategias de Aprendizaje Colaborativo» · disabled: `{isSubmitting}` |  |  | `id=titulo (id used by code)` | CourseProposalModal · l.134 |
| «Descripción corta *» | textarea | `descripcion_corta` · «Describe brevemente de qué se trataría el curso...» · disabled: `{isSubmitting}` |  |  | `id=descripcion_corta (id used by code)` | CourseProposalModal · l.154 |
| «Competencias a desarrollar *» | textarea | `competencias_desarrollar` · «¿Qué habilidades o competencias desarrollarían los participantes?» · disabled: `{isSubmitting}` |  |  | `id=competencias_desarrollar (id used by code)` | CourseProposalModal · l.174 |
| «Tiempo requerido para desarrollar el contenido *» | text | `tiempo_requerido_desarrollo` · «Ej: 2 semanas, 1 mes, 3 meses» · disabled: `{isSubmitting}` |  |  | `id=tiempo_requerido_desarrollo (id used by code)` | CourseProposalModal · l.194 |
| «¿Necesita ayuda con el diseño instruccional? Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.» | checkbox | `necesita_ayuda_diseno_instruccional` · disabled: `{isSubmitting}` |  |  | `id=necesita_ayuda_diseno_instruccional (id used by code)` | CourseProposalModal · l.208 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | CourseProposalModal · l.118 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` |  | CourseProposalModal · l.105 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «El título es requerido» | `setError` | `!formData.titulo.trim()` | handleSubmit · l.67 |
| «La descripción es requerida» | `setError` | `!formData.descripcion_corta.trim()` | handleSubmit · l.71 |
| «Las competencias a desarrollar son requeridas» | `setError` | `!formData.competencias_desarrollar.trim()` | handleSubmit · l.75 |
| «El tiempo requerido es requerido» | `setError` | `!formData.tiempo_requerido_desarrollo.trim()` | handleSubmit · l.79 |
| «Error al actualizar la propuesta / Error al crear la propuesta» | `setError` |  | handleSubmit · l.90 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | CourseProposalModal · l.106 |
| `DialogHeader` |  |  |  | CourseProposalModal · l.107 |
| `DialogTitle` |  |  |  | CourseProposalModal · l.108 |
| `DialogDescription` |  |  |  | CourseProposalModal · l.111 |

**Values shown from data** (1)

- `{error}` — CourseProposalModal · l.121, when `error`

**Other texts on screen** (7)

- «Editar Propuesta de Curso / Nueva Propuesta de Curso» — CourseProposalModal · l.108
- «Modifica los detalles de tu propuesta de curso. / Comparte tu idea para un nuevo curso que beneficiaría a la plataforma.» — CourseProposalModal · l.111
- «Título del curso *» (label) — CourseProposalModal · l.128
- «Descripción corta *» (label) — CourseProposalModal · l.148
- «Competencias a desarrollar *» (label) — CourseProposalModal · l.168
- «Tiempo requerido para desarrollar el contenido *» (label) — CourseProposalModal · l.188
- «¿Necesita ayuda con el diseño instruccional? Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.» (label) — CourseProposalModal · l.217

### components/course-proposals/CourseProposalSection.tsx

Used by: `/dashboard`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Propuestas de Cursos» | h2 | `loading` | CourseProposalSection · l.150 |
| «Propuestas de Cursos» | h2 | `error` | CourseProposalSection · l.177 |
| «Propuestas de Cursos» | h2 |  | CourseProposalSection · l.205 |
| «Sin propuestas aún» | h3 | `!(proposals.length > 0)` | CourseProposalSection · l.245 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{fetchProposals}` | `error` |  |  | CourseProposalSection · l.185 |
| «Nueva Propuesta» | `{() => { setEditingProposal(null); setIsModalOpen(true); }}` |  |  |  | CourseProposalSection · l.211 |
| «Crear Propuesta» | `{() => { setEditingProposal(null); setIsModalOpen(true); }}` | `!(proposals.length > 0)` |  |  | CourseProposalSection · l.251 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CourseProposalModal` | component | `{isModalOpen}` |  | CourseProposalSection · l.265 |
| `ConfirmDialog` | component | `{deleteConfirmOpen}` | title: Eliminar Propuesta · description: ¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | CourseProposalSection · l.273 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «Error al eliminar propuesta» |  | handleConfirmDelete · l.124 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar propuestas» | `throw (shown by whoever catches it)` | `!response.ok` | CourseProposalSection · l.31 |
| «Error al cargar propuestas» | `setError` |  | CourseProposalSection · l.37 |
| «Error al actualizar propuesta» | `throw (shown by whoever catches it)` | `editingProposal && !response.ok` | handleSubmitProposal · l.61 |
| «Error al crear propuesta» | `throw (shown by whoever catches it)` | `!(editingProposal) && !response.ok` | handleSubmitProposal · l.83 |
| «Error al eliminar propuesta» | `throw (shown by whoever catches it)` | `!response.ok` | handleConfirmDelete · l.115 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CourseProposalCard` |  | `proposals.length > 0 && each proposals` |  | CourseProposalSection · l.232 |

**Values shown from data** (1)

- `{error}` — CourseProposalSection · l.184, when `error`

**Other texts on screen** (4)

- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.151, when `loading`
- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.178, when `error`
- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.206
- «Sé el primero en proponer un nuevo curso» — CourseProposalSection · l.249, when `!(proposals.length > 0)`

### components/courses/CourseThumbnail.tsx

Used by: `/dashboard`

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

Used by: `/dashboard`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 | `!isExpanded` | NetflixCourseCard · l.225 |
| «{course.title}» | h3 | `isExpanded` | NetflixCourseCard · l.267 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{getCTAText()}» | `{handleCTAClick}` | `isExpanded` |  |  | NetflixCourseCard · l.413 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «[Aprobado] [Completado] [{course.title} [{course.instructor.full_name}]] [{course.title} [{course.instructor.full_name}…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | NetflixCourseCard · l.156 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {course.instructor.full_name} · {course.instructor.photo_url} | `course.instructor?.photo_url` |  | NetflixCourseCard · l.176 |
| img · alt {course.title} · {course.thumbnail_url} | `!(course.instructor?.photo_url) && course.thumbnail_url` |  | NetflixCourseCard · l.185 |
| img · alt {course.instructor.full_name} · {course.instructor.photo_url} | `isExpanded && course.instructor && course.instructor.photo_url` |  | NetflixCourseCard · l.275 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | NetflixCourseCard · l.35 |
| `isMobile` | NetflixCourseCard · l.49 |
| `isMobile` | NetflixCourseCard · l.57 |
| `!isMobile` | NetflixCourseCard · l.66 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CourseThumbnail` |  | `!(course.instructor?.photo_url) && !(course.thumbnail_url)` |  | NetflixCourseCard · l.193 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `getCTAText()` | «Ver Detalles», «Repasar», «Continuar», «Comenzar» | getCTAText · l.83 |
| `getDifficultyLabel()` | «Principiante», «Intermedio», «Avanzado» | getDifficultyLabel · l.108 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Ver Detalles» | NetflixCourseCard · l.83 |
| «Repasar» | NetflixCourseCard · l.84 |
| «Continuar» | NetflixCourseCard · l.85 |
| «Comenzar» | NetflixCourseCard · l.87 |
| «Principiante» | NetflixCourseCard · l.108 |
| «Intermedio» | NetflixCourseCard · l.110 |
| «Avanzado» | NetflixCourseCard · l.112 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | NetflixCourseCard · l.29 |
| listener | `document.addEventListener('mousedown')` | NetflixCourseCard · l.43 |

**Values shown from data** (5)

- `{course.instructor.full_name}` — NetflixCourseCard · l.229, when `!isExpanded && course.instructor`
- `{course.instructor.full_name}` — NetflixCourseCard · l.285, when `isExpanded && course.instructor`
- `{enrollment.progress_percentage} %` — NetflixCourseCard · l.327, when `isExpanded && enrollment && enrollment.total_lessons && enrollment.total_lessons > 0`
- `{course.description}` — NetflixCourseCard · l.382, when `isExpanded && course.description`
- `{objective}` — NetflixCourseCard · l.396, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0 && each course.learning_objectives.slice(0, 4)`

**Other texts on screen** (10)

- «Aprobado» — NetflixCourseCard · l.209, when `enrollment?.completion_status === 'aprobado'`
- «Completado» — NetflixCourseCard · l.217, when `enrollment?.completion_status === 'completado'`
- «lecciones» — NetflixCourseCard · l.315, when `isExpanded && enrollment && enrollment.total_lessons && enrollment.total_lessons > 0`
- «{enrollment.lessons_completed} de {enrollment.total_lessons} lecciones» — NetflixCourseCard · l.324, when `isExpanded && enrollment && enrollment.total_lessons && enrollment.total_lessons > 0`
- «Tareas: {enrollment.assignments_submitted} / {enrollment.assignments_total}» — NetflixCourseCard · l.356, when `isExpanded && enrollment && enrollment.assignments_total != null && enrollment.assignments_total > 0`
- «Curso Aprobado» — NetflixCourseCard · l.365, when `isExpanded && enrollment?.completion_status === 'aprobado'`
- «Has completado todas las lecciones y tareas.» — NetflixCourseCard · l.368, when `isExpanded && enrollment?.completion_status === 'aprobado'`
- «Completa tus tareas pendientes para obtener la insignia.» — NetflixCourseCard · l.376, when `isExpanded && enrollment?.completion_status === 'completado'`
- «Objetivos de aprendizaje» — NetflixCourseCard · l.392, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0`
- «+ {course.learning_objectives.length -…} más...» — NetflixCourseCard · l.404, when `isExpanded && course.learning_objectives && course.learning_objectives.length > 0 && course.learning_objectives.length > 4`

### components/courses/NetflixCourseRow.tsx

Used by: `/dashboard`

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

### components/courses/UpcomingCourseCard.tsx

Used by: `/dashboard`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 | `!isExpanded` | UpcomingCourseCard · l.181 |
| «{course.title}» | h3 | `isExpanded` | UpcomingCourseCard · l.210 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «Próximamente [{course.title} [{course.instructor.full_name}]] [{course.title} [{course.instructor.full_name}] [{course.…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | UpcomingCourseCard · l.132 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {course.title} · {course.thumbnail_url} | `course.thumbnail_url` |  | UpcomingCourseCard · l.152 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | UpcomingCourseCard · l.49 |
| `isMobile` | UpcomingCourseCard · l.63 |
| `isMobile` | UpcomingCourseCard · l.71 |
| `!isMobile` | UpcomingCourseCard · l.80 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | UpcomingCourseCard · l.43 |
| listener | `document.addEventListener('mousedown')` | UpcomingCourseCard · l.57 |

**Values shown from data** (4)

- `{course.instructor.full_name}` — UpcomingCourseCard · l.189, when `!isExpanded && course.instructor`
- `{course.instructor.full_name}` — UpcomingCourseCard · l.220, when `isExpanded && course.instructor`
- `{course.description}` — UpcomingCourseCard · l.228, when `isExpanded && course.description`
- `{formattedDate}` — UpcomingCourseCard · l.260, when `!isExpanded && formattedDate`

**Other texts on screen** (4)

- «Próximamente» — UpcomingCourseCard · l.174
- «Disponible en {formattedDate}» — UpcomingCourseCard · l.237, when `isExpanded && formattedDate`
- «Fecha por confirmar» — UpcomingCourseCard · l.245, when `isExpanded && !(formattedDate)`
- «Fecha por confirmar» — UpcomingCourseCard · l.268, when `!isExpanded && !(formattedDate)`

### components/dashboard/unified/AdvancedFilters.tsx

Used by: `/admin/new-reporting`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Filtros Avanzados» | h3 |  | AdvancedFilters · l.272 |
| «Filtros Activos ( {activeFiltersCount} )» | h4 | `activeFiltersCount > 0` | AdvancedFilters · l.474 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Filtros [{activeFiltersCount}]» | `{onToggle}` | `!isOpen` |  |  | AdvancedFilters · l.248 |
| «Limpiar filtros» | `{clearFilters}` | `activeFiltersCount > 0` |  |  | AdvancedFilters · l.277 |
| «[icon X]» | `{onToggle}` |  |  |  | AdvancedFilters · l.284 |
| «{suggestion}» | `{() => handleSuggestionSelect(suggestion)}` | `showSuggestions && searchSuggestions.length > 0 && each searchSuggestions` |  |  | AdvancedFilters · l.318 |
| «[icon X]» | `{() => handleFilterChange(key as keyof DashboardFilters, undefined)}` | `activeFiltersCount > 0 && each Object.entries(filters)` |  |  | AdvancedFilters · l.504 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Búsqueda» | text | «Buscar usuarios, cursos, comunidades...» · also `onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} · onFocus={() => setShowSuggestions(true)}` |  |  |  | AdvancedFilters · l.303 |
| «Período de Tiempo» | select |  | «(lista) {option.label}» |  |  | AdvancedFilters · l.335 |
| «Fecha Inicio» | date |  |  | `filters.timeRange === 'custom'` |  | AdvancedFilters · l.355 |
| «Fecha Fin» | date |  |  | `filters.timeRange === 'custom'` |  | AdvancedFilters · l.366 |
| «Escuela» | select | disabled: `{loading}` | «Todas las escuelas», «(lista) {school.name}» | `filterOptions.schools.length > 0` |  | AdvancedFilters · l.385 |
| «Generación» | select | disabled: `{loading}` | «Todas las generaciones», «(lista) {generation.name}» | `filterOptions.generations.length > 0` |  | AdvancedFilters · l.408 |
| «Comunidad» | select | disabled: `{loading}` | «Todas las comunidades», «(lista) {community.name}» | `filterOptions.communities.length > 0` |  | AdvancedFilters · l.431 |
| «Curso» | select | disabled: `{loading}` | «Todos los cursos», «(lista) {course.title}» | `filterOptions.courses.length > 0` |  | AdvancedFilters · l.454 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!session` | AdvancedFilters · l.66 |
| `key === 'timeRange' \|\| !value` | AdvancedFilters · l.479 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `timeRangeOptions` | «Últimos 7 días», «Últimos 30 días», «Últimos 3 meses», «Último año», «Rango personalizado» | AdvancedFilters · l.53 |
| `commonPatterns` | «usuarios activos», «cursos completados», «actividad reciente», «progreso bajo», «colaboración alta» | AdvancedFilters · l.164 |

**Other texts on screen** (8)

- «Búsqueda» (label) — AdvancedFilters · l.296
- «Período de Tiempo» (label) — AdvancedFilters · l.332
- «Fecha Inicio» (label) — AdvancedFilters · l.352, when `filters.timeRange === 'custom'`
- «Fecha Fin» (label) — AdvancedFilters · l.363, when `filters.timeRange === 'custom'`
- «Escuela» (label) — AdvancedFilters · l.381, when `filterOptions.schools.length > 0`
- «Generación» (label) — AdvancedFilters · l.404, when `filterOptions.generations.length > 0`
- «Comunidad» (label) — AdvancedFilters · l.427, when `filterOptions.communities.length > 0`
- «Curso» (label) — AdvancedFilters · l.450, when `filterOptions.courses.length > 0`

**Reads and writes the database directly:** `table:courses` (select), `table:generations` (select), `table:growth_communities` (select), `table:schools` (select)

### components/dashboard/unified/CommunityHealthCard.tsx

Used by: `/admin/new-reporting`

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{community.name}» | h4 |  | CommunityRow · l.105 |
| «Salud General de Comunidades» | h3 |  | CommunityHealthCard · l.185 |
| «Comunidades ( {data.communities.length} )» | h4 |  | CommunityHealthCard · l.205 |
| «Observaciones Generales» | h4 | `insights.filter(insight => !insight.communityId).length > 0` | CommunityHealthCard · l.219 |
| «Análisis Detallado» | h4 |  | CommunityHealthCard · l.247 |
| «Tendencias de Salud (Últimos 30 días)» | h5 |  | CommunityHealthCard · l.251 |
| «Métricas de Colaboración» | h5 |  | CommunityHealthCard · l.268 |
| «Recomendaciones de Mejora» | h5 |  | CommunityHealthCard · l.294 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{community.name} {getTrendIcon(community.trendDirecti…} {community.activeMembers} de {community.memberCount} miembros a…» | `{() => { setSelectedCommunity(isSelected ? null : community.id); onCommunityClic…}` |  | CommunityRow · l.92 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DashboardCard` | title: Salud de Comunidades · subtitle: {data.communities.length} comunidades monitoreadas · priority: medium · ariaLabel: Community health dashboard card showing collaboration metrics |  | `id=community-health` | CommunityHealthCard · l.323 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Excelente» | CommunityHealthCard · l.55 |
| «Bueno» | CommunityHealthCard · l.56 |
| «Regular» | CommunityHealthCard · l.57 |
| «Necesita Atención» | CommunityHealthCard · l.58 |

**Values shown from data** (11)

- `{community.healthScore}` — CommunityRow · l.117
- `{community.collaborationIndex} %` — CommunityRow · l.148, when `isSelected`
- `{insight.message}` — CommunityRow · l.159, when `isSelected && each insights .filter(insight => insight.communityId =…`
- `{insight.actionSuggestion}` — CommunityRow · l.161, when `isSelected && each insights .filter(insight => insight.communityId =… && insight.actionSuggestion`
- `{data.overallScore}` — CommunityHealthCard · l.193
- `{overallHealth.label}` — CommunityHealthCard · l.196
- `{insight.message}` — CommunityHealthCard · l.229, when `insights.filter(insight => !insight.communityId).length > 0 && each insights .filter(insight => !insight.communityId)`
- `💡 {insight.actionSuggestion}` — CommunityHealthCard · l.231, when `insights.filter(insight => !insight.communityId).length > 0 && each insights .filter(insight => !insight.communityId) && insight.actionSuggestion`
- `{Math.round(data.communities.reduce(…} %` — CommunityHealthCard · l.274
- `{Math.round(data.communities.reduce(…} %` — CommunityHealthCard · l.286
- `{mainContent}` — CommunityHealthCard · l.323

**Other texts on screen** (14)

- «{community.activeMembers} de {community.memberCount} miembros activos» — CommunityRow · l.110
- «Actividad Reciente:» — CommunityRow · l.143, when `isSelected`
- «{community.recentActivity} acciones» — CommunityRow · l.144, when `isSelected`
- «Índice de Colaboración:» — CommunityRow · l.147, when `isSelected`
- «Puntuación basada en actividad, colaboración y participación» — CommunityHealthCard · l.189
- «Gráfico de tendencias disponible próximamente» — CommunityHealthCard · l.257
- «Datos de {chartData.healthTrends.length} puntos de medición» — CommunityHealthCard · l.258
- «Promedio de Participación:» — CommunityHealthCard · l.273
- «Comunidades Activas:» — CommunityHealthCard · l.279
- «{data.communities.filter(c => c.heal…} de {data.communities.length}» — CommunityHealthCard · l.280
- «Índice de Colaboración Promedio:» — CommunityHealthCard · l.285
- «Fomentar actividades colaborativas en comunidades con bajo puntaje» — CommunityHealthCard · l.301
- «Reconocer y destacar comunidades con alto rendimiento» — CommunityHealthCard · l.307
- «Implementar programas de mentorización entre comunidades» — CommunityHealthCard · l.313

### components/dashboard/unified/DashboardCard.tsx

Used by: `/admin/new-reporting`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | DashboardCard · l.140 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshCw]» · tooltip «Refresh data» · aria «{`Refresh ${title} data`}» | `{handleRefresh}` | `onRefresh` | `{isRefreshing \|\| loading}` |  | DashboardCard · l.153 |
| «[icon ChevronUp]» · aria «{`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}» | `{handleToggleExpand}` | `expandable` |  |  | DashboardCard · l.169 |
| «[icon MoreHorizontal]» · aria «{`${title} options menu`}» | `{() => onMenuAction('menu')}` | `onMenuAction` |  |  | DashboardCard · l.185 |
| «Try again» | `{handleRefresh}` | `!(loading) && error && onRefresh` |  |  | DashboardCard · l.210 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `LoadingSkeleton` |  | `loading` |  | DashboardCard · l.200 |
| `LoadingSkeleton` |  | `loading` |  | DashboardCard · l.201 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| focus | `cardRef.current.focus()` | DashboardCard · l.91 |

**Values shown from data** (3)

- `{subtitle}` — DashboardCard · l.144, when `subtitle`
- `{error}` — DashboardCard · l.208, when `!(loading) && error`
- `{expandedContent}` — DashboardCard · l.234, when `!(loading) && !(error) && !(isEmpty) && expandable && isExpanded && expandedContent`

**Other texts on screen** (6)

- «{title} dashboard card» (aria-label) — DashboardCard · l.119
- «Error loading data» — DashboardCard · l.207, when `!(loading) && error`
- «No data available» — DashboardCard · l.222, when `!(loading) && !(error) && isEmpty`
- «Check your filters or try refreshing» — DashboardCard · l.224, when `!(loading) && !(error) && isEmpty`
- «Last updated: {new Date(lastUpdated).toLocaleStrin…}» — DashboardCard · l.247, when `((lastUpdated \|\| updateFrequency)) && lastUpdated`
- «Updates {updateFrequency}» — DashboardCard · l.250, when `((lastUpdated \|\| updateFrequency)) && updateFrequency`

### components/dashboard/unified/KPISummaryCard.tsx

Used by: `/admin/new-reporting`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Resumen del Período ( {trends.period} )» | h4 |  | KPISummaryCard · l.163 |
| «Análisis Detallado» | h4 |  | KPISummaryCard · l.204 |
| «Tendencias de Cambio» | h5 |  | KPISummaryCard · l.209 |
| «Alertas y Recomendaciones» | h5 |  | KPISummaryCard · l.235 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `KPIMetricComponent` | configKey: totalUsers |  |  | KPISummaryCard · l.153 |
| `KPIMetricComponent` | configKey: activeUsers |  |  | KPISummaryCard · l.154 |
| `KPIMetricComponent` | configKey: avgCompletionRate |  |  | KPISummaryCard · l.155 |
| `KPIMetricComponent` | configKey: totalTimeSpent |  |  | KPISummaryCard · l.156 |
| `KPIMetricComponent` | configKey: coursesInProgress |  |  | KPISummaryCard · l.157 |
| `KPIMetricComponent` | configKey: atRiskUsers |  |  | KPISummaryCard · l.158 |
| `DashboardCard` | title: Indicadores Clave de Rendimiento · subtitle: Resumen general del período: {trends.period} · priority: high · ariaLabel: KPI summary dashboard card with key performance indicators |  | `id=kpi-summary` | KPISummaryCard · l.262 |

**Values shown from data** (9)

- `{Math.abs(change)} %` — getTrendIndicator · l.73
- `{formatValue(metric.value, metric.fo…}` — KPIMetricComponent · l.138
- `{metric.label}` — KPIMetricComponent · l.141
- `{formatValue(data.avgCompletionRate.…}` — KPISummaryCard · l.176
- `{formatValue(data.totalTimeSpent.val…}` — KPISummaryCard · l.184
- `{data.atRiskUsers.value}` — KPISummaryCard · l.190
- `{key.replace(/([A-Z])/g, ' $1').toLo…} :` — KPISummaryCard · l.213, when `each Object.entries(trends.percentageChanges)`
- `+ {change} %` — KPISummaryCard · l.222, when `each Object.entries(trends.percentageChanges)`
- `{mainContent}` — KPISummaryCard · l.262

**Other texts on screen** (8)

- «Usuarios Activos:» — KPISummaryCard · l.169
- «{data.activeUsers.value} de {data.totalUsers.value}» — KPISummaryCard · l.170
- «Tasa de Finalización:» — KPISummaryCard · l.175
- «Tiempo Promedio:» — KPISummaryCard · l.183
- «Usuarios en Riesgo:» — KPISummaryCard · l.189
- «Alto número de usuarios en riesgo requiere atención» — KPISummaryCard · l.240, when `data.atRiskUsers.value > 5`
- «Tasa de finalización por debajo del objetivo (60%)» — KPISummaryCard · l.246, when `data.avgCompletionRate.value < 60`
- «Excelente crecimiento en usuarios activos» — KPISummaryCard · l.252, when `data.activeUsers.change > 10`

### components/dashboard/unified/UnifiedDashboard.tsx

Used by: `/admin/new-reporting`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Dashboard» | h1 | `loading && !data.metadata` | UnifiedDashboard · l.194 |
| «Dashboard de Reportes» | h1 |  | UnifiedDashboard · l.212 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Actualizar» | `{handleRefresh}` |  | `{isRefreshing}` |  | UnifiedDashboard · l.226 |
| «Exportar» |  |  |  |  | UnifiedDashboard · l.248 |
| «[icon Settings]» |  |  |  |  | UnifiedDashboard · l.253 |
| «Reintentar» | `{handleRefresh}` | `error` |  |  | UnifiedDashboard · l.266 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `AdvancedFilters` | component | `{showFilters}` |  | UnifiedDashboard · l.239 |

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Dashboard actualizado correctamente» | `!showLoading && isRefreshing` | UnifiedDashboard · l.134 |
| error | «{errorMessage}» |  | UnifiedDashboard · l.141 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No authentication session» | `throw (shown by whoever catches it)` | `!session` | UnifiedDashboard · l.91 |
| «HTTP {response.status}: {response.statusText}» | `throw (shown by whoever catches it)` | `!response.ok` | UnifiedDashboard · l.116 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/communities/[*]` | `router.push` |  | UnifiedDashboard · l.171 |
| `/workspaces/[*]` | `router.push` | `cardConfiguration.includes('workspaceActivity') && data.workspaceActivity` | UnifiedDashboard · l.314 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `KPISummaryCard` |  | `cardConfiguration.includes('kpiSummary') && data.kpiSummary` |  | UnifiedDashboard · l.280 |
| `CommunityHealthCard` |  | `cardConfiguration.includes('communityHealth') && data.communityHealth` |  | UnifiedDashboard · l.292 |
| `WorkspaceActivityCard` |  | `cardConfiguration.includes('workspaceActivity') && data.workspaceActivity` |  | UnifiedDashboard · l.306 |
| `DashboardCard` | title: Rutas de Aprendizaje · subtitle: Progreso en rutas de aprendizaje personalizadas · priority: medium · error: Próximamente disponible | `cardConfiguration.includes('learningPaths')` | `id=learning-paths` | UnifiedDashboard · l.322 |
| `UpcomingSessionsCard` |  | `cardConfiguration.includes('upcomingSessions')` |  | UnifiedDashboard · l.344 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `errorMessage` | «Error al cargar el dashboard» | UnifiedDashboard · l.139 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | UnifiedDashboard · l.109 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, 5 * 60 * 1000)` | UnifiedDashboard · l.181 |

**Other texts on screen** (5)

- «Última actualización:» — UnifiedDashboard · l.216
- «( {data.metadata.loadTimeMs} ms)» — UnifiedDashboard · l.218, when `data.metadata?.loadTimeMs`
- «Error:» — UnifiedDashboard · l.264, when `error`
- «Integración disponible próximamente» — UnifiedDashboard · l.336, when `cardConfiguration.includes('learningPaths')`
- «Carga: {data.metadata.loadTimeMs} ms \| Filtros: {Object.keys(data.metadata.appliedFi…} \| Permisos: {data.metadata.permissions.join(', ')}» — UnifiedDashboard · l.350, when `data.metadata`

### components/dashboard/unified/UpcomingSessionsCard.tsx

Used by: `/admin/new-reporting`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{session.title}» | h4 | `!(isEmpty) && each sessions` | UpcomingSessionsCard · l.112 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todas las sesiones» | `{handleViewAll}` | `!(isEmpty)` |  |  | UpcomingSessionsCard · l.157 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `li` | «{session.title} [# {session.session_number}] {format(parseISO(session.session_dat…} {formatTime(session.start_time)} - …» · aria «{`Ver detalles de ${session.title}`}» | `{() => handleSessionClick(session.id)}` | `!(isEmpty) && each sessions` | UpcomingSessionsCard · l.103 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No hay sesión de autenticación» | `throw (shown by whoever catches it)` | `!authSession?.access_token` | UpcomingSessionsCard · l.40 |
| «Error al cargar sesiones» | `throw (shown by whoever catches it)` | `!response.ok` | UpcomingSessionsCard · l.54 |
| «Error al cargar sesiones» | `setError` |  | UpcomingSessionsCard · l.62 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/consultor/sessions/[*]` | `router.push` |  | handleSessionClick · l.77 |
| `/consultor/sessions` | `router.push` |  | handleViewAll · l.81 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DashboardCard` | title: Próximas Sesiones · subtitle: Sesiones programadas y en progreso · priority: high · ariaLabel: Tarjeta de próximas sesiones de consultoría |  | `id=upcoming-sessions` | UpcomingSessionsCard · l.171 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {authSession.access_token}» | UpcomingSessionsCard · l.47 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=list` | UpcomingSessionsCard · l.97 |

**Values shown from data** (5)

- `# {session.session_number}` — UpcomingSessionsCard · l.116, when `!(isEmpty) && each sessions && session.recurrence_group_id && session.session_number`
- `{format(parseISO(session.session_dat…}` — UpcomingSessionsCard · l.123, when `!(isEmpty) && each sessions`
- `{formatTime(session.start_time)} - {formatTime(session.end_time)}` — UpcomingSessionsCard · l.127, when `!(isEmpty) && each sessions`
- `{badge.label}` — UpcomingSessionsCard · l.134, when `!(isEmpty) && each sessions`
- `{mainContent}` — UpcomingSessionsCard · l.171

**Other texts on screen** (3)

- «No tiene sesiones próximas programadas» — UpcomingSessionsCard · l.92, when `isEmpty`
- «Lista de próximas sesiones» (aria-label) — UpcomingSessionsCard · l.97, when `!(isEmpty)`
- «⚠️ Informe pendiente» — UpcomingSessionsCard · l.149, when `!(isEmpty) && each sessions && isPendingReport`

### components/dashboard/unified/WorkspaceActivityCard.tsx

Used by: `/admin/new-reporting`

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{workspace.workspaceName}» | h4 |  | WorkspaceRow · l.147 |
| «Tipos de Actividad» | h5 | `showDetails` | WorkspaceRow · l.180 |
| «Actividad Reciente» | h5 | `showDetails && workspace.recentActivity && workspace.recentActivity.length > 0` | WorkspaceRow · l.202 |
| «Actividad Colaborativa» | h3 |  | WorkspaceActivityCard · l.234 |
| «Espacios Más Activos ( {data.mostActiveWorkspaces.length} )» | h4 |  | WorkspaceActivityCard · l.287 |
| «Análisis Detallado de Actividad» | h4 |  | WorkspaceActivityCard · l.312 |
| «Línea de Tiempo de Actividad» | h5 |  | WorkspaceActivityCard · l.316 |
| «Métricas de Participación» | h5 |  | WorkspaceActivityCard · l.333 |
| «Patrones de Colaboración» | h5 |  | WorkspaceActivityCard · l.360 |
| «💡 Recomendaciones para Mejorar la Colaboración» | h5 |  | WorkspaceActivityCard · l.406 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{workspace.workspaceName} {workspace.uniqueParticipants} participantes activos {totalActivities} actividades [{activity…» | `{() => { setShowDetails(!showDetails); onWorkspaceClick?.(workspace.workspaceId)…}` |  | WorkspaceRow · l.138 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select |  | «24 horas», «7 días», «30 días» |  |  | WorkspaceActivityCard · l.244 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!config \|\| count === 0` | WorkspaceRow · l.186 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `EngagementMetric` | label: Total de Actividades |  |  | WorkspaceActivityCard · l.258 |
| `EngagementMetric` | label: Este Período |  |  | WorkspaceActivityCard · l.264 |
| `EngagementMetric` | label: Promedio Participantes |  |  | WorkspaceActivityCard · l.270 |
| `EngagementMetric` | label: Volumen de Mensajes |  |  | WorkspaceActivityCard · l.277 |
| `EngagementMetric` | label: Mensajes Enviados |  |  | WorkspaceActivityCard · l.337 |
| `EngagementMetric` | label: Documentos Compartidos |  |  | WorkspaceActivityCard · l.343 |
| `EngagementMetric` | label: Asistencia a Reuniones |  |  | WorkspaceActivityCard · l.349 |
| `DashboardCard` | title: Actividad en Espacios Colaborativos · subtitle: {data.totalActivities} actividades registradas · priority: medium · ariaLabel: Workspace activity dashboard card showing collaborative engagement metrics |  | `id=workspace-activity` | WorkspaceActivityCard · l.426 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `activityTypeConfig` | «Mensajes», «Documentos», «Reuniones», «Menciones», «Colaboraciones» | WorkspaceActivityCard · l.60 |

**Values shown from data** (11)

- `{value}% / {value.toLocaleString()}` — EngagementMetric · l.124
- `{label}` — EngagementMetric · l.127
- `{totalActivities}` — WorkspaceRow · l.156
- `{config.label} :` — WorkspaceRow · l.192, when `showDetails && each Object.entries(workspace.activityTypes)`
- `{count}` — WorkspaceRow · l.193, when `showDetails && each Object.entries(workspace.activityTypes)`
- `{activity.userName}` — WorkspaceRow · l.209, when `showDetails && workspace.recentActivity && workspace.recentActivity.length > 0 && each workspace.recentActivity.slice(0, 3)`
- `{new Date(activity.timestamp).toLoca…}` — WorkspaceRow · l.211, when `showDetails && workspace.recentActivity && workspace.recentActivity.length > 0 && each workspace.recentActivity.slice(0, 3)`
- `{data.mostActiveWorkspaces.length}` — WorkspaceActivityCard · l.366
- `{Math.round(data.totalActivities / d…}` — WorkspaceActivityCard · l.372
- `{data.engagementMetrics.averageParti…}` — WorkspaceActivityCard · l.381
- `{mainContent}` — WorkspaceActivityCard · l.426

**Other texts on screen** (15)

- «{workspace.uniqueParticipants} participantes activos» — WorkspaceRow · l.150
- «actividades» — WorkspaceRow · l.159
- «En vivo» — WorkspaceActivityCard · l.238, when `isLiveMode`
- «No hay actividad colaborativa registrada» — WorkspaceActivityCard · l.299, when `!(data.mostActiveWorkspaces.length > 0)`
- «Los espacios colaborativos aparecerán aquí cuando haya actividad» — WorkspaceActivityCard · l.301, when `!(data.mostActiveWorkspaces.length > 0)`
- «Gráfico de actividad disponible próximamente» — WorkspaceActivityCard · l.322
- «{data.activityTimeline.length} puntos de datos disponibles» — WorkspaceActivityCard · l.323
- «Espacios Activos:» — WorkspaceActivityCard · l.365
- «Promedio Actividades/Espacio:» — WorkspaceActivityCard · l.371
- «Participación Promedio:» — WorkspaceActivityCard · l.380
- «Tendencia:» — WorkspaceActivityCard · l.387, when `activityTrend`
- «• Considerar actividades que fomenten la participación grupal» — WorkspaceActivityCard · l.411, when `data.engagementMetrics.averageParticipantsPerActivity < 3`
- «• Promover el intercambio de recursos y documentos entre usuarios» — WorkspaceActivityCard · l.414, when `data.engagementMetrics.documentShares < 10`
- «• Crear más espacios colaborativos temáticos para aumentar la participación» — WorkspaceActivityCard · l.417, when `data.mostActiveWorkspaces.length < 3`
- «• Reconocer y destacar las comunidades más activas como ejemplo» — WorkspaceActivityCard · l.419

### components/layout/Header.tsx

Used by: `/dashboard-old`

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Hub de Transformación» | `/` |  |  | Header · l.62 |
| «Hub de Transformación» |  |  |  | Header · l.63 |
| «Iniciar Sesión» | `/login` | `!(isLoggedIn)` |  | Header · l.96 |
| «Iniciar Sesión» |  | `!(isLoggedIn)` |  | Header · l.97 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NotificationBell` |  | `isLoggedIn` |  | Header · l.85 |

**Other texts on screen** (3)

- «Sin colegio» (title) — Header · l.71, screen size: `hidden sm:flex`
- «{schoolName} / Sin colegio» — Header · l.71, screen size: `hidden sm:flex`
- «{localUser?.email?.substring(0, 2).t…} / US» — Header · l.89, when `isLoggedIn`

**Reads and writes the database directly:** `table:profiles` (select)

### components/learning-paths/LearningPathCard.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{name}» | h3 |  | LearningPathCard · l.111 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Nivel 2 / 1 [Completado] {name} [{description}] Progreso {Math.round(progressPercentage)} % {completedCourses} de {tota…» | `{onClick}` |  | LearningPathCard · l.72 |

**Values shown from data** (3)

- `{description}` — LearningPathCard · l.117, when `description`
- `{Math.round(progressPercentage)} %` — LearningPathCard · l.133
- `{formatDistanceToNow(new Date(assign…}` — LearningPathCard · l.165

**Other texts on screen** (5)

- «Nivel 2 / 1» — LearningPathCard · l.92
- «Completado» — LearningPathCard · l.105, when `isCompleted`
- «Progreso» — LearningPathCard · l.131
- «{completedCourses} de {totalCourses} cursos» — LearningPathCard · l.161
- «Continuar aprendiendo / Comenzar ruta» — LearningPathCard · l.185, when `!isCompleted`

### components/notifications/NotificationBell.tsx

Used by: `/dashboard-old`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[99+ / {unreadCount}]» · aria «{`Notificaciones${unreadCount > 0 ? ` (${unreadCount} ${unreadCount === 1 ? 'no …}» | `{handleBellClick}` |  |  |  | NotificationBell · l.180 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NotificationDropdown` |  | `isOpen` |  | NotificationBell · l.223 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LOAD_ERROR` | «No se pudieron cargar las notificaciones» | l.9 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | NotificationBell · l.43 |
| «{LOAD_ERROR} (código {response.status}).» | NotificationBell · l.50 |
| «no leída» | NotificationBell · l.192 |
| «no leídas» | NotificationBell · l.192 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | fetchNotifications · l.62 |
| listener | `document.addEventListener('mousedown')` | NotificationBell · l.149 |
| timer | `setInterval(…, REFRESH_INTERVAL)` | NotificationBell · l.161 |

### components/notifications/NotificationDropdown.tsx

Used by: `/dashboard-old`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Notificaciones» | h3 |  | NotificationDropdown · l.182 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshIcon]» · tooltip «Actualizar» | `{onRefresh}` |  | `{loading}` |  | NotificationDropdown · l.199 |
| «Marcar todas como leídas» | `{onMarkAllAsRead}` | `unreadCount > 0` |  |  | NotificationDropdown · l.210 |
| «Intentar de nuevo» | `{onRefresh}` | `error` |  |  | NotificationDropdown · l.244 |
| «Ver todas las notificaciones» | `{handleViewAll}` | `notifications.length > 0` |  |  | NotificationDropdown · l.357 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon CogIcon]» · aria «Configuración de notificaciones» | `/configuracion/notificaciones` |  | `testid=notification-dropdown-settings` | NotificationDropdown · l.187 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{notification.title} [{notification.description}] {getRelativeTime(notification.create…} [[Admin] [Tareas] [Cursos] [Me…» | `{() => handleNotificationClick(notification)}` | `!loading && !error && notifications.length > 0 && each notifications` | NotificationDropdown · l.268 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Sesión no válida» | `notification.related_url && !session?.user` | handleNotificationClick · l.106 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `{notification.related_url!}` | `router.push` | `notification.related_url` | handleNotificationClick · l.116 |
| `{notification.related_url}` | `router.push` | `notification.related_url && notification.related_url` | handleNotificationClick · l.126 |
| `{fallbackUrl}` | `router.push` | `!(notification.related_url)` | handleNotificationClick · l.166 |
| `/notifications` | `router.push` |  | handleViewAll · l.174 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CogIcon` | aria-hidden: true |  |  | NotificationDropdown · l.195 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getRelativeTime()` | «ahora mismo», «hace {minutes} min», «hace {hours}h», «hace {days}d» | getRelativeTime · l.82 |

**Values shown from data** (4)

- `{error}` — NotificationDropdown · l.243, when `error`
- `{notification.title}` — NotificationDropdown · l.295, when `!loading && !error && notifications.length > 0 && each notifications`
- `{notification.description}` — NotificationDropdown · l.303, when `!loading && !error && notifications.length > 0 && each notifications && notification.description`
- `{getRelativeTime(notification.create…}` — NotificationDropdown · l.312, when `!loading && !error && notifications.length > 0 && each notifications`

**Other texts on screen** (4)

- «{unreadCount} notificación es sin leer» — NotificationDropdown · l.223, when `unreadCount > 0`
- «Cargando notificaciones...» — NotificationDropdown · l.235, when `loading && notifications.length === 0`
- «No tienes notificaciones» — NotificationDropdown · l.257, when `!loading && !error && notifications.length === 0`
- «[Admin] [Tareas] [Cursos] [Mensajes] [Social] [Feedback] [Sistema] [Workspace]» — NotificationDropdown · l.318, when `!loading && !error && notifications.length > 0 && each notifications && notification.notification_type`

### components/ui/dialog.tsx

Used by: `/dashboard`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### constants/externalSchools.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `EXTERNAL_SCHOOLS` | «Escola Virolai», «Escola Sadako», «Institut Angeleta Ferrer», «Institut Escola Les Vinyes», «Escola La Maquinista», «Institut Escola El Puig», «Escola Octavio Paz» | l.7 |

### constants/toastStyles.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `baseStyle` | «0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)», «Inter, system-ui, -apple-system, sans-serif» | l.20 |

### lib/services/badgeService.ts

Used by: `/dashboard`

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Badge system not configured» | BadgeService · l.60 |
| «Badge already awarded» | BadgeService · l.69 |
| «Badge awarded successfully» | BadgeService · l.77 |
| «Failed to award badge» | BadgeService · l.83 |

**Reads and writes the database directly:** `rpc:award_course_completion_badge`, `table:user_badges` (select), `table:user_badges_with_details` (select)

### lib/services/communityWorkspace.js

Used by: `/dashboard`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se proporcionó ningún archivo» | `throw (shown by whoever catches it)` | `!file` | uploadCommunityImage · l.36 |
| «El archivo debe ser menor a 5MB» | `throw (shown by whoever catches it)` | `file.size > maxSize` | uploadCommunityImage · l.42 |
| «Solo se permiten imágenes (JPEG, PNG, WebP)» | `throw (shown by whoever catches it)` | `!allowedTypes.includes(file.type)` | uploadCommunityImage · l.48 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canEdit = roles.some(role => role.role_type === 'admin' \|\| role.community_id === workspace.community_id )` | canEditWorkspace · l.155 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `communityWorkspaceService` | «No se proporcionó ningún archivo», «El archivo debe ser menor a 5MB», «Solo se permiten imágenes (JPEG, PNG, WebP)», «Error al subir la imagen» | l.3 |

**Reads and writes the database directly:** `bucket:community-images` (getPublicUrl, remove, upload), `table:community_workspaces` (select, update), `table:user_roles` (select)

### lib/utils/session-ui-helpers.tsx

Used by: `/admin/new-reporting`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `badges` | «Borrador», «Pendiente Aprobación», «Programada», «En Progreso», «Pendiente Informe», «Completada», «Cancelada» | getStatusBadge · l.23 |

### src/components/CheckUserRole.tsx

Used by: `/dashboard-old`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «User Information» | h2 |  | CheckUserRole · l.63 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No authenticated user found» | `setError` | `!session?.user` | checkUserRole · l.21 |
| «User data not found» | `setError` | `!(user)` | checkUserRole · l.40 |
| «An unknown error occurred» | `setError` |  | checkUserRole · l.43 |

**Other texts on screen** (6)

- «Checking user role...» — CheckUserRole · l.54, when `loading`
- «Error: {error}» — CheckUserRole · l.58, when `error`
- «Email:» — CheckUserRole · l.65
- «Not available» — CheckUserRole · l.65
- «Role:» — CheckUserRole · l.66
- «Not available» — CheckUserRole · l.66

### types/roles.ts

Used by: `/admin/new-reporting`, `/dashboard-old`, `/dashboard`

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

Used by: `/admin/new-reporting`, `/dashboard`

**Access checks in the code** (7)

| Line of code | Where |
|---|---|
| `return await isGlobalAdmin(supabase, userId);` | hasAdminPrivileges · l.161 |
| `userRoles = await getUserRoles(supabase, userId)` | getEffectiveRoleAndStatus · l.1151 |
| `highestRole = getHighestRole(userRoles)` | getEffectiveRoleAndStatus · l.1152 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:profiles` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

### utils/toastUtils.ts

Used by: `/dashboard`

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{message}» |  | toastSuccess · l.36 |

### utils/workspaceUtils.ts

Used by: `/dashboard`

**Reads and writes the database directly:** `table:community_workspaces` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/badges/award-and-announce` | `pages/api/badges/award-and-announce.ts` | POST | **no screen** |  |
| `/api/course-proposals/[id]` | `pages/api/course-proposals/[id].ts` | DELETE, PUT | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `components/course-proposals/CourseProposalSection.tsx` |
| `/api/course-proposals` | `pages/api/course-proposals/index.ts` | GET, POST | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `components/course-proposals/CourseProposalSection.tsx`, `tests/e2e/panel-pin.spec.ts` |
| `/api/dashboard/stats` | `pages/api/dashboard/stats.ts` | GET | `/dashboard` | `pages/dashboard.tsx`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/panel-pin.spec.ts` |
| `/api/dashboard/unified` | `pages/api/dashboard/unified.ts` | GET | `/admin/new-reporting` | `components/dashboard/unified/UnifiedDashboard.tsx` |
| `/api/youtube/latest` | `pages/api/youtube/latest.ts` | GET | `/dashboard` | `pages/dashboard.tsx`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/panel-pin.spec.ts` |

