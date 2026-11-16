# Sistema (configuration, support, roadmap, test and debug pages, scheduled jobs)

Area `19-sistema`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `58b8d169f` (2026-11-12).

18 screen files, 26 API files, 18 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/bucket-test` | `pages/admin/bucket-test.tsx` | 208 | — | Leftover (on the list for Brent) |
| `/admin/configuration` | `pages/admin/configuration.tsx` | 531 | Sistema › Configuración |  |
| `/admin/debug/course-module-ids` | `pages/admin/debug/course-module-ids.tsx` | 269 | — | Leftover (on the list for Brent) |
| `/admin/debug/ids` | `pages/admin/debug/ids.tsx` | 209 | — | Leftover (on the list for Brent) |
| `/admin/feedback` | `pages/admin/feedback.tsx` | 557 | Gestión › Soporte Técnico |  |
| `/admin/form-usage` | `pages/admin/form-usage.tsx` | 233 | — | Leftover (on the list for Brent) |
| `/admin/roadmap` | `pages/admin/roadmap.tsx` | 149 | Sistema › Roadmap MVP |  |
| `/admin/test-spanish-input` | `pages/admin/test-spanish-input.tsx` | 104 | — | Leftover (on the list for Brent) |
| `/brand-preview` | `pages/brand-preview.tsx` | 1580 | — | Leftover (on the list for Brent) |
| `/debug-feedback-permissions` | `pages/debug-feedback-permissions.tsx` | 100 | — | Leftover (on the list for Brent) |
| `/email-showcase` | `pages/email-showcase.tsx` | 506 | — | Leftover (on the list for Brent) |
| `/test-logout` | `pages/test-logout.tsx` | 84 | — | Leftover (on the list for Brent) |
| `/test-rbac` | `pages/test-rbac.tsx` | 77 | — | Leftover (on the list for Brent) |
| `/test-sentry` | `pages/test-sentry.tsx` | 81 | — | Leftover (on the list for Brent) |
| `/test-sidebar-role` | `pages/test-sidebar-role.tsx` | 62 | — | Leftover (on the list for Brent) |
| `/test-toast` | `pages/test-toast.tsx` | 270 | — | Leftover (on the list for Brent) |
| `/test-user-role` | `pages/test-user-role.tsx` | 89 | — | Leftover (on the list for Brent) |
| `/test` | `pages/test.tsx` | 4 | — | Leftover (on the list for Brent) |

## /admin/bucket-test

File `pages/admin/bucket-test.tsx` · 208 lines · frame: old Header

**Leftover (on the list for Brent)** — Lists the file-storage buckets and can ask the database to create one. Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
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

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Supabase Storage Bucket Test» | h1 |  | BucketTest · l.103 |
| «Variables de Entorno» | h2 | `!(loading) && !(error)` | BucketTest · l.124 |
| «Resultados de Buckets» | h2 | `!(loading) && !(error)` | BucketTest · l.131 |
| «Bucket: {bucket} Accesible / No Accesible» | h3 | `!(loading) && !(error) && each bucketNames` | BucketTest · l.143 |
| «Resultado de Crear Bucket: {createBucketResult.bucket}» | h3 | `!(loading) && !(error) && createBucketResult` | BucketTest · l.173 |
| «Solución Recomendada» | h2 | `!(loading) && !(error)` | BucketTest · l.189 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «← Volver al Administrador» |  |  |  |  | BucketTest · l.107 |
| «Intentar Crear Bucket» | `{() => handleCreateBucket(bucket)}` | `!(loading) && !(error) && each bucketNames && !(exists)` |  |  | BucketTest · l.158 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «← Volver al Administrador» | `/admin/course-builder` |  |  | BucketTest · l.106 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Header` |  |  |  | BucketTest · l.99 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `envInfo` | «Not set (will use fallback)», «Set [if process.env.NEXT_PUBLIC_SUPABASE_URL]», «Not set [if not process.env.NEXT_PUBLIC_SUPABASE_URL]», «Set [if process.env.NEXT_PUBLIC_SUPABASE_ANON_K…]», «Not set [if not process.env.NEXT_PUBLIC_SUPABASE_ANON_K…]» | testBuckets · l.23 |

**Values shown from data** (3)

- `{JSON.stringify(results?.environment…}` — BucketTest · l.125, when `!(loading) && !(error)`
- `{bucketInfo.error}` — BucketTest · l.156, when `!(loading) && !(error) && each bucketNames && !(exists)`
- `{JSON.stringify(createBucketResult, …}` — BucketTest · l.174, when `!(loading) && !(error) && createBucketResult`

**Other texts on screen** (14)

- «Supabase Bucket Test \| LMS» — BucketTest · l.96
- «Probando buckets de almacenamiento...» — BucketTest · l.115, when `loading`
- «Error: {error}» — BucketTest · l.119, when `!(loading) && error`
- «Archivos: {bucketInfo.fileCount}» — BucketTest · l.152, when `!(loading) && !(error) && each bucketNames && exists`
- «Nota: La creación de buckets podría requerir permisos de administrador en Supabase y es posible que no funcione desde el cliente. Si los buckets no son accesibles, deberá crearlos desde el panel de control de Supabase.» — BucketTest · l.182, when `!(loading) && !(error)`
- «Verifique que el bucket» — BucketTest · l.191, when `!(loading) && !(error)`
- «resources» — BucketTest · l.191, when `!(loading) && !(error)`
- «existe en su proyecto de Supabase» — BucketTest · l.191, when `!(loading) && !(error)`
- «Asegúrese de que el bucket tenga los permisos correctos (público para archivos públicos)» — BucketTest · l.192, when `!(loading) && !(error)`
- «Cree un archivo» — BucketTest · l.193, when `!(loading) && !(error)`
- «.env.local» — BucketTest · l.193, when `!(loading) && !(error)`
- «en la raíz del proyecto con:» — BucketTest · l.193, when `!(loading) && !(error)`
- «NEXT_PUBLIC_STORAGE_BUCKET=resources» — BucketTest · l.195, when `!(loading) && !(error)`
- «Reinicie el servidor de desarrollo» — BucketTest · l.198, when `!(loading) && !(error)`

**Reads and writes the database directly:** `bucket:{bucket}` (list), `rpc:create_storage_bucket`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/Header.tsx`
- `components/notifications/NotificationBell.tsx`
- `components/notifications/NotificationDropdown.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/notifications` | GET | `components/notifications/NotificationBell.tsx:41` |
| `/api/notifications/[id]/read` | POST | `components/notifications/NotificationBell.tsx:85` |
| `/api/notifications/mark-all-read` | POST | `components/notifications/NotificationBell.tsx:113` |

## /admin/configuration

File `pages/admin/configuration.tsx` · 531 lines · frame: MainLayout

### Who reaches it

- Menu: Sistema › «Configuración» → `/admin/configuration` — permission: manage_system_settings; the group: everyone signed in (`Sidebar.tsx` l.725)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.66 `router.push → /login  (when !session?.user)`
  - l.81 `adminFromMetadata = metadataHasRole(userData?.user?.user_metadata, 'admin')`
  - l.94 `router.push → /dashboard  (when !hasAdminRoleInDB && !adminFromMetadata)`
  - l.109 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:727`, `pages/admin/context-questions/index.tsx:341`, `pages/debug-feedback-permissions.tsx:65`, `pages/debug-feedback-permissions.tsx:71`
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

## /admin/debug/course-module-ids

File `pages/admin/debug/course-module-ids.tsx` · 269 lines · frame: none

**Leftover (on the list for Brent)** — Lists course and module ids (a second copy). Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.71 `router.push → /login  (when !session?.user)`
  - l.100 `router.push → /dashboard  (when !isAdminUser && profileData?.role !== 'admin')`
  - l.113 `router.push → /login`
  - l.154 `router.push → /login`
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

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Debug: Course & Module IDs» | h1 |  | DebugCoursesModules · l.179 |
| «Available Courses & Modules» | h2 | `!(courses.length === 0)` | DebugCoursesModules · l.204 |
| «{course.title}» | h3 | `!(courses.length === 0) && each courses` | DebugCoursesModules · l.209 |
| «Modules:» | h4 | `!(courses.length === 0) && each courses` | DebugCoursesModules · l.217 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar Sesión» | `{onLogout}` | screen size: `hidden md:block` |  |  | SimpleHeader · l.28 |
| «Create a Course» |  | `courses.length === 0` |  |  | DebugCoursesModules · l.197 |
| «Go to Lessons Page» |  | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  |  | DebugCoursesModules · l.230 |
| «Copy Path» | `{() => { navigator.clipboard.writeText('/admin/course-builder/${course.id}/${mod…}` | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  |  | DebugCoursesModules · l.235 |
| «Create Modules» |  | `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)` |  |  | DebugCoursesModules · l.252 |

**Links** (7)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[img: Genera Logo]» | `/` |  |  | SimpleHeader · l.14 |
| «Inicio» | `/` | screen size: `hidden md:flex` |  | SimpleHeader · l.19 |
| «Mi Panel» | `/dashboard` | screen size: `hidden md:flex` |  | SimpleHeader · l.20 |
| «Cursos» | `/admin/course-builder` | `isAdmin` · screen size: `hidden md:flex` |  | SimpleHeader · l.22 |
| «Create a Course» | `/admin/course-builder` | `courses.length === 0` |  | DebugCoursesModules · l.196 |
| «Go to Lessons Page» | `/admin/course-builder/[*]/[*]/lessons` | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  | DebugCoursesModules · l.229 |
| «Create Modules» | `/admin/course-builder/[*]/modules` | `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)` |  | DebugCoursesModules · l.251 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera Logo · /images/logo.png |  |  | SimpleHeader · l.15 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «Path copied to clipboard!» | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` | DebugCoursesModules · l.238 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error fetching data» | `setError` |  | fetchCoursesAndModules · l.148 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.71 |
| `/dashboard` | `router.push` | `!isAdminUser && profileData?.role !== 'admin'` | checkSession · l.100 |
| `/login` | `router.push` |  | checkSession · l.113 |
| `/login` | `router.push` |  | handleLogout · l.154 |

**Values shown from data** (2)

- `{error}` — DebugCoursesModules · l.189, when `error`
- `{module.title}` — DebugCoursesModules · l.223, when `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]`

**Other texts on screen** (7)

- «Cargando...» — DebugCoursesModules · l.162, when `loading`
- «Debug: Course & Module IDs \| Genera» — DebugCoursesModules · l.171
- «Use this page to find course and module IDs for testing the lessons page.» — DebugCoursesModules · l.183
- «No courses found in the database.» — DebugCoursesModules · l.195, when `courses.length === 0`
- «Course ID:» — DebugCoursesModules · l.213, when `!(courses.length === 0) && each courses`
- «Module ID:» — DebugCoursesModules · l.225, when `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]`
- «No modules found for this course.» — DebugCoursesModules · l.250, when `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)`

**Reads and writes the database directly:** `table:courses` (select), `table:modules` (select), `table:profiles` (select)

## /admin/debug/ids

File `pages/admin/debug/ids.tsx` · 209 lines · frame: none

**Leftover (on the list for Brent)** — Lists course and module ids. Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.24 `router.push → /login  (when !session?.user)`
  - l.36 `router.push → /login`
  - l.77 `router.push → /login`
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

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Debug: Course & Module IDs» | h1 |  | DebugIds · l.119 |
| «Available Courses & Modules» | h2 | `!(courses.length === 0)` | DebugIds · l.144 |
| «{course.title}» | h3 | `!(courses.length === 0) && each courses` | DebugIds · l.149 |
| «Modules:» | h4 | `!(courses.length === 0) && each courses` | DebugIds · l.157 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar Sesión» | `{handleLogout}` |  |  |  | DebugIds · l.106 |
| «Create a Course» |  | `courses.length === 0` |  |  | DebugIds · l.137 |
| «Go to Lessons Page» |  | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  |  | DebugIds · l.170 |
| «Copy Path» | `{() => { navigator.clipboard.writeText('/admin/course-builder/${course.id}/${mod…}` | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  |  | DebugIds · l.175 |
| «Create Modules» |  | `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)` |  |  | DebugIds · l.192 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Genera» | `/` |  |  | DebugIds · l.101 |
| «Create a Course» | `/admin/course-builder` | `courses.length === 0` |  | DebugIds · l.136 |
| «Go to Lessons Page» | `/admin/course-builder/[*]/[*]/lessons` | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` |  | DebugIds · l.169 |
| «Create Modules» | `/admin/course-builder/[*]/modules` | `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)` |  | DebugIds · l.191 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «Path copied to clipboard!» | `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]` | DebugIds · l.178 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error fetching data» | `setError` |  | fetchCoursesAndModules · l.71 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.24 |
| `/login` | `router.push` |  | checkSession · l.36 |
| `/login` | `router.push` |  | handleLogout · l.77 |

**Values shown from data** (2)

- `{error}` — DebugIds · l.129, when `error`
- `{module.title}` — DebugIds · l.163, when `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]`

**Other texts on screen** (7)

- «Cargando...» — DebugIds · l.85, when `loading`
- «Debug: Course & Module IDs \| Genera» — DebugIds · l.94
- «Use this page to find course and module IDs for testing the lessons page.» — DebugIds · l.123
- «No courses found in the database.» — DebugIds · l.135, when `courses.length === 0`
- «Course ID:» — DebugIds · l.153, when `!(courses.length === 0) && each courses`
- «Module ID:» — DebugIds · l.165, when `!(courses.length === 0) && each courses && modules[course.id]?.length > 0 && each modules[course.id]`
- «No modules found for this course.» — DebugIds · l.190, when `!(courses.length === 0) && each courses && !(modules[course.id]?.length > 0)`

**Reads and writes the database directly:** `table:courses` (select), `table:modules` (select)

## /admin/feedback

File `pages/admin/feedback.tsx` · 557 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Soporte Técnico» → `/admin/feedback` — permission: manage_system_settings; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.590)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.89 `router.push → /login  (when !session?.user)`
  - l.96 `{ effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, session.user.id)`
  - l.103 `router.push → /dashboard  (when !isAdminUser)`
  - l.320 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:592`, `components/notifications/ModernNotificationCenter.tsx:297`, `components/notifications/ModernNotificationCenter.tsx:315`, `components/notifications/NotificationDropdown.tsx:136`, `components/notifications/NotificationDropdown.tsx:154`, `lib/notificationEvents.ts:397`, `lib/notifications/catalog.ts:377`, `pages/notifications.tsx:265`, `pages/notifications.tsx:283`, `utils/notificationPermissions.ts:121`, `utils/notificationPermissions.ts:164`
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

