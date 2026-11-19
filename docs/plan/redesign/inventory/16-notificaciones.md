# Notificaciones

Area `16-notificaciones`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `ca9dad512` (2026-11-19).

6 screen files, 10 API files, 20 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/configuracion/apariencia` | `pages/configuracion/apariencia.tsx` | 196 | — |  |
| `/configuracion` | `pages/configuracion/index.tsx` | 14 | — |  |
| `/configuracion/notificaciones` | `pages/configuracion/notificaciones.tsx` | 451 | — |  |
| `/configuracion/piezas` | `pages/configuracion/piezas.tsx` | 555 | — |  |
| `/notificaciones/baja` | `pages/notificaciones/baja.tsx` | 192 | — |  |
| `/notifications` | `pages/notifications.tsx` | 656 | — |  |

## /configuracion/apariencia

File `pages/configuracion/apariencia.tsx` · 196 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.41 `server redirect → /login?next=[*]  (when !viewer)`
- Linked from: `pages/configuracion/notificaciones.tsx:442`, `pages/configuracion/piezas.tsx:225`, `pages/configuracion/piezas.tsx:398`
- Tests: browser tests that CI runs: `tests/e2e/look-frame.spec.ts`, `tests/e2e/look-kit.spec.ts`, `tests/e2e/look-panel.spec.ts`, `tests/e2e/look-switch.spec.ts`; unit tests of the page: `__tests__/pages/apariencia.test.tsx`.

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

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando… / Guardar cambios» (submits the form) |  |  | `{saving \|\| choice === saved}` | `testid=look-save` | AparienciaPage · l.152 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Inicia sesión nuevamente» | `{LOGIN_AGAIN}` | `notice?.kind === 'expired'` |  | AparienciaPage · l.169 |
| «Notificaciones por correo» | `{SETTINGS}` |  | `testid=look-to-notifications` | AparienciaPage · l.183 |
| «Piezas de la interfaz» | `/configuracion/piezas` |  | `testid=look-to-kit` | AparienciaPage · l.188 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{option.label} {option.detail}» | radio | `look` |  | `each OPTIONS` | `testid=look-option-{option.value} id=look-option-{option.value}` | AparienciaPage · l.127 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); void save(); }}` |  | AparienciaPage · l.114 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «expired / Tu sesión terminó.» | `setNotice` | `res.status === 401` | save · l.92 |
| «saved / Tu preferencia se guardó.» | `setNotice` | `!(res.status === 401) && (!(!res.ok \|\| !isLook(body?.look)))` | save · l.99 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | getServerSideProps · l.41 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | getServerSideProps · l.47 |
| `{SETTINGS}` | `server redirect` | `profile.error \|\| !mayChooseLook(profile.data)` | getServerSideProps · l.57 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `saving` | AparienciaPage · l.136 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Apariencia · breadcrumbs: Configuración / Apariencia |  |  | AparienciaPage · l.109 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `SAVE_ERROR` | «No pudimos guardar tu apariencia. Intenta nuevamente.» | l.26 |
| `OPTIONS` | «Diseño actual», «La plataforma tal como se ve hoy.», «Diseño nuevo (en construcción)», «El rediseño de la plataforma. Se irá activando por partes; mientras tanto puede verse igual al actual.» | l.28 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (6)

| Kind | What | Where |
|---|---|---|
| mark | `testid=look-settings` | AparienciaPage · l.110 |
| role | `role=status aria-live=polite` | AparienciaPage · l.155 |
| mark | `testid=look-saved` | AparienciaPage · l.157 |
| mark | `testid=look-save-error` | AparienciaPage · l.162 |
| mark | `testid=look-expired` | AparienciaPage · l.167 |
| mark | `testid=look-unsaved` | AparienciaPage · l.175 |

**Values shown from data** (2)

- `{notice.text}` — AparienciaPage · l.157, when `notice?.kind === 'saved'`
- `{notice.text}` — AparienciaPage · l.162, when `notice?.kind === 'error'`

**Other texts on screen** (4)

