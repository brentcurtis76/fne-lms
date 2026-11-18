# Sistema (configuration, support, roadmap, test and debug pages, scheduled jobs)

Area `19-sistema`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `d701100d0` (2026-11-18).

3 screen files, 27 API files, 6 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/configuration` | `pages/admin/configuration.tsx` | 531 | Sistema › Configuración |  |
| `/admin/feedback` | `pages/admin/feedback.tsx` | 557 | Gestión › Soporte Técnico |  |
| `/admin/roadmap` | `pages/admin/roadmap.tsx` | 149 | Sistema › Roadmap MVP |  |

## /admin/configuration

File `pages/admin/configuration.tsx` · 531 lines · frame: MainLayout

### Who reaches it

- Menu: Sistema › «Configuración» → `/admin/configuration` — permission: manage_system_settings; the group: everyone signed in (`Sidebar.tsx` l.724)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.66 `router.push → /login  (when !session?.user)`
  - l.81 `adminFromMetadata = metadataHasRole(userData?.user?.user_metadata, 'admin')`
  - l.94 `router.push → /dashboard  (when !hasAdminRoleInDB && !adminFromMetadata)`
  - l.109 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:726`, `pages/admin/context-questions/index.tsx:341`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`; unit tests of the page: `__tests__/notifications/entry-points.test.tsx`.
- QA scenarios that name this address: admin 2, consultor 1, equipo_directivo 1, lider_comunidad 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| equipo_directivo | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| lider_generacion | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| lider_comunidad | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| supervisor_de_red | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| community_manager | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| docente | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| encargado_licitacion | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |

### What the page file itself draws

**Titles** (8)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Próximamente» | h3 |  | renderTabContent · l.231 |
| «Acceso Restringido» | h3 | `adminOnlyTabs.includes(activeTab) && !isAdmin` | renderTabContent · l.249 |
| «Configuración de Notificaciones» | h3 | `activeTab === 'notifications'` | renderTabContent · l.265 |
| «Tipos de Notificación ( {filterNotificationsBySearch(notific…} )» | h4 | `activeTab === 'notifications' && !(notificationsLoading)` | renderTabContent · l.304 |
| «Preferencias personales» | h4 | `activeTab === 'notifications'` | renderTabContent · l.391 |
| «Configuración General del Sistema» | h3 | `activeTab === 'system'` | renderTabContent · l.414 |
| «Usuarios y Permisos» | h3 | `activeTab === 'users'` | renderTabContent · l.428 |
| «Personalización» | h3 | `activeTab === 'customization'` | renderTabContent · l.451 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Actualizar» | `{() => { console.log('🔄 Manual refresh clicked'); fetchNotificationTypes(); }}` | `activeTab === 'notifications'` | `{notificationsLoading}` |  | renderTabContent · l.273 |
| «{tab.icon} {tab.label}» | `{() => setActiveTab(tab.id)}` | `each tabs` |  |  | Configuration · l.505 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Configuración de notificaciones» | `/configuracion/notificaciones` | `activeTab === 'notifications'` | `testid=admin-config-personal-settings` | renderTabContent · l.396 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «Tipo» | `activeTab === 'notifications' && !(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0)` | renderTabContent · l.324 |
| «Descripción» | `activeTab === 'notifications' && !(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0)` | renderTabContent · l.327 |
| «Categoría» | `activeTab === 'notifications' && !(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0)` | renderTabContent · l.330 |
| «Estado» | `activeTab === 'notifications' && !(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0)` | renderTabContent · l.333 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «No session found» | `setNotificationsError` | `!session` | fetchNotificationTypes · l.126 |
| «Failed to fetch notification types: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchNotificationTypes · l.144 |
| «Failed to load notification types» | `setNotificationsError` | `!(result.success && result.data)` | fetchNotificationTypes · l.155 |
| «Error loading notification types: {error.message}» | `setNotificationsError` |  | fetchNotificationTypes · l.159 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkUserAuth · l.66 |
| `/dashboard` | `router.push` | `!hasAdminRoleInDB && !adminFromMetadata` | checkUserAuth · l.94 |
| `/login` | `router.push` |  | checkUserAuth · l.109 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `adminFromMetadata = metadataHasRole(userData?.user?.user_metadata, 'admin')` | checkUserAuth · l.81 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `FeedbackPermissionsManager` |  | `activeTab === 'users'` |  | renderTabContent · l.437 |
| `MainLayout` |  | `loading` |  | Configuration · l.468 |
| `MainLayout` |  |  |  | Configuration · l.483 |
| `ResponsiveFunctionalPageHeader` | title: Configuración del Sistema · subtitle: Administra la configuración general de la plataforma FNE · searchPlaceholder: Buscar configuraciones... |  |  | Configuration · l.490 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `tabs` | «Notificaciones», «Sistema General», «Usuarios y Permisos», «Personalización» | l.28 |
| `getCategoryLabel()` | «Cursos», «Tareas», «Mensajería», «Social», «Retroalimentación», «Sistema», «Administración», «Espacio de Trabajo» | getCategoryLabel · l.191 |

**Other texts written in the code (safety net: not tied to an element by the script)** (9)

| Text | Where |
|---|---|
| «Session found» | Configuration · l.123 |
| «Bearer {session.access_token}» | Configuration · l.134 |
| «Cursos» | Configuration · l.191 |
| «Tareas» | Configuration · l.193 |
| «Mensajería» | Configuration · l.195 |
| «Social» | Configuration · l.197 |
| «Retroalimentación» | Configuration · l.199 |
| «Administración» | Configuration · l.203 |
| «Espacio de Trabajo» | Configuration · l.205 |

**Values shown from data** (6)

- `{notificationsError}` — renderTabContent · l.291, when `activeTab === 'notifications' && notificationsError`
- `{type.name}` — renderTabContent · l.344, when `!(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes)`
- `{type.id}` — renderTabContent · l.347, when `!(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes)`
- `{type.description}` — renderTabContent · l.354, when `!(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes)`
- `{getCategoryLabel(type.category)}` — renderTabContent · l.359, when `!(notificationsLoading) && !(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes)`
- `{renderTabContent()}` — Configuration · l.524

**Other texts on screen** (14)

- «Esta sección estará disponible pronto. Estamos trabajando para ofrecerte las mejores herramientas de configuración.» — renderTabContent · l.235
- «Esta sección requiere permisos de administrador.» — renderTabContent · l.253, when `adminOnlyTabs.includes(activeTab) && !isAdmin`
- «Gestiona los tipos de notificaciones disponibles en el sistema.» — renderTabContent · l.269, when `activeTab === 'notifications'`
- «Cargando tipos de notificación...» — renderTabContent · l.299, when `activeTab === 'notifications' && notificationsLoading`
- «No se encontraron tipos de notificación» — renderTabContent · l.312, when `activeTab === 'notifications' && !(notificationsLoading) && notificationTypes.length === 0`
- «No se encontraron tipos de notificación que coincidan con la búsqueda» — renderTabContent · l.317, when `activeTab === 'notifications' && !(notificationsLoading) && !(notificationTypes.length === 0) && filterNotificationsBySearch(notificationTypes).length === 0`
- «Activo» — renderTabContent · l.368, when `!(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes) && type.default_enabled`
- «Inactivo» — renderTabContent · l.373, when `!(notificationTypes.length === 0) && !(filterNotificationsBySearch(notificationTypes).length === 0) && each filterNotificationsBySearch(notificationTypes) && !(type.default_enabled)`
- «Cada persona elige qué notificaciones recibe por correo en» — renderTabContent · l.395, when `activeTab === 'notifications'`
- «. Aquí puedes visualizar todos los tipos de notificación disponibles en el sistema.» — renderTabContent · l.403, when `activeTab === 'notifications'`
- «Administra la configuración global de la plataforma.» — renderTabContent · l.418, when `activeTab === 'system'`
- «Configura roles, permisos y políticas de acceso.» — renderTabContent · l.432, when `activeTab === 'users'`
- «Más opciones de permisos estarán disponibles próximamente» — renderTabContent · l.442, when `activeTab === 'users'`
- «Personaliza la apariencia y marca de la plataforma.» — renderTabContent · l.455, when `activeTab === 'customization'`

**Reads and writes the database directly:** `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/FeedbackPermissionsManager.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `types/roles.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/notification-types` | GET | `pages/admin/configuration.tsx:131` |

