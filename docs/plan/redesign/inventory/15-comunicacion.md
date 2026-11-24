# Comunicación (news and events)

Area `15-comunicacion`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `297c129d4` (2026-11-25).

9 screen files, 13 API files, 30 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/correos/contactos/[id]` | `pages/admin/correos/contactos/[id].tsx` | 105 | — |  |
| `/admin/correos/contactos` | `pages/admin/correos/contactos/index.tsx` | 305 | — |  |
| `/admin/correos/importar` | `pages/admin/correos/importar.tsx` | 103 | — |  |
| `/admin/correos/listas` | `pages/admin/correos/listas.tsx` | 248 | — |  |
| `/admin/correos/pasantias` | `pages/admin/correos/pasantias.tsx` | 67 | — |  |
| `/admin/correos/usuarios` | `pages/admin/correos/usuarios.tsx` | 57 | — |  |
| `/admin/correos/vista-previa` | `pages/admin/correos/vista-previa.tsx` | 192 | — |  |
| `/admin/events` | `pages/admin/events.tsx` | 580 | Comunicación › Eventos |  |
| `/admin/news` | `pages/admin/news.tsx` | 655 | Comunicación › Noticias |  |

## /admin/correos/contactos/[id]

File `pages/admin/correos/contactos/[id].tsx` · 105 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `pages/admin/correos/contactos/index.tsx:167`, `pages/admin/correos/contactos/index.tsx:215`, `pages/admin/correos/contactos/index.tsx:218`
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

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Borrar a esta persona» | `{erase}` | `contact && !contact.erased` |  | `testid=correos-persona-borrar` | CorreosPersona · l.70 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a contactos» | `/admin/correos/contactos` |  |  | CorreosPersona · l.78 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «danger / ¿Borrar a esta persona? / Se borran su correo, su nombre y su organización, también de los envíos pasados, y sale de todas las listas. Su dirección queda bloqueada para siempre: nadie podrá volver a agregarla. No se puede deshacer. / Borrar para siempre» |  | erase · l.37 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Contacto de correo · breadcrumbs: Administración / Correos / Contactos / Persona |  |  | CorreosPersona · l.58 |
| `PageHeader` | eyebrow: Correos · title: Persona borrada / Persona · description: Sus listas, el permiso registrado y si está bloqueada. |  |  | CorreosPersona · l.64 |
| `CorreosNav` | current: contactos |  |  | CorreosPersona · l.76 |
| `Notice` |  | `outcome` | `testid=correos-persona-aviso` | CorreosPersona · l.84 |
| `Notice` | tone: error · title: No se pudo mostrar a esta persona. | `loadError` |  | CorreosPersona · l.91 |
| `ContactDetails` |  | `!(loadError) && contact` |  | CorreosPersona · l.95 |
| `LoadingBlock` | label: Cargando a la persona | `!(loadError) && !(contact)` |  | CorreosPersona · l.97 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-persona-pagina` | CorreosPersona · l.63 |

**Values shown from data** (2)

- `{outcome.text}` — CorreosPersona · l.84, when `outcome`
- `{loadError}` — CorreosPersona · l.91, when `loadError`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/ContactDetails.tsx`
- `components/correos/CorreosNav.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/ConfirmDialog.tsx`
- `components/ui/kit/Dialog.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `components/ui/kit/Tabs.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/correos-host/page-guard.ts`
- `lib/correos/labels.ts`
- `lib/correos/reason.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/contactos/[id]` | ? | `pages/admin/correos/contactos/[id].tsx:25` |
| `/api/admin/correos/contactos/borrar` | POST | `pages/admin/correos/contactos/[id].tsx:46` |

## /admin/correos/contactos

