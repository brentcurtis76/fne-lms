# Panel (Mi Panel)

Area `02-panel`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `d701100d0` (2026-11-18).

1 screen files, 6 API files, 56 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/dashboard` | `pages/dashboard.tsx` | 100 | Mi Panel |  |

## /dashboard

File `pages/dashboard.tsx` · 100 lines · frame: MainLayout

### Who reaches it

- Menu: «Mi Panel» → `/dashboard` — everyone signed in (`Sidebar.tsx` l.117)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/DynamicFavicon.tsx:17`, `components/LessonBreadcrumb.tsx:112`, `components/auth/AuthWrapper.tsx:54`, `components/auth/AuthWrapper.tsx:67`, `components/auth/ProtectedRoute.tsx:43`, `components/layout/Sidebar.tsx:120`, `components/notifications/ModernNotificationCenter.tsx:303`, `components/notifications/ModernNotificationCenter.tsx:328`, `components/notifications/NotificationDropdown.tsx:132`, `components/notifications/NotificationDropdown.tsx:157`, `components/ui/kit/Button.typecheck.tsx:24`, `components/workspace/WorkspaceSidebar.tsx:172` and 122 more
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/footer-heading-order.spec.ts`, `tests/e2e/look-frame.spec.ts`, `tests/e2e/look-panel.spec.ts`, `tests/e2e/look-switch.spec.ts`, `tests/e2e/notification-settings.spec.ts`, `tests/e2e/pasantias-leads-admin.spec.ts`; browser tests CI skips: `tests/e2e/notification-bounce.spec.ts`, `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/notification-insert-boundary.spec.ts`, `tests/e2e/panel-pin.spec.ts`, `tests/qa/auth-redirects.spec.ts`; unit tests of the page: `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`.
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

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsModal` | component | `{showWorkspaceSettings}` |  | Dashboard · l.80 |
| `MemberProfileModal` | component | `{showMemberProfile}` |  | Dashboard · l.91 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | Dashboard · l.38 |
| `PanelSkeleton` |  | `loading && isNuevo` |  | Dashboard · l.49 |
| `MainLayout` |  |  |  | Dashboard · l.66 |
| `PanelNuevo` |  | `isNuevo` |  | Dashboard · l.76 |
| `PanelClasico` |  | `!(isNuevo)` |  | Dashboard · l.76 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `BREADCRUMBS_NUEVO` | «Mi Panel» | l.14 |

**Other texts on screen** (1)

- «Cargando...» — Dashboard · l.54, when `loading && !(isNuevo)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/badges/BadgeCard.tsx`
- `components/badges/BadgeIcon.tsx`
- `components/badges/BadgesSection.tsx`
- `components/badges/useBadges.ts`
- `components/common/Avatar.tsx`
- `components/community/MemberProfileModal.tsx`
- `components/community/MemberProfileNuevo.tsx`
- `components/community/WorkspaceSettingsModal.tsx`
- `components/community/WorkspaceSettingsNuevo.tsx`
- `components/community/memberProfileText.ts`
- `components/community/useWorkspaceSettings.ts`
- `components/course-proposals/ConfirmDialog.tsx`
- `components/course-proposals/ConfirmDialogNuevo.tsx`
- `components/course-proposals/CourseProposalCard.tsx`
- `components/course-proposals/CourseProposalFormNuevo.tsx`
- `components/course-proposals/CourseProposalModal.tsx`
- `components/course-proposals/CourseProposalSection.tsx`
- `components/course-proposals/proposalCardText.ts`
- `components/course-proposals/useCourseProposalForm.ts`
- `components/course-proposals/useCourseProposals.ts`
- `components/courses/CourseThumbnail.tsx`
- `components/courses/NetflixCourseCard.tsx`
- `components/courses/NetflixCourseRow.tsx`
- `components/courses/UpcomingCourseCard.tsx`
- `components/courses/courseCardText.ts`
- `components/learning-paths/LearningPathCard.tsx`
- `components/learning-paths/routeCardText.ts`
- `components/panel/BadgesNuevo.tsx`
- `components/panel/CommunityCardNuevo.tsx`
- `components/panel/CourseCardNuevo.tsx`
- `components/panel/PanelClasico.tsx`
- `components/panel/PanelNuevo.tsx`
- `components/panel/PanelSection.tsx`
- `components/panel/PanelSkeleton.tsx`
- `components/panel/ProposalsNuevo.tsx`
- `components/panel/RouteCardNuevo.tsx`
- `components/panel/UpcomingCardNuevo.tsx`
- `components/panel/format.ts`
- `components/panel/memberText.ts`
- `components/ui/dialog.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Notice.tsx`
- `constants/externalSchools.ts`
- `constants/toastStyles.ts`
- `hooks/usePanel.ts`
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
| `/api/course-proposals` | GET, POST | `components/course-proposals/useCourseProposals.ts:25`, `components/course-proposals/useCourseProposals.ts:70` |
| `/api/course-proposals/[id]` | DELETE, PUT | `components/course-proposals/useCourseProposals.ts:106`, `components/course-proposals/useCourseProposals.ts:48` |
| `/api/dashboard/stats` | GET | `hooks/usePanel.ts:167` |
| `/api/learning-paths/my-paths` | GET | `hooks/usePanel.ts:360` |
| `/api/news` | GET | `hooks/usePanel.ts:126` |
| `/api/upcoming-courses` | GET | `hooks/usePanel.ts:185` |
| `/api/youtube/latest` | GET | `hooks/usePanel.ts:144` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/badges/BadgeCard.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{badge.badge_name}» | h4 |  | BadgeCard · l.74 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{badge.badge_name} [{courseName}] {formatDate(badge.earned_at)} [+ {badge.points_value}]» | `{onClick}` |  | BadgeCard · l.51 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `GeneraBadgeIcon` |  |  |  | BadgeCard · l.64 |

**Values shown from data** (3)

- `{courseName}` — BadgeCard · l.80, when `showCourseName && courseName`
- `{formatDate(badge.earned_at)}` — BadgeCard · l.86
- `+ {badge.points_value}` — BadgeCard · l.94, when `showsBadgePoints(badge, size)`

### components/badges/BadgeIcon.tsx

Used by: `/dashboard`

**Other texts on screen** (1)

- «Genera Badge» (aria-label) — GeneraBadgeIcon · l.23

### components/badges/BadgesSection.tsx

Used by: `/dashboard`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mis Logros» | h2 |  | BadgesSection · l.46 |
| «Tus logros aparecerán aquí» | h3 | `!loading && !error && badges.length === 0` | BadgesSection · l.120 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver todos» | `/mi-aprendizaje/logros` | `showViewAll && badges.length > 0` |  | BadgesSection · l.55 |
| «+ {moreCount} más» | `/mi-aprendizaje/logros` | `!loading && !error && badges.length > 0 && hasMore && showViewAll` |  | BadgesSection · l.98 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!drawn` | BadgesSection · l.33 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `BadgeCard` |  | `!loading && !error && badges.length > 0 && each displayedBadges` |  | BadgesSection · l.92 |
| `GeneraBadgeIcon` |  | `!loading && !error && badges.length === 0` |  | BadgesSection · l.119 |

**Values shown from data** (2)

- `{badges.length} {badgeCountWords} {pointsSuffix}` — BadgesSection · l.47
- `{error}` — BadgesSection · l.78, when `error`

**Other texts on screen** (1)

- «Completa cursos para ganar insignias y reconocimientos» — BadgesSection · l.124, when `!loading && !error && badges.length === 0`

### components/badges/useBadges.ts

Used by: `/dashboard`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los logros» | `setError` |  | fetchBadges · l.30 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `badgeCountWords` | «insignia obtenida / insignias obtenidas» | useBadges · l.48 |

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
| «{fullName} [(Tú)]» | h2 |  | MemberProfileModal · l.63 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar» | `{onClose}` |  |  |  | MemberProfileModal · l.160 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver Perfil Completo» | `/user/[*]` |  |  | MemberProfileModal · l.166 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {fullName} · {member.avatar_url} | `member.avatar_url` |  | MemberProfileModal · l.51 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `MemberProfileNuevo` | component | `{isOpen}` |  | MemberProfileModal · l.37 |
| `Dialog` | component | `{isOpen}` |  | MemberProfileModal · l.46 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!member` | MemberProfileModal · l.33 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | MemberProfileModal · l.47 |

**Values shown from data** (8)

- `{initials}` — MemberProfileModal · l.58, when `!(member.avatar_url)`
- `{roleLabel}` — MemberProfileModal · l.69
- `{member.email}` — MemberProfileModal · l.84, when `rows.email`
- `{member.school?.name}` — MemberProfileModal · l.97, when `rows.school`
- `{getExternalSchoolLabel(member.exter…}` — MemberProfileModal · l.110, when `rows.externalSchool`
- `{member.generation?.name}` — MemberProfileModal · l.125, when `rows.generation`
- `{member.community?.name}` — MemberProfileModal · l.138, when `rows.community`
- `{formatDate(member.created_at)}` — MemberProfileModal · l.151, when `rows.memberSince`