## /admin/feedback

File `pages/admin/feedback.tsx` · 557 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Soporte Técnico» → `/admin/feedback` — permission: manage_system_settings; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.589)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.89 `router.push → /login  (when !session?.user)`
  - l.96 `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, session.user.id)`
  - l.103 `router.push → /dashboard  (when !isAdminUser)`
  - l.320 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:591`, `components/notifications/ModernNotificationCenter.tsx:307`, `components/notifications/ModernNotificationCenter.tsx:325`, `components/notifications/NotificationDropdown.tsx:136`, `components/notifications/NotificationDropdown.tsx:154`, `lib/notificationEvents.ts:397`, `lib/notifications/catalog.ts:377`, `pages/notifications.tsx:265`, `pages/notifications.tsx:283`, `utils/notificationPermissions.ts:121`, `utils/notificationPermissions.ts:164`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/feedback-notify-admins.spec.ts`.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |
| docente | no | sent to /dashboard |
| encargado_licitacion | if permission manage_system_settings | sent to /dashboard — **the menu shows it, the middleware refuses** |

### What the page file itself draws

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshCw]» · tooltip «Actualizar» | `{() => { loadFeedback(); loadStats(); }}` |  |  |  | FeedbackDashboard · l.454 |
| «Marcar como visto» | `{(e) => { e.stopPropagation(); updateFeedbackStatus(item.id, 'seen'); }}` | `!(filteredList.length === 0) && each filteredList && item.status === 'new'` |  |  | FeedbackDashboard · l.523 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{getTypeIcon(item.type)} {item.profiles.first_name} {item.profiles.last_name} / {item.profiles.email} {formatDate(item.…» | `{() => { setSelectedFeedback(item); setShowDetail(true); }}` | `!(filteredList.length === 0) && each filteredList` | FeedbackDashboard · l.477 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por descripción o usuario...» | text | «Buscar por descripción o usuario...» |  |  |  | FeedbackDashboard · l.417 |
|  | select |  | «Todos los estados», «Nuevos», «Vistos», «En Progreso», «Resueltos», «Cerrados» |  |  | FeedbackDashboard · l.428 |
|  | select |  | «Todos los tipos», «Problemas», «Ideas», «Feedback» |  |  | FeedbackDashboard · l.442 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `FeedbackDetail` | component | `{showDetail}` |  | FeedbackDashboard · l.544 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar los datos» |  | checkUserAndLoadData · l.122 |
| error | «Error al cargar feedback» |  | loadFeedback · l.168 |
| success | «Estado actualizado» |  | updateFeedbackStatus · l.255 |
| error | «Error al actualizar estado» |  | updateFeedbackStatus · l.259 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkUserAndLoadData · l.89 |
| `/dashboard` | `router.push` | `!isAdminUser` | checkUserAndLoadData · l.103 |
| `/login` | `router.push` |  | handleLogout · l.320 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, session.user.id)` | checkUserAndLoadData · l.96 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | FeedbackDashboard · l.325 |
| `MainLayout` | pageTitle: Gestión de Feedback · breadcrumbs: Inicio / Feedback |  |  | FeedbackDashboard · l.345 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `labels` | «Nuevo», «Visto», «En Progreso», «Resuelto», «Cerrado» | getStatusBadge · l.283 |
| `formatDate()` | «Hace menos de 1 hora», «Hace {Math.floor(diffInHours)} horas», «Ayer» | formatDate · l.304 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Hace menos de 1 hora» | FeedbackDashboard · l.304 |
| «Hace {Math.floor(diffInHours)} horas» | FeedbackDashboard · l.306 |
| «Ayer» | FeedbackDashboard · l.308 |

**Values shown from data** (9)

- `{labels[status as keyof typeof label…} / {status}` — getStatusBadge · l.292
- `{stats.new_count}` — FeedbackDashboard · l.365
- `{stats.in_progress_count}` — FeedbackDashboard · l.377
- `{stats.resolved_count}` — FeedbackDashboard · l.389
- `{feedbackList.length}` — FeedbackDashboard · l.401
- `{item.profiles.first_name} {item.profiles.last_name} / {item.profiles.email}` — FeedbackDashboard · l.489, when `!(filteredList.length === 0) && each filteredList`
- `{formatDate(item.created_at)}` — FeedbackDashboard · l.492, when `!(filteredList.length === 0) && each filteredList`
- `{item.description}` — FeedbackDashboard · l.502, when `!(filteredList.length === 0) && each filteredList`
- `{item.page_url}` — FeedbackDashboard · l.506, when `!(filteredList.length === 0) && each filteredList`

**Other texts on screen** (8)

- «Cargando feedback...» — FeedbackDashboard · l.336, when `loading`
- «Nuevos» — FeedbackDashboard · l.364
- «En Progreso» — FeedbackDashboard · l.376
- «Resueltos» — FeedbackDashboard · l.388
- «Total» — FeedbackDashboard · l.400
- «No se encontraron resultados» — FeedbackDashboard · l.473, when `filteredList.length === 0`
- «{item._count.feedback_activity} comentarios» — FeedbackDashboard · l.497, when `!(filteredList.length === 0) && each filteredList && item._count?.feedback_activity`
- «Captura adjunta» — FeedbackDashboard · l.512, when `!(filteredList.length === 0) && each filteredList && item.screenshot_url`

**Reads and writes the database directly:** `table:feedback_activity` (select), `table:feedback_stats` (select), `table:platform_feedback` (select, update), `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/feedback/FeedbackDetail.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/roadmap

File `pages/admin/roadmap.tsx` · 149 lines · frame: MainLayout

### Who reaches it

- Menu: Sistema › «Roadmap MVP» → `/admin/roadmap` — admin only; the group: everyone signed in (`Sidebar.tsx` l.732)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.33 `router.push → /login  (when !session?.user)`
  - l.49 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.54 `router.push → /dashboard  (when !isAdminUser)`
  - l.61 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:734`
- Tests: no browser test that CI runs.

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

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | initializeAuth · l.33 |
| `/dashboard` | `router.push` | `!isAdminUser` | initializeAuth · l.54 |
| `/login` | `router.push` |  | initializeAuth · l.61 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | initializeAuth · l.49 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!router.isReady` | RoadmapPage · l.22 |
| `!user \|\| !isAdmin` | RoadmapPage · l.126 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | RoadmapPage · l.131 |
| `GeneraRoadmap` |  | `roadmapData` |  | RoadmapPage · l.138 |

**Other texts on screen** (2)

- «Cargando...» — RoadmapPage · l.121, when `loading`
- «Cargando roadmap...» — RoadmapPage · l.141, when `!(roadmapData)`

**Reads and writes the database directly:** `table:profiles` (select), `table:roadmap_data` (select, upsert)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/GeneraRoadmap.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/admin/FeedbackPermissionsManager.tsx

Used by: `/admin/configuration`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Permisos para Reportar Problemas» | h3 |  | FeedbackPermissionsManager · l.149 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Revocar permiso» | `{() => revokePermission(user.id, user.permission_id!)}` | `each filteredUsers && !(user.role === 'admin') && user.has_permission` |  |  | FeedbackPermissionsManager · l.216 |
| «Otorgar permiso» | `{() => grantPermission(user.id)}` | `each filteredUsers && !(user.role === 'admin') && !(user.has_permission)` |  |  | FeedbackPermissionsManager · l.224 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por nombre o email...» | text | «Buscar por nombre o email...» |  |  |  | FeedbackPermissionsManager · l.162 |
|  | select |  | «Todos los roles», «Administradores», «Consultores», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Docentes» |  |  | FeedbackPermissionsManager · l.171 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar usuarios» |  | loadUsers · l.67 |
| success | «Permiso otorgado exitosamente» |  | grantPermission · l.88 |
| error | «Error al otorgar permiso» |  | grantPermission · l.92 |
| success | «Permiso revocado exitosamente» |  | revokePermission · l.108 |
| error | «Error al revocar permiso» |  | revokePermission · l.112 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No authenticated user» | `throw (shown by whoever catches it)` | `!user` | grantPermission · l.76 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `roleNames` | «Administrador», «Consultor», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Docente» | getRoleName · l.127 |

**Values shown from data** (3)

- `{user.first_name} {user.last_name}` — FeedbackPermissionsManager · l.195, when `each filteredUsers`
- `{user.email}` — FeedbackPermissionsManager · l.198, when `each filteredUsers`
- `{getRoleName(user.role)}` — FeedbackPermissionsManager · l.200, when `each filteredUsers`

**Other texts on screen** (3)

- «Administra qué usuarios pueden reportar bugs y solicitar mejoras» — FeedbackPermissionsManager · l.153
- «Siempre activo» — FeedbackPermissionsManager · l.213, when `each filteredUsers && user.role === 'admin'`
- «No se encontraron usuarios con los filtros aplicados» — FeedbackPermissionsManager · l.240, when `filteredUsers.length === 0`

**Reads and writes the database directly:** `table:feedback_permissions` (insert, select, update), `table:profiles` (select)

### components/admin/GeneraRoadmap.tsx

Used by: `/admin/roadmap`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{data.title}» | h1 | `!(edit)` | GeneraRoadmap · l.430 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{label}» · also `onMouseEnter={() => setHov(true)} · onMouseLeave={() => setHov(false)}` | `{onClick}` |  |  |  | Btn · l.160 |
| «×» | `{onClose}` |  |  |  | EditPanel · l.291 |
| «SALIR DE EDICION / EDITAR» | `{() => { setEdit(e => !e); setSel(null) }}` |  |  |  | GeneraRoadmap · l.694 |

**Other things that react to a click** (10)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `Btn` |  | `{onSelect}` | `editMode && hov` | TaskRow · l.225 |
| `Btn` |  | `{onDelete}` | `editMode && hov` | TaskRow · l.226 |
| `div` |  | `{() => editMode && onSelect()}` |  | TaskRow · l.235 |
| `div` |  | `{() => setPhase(p => ({ ...p, color: c }))}` | `selected.type === 'phase' && phase && each PHASE_COLORS` | EditPanel · l.362 |
| `Btn` |  | `{() => setSel({ type: 'phase', phaseId: phase.id })}` | `each data.phases && edit` | GeneraRoadmap · l.546 |
| `Btn` |  | `{() => { if (window.confirm('¿Eliminar "${phase.label}"?')) { update(d => ({ ...…}` | `each data.phases && edit` | GeneraRoadmap · l.547 |
| `div` | «+ agregar tarea» | `{() => { const id = gid() const s = phase.tasks.length ? phase.tasks[phase.tasks…}` | `each data.phases && edit` | GeneraRoadmap · l.577 |
| `div` | «+ agregar fase» | `{() => { const id = gid() update(d => ({ ...d, phases: [...d.phases, { id, label…}` | `edit` | GeneraRoadmap · l.598 |
| `Btn` |  | `{() => update(d => ({ ...d, findings: d.findings.filter(fi => fi.id !== f.id) }))}` | `each data.findings && edit` | GeneraRoadmap · l.635 |
| `div` | «+ agregar punto» | `{() => update(d => ({ ...d, findings: [...d.findings, { id: gid(), color: BRAND.…}` | `edit` | GeneraRoadmap · l.647 |

**Fields** (8)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | textarea |  |  | `selected.type === 'task' && task` |  | EditPanel · l.302 |
|  | number | `min={key === 'e' ? task.s : 1} max={data.weeks.length}` |  | `selected.type === 'task' && task && each (['s', 'e'] as const)` |  | EditPanel · l.316 |
| «Hito / milestone» | checkbox |  |  | `selected.type === 'task' && task` |  | EditPanel · l.336 |
|  | text |  |  | `selected.type === 'phase' && phase` |  | EditPanel · l.351 |
|  | text |  |  | `edit` |  | GeneraRoadmap · l.422 |
|  | text |  |  | `edit` |  | GeneraRoadmap · l.436 |
|  | textarea |  |  | `edit` |  | GeneraRoadmap · l.466 |
|  | text |  |  | `each data.findings && edit` |  | GeneraRoadmap · l.628 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseEnter={() => setHov(true)} · onMouseLeave={() => setHov(false)}` |  | TaskRow · l.195 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Eliminar "{phase.label}"?» | `each data.phases && edit` | GeneraRoadmap · l.548 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Btn` | label: ✎ | `editMode && hov` |  | TaskRow · l.225 |
| `Btn` | label: × | `editMode && hov` |  | TaskRow · l.226 |
| `Btn` | label: ✎ | `each data.phases && edit` |  | GeneraRoadmap · l.546 |
| `Btn` | label: × | `each data.phases && edit` |  | GeneraRoadmap · l.547 |
| `Btn` | label: × | `each data.findings && edit` |  | GeneraRoadmap · l.635 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `DEFAULT_DATA` | «GENERA · MVP · 13 Semanas», «4 Mar → 31 May 2026 · 7 funcionalidades greenfield · 2 extensiones · 1 deadline inamovible», «INICIAR HOY — Onboarding comercial Transbank: 4–6 semanas de burocracia (verificación RUT, acuerdos comerciales, acceso al ambiente de pruebas). Sin esto, el p…», «Mar 4», «Mar 11», «Mar 18», «Mar 25», «Apr 1», «Apr 8», «Apr 15», «Apr 22», «Apr 29», «May 6», «May 13», «May 20», «May 27», «FASE 0 · FUNDACIÓN», «Schema DB — todas las tablas nuevas de una vez», «Nuevos roles: asesor / estudiante / familia», «TypeScript strict + estándares de error API», «FASE 1 · CAPA INDIVIDUAL», «Perfil estudiante + cómputo etapa de desarrollo», «Plan Personal: DB + API + categorías», «Plan Personal: UI (objetivos, reflexiones, progreso)», «Proyecto de Autoconocimiento (extender + standalone)», «FASE 2 · CAPA ASESOR», «UI gestión Equipo Base», «Sesiones asesor — extender sistema existente», «Dashboard asesor — vista semáforo», «Protocolo de traspaso asesor», «FASE 3 · GRUPO + CÍRCULO», «Círculo: interfaz facilitador estudiante», «Círculo: flujos pre/post + biblioteca de rituales», «Sociograma: capa de observación asesor», «Presentaciones familiares: prep + artefactos», «FASE 4 · SEÑALES + CUMPLIMIENTO», «Alertas tempranas: convergencia multi-indicador», «Consentimiento parental: flujo Clave Única», «Ley 21.719: cifrado app + registros consentimiento», «FASE 5 · PAGOS», «Stripe B2C suscripción + webhooks», «UX suscripción familiar (consumer-grade)», «Transbank (si onboarding completado a tiempo)», «FASE 6 · PRODUCCIÓN», «Sprint QA + corrección de bugs», «Auditoría seguridad + verificación RLS», «Performance + pruebas de carga», «Lanzamiento a producción», «Schema DB en S1 → previene reescritura de FK a mitad del sprint», «Capa individual primero → Equipo Base necesita estudiantes + planes como referencia», «Sesiones consultor existentes = 70% de sesiones asesor ya construidas → gran ventaja», «Sociograma después de sesiones → necesita datos de observación para poblar», «Alertas al final → requiere convergencia de sociograma + datos del plan», «Stripe en paralelo con Fase 4 → desacoplado de funcionalidades pedagógicas», «Transbank comienza HOY — 4–6 semanas de trámites, no puede acelerarse» | l.69 |
| `iBase` | «1px solid {BRAND.border}», «Inter, Helvetica Neue, Arial, system-ui, sans-serif», «8px 12px» | l.130 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «INICIAR HOY — Onboarding comercial Transbank: 4–6 semanas de burocracia (verificación RUT, acuerdos comerciales, acceso al ambiente de pruebas). Sin esto, el pago no estará listo en mayo. Construir Stripe como fallback en paralelo.» | DEFAULT_DATA · l.72 |
| «Nueva tarea» | GeneraRoadmap · l.583 |
| «Nuevo punto de lógica» | GeneraRoadmap · l.649 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | GeneraRoadmap · l.395 |

**Values shown from data** (6)

- `{task.name}` — TaskRow · l.208
- `{data.weeks[task.s - 1]} → {data.weeks[task.e - 1]}` — EditPanel · l.331, when `selected.type === 'task' && task`
- `{data.subtitle}` — GeneraRoadmap · l.444, when `!(edit)`
- `{data.alert}` — GeneraRoadmap · l.474, when `!(edit)`
- `{phase.label}` — GeneraRoadmap · l.540, when `each data.phases`
- `{f.text}` — GeneraRoadmap · l.640, when `each data.findings && !(edit)`

**Other texts on screen** (20)

- «Editar Tarea / Editar Fase» — EditPanel · l.287
- «Nombre» — EditPanel · l.301, when `selected.type === 'task' && task`
- «Sem. inicio / Sem. fin» — EditPanel · l.312, when `selected.type === 'task' && task && each (['s', 'e'] as const)`
- «Hito / milestone» (label) — EditPanel · l.335, when `selected.type === 'task' && task`
- «Nombre» — EditPanel · l.350, when `selected.type === 'phase' && phase`
- «Color» — EditPanel · l.359, when `selected.type === 'phase' && phase`
- «ACCION CRITICA PARALELA» — GeneraRoadmap · l.463
- «HOY» — GeneraRoadmap · l.496, when `each data.weeks && i === 0`
- «LAUNCH» — GeneraRoadmap · l.500, when `each data.weeks && i === nW - 1`
- «Transbank onboarding» — GeneraRoadmap · l.513
- «[externo — iniciar hoy]» — GeneraRoadmap · l.514
- «SEMANAS 1–8» — GeneraRoadmap · l.528
- «+ agregar tarea» — GeneraRoadmap · l.591, when `each data.phases && edit`
- «+ agregar fase» — GeneraRoadmap · l.609, when `edit`
- «Lógica de Secuenciación» — GeneraRoadmap · l.619
- «+ agregar punto» — GeneraRoadmap · l.654, when `edit`
- «Hallazgo del audit:» — GeneraRoadmap · l.668
- «El sistema de sesiones consultor existente (11 tablas, completamente operacional) se mapea casi directamente a sesiones uno-a-uno del asesor. La Fase 2 es más rápida de lo que parece. Los 9 roles actuales son FNE-internos — agregar asesor/estudiante/familia en Semana 1 debe hacerse sin romper los f…» — GeneraRoadmap · l.670
- «GUARDANDO...» — GeneraRoadmap · l.710, when `saving`
- «GUARDADO» — GeneraRoadmap · l.711, when `saved && !saving`

### components/feedback/FeedbackDetail.tsx

Used by: `/admin/feedback`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Detalle de Feedback» | h3 |  | FeedbackDetail · l.247 |
| «Descripción» | h4 |  | FeedbackDetail · l.307 |
| «Captura de pantalla» | h4 | `feedback.screenshot_url` | FeedbackDetail · l.314 |
| «Detalles técnicos» | h4 |  | FeedbackDetail · l.326 |
| «Acciones» | h4 |  | FeedbackDetail · l.356 |
| «Actividad» | h4 |  | FeedbackDetail · l.400 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» · aria «Close modal» | `{onClose}` |  |  | `testid=close-modal-button` | FeedbackDetail · l.254 |
| «Copiar Detalles» · tooltip «Copiar todos los detalles del error para Claude Code» | `{copyErrorDetailsForClaude}` |  |  |  | FeedbackDetail · l.270 |
| «Marcar en progreso» | `{() => onStatusUpdate('in_progress')}` | `feedback.status !== 'in_progress' && feedback.status !== 'resolved' && feedback.status !== 'closed'` |  |  | FeedbackDetail · l.359 |
| «Marcar como resuelto» | `{() => onStatusUpdate('resolved')}` | `feedback.status !== 'resolved' && feedback.status !== 'closed'` |  |  | FeedbackDetail · l.367 |
| «Cerrar ticket» | `{() => onStatusUpdate('closed')}` | `feedback.status === 'resolved'` |  |  | FeedbackDetail · l.375 |
| «Cerrar ventana» | `{onClose}` |  |  |  | FeedbackDetail · l.387 |
| «[icon Send]» · aria «Send comment» | `{addComment}` |  | `{isSubmitting \|\| !newComment.trim()}` | `testid=send-comment-button` | FeedbackDetail · l.456 |
| «[icon X]» | `{() => setShowFullScreenshot(false)}` | `showFullScreenshot && feedback.screenshot_url` |  |  | FeedbackDetail · l.484 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{feedback.page_url}» | `{feedback.page_url}` (new tab) | `isHttpPageUrl(feedback.page_url)` |  | FeedbackDetail · l.331 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | FeedbackDetail · l.235 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Agregar comentario...» | text | «Agregar comentario...» · disabled: `{isSubmitting}` · also `onKeyPress={(e) => e.key === 'Enter' && addComment()}` |  |  |  | FeedbackDetail · l.447 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${feedback.profiles.first_name} ${feedback.profiles.last_name}`} · {feedback.profiles.avatar_url} | `feedback.profiles.avatar_url` |  | FeedbackDetail · l.283 |
| img · alt Screenshot · {feedback.screenshot_url} | `feedback.screenshot_url` |  | FeedbackDetail · l.315 |
| img · alt Screenshot · {feedback.screenshot_url} | `showFullScreenshot && feedback.screenshot_url` |  | FeedbackDetail · l.479 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Detalle de Feedback» | written in this file |  |  | FeedbackDetail · l.233 |
| «(sin título)» | written in this file | `showFullScreenshot && feedback.screenshot_url` |  | FeedbackDetail · l.475 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Comentario agregado» |  | addComment · l.124 |
| error | «Error al agregar comentario» |  | addComment · l.127 |
| success | «¡Detalles copiados para Claude Code!» |  | copyErrorDetailsForClaude · l.222 |
| error | «Error al copiar los detalles» |  | copyErrorDetailsForClaude · l.225 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | addComment · l.109 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !feedback` | FeedbackDetail · l.229 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Feature Request» | FeedbackDetail · l.192 |
| «General Feedback» | FeedbackDetail · l.192 |
| «**Console Error:** ``` {consoleError} ```» | FeedbackDetail · l.205 |
| «Not captured» | FeedbackDetail · l.211 |
| «Resolution Notes: {feedback.resolution_notes}» | FeedbackDetail · l.215 |

**Values shown from data** (10)

- `# {feedback.id.slice(0, 8).toUpperCase…}` — FeedbackDetail · l.250
- `{feedback.profiles.first_name} {feedback.profiles.last_name}` — FeedbackDetail · l.294
- `{feedback.profiles.email}` — FeedbackDetail · l.297
- `{feedback.description}` — FeedbackDetail · l.308
- `{feedback.page_url}` — FeedbackDetail · l.340, when `!(isHttpPageUrl(feedback.page_url))`
- `{JSON.stringify(feedback.browser_inf…}` — FeedbackDetail · l.346, when `feedback.browser_info`
- `{activity.message}` — FeedbackDetail · l.421, when `!(activities.length === 0) && each activities && activity.is_system_message`
- `{activity.profiles?.first_name} {activity.profiles?.last_name}` — FeedbackDetail · l.427, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`
- `{formatDate(activity.created_at)}` — FeedbackDetail · l.430, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`
- `{activity.message}` — FeedbackDetail · l.434, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`

**Other texts on screen** (3)

- «Ver información del navegador» (label) — FeedbackDetail · l.345, when `feedback.browser_info`
- «Ticket cerrado» — FeedbackDetail · l.384, when `feedback.status === 'closed'`
- «Sin actividad aún» — FeedbackDetail · l.408, when `activities.length === 0`

**Reads and writes the database directly:** `table:feedback_activity` (insert, select)

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/configuration`

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

### types/roles.ts

Used by: `/admin/configuration`, `/admin/feedback`, `/admin/roadmap`

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

Used by: `/admin/feedback`, `/admin/roadmap`

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

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/check-rls-policies` | `pages/api/admin/check-rls-policies.ts` | GET | **no screen** |  |
| `/api/admin/emergency-restore` | `pages/api/admin/emergency-restore.ts` |  | **no screen** |  |
| `/api/admin/form-usage-stats` | `pages/api/admin/form-usage-stats.ts` | GET | **no screen** |  |
| `/api/admin/system-updates` | `pages/api/admin/system-updates.ts` | POST | **no screen** |  |
| `/api/bots/link-code` | `pages/api/bots/link-code.ts` | POST | `/expense-reports` | `__tests__/api/bots/link-code.test.ts`, `pages/expense-reports.tsx` |
| `/api/bots/telegram` | `pages/api/bots/telegram.ts` | POST | **no screen** | `__tests__/api/bots/telegram.test.ts` |
| `/api/check-env` | `pages/api/check-env.js` |  | **no screen** |  |
| `/api/cron/assessment-delivery` | `pages/api/cron/assessment-delivery.ts` |  | **no screen** | `__tests__/api/cron/assessment-delivery.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/assessment-delivery.spec.ts`, `tests/e2e/due-reminders.spec.ts` +3 |
| `/api/cron/auth-retention` | `pages/api/cron/auth-retention.ts` |  | **no screen** | `__tests__/api/cron/auth-retention.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `vercel.json` |
| `/api/cron/cleanup-learning-path-sessions` | `pages/api/cron/cleanup-learning-path-sessions.ts` | GET, POST | **no screen** | `__tests__/api/cron/cleanup-learning-path-sessions.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/update-learning-path-summaries.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `pages/api/cron/update-learning-path-summaries.ts` +2 |
| `/api/cron/due-reminders` | `pages/api/cron/due-reminders.ts` |  | **no screen** | `__tests__/api/cron/due-reminders.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `vercel.json` |
| `/api/cron/email-digest` | `pages/api/cron/email-digest.ts` |  | **no screen** | `__tests__/api/cron/email-digest.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/notification-dispatch.spec.ts`, `vercel.json` |
| `/api/cron/monitor-enrollments` | `pages/api/cron/monitor-enrollments.ts` |  | **no screen** | `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/lib/notificationService.source-context.test.ts` |
| `/api/cron/notification-email-retention` | `pages/api/cron/notification-email-retention.ts` |  | **no screen** | `__tests__/api/cron/notification-email-retention.test.ts` |
| `/api/cron/notification-emails` | `pages/api/cron/notification-emails.ts` |  | **no screen** | `__tests__/api/cron/notification-emails.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/notification-dispatch.spec.ts`, `vercel.json` |
| `/api/cron/pasantias-letters` | `pages/api/cron/pasantias-letters.ts` |  | **no screen** | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/pasantias-panel.spec.ts`, `vercel.json` |
| `/api/cron/pasantias-retention` | `pages/api/cron/pasantias-retention.ts` |  | **no screen** | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/pasantias-panel.spec.ts`, `vercel.json` |
| `/api/cron/recovery-outbox` | `pages/api/cron/recovery-outbox.ts` |  | **no screen** | `__tests__/api/cron/recovery-outbox.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/auth-lifecycle.spec.ts`, `vercel.json` |
| `/api/cron/session-reminders` | `pages/api/cron/session-reminders.ts` |  | **no screen** | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/sessions/session-notifications.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `vercel.json` |
| `/api/cron/test-reminders` | `pages/api/cron/test-reminders.ts` |  | **no screen** |  |
| `/api/cron/update-learning-path-summaries` | `pages/api/cron/update-learning-path-summaries.ts` | POST | **no screen** | `__tests__/api/cron/update-learning-path-summaries.test.ts`, `tests/e2e/learning-path-governance.spec.ts` |
| `/api/cron/zoom-reconcile` | `pages/api/cron/zoom-reconcile.ts` |  | **no screen** | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/zoom-reconcile.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/zoom-mock-mode.spec.ts`, `vercel.json` |
| `/api/cron/zoom-ticker` | `pages/api/cron/zoom-ticker.ts` |  | **no screen** | `__tests__/api/cron/session-reminders.test.ts`, `__tests__/api/cron/zoom-ticker.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/zoom-mock-mode.spec.ts`, `vercel.json` |
| `/api/debug/check-course-images` | `pages/api/debug/check-course-images.ts` | GET | **no screen** | `__tests__/api/cursos-admin-only-routes.test.ts` |
| `/api/monitoring/run-checks` | `pages/api/monitoring/run-checks.ts` | POST | **no screen** |  |
| `/api/test-bucket` | `pages/api/test-bucket.js` |  | **no screen** |  |
| `/api/test/notification-triggers` | `pages/api/test/notification-triggers.ts` |  | **no screen** |  |