File `pages/admin/correos/contactos/index.tsx` · 305 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/correos/CorreosNav.tsx:8`, `pages/admin/correos/contactos/[id].tsx:61`, `pages/admin/correos/contactos/[id].tsx:78`
- Tests: browser tests that CI runs: `tests/e2e/correos-importar.spec.ts`, `tests/e2e/correos-listas-contactos.spec.ts`.

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

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{() => setDraft(null)}` |  |  |  | CorreosContactos · l.246 |
| «Agregar» (submits the form) |  |  |  | `testid=correos-persona-guardar` | CorreosContactos · l.249 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver a la persona» | `/admin/correos/contactos/[*]` | `outcome && outcome.contactId` |  | CorreosContactos · l.167 |
| «{row.email}» | `/admin/correos/contactos/[*]` | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | CorreosContactos · l.218 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `TableRow` | «{row.email} Bloqueada {fullName(row)} / — {row.organization} / — {formatDate(row.created_at)}» | `{() => router.push('/admin/correos/contactos/${row.id}')}` | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` | CorreosContactos · l.211 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | email |  |  | `draft` | `testid=correos-persona-correo` | CorreosContactos · l.263 |
|  | text | `maxLength={200}` |  | `draft` | `testid=correos-persona-nombre` | CorreosContactos · l.273 |
|  | text | `maxLength={200}` |  | `draft` | `testid=correos-persona-apellido` | CorreosContactos · l.281 |
|  | text | `maxLength={200}` |  | `draft` | `testid=correos-persona-organizacion` | CorreosContactos · l.290 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{addOne}` | `draft` | CorreosContactos · l.256 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{draft !== null}` | title: Agregar persona | CorreosContactos · l.238 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Esa dirección de correo no es válida. Revísala.» | `setFormError` | `!isValidAddress(draft.email)` | addOne · l.108 |
| «Elige al menos una lista.» | `setFormError` | `draft.list_ids.length === 0` | addOne · l.109 |
| «Indica de dónde viene el permiso y escribe la nota.» | `setFormError` | `!reasonComplete(draft.reason)` | addOne · l.110 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/admin/correos/contactos/[*]` | `router.push` | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` | CorreosContactos · l.215 |

**Pieces placed here, with the texts and settings handed to them** (29)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Contactos de correo · breadcrumbs: Administración / Correos / Contactos |  |  | CorreosContactos · l.138 |
| `PageHeader` | eyebrow: Correos · title: Contactos · description: Las personas a quienes podemos escribir. Busca por parte del correo, del nombre o de la organización. · searchPlaceholder: Buscar personas... · searchLabel: Buscar personas · primaryAction: Agregar persona |  |  | CorreosContactos · l.144 |
| `CorreosNav` | current: contactos |  |  | CorreosContactos · l.161 |
| `Notice` |  | `outcome` | `testid=correos-contactos-aviso` | CorreosContactos · l.164 |
| `Notice` | tone: error · title: No se pudo buscar. | `loadError` |  | CorreosContactos · l.176 |
| `LoadingBlock` | label: Buscando | `!(loadError) && !result` |  | CorreosContactos · l.180 |
| `EmptyState` | title: Nadie coincide con la búsqueda / Todavía no hay contactos · description: Prueba con otra parte del correo o del nombre. / Agrega una persona o importa un archivo. | `!(loadError) && !(!result) && result.items.length === 0` |  | CorreosContactos · l.182 |
| `Table` | aria-label: Contactos | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.187 |
| `Pagination` | noun: personas | `!(loadError) && !(!result) && !(result.items.length === 0)` | `testid=correos-contactos-paginas` | CorreosContactos · l.191 |
| `TableHead` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.201 |
| `TableRow` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.202 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.203 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.204 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.205 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.206 |
| `TableBody` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | CorreosContactos · l.209 |
| `TableRow` |  | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` | `testid=correos-contacto-fila` | CorreosContactos · l.211 |
| `TableCell` | label: Correo | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | CorreosContactos · l.217 |
| `Badge` | tone: error | `!(!result) && !(result.items.length === 0) && each result.items && row.blocked` |  | CorreosContactos · l.222 |
| `TableCell` | label: Nombre | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | CorreosContactos · l.227 |
| `TableCell` | label: Organización | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | CorreosContactos · l.228 |
| `TableCell` | label: Agregada | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | CorreosContactos · l.229 |
| `Notice` | tone: error | `draft && formError` | `testid=correos-persona-error` | CorreosContactos · l.258 |
| `Field` | label: Correo | `draft` |  | CorreosContactos · l.262 |
| `Field` | label: Nombre | `draft` |  | CorreosContactos · l.272 |
| `Field` | label: Apellido | `draft` |  | CorreosContactos · l.280 |
| `Field` | label: Organización | `draft` |  | CorreosContactos · l.289 |
| `ListPicker` | idPrefix: correos-persona | `draft` |  | CorreosContactos · l.297 |
| `ReasonFields` | idPrefix: correos-persona | `draft` |  | CorreosContactos · l.298 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-contactos` | CorreosContactos · l.143 |

**Values shown from data** (5)

- `{loadError}` — CorreosContactos · l.176, when `loadError`
- `{fullName(row)} / —` — CorreosContactos · l.227, when `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items`
- `{row.organization} / —` — CorreosContactos · l.228, when `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items`
- `{formatDate(row.created_at)}` — CorreosContactos · l.229, when `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items`
- `{formError}` — CorreosContactos · l.258, when `draft && formError`

**Other texts on screen** (5)

- «Correo» — CorreosContactos · l.203, when `!(loadError) && !(!result) && !(result.items.length === 0)`
- «Nombre» — CorreosContactos · l.204, when `!(loadError) && !(!result) && !(result.items.length === 0)`
- «Organización» — CorreosContactos · l.205, when `!(loadError) && !(!result) && !(result.items.length === 0)`
- «Agregada» — CorreosContactos · l.206, when `!(loadError) && !(!result) && !(result.items.length === 0)`
- «Bloqueada» — CorreosContactos · l.223, when `!(!result) && !(result.items.length === 0) && each result.items && row.blocked`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/CorreosNav.tsx`
- `components/correos/ListPicker.tsx`
- `components/correos/ReasonFields.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
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
- `lib/correos-host/page-guard.ts`
- `lib/correos/reason.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/contactos` | POST | `pages/admin/correos/contactos/index.tsx:112`, `pages/admin/correos/contactos/index.tsx:93` |
| `/api/admin/correos/listas` | ? | `components/correos/ListPicker.tsx:26` |

## /admin/correos/importar

File `pages/admin/correos/importar.tsx` · 103 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/correos/CorreosNav.tsx:10`
- Tests: browser tests that CI runs: `tests/e2e/correos-importar.spec.ts`.

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

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Importar otro archivo» | `{() => setCounts(null)}` | `counts` |  | `testid=correos-importar-otro` | CorreosImportar · l.69 |
| «Importar» (submits the form) |  | `!(counts)` | `{!ready}` | `testid=correos-importar-empezar` | CorreosImportar · l.91 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{start}` | `!(counts)` | CorreosImportar · l.76 |

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Elige un archivo.» | `setError` | `!file` | start · l.34 |
| «Elige al menos una lista.» | `setError` | `listIds.length === 0` | start · l.35 |
| «Indica de dónde viene el permiso y escribe la nota. Vale para todo el archivo.» | `setError` | `!reasonComplete(reason)` | start · l.36 |
| «El archivo es demasiado grande (más de 8 MB). No se importó nada: divídelo en archivos más pequeños.» | `setError` | `!(answer.status === 200 && answer.body) && answer.status === 413` | start · l.48 |

**Pieces placed here, with the texts and settings handed to them** (10)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Importar contactos · breadcrumbs: Administración / Correos / Importar archivo |  |  | CorreosImportar · l.53 |
| `PageHeader` | eyebrow: Correos · title: Importar un archivo · description: Agrega muchas personas de una vez desde un archivo CSV. Las direcciones bloqueadas y quienes se dieron de baja no se agregan. |  |  | CorreosImportar · l.59 |
| `CorreosNav` | current: importar |  |  | CorreosImportar · l.64 |
| `AddResult` |  | `counts` |  | CorreosImportar · l.68 |
| `Card` |  | `!(counts)` |  | CorreosImportar · l.74 |
| `CardBody` |  | `!(counts)` |  | CorreosImportar · l.75 |
| `CsvFilePicker` |  | `!(counts)` |  | CorreosImportar · l.77 |
| `ListPicker` | idPrefix: correos-importar | `!(counts)` |  | CorreosImportar · l.78 |
| `ReasonFields` | idPrefix: correos-importar · basisHelp: Vale para todas las personas del archivo. Se guarda junto a cada una, con la fecha de hoy y tu nombre. | `!(counts)` |  | CorreosImportar · l.79 |
| `Notice` | tone: error · title: No se importó nada. | `!(counts) && error` | `testid=correos-importar-error` | CorreosImportar · l.86 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-importar` | CorreosImportar · l.58 |

