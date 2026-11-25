# Comunicación (news and events)

Area `15-comunicacion`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `a908cc8b5` (2026-11-25).

2 screen files, 4 API files, 6 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/events` | `pages/admin/events.tsx` | 580 | Comunicación › Eventos |  |
| `/admin/news` | `pages/admin/news.tsx` | 655 | Comunicación › Noticias |  |

## /admin/events

File `pages/admin/events.tsx` · 580 lines · frame: MainLayout

### Who reaches it

- Menu: Comunicación › «Eventos» → `/admin/events` — roles: admin, community_manager; the group: everyone signed in (`Sidebar.tsx` l.371)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.61 `router.push → /login  (when !user)`
  - l.65 `primaryRole = await getUserPrimaryRole(user.id)`
  - l.67 `router.push → /dashboard  (when !['admin', 'community_manager'].includes(primaryRole))`
- Linked from: `components/layout/Sidebar.tsx:373`, `middleware.ts:218`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 2, community_manager 5, consultor 1, equipo_directivo 1, lider_comunidad 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | yes | pass |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Eventos» | h1 |  | EventsManagement · l.278 |
| «Eliminar Evento» | h3 | `showDeleteConfirm` | EventsManagement · l.375 |
| «Editar Evento / Nuevo Evento» | h3 | `showModal` | EventsManagement · l.415 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «+ Nuevo Evento» | `{() => { resetForm(); setShowModal(true); }}` |  |  |  | EventsManagement · l.279 |
| «Editar» | `{() => handleEdit(event)}` | `each events` |  |  | EventsManagement · l.345 |
| «Eliminar» | `{() => handleDelete(event.id!)}` | `each events` |  |  | EventsManagement · l.351 |
| «Eliminar» | `{confirmDelete}` | `showDeleteConfirm` |  |  | EventsManagement · l.392 |
| «Cancelar» | `{cancelDelete}` | `showDeleteConfirm` |  |  | EventsManagement · l.398 |
| «Cancelar» | `{() => { setShowModal(false); resetForm(); }}` | `showModal` |  |  | EventsManagement · l.555 |
| «Actualizar / Crear Evento» (submits the form) |  | `showModal` |  |  | EventsManagement · l.565 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Título *» | text | required |  | `showModal` |  | EventsManagement · l.426 |
| «Ubicación *» | text | «ej: Santiago, Chile o Virtual» · required |  | `showModal` |  | EventsManagement · l.440 |
| «Fecha Inicio *» | date | required |  | `showModal` |  | EventsManagement · l.456 |
| «Fecha Fin (opcional)» | date |  |  | `showModal` |  | EventsManagement · l.468 |
| «Hora (opcional)» | text | «ej: 10:00 - 12:00» |  | `showModal` |  | EventsManagement · l.482 |
| «Descripción» | textarea |  |  | `showModal` |  | EventsManagement · l.496 |
| «URL del Enlace» | text | «ejemplo.com o https://ejemplo.com» |  | `showModal` |  | EventsManagement · l.510 |
| «Texto del Enlace» | text | «ej: Inscríbete aquí» |  | `showModal` |  | EventsManagement · l.529 |
| «Publicado» | checkbox |  |  | `showModal` |  | EventsManagement · l.542 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` | `showModal` | EventsManagement · l.419 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» |  | EventsManagement · l.295 |
| «Título» |  | EventsManagement · l.298 |
| «Ubicación» |  | EventsManagement · l.301 |
| «Estado» |  | EventsManagement · l.304 |
| «Acciones» |  | EventsManagement · l.307 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Eliminar Evento» | written in this file | `showDeleteConfirm` |  | EventsManagement · l.367 |
| «Editar Evento / Nuevo Evento» | written in this file | `showModal` |  | EventsManagement · l.412 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor completa todos los campos requeridos» | `!formData.title \|\| !formData.location \|\| !formData.date_start` | handleSubmit · l.96 |
| success | «Evento actualizado exitosamente. La línea de tiempo se actualizará automáticamente.» | `editingEvent?.id` | handleSubmit · l.144 |
| success | «Evento creado exitosamente» | `!(editingEvent?.id)` | handleSubmit · l.168 |
| error | «{errorMessage}» |  | handleSubmit · l.182 |
| success | «Evento eliminado exitosamente» |  | confirmDelete · l.218 |
| error | «Error al eliminar el evento» |  | confirmDelete · l.222 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuthorization · l.61 |
| `/dashboard` | `router.push` | `!['admin', 'community_manager'].includes(primaryRole)` | checkAuthorization · l.67 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `primaryRole = await getUserPrimaryRole(user.id)` | checkAuthorization · l.65 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `!isAuthorized \|\| loading` |  | EventsManagement · l.252 |
| `MainLayout` |  |  |  | EventsManagement · l.269 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Error al guardar el evento» | EventsManagement · l.181 |

