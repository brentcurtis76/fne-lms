# Notificaciones

Area `16-notificaciones`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `c4375a085` (2026-11-16).

4 screen files, 9 API files, 7 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/configuracion` | `pages/configuracion/index.tsx` | 11 | — |  |
| `/configuracion/notificaciones` | `pages/configuracion/notificaciones.tsx` | 439 | — |  |
| `/notificaciones/baja` | `pages/notificaciones/baja.tsx` | 192 | — |  |
| `/notifications` | `pages/notifications.tsx` | 653 | — |  |

## /configuracion

File `pages/configuracion/index.tsx` · 11 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `lib/auth/forced-password-change.ts:135`, `middleware.ts:330`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`; unit tests of the page: `__tests__/pages/notification-settings.test.tsx`.

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
| `/configuracion/notificaciones` | `server redirect` |  | getServerSideProps · l.5 |

## /configuracion/notificaciones

File `pages/configuracion/notificaciones.tsx` · 439 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.117 `server redirect → /login?next=[*]  (when !viewer)`
- Linked from: `components/notifications/ModernNotificationCenter.tsx:465`, `components/notifications/ModernNotificationCenter.tsx:466`, `components/notifications/NotificationDropdown.tsx:187`, `components/notifications/NotificationDropdown.tsx:188`, `lib/email/notifications.ts:30`, `pages/admin/configuration.tsx:396`, `pages/admin/configuration.tsx:397`, `pages/configuracion/index.tsx:5`, `pages/notifications.tsx:381`, `pages/profile.tsx:743`, `pages/profile.tsx:744`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`; unit tests of the page: `__tests__/pages/notification-settings.test.tsx`.

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

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Recargar» | `{() => window.location.reload()}` | `status === 'session_changed'` |  | `testid=ns-reload` | NotificationSettingsPage · l.272 |
| «Reintentar» | `{() => (categories ? void load() : window.location.reload())}` | `!(status === 'session_changed') && !(status === 'expired') && status === 'error'` |  | `testid=ns-retry` | NotificationSettingsPage · l.290 |
| «Guardando… / Guardar cambios» (submits the form) |  | `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)` | `{saving \|\| changes.length === 0}` | `testid=ns-save` | NotificationSettingsPage · l.409 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Inicia sesión nuevamente» | `{LOGIN_AGAIN}` | `!(status === 'session_changed') && status === 'expired'` |  | NotificationSettingsPage · l.281 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{saved.label}» | select | disabled: `{saving}` | «{MODE_LABELS.default}», «{MODE_LABELS.immediate}», «{MODE_LABELS.digest}», «{STORED_UNAVAILABLE}», «{MODE_LABELS.off}» | `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown` | `testid=ns-mode-{section.category} id=ns-mode-{section.category}` | NotificationSettingsPage · l.355 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); void save(); }}` | `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)` | NotificationSettingsPage · l.320 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «saved / Tus preferencias se guardaron.» | `setNotice` |  | save · l.259 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | getServerSideProps · l.117 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | getServerSideProps · l.123 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `id !== request.current` | NotificationSettingsPage · l.207 |
| `sessionLoading \|\| sessionError \|\| sessionUserId === ownerId` | NotificationSettingsPage · l.224 |
| `!event` | NotificationSettingsPage · l.390 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Notificaciones por correo · breadcrumbs: Configuración / Notificaciones |  |  | NotificationSettingsPage · l.429 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `PRODUCER_EVENT_LABELS` | «Invitación a un grupo», «Entrega de tarea grupal», «Quiz pendiente de revisión», «Quiz revisado», «Alerta de calidad de datos» | l.85 |
| `READ_ERROR` | «No pudimos cargar tus preferencias.» | l.144 |
| `SAVE_ERROR` | «No pudimos guardar tus preferencias. Intenta nuevamente.» | l.145 |
| `MODE_LABELS` | «Predeterminado», «Inmediato», «Resumen diario», «Desactivado» | l.147 |
| `STORED_UNAVAILABLE` | «Opción anterior (se envía de inmediato)» | l.155 |
| `DELIVERY_LABELS` | «Se envía de inmediato», «Va en el resumen diario», «No se envía» | l.157 |
| `ADDRESS_NOTICES` | «No podemos enviarte correos: tu dirección rechazó mensajes anteriores. Escribe a soporte para revisarla; mientras tanto no recibirás avisos por correo.», «Tu dirección de correo recibe nuestros avisos con normalidad.», «No pudimos comprobar si tu dirección de correo recibe nuestros avisos.» | l.163 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (20)