**Values shown from data** (1)

- `{error}` — CorreosImportar · l.86, when `!(counts) && error`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/AddResult.tsx`
- `components/correos/CorreosNav.tsx`
- `components/correos/CsvFilePicker.tsx`
- `components/correos/ListPicker.tsx`
- `components/correos/ReasonFields.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Tabs.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/correos-host/page-guard.ts`
- `lib/correos/reason.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/importar` | POST | `pages/admin/correos/importar.tsx:39` |
| `/api/admin/correos/listas` | ? | `components/correos/ListPicker.tsx:26` |

## /admin/correos/listas

File `pages/admin/correos/listas.tsx` · 248 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/correos/CorreosNav.tsx:9`
- Tests: browser tests that CI runs: `tests/e2e/correos-listas-contactos.spec.ts`.

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

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editar» | `{() => { setFormError(null); setDraft({ id: list.id, name: list.name, descriptio…}` | `!(!lists) && !(lists.length === 0) && each lists && !(list.archived_at)` |  | `testid=correos-lista-editar` | CorreosListas · l.169 |
| «Archivar» | `{() => archive(list)}` | `!(!lists) && !(lists.length === 0) && each lists && !(list.archived_at)` |  | `testid=correos-lista-archivar` | CorreosListas · l.180 |
| «Cancelar» | `{() => setDraft(null)}` |  |  |  | CorreosListas · l.201 |
| «Guardar» (submits the form) |  |  |  | `testid=correos-lista-guardar` | CorreosListas · l.204 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | text | `maxLength={200}` |  | `draft` | `testid=correos-lista-nombre` | CorreosListas · l.218 |
|  | textarea | `maxLength={1000}` |  | `draft` | `testid=correos-lista-descripcion` | CorreosListas · l.226 |
|  | switch |  |  | `draft` | `testid=correos-lista-publica` | CorreosListas · l.234 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{save}` | `draft` | CorreosListas · l.211 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{draft !== null}` | title: Editar lista / Nueva lista | CorreosListas · l.194 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «¿Archivar «{list.name}»? / La lista deja de ofrecerse para agregar personas y ya no se puede cambiar. Nadie pierde su historial en ella. / Archivar» |  | archive · l.89 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Lista guardada. / Lista creada.» | `setNotice` | `answer.status === 200 \|\| answer.status === 201` | save · l.82 |
| «Lista archivada.» | `setNotice` | `answer.status === 200` | archive · l.97 |

**Pieces placed here, with the texts and settings handed to them** (27)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Listas de correo · breadcrumbs: Administración / Correos / Listas |  |  | CorreosListas · l.103 |
| `PageHeader` | eyebrow: Correos · title: Listas · description: Cada persona puede estar en una o más listas. Las listas no se borran: se archivan. · primaryAction: Nueva lista |  |  | CorreosListas · l.109 |
| `CorreosNav` | current: listas |  |  | CorreosListas · l.122 |
| `Notice` | tone: neutral | `notice` | `testid=correos-listas-aviso` | CorreosListas · l.125 |
| `Notice` | tone: error · title: No se pudieron cargar las listas. | `loadError` |  | CorreosListas · l.132 |
| `LoadingBlock` | label: Cargando las listas | `!(loadError) && !lists` |  | CorreosListas · l.136 |
| `EmptyState` | title: Todavía no hay listas · description: Crea la primera con «Nueva lista». | `!(loadError) && !(!lists) && lists.length === 0` |  | CorreosListas · l.138 |
| `Table` | aria-label: Listas de correo | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.140 |
| `TableHead` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.141 |
| `TableRow` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.142 |
| `TableHeaderCell` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.143 |
| `TableHeaderCell` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.144 |
| `TableHeaderCell` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.145 |
| `TableHeaderCell` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.146 |
| `TableHeaderCell` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.147 |
| `TableBody` |  | `!(loadError) && !(!lists) && !(lists.length === 0)` |  | CorreosListas · l.152 |
| `TableRow` |  | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` | `testid=correos-lista-fila` | CorreosListas · l.154 |
| `TableCell` | label: Nombre | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` |  | CorreosListas · l.155 |
| `TableCell` | label: Pública | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` |  | CorreosListas · l.159 |
| `TableCell` | label: Suscritas | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` |  | CorreosListas · l.160 |
| `TableCell` | label: Estado | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` |  | CorreosListas · l.163 |
| `Badge` | tone: neutral | `!(!lists) && !(lists.length === 0) && each lists && list.archived_at` |  | CorreosListas · l.164 |
| `Badge` | tone: success | `!(!lists) && !(lists.length === 0) && each lists && !(list.archived_at)` |  | CorreosListas · l.164 |
| `TableCell` | label: Acciones | `!(loadError) && !(!lists) && !(lists.length === 0) && each lists` |  | CorreosListas · l.166 |
| `Notice` | tone: error | `draft && formError` | `testid=correos-lista-error` | CorreosListas · l.213 |
| `Field` | label: Nombre | `draft` |  | CorreosListas · l.217 |
| `Field` | label: Descripción · help: Para qué es la lista. Opcional. | `draft` |  | CorreosListas · l.225 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Lista pública» | CorreosListas · l.235 |
| «Una lista pública podrá ofrecerse a las personas para que se suscriban solas.» | CorreosListas · l.236 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-listas` | CorreosListas · l.108 |
| mark | `testid=correos-lista-suscritas` | CorreosListas · l.161 |

**Values shown from data** (6)

- `{notice}` — CorreosListas · l.125, when `notice`
- `{loadError}` — CorreosListas · l.132, when `loadError`
- `{list.name}` — CorreosListas · l.156, when `!(loadError) && !(!lists) && !(lists.length === 0) && each lists`
- `{list.description}` — CorreosListas · l.157, when `!(!lists) && !(lists.length === 0) && each lists && list.description`
- `{list.subscribed.toLocaleString('es-…}` — CorreosListas · l.161, when `!(loadError) && !(!lists) && !(lists.length === 0) && each lists`
- `{formError}` — CorreosListas · l.213, when `draft && formError`