## /admin/form-usage

File `pages/admin/form-usage.tsx` · 233 lines · frame: MainLayout

**Leftover (on the list for Brent)** — «Uso del Formulario de Contacto»: counts contact-form sends against a free Formspree plan of 50 a month. Nothing on the site records a send any more (only this page reads the counter), so it always shows old numbers. Nothing links to it. Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.36 `router.push → /  (when !session?.user?.id)`
  - l.39 `role = await getUserPrimaryRole(session.user.id)`
  - l.41 `router.push → /  (when role !== 'admin')`
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

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Uso del Formulario de Contacto» | h1 |  | FormUsage · l.96 |
| «⚠️ Límite Próximo a Alcanzarse» | h3 | `stats && stats.total >= 45` | FormUsage · l.110 |
| «Envíos Recientes» | h2 | `stats` | FormUsage · l.168 |
| «Información del Plan» | h3 | `stats` | FormUsage · l.206 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Actualiza tu plan de Formspree aquí →» | `https://formspree.io/forms/mblkwada/settings/billing` (new tab) | `stats && stats.total >= 45` |  | FormUsage · l.116 |
| «Actualizar Plan en Formspree →» | `https://formspree.io/forms/mblkwada/settings/billing` (new tab) | `stats` |  | FormUsage · l.219 |

**Table columns** (3)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» | `stats` | FormUsage · l.174 |
| «Nombre» | `stats` | FormUsage · l.177 |
| «Email» | `stats` | FormUsage · l.180 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/` | `router.push` | `!session?.user?.id` | checkAdminAndLoadStats · l.36 |
| `/` | `router.push` | `role !== 'admin'` | checkAdminAndLoadStats · l.41 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `role = await getUserPrimaryRole(session.user.id)` | checkAdminAndLoadStats · l.39 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isAdmin` | FormUsage · l.75 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | FormUsage · l.67 |
| `MainLayout` |  |  |  | FormUsage · l.94 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | FormUsage · l.48 |

**Values shown from data** (7)

- `{stats.total}` — FormUsage · l.129, when `stats`
- `{stats.remaining}` — FormUsage · l.137, when `stats`
- `{stats.percentage.toFixed(0)} %` — FormUsage · l.145, when `stats`
- `{stats.resetDate}` — FormUsage · l.158, when `stats`
- `{new Date(submission.submission_date…}` — FormUsage · l.188, when `stats && each stats.submissions.slice(0, 10)`
- `{submission.sender_name}` — FormUsage · l.191, when `stats && each stats.submissions.slice(0, 10)`
- `{submission.sender_email}` — FormUsage · l.194, when `stats && each stats.submissions.slice(0, 10)`

**Other texts on screen** (16)

- «Has usado» — FormUsage · l.114, when `stats && stats.total >= 45`
- «de 50 emails gratuitos. Quedan solo» — FormUsage · l.114, when `stats && stats.total >= 45`
- «envíos.» — FormUsage · l.114, when `stats && stats.total >= 45`
- «Emails Enviados» — FormUsage · l.128, when `stats`
- «de 50» — FormUsage · l.132, when `stats`
- «Emails Restantes» — FormUsage · l.136, when `stats`
- «este mes» — FormUsage · l.140, when `stats`
- «Uso del Mes» — FormUsage · l.144, when `stats`
- «Reinicio de Límite» — FormUsage · l.157, when `stats`
- «próximo reinicio» — FormUsage · l.161, when `stats`
- «Actualmente estás usando el plan gratuito de Formspree (50 emails/mes).» — FormUsage · l.210, when `stats`
- «Si necesitas más envíos, considera actualizar a:» — FormUsage · l.213, when `stats`
- «Gold ($8/mes):» — FormUsage · l.216, when `stats`
- «1,000 envíos mensuales» — FormUsage · l.216, when `stats`
- «Platinum ($40/mes):» — FormUsage · l.217, when `stats`
- «5,000 envíos mensuales» — FormUsage · l.217, when `stats`

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/form-usage-stats` | GET | `pages/admin/form-usage.tsx:47` |

## /admin/roadmap

File `pages/admin/roadmap.tsx` · 149 lines · frame: MainLayout

### Who reaches it

- Menu: Sistema › «Roadmap MVP» → `/admin/roadmap` — admin only; the group: everyone signed in (`Sidebar.tsx` l.733)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.33 `router.push → /login  (when !session?.user)`
  - l.49 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.54 `router.push → /dashboard  (when !isAdminUser)`
  - l.61 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:735`
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

## /admin/test-spanish-input

File `pages/admin/test-spanish-input.tsx` · 104 lines · frame: old Header

**Leftover (on the list for Brent)** — A test of typing accents and ñ into a field. Admin only.

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
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

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Test de Entrada de Caracteres Españoles» | h1 |  | TestSpanishInput · l.32 |
| «Valor actual:» | h3 |  | TestSpanishInput · l.52 |
| «Códigos de caracteres:» | h3 |  | TestSpanishInput · l.57 |
| «Prueba copiando y pegando estos textos:» | h3 |  | TestSpanishInput · l.66 |
| «Información del navegador:» | h3 |  | TestSpanishInput · l.86 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Copiar» | `{() => { navigator.clipboard.writeText(str); alert('Copiado al portapapeles'); }}` | `each testStrings` |  |  | TestSpanishInput · l.71 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Campo de prueba - Intenta escribir: módulo, ¿qué?, niño, etc.» | text | «Escribe aquí caracteres especiales del español...» |  |  |  | TestSpanishInput · l.39 |

**Browser alert()** (1)

| Text | When | Where |
|---|---|---|
| «Copiado al portapapeles» | `each testStrings` | TestSpanishInput · l.74 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Header` |  |  |  | TestSpanishInput · l.29 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `testStrings` | «¿Qué es el plan personal?», «¡Hola! ¿Cómo estás?», «Módulo de introducción», «Niño, año, señor», «áéíóú ÁÉÍÓÚ ñÑ» | TestSpanishInput · l.19 |

**Values shown from data** (2)

- `{code}` — TestSpanishInput · l.60, when `each charCodes`
- `{str}` — TestSpanishInput · l.70, when `each testStrings`

**Other texts on screen** (8)

- «Campo de prueba - Intenta escribir: módulo, ¿qué?, niño, etc.» (label) — TestSpanishInput · l.36
- «{testInput} / (vacío)» — TestSpanishInput · l.53
- «User Agent:» — TestSpanishInput · l.88
- «N/A» — TestSpanishInput · l.88
- «Idioma:» — TestSpanishInput · l.91
- «N/A» — TestSpanishInput · l.91
- «Codificación del documento:» — TestSpanishInput · l.94
- «N/A» — TestSpanishInput · l.94

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/Header.tsx`
- `components/notifications/NotificationBell.tsx`
- `components/notifications/NotificationDropdown.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/notifications` | GET | `components/notifications/NotificationBell.tsx:41` |
| `/api/notifications/[id]/read` | POST | `components/notifications/NotificationBell.tsx:85` |
| `/api/notifications/mark-all-read` | POST | `components/notifications/NotificationBell.tsx:113` |

## /brand-preview

File `pages/brand-preview.tsx` · 1580 lines · frame: none

**Leftover (on the list for Brent)** — A 1,580-line internal brand guide and audit page. A browser test that CI runs visits it (footer-heading-order.spec.ts): the test must change in the same release that retires the page.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/DynamicFavicon.tsx:31`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`.

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

**Titles** (35)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Genera Brand Preview» | h1 |  | BrandPreview · l.46 |
| «Logo Principal» | h3 |  | GeneraBrandShowcase · l.119 |
| «Paleta de Colores» | h3 |  | GeneraBrandShowcase · l.136 |
| «Tipografia - Inter» | h3 |  | GeneraBrandShowcase · l.183 |
| «Variantes de Logo Disponibles» | h3 |  | GeneraBrandShowcase · l.207 |
| «Sidebar» | h3 |  | GeneraBrandShowcase · l.314 |
| «Header» | h3 |  | GeneraBrandShowcase · l.328 |
| «Liderazgo Transformacional» | h4 |  | GeneraBrandShowcase · l.428 |
| «Cursos Completados» | h4 |  | GeneraBrandShowcase · l.440 |
| «Nueva tarea asignada» | h4 |  | GeneraBrandShowcase · l.460 |
| «Alertas (On-Brand)» | h3 |  | GeneraBrandShowcase · l.548 |
| «Toast Notifications (On-Brand)» | h3 |  | GeneraBrandShowcase · l.613 |
| «Comparacion de Colores» | h2 |  | BrandComparison · l.889 |
| «Genera (Actual)» | h3 |  | BrandComparison · l.894 |
| «Genera (Nuevo)» | h3 |  | BrandComparison · l.909 |
| «Header FNE (Actual)» | h3 |  | BrandComparison · l.927 |
| «Header Genera (Nuevo)» | h3 |  | BrandComparison · l.945 |
| «{children}» | h2 |  | SectionTitle · l.961 |
| «1. Colores Fuera de Marca» | h2 |  | VisualStyleAudit · l.1214 |
| «Colores a Eliminar» | h3 |  | VisualStyleAudit · l.1220 |
| «Reemplazos Recomendados» | h3 |  | VisualStyleAudit · l.1265 |
| «2. Badges - Antes vs Despues» | h2 |  | VisualStyleAudit · l.1312 |
| «ACTUAL (Off-Brand)» | h3 |  | VisualStyleAudit · l.1318 |
| «GENERA (On-Brand)» | h3 |  | VisualStyleAudit · l.1330 |
| «3. Gradientes» | h2 |  | VisualStyleAudit · l.1344 |
| «ACTUAL» | h3 |  | VisualStyleAudit · l.1350 |
| «GENERA» | h3 |  | VisualStyleAudit · l.1369 |
| «4. Colores de Areas de Transformacion» | h2 |  | VisualStyleAudit · l.1390 |
| «Opcion A: Escala de Grises» | h4 |  | VisualStyleAudit · l.1396 |
| «Opcion B: Variaciones Amarillo» | h4 |  | VisualStyleAudit · l.1409 |
| «Opcion C: Multi-color Profesional» | h4 |  | VisualStyleAudit · l.1430 |
| «5. Archivos Prioritarios» | h2 |  | VisualStyleAudit · l.1454 |
| «6. Uso de Emojis» | h2 |  | VisualStyleAudit · l.1483 |
| «OK - Momentos Celebratorios» | h3 |  | VisualStyleAudit · l.1488 |
| «Revisar - Interfaces Profesionales» | h3 |  | VisualStyleAudit · l.1499 |