- «Elige cómo se ve la plataforma para tu cuenta. El cambio solo te afecta a ti y puedes volver atrás cuando quieras.» — AparienciaPage · l.112
- «Diseño de la plataforma» (label) — AparienciaPage · l.121
- «{option.label} {option.detail}» (label) — AparienciaPage · l.142, when `each OPTIONS`
- «Tienes cambios sin guardar.» — AparienciaPage · l.176, when `!notice && choice !== saved`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/look.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/user/look` | ? | `pages/configuracion/apariencia.tsx:23` |

## /configuracion

File `pages/configuracion/index.tsx` · 14 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `lib/auth/forced-password-change.ts:135`, `middleware.ts:336`
- Tests: browser tests that CI runs: `tests/e2e/look-switch.spec.ts`, `tests/e2e/notification-settings.spec.ts`; unit tests of the page: `__tests__/pages/notification-settings.test.tsx`.

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
| `/configuracion/notificaciones` | `server redirect` |  | getServerSideProps · l.8 |

## /configuracion/notificaciones

File `pages/configuracion/notificaciones.tsx` · 451 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.121 `server redirect → /login?next=[*]  (when !viewer)`
- Linked from: `components/notifications/ModernNotificationCenter.tsx:475`, `components/notifications/ModernNotificationCenter.tsx:476`, `components/notifications/NotificationDropdown.tsx:187`, `components/notifications/NotificationDropdown.tsx:188`, `lib/email/notifications.ts:30`, `pages/admin/configuration.tsx:396`, `pages/admin/configuration.tsx:397`, `pages/configuracion/apariencia.tsx:24`, `pages/configuracion/index.tsx:8`, `pages/configuracion/piezas.tsx:397`, `pages/configuracion/piezas.tsx:55`, `pages/notifications.tsx:384` and 2 more
- Tests: browser tests that CI runs: `tests/e2e/look-kit.spec.ts`, `tests/e2e/look-switch.spec.ts`, `tests/e2e/notification-settings.spec.ts`; unit tests of the page: `__tests__/pages/notification-settings.test.tsx`.

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
| «Recargar» | `{() => window.location.reload()}` | `status === 'session_changed'` |  | `testid=ns-reload` | NotificationSettingsPage · l.277 |
| «Reintentar» | `{() => (categories ? void load() : window.location.reload())}` | `!(status === 'session_changed') && !(status === 'expired') && status === 'error'` |  | `testid=ns-retry` | NotificationSettingsPage · l.295 |
| «Guardando… / Guardar cambios» (submits the form) |  | `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)` | `{saving \|\| changes.length === 0}` | `testid=ns-save` | NotificationSettingsPage · l.414 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Inicia sesión nuevamente» | `{LOGIN_AGAIN}` | `!(status === 'session_changed') && status === 'expired'` |  | NotificationSettingsPage · l.286 |
| «Apariencia» | `/configuracion/apariencia` | `canChooseLook` | `testid=ns-to-look` | NotificationSettingsPage · l.442 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{saved.label}» | select | disabled: `{saving}` | «{MODE_LABELS.default}», «{MODE_LABELS.immediate}», «{MODE_LABELS.digest}», «{STORED_UNAVAILABLE}», «{MODE_LABELS.off}» | `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown` | `testid=ns-mode-{section.category} id=ns-mode-{section.category}` | NotificationSettingsPage · l.360 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); void save(); }}` | `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)` | NotificationSettingsPage · l.325 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «saved / Tus preferencias se guardaron.» | `setNotice` |  | save · l.264 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | getServerSideProps · l.121 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | getServerSideProps · l.127 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `id !== request.current` | NotificationSettingsPage · l.212 |
| `sessionLoading \|\| sessionError \|\| sessionUserId === ownerId` | NotificationSettingsPage · l.229 |
| `!event` | NotificationSettingsPage · l.395 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Notificaciones por correo · breadcrumbs: Configuración / Notificaciones |  |  | NotificationSettingsPage · l.434 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `PRODUCER_EVENT_LABELS` | «Invitación a un grupo», «Entrega de tarea grupal», «Quiz pendiente de revisión», «Quiz revisado», «Alerta de calidad de datos» | l.89 |
| `READ_ERROR` | «No pudimos cargar tus preferencias.» | l.149 |
| `SAVE_ERROR` | «No pudimos guardar tus preferencias. Intenta nuevamente.» | l.150 |
| `MODE_LABELS` | «Predeterminado», «Inmediato», «Resumen diario», «Desactivado» | l.152 |
| `STORED_UNAVAILABLE` | «Opción anterior (se envía de inmediato)» | l.160 |
| `DELIVERY_LABELS` | «Se envía de inmediato», «Va en el resumen diario», «No se envía» | l.162 |
| `ADDRESS_NOTICES` | «No podemos enviarte correos: tu dirección rechazó mensajes anteriores. Escribe a soporte para revisarla; mientras tanto no recibirás avisos por correo.», «Tu dirección de correo recibe nuestros avisos con normalidad.», «No pudimos comprobar si tu dirección de correo recibe nuestros avisos.» | l.168 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (20)

| Kind | What | Where |
|---|---|---|
| role | `role=alert` | NotificationSettingsPage · l.275 |
| mark | `testid=ns-session-changed` | NotificationSettingsPage · l.275 |
| role | `role=alert` | NotificationSettingsPage · l.284 |
| mark | `testid=ns-expired` | NotificationSettingsPage · l.284 |
| role | `role=alert` | NotificationSettingsPage · l.293 |
| mark | `testid=ns-error` | NotificationSettingsPage · l.293 |
| role | `role=status` | NotificationSettingsPage · l.307 |
| mark | `testid=ns-loading` | NotificationSettingsPage · l.307 |
| mark | `testid=ns-empty` | NotificationSettingsPage · l.313 |
| mark | `testid=ns-address-{view.address_suppression}` | NotificationSettingsPage · l.331 |
| mark | `testid=ns-digest-note` | NotificationSettingsPage · l.334 |
| mark | `testid=ns-mandatory` | NotificationSettingsPage · l.340 |
| mark | `testid=ns-category-{section.category}` | NotificationSettingsPage · l.355 |
| mark | `testid=ns-stored-digest-{section.category}` | NotificationSettingsPage · l.383 |
| mark | `testid=ns-event-{event.event_type}` | NotificationSettingsPage · l.397 |
| mark | `testid=ns-legacy-{event.event_type}` | NotificationSettingsPage · l.402 |
| role | `role=status aria-live=polite` | NotificationSettingsPage · l.417 |
| mark | `testid={notice.kind === 'saved' ? 'ns-saved' : 'ns-save-error'}` | NotificationSettingsPage · l.419 |
| mark | `testid=ns-unsaved` | NotificationSettingsPage · l.423 |
| mark | `testid=notification-settings` | NotificationSettingsPage · l.435 |

**Values shown from data** (5)