**Other texts on screen** (8)

- «Nombre» — CorreosListas · l.143, when `!(loadError) && !(!lists) && !(lists.length === 0)`
- «Pública» — CorreosListas · l.144, when `!(loadError) && !(!lists) && !(lists.length === 0)`
- «Suscritas» — CorreosListas · l.145, when `!(loadError) && !(!lists) && !(lists.length === 0)`
- «Estado» — CorreosListas · l.146, when `!(loadError) && !(!lists) && !(lists.length === 0)`
- «Acciones» — CorreosListas · l.148, when `!(loadError) && !(!lists) && !(lists.length === 0)`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Sí / No» — CorreosListas · l.159, when `!(loadError) && !(!lists) && !(lists.length === 0) && each lists`
- «Archivada» — CorreosListas · l.164, when `!(!lists) && !(lists.length === 0) && each lists && list.archived_at`
- «Activa» — CorreosListas · l.164, when `!(!lists) && !(lists.length === 0) && each lists && !(list.archived_at)`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/CorreosNav.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
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
- `lib/correos-host/page-guard.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/listas` | ? | `pages/admin/correos/listas.tsx:48` |

## /admin/correos/pasantias

File `pages/admin/correos/pasantias.tsx` · 67 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/correos/CorreosNav.tsx:12`
- Tests: browser tests that CI runs: `tests/e2e/correos-importar.spec.ts`.

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

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Agregar interesados en pasantías · breadcrumbs: Administración / Correos / Interesados en pasantías |  |  | CorreosPasantias · l.32 |
| `PageHeader` | eyebrow: Correos · title: Interesados en pasantías · description: Solo aparecen quienes marcaron, en el formulario de pasantías, la casilla para recibir el boletín. |  |  | CorreosPasantias · l.38 |
| `CorreosNav` | current: pasantias |  |  | CorreosPasantias · l.43 |
| `PickPeople` | api: /api/admin/correos/pasantias · idsField: lead_ids · testPrefix: correos-pasantias · noun: interesados · searchLabel: Buscar interesados por correo, nombre o institución · emptyTitle: Nadie coincide · emptyDescription: Solo aparecen quienes marcaron la casilla del boletín. · basisHelp: Marcaron la casilla del boletín en el formulario. La fecha y la versión del aviso de cada persona se guardan tal como quedaron. · columns: Nombre / Correo / Institución / Marcó la casilla |  |  | CorreosPasantias · l.44 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-pasantias` | CorreosPasantias · l.37 |

**Values shown from data** (2)

- `{nameOf(row)}` — CorreosPasantias · l.57
- `{row.email}` — CorreosPasantias · l.58

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/AddResult.tsx`
- `components/correos/CorreosNav.tsx`
- `components/correos/ListPicker.tsx`
- `components/correos/PickPeople.tsx`
- `components/correos/ReasonFields.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `components/ui/kit/Tabs.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/correos-host/page-guard.ts`
- `lib/correos/reason.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/listas` | ? | `components/correos/ListPicker.tsx:26` |
| `/api/admin/correos/pasantias` | ? | `pages/admin/correos/pasantias.tsx:45` |

## /admin/correos/usuarios

File `pages/admin/correos/usuarios.tsx` · 57 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/correos/CorreosNav.tsx:11`
- Tests: browser tests that CI runs: `tests/e2e/correos-importar.spec.ts`.

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

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Agregar usuarios de la plataforma · breadcrumbs: Administración / Correos / Usuarios de la plataforma |  |  | CorreosUsuarios · l.27 |
| `PageHeader` | eyebrow: Correos · title: Usuarios de la plataforma · description: Agrega a personas del equipo y de los colegios que tienen un rol activo. Se copian su nombre y su correo tal como están hoy. |  |  | CorreosUsuarios · l.33 |
| `CorreosNav` | current: usuarios |  |  | CorreosUsuarios · l.38 |
| `PickPeople` | api: /api/admin/correos/usuarios · idsField: user_ids · testPrefix: correos-usuarios · noun: usuarios · searchLabel: Buscar usuarios por correo o nombre · emptyTitle: Nadie coincide · emptyDescription: Solo aparecen usuarios con un rol activo y un correo válido. · columns: Nombre / Correo |  |  | CorreosUsuarios · l.39 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-usuarios` | CorreosUsuarios · l.32 |

**Values shown from data** (2)