| Kind | What | Where |
|---|---|---|
| role | `role=alert` | NotificationSettingsPage · l.270 |
| mark | `testid=ns-session-changed` | NotificationSettingsPage · l.270 |
| role | `role=alert` | NotificationSettingsPage · l.279 |
| mark | `testid=ns-expired` | NotificationSettingsPage · l.279 |
| role | `role=alert` | NotificationSettingsPage · l.288 |
| mark | `testid=ns-error` | NotificationSettingsPage · l.288 |
| role | `role=status` | NotificationSettingsPage · l.302 |
| mark | `testid=ns-loading` | NotificationSettingsPage · l.302 |
| mark | `testid=ns-empty` | NotificationSettingsPage · l.308 |
| mark | `testid=ns-address-{view.address_suppression}` | NotificationSettingsPage · l.326 |
| mark | `testid=ns-digest-note` | NotificationSettingsPage · l.329 |
| mark | `testid=ns-mandatory` | NotificationSettingsPage · l.335 |
| mark | `testid=ns-category-{section.category}` | NotificationSettingsPage · l.350 |
| mark | `testid=ns-stored-digest-{section.category}` | NotificationSettingsPage · l.378 |
| mark | `testid=ns-event-{event.event_type}` | NotificationSettingsPage · l.392 |
| mark | `testid=ns-legacy-{event.event_type}` | NotificationSettingsPage · l.397 |
| role | `role=status aria-live=polite` | NotificationSettingsPage · l.412 |
| mark | `testid={notice.kind === 'saved' ? 'ns-saved' : 'ns-save-error'}` | NotificationSettingsPage · l.414 |
| mark | `testid=ns-unsaved` | NotificationSettingsPage · l.418 |
| mark | `testid=notification-settings` | NotificationSettingsPage · l.430 |

**Values shown from data** (5)

- `{READ_ERROR}` — NotificationSettingsPage · l.289, when `!(status === 'session_changed') && !(status === 'expired') && status === 'error'`
- `{ADDRESS_NOTICES[view.address_suppre…}` — NotificationSettingsPage · l.326, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)`
- `{labelOf(e.event_type)}` — NotificationSettingsPage · l.339, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && mandatory.length > 0 && each mandatory`
- `{applicable.label}` — NotificationSettingsPage · l.393, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && each section.events`
- `{notice.text}` — NotificationSettingsPage · l.414, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && notice`

**Other texts on screen** (13)