- `{READ_ERROR}` — NotificationSettingsPage · l.294, when `!(status === 'session_changed') && !(status === 'expired') && status === 'error'`
- `{ADDRESS_NOTICES[view.address_suppre…}` — NotificationSettingsPage · l.331, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)`
- `{labelOf(e.event_type)}` — NotificationSettingsPage · l.344, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && mandatory.length > 0 && each mandatory`
- `{applicable.label}` — NotificationSettingsPage · l.398, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && each section.events`
- `{notice.text}` — NotificationSettingsPage · l.419, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && notice`

**Other texts on screen** (13)

- «Tu sesión cambió en otra pestaña. Recarga la página para ver tus preferencias.» — NotificationSettingsPage · l.276, when `status === 'session_changed'`
- «Tu sesión terminó.» — NotificationSettingsPage · l.285, when `!(status === 'session_changed') && status === 'expired'`
- «Cargando tus preferencias…» — NotificationSettingsPage · l.308, when `!(status === 'session_changed') && !(status === 'expired') && !(status === 'error') && (status === 'loading' \|\| !view)`
- «Tu cuenta no tiene avisos por correo que configurar.» — NotificationSettingsPage · l.314, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && shown.length === 0`
- «Resumen diario: los avisos se agrupan en un correo al día. Por ahora no puedes elegir la hora de envío. / El resumen diario todavía no está disponible: los avisos que irían en un resumen se envían de inmediato.» — NotificationSettingsPage · l.334, when `!(status === 'expired') && !(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0)`
- «Estos avisos se envían siempre, aunque desactives su categoría:» — NotificationSettingsPage · l.341, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && mandatory.length > 0`
- «{saved.label}» (label) — NotificationSettingsPage · l.357, when `!(status === 'error') && (!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown`
- «Elegiste Resumen diario antes. Mientras no esté disponible, estos avisos se envían de inmediato.» — NotificationSettingsPage · l.384, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && !digest && saved.email_mode === 'digest'`
- «Con Predeterminado se mantienen apagados los avisos que desactivaste antes.» — NotificationSettingsPage · l.389, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && legacy`
- «Se envía siempre» — NotificationSettingsPage · l.400, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && each shown && each section.events`
- «· desactivado por una preferencia anterior» — NotificationSettingsPage · l.402, when `!(shown.length === 0) && each shown && each section.events && event.reason === 'legacy_suppressed'`
- «Tienes cambios sin guardar.» — NotificationSettingsPage · l.424, when `(!(status === 'loading' \|\| !view)) && !(shown.length === 0) && !(notice) && changes.length > 0`
- «Elige cómo recibir por correo los avisos de cada tema. Los avisos dentro de la plataforma no cambian.» — NotificationSettingsPage · l.437

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/notificationEvents.ts`
- `lib/notifications/catalog.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/user/notification-preferences` | ? | `pages/configuracion/notificaciones.tsx:147` |

## /configuracion/piezas

File `pages/configuracion/piezas.tsx` · 555 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.61 `server redirect → /login?next=[*]  (when !viewer)`
- Linked from: `pages/configuracion/apariencia.tsx:188`
- Tests: browser tests that CI runs: `tests/e2e/look-kit.spec.ts`; unit tests of the page: `__tests__/pages/piezas.test.tsx`.

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
| «{title}» | h2 |  | Section · l.131 |

**Tabs** (4)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «Detalles» |  |  | PiezasPage · l.372 |
| «Materiales» |  |  | PiezasPage · l.375 |
| «Informe» |  |  | PiezasPage · l.378 |
| «Actividad» |  |  | PiezasPage · l.381 |

