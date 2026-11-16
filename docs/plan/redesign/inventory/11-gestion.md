# Gestión (clients, contracts, quotes)

Area `11-gestion`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `d5d93151e` (2026-11-16).

7 screen files, 14 API files, 20 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/clients` | `pages/admin/clients.tsx` | 846 | Gestión › Clientes |  |
| `/admin/quotes/[id]/edit` | `pages/admin/quotes/[id]/edit.tsx` | 197 | — |  |
| `/admin/quotes` | `pages/admin/quotes/index.tsx` | 438 | Gestión › Propuestas Pasantías |  |
| `/admin/quotes/new` | `pages/admin/quotes/new.tsx` | 117 | — |  |
| `/contract-print/[id]` | `pages/contract-print/[id].tsx` | 276 | — |  |
| `/contracts` | `pages/contracts.tsx` | 1123 | Gestión › Contratos |  |
| `/quote/[id]` | `pages/quote/[id].tsx` | 129 | — |  |

## /admin/clients

File `pages/admin/clients.tsx` · 846 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Clientes» → `/admin/clients` — permission: view_contracts_all or view_contracts_school; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.550)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.99 `router.push → /login  (when !user)`
  - l.111 `router.push → /dashboard  (when !profile)`
  - l.115 `userRole = await getUserPrimaryRole(user.id)`
  - l.118 `router.push → /dashboard  (when userRole !== 'admin')`
  - l.126 `router.push → /login`
- Linked from: `components/layout/Sidebar.tsx:552`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | if permission view_contracts_all or view_contracts_school | sent to /dashboard — **the menu shows it, the middleware refuses** |
| docente | no | sent to /dashboard |
| encargado_licitacion | if permission view_contracts_all or view_contracts_school | sent to /dashboard — **the menu shows it, the middleware refuses** |

### What the page file itself draws

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Gestión de Clientes» | h1 |  | ClientsManagement · l.459 |
| «No se encontraron clientes / No hay clientes registrados» | h3 | `!(loading) && filteredClientes.length === 0` | ClientsManagement · l.492 |
| «Editar Cliente: {editingCliente.nombre_fanta…} / Nuevo Cliente» | h2 | `showClientModal` | ClientsManagement · l.577 |
| «Información Legal» | h3 | `showClientModal` | ClientsManagement · l.584 |
| «Representante Legal» | h3 | `showClientModal` | ClientsManagement · l.667 |
| «Encargado de Proyecto» | h3 | `showClientModal` | ClientsManagement · l.736 |
| «Contacto Administrativo» | h3 | `showClientModal` | ClientsManagement · l.780 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Nuevo Cliente» | `{handleAddCliente}` |  |  |  | ClientsManagement · l.462 |
| «Editar» | `{() => handleEditCliente(cliente.id)}` | `!(loading) && !(filteredClientes.length === 0) && each filteredClientes` |  |  | ClientsManagement · l.548 |
| «Eliminar» | `{() => handleDeleteCliente(cliente)}` | `!(loading) && !(filteredClientes.length === 0) && each filteredClientes` |  |  | ClientsManagement · l.556 |
| «Cancelar» | `{() => { setShowClientModal(false); setEditingCliente(null); }}` | `showClientModal` |  |  | ClientsManagement · l.824 |
| «Guardar Cambios / Crear Cliente» | `{handleSaveCliente}` | `showClientModal` |  |  | ClientsManagement · l.833 |

**Fields** (18)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por nombre, RUT o escuela...» | text | «Buscar por nombre, RUT o escuela...» |  |  |  | ClientsManagement · l.475 |
| «Nombre Legal *» | text | «Nombre legal de la organización» |  | `showClientModal` |  | ClientsManagement · l.591 |
| «Nombre de Fantasía *» | text | «Nombre comercial» |  | `showClientModal` |  | ClientsManagement · l.604 |
| «RUT *» | text | «XX.XXX.XXX-X» |  | `showClientModal` |  | ClientsManagement · l.617 |
| «Dirección *» | text | «Dirección completa» |  | `showClientModal` |  | ClientsManagement · l.630 |
| «Comuna» | text | «Comuna» |  | `showClientModal` |  | ClientsManagement · l.643 |
| «Ciudad» | text | «Ciudad» |  | `showClientModal` |  | ClientsManagement · l.656 |
| «Nombre Representante Legal *» | text | «Nombre completo» |  | `showClientModal` |  | ClientsManagement · l.674 |
| «RUT Representante Legal *» | text | «XX.XXX.XXX-X» |  | `showClientModal` |  | ClientsManagement · l.687 |
| «Fecha Escritura» | date |  |  | `showClientModal` |  | ClientsManagement · l.700 |
| «Nombre Notario» | text | «Nombre del notario» |  | `showClientModal` |  | ClientsManagement · l.712 |
| «Comuna Notaría» | text | «Comuna de la notaría» |  | `showClientModal` |  | ClientsManagement · l.725 |
| «Nombre Encargado» | text | «Nombre completo» |  | `showClientModal` |  | ClientsManagement · l.743 |
| «Teléfono Encargado» | tel | «+56 9 XXXX XXXX» |  | `showClientModal` |  | ClientsManagement · l.756 |
| «Email Encargado» | email | «email@ejemplo.com» |  | `showClientModal` |  | ClientsManagement · l.769 |
| «Nombre Contacto» | text | «Nombre completo» |  | `showClientModal` |  | ClientsManagement · l.787 |
| «Teléfono Contacto» | tel | «+56 9 XXXX XXXX» |  | `showClientModal` |  | ClientsManagement · l.800 |
| «Email Contacto» | email | «email@ejemplo.com» |  | `showClientModal` |  | ClientsManagement · l.813 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «Cliente» | `!(loading) && !(filteredClientes.length === 0)` | ClientsManagement · l.504 |
| «RUT» | `!(loading) && !(filteredClientes.length === 0)` | ClientsManagement · l.507 |
| «Representante» | `!(loading) && !(filteredClientes.length === 0)` | ClientsManagement · l.510 |
| «Escuela» | `!(loading) && !(filteredClientes.length === 0)` | ClientsManagement · l.513 |
| «Acciones» | `!(loading) && !(filteredClientes.length === 0)` | ClientsManagement · l.516 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Editar Cliente: {editingCliente.nombre_fanta…} / Nuevo Cliente» | written in this file | `showClientModal` |  | ClientsManagement · l.575 |

**Browser confirm()** (3)

| Question | When | Where |
|---|---|---|
| «El cliente "{cliente.nombre_fantasia}" está vinculado a una escuela. / ¿Está seguro de eliminarlo? Esto también desvinculará la escuela.» | `cliente.school_id` | handleDeleteCliente · l.237 |
| «¿Está seguro de eliminar el cliente "{cliente.nombre_fantasia}"? / Esta acción no se puede deshacer.» | `!(cliente.school_id)` | handleDeleteCliente · l.244 |
| «Este cliente tiene {contracts.length} contrato(s) asociado(s). / Los cambios al nombre y RUT del representante legal solo afectarán contratos y licitaciones futuros. / Los demás campos del cliente sí afectarán los contratos existentes que se regeneren. / ¿Desea continuar?» | `editingCliente && contracts && contracts.length > 0` | handleSaveCliente · l.342 |

**Toasts** (21)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Perfil no encontrado.» | `!profile` | checkAuth · l.110 |
| error | «Acceso denegado. Solo administradores.» | `userRole !== 'admin'` | checkAuth · l.117 |
| error | «Error al cargar clientes» |  | fetchClientes · l.148 |
| error | «Cliente no encontrado» | `error \|\| !cliente` | handleEditCliente · l.187 |
| error | «Error al cargar datos del cliente» |  | handleEditCliente · l.214 |
| error | «No se puede eliminar. Este cliente tiene {contracts.length} contrato(s) asociado(s).» | `contracts && contracts.length > 0` | handleDeleteCliente · l.229 |
| success | «Cliente eliminado exitosamente» |  | handleDeleteCliente · l.270 |
| error | «Error al eliminar cliente:» |  | handleDeleteCliente · l.274 |
| error | «El nombre legal es requerido» | `!clienteForm.nombre_legal.trim()` | handleSaveCliente · l.281 |
| error | «El nombre de fantasía es requerido» | `!clienteForm.nombre_fantasia.trim()` | handleSaveCliente · l.285 |
| error | «El RUT es requerido» | `!clienteForm.rut.trim()` | handleSaveCliente · l.289 |
| error | «El RUT no es válido» | `!validateRut(clienteForm.rut)` | handleSaveCliente · l.293 |
| error | «La dirección es requerida» | `!clienteForm.direccion.trim()` | handleSaveCliente · l.297 |
| error | «El nombre del representante legal es requerido» | `!clienteForm.nombre_representante.trim()` | handleSaveCliente · l.301 |
| error | «El RUT del representante legal es requerido» | `!clienteForm.rut_representante.trim()` | handleSaveCliente · l.305 |
| error | «El RUT del representante legal no es válido» | `!validateRut(clienteForm.rut_representante)` | handleSaveCliente · l.309 |
| error | «Ya existe otro cliente con este RUT» | `editingCliente && clienteForm.rut !== editingCliente.rut && existingCliente` | handleSaveCliente · l.328 |
| success | «Cliente actualizado exitosamente» | `editingCliente` | handleSaveCliente · l.378 |
| error | «Ya existe un cliente con este RUT» | `!(editingCliente) && existingCliente` | handleSaveCliente · l.391 |
| success | «Cliente creado exitosamente» | `!(editingCliente)` | handleSaveCliente · l.420 |
| error | «Error al guardar cliente:» |  | handleSaveCliente · l.428 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!user` | checkAuth · l.99 |
| `/dashboard` | `router.push` | `!profile` | checkAuth · l.111 |
| `/dashboard` | `router.push` | `userRole !== 'admin'` | checkAuth · l.118 |
| `/login` | `router.push` |  | checkAuth · l.126 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(user.id)` | checkAuth · l.115 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Clientes · userRole: admin | `!isAdmin` |  | ClientsManagement · l.434 |
| `MainLayout` | pageTitle: Gestión de Clientes · userRole: admin |  |  | ClientsManagement · l.449 |

**Values shown from data** (5)

- `{cliente.nombre_fantasia}` — ClientsManagement · l.526, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes`
- `{cliente.nombre_legal}` — ClientsManagement · l.527, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes`
- `{cliente.rut}` — ClientsManagement · l.531, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes`
- `{cliente.nombre_representante}` — ClientsManagement · l.534, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes`
- `{cliente.rut_representante}` — ClientsManagement · l.535, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes`

**Other texts on screen** (20)

- «Administra todos los clientes y sus datos» — ClientsManagement · l.460
- «Intenta con otro término de búsqueda / Comienza creando el primer cliente» — ClientsManagement · l.495, when `!(loading) && filteredClientes.length === 0`
- «Sin vincular» — ClientsManagement · l.544, when `!(loading) && !(filteredClientes.length === 0) && each filteredClientes && !(cliente.schools)`
- «Nombre Legal *» (label) — ClientsManagement · l.588, when `showClientModal`
- «Nombre de Fantasía *» (label) — ClientsManagement · l.601, when `showClientModal`
- «RUT *» (label) — ClientsManagement · l.614, when `showClientModal`
- «Dirección *» (label) — ClientsManagement · l.627, when `showClientModal`
- «Comuna» (label) — ClientsManagement · l.640, when `showClientModal`
- «Ciudad» (label) — ClientsManagement · l.653, when `showClientModal`
- «Nombre Representante Legal *» (label) — ClientsManagement · l.671, when `showClientModal`
- «RUT Representante Legal *» (label) — ClientsManagement · l.684, when `showClientModal`
- «Fecha Escritura» (label) — ClientsManagement · l.697, when `showClientModal`
- «Nombre Notario» (label) — ClientsManagement · l.709, when `showClientModal`
- «Comuna Notaría» (label) — ClientsManagement · l.722, when `showClientModal`
- «Nombre Encargado» (label) — ClientsManagement · l.740, when `showClientModal`
- «Teléfono Encargado» (label) — ClientsManagement · l.753, when `showClientModal`
- «Email Encargado» (label) — ClientsManagement · l.766, when `showClientModal`
- «Nombre Contacto» (label) — ClientsManagement · l.784, when `showClientModal`
- «Teléfono Contacto» (label) — ClientsManagement · l.797, when `showClientModal`
- «Email Contacto» (label) — ClientsManagement · l.810, when `showClientModal`

**Reads and writes the database directly:** `table:clientes` (delete, insert, select, update), `table:contratos` (select), `table:profiles` (select), `table:schools` (update)

### Pieces it uses (each is listed once, under "Pieces" below)

- `types/roles.ts`
- `utils/roleUtils.ts`

## /admin/quotes/[id]/edit

File `pages/admin/quotes/[id]/edit.tsx` · 197 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `pages/admin/quotes/index.tsx:364`, `pages/admin/quotes/index.tsx:365`
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
| «Cotización no encontrada» | h1 | `!quote` | EditQuotePage · l.128 |
| «Editar Cotización» | h1 |  | EditQuotePage · l.166 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Copiar URL» | `{() => { navigator.clipboard.writeText(fullUrl); toast.success('URL copiada al p…}` | `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'` |  |  | handleSubmit · l.72 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a cotizaciones» | `/admin/quotes` | `!quote` |  | EditQuotePage · l.134 |
| «Volver a cotizaciones» | `/admin/quotes` |  |  | EditQuotePage · l.156 |
| «Ver cotización» | `/quote/[*]` (new tab) |  |  | EditQuotePage · l.176 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No se pudo cargar la cotización» | `!(response.ok && data.quote)` | fetchQuote · l.31 |
| error | «Error al cargar la cotización» |  | fetchQuote · l.36 |
| plain | «✅ Página web generada exitosamente La propuesta se abrió en una nueva pestaña {fullUrl} Copiar URL» | `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'` | handleSubmit · l.65 |
| success | «URL copiada al portapapeles» | `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'` | handleSubmit · l.75 |
| success | «Cotización actualizada exitosamente» | `response.ok && !(quoteData.status === 'sent' && quote.status !== 'sent')` | handleSubmit · l.91 |
| error | «Error al actualizar la cotización» |  | handleSubmit · l.103 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al actualizar la cotización» | `throw (shown by whoever catches it)` | `!(response.ok)` | handleSubmit · l.99 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `/admin/quotes` | `router.push` | `!(response.ok && data.quote)` | fetchQuote · l.32 |
| `/admin/quotes` | `router.push` |  | fetchQuote · l.37 |
| `{fullUrl}` | `window.open` | `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'` | handleSubmit · l.62 |
| `/admin/quotes` | `router.push` | `response.ok` | handleSubmit · l.96 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | EditQuotePage · l.112 |
| `MainLayout` |  | `!quote` |  | EditQuotePage · l.125 |
| `MainLayout` |  |  |  | EditQuotePage · l.148 |
| `QuoteFormV2` |  |  |  | EditQuotePage · l.189 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | handleSubmit · l.95 |
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{fullUrl}` — handleSubmit · l.70, when `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'`
- `{quote.client_name}` — EditQuotePage · l.171

**Other texts on screen** (6)

- «✅ Página web generada exitosamente» — handleSubmit · l.68, when `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'`
- «La propuesta se abrió en una nueva pestaña» — handleSubmit · l.69, when `response.ok && quoteData.status === 'sent' && quote.status !== 'sent'`
- «Cargando cotización...» — EditQuotePage · l.116, when `loading`
- «La cotización que intentas editar no existe o fue eliminada.» — EditQuotePage · l.132, when `!quote`
- «Editar Cotización - {quote.client_name} \| Genera» — EditQuotePage · l.150
- «Editando cotización para:» — EditQuotePage · l.171

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/quotes/QuoteFormV2.tsx`
- `components/quotes/QuoteGroupsForm.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quotes/[id]` | GET, PUT | `pages/admin/quotes/[id]/edit.tsx:25`, `pages/admin/quotes/[id]/edit.tsx:46` |
| `/api/quotes/[id]/groups` | GET | `components/quotes/QuoteFormV2.tsx:116` |
| `/api/quotes/programs` | GET | `components/quotes/QuoteFormV2.tsx:104` |

## /admin/quotes

File `pages/admin/quotes/index.tsx` · 438 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Propuestas Pasantías» → `/admin/quotes` — permission: view_internship_proposals_all or view_internship_proposals_school or view_internship_proposals_own; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.566)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/layout/Sidebar.tsx:568`, `pages/admin/quotes/[id]/edit.tsx:134`, `pages/admin/quotes/[id]/edit.tsx:135`, `pages/admin/quotes/[id]/edit.tsx:156`, `pages/admin/quotes/[id]/edit.tsx:157`, `pages/admin/quotes/[id]/edit.tsx:32`, `pages/admin/quotes/[id]/edit.tsx:37`, `pages/admin/quotes/[id]/edit.tsx:96`, `pages/admin/quotes/new.tsx:68`, `pages/admin/quotes/new.tsx:91`, `pages/admin/quotes/new.tsx:92`
- Tests: no browser test that CI runs.
- QA scenarios that name this address: admin 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | sent to /dashboard |
| equipo_directivo | no | sent to /dashboard |
| lider_generacion | no | sent to /dashboard |
| lider_comunidad | no | sent to /dashboard |
| supervisor_de_red | no | sent to /dashboard |
| community_manager | if permission view_internship_proposals_all or view_internship_proposals_school or view_internship_proposals_own | sent to /dashboard — **the menu shows it, the middleware refuses** |
| docente | no | sent to /dashboard |
| encargado_licitacion | if permission view_internship_proposals_all or view_internship_proposals_school or view_internship_proposals_own | sent to /dashboard — **the menu shows it, the middleware refuses** |

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Cotizaciones - Pasantías Barcelona» | h1 |  | QuotesManagementPageContent · l.164 |
| «Confirmar eliminación» | h3 | `deleteModalOpen && quoteToDelete` | QuotesManagementPageContent · l.403 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Copy]» · tooltip «Copiar URL» | `{() => copyShareUrl(quote.id)}` | `each filteredQuotes` |  |  | QuotesManagementPageContent · l.346 |
| «[icon Trash2]» · tooltip «Eliminar» | `{() => handleDelete(quote)}` | `each filteredQuotes` |  |  | QuotesManagementPageContent · l.372 |
| «Cancelar» | `{() => setDeleteModalOpen(false)}` | `deleteModalOpen && quoteToDelete` |  |  | QuotesManagementPageContent · l.409 |
| «Eliminar» | `{confirmDelete}` | `deleteModalOpen && quoteToDelete` |  |  | QuotesManagementPageContent · l.415 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Nueva Cotización» | `/admin/quotes/new` |  |  | QuotesManagementPageContent · l.174 |
| «[icon ExternalLink]» · tooltip «Ver cotización» | `/quote/[*]` (new tab) | `each filteredQuotes` |  | QuotesManagementPageContent · l.354 |
| «[icon Edit]» | `/admin/quotes/[*]/edit` | `each filteredQuotes` |  | QuotesManagementPageContent · l.364 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por N° cotización, cliente, email o institución...» | text | «Buscar por N° cotización, cliente, email o institución...» |  |  |  | QuotesManagementPageContent · l.239 |
|  | select |  | «Todos los estados», «Borrador», «Enviada», «Vista», «Aceptada», «Rechazada», «Expirada» |  |  | QuotesManagementPageContent · l.248 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «N° Cotización» |  | QuotesManagementPageContent · l.270 |
| «Cliente» |  | QuotesManagementPageContent · l.273 |
| «Fechas» |  | QuotesManagementPageContent · l.276 |
| «Detalles» |  | QuotesManagementPageContent · l.279 |
| «Total» |  | QuotesManagementPageContent · l.282 |
| «Estado» |  | QuotesManagementPageContent · l.285 |
| «Acciones» |  | QuotesManagementPageContent · l.288 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Confirmar eliminación» | written in this file | `deleteModalOpen && quoteToDelete` |  | QuotesManagementPageContent · l.401 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las cotizaciones» |  | fetchQuotes · l.64 |
| success | «Cotización eliminada exitosamente» | `response.ok` | confirmDelete · l.84 |
| error | «Error al eliminar la cotización» |  | confirmDelete · l.91 |
| success | «URL copiada al portapapeles» |  | copyShareUrl · l.101 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al eliminar la cotización» | `throw (shown by whoever catches it)` | `!(response.ok)` | confirmDelete · l.87 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  | `loading` |  | QuotesManagementPageContent · l.145 |
| `MainLayout` |  |  |  | QuotesManagementPageContent · l.154 |
| `HasPermission` | permission: create_internship_proposals_all |  |  | QuotesManagementPageContent · l.173 |
| `PermissionGuard` | permission: view_internship_proposals_all · redirectTo: /admin |  |  | QuotesManagementPage · l.431 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `statusConfig` | «Borrador», «Enviada», «Vista», «Aceptada», «Rechazada», «Expirada» | getStatusBadge · l.114 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Editar» | QuotesManagementPageContent · l.367 |