- `{nameOf(row)}` — CorreosUsuarios · l.49
- `{row.email}` — CorreosUsuarios · l.50

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/correos/AddResult.tsx`
- `components/correos/CorreosNav.tsx`
- `components/correos/ListPicker.tsx`
- `components/correos/PickPeople.tsx`
- `components/correos/ReasonFields.tsx`
- `components/correos/api.ts`
- `components/ui/kit/Button.tsx`
- `components/ui/kit/Card.tsx`
- `components/ui/kit/EmptyState.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `components/ui/kit/Table.tsx`
- `components/ui/kit/Tabs.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `lib/correos-host/page-guard.ts`
- `lib/correos/reason.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/listas` | ? | `components/correos/ListPicker.tsx:26` |
| `/api/admin/correos/usuarios` | ? | `pages/admin/correos/usuarios.tsx:40` |

## /admin/correos/vista-previa

File `pages/admin/correos/vista-previa.tsx` · 192 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.21 `server redirect → /login?next=[*]  (when !viewer)`
  - l.28 `if (!(await isGlobalAdmin(service, viewer.id))) { return { redirect: { destination: '/dashboard', permanent: false } }; }`
  - l.29 `server redirect → /dashboard  (when !(await isGlobalAdmin(service, viewer.id)))`
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

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Enviarme una prueba» | `{sendTest}` |  |  | `testid=correos-enviar-prueba` | CorreosVistaPrevia · l.136 |
| «{WIDTHS[key].label}» | `{() => setWidth(key)}` | `each (Object.keys(WIDTHS) as WidthKey[])` |  | `testid=correos-ancho-{key}` | CorreosVistaPrevia · l.150 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · Correo de ejemplo | `!(loadError) && preview` | `testid=correos-marco` | CorreosVistaPrevia · l.176 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | getServerSideProps · l.21 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | getServerSideProps · l.26 |
| `/dashboard` | `server redirect` | `!(await isGlobalAdmin(service, viewer.id))` | getServerSideProps · l.29 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `if (!(await isGlobalAdmin(service, viewer.id))) { return { redirect: { destination: '/dashboard', permanent: false } }; }` | getServerSideProps · l.28 |

**Pieces placed here, with the texts and settings handed to them** (5)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Vista previa de correos · breadcrumbs: Administración / Correos / Vista previa |  |  | CorreosVistaPrevia · l.125 |
| `PageHeader` | eyebrow: Correos · title: Vista previa del correo · description: Así se ve un correo de ejemplo con la marca de la Fundación. Puedes enviarte una prueba a tu propia dirección. |  |  | CorreosVistaPrevia · l.131 |
| `Notice` |  | `outcome` | `testid=correos-resultado` | CorreosVistaPrevia · l.143 |
| `Notice` | tone: error · title: No se pudo mostrar el correo. | `loadError` |  | CorreosVistaPrevia · l.172 |
| `LoadingBlock` | label: Cargando el correo de ejemplo | `!(loadError) && !(preview)` |  | CorreosVistaPrevia · l.185 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `WIDTHS` | «Escritorio», «Teléfono» | l.36 |

**Other texts written in the code (safety net: not tied to an element by the script)** (10)

| Text | Where |
|---|---|
| «Prueba enviada.» | describeSend · l.54 |
| «La enviamos a tu dirección{body.to ? `, ${body.to}` : …}. Revisa tu bandeja de entrada.» | describeSend · l.54 |
| «No se envió.» | describeSend · l.59 |
| «El servicio de correo no está configurado en este entorno, así que no salió ningún mensaje.» | describeSend · l.60 |
| «Tu cuenta está vinculada a un colegio de prueba, y a esas cuentas no les enviamos correos reales.» | describeSend · l.68 |
| «Tu cuenta no tiene una dirección de correo registrada.» | describeSend · l.72 |
| «El servicio de correo no aceptó el mensaje o no pudimos comprobar tu cuenta. Inténtalo de nuevo más tarde.» | describeSend · l.77 |
| «Tu sesión terminó. Vuelve a iniciar sesión.» | describeSend · l.80 |
| «Solo un administrador puede enviar la prueba.» | describeSend · l.81 |
| «Algo falló al enviar la prueba. Inténtalo de nuevo más tarde.» | describeSend · l.82 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-vista-previa` | CorreosVistaPrevia · l.130 |
| role | `role=group` | CorreosVistaPrevia · l.148 |

**Values shown from data** (1)

- `{outcome.text}` — CorreosVistaPrevia · l.143, when `outcome`

**Other texts on screen** (4)

- «Ancho de la vista previa» (aria-label) — CorreosVistaPrevia · l.148
- «{frameWidth} px» — CorreosVistaPrevia · l.161
- «Asunto:» — CorreosVistaPrevia · l.166, when `preview`
- «Vuelve a cargar la página en un momento.» — CorreosVistaPrevia · l.173, when `loadError`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ui/kit/Button.tsx`
- `components/ui/kit/Field.tsx`
- `components/ui/kit/Loading.tsx`
- `components/ui/kit/Notice.tsx`
- `components/ui/kit/PageHeader.tsx`
- `lib/api-auth.ts`
- `lib/auth/forced-password-change.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/correos/vista-previa` | ? | `pages/admin/correos/vista-previa.tsx:34` |

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

### components/correos/AddResult.tsx

Used by: `/admin/correos/importar`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Notice` | title: Listo. |  |  | AddResult · l.21 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ROWS` | «Agregadas», «Repetidas o que ya estaban en esas listas», «Bloqueadas (no se agregaron)», «Se dieron de baja por decisión propia, no se volvieron a agregar», «Direcciones mal escritas» | l.5 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-resultado` | AddResult · l.20 |
| mark | `testid=correos-resultado-{row.testId}` | AddResult · l.28 |
| mark | `testid=correos-resultado-total` | AddResult · l.35 |
| mark | `testid=correos-resultado-suma` | AddResult · l.40 |

**Values shown from data** (3)

- `{row.label}` — AddResult · l.27, when `each ROWS`
- `{fmt(counts[row.key])}` — AddResult · l.28, when `each ROWS`
- `{fmt(counts.total)}` — AddResult · l.35

**Other texts on screen** (3)

- «Se revisaron {fmt(counts.total)} {noun} . Se agregaron {fmt(counts.accepted)} .» — AddResult · l.21
- «Total» — AddResult · l.34
- «Las cinco cifras suman {fmt(sum)}, el total. / Las cifras suman {fmt(sum)} y el total es {fmt(counts.total)}: avisa al equipo técnico.» — AddResult · l.40

### components/correos/ContactDetails.tsx