- «Tu sesión cambió en otra pestaña. Recarga la página para ver tus preferencias.» — NotificationSettingsPage · l.271, when `status === 'session_changed'`
- «Tu sesión terminó.» — NotificationSettingsPage · l.280, when `!(status === 'session_changed') && status === 'expired'`
- «Cargando tus preferencias…» — NotificationSettingsPage · l.303, when `!(status === 'session_changed') && !(status === 'expired') && !(status === 'error') && (status === 'loading' \|\| !view)`
- «Tu cuenta no tiene avisos por correo que configurar.» — NotificationSettingsPage · l.309, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && shown.length === 0`
- «Resumen diario: los avisos se agrupan en un correo al día. Por ahora no puedes elegir la hora de envío. / El resumen diario todavía no está disponible: los avisos que irían en un resumen se envían de inmediato.» — NotificationSettingsPage · l.329, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)`
- «Estos avisos se envían siempre, aunque desactives su categoría:» — NotificationSettingsPage · l.336, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && mandatory.length > 0`
- «{saved.label}» (label) — NotificationSettingsPage · l.352, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown`
- «Elegiste Resumen diario antes. Mientras no esté disponible, estos avisos se envían de inmediato.» — NotificationSettingsPage · l.379, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && !digest && saved.email_mode === 'digest'`
- «Con Predeterminado se mantienen apagados los avisos que desactivaste antes.» — NotificationSettingsPage · l.384, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && legacy`
- «Se envía siempre» — NotificationSettingsPage · l.395, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && each section.events`
- «· desactivado por una preferencia anterior» — NotificationSettingsPage · l.397, when `!(shown.length === 0) && each shown && each section.events && event.reason === 'legacy_suppressed'`
- «Tienes cambios sin guardar.» — NotificationSettingsPage · l.419, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && !(notice) && changes.length > 0`
- «Elige cómo recibir por correo los avisos de cada tema. Los avisos dentro de la plataforma no cambian.» — NotificationSettingsPage · l.432

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/notificationEvents.ts`
- `lib/notifications/catalog.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/user/notification-preferences` | ? | `pages/configuracion/notificaciones.tsx:142` |

## /notificaciones/baja

File `pages/notificaciones/baja.tsx` · 192 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/email/notification-unsubscribe.ts:30`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/notification-unsubscribe.spec.ts`.

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
| «{failure.title}» | h1 | `!(view.state === 'loading') && failure` | NotificationUnsubscribePage · l.131 |
| «Listo: ya no recibirás estos correos» | h1 | `!(view.state === 'loading') && !(failure) && view.state === 'done'` | NotificationUnsubscribePage · l.148 |
| «¿Quieres dejar de recibir el resumen diario por correo? / ¿Quieres dejar de recibir estos correos?» | h1 | `!(view.state === 'loading') && !(failure) && !(view.state === 'done') && ((view.state === 'confirm' \|\| view.state === 'sending'))` | NotificationUnsubscribePage · l.163 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Intentar de nuevo» | `{confirm}` | `!(view.state === 'loading') && failure && view.state === 'failed'` |  | `testid=unsubscribe-retry` | NotificationUnsubscribePage · l.136 |
| «Procesando… / Sí, dejar de recibir estos correos» | `{confirm}` | `!(view.state === 'loading') && !(failure) && !(view.state === 'done') && ((view.state === 'confirm' \|\| view.state === 'sending'))` | `{view.state === 'sending'}` | `testid=unsubscribe-confirm` | NotificationUnsubscribePage · l.175 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!token` | NotificationUnsubscribePage · l.67 |
| `!current` | NotificationUnsubscribePage · l.71 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `MESSAGES` | «Este enlace ya no está vigente», «Cambiaste tus preferencias de notificaciones después de recibir este correo, así que no hicimos ningún cambio.», «Este enlace venció», «No hicimos ningún cambio. Usa el enlace de un correo más reciente para dejar de recibir estas notificaciones.», «Este enlace no es válido», «No hicimos ningún cambio. Revisa que hayas abierto el enlace completo desde el correo que recibiste.», «No pudimos procesar tu solicitud», «No hicimos ningún cambio. Inténtalo de nuevo en unos minutos.» | l.30 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (9)

| Kind | What | Where |
|---|---|---|
| focus | `heading.current.focus()` | NotificationUnsubscribePage · l.84 |
| role | `role=status` | NotificationUnsubscribePage · l.126 |
| mark | `testid=unsubscribe-loading` | NotificationUnsubscribePage · l.126 |
| role | `role=alert` | NotificationUnsubscribePage · l.130 |
| mark | `testid=unsubscribe-error` | NotificationUnsubscribePage · l.130 |
| role | `role=status` | NotificationUnsubscribePage · l.147 |
| mark | `testid=unsubscribe-done` | NotificationUnsubscribePage · l.147 |
| mark | `testid=unsubscribe-unchanged` | NotificationUnsubscribePage · l.155 |
| mark | `testid=unsubscribe-categories` | NotificationUnsubscribePage · l.167 |

**Values shown from data** (2)

- `{failure.body}` — NotificationUnsubscribePage · l.134, when `!(view.state === 'loading') && failure`
- `{category.label}` — NotificationUnsubscribePage · l.169, when `!(failure) && !(view.state === 'done') && ((view.state === 'confirm' \|\| view.state === 'sending')) && each view.categories`

**Other texts on screen** (7)