**Other texts on screen** (6)

- «Correo electrónico» — MemberProfileModal · l.83, when `rows.email`
- «Colegio» — MemberProfileModal · l.96, when `rows.school`
- «Escuela externa» — MemberProfileModal · l.109, when `rows.externalSchool`
- «Generación» — MemberProfileModal · l.124, when `rows.generation`
- «Comunidad» — MemberProfileModal · l.137, when `rows.community`
- «Miembro desde» — MemberProfileModal · l.150, when `rows.memberSince`

### components/community/MemberProfileNuevo.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar» | `{onClose}` |  |  | `testid=member-profile-close` | MemberProfileNuevo · l.42 |
| «Ver Perfil Completo» | `{onClose}` |  |  | `testid=member-profile-full` | MemberProfileNuevo · l.45 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {fullName} · {member.avatar_url} | `member.avatar_url` |  | MemberProfileNuevo · l.54 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` | eyebrow: Mi Comunidad de Crecimiento | MemberProfileNuevo · l.29 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ExternalLink` | aria-hidden: true |  |  | MemberProfileNuevo · l.47 |
| `Badge` | tone: accent | `memberRole` |  | MemberProfileNuevo · l.69 |
| `Badge` | tone: neutral | `!(memberRole)` |  | MemberProfileNuevo · l.73 |
| `Mail` | aria-hidden: true | `rows.email` |  | MemberProfileNuevo · l.83 |
| `Briefcase` | aria-hidden: true | `rows.externalSchool` |  | MemberProfileNuevo · l.92 |
| `Calendar` | aria-hidden: true | `rows.memberSince` |  | MemberProfileNuevo · l.103 |

**Values shown from data** (6)

- `{initials}` — MemberProfileNuevo · l.60, when `!(member.avatar_url)`
- `{roleLabel}` — MemberProfileNuevo · l.69, when `memberRole`
- `{roleLabel}` — MemberProfileNuevo · l.73, when `!(memberRole)`
- `{member.email}` — MemberProfileNuevo · l.86, when `rows.email`
- `{getExternalSchoolLabel(member.exter…}` — MemberProfileNuevo · l.95, when `rows.externalSchool`
- `{formatMemberDate(member.created_at)}` — MemberProfileNuevo · l.106, when `rows.memberSince`

**Other texts on screen** (4)

- «(Tú)» — MemberProfileNuevo · l.36, when `isCurrentUser`
- «Correo electrónico» — MemberProfileNuevo · l.84, when `rows.email`
- «Escuela externa» — MemberProfileNuevo · l.93, when `rows.externalSchool`
- «Miembro desde» — MemberProfileNuevo · l.104, when `rows.memberSince`

### components/community/WorkspaceSettingsModal.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Configuración de la Comunidad» | h3 |  | WorkspaceSettingsModal · l.49 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.52 |
| «[icon X]» | `{handleRemoveImage}` | `imagePreview` |  |  | WorkspaceSettingsModal · l.96 |
| «Cancelar» | `{onClose}` |  | `{isLoading}` |  | WorkspaceSettingsModal · l.138 |
| «Guardando... / Guardar cambios» | `{handleSave}` |  | `{saveDisabled}` |  | WorkspaceSettingsModal · l.145 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre de la Comunidad» | text | «Ingresa un nombre personalizado» · `maxLength={100}` |  |  |  | WorkspaceSettingsModal · l.67 |
| «Subir imagen» | file | accepts `image/jpeg,image/jpg,image/png,image/webp` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=community-image-upload (id used by code)` | WorkspaceSettingsModal · l.113 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Vista previa · {imagePreview} | `imagePreview` |  | WorkspaceSettingsModal · l.91 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `WorkspaceSettingsNuevo` | component | `{isOpen}` |  | WorkspaceSettingsModal · l.41 |
| «Configuración de la Comunidad» | written in this file |  |  | WorkspaceSettingsModal · l.46 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | WorkspaceSettingsModal · l.43 |

**Other texts on screen** (5)

- «Nombre de la Comunidad» (label) — WorkspaceSettingsModal · l.64
- «Cualquier miembro puede cambiar el nombre del grupo» — WorkspaceSettingsModal · l.76
- «Imagen de la Comunidad» (label) — WorkspaceSettingsModal · l.82
- «Subir imagen» (label) — WorkspaceSettingsModal · l.121
- «Máx. 5MB (JPEG, PNG, WebP)» — WorkspaceSettingsModal · l.129

### components/community/WorkspaceSettingsNuevo.tsx

Used by: `/dashboard`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{onClose}` |  | `{isLoading}` | `testid=workspace-settings-cancel` | WorkspaceSettingsNuevo · l.46 |
| «Guardando... / Guardar cambios» | `{handleSave}` |  | `{saveDisabled}` | `testid=workspace-settings-save` | WorkspaceSettingsNuevo · l.49 |
| «[icon X]» · tooltip «Quitar imagen» · aria «Quitar imagen» | `{handleRemoveImage}` | `imagePreview` |  | `testid=workspace-settings-remove-image` | WorkspaceSettingsNuevo · l.74 |
| «Subir imagen» | `{() => fileInputRef.current?.click()}` |  |  | `testid=workspace-settings-upload` | WorkspaceSettingsNuevo · l.99 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Ingresa un nombre personalizado» | text | «Ingresa un nombre personalizado» · `maxLength={100}` |  |  | `testid=workspace-settings-name` | WorkspaceSettingsNuevo · l.56 |
|  | file | accepts `image/jpeg,image/jpg,image/png,image/webp` |  | hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=community-image-upload` | WorkspaceSettingsNuevo · l.91 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Vista previa · {imagePreview} | `imagePreview` |  | WorkspaceSettingsNuevo · l.73 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` | eyebrow: Mi Comunidad de Crecimiento · title: Configuración de la Comunidad | WorkspaceSettingsNuevo · l.37 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: Nombre de la Comunidad · help: Cualquier miembro puede cambiar el nombre del grupo |  |  | WorkspaceSettingsNuevo · l.55 |
| `X` | aria-hidden: true | `imagePreview` |  | WorkspaceSettingsNuevo · l.82 |
| `Camera` | aria-hidden: true | `!(imagePreview)` |  | WorkspaceSettingsNuevo · l.87 |
| `Upload` | aria-hidden: true |  |  | WorkspaceSettingsNuevo · l.100 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=group` | WorkspaceSettingsNuevo · l.66 |

**Other texts on screen** (2)

- «Imagen de la Comunidad» — WorkspaceSettingsNuevo · l.68
- «Máx. 5MB (JPEG, PNG, WebP)» — WorkspaceSettingsNuevo · l.104

### components/community/memberProfileText.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `roleLabel` | «Sin rol asignado» | memberProfileText · l.11 |
| `formatMemberDate()` | «No disponible» | formatMemberDate · l.19 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | memberProfileText · l.12 |

### components/community/useWorkspaceSettings.ts

Used by: `/dashboard`

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «La imagen debe ser menor a 5MB» | `file.size > 5 * 1024 * 1024` | handleImageSelect · l.45 |
| error | «Solo se permiten imágenes (JPEG, PNG, WebP)» | `!allowedTypes.includes(file.type)` | handleImageSelect · l.52 |
| success | «Configuración actualizada exitosamente» |  | handleSave · l.102 |
| error | «Error al guardar la configuración» |  | handleSave · l.110 |

### components/course-proposals/ConfirmDialog.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{cancelText}» | `{onClose}` |  | `{isLoading}` |  | ConfirmDialog · l.84 |
| «Eliminando... / {confirmText}» | `{handleConfirm}` |  | `{isLoading}` |  | ConfirmDialog · l.92 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ConfirmDialogNuevo` | component | `{isOpen}` |  | ConfirmDialog · l.48 |
| `Dialog` | component | `{isOpen}` |  | ConfirmDialog · l.63 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | ConfirmDialog · l.64 |
| `DialogHeader` |  |  |  | ConfirmDialog · l.65 |
| `DialogTitle` |  |  |  | ConfirmDialog · l.74 |
| `DialogDescription` |  |  |  | ConfirmDialog · l.78 |
| `DialogFooter` |  |  |  | ConfirmDialog · l.83 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «¿Estás seguro?» | ConfirmDialog · l.32 |
| «Esta acción no se puede deshacer.» | ConfirmDialog · l.33 |
| «Confirmar» | ConfirmDialog · l.34 |
| «Cancelar» | ConfirmDialog · l.35 |

**Values shown from data** (2)

- `{title}` — ConfirmDialog · l.74
- `{description}` — ConfirmDialog · l.78

### components/course-proposals/ConfirmDialogNuevo.tsx

