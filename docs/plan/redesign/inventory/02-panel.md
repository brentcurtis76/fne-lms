# Panel (Mi Panel)

Area `02-panel`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `9b113df42` (2026-11-17).

1 screen files, 6 API files, 24 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/dashboard` | `pages/dashboard.tsx` | 1098 | Mi Panel |  |

## /dashboard

File `pages/dashboard.tsx` · 1098 lines · frame: MainLayout

### Who reaches it

- Menu: «Mi Panel» → `/dashboard` — everyone signed in (`Sidebar.tsx` l.117)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.277 `router.push → /login  (when !session?.user)`
  - l.286 `adminRole = metadataHasRole(userData.user.user_metadata, 'admin')`
  - l.326 `router.push → /change-password  (when !userError && userData?.user && profileData.must_change_password === true)`
  - l.332 `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id)`
  - l.346 `roles = await getUserRoles(supabase, userData.user.id)`
  - l.447 `router.push → /login`
  - l.458 `router.push → /login`
  - l.994 `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')`
  - l.995 `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')`
- Linked from: `components/DynamicFavicon.tsx:17`, `components/LessonBreadcrumb.tsx:112`, `components/auth/AuthWrapper.tsx:54`, `components/auth/AuthWrapper.tsx:67`, `components/auth/ProtectedRoute.tsx:43`, `components/layout/Sidebar.tsx:120`, `components/notifications/ModernNotificationCenter.tsx:303`, `components/notifications/ModernNotificationCenter.tsx:328`, `components/notifications/NotificationDropdown.tsx:132`, `components/notifications/NotificationDropdown.tsx:157`, `components/workspace/WorkspaceSidebar.tsx:172`, `lib/auth/forced-password-change.ts:142` and 120 more
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/footer-heading-order.spec.ts`, `tests/e2e/look-frame.spec.ts`, `tests/e2e/look-switch.spec.ts`, `tests/e2e/notification-settings.spec.ts`, `tests/e2e/pasantias-leads-admin.spec.ts`; browser tests CI skips: `tests/e2e/notification-bounce.spec.ts`, `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/notification-insert-boundary.spec.ts`, `tests/e2e/panel-pin.spec.ts`, `tests/qa/auth-redirects.spec.ts`.
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
| «¡Hola, {profileName?.split(' ')[0]} / Usuario !» | h1 |  | Dashboard · l.506 |
| «Mi Comunidad de Crecimiento» | h2 | `userRoles.some(role => role.community_id)` | Dashboard · l.570 |
| «{selectedRole.school?.name} / {selectedRole.community!.name}» | h3 | `userRoles.some(role => role.community_id) && communityExpanded` | Dashboard · l.640 |
| «Últimas Noticias» | h2 |  | Dashboard · l.727 |
| «{article.title}» | h3 | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` | Dashboard · l.772 |
| «Videos Recientes» | h2 |  | Dashboard · l.796 |
| «{video.title}» | h3 | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` | Dashboard · l.840 |
| «{dashboardStats?.statsLabel} / Estadísticas de la Plataforma» | h2 |  | Dashboard · l.859 |
| «{dashboardStats.mostCompletedCourse.…}» | h3 | `!(loadingStats) && dashboardStats?.mostCompletedCourse` | Dashboard · l.885 |
| «{dashboardStats.topLearner.name}» | h3 | `!(loadingStats) && dashboardStats?.topLearner` | Dashboard · l.935 |
| «Próximos Cursos» | h2 | `!loadingUpcoming && upcomingCourses.length > 0` | Dashboard · l.972 |
| «Mis Rutas de Aprendizaje» | h2 | `learningPaths.length > 0` | Dashboard · l.1019 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Mi Comunidad de Crecimiento {selectedRole.school?.name} / {selectedRole.community!.name} • {members.length} miembros {member.first_name?.charAt(0)} / U [+ {members.length - 4}]» | `{() => setCommunityExpanded(!communityExpanded)}` | `userRoles.some(role => role.community_id)` |  |  | Dashboard · l.553 |
| «{comm.school?.name} / {comm.community?.name}» | `{(e) => { e.stopPropagation(); setSelectedCommunityId(comm.community_id!); }}` | `userRoles.some(role => role.community_id) && communityExpanded && userCommunities.length > 1 && each userCommunities` |  |  | Dashboard · l.620 |
| «[icon Settings]» · tooltip «Configuración» | `{(e) => { e.stopPropagation(); setSelectedWorkspace(workspace); setShowWorkspace…}` | `userRoles.some(role => role.community_id) && communityExpanded && canEditWorkspaceWithRoles(userRoles, selectedRole.community_id)` |  |  | Dashboard · l.646 |
| «{member.first_name?.charAt(0)} / U {[member.first_name, member.last_nam…} / {(member as any).name} / Usuario [{roleLabel}] [{getExternalSchoolLabel(member.exter…}] [Tú]» | `{() => { setSelectedMember(member); setShowMemberProfile(true); }}` | `userRoles.some(role => role.community_id) && communityExpanded && each members` |  |  | Dashboard · l.672 |

**Links** (7)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Mi Perfil» | `/profile` | screen size: `hidden sm:flex` |  | Dashboard · l.520 |
| «Ver Espacio Completo →» | `/community/workspace` | `userRoles.some(role => role.community_id) && communityExpanded` |  | Dashboard · l.658 |
| «Ver todas» | `/noticias` |  |  | Dashboard · l.729 |
| «{formatTimeAgo(article.display_date …} {article.title} {getExcerpt(article.content_html)}» | `/noticias/[*]` (new tab) | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` |  | Dashboard · l.750 |
| «Ver canal» | `https://www.youtube.com/@NuevaEducacionFundacion` (new tab) |  |  | Dashboard · l.798 |
| «{video.title} {formatTimeAgo(video.publishedAt)}» | `https://www.youtube.com/watch?v=[*]` (new tab) | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | Dashboard · l.820 |
| «Ver todas» | `/mi-aprendizaje` | `learningPaths.length > 0` |  | Dashboard · l.1020 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `LearningPathCard` |  | `{() => router.push('/mi-aprendizaje/ruta/${path.id}')}` | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` | Dashboard · l.1030 |

**Embedded media** (6)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {workspace.custom_name \|\| selectedRole.community!.name} · {workspace.image_url} | `userRoles.some(role => role.community_id) && workspace?.image_url` |  | Dashboard · l.559 |
| img · {member.avatar_url} | `userRoles.some(role => role.community_id) && each members.slice(0, 4) && member.avatar_url` |  | Dashboard · l.583 |
| img · {member.avatar_url} | `userRoles.some(role => role.community_id) && communityExpanded && each members && member.avatar_url` |  | Dashboard · l.681 |
| img · alt {article.title} · {article.featured_image} | `!(loadingNews) && newsArticles.length > 0 && each newsArticles && article.featured_image` |  | Dashboard · l.761 |
| img · alt {video.title} · {video.thumbnail} | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | Dashboard · l.828 |
| img · {dashboardStats.topLearner.avatar_url} | `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.avatar_url` |  | Dashboard · l.922 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsModal` | component | `{showWorkspaceSettings}` |  | Dashboard · l.1064 |
| `MemberProfileModal` | component | `{showMemberProfile}` |  | Dashboard · l.1086 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Contraseña actualizada exitosamente» | `passwordChangeSuccess === 'true'` | Dashboard · l.188 |

**Moves to another page from code** (8)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.277 |
| `/profile?from=dashboard&error=profile-fetch-failed` | `router.push` | `!userError && userData?.user && !profileData` | checkSession · l.321 |
| `/change-password` | `router.push` | `!userError && userData?.user && profileData.must_change_password === true` | checkSession · l.326 |
| `/login` | `router.push` |  | checkSession · l.447 |
| `/login` | `router.push` |  | handleLogout · l.458 |
| `/student/course/[*]` | `router.push` | `inProgressCourses.length > 0` | Dashboard · l.1011 |
| `/mi-aprendizaje/ruta/[*]` | `router.push` | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` | Dashboard · l.1043 |
| `/student/course/[*]` | `router.push` | `openCourses.length > 0` | Dashboard · l.1056 |

**Access checks in the code** (5)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData.user.user_metadata, 'admin')` | checkSession · l.286 |
| `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id)` | checkSession · l.332 |
| `roles = await getUserRoles(supabase, userData.user.id)` | checkSession · l.346 |
| `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')` | Dashboard · l.994 |
| `metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor')` | Dashboard · l.995 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!selectedRole \|\| !selectedRole.community` | Dashboard · l.544 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | Dashboard · l.463 |
| `MainLayout` |  |  |  | Dashboard · l.484 |
| `Avatar` |  |  |  | Dashboard · l.499 |
| `UpcomingCourseCard` |  | `!loadingUpcoming && upcomingCourses.length > 0 && each upcomingCourses` |  | Dashboard · l.985 |
| `CourseProposalSection` |  | `(metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor') \|\| userRoles.some(r => r.role_type === 'admin' \|\| r…` |  | Dashboard · l.997 |
| `BadgesSection` |  | `user?.id` |  | Dashboard · l.1002 |
| `NetflixCourseRow` | title: Continuar Aprendiendo · emptyMessage: No tienes cursos en progreso | `inProgressCourses.length > 0` |  | Dashboard · l.1007 |
| `LearningPathCard` |  | `learningPaths.length > 0 && each learningPaths.slice(0, 3)` |  | Dashboard · l.1030 |
| `NetflixCourseRow` | title: Mis Cursos Abiertos · emptyMessage: No tienes cursos asignados | `openCourses.length > 0` |  | Dashboard · l.1052 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatTimeAgo()` | «Hoy», «Ayer», «Hace {diffDays} días», «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.89 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Hoy» | formatTimeAgo · l.89 |
| «Ayer» | formatTimeAgo · l.90 |
| «Hace {diffDays} días» | formatTimeAgo · l.91 |
| «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.92 |
| «Bearer {statsSession.access_token}» | Dashboard · l.238 |
| «Sin instructor» | Dashboard · l.379 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-password-change-success` | Dashboard · l.185 |
| storage | `sessionStorage: fne-avatar-cache` | checkSession · l.291 |
| storage | `localStorage: rememberMe` | handleLogout · l.456 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.457 |

**Values shown from data** (6)

- `{getExternalSchoolLabel(profileData.…}` — Dashboard · l.515, when `userRole === 'consultor' && profileData?.external_school_affiliation`
- `{dashboardStats.mostCompletedCourse.…}` — Dashboard · l.894, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- `{dashboardStats.topLearner.name.char…}` — Dashboard · l.929, when `!(loadingStats) && dashboardStats?.topLearner && !(dashboardStats.topLearner.avatar_url)`
- `{dashboardStats.topLearner.role}` — Dashboard · l.939, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.role`
- `{dashboardStats.topLearner.school_na…}` — Dashboard · l.944, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.school_name`
- `{dashboardStats.topLearner.completed…}` — Dashboard · l.949, when `!(loadingStats) && dashboardStats?.topLearner`

**Other texts on screen** (15)

- «Cargando...» — Dashboard · l.476, when `loading`
- «Bienvenido de vuelta al hub de transformación de tu colegio» — Dashboard · l.510
- «Seleccionar comunidad:» — Dashboard · l.617, when `userRoles.some(role => role.community_id) && communityExpanded && userCommunities.length > 1`
- «No hay noticias disponibles» — Dashboard · l.784, when `!(loadingNews) && !(newsArticles.length > 0)`
- «No hay videos disponibles» — Dashboard · l.852, when `!(loadingVideos) && !(youtubeVideos.length > 0)`
- «Educadores Activos» — Dashboard · l.864
- «en tu alcance» — Dashboard · l.872
- «Curso Más Completado» — Dashboard · l.877
- «Relator: {dashboardStats.mostCompletedCourse.…}» — Dashboard · l.889, when `!(loadingStats) && dashboardStats?.mostCompletedCourse && dashboardStats.mostCompletedCourse.instructor_name`
- «completaciones» — Dashboard · l.897, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- «Sin datos disponibles» — Dashboard · l.901, when `!(loadingStats) && !(dashboardStats?.mostCompletedCourse)`
- «Usuario Destacado» — Dashboard · l.907
- «cursos completados» — Dashboard · l.952, when `!(loadingStats) && dashboardStats?.topLearner`
- «Sin datos disponibles» — Dashboard · l.958, when `!(loadingStats) && !(dashboardStats?.topLearner)`
- «Cursos que podrás tomar próximamente» — Dashboard · l.973, when `!loadingUpcoming && upcomingCourses.length > 0`

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
| `/api/dashboard/stats` | GET | `pages/dashboard.tsx:240` |
| `/api/learning-paths/my-paths` | GET | `pages/dashboard.tsx:433` |
| `/api/news` | GET | `pages/dashboard.tsx:199` |
| `/api/upcoming-courses` | GET | `pages/dashboard.tsx:258` |
| `/api/youtube/latest` | GET | `pages/dashboard.tsx:217` |

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
| `baseStyle` | «Inter, system-ui, -apple-system, sans-serif» | l.29 |

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
| «No se proporcionó ningún archivo» | `throw (shown by whoever catches it)` | `!file` | uploadCommunityImage · l.54 |
| «El archivo debe ser menor a 5MB» | `throw (shown by whoever catches it)` | `file.size > maxSize` | uploadCommunityImage · l.60 |
| «Solo se permiten imágenes (JPEG, PNG, WebP)» | `throw (shown by whoever catches it)` | `!allowedTypes.includes(file.type)` | uploadCommunityImage · l.66 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `canEdit = canEditWorkspaceWithRoles(roles, workspace.community_id)` | canEditWorkspace · l.173 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `communityWorkspaceService` | «No se proporcionó ningún archivo», «El archivo debe ser menor a 5MB», «Solo se permiten imágenes (JPEG, PNG, WebP)», «Error al subir la imagen» | l.21 |

**Reads and writes the database directly:** `bucket:community-images` (getPublicUrl, remove, upload), `table:community_workspaces` (select, update), `table:user_roles` (select)

### types/roles.ts

Used by: `/dashboard`

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

Used by: `/dashboard`

**Access checks in the code** (5)

| Line of code | Where |
|---|---|
| `return await isGlobalAdmin(supabase, userId);` | hasAdminPrivileges · l.161 |
| `userRoles = await getUserRoles(supabase, userId)` | getEffectiveRoleAndStatus · l.1151 |
| `highestRole = getHighestRole(userRoles)` | getEffectiveRoleAndStatus · l.1152 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |
| `isAdmin = await hasAdminPrivileges(supabase, userId)` | getEffectiveRoleAndStatus · l.1158 |

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
| `/api/badges/award-and-announce` | `pages/api/badges/award-and-announce.ts` | POST | **no screen** | `__tests__/api/cursos-admin-only-routes.test.ts` |
| `/api/course-proposals/[id]` | `pages/api/course-proposals/[id].ts` | DELETE, PUT | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `components/course-proposals/CourseProposalSection.tsx` |
| `/api/course-proposals` | `pages/api/course-proposals/index.ts` | GET, POST | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `components/course-proposals/CourseProposalSection.tsx`, `tests/e2e/panel-pin.spec.ts` |
| `/api/dashboard/stats` | `pages/api/dashboard/stats.ts` | GET | `/dashboard` | `pages/dashboard.tsx`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/panel-pin.spec.ts` |
| `/api/dashboard/unified` | `pages/api/dashboard/unified.ts` | GET | **no screen** | `components/dashboard/unified/UnifiedDashboard.tsx` |
| `/api/youtube/latest` | `pages/api/youtube/latest.ts` | GET | `/dashboard` | `pages/dashboard.tsx`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/panel-pin.spec.ts` |