**Values shown from data** (12)

- `{quotes.length}` — QuotesManagementPageContent · l.191
- `{quotes.filter(q => ['sent', 'viewed…}` — QuotesManagementPageContent · l.201
- `{quotes.filter(q => q.status === 'ac…}` — QuotesManagementPageContent · l.213
- `$ {quotes.reduce((sum, q) => sum + q.g…}` — QuotesManagementPageContent · l.225
- `# {quote.quote_number} / ---` — QuotesManagementPageContent · l.298, when `each filteredQuotes`
- `{formatDate(quote.created_at)}` — QuotesManagementPageContent · l.299, when `each filteredQuotes`
- `{quote.client_name}` — QuotesManagementPageContent · l.304, when `each filteredQuotes`
- `{quote.client_institution}` — QuotesManagementPageContent · l.306, when `each filteredQuotes && quote.client_institution`
- `{quote.client_email}` — QuotesManagementPageContent · l.309, when `each filteredQuotes && quote.client_email`
- `{formatDate(quote.arrival_date)}` — QuotesManagementPageContent · l.317, when `each filteredQuotes`
- `$ {quote.grand_total.toLocaleString('e…}` — QuotesManagementPageContent · l.331, when `each filteredQuotes`
- `{quoteToDelete.client_name}` — QuotesManagementPageContent · l.405, when `deleteModalOpen && quoteToDelete`

**Other texts on screen** (14)

- «Cargando cotizaciones...» — QuotesManagementPageContent · l.147, when `loading`
- «Cotizaciones - Pasantías Barcelona \| Genera» — QuotesManagementPageContent · l.156
- «Gestiona las propuestas de pasantías internacionales» — QuotesManagementPageContent · l.169
- «Total Cotizaciones» — QuotesManagementPageContent · l.190
- «Enviadas» — QuotesManagementPageContent · l.200
- «Aceptadas» — QuotesManagementPageContent · l.212
- «Valor Total» — QuotesManagementPageContent · l.224
- «{quote.nights} noches» — QuotesManagementPageContent · l.318, when `each filteredQuotes`
- «{quote.num_pasantes} pasantes» — QuotesManagementPageContent · l.327, when `each filteredQuotes`
- «CLP» — QuotesManagementPageContent · l.334, when `each filteredQuotes`
- «Vista: {formatDate(quote.viewed_at)}» — QuotesManagementPageContent · l.339, when `each filteredQuotes && quote.viewed_at`
- «No se encontraron cotizaciones con los filtros aplicados / No hay cotizaciones aún. Crea la primera!» — QuotesManagementPageContent · l.386, when `filteredQuotes.length === 0`
- «¿Estás seguro de eliminar la cotización de» — QuotesManagementPageContent · l.405, when `deleteModalOpen && quoteToDelete`
- «? Esta acción no se puede deshacer.» — QuotesManagementPageContent · l.405, when `deleteModalOpen && quoteToDelete`