Used by: `/dashboard`

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `KitConfirmDialog` | component | `{isOpen}` | eyebrow: Confirmar · confirmLabel: Eliminando... | ConfirmDialogNuevo · l.33 |

### components/course-proposals/CourseProposalCard.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{proposal.titulo}» | h3 |  | CourseProposalCard · l.66 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Pencil]» · tooltip «Editar propuesta» | `{handleEdit}` | `isOwner` |  |  | CourseProposalCard · l.49 |
| «[icon Trash2]» · tooltip «Eliminar propuesta» | `{handleDelete}` | `isOwner` |  |  | CourseProposalCard · l.56 |

**Values shown from data** (6)

- `{statusBadge.label}` — CourseProposalCard · l.40
- `{proposal.descripcion_corta}` — CourseProposalCard · l.74
- `{proposal.competencias_desarrollar}` — CourseProposalCard · l.81
- `{proposal.tiempo_requerido_desarrollo}` — CourseProposalCard · l.89
- `{creatorName}` — CourseProposalCard · l.111
- `{formatDate(proposal.created_at)}` — CourseProposalCard · l.115

**Other texts on screen** (1)

- «Solicita ayuda con diseño instruccional» — CourseProposalCard · l.99, when `proposal.necesita_ayuda_diseno_instruccional`

### components/course-proposals/CourseProposalFormNuevo.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{handleClose}` |  | `{isSubmitting}` | `testid=proposal-form-cancel` | CourseProposalFormNuevo · l.67 |
| «Guardando... / Guardar Cambios / Enviar Propuesta» (submits the form) |  |  |  | `testid=proposal-form-submit` | CourseProposalFormNuevo · l.70 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Ej: Estrategias de Aprendizaje Colaborativo» | text | `titulo` · «Ej: Estrategias de Aprendizaje Colaborativo» · disabled: `{isSubmitting}` |  |  | `id=titulo` | CourseProposalFormNuevo · l.90 |
| «Describe brevemente de qué se trataría el curso...» | textarea | `descripcion_corta` · «Describe brevemente de qué se trataría el curso...» · disabled: `{isSubmitting}` |  |  | `id=descripcion_corta` | CourseProposalFormNuevo · l.102 |
| «¿Qué habilidades o competencias desarrollarían los participantes?» | textarea | `competencias_desarrollar` · «¿Qué habilidades o competencias desarrollarían los participantes?» · disabled: `{isSubmitting}` |  |  | `id=competencias_desarrollar` | CourseProposalFormNuevo · l.114 |
| «Ej: 2 semanas, 1 mes, 3 meses» | text | `tiempo_requerido_desarrollo` · «Ej: 2 semanas, 1 mes, 3 meses» · disabled: `{isSubmitting}` |  |  | `id=tiempo_requerido_desarrollo` | CourseProposalFormNuevo · l.126 |
| «necesita_ayuda_diseno_instruccional» | checkbox | `necesita_ayuda_diseno_instruccional` · disabled: `{isSubmitting}` |  |  | `id=necesita_ayuda_diseno_instruccional` | CourseProposalFormNuevo · l.137 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{onSubmit}` |  | CourseProposalFormNuevo · l.81 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{isOpen}` | eyebrow: Propuestas de Cursos · title: Editar Propuesta de Curso / Nueva Propuesta de Curso · description: Modifica los detalles de tu propuesta de curso. / Comparte tu idea para un nuevo curso que beneficiaría a la plataforma. | CourseProposalFormNuevo · l.53 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `submits === 0` | CourseProposalFormNuevo · l.40 |
| `!notice \|\| typeof notice.scrollIntoView !== 'function'` | CourseProposalFormNuevo · l.42 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Notice` | tone: error | `error` |  | CourseProposalFormNuevo · l.84 |
| `Field` | label: Título del curso |  |  | CourseProposalFormNuevo · l.89 |
| `Field` | label: Descripción corta |  |  | CourseProposalFormNuevo · l.101 |
| `Field` | label: Competencias a desarrollar |  |  | CourseProposalFormNuevo · l.113 |
| `Field` | label: Tiempo requerido para desarrollar el contenido |  |  | CourseProposalFormNuevo · l.125 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «¿Necesita ayuda con el diseño instruccional?» | CourseProposalFormNuevo · l.143 |
| «Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.» | CourseProposalFormNuevo · l.144 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| scroll | `notice.scrollIntoView()` | CourseProposalFormNuevo · l.49 |

**Values shown from data** (1)

- `{error}` — CourseProposalFormNuevo · l.84, when `error`

### components/course-proposals/CourseProposalModal.tsx

Used by: `/dashboard`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{handleClose}` |  | `{isSubmitting}` |  | CourseProposalModal · l.163 |
| «Guardando... / Guardar Cambios / Enviar Propuesta» (submits the form) |  |  | `{isSubmitting}` |  | CourseProposalModal · l.171 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título del curso *» | text | `titulo` · «Ej: Estrategias de Aprendizaje Colaborativo» · disabled: `{isSubmitting}` |  |  | `id=titulo (id used by code)` | CourseProposalModal · l.67 |
| «Descripción corta *» | textarea | `descripcion_corta` · «Describe brevemente de qué se trataría el curso...» · disabled: `{isSubmitting}` |  |  | `id=descripcion_corta (id used by code)` | CourseProposalModal · l.87 |
| «Competencias a desarrollar *» | textarea | `competencias_desarrollar` · «¿Qué habilidades o competencias desarrollarían los participantes?» · disabled: `{isSubmitting}` |  |  | `id=competencias_desarrollar (id used by code)` | CourseProposalModal · l.107 |
| «Tiempo requerido para desarrollar el contenido *» | text | `tiempo_requerido_desarrollo` · «Ej: 2 semanas, 1 mes, 3 meses» · disabled: `{isSubmitting}` |  |  | `id=tiempo_requerido_desarrollo (id used by code)` | CourseProposalModal · l.127 |
| «¿Necesita ayuda con el diseño instruccional? Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.» | checkbox | `necesita_ayuda_diseno_instruccional` · disabled: `{isSubmitting}` |  |  | `id=necesita_ayuda_diseno_instruccional (id used by code)` | CourseProposalModal · l.141 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | CourseProposalModal · l.51 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CourseProposalFormNuevo` | component | `{isOpen}` |  | CourseProposalModal · l.35 |
| `Dialog` | component | `{isOpen}` |  | CourseProposalModal · l.38 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  |  | CourseProposalModal · l.39 |
| `DialogHeader` |  |  |  | CourseProposalModal · l.40 |
| `DialogTitle` |  |  |  | CourseProposalModal · l.41 |
| `DialogDescription` |  |  |  | CourseProposalModal · l.44 |

**Values shown from data** (1)

- `{error}` — CourseProposalModal · l.54, when `error`

**Other texts on screen** (7)

- «Editar Propuesta de Curso / Nueva Propuesta de Curso» — CourseProposalModal · l.41
- «Modifica los detalles de tu propuesta de curso. / Comparte tu idea para un nuevo curso que beneficiaría a la plataforma.» — CourseProposalModal · l.44
- «Título del curso *» (label) — CourseProposalModal · l.61
- «Descripción corta *» (label) — CourseProposalModal · l.81
- «Competencias a desarrollar *» (label) — CourseProposalModal · l.101
- «Tiempo requerido para desarrollar el contenido *» (label) — CourseProposalModal · l.121
- «¿Necesita ayuda con el diseño instruccional? Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.» (label) — CourseProposalModal · l.150

### components/course-proposals/CourseProposalSection.tsx

Used by: `/dashboard`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Propuestas de Cursos» | h2 | `loading` | CourseProposalSection · l.44 |
| «Propuestas de Cursos» | h2 | `error` | CourseProposalSection · l.71 |
| «Propuestas de Cursos» | h2 |  | CourseProposalSection · l.99 |
| «Sin propuestas aún» | h3 | `!(proposals.length > 0)` | CourseProposalSection · l.136 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{fetchProposals}` | `error` |  |  | CourseProposalSection · l.79 |
| «Nueva Propuesta» | `{openCreate}` |  |  |  | CourseProposalSection · l.105 |
| «Crear Propuesta» | `{openCreate}` | `!(proposals.length > 0)` |  |  | CourseProposalSection · l.142 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CourseProposalModal` | component | `{isModalOpen}` |  | CourseProposalSection · l.153 |
| `ConfirmDialog` | component | `{deleteConfirmOpen}` | title: Eliminar Propuesta · description: ¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | CourseProposalSection · l.161 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CourseProposalCard` |  | `proposals.length > 0 && each proposals` |  | CourseProposalSection · l.123 |

**Values shown from data** (1)

- `{error}` — CourseProposalSection · l.78, when `error`

**Other texts on screen** (4)

- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.45, when `loading`
- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.72, when `error`
- «Me gustaría realizar un curso en la plataforma» — CourseProposalSection · l.100
- «Sé el primero en proponer un nuevo curso» — CourseProposalSection · l.140, when `!(proposals.length > 0)`

### components/course-proposals/proposalCardText.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `statusConfig` | «Pendiente», «En Revisión», «Aprobada», «Rechazada» | getStatusBadge · l.15 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | proposalCreatorName · l.28 |

### components/course-proposals/useCourseProposalForm.ts

Used by: `/dashboard`

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «El título es requerido» | `setError` | `!formData.titulo.trim()` | handleSubmit · l.63 |
| «La descripción es requerida» | `setError` | `!formData.descripcion_corta.trim()` | handleSubmit · l.67 |
| «Las competencias a desarrollar son requeridas» | `setError` | `!formData.competencias_desarrollar.trim()` | handleSubmit · l.71 |
| «El tiempo requerido es requerido» | `setError` | `!formData.tiempo_requerido_desarrollo.trim()` | handleSubmit · l.75 |
| «Error al actualizar la propuesta / Error al crear la propuesta» | `setError` |  | handleSubmit · l.86 |

### components/course-proposals/useCourseProposals.ts

Used by: `/dashboard`

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al eliminar propuesta» |  | handleConfirmDelete · l.122 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar propuestas» | `throw (shown by whoever catches it)` | `!response.ok` | useCourseProposals · l.29 |
| «Error al cargar propuestas» | `setError` |  | useCourseProposals · l.35 |
| «Error al actualizar propuesta» | `throw (shown by whoever catches it)` | `editingProposal && !response.ok` | handleSubmitProposal · l.59 |
| «Error al crear propuesta» | `throw (shown by whoever catches it)` | `!(editingProposal) && !response.ok` | handleSubmitProposal · l.81 |
| «Error al eliminar propuesta» | `throw (shown by whoever catches it)` | `!response.ok` | handleConfirmDelete · l.113 |

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
| «{course.title}» | h3 | `!isExpanded` | UpcomingCourseCard · l.168 |
| «{course.title}» | h3 | `isExpanded` | UpcomingCourseCard · l.197 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `motion.div` | «Próximamente [{course.title} [{course.instructor.full_name}]] [{course.title} [{course.instructor.full_name}] [{course.…» · also `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` | `{handleTap}` |  | UpcomingCourseCard · l.119 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {course.title} · {course.thumbnail_url} | `course.thumbnail_url` |  | UpcomingCourseCard · l.139 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!isMobile \|\| !isExpanded` | UpcomingCourseCard · l.50 |
| `isMobile` | UpcomingCourseCard · l.64 |
| `isMobile` | UpcomingCourseCard · l.72 |
| `!isMobile` | UpcomingCourseCard · l.81 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | UpcomingCourseCard · l.44 |
| listener | `document.addEventListener('mousedown')` | UpcomingCourseCard · l.58 |

**Values shown from data** (4)

- `{course.instructor.full_name}` — UpcomingCourseCard · l.176, when `!isExpanded && course.instructor`
- `{course.instructor.full_name}` — UpcomingCourseCard · l.207, when `isExpanded && course.instructor`
- `{course.description}` — UpcomingCourseCard · l.215, when `isExpanded && course.description`
- `{formattedDate}` — UpcomingCourseCard · l.247, when `!isExpanded && formattedDate`

**Other texts on screen** (4)

- «Próximamente» — UpcomingCourseCard · l.161
- «Disponible en {formattedDate}» — UpcomingCourseCard · l.224, when `isExpanded && formattedDate`
- «Fecha por confirmar» — UpcomingCourseCard · l.232, when `isExpanded && !(formattedDate)`
- «Fecha por confirmar» — UpcomingCourseCard · l.255, when `!isExpanded && !(formattedDate)`

### components/courses/courseCardText.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `getCTAText()` | «Ver Detalles», «Repasar», «Continuar», «Comenzar» | getCTAText · l.13 |
| `getDifficultyLabel()` | «Principiante», «Intermedio», «Avanzado» | getDifficultyLabel · l.24 |

**Other texts written in the code (safety net: not tied to an element by the script)** (13)

| Text | Where |
|---|---|
| «Ver Detalles» | getCTAText · l.13 |
| «Repasar» | getCTAText · l.14 |
| «Continuar» | getCTAText · l.15 |
| «Comenzar» | getCTAText · l.17 |
| «Principiante» | getDifficultyLabel · l.24 |
| «Intermedio» | getDifficultyLabel · l.26 |
| «Avanzado» | getDifficultyLabel · l.28 |
| «Tareas: {enrollment?.assignments_sub…}/{enrollment?.assignments_tot…}» | assignmentsText · l.135 |
| «Aprobado» | completionTexts · l.147 |
| «Curso Aprobado» | completionTexts · l.148 |
| «Has completado todas las lecciones y tareas.» | completionTexts · l.149 |
| «Completado» | completionTexts · l.155 |
| «Completa tus tareas pendientes para obtener la insignia.» | completionTexts · l.156 |

### components/learning-paths/LearningPathCard.tsx

Used by: `/dashboard`

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

Used by: `/dashboard`

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Continuar aprendiendo» | routeActionText · l.34 |
| «Comenzar ruta» | routeActionText · l.34 |

### components/panel/BadgesNuevo.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{badge.badge_name}» | h3 |  | BadgeCardNuevo · l.27 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todos» |  | `showViewAll && badges.length > 0` |  |  | BadgesNuevo · l.68 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «+ {moreCount} más» | `/mi-aprendizaje/logros` | `showsRow && hasMore && showViewAll` | `testid=panel-badges-more` | BadgesNuevo · l.93 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!drawn` | BadgesNuevo · l.52 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid=panel-badge-{badge.id}` | BadgeCardNuevo · l.21 |
| `GeneraBadgeIcon` |  |  |  | BadgeCardNuevo · l.23 |
| `Badge` | tone: accent | `showsBadgePoints(badge, 'md')` |  | BadgeCardNuevo · l.31 |
| `PanelSection` | title: Mis Logros |  | `testid=panel-section-badges` | BadgesNuevo · l.57 |
| `ArrowRight` | aria-hidden: true | `showViewAll && badges.length > 0` |  | BadgesNuevo · l.69 |
| `Skeleton` |  | `loading && each [1, 2, 3]` |  | BadgesNuevo · l.80 |
| `Notice` | tone: error | `error` |  | BadgesNuevo · l.84 |
| `Award` | aria-hidden: true | `showsRow && hasMore && showViewAll` |  | BadgesNuevo · l.98 |

**Values shown from data** (4)

- `{courseName}` — BadgeCardNuevo · l.28, when `courseName`
- `{formatEarnedAt(badge.earned_at)}` — BadgeCardNuevo · l.29
- `+ {badge.points_value}` — BadgeCardNuevo · l.31, when `showsBadgePoints(badge, 'md')`
- `{error}` — BadgesNuevo · l.84, when `error`

### components/panel/CommunityCardNuevo.tsx

Used by: `/dashboard`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Mi Comunidad de Crecimiento» | h2 |  | CommunityCardNuevo · l.57 |
| «{placeName}» | h3 | `communityExpanded` | CommunityCardNuevo · l.109 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Mi Comunidad de Crecimiento {placeName} • {members.length} miembros {memberInitial(member)} [+ {stack.moreCount}]» | `{toggleCommunity}` |  |  | `testid=panel-community-bar` | CommunityCardNuevo · l.38 |
| «{communityChoiceLabel(comm)}» | `{(e) => chooseCommunity(e, comm.community_id!)}` | `communityExpanded && showCommunityPicker && each userCommunities` |  |  | CommunityCardNuevo · l.93 |
| «[icon Settings]» · tooltip «Configuración» · aria «Configuración» | `{(e) => openWorkspaceSettings(e, workspace)}` | `communityExpanded && canEditWorkspace()` |  | `testid=panel-community-settings` | CommunityCardNuevo · l.114 |
| «Ver Espacio Completo →» |  | `communityExpanded` |  |  | CommunityCardNuevo · l.125 |
| «{memberInitial(member)} {fullName} [{roleLabel}] [{externalSchoolLabel}] [Tú]» | `{() => openMember(member)}` | `communityExpanded && each members` |  | `testid=panel-member-{member.id}` | CommunityCardNuevo · l.135 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {workspaceImageAlt(workspace, selectedRole)} · {workspace.image_url} | `workspace?.image_url` |  | CommunityCardNuevo · l.46 |
| img · {member.avatar_url} | `each stack.shown && member.avatar_url` |  | CommunityCardNuevo · l.68 |
| img · {member.avatar_url} | `communityExpanded && each members && member.avatar_url` |  | CommunityCardNuevo · l.143 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid=panel-community` | CommunityCardNuevo · l.36 |
| `Users` | aria-hidden: true | `!(workspace?.image_url)` |  | CommunityCardNuevo · l.53 |
| `ChevronDown` | aria-hidden: true |  |  | CommunityCardNuevo · l.83 |
| `Settings` | aria-hidden: true | `communityExpanded && canEditWorkspace()` |  | CommunityCardNuevo · l.122 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=panel-community-line` | CommunityCardNuevo · l.60 |
| mark | `testid=panel-community-open` | CommunityCardNuevo · l.87 |

**Other texts on screen** (1)

- «Seleccionar comunidad:» — CommunityCardNuevo · l.90, when `communityExpanded && showCommunityPicker`

### components/panel/CourseCardNuevo.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 |  | CourseCardNuevo · l.107 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Detalles» | `{() => setOpen((now) => !now)}` |  |  | `testid={testId}-details-toggle` | CourseCardNuevo · l.138 |
| «{getCTAText(enrollment)}» | `{() => onOpen(course.id)}` |  |  | `testid={testId}-action` | CourseCardNuevo · l.149 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[{difficulty}] [{completion.badge}]» · aria «{course.title}» | `{href}` |  | `testid={testId}-picture` | CourseCardNuevo · l.66 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {picture.alt} · {picture.src} | `!(generated)` |  | CourseCardNuevo · l.82 |

**Pieces placed here, with the texts and settings handed to them** (14)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid={testId}` | CourseCardNuevo · l.65 |
| `CourseThumbnail` |  | `generated` |  | CourseCardNuevo · l.74 |
| `Badge` | tone: neutral | `difficulty && !generated` | `testid={testId}-difficulty` | CourseCardNuevo · l.90 |
| `Badge` | tone: success | `completion` |  | CourseCardNuevo · l.95 |
| `Award` | aria-hidden: true | `completion && completion.state === 'aprobado'` |  | CourseCardNuevo · l.97 |
| `CheckCircle2` | aria-hidden: true | `completion && !(completion.state === 'aprobado')` |  | CourseCardNuevo · l.99 |
| `ChevronDown` | aria-hidden: true |  |  | CourseCardNuevo · l.147 |
| `Play` | aria-hidden: true |  |  | CourseCardNuevo · l.155 |
| `Clock` | aria-hidden: true | `open && ((duration \|\| Boolean(difficulty) \|\| lessons)) && duration` |  | CourseCardNuevo · l.166 |
| `BarChart2` | aria-hidden: true | `open && ((duration \|\| Boolean(difficulty) \|\| lessons)) && difficulty` |  | CourseCardNuevo · l.172 |
| `BookOpen` | aria-hidden: true | `open && ((duration \|\| Boolean(difficulty) \|\| lessons)) && lessons` |  | CourseCardNuevo · l.178 |
| `ClipboardCheck` | aria-hidden: true | `open && Boolean(showsAssignments(enrollment))` |  | CourseCardNuevo · l.194 |
| `Award` | aria-hidden: true | `open && completion?.state === 'aprobado'` |  | CourseCardNuevo · l.201 |
| `Target` | aria-hidden: true | `open && objectives` |  | CourseCardNuevo · l.214 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `GENERATED_FIT` | «[&]:rounded-none [&_h3]:text-[0.875rem] [&_h3]:leading-[1.3] [&_.ring-2]:h-14 [&_.ring-2]:w-14 [&>div:nth-child(2)]:pb-10» | l.243 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| role | `role=progressbar` | CourseCardNuevo · l.116 |
| mark | `testid={testId}-details id={testId}-details` | CourseCardNuevo · l.161 |
| mark | `testid={testId}-lessons` | CourseCardNuevo · l.187 |

**Values shown from data** (10)

- `{course.instructor?.full_name}` — CourseCardNuevo · l.111, when `Boolean(showsInstructor(course))`
- `[{lessonLineText(enrollment)}]` — CourseCardNuevo · l.131, when `progress`
- `{percent} %` — CourseCardNuevo · l.132, when `progress`
- `{lessonLineText(enrollment)}` — CourseCardNuevo · l.188, when `open && lessons && !progress`
- `{percent} %` — CourseCardNuevo · l.189, when `open && lessons && !progress`
- `{assignmentsText(enrollment)}` — CourseCardNuevo · l.195, when `open && Boolean(showsAssignments(enrollment))`
- `{completion.line}` — CourseCardNuevo · l.204, when `open && completion?.state === 'aprobado'`
- `{completion.line}` — CourseCardNuevo · l.207, when `open && completion?.state === 'completado'`
- `{course.description}` — CourseCardNuevo · l.209, when `open && Boolean(showsDescription(course))`
- `{objective}` — CourseCardNuevo · l.219, when `open && objectives && each objectives.shown`

**Other texts on screen** (2)

- «Objetivos de aprendizaje» — CourseCardNuevo · l.215, when `open && objectives`
- «+ {objectives.more} más...» — CourseCardNuevo · l.221, when `open && objectives && objectives.more > 0`

### components/panel/PanelClasico.tsx

Used by: `/dashboard`

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Hola, {greetingName} !» | h1 |  | PanelClasico · l.72 |
| «Mi Comunidad de Crecimiento» | h2 | `community` | PanelClasico · l.124 |
| «{selectedRole.school?.name} / {selectedRole.community!.name}» | h3 | `community && communityExpanded` | PanelClasico · l.191 |
| «Últimas Noticias» | h2 |  | PanelClasico · l.271 |
| «{article.title}» | h3 | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` | PanelClasico · l.316 |
| «Videos Recientes» | h2 |  | PanelClasico · l.340 |
| «{video.title}» | h3 | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` | PanelClasico · l.384 |
| «{dashboardStats?.statsLabel} / Estadísticas de la Plataforma» | h2 |  | PanelClasico · l.403 |
| «{dashboardStats.mostCompletedCourse.…}» | h3 | `!(loadingStats) && dashboardStats?.mostCompletedCourse` | PanelClasico · l.429 |
| «{dashboardStats.topLearner.name}» | h3 | `!(loadingStats) && dashboardStats?.topLearner` | PanelClasico · l.479 |
| «Próximos Cursos» | h2 | `showUpcomingCourses` | PanelClasico · l.516 |
| «Mis Rutas de Aprendizaje» | h2 | `showLearningPaths` | PanelClasico · l.561 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Mi Comunidad de Crecimiento {selectedRole.school?.name} / {selectedRole.community!.name} • {members.length} miembros {memberInitial(member)} [+ {members.length - 4}]» | `{toggleCommunity}` | `community` |  |  | PanelClasico · l.107 |
| «{comm.school?.name} / {comm.community?.name}» | `{(e) => chooseCommunity(e, comm.community_id!)}` | `community && communityExpanded && showCommunityPicker && each userCommunities` |  |  | PanelClasico · l.174 |
| «[icon Settings]» · tooltip «Configuración» | `{(e) => openWorkspaceSettings(e, workspace)}` | `community && communityExpanded && canEditWorkspace()` |  |  | PanelClasico · l.197 |
| «{memberInitial(member)} {fullName} [{roleLabel}] [{externalSchoolLabel}] [Tú]» | `{() => openMember(member)}` | `community && communityExpanded && each members` |  |  | PanelClasico · l.219 |

**Links** (7)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Mi Perfil» | `/profile` | screen size: `hidden sm:flex` |  | PanelClasico · l.86 |
| «Ver Espacio Completo →» | `/community/workspace` | `community && communityExpanded` |  | PanelClasico · l.205 |
| «Ver todas» | `/noticias` |  |  | PanelClasico · l.273 |
| «{formatTimeAgo(article.display_date …} {article.title} {getExcerpt(article.content_html)}» | `/noticias/[*]` (new tab) | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` |  | PanelClasico · l.294 |
| «Ver canal» | `https://www.youtube.com/@NuevaEducacionFundacion` (new tab) |  |  | PanelClasico · l.342 |
| «{video.title} {formatTimeAgo(video.publishedAt)}» | `https://www.youtube.com/watch?v=[*]` (new tab) | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | PanelClasico · l.364 |
| «Ver todas» | `/mi-aprendizaje` | `showLearningPaths` |  | PanelClasico · l.562 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `LearningPathCard` |  | `{path.onClick}` | `showLearningPaths && each learningPathCards()` | PanelClasico · l.572 |

**Embedded media** (6)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {workspace.custom_name \|\| selectedRole.community!.name} · {workspace.image_url} | `community && workspace?.image_url` |  | PanelClasico · l.113 |
| img · {member.avatar_url} | `community && each members.slice(0, 4) && member.avatar_url` |  | PanelClasico · l.137 |
| img · {member.avatar_url} | `community && communityExpanded && each members && member.avatar_url` |  | PanelClasico · l.225 |
| img · alt {article.title} · {article.featured_image} | `!(loadingNews) && newsArticles.length > 0 && each newsArticles && article.featured_image` |  | PanelClasico · l.305 |
| img · alt {video.title} · {video.thumbnail} | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | PanelClasico · l.372 |
| img · {dashboardStats.topLearner.avatar_url} | `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.avatar_url` |  | PanelClasico · l.466 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Avatar` |  |  |  | PanelClasico · l.65 |
| `UpcomingCourseCard` |  | `showUpcomingCourses && each upcomingCourses` |  | PanelClasico · l.529 |
| `CourseProposalSection` |  | `showCourseProposals` |  | PanelClasico · l.539 |
| `BadgesSection` |  | `showBadges` |  | PanelClasico · l.544 |
| `NetflixCourseRow` | title: Continuar Aprendiendo · emptyMessage: No tienes cursos en progreso | `showInProgressCourses` |  | PanelClasico · l.549 |
| `LearningPathCard` |  | `showLearningPaths && each learningPathCards()` |  | PanelClasico · l.572 |
| `NetflixCourseRow` | title: Mis Cursos Abiertos · emptyMessage: No tienes cursos asignados | `showOpenCourses` |  | PanelClasico · l.588 |

**Values shown from data** (6)

- `{consultorAffiliationLabel}` — PanelClasico · l.81, when `showConsultorAffiliation`
- `{dashboardStats.mostCompletedCourse.…}` — PanelClasico · l.438, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- `{dashboardStats.topLearner.name.char…}` — PanelClasico · l.473, when `!(loadingStats) && dashboardStats?.topLearner && !(dashboardStats.topLearner.avatar_url)`
- `{dashboardStats.topLearner.role}` — PanelClasico · l.483, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.role`
- `{dashboardStats.topLearner.school_na…}` — PanelClasico · l.488, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.school_name`
- `{dashboardStats.topLearner.completed…}` — PanelClasico · l.493, when `!(loadingStats) && dashboardStats?.topLearner`

**Other texts on screen** (14)

- «Bienvenido de vuelta al hub de transformación de tu colegio» — PanelClasico · l.76
- «Seleccionar comunidad:» — PanelClasico · l.171, when `community && communityExpanded && showCommunityPicker`
- «No hay noticias disponibles» — PanelClasico · l.328, when `!(loadingNews) && !(newsArticles.length > 0)`
- «No hay videos disponibles» — PanelClasico · l.396, when `!(loadingVideos) && !(youtubeVideos.length > 0)`
- «Educadores Activos» — PanelClasico · l.408
- «en tu alcance» — PanelClasico · l.416
- «Curso Más Completado» — PanelClasico · l.421
- «Relator: {dashboardStats.mostCompletedCourse.…}» — PanelClasico · l.433, when `!(loadingStats) && dashboardStats?.mostCompletedCourse && dashboardStats.mostCompletedCourse.instructor_name`
- «completaciones» — PanelClasico · l.441, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- «Sin datos disponibles» — PanelClasico · l.445, when `!(loadingStats) && !(dashboardStats?.mostCompletedCourse)`
- «Usuario Destacado» — PanelClasico · l.451
- «cursos completados» — PanelClasico · l.496, when `!(loadingStats) && dashboardStats?.topLearner`
- «Sin datos disponibles» — PanelClasico · l.502, when `!(loadingStats) && !(dashboardStats?.topLearner)`
- «Cursos que podrás tomar próximamente» — PanelClasico · l.517, when `showUpcomingCourses`

### components/panel/PanelNuevo.tsx

Used by: `/dashboard`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Hola, {greetingName} !» | h1 |  | PanelNuevo · l.75 |
| «{dashboardStats?.statsLabel} / Estadísticas de la Plataforma» | h2 |  | PanelNuevo · l.200 |
| «{dashboardStats.mostCompletedCourse.…}» | h3 | `!(loadingStats) && dashboardStats?.mostCompletedCourse` | PanelNuevo · l.223 |
| «{dashboardStats.topLearner.name}» | h3 | `!(loadingStats) && dashboardStats?.topLearner` | PanelNuevo · l.262 |
| «{article.title}» | h3 | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` | PanelNuevo · l.323 |
| «{video.title}» | h3 | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` | PanelNuevo · l.379 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ver todas» |  | `showLearningPaths` |  |  | PanelNuevo · l.130 |
| «Ver todas» |  |  |  |  | PanelNuevo · l.290 |
| «Ver canal» |  |  |  |  | PanelNuevo · l.340 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Mi Perfil» | `/profile` |  | `testid=panel-nuevo-profile` | PanelNuevo · l.88 |
| «{formatTimeAgo(article.display_date …} {article.title} {getExcerpt(article.content_html)}» | `/noticias/[*]` (new tab) | `!(loadingNews) && newsArticles.length > 0 && each newsArticles` | `testid=panel-news-{article.id}` | PanelNuevo · l.309 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · {dashboardStats.topLearner.avatar_url} | `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.avatar_url` |  | PanelNuevo · l.255 |
| img · alt {article.title} · {article.featured_image} | `!(loadingNews) && newsArticles.length > 0 && each newsArticles && article.featured_image` |  | PanelNuevo · l.318 |
| img · alt {video.title} · {video.thumbnail} | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | PanelNuevo · l.373 |

**Pieces placed here, with the texts and settings handed to them** (37)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Avatar` |  |  |  | PanelNuevo · l.73 |
| `Briefcase` | aria-hidden: true | `showConsultorAffiliation` |  | PanelNuevo · l.82 |
| `Settings` | aria-hidden: true |  |  | PanelNuevo · l.93 |
| `PanelSection` | title: Continuar Aprendiendo | `showInProgressCourses` | `testid=panel-section-continue` | PanelNuevo · l.103 |
| `CourseCardNuevo` |  | `showInProgressCourses && each inProgressCourses` |  | PanelNuevo · l.112 |
| `PanelSection` | title: Mis Rutas de Aprendizaje | `showLearningPaths` | `testid=panel-section-routes` | PanelNuevo · l.125 |
| `ArrowRight` | aria-hidden: true | `showLearningPaths` |  | PanelNuevo · l.131 |
| `RouteCardNuevo` |  | `showLearningPaths && each learningPathCards()` |  | PanelNuevo · l.137 |
| `PanelSection` | title: Mis Cursos Abiertos | `showOpenCourses` | `testid=panel-section-open` | PanelNuevo · l.152 |
| `CourseCardNuevo` |  | `showOpenCourses && each openCourses` |  | PanelNuevo · l.161 |
| `PanelSection` | title: Próximos Cursos · sub: Cursos que podrás tomar próximamente | `showUpcomingCourses` | `testid=panel-section-upcoming` | PanelNuevo · l.173 |
| `UpcomingCardNuevo` |  | `showUpcomingCourses && each upcomingCourses` |  | PanelNuevo · l.183 |
| `ProposalsNuevo` |  | `showCourseProposals` |  | PanelNuevo · l.189 |
| `BadgesNuevo` |  | `showBadges` |  | PanelNuevo · l.191 |
| `CommunityCardNuevo` |  | `community` |  | PanelNuevo · l.196 |
| `Card` |  |  | `testid=panel-stats-course` | PanelNuevo · l.214 |
| `Skeleton` |  | `loadingStats` |  | PanelNuevo · l.218 |
| `Skeleton` |  | `loadingStats` |  | PanelNuevo · l.219 |
| `Card` |  |  | `testid=panel-stats-learner` | PanelNuevo · l.241 |
| `Skeleton` |  | `loadingStats` |  | PanelNuevo · l.245 |
| `Skeleton` |  | `loadingStats` |  | PanelNuevo · l.247 |
| `Skeleton` |  | `loadingStats` |  | PanelNuevo · l.248 |
| `PanelSection` | title: Últimas Noticias |  | `testid=panel-section-news` | PanelNuevo · l.285 |
| `ArrowRight` | aria-hidden: true |  |  | PanelNuevo · l.291 |
| `Card` |  |  |  | PanelNuevo · l.295 |
| `Skeleton` |  | `loadingNews && each [1, 2, 3]` |  | PanelNuevo · l.299 |
| `Skeleton` |  | `loadingNews && each [1, 2, 3]` |  | PanelNuevo · l.301 |
| `Skeleton` |  | `loadingNews && each [1, 2, 3]` |  | PanelNuevo · l.302 |
| `Skeleton` |  | `loadingNews && each [1, 2, 3]` |  | PanelNuevo · l.303 |
| `PanelSection` | title: Videos Recientes |  | `testid=panel-section-videos` | PanelNuevo · l.335 |
| `ExternalLink` | aria-hidden: true |  |  | PanelNuevo · l.347 |
| `Card` |  | `loadingVideos && each [1, 2]` | `testid=panel-video-placeholder` | PanelNuevo · l.354 |
| `Skeleton` |  | `loadingVideos && each [1, 2]` |  | PanelNuevo · l.355 |
| `Skeleton` |  | `loadingVideos && each [1, 2]` |  | PanelNuevo · l.356 |
| `Card` |  | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` | `testid=panel-video-{video.id}` | PanelNuevo · l.363 |
| `Play` | aria-hidden: true | `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos` |  | PanelNuevo · l.375 |
| `Card` |  | `!(loadingVideos) && !(youtubeVideos.length > 0)` |  | PanelNuevo · l.386 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| mark | `testid=panel-nuevo` | PanelNuevo · l.65 |
| mark | `testid=panel-nuevo-welcome` | PanelNuevo · l.71 |
| mark | `testid=panel-nuevo-main` | PanelNuevo · l.101 |
| mark | `testid=panel-nuevo-side` | PanelNuevo · l.195 |
| mark | `testid=panel-section-stats` | PanelNuevo · l.199 |
| mark | `testid=panel-stats-users` | PanelNuevo · l.201 |
| mark | `testid=panel-news-placeholder` | PanelNuevo · l.298 |

**Values shown from data** (7)

- `{consultorAffiliationLabel}` — PanelNuevo · l.83, when `showConsultorAffiliation`
- `{dashboardStats.mostCompletedCourse.…}` — PanelNuevo · l.230, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- `{dashboardStats.topLearner.name.char…}` — PanelNuevo · l.257, when `!(loadingStats) && dashboardStats?.topLearner && !(dashboardStats.topLearner.avatar_url)`
- `{dashboardStats.topLearner.role}` — PanelNuevo · l.264, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.role`
- `{dashboardStats.topLearner.school_na…}` — PanelNuevo · l.267, when `!(loadingStats) && dashboardStats?.topLearner && dashboardStats.topLearner.school_name`
- `{dashboardStats.topLearner.completed…}` — PanelNuevo · l.272, when `!(loadingStats) && dashboardStats?.topLearner`
- `{formatTimeAgo(video.publishedAt)}` — PanelNuevo · l.380, when `!(loadingVideos) && youtubeVideos.length > 0 && each youtubeVideos`

**Other texts on screen** (12)

- «Bienvenido de vuelta al hub de transformación de tu colegio» — PanelNuevo · l.79
- «Educadores Activos» — PanelNuevo · l.202
- «en tu alcance» — PanelNuevo · l.211
- «Curso Más Completado» — PanelNuevo · l.215
- «Relator: {dashboardStats.mostCompletedCourse.…}» — PanelNuevo · l.227, when `!(loadingStats) && dashboardStats?.mostCompletedCourse && dashboardStats.mostCompletedCourse.instructor_name`
- «completaciones» — PanelNuevo · l.233, when `!(loadingStats) && dashboardStats?.mostCompletedCourse`
- «Sin datos disponibles» — PanelNuevo · l.237, when `!(loadingStats) && !(dashboardStats?.mostCompletedCourse)`
- «Usuario Destacado» — PanelNuevo · l.242
- «cursos completados» — PanelNuevo · l.275, when `!(loadingStats) && dashboardStats?.topLearner`
- «Sin datos disponibles» — PanelNuevo · l.279, when `!(loadingStats) && !(dashboardStats?.topLearner)`
- «No hay noticias disponibles» — PanelNuevo · l.329, when `!(loadingNews) && !(newsArticles.length > 0)`
- «No hay videos disponibles» — PanelNuevo · l.386, when `!(loadingVideos) && !(youtubeVideos.length > 0)`

### components/panel/PanelSection.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h2 |  | PanelSection · l.146 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronLeft]» · aria «Desplazar izquierda» | `{() => move(-1)}` | `((action \|\| (row && more.any))) && row && more.any` | `{!more.left}` | `testid={testId ? '${testId}-left' : undefined}` | PanelSection · l.155 |
| «[icon ChevronRight]» · aria «Desplazar derecha» | `{() => move(1)}` | `((action \|\| (row && more.any))) && row && more.any` | `{!more.right}` | `testid={testId ? '${testId}-right' : undefined}` | PanelSection · l.165 |

**Draws nothing when** (4)

| Condition | Where |
|---|---|
| `!el` | PanelSection · l.82 |
| `startSeen.current === startKey` | PanelSection · l.112 |
| `first` | PanelSection · l.115 |
| `!row \|\| !el` | PanelSection · l.117 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ChevronLeft` | aria-hidden: true | `((action \|\| (row && more.any))) && row && more.any` |  | PanelSection · l.163 |
| `ChevronRight` | aria-hidden: true | `((action \|\| (row && more.any))) && row && more.any` |  | PanelSection · l.173 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `CARD_TITLE` | «line-clamp-3 {CARD_TITLE_STYLE}» | l.33 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('resize')` | PanelSection · l.96 |
| scroll | `el.scrollTo()` | PanelSection · l.119 |
| scroll | `el.scrollBy()` | move · l.130 |
| mark | `testid={testId}` | PanelSection · l.137 |
| mark | `testid={testId ? '${testId}-row' : undefined}` | PanelSection · l.186 |

**Values shown from data** (3)

- `{icon}` — PanelSection · l.142, when `icon`
- `{sub}` — PanelSection · l.148, when `sub`
- `{children}` — PanelSection · l.186, when `row`

### components/panel/PanelSkeleton.tsx

Used by: `/dashboard`

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Skeleton` |  |  |  | PanelSkeleton · l.15 |
| `Skeleton` |  |  |  | PanelSkeleton · l.17 |
| `Skeleton` |  |  |  | PanelSkeleton · l.18 |
| `Skeleton` |  | `each [1, 2]` |  | PanelSkeleton · l.26 |
| `Skeleton` |  | `each [1, 2] && each [1, 2, 3]` |  | PanelSkeleton · l.29 |
| `Skeleton` |  |  |  | PanelSkeleton · l.36 |
| `Skeleton` |  |  |  | PanelSkeleton · l.37 |
| `Skeleton` |  |  |  | PanelSkeleton · l.38 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | PanelSkeleton · l.11 |
| mark | `testid=panel-nuevo-loading` | PanelSkeleton · l.11 |

**Other texts on screen** (1)

- «Cargando...» — PanelSkeleton · l.12, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/panel/ProposalsNuevo.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{proposal.titulo}» | h3 |  | ProposalCardNuevo · l.60 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Pencil]» · aria «Editar propuesta» | `{() => onEdit(proposal)}` | `isOwner` |  |  | ProposalCardNuevo · l.51 |
| «[icon Trash2]» · aria «Eliminar propuesta» | `{() => onDelete(proposal.id)}` | `isOwner` |  |  | ProposalCardNuevo · l.54 |
| «Reintentar» | `{fetchProposals}` | `error` |  |  | ProposalsNuevo · l.141 |
| «Nueva Propuesta» | `{openCreate}` |  |  | `testid=panel-proposals-new` | ProposalsNuevo · l.161 |
| «Crear Propuesta» | `{openCreate}` | `!(proposals.length > 0)` |  |  | ProposalsNuevo · l.185 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `CourseProposalModal` | component | `{isModalOpen}` |  | ProposalsNuevo · l.196 |
| `ConfirmDialog` | component | `{deleteConfirmOpen}` | title: Eliminar Propuesta · description: ¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer. · confirmText: Eliminar · cancelText: Cancelar | ProposalsNuevo · l.202 |

**Pieces placed here, with the texts and settings handed to them** (17)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid=panel-proposal-{proposal.id}` | ProposalCardNuevo · l.44 |
| `Badge` |  |  |  | ProposalCardNuevo · l.48 |
| `Pencil` | aria-hidden: true | `isOwner` |  | ProposalCardNuevo · l.52 |
| `Trash2` | aria-hidden: true | `isOwner` |  | ProposalCardNuevo · l.55 |
| `BookOpen` | aria-hidden: true |  |  | ProposalCardNuevo · l.65 |
| `Clock` | aria-hidden: true |  |  | ProposalCardNuevo · l.69 |
| `HelpCircle` | aria-hidden: true | `proposal.necesita_ayuda_diseno_instruccional` |  | ProposalCardNuevo · l.74 |
| `User` | aria-hidden: true |  |  | ProposalCardNuevo · l.80 |
| `PanelSection` |  | `loading` | `testid=panel-section-proposals` | ProposalsNuevo · l.125 |
| `Skeleton` |  | `loading && each [1, 2, 3]` |  | ProposalsNuevo · l.128 |
| `PanelSection` |  | `error` | `testid=panel-section-proposals` | ProposalsNuevo · l.137 |
| `Notice` | tone: error | `error` |  | ProposalsNuevo · l.138 |
| `PanelSection` |  |  | `testid=panel-section-proposals` | ProposalsNuevo · l.152 |
| `Plus` | aria-hidden: true |  |  | ProposalsNuevo · l.162 |
| `Card` |  | `!(proposals.length > 0)` |  | ProposalsNuevo · l.179 |
| `EmptyState` | title: Sin propuestas aún · description: Sé el primero en proponer un nuevo curso | `!(proposals.length > 0)` |  | ProposalsNuevo · l.180 |
| `Plus` | aria-hidden: true | `!(proposals.length > 0)` |  | ProposalsNuevo · l.186 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `TITLE` | «Propuestas de Cursos» | l.18 |
| `SUB` | «Me gustaría realizar un curso en la plataforma» | l.19 |

**Values shown from data** (6)

- `{status.label}` — ProposalCardNuevo · l.48
- `{proposal.descripcion_corta}` — ProposalCardNuevo · l.63
- `{proposal.competencias_desarrollar}` — ProposalCardNuevo · l.66
- `{proposalCreatorName(proposal)}` — ProposalCardNuevo · l.81
- `{formatDate(proposal.created_at)}` — ProposalCardNuevo · l.83
- `{error}` — ProposalsNuevo · l.140, when `error`

**Other texts on screen** (1)

- «Solicita ayuda con diseño instruccional» — ProposalCardNuevo · l.75, when `proposal.necesita_ayuda_diseno_instruccional`

### components/panel/RouteCardNuevo.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{name}» | h3 |  | RouteCardNuevo · l.44 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid={testId}` | RouteCardNuevo · l.32 |
| `Badge` | tone: neutral |  |  | RouteCardNuevo · l.34 |
| `Badge` | tone: success | `isCompleted` |  | RouteCardNuevo · l.38 |
| `Award` | aria-hidden: true | `isCompleted` |  | RouteCardNuevo · l.39 |
| `BookOpen` | aria-hidden: true |  |  | RouteCardNuevo · l.67 |
| `Clock` | aria-hidden: true |  |  | RouteCardNuevo · l.71 |
| `TrendingUp` | aria-hidden: true | `!isCompleted` |  | RouteCardNuevo · l.77 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=progressbar` | RouteCardNuevo · l.52 |

**Values shown from data** (2)

- `{description}` — RouteCardNuevo · l.47, when `description`
- `{percent} %` — RouteCardNuevo · l.50

**Other texts on screen** (5)

- «Nivel {routeLevel(totalCourses)}» — RouteCardNuevo · l.34
- «Completado» — RouteCardNuevo · l.40, when `isCompleted`
- «Progreso» — RouteCardNuevo · l.49
- «de» — RouteCardNuevo · l.68
- «cursos» — RouteCardNuevo · l.68

### components/panel/UpcomingCardNuevo.tsx

Used by: `/dashboard`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{course.title}» | h3 |  | UpcomingCardNuevo · l.34 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Detalles» | `{() => setOpen((now) => !now)}` |  |  | `testid={testId}-details-toggle` | UpcomingCardNuevo · l.56 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {course.title} · {course.thumbnail_url} | `course.thumbnail_url` |  | UpcomingCardNuevo · l.22 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Card` |  |  | `testid={testId}` | UpcomingCardNuevo · l.19 |
| `Clock` | aria-hidden: true | `!(course.thumbnail_url)` |  | UpcomingCardNuevo · l.25 |
| `Badge` | tone: accent |  |  | UpcomingCardNuevo · l.28 |
| `Clock` | aria-hidden: true |  |  | UpcomingCardNuevo · l.29 |
| `User` | aria-hidden: true | `course.instructor` |  | UpcomingCardNuevo · l.39 |
| `Calendar` | aria-hidden: true | `formattedDate` |  | UpcomingCardNuevo · l.46 |
| `Clock` | aria-hidden: true | `!(formattedDate)` |  | UpcomingCardNuevo · l.51 |
| `ChevronDown` | aria-hidden: true |  |  | UpcomingCardNuevo · l.66 |
| `Badge` | tone: warning | `open && formattedDate` |  | UpcomingCardNuevo · l.72 |
| `Badge` | tone: neutral | `open && !(formattedDate)` |  | UpcomingCardNuevo · l.76 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testId}-date` | UpcomingCardNuevo · l.43 |
| mark | `testid={testId}-details id={testId}-details` | UpcomingCardNuevo · l.69 |

**Values shown from data** (1)

- `{course.description}` — UpcomingCardNuevo · l.70, when `open && course.description`

**Other texts on screen** (4)

- «Próximamente» — UpcomingCardNuevo · l.30
- «Fecha por confirmar» — UpcomingCardNuevo · l.52, when `!(formattedDate)`
- «Disponible en {formattedDate}» — UpcomingCardNuevo · l.72, when `open && formattedDate`
- «Fecha por confirmar» — UpcomingCardNuevo · l.77, when `open && !(formattedDate)`

### components/panel/format.ts

Used by: `/dashboard`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatTimeAgo()` | «Hoy», «Ayer», «Hace {diffDays} días», «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.19 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Hoy» | formatTimeAgo · l.19 |
| «Ayer» | formatTimeAgo · l.20 |
| «Hace {diffDays} días» | formatTimeAgo · l.21 |
| «Hace {Math.floor(diffDays / 7)} semanas» | formatTimeAgo · l.22 |

### components/panel/memberText.ts

Used by: `/dashboard`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Usuario» | memberTile · l.46 |

### components/ui/dialog.tsx

Used by: `/dashboard`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Button.tsx

Used by: `/dashboard`

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

Used by: `/dashboard`

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

Used by: `/dashboard`

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

Used by: `/dashboard`

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

Used by: `/dashboard`

**Values shown from data** (3)

- `{title}` — l.43
- `{description}` — l.52, when `description`
- `{action}` — l.54, when `action`

### components/ui/kit/Field.tsx

Used by: `/dashboard`

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

### components/ui/kit/Notice.tsx

Used by: `/dashboard`

**Values shown from data** (1)

- `{title}` — l.68, when `title`

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

### hooks/usePanel.ts

Used by: `/dashboard`

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Contraseña actualizada exitosamente» | `passwordChangeSuccess === 'true'` | usePanel · l.115 |

**Moves to another page from code** (7)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.204 |
| `/profile?from=dashboard&error=profile-fetch-failed` | `router.push` | `!userError && userData?.user && !profileData` | checkSession · l.248 |
| `/change-password` | `router.push` | `!userError && userData?.user && profileData.must_change_password === true` | checkSession · l.253 |
| `/login` | `router.push` |  | checkSession · l.374 |
| `/login` | `router.push` |  | handleLogout · l.385 |
| `/student/course/[*]` | `router.push` |  | openCourse · l.420 |
| `/mi-aprendizaje/ruta/[*]` | `router.push` |  | openLearningPath · l.421 |

**Access checks in the code** (5)

| Line of code | Where |
|---|---|
| `adminRole = metadataHasRole(userData.user.user_metadata, 'admin')` | checkSession · l.213 |
| `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id)` | checkSession · l.259 |
| `roles = await getUserRoles(supabase, userData.user.id)` | checkSession · l.273 |
| `showCourseProposals = (metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor') \|\| userRo…` | decide · l.479 |
| `showCourseProposals = (metadataHasRole(session?.user?.user_metadata, 'admin') \|\| metadataHasRole(session?.user?.user_metadata, 'consultor') \|\| userRo…` | decide · l.480 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Bearer {statsSession.access_token}» | usePanel · l.165 |
| «Sin instructor» | usePanel · l.306 |
| «Usuario» | usePanel · l.440 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-password-change-success` | usePanel · l.112 |
| storage | `sessionStorage: fne-avatar-cache` | checkSession · l.218 |
| storage | `localStorage: rememberMe` | handleLogout · l.383 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.384 |

**Reads and writes the database directly:** `table:course_assignments` (select), `table:course_enrollments` (select), `table:courses` (select), `table:profiles` (select)

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

**Toasts** (2)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{message}» |  | toastSuccess · l.36 |
| error | «{message}» |  | toastError · l.50 |

### utils/workspaceUtils.ts

Used by: `/dashboard`

**Reads and writes the database directly:** `table:community_workspaces` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/badges/award-and-announce` | `pages/api/badges/award-and-announce.ts` | POST | **no screen** | `__tests__/api/cursos-admin-only-routes.test.ts` |
| `/api/course-proposals/[id]` | `pages/api/course-proposals/[id].ts` | DELETE, PUT | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `__tests__/pages/dashboard.samePanel.test.tsx`, `components/course-proposals/useCourseProposals.ts` |
| `/api/course-proposals` | `pages/api/course-proposals/index.ts` | GET, POST | `/dashboard` | `__tests__/api/upcoming-courses/metadata-authority.test.ts`, `__tests__/components/panel/proposals.pin.test.tsx`, `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx` +2 |
| `/api/dashboard/stats` | `pages/api/dashboard/stats.ts` | GET | `/dashboard` | `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`, `hooks/usePanel.ts` +2 |
| `/api/dashboard/unified` | `pages/api/dashboard/unified.ts` | GET | **no screen** | `components/dashboard/unified/UnifiedDashboard.tsx` |
| `/api/youtube/latest` | `pages/api/youtube/latest.ts` | GET | `/dashboard` | `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`, `hooks/usePanel.ts` +2 |