**Buttons** (20)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Continuar lección» |  |  |  | `testid=kit-btn-primary` | PiezasPage · l.183 |
| «Nuevo usuario» |  |  |  | `testid=kit-btn-default` | PiezasPage · l.186 |
| «Cancelar» |  |  |  | `testid=kit-btn-outline` | PiezasPage · l.190 |
| «Exportar» |  |  |  | `testid=kit-btn-quiet` | PiezasPage · l.193 |
| «Eliminar» |  |  |  | `testid=kit-btn-danger` | PiezasPage · l.197 |
| «Rechazar» |  |  |  | `testid=kit-btn-danger-outline` | PiezasPage · l.201 |
| «Deshabilitado» |  |  | `true` | `testid=kit-btn-primary-disabled` | PiezasPage · l.206 |
| «Deshabilitado» |  |  | `true` | `testid=kit-btn-disabled` | PiezasPage · l.209 |
| «Guardando…» |  |  |  | `testid=kit-btn-loading` | PiezasPage · l.212 |
| «Pequeño» |  |  |  | `testid=kit-btn-small` | PiezasPage · l.215 |
| «Editar» |  |  |  | `testid=kit-btn-small-outline` | PiezasPage · l.218 |
| «[icon MoreHorizontal]» · aria «Más acciones» |  |  |  | `testid=kit-btn-icon` | PiezasPage · l.222 |
| «Ir a Apariencia» |  |  |  | `testid=kit-btn-link` | PiezasPage · l.225 |
| «Abrir ventana» | `{() => setDialogOpen(true)}` |  |  | `testid=kit-open-dialog` | PiezasPage · l.279 |
| «Abrir confirmación» | `{() => void ask(false)}` |  |  | `testid=kit-open-confirm` | PiezasPage · l.282 |
| «Confirmación de eliminar» | `{() => void ask(true)}` |  |  | `testid=kit-open-confirm-danger` | PiezasPage · l.285 |
| «Ver sesión» |  |  |  | `testid=kit-card-leading-action` | PiezasPage · l.448 |
| «Ver todas» |  |  |  | `testid=kit-empty-action` | PiezasPage · l.481 |
| «Cancelar» | `{() => setDialogOpen(false)}` |  |  | `testid=kit-dialog-cancel` | PiezasPage · l.527 |
| «Asignar rol» | `{() => setDialogOpen(false)}` |  |  | `testid=kit-dialog-save` | PiezasPage · l.530 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `Card` | «En progreso Aprendizaje basado en proyectos 8 lecciones · 62% completado» | `{() => setCardClicks((n) => n + 1)}` |  | PiezasPage · l.428 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre de la sesión» | text | «Nombre de la sesión» |  |  | `testid=kit-field-name` | PiezasPage · l.234 |
|  | email |  |  |  | `testid=kit-field-email` | PiezasPage · l.237 |
|  | select |  |  |  | `testid=kit-field-school` | PiezasPage · l.240 |
|  | text |  |  |  | `testid=kit-field-disabled` | PiezasPage · l.258 |
|  | textarea |  |  |  | `testid=kit-field-description` | PiezasPage · l.261 |
|  | checkbox |  |  |  | `testid=kit-field-checkbox` | PiezasPage · l.271 |
|  | switch |  |  |  | `testid=kit-field-switch` | PiezasPage · l.272 |
|  | select |  |  |  | `testid=kit-dialog-role` | PiezasPage · l.537 |
|  | select |  |  |  | `testid=kit-dialog-school` | PiezasPage · l.544 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{dialogOpen}` | eyebrow: Usuarios · title: Gestión de roles · description: Participante A · participante.a@example.com | PiezasPage · l.518 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Eliminar este curso? / Esta acción no se puede deshacer. Es solo una muestra: nada se elimina. / danger / Eliminar / ¿Enviar el registro? / Una vez enviado no podrás modificar tus respuestas. Es solo una muestra: nada se envía. / Sí, enviar / Confirmar» |  | ask · l.158 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | getServerSideProps · l.61 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | getServerSideProps · l.67 |
| `{SETTINGS}` | `server redirect` | `profile.error \|\| !mayChooseLook(profile.data)` | getServerSideProps · l.77 |

**Pieces placed here, with the texts and settings handed to them** (89)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Piezas de la interfaz · breadcrumbs: Configuración / Piezas de la interfaz |  |  | PiezasPage · l.177 |
| `Section` | title: Botones |  | `id=buttons` | PiezasPage · l.181 |
| `ArrowRight` | aria-hidden: true |  |  | PiezasPage · l.184 |
| `Plus` | aria-hidden: true |  |  | PiezasPage · l.187 |
| `Download` | aria-hidden: true |  |  | PiezasPage · l.194 |
| `Trash2` | aria-hidden: true |  |  | PiezasPage · l.198 |
| `Pencil` | aria-hidden: true |  |  | PiezasPage · l.219 |
| `MoreHorizontal` | aria-hidden: true |  |  | PiezasPage · l.223 |
| `Section` | title: Campos |  | `id=fields` | PiezasPage · l.231 |
| `Field` | label: Nombre · help: Así la verán los docentes en su calendario. |  |  | PiezasPage · l.233 |
| `Field` | label: Correo electrónico · error: Ingresa un correo válido. |  |  | PiezasPage · l.236 |
| `Field` | label: Colegio |  |  | PiezasPage · l.239 |
| `Field` | label: Buscar |  |  | PiezasPage · l.249 |
| `SearchInput` | placeholder: Buscar por nombre o correo... |  | `testid=kit-field-search` | PiezasPage · l.250 |
| `Field` | label: Campo bloqueado |  |  | PiezasPage · l.257 |
| `Field` | label: Descripción · help: Un texto largo, en varias líneas. |  |  | PiezasPage · l.260 |
| `Field` | label: Modalidad |  |  | PiezasPage · l.266 |
| `Radio` | label: Presencial |  | `testid=kit-field-radio-presencial` | PiezasPage · l.267 |
| `Radio` | label: En línea |  | `testid=kit-field-radio-en-linea` | PiezasPage · l.268 |
| `Field` | label: Opciones |  |  | PiezasPage · l.270 |
| `Section` | title: Ventana y confirmación |  | `id=dialogs` | PiezasPage · l.277 |
| `Section` | title: Tabla |  | `id=table` | PiezasPage · l.298 |
| `Table` | aria-label: Participantes de ejemplo |  | `testid=kit-table` | PiezasPage · l.299 |
| `Pagination` | noun: participantes |  | `testid=kit-pagination` | PiezasPage · l.304 |
| `TableHead` |  |  |  | PiezasPage · l.314 |
| `TableRow` |  |  |  | PiezasPage · l.315 |
| `TableHeaderCell` |  |  |  | PiezasPage · l.316 |
| `TableHeaderCell` |  |  |  | PiezasPage · l.319 |
| `TableHeaderCell` |  |  |  | PiezasPage · l.320 |
| `TableHeaderCell` |  |  |  | PiezasPage · l.321 |
| `TableHeaderCell` |  |  |  | PiezasPage · l.322 |
| `TableHeaderCell` |  |  | `testid=kit-sort-progress` | PiezasPage · l.323 |
| `TableBody` |  |  |  | PiezasPage · l.336 |
| `TableRow` |  | `each shown` | `testid=kit-row-{row.id}` | PiezasPage · l.338 |
| `TableCell` | label: Seleccionar | `each shown` |  | PiezasPage · l.339 |
| `Radio` |  | `each shown` | `testid=kit-select-{row.id}` | PiezasPage · l.340 |
| `TableCell` | label: Participante | `each shown` |  | PiezasPage · l.349 |
| `TableCell` | label: Colegio | `each shown` |  | PiezasPage · l.352 |
| `TableCell` | label: Rol | `each shown` |  | PiezasPage · l.353 |
| `TableCell` | label: Estado | `each shown` |  | PiezasPage · l.354 |
| `Badge` |  | `each shown` |  | PiezasPage · l.355 |
| `TableCell` | label: Avance | `each shown` | `testid=kit-progress-{row.id}` | PiezasPage · l.357 |
| `Section` | title: Pestañas |  | `id=tabs` | PiezasPage · l.367 |
| `Card` |  |  |  | PiezasPage · l.368 |
| `Tabs` |  |  |  | PiezasPage · l.369 |
| `TabList` | label: Secciones de la sesión |  | `testid=kit-tabs` | PiezasPage · l.371 |
| `Count` | label: 3 materiales |  |  | PiezasPage · l.376 |
| `TabPanel` |  | `each (Object.keys(TAB_TEXT) as TabValue[])` | `testid=kit-tabpanel-{value}` | PiezasPage · l.387 |
| `TabLinks` | label: Páginas de configuración · items: Notificaciones / Apariencia / Piezas de la interfaz |  | `testid=kit-tablinks` | PiezasPage · l.393 |
| `Section` | title: Insignias |  | `id=badges` | PiezasPage · l.404 |
| `Badge` |  | `each BADGES` | `testid=kit-badge-{badge.tone}` | PiezasPage · l.407 |
| `Badge` | tone: neutral |  | `testid=kit-badge-plain` | PiezasPage · l.411 |
| `Count` | label: 7 notificaciones sin leer |  | `testid=kit-count` | PiezasPage · l.414 |
| `Section` | title: Tarjetas |  | `id=cards` | PiezasPage · l.418 |
| `Card` |  |  | `testid=kit-card-plain` | PiezasPage · l.420 |
| `CardBody` |  |  |  | PiezasPage · l.421 |
| `Card` |  |  | `testid=kit-card-interactive` | PiezasPage · l.428 |
| `CardBody` |  |  |  | PiezasPage · l.429 |
| `Badge` | tone: info |  |  | PiezasPage · l.430 |
| `CardTitle` |  |  |  | PiezasPage · l.431 |
| `Card` |  |  | `testid=kit-card-leading` | PiezasPage · l.439 |
| `CardHeader` |  |  |  | PiezasPage · l.440 |
| `CardTitle` |  |  |  | PiezasPage · l.441 |
| `Badge` |  |  |  | PiezasPage · l.442 |
| `CardBody` |  |  |  | PiezasPage · l.444 |
| `CardFooter` |  |  |  | PiezasPage · l.447 |
| `Section` | title: Avisos |  | `id=notices` | PiezasPage · l.456 |
| `Notice` | title: Borrador guardado. |  | `testid=kit-notice-neutral` | PiezasPage · l.458 |
| `Notice` | tone: success · title: Registro enviado. |  | `testid=kit-notice-success` | PiezasPage · l.461 |
| `Notice` | tone: warning · title: Solo lectura. |  | `testid=kit-notice-warning` | PiezasPage · l.464 |
| `Notice` | tone: error · title: No se pudo cargar. |  | `testid=kit-notice-error` | PiezasPage · l.467 |
| `Section` | title: Vacío y carga |  | `id=states` | PiezasPage · l.473 |
| `Card` |  |  |  | PiezasPage · l.475 |
| `EmptyState` | title: Sin notificaciones · description: Te avisaremos cuando tengas algo nuevo. |  | `testid=kit-empty` | PiezasPage · l.476 |
| `Card` |  |  |  | PiezasPage · l.487 |
| `CardBody` |  |  | `testid=kit-skeleton` | PiezasPage · l.488 |
| `Skeleton` |  |  |  | PiezasPage · l.489 |
| `Skeleton` |  |  |  | PiezasPage · l.490 |
| `Skeleton` |  |  |  | PiezasPage · l.491 |
| `Skeleton` |  |  |  | PiezasPage · l.492 |
| `Skeleton` |  |  |  | PiezasPage · l.493 |
| `Card` |  |  |  | PiezasPage · l.496 |
| `LoadingBlock` |  |  | `testid=kit-loading` | PiezasPage · l.497 |
| `Section` | title: Cabecera de página |  | `id=header` | PiezasPage · l.502 |
| `Card` |  |  |  | PiezasPage · l.503 |
| `CardBody` |  |  |  | PiezasPage · l.504 |
| `PageHeader` | eyebrow: Usuarios · title: Encabezado de ejemplo · description: Una línea que dice para qué sirve la página. · secondaryAction: Exportar · primaryAction: Nuevo usuario |  | `testid=kit-page-header` | PiezasPage · l.505 |
| `Field` | label: Rol |  |  | PiezasPage · l.536 |
| `Field` | label: Colegio |  |  | PiezasPage · l.543 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (5)

| Name | Texts | Where |
|---|---|---|
| `SCHOOLS` | «Colegio Ejemplo Norte», «Escuela Ejemplo Sur», «Liceo Ejemplo Centro» | l.91 |
| `ROLES` | «Docente», «Equipo directivo», «Consultor» | l.92 |
| `STATES` | «Activo», «Pendiente», «Rechazado» | l.93 |
| `BADGES` | «Borrador», «Completada», «Pendiente», «Cancelada», «En progreso», «Nuevo» | l.111 |
| `TAB_TEXT` | «Contenido de «Detalles»: fecha, lugar y objetivos de la sesión.», «Contenido de «Materiales»: tres documentos de ejemplo.», «Contenido de «Informe»: el resumen que se escribe al terminar.», «Contenido de «Actividad»: los cambios recientes.» | l.121 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Confirmado» | PiezasPage · l.173 |
| «Cancelado» | PiezasPage · l.173 |
| «Enviar recordatorio por correo» | PiezasPage · l.271 |
| «Notificaciones activas» | PiezasPage · l.272 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (6)

| Kind | What | Where |
|---|---|---|
| mark | `testid=kit-section-{id}` | Section · l.130 |
| mark | `testid=kit-page` | PiezasPage · l.178 |
| role | `role=status aria-live=polite` | PiezasPage · l.288 |
| mark | `testid=kit-confirm-result` | PiezasPage · l.291 |
| role | `role=status aria-live=polite` | PiezasPage · l.435 |
| mark | `testid=kit-card-clicks` | PiezasPage · l.435 |

**Values shown from data** (8)

- `{answer}` — PiezasPage · l.291, when `answer`
- `{row.name}` — PiezasPage · l.349, when `each shown`
- `{row.school}` — PiezasPage · l.352, when `each shown`
- `{row.role}` — PiezasPage · l.353, when `each shown`
- `{row.state.word}` — PiezasPage · l.355, when `each shown`
- `{row.progress}%` — PiezasPage · l.357, when `each shown`
- `{TAB_TEXT[value]}` — PiezasPage · l.388, when `each (Object.keys(TAB_TEXT) as TabValue[])`
- `{badge.word}` — PiezasPage · l.407, when `each BADGES`

**Other texts on screen** (28)

- «Muestras de las piezas del diseño. Nada de lo que hagas aquí se guarda.» — PiezasPage · l.179
- «Respuesta:» — PiezasPage · l.291, when `answer`
- «Seleccionar» — PiezasPage · l.317, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Participante» — PiezasPage · l.319
- «Colegio» — PiezasPage · l.320
- «Rol» — PiezasPage · l.321
- «Estado» — PiezasPage · l.322
- «Avance» — PiezasPage · l.332
- «Seleccionar a {row.name}» — PiezasPage · l.345, when `each shown`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «En un teléfono cada fila se vuelve una ficha. Angosta la ventana para verlo.» — PiezasPage · l.364
- «Detalles» — PiezasPage · l.373
- «Materiales» — PiezasPage · l.376
- «Informe» — PiezasPage · l.379
- «Actividad» — PiezasPage · l.382
- «Docente» — PiezasPage · l.412
- «Educadores activos» — PiezasPage · l.422
- «En la escuela de ejemplo, últimos 30 días» — PiezasPage · l.424
- «En progreso» — PiezasPage · l.430
- «Aprendizaje basado en proyectos» — PiezasPage · l.431
- «8 lecciones · 62% completado» — PiezasPage · l.432
- «Tarjeta pulsada {cardClicks} {cardClicks === 1 ? 'vez' : …}.» — PiezasPage · l.435
- «Próxima sesión» — PiezasPage · l.441
- «Programada» — PiezasPage · l.442
- «Jueves 19 de noviembre, 15:30 · Comunidad de ejemplo» — PiezasPage · l.445
- «Puedes seguir más tarde desde donde quedaste.» — PiezasPage · l.459
- «Tus respuestas ya están disponibles para el equipo directivo.» — PiezasPage · l.462
- «Esta sesión ya fue completada y no admite cambios.» — PiezasPage · l.465
- «Revisa tu conexión e intenta de nuevo.» — PiezasPage · l.468

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ui/kit/Badge.tsx`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `components/ui/kit/Tabs.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`