- «Dejar de recibir correos · Genera» — NotificationUnsubscribePage · l.117
- «Genera · Notificaciones por correo» — NotificationUnsubscribePage · l.123
- «Verificando el enlace…» — NotificationUnsubscribePage · l.127, when `view.state === 'loading'`
- «Seguirás viendo estas notificaciones dentro de Genera y recibiendo los avisos obligatorios.» — NotificationUnsubscribePage · l.152, when `!(view.state === 'loading') && !(failure) && view.state === 'done'`
- «No cambiamos {view.unchanged.join(', ')} : modificaste esa preferencia después de recibir este correo.» — NotificationUnsubscribePage · l.155, when `!(view.state === 'loading') && !(failure) && view.state === 'done' && view.unchanged.length > 0`
- «Dejaremos de enviarte por correo las notificaciones de:» — NotificationUnsubscribePage · l.166, when `!(view.state === 'loading') && !(failure) && !(view.state === 'done') && ((view.state === 'confirm' \|\| view.state === 'sending'))`
- «Seguirás viéndolas dentro de Genera y recibiendo los avisos obligatorios. Todavía no hemos cambiado nada.» — NotificationUnsubscribePage · l.173, when `!(view.state === 'loading') && !(failure) && !(view.state === 'done') && ((view.state === 'confirm' \|\| view.state === 'sending'))`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/notifications/unsubscribe` | ? | `pages/notificaciones/baja.tsx:11` |

## /notifications

File `pages/notifications.tsx` · 653 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.112 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.129 `router.push → /login  (when !(session) && session === null)`
  - l.257 `router.push → /dashboard  (when notification.related_url)`
- Linked from: `components/DynamicFavicon.tsx:28`, `components/notifications/ModernNotificationCenter.tsx:594`, `components/notifications/NotificationDropdown.tsx:174`, `lib/auth/forced-password-change.ts:155`, `lib/email/notifications.ts:27`, `middleware.ts:350`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`; browser tests CI skips: `tests/e2e/messaging-notifications.spec.ts`; unit tests of the page: `__tests__/notifications/entry-points.test.tsx`.

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
| «Todas las Notificaciones» | h1 |  | NotificationsPage · l.375 |
| «No hay notificaciones» | h3 | `paginatedNotifications.length === 0` | NotificationsPage · l.483 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshIcon]» · tooltip «Refrescar» | `{handleRefresh}` |  | `{refreshing}` |  | NotificationsPage · l.384 |
| «[icon FilterIcon]» · tooltip «Filtros» | `{() => setShowFilters(!showFilters)}` |  |  |  | NotificationsPage · l.387 |
| «Marcar como leídas» | `{() => handleMarkAsRead(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.453 |
| «Marcar como no leídas» | `{() => handleMarkAsUnread(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.460 |
| «Eliminar» | `{() => handleDeleteClick(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.467 |
| «Anterior» | `{() => setCurrentPage(prev => Math.max(1, prev - 1))}` | `!(paginatedNotifications.length === 0) && totalPages > 1` | `{currentPage === 1}` |  | NotificationsPage · l.614 |
| «Siguiente» | `{() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}` | `!(paginatedNotifications.length === 0) && totalPages > 1` | `{currentPage === totalPages}` |  | NotificationsPage · l.626 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon CogIcon]» · aria «Configuración de notificaciones» | `/configuracion/notificaciones` |  | `testid=notifications-page-settings` | NotificationsPage · l.381 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{notification.title} [{notification.description}] {getRelativeTime(notification.create…} [{getCategoryName(notification…» | `{() => handleNotificationClick(notification)}` | `!(paginatedNotifications.length === 0) && each paginatedNotifications` | NotificationsPage · l.548 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar notificaciones...» | text | «Buscar notificaciones...» |  | `showFilters` |  | NotificationsPage · l.400 |
|  | select |  | «Todas las categorías», «Administración», «Tareas», «Cursos», «Mensajes», «Social», «Feedback», «Sistema», «Workspace» | `showFilters` |  | NotificationsPage · l.408 |
|  | select |  | «Todas», «No leídas», «Leídas» | `showFilters` |  | NotificationsPage · l.423 |
|  | select |  | «Todo el tiempo», «Hoy», «Última semana», «Último mes» | `showFilters` |  | NotificationsPage · l.432 |
| «Seleccionar todas» | checkbox |  |  | `!(paginatedNotifications.length === 0)` |  | NotificationsPage · l.498 |
|  | checkbox |  |  | `!(paginatedNotifications.length === 0) && each paginatedNotifications` |  | NotificationsPage · l.528 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `NotificationDeleteModal` | component | `{showDeleteModal}` |  | NotificationsPage · l.642 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar notificaciones.» |  | NotificationsPage · l.95 |
| error | «Error al cargar los datos iniciales.» |  | NotificationsPage · l.119 |
| success | «{notificationIds.length} notificación(es) marcada(s) como leída(s)» |  | handleMarkAsRead · l.192 |
| error | «Error al marcar como leído» |  | handleMarkAsRead · l.195 |
| success | «{notificationIds.length} notificación(es) marcada(s) como no leída(s)» |  | handleMarkAsUnread · l.210 |
| error | «Error al marcar como no leído» |  | handleMarkAsUnread · l.213 |
| success | «{deleteTargetIds.length} notificación(es) eliminada(s)» |  | handleDeleteConfirm · l.231 |
| error | «Error al eliminar notificaciones» |  | handleDeleteConfirm · l.234 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(session) && session === null` | NotificationsPage · l.129 |
| `{notification.related_url}` | `router.push` | `notification.related_url` | handleNotificationClick · l.254 |
| `/dashboard` | `router.push` | `notification.related_url` | handleNotificationClick · l.257 |
| `{fallbackUrl}` | `router.push` | `!(notification.related_url)` | handleNotificationClick · l.291 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | NotificationsPage · l.112 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!session` | NotificationsPage · l.76 |
| `!session` | NotificationsPage · l.102 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Notificaciones | `loading` |  | NotificationsPage · l.360 |
| `MainLayout` | pageTitle: Notificaciones |  |  | NotificationsPage · l.369 |
| `CogIcon` | aria-hidden: true |  |  | NotificationsPage · l.382 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `nameMap` | «Administración», «Tareas», «Cursos», «Mensajes», «Social», «Feedback», «Sistema», «Workspace» | getCategoryName · l.328 |
| `getRelativeTime()` | «hace {Math.floor(days / 30)} mes(es)», «hace {days} día(s)», «hace {hours} hora(s)», «hace {minutes} minuto(s)», «justo ahora» | getRelativeTime · l.351 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «hace {days} día(s)» | NotificationsPage · l.352 |

**Values shown from data** (3)

- `{notification.title}` — NotificationsPage · l.554, when `!(paginatedNotifications.length === 0) && each paginatedNotifications`
- `{notification.description}` — NotificationsPage · l.562, when `!(paginatedNotifications.length === 0) && each paginatedNotifications && notification.description`
- `{getCategoryName(notification.notifi…}` — NotificationsPage · l.578, when `!(paginatedNotifications.length === 0) && each paginatedNotifications && notification.notification_type`

**Other texts on screen** (5)

- «{filteredNotifications.length} notificación(es) • {filteredNotifications.filter(n => !…} sin leer» — NotificationsPage · l.376
- «{selectedNotifications.size} notificación(es) seleccionada(s)» — NotificationsPage · l.449, when `selectedNotifications.size > 0`
- «No se encontraron notificaciones con los filtros aplicados / No tienes notificaciones en este momento» — NotificationsPage · l.486, when `paginatedNotifications.length === 0`
- «Seleccionar todas» (label) — NotificationsPage · l.497, when `!(paginatedNotifications.length === 0)`
- «Página {currentPage} de {totalPages}» — NotificationsPage · l.622, when `!(paginatedNotifications.length === 0) && totalPages > 1`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_notifications` (delete, select, update)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/notifications/NotificationDeleteModal.tsx`
- `types/roles.ts`
- `utils/roleUtils.ts`

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/notifications/NotificationDeleteModal.tsx

Used by: `/notifications`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Eliminar notificaciones» | h3 | screen size: `sm:block sm:flex` | NotificationDeleteModal · l.40 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Eliminar» | `{onConfirm}` | screen size: `sm:block sm:flex` |  |  | NotificationDeleteModal · l.53 |
| «Cancelar» | `{onClose}` | screen size: `sm:block sm:flex` |  |  | NotificationDeleteModal · l.61 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Eliminar notificaciones» | written in this file |  |  | NotificationDeleteModal · l.20 |
| «(sin título)» | written in this file |  |  | NotificationDeleteModal · l.23 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | NotificationDeleteModal · l.17 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ExclamationIcon` | aria-hidden: true | screen size: `sm:block sm:flex` |  | NotificationDeleteModal · l.37 |

**Other texts on screen** (1)

- «¿Estás seguro de que deseas eliminar {count} notificación es ? Esta acción no se puede deshacer.» — NotificationDeleteModal · l.44, screen size: `sm:block sm:flex`

### lib/api-auth.ts

Used by: `/configuracion/notificaciones`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

**Reads and writes the database directly:** `table:profiles` (select)

### lib/auth/forced-password-change.ts

Used by: `/configuracion/notificaciones`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `verdictFromProfile()` | «required / allowed» | verdictFromProfile · l.249 |

### lib/notificationEvents.ts

Used by: `/configuracion/notificaciones`

**Texts kept in lists and helpers in the code (labels, options, status names)** (15)

| Name | Texts | Where |
|---|---|---|
| `courseName` | «del curso "{d.course.name}"» | l.272 |
| `dueDate` | «Fecha límite: {new Date(d.assignment.due_d…}.» | l.309 |
| `step` | «Paso {d.step_index} / Un paso» | l.426 |
| `tester` | «(probado por {d.tester_email})» | l.427 |
| `dueDate` | «Fecha límite: {new Date(d.due_date as stri…}.» | l.445 |
| `when` | «el {date}{time ? ` a las ${time}` : ''} / en una fecha por confirmar» | l.475 |
| `when` | «del {date}{time ? ` a las ${time}` : ''}» | l.532 |
| `fieldList` | «los campos solicitados» | l.564 |
| `notes` | «Nota: {d.review_notes}» | l.565 |
| `notes` | «Motivo: {d.review_notes}» | l.579 |
| `link` | «El enlace de reunión está disponible en la sesión.» | l.608 |
| `winner` | «ATE ganadora: {d.ganador_nombre}.» | l.758 |
| `winner` | «ATE seleccionada: {d.ganador_nombre}.» | l.772 |
| `who` | «por {finalizer}» | l.803 |
| `audience` | «Enviada a quienes asistieron. / Enviada a la Comunidad de Crecimiento.» | l.804 |

**Other texts written in the code (safety net: not tied to an element by the script)** (89)

| Text | Where |
|---|---|
| «Nuevo curso asignado: {d.course.name}» | NOTIFICATION_EVENTS · l.242 |
| «Nuevo curso asignado» | NOTIFICATION_EVENTS · l.243 |
| «Se te ha asignado el curso "{d.course.name}". Haz clic para comenzar tu aprendizaje.» | NOTIFICATION_EVENTS · l.246 |
| «¡Curso completado!: {d.course.name}» | NOTIFICATION_EVENTS · l.256 |
| «¡Curso completado!» | NOTIFICATION_EVENTS · l.257 |
| «Has completado exitosamente el curso "{d.course.name}". ¡Felicitaciones!» | NOTIFICATION_EVENTS · l.260 |
| «Has completado un curso exitosamente.» | NOTIFICATION_EVENTS · l.261 |
| «Módulo completado: {d.module.name}» | NOTIFICATION_EVENTS · l.269 |
| «Módulo completado» | NOTIFICATION_EVENTS · l.269 |
| «el módulo» | NOTIFICATION_EVENTS · l.271 |
| «Has completado {moduleName}{courseName}.» | NOTIFICATION_EVENTS · l.273 |
| «Nueva ruta asignada: {d.learning_path.name}» | NOTIFICATION_EVENTS · l.287 |
| «Nueva ruta de aprendizaje asignada» | NOTIFICATION_EVENTS · l.288 |
| «Nueva tarea: {d.assignment.title}» | NOTIFICATION_EVENTS · l.305 |
| «Nueva tarea asignada» | NOTIFICATION_EVENTS · l.306 |
| «Tienes asignada la tarea "{title}".{dueDate}» | NOTIFICATION_EVENTS · l.312 |
| «Retroalimentación recibida: {d.assignment.title}» | NOTIFICATION_EVENTS · l.322 |
| «Has recibido retroalimentación» | NOTIFICATION_EVENTS · l.323 |
| «Una de tus tareas ha sido revisada.» | NOTIFICATION_EVENTS · l.327 |
| «Tarea próxima a vencer: {d.assignment.title}» | NOTIFICATION_EVENTS · l.336 |
| «Tarea próxima a vencer» | NOTIFICATION_EVENTS · l.337 |
| «Mensaje de {name}» | NOTIFICATION_EVENTS · l.357 |
| «Nuevo mensaje» | NOTIFICATION_EVENTS · l.357 |
| «Has recibido un nuevo mensaje.» | NOTIFICATION_EVENTS · l.362 |
| «Has sido mencionado en una conversación{workspace ? ` en "${workspa…}.» | NOTIFICATION_EVENTS · l.377 |
| «Nuevo feedback: {school}» | NOTIFICATION_EVENTS · l.391 |
| «Nuevo feedback recibido» | NOTIFICATION_EVENTS · l.391 |
| «Nuevo consultor asignado: {d.consultant.name}» | NOTIFICATION_EVENTS · l.405 |
| «Consultor asignado» | NOTIFICATION_EVENTS · l.406 |
| «QA Fallo: {d.scenario_name}» | NOTIFICATION_EVENTS · l.423 |
| «Fallo en prueba QA» | NOTIFICATION_EVENTS · l.424 |
| «{step} falló: "{d.step_instruction \|\| 'Sin …}"{tester}» | NOTIFICATION_EVENTS · l.428 |
| «Sin descripción» | NOTIFICATION_EVENTS · l.428 |
| «Nuevo escenario QA asignado» | NOTIFICATION_EVENTS · l.440 |
| «Sesión agendada: {d.session.title}» | NOTIFICATION_EVENTS · l.470 |
| «Nueva sesión agendada» | NOTIFICATION_EVENTS · l.471 |
| «Su sesión quedó agendada para {when}.» | NOTIFICATION_EVENTS · l.478 |
| «Sesión reprogramada: {d.session.title}» | NOTIFICATION_EVENTS · l.490 |
| «Sesión reprogramada» | NOTIFICATION_EVENTS · l.491 |
| «Su sesión cambió. Antes: {before}. Ahora: {after}. Actualice su calendario.» | NOTIFICATION_EVENTS · l.515 |
| «Sesión cancelada: {d.session.title}» | NOTIFICATION_EVENTS · l.527 |
| «Sesión cancelada» | NOTIFICATION_EVENTS · l.528 |
| «Su sesión{when} fue cancelada. No necesita conectarse.» | NOTIFICATION_EVENTS · l.533 |
| «Solicitud de cambio: {d.session.title}» | NOTIFICATION_EVENTS · l.545 |
| «Nueva solicitud de cambio en sesión» | NOTIFICATION_EVENTS · l.546 |
| «Cambios aprobados: {d.session.title}» | NOTIFICATION_EVENTS · l.560 |
| «Solicitud de cambio aprobada» | NOTIFICATION_EVENTS · l.561 |
| «Los cambios en {fieldList} han sido aprobados.{notes}» | NOTIFICATION_EVENTS · l.566 |
| «Cambios rechazados: {d.session.title}» | NOTIFICATION_EVENTS · l.576 |
| «Solicitud de cambio rechazada» | NOTIFICATION_EVENTS · l.577 |
| «Recordatorio: {d.session.title} mañana» | NOTIFICATION_EVENTS · l.590 |
| «Sesión programada para mañana» | NOTIFICATION_EVENTS · l.591 |
| «Tiene una sesión programada para {date}{time ? ' a las ' + time : ''}.» | NOTIFICATION_EVENTS · l.595 |
| «Sesión comienza en 1 hora» | NOTIFICATION_EVENTS · l.606 |
| «Su sesión está por comenzar.{link}» | NOTIFICATION_EVENTS · l.609 |
| «Nueva licitacion: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.623 |
| «Nueva licitacion creada» | NOTIFICATION_EVENTS · l.624 |
| «Publicacion registrada: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.635 |
| «Publicacion registrada» | NOTIFICATION_EVENTS · l.636 |
| «Manana vence plazo de bases: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.647 |
| «Manana vence plazo de solicitud de bases» | NOTIFICATION_EVENTS · l.648 |
| «Hoy vence plazo de bases: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.659 |
| «Hoy vence plazo de solicitud de bases» | NOTIFICATION_EVENTS · l.660 |
| «Manana vence plazo de consultas: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.671 |
| «Manana vence plazo de consultas» | NOTIFICATION_EVENTS · l.672 |
| «Hoy vence plazo de consultas: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.683 |
| «Hoy vence plazo de consultas» | NOTIFICATION_EVENTS · l.684 |
| «Ventana de propuestas abierta: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.695 |
| «Ventana de propuestas abierta» | NOTIFICATION_EVENTS · l.696 |
| «Manana vence plazo de propuestas: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.707 |
| «Manana vence plazo de propuestas» | NOTIFICATION_EVENTS · l.708 |
| «Hoy vence plazo de propuestas: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.719 |
| «Hoy vence plazo de propuestas» | NOTIFICATION_EVENTS · l.720 |
| «Evaluacion iniciada: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.731 |
| «Periodo de evaluacion iniciado» | NOTIFICATION_EVENTS · l.732 |
| «Manana vence plazo de evaluacion: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.743 |
| «Manana vence plazo de evaluacion» | NOTIFICATION_EVENTS · l.744 |
| «Evaluacion completada: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.755 |
| «Evaluacion completada» | NOTIFICATION_EVENTS · l.756 |
| «Licitacion adjudicada: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.769 |
| «Licitacion adjudicada» | NOTIFICATION_EVENTS · l.770 |
| «Contrato generado: {d.numero_licitacion}» | NOTIFICATION_EVENTS · l.783 |
| «Contrato generado» | NOTIFICATION_EVENTS · l.784 |
| «Reunión finalizada: {title}» | NOTIFICATION_EVENTS · l.799 |
| «Reunión finalizada» | NOTIFICATION_EVENTS · l.799 |
| «La reunión "{bounded(d.title, PREVIEW_MA…}" fue finalizada{who}.{audience}» | NOTIFICATION_EVENTS · l.808 |
| «sin título» | NOTIFICATION_EVENTS · l.808 |
| «Actualización del sistema» | NOTIFICATION_EVENTS · l.820 |
| «Hay una nueva actualización disponible en la plataforma.» | NOTIFICATION_EVENTS · l.822 |

### lib/notifications/catalog.ts

Used by: `/configuracion/notificaciones`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `CATEGORY_LABELS` | «Cursos y aprendizaje», «Tareas y evaluaciones», «Comunidad y menciones», «Sesiones de consultoría», «Asesoría», «Licitaciones», «QA y soporte», «Sistema» | l.29 |

### types/roles.ts

Used by: `/notifications`

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

Used by: `/notifications`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/notification-analytics` | `pages/api/admin/notification-analytics.ts` | GET | **no screen** |  |
| `/api/admin/notification-types` | `pages/api/admin/notification-types.ts` | GET | `/admin/configuration` | `__tests__/notifications/entry-points.test.tsx`, `pages/admin/configuration.tsx` |
| `/api/notifications/[id]/read` | `pages/api/notifications/[id]/read.ts` | POST | `/pending-approval` | `__tests__/components/layout/Header.notification-bell.test.tsx`, `components/notifications/NotificationBell.tsx` |
| `/api/notifications` | `pages/api/notifications/index.ts` | GET | `/pending-approval` | `__tests__/components/layout/Header.notification-bell.test.tsx`, `components/notifications/NotificationBell.tsx` |
| `/api/notifications/mark-all-read` | `pages/api/notifications/mark-all-read.ts` | POST | `/pending-approval` | `__tests__/components/layout/Header.notification-bell.test.tsx`, `components/notifications/NotificationBell.tsx` |
| `/api/notifications/mark-read` | `pages/api/notifications/mark-read.ts` | POST | **no screen** |  |
| `/api/notifications/unsubscribe` | `pages/api/notifications/unsubscribe.ts` | GET, POST | `/notificaciones/baja` | `__tests__/api/notifications/unsubscribe.test.ts`, `__tests__/lib/email/notification-unsubscribe.test.ts`, `__tests__/lib/email/outbox.test.ts`, `lib/email/notification-unsubscribe.ts`, `pages/notificaciones/baja.tsx` +1 |
| `/api/user/notification-preferences` | `pages/api/user/notification-preferences.ts` | GET, PUT | `/configuracion/notificaciones` | `__tests__/api/notification-preferences.test.ts`, `__tests__/notifications/entry-points.test.tsx`, `__tests__/pages/notification-settings.test.tsx`, `pages/configuracion/notificaciones.tsx`, `tests/e2e/notification-preferences-api.spec.ts` +1 |
| `/api/webhooks/resend` | `pages/api/webhooks/resend.ts` | POST | **no screen** | `__tests__/api/webhooks/resend.test.ts`, `tests/e2e/notification-bounce.spec.ts` |