Used by: `/admin/correos/contactos/[id]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Listas» | h2 |  | ContactDetails · l.92 |

**Pieces placed here, with the texts and settings handed to them** (21)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Notice` | tone: error · title: Bloqueada. | `contact.block.blocked` | `testid=correos-persona-bloqueo` | ContactDetails · l.30 |
| `Card` |  |  |  | ContactDetails · l.36 |
| `CardHeader` |  |  |  | ContactDetails · l.37 |
| `CardTitle` |  |  |  | ContactDetails · l.38 |
| `CardBody` |  |  |  | ContactDetails · l.40 |
| `Table` | aria-label: Listas de la persona | `!(contact.memberships.length === 0)` |  | ContactDetails · l.98 |
| `TableHead` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.99 |
| `TableRow` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.100 |
| `TableHeaderCell` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.101 |
| `TableHeaderCell` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.102 |
| `TableHeaderCell` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.103 |
| `TableHeaderCell` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.104 |
| `TableHeaderCell` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.105 |
| `TableBody` |  | `!(contact.memberships.length === 0)` |  | ContactDetails · l.108 |
| `TableRow` |  | `!(contact.memberships.length === 0) && each contact.memberships` | `testid=correos-persona-lista` | ContactDetails · l.110 |
| `TableCell` | label: Lista | `!(contact.memberships.length === 0) && each contact.memberships` |  | ContactDetails · l.111 |
| `TableCell` | label: Estado | `!(contact.memberships.length === 0) && each contact.memberships` |  | ContactDetails · l.114 |
| `Badge` |  | `!(contact.memberships.length === 0) && each contact.memberships` | `testid=correos-persona-lista-estado` | ContactDetails · l.115 |
| `TableCell` | label: Permiso | `!(contact.memberships.length === 0) && each contact.memberships` |  | ContactDetails · l.124 |
| `TableCell` | label: Fecha del permiso | `!(contact.memberships.length === 0) && each contact.memberships` |  | ContactDetails · l.125 |
| `TableCell` | label: Cómo llegó | `!(contact.memberships.length === 0) && each contact.memberships` |  | ContactDetails · l.126 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-persona` | ContactDetails · l.28 |
| mark | `testid=correos-persona-correo` | ContactDetails · l.44 |
| mark | `testid=correos-persona-nombre` | ContactDetails · l.50 |
| mark | `testid=correos-persona-organizacion` | ContactDetails · l.56 |
| mark | `testid=correos-persona-motivo` | ContactDetails · l.66 |
| mark | `testid=correos-persona-fecha` | ContactDetails · l.73 |
| mark | `testid=correos-persona-bloqueada` | ContactDetails · l.83 |

**Values shown from data** (11)

- `{name} / —` — ContactDetails · l.50
- `{contact.organization} / —` — ContactDetails · l.56
- `{labelFor(JOINED_VIA_LABELS, contact…}` — ContactDetails · l.62
- `{formatDate(contact.basis_recorded_a…}` — ContactDetails · l.73
- `{contact.basis_note} / —` — ContactDetails · l.79
- `{member.list_name}` — ContactDetails · l.112, when `!(contact.memberships.length === 0) && each contact.memberships`
- `{labelFor(STATE_LABELS, member.state)}` — ContactDetails · l.115, when `!(contact.memberships.length === 0) && each contact.memberships`
- `{labelFor(UNSUBSCRIBED_BY_LABELS, me…} , {formatDate(member.unsubscribed_at)}` — ContactDetails · l.119, when `!(contact.memberships.length === 0) && each contact.memberships && member.state === 'unsubscribed' && member.unsubscribed_by`
- `{labelFor(LEGAL_BASIS_LABELS as Reco…}` — ContactDetails · l.124, when `!(contact.memberships.length === 0) && each contact.memberships`
- `{formatDate(member.basis_recorded_at)}` — ContactDetails · l.125, when `!(contact.memberships.length === 0) && each contact.memberships`
- `{labelFor(JOINED_VIA_LABELS, member.…}` — ContactDetails · l.126, when `!(contact.memberships.length === 0) && each contact.memberships`

**Other texts on screen** (19)

- «{labelFor(BLOCK_REASON_LABELS, conta…} (desde el {formatDate(contact.block.si…}) . No se le puede volver a agregar ni escribir.» — ContactDetails · l.30, when `contact.block.blocked`
- «Datos» — ContactDetails · l.38
- «Correo» — ContactDetails · l.43
- «{contact.email} / Borrado» — ContactDetails · l.44
- «Nombre» — ContactDetails · l.49
- «Organización» — ContactDetails · l.55
- «Cómo llegó» — ContactDetails · l.61
- «Permiso registrado» — ContactDetails · l.65
- «{labelFor(LEGAL_BASIS_LABELS as Reco…} (aviso {contact.consent_notice_vers…})» — ContactDetails · l.66
- «Fecha del permiso» — ContactDetails · l.72
- «Nota sobre el permiso» — ContactDetails · l.78
- «Bloqueada» — ContactDetails · l.82
- «Sí: {labelFor(BLOCK_REASON_LABEL…} / No» — ContactDetails · l.83
- «No está en ninguna lista.» — ContactDetails · l.96, when `contact.memberships.length === 0`
- «Lista» — ContactDetails · l.101, when `!(contact.memberships.length === 0)`
- «Estado» — ContactDetails · l.102, when `!(contact.memberships.length === 0)`
- «Permiso» — ContactDetails · l.103, when `!(contact.memberships.length === 0)`
- «Fecha del permiso» — ContactDetails · l.104, when `!(contact.memberships.length === 0)`
- «Cómo llegó» — ContactDetails · l.105, when `!(contact.memberships.length === 0)`

### components/correos/CorreosNav.tsx

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `TabLinks` | label: Secciones de Correos |  |  | CorreosNav · l.17 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ITEMS` | «Contactos», «Listas», «Importar archivo», «Usuarios de la plataforma», «Interesados en pasantías» | l.7 |

### components/correos/CsvFilePicker.tsx

Used by: `/admin/correos/importar`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Elegir otro archivo / Elegir archivo» | `{() => inputRef.current?.click()}` |  | `{disabled}` |  | CsvFilePicker · l.74 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Archivo CSV» | file | disabled: `{disabled}` · accepts `.csv,text/csv,text/plain` |  | hidden by its class (`sr-only`); another control opens it or it is for screen readers | `testid=correos-importar-archivo` | CsvFilePicker · l.63 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «El archivo pesa más de 8 MB. Divídelo en archivos más pequeños.» | `setError` | `picked.size > MAX_CSV_BYTES` | choose · l.36 |
| «No se pudo leer el archivo. Inténtalo de nuevo.» | `setError` |  | choose · l.51 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Notice` | tone: error · title: No se pudo usar el archivo. | `error` |  | CsvFilePicker · l.86 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=correos-importar-nombre` | CsvFilePicker · l.77 |

**Values shown from data** (1)

- `{error}` — CsvFilePicker · l.86, when `error`

**Other texts on screen** (3)

- «Archivo CSV» (label) — CsvFilePicker · l.60
- «{file.name} ({Math.max(1, Math.round(file…} KB) / Ningún archivo elegido» — CsvFilePicker · l.77
- «La primera fila nombra las columnas: «correo» (obligatoria), y si quieres «nombre», «apellido» y «organización». Separado por comas o por punto y coma. Hasta 20.000 filas.» — CsvFilePicker · l.82

### components/correos/ListPicker.tsx

Used by: `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  | `each lists` | `testid={idPrefix}-lista id={idPrefix}-lista-{list.id}` | ListPicker · l.49 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!alive` | ListPicker · l.27 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Notice` | tone: error · title: No se pudieron cargar las listas. | `error` |  | ListPicker · l.36 |
| `LoadingBlock` | label: Cargando las listas | `!lists` |  | ListPicker · l.37 |
| `Notice` | tone: warning · title: No hay listas. | `lists.length === 0` |  | ListPicker · l.39 |
| `Field` | label: Listas · help: Elige una o más. La persona queda suscrita a cada una. |  |  | ListPicker · l.47 |

**Values shown from data** (1)

- `{error}` — ListPicker · l.36, when `error`

**Other texts on screen** (1)

- «Crea una lista antes de agregar personas.» — ListPicker · l.39, when `lists.length === 0`

### components/correos/PickPeople.tsx

Used by: `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar más personas» | `{() => setCounts(null)}` | `counts` |  | `testid={testPrefix}-otra-vez` | PickPeople · l.137 |
| «Agregar a las listas» (submits the form) |  |  |  | `testid={testPrefix}-agregar` | PickPeople · l.233 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | checkbox |  |  | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` | `testid={testPrefix}-elegir` | PickPeople · l.186 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{add}` |  | PickPeople · l.212 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Marca al menos una persona.» | `setError` | `picked.size === 0` | add · l.118 |
| «Elige al menos una lista.» | `setError` | `listIds.length === 0` | add · l.119 |
| «Indica de dónde viene el permiso y escribe la nota.» | `setError` | `!reasonComplete(reason, { versionFromForm })` | add · l.120 |

**Pieces placed here, with the texts and settings handed to them** (20)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AddResult` |  | `counts` |  | PickPeople · l.136 |
| `SearchInput` |  |  | `testid={testPrefix}-buscar` | PickPeople · l.147 |
| `Notice` | tone: error · title: No se pudo cargar la lista. | `loadError` |  | PickPeople · l.157 |
| `LoadingBlock` | label: Cargando | `!(loadError) && !result` |  | PickPeople · l.161 |
| `EmptyState` |  | `!(loadError) && !(!result) && result.items.length === 0` |  | PickPeople · l.163 |
| `Table` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.165 |
| `Pagination` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.169 |
| `TableHead` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.172 |
| `TableRow` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.173 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.174 |
| `TableHeaderCell` |  | `!(loadError) && !(!result) && !(result.items.length === 0) && each columns` |  | PickPeople · l.178 |
| `TableBody` |  | `!(loadError) && !(!result) && !(result.items.length === 0)` |  | PickPeople · l.182 |
| `TableRow` |  | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` | `testid={testPrefix}-fila` | PickPeople · l.184 |
| `TableCell` | label: Elegir | `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items` |  | PickPeople · l.185 |
| `TableCell` |  | `!(!result) && !(result.items.length === 0) && each result.items && each columns` |  | PickPeople · l.194 |
| `Card` |  |  |  | PickPeople · l.210 |
| `CardBody` |  |  |  | PickPeople · l.211 |
| `ListPicker` |  |  |  | PickPeople · l.218 |
| `ReasonFields` |  |  |  | PickPeople · l.219 |
| `Notice` | tone: error · title: No se agregó a nadie. | `error` | `testid={testPrefix}-error` | PickPeople · l.228 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testPrefix}-ocultas` | PickPeople · l.204 |
| mark | `testid={testPrefix}-elegidas` | PickPeople · l.213 |

**Values shown from data** (4)

- `{loadError}` — PickPeople · l.157, when `loadError`
- `{column.header}` — PickPeople · l.178, when `!(loadError) && !(!result) && !(result.items.length === 0) && each columns`
- `{column.cell(row)}` — PickPeople · l.194, when `!(!result) && !(result.items.length === 0) && each result.items && each columns`
- `{error}` — PickPeople · l.228, when `error`

**Other texts on screen** (4)

- «Elegir» — PickPeople · l.175, when `!(loadError) && !(!result) && !(result.items.length === 0)`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Elegir a {rowLabel(row)}» — PickPeople · l.187, when `!(loadError) && !(!result) && !(result.items.length === 0) && each result.items`, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «En esta página hay {result.hidden} persona que no se ofrece / personas que no se ofrecen : no tienen un correo válido o están vinculadas a un colegio de prueba.» — PickPeople · l.204, when `result?.hidden`
- «Todavía no marcaste a nadie. / Marcaste {picked.size} {picked.size === 1 ? 'person…}.» — PickPeople · l.213

### components/correos/ReasonFields.tsx

Used by: `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | textarea | `maxLength={MAX_NOTE_LENGTH}` |  |  | `testid={idPrefix}-nota id={idPrefix}-nota` | ReasonFields · l.57 |
|  | text | `maxLength={100}` |  | `value.legal_basis === 'consent_form' && versionFromForm` | `testid={idPrefix}-version id={idPrefix}-version` | ReasonFields · l.68 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: ¿De dónde viene el permiso para escribirles? |  |  | ReasonFields · l.42 |
| `Radio` |  | `each allowed` | `testid={idPrefix}-motivo-{basis} id={idPrefix}-motivo-{basis}` | ReasonFields · l.44 |
| `Field` | label: Nota sobre el permiso · help: Cómo y cuándo lo dieron. Queda guardada junto a cada persona. |  |  | ReasonFields · l.56 |
| `Field` | label: Versión del aviso de privacidad que aceptaron | `value.legal_basis === 'consent_form' && versionFromForm` |  | ReasonFields · l.67 |

### components/correos/api.ts

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `failureText()` | «Tu sesión terminó. Vuelve a iniciar sesión.», «Solo un administrador puede hacer esto.», «No hay conexión. Revisa tu internet e inténtalo de nuevo.», «Algo falló. Inténtalo de nuevo en un momento.» | failureText · l.27 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Tu sesión terminó. Vuelve a iniciar sesión.» | failureText · l.27 |
| «Solo un administrador puede hacer esto.» | failureText · l.28 |
| «No hay conexión. Revisa tu internet e inténtalo de nuevo.» | failureText · l.29 |
| «Algo falló. Inténtalo de nuevo en un momento.» | failureText · l.30 |

### components/ui/kit/Button.tsx

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/importar`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/listas`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/listas`

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

Used by: `/admin/correos/contactos`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Values shown from data** (3)

- `{title}` — l.43
- `{description}` — l.52, when `description`
- `{action}` — l.54, when `action`

### components/ui/kit/Field.tsx

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | l.94 |

**Values shown from data** (1)

- `{label}` — l.105

### components/ui/kit/Notice.tsx

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

**Values shown from data** (1)

- `{title}` — l.68, when `title`

### components/ui/kit/PageHeader.tsx

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{item.label}» | `{item.href}` | `each items` | `testid={item['data-testid']}` | TabLinks · l.206 |

### lib/api-auth.ts

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

**Reads and writes the database directly:** `table:profiles` (select)

### lib/auth/forced-password-change.ts

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `verdictFromProfile()` | «required / allowed» | verdictFromProfile · l.254 |

### lib/correos-host/page-guard.ts

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=[*]` | `server redirect` | `!viewer` | correosAdminPage · l.17 |
| `{forcedChangeRedirectPath(verdict)}` | `server redirect` | `verdict !== 'allowed'` | correosAdminPage · l.22 |
| `/dashboard` | `server redirect` | `!(await isGlobalAdmin(service, viewer.id))` | correosAdminPage · l.25 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `if (!(await isGlobalAdmin(service, viewer.id))) { return { redirect: { destination: '/dashboard', permanent: false } }; }` | correosAdminPage · l.24 |

### lib/correos/labels.ts

Used by: `/admin/correos/contactos/[id]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `STATE_LABELS` | «Suscrito», «Pendiente», «Se dio de baja» | l.3 |
| `JOINED_VIA_LABELS` | «Agregada a mano», «Importada desde un archivo», «Usuario de la plataforma», «Interesada en pasantías», «Formulario de inscripción», «Formulario antiguo», «Otro origen» | l.9 |
| `UNSUBSCRIBED_BY_LABELS` | «por decisión propia», «por un administrador» | l.19 |
| `BLOCK_REASON_LABELS` | «Su correo rebotó de forma permanente», «Marcó un correo nuestro como spam», «Bloqueada a mano», «Los envíos a su dirección fallaron», «Bloqueada», «Se borraron sus datos» | l.24 |

### lib/correos/reason.ts

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/pasantias`, `/admin/correos/usuarios`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LEGAL_BASIS_LABELS` | «Dio su consentimiento en un formulario», «Tiene una relación de trabajo con nosotros», «Lo verificamos a mano con la persona» | l.11 |

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`, `/admin/events`, `/admin/news`

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

Used by: `/admin/correos/contactos/[id]`, `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios`, `/admin/correos/vista-previa`, `/admin/events`, `/admin/news`

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
| `/api/admin/correos/contactos/[id]` | `pages/api/admin/correos/contactos/[id].ts` |  | `/admin/correos/contactos/[id]` | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts`, `pages/admin/correos/contactos/[id].tsx` |
| `/api/admin/correos/contactos/borrar` | `pages/api/admin/correos/contactos/borrar.ts` |  | `/admin/correos/contactos/[id]` | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts`, `pages/admin/correos/contactos/[id].tsx`, `tests/e2e/correos-listas-contactos.spec.ts` |
| `/api/admin/correos/contactos` | `pages/api/admin/correos/contactos/index.ts` |  | `/admin/correos/contactos` | `__tests__/correos/routes-access.test.ts`, `pages/admin/correos/contactos/index.tsx`, `tests/e2e/correos-listas-contactos.spec.ts` |
| `/api/admin/correos/importar` | `pages/api/admin/correos/importar.ts` |  | `/admin/correos/importar` | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts`, `pages/admin/correos/importar.tsx`, `tests/e2e/correos-importar.spec.ts` |
| `/api/admin/correos/listas/[id]` | `pages/api/admin/correos/listas/[id].ts` |  | **no screen** | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts` |
| `/api/admin/correos/listas` | `pages/api/admin/correos/listas/index.ts` |  | `/admin/correos/contactos`, `/admin/correos/importar`, `/admin/correos/listas`, `/admin/correos/pasantias`, `/admin/correos/usuarios` | `components/correos/ListPicker.tsx`, `pages/admin/correos/listas.tsx`, `tests/e2e/correos-importar.spec.ts`, `tests/e2e/correos-listas-contactos.spec.ts` |
| `/api/admin/correos/pasantias` | `pages/api/admin/correos/pasantias.ts` |  | `/admin/correos/pasantias` | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts`, `pages/admin/correos/pasantias.tsx`, `tests/e2e/correos-importar.spec.ts` |
| `/api/admin/correos/usuarios` | `pages/api/admin/correos/usuarios.ts` |  | `/admin/correos/usuarios` | `__tests__/correos/routes-access.test.ts`, `__tests__/correos/routes-people.test.ts`, `pages/admin/correos/usuarios.tsx`, `tests/e2e/correos-importar.spec.ts` |
| `/api/admin/correos/vista-previa` | `pages/api/admin/correos/vista-previa.ts` | GET, POST | `/admin/correos/vista-previa` | `__tests__/correos/vista-previa-api.test.ts`, `pages/admin/correos/vista-previa.tsx` |
| `/api/admin/news` | `pages/api/admin/news.ts` | DELETE, GET, POST, PUT | `/admin/news` | `pages/admin/news.tsx` |
| `/api/news/[slug]` | `pages/api/news/[slug].ts` | GET | **no screen** |  |
| `/api/news` | `pages/api/news/index.ts` | GET | `/`, `/dashboard`, `/noticias`, `/noticias/[slug]` | `__tests__/helpers/panelFakes.tsx`, `__tests__/pages/dashboard.clasico.test.tsx`, `__tests__/pages/dashboard.nuevo.test.tsx`, `__tests__/pages/dashboard.samePanel.test.tsx`, `components/site/news.ts` +3 |
| `/api/public/events` | `pages/api/public/events.ts` | GET | `/noticias` | `pages/noticias.tsx` |