## /notificaciones/baja

File `pages/notificaciones/baja.tsx` · 192 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/email/notification-unsubscribe.ts:30`, `lib/look.ts:117`
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

File `pages/notifications.tsx` · 656 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.112 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.132 `router.push → /login?next=[*]  (when !(session) && session === null)`
  - l.260 `router.push → /dashboard  (when notification.related_url)`
- Linked from: `components/DynamicFavicon.tsx:28`, `components/notifications/ModernNotificationCenter.tsx:604`, `components/notifications/NotificationDropdown.tsx:174`, `lib/auth/forced-password-change.ts:155`, `lib/email/notifications.ts:27`, `middleware.ts:356`
- Tests: browser tests that CI runs: `tests/e2e/notification-settings.spec.ts`; browser tests CI skips: `tests/e2e/messaging-notifications.spec.ts`; unit tests of the page: `__tests__/notifications/entry-points.test.tsx`, `__tests__/pages/notifications.direct-open.test.tsx`.

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
| «Todas las Notificaciones» | h1 |  | NotificationsPage · l.378 |
| «No hay notificaciones» | h3 | `paginatedNotifications.length === 0` | NotificationsPage · l.486 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshIcon]» · tooltip «Refrescar» | `{handleRefresh}` |  | `{refreshing}` |  | NotificationsPage · l.387 |
| «[icon FilterIcon]» · tooltip «Filtros» | `{() => setShowFilters(!showFilters)}` |  |  |  | NotificationsPage · l.390 |
| «Marcar como leídas» | `{() => handleMarkAsRead(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.456 |
| «Marcar como no leídas» | `{() => handleMarkAsUnread(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.463 |
| «Eliminar» | `{() => handleDeleteClick(Array.from(selectedNotifications))}` | `selectedNotifications.size > 0` |  |  | NotificationsPage · l.470 |
| «Anterior» | `{() => setCurrentPage(prev => Math.max(1, prev - 1))}` | `!(paginatedNotifications.length === 0) && totalPages > 1` | `{currentPage === 1}` |  | NotificationsPage · l.617 |
| «Siguiente» | `{() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}` | `!(paginatedNotifications.length === 0) && totalPages > 1` | `{currentPage === totalPages}` |  | NotificationsPage · l.629 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon CogIcon]» · aria «Configuración de notificaciones» | `/configuracion/notificaciones` |  | `testid=notifications-page-settings` | NotificationsPage · l.384 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{notification.title} [{notification.description}] {getRelativeTime(notification.create…} [{getCategoryName(notification…» | `{() => handleNotificationClick(notification)}` | `!(paginatedNotifications.length === 0) && each paginatedNotifications` | NotificationsPage · l.551 |

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar notificaciones...» | text | «Buscar notificaciones...» |  | `showFilters` |  | NotificationsPage · l.403 |
|  | select |  | «Todas las categorías», «Administración», «Tareas», «Cursos», «Mensajes», «Social», «Feedback», «Sistema», «Workspace» | `showFilters` |  | NotificationsPage · l.411 |
|  | select |  | «Todas», «No leídas», «Leídas» | `showFilters` |  | NotificationsPage · l.426 |
|  | select |  | «Todo el tiempo», «Hoy», «Última semana», «Último mes» | `showFilters` |  | NotificationsPage · l.435 |
| «Seleccionar todas» | checkbox |  |  | `!(paginatedNotifications.length === 0)` |  | NotificationsPage · l.501 |
|  | checkbox |  |  | `!(paginatedNotifications.length === 0) && each paginatedNotifications` |  | NotificationsPage · l.531 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `NotificationDeleteModal` | component | `{showDeleteModal}` |  | NotificationsPage · l.645 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar notificaciones.» |  | NotificationsPage · l.95 |
| error | «Error al cargar los datos iniciales.» |  | NotificationsPage · l.119 |
| success | «{notificationIds.length} notificación(es) marcada(s) como leída(s)» |  | handleMarkAsRead · l.195 |
| error | «Error al marcar como leído» |  | handleMarkAsRead · l.198 |
| success | «{notificationIds.length} notificación(es) marcada(s) como no leída(s)» |  | handleMarkAsUnread · l.213 |
| error | «Error al marcar como no leído» |  | handleMarkAsUnread · l.216 |
| success | «{deleteTargetIds.length} notificación(es) eliminada(s)» |  | handleDeleteConfirm · l.234 |
| error | «Error al eliminar notificaciones» |  | handleDeleteConfirm · l.237 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `router.push` | `!(session) && session === null` | NotificationsPage · l.132 |
| `{notification.related_url}` | `router.push` | `notification.related_url` | handleNotificationClick · l.257 |
| `/dashboard` | `router.push` | `notification.related_url` | handleNotificationClick · l.260 |
| `{fallbackUrl}` | `router.push` | `!(notification.related_url)` | handleNotificationClick · l.294 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | NotificationsPage · l.112 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!session` | NotificationsPage · l.76 |
| `!session` | NotificationsPage · l.102 |
| `isLoading` | NotificationsPage · l.128 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Notificaciones | `loading` |  | NotificationsPage · l.363 |
| `MainLayout` | pageTitle: Notificaciones |  |  | NotificationsPage · l.372 |
| `CogIcon` | aria-hidden: true |  |  | NotificationsPage · l.385 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `nameMap` | «Administración», «Tareas», «Cursos», «Mensajes», «Social», «Feedback», «Sistema», «Workspace» | getCategoryName · l.331 |
| `getRelativeTime()` | «hace {Math.floor(days / 30)} mes(es)», «hace {days} día(s)», «hace {hours} hora(s)», «hace {minutes} minuto(s)», «justo ahora» | getRelativeTime · l.354 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «hace {days} día(s)» | NotificationsPage · l.355 |

**Values shown from data** (3)

- `{notification.title}` — NotificationsPage · l.557, when `!(paginatedNotifications.length === 0) && each paginatedNotifications`
- `{notification.description}` — NotificationsPage · l.565, when `!(paginatedNotifications.length === 0) && each paginatedNotifications && notification.description`
- `{getCategoryName(notification.notifi…}` — NotificationsPage · l.581, when `!(paginatedNotifications.length === 0) && each paginatedNotifications && notification.notification_type`

**Other texts on screen** (5)

- «{filteredNotifications.length} notificación(es) • {filteredNotifications.filter(n => !…} sin leer» — NotificationsPage · l.379
- «{selectedNotifications.size} notificación(es) seleccionada(s)» — NotificationsPage · l.452, when `selectedNotifications.size > 0`
- «No se encontraron notificaciones con los filtros aplicados / No tienes notificaciones en este momento» — NotificationsPage · l.489, when `paginatedNotifications.length === 0`
- «Seleccionar todas» (label) — NotificationsPage · l.500, when `!(paginatedNotifications.length === 0)`
- «Página {currentPage} de {totalPages}» — NotificationsPage · l.625, when `!(paginatedNotifications.length === 0) && totalPages > 1`

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

### components/ui/kit/Badge.tsx

Used by: `/configuracion/piezas`

**Values shown from data** (2)

- `{value}` — l.68, when `label`
- `{label}` — l.69, when `label`, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### components/ui/kit/Button.tsx

Used by: `/configuracion/piezas`

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

Used by: `/configuracion/piezas`

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

Used by: `/configuracion/piezas`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{cancelLabel}» | `{onCancel}` |  | `{loading}` | `testid={testId ? '${testId}-cancel' : undefined}` | ConfirmDialog · l.80 |
| «{confirmLabel}» | `{onConfirm}` |  |  | `testid={testId ? '${testId}-confirm' : undefined}` | ConfirmDialog · l.89 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{open}` |  | ConfirmDialog · l.68 |
| `ConfirmDialog` | component | `{pending !== null}` |  | useConfirm · l.167 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DEFAULT_CONFIRM_TITLE` | «Confirmar acción» | l.115 |

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

Used by: `/configuracion/piezas`

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

Used by: `/configuracion/piezas`

**Values shown from data** (3)

- `{title}` — l.43
- `{description}` — l.52, when `description`
- `{action}` — l.54, when `action`

### components/ui/kit/Field.tsx

Used by: `/configuracion/piezas`

**Fields** (6)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | {type} |  |  |  |  | l.229 |
|  | textarea |  |  |  |  | l.237 |
|  | select |  |  |  |  | l.248 |
|  | {type} |  |  |  |  | l.268 |
| «{label}» | {kind} | required |  |  |  | Choice · l.304 |
| «{label}» | checkbox |  |  |  |  | l.363 |

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

**Values shown from data** (5)

- `{help}` — Field · l.127, when `help`
- `{children}` — Field · l.157, when `group`
- `{children}` — Field · l.170
- `{help}` — Choice · l.330, when `help`
- `{help}` — l.389, when `help`

**Other texts on screen** (4)

- «{label} {mark}» (label) — Field · l.152, when `group`
- «{label} {mark}» (label) — Field · l.166
- «{label}» (label) — Choice · l.302
- «{label}» (label) — l.358

### components/ui/kit/Loading.tsx

Used by: `/configuracion/piezas`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | l.94 |

**Values shown from data** (1)

- `{label}` — l.105

### components/ui/kit/Notice.tsx

Used by: `/configuracion/piezas`

**Values shown from data** (1)

- `{title}` — l.68, when `title`

### components/ui/kit/PageHeader.tsx

Used by: `/configuracion/piezas`

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

Used by: `/configuracion/piezas`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{children}» | `{onSort}` | `sortable` |  |  | l.148 |
| «Anterior» | `{() => onPageChange(current - 1)}` |  | `{current <= 1}` | `testid={testId ? '${testId}-previous' : undefined}` | Pagination · l.254 |
| «Siguiente» | `{() => onPageChange(current + 1)}` |  | `{current >= pages}` | `testid={testId ? '${testId}-next' : undefined}` | Pagination · l.263 |

**Table columns** (1)

| Text | Shown when | Where |
|---|---|---|
| «{children} / {children}» |  | l.139 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Icon` | aria-hidden: true | `sortable` |  | l.158 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `shown` | «Mostrando 0 de 0 / Mostrando {from}–{to} de {total}» | Pagination · l.238 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| role | `role=table` | l.47 |
| role | `role=rowgroup` | l.72 |
| role | `role=rowgroup` | l.81 |
| role | `role=row` | l.98 |
| role | `role=cell` | l.189 |
| mark | `testid={testId}` | Pagination · l.240 |
| mark | `testid={testId ? '${testId}-range' : undefined}` | Pagination · l.250 |

**Values shown from data** (3)

- `{children}` — l.47
- `{label}` — l.213, when `named`
- `{shown} {noun} / {shown}` — Pagination · l.250

**Other texts on screen** (1)

- «Paginación» (aria-label) — Pagination · l.240

### components/ui/kit/Tabs.tsx

Used by: `/configuracion/piezas`

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
|  | `{(event) => { onClick?.(event); if (!event.defaultPrevented) select(value); }}` |  | l.150 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{item.label}» | `{item.href}` | `each items` | `testid={item['data-testid']}` | TabLinks · l.206 |

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

### lib/api-auth.ts

Used by: `/configuracion/apariencia`, `/configuracion/notificaciones`, `/configuracion/piezas`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

**Reads and writes the database directly:** `table:profiles` (select)

### lib/auth/forced-password-change.ts

Used by: `/configuracion/apariencia`, `/configuracion/notificaciones`, `/configuracion/piezas`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `verdictFromProfile()` | «required / allowed» | verdictFromProfile · l.254 |

### lib/look.ts

Used by: `/configuracion/apariencia`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `lookFromPreferences()` | «nuevo / clasico» | lookFromPreferences · l.30 |

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
| `/api/user/look` | `pages/api/user/look.ts` | PUT | `/configuracion/apariencia` | `__tests__/api/user-look.test.ts`, `__tests__/pages/apariencia.test.tsx`, `pages/configuracion/apariencia.tsx`, `tests/e2e/look-switch.spec.ts` |
| `/api/user/notification-preferences` | `pages/api/user/notification-preferences.ts` | GET, PUT | `/configuracion/notificaciones` | `__tests__/api/notification-preferences.test.ts`, `__tests__/notifications/entry-points.test.tsx`, `__tests__/pages/notification-settings.test.tsx`, `pages/configuracion/notificaciones.tsx`, `tests/e2e/notification-preferences-api.spec.ts` +1 |
| `/api/webhooks/resend` | `pages/api/webhooks/resend.ts` | POST | **no screen** | `__tests__/api/webhooks/resend.test.ts`, `tests/e2e/notification-bounce.spec.ts` |