**Values shown from data** (5)

- `{formatEventDate(event.date_start)} [- {formatEventDate(event.date_…}]` — EventsManagement · l.316, when `each events`
- `{event.time}` — EventsManagement · l.321, when `each events && event.time`
- `{event.title}` — EventsManagement · l.325, when `each events`
- `{event.description}` — EventsManagement · l.327, when `each events && event.description`
- `{event.location}` — EventsManagement · l.333, when `each events`

**Other texts on screen** (14)

- «Cargando...» — EventsManagement · l.261, when `!isAuthorized \|\| loading`
- «Publicado / Borrador» — EventsManagement · l.336, when `each events`
- «¿Estás seguro de que quieres eliminar este evento?» — EventsManagement · l.380, when `showDeleteConfirm`
- «&quot; {events.find(e => e.id === deletingE…} &quot;» — EventsManagement · l.383, when `showDeleteConfirm && deletingEventId && events.find(e => e.id === deletingEventId)`
- «Esta acción no se puede deshacer.» — EventsManagement · l.388, when `showDeleteConfirm`
- «Título *» (label) — EventsManagement · l.423, when `showModal`
- «Ubicación *» (label) — EventsManagement · l.437, when `showModal`
- «Fecha Inicio *» (label) — EventsManagement · l.453, when `showModal`
- «Fecha Fin (opcional)» (label) — EventsManagement · l.465, when `showModal`
- «Hora (opcional)» (label) — EventsManagement · l.479, when `showModal`
- «Descripción» (label) — EventsManagement · l.493, when `showModal`
- «URL del Enlace» (label) — EventsManagement · l.507, when `showModal`
- «Texto del Enlace» (label) — EventsManagement · l.526, when `showModal`
- «Publicado» (label) — EventsManagement · l.541, when `showModal`

**Reads and writes the database directly:** `table:events` (delete, insert, select, update)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/dateUtils.ts`
- `utils/roleUtils.ts`

## /admin/news

File `pages/admin/news.tsx` · 655 lines · frame: MainLayout

### Who reaches it

- Menu: Comunicación › «Noticias» → `/admin/news` — roles: admin, community_manager; the group: everyone signed in (`Sidebar.tsx` l.363)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.12 `ALLOWED_ROLES = ['admin', 'community_manager']`
  - l.309 `Solo administradores y community managers pueden acceder a la gestión de noticias.`
  - l.312 `router.push → /  (when hasPermission === false)`
- Linked from: `components/layout/Sidebar.tsx:365`, `middleware.ts:218`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.
- QA scenarios that name this address: admin 2, community_manager 9, consultor 1, equipo_directivo 1, lider_comunidad 1, supervisor_de_red 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | yes | pass |
| docente | no | sent to /dashboard |
| encargado_licitacion | no | sent to /dashboard |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `hasPermission === false` | NewsAdmin · l.305 |
| «Gestión de Noticias» | h1 |  | NewsAdmin · l.336 |
| «Editar Noticia / Nueva Noticia» | h3 | `showModal` · screen size: `sm:block` | NewsAdmin · l.533 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al Inicio» | `{() => router.push('/')}` | `hasPermission === false` |  |  | NewsAdmin · l.311 |
| «Nueva Noticia» | `{() => { resetForm(); setShowModal(true); }}` |  |  |  | NewsAdmin · l.341 |
| «Crear primera noticia» | `{() => { resetForm(); setShowModal(true); }}` | `!(loading) && articles.length === 0` |  |  | NewsAdmin · l.364 |
| «Guardar» | `{() => handleQuickDateSave(article.id)}` | `!(loading) && !(articles.length === 0) && each articles && editingDateId === article.id` |  |  | NewsAdmin · l.453 |
| «Cancelar» | `{handleQuickDateCancel}` | `!(loading) && !(articles.length === 0) && each articles && editingDateId === article.id` |  |  | NewsAdmin · l.462 |
| «[icon EyeOffIcon]» · tooltip «{article.is_published ? 'Despublicar' : 'Publicar'}» | `{() => handleTogglePublish(article)}` | `!(loading) && !(articles.length === 0) && each articles` |  |  | NewsAdmin · l.487 |
| «[icon PencilIcon]» · tooltip «Editar» | `{() => openEditModal(article)}` | `!(loading) && !(articles.length === 0) && each articles` |  |  | NewsAdmin · l.498 |
| «[icon TrashIcon]» · tooltip «Eliminar» | `{() => handleDelete(article.id)}` | `!(loading) && !(articles.length === 0) && each articles` |  |  | NewsAdmin · l.505 |
| «Guardando... / Actualizar / Crear» | `{handleSave}` | `showModal` · screen size: `sm:block sm:flex` | `{saving}` |  | NewsAdmin · l.629 |
| «Cancelar» | `{() => { setShowModal(false); resetForm(); }}` | `showModal` · screen size: `sm:block sm:flex` |  |  | NewsAdmin · l.637 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{formatDate(article.display_date \|\| …}» · tooltip «Click para editar fecha» | `{() => handleQuickDateEdit(article)}` | `!(loading) && !(articles.length === 0) && each articles && !(editingDateId === article.id)` | NewsAdmin · l.473 |

**Fields** (5)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | date | also `onKeyDown={(e) => { if (e.key === 'Enter') { handleQuickDateSave(article.id); } else if (e…}` |  | `!(loading) && !(articles.length === 0) && each articles && editingDateId === article.id` |  | NewsAdmin · l.439 |
| «Título» | text | «Título de la noticia» |  | `showModal` · screen size: `sm:block` |  | NewsAdmin · l.544 |
| «Imagen Destacada» | file | disabled: `{uploading}` · accepts `image/*` |  | `showModal` · screen size: `sm:block` |  | NewsAdmin · l.559 |
| «Fecha de Publicación» | date |  |  | `showModal` · screen size: `sm:block` |  | NewsAdmin · l.586 |
| «Publicar ahora» | checkbox |  |  | `showModal` · screen size: `sm:block` | `id=is_published (id used by code)` | NewsAdmin · l.614 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · {article.featured_image} | `!(loading) && !(articles.length === 0) && each articles && article.featured_image` |  | NewsAdmin · l.403 |
| img · alt Preview · {featuredImage} | `showModal && featuredImage` · screen size: `sm:block` |  | NewsAdmin · l.572 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Título» | `!(loading) && !(articles.length === 0)` | NewsAdmin · l.380 |
| «Autor» | `!(loading) && !(articles.length === 0)` | NewsAdmin · l.383 |
| «Estado» | `!(loading) && !(articles.length === 0)` | NewsAdmin · l.386 |
| «Fecha» | `!(loading) && !(articles.length === 0)` | NewsAdmin · l.389 |
| «Acciones» | `!(loading) && !(articles.length === 0)` | NewsAdmin · l.392 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Noticia / Nueva Noticia» | written in this file | `showModal` |  | NewsAdmin · l.524 |
| «(sin título)» | written in this file | `showModal` |  | NewsAdmin · l.526 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Estás seguro de eliminar este artículo?» |  | handleDelete · l.167 |

**Toasts** (12)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las noticias» |  | fetchArticles · l.100 |
| success | «Imagen subida exitosamente» | `url` | handleImageUpload · l.120 |
| error | «Error al subir la imagen» |  | handleImageUpload · l.124 |
| error | «El título y contenido son requeridos» | `!title \|\| !content` | handleSave · l.132 |
| success | «Artículo actualizado / Artículo creado» |  | handleSave · l.154 |
| error | «Error al guardar el artículo» |  | handleSave · l.160 |
| success | «Artículo eliminado» |  | handleDelete · l.176 |
| error | «Error al eliminar el artículo» |  | handleDelete · l.180 |
| success | «Artículo despublicado / Artículo publicado» |  | handleTogglePublish · l.197 |
| error | «Error al cambiar el estado de publicación» |  | handleTogglePublish · l.201 |
| success | «Fecha actualizada» |  | handleQuickDateSave · l.224 |
| error | «Error al actualizar la fecha» |  | handleQuickDateSave · l.230 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar noticias» | `throw (shown by whoever catches it)` | `!response.ok` | fetchArticles · l.94 |
| «Error al guardar» | `throw (shown by whoever catches it)` | `!response.ok` | handleSave · l.151 |
| «Error al eliminar» | `throw (shown by whoever catches it)` | `!response.ok` | handleDelete · l.174 |
| «Error al actualizar» | `throw (shown by whoever catches it)` | `!response.ok` | handleTogglePublish · l.195 |
| «Error al actualizar fecha» | `throw (shown by whoever catches it)` | `!response.ok` | handleQuickDateSave · l.222 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/` | `router.push` | `hasPermission === false` | NewsAdmin · l.312 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `ALLOWED_ROLES = ['admin', 'community_manager']` | l.12 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Gestión de Noticias | `hasPermission === null` |  | NewsAdmin · l.273 |
| `MainLayout` | pageTitle: Acceso Denegado | `hasPermission === false` |  | NewsAdmin · l.291 |
| `MainLayout` | pageTitle: Gestión de Noticias |  |  | NewsAdmin · l.324 |
| `TipTapEditor` |  | `showModal` · screen size: `sm:block` |  | NewsAdmin · l.603 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `method` | «PUT / POST» | handleSave · l.138 |

**Values shown from data** (2)

- `{article.title}` — NewsAdmin · l.410, when `!(loading) && !(articles.length === 0) && each articles`
- `{formatDate(article.display_date \|\| …}` — NewsAdmin · l.478, when `!(loading) && !(articles.length === 0) && each articles && !(editingDateId === article.id)`

**Other texts on screen** (15)

- «Verificando permisos...» — NewsAdmin · l.282, when `hasPermission === null`
- «Solo administradores y community managers pueden acceder a la gestión de noticias.» — NewsAdmin · l.309, when `hasPermission === false`
- «Crea y administra las noticias del sitio» — NewsAdmin · l.338
- «Cargando noticias...» — NewsAdmin · l.359, when `loading`
- «No hay noticias aún» — NewsAdmin · l.363, when `!(loading) && articles.length === 0`
- «/noticias/ {article.slug}» — NewsAdmin · l.413, when `!(loading) && !(articles.length === 0) && each articles`
- «{`${article.author.first_name \|\| ''}…} / Sin autor / Sin autor» — NewsAdmin · l.420, when `!(loading) && !(articles.length === 0) && each articles`
- «Publicado / Borrador» — NewsAdmin · l.428, when `!(loading) && !(articles.length === 0) && each articles`
- «Título» (label) — NewsAdmin · l.541, when `showModal`, screen size: `sm:block`
- «Imagen Destacada» (label) — NewsAdmin · l.555, when `showModal`, screen size: `sm:block`
- «Fecha de Publicación» (label) — NewsAdmin · l.583, when `showModal`, screen size: `sm:block`
- «Esta es la fecha que se mostrará en el artículo. Útil para artículos migrados o programados.» — NewsAdmin · l.594, when `showModal`, screen size: `sm:block`
- «Contenido» (label) — NewsAdmin · l.600, when `showModal`, screen size: `sm:block`
- «💡 Tip: Puedes pegar enlaces de YouTube directamente en el contenido y se mostrarán como videos reproducibles.» — NewsAdmin · l.608, when `showModal`, screen size: `sm:block`
- «Publicar ahora» (label) — NewsAdmin · l.621, when `showModal`, screen size: `sm:block`

### Pieces it uses (each is listed once, under "Pieces" below)

- `src/components/TipTapEditor.tsx`
- `types/roles.ts`
- `utils/authHelpers.ts`
- `utils/roleUtils.ts`
- `utils/storage.js`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/news` | DELETE, GET, PUT | `pages/admin/news.tsx:143`, `pages/admin/news.tsx:170`, `pages/admin/news.tsx:186`, `pages/admin/news.tsx:213` +1 |
| `/api/auth/session` | GET | `utils/authHelpers.ts:71` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### src/components/TipTapEditor.tsx

Used by: `/admin/news`

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{item.label}» · tooltip «{item.title}» · aria «{item.ariaLabel}» | `{item.action}` |  | `{!isEnabled}` |  | renderButton · l.91 |
| «Reducir / Expandir» · tooltip «{isFullscreen ? 'Minimizar (Esc)' : 'Maximizar'}» · aria «{isFullscreen ? 'Minimizar editor' : 'Maximizar editor'}» | `{onToggleFullscreen}` | `expandable && onToggleFullscreen` |  |  | MenuBar · l.122 |
| «Cerrar» · tooltip «Cerrar (Esc)» · aria «Cerrar pantalla completa» | `{() => setIsFullscreen(false)}` |  |  |  | TipTapEditor · l.383 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editor en pantalla completa» | written in this file |  |  | TipTapEditor · l.375 |

**Draws nothing when** (5)

| Condition | Where |
|---|---|
| `!editor` | MenuBar · l.73 |
| `!editor \|\| editor.isFocused` | TipTapEditor · l.185 |
| `current === next` | TipTapEditor · l.188 |
| `!isFullscreen` | TipTapEditor · l.193 |
| `!editor` | TipTapEditor · l.348 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Icon` | aria-hidden: true |  |  | renderButton · l.101 |
| `Minimize2Icon` | aria-hidden: true | `expandable && onToggleFullscreen && isFullscreen` |  | MenuBar · l.130 |
| `Maximize2Icon` | aria-hidden: true | `expandable && onToggleFullscreen && !(isFullscreen)` |  | MenuBar · l.132 |
| `XIcon` | aria-hidden: true |  |  | TipTapEditor · l.390 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `toolbarGroups` | «Negrita», «Negrita (Ctrl+B)», «Cursiva», «Cursiva (Ctrl+I)», «Subrayado», «Subrayar», «Subrayado (Ctrl+U)», «Encabezado nivel 2», «Título 2», «Encabezado 2 (Ctrl+Alt+2)», «Encabezado nivel 3», «Título 3», «Encabezado 3 (Ctrl+Alt+3)», «Lista con viñetas», «Viñetas», «Lista con viñetas (Ctrl+Shift+8)», «Lista numerada», «Números», «Lista numerada (Ctrl+Shift+7)», «Deshacer», «Deshacer (Ctrl+Z)», «Rehacer», «Rehacer (Ctrl+Shift+Z)» | TipTapEditor · l.206 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (11)

| Kind | What | Where |
|---|---|---|
| role | `role=toolbar` | MenuBar · l.108 |
| listener | `window.addEventListener('keydown')` | TipTapEditor · l.197 |
| focus | `editor.chain().focus()` | TipTapEditor · l.213 |
| focus | `editor.chain().focus()` | TipTapEditor · l.226 |
| focus | `editor.chain().focus()` | TipTapEditor · l.239 |
| focus | `editor.chain().focus()` | TipTapEditor · l.257 |
| focus | `editor.chain().focus()` | TipTapEditor · l.271 |
| focus | `editor.chain().focus()` | TipTapEditor · l.290 |
| focus | `editor.chain().focus()` | TipTapEditor · l.303 |
| focus | `editor.chain().focus()` | TipTapEditor · l.321 |
| focus | `editor.chain().focus()` | TipTapEditor · l.334 |

**Values shown from data** (1)

- `{group.buttons.map(renderButton)}` — MenuBar · l.114, when `each toolbarGroups`

**Other texts on screen** (2)

- «Formato de texto» (aria-label) — MenuBar · l.108
- «Editor» — TipTapEditor · l.382

### types/roles.ts

Used by: `/admin/events`, `/admin/news`

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

### utils/authHelpers.ts

Used by: `/admin/news`

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, contextUser.id)` | getEnhancedUserInfo · l.32 |
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, session.user.id)` | getEnhancedUserInfo · l.52 |
| `{ effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, sessionData.user.id)` | getEnhancedUserInfo · l.76 |

### utils/dateUtils.ts

Used by: `/admin/events`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `months` | «ENE», «FEB», «MAR», «ABR», «MAY», «JUN», «JUL», «AGO», «SEP», «OCT», «NOV», «DIC» | formatEventDate · l.35 |

### utils/roleUtils.ts

Used by: `/admin/events`, `/admin/news`

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

### utils/storage.js

Used by: `/admin/news`

**Reads and writes the database directly:** `bucket:{bucketName}` (getPublicUrl, list, upload)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/news` | `pages/api/admin/news.ts` | DELETE, GET, POST, PUT | `/admin/news` | `pages/admin/news.tsx` |
| `/api/news/[slug]` | `pages/api/news/[slug].ts` | GET | **no screen** |  |
| `/api/news` | `pages/api/news/index.ts` | GET | `/`, `/dashboard`, `/noticias`, `/noticias/[slug]` | `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`, `components/site/news.ts` +3 |
| `/api/public/events` | `pages/api/public/events.ts` | GET | `/noticias` | `pages/noticias.tsx` |