**Buttons** (26)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Genera (Nuevo)» | `{() => setActiveTab('genera')}` |  |  |  | BrandPreview · l.50 |
| «Comparacion» | `{() => setActiveTab('comparison')}` |  |  |  | BrandPreview · l.60 |
| «Auditoria Visual» | `{() => setActiveTab('audit')}` |  |  |  | BrandPreview · l.70 |
| «Expandir sidebar / Colapsar sidebar» | `{() => setSidebarCollapsed(!sidebarCollapsed)}` |  |  |  | GeneraBrandShowcase · l.318 |
| «Guardar» |  |  |  |  | GeneraBrandShowcase · l.345 |
| «Deshabilitado» |  |  |  |  | GeneraBrandShowcase · l.348 |
| «Continuar» |  |  |  |  | GeneraBrandShowcase · l.356 |
| «Deshabilitado» |  |  |  |  | GeneraBrandShowcase · l.359 |
| «Cancelar» |  |  |  |  | GeneraBrandShowcase · l.367 |
| «Deshabilitado» |  |  |  |  | GeneraBrandShowcase · l.370 |
| «Ver mas» |  |  |  |  | GeneraBrandShowcase · l.378 |
| «Accion secundaria» |  |  |  |  | GeneraBrandShowcase · l.381 |
| «Small» |  |  |  |  | GeneraBrandShowcase · l.391 |
| «Medium» |  |  |  |  | GeneraBrandShowcase · l.394 |
| «Large» |  |  |  |  | GeneraBrandShowcase · l.397 |
|  |  |  |  |  | GeneraBrandShowcase · l.400 |
|  |  |  |  |  | GeneraBrandShowcase · l.628 |
|  |  |  |  |  | GeneraBrandShowcase · l.649 |
|  |  |  |  |  | GeneraBrandShowcase · l.687 |
| «Primary» |  |  |  |  | BrandComparison · l.902 |
| «Accent» |  |  |  |  | BrandComparison · l.903 |
| «Primary» |  |  |  |  | BrandComparison · l.917 |
| «Accent» |  |  |  |  | BrandComparison · l.918 |
| «Copiar» | `{() => navigator.clipboard.writeText(hex)}` |  |  |  | ColorSwatch · l.984 |
|  |  |  |  |  | MockHeader · l.1157 |
|  | `{() => setChecked(!checked)}` |  |  |  | MockToggle · l.1179 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Input normal» | text | «Escribe aqui...» |  |  |  | GeneraBrandShowcase · l.481 |
| «Input con error» | text |  |  |  |  | GeneraBrandShowcase · l.491 |
| «Select» | select |  | «Selecciona una opcion», «Opcion 1», «Opcion 2» |  |  | GeneraBrandShowcase · l.502 |
| «Opcion seleccionada» | checkbox |  |  |  |  | GeneraBrandShowcase · l.518 |
| «Opcion sin seleccionar» | checkbox |  |  |  |  | GeneraBrandShowcase · l.522 |

**Embedded media** (14)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Logo full on light · /genera/logo-full-on-light.svg |  |  | GeneraBrandShowcase · l.215 |
| img · alt Logo full on dark · /genera/logo-full-on-dark.svg |  |  | GeneraBrandShowcase · l.225 |
| img · alt Logo horizontal on light · /genera/logo-horizontal-on-light.svg |  |  | GeneraBrandShowcase · l.235 |
| img · alt Logo horizontal on dark · /genera/logo-horizontal-on-dark.svg |  |  | GeneraBrandShowcase · l.245 |
| img · alt Logo compact on light · /genera/logo-compact-on-light.svg |  |  | GeneraBrandShowcase · l.255 |
| img · alt Logo compact on dark · /genera/logo-compact-on-dark.svg |  |  | GeneraBrandShowcase · l.265 |
| img · alt Icon on light · /genera/icon-on-light.svg |  |  | GeneraBrandShowcase · l.275 |
| img · alt Icon on dark · /genera/icon-on-dark.svg |  |  | GeneraBrandShowcase · l.285 |
| img · alt Favicon · /genera/genera-favicon.svg |  |  | GeneraBrandShowcase · l.295 |
| img · alt Favicon · /genera/genera-favicon.svg |  |  | GeneraBrandShowcase · l.297 |
| img · alt Favicon · /genera/genera-favicon.svg |  |  | GeneraBrandShowcase · l.299 |
| img · alt Genera - Hub de Transformación · {logoSrc} |  |  | GeneraLogo · l.1007 |
| img · alt Genera · /genera/icon-on-dark.svg | `collapsed` |  | MockSidebar · l.1084 |
| img · alt Genera · /genera/icon-on-dark.svg | `!(collapsed)` |  | MockSidebar · l.1092 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Archivo» |  | VisualStyleAudit · l.1461 |
| «Purple» |  | VisualStyleAudit · l.1462 |
| «Indigo» |  | VisualStyleAudit · l.1463 |
| «Pink» |  | VisualStyleAudit · l.1464 |
| «Prioridad» |  | VisualStyleAudit · l.1465 |