**Reads and writes the database directly:** `table:pasantias_quotes` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/permissions/PermissionGuard.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quotes/[id]` | DELETE | `pages/admin/quotes/index.tsx:79` |

## /admin/quotes/new

File `pages/admin/quotes/new.tsx` · 117 lines · frame: MainLayout

### Who reaches it

- Menu: no entry.
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `pages/admin/quotes/index.tsx:174`, `pages/admin/quotes/index.tsx:175`
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

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Nueva Cotización - Pasantía Barcelona» | h1 |  | NewQuotePage · l.101 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Copiar URL» | `{() => { navigator.clipboard.writeText(fullUrl); toast.success('URL copiada al p…}` | `response.ok && result.quote && quoteData.status === 'sent' && result.share_url` |  |  | handleSubmit · l.44 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver a cotizaciones» | `/admin/quotes` |  |  | NewQuotePage · l.91 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| plain | «✅ Página web generada exitosamente La propuesta se abrió en una nueva pestaña {fullUrl} Copiar URL» | `response.ok && result.quote && quoteData.status === 'sent' && result.share_url` | handleSubmit · l.37 |
| success | «URL copiada al portapapeles» | `response.ok && result.quote && quoteData.status === 'sent' && result.share_url` | handleSubmit · l.47 |
| success | «Borrador guardado exitosamente» | `response.ok && result.quote && !(quoteData.status === 'sent' && result.share_url)` | handleSubmit · l.63 |
| error | «Error al crear la cotización» |  | handleSubmit · l.75 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al crear la cotización» | `throw (shown by whoever catches it)` | `!(response.ok && result.quote)` | handleSubmit · l.71 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `{fullUrl}` | `window.open` | `response.ok && result.quote && quoteData.status === 'sent' && result.share_url` | handleSubmit · l.34 |
| `/admin/quotes` | `router.push` | `response.ok && result.quote` | handleSubmit · l.68 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | NewQuotePage · l.83 |
| `QuoteFormV2` |  |  |  | NewQuotePage · l.113 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | handleSubmit · l.67 |

**Values shown from data** (1)

- `{fullUrl}` — handleSubmit · l.42, when `response.ok && result.quote && quoteData.status === 'sent' && result.share_url`

**Other texts on screen** (4)

- «✅ Página web generada exitosamente» — handleSubmit · l.40, when `response.ok && result.quote && quoteData.status === 'sent' && result.share_url`
- «La propuesta se abrió en una nueva pestaña» — handleSubmit · l.41, when `response.ok && result.quote && quoteData.status === 'sent' && result.share_url`
- «Nueva Cotización - Pasantías Barcelona \| Genera» — NewQuotePage · l.85
- «Crea una propuesta personalizada para tu cliente» — NewQuotePage · l.106

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/quotes/QuoteFormV2.tsx`
- `components/quotes/QuoteGroupsForm.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quotes/[id]/groups` | GET | `components/quotes/QuoteFormV2.tsx:116` |
| `/api/quotes/createV2` | POST | `pages/admin/quotes/new.tsx:18` |
| `/api/quotes/programs` | GET | `components/quotes/QuoteFormV2.tsx:104` |

## /contract-print/[id]

File `pages/contract-print/[id].tsx` · 276 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `middleware.ts:332`, `pages/contracts.tsx:1077`
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
| «Vista previa del contrato» | h2 |  | ContractPrintPage · l.182 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` | `!contrato` |  |  | ContractPrintPage · l.127 |
| «Volver» | `{() => router.back()}` | `isImportedSource` |  |  | ContractPrintPage · l.164 |
| «← Volver» | `{() => router.back()}` |  |  |  | ContractPrintPage · l.184 |
| «Imprimir / Guardar PDF» | `{() => window.print()}` |  |  |  | ContractPrintPage · l.190 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Descargar documento original» | `{contrato.contrato_url}` (new tab) | `isImportedSource && contrato.contrato_url` |  | ContractPrintPage · l.150 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `window.print()` |  | ContractPrintPage · l.191 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (2)

- `{CONTRACT_DOCUMENT_CSS}` — ContractPrintPage · l.177
- `{CONTRACT_PRINT_GUIDANCE}` — ContractPrintPage · l.204

**Other texts on screen** (6)

- «Cargando contrato...» — ContractPrintPage · l.116, when `loading`
- «Contrato no encontrado» — ContractPrintPage · l.126, when `!contrato`
- «Contrato importado» — ContractPrintPage · l.145, when `isImportedSource`
- «Este contrato fue importado desde un documento externo, por lo que no se genera una versión desde plantilla.» — ContractPrintPage · l.147, when `isImportedSource`
- «No hay un documento original cargado. Use &quot;Subir contrato&quot; para adjuntarlo.» — ContractPrintPage · l.160, when `isImportedSource && !(contrato.contrato_url)`
- «Contrato {contrato.numero_contrato} - Fundación Nueva Educación» — ContractPrintPage · l.176

**Reads and writes the database directly:** `table:contratos` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/annex-template.ts`
- `lib/contract-document.ts`
- `lib/contract-template.ts`

## /contracts

File `pages/contracts.tsx` · 1123 lines · frame: MainLayout

### Who reaches it

- Menu: Gestión › «Contratos» → `/contracts` — permission: view_contracts_all or view_contracts_school or view_contracts_own; the group: roles: admin, community_manager, encargado_licitacion (`Sidebar.tsx` l.558)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.156 `router.push → /login  (when !session?.user)`
  - l.169 `userRole = await getUserPrimaryRole(session.user.id)`
  - l.171 `router.push → /dashboard  (when !profile \|\| userRole !== 'admin')`
  - l.240 `router.push → /login`
  - l.315 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:39`, `components/layout/Sidebar.tsx:560`, `components/licitaciones/Step7Contrato.tsx:165`, `components/licitaciones/Step7Contrato.tsx:220`, `components/licitaciones/Step7Contrato.tsx:221`, `components/licitaciones/Step7Contrato.tsx:377`, `components/licitaciones/Step7Contrato.tsx:378`, `lib/auth/forced-password-change.ts:138`, `middleware.ts:333`, `pages/admin/schools.tsx:591`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`; unit tests of the page: `__tests__/pages/contracts-activation.test.tsx`.
- QA scenarios that name this address: admin 3, consultor 1, equipo_directivo 1, lider_comunidad 1.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | yes | pass |
| consultor | no | pass |
| equipo_directivo | no | pass |
| lider_generacion | no | pass |
| lider_comunidad | no | pass |
| supervisor_de_red | no | pass |
| community_manager | if permission view_contracts_all or view_contracts_school or view_contracts_own | pass |
| docente | no | pass |
| encargado_licitacion | if permission view_contracts_all or view_contracts_school or view_contracts_own | pass |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Crear Nuevo Contrato / Crear Nuevo Anexo / Editar Anexo / Editar Contrato» | h1 | `(activeTab === 'nuevo' \|\| activeTab === 'editar' \|\| activeTab === 'nuevo-anexo' \|\| activeTab === 'editar-anexo')` | ContractsPage · l.732 |
| «Contratos Registrados ( {contratos.length} )» | h2 | `activeTab === 'lista'` | ContractsPage · l.746 |
| «No hay contratos registrados» | h3 | `activeTab === 'lista' && !(contratos.length > 0)` | ContractsPage · l.897 |
| «Eliminar Contrato» | h3 | `deleteModalContrato` | ContractsPage · l.1016 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Importar PDF» · tooltip «Importar contrato desde PDF usando AI» | `{() => setShowPDFImporter(true)}` | `(activeTab === 'lista' \|\| activeTab === 'flujo')` |  |  | ContractsPage · l.688 |
| «Nuevo Anexo» | `{() => setActiveTab('nuevo-anexo')}` | `(activeTab === 'lista' \|\| activeTab === 'flujo')` |  |  | ContractsPage · l.696 |
| «Flujo de Caja» | `{() => setActiveTab('flujo')}` | `(activeTab === 'lista' \|\| activeTab === 'flujo')` |  |  | ContractsPage · l.703 |
| «Volver a Contratos» | `{() => setActiveTab('lista')}` | `(activeTab === 'nuevo' \|\| activeTab === 'editar' \|\| activeTab === 'nuevo-anexo' \|\| activeTab === 'editar-anexo')` |  |  | ContractsPage · l.724 |
| «Firma pendiente ( {firmaPendienteCount} )» · tooltip «Mostrar solo contratos activos con firma sin confirmar» | `{() => setShowFirmaPendiente(!showFirmaPendiente)}` | `activeTab === 'lista' && ((firmaPendienteCount > 0 \|\| showFirmaPendiente))` |  | `testid=firma-pendiente-filter` | ContractsPage · l.750 |
| «{contrato.numero_contrato} [ANEXO] [MANUAL] [BORRADOR]» | `{() => setSelectedContrato(contrato)}` | `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos` |  |  | ContractsPage · l.784 |
| «[icon Eye]» · tooltip «Ver detalles» | `{() => setSelectedContrato(contrato)}` | `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos` |  |  | ContractsPage · l.853 |
| «Crear Primer Contrato» | `{() => setActiveTab('nuevo')}` | `activeTab === 'lista' && !(contratos.length > 0)` |  |  | ContractsPage · l.899 |
| «Cancelar» | `{() => setDeleteModalContrato(null)}` | `deleteModalContrato` |  |  | ContractsPage · l.1032 |
| «Eliminar Contrato» | `{() => handleDeleteContract(deleteModalContrato)}` | `deleteModalContrato` |  |  | ContractsPage · l.1038 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon ExternalLink]» | `/licitaciones/[*]` | `contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos && contrato.licitacion_id` |  | ContractsPage · l.862 |

**Table columns** (5)

| Text | Shown when | Where |
|---|---|---|
| «N° Contrato» | `activeTab === 'lista' && contratos.length > 0` | ContractsPage · l.771 |
| «Cliente» | `activeTab === 'lista' && contratos.length > 0` | ContractsPage · l.772 |
| «Fecha» | `activeTab === 'lista' && contratos.length > 0` | ContractsPage · l.773 |
| «Valor Total» | `activeTab === 'lista' && contratos.length > 0` | ContractsPage · l.774 |
| «Estado» | `activeTab === 'lista' && contratos.length > 0` | ContractsPage · l.775 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Eliminar Contrato» | written in this file | `deleteModalContrato` |  | ContractsPage · l.1008 |
| `ContractDetailsModal` | component | `{!!selectedContrato}` |  | ContractsPage · l.1051 |

**Toasts** (28)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Creando contrato para: {decodeURIComponent(school_n…}» | `cliente_id && typeof cliente_id === 'string' && school_name && typeof school_name === 'string'` | checkSession · l.203 |
| success | «Datos de la licitacion cargados. Complete los campos del contrato.» | `tab === 'nuevo' && licitacion_id && typeof licitacion_id === 'string' && licRes.ok && lic` | checkSession · l.228 |
| error | «No se pudo cargar datos de la licitacion» | `tab === 'nuevo' && licitacion_id && typeof licitacion_id === 'string'` | checkSession · l.232 |
| error | «Error al actualizar la lista de contratos:» |  | loadContratos · l.265 |
| error | «Error al eliminar el contrato:» |  | handleDeleteContract · l.365 |
| success | «Contrato marcado como firmado.» |  | handleMarkSigned · l.381 |
| error | «Error al marcar el contrato como firmado:» |  | handleMarkSigned · l.385 |
| error | «Error al subir el contrato:» |  | handleUploadContract · l.429 |
| success | «Contrato activado. Recuerda subir el documento firmado cuando el cliente lo envíe.» |  | handleActivateWithoutDocument · l.453 |
| error | «Error al activar el contrato:» |  | handleActivateWithoutDocument · l.458 |
| success | «Contrato {newCashFlowStatus ? 'inclui…} flujo de caja exitosamente.» |  | handleToggleCashFlow · l.481 |
| error | «Error al actualizar el flujo de caja:» |  | handleToggleCashFlow · l.484 |
| error | «Tipo de archivo no válido. Use PDF, JPG o PNG.» | `!validTypes.includes(file.type)` | handleInvoiceUpload · l.493 |
| error | «El archivo es demasiado grande. Máximo 10MB.» | `file.size > maxSize` | handleInvoiceUpload · l.499 |
| success | «Factura subida exitosamente: {file.name}» |  | handleInvoiceUpload · l.533 |
| error | «Error al subir la factura:» |  | handleInvoiceUpload · l.540 |
| success | «Cuota marcada como {!currentStatus ? 'pagada' :…}» |  | handleTogglePaymentStatus · l.557 |
| error | «Error al actualizar el estado de pago:» |  | handleTogglePaymentStatus · l.564 |
| error | «No se encontró la factura» | `!cuota?.factura_url` | handleInvoiceDelete · l.579 |
| error | «Error al obtener el nombre del archivo» |  | handleInvoiceDelete · l.602 |
| success | «Factura eliminada exitosamente» |  | handleInvoiceDelete · l.629 |
| error | «Error al eliminar la factura:» |  | handleInvoiceDelete · l.636 |
| error | «Contrato creado pero error al vincular con licitacion: {err.error \|\| 'Error descono…}. Contacte al administrador.» | `activeTab === 'nuevo' && activeLicitacionId && contratoId && !linkRes.ok` | ContractsPage · l.933 |
| success | «Contrato generado y vinculado a la licitacion exitosamente» | `activeTab === 'nuevo' && activeLicitacionId && contratoId && !(!linkRes.ok)` | ContractsPage · l.935 |
| error | «Contrato creado pero no se pudo vincular con la licitacion. Contacte al administrador.» | `activeTab === 'nuevo' && activeLicitacionId && contratoId` | ContractsPage · l.938 |
| error | «Este contrato fue importado y no tiene el documento original cargado. Use "Subir contrato" para adjuntarlo.» | `!(target.kind === 'original') && target.kind === 'missing'` | ContractsPage · l.1074 |
| plain | «No se pudo guardar el PDF original; podrá adjuntarlo luego con "Subir contrato".» | `showPDFImporter && sourceFile` | ContractsPage · l.1108 |
| success | «Datos extraídos del PDF. Complete la información faltante.» | `showPDFImporter` | ContractsPage · l.1114 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No file name found in URL» | `throw (shown by whoever catches it)` | `!fileName` | handleInvoiceDelete · l.598 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkSession · l.156 |
| `/dashboard` | `router.push` | `!profile \|\| userRole !== 'admin'` | checkSession · l.171 |
| `/login` | `router.push` |  | checkSession · l.240 |
| `/login` | `router.push` |  | handleLogout · l.315 |
| `{target.url}` | `window.open` | `target.kind === 'original'` | ContractsPage · l.1072 |
| `/contract-print/[*]` | `window.open` | `!(target.kind === 'original') && !(target.kind === 'missing')` | ContractsPage · l.1077 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `userRole = await getUserPrimaryRole(session.user.id)` | checkSession · l.169 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` |  |  |  | ContractsPage · l.664 |
| `ResponsiveFunctionalPageHeader` | title: Contratos · subtitle: Gestión de contratos, anexos y flujo de caja · searchPlaceholder: Buscar por número, cliente... · primaryAction: Nuevo Contrato | `(activeTab === 'lista' \|\| activeTab === 'flujo')` |  | ContractsPage · l.674 |
| `ContractForm` |  | `activeTab === 'nuevo'` |  | ContractsPage · l.912 |
| `ContractForm` |  | `activeTab === 'editar' && editingContrato` |  | ContractsPage · l.959 |
| `AnnexForm` |  | `activeTab === 'nuevo-anexo'` |  | ContractsPage · l.976 |
| `AnnexForm` |  | `activeTab === 'editar-anexo' && editingAnexo` |  | ContractsPage · l.987 |
| `CashFlowView` |  | `activeTab === 'flujo'` |  | ContractsPage · l.1003 |
| `ContractPDFImporter` |  | `showPDFImporter` |  | ContractsPage · l.1088 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatCurrency()` | «UF {amount.toLocaleString('es-C…}» | formatCurrency · l.322 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Ver Licitacion» | ContractsPage · l.865 |
| «Error desconocido» | ContractsPage · l.933 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (8)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('openPDFImporterFromForm')` | ContractsPage · l.144 |
| storage | `localStorage: rememberMe` | handleLogout · l.313 |
| storage | `sessionStorage: sessionOnly` | handleLogout · l.314 |
| address value | `?cliente_id` | l.1 |
| address value | `?contrato_id` | l.1 |
| address value | `?licitacion_id` | l.1 |
| address value | `?school_name` | l.1 |
| address value | `?tab` | l.1 |

**Values shown from data** (4)

- `{contrato.clientes.nombre_legal}` — ContractsPage · l.808, when `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos`
- `{formatDate(contrato.fecha_contrato)}` — ContractsPage · l.819, when `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos`
- `{formatCurrency(contrato.precio_tota…}` — ContractsPage · l.824, when `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos`
- `{deleteModalContrato.numero_contrato}` — ContractsPage · l.1024, when `deleteModalContrato`

**Other texts on screen** (15)

- «Cargando...» — ContractsPage · l.657, when `loading`
- «{contrato.descripcion_manual} / Contrato Manual / {contrato.clientes.nombre_fantasia}» — ContractsPage · l.809, when `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos`
- «Activo / Borrador / Pendiente» — ContractsPage · l.830, when `activeTab === 'lista' && contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos`
- «FIRMA PENDIENTE» — ContractsPage · l.841, when `contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos && isFirmaPendiente(contrato)`
- «En Flujo» — ContractsPage · l.846, when `contratos.length > 0 && filteredContratos.length > 0 && each filteredContratos && contrato.incluir_en_flujo`
- «No hay contratos activos con firma pendiente» — ContractsPage · l.879, when `activeTab === 'lista' && contratos.length > 0 && !(filteredContratos.length > 0) && showFirmaPendiente`
- «que coincidan con &quot;» — ContractsPage · l.880, when `contratos.length > 0 && !(filteredContratos.length > 0) && showFirmaPendiente && searchQuery`
- «&quot;» — ContractsPage · l.880, when `contratos.length > 0 && !(filteredContratos.length > 0) && showFirmaPendiente && searchQuery`
- «. Desactiva el filtro &quot;Firma pendiente&quot; para ver todos los contratos.» — ContractsPage · l.881, when `activeTab === 'lista' && contratos.length > 0 && !(filteredContratos.length > 0) && showFirmaPendiente`
- «No se encontraron contratos para &quot;» — ContractsPage · l.885, when `activeTab === 'lista' && contratos.length > 0 && !(filteredContratos.length > 0) && !(showFirmaPendiente)`
- «&quot;. Prueba con otro número de contrato, cliente o programa.» — ContractsPage · l.885, when `activeTab === 'lista' && contratos.length > 0 && !(filteredContratos.length > 0) && !(showFirmaPendiente)`
- «Comienza creando tu primer contrato» — ContractsPage · l.898, when `activeTab === 'lista' && !(contratos.length > 0)`
- «Esta acción no se puede deshacer» — ContractsPage · l.1017, when `deleteModalContrato`
- «¿Estás seguro de que deseas eliminar el contrato» — ContractsPage · l.1023, when `deleteModalContrato`
- «Se eliminarán también todas las cuotas asociadas a este contrato.» — ContractsPage · l.1027, when `deleteModalContrato`

**Reads and writes the database directly:** `bucket:contracts` (getPublicUrl, upload), `bucket:facturas` (getPublicUrl, remove, upload), `table:clientes` (select), `table:contratos` (delete, select, update), `table:cuotas` (delete, select, update), `table:profiles` (select), `table:programas` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/contracts/AnnexForm.tsx`
- `components/contracts/CashFlowView.tsx`
- `components/contracts/ContractDetailsModal.tsx`
- `components/contracts/ContractForm.tsx`
- `components/contracts/ContractPDFImporter.tsx`
- `components/contracts/HourAllocationPanel.tsx`
- `components/contracts/ReallocationModal.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/annex-template.ts`
- `lib/contract-document.ts`
- `lib/contract-template.ts`
- `lib/contracts/extractionError.ts`
- `lib/uf-service.ts`
- `lib/utils/reconcileCuotas.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/schools` | POST | `components/contracts/ContractForm.tsx:517` |
| `/api/contracts/[id]/hours` | GET | `components/contracts/HourAllocationPanel.tsx:80` |
| `/api/contracts/[id]/hours/allocate` | DELETE, POST | `components/contracts/HourAllocationPanel.tsx:139`, `components/contracts/HourAllocationPanel.tsx:164` |
| `/api/contracts/[id]/hours/ledger/csv` | ? | `components/contracts/HourAllocationPanel.tsx:430` |
| `/api/contracts/[id]/hours/reallocate` | PATCH | `components/contracts/ReallocationModal.tsx:67` |
| `/api/contracts/extract-pdf` | POST | `components/contracts/ContractPDFImporter.tsx:129` |
| `/api/licitaciones/[id]` | GET | `pages/contracts.tsx:213` |
| `/api/licitaciones/[id]/generate-contract` | POST | `pages/contracts.tsx:924` |
| `/api/uf-value` | GET | `lib/uf-service.ts:215` |

## /quote/[id]

File `pages/quote/[id].tsx` · 129 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.80 `router.push → /  (when error)`
- Linked from: `pages/admin/quotes/[id]/edit.tsx:176`, `pages/admin/quotes/[id]/edit.tsx:177`, `pages/admin/quotes/index.tsx:354`, `pages/admin/quotes/index.tsx:355`, `pages/api/quotes/create.ts:129`, `pages/api/quotes/createV2.ts:224`
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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Cotización no encontrada» | h1 | `error` | PublicQuotePage · l.75 |
| «Cotización no disponible» | h1 | `!quote` | PublicQuotePage · l.99 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver al inicio» | `{() => router.push('/')}` | `error` |  |  | PublicQuotePage · l.79 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se pudo cargar la cotización» | `setError` | `!(response.ok && data.quote)` | fetchQuote · l.28 |
| «Error al cargar la cotización» | `setError` |  | fetchQuote · l.32 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/` | `router.push` | `error` | PublicQuotePage · l.80 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `QuotePublicView` |  |  |  | PublicQuotePage · l.126 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `pageTitle` | «Cotización Pasantía Barcelona - {quote.client_name}» | PublicQuotePage · l.110 |
| `pageDescription` | «Propuesta personalizada de pasantía educativa en Barcelona para {quote.client_name}. {quote.nights} noches, {quote.num_pasantes} participantes.» | PublicQuotePage · l.111 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| address value | `[id] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{error}` — PublicQuotePage · l.78, when `error`

**Other texts on screen** (6)

- «Cargando Cotización - Fundación Nueva Educación» — PublicQuotePage · l.42, when `loading`
- «Cargando cotización...» — PublicQuotePage · l.47, when `loading`
- «Error - Fundación Nueva Educación» — PublicQuotePage · l.57, when `error`
- «Cotización no encontrada - Fundación Nueva Educación» — PublicQuotePage · l.95, when `!quote`
- «La cotización que buscas no está disponible o ha sido eliminada.» — PublicQuotePage · l.103, when `!quote`
- «{pageTitle} - Fundación Nueva Educación» — PublicQuotePage · l.116

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/quotes/QuotePublicView.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/quotes/[id]` | GET | `pages/quote/[id].tsx:22` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/contracts/AnnexForm.tsx

Used by: `/contracts`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Editar Anexo / Crear Nuevo Anexo» | h2 |  | AnnexForm · l.447 |
| «Seleccionar Cliente» | h3 | `step === 'cliente' && !loadingParent` | AnnexForm · l.505 |
| «Seleccionar Contrato de {clientes.find(c => c.id === selecte…}» | h3 | `step === 'contrato' && !loadingParent` | AnnexForm · l.529 |
| «Detalles del Anexo para {selectedContrato.numero_contrato}» | h3 | `step === 'anexo' && selectedContrato && !loadingParent` | AnnexForm · l.569 |
| «Configurar Cuotas» | h3 | `step === 'cuotas' && !loadingParent` | AnnexForm · l.649 |
| «Cuota {cuota.numero_cuota}» | h4 | `step === 'cuotas' && !loadingParent && each cuotas` | AnnexForm · l.664 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Cuota» | `{addCuota}` | `step === 'cuotas' && !loadingParent` |  |  | AnnexForm · l.650 |
| «[icon Trash2]» · tooltip «Eliminar cuota» | `{() => removeCuota(index)}` | `step === 'cuotas' && !loadingParent && each cuotas && cuotas.length > 1` |  |  | AnnexForm · l.666 |
| «Cancelar» | `{onCancel}` | `!loadingParent` |  |  | AnnexForm · l.723 |
| «Anterior» | `{prevStep}` | `!loadingParent && step !== 'cliente'` |  |  | AnnexForm · l.731 |
| «Vista Previa» | `{generatePreviewPDF}` | `!loadingParent && step === 'cuotas'` |  |  | AnnexForm · l.743 |
| «Guardando... / Actualizar Anexo / Crear Anexo» | `{handleSaveAnnex}` | `!loadingParent && step === 'cuotas'` | `{loading}` |  | AnnexForm · l.754 |
| «Siguiente» | `{nextStep}` | `!loadingParent && !(step === 'cuotas')` |  |  | AnnexForm · l.773 |

**Other things that react to a click** (2)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{cliente.nombre_legal} {cliente.nombre_fantasia} RUT: {cliente.rut}» | `{() => handleClienteSelect(cliente.id)}` | `step === 'cliente' && !loadingParent && each clientes` | AnnexForm · l.508 |
| `div` | «{contrato.numero_contrato} {contrato.programas.nombre} Fecha: {(() => { const parts = contrato.fec…} Valor: $ / UF {con…» | `{() => handleContratoSelect(contrato.id)}` | `step === 'contrato' && !loadingParent && each clienteContratos` | AnnexForm · l.534 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Fecha del Anexo *» | date |  |  | `step === 'anexo' && selectedContrato && !loadingParent` |  | AnnexForm · l.578 |
| «Número de Participantes *» | number | `min=1` |  | `step === 'anexo' && selectedContrato && !loadingParent` |  | AnnexForm · l.590 |
| «Nombre del Ciclo *» | select |  | «(lista) {cycle}» | `step === 'anexo' && selectedContrato && !loadingParent` |  | AnnexForm · l.603 |
| «Tipo de Moneda *» | select |  | «UF (Unidad de Fomento)», «CLP (Pesos Chilenos)» | `step === 'anexo' && selectedContrato && !loadingParent` |  | AnnexForm · l.618 |
| «Precio Total ( {annexForm.tipo_moneda} ) *» | number | `min=0 step={annexForm.tipo_moneda === 'UF' ? '0.01' : '1'}` |  | `step === 'anexo' && selectedContrato && !loadingParent` |  | AnnexForm · l.632 |
| «Fecha de Vencimiento *» | date |  |  | `step === 'cuotas' && !loadingParent && each cuotas` |  | AnnexForm · l.682 |
| «Monto ( {annexForm.tipo_moneda} ) *» | number | `min=0 step={annexForm.tipo_moneda === 'UF' ? '0.01' : '1'}` |  | `step === 'cuotas' && !loadingParent && each cuotas` |  | AnnexForm · l.694 |

**Toasts** (13)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar el contrato padre» |  | loadParentContract · l.149 |
| error | «Error al cargar contratos del cliente» |  | loadClienteContratos · l.179 |
| error | «La fecha del anexo es obligatoria» | `!annexForm.anexo_fecha` | handleSaveAnnex · l.262 |
| error | «Debe haber al menos 1 participante» | `annexForm.numero_participantes < 1` | handleSaveAnnex · l.267 |
| error | «El precio total debe ser mayor a 0» | `annexForm.precio_total_uf <= 0` | handleSaveAnnex · l.272 |
| error | «Debe agregar al menos una cuota válida» | `validCuotas.length === 0` | handleSaveAnnex · l.281 |
| error | «La suma de las cuotas debe ser igual al precio total» | `Math.abs(totalCuotas - annexForm.precio_total_uf) > 0.01` | handleSaveAnnex · l.287 |
| success | «Anexo actualizado exitosamente» | `editingAnnex` | handleSaveAnnex · l.319 |
| success | «Anexo creado exitosamente» | `!(editingAnnex)` | handleSaveAnnex · l.367 |
| error | «Error al guardar el anexo:» |  | handleSaveAnnex · l.374 |
| error | «Error al generar la vista previa» |  | generatePreviewPDF · l.407 |
| error | «Seleccione un cliente» | `step === 'cliente' && !selectedClienteId` | nextStep · l.413 |
| error | «Seleccione un contrato» | `step === 'contrato' && !selectedContratoId` | nextStep · l.417 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se ha seleccionado un contrato padre» | `throw (shown by whoever catches it)` | `!editingAnnex && !selectedContrato` | handleSaveAnnex · l.257 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `cycleOptions` | «Primer Ciclo», «Segundo Ciclo», «Tercer Ciclo», «Equipo Directivo» | AnnexForm · l.436 |

**Values shown from data** (5)

- `{label}` — AnnexForm · l.476, when `each [ { key: 'cliente', label: 'Cliente', icon: Users…`
- `{cliente.nombre_legal}` — AnnexForm · l.517, when `step === 'cliente' && !loadingParent && each clientes`
- `{cliente.nombre_fantasia}` — AnnexForm · l.518, when `step === 'cliente' && !loadingParent && each clientes`
- `{contrato.numero_contrato}` — AnnexForm · l.543, when `step === 'contrato' && !loadingParent && each clienteContratos`
- `{contrato.programas.nombre}` — AnnexForm · l.544, when `step === 'contrato' && !loadingParent && each clienteContratos`

**Other texts on screen** (13)

- «Cargando datos del anexo...» — AnnexForm · l.497, when `editingAnnex && loadingParent`
- «RUT: {cliente.rut}» — AnnexForm · l.519, when `step === 'cliente' && !loadingParent && each clientes`
- «Fecha: {(() => { const parts = contrato.fec…}» — AnnexForm · l.545, when `step === 'contrato' && !loadingParent && each clienteContratos`
- «Valor: $ / UF {contrato.precio_total_uf.toLocaleSt…}» — AnnexForm · l.557, when `step === 'contrato' && !loadingParent && each clienteContratos`
- «Fecha del Anexo *» (label) — AnnexForm · l.575, when `step === 'anexo' && selectedContrato && !loadingParent`
- «Número de Participantes *» (label) — AnnexForm · l.587, when `step === 'anexo' && selectedContrato && !loadingParent`
- «Nombre del Ciclo *» (label) — AnnexForm · l.600, when `step === 'anexo' && selectedContrato && !loadingParent`
- «Tipo de Moneda *» (label) — AnnexForm · l.615, when `step === 'anexo' && selectedContrato && !loadingParent`
- «Precio Total ( {annexForm.tipo_moneda} ) *» (label) — AnnexForm · l.629, when `step === 'anexo' && selectedContrato && !loadingParent`
- «Fecha de Vencimiento *» (label) — AnnexForm · l.679, when `step === 'cuotas' && !loadingParent && each cuotas`
- «Monto ( {annexForm.tipo_moneda} ) *» (label) — AnnexForm · l.691, when `step === 'cuotas' && !loadingParent && each cuotas`
- «Total del Anexo:» — AnnexForm · l.710, when `step === 'cuotas' && !loadingParent`
- «Suma de Cuotas:» — AnnexForm · l.713, when `step === 'cuotas' && !loadingParent`

**Reads and writes the database directly:** `table:contratos` (insert, select, update), `table:cuotas` (insert)

### components/contracts/CashFlowView.tsx

Used by: `/contracts`

**Titles** (6)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Valor UF Actual» | h4 |  | CashFlowView · l.435 |
| «Resumen de Todos los Contratos» | h3 |  | CashFlowView · l.579 |
| «Flujo de Caja - Próximos 3 / 6 / 12 Meses» | h3 |  | CashFlowView · l.621 |
| «Cuotas Vencidas ( {overdueCuotas.length} )» | h3 | `overdueCuotas.length > 0` | CashFlowView · l.680 |
| «Proyección de Flujo de Caja - Mensual / Detallada» | h3 |  | CashFlowView · l.731 |
| «{formatMonth(item.fecha)}» | h4 | `viewType === 'monthly' && each cashFlow` | CashFlowView · l.743 |

**Buttons** (11)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[3 Meses] [6 Meses] [12 Meses]» | `{() => setSelectedPeriod(period)}` | `each (['3m', '6m', '12m'] as const)` |  |  | CashFlowView · l.456 |
| «UF» | `{() => setCurrencyDisplay('UF')}` |  |  |  | CashFlowView · l.474 |
| «CLP» | `{() => setCurrencyDisplay('CLP')}` |  |  |  | CashFlowView · l.484 |
| «Ambos» | `{() => setCurrencyDisplay('BOTH')}` |  |  |  | CashFlowView · l.494 |
| «Vista Mensual» | `{() => setViewType('monthly')}` |  |  |  | CashFlowView · l.508 |
| «Vista Detallada» | `{() => setViewType('detailed')}` |  |  |  | CashFlowView · l.518 |
| «Todas» | `{() => setPaymentFilter('all')}` | `viewType === 'detailed'` |  |  | CashFlowView · l.540 |
| «Vencidas sin pagar» | `{() => setPaymentFilter('due_unpaid')}` | `viewType === 'detailed'` |  |  | CashFlowView · l.550 |
| «Vencidas pagadas» | `{() => setPaymentFilter('due_paid')}` | `viewType === 'detailed'` |  |  | CashFlowView · l.560 |
| «Ver menos / Ver todas» | `{() => setShowAllOverdue(!showAllOverdue)}` | `overdueCuotas.length > 0 && overdueCuotas.length > 5` |  |  | CashFlowView · l.683 |
| «[icon Check]» | `{() => handlePaymentStatusToggle(cuota.id, cuota.factura_pagada \|\| false)}` | `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…` |  |  | CashFlowView · l.864 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver» | `{cuota.factura_url}` (new tab) | `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.… && cuota.factura_url` |  | CashFlowView · l.830 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «[icon Upload]» | file | accepts `.pdf,.jpg,.jpeg,.png` |  | `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.… && !(cuota.factura_url)` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | CashFlowView · l.840 |

**Table columns** (8)

| Text | Shown when | Where |
|---|---|---|
| «Fecha» | `!(viewType === 'monthly')` | CashFlowView · l.785 |
| «Cliente» | `!(viewType === 'monthly')` | CashFlowView · l.786 |
| «Contrato» | `!(viewType === 'monthly')` | CashFlowView · l.787 |
| «Cuota» | `!(viewType === 'monthly')` | CashFlowView · l.788 |
| «Monto» | `!(viewType === 'monthly')` | CashFlowView · l.789 |
| «Estado» | `!(viewType === 'monthly')` | CashFlowView · l.790 |
| «Factura» | `!(viewType === 'monthly')` | CashFlowView · l.791 |
| «Pagado» | `!(viewType === 'monthly')` | CashFlowView · l.792 |

**Browser alert()** (2)

| Text | When | Where |
|---|---|---|
| «Error al subir la factura:» |  | handleInvoiceUpload · l.384 |
| «Error al actualizar el estado de pago:» |  | handlePaymentStatusToggle · l.407 |

**Values shown from data** (19)

- `{UFService.formatCurrency(currentUFV…}` — CashFlowView · l.442, when `!(loading)`
- `{formatCurrency(getAllContractsTotal…}` — CashFlowView · l.587
- `{formatCurrency(getAllContractsTotal…}` — CashFlowView · l.598
- `{formatCurrency(getAllContractsTotal…}` — CashFlowView · l.609
- `{formatCurrency(getTotalProjected().…}` — CashFlowView · l.629
- `{formatCurrency(getTotalPaid().uf, '…}` — CashFlowView · l.640
- `{formatCurrency(getTotalPending().uf…}` — CashFlowView · l.651
- `{overdueCuotas.length}` — CashFlowView · l.666
- `{contrato.clientes.nombre_legal}` — CashFlowView · l.703, when `overdueCuotas.length > 0 && each (showAllOverdue ? overdueCuotas : overdueCuotas.s…`
- `{formatCurrency(cuota.monto_uf, cont…}` — CashFlowView · l.709, when `overdueCuotas.length > 0 && each (showAllOverdue ? overdueCuotas : overdueCuotas.s…`
- `{formatCurrency(item.total_mes, 'UF'…}` — CashFlowView · l.747, when `viewType === 'monthly' && each cashFlow`
- `{formatCurrency(item.total_pagado, '…}` — CashFlowView · l.759, when `viewType === 'monthly' && each cashFlow`
- `{formatCurrency(item.total_pendiente…}` — CashFlowView · l.765, when `viewType === 'monthly' && each cashFlow`
- `{((item.total_pagado / item.total_me…} / 0 %` — CashFlowView · l.771, when `viewType === 'monthly' && each cashFlow`
- `{formatDate(cuota.fecha_vencimiento)}` — CashFlowView · l.801, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- `{contrato.clientes.nombre_legal}` — CashFlowView · l.804, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- `{contrato.clientes.nombre_fantasia}` — CashFlowView · l.805, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- `{contrato.numero_contrato}` — CashFlowView · l.808, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- `{formatCurrency(cuota.monto_uf, cont…}` — CashFlowView · l.810, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`

**Other texts on screen** (30)

- «Utilizado para proyecciones y conversiones» — CashFlowView · l.436
- «Actualizado automáticamente» — CashFlowView · l.446
- «Filtrar por estado:» — CashFlowView · l.537, when `viewType === 'detailed'`
- «( {getAllContractsTotals().contractCou…} contratos incluidos en flujo)» — CashFlowView · l.580
- «Total de Contratos» — CashFlowView · l.586
- «Valor total de todos los contratos» — CashFlowView · l.588
- «Total Pagado» — CashFlowView · l.597
- «Cuotas ya pagadas» — CashFlowView · l.599
- «Total Pendiente» — CashFlowView · l.608
- «Cuotas por cobrar» — CashFlowView · l.610
- «Solo cuotas vencen en el período seleccionado» — CashFlowView · l.622
- «Proyectado ( 3 / 6 / 12 meses)» — CashFlowView · l.628
- «Cuotas que vencen en período» — CashFlowView · l.630
- «Pagado (período)» — CashFlowView · l.639
- «Cuotas pagadas en período» — CashFlowView · l.641
- «Pendiente (período)» — CashFlowView · l.650
- «Cuotas pendientes en período» — CashFlowView · l.652
- «Cuotas Vencidas» — CashFlowView · l.665
- «Cuotas que ya pasaron su fecha límite» — CashFlowView · l.667
- «Contrato {contrato.numero_contrato} - Cuota {cuota.numero_cuota}» — CashFlowView · l.704, when `overdueCuotas.length > 0 && each (showAllOverdue ? overdueCuotas : overdueCuotas.s…`
- «Vence: {formatDate(cuota.fecha_vencimiento)}» — CashFlowView · l.710, when `overdueCuotas.length > 0 && each (showAllOverdue ? overdueCuotas : overdueCuotas.s…`
- «... y {overdueCuotas.length - 5} cuotas vencidas más» — CashFlowView · l.716, when `overdueCuotas.length > 0 && !showAllOverdue && overdueCuotas.length > 5`
- «Haz clic en &quot;Ver todas&quot; arriba para mostrar todas las cuotas vencidas» — CashFlowView · l.720, when `overdueCuotas.length > 0 && !showAllOverdue && overdueCuotas.length > 5`
- «{item.cuotas.length} cuotas programadas» — CashFlowView · l.750, when `viewType === 'monthly' && each cashFlow`
- «Pagado» — CashFlowView · l.758, when `viewType === 'monthly' && each cashFlow`
- «Pendiente» — CashFlowView · l.764, when `viewType === 'monthly' && each cashFlow`
- «% Cobrado» — CashFlowView · l.770, when `viewType === 'monthly' && each cashFlow`
- «Cuota {cuota.numero_cuota}» — CashFlowView · l.809, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- «Pagada / Vencida / Pendiente» — CashFlowView · l.812, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.…`
- «[icon Upload]» (label) — CashFlowView · l.839, when `!(viewType === 'monthly') && each cashFlow && each filterCuotas(monthItem.cuotas) .sort((a, b) => a.… && !(cuota.factura_url)`

**Reads and writes the database directly:** `bucket:facturas` (getPublicUrl, upload), `table:cuotas` (update)

### components/contracts/ContractDetailsModal.tsx

Used by: `/contracts`

**Titles** (11)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{contrato.numero_contrato}» | h2 |  | ContractDetailsModal · l.354 |
| «Información del Contrato» | h3 |  | ContractDetailsModal · l.430 |
| «Información del Cliente» | h3 |  | ContractDetailsModal · l.471 |
| «Encargado del Proyecto» | h4 | `(contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)` | ContractDetailsModal · l.523 |
| «Contacto Administrativo» | h4 | `(contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)` | ContractDetailsModal · l.568 |
| «Información del Contrato» | h3 | `contrato.es_manual` | ContractDetailsModal · l.619 |
| «Información del Programa» | h3 | `!(contrato.es_manual) && contrato.programas` | ContractDetailsModal · l.635 |
| «Cronograma de Pagos ( {contrato.cuotas.length} cuotas)» | h3 | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.677 |
| «Subir Contrato Firmado» | h3 | `(pendingActivation \|\| firmaPendiente)` | ContractDetailsModal · l.818 |
| «Eliminar Factura» | h3 | `deleteInvoiceId` | ContractDetailsModal · l.890 |
| «Activar contrato sin documento» | h3 | `showActivateConfirm` | ContractDetailsModal · l.949 |

**Buttons** (13)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon X]» | `{onClose}` |  |  |  | ContractDetailsModal · l.357 |
| «En Flujo de Caja / Fuera de Flujo» | `{() => onToggleCashFlow(contrato)}` |  |  |  | ContractDetailsModal · l.386 |
| «Editar» | `{() => onEdit(contrato)}` |  |  |  | ContractDetailsModal · l.400 |
| «PDF» | `{() => onGeneratePDF(contrato)}` |  |  |  | ContractDetailsModal · l.408 |
| «Eliminar» | `{() => onDelete(contrato)}` |  |  |  | ContractDetailsModal · l.416 |
| «[icon Trash2]» · tooltip «Eliminar factura» | `{() => handleInvoiceDelete(cuota.id)}` | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)` | `{deletingInvoice === cuota.id}` |  | ContractDetailsModal · l.756 |
| «[icon Check]» · tooltip «{cuota.pagada ? 'Marcar como no pagado' : 'Marcar como pagado'}» | `{() => handlePaymentToggle(cuota.id, cuota.pagada \|\| false)}` | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas` |  |  | ContractDetailsModal · l.794 |
| «Activar sin documento firmado» | `{() => setShowActivateConfirm(true)}` | `((pendingActivation \|\| firmaPendiente)) && pendingActivation && !(isBorrador)` |  | `testid=activate-without-doc-btn` | ContractDetailsModal · l.850 |
| «Marcar como firmado» | `{() => onMarkSigned(contrato)}` | `((pendingActivation \|\| firmaPendiente)) && !pendingActivation && contrato.contrato_url` |  | `testid=mark-signed-btn` | ContractDetailsModal · l.865 |
| «Cancelar» | `{() => setDeleteInvoiceId(null)}` | `deleteInvoiceId` |  |  | ContractDetailsModal · l.905 |
| «Eliminar Factura» | `{confirmInvoiceDelete}` | `deleteInvoiceId` |  |  | ContractDetailsModal · l.911 |
| «Cancelar» | `{() => setShowActivateConfirm(false)}` | `showActivateConfirm` | `{activating}` | `testid=cancel-activate-btn` | ContractDetailsModal · l.964 |
| «Activando... / Activar Contrato» | `{handleActivateWithoutDocument}` | `showActivateConfirm` | `{activating}` | `testid=confirm-activate-btn` | ContractDetailsModal · l.973 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon Eye]» · tooltip «Ver factura» | `{cuota.factura_url}` (new tab) | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)` |  | ContractDetailsModal · l.737 |
| «[icon Download]» · tooltip «Descargar factura» | `{cuota.factura_url}` | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)` |  | ContractDetailsModal · l.747 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «[icon Upload]» | file | accepts `.pdf,.jpg,.jpeg,.png` |  | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && !(cuota.factura_url && !hiddenInvoices.has(cuota.id))` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | ContractDetailsModal · l.775 |
| «Subiendo... / Subir Contrato Firmado» | file | accepts `.pdf,.doc,.docx` |  | `(pendingActivation \|\| firmaPendiente)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `testid={uploadVariant.testid}` | ContractDetailsModal · l.822 |

**Table columns** (6)

| Text | Shown when | Where |
|---|---|---|
| «Cuota» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.684 |
| «Fecha Vencimiento» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.685 |
| «Monto» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.686 |
| «Estado» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.687 |
| «Factura» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.688 |
| «Pagado» | `contrato.cuotas && contrato.cuotas.length > 0` | ContractDetailsModal · l.689 |

**Pop-ups** (4)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «{contrato.numero_contrato}» | written in this file |  |  | ContractDetailsModal · l.345 |
| «Eliminar Factura» | written in this file | `deleteInvoiceId` |  | ContractDetailsModal · l.882 |
| «Activar contrato sin documento» | written in this file | `showActivateConfirm` |  | ContractDetailsModal · l.925 |
| «Activar contrato sin documento» | written in this file | `showActivateConfirm` |  | ContractDetailsModal · l.926 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> [icon Download]` | `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)` | ContractDetailsModal · l.747 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!isOpen` | ContractDetailsModal · l.163 |
| `event.key !== 'Tab'` | ContractDetailsModal · l.934 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `HourAllocationPanel` |  | `contrato.estado === 'activo' && contrato.horas_contratadas != null && contrato.horas_contratadas > 0` |  | ContractDetailsModal · l.667 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (5)

| Name | Texts | Where |
|---|---|---|
| `uploadVariant` | «bg-yellow-50 border border-yellow-200 rounded-lg p-4 / text-sm text-yellow-800 mb-4 / El contrato está pendiente. Sube el documento firmado para activar el contrato. / flex items-center justify-center space-x-3 w-full p-4 border-2 border-dashed border-yellow-300 rounded-lg hover:border-yellow-400 t…» | ContractDetailsModal · l.171 |
| `sizes` | «KB», «MB», «GB» | formatFileSize · l.219 |
| `formatCurrency()` | «UF {amount.toLocaleString('es-C…}» | formatCurrency · l.211 |
| `formatFileSize()` | «0 B» | formatFileSize · l.220 |
| `formatUploadDate()` | «Hace {diffMins} minuto{diffMins !== 1 ? 's' : ''}», «Hace {diffHours} hora{diffHours !== 1 ? 's' : ''}», «Ayer», «Hace {diffDays} días» | formatUploadDate · l.243 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «El contrato está activo sin documento firmado confirmado. Súbelo cuando el cliente lo envíe.» | ContractDetailsModal · l.186 |
| «Hace {diffMins} minuto{diffMins !== 1 ? 's' : ''}» | ContractDetailsModal · l.243 |
| «Hace {diffHours} hora{diffHours !== 1 ? 's' : ''}» | ContractDetailsModal · l.245 |
| «Ayer» | ContractDetailsModal · l.247 |
| «Hace {diffDays} días» | ContractDetailsModal · l.249 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('keydown')` | ContractDetailsModal · l.135 |
| focus | `cancelActivateRef.current.focus()` | ContractDetailsModal · l.149 |
| focus | `next.focus()` | ContractDetailsModal · l.940 |

**Values shown from data** (27)

- `{contrato.numero_contrato}` — ContractDetailsModal · l.437
- `{formatDate(contrato.fecha_contrato)}` — ContractDetailsModal · l.445
- `{formatDate(contrato.fecha_fin)}` — ContractDetailsModal · l.454, when `contrato.fecha_fin`
- `{formatCurrency(contrato.precio_tota…}` — ContractDetailsModal · l.463
- `{contrato.clientes.nombre_legal}` — ContractDetailsModal · l.478
- `{contrato.clientes.nombre_fantasia}` — ContractDetailsModal · l.486
- `{contrato.clientes.rut}` — ContractDetailsModal · l.494
- `{contrato.clientes.direccion}` — ContractDetailsModal · l.502
- `{contrato.clientes.comuna} , {contrato.clientes.ciudad}` — ContractDetailsModal · l.503
- `{contrato.clientes.nombre_representa…}` — ContractDetailsModal · l.511
- `{contrato.clientes.nombre_encargado_…}` — ContractDetailsModal · l.530, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.nombre_encargado_proyecto`
- `{contrato.clientes.telefono_encargad…}` — ContractDetailsModal · l.543, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.telefono_encargado_proyecto`
- `{contrato.clientes.email_encargado_p…}` — ContractDetailsModal · l.555, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.email_encargado_proyecto`
- `{contrato.clientes.nombre_contacto_a…}` — ContractDetailsModal · l.580, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.nombre_contacto_administrativo`
- `{contrato.clientes.telefono_contacto…}` — ContractDetailsModal · l.593, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.telefono_contacto_administrativo`
- `{contrato.clientes.email_contacto_ad…}` — ContractDetailsModal · l.605, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.email_contacto_administrativo`
- `{contrato.descripcion_manual}` — ContractDetailsModal · l.628, when `contrato.es_manual && contrato.descripcion_manual`
- `{contrato.programas.nombre}` — ContractDetailsModal · l.640, when `!(contrato.es_manual) && contrato.programas`
- `{contrato.programas.codigo_servicio}` — ContractDetailsModal · l.644, when `!(contrato.es_manual) && contrato.programas`
- `{contrato.programas.modalidad}` — ContractDetailsModal · l.648, when `!(contrato.es_manual) && contrato.programas`
- `{contrato.programas.descripcion}` — ContractDetailsModal · l.658, when `!(contrato.es_manual) && contrato.programas && contrato.programas.descripcion`
- `{formatDate(cuota.fecha_vencimiento)}` — ContractDetailsModal · l.696, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas`
- `{formatCurrency(cuota.monto_uf)}` — ContractDetailsModal · l.697, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas`
- `{getFileIcon(cuota.factura_type)}` — ContractDetailsModal · l.721, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)`
- `{formatFileSize(cuota.factura_size)}` — ContractDetailsModal · l.729, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id) && cuota.factura_size`
- `• {formatUploadDate(cuota.factura_uplo…}` — ContractDetailsModal · l.732, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id) && cuota.factura_uploaded_at`
- `{uploadVariant.introText}` — ContractDetailsModal · l.820, when `(pendingActivation \|\| firmaPendiente)`

**Other texts on screen** (46)

- «Detalles del Contrato» — ContractDetailsModal · l.355
- «Activo / Borrador / Pendiente» — ContractDetailsModal · l.370
- «Firma pendiente» — ContractDetailsModal · l.382, when `firmaPendiente`
- «Número de Contrato» — ContractDetailsModal · l.436
- «Fecha de Contrato» — ContractDetailsModal · l.444
- «Fecha de Fin» — ContractDetailsModal · l.453, when `contrato.fecha_fin`
- «Valor Total» — ContractDetailsModal · l.462
- «Nombre Legal» — ContractDetailsModal · l.477
- «Nombre Fantasía» — ContractDetailsModal · l.485
- «RUT» — ContractDetailsModal · l.493
- «Dirección» — ContractDetailsModal · l.501
- «Representante» — ContractDetailsModal · l.510
- «RUT: {contrato.clientes.rut_representante}» — ContractDetailsModal · l.513, when `contrato.clientes.rut_representante`
- «Nombre» — ContractDetailsModal · l.529, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.nombre_encargado_proyecto`
- «Teléfono» — ContractDetailsModal · l.542, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.telefono_encargado_proyecto`
- «Email» — ContractDetailsModal · l.554, when `((contrato.clientes.nombre_encargado_proyecto \|\| contrato.clientes.telefono_encargado_proyecto \|\| contrato.clientes.email_encargado_proyecto)) && contrato.clientes.email_encargado_proyecto`
- «Contacto para facturación:» — ContractDetailsModal · l.571, when `(contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)`
- «A esta persona se enviarán las facturas y documentos administrativos» — ContractDetailsModal · l.571, when `(contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)`
- «Nombre» — ContractDetailsModal · l.579, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.nombre_contacto_administrativo`
- «Teléfono» — ContractDetailsModal · l.592, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.telefono_contacto_administrativo`
- «Email de Facturación» — ContractDetailsModal · l.604, when `((contrato.clientes.nombre_contacto_administrativo \|\| contrato.clientes.telefono_contacto_administrativo \|\| contrato.clientes.email_contacto_administrativo)) && contrato.clientes.email_contacto_administrativo`
- «Tipo de Contrato» — ContractDetailsModal · l.622, when `contrato.es_manual`
- «Contrato Manual» — ContractDetailsModal · l.623, when `contrato.es_manual`
- «Descripción» — ContractDetailsModal · l.627, when `contrato.es_manual && contrato.descripcion_manual`
- «Nombre del Programa» — ContractDetailsModal · l.639, when `!(contrato.es_manual) && contrato.programas`
- «Código de Servicio» — ContractDetailsModal · l.643, when `!(contrato.es_manual) && contrato.programas`
- «Modalidad» — ContractDetailsModal · l.647, when `!(contrato.es_manual) && contrato.programas`
- «Horas Totales» — ContractDetailsModal · l.651, when `!(contrato.es_manual) && contrato.programas`
- «{contrato.programas.horas_totales} horas» — ContractDetailsModal · l.652, when `!(contrato.es_manual) && contrato.programas`
- «Descripción» — ContractDetailsModal · l.657, when `!(contrato.es_manual) && contrato.programas && contrato.programas.descripcion`
- «Cuota {cuota.numero_cuota}» — ContractDetailsModal · l.695, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas`
- «Pagada / Vencida / Pendiente» — ContractDetailsModal · l.699, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas`
- «{cuota.factura_filename \|\| cuota.factura_url.split('/').pop()}» (title) — ContractDetailsModal · l.722, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)`
- «{cuota.factura_filename} / {cuota.factura_url.split('/').pop()?…} / Factura» — ContractDetailsModal · l.722, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && cuota.factura_url && !hiddenInvoices.has(cuota.id)`
- «[icon Upload]» (label) — ContractDetailsModal · l.774, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && !(cuota.factura_url && !hiddenInvoices.has(cuota.id))`
- «Subir factura» (title) — ContractDetailsModal · l.781, when `contrato.cuotas && contrato.cuotas.length > 0 && each contrato.cuotas && !(cuota.factura_url && !hiddenInvoices.has(cuota.id))`
- «Subiendo... / Subir Contrato Firmado» (label) — ContractDetailsModal · l.821, when `(pendingActivation \|\| firmaPendiente)`
- «Este contrato es un borrador: complétalo y guárdalo antes de poder activarlo sin documento.» — ContractDetailsModal · l.843, when `((pendingActivation \|\| firmaPendiente)) && pendingActivation && isBorrador`
- «¿El cliente aún no envía el documento firmado?» — ContractDetailsModal · l.848, when `((pendingActivation \|\| firmaPendiente)) && pendingActivation && !(isBorrador)`
- «¿El documento ya cargado corresponde al contrato firmado?» — ContractDetailsModal · l.863, when `((pendingActivation \|\| firmaPendiente)) && !pendingActivation && contrato.contrato_url`
- «Esta acción no se puede deshacer» — ContractDetailsModal · l.891, when `deleteInvoiceId`
- «¿Está seguro de que desea eliminar esta factura?» — ContractDetailsModal · l.897, when `deleteInvoiceId`
- «La factura será eliminada permanentemente del sistema.» — ContractDetailsModal · l.900, when `deleteInvoiceId`
- «La firma quedará pendiente» — ContractDetailsModal · l.950, when `showActivateConfirm`
- «El contrato quedará activo y se incluirá en el flujo de caja.» — ContractDetailsModal · l.956, when `showActivateConfirm`
- «Podrás subir el documento firmado cuando el cliente lo envíe; mientras tanto el contrato se mostrará con firma pendiente.» — ContractDetailsModal · l.959, when `showActivateConfirm`

### components/contracts/ContractForm.tsx

Used by: `/contracts`

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Información del Cliente» | h3 | `step === 'cliente'` | ContractForm · l.1144 |
| «Información Legal Adicional» | h4 | `step === 'cliente' && !esManual` | ContractForm · l.1437 |
| «Encargado del Proyecto» | h4 | `step === 'cliente' && !esManual` | ContractForm · l.1483 |
| «Contacto Administrativo [(Requerido para facturación)]» | h4 | `step === 'cliente'` | ContractForm · l.1534 |
| «Información del Contrato» | h3 | `step === 'contrato'` | ContractForm · l.1601 |
| «Plan de Pagos» | h3 | `step === 'cuotas'` | ContractForm · l.1758 |
| «Condiciones de Pago (Licitacion)» | h4 | `showCondicionesPago` | ContractForm · l.1950 |

**Buttons** (12)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Importar con AI» | `{() => { // Trigger PDF import modal from parent window.dispatchEvent(new Custom…}` | `step === 'cliente'` |  |  | ContractForm · l.1175 |
| «Cancelar / + Nueva Escuela» | `{() => setShowNewSchoolForm(!showNewSchoolForm)}` | `step === 'cliente'` |  |  | ContractForm · l.1222 |
| «Creando... / Crear Escuela» | `{handleCreateSchool}` | `step === 'cliente' && !(!showNewSchoolForm)` | `{loading \|\| !newSchoolForm.name.trim()}` |  | ContractForm · l.1309 |
| «Calcular Automático» | `{calculateCuotas}` | `step === 'cuotas'` |  |  | ContractForm · l.1761 |
| «Agregar Cuota» | `{addCuota}` | `step === 'cuotas'` | `{cuotas.length >= 12}` |  | ContractForm · l.1768 |
| «[icon Trash2]» · tooltip «Eliminar cuota» | `{() => removeCuota(index)}` | `step === 'cuotas' && each cuotas` | `{cuotas.length <= 1}` |  | ContractForm · l.1823 |
| «Cancelar» | `{onCancel}` |  |  |  | ContractForm · l.1851 |
| «Anterior» | `{() => { if (step === 'contrato') setStep('cliente'); if (step === 'cuotas') set…}` | `step !== 'cliente'` |  |  | ContractForm · l.1860 |
| «Siguiente» | `{() => { if (step === 'cliente') setStep('contrato'); if (step === 'contrato') s…}` | `step !== 'cuotas'` | `{!isStepValid()}` |  | ContractForm · l.1875 |
| «Guardando borrador... / Guardar Borrador» · tooltip «Guardar progreso sin finalizar el contrato» | `{handleSaveAsDraft}` | `!(step !== 'cuotas')` | `{savingAsDraft}` |  | ContractForm · l.1889 |
| «Vista previa / PDF» | `{() => { void generateContractPDF().catch(() => toast.error('Error al abrir la v…}` | `!(step !== 'cuotas') && !esManual` | `{!isStepValid()}` |  | ContractForm · l.1910 |
| «Guardando... / Actualizar Contrato / Guardar Contrato» | `{handleSaveContract}` | `!(step !== 'cuotas')` | `{!isStepValid() \|\| loading}` |  | ContractForm · l.1922 |

**Fields** (35)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Contrato Manual (Subir PDF existente) Marque esta opción para contratos creados fuera del sistema. Solo se solicitará información operativa.» | checkbox |  |  | `step === 'cliente'` |  | ContractForm · l.1151 |
| «Seleccionar Cliente Existente (Pre-seleccionado desde licitacion) / (Opcional)» | select | disabled: `{!!licitacionId}` | «-- Crear nuevo cliente --», «(lista) {cliente.nombre_legal} ( {cliente.rut} )» | `step === 'cliente'` |  | ContractForm · l.1195 |
|  | select |  | «-- Sin escuela asociada --», «(lista) {school.name} ({school.code}) (Vinculada a otro cliente)» | `step === 'cliente' && !showNewSchoolForm` |  | ContractForm · l.1232 |
| «Nombre de la escuela *» | text | «Nombre de la escuela *» |  | `step === 'cliente' && !(!showNewSchoolForm)` |  | ContractForm · l.1264 |
| «Código» | text | «Código» |  | `step === 'cliente' && !(!showNewSchoolForm)` |  | ContractForm · l.1273 |
| «Región» | text | «Región» |  | `step === 'cliente' && !(!showNewSchoolForm)` |  | ContractForm · l.1280 |
| «Dirección» | text | «Dirección» |  | `step === 'cliente' && !(!showNewSchoolForm)` |  | ContractForm · l.1289 |
| «Esta escuela maneja generaciones» | checkbox |  |  | `step === 'cliente' && !(!showNewSchoolForm)` | `id=has_generations (id used by code)` | ContractForm · l.1298 |
| «Nombre Legal *» | text | «Nombre legal de la empresa» |  | `step === 'cliente'` |  | ContractForm · l.1333 |
| «Nombre de Fantasía *» | text | «Nombre comercial» |  | `step === 'cliente'` |  | ContractForm · l.1346 |
| «RUT *» | text | «12.345.678-9» |  | `step === 'cliente'` |  | ContractForm · l.1359 |
| «Dirección *» | text | «Calle y número» |  | `step === 'cliente'` |  | ContractForm · l.1372 |
| «Comuna *» | text | «Comuna» |  | `step === 'cliente'` |  | ContractForm · l.1385 |
| «Ciudad *» | text | «Ciudad» |  | `step === 'cliente'` |  | ContractForm · l.1398 |
| «Representante Legal *» | text | «Nombre del representante» |  | `step === 'cliente'` |  | ContractForm · l.1411 |
| «RUT Representante» | text | «12.345.678-9» |  | `step === 'cliente'` |  | ContractForm · l.1424 |
| «Fecha Escritura Pública» | date |  |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1443 |
| «Notario Público» | text | «Nombre del notario» |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1455 |
| «Comuna Notaría» | text | «Santiago, Providencia, etc.» |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1468 |
| «Nombre del Encargado» | text | «Nombre completo» |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1489 |
| «Teléfono» | tel | «+56 9 1234 5678» |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1502 |
| «Email» | email | «encargado@colegio.cl» |  | `step === 'cliente' && !esManual` |  | ContractForm · l.1515 |
| «Nombre del Contacto Administrativo» | text | «Nombre completo» |  | `step === 'cliente'` |  | ContractForm · l.1552 |
| «Teléfono de Facturación» | tel | «+56 2 2345 6789» |  | `step === 'cliente'` |  | ContractForm · l.1565 |
| «Email de Facturación» | email | «administracion@colegio.cl» |  | `step === 'cliente'` |  | ContractForm · l.1578 |
| «Número de Contrato *» | text | «FNE-2025-01-001» |  | `step === 'contrato'` |  | ContractForm · l.1618 |
| «Fecha del Contrato *» | date |  |  | `step === 'contrato'` |  | ContractForm · l.1631 |
| «Fecha de Finalización *» | date | `min={contractForm.fecha_contrato}` |  | `step === 'contrato'` |  | ContractForm · l.1643 |
| «Descripción del Contrato *» | textarea | «Ej: Asesoría personalizada Q1 2025, Programa piloto región sur, Capacitación especial...» |  | `step === 'contrato' && esManual` |  | ContractForm · l.1658 |
| «Programa Contratado *» | select | disabled: `{!!licitacionId}` | «-- Seleccionar programa --», «(lista) {programa.nombre} ( {programa.horas_totales} h - {programa.modalidad} )» | `step === 'contrato' && !(esManual)` |  | ContractForm · l.1674 |
| «UF (Unidades de Fomento)» | radio | `tipo_moneda` |  | `step === 'contrato'` |  | ContractForm · l.1701 |
| «Pesos Chilenos (CLP)» | radio | `tipo_moneda` |  | `step === 'contrato'` |  | ContractForm · l.1712 |
| «Precio Total ( {contractForm.tipo_moneda} ) *» | number | «0.00» · `min=0 step={contractForm.tipo_moneda === 'UF' ? '0.01' : '1'}` |  | `step === 'contrato'` |  | ContractForm · l.1729 |
| «Fecha Vencimiento» | date |  |  | `step === 'cuotas' && each cuotas` |  | ContractForm · l.1800 |
| «Monto ( {contractForm.tipo_moneda} )» | number | `min=0 step={contractForm.tipo_moneda === 'UF' ? '0.01' : '1'}` |  | `step === 'cuotas' && each cuotas` |  | ContractForm · l.1812 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «{confirmMessage}» | `!(editingContract) && !selectedClienteId && existingCliente` | handleSaveContract · l.853 |

**Browser alert()** (3)

| Text | When | Where |
|---|---|---|
| «Por favor ingrese un número de contrato antes de guardar como borrador.» | `!contractForm.numero_contrato` | handleSaveAsDraft · l.572 |
| «✅ Contrato guardado como borrador. Puede continuar editándolo más tarde desde la lista de contratos.» |  | handleSaveAsDraft · l.725 |
| «Error al guardar el borrador. Por favor intente nuevamente.» |  | handleSaveAsDraft · l.729 |

**Toasts** (7)

| Kind | Text | When | Where |
|---|---|---|---|
| plain | «Advertencia: el precio adjudicado ({precio} {licitacionData.tipo_moneda …}) esta fuera del rango de la licitacion ({min}–{max} {licitacionData.tipo_moneda …})» | `licitacionData.precio_total_uf != null && licitacionData.monto_minimo != null && licitacionData.monto_maximo != null && (precio < min \|\| precio > max)` | ContractForm · l.405 |
| error | «El nombre de la escuela es requerido» | `!newSchoolForm.name.trim()` | handleCreateSchool · l.504 |
| success | «Escuela creada exitosamente» |  | handleCreateSchool · l.556 |
| error | «Error al crear la escuela:» |  | handleCreateSchool · l.559 |
| error | «Creación de contrato cancelada. Por favor verifica el RUT del cliente.» | `!(editingContract) && !selectedClienteId && existingCliente && !(confirm(confirmMessage))` | handleSaveContract · l.858 |
| error | «Error al guardar el contrato:» |  | handleSaveContract · l.964 |
| error | «Error al abrir la vista previa del contrato» | `!(step !== 'cuotas') && !esManual` | ContractForm · l.1913 |

**Messages set on the page** (6)

| Text | Set by | When | Where |
|---|---|---|---|
| «No authenticated session» | `throw (shown by whoever catches it)` | `!session` | handleCreateSchool · l.514 |
| «Error creating school» | `throw (shown by whoever catches it)` | `!response.ok` | handleCreateSchool · l.528 |
| «Ya existe un contrato con este número. Por favor use un número diferente.» | `throw (shown by whoever catches it)` | `!(editingContract) && !(existingDraft) && error && error.message.includes('duplicate key')` | handleSaveAsDraft · l.681 |
| «El número de contrato "{contractForm.numero_contrato}" ya existe. Por favor, use un número diferente.» | `throw (shown by whoever catches it)` | `!(editingContract) && existingContract` | handleSaveContract · l.896 |
| «Error: No se pudo determinar el ID del cliente. Por favor, seleccione o cree un cliente válido.» | `throw (shown by whoever catches it)` | `!(editingContract) && !clienteId` | handleSaveContract · l.901 |
| «Error: El cliente seleccionado no existe en la base de datos. Por favor, cree un nuevo cliente o seleccione uno existente.» | `throw (shown by whoever catches it)` | `!(editingContract) && contratoError && contratoError.message.includes('contratos_cliente_id_fkey')` | handleSaveContract · l.936 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!licitacionData \|\| editingContract` | ContractForm · l.356 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `clientData` | «Notario Público» | handleSaveContract · l.812 |
| `formatCurrency()` | «UF {amount.toLocaleString('es-C…}» | formatCurrency · l.972 |

**Other texts written in the code (safety net: not tied to an element by the script)** (11)

| Text | Where |
|---|---|
| «Contrato importado desde PDF - {extractedData.contract?.num…}» | ContractForm · l.235 |
| «Sin número» | ContractForm · l.235 |
| «Bearer {session.access_token}» | ContractForm · l.521 |
| «Cliente Pendiente» | ContractForm · l.584 |
| «Nombre: {existingCliente.nombre_legal}» | ContractForm · l.845 |
| «Nombre Fantasía: {existingCliente.nombre_fant…}» | ContractForm · l.846 |
| «Ciudad: {existingCliente.ciudad}» | ContractForm · l.847 |
| «Representante: {existingCliente.nombre_repr…}» | ContractForm · l.848 |
| «¿Deseas usar este cliente existente para el contrato?» | ContractForm · l.849 |
| «• SÍ: Usará el cliente existente» | ContractForm · l.850 |
| «• NO: Verifica el RUT y corrige los datos» | ContractForm · l.851 |

**Values shown from data** (2)

- `{index + 1}` — ContractForm · l.1117, when `each ['cliente', 'contrato', 'cuotas']`
- `{licitacionData?.condiciones_pago}` — ContractForm · l.1953, when `showCondicionesPago`

**Other texts on screen** (57)

- «Datos pre-cargados desde licitacion.» — ContractForm · l.1076, when `licitacionId && !extractedData`
- «El cliente, programa y monto han sido completados automaticamente. Revise y complete los campos restantes.» — ContractForm · l.1076, when `licitacionId && !extractedData`
- «Datos importados desde PDF» — ContractForm · l.1088, when `extractedData`
- «Los campos han sido pre-llenados con la información extraída. Por favor, revise y complete los campos faltantes.» — ContractForm · l.1090, when `extractedData`
- «Confianza: {Math.round(extractedData.overall_co…} %» — ContractForm · l.1095, when `extractedData && extractedData.overall_confidence`
- «[Cliente] [Contrato] [Cuotas]» — ContractForm · l.1123, when `each ['cliente', 'contrato', 'cuotas']`
- «Contrato Manual (Subir PDF existente) Marque esta opción para contratos creados fuera del sistema. Solo se solicitará información operativa.» (label) — ContractForm · l.1150, when `step === 'cliente'`
- «¿Tiene un PDF de contrato?» — ContractForm · l.1170, when `step === 'cliente'`
- «Use AI para extraer automáticamente la información del contrato» — ContractForm · l.1172, when `step === 'cliente'`
- «Seleccionar Cliente Existente (Pre-seleccionado desde licitacion) / (Opcional)» (label) — ContractForm · l.1192, when `step === 'cliente'`
- «Cliente fijado por la licitacion. No se puede cambiar.» — ContractForm · l.1210, when `step === 'cliente' && licitacionId`
- «Escuela Asociada» (label) — ContractForm · l.1218, when `step === 'cliente'`
- «Esta escuela maneja generaciones» (label) — ContractForm · l.1305, when `step === 'cliente' && !(!showNewSchoolForm)`
- «La escuela y el cliente quedarán vinculados automáticamente» — ContractForm · l.1322, when `step === 'cliente' && selectedSchoolId`
- «Nombre Legal *» (label) — ContractForm · l.1330, when `step === 'cliente'`
- «Nombre de Fantasía *» (label) — ContractForm · l.1343, when `step === 'cliente'`
- «RUT *» (label) — ContractForm · l.1356, when `step === 'cliente'`
- «Dirección *» (label) — ContractForm · l.1369, when `step === 'cliente'`
- «Comuna *» (label) — ContractForm · l.1382, when `step === 'cliente'`
- «Ciudad *» (label) — ContractForm · l.1395, when `step === 'cliente'`
- «Representante Legal *» (label) — ContractForm · l.1408, when `step === 'cliente'`
- «RUT Representante» (label) — ContractForm · l.1421, when `step === 'cliente'`
- «Fecha Escritura Pública» (label) — ContractForm · l.1440, when `step === 'cliente' && !esManual`
- «Notario Público» (label) — ContractForm · l.1452, when `step === 'cliente' && !esManual`
- «Comuna Notaría» (label) — ContractForm · l.1465, when `step === 'cliente' && !esManual`
- «Nombre del Encargado» (label) — ContractForm · l.1486, when `step === 'cliente' && !esManual`
- «Teléfono» (label) — ContractForm · l.1499, when `step === 'cliente' && !esManual`
- «Email» (label) — ContractForm · l.1512, when `step === 'cliente' && !esManual`
- «Esta información es necesaria para la gestión de facturación y seguimiento del proyecto.» — ContractForm · l.1526, when `step === 'cliente' && !esManual`
- «Importante:» — ContractForm · l.1542, when `step === 'cliente'`
- «Esta es la persona que recibirá todas las facturas y documentos administrativos del contrato.» — ContractForm · l.1542, when `step === 'cliente'`
- «Nombre del Contacto Administrativo» (label) — ContractForm · l.1549, when `step === 'cliente'`
- «Teléfono de Facturación» (label) — ContractForm · l.1562, when `step === 'cliente'`
- «Email de Facturación» (label) — ContractForm · l.1575, when `step === 'cliente'`
- «Nota:» — ContractForm · l.1589, when `step === 'cliente'`
- «Las facturas y documentos administrativos se enviarán a este contacto por email.» — ContractForm · l.1589, when `step === 'cliente'`
- «Contrato Manual» — ContractForm · l.1608, when `step === 'contrato' && esManual`
- «- Solo ingrese información necesaria para gestión operativa y pagos.» — ContractForm · l.1608, when `step === 'contrato' && esManual`
- «Número de Contrato *» (label) — ContractForm · l.1615, when `step === 'contrato'`
- «Fecha del Contrato *» (label) — ContractForm · l.1628, when `step === 'contrato'`
- «Fecha de Finalización *» (label) — ContractForm · l.1640, when `step === 'contrato'`
- «Descripción del Contrato *» (label) — ContractForm · l.1655, when `step === 'contrato' && esManual`
- «Breve descripción del servicio o programa que cubre este contrato» — ContractForm · l.1666, when `step === 'contrato' && esManual`
- «Programa Contratado *» (label) — ContractForm · l.1671, when `step === 'contrato' && !(esManual)`
- «Programa fijado por la licitacion. No se puede cambiar.» — ContractForm · l.1689, when `step === 'contrato' && !(esManual) && licitacionId`
- «Tipo de Moneda» (label) — ContractForm · l.1696, when `step === 'contrato'`
- «UF (Unidades de Fomento)» (label) — ContractForm · l.1700, when `step === 'contrato'`
- «Pesos Chilenos (CLP)» (label) — ContractForm · l.1711, when `step === 'contrato'`
- «Precio Total ( {contractForm.tipo_moneda} ) *» (label) — ContractForm · l.1726, when `step === 'contrato'`
- «El PDF del contrato se subirá después de guardar» — ContractForm · l.1745, when `step === 'contrato' && esManual`
- «Una vez guardada la información, podrá cargar el PDF desde el listado de contratos» — ContractForm · l.1746, when `step === 'contrato' && esManual`
- «Total del Contrato:» — ContractForm · l.1782, when `step === 'cuotas'`
- «Total de Cuotas:» — ContractForm · l.1785, when `step === 'cuotas'`
- «Cuota {cuota.numero_cuota}» — ContractForm · l.1793, when `step === 'cuotas' && each cuotas`
- «Fecha Vencimiento» (label) — ContractForm · l.1797, when `step === 'cuotas' && each cuotas`
- «Monto ( {contractForm.tipo_moneda} )» (label) — ContractForm · l.1809, when `step === 'cuotas' && each cuotas`
- «⚠️ La suma de las cuotas no coincide con el total del contrato. Diferencia: {contractForm.tipo_moneda} {(contractForm.precio_total_uf - cuo…}» — ContractForm · l.1839, when `step === 'cuotas' && Math.abs(cuotas.reduce((sum, c) => sum + c.monto, 0) - contractForm.precio_total_uf) > 0.01`

**Reads and writes the database directly:** `table:clientes` (insert, select, update), `table:contratos` (insert, select, update), `table:cuotas` (insert, select), `table:schools` (select, update)

### components/contracts/ContractPDFImporter.tsx

Used by: `/contracts`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Importar Contrato desde PDF» | h2 |  | ContractPDFImporter · l.297 |
| «Información del Contrato» | h3 | `!(!extractedData)` | ContractPDFImporter · l.471 |
| «Información del Cliente» | h3 | `!(!extractedData)` | ContractPDFImporter · l.484 |
| «Información Financiera» | h3 | `!(!extractedData)` | ContractPDFImporter · l.505 |
| «Calendario de Pagos ( {extractedData.payment_schedule.leng…} cuotas)» | h3 | `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0` | ContractPDFImporter · l.517 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Edit2]» · tooltip «Editar» | `{() => setEditingField(path)}` |  |  |  | renderField · l.259 |
| «[icon X]» | `{onCancel}` |  |  |  | ContractPDFImporter · l.298 |
| «Cambiar archivo» | `{() => { setPdfFile(null); setPdfPreviewUrl(null); setExtractedData(null); }}` | `!(!pdfFile)` |  |  | ContractPDFImporter · l.339 |
| «[icon ChevronLeft]» | `{() => setPageNumber(Math.max(1, pageNumber - 1))}` | `!(!pdfFile) && numPages && numPages > 1` | `{pageNumber <= 1 \|\| extracting}` |  | ContractPDFImporter · l.370 |
| «[icon ChevronRight]» | `{() => setPageNumber(Math.min(numPages, pageNumber + 1))}` | `!(!pdfFile) && numPages && numPages > 1` | `{pageNumber >= numPages \|\| extracting}` |  | ContractPDFImporter · l.380 |
| «Cancelar» | `{onCancel}` |  |  |  | ContractPDFImporter · l.582 |
| «Confirmar e Importar» | `{handleConfirm}` |  | `{!extractedData \|\| extracting}` |  | ContractPDFImporter · l.588 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | text | also `onKeyPress={(e) => e.key === 'Enter' && setEditingField(null)} · onBlur={() => setEditingField(null)}` |  | `isEditing` |  | renderField · l.270 |
| «Seleccionar archivo» | file | accepts `application/pdf` |  | `!pdfFile` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | ContractPDFImporter · l.321 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onDrop={handleDrop} · onDragOver={(e) => e.preventDefault()}` | `!pdfFile` | ContractPDFImporter · l.308 |

**Table columns** (4)

| Text | Shown when | Where |
|---|---|---|
| «N°» | `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0` | ContractPDFImporter · l.524 |
| «Vencimiento» | `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0` | ContractPDFImporter · l.525 |
| «Monto» | `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0` | ContractPDFImporter · l.526 |
| «Confianza» | `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0` | ContractPDFImporter · l.527 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Importar Contrato desde PDF» | written in this file |  |  | ContractPDFImporter · l.293 |

**Browser confirm()** (1)

| Question | When | Where |
|---|---|---|
| «Hay errores de validación. ¿Desea continuar de todos modos?» |  | handleConfirm · l.222 |

**Toasts** (9)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Por favor, seleccione un archivo PDF» | `!(file && file.type === 'application/pdf')` | ContractPDFImporter · l.80 |
| error | «Solo se permiten archivos PDF» | `file.type !== 'application/pdf'` | handleFileUpload · l.96 |
| error | «El archivo es demasiado grande (máximo 10MB)» | `file.size > maxSize` | handleFileUpload · l.102 |
| plain | «Confianza baja en la extracción - Por favor revise los datos» | `result.extracted.overall_confidence < 0.7` | handleFileUpload · l.159 |
| success | «Extracción completada con alta confianza» | `!(result.extracted.overall_confidence < 0.7) && result.extracted.overall_confidence > 0.9` | handleFileUpload · l.164 |
| success | «Extracción completada - Revise los datos antes de confirmar» | `!(result.extracted.overall_confidence < 0.7) && !(result.extracted.overall_confidence > 0.9)` | handleFileUpload · l.166 |
| error | «Error al procesar el PDF» |  | handleFileUpload · l.170 |
| error | «Error al extraer datos del PDF» |  | handleFileUpload · l.178 |
| success | «Datos importados exitosamente» |  | handleConfirm · l.240 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to read file» | `throw (shown by whoever catches it)` | `!base64` | handleFileUpload · l.126 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | handleFileUpload · l.107 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «RUT Representante» | ContractPDFImporter · l.498 |

**Values shown from data** (12)

- `{Math.round(confidence * 100)} %` — renderField · l.255
- `{value} / -` — renderField · l.280, when `!(isEditing)`
- `{validationErrors.find(e => e.field …}` — renderField · l.284, when `hasError`
- `{pdfFile.name}` — ContractPDFImporter · l.337, when `!(!pdfFile)`
- `{Math.round(extractedData.overall_co…} %` — ContractPDFImporter · l.447, when `!(!extractedData)`
- `{renderField('Número de Contrato', e…} {renderField('Fecha del Contrato', e…} {renderField('Fecha de Término', ext…}` — ContractPDFImporter · l.472, when `!(!extractedData)`
- `{renderField('Precio Total', extract…} {renderField('Moneda', extractedData…}` — ContractPDFImporter · l.506, when `!(!extractedData)`
- `{payment.numero_cuota}` — ContractPDFImporter · l.533, when `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0 && each extractedData.payment_schedule`
- `{payment.fecha_vencimiento}` — ContractPDFImporter · l.534, when `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0 && each extractedData.payment_schedule`
- `{extractedData.financial.moneda} {payment.monto.toLocaleString('es-CL…}` — ContractPDFImporter · l.535, when `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0 && each extractedData.payment_schedule`
- `{Math.round(payment.confidence * 100)} %` — ContractPDFImporter · l.539, when `!(!extractedData) && extractedData.payment_schedule && extractedData.payment_schedule.length > 0 && each extractedData.payment_schedule`
- `{error.message}` — ContractPDFImporter · l.560, when `!(!extractedData) && validationErrors.length > 0 && each validationErrors`

**Other texts on screen** (18)

- «{label} [*]» (label) — renderField · l.251
- «Arrastra un PDF aquí o haz clic para seleccionar» — ContractPDFImporter · l.315, when `!pdfFile`
- «Máximo 10MB • Solo archivos PDF» — ContractPDFImporter · l.318, when `!pdfFile`
- «Seleccionar archivo» (label) — ContractPDFImporter · l.320, when `!pdfFile`
- «Página {pageNumber} de {numPages}» — ContractPDFImporter · l.377, when `!(!pdfFile) && numPages && numPages > 1`
- «Extrayendo información...» — ContractPDFImporter · l.407, when `!extractedData && extracting`
- «PDF cargado correctamente» — ContractPDFImporter · l.411, when `!extractedData && extracting`
- «Procesando texto del documento» — ContractPDFImporter · l.415, when `!extractedData && extracting`
- «Identificando datos del contrato...» — ContractPDFImporter · l.419, when `!extractedData && extracting`
- «Claude AI está analizando su documento» — ContractPDFImporter · l.424, when `!extractedData && extracting`
- «Esto puede tomar entre 3-5 segundos» — ContractPDFImporter · l.428, when `!extractedData && extracting`
- «Seleccione un PDF para extraer la información del contrato» — ContractPDFImporter · l.435, when `!extractedData && !(extracting)`
- «Confianza general de extracción» — ContractPDFImporter · l.446, when `!(!extractedData)`
- «Cliente existente encontrado» — ContractPDFImporter · l.459, when `!(!extractedData) && existingClient`
- «Se encontró el cliente &quot; {existingClient.nombre_legal} &quot; con el mismo RUT. Los datos del cliente se usarán automáticamente.» — ContractPDFImporter · l.460, when `!(!extractedData) && existingClient`
- «{renderField('Razón Social', extract…} {renderField('RUT', extractedData.cl…} {renderField('Dirección', extractedD…} {renderField('Comuna', extractedData…} {renderField('Ciudad', extractedData…} {renderField('Representante Legal', …} {rend…» — ContractPDFImporter · l.485, when `!(!extractedData)`
- «Errores de validación» — ContractPDFImporter · l.557, when `!(!extractedData) && validationErrors.length > 0`
- «⚠️ Se requiere revisión manual de los datos extraídos» — ContractPDFImporter · l.577, when `extractedData && requiresReview`

### components/contracts/HourAllocationPanel.tsx

Used by: `/contracts`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Distribución de Horas» | h3 | `loading` | HourAllocationPanel · l.188 |
| «Distribución de Horas ( {horasContratadas} horas contratadas)» | h3 |  | HourAllocationPanel · l.203 |
| «Eliminar Distribución de Horas» | h3 | `showDeleteConfirm` | HourAllocationPanel · l.487 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando... / Guardar Distribución» | `{handleSaveAllocation}` | `!hasAllocations && isAdmin` | `{!totalMatchesContract \|\| saving}` |  | HourAllocationPanel · l.285 |
| «Redistribuir Horas» | `{() => setShowReallocationModal(true)}` | `hasAllocations && isAdmin` |  |  | HourAllocationPanel · l.438 |
| «Eliminar Distribución» | `{() => setShowDeleteConfirm(true)}` | `hasAllocations && isAdmin` |  |  | HourAllocationPanel · l.446 |
| «Cancelar» | `{() => setShowDeleteConfirm(false)}` | `showDeleteConfirm` | `{deleting}` |  | HourAllocationPanel · l.503 |
| «Eliminando... / Eliminar Distribución» | `{handleDeleteAllocation}` | `showDeleteConfirm` | `{deleting}` |  | HourAllocationPanel · l.512 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Exportar CSV» | `/api/contracts/[*]/hours/ledger/csv` | `hasAllocations && isAdmin` |  | HourAllocationPanel · l.429 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Horas fijas» | checkbox |  |  | `!hasAllocations && isAdmin && each allocRows && row.hour_type_key === 'online_learning'` |  | HourAllocationPanel · l.242 |
|  | number | `min=0 step=0.01` |  | `!hasAllocations && isAdmin && each allocRows` |  | HourAllocationPanel · l.254 |

**Table columns** (2)

| Text | Shown when | Where |
|---|---|---|
| «Categoría» | `!hasAllocations && isAdmin` | HourAllocationPanel · l.221 |
| «Horas» | `!hasAllocations && isAdmin` | HourAllocationPanel · l.224 |

**Pop-ups** (3)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ReallocationModal` | component | `showReallocationModal` |  | HourAllocationPanel · l.460 |
| «Eliminar Distribución de Horas» | written in this file | `showDeleteConfirm` |  | HourAllocationPanel · l.473 |
| «Eliminar Distribución de Horas» | written in this file | `showDeleteConfirm` |  | HourAllocationPanel · l.474 |

**Toasts** (8)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al cargar las horas del contrato» | `!res.ok` | HourAllocationPanel · l.83 |
| error | «Error inesperado al cargar las horas del contrato» |  | HourAllocationPanel · l.90 |
| error | «Error al guardar la distribución de horas» | `!res.ok` | handleSaveAllocation · l.148 |
| success | «Distribución de horas guardada correctamente» |  | handleSaveAllocation · l.152 |
| error | «Error inesperado al guardar la distribución de horas» |  | handleSaveAllocation · l.155 |
| error | «Error al eliminar la distribución de horas» | `!res.ok` | handleDeleteAllocation · l.171 |
| success | «Distribución de horas eliminada correctamente» |  | handleDeleteAllocation · l.175 |
| error | «Error inesperado al eliminar la distribución de horas» |  | handleDeleteAllocation · l.179 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `<a download> Exportar CSV` | `hasAllocations && isAdmin` | HourAllocationPanel · l.429 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `DEFAULT_HOUR_TYPES` | «Cursos Online (LMS)», «Asesoría Técnica Online», «Asesoría Técnica Presencial», «Asesoría Directiva Online», «Asesoría Directiva Presencial», «Gestión del Cambio Online», «Gestión del Cambio Presencial», «Talleres Presenciales», «Encuentro de Líderes» | l.41 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Progreso: {bucket.consumed.toFixed(1)} h consumidas, {bucket.reserved.toFixed(1)} h reservadas, {bucket.available.toFixed(1)} h disponibles de {total.toFixed(1)} h totales» | HourAllocationPanel · l.382 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| focus | `deleteCancelBtnRef.current.focus()` | HourAllocationPanel · l.103 |
| role | `role=img` | HourAllocationPanel · l.380 |

**Values shown from data** (6)

- `🖥️ / 🏫` — HourAllocationPanel · l.235, when `!hasAllocations && isAdmin && each allocRows`
- `{row.display_name}` — HourAllocationPanel · l.238, when `!hasAllocations && isAdmin && each allocRows`
- `( + {(totalAllocated - horasContratadas)…} )` — HourAllocationPanel · l.273, when `!hasAllocations && isAdmin && !totalMatchesContract`
- `🖥️ / 🏫` — HourAllocationPanel · l.356, when `hasAllocations && each buckets`
- `{bucket.display_name}` — HourAllocationPanel · l.359, when `hasAllocations && each buckets`
- `{bucket.available.toFixed(1)}` — HourAllocationPanel · l.373, when `hasAllocations && each buckets`

**Other texts on screen** (20)

- «Cargando distribución de horas...» — HourAllocationPanel · l.193, when `loading`
- «Distribuya las {horasContratadas} horas contratadas entre las categorías de servicio.» — HourAllocationPanel · l.214, when `!hasAllocations && isAdmin`
- «Horas fijas» (label) — HourAllocationPanel · l.241, when `!hasAllocations && isAdmin && each allocRows && row.hour_type_key === 'online_learning'`
- «Total distribuido» — HourAllocationPanel · l.268, when `!hasAllocations && isAdmin`
- «h /» — HourAllocationPanel · l.271, when `!hasAllocations && isAdmin`
- «h» — HourAllocationPanel · l.271, when `!hasAllocations && isAdmin`
- «Horas pendientes de distribución» — HourAllocationPanel · l.316, when `!hasAllocations && !isAdmin`
- «Las {horasContratadas} horas contratadas aún no han sido distribuidas por el administrador.» — HourAllocationPanel · l.319, when `!hasAllocations && !isAdmin`
- «[+ {bucket.annex_hours} del Anexo]» — HourAllocationPanel · l.362, when `hasAllocations && each buckets && bucket.annex_hours > 0`
- «Agotado» — HourAllocationPanel · l.368, when `hasAllocations && each buckets && warningLevel === 'exhausted'`
- «/ {total.toFixed(1)} h disponibles» — HourAllocationPanel · l.376, when `hasAllocations && each buckets`
- «Consumidas: {bucket.consumed.toFixed(1)} h» (title) — HourAllocationPanel · l.386, when `hasAllocations && each buckets && consumedPct > 0`
- «Reservadas: {bucket.reserved.toFixed(1)} h» (title) — HourAllocationPanel · l.393, when `hasAllocations && each buckets && reservedPct > 0`
- «Disponibles: {bucket.available.toFixed(1)} h» (title) — HourAllocationPanel · l.400, when `hasAllocations && each buckets && availablePct > 0`
- «Consumidas {bucket.consumed.toFixed(1)} h» — HourAllocationPanel · l.410, when `hasAllocations && each buckets`
- «Reservadas {bucket.reserved.toFixed(1)} h» — HourAllocationPanel · l.414, when `hasAllocations && each buckets`
- «Disponibles {bucket.available.toFixed(1)} h» — HourAllocationPanel · l.418, when `hasAllocations && each buckets`
- «Esta acción no se puede deshacer» — HourAllocationPanel · l.490, when `showDeleteConfirm`
- «¿Está seguro de que desea eliminar la distribución de horas de este contrato?» — HourAllocationPanel · l.495, when `showDeleteConfirm`
- «Solo es posible eliminar si no existen registros en el libro de horas.» — HourAllocationPanel · l.498, when `showDeleteConfirm`

### components/contracts/ReallocationModal.tsx

Used by: `/contracts`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Redistribuir Horas» | h3 |  | ReallocationModal · l.112 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{onClose}` |  | `{submitting}` |  | ReallocationModal · l.225 |
| «Procesando... / Confirmar Redistribución» (submits the form) |  |  | `{!isValid \|\| submitting}` |  | ReallocationModal · l.234 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Categoría de origen» | select | required | «Seleccione una categoría», «(lista) {b.display_name} ( {b.available.toFixed(1)} h disponibles)» |  |  | ReallocationModal · l.126 |
| «Categoría de destino» | select | required · disabled: `{!fromKey}` | «Seleccione una categoría», «(lista) {b.display_name}» |  |  | ReallocationModal · l.157 |
| «Horas a redistribuir» | number | «0.00» · required · disabled: `{!fromKey}` · `min=0.01 max={maxHours} step=0.01` |  |  |  | ReallocationModal · l.179 |
| «Motivo de redistribución» | textarea | «Explique el motivo de esta redistribución (mínimo 10 caracteres)...» · required |  |  |  | ReallocationModal · l.209 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | ReallocationModal · l.119 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Redistribuir Horas» | written in this file |  |  | ReallocationModal · l.96 |
| «Redistribuir Horas» | written in this file |  |  | ReallocationModal · l.98 |

**Toasts** (3)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Error al redistribuir las horas» | `!res.ok` | handleSubmit · l.81 |
| success | «Horas redistribuidas correctamente» |  | handleSubmit · l.85 |
| error | «Error inesperado al redistribuir las horas» |  | handleSubmit · l.88 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| focus | `fromSelectRef.current.focus()` | ReallocationModal · l.40 |

**Other texts on screen** (9)

- «Mover horas entre categorías de servicio» — ReallocationModal · l.115
- «Categoría de origen» (label) — ReallocationModal · l.122
- «No hay categorías con horas disponibles para redistribuir.» — ReallocationModal · l.146, when `fromBuckets.length === 0`
- «Categoría de destino» (label) — ReallocationModal · l.153
- «Horas a redistribuir» (label) — ReallocationModal · l.175
- «Máximo disponible en origen: {maxHours.toFixed(2)} h» — ReallocationModal · l.192, when `fromKey`
- «Las horas exceden el disponible en la categoría de origen.» — ReallocationModal · l.198, when `hoursNum > maxHours && maxHours > 0`
- «Motivo de redistribución» (label) — ReallocationModal · l.205
- «{reason.trim().length} / 10 caracteres mínimos» — ReallocationModal · l.217

### components/layout/FunctionalPageHeader.tsx

Used by: `/contracts`

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

### components/permissions/PermissionGuard.tsx

Used by: `/admin/quotes`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h2 | `!hasAccess` | PermissionGuard · l.77 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Volver» | `{() => router.back()}` | `!hasAccess` |  |  | PermissionGuard · l.81 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{redirectTo}` | `router.push` | `!loading && !hasAccess && redirectTo` | PermissionGuard · l.38 |

**Access checks in the code** (8)

| Line of code | Where |
|---|---|
| `hasAccess = Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission)` | PermissionGuard · l.25 |
| `hasAccess = Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission)` | PermissionGuard · l.27 |
| `hasAccess = Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission)` | PermissionGuard · l.28 |
| `hasAccess = Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission)` | PermissionGuard · l.29 |
| `return Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission);` | usePermissionGuard · l.103 |
| `return Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission);` | usePermissionGuard · l.104 |
| `return Array.isArray(permission) ? requireAll ? hasAllPermissions(permission) : hasAnyPermission(permission) : hasPermission(permission);` | usePermissionGuard · l.105 |
| `hasAccess = usePermissionGuard(permission, requireAll)` | HasPermission · l.120 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `loading` | HasPermission · l.123 |

**Other texts on screen** (2)

- «Verificando permisos...» — PermissionGuard · l.48, when `loading`
- «No tienes los permisos necesarios para acceder a esta página.» — PermissionGuard · l.79, when `!hasAccess`

### components/quotes/QuoteFormV2.tsx

Used by: `/admin/quotes/[id]/edit`, `/admin/quotes/new`

**Titles** (11)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Información del Cliente» | h3 |  | QuoteFormV2 · l.319 |
| «Modo de Grupos de Viaje» | h4 |  | QuoteFormV2 · l.385 |
| «Detalles del Viaje» | h3 | `!(useGroups)` | QuoteFormV2 · l.426 |
| «Habitación Individual» | h4 | `!(useGroups)` | QuoteFormV2 · l.520 |
| «Habitación Doble» | h4 | `!(useGroups)` | QuoteFormV2 · l.558 |
| «🎉 Descuento por Pago Anticipado» | h3 |  | QuoteFormV2 · l.597 |
| «Programas de Pasantía» | h3 |  | QuoteFormV2 · l.635 |
| «{program.name}» | h4 | `each programs` | QuoteFormV2 · l.662 |
| «Viáticos» | h3 |  | QuoteFormV2 · l.703 |
| «Notas Adicionales» | h3 |  | QuoteFormV2 · l.804 |
| «Resumen de Costos» | h3 |  | QuoteFormV2 · l.853 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Grupos Múltiples / Grupo Único» | `{toggleGroupsMode}` |  |  |  | QuoteFormV2 · l.392 |
|  | `{() => setFormData(prev => ({ ...prev, apply_early_bird_discount: !prev.apply_ea…}` |  |  |  | QuoteFormV2 · l.606 |
| «Sin Viáticos No incluir viáticos» | `{() => setFormData(prev => ({ ...prev, viaticos_type: null, viaticos_amount: 0 }…}` |  |  |  | QuoteFormV2 · l.714 |
| «Monto Diario Por día por persona» | `{() => setFormData(prev => ({ ...prev, viaticos_type: 'daily' }))}` |  |  |  | QuoteFormV2 · l.727 |
| «Monto Total Suma fija por persona» | `{() => setFormData(prev => ({ ...prev, viaticos_type: 'total' }))}` |  |  |  | QuoteFormV2 · l.740 |
| «Guardar Borrador» | `{(e) => handleSubmit(e, 'save')}` |  | `{loading}` |  | QuoteFormV2 · l.937 |
| «Generar Página Web» | `{(e) => handleSubmit(e, 'send')}` |  | `{loading}` |  | QuoteFormV2 · l.947 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver folleto →» | `{program.pdf_url}` (new tab) | `each programs && program.pdf_url` |  | QuoteFormV2 · l.674 |

**Other things that react to a click** (3)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «Habitación Individual Una cama, baño privado Precio por noche (CLP):» | `{() => setFormData(prev => ({ ...prev, room_type: 'single' }))}` | `!(useGroups)` | QuoteFormV2 · l.512 |
| `div` | «Habitación Doble Dos camas, baño privado Precio por noche (CLP):» | `{() => setFormData(prev => ({ ...prev, room_type: 'double' }))}` | `!(useGroups)` | QuoteFormV2 · l.550 |
| `div` | «{program.name} [{program.description}] [Ver folleto →] $ {program.price.toLocaleString('es-CL…} CLP por persona» | `{() => toggleProgram(program.id)}` | `each programs` | QuoteFormV2 · l.642 |

**Fields** (14)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre del Cliente *» | text | `client_name` · «Nombre completo o institución» · required |  |  |  | QuoteFormV2 · l.326 |
| «Institución» | text | `client_institution` · «Nombre de la escuela o institución» |  |  |  | QuoteFormV2 · l.341 |
| «Email» | email | `client_email` · «correo@ejemplo.com» |  |  |  | QuoteFormV2 · l.355 |
| «Teléfono» | tel | `client_phone` · «+56 9 XXXX XXXX» |  |  |  | QuoteFormV2 · l.369 |
| «Fecha de Llegada a Barcelona *» | date | `arrival_date` · required |  | `!(useGroups)` |  | QuoteFormV2 · l.438 |
| «Fecha de Salida de Barcelona *» | date | `departure_date` · required · `min={formData.arrival_date}` |  | `!(useGroups)` |  | QuoteFormV2 · l.452 |
| «Número de Pasantes *» | number | `num_pasantes` · required · `min=1` |  | `!(useGroups)` |  | QuoteFormV2 · l.477 |
| «Precio Aproximado del Vuelo (CLP)» | number | `flight_price` · «Precio por persona en CLP» · `min=0 step=10000` |  | `!(useGroups)` |  | QuoteFormV2 · l.494 |
| «Precio por noche (CLP):» | number | `min=0 step=1000` |  | `!(useGroups)` |  | QuoteFormV2 · l.529 |
| «Precio por noche (CLP):» | number | `min=0 step=1000` |  | `!(useGroups)` |  | QuoteFormV2 · l.567 |
| «Monto de Viático Diario / Total por Persona (CLP)» | number | `viaticos_amount` · «{formData.viaticos_type === 'daily' ? 'Monto por día' : 'Monto total'}» · `min=0 step=1000` |  | `formData.viaticos_type` |  | QuoteFormV2 · l.762 |
| «Notas para el Cliente» | textarea | `notes` · «Información adicional visible para el cliente...» |  |  |  | QuoteFormV2 · l.811 |
| «Notas Internas» | textarea | `internal_notes` · «Notas privadas, no visibles para el cliente...» |  |  |  | QuoteFormV2 · l.825 |
| «Válido Hasta» | date | `valid_until` · `min={new Date().toISOString().split('T')[0]}` |  |  |  | QuoteFormV2 · l.839 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => handleSubmit(e, 'save')}` |  | QuoteFormV2 · l.316 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `QuoteGroupsForm` |  | `useGroups` |  | QuoteFormV2 · l.414 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `initialGroup` | «Grupo Principal» | toggleGroupsMode · l.271 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Los valores de pasajes y estadía son referenciales. El precio definitivo a pagar se debe actualizar el día que se firme el contrato y realice el primer pago.» | QuoteFormV2 · l.72 |

**Values shown from data** (2)

- `{program.description}` — QuoteFormV2 · l.665, when `each programs && program.description`
- `$ {program.price.toLocaleString('es-CL…}` — QuoteFormV2 · l.690, when `each programs`

**Other texts on screen** (53)

- «Nombre del Cliente *» (label) — QuoteFormV2 · l.323
- «Institución» (label) — QuoteFormV2 · l.338
- «Email» (label) — QuoteFormV2 · l.352
- «Teléfono» (label) — QuoteFormV2 · l.366
- «Permite múltiples grupos con diferentes fechas de viaje / Un solo grupo con las mismas fechas para todos» — QuoteFormV2 · l.386
- «Fecha de Llegada a Barcelona *» (label) — QuoteFormV2 · l.435, when `!(useGroups)`
- «Fecha de Salida de Barcelona *» (label) — QuoteFormV2 · l.449, when `!(useGroups)`
- «{nights} noches en Barcelona» — QuoteFormV2 · l.467, when `!(useGroups) && nights > 0`
- «Número de Pasantes *» (label) — QuoteFormV2 · l.473, when `!(useGroups)`
- «Precio Aproximado del Vuelo (CLP)» (label) — QuoteFormV2 · l.490, when `!(useGroups)`
- «Tipo de Habitación» (label) — QuoteFormV2 · l.508, when `!(useGroups)`
- «Una cama, baño privado» — QuoteFormV2 · l.522, when `!(useGroups)`
- «Precio por noche (CLP):» (label) — QuoteFormV2 · l.524, when `!(useGroups)`
- «Dos camas, baño privado» — QuoteFormV2 · l.560, when `!(useGroups)`
- «Precio por noche (CLP):» (label) — QuoteFormV2 · l.562, when `!(useGroups)`
- «Aplica un descuento de» — QuoteFormV2 · l.601
- «$500.000 CLP por programa» — QuoteFormV2 · l.601
- «si el pago se realiza antes del 31 de marzo de 2026.» — QuoteFormV2 · l.601
- «Aplicar descuento por pago anticipado» (label) — QuoteFormV2 · l.605
- «✅ Se aplicará un descuento de» — QuoteFormV2 · l.621, when `formData.apply_early_bird_discount`
- «$ {(calculations.discountAmount \|\| 0).…} CLP» — QuoteFormV2 · l.621, when `formData.apply_early_bird_discount`
- «al total» — QuoteFormV2 · l.621, when `formData.apply_early_bird_discount`
- «Fecha límite de pago: 31 de marzo de 2026» — QuoteFormV2 · l.624, when `formData.apply_early_bird_discount`
- «CLP por persona» — QuoteFormV2 · l.693, when `each programs`
- «Tipo de Viático» (label) — QuoteFormV2 · l.710
- «Monto de Viático Diario / Total por Persona (CLP)» (label) — QuoteFormV2 · l.757, when `formData.viaticos_type`
- «× {nights + 1} días = $ {((formData.viaticos_amount \|\| 0) * …} CLP» — QuoteFormV2 · l.775, when `formData.viaticos_type && formData.viaticos_type === 'daily' && nights > 0`
- «Viático base total ( {calculations.totalParticipants} personas):» — QuoteFormV2 · l.784, when `formData.viaticos_type && formData.viaticos_amount > 0`
- «$ {calculations.viaticosTotal.toLocale…} CLP» — QuoteFormV2 · l.785, when `formData.viaticos_type && formData.viaticos_amount > 0`
- «Con gestión administrativa (15%):» — QuoteFormV2 · l.788, when `formData.viaticos_type && formData.viaticos_amount > 0`
- «$ {calculations.viaticosDisplayAmount.…} CLP» — QuoteFormV2 · l.789, when `formData.viaticos_type && formData.viaticos_amount > 0`
- «* El monto incluye un 15% por gestión administrativa (no desglosado en la propuesta)» — QuoteFormV2 · l.792, when `formData.viaticos_type && formData.viaticos_amount > 0`
- «Notas para el Cliente» (label) — QuoteFormV2 · l.808
- «Notas Internas» (label) — QuoteFormV2 · l.822
- «Válido Hasta» (label) — QuoteFormV2 · l.836
- «Participantes Totales:» — QuoteFormV2 · l.861, when `useGroups && calculations.totalParticipants > 0`
- «{calculations.totalParticipants} personas» — QuoteFormV2 · l.862, when `useGroups && calculations.totalParticipants > 0`
- «Vuelos:» — QuoteFormV2 · l.867
- «$ {calculations.flightTotal.toLocaleSt…} CLP» — QuoteFormV2 · l.868
- «Alojamiento Total:» — QuoteFormV2 · l.872
- «$ {calculations.accommodationTotal.toL…} CLP» — QuoteFormV2 · l.873
- «Programas ( {formData.selected_programs.length} seleccionados):» — QuoteFormV2 · l.879
- «$ {calculations.originalProgramTotal.t…} CLP» — QuoteFormV2 · l.883, when `formData.apply_early_bird_discount && calculations.discountAmount > 0`
- «$ {calculations.programTotal.toLocaleS…} CLP» — QuoteFormV2 · l.886, when `formData.apply_early_bird_discount && calculations.discountAmount > 0`
- «$ {calculations.programTotal.toLocaleS…} CLP» — QuoteFormV2 · l.891, when `!(formData.apply_early_bird_discount && calculations.discountAmount > 0)`
- «Viáticos ({nights + 1} días x {calculations.totalParticipa…} personas) / ({calculations.totalParticipa…} personas) :» — QuoteFormV2 · l.901, when `calculations.viaticosDisplayAmount > 0`
- «$ {calculations.viaticosDisplayAmount.…} CLP» — QuoteFormV2 · l.906, when `calculations.viaticosDisplayAmount > 0`
- «🎉 Descuento por Pago Anticipado:» — QuoteFormV2 · l.914, when `formData.apply_early_bird_discount && calculations.discountAmount > 0`
- «-$ {calculations.discountAmount.toLocal…} CLP» — QuoteFormV2 · l.915, when `formData.apply_early_bird_discount && calculations.discountAmount > 0`
- «Total por Persona:» — QuoteFormV2 · l.922
- «$ {calculations.totalPerPerson.toLocal…} CLP» — QuoteFormV2 · l.923
- «TOTAL GENERAL ( {calculations.totalParticipants} personas):» — QuoteFormV2 · l.928, when `calculations.totalParticipants > 1`
- «$ {calculations.grandTotal.toLocaleStr…} CLP» — QuoteFormV2 · l.929, when `calculations.totalParticipants > 1`

### components/quotes/QuoteGroupsForm.tsx

Used by: `/admin/quotes/[id]/edit`, `/admin/quotes/new`

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Configuración de Precios de Habitación» | h3 |  | QuoteGroupsForm · l.151 |
| «Grupos de Viaje» | h3 |  | QuoteGroupsForm · l.190 |
| «{group.group_name} / Grupo {index + 1}» | h4 | `each groups` | QuoteGroupsForm · l.209 |
| «Subtotal del Grupo» | h5 | `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date` | QuoteGroupsForm · l.366 |
| «Resumen de Todos los Grupos» | h4 | `groups.length > 1` | QuoteGroupsForm · l.388 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar Grupo» | `{addGroup}` |  |  |  | QuoteGroupsForm · l.191 |
| «[icon Trash2]» | `{(e) => { e.stopPropagation(); removeGroup(index); }}` | `each groups && groups.length > 1` |  |  | QuoteGroupsForm · l.225 |

**Other things that react to a click** (3)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{group.group_name} / Grupo {index + 1} {group.num_participants} personas [{calculateNights(group.arrival_date,…} noches]» | `{() => toggleGroupExpansion(index)}` | `each groups` | QuoteGroupsForm · l.204 |
| `div` | «Individual $ {singleRoomPrice.toLocaleString('es-…} CLP/noche» | `{() => updateGroup(index, 'room_type', 'single')}` | `each groups && expandedGroups.has(index)` | QuoteGroupsForm · l.334 |
| `div` | «Doble $ {doubleRoomPrice.toLocaleString('es-…} CLP/noche» | `{() => updateGroup(index, 'room_type', 'double')}` | `each groups && expandedGroups.has(index)` | QuoteGroupsForm · l.347 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Precio Habitación Individual (CLP por noche)» | number | «Ej: 150000» · `min=0 step=1000` |  |  |  | QuoteGroupsForm · l.160 |
| «Precio Habitación Doble (CLP por noche)» | number | «Ej: 100000» · `min=0 step=1000` |  |  |  | QuoteGroupsForm · l.174 |
| «Nombre del Grupo (Opcional)» | text | «Ej: Primera Semana, Grupo A, etc.» |  | `each groups && expandedGroups.has(index)` |  | QuoteGroupsForm · l.252 |
| «Número de Participantes» | number | `min=1` |  | `each groups && expandedGroups.has(index)` |  | QuoteGroupsForm · l.266 |
| «Fecha de Llegada» | date |  |  | `each groups && expandedGroups.has(index)` |  | QuoteGroupsForm · l.281 |
| «Fecha de Salida» | date | `min={group.arrival_date}` |  | `each groups && expandedGroups.has(index)` |  | QuoteGroupsForm · l.292 |
| «Precio del Vuelo por Persona (CLP)» | number | «Ej: 800000» · `min=0 step=10000` |  | `each groups && expandedGroups.has(index)` |  | QuoteGroupsForm · l.317 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Debe mantener al menos un grupo» | `groups.length === 1` | removeGroup · l.86 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `groups.length === 0` | QuoteGroupsForm · l.42 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `newGroup` | «Grupo {groups.length + 1}» | addGroup · l.70 |

**Values shown from data** (3)

- `{totals.totalParticipants}` — QuoteGroupsForm · l.391, when `groups.length > 1`
- `$ {totals.totalFlights.toLocaleString(…}` — QuoteGroupsForm · l.395, when `groups.length > 1`
- `$ {totals.totalAccommodation.toLocaleS…}` — QuoteGroupsForm · l.399, when `groups.length > 1`

**Other texts on screen** (22)

- «Precio Habitación Individual (CLP por noche)» (label) — QuoteGroupsForm · l.157
- «Precio Habitación Doble (CLP por noche)» (label) — QuoteGroupsForm · l.171
- «personas» — QuoteGroupsForm · l.213, when `each groups`
- «noches» — QuoteGroupsForm · l.218, when `each groups && group.arrival_date && group.departure_date`
- «Nombre del Grupo (Opcional)» (label) — QuoteGroupsForm · l.249, when `each groups && expandedGroups.has(index)`
- «Número de Participantes» (label) — QuoteGroupsForm · l.263, when `each groups && expandedGroups.has(index)`
- «Fecha de Llegada» (label) — QuoteGroupsForm · l.278, when `each groups && expandedGroups.has(index)`
- «Fecha de Salida» (label) — QuoteGroupsForm · l.289, when `each groups && expandedGroups.has(index)`
- «{calculateNights(group.arrival_date,…} noches en Barcelona» — QuoteGroupsForm · l.305, when `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date`
- «Precio del Vuelo por Persona (CLP)» (label) — QuoteGroupsForm · l.313, when `each groups && expandedGroups.has(index)`
- «Tipo de Habitación» (label) — QuoteGroupsForm · l.330, when `each groups && expandedGroups.has(index)`
- «Individual» — QuoteGroupsForm · l.342, when `each groups && expandedGroups.has(index)`
- «$ {singleRoomPrice.toLocaleString('es-…} CLP/noche» — QuoteGroupsForm · l.343, when `each groups && expandedGroups.has(index)`
- «Doble» — QuoteGroupsForm · l.355, when `each groups && expandedGroups.has(index)`
- «$ {doubleRoomPrice.toLocaleString('es-…} CLP/noche» — QuoteGroupsForm · l.356, when `each groups && expandedGroups.has(index)`
- «Vuelos ( {group.num_participants} × $ {group.flight_price.toLocaleString('…} )» — QuoteGroupsForm · l.369, when `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date`
- «$ {(group.flight_price * group.num_par…} CLP» — QuoteGroupsForm · l.370, when `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date`
- «Alojamiento ( {calculateNights(group.arrival_date,…} noches × {group.num_participants} personas)» — QuoteGroupsForm · l.373, when `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date`
- «$ {(calculateNights(group.arrival_date…} CLP» — QuoteGroupsForm · l.374, when `each groups && expandedGroups.has(index) && group.arrival_date && group.departure_date`
- «Participantes Totales» — QuoteGroupsForm · l.392, when `groups.length > 1`
- «Total Vuelos (CLP)» — QuoteGroupsForm · l.396, when `groups.length > 1`
- «Total Alojamiento (CLP)» — QuoteGroupsForm · l.400, when `groups.length > 1`

### components/quotes/QuotePublicView.tsx

Used by: `/quote/[id]`

**Titles** (12)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «FUNDACIÓN NUEVA EDUCACIÓN» | h1 |  | QuotePublicView · l.520 |
| «Información del Cliente» | h2 |  | QuotePublicView · l.562 |
| «Detalles del Viaje» | h3 |  | QuotePublicView · l.600 |
| «Información de Vuelo» | h3 |  | QuotePublicView · l.636 |
| «Programas Incluidos» | h3 | `quote.programs && quote.programs.length > 0` | QuotePublicView · l.660 |
| «{program.name}» | h4 | `quote.programs && quote.programs.length > 0 && each quote.programs` | QuotePublicView · l.670 |
| «Resumen de Costos» | h3 |  | QuotePublicView · l.702 |
| «Costo por Persona» | h4 |  | QuotePublicView · l.710 |
| «Descuento por Pago Anticipado Aplicado» | h3 | `quote.apply_early_bird_discount` | QuotePublicView · l.802 |
| «Información Adicional» | h3 | `quote.notes` | QuotePublicView · l.818 |
| «¿Qué incluye la experiencia?» | h3 |  | QuotePublicView · l.825 |
| «Barcelona, España» | h3 |  | QuotePublicView · l.874 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Descargar PDF» | `{() => generatePDF()}` |  |  |  | QuotePublicView · l.918 |
| «Contactar para Reservar» | `{handleContact}` |  |  |  | QuotePublicView · l.926 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ver folleto del programa» | `{program.pdf_url}` (new tab) | `quote.programs && quote.programs.length > 0 && each quote.programs && program.pdf_url` |  | QuotePublicView · l.678 |
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | QuotePublicView · l.939 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt FNE · /Logo BW.png?v=3 |  |  | QuotePublicView · l.523 |
| img · alt Barcelona · /barcelona-skyline.jpg |  |  | QuotePublicView · l.901 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «PDF descargado exitosamente» |  | generatePDF · l.506 |

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `pdf.save()` |  | generatePDF · l.505 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `mailto:info@nuevaeducacion.org?subject=Consulta sobre cotización pasantía Barcelona` | `location.href` |  | handleContact · l.510 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `travelItems` | «Fecha de llegada», «Fecha de salida», «Duración», «Participantes», «Tipo de habitación» | generatePDF · l.263 |
| `costRows` | «Vuelo internacional», «Alojamiento ({quote.nights} {quote.nights === 1 ? 'noche…})», «Programas ({quote.programs?.length \|\| 0})», «Incluye descuento por pago anticipado [if quote.apply_early_bird_discount]» | generatePDF · l.348 |
| `formatCurrencyClp()` | «${Math.round(value).toLocaleS…} CLP» | formatCurrencyClp · l.105 |

**Other texts written in the code (safety net: not tied to an element by the script)** (18)

| Text | Where |
|---|---|
| «Email: info@nuevaeducacion.org» | QuotePublicView · l.195 |
| «Tel: +56 9 4162 3577» | QuotePublicView · l.196 |
| «Web: www.nuevaeducacion.org» | QuotePublicView · l.197 |
| «Propuesta Pasantía Internacional · Barcelona 2025» | QuotePublicView · l.218 |
| «Emitida: {formatDate(quote.created_at)}» | QuotePublicView · l.236 |
| «Información del cliente» | QuotePublicView · l.250 |
| «Detalles del viaje» | QuotePublicView · l.262 |
| «Triple» | QuotePublicView · l.282 |
| «Programas seleccionados» | QuotePublicView · l.290 |
| «Resumen de costos» | QuotePublicView · l.335 |
| «Viáticos (monto total)» | QuotePublicView · l.370 |
| «Concepto» | QuotePublicView · l.381 |
| «Monto» | QuotePublicView · l.382 |
| «Total general para {quote.num_pasantes} {quote.num_pasantes === 1 ? …}» | QuotePublicView · l.442 |
| «Descuento por pago anticipado» | QuotePublicView · l.469 |
| «Válido pagando antes del 31 de marzo de 2026» | QuotePublicView · l.480 |
| «Información adicional» | QuotePublicView · l.494 |
| «<div class="text-gray-400 text-center p-8">Barcelona, España</div>» | QuotePublicView · l.908 |

**Values shown from data** (11)

- `# {quote.quote_number}` — QuotePublicView · l.566, when `quote.quote_number`
- `{quote.client_name}` — QuotePublicView · l.573
- `{quote.client_institution}` — QuotePublicView · l.578, when `quote.client_institution`
- `{quote.client_email}` — QuotePublicView · l.584, when `quote.client_email`
- `{quote.client_phone}` — QuotePublicView · l.590, when `quote.client_phone`
- `{formatDate(quote.arrival_date)}` — QuotePublicView · l.608
- `{formatDate(quote.departure_date)}` — QuotePublicView · l.612
- `{quote.flight_notes}` — QuotePublicView · l.650, when `quote.flight_notes`
- `{program.description}` — QuotePublicView · l.675, when `quote.programs && quote.programs.length > 0 && each quote.programs && program.description`
- `$ {program.price.toLocaleString('es-CL…}` — QuotePublicView · l.690, when `quote.programs && quote.programs.length > 0 && each quote.programs`
- `{quote.notes}` — QuotePublicView · l.819, when `quote.notes`

**Other texts on screen** (58)

- «Cotización Pasantía Internacional Barcelona» — QuotePublicView · l.521
- «Cotización activa» — QuotePublicView · l.539, when `quote.status === 'sent' \|\| quote.status === 'viewed'`
- «Válida hasta: {formatDate(quote.valid_until)}» — QuotePublicView · l.542, when `(quote.status === 'sent' \|\| quote.status === 'viewed') && quote.valid_until`
- «Esta cotización ha expirado» — QuotePublicView · l.552, when `(!(quote.status === 'sent' \|\| quote.status === 'viewed')) && quote.status === 'expired'`
- «N° Cotización» — QuotePublicView · l.565, when `quote.quote_number`
- «Cliente» — QuotePublicView · l.572
- «Institución» — QuotePublicView · l.577, when `quote.client_institution`
- «Email» — QuotePublicView · l.583, when `quote.client_email`
- «Teléfono» — QuotePublicView · l.589, when `quote.client_phone`
- «Fecha de llegada» — QuotePublicView · l.607
- «Fecha de salida» — QuotePublicView · l.611
- «Duración» — QuotePublicView · l.615
- «{quote.nights} noches» — QuotePublicView · l.616
- «Número de pasantes» — QuotePublicView · l.619
- «persona / personas» — QuotePublicView · l.622
- «Tipo de habitación» — QuotePublicView · l.626
- «Individual / Doble» — QuotePublicView · l.627
- «Precio estimado del vuelo» — QuotePublicView · l.643
- «$ {quote.flight_price.toLocaleString('…} CLP» — QuotePublicView · l.644
- «Por persona» — QuotePublicView · l.645
- «CLP por persona» — QuotePublicView · l.691, when `quote.programs && quote.programs.length > 0 && each quote.programs`
- «Vuelo internacional» — QuotePublicView · l.714
- «$ {quote.flight_price.toLocaleString('…} CLP» — QuotePublicView · l.715
- «Alojamiento ( {quote.nights} noches)» — QuotePublicView · l.721
- «$ {(quote.accommodation_total / quote.…} CLP» — QuotePublicView · l.724
- «Programas (» — QuotePublicView · l.731
- «(Descuento aplicado)» — QuotePublicView · l.734, when `quote.apply_early_bird_discount`, screen size: `sm:inline`
- «$ {(quote.programs.reduce((sum, p) => …} CLP» — QuotePublicView · l.741, when `quote.apply_early_bird_discount && quote.programs?.length > 0`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «$ {programCostPerPerson.toLocaleString…} CLP» — QuotePublicView · l.744, when `quote.apply_early_bird_discount && quote.programs?.length > 0`
- «$ {programCostPerPerson.toLocaleString…} CLP» — QuotePublicView · l.749, when `!(quote.apply_early_bird_discount && quote.programs?.length > 0)`
- «Viáticos ({quote.nights + 1} días) / (monto total)» — QuotePublicView · l.759, when `quote.viaticos_display_amount && quote.viaticos_display_amount > 0`
- «$ {Math.round(quote.viaticos_display_a…} CLP» — QuotePublicView · l.764, when `quote.viaticos_display_amount && quote.viaticos_display_amount > 0`
- «Total por persona» — QuotePublicView · l.772
- «CLP» — QuotePublicView · l.774
- «TOTAL GENERAL» — QuotePublicView · l.786, when `quote.num_pasantes > 1`
- «Para {quote.num_pasantes} personas» — QuotePublicView · l.787, when `quote.num_pasantes > 1`
- «CLP» — QuotePublicView · l.790, when `quote.num_pasantes > 1`
- «Se ha aplicado un descuento de» — QuotePublicView · l.806, when `quote.apply_early_bird_discount`
- «$ {(500000 * (quote.programs?.length \|…} CLP por persona» — QuotePublicView · l.806, when `quote.apply_early_bird_discount`
- «en los programas seleccionados.» — QuotePublicView · l.806, when `quote.apply_early_bird_discount`
- «Este descuento es válido realizando el pago antes del» — QuotePublicView · l.809, when `quote.apply_early_bird_discount`
- «31 de marzo de 2026» — QuotePublicView · l.809, when `quote.apply_early_bird_discount`
- «Codocencia en Aulas» — QuotePublicView · l.831
- «Participa activamente como co-docente en escuelas innovadoras» — QuotePublicView · l.833
- «Visitas a Escuelas» — QuotePublicView · l.841
- «Conoce las metodologías más vanguardistas de Europa» — QuotePublicView · l.843
- «Talleres Especializados» — QuotePublicView · l.851
- «Workshops con expertos internacionales en educación» — QuotePublicView · l.853
- «Certificación Internacional» — QuotePublicView · l.861
- «Reconocimiento oficial de tu participación y aprendizajes» — QuotePublicView · l.863
- «Vive una experiencia transformadora en una de las ciudades más innovadoras de Europa en educación.» — QuotePublicView · l.879
- «Ciudad cosmopolita y multicultural» — QuotePublicView · l.884
- «Hub de innovación educativa» — QuotePublicView · l.888
- «Red de escuelas colaboradoras» — QuotePublicView · l.892
- «Experiencia cultural enriquecedora» — QuotePublicView · l.896
- «¿Tienes preguntas? Contáctanos:» — QuotePublicView · l.937
- «© 2025 Fundación Nueva Educación» — QuotePublicView · l.950
- «Transformando la educación, un viaje a la vez» — QuotePublicView · l.951

### lib/annex-template.ts

Used by: `/contract-print/[id]`, `/contracts`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `ANNEX_TEMPLATE` | «<article class="fne-document fne-annex"> {documentHeader('Anexo de co…} <p>En Santiago de Chile, a {{FECHA_ANEXO}}, las partes firmantes del contrato original suscrito con fecha {{FECHA_CONTRATO}}, entre {{CLIENTE_NOMBRE_LEGAL}} y Fundación Instituto Relacional (Nueva Educación), acuerdan el presen…» | l.3 |
| `formatCurrencyUF()` | «UF {amount.toLocaleString('es-C…}» | formatCurrencyUF · l.38 |
| `generateCuotasDetalle()` | «<p>Sin cuotas definidas</p>», «<table><thead><tr><th>Cuota</th><th>Monto</th><th>Vencimiento</th></tr></thead><tbody>{cuotas.map(cuota => `<tr><t…}</tbody></table>» | generateCuotasDetalle · l.51 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Anexo de contrato de prestación de servicios» | ANNEX_TEMPLATE · l.4 |

### lib/contract-document.ts

Used by: `/contract-print/[id]`, `/contracts`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Permita ventanas emergentes para abrir la vista previa» | `throw (shown by whoever catches it)` | `!preview` | openDocumentPreview · l.72 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
|  | `window.open` |  | openDocumentPreview · l.71 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `CONTRACT_PRINT_GUIDANCE` | «Para guardar el PDF, selecciona tamaño Carta y escala 100 %. Desactiva los encabezados y pies de página del navegador y activa la impresión de fondos.» | l.55 |
| `DOCUMENT_FOOTER` | «<footer><span>Fundación Nueva Educación · Agencia Técnica Educativa certificada por Mineduc</span><span>www.nuevaeducacion.org</span></footer>» | l.67 |
| `documentHeader()` | «<header><img src="/logos/contract-horizontal-gold.png" alt="Fundación Nueva Educación"><div class="doc-meta"><strong>Contrato {number}</strong>{annex ? `<div>Anexo N.º ${a…}<div>Santiago de Chile, {date}</div></div></header><h1>{title}</h1><div class="title-rule"></div><p class="doc-parties">Entre …» | documentHeader · l.62 |
| `documentSignatures()` | «<div class="doc-signatures"><div class="doc-signature"><div class="signature-name">{representative}</div><div class="signature-entity">p.p. {client}</div></div><div class="doc-signature"><div class="signature-name">ARNOLDO CISTERNAS CHÁVEZ</div><div class="signature-entity">p.p Representante Legal …» | documentSignatures · l.65 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «<header><img src="/logos/contract-horizontal-gold.png" alt="Fundación Nueva Educación"><div class="doc-meta"><strong>Contrato {number}</strong>{annex ? `<div>Anexo N.º ${a…}<div>Santiago de Chile, {date}</div></div></header><h1>{title}</h1><div class="title-rule"></div><p class="doc-parties">Entre …» | documentHeader · l.62 |
| «<div class="doc-signatures"><div class="doc-signature"><div class="signature-name">{representative}</div><div class="signature-entity">p.p. {client}</div></div><div class="doc-signature"><div class="signature-name">ARNOLDO CISTERNAS CHÁVEZ</div><div class="signature-entity">p.p Representante Legal …» | documentSignatures · l.65 |
| «Imprimir / Guardar PDF» | renderDocumentPreview · l.84 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| lookup | `getElementById('print-document')` | renderDocumentPreview · l.82 |

### lib/contract-template.ts

Used by: `/contract-print/[id]`, `/contracts`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «{years} {years === 1 ? 'año' : 'años'}» | `parts.push` | `years > 0` | calculateDuration · l.222 |
| «{months} {months === 1 ? 'mes' : 'mes…}» | `parts.push` | `months > 0` | calculateDuration · l.226 |
| «{days} {days === 1 ? 'día' : 'días'}» | `parts.push` | `days > 0` | calculateDuration · l.230 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `CONTRACT_TEMPLATE` | «<div style="text-align: center; font-weight: bold; margin-bottom: 20px;"> CONTRATO DE PRESTACIÓN DE SERVICIOS<br> FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)<br> Y<br> {{CLIENTE_NOMBRE_LEGAL}}<br> Contrato {{CONTRATO_NUMERO}} </div> En Santiago de Chile, a {{FECHA_CONTRATO}}, entre {{CLIENTE_N…» | l.6 |
| `contract` | «<article class="fne-document">{documentHeader('Contrato de…}{body.split(/\n\s*\n/).map(p…}<div class="doc-closing">{documentSignatures('{{CLIEN…}{DOCUMENT_FOOTER}</div></article>» | generateContractFromTemplate · l.153 |
| `replacements` | «UF [if isUF]», «Pesos Chilenos [if not isUF]» | generateContractFromTemplate · l.274 |
| `generateContractFromTemplate()` | «<h2{heading.startsWith('DÉCIMO …}>{heading}</h2>{lines.length ? `<p>${lines.…}», «<p>{text.replace(/\n/g, '<br>')}</p>» | generateContractFromTemplate · l.157 |
| `formatCurrencyUF()` | «UF {amount.toLocaleString('es-C…}» | formatCurrencyUF · l.183 |
| `calculateDuration()` | «duración a determinar», «misma fecha» | calculateDuration · l.196 |
| `generateCuotasDetalle()` | «Sin cuotas definidas», «<table><thead><tr><th>Cuota</th><th>Monto</th><th>Vencimiento</th></tr></thead><tbody>{cuotas.map(cuota => `<tr><t…}</tbody></table>» | generateCuotasDetalle · l.247 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Contrato de prestación de servicios» | generateContractFromTemplate · l.153 |
| «<h2{heading.startsWith('DÉCIMO …}>{heading}</h2>{lines.length ? `<p>${lines.…}» | generateContractFromTemplate · l.157 |
| «duración a determinar» | generateContractFromTemplate · l.196 |
| «Sin cuotas definidas» | generateContractFromTemplate · l.247 |

### lib/contracts/extractionError.ts

Used by: `/contracts`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `NOT_CONFIGURED_MESSAGE` | «La lectura automática de PDF no está configurada. Ingrese los datos del contrato manualmente.» | l.6 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Error al procesar el PDF» | extractionErrorMessage · l.13 |

### lib/uf-service.ts

Used by: `/contracts`

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «CMF API error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchFromCMF · l.167 |
| «CMF API error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchFromCMFByDate · l.195 |
| «SII API error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchFromSII · l.217 |
| «API error: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchFromPublicAPI · l.244 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `formatCurrency()` | «UF {amount.toLocaleString('es-C…}» | formatCurrency · l.278 |

### lib/utils/reconcileCuotas.ts

Used by: `/contracts`

**Reads and writes the database directly:** `table:cuotas` (delete, insert, select, update)

### types/roles.ts

Used by: `/admin/clients`, `/contracts`

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

Used by: `/admin/clients`, `/contracts`

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `userRoles = await getUserRoles(supabase, userId)` | getUserPrimaryRole · l.1186 |
| `highestRole = getHighestRole(userRoles)` | getUserPrimaryRole · l.1187 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:schools` (select), `table:user_roles` (select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/contracts/[id]/hours/allocate` | `pages/api/contracts/[id]/hours/allocate.ts` | DELETE, POST | `/contracts` | `__tests__/api/hour-tracking/allocation.test.ts`, `components/contracts/HourAllocationPanel.tsx` |
| `/api/contracts/[id]/hours` | `pages/api/contracts/[id]/hours/index.ts` | GET | `/contracts` | `components/contracts/HourAllocationPanel.tsx` |
| `/api/contracts/[id]/hours/ledger/[ledgerId]` | `pages/api/contracts/[id]/hours/ledger/[ledgerId].ts` | PATCH | **no screen** | `__tests__/api/hour-tracking/ledger-json.test.ts`, `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`, `supabase/migrations/20260813120800_ledger_insert_override_sequence_privileges.sql` |
| `/api/contracts/[id]/hours/ledger/csv` | `pages/api/contracts/[id]/hours/ledger/csv.ts` | GET | `/contracts` | `__tests__/api/hour-tracking/ledger-csv.test.ts`, `components/contracts/HourAllocationPanel.tsx` |
| `/api/contracts/[id]/hours/ledger` | `pages/api/contracts/[id]/hours/ledger/index.ts` | GET, POST | **no screen** | `__tests__/api/hour-tracking/ledger-json.test.ts` |
| `/api/contracts/[id]/hours/reallocate` | `pages/api/contracts/[id]/hours/reallocate.ts` | PATCH | `/contracts` | `__tests__/api/hour-tracking/reallocation.test.ts`, `components/contracts/ReallocationModal.tsx` |
| `/api/contracts/extract-pdf` | `pages/api/contracts/extract-pdf.ts` | POST | `/contracts` | `__tests__/api/forged-session-sweep.test.ts`, `components/contracts/ContractPDFImporter.tsx` |
| `/api/quotes/[id]` | `pages/api/quotes/[id].ts` | DELETE, GET, PUT | `/admin/quotes`, `/admin/quotes/[id]/edit`, `/quote/[id]` | `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `pages/admin/quotes/[id]/edit.tsx`, `pages/admin/quotes/index.tsx`, `pages/quote/[id].tsx`, `scripts/redesign/harness/seed/50-gestion-licitaciones.mjs` |
| `/api/quotes/[id]/groups` | `pages/api/quotes/[id]/groups.ts` | DELETE, GET, POST, PUT | `/admin/quotes/[id]/edit`, `/admin/quotes/new` | `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `components/quotes/QuoteFormV2.tsx` |
| `/api/quotes/create` | `pages/api/quotes/create.ts` | POST | **no screen** | `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts` |
| `/api/quotes/createV2` | `pages/api/quotes/createV2.ts` | POST | `/admin/quotes/new` | `__tests__/api/admin/assignment-matrix-quotes-forged-session.test.ts`, `pages/admin/quotes/new.tsx` |
| `/api/quotes/list` | `pages/api/quotes/list.ts` | GET | **no screen** | `__tests__/api/forged-session-sweep.test.ts` |
| `/api/quotes/programs` | `pages/api/quotes/programs.ts` | DELETE, GET, POST, PUT | `/admin/quotes/[id]/edit`, `/admin/quotes/new` | `__tests__/api/forged-session-sweep.test.ts`, `components/quotes/QuoteForm.tsx`, `components/quotes/QuoteFormV2.tsx` |
| `/api/uf-value` | `pages/api/uf-value.ts` | GET | `/contracts` | `lib/uf-service.ts` |