**Pieces placed here, with the texts and settings handed to them** (37)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ColorSwatch` | hex: #0a0a0a |  |  | GeneraBrandShowcase · l.139 |
| `ColorSwatch` | hex: #fbbf24 |  |  | GeneraBrandShowcase · l.145 |
| `ColorSwatch` | hex: #f59e0b |  |  | GeneraBrandShowcase · l.150 |
| `ColorSwatch` | hex: #fcd34d |  |  | GeneraBrandShowcase · l.155 |
| `ColorSwatch` | hex: #ffffff |  |  | GeneraBrandShowcase · l.160 |
| `ColorSwatch` | hex: #1f1f1f |  |  | GeneraBrandShowcase · l.165 |
| `ColorSwatch` | hex: #6b7280 |  |  | GeneraBrandShowcase · l.171 |
| `MockToggle` | label: Notificaciones activadas |  |  | GeneraBrandShowcase · l.532 |
| `MockToggle` | label: Modo oscuro |  |  | GeneraBrandShowcase · l.533 |
| `Footer` |  |  |  | GeneraBrandShowcase · l.874 |
| `ColorSwatch` | hex: #0a0a0a |  |  | BrandComparison · l.896 |
| `ColorSwatch` | hex: #fbbf24 |  |  | BrandComparison · l.897 |
| `ColorSwatch` | hex: #e8e5e2 |  |  | BrandComparison · l.898 |
| `ColorSwatch` | hex: #0a0a0a |  |  | BrandComparison · l.911 |
| `ColorSwatch` | hex: #fbbf24 |  |  | BrandComparison · l.912 |
| `ColorSwatch` | hex: #ffffff |  |  | BrandComparison · l.913 |
| `StatCard` | title: Off-Brand Colors · subtitle: archivos afectados |  |  | VisualStyleAudit · l.1206 |
| `StatCard` | title: Inline SVGs · subtitle: archivos con SVG |  |  | VisualStyleAudit · l.1207 |
| `StatCard` | title: Gradientes · subtitle: a actualizar |  |  | VisualStyleAudit · l.1208 |
| `StatCard` | title: Emojis · subtitle: archivos |  |  | VisualStyleAudit · l.1209 |
| `OffBrandColorRow` | tailwind: purple-* · hex: #8b5cf6 · bgClass: bg-purple-500 |  |  | VisualStyleAudit · l.1225 |
| `OffBrandColorRow` | tailwind: violet-* · hex: #7c3aed · bgClass: bg-violet-500 |  |  | VisualStyleAudit · l.1232 |
| `OffBrandColorRow` | tailwind: indigo-* · hex: #6366f1 · bgClass: bg-indigo-500 |  |  | VisualStyleAudit · l.1239 |
| `OffBrandColorRow` | tailwind: #ec4899 · hex: #ec4899 · bgClass: bg-pink-500 |  |  | VisualStyleAudit · l.1246 |
| `OffBrandColorRow` | tailwind: fuchsia-* · hex: #c026d3 · bgClass: bg-fuchsia-500 |  |  | VisualStyleAudit · l.1253 |
| `ReplacementRow` | from: purple-* · to: gray-* · fromBg: bg-purple-500 · toBg: bg-gray-500 · reason: Neutral |  |  | VisualStyleAudit · l.1270 |
| `ReplacementRow` | from: violet-* · to: gray-* · fromBg: bg-violet-500 · toBg: bg-gray-500 · reason: Neutral |  |  | VisualStyleAudit · l.1277 |
| `ReplacementRow` | from: indigo-* · to: brand_primary · fromBg: bg-indigo-500 · toBg: bg-[#0a0a0a] · reason: Usar negro |  |  | VisualStyleAudit · l.1284 |
| `ReplacementRow` | from: #ec4899 · to: #fbbf24 · fromBg: bg-pink-500 · toBg: bg-[#fbbf24] · reason: Usar amarillo |  |  | VisualStyleAudit · l.1291 |
| `ReplacementRow` | from: #8b5cf6 · to: #6b7280 · fromBg: bg-purple-500 · toBg: bg-[#6b7280] · reason: Gris medio |  |  | VisualStyleAudit · l.1298 |
| `FileRow` | file: components/learning-paths/EnhancedProgressIndicators.tsx · priority: Alta |  |  | VisualStyleAudit · l.1469 |
| `FileRow` | file: pages/community/workspace.tsx · priority: Alta |  |  | VisualStyleAudit · l.1470 |
| `FileRow` | file: components/assignments/AssignmentCard.tsx · priority: Media |  |  | VisualStyleAudit · l.1471 |
| `FileRow` | file: components/admin/assignment-matrix/SourceBadge.tsx · priority: Media |  |  | VisualStyleAudit · l.1472 |
| `FileRow` | file: pages/directivo/assessments/dashboard.tsx · priority: Alta |  |  | VisualStyleAudit · l.1473 |
| `FileRow` | file: components/reports/LearningPathAnalytics.tsx · priority: Baja |  |  | VisualStyleAudit · l.1474 |
| `FileRow` | file: types/messaging.ts · priority: Baja |  |  | VisualStyleAudit · l.1475 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `menuItems` | «Mi Panel», «Mi Perfil», «Mi Aprendizaje», «Comunidad», «Reportes», «Configuracion» | MockSidebar · l.1020 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Personalizacion» | VisualStyleAudit · l.1398 |
| «Evaluacion» | VisualStyleAudit · l.1398 |
| «Trabajo Docente» | VisualStyleAudit · l.1398 |

**Values shown from data** (19)

- `{name}` — ColorSwatch · l.981
- `{hex}` — ColorSwatch · l.982
- `{item.icon}` — MockSidebar · l.1116, when `each menuItems`
- `{item.label}` — MockSidebar · l.1117, when `each menuItems && !collapsed`
- `{area}` — VisualStyleAudit · l.1401, when `each ['Proposito', 'Personalizacion', 'Aprendizaje', '…`
- `{area.name}` — VisualStyleAudit · l.1422, when `each [ { name: 'Proposito', bg: '#fbbf24' }, { name: '…`
- `{area.name}` — VisualStyleAudit · l.1443, when `each [ { name: 'Proposito', bg: '#0a0a0a' }, { name: '…`
- `{title}` — StatCard · l.1525
- `{value}` — StatCard · l.1526
- `{subtitle}` — StatCard · l.1527
- `{name}` — OffBrandColorRow · l.1537
- `{tailwind} / {hex}` — OffBrandColorRow · l.1538
- `{from} → {to}` — ReplacementRow · l.1554
- `{reason}` — ReplacementRow · l.1556
- `{file}` — FileRow · l.1570
- `{purple}` — FileRow · l.1571, when `purple > 0`
- `{indigo}` — FileRow · l.1572, when `indigo > 0`
- `{pink}` — FileRow · l.1573, when `pink > 0`
- `{priority}` — FileRow · l.1575

**Other texts on screen** (148)

- «Genera Brand Preview» — BrandPreview · l.36
- «Vista previa del nuevo branding - Sin modificar codigo existente» — BrandPreview · l.47
- «1. Elementos de Marca» — GeneraBrandShowcase · l.114
- «Fondo claro» — GeneraBrandShowcase · l.124
- «Fondo oscuro» — GeneraBrandShowcase · l.130
- «Light (300) - Logo» — GeneraBrandShowcase · l.187
- «GENERA» — GeneraBrandShowcase · l.188
- «HUB DE TRANSFORMACION» — GeneraBrandShowcase · l.189
- «Regular (400) - Body» — GeneraBrandShowcase · l.192
- «Acompanamos a las comunidades educativas hacia una transformacion profunda.» — GeneraBrandShowcase · l.194
- «Bold (700) - Headings» — GeneraBrandShowcase · l.198
- «Mi Panel» — GeneraBrandShowcase · l.199
- «Cursos Activos» — GeneraBrandShowcase · l.200
- «Full - Fondo Claro» — GeneraBrandShowcase · l.212
- «/genera/logo-full-on-light.svg» — GeneraBrandShowcase · l.217
- «Full - Fondo Oscuro» — GeneraBrandShowcase · l.222
- «/genera/logo-full-on-dark.svg» — GeneraBrandShowcase · l.227
- «Horizontal - Fondo Claro» — GeneraBrandShowcase · l.232
- «/genera/logo-horizontal-on-light.svg» — GeneraBrandShowcase · l.237
- «Horizontal - Fondo Oscuro» — GeneraBrandShowcase · l.242
- «/genera/logo-horizontal-on-dark.svg» — GeneraBrandShowcase · l.247
- «Compact - Fondo Claro» — GeneraBrandShowcase · l.252
- «/genera/logo-compact-on-light.svg» — GeneraBrandShowcase · l.257
- «Compact - Fondo Oscuro» — GeneraBrandShowcase · l.262
- «/genera/logo-compact-on-dark.svg» — GeneraBrandShowcase · l.267
- «Icono - Fondo Claro» — GeneraBrandShowcase · l.272
- «/genera/icon-on-light.svg» — GeneraBrandShowcase · l.277
- «Icono - Fondo Oscuro» — GeneraBrandShowcase · l.282
- «/genera/icon-on-dark.svg» — GeneraBrandShowcase · l.287
- «Favicon» — GeneraBrandShowcase · l.292
- «/genera/genera-favicon.svg» — GeneraBrandShowcase · l.301
- «2. Navegacion» — GeneraBrandShowcase · l.309
- «3. Botones» — GeneraBrandShowcase · l.338
- «Primary» — GeneraBrandShowcase · l.344
- «Secondary (Accent)» — GeneraBrandShowcase · l.355
- «Outline» — GeneraBrandShowcase · l.366
- «Ghost» — GeneraBrandShowcase · l.377
- «Tamanos» — GeneraBrandShowcase · l.389
- «4. Cards» — GeneraBrandShowcase · l.412
- «En progreso» — GeneraBrandShowcase · l.425
- «Modulo 3 de 8» — GeneraBrandShowcase · l.429
- «45% completado» — GeneraBrandShowcase · l.433
- «+3 este mes» — GeneraBrandShowcase · l.448
- «Tienes una nueva tarea en el curso de Liderazgo.» — GeneraBrandShowcase · l.461
- «Hace 5 minutos» — GeneraBrandShowcase · l.462
- «5. Elementos de Formulario» — GeneraBrandShowcase · l.471
- «Input normal» (label) — GeneraBrandShowcase · l.478
- «Input con error» (label) — GeneraBrandShowcase · l.488
- «Este campo es requerido» — GeneraBrandShowcase · l.496
- «Select» (label) — GeneraBrandShowcase · l.499
- «Checkboxes» (label) — GeneraBrandShowcase · l.513
- «Opcion seleccionada» (label) — GeneraBrandShowcase · l.517
- «Opcion sin seleccionar» (label) — GeneraBrandShowcase · l.521
- «Toggle Switch» (label) — GeneraBrandShowcase · l.528
- «6. Alertas y Toasts» — GeneraBrandShowcase · l.543
- «Informacion» — GeneraBrandShowcase · l.559
- «Este es un mensaje informativo.» — GeneraBrandShowcase · l.560
- «Completado» — GeneraBrandShowcase · l.574
- «La operacion se completo correctamente.» — GeneraBrandShowcase · l.575
- «Error» — GeneraBrandShowcase · l.589
- «Hubo un problema al procesar tu solicitud.» — GeneraBrandShowcase · l.590
- «Atencion» — GeneraBrandShowcase · l.604
- «Revisa esta informacion antes de continuar.» — GeneraBrandShowcase · l.605
- «Guardado exitosamente» — GeneraBrandShowcase · l.625
- «Los cambios han sido guardados.» — GeneraBrandShowcase · l.626
- «Error al guardar» — GeneraBrandShowcase · l.646
- «Intenta nuevamente.» — GeneraBrandShowcase · l.647
- «Procesando...» — GeneraBrandShowcase · l.668
- «Por favor espera.» — GeneraBrandShowcase · l.669
- «Nueva notificacion» — GeneraBrandShowcase · l.684
- «Tienes una nueva tarea asignada.» — GeneraBrandShowcase · l.685
- «7. Badges y Tags» — GeneraBrandShowcase · l.700
- «Sistema de badges usando solo la paleta Genera (negro, amarillo, blanco, grises).» — GeneraBrandShowcase · l.703
- «Primarios» — GeneraBrandShowcase · l.707
- «Default» — GeneraBrandShowcase · l.710
- «Accent» — GeneraBrandShowcase · l.713
- «Accent Light» — GeneraBrandShowcase · l.716
- «Outline» — GeneraBrandShowcase · l.719
- «Outline Accent» — GeneraBrandShowcase · l.722
- «Estados (On-Brand)» — GeneraBrandShowcase · l.729
- «Completado» — GeneraBrandShowcase · l.733
- «En progreso» — GeneraBrandShowcase · l.737
- «Pendiente» — GeneraBrandShowcase · l.741
- «Inactivo» — GeneraBrandShowcase · l.744
- «Roles» — GeneraBrandShowcase · l.751
- «Admin» — GeneraBrandShowcase · l.754
- «Directivo» — GeneraBrandShowcase · l.757
- «Docente» — GeneraBrandShowcase · l.760
- «Estudiante» — GeneraBrandShowcase · l.763
- «Categorias» — GeneraBrandShowcase · l.770
- «Curso» — GeneraBrandShowcase · l.773
- «Modulo» — GeneraBrandShowcase · l.776
- «Leccion» — GeneraBrandShowcase · l.779
- «Tarea» — GeneraBrandShowcase · l.782
- «Quiz» — GeneraBrandShowcase · l.785
- «8. Indicadores de Progreso» — GeneraBrandShowcase · l.794
- «Barras de progreso» — GeneraBrandShowcase · l.800
- «Progreso del curso» — GeneraBrandShowcase · l.804
- «Completado» — GeneraBrandShowcase · l.813
- «Sin iniciar» — GeneraBrandShowcase · l.822
- «Indicadores circulares» — GeneraBrandShowcase · l.834
- «9. Footer (Componente Real)» — GeneraBrandShowcase · l.871
- «Genera» — BrandComparison · l.933
- «GENERA» — MockSidebar · l.1098, when `!(collapsed)`
- «Fundación Nueva Educación» — MockSidebar · l.1099, when `!(collapsed)`
- «BC» — MockSidebar · l.1126
- «Brent Curtis» — MockSidebar · l.1130, when `!collapsed`
- «Administrador» — MockSidebar · l.1131, when `!collapsed`
- «Hub de Transformación» — MockHeader · l.1146
- «Colegio Demo» — MockHeader · l.1150
- «BC» — MockHeader · l.1166
- «{label}» (label) — MockToggle · l.1178
- «Estos colores no encajan con la paleta Genera (negro/amarillo/blanco) y deben reemplazarse.» — VisualStyleAudit · l.1215
- «Comparacion visual de badges con colores actuales vs reemplazos Genera.» — VisualStyleAudit · l.1313
- «Ensayo» — VisualStyleAudit · l.1320
- «Ruta» — VisualStyleAudit · l.1321
- «Preguntas» — VisualStyleAudit · l.1322
- «Familias» — VisualStyleAudit · l.1323
- «Proposito» — VisualStyleAudit · l.1324
- «Ensayo» — VisualStyleAudit · l.1332
- «Ruta» — VisualStyleAudit · l.1333
- «Preguntas» — VisualStyleAudit · l.1334
- «Familias» — VisualStyleAudit · l.1335
- «Proposito» — VisualStyleAudit · l.1336
- «Gradientes actuales vs versiones Genera.» — VisualStyleAudit · l.1345
- «Header Gradient (Navy)» — VisualStyleAudit · l.1353
- «Progress Gradient» — VisualStyleAudit · l.1356
- «Rainbow (Programas)» — VisualStyleAudit · l.1359
- «Purple Background» — VisualStyleAudit · l.1362
- «Header (Solid Black)» — VisualStyleAudit · l.1372
- «Progress Gradient» — VisualStyleAudit · l.1375
- «Black to Yellow» — VisualStyleAudit · l.1378
- «Neutral Background» — VisualStyleAudit · l.1381
- «Las 7 areas de transformacion necesitan colores distintivos. Opciones:» — VisualStyleAudit · l.1391
- «Nota: Violeta aun presente» — VisualStyleAudit · l.1447
- «Archivos con mayor cantidad de colores off-brand.» — VisualStyleAudit · l.1455
- «32 archivos usan emojis. Revisar si son apropiados para una imagen profesional.» — VisualStyleAudit · l.1484
- «Quiz completado» (title) — VisualStyleAudit · l.1490
- «Logro» (title) — VisualStyleAudit · l.1491
- «Exito» (title) — VisualStyleAudit · l.1492
- «Completado» (title) — VisualStyleAudit · l.1493
- «Usar en: resultados de quiz, logros, felicitaciones» — VisualStyleAudit · l.1495
- «Navegacion» (title) — VisualStyleAudit · l.1501
- «Acciones» (title) — VisualStyleAudit · l.1502
- «Ideas» (title) — VisualStyleAudit · l.1503
- «Objetivos» (title) — VisualStyleAudit · l.1504
- «Considerar reemplazar con iconos SVG en: menus, botones, headers» — VisualStyleAudit · l.1506
- «{files} archivos» — OffBrandColorRow · l.1540

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/Footer.tsx`
- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `lib/legal/privacy-notice.ts`

## /debug-feedback-permissions

File `pages/debug-feedback-permissions.tsx` · 100 lines · frame: none

**Leftover (on the list for Brent)** — Shows the signed-in person's role and whether they count as admin.

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.22 `router.push → /login  (when !user)`
- Linked from: `lib/auth/forced-password-change.ts:144`, `middleware.ts:339`
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

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Debug: Feedback Permissions Access» | h1 |  | DebugFeedbackPermissions · l.51 |
| «Your User Info:» | h2 |  | DebugFeedbackPermissions · l.54 |
| «Navigation Links:» | h2 |  | DebugFeedbackPermissions · l.63 |
| «✅ You are an Admin» | h3 | `userInfo?.isAdmin` | DebugFeedbackPermissions · l.81 |
| «❌ You are not an Admin» | h3 | `!userInfo?.isAdmin` | DebugFeedbackPermissions · l.93 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «🔗 Go to Configuration Page» | `/admin/configuration` |  |  | DebugFeedbackPermissions · l.65 |
| «🔗 Go directly to Users & Permissions Tab» | `/admin/configuration?tab=users` |  |  | DebugFeedbackPermissions · l.71 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkUser · l.22 |

**Other texts on screen** (10)

- «Loading...» — DebugFeedbackPermissions · l.45, when `loading`
- «Email:» — DebugFeedbackPermissions · l.56
- «Role:» — DebugFeedbackPermissions · l.57
- «Is Admin:» — DebugFeedbackPermissions · l.58
- «Yes ✅ / No ❌» — DebugFeedbackPermissions · l.58
- «You should be able to:» — DebugFeedbackPermissions · l.82, when `userInfo?.isAdmin`
- «See &quot;Configuración&quot; in the sidebar» — DebugFeedbackPermissions · l.84, when `userInfo?.isAdmin`
- «Access the configuration page» — DebugFeedbackPermissions · l.85, when `userInfo?.isAdmin`
- «Manage feedback permissions in the &quot;Usuarios y Permisos&quot; tab» — DebugFeedbackPermissions · l.86, when `userInfo?.isAdmin`
- «You need admin role to manage feedback permissions.» — DebugFeedbackPermissions · l.94, when `!userInfo?.isAdmin`

**Reads and writes the database directly:** `table:profiles` (select)

## /email-showcase

File `pages/email-showcase.tsx` · 506 lines · frame: none · getStaticProps

**Leftover (on the list for Brent)** — Previews of the e-mail templates, built into the site as a page. Still shows the old blue.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «📧 Genera Email Showcase» | h1 |  | EmailShowcase · l.322 |
| «Email Templates ( {templates.length} )» | h2 |  | EmailShowcase · l.332 |
| «{category}» | h3 | `each categories` | EmailShowcase · l.337 |
| «{templates[selectedTemplate].type}» | h3 |  | EmailShowcase · l.372 |
| «Template Details» | h4 |  | EmailShowcase · l.426 |
| «🚀 Email System Features» | h2 |  | EmailShowcase · l.447 |
| «Mobile Responsive» | h3 |  | EmailShowcase · l.453 |
| «FNE Branded» | h3 |  | EmailShowcase · l.460 |
| «Real-time» | h3 |  | EmailShowcase · l.467 |
| «User Controlled» | h3 |  | EmailShowcase · l.474 |
| «Secure» | h3 |  | EmailShowcase · l.481 |
| «Analytics Ready» | h3 |  | EmailShowcase · l.488 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{template.type} {template.subject}» | `{() => setSelectedTemplate(globalIndex)}` | `each categories && each templates.filter(t => t.category === category)` |  |  | EmailShowcase · l.344 |
| «Preview» | `{() => setViewMode('preview')}` |  |  |  | EmailShowcase · l.380 |
| «HTML Code» | `{() => setViewMode('code')}` |  |  |  | EmailShowcase · l.390 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `emailTemplates` | «📋 Recordatorio: Tarea pendiente - Análisis de Casos», «Reminds students about pending assignments with due dates and direct links.», «<!DOCTYPE html> <html lang="es"> <head> <meta charset="utf-8"> <style> body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'…», «🎉 ¡Felicitaciones! Has completado el curso», «Congratulates users on course completion with progress summary and certificate access.», «<!DOCTYPE html> <html lang="es"> <head> <meta charset="utf-8"> <style> body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'…», «📊 Resumen diario - 5 notificaciones nuevas», «Daily summary email with categorized notifications and activity overview.», «<!DOCTYPE html> <html lang="es"> <head> <meta charset="utf-8"> <style> body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'…», «💰 Nuevo reporte de gastos enviado», «Notification for new expense report submissions with financial details.», «<!DOCTYPE html> <html lang="es"> <head> <meta charset="utf-8"> <style> body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'…», «🎉 ¡Bienvenido a Genera!», «Welcome message for new users with getting started guide.», «<!DOCTYPE html> <html lang="es"> <head> <meta charset="utf-8"> <style> body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI'…» | l.5 |

**Values shown from data** (5)

- `{templates[selectedTemplate].descrip…}` — EmailShowcase · l.375
- `{templates[selectedTemplate].html}` — EmailShowcase · l.417, when `!(viewMode === 'preview')`
- `{templates[selectedTemplate].subject}` — EmailShowcase · l.430
- `{templates[selectedTemplate].category}` — EmailShowcase · l.434
- `{templates[selectedTemplate].descrip…}` — EmailShowcase · l.438

**Other texts on screen** (10)

- «Professional email templates with FNE branding» — EmailShowcase · l.323
- «Subject:» — EmailShowcase · l.429
- «Category:» — EmailShowcase · l.433
- «Use Case:» — EmailShowcase · l.437
- «All templates are optimized for mobile devices and email clients.» — EmailShowcase · l.454
- «Professional design with Navy Blue (#0a0a0a) and Golden Yellow (#fbbf24).» — EmailShowcase · l.461
- «Immediate notifications and daily/weekly digest emails.» — EmailShowcase · l.468
- «Granular notification preferences and quiet hours support.» — EmailShowcase · l.475
- «GDPR compliant with proper authentication and rate limiting.» — EmailShowcase · l.482
- «Email tracking and delivery monitoring with Resend.» — EmailShowcase · l.489

## /test-logout

File `pages/test-logout.tsx` · 84 lines · frame: none

**Leftover (on the list for Brent)** — Shows whether there is a session and offers sign-out buttons.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.28 `location.href → /login`
  - l.67 `router.push → /login  (when !(session))`
  - l.75 `router.push → /dashboard`
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Session Test» | h1 |  | TestLogout · l.38 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Logging out... / Logout» | `{handleLogout}` | `session` | `{isLoggingOut}` |  | TestLogout · l.58 |
| «Go to Login» | `{() => router.push('/login')}` | `!(session)` |  |  | TestLogout · l.66 |
| «Go to Dashboard» | `{() => router.push('/dashboard')}` |  |  |  | TestLogout · l.74 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `location.href` |  | handleLogout · l.28 |
| `/login` | `router.push` | `!(session)` | TestLogout · l.67 |
| `/dashboard` | `router.push` |  | TestLogout · l.75 |

**Values shown from data** (1)

- `{session.user.email}` — TestLogout · l.50, when `session`

**Other texts on screen** (3)

- «Session Status:» — TestLogout · l.41
- «Logged In / Not Logged In» — TestLogout · l.42
- «User Email:» — TestLogout · l.49, when `session`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/logout` | POST | `pages/test-logout.tsx:25` |

## /test-rbac

File `pages/test-rbac.tsx` · 77 lines · frame: none

**Leftover (on the list for Brent)** — Prints the role-system settings of the site (public settings only).

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.55 `router.push → /dashboard`
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «RBAC System Test Page» | h1 |  | TestRBAC · l.22 |
| «Environment Variables:» | h2 |  | TestRBAC · l.26 |
| «Expected Values:» | h2 |  | TestRBAC · l.33 |
| «Quick Actions:» | h2 |  | TestRBAC · l.46 |
| «Troubleshooting:» | h2 |  | TestRBAC · l.64 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Go to Role Management» | `{() => router.push('/admin/role-management')}` |  |  |  | TestRBAC · l.48 |
| «Back to Dashboard» | `{() => router.push('/dashboard')}` |  |  |  | TestRBAC · l.54 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/admin/role-management` | `router.push` |  | TestRBAC · l.49 |
| `/dashboard` | `router.push` |  | TestRBAC · l.55 |

**Values shown from data** (2)

- `{JSON.stringify(envVars, null, 2)}` — TestRBAC · l.27
- `{String(envVars.FEATURE_FLAG)}` — TestRBAC · l.40

**Other texts on screen** (7)

- «FEATURE_FLAG should be:» — TestRBAC · l.36
- «true» — TestRBAC · l.36
- «Current value:» — TestRBAC · l.40
- «If FEATURE_FLAG is undefined, env vars aren&apos;t set in Vercel» — TestRBAC · l.66
- «If it&apos;s &quot;false&quot; (string), change it to true in Vercel» — TestRBAC · l.67
- «After changing, you MUST redeploy for changes to take effect» — TestRBAC · l.68
- «Try hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (PC)» — TestRBAC · l.69

## /test-sentry

File `pages/test-sentry.tsx` · 81 lines · frame: none

**Leftover (on the list for Brent)** — A button that sends a test error to Sentry.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sentry Test Page» | h1 |  | TestSentry · l.31 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Test Sentry Error» | `{handleTestError}` |  |  |  | TestSentry · l.34 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Unknown error» | `setErrorMessage` |  | handleTestError · l.20 |

**Other texts on screen** (6)

- «Click the button below to test Sentry error tracking:» — TestSentry · l.32
- «Error:» — TestSentry · l.59, when `errorMessage`
- «Instructions:» — TestSentry · l.71
- «Click the &quot;Test Sentry Error&quot; button» — TestSentry · l.73
- «Check the browser console for logs» — TestSentry · l.74
- «Check your Sentry dashboard for the captured error» — TestSentry · l.75

## /test-sidebar-role

File `pages/test-sidebar-role.tsx` · 62 lines · frame: MainLayout

**Leftover (on the list for Brent)** — Draws the menu with the signed-in person's role values next to it.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sidebar Role Test» | h1 |  | TestSidebarRole · l.36 |
| «Current User Information» | h2 |  | TestSidebarRole · l.39 |
| «Expected Menu Items» | h2 |  | TestSidebarRole · l.46 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Test Sidebar Role |  |  | TestSidebarRole · l.26 |

**Values shown from data** (1)

- `{JSON.stringify(debugInfo, null, 2)}` — TestSidebarRole · l.40

**Other texts on screen** (9)

- «For Admin or Consultor roles:» — TestSidebarRole · l.48
- «Revisión de Quizzes» — TestSidebarRole · l.50
- «Gestión de Tareas Grupales» — TestSidebarRole · l.51
- «Current Role:» — TestSidebarRole · l.54
- «No role found» — TestSidebarRole · l.54
- «Is Admin:» — TestSidebarRole · l.55
- «Yes / No» — TestSidebarRole · l.55
- «Should See Consultant Menu:» — TestSidebarRole · l.56
- «Yes / No» — TestSidebarRole · l.56

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`

## /test-toast

File `pages/test-toast.tsx` · 270 lines · frame: none

**Leftover (on the list for Brent)** — A demonstration of every toast message.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (9)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Sistema de Notificaciones Toast» | h1 |  | TestToastPage · l.119 |
| «Prueba de Notificaciones» | h2 |  | TestToastPage · l.124 |
| «Básicas» | h3 |  | TestToastPage · l.134 |
| «Operaciones CRUD» | h3 |  | TestToastPage · l.157 |
| «Estados de Carga» | h3 |  | TestToastPage · l.180 |
| «Basadas en Promesas» | h3 |  | TestToastPage · l.198 |
| «Especiales» | h3 |  | TestToastPage · l.215 |
| «Múltiples» | h3 |  | TestToastPage · l.232 |
| «Colores de Marca» | h2 |  | TestToastPage · l.245 |

**Buttons** (13)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Éxito» | `{testToasts.success}` |  |  |  | TestToastPage · l.135 |
| «Error» | `{testToasts.error}` |  |  |  | TestToastPage · l.141 |
| «Información» | `{testToasts.info}` |  |  |  | TestToastPage · l.147 |
| «Crear Curso» | `{testToasts.createCourse}` |  |  |  | TestToastPage · l.158 |
| «Crear Tarea» | `{testToasts.createTask}` |  |  |  | TestToastPage · l.164 |
| «Actualizar Usuario» | `{testToasts.updateUser}` |  |  |  | TestToastPage · l.170 |
| «Mostrar Cargando» | `{testToasts.loading}` |  |  |  | TestToastPage · l.181 |
| «Cerrar Cargando» | `{testToasts.dismissLoading}` |  | `{!loadingToastId}` |  | TestToastPage · l.187 |
| «Promesa Exitosa» | `{testToasts.promiseSuccess}` |  |  |  | TestToastPage · l.199 |
| «Promesa con Error» | `{testToasts.promiseError}` |  |  |  | TestToastPage · l.205 |
| «Confirmación» | `{testToasts.confirm}` |  |  |  | TestToastPage · l.216 |
| «Error de API» | `{testToasts.apiError}` |  |  |  | TestToastPage · l.222 |
| «Múltiples Toasts» | `{testToasts.multiple}` |  |  |  | TestToastPage · l.233 |

**Toasts** (19)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{TOAST_MESSAGES.GENERIC.SUCCESS}» |  | TestToastPage · l.38 |
| error | «{TOAST_MESSAGES.GENERIC.ERROR}» |  | TestToastPage · l.39 |
| info | «Esta es una notificación informativa» |  | TestToastPage · l.40 |
| success | «{getGenderedMessage('Curso', 'CREATE', true, false)}» |  | TestToastPage · l.43 |
| success | «{getGenderedMessage('Tarea', 'CREATE', true, true)}» |  | TestToastPage · l.44 |
| success | «{getGenderedMessage('Usuario', 'UPDATE', true, false)}» |  | TestToastPage · l.45 |
| success | «{getGenderedMessage('Notificación', 'DELETE', true, true)}» |  | TestToastPage · l.46 |
| success | «{TOAST_MESSAGES.AUTH.LOGIN_SUCCESS}» |  | TestToastPage · l.49 |
| error | «{TOAST_MESSAGES.AUTH.UNAUTHORIZED}» |  | TestToastPage · l.50 |
| success | «{TOAST_MESSAGES.FILE.UPLOAD_SUCCESS('documento.pdf')}» |  | TestToastPage · l.53 |
| error | «{TOAST_MESSAGES.FILE.SIZE_ERROR('10MB')}» |  | TestToastPage · l.54 |
| loading | «{TOAST_MESSAGES.CRUD.LOADING('datos')}» |  | TestToastPage · l.58 |
| promise | «{{ loading: TOAST_MESSAGES.CRUD.SAVING, success: TOAST_MESSAGES.CRUD.S…}» |  | TestToastPage · l.70 |
| promise | «{{ loading: TOAST_MESSAGES.CRUD.SAVING, success: TOAST_MESSAGES.CRUD.S…}» |  | TestToastPage · l.80 |
| success | «Elemento eliminado» |  | TestToastPage · l.94 |
| info | «Operación cancelada» |  | TestToastPage · l.95 |
| success | «Primera notificación» |  | TestToastPage · l.106 |
| info | «Segunda notificación» |  | TestToastPage · l.107 |
| error | «Tercera notificación» |  | TestToastPage · l.108 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Operación completada» | TestToastPage · l.28 |
| «¿Estás seguro de que deseas eliminar este elemento?» | TestToastPage · l.93 |
| «Network error» | TestToastPage · l.101 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | simulateAsyncOperation · l.26 |
| timer | `setTimeout(…, 1000)` | TestToastPage · l.108 |

**Other texts on screen** (8)

- «Test Toast - Genera» — TestToastPage · l.115
- «Haz clic en los botones para ver diferentes tipos de notificaciones con el estilo de marca FNE.» — TestToastPage · l.128
- «Navy Blue» — TestToastPage · l.251
- «#0a0a0a» — TestToastPage · l.252
- «Golden Yellow» — TestToastPage · l.256
- «#fbbf24» — TestToastPage · l.257
- «Error Red» — TestToastPage · l.261
- «#ef4044» — TestToastPage · l.262

### Pieces it uses (each is listed once, under "Pieces" below)

- `constants/toastMessages.ts`
- `constants/toastStyles.ts`
- `utils/toastUtils.ts`

## /test-user-role

File `pages/test-user-role.tsx` · 89 lines · frame: old Header

**Leftover (on the list for Brent)** — Shows the session's user and role, with the old header.

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.39 `router.push → /login`
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Test User Role» | h1 |  | TestUserRole · l.55 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Log In» | `{handleLogin}` | `!(loading) && !(isAuthenticated)` |  |  | TestUserRole · l.75 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handleLogin · l.39 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Header` |  |  |  | TestUserRole · l.49 |
| `CheckUserRole` |  | `!(loading) && isAuthenticated` |  | TestUserRole · l.65 |

**Other texts on screen** (6)

- «Test User Role - Genera» — TestUserRole · l.45
- «Cargando...» — TestUserRole · l.60, when `loading`
- «You are currently logged in. Here is your role information:» — TestUserRole · l.64, when `!(loading) && isAuthenticated`
- «This component shows your current user role from Supabase user_metadata.» — TestUserRole · l.68, when `!(loading) && isAuthenticated`
- «If your role is not set, you can update it in your profile settings or ask an administrator to update it for you.» — TestUserRole · l.69, when `!(loading) && isAuthenticated`
- «You need to be logged in to view your role information.» — TestUserRole · l.74, when `!(loading) && !(isAuthenticated)`

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

## /test

File `pages/test.tsx` · 4 lines · frame: none

**Leftover (on the list for Brent)** — Shows the words «Test Page Works».

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: nothing in the code (reached by typing the address, or from outside)
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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Test Page Works» | h1 |  | TestPage · l.2 |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/Footer.tsx

Used by: `/brand-preview`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Navegación» | h2 |  | Footer · l.89 |
| «Contacto» | h2 |  | Footer · l.102 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Política de Privacidad» | `{() => setShowPrivacyPolicy(true)}` |  |  |  | Footer · l.139 |
| «Términos de Uso» | `{() => setShowTermsOfUse(true)}` |  |  |  | Footer · l.145 |

**Links** (13)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «LinkedIn» | `https://cl.linkedin.com/company/fundacion-nueva-educacion` (new tab) |  |  | Footer · l.46 |
| «Instagram» | `https://www.instagram.com/fundacion_nueva_educacion/` (new tab) |  |  | Footer · l.52 |
| «Facebook» | `https://web.facebook.com/nuevaeducacion.org` (new tab) |  |  | Footer · l.58 |
| «X (Twitter)» | `https://x.com/fnuevaeducacion` (new tab) |  |  | Footer · l.64 |
| «YouTube» | `https://www.youtube.com/c/NuevaEducacionFundacion` (new tab) |  |  | Footer · l.70 |
| «Pasantías» | `/pasantias` |  |  | Footer · l.91 |
| «Programas» | `/programas` |  |  | Footer · l.92 |
| «Noticias y Eventos» | `/noticias` |  |  | Footer · l.93 |
| «Nosotros» | `/nosotros` |  |  | Footer · l.94 |
| «Equipo» | `/equipo` |  |  | Footer · l.95 |
| «Contacto» | `/#contacto` |  |  | Footer · l.96 |
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | Footer · l.105 |
| «Hub de Transformación» | `/login` |  |  | Footer · l.122 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Fundación Nueva Educación · /Logo BW.png?v=3 |  |  | Footer · l.32 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `PrivacyPolicyModal` | component | `{showPrivacyPolicy}` |  | Footer · l.161 |
| `TermsOfUseModal` | component | `{showTermsOfUse}` |  | Footer · l.165 |

**Other texts on screen** (5)

- «Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración para la expresión plena del potencial de cada estudiante.» — Footer · l.39
- «Síguenos» — Footer · l.44
- «Santiago, Chile» — Footer · l.117
- «© {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos reservados.» — Footer · l.135
- «ATE certificada por RPA Mineduc» — Footer · l.152

### components/PrivacyPolicyContent.tsx

Used by: `/brand-preview`

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «1. Información que Recopilamos» | h3 |  | PrivacyPolicyContent · l.37 |
| «2. Uso de la Información» | h3 |  | PrivacyPolicyContent · l.50 |
| «3. Protección de Datos» | h3 |  | PrivacyPolicyContent · l.63 |
| «4. Compartir Información» | h3 |  | PrivacyPolicyContent · l.74 |
| «5. Retención de Datos» | h3 |  | PrivacyPolicyContent · l.85 |
| «6. Sus Derechos» | h3 |  | PrivacyPolicyContent · l.90 |
| «7. Cookies y Tecnologías Similares» | h3 |  | PrivacyPolicyContent · l.103 |
| «8. Menores de Edad» | h3 |  | PrivacyPolicyContent · l.108 |
| «9. Cambios a esta Política» | h3 |  | PrivacyPolicyContent · l.113 |
| «10. Contacto» | h3 |  | PrivacyPolicyContent · l.118 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{LEGAL_IDENTITY.contactEmail}» | `mailto:[*]` |  |  | PrivacyPolicyContent · l.127 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| mark | `testid=privacy-notice-version` | PrivacyPolicyContent · l.26 |
| mark | `testid=privacy-controller-identity` | PrivacyPolicyContent · l.30 |
| mark | `testid=privacy-contact-block` | PrivacyPolicyContent · l.122 |

**Values shown from data** (1)

- `{LEGAL_IDENTITY.brandName}` — PrivacyPolicyContent · l.123

**Other texts on screen** (41)

- «Última actualización: {PRIVACY_NOTICE_UPDATED_LABEL} · Versión {PRIVACY_NOTICE_VERSION}» — PrivacyPolicyContent · l.26
- «El responsable del tratamiento de sus datos personales es {LEGAL_IDENTITY.brandName} (razón social: {LEGAL_IDENTITY.legalName} , {LEGAL_IDENTITY.taxId} ), con domicilio en {LEGAL_IDENTITY.streetAddress} , {LEGAL_IDENTITY.city} , {LEGAL_IDE…» — PrivacyPolicyContent · l.30
- «En FNE recopilamos información que usted nos proporciona directamente, tales como:» — PrivacyPolicyContent · l.39
- «Nombre y apellidos» — PrivacyPolicyContent · l.42
- «Dirección de correo electrónico» — PrivacyPolicyContent · l.43
- «Institución educativa a la que pertenece» — PrivacyPolicyContent · l.44
- «Cargo o rol dentro de la institución» — PrivacyPolicyContent · l.45
- «Información de contacto profesional» — PrivacyPolicyContent · l.46
- «Contenido de mensajes y consultas enviadas a través de nuestros formularios» — PrivacyPolicyContent · l.47
- «Utilizamos la información recopilada para los siguientes propósitos:» — PrivacyPolicyContent · l.52
- «Responder a sus consultas y solicitudes de información» — PrivacyPolicyContent · l.55
- «Proporcionar acceso a nuestra plataforma educativa» — PrivacyPolicyContent · l.56
- «Enviar comunicaciones sobre nuestros programas y servicios educativos» — PrivacyPolicyContent · l.57
- «Mejorar nuestros servicios y desarrollar nuevos programas» — PrivacyPolicyContent · l.58
- «Cumplir con obligaciones legales y regulatorias» — PrivacyPolicyContent · l.59
- «Generar estadísticas agregadas sobre el uso de nuestros servicios» — PrivacyPolicyContent · l.60
- «Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger su información personal contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:» — PrivacyPolicyContent · l.65
- «Encriptación de datos en tránsito y en reposo» — PrivacyPolicyContent · l.68
- «Acceso restringido a información personal» — PrivacyPolicyContent · l.69
- «Monitoreo regular de nuestros sistemas» — PrivacyPolicyContent · l.70
- «Capacitación del personal en protección de datos» — PrivacyPolicyContent · l.71
- «No vendemos, alquilamos ni compartimos su información personal con terceros, excepto en los siguientes casos:» — PrivacyPolicyContent · l.76
- «Con su consentimiento explícito» — PrivacyPolicyContent · l.79
- «Para cumplir con requerimientos legales» — PrivacyPolicyContent · l.80
- «Con proveedores de servicios que nos ayudan a operar nuestra plataforma (bajo acuerdos de confidencialidad)» — PrivacyPolicyContent · l.81
- «Para proteger los derechos y seguridad de FNE, nuestros usuarios o el público» — PrivacyPolicyContent · l.82
- «Conservamos su información personal durante el tiempo necesario para cumplir con los propósitos descritos en esta política, a menos que la ley requiera o permita un período de retención más largo.» — PrivacyPolicyContent · l.87
- «Usted tiene derecho a:» — PrivacyPolicyContent · l.92
- «Acceder a su información personal» — PrivacyPolicyContent · l.95
- «Corregir datos inexactos o incompletos» — PrivacyPolicyContent · l.96
- «Solicitar la eliminación de sus datos» — PrivacyPolicyContent · l.97
- «Oponerse al procesamiento de sus datos» — PrivacyPolicyContent · l.98
- «Solicitar la portabilidad de sus datos» — PrivacyPolicyContent · l.99
- «Retirar su consentimiento en cualquier momento» — PrivacyPolicyContent · l.100
- «Utilizamos cookies y tecnologías similares para mejorar su experiencia en nuestro sitio web, analizar el tráfico y personalizar el contenido. Puede configurar su navegador para rechazar cookies, aunque esto podría afectar algunas funcionalidades del sitio.» — PrivacyPolicyContent · l.105
- «Nuestros servicios están dirigidos a profesionales de la educación. No recopilamos intencionalmente información personal de menores de 18 años sin el consentimiento de sus padres o tutores.» — PrivacyPolicyContent · l.110
- «Podemos actualizar esta política de privacidad periódicamente. Le notificaremos sobre cambios significativos publicando la nueva política en nuestro sitio web y actualizando la fecha de &quot;última actualización&quot;.» — PrivacyPolicyContent · l.115
- «Si tiene preguntas sobre esta política de privacidad o sobre el tratamiento de sus datos personales, puede contactarnos en:» — PrivacyPolicyContent · l.120
- «Razón social: {LEGAL_IDENTITY.legalName} · {LEGAL_IDENTITY.taxId}» — PrivacyPolicyContent · l.124
- «Email:» — PrivacyPolicyContent · l.126
- «Dirección: {LEGAL_IDENTITY.streetAddress} , {LEGAL_IDENTITY.city} , {LEGAL_IDENTITY.country}» — PrivacyPolicyContent · l.134

### components/PrivacyPolicyModal.tsx

Used by: `/brand-preview`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Política de Privacidad» | h2 |  | PrivacyPolicyModal · l.25 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{onClose}` |  |  |  | PrivacyPolicyModal · l.26 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | PrivacyPolicyModal · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Política de Privacidad» | written in this file |  |  | PrivacyPolicyModal · l.13 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | PrivacyPolicyModal · l.10 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PrivacyPolicyContent` |  |  |  | PrivacyPolicyModal · l.38 |

### components/TermsOfUseModal.tsx

Used by: `/brand-preview`

**Titles** (15)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Términos de Uso» | h2 |  | TermsOfUseModal · l.24 |
| «1. Aceptación de los Términos» | h3 |  | TermsOfUseModal · l.40 |
| «2. Descripción del Servicio» | h3 |  | TermsOfUseModal · l.45 |
| «3. Registro y Cuenta de Usuario» | h3 |  | TermsOfUseModal · l.57 |
| «4. Uso Apropiado» | h3 |  | TermsOfUseModal · l.68 |
| «5. Propiedad Intelectual» | h3 |  | TermsOfUseModal · l.82 |
| «6. Contenido del Usuario» | h3 |  | TermsOfUseModal · l.90 |
| «7. Privacidad y Protección de Datos» | h3 |  | TermsOfUseModal · l.101 |
| «8. Limitación de Responsabilidad» | h3 |  | TermsOfUseModal · l.106 |
| «9. Indemnización» | h3 |  | TermsOfUseModal · l.117 |
| «10. Modificaciones del Servicio» | h3 |  | TermsOfUseModal · l.122 |
| «11. Terminación» | h3 |  | TermsOfUseModal · l.127 |
| «12. Ley Aplicable y Jurisdicción» | h3 |  | TermsOfUseModal · l.132 |
| «13. Disposiciones Generales» | h3 |  | TermsOfUseModal · l.137 |
| «14. Contacto» | h3 |  | TermsOfUseModal · l.142 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{onClose}` |  |  |  | TermsOfUseModal · l.25 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | TermsOfUseModal · l.148 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | TermsOfUseModal · l.14 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Términos de Uso» | written in this file |  |  | TermsOfUseModal · l.12 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | TermsOfUseModal · l.9 |

**Other texts on screen** (44)

- «Última actualización: {new Date().toLocaleDateString('es-C…}» — TermsOfUseModal · l.38
- «Al acceder y utilizar el sitio web de Fundación Nueva Educación (FNE) y su Hub de Transformación, usted acepta y se compromete a cumplir con estos Términos de Uso. Si no está de acuerdo con estos términos, no debe utilizar nuestros servicios.» — TermsOfUseModal · l.42
- «FNE proporciona una plataforma educativa digital y servicios de acompañamiento para la transformación educativa, incluyendo:» — TermsOfUseModal · l.47
- «Acceso a recursos educativos y materiales de formación» — TermsOfUseModal · l.50
- «Herramientas de colaboración para comunidades educativas» — TermsOfUseModal · l.51
- «Cursos y rutas de aprendizaje personalizadas» — TermsOfUseModal · l.52
- «Espacios de trabajo colaborativo» — TermsOfUseModal · l.53
- «Sistemas de evaluación y seguimiento del progreso» — TermsOfUseModal · l.54
- «Para acceder a ciertas funcionalidades de la plataforma, debe crear una cuenta proporcionando información precisa y completa. Usted es responsable de:» — TermsOfUseModal · l.59
- «Mantener la confidencialidad de su contraseña» — TermsOfUseModal · l.62
- «Todas las actividades que ocurran bajo su cuenta» — TermsOfUseModal · l.63
- «Notificar inmediatamente cualquier uso no autorizado» — TermsOfUseModal · l.64
- «Actualizar su información cuando sea necesario» — TermsOfUseModal · l.65
- «Usted se compromete a utilizar nuestros servicios de manera responsable y no deberá:» — TermsOfUseModal · l.70
- «Violar leyes locales, nacionales o internacionales» — TermsOfUseModal · l.73
- «Transmitir contenido ilegal, ofensivo, difamatorio o discriminatorio» — TermsOfUseModal · l.74
- «Intentar acceder sin autorización a otros sistemas o cuentas» — TermsOfUseModal · l.75
- «Interferir con el funcionamiento normal de la plataforma» — TermsOfUseModal · l.76
- «Usar la plataforma para enviar spam o contenido no solicitado» — TermsOfUseModal · l.77
- «Compartir credenciales de acceso con terceros no autorizados» — TermsOfUseModal · l.78
- «Realizar ingeniería inversa o intentar extraer el código fuente» — TermsOfUseModal · l.79
- «Todo el contenido presente en la plataforma, incluyendo textos, gráficos, logos, imágenes, videos, y software, es propiedad de FNE o de sus licenciantes y está protegido por las leyes de propiedad intelectual.» — TermsOfUseModal · l.84
- «Usted puede descargar y utilizar los materiales educativos proporcionados únicamente para fines educativos no comerciales, respetando siempre la atribución correspondiente.» — TermsOfUseModal · l.87
- «Al publicar contenido en nuestra plataforma, usted:» — TermsOfUseModal · l.92
- «Conserva sus derechos de propiedad intelectual» — TermsOfUseModal · l.95
- «Otorga a FNE una licencia no exclusiva para usar, reproducir y distribuir dicho contenido dentro de la plataforma» — TermsOfUseModal · l.96
- «Garantiza que tiene los derechos necesarios sobre el contenido que comparte» — TermsOfUseModal · l.97
- «Acepta que FNE puede moderar o eliminar contenido que viole estos términos» — TermsOfUseModal · l.98
- «El tratamiento de sus datos personales se rige por nuestra Política de Privacidad. Al usar nuestros servicios, acepta las prácticas descritas en dicha política.» — TermsOfUseModal · l.103
- «FNE proporciona la plataforma &quot;tal como está&quot; y no garantiza que el servicio sea ininterrumpido o libre de errores. En la máxima medida permitida por la ley, FNE no será responsable por:» — TermsOfUseModal · l.108
- «Daños indirectos, incidentales o consecuentes» — TermsOfUseModal · l.111
- «Pérdida de datos o información» — TermsOfUseModal · l.112
- «Interrupciones del servicio» — TermsOfUseModal · l.113
- «Contenido de terceros accesible a través de la plataforma» — TermsOfUseModal · l.114
- «Usted acepta indemnizar y mantener indemne a FNE, sus directores, empleados y colaboradores de cualquier reclamo, daño o gasto derivado de su uso de la plataforma o violación de estos términos.» — TermsOfUseModal · l.119
- «FNE se reserva el derecho de modificar, suspender o discontinuar cualquier aspecto del servicio en cualquier momento, con o sin previo aviso.» — TermsOfUseModal · l.124
- «FNE puede suspender o terminar su acceso a la plataforma si viola estos términos o por cualquier otra razón a nuestra discreción. Usted puede cancelar su cuenta en cualquier momento contactándonos.» — TermsOfUseModal · l.129
- «Estos términos se rigen por las leyes de la República de Chile. Cualquier disputa será resuelta en los tribunales competentes de Santiago, Chile.» — TermsOfUseModal · l.134
- «Si alguna disposición de estos términos es declarada inválida o inaplicable, las demás disposiciones continuarán en pleno vigor. Estos términos constituyen el acuerdo completo entre usted y FNE respecto al uso de nuestros servicios.» — TermsOfUseModal · l.139
- «Para consultas sobre estos Términos de Uso, puede contactarnos en:» — TermsOfUseModal · l.144
- «Fundación Nueva Educación» — TermsOfUseModal · l.147
- «Email:» — TermsOfUseModal · l.148
- «Dirección: Santiago, Chile» — TermsOfUseModal · l.149
- «ATE certificada por RPA Mineduc» — TermsOfUseModal · l.150

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
| «Detalle de Feedback» | h3 |  | FeedbackDetail · l.231 |
| «Descripción» | h4 |  | FeedbackDetail · l.291 |
| «Captura de pantalla» | h4 | `feedback.screenshot_url` | FeedbackDetail · l.298 |
| «Detalles técnicos» | h4 |  | FeedbackDetail · l.310 |
| «Acciones» | h4 |  | FeedbackDetail · l.336 |
| «Actividad» | h4 |  | FeedbackDetail · l.380 |

**Buttons** (8)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» · aria «Close modal» | `{onClose}` |  |  | `testid=close-modal-button` | FeedbackDetail · l.238 |
| «Copiar Detalles» · tooltip «Copiar todos los detalles del error para Claude Code» | `{copyErrorDetailsForClaude}` |  |  |  | FeedbackDetail · l.254 |
| «Marcar en progreso» | `{() => onStatusUpdate('in_progress')}` | `feedback.status !== 'in_progress' && feedback.status !== 'resolved' && feedback.status !== 'closed'` |  |  | FeedbackDetail · l.339 |
| «Marcar como resuelto» | `{() => onStatusUpdate('resolved')}` | `feedback.status !== 'resolved' && feedback.status !== 'closed'` |  |  | FeedbackDetail · l.347 |
| «Cerrar ticket» | `{() => onStatusUpdate('closed')}` | `feedback.status === 'resolved'` |  |  | FeedbackDetail · l.355 |
| «Cerrar ventana» | `{onClose}` |  |  |  | FeedbackDetail · l.367 |
| «[icon Send]» · aria «Send comment» | `{addComment}` |  | `{isSubmitting \|\| !newComment.trim()}` | `testid=send-comment-button` | FeedbackDetail · l.436 |
| «[icon X]» | `{() => setShowFullScreenshot(false)}` | `showFullScreenshot && feedback.screenshot_url` |  |  | FeedbackDetail · l.464 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{feedback.page_url}» | `{feedback.page_url}` (new tab) |  |  | FeedbackDetail · l.314 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | FeedbackDetail · l.219 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Agregar comentario...» | text | «Agregar comentario...» · disabled: `{isSubmitting}` · also `onKeyPress={(e) => e.key === 'Enter' && addComment()}` |  |  |  | FeedbackDetail · l.427 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {`${feedback.profiles.first_name} ${feedback.profiles.last_name}`} · {feedback.profiles.avatar_url} | `feedback.profiles.avatar_url` |  | FeedbackDetail · l.267 |
| img · alt Screenshot · {feedback.screenshot_url} | `feedback.screenshot_url` |  | FeedbackDetail · l.299 |
| img · alt Screenshot · {feedback.screenshot_url} | `showFullScreenshot && feedback.screenshot_url` |  | FeedbackDetail · l.459 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Detalle de Feedback» | written in this file |  |  | FeedbackDetail · l.217 |
| «(sin título)» | written in this file | `showFullScreenshot && feedback.screenshot_url` |  | FeedbackDetail · l.455 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Comentario agregado» |  | addComment · l.108 |
| error | «Error al agregar comentario» |  | addComment · l.111 |
| success | «¡Detalles copiados para Claude Code!» |  | copyErrorDetailsForClaude · l.206 |
| error | «Error al copiar los detalles» |  | copyErrorDetailsForClaude · l.209 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | addComment · l.93 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen \|\| !feedback` | FeedbackDetail · l.213 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Feature Request» | FeedbackDetail · l.176 |
| «General Feedback» | FeedbackDetail · l.176 |
| «**Console Error:** ``` {consoleError} ```» | FeedbackDetail · l.189 |
| «Not captured» | FeedbackDetail · l.195 |
| «Resolution Notes: {feedback.resolution_notes}» | FeedbackDetail · l.199 |

**Values shown from data** (9)

- `# {feedback.id.slice(0, 8).toUpperCase…}` — FeedbackDetail · l.234
- `{feedback.profiles.first_name} {feedback.profiles.last_name}` — FeedbackDetail · l.278
- `{feedback.profiles.email}` — FeedbackDetail · l.281
- `{feedback.description}` — FeedbackDetail · l.292
- `{JSON.stringify(feedback.browser_inf…}` — FeedbackDetail · l.326, when `feedback.browser_info`
- `{activity.message}` — FeedbackDetail · l.401, when `!(activities.length === 0) && each activities && activity.is_system_message`
- `{activity.profiles?.first_name} {activity.profiles?.last_name}` — FeedbackDetail · l.407, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`
- `{formatDate(activity.created_at)}` — FeedbackDetail · l.410, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`
- `{activity.message}` — FeedbackDetail · l.414, when `!(activities.length === 0) && each activities && !(activity.is_system_message)`

**Other texts on screen** (3)

- «Ver información del navegador» (label) — FeedbackDetail · l.325, when `feedback.browser_info`
- «Ticket cerrado» — FeedbackDetail · l.364, when `feedback.status === 'closed'`
- «Sin actividad aún» — FeedbackDetail · l.388, when `activities.length === 0`

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

### components/layout/Header.tsx

Used by: `/admin/bucket-test`, `/admin/test-spanish-input`, `/test-user-role`

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

### components/notifications/NotificationBell.tsx

Used by: `/admin/bucket-test`, `/admin/test-spanish-input`, `/test-user-role`

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

Used by: `/admin/bucket-test`, `/admin/test-spanish-input`, `/test-user-role`

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

### constants/toastMessages.ts

Used by: `/test-toast`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `TOAST_MESSAGES` | «Cambios guardados exitosamente», «Error al guardar los cambios», «Guardando cambios...», «Sesión iniciada correctamente», «Sesión cerrada correctamente», «Contraseña actualizada exitosamente», «Se ha enviado un enlace de recuperación a tu correo», «Tu sesión ha expirado. Por favor, inicia sesión nuevamente», «Error al iniciar sesión. Verifica tus credenciales», «Error al cerrar sesión», «Error al actualizar la contraseña», «Error de autenticación», «No tienes permisos para realizar esta acción», «Archivo eliminado exitosamente», «Error al eliminar el archivo», «Tipo de archivo no permitido», «Subiendo archivo...», «Procesando archivo...», «Por favor completa todos los campos requeridos», «Correo electrónico inválido», «Número de teléfono inválido», «Fecha inválida», «Las contraseñas no coinciden», «La contraseña debe tener al menos 8 caracteres», «Formato inválido», «Error de conexión. Verifica tu conexión a internet», «Error del servidor. Por favor, intenta más tarde», «La operación tardó demasiado. Por favor, intenta nuevamente», «Error inesperado. Por favor, intenta nuevamente», «Rol actualizado exitosamente», «Perfil actualizado correctamente», «Foto de perfil actualizada», «Contraseña restablecida exitosamente», «Error al aprobar el usuario», «Error al actualizar el rol», «Error al actualizar el perfil», «Inscripción exitosa», «Curso completado», «Progreso guardado», «Lección completada», «Error al inscribirse en el curso», «Error al guardar el progreso», «Tarea enviada exitosamente», «Tarea calificada», «Retroalimentación enviada», «Error al enviar la tarea», «Error al calificar la tarea», «Grupo creado exitosamente», «Te has unido al grupo», «Has salido del grupo», «Miembro agregado al grupo», «Miembro eliminado del grupo», «Error al unirse al grupo», «Error al salir del grupo», «Publicación creada exitosamente», «Publicación eliminada», «Comentario agregado», «Me gusta agregado», «Guardado exitosamente», «Error al crear la publicación», «Error al agregar el comentario», «Notificación enviada», «Notificación marcada como leída», «Preferencias de notificación actualizadas», «Error al enviar la notificación», «Error al actualizar las preferencias», «Contrato creado exitosamente», «Contrato firmado», «Contrato actualizado», «Anexo agregado al contrato», «Error al crear el contrato», «Error al firmar el contrato», «Reporte generado exitosamente», «Reporte exportado exitosamente», «Descargando reporte...», «Error al generar el reporte», «Error al exportar el reporte», «Suplantación iniciada correctamente», «Suplantación terminada correctamente», «Error al iniciar suplantación» | l.6 |
| `suffix` | «_SUCCESS / _ERROR» | getGenderedMessage · l.202 |

**Other texts written in the code (safety net: not tied to an element by the script)** (17)

| Text | Where |
|---|---|
| «Error al cargar {entity.toLowerCase()}: {error}» | TOAST_MESSAGES · l.26 |
| «Error al cargar {entity.toLowerCase()}» | TOAST_MESSAGES · l.26 |
| «Creando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.30 |
| «Actualizando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.31 |
| «Eliminando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.32 |
| «Cargando {entity.toLowerCase()}...» | TOAST_MESSAGES · l.33 |
| «Error al subir el archivo: {error}» | TOAST_MESSAGES · l.56 |
| «Error al subir el archivo» | TOAST_MESSAGES · l.56 |
| «El archivo excede el tamaño máximo permitido de {maxSize}» | TOAST_MESSAGES · l.59 |
| «Usuario {userName} aprobado exitosamente» | TOAST_MESSAGES · l.87 |
| «Usuario {userName} rechazado» | TOAST_MESSAGES · l.88 |
| «Operación exitosa» | TOAST_MESSAGES · l.184 |
| «Cargando...» | TOAST_MESSAGES · l.186 |
| «Copiado al portapapeles» | TOAST_MESSAGES · l.187 |
| «Enviado exitosamente» | TOAST_MESSAGES · l.188 |
| «Operación cancelada» | TOAST_MESSAGES · l.189 |
| «¿Estás seguro de que deseas eliminar?» | TOAST_MESSAGES · l.190 |

### constants/toastStyles.ts

Used by: `/test-toast`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `baseStyle` | «0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)», «Inter, system-ui, -apple-system, sans-serif» | l.20 |

### lib/legal/privacy-notice.ts

Used by: `/brand-preview`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LEGAL_IDENTITY` | «Fundación Nueva Educación», «Fundación Instituto Relacional», «RUT 65.166.503-5», «Carlos Silva Vildósola 10448», «La Reina, Santiago», «Chile» | l.46 |

### src/components/CheckUserRole.tsx

Used by: `/test-user-role`

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

Used by: `/admin/configuration`, `/admin/feedback`, `/admin/form-usage`, `/admin/roadmap`, `/test-sidebar-role`, `/test-user-role`

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

Used by: `/admin/feedback`, `/admin/form-usage`, `/admin/roadmap`

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

### utils/toastUtils.ts

Used by: `/test-toast`

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «{message}» |  | toastSuccess · l.36 |
| error | «{message}» |  | toastError · l.50 |
| plain | «{message}» |  | toastInfo · l.64 |
| loading | «{message}» |  | toastLoading · l.79 |
| promise | «{{ loading: messages.loading, success: messages.success, error: messag…}» |  | toastPromise · l.102 |
| custom | «{content as any}» |  | toastCustom · l.159 |
| error | «{errorMessage}» |  | handleApiError · l.190 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Error de conexión. Verifica tu conexión a internet» | handleApiError · l.183 |
| «No tienes permisos para realizar esta acción» | handleApiError · l.185 |
| «La operación tardó demasiado. Por favor, intenta nuevamente» | handleApiError · l.187 |

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/check-rls-policies` | `pages/api/admin/check-rls-policies.ts` | GET | **no screen** |  |
| `/api/admin/emergency-restore` | `pages/api/admin/emergency-restore.ts` |  | **no screen** |  |
| `/api/admin/form-usage-stats` | `pages/api/admin/form-usage-stats.ts` | GET | `/admin/form-usage` | `pages/admin/form-usage.tsx` |
| `/api/admin/system-updates` | `pages/api/admin/system-updates.ts` | POST | **no screen** |  |
| `/api/bots/link-code` | `pages/api/bots/link-code.ts` | POST | `/expense-reports` | `pages/expense-reports.tsx` |
| `/api/bots/telegram` | `pages/api/bots/telegram.ts` | POST | **no screen** | `__tests__/api/bots/telegram.test.ts` |
| `/api/check-env` | `pages/api/check-env.js` |  | **no screen** |  |
| `/api/cron/auth-retention` | `pages/api/cron/auth-retention.ts` |  | **no screen** | `__tests__/api/cron/auth-retention.test.ts`, `__tests__/api/cron/session-reminders.test.ts`, `__tests__/lib/notificationService.dispatch.test.ts`, `tests/e2e/due-reminders.spec.ts`, `tests/e2e/notification-dispatch.spec.ts` +2 |
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
| `/api/debug/check-course-images` | `pages/api/debug/check-course-images.ts` | GET | **no screen** |  |
| `/api/monitoring/run-checks` | `pages/api/monitoring/run-checks.ts` | POST | **no screen** |  |
| `/api/test-bucket` | `pages/api/test-bucket.js` |  | **no screen** |  |
| `/api/test/notification-triggers` | `pages/api/test/notification-triggers.ts` |  | **no screen** |  |

