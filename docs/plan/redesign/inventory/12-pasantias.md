# Pasantías (leads, travellers, panel, my trip)

Area `12-pasantias`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `6a336e70e` (2026-11-24).

5 screen files, 21 API files, 25 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/admin/pasantia-leads` | `pages/admin/pasantia-leads.tsx` | 672 | Personas › Pasantías |  |
| `/admin/pasantia-participants` | `pages/admin/pasantia-participants.tsx` | 481 | Personas › Nóminas de pasantes |  |
| `/admin/pasantias-panel` | `pages/admin/pasantias-panel.tsx` | 448 | Personas › Panel de pasantías |  |
| `/pasantias/nomina` | `pages/pasantias/nomina.tsx` | 925 | — | Looks like a leftover but is in use |
| `/profile/pasantia` | `pages/profile/pasantia.tsx` | 191 | Mi pasantía |  |

## /admin/pasantia-leads

File `pages/admin/pasantia-leads.tsx` · 672 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: Personas › «Pasantías» → `/admin/pasantia-leads` — admin only; the group: admin only (`Sidebar.tsx` l.420)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.85 `server redirect → /login  (when !user)`
  - l.89 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.89 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.91 `server redirect → /dashboard  (when !isAdmin)`
- Linked from: `components/layout/Sidebar.tsx:422`
- Tests: browser tests that CI runs: `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/pasantias-flow.spec.ts`, `tests/e2e/pasantias-leads-admin.spec.ts`; unit tests of the page: `__tests__/lib/api-auth.server-side-user.test.ts`, `__tests__/pages/admin/pasantia-leads.test.tsx`.

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

**Tabs** (1)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «{tab.label} {tab.count}» | `{() => { setStatusTab(tab.key); setPage(1); }}` | `each tabs` | PasantiaLeadsAdminPage · l.355 |

**Buttons** (9)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshCw]» · tooltip «Actualizar» · aria «Actualizar» | `{fetchLeads}` |  | `{loading}` | `testid=pasantia-leads-refresh` | PasantiaLeadsAdminPage · l.322 |
| «[icon Loader2]» · tooltip «Exportar CSV de todos los contactos filtrados» · aria «Exportar CSV de todos los contactos filtrados» | `{handleExport}` |  | `{exporting}` | `testid=pasantia-leads-export-csv` | PasantiaLeadsAdminPage · l.333 |
| «Reintentar» | `{fetchLeads}` | `error` | `{loading}` | `testid=pasantia-leads-retry` | PasantiaLeadsAdminPage · l.426 |
| «Detalle» | `{() => setExpandedId((current) => (current === lead.id ? null : lead.id))}` | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `hidden md:block` |  | `testid=pasantia-lead-toggle-{lead.id}` | PasantiaLeadsAdminPage · l.518 |
| «Detalle» | `{() => setExpandedId((current) => (current === lead.id ? null : lead.id))}` | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `md:hidden` |  | `testid=pasantia-lead-toggle-mobile-{lead.id}` | PasantiaLeadsAdminPage · l.584 |
| «Primera» | `{() => setPage(1)}` | `pagination && pagination.total > 0 && !error` | `{loading \|\| page <= 1}` | `testid=pasantia-leads-page-first` | PasantiaLeadsAdminPage · l.628 |
| «Anterior» | `{() => setPage((current) => Math.max(1, current - 1))}` | `pagination && pagination.total > 0 && !error` | `{loading \|\| page <= 1}` | `testid=pasantia-leads-page-prev` | PasantiaLeadsAdminPage · l.637 |
| «Siguiente» | `{() => setPage((current) => Math.min(pageCount, current + 1))}` | `pagination && pagination.total > 0 && !error` | `{loading \|\| page >= pageCount}` | `testid=pasantia-leads-page-next` | PasantiaLeadsAdminPage · l.646 |
| «Última» | `{() => setPage(pageCount)}` | `pagination && pagination.total > 0 && !error` | `{loading \|\| page >= pageCount}` | `testid=pasantia-leads-page-last` | PasantiaLeadsAdminPage · l.655 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar leads» | text | «Buscar nombre, correo o institución» |  |  | `testid=pasantia-leads-search` | PasantiaLeadsAdminPage · l.389 |
| «Filtrar por programa» | select |  | «Todos los programas», «(lista) {programById(programId).name}», «Sin programa (histórico o sin clasificar)» |  | `testid=pasantia-leads-program-filter` | PasantiaLeadsAdminPage · l.399 |

**Table columns** (1)

| Text | Shown when | Where |
|---|---|---|
| «{label}» | `!(loading) && !(error) && !(leads.length === 0) && each [ 'Fecha', 'Nombre', 'Correo', 'WhatsApp', 'Insti…` · screen size: `hidden md:block` | PasantiaLeadsAdminPage · l.480 |

**Toasts** (5)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «{message}» |  | PasantiaLeadsAdminPage · l.179 |
| success | «Estado actualizado / Nota guardada» |  | PasantiaLeadsAdminPage · l.211 |
| error | «No se pudo guardar el cambio» |  | PasantiaLeadsAdminPage · l.214 |
| success | «CSV exportado: {contacts.length} contactos» |  | handleExport · l.287 |
| error | «{message}» |  | handleExport · l.294 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al cargar los leads» | `throw (shown by whoever catches it)` | `!response.ok` | PasantiaLeadsAdminPage · l.159 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.85 |
| `/dashboard` | `server redirect` | `!isAdmin` | getServerSideProps · l.91 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.89 |
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.89 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `next === appliedSearch` | PasantiaLeadsAdminPage · l.132 |
| `requestId !== latestRequest.current` | PasantiaLeadsAdminPage · l.161 |
| `requestId !== latestRequest.current` | PasantiaLeadsAdminPage · l.176 |

**Pieces placed here, with the texts and settings handed to them** (18)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Pasantías |  |  | PasantiaLeadsAdminPage · l.314 |
| `ResponsiveFunctionalPageHeader` | title: Leads de Pasantías · subtitle: Interesados en las Pasantías INSPIRA Barcelona |  |  | PasantiaLeadsAdminPage · l.316 |
| `RefreshCw` | aria-hidden: true |  |  | PasantiaLeadsAdminPage · l.331 |
| `Loader2` | aria-hidden: true | `exporting` |  | PasantiaLeadsAdminPage · l.344 |
| `Download` | aria-hidden: true | `!(exporting)` |  | PasantiaLeadsAdminPage · l.346 |
| `Search` | aria-hidden: true |  |  | PasantiaLeadsAdminPage · l.385 |
| `Loader2` | aria-hidden: true | `loading` |  | PasantiaLeadsAdminPage · l.451 |
| `Briefcase` | aria-hidden: true | `!(loading) && !(error) && leads.length === 0` |  | PasantiaLeadsAdminPage · l.457 |
| `LeadProgramLabels` |  | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `hidden md:block` |  | PasantiaLeadsAdminPage · l.504 |
| `LeadStatusBadge` |  | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `hidden md:block` |  | PasantiaLeadsAdminPage · l.512 |
| `ChevronDown` | aria-hidden: true | `!(error) && !(leads.length === 0) && each leads && expandedId === lead.id` · screen size: `hidden md:block` |  | PasantiaLeadsAdminPage · l.528 |
| `ChevronRight` | aria-hidden: true | `!(error) && !(leads.length === 0) && each leads && !(expandedId === lead.id)` · screen size: `hidden md:block` |  | PasantiaLeadsAdminPage · l.530 |
| `PasantiaLeadCard` | domPrefix: desktop- | `!(error) && !(leads.length === 0) && each leads && expandedId === lead.id` · screen size: `hidden md:block` |  | PasantiaLeadsAdminPage · l.545 |
| `LeadStatusBadge` |  | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `md:hidden` |  | PasantiaLeadsAdminPage · l.573 |
| `LeadProgramLabels` |  | `!(loading) && !(error) && !(leads.length === 0) && each leads` · screen size: `md:hidden` |  | PasantiaLeadsAdminPage · l.576 |
| `ChevronDown` | aria-hidden: true | `!(error) && !(leads.length === 0) && each leads && expandedId === lead.id` · screen size: `md:hidden` |  | PasantiaLeadsAdminPage · l.594 |
| `ChevronRight` | aria-hidden: true | `!(error) && !(leads.length === 0) && each leads && !(expandedId === lead.id)` · screen size: `md:hidden` |  | PasantiaLeadsAdminPage · l.596 |
| `PasantiaLeadCard` | domPrefix: mobile- | `!(error) && !(leads.length === 0) && each leads && expandedId === lead.id` · screen size: `md:hidden` |  | PasantiaLeadsAdminPage · l.602 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `message` | «Error al cargar los leads» | PasantiaLeadsAdminPage · l.177 |
| `suffix` | «Estados permitidos: {allowed .map((value) => LEA…}.» | PasantiaLeadsAdminPage · l.204 |
| `message` | «No se pudo exportar el CSV. No se descargó ningún archivo; vuelve a intentarlo.» | handleExport · l.289 |
| `tabs` | «Todos» | PasantiaLeadsAdminPage · l.300 |

**Other texts written in the code (safety net: not tied to an element by the script)** (12)

| Text | Where |
|---|---|
| «No se pudo leer la exportación de leads» | PasantiaLeadsAdminPage · l.269 |
| «{reason.replace(/\.$/, '')}. No se descargó ningún archivo.» | PasantiaLeadsAdminPage · l.270 |
| «pasantias-leads-{new Date().toISOString().sl…}» | PasantiaLeadsAdminPage · l.281 |
| «Leads Pasantías INSPIRA» | PasantiaLeadsAdminPage · l.282 |
| «Fecha» | PasantiaLeadsAdminPage · l.468 |
| «Nombre» | PasantiaLeadsAdminPage · l.469 |
| «Correo» | PasantiaLeadsAdminPage · l.470 |
| «Institución» | PasantiaLeadsAdminPage · l.472 |
| «Programas» | PasantiaLeadsAdminPage · l.473 |
| «Cargo» | PasantiaLeadsAdminPage · l.474 |
| «Personas» | PasantiaLeadsAdminPage · l.475 |
| «Programa enviado» | PasantiaLeadsAdminPage · l.477 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| role | `role=tablist` | PasantiaLeadsAdminPage · l.353 |
| role | `role=alert` | PasantiaLeadsAdminPage · l.420 |
| mark | `testid=pasantia-leads-error` | PasantiaLeadsAdminPage · l.420 |
| role | `role=alert` | PasantiaLeadsAdminPage · l.439 |
| mark | `testid=pasantia-leads-export-error` | PasantiaLeadsAdminPage · l.439 |
| mark | `testid=pasantia-leads-pagination` | PasantiaLeadsAdminPage · l.617 |
| mark | `testid=pasantia-leads-range` | PasantiaLeadsAdminPage · l.622 |

**Values shown from data** (14)

- `{error}` — PasantiaLeadsAdminPage · l.425, when `error`
- `{exportError}` — PasantiaLeadsAdminPage · l.439, when `exportError`
- `{formatDateTime(lead.created_at)}` — PasantiaLeadsAdminPage · l.494, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{leadFullName(lead)}` — PasantiaLeadsAdminPage · l.497, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{lead.email}` — PasantiaLeadsAdminPage · l.500, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{lead.phone} / —` — PasantiaLeadsAdminPage · l.501, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{lead.institution}` — PasantiaLeadsAdminPage · l.502, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{lead.role_title} / —` — PasantiaLeadsAdminPage · l.509, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{lead.num_people} / —` — PasantiaLeadsAdminPage · l.510, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{formatDateTime(lead.brochure_sent_a…} / —` — PasantiaLeadsAdminPage · l.514, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `hidden md:block`
- `{leadFullName(lead)}` — PasantiaLeadsAdminPage · l.568, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `md:hidden`
- `{lead.email}` — PasantiaLeadsAdminPage · l.571, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `md:hidden`
- `{lead.institution}` — PasantiaLeadsAdminPage · l.575, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `md:hidden`
- `{formatDateTime(lead.created_at)} · {lead.phone}` — PasantiaLeadsAdminPage · l.580, when `!(loading) && !(error) && !(leads.length === 0) && each leads`, screen size: `md:hidden`

**Other texts on screen** (5)

- «Estado del lead» (aria-label) — PasantiaLeadsAdminPage · l.353
- «Cargando leads» — PasantiaLeadsAdminPage · l.452, when `loading`
- «No hay leads que coincidan con los filtros.» — PasantiaLeadsAdminPage · l.458, when `!(loading) && !(error) && leads.length === 0`
- «Paginación de leads» (aria-label) — PasantiaLeadsAdminPage · l.617, when `pagination && pagination.total > 0 && !error`
- «Mostrando {firstShown}–{lastShown} de {pagination.total} {pagination.total === 1 ? 'c…} · Página {page} de {pageCount}» — PasantiaLeadsAdminPage · l.622, when `pagination && pagination.total > 0 && !error`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/admin/PasantiaLeadCard.tsx`
- `components/layout/FunctionalPageHeader.tsx`
- `lib/api-auth.ts`
- `lib/exportUtils.ts`
- `lib/pasantias/cohort-public.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/pasantia-leads` | GET, PATCH | `pages/admin/pasantia-leads.tsx:155`, `pages/admin/pasantia-leads.tsx:195`, `pages/admin/pasantia-leads.tsx:260` |

## /admin/pasantia-participants

File `pages/admin/pasantia-participants.tsx` · 481 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: Personas › «Nóminas de pasantes» → `/admin/pasantia-participants` — admin only; the group: admin only (`Sidebar.tsx` l.428)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.48 `server redirect → /login  (when !user)`
  - l.51 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.51 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.53 `server redirect → /dashboard  (when !isAdmin)`
- Linked from: `components/layout/Sidebar.tsx:430`
- Tests: browser tests that CI runs: `tests/e2e/pasantias-participant-intake.spec.ts`; unit tests of the page: `__tests__/pages/admin/pasantia-participants.test.tsx`.

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

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Nueva nómina» | h2 |  | PasantiaParticipantsAdminPage · l.284 |
| «Nóminas ( {total} )» | h2 |  | PasantiaParticipantsAdminPage · l.397 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Actualizar» | `{() => void loadList()}` |  | `{loading}` | `testid=intake-admin-refresh` | PasantiaParticipantsAdminPage · l.261 |
| «Crear enlace» (submits the form) |  |  | `{creating}` | `testid=intake-admin-create` | PasantiaParticipantsAdminPage · l.360 |
| «Ver nómina existente» | `{() => void openDetail(createError.rosterId as string)}` | `createError && createError.rosterId` |  | `testid=intake-admin-create-existing` | PasantiaParticipantsAdminPage · l.368 |
| «Cancelar» | `{() => setConfirm(null)}` |  | `{acting}` | `testid=intake-admin-confirm-cancel` | PasantiaParticipantsAdminPage · l.455 |
| «Crear enlace nuevo / Revocar» | `{() => void runConfirmed()}` |  | `{acting}` | `testid=intake-admin-confirm-ok` | PasantiaParticipantsAdminPage · l.464 |

**Fields** (4)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Colegio» | text | `maxLength={320}` |  |  | `testid=intake-admin-school id=intake-admin-school (id used by code)` | PasantiaParticipantsAdminPage · l.293 |
| «Programa» | select |  | «Selecciona…», «(lista) {programById(id).name}» |  | `testid=intake-admin-program id=intake-admin-program (id used by code)` | PasantiaParticipantsAdminPage · l.318 |
| «Vigencia del enlace» | select |  | «(lista) {days} días» |  | `testid=intake-admin-valid-days id=intake-admin-valid-days (id used by code)` | PasantiaParticipantsAdminPage · l.345 |
| «Vigencia del nuevo enlace» | select |  | «(lista) {days} días» | `confirm?.action === 'rotate'` | `testid=intake-admin-rotate-days id=intake-admin-rotate-days (id used by code)` | PasantiaParticipantsAdminPage · l.439 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => void create(e)}` |  | PasantiaParticipantsAdminPage · l.287 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `{confirm !== null}` |  | PasantiaParticipantsAdminPage · l.424 |

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos conectar. Inténtalo de nuevo.» | `setListError` |  | PasantiaParticipantsAdminPage · l.130 |
| «No pudimos conectar. Inténtalo de nuevo.» | `setActionMessage` |  | openDetail · l.166 |
| «No pudimos conectar. Inténtalo de nuevo.» | `setCreateError` |  | create · l.216 |
| «Enlace de {next.schoolName} revocado. El colegio ya no puede abrir la nómina.» | `setActionMessage` | `!(action === 'rotate')` | runConfirmed · l.243 |
| «No pudimos conectar. Inténtalo de nuevo.» | `setActionMessage` |  | runConfirmed · l.247 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.48 |
| `/dashboard` | `server redirect` | `!isAdmin` | getServerSideProps · l.53 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.51 |
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.51 |

**Pieces placed here, with the texts and settings handed to them** (17)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Nóminas de pasantes |  |  | PasantiaParticipantsAdminPage · l.254 |
| `ResponsiveFunctionalPageHeader` | title: Nóminas de pasantes · subtitle: Enlaces privados para que cada colegio complete su nómina |  |  | PasantiaParticipantsAdminPage · l.256 |
| `RefreshCw` | aria-hidden: true |  |  | PasantiaParticipantsAdminPage · l.268 |
| `OneTimeLinkPanel` |  | `linkPanel` |  | PasantiaParticipantsAdminPage · l.275 |
| `RequiredMark` |  |  |  | PasantiaParticipantsAdminPage · l.291 |
| `RequiredMark` |  |  |  | PasantiaParticipantsAdminPage · l.316 |
| `Loader2` | aria-hidden: true | `creating` |  | PasantiaParticipantsAdminPage · l.361 |
| `Loader2` | aria-hidden: true | `detailLoading` |  | PasantiaParticipantsAdminPage · l.389 |
| `RosterDetail` |  | `detail` |  | PasantiaParticipantsAdminPage · l.393 |
| `Loader2` | aria-hidden: true | `loading` |  | PasantiaParticipantsAdminPage · l.405 |
| `RosterTable` |  | `!(loading) && !(listError)` |  | PasantiaParticipantsAdminPage · l.412 |
| `DialogContent` |  |  | `testid=intake-admin-confirm` | PasantiaParticipantsAdminPage · l.425 |
| `DialogHeader` |  |  |  | PasantiaParticipantsAdminPage · l.426 |
| `DialogTitle` |  |  |  | PasantiaParticipantsAdminPage · l.427 |
| `DialogDescription` |  |  |  | PasantiaParticipantsAdminPage · l.428 |
| `DialogFooter` |  |  |  | PasantiaParticipantsAdminPage · l.454 |
| `Loader2` | aria-hidden: true | `acting` |  | PasantiaParticipantsAdminPage · l.471 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `errorText()` | «Tu sesión expiró. Vuelve a iniciar sesión.», «No tienes permiso para esta acción.» | errorText · l.92 |

**Other texts written in the code (safety net: not tied to an element by the script)** (8)

| Text | Where |
|---|---|
| «Tu sesión expiró. Vuelve a iniciar sesión.» | errorText · l.92 |
| «No tienes permiso para esta acción.» | errorText · l.93 |
| «No pudimos cargar las nóminas.» | PasantiaParticipantsAdminPage · l.124 |
| «No pudimos cargar la nómina.» | PasantiaParticipantsAdminPage · l.158 |
| «Elige un programa.» | PasantiaParticipantsAdminPage · l.178 |
| «Ya existe una nómina para ese colegio y programa.» | PasantiaParticipantsAdminPage · l.205 |
| «No pudimos crear la nómina.» | PasantiaParticipantsAdminPage · l.214 |
| «No pudimos completar la acción.» | PasantiaParticipantsAdminPage · l.235 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (9)

| Kind | What | Where |
|---|---|---|
| focus | `document.getElementById(errors.schoolName ? 'inta….focus()` | create · l.182 |
| mark | `id=intake-admin-school-error` | PasantiaParticipantsAdminPage · l.308 |
| mark | `id=intake-admin-program-error` | PasantiaParticipantsAdminPage · l.336 |
| role | `role=alert` | PasantiaParticipantsAdminPage · l.365 |
| mark | `testid=intake-admin-create-error` | PasantiaParticipantsAdminPage · l.365 |
| role | `role=status aria-live=polite` | PasantiaParticipantsAdminPage · l.383 |
| mark | `testid=intake-admin-message` | PasantiaParticipantsAdminPage · l.383 |
| mark | `testid=intake-admin-total` | PasantiaParticipantsAdminPage · l.399 |
| role | `role=alert` | PasantiaParticipantsAdminPage · l.408 |

**Values shown from data** (4)

- `{formErrors.schoolName}` — PasantiaParticipantsAdminPage · l.308, when `formErrors.schoolName`
- `{formErrors.program}` — PasantiaParticipantsAdminPage · l.336, when `formErrors.program`
- `{actionMessage}` — PasantiaParticipantsAdminPage · l.383, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- `{listError}` — PasantiaParticipantsAdminPage · l.408, when `!(loading) && listError`

**Other texts on screen** (8)

- «Colegio» (label) — PasantiaParticipantsAdminPage · l.289
- «Programa» (label) — PasantiaParticipantsAdminPage · l.314
- «Vigencia del enlace» (label) — PasantiaParticipantsAdminPage · l.342
- «Cargando nómina…» — PasantiaParticipantsAdminPage · l.389, when `detailLoading`
- «Cargando…» — PasantiaParticipantsAdminPage · l.405, when `loading`
- «Crear un enlace nuevo / Revocar el enlace» — PasantiaParticipantsAdminPage · l.427
- «El enlace actual de {confirm?.roster.schoolName …} dejará de funcionar de inmediato. Los datos ya guardados se mantienen. / {confirm?.roster.schoolName …} ya no podrá abrir ni editar su nómina. Los datos guardados se mantienen.» — PasantiaParticipantsAdminPage · l.428
- «Vigencia del nuevo enlace» (label) — PasantiaParticipantsAdminPage · l.436, when `confirm?.action === 'rotate'`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/pasantias-intake/AdminRosterParts.tsx`
- `components/pasantias-intake/ParticipantForm.tsx`
- `components/pasantias-intake/ParticipantList.tsx`
- `components/pasantias-intake/RosterStatusBadge.tsx`
- `components/ui/dialog.tsx`
- `lib/api-auth.ts`
- `lib/pasantias/cohort-public.ts`
- `lib/pasantias/participants/dates.ts`
- `lib/pasantias/participants/types.ts`
- `lib/pasantias/participants/validation.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/pasantia-participants` | ? | `pages/admin/pasantia-participants.tsx:58` |

## /admin/pasantias-panel

File `pages/admin/pasantias-panel.tsx` · 448 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: Personas › «Panel de pasantías» → `/admin/pasantias-panel` — admin only; the group: admin only (`Sidebar.tsx` l.436)
- Middleware: the /admin rule. Signed-out visitor: sent to /login. Forced password change holds this page: yes.
- In the page:
  - l.59 `server redirect → /login  (when !user)`
  - l.62 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.62 `isAdmin = await isGlobalAdmin(service, user.id)`
  - l.64 `server redirect → /dashboard  (when !isAdmin)`
- Linked from: `components/layout/Sidebar.tsx:438`
- Tests: browser tests that CI runs: `tests/e2e/pasantias-panel.spec.ts`; unit tests of the page: `__tests__/pages/admin/pasantias-panel.test.tsx`.

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

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Subiendo… / Reemplazar / Subir» | `{() => void upload(kind)}` | `each LETTER_ASSET_KINDS` | `{busy !== null}` | `testid=panel-letter-image-upload-{kind}` | LetterImages · l.147 |
| «Exportar CSV» | `{exportCsv}` |  | `{loading \|\| visible.length === 0}` | `testid=panel-export` | PasantiasPanelPage · l.343 |
| «Actualizar» | `{() => void load()}` |  | `{loading}` | `testid=panel-refresh` | PasantiasPanelPage · l.353 |
| «Reintentar» | `{() => void load()}` | `listError` |  | `testid=panel-retry` | PasantiasPanelPage · l.363 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{LETTER_ASSET_LABELS[kind]} ( subida / falta )» | file | accepts `.png,.jpg,.jpeg` |  | `each LETTER_ASSET_KINDS` | `testid=panel-letter-image-{kind} id=panel-letter-image-{kind}` | LetterImages · l.137 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `ParticipantDrawer` | component | `openId` |  | PasantiasPanelPage · l.438 |

**Messages set on the page** (11)

| Text | Set by | When | Where |
|---|---|---|---|
| «Elige una imagen para subir. / error» | `setMessage` | `!file` | upload · l.86 |
| «Sube una imagen PNG o JPG de hasta 2 MB. / error» | `setMessage` | `file.size > LETTER_ASSET_MAX_BYTES` | upload · l.90 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setMessage` |  | upload · l.109 |
| «No pudimos conectar. Inténtalo de nuevo.» | `setListError` |  | PasantiasPanelPage · l.206 |
| «Otra persona cambió el seguimiento de {row.participant.firstNames} {row.participant.lastNames} recién. Te mostramos lo guardado; repite el cambio si corresponde. / error» | `setMessage` | `!response.ok` | quickChange · l.247 |
| «No pudimos conectar. El cambio no se guardó. / error» | `setMessage` |  | quickChange · l.257 |
| «Selecciona como máximo {BULK_MAX} personas por vez. / error» | `setMessage` | `selectedVisible.length > BULK_MAX` | applyBulk · l.270 |
| «Cambio aplicado: {changed} de {selectedVisible.length} {selectedVisible.length === …} (el resto ya tenía ese valor).{reloaded ? '' : ' Actualiza…} / info» | `setMessage` |  | applyBulk · l.290 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setMessage` |  | applyBulk · l.295 |
| «CSV exportado: {visible.length} {visible.length === 1 ? 'per…}. / info» | `setMessage` |  | exportCsv · l.311 |
| «No se pudo exportar el CSV. / error» | `setMessage` |  | exportCsv · l.313 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `server redirect` | `!user` | getServerSideProps · l.59 |
| `/dashboard` | `server redirect` | `!isAdmin` | getServerSideProps · l.64 |

**Access checks in the code** (2)

| Line of code | Where |
|---|---|
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.62 |
| `isAdmin = await isGlobalAdmin(service, user.id)` | getServerSideProps · l.62 |

**Pieces placed here, with the texts and settings handed to them** (9)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `MainLayout` | pageTitle: Panel de pasantías |  |  | PasantiasPanelPage · l.336 |
| `ResponsiveFunctionalPageHeader` | title: Panel de pasantías · subtitle: Cohorte Enero 2027 · todas las personas, su seguimiento y sus documentos |  |  | PasantiasPanelPage · l.338 |
| `Download` | aria-hidden: true |  |  | PasantiasPanelPage · l.350 |
| `RefreshCw` | aria-hidden: true |  |  | PasantiasPanelPage · l.354 |
| `SummaryTiles` |  |  |  | PasantiasPanelPage · l.369 |
| `PanelFilters` |  |  |  | PasantiasPanelPage · l.371 |
| `BulkBar` |  |  |  | PasantiasPanelPage · l.392 |
| `Loader2` | aria-hidden: true | `loading && rows.length === 0` |  | PasantiasPanelPage · l.409 |
| `PanelTable` |  | `!(loading && rows.length === 0) && !(rows.length === 0 && !listError) && !(visible.length === 0 && rows.length > 0) && rows.length > 0` |  | PasantiasPanelPage · l.421 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Actualiza el panel para verlo.» | PasantiasPanelPage · l.291 |
| «pasantias-enero-2027-{new Date().toISOString().sl…}» | PasantiasPanelPage · l.305 |
| «Panel de pasantías — Enero 2027» | PasantiasPanelPage · l.306 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (11)

| Kind | What | Where |
|---|---|---|
| mark | `testid=panel-letter-images` | LetterImages · l.117 |
| mark | `testid=panel-letter-images-state` | LetterImages · l.120 |
| mark | `testid=panel-letter-image-state-{kind}` | LetterImages · l.133 |
| mark | `testid=panel-letter-images-msg` | LetterImages · l.160 |
| role | `role=alert` | PasantiasPanelPage · l.361 |
| mark | `testid=panel-error` | PasantiasPanelPage · l.361 |
| mark | `testid=panel-message` | PasantiasPanelPage · l.380 |
| mark | `testid=panel-count` | PasantiasPanelPage · l.401 |
| mark | `testid=panel-loading` | PasantiasPanelPage · l.408 |
| mark | `testid=panel-empty` | PasantiasPanelPage · l.412 |
| mark | `testid=panel-no-match` | PasantiasPanelPage · l.417 |

**Values shown from data** (3)

- `{message.text}` — LetterImages · l.160, when `message`
- `{listError}` — PasantiasPanelPage · l.362, when `listError`
- `{message.text}` — PasantiasPanelPage · l.380, when `message`

**Other texts on screen** (7)

- «Imágenes de la carta de invitación · listas / · faltan imágenes» (label) — LetterImages · l.118
- «La carta lleva el logo del Instituto Relacional y la firma de quien la emite. Se guardan en un espacio privado y se suben una sola vez; puedes reemplazarlas cuando quieras.» — LetterImages · l.125
- «{LETTER_ASSET_LABELS[kind]} ( subida / falta )» (label) — LetterImages · l.131, when `each LETTER_ASSET_KINDS`
- «Cargando… / Mostrando {visible.length} de {rows.length} {rows.length === 1 ? 'person…}» — PasantiasPanelPage · l.401
- «Cargando el panel…» — PasantiasPanelPage · l.409, when `loading && rows.length === 0`
- «Aún no hay personas inscritas. Aparecerán aquí cuando los colegios completen su nómina (los enlaces se crean en «Nóminas de pasantes»).» — PasantiasPanelPage · l.413, when `!(loading && rows.length === 0) && rows.length === 0 && !listError`
- «Ninguna persona coincide con los filtros.» — PasantiasPanelPage · l.418, when `!(loading && rows.length === 0) && !(rows.length === 0 && !listError) && visible.length === 0 && rows.length > 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `components/pasantias-intake/ParticipantForm.tsx`
- `components/pasantias-intake/RosterStatusBadge.tsx`
- `components/pasantias-panel/PanelParts.tsx`
- `components/pasantias-panel/ParticipantDrawer.tsx`
- `components/ui/dialog.tsx`
- `lib/api-auth.ts`
- `lib/exportUtils.ts`
- `lib/pasantias/cohort-public.ts`
- `lib/pasantias/panel/client.ts`
- `lib/pasantias/panel/types.ts`
- `lib/pasantias/participants/dates.ts`
- `lib/pasantias/participants/types.ts`
- `lib/pasantias/participants/validation.ts`
- `types/roles.ts`
- `utils/roleUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/admin/pasantias-panel` | ? | `lib/pasantias/panel/client.ts:22` |

## /pasantias/nomina

File `pages/pasantias/nomina.tsx` · 925 lines · frame: none · getServerSideProps

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/look.ts:111`
- Tests: browser tests that CI runs: `tests/e2e/pasantias-participant-intake.spec.ts`; unit tests of the page: `__tests__/pages/pasantias-nomina.test.tsx`.

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
| «Nómina de pasantes» | h1 | `phase !== 'ready' \|\| !roster` | NominaPage · l.666 |
| «{roster.schoolName}» | h1 |  | NominaPage · l.686 |
| «Pasantes ( {participants.length} / {ROSTER_MAX_PARTICIPANTS} )» | h2 | screen size: `lg:grid` | NominaPage · l.817 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Agregar persona» | `{openCreate}` | screen size: `lg:grid` | `{!fundingSaved \|\| writeBusy \|\| full \|\| editor?.mode === 'create'}` | `testid=intake-add` | NominaPage · l.823 |
| «Enviando… / Nómina enviada / Enviar nómina a FNE» | `{() => void finalize()}` | screen size: `lg:grid` | `{!canFinalize}` | `testid=intake-finalize` | NominaPage · l.849 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Política de Privacidad» | `{PRIVACY_POLICY_PATH}` (new tab) |  | `testid=intake-privacy-link` | NominaPage · l.748 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{INTAKE_ACKNOWLEDGEMENT_TEXT}» | checkbox |  |  |  | `testid=intake-ack` | NominaPage · l.759 |

**Browser confirm()** (3)

| Question | When | Where |
|---|---|---|
| «Tienes cambios sin guardar. ¿Descartarlos?» |  | openCreate · l.626 |
| «Tienes cambios sin guardar. ¿Descartarlos?» |  | openEdit · l.632 |
| «Tienes cambios sin guardar. ¿Descartarlos?» |  | cancelEditor · l.638 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos conectar con FNE. Revisa tu conexión y recarga la página. / Tu sesión de GENERA en este navegador no es válida. Recarga la página. / No pudimos cargar la nómina. Recarga la página.» | `setLoadError` |  | NominaPage · l.255 |
| «Los datos del colegio cambiaron en otra ventana o dispositivo. Guardado ahora: {stored}. / Tus cambios siguen aquí: revísalos y guarda de nuevo.» | `setSchoolNotice` | `response.status === 409 && code === 'STALE' && current && !(schoolDraftMatchesFunding(draft, current.schoolFunding))` | saveSchool · l.384 |
| «Debes confirmar la declaración antes de guardar.» | `setAckError` |  | save · l.418 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!token` | NominaPage · l.240 |
| `!dirty && !schoolDirty` | NominaPage · l.297 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `IntakeShell` |  | `phase !== 'ready' \|\| !roster` |  | NominaPage · l.660 |
| `IntakeShell` |  |  |  | NominaPage · l.682 |
| `RosterStatusBadge` |  |  |  | NominaPage · l.707 |
| `RequiredMark` |  |  |  | NominaPage · l.775 |
| `SchoolDataForm` |  |  |  | NominaPage · l.793 |
| `ParticipantList` |  | screen size: `lg:grid` |  | NominaPage · l.841 |
| `ParticipantForm` |  | `editor` · screen size: `lg:grid` |  | NominaPage · l.880 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (6)

| Name | Texts | Where |
|---|---|---|
| `UNAVAILABLE_TEXT` | «Enlace incompleto o no disponible — contacta a FNE.» | l.100 |
| `SCHOOL_REQUIRED_TEXT` | «Primero guarda los datos del colegio (Pasajes y Estadía) para agregar o editar pasantes y enviar la nómina.» | l.101 |
| `REOPENED_SUFFIX` | «La nómina volvió a edición; envíala nuevamente.» | NominaPage · l.312 |
| `stored` | «sin datos guardados» | saveSchool · l.383 |
| `message` | «No pudimos cargar la nómina. Recarga la página. / Cargando nómina…» | NominaPage · l.651 |
| `fundingText()` | «Pasajes: {FUNDING_LABELS[funding.flig…} · Estadía: {FUNDING_LABELS[funding.lodg…}» | fundingText · l.150 |

**Other texts written in the code (safety net: not tied to an element by the script)** (32)

| Text | Where |
|---|---|
| «Pasajes: {FUNDING_LABELS[funding.flig…} · Estadía: {FUNDING_LABELS[funding.lodg…}» | fundingText · l.150 |
| «No pudimos conectar. Tus datos siguen en el formulario; inténtalo de nuevo.» | NominaPage · l.202 |
| «Tu sesión de GENERA en este navegador no es válida. Recarga la página e inténtalo de nuevo.» | NominaPage · l.216 |
| «Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.» | NominaPage · l.221 |
| «La ficha es demasiado grande. Acorta los textos e inténtalo de nuevo.» | NominaPage · l.225 |
| «No pudimos completar la operación. Tus datos siguen en el formulario; inténtalo de nuevo.» | NominaPage · l.231 |
| «Revisa el campo marcado.» | NominaPage · l.318 |
| «Revisa los {count} campos marcados.» | NominaPage · l.318 |
| «Elige Pasajes y Estadía antes de guardar los datos del colegio.» | NominaPage · l.333 |
| «Los datos del colegio ya estaban guardados con estos valores; no se registró nada nuevo.» | NominaPage · l.359 |
| «Datos del colegio guardados.» | NominaPage · l.363 |
| «Los datos del colegio ya tenían estos valores guardados; no se registró nada nuevo.» | NominaPage · l.380 |
| «Revisa los datos del colegio.» | NominaPage · l.398 |
| «No pudimos guardar los datos del colegio. Inténtalo de nuevo.» | NominaPage · l.402 |
| «Confirma la declaración antes de guardar.» | NominaPage · l.423 |
| «Esta ficha ya se había guardado antes con otros datos (la versión guardada aparece en la lista).» | NominaPage · l.466 |
| «Tus cambios siguen aquí: revísalos y pulsa «Guardar cambios».» | NominaPage · l.467 |
| «No había cambios: la ficha de {saved.firstNames} {saved.lastNames} sigue igual y no se registró nada nuevo.» | NominaPage · l.481 |
| «La ficha de {saved.firstNames} {saved.lastNames} ya estaba guardada con estos datos; no se registró nada nuevo.» | NominaPage · l.482 |
| «La ficha de {stored.firstNames} {stored.lastNames} ya tenía estos datos guardados; no se registró nada nuevo.» | NominaPage · l.509 |
| «Esta ficha cambió en otra ventana o dispositivo (la versión guardada aparece en la lista).» | NominaPage · l.520 |
| «Este RUT ya está en la nómina.» | NominaPage · l.528 |
| «Revisa la ficha.» | NominaPage · l.547 |
| «Esa ficha ya no está en esta nómina. Actualizamos la lista.» | NominaPage · l.556 |
| «No pudimos guardar la ficha. Inténtalo de nuevo.» | NominaPage · l.560 |
| «Guarda o cancela los cambios abiertos (ficha o datos del colegio) antes de enviar la nómina.» | NominaPage · l.578 |
| «Nómina enviada a FNE. Ya está disponible para el equipo FNE.» | NominaPage · l.596 |
| «La nómina cambió mientras la revisabas. Revisa la lista y envíala otra vez.» | NominaPage · l.605 |
| «No pudimos enviar la nómina. Inténtalo de nuevo.» | NominaPage · l.618 |
| «Se envió por última vez el {formatInstant(roster.lastSu…}. Tras los cambios, envíala nuevamente para que FNE vea la versión final.» | NominaPage · l.720 |
| «Guarda los datos del colegio y cada ficha y, cuando la nómina esté completa, pulsa «Enviar nómina a FNE».» | NominaPage · l.721 |
| «Al enviar, la nómina queda disponible para el equipo FNE. No se envían correos.» | NominaPage · l.865 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (14)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('beforeunload')` | NominaPage · l.302 |
| focus | `ackRef.current.focus()` | save · l.424 |
| mark | `testid=intake-state-{phase}` | NominaPage · l.661 |
| mark | `testid=intake-roster-status` | NominaPage · l.695 |
| role | `role=status aria-live=polite` | NominaPage · l.725 |
| mark | `testid=intake-live` | NominaPage · l.725 |
| mark | `testid=intake-error-acknowledged id=intake-error-ack` | NominaPage · l.779 |
| mark | `testid=intake-school-fieldset` | NominaPage · l.788 |
| mark | `testid=intake-count` | NominaPage · l.819 |
| mark | `testid=intake-school-required` | NominaPage · l.834 |
| mark | `testid=intake-finalize-hint` | NominaPage · l.858 |
| mark | `testid=intake-form-fieldset` | NominaPage · l.875 |
| mark | `testid=intake-editor-closed` | NominaPage · l.905 |
| mark | `testid=intake-save-state` | NominaPage · l.907 |

**Values shown from data** (6)

- `{message}` — NominaPage · l.667, when `phase !== 'ready' \|\| !roster`
- `{roster.programName}` — NominaPage · l.685
- `{banner?.text}` — NominaPage · l.725, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- `{INTAKE_PURPOSE_TEXT}` — NominaPage · l.746
- `{ackError}` — NominaPage · l.779, when `ackError`
- `{SCHOOL_REQUIRED_TEXT}` — NominaPage · l.834, when `!fundingSaved`, screen size: `lg:grid`

**Other texts on screen** (8)

- «Nómina de pasantes · Fundación Nueva Educación» — NominaPage · l.644
- «Programa del {programDateRangeLabel(roster.progra…} · Enlace válido hasta {formatInstant(roster.expiresAt)}» — NominaPage · l.689
- «Enviada a FNE el {formatInstant(roster.submit…} / La nómina volvió a edición; envíala nuevamente / Borrador: aún no se ha enviado a FNE» — NominaPage · l.708
- «La nómina está disponible para el equipo FNE. No se envían correos. Si corriges una ficha o los datos del colegio, la nómina vuelve a edición y deberás enviarla otra vez. / Se envió por última vez el {formatInstant(roster.lastSu…}. Tras lo…» — NominaPage · l.716
- «{INTAKE_ACKNOWLEDGEMENT_TEXT}» (label) — NominaPage · l.758
- «Guarda los datos del colegio antes de enviar. / Guarda o descarta los cambios en los datos del colegio antes de enviar. / Guarda o cancela la ficha abierta antes de enviar. / Al enviar, la nómina queda disponible para el equipo FNE. No se …» — NominaPage · l.858, screen size: `lg:grid`
- «Guardado.» — NominaPage · l.907, when `!(editor) && justSaved`, screen size: `lg:grid`
- «Guarda primero los datos del colegio; luego podrás agregar pasantes. / La nómina tiene el máximo de {ROSTER_MAX_PARTICIPANTS} personas. / Pulsa «Agregar persona» para completar una nueva ficha, o «Editar» en una persona guardada.» — NominaPage · l.911, when `!(editor)`, screen size: `lg:grid`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/pasantias-intake/IntakeShell.tsx`
- `components/pasantias-intake/ParticipantForm.tsx`
- `components/pasantias-intake/ParticipantList.tsx`
- `components/pasantias-intake/RosterStatusBadge.tsx`
- `components/pasantias-intake/SchoolDataForm.tsx`
- `lib/pasantias/cohort-public.ts`
- `lib/pasantias/participants/client.ts`
- `lib/pasantias/participants/dates.ts`
- `lib/pasantias/participants/notice.ts`
- `lib/pasantias/participants/types.ts`
- `lib/pasantias/participants/validation.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/pasantias/participants` | ? | `pages/pasantias/nomina.tsx:78` |

## /profile/pasantia

File `pages/profile/pasantia.tsx` · 191 lines · frame: MainLayout · getServerSideProps

### Who reaches it

- Menu: «Mi pasantía» → `/profile/pasantia` — only pasantía travellers (`Sidebar.tsx` l.131)
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page:
  - l.29 `server redirect → /login?next=%2Fprofile%2Fpasantia  (when !user)`
- Linked from: `components/layout/Sidebar.tsx:1309`, `components/layout/Sidebar.tsx:134`
- Tests: browser tests that CI runs: `tests/e2e/pasantias-panel.spec.ts`; unit tests of the page: `__tests__/pages/profile-pasantia.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | if is a pasantía traveller | pass |
| consultor | if is a pasantía traveller | pass |
| equipo_directivo | if is a pasantía traveller | pass |
| lider_generacion | if is a pasantía traveller | pass |
| lider_comunidad | if is a pasantía traveller | pass |
| supervisor_de_red | if is a pasantía traveller | pass |
| community_manager | if is a pasantía traveller | pass |
| docente | if is a pasantía traveller | pass |
| encargado_licitacion | if is a pasantía traveller | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{pasantia.programName} · Barcelona» | h2 |  | PasantiaCard · l.96 |
| «Tu viaje» | h3 |  | PasantiaCard · l.108 |
| «Tus documentos» | h3 |  | PasantiaCard · l.125 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Abriendo… / Descargar» | `{() => void download(doc.id)}` | `!(pasantia.documents.length === 0) && each pasantia.documents` | `{busy !== null}` | `testid=mi-pasantia-doc-download-{doc.id}` | PasantiaCard · l.138 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos abrir el documento. Inténtalo de nuevo.» | `setError` | `!response.ok \|\| typeof body.url !== 'string'` | download · l.78 |
| «No pudimos abrir el documento. Revisa tu conexión e inténtalo de nuevo.» | `setError` |  | download · l.84 |

**Moves to another page from code** (2)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login?next=%2Fprofile%2Fpasantia` | `server redirect` | `!user` | getServerSideProps · l.29 |
| `{body.url}` | `window.location.assign` |  | download · l.82 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Fact` | label: Participante |  |  | PasantiaCard · l.104 |
| `Fact` | label: Colegio |  |  | PasantiaCard · l.105 |
| `Fact` | label: Pasaje aéreo |  |  | PasantiaCard · l.116 |
| `Fact` | label: Alojamiento |  |  | PasantiaCard · l.117 |
| `Download` | aria-hidden: true | `!(pasantia.documents.length === 0) && each pasantia.documents` |  | PasantiaCard · l.145 |
| `MainLayout` | pageTitle: Mi pasantía |  |  | MiPasantiaPage · l.163 |
| `ResponsiveFunctionalPageHeader` | title: Mi pasantía · subtitle: Tu viaje a Barcelona · Enero 2027 |  |  | MiPasantiaPage · l.165 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `longDate()` | «Por confirmar» | longDate · l.45 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Por confirmar» | longDate · l.45 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (11)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testId}` | Fact · l.59 |
| mark | `testid=mi-pasantia-card-{id}` | PasantiaCard · l.91 |
| mark | `testid=mi-pasantia-dates-{id}` | PasantiaCard · l.99 |
| mark | `testid=mi-pasantia-lodging-line-{id}` | PasantiaCard · l.120 |
| mark | `testid=mi-pasantia-no-documents-{id}` | PasantiaCard · l.127 |
| mark | `testid=mi-pasantia-doc-{doc.id}` | PasantiaCard · l.133 |
| role | `role=alert` | PasantiaCard · l.153 |
| mark | `testid=mi-pasantia-error-{id}` | PasantiaCard · l.153 |
| role | `role=alert` | MiPasantiaPage · l.172 |
| mark | `testid=mi-pasantia-load-error` | MiPasantiaPage · l.172 |
| mark | `testid=mi-pasantia-empty` | MiPasantiaPage · l.176 |

**Values shown from data** (5)

- `{label}` — Fact · l.58
- `{value}` — Fact · l.59
- `{DOCUMENT_KIND_LABELS[doc.kind]}` — PasantiaCard · l.135, when `!(pasantia.documents.length === 0) && each pasantia.documents`
- `{doc.fileName}` — PasantiaCard · l.136, when `!(pasantia.documents.length === 0) && each pasantia.documents`
- `{error}` — PasantiaCard · l.153, when `error`

**Other texts on screen** (6)

- «Se realizará {pasantia.programDates} .» — PasantiaCard · l.99
- «Te hospedarás en {pasantia.lodgingLine.replace(/[.\s]…} .» — PasantiaCard · l.120, when `pasantia.lodgingLine`
- «Todavía no hay documentos. Aquí aparecerán tu pasaje y tu carta de invitación cuando estén listos.» — PasantiaCard · l.128, when `pasantia.documents.length === 0`
- «No pudimos cargar tu pasantía. Vuelve a intentarlo en unos minutos.» — MiPasantiaPage · l.173, when `loadFailed`
- «No encontramos una pasantía asociada a tu correo.» — MiPasantiaPage · l.177, when `!(loadFailed) && pasantias.length === 0`
- «Si viajas en enero de 2027, pide a quien coordina la pasantía en tu colegio que revise el correo con que te inscribió: debe ser el mismo con que entras a GENERA.» — MiPasantiaPage · l.179, when `!(loadFailed) && pasantias.length === 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/FunctionalPageHeader.tsx`
- `lib/api-auth.ts`
- `lib/pasantias/cohort-public.ts`
- `lib/pasantias/panel/dates.ts`
- `lib/pasantias/panel/mine.ts`
- `lib/pasantias/panel/types.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/pasantias/mine/documents/[docId]` | GET | `pages/profile/pasantia.tsx:75` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/admin/PasantiaLeadCard.tsx

Used by: `/admin/pasantia-leads`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardar nota» | `{() => onNotesSave(lead, notes)}` |  | `{busy}` | `testid={dom('lead-notes-save')}` | PasantiaLeadCard · l.669 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
|  | select | disabled: `{busy}` | «Selecciona un estado», «(lista) {LEAD_STATUS_LABELS[candidate]}» | `!(transitions.length === 0)` | `testid={dom('lead-status-select')}` | PasantiaLeadCard · l.628 |
| «Notas internas» | textarea | disabled: `{busy}` · `maxLength={2000}` |  |  | `testid={dom('lead-notes')}` | PasantiaLeadCard · l.659 |

**Pieces placed here, with the texts and settings handed to them** (13)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: Mensaje |  |  | PasantiaLeadCard · l.498 |
| `Field` | label: Cargo |  |  | PasantiaLeadCard · l.499 |
| `Field` | label: Participantes |  |  | PasantiaLeadCard · l.500 |
| `Field` | label: Cohorte |  |  | PasantiaLeadCard · l.501 |
| `Field` | label: Consentimiento |  |  | PasantiaLeadCard · l.502 |
| `Field` | label: Marketing |  |  | PasantiaLeadCard · l.513 |
| `Field` | label: Programa enviado |  |  | PasantiaLeadCard · l.527 |
| `Field` | label: UTM source |  |  | PasantiaLeadCard · l.573 |
| `Field` | label: UTM medium |  |  | PasantiaLeadCard · l.574 |
| `Field` | label: UTM campaign |  |  | PasantiaLeadCard · l.575 |
| `Field` | label: Ruta de origen |  |  | PasantiaLeadCard · l.584 |
| `Loader2` | aria-hidden: true | `busy` |  | PasantiaLeadCard · l.677 |
| `Save` | aria-hidden: true | `!(busy)` |  | PasantiaLeadCard · l.679 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `LEAD_STATUS_LABELS` | «Nuevo», «Contactado», «Convertido», «Descartado» | l.75 |
| `LEAD_CSV_HEADERS` | «Fecha», «Nombre», «Email», «Institución», «Cargo», «Participantes», «Cohorte», «Programas», «Estado», «Programa enviado», «Mensaje», «UTM source», «UTM medium», «UTM campaign», «Ruta de origen», «Versión aviso consentimiento», «Notas» | l.262 |
| `LEAD_EXPORT_MESSAGES` | «La exportación quedó incompleta o inconsistente. No se descargó ningún archivo; vuelve a intentarlo.», «Hay demasiados leads para exportar de una vez. Aplica un filtro y vuelve a intentarlo.» | l.346 |
| `offset` | «Z / {match[3]}:00 / {match[3].slice(0, 3)}:{match[3].slice(-2)}» | timestampMicros · l.366 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Programa no reconocido: {interest.program}» | leadProgramLabels · l.185 |
| «Histórico (cohorte {lead.cohort}) · sin programa registrado» | leadProgramLabels · l.195 |
| «Sin clasificar · sin programa registrado» | leadProgramLabels · l.201 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (6)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testId}` | LeadProgramLabels · l.214 |
| mark | `testid={testId}` | Field · l.454 |
| mark | `testid={dom('lead-programs')}` | PasantiaLeadCard · l.542 |
| mark | `testid={dom('lead-program-${entry.key}')}` | PasantiaLeadCard · l.546 |
| mark | `testid={dom('lead-attribution-shared')}` | PasantiaLeadCard · l.595 |
| mark | `testid={dom('lead-status-final')}` | PasantiaLeadCard · l.613 |

**Values shown from data** (5)

- `{label}` — LeadStatusBadge · l.110
- `{entry.label}` — LeadProgramLabels · l.216, when `each leadProgramLabels(lead)`
- `{label}` — Field · l.453
- `{value} / —` — Field · l.454
- `{entry.label}` — PasantiaLeadCard · l.547, when `each programLabels`

**Other texts on screen** (10)

- «Programas de interés» — PasantiaLeadCard · l.536
- «· consentimiento {formatDateTime(interest.consent_acc…} / — · versión {interest.consent_notice_ver…}» — PasantiaLeadCard · l.549, when `each programLabels && interest`
- «Este contacto no tiene un interés por programa registrado; no se le asigna ninguno.» — PasantiaLeadCard · l.563, when `interests.length === 0`
- «Atribución» — PasantiaLeadCard · l.570
- «La ruta de origen la informa el navegador; se muestra tal cual quedó guardada y no es un enlace.» — PasantiaLeadCard · l.591
- «Esta ruta ya incluye los mismos parámetros UTM: es una sola observación anotada dos veces, no dos señales de atribución distintas.» — PasantiaLeadCard · l.596, when `repeatsUtm`
- «Cambiar estado» — PasantiaLeadCard · l.612, when `transitions.length === 0`
- «Estado final: no admite más cambios.» — PasantiaLeadCard · l.617, when `transitions.length === 0`
- «Cambiar estado» (label) — PasantiaLeadCard · l.622, when `!(transitions.length === 0)`
- «Notas internas» (label) — PasantiaLeadCard · l.653

### components/layout/FunctionalPageHeader.tsx

Used by: `/admin/pasantia-leads`, `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/profile/pasantia`

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

### components/pasantias-intake/AdminRosterParts.tsx

Used by: `/admin/pasantia-participants`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Nuevo enlace / Enlace de la nómina · {schoolName}» | h2 |  | OneTimeLinkPanel · l.72 |
| «{roster.schoolName}» | h2 |  | RosterDetail · l.215 |
| «Datos del colegio» | h3 |  | RosterDetail · l.228 |

**Buttons** (6)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Copiado / Copiar enlace» | `{() => void copy()}` |  |  | `testid=intake-admin-link-copy` | OneTimeLinkPanel · l.92 |
| «Listo» | `{onDismiss}` |  |  | `testid=intake-admin-link-dismiss` | OneTimeLinkPanel · l.95 |
| «Ver detalle» | `{() => onView(roster)}` | `each rosters` | `{busy}` | `testid=intake-admin-view-{roster.id}` | RosterTable · l.162 |
| «Nuevo enlace» | `{() => onRotate(roster)}` | `each rosters` | `{busy}` | `testid=intake-admin-rotate-{roster.id}` | RosterTable · l.171 |
| «Revocar» | `{() => onRevoke(roster)}` | `each rosters` | `{busy \|\| Boolean(roster.revokedAt)}` | `testid=intake-admin-revoke-{roster.id}` | RosterTable · l.180 |
| «Cerrar» | `{onClose}` |  |  | `testid=intake-admin-detail-close` | RosterDetail · l.223 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Enlace de la nómina» | text | `readOnly=true` · also `onFocus={(e) => e.currentTarget.select()}` |  |  | `testid=intake-admin-link-url id=intake-admin-link-url (id used by code)` | OneTimeLinkPanel · l.83 |

**Table columns** (7)

| Text | Shown when | Where |
|---|---|---|
| «Nombre» | `!(participants.length === 0)` | RosterDetail · l.240 |
| «RUT» | `!(participants.length === 0)` | RosterDetail · l.241 |
| «Pasaporte» | `!(participants.length === 0)` | RosterDetail · l.242 |
| «Llegada» | `!(participants.length === 0)` | RosterDetail · l.243 |
| «Regreso» | `!(participants.length === 0)` | RosterDetail · l.244 |
| «Foco» | `!(participants.length === 0)` | RosterDetail · l.245 |
| «Alimentación» | `!(participants.length === 0)` | RosterDetail · l.246 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RosterStatusBadge` |  | `each rosters` |  | RosterTable · l.148 |
| `RosterStatusBadge` |  |  |  | RosterDetail · l.219 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `schoolFundingSummary()` | «Datos del colegio pendientes», «Pasajes: {FUNDING_LABELS[funding.flig…} · Estadía: {FUNDING_LABELS[funding.lodg…}» | schoolFundingSummary · l.20 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Datos del colegio pendientes» | schoolFundingSummary · l.20 |
| «Pasajes: {FUNDING_LABELS[funding.flig…} · Estadía: {FUNDING_LABELS[funding.lodg…}» | schoolFundingSummary · l.21 |
| «Revocado» | linkState · l.29 |
| «Vencido» | linkState · l.30 |
| «Vigente hasta {formatInstant(roster.expire…}» | linkState · l.31 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (11)

| Kind | What | Where |
|---|---|---|
| mark | `testid=intake-admin-link-panel` | OneTimeLinkPanel · l.67 |
| mark | `testid=intake-admin-empty` | RosterTable · l.127 |
| mark | `testid=intake-admin-rosters` | RosterTable · l.133 |
| mark | `testid=intake-admin-roster-{roster.id}` | RosterTable · l.137 |
| mark | `testid=intake-admin-link-state-{roster.id}` | RosterTable · l.149 |
| mark | `testid=intake-admin-funding-{roster.id}` | RosterTable · l.157 |
| mark | `testid=intake-admin-detail` | RosterDetail · l.208 |
| mark | `testid=intake-admin-detail-school` | RosterDetail · l.227 |
| mark | `testid=intake-admin-detail-empty` | RosterDetail · l.232 |
| mark | `testid=intake-admin-detail-table` | RosterDetail · l.237 |
| mark | `testid=intake-admin-participant-{p.id}` | RosterDetail · l.251 |

**Values shown from data** (11)

- `{roster.schoolName}` — RosterTable · l.145, when `each rosters`
- `{roster.programName}` — RosterTable · l.146, when `each rosters`
- `{link.label}` — RosterTable · l.149, when `each rosters`
- `{schoolFundingSummary(roster)}` — RosterTable · l.157, when `each rosters`
- `{schoolFundingSummary(roster)}` — RosterDetail · l.229
- `{p.firstNames} {p.lastNames}` — RosterDetail · l.252, when `!(participants.length === 0) && each participants`
- `{displayRut(p.rut)}` — RosterDetail · l.255, when `!(participants.length === 0) && each participants`
- `{p.passportNumber} / —` — RosterDetail · l.256, when `!(participants.length === 0) && each participants`
- `{storedDateLabel(roster.program, 'ar…}` — RosterDetail · l.257, when `!(participants.length === 0) && each participants`
- `{storedDateLabel(roster.program, 'de…}` — RosterDetail · l.258, when `!(participants.length === 0) && each participants`
- `{dietarySummary(p)}` — RosterDetail · l.260, when `!(participants.length === 0) && each participants`

**Other texts on screen** (9)

- «No se volverá a mostrar. Cópialo ahora y envíalo a la persona coordinadora del colegio. El enlace anterior ya no funciona.» — OneTimeLinkPanel · l.75
- «Enlace de la nómina» (label) — OneTimeLinkPanel · l.80, hidden by its class (`sr-only`); another control opens it or it is for screen readers
- «Enlace copiado al portapapeles. / Selecciona el enlace y cópialo con Ctrl+C (o Cmd+C).» — OneTimeLinkPanel · l.99
- «Aún no hay nóminas. Crea la primera con el formulario.» — RosterTable · l.128, when `rosters.length === 0`
- «· {roster.participantCount} personas» — RosterTable · l.152, when `each rosters`
- «· Último envío {formatInstant(roster.lastSubmittedA…}» — RosterTable · l.154, when `each rosters && roster.lastSubmittedAt`
- «· Enviada {formatInstant(roster.submit…}» — RosterDetail · l.220
- «El colegio aún no ha guardado personas.» — RosterDetail · l.233, when `participants.length === 0`
- «{FOCUS_LABELS[p.focus]} / Sin indicar» — RosterDetail · l.259, when `!(participants.length === 0) && each participants`

### components/pasantias-intake/IntakeShell.tsx

Used by: `/pasantias/nomina`

**Values shown from data** (1)

- `{children}` — IntakeShell · l.20

**Other texts on screen** (2)

- «Fundación Nueva Educación» — IntakeShell · l.13
- «Pasantías Barcelona · Nómina de pasantes» — IntakeShell · l.14

### components/pasantias-intake/ParticipantForm.tsx

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Nueva ficha / Editar ficha» | h2 |  | ParticipantForm · l.176 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cancelar» | `{onCancel}` |  | `{saving}` | `testid=intake-cancel` | ParticipantForm · l.448 |
| «Guardando… / Guardar ficha / Guardar cambios» (submits the form) |  |  | `{saving}` | `testid=intake-save` | ParticipantForm · l.457 |

**Fields** (10)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombres» | text | `maxLength={120}` |  |  | `testid=intake-first-names` | ParticipantForm · l.207 |
| «Apellidos» | text | `maxLength={120}` |  |  | `testid=intake-last-names` | ParticipantForm · l.226 |
| «RUT» | text | «12.345.678-5» · `maxLength={20}` |  |  | `testid=intake-rut` | ParticipantForm · l.245 |
| «N° de pasaporte (opcional)» | text | `maxLength={30}` |  |  | `testid=intake-passport` | ParticipantForm · l.267 |
| «Correo electrónico (opcional) / Correo electrónico» | email | «nombre@colegio.cl» · `maxLength={254}` |  |  | `testid=intake-email` | ParticipantForm · l.288 |
| «Llegada a Barcelona (opcional)» | select | disabled: `{datesLocked}` | «Sin indicar», «(lista) {option.label}» |  | `testid=intake-arrival-date` | ParticipantForm · l.326 |
| «Regreso desde Barcelona (opcional)» | select | disabled: `{datesLocked}` | «Sin indicar», «(lista) {option.label}» |  | `testid=intake-departure-date` | ParticipantForm · l.347 |
| «Foco (opcional)» | select |  | «Sin indicar», «(lista) {FOCUS_LABELS[code]}» |  | `testid=intake-focus` | ParticipantForm · l.368 |
| «{DIETARY_LABELS[code]}» | checkbox |  |  | `each DIETARY_DISPLAY_ORDER` | `testid=intake-dietary-{code} id=intake-field-dietary-{code}` | ParticipantForm · l.405 |
| «Detalle de «Otra restricción»» | text | `maxLength={400}` |  | `hasOtra` | `testid=intake-dietary-other` | ParticipantForm · l.425 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); onSubmit(); }}` |  | ParticipantForm · l.164 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!errors[name]` | FieldError · l.75 |
| `focusRequest === 0` | ParticipantForm · l.136 |
| `!first` | ParticipantForm · l.138 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Fieldset` | legend: Datos personales |  |  | ParticipantForm · l.201 |
| `Fieldset` | legend: Viaje y foco |  |  | ParticipantForm · l.313 |
| `Fieldset` | legend: Alimentación |  |  | ParticipantForm · l.390 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `saveState` | «Guardando… / Cambios sin guardar / Guardado» | ParticipantForm · l.161 |
| `fieldId()` | «intake-field-dietary-{DIETARY_DISPLAY_ORDER[0]} / intake-field-{name}» | fieldId · l.37 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (16)

| Kind | What | Where |
|---|---|---|
| mark | `testid=intake-required-mark` | RequiredMark · l.59 |
| mark | `testid=intake-error-{name}` | FieldError · l.77 |
| lookup | `querySelector(#{fieldId(first)})` | ParticipantForm · l.139 |
| focus | `element.focus()` | ParticipantForm · l.140 |
| mark | `testid=intake-save-state` | ParticipantForm · l.179 |
| mark | `testid=intake-required-legend` | ParticipantForm · l.187 |
| role | `role=alert` | ParticipantForm · l.192 |
| mark | `testid=intake-form-notice` | ParticipantForm · l.192 |
| mark | `id=intake-hint-rut` | ParticipantForm · l.260 |
| mark | `id=intake-hint-passport` | ParticipantForm · l.279 |
| mark | `id=intake-hint-email` | ParticipantForm · l.305 |
| mark | `testid=intake-hint-dates id=intake-hint-dates` | ParticipantForm · l.314 |
| mark | `testid=intake-dates-locked` | ParticipantForm · l.318 |
| role | `role=group` | ParticipantForm · l.391 |
| mark | `id=intake-dietary-label` | ParticipantForm · l.396 |
| mark | `id=intake-hint-dietary` | ParticipantForm · l.399 |

**Values shown from data** (5)

- `{errors[name]}` — FieldError · l.77
- `{children}` — Fieldset · l.92
- `{saveState}` — ParticipantForm · l.179
- `{notice}` — ParticipantForm · l.192, when `notice`
- `{programDatesNotice(program)}` — ParticipantForm · l.314

**Other texts on screen** (29)

- «Obligatorio» — RequiredMark · l.60
- «{children}» (label) — Label · l.67
- «{legend}» (label) — Fieldset · l.91
- «Los campos marcados «Obligatorio» deben completarse.» — ParticipantForm · l.188
- «Nombres» (label) — ParticipantForm · l.204
- «Nombres» — ParticipantForm · l.205
- «Apellidos» (label) — ParticipantForm · l.223
- «Apellidos» — ParticipantForm · l.224
- «RUT» (label) — ParticipantForm · l.242
- «RUT» — ParticipantForm · l.243
- «Con dígito verificador. Puedes escribirlo con o sin puntos.» — ParticipantForm · l.261
- «N° de pasaporte (opcional)» (label) — ParticipantForm · l.266
- «N° de pasaporte (opcional)» — ParticipantForm · l.266
- «Si aún no lo tiene, déjalo en blanco.» — ParticipantForm · l.280
- «Correo electrónico (opcional) / Correo electrónico» (label) — ParticipantForm · l.285
- «Correo electrónico (opcional) / Correo electrónico» — ParticipantForm · l.285
- «El correo personal de quien viaja. Allí recibirá su carta de invitación.» — ParticipantForm · l.306
- «El pasaje de esta persona ya fue comprado, por eso las fechas no se pueden cambiar aquí. Si necesitas modificarlas, escribe a la Fundación.» — ParticipantForm · l.319, when `datesLocked`
- «Llegada a Barcelona (opcional)» (label) — ParticipantForm · l.325
- «Llegada a Barcelona (opcional)» — ParticipantForm · l.325
- «Regreso desde Barcelona (opcional)» (label) — ParticipantForm · l.346
- «Regreso desde Barcelona (opcional)» — ParticipantForm · l.346
- «Foco (opcional)» (label) — ParticipantForm · l.367
- «Foco (opcional)» — ParticipantForm · l.367
- «Restricciones alimentarias (opcional)» — ParticipantForm · l.397
- «Marca todas las que correspondan. Si no marcas ninguna, queda como «no indicado».» — ParticipantForm · l.400
- «{DIETARY_LABELS[code]}» (label) — ParticipantForm · l.404, when `each DIETARY_DISPLAY_ORDER`
- «Detalle de «Otra restricción»» (label) — ParticipantForm · l.422, when `hasOtra`
- «Detalle de «Otra restricción»» — ParticipantForm · l.423, when `hasOtra`

### components/pasantias-intake/ParticipantList.tsx

Used by: `/admin/pasantia-participants`, `/pasantias/nomina`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Editando / Editar» · aria «{`Editar ficha de ${participant.firstNames} ${participant.lastNames}`}» | `{() => onEdit(participant)}` | `each participants` | `{disabled \|\| editing}` | `testid=intake-edit-{participant.id}` | ParticipantList · l.60 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `dietarySummary()` | «Sin indicar» | dietarySummary · l.12 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Otra: {participant.dietaryOther}» | dietarySummary · l.15 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| mark | `testid=intake-list-empty` | ParticipantList · l.36 |
| mark | `testid=intake-list` | ParticipantList · l.43 |
| mark | `testid=intake-row-{participant.id}` | ParticipantList · l.47 |
| mark | `testid=intake-row-name` | ParticipantList · l.55 |

**Values shown from data** (4)

- `{participant.firstNames} {participant.lastNames}` — ParticipantList · l.55, when `each participants`
- `{storedDateLabel(program, 'arrival',…}` — ParticipantList · l.75, when `each participants`
- `{storedDateLabel(program, 'departure…}` — ParticipantList · l.79, when `each participants`
- `{dietarySummary(participant)}` — ParticipantList · l.91, when `each participants`

**Other texts on screen** (10)

- «Aún no hay personas guardadas en esta nómina.» — ParticipantList · l.37, when `participants.length === 0`
- «Persona {index + 1}» — ParticipantList · l.54, when `each participants`
- «RUT {displayRut(participant.rut)}» — ParticipantList · l.58, when `each participants`
- «Llegada:» — ParticipantList · l.74, when `each participants`
- «Regreso:» — ParticipantList · l.78, when `each participants`
- «Pasaporte:» — ParticipantList · l.82, when `each participants`
- «{participant.passportNumber} / Sin indicar» — ParticipantList · l.83, when `each participants`
- «Foco:» — ParticipantList · l.86, when `each participants`
- «{FOCUS_LABELS[participant.focus]} / Sin indicar» — ParticipantList · l.87, when `each participants`
- «Alimentación:» — ParticipantList · l.90, when `each participants`

### components/pasantias-intake/RosterStatusBadge.tsx

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ROSTER_STATUS_LABELS` | «Abierta», «Enviada», «Reabierta tras envío» | l.8 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testId}` | RosterStatusBadge · l.29 |

**Values shown from data** (1)

- `{ROSTER_STATUS_LABELS[status]}` — RosterStatusBadge · l.29

### components/pasantias-intake/SchoolDataForm.tsx

Used by: `/pasantias/nomina`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Datos del colegio» | h2 |  | SchoolDataForm · l.138 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Guardando… / Guardar datos del colegio» (submits the form) |  |  | `{saving}` | `testid=intake-school-save` | SchoolDataForm · l.180 |

**Fields** (1)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{label}» | select | disabled: `{locked}` | «Selecciona…», «(lista) {FUNDING_LABELS[source]}» |  | `testid={testId}` | select · l.89 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(event) => { event.preventDefault(); onSubmit(); }}` |  | SchoolDataForm · l.128 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `focusRequest === 0` | SchoolDataForm · l.55 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `RequiredMark` |  |  |  | select · l.87 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `state` | «saving / Guardando… / unsaved / Cambios sin guardar / saved / Guardado / stored / Datos guardados / missing / Pendiente» | SchoolDataForm · l.64 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (8)

| Kind | What | Where |
|---|---|---|
| focus | `formRef.current?.querySelector<HTMLElement>('#${i….focus()` | SchoolDataForm · l.61 |
| lookup | `querySelector(#{id})` | SchoolDataForm · l.61 |
| mark | `testid={testId}-locked` | select · l.108 |
| mark | `testid={errorTestId} id={id}-error` | select · l.114 |
| mark | `testid=intake-school-section` | SchoolDataForm · l.123 |
| mark | `testid=intake-school-state` | SchoolDataForm · l.141 |
| role | `role=alert` | SchoolDataForm · l.165 |
| mark | `testid=intake-school-notice` | SchoolDataForm · l.165 |

**Values shown from data** (6)

- `{errors[field]}` — select · l.114, when `errors[field]`
- `{state.text}` — SchoolDataForm · l.141
- `{schoolName}` — SchoolDataForm · l.152
- `{programName}` — SchoolDataForm · l.156
- `{notice}` — SchoolDataForm · l.165, when `notice`
- `{select('flightsFunding', 'intake-sc…} {select('lodgingFunding', 'intake-sc…}` — SchoolDataForm · l.174

**Other texts on screen** (5)

- «{label}» (label) — select · l.85
- «Ya hay pasajes comprados para esta nómina, por eso este dato no se puede cambiar aquí. Si necesitas modificarlo, escribe a la Fundación.» — select · l.109, when `locked`
- «Colegio:» — SchoolDataForm · l.151
- «Programa:» — SchoolDataForm · l.155
- «Indica una sola vez, para todo el colegio, quién cubre el costo de los pasajes y de la estadía. Se aplica a todos los pasantes de esta nómina. Los campos marcados «Obligatorio» deben completarse.» — SchoolDataForm · l.160

### components/pasantias-panel/PanelParts.tsx

Used by: `/admin/pasantias-panel`

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Limpiar filtros» | `{onClear}` |  | `{!active}` | `testid=panel-filter-clear` | PanelFilters · l.215 |
| «Aplicando… / Aplicar» | `{() => chosen && onApply(chosen.choice)}` |  | `{!chosen \|\| busy}` | `testid=panel-bulk-apply` | BulkBar · l.293 |
| «Quitar selección» | `{onClear}` |  | `{busy}` | `testid=panel-bulk-clear` | BulkBar · l.302 |
| «{fullName}» | `{() => onOpen(p.id)}` | `each rows` |  | `testid=panel-open-{p.id}` | PanelTable · l.398 |

**Fields** (13)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Buscar por nombre, RUT, pasaporte o correo» | search |  |  |  | `testid=panel-filter-search id=panel-filter-search (id used by code)` | PanelFilters · l.111 |
| «Colegio» | select |  | «Todos», «(lista) {roster.schoolName} · {roster.programName}» |  | `testid=panel-filter-roster id=panel-filter-roster (id used by code)` | PanelFilters · l.125 |
| «Programa» | select |  | «Todos», «(lista) {programById(id).name}» |  | `testid=panel-filter-program id=panel-filter-program (id used by code)` | PanelFilters · l.144 |
| «Pasaje» | select |  | «Todos», «(lista) {FLIGHT_LABELS[status]}» |  | `testid=panel-filter-flight id=panel-filter-flight (id used by code)` | PanelFilters · l.163 |
| «Alojamiento» | select |  | «Todos», «(lista) {LODGING_LABELS[status]}» |  | `testid=panel-filter-lodging id=panel-filter-lodging (id used by code)` | PanelFilters · l.182 |
| «Pago del programa» | select |  | «Todos», «Abono 50% pendiente», «Saldo 50% pendiente», «Todo recibido» |  | `testid=panel-filter-payment id=panel-filter-payment (id used by code)` | PanelFilters · l.201 |
| «Marcar a todas como» | select |  | «Selecciona…», «(lista) {option.label}» |  | `testid=panel-bulk-choice id=panel-bulk-choice (id used by code)` | BulkBar · l.278 |
| «Seleccionar todas las personas de la lista» | checkbox |  |  |  | `testid=panel-select-all` | PanelTable · l.346 |
| «{`Seleccionar a ${fullName}`}» | checkbox |  |  | `each rows` | `testid=panel-select-{p.id}` | PanelTable · l.388 |
| «{`Pasaje de ${fullName}`}» | select | disabled: `{busy}` | «(lista) {FLIGHT_LABELS[status]}» | `each rows` | `testid=panel-flight-{p.id}` | PanelTable · l.447 |
| «{`Alojamiento de ${fullName}`}» | select | disabled: `{busy}` | «(lista) {LODGING_LABELS[status]}» | `each rows` | `testid=panel-lodging-{p.id}` | PanelTable · l.463 |
| «Abono 50%» | checkbox | disabled: `{busy}` |  | `each rows` | `testid=panel-deposit-{p.id}` | PanelTable · l.480 |
| «Saldo 50%» | checkbox | disabled: `{busy}` |  | `each rows` | `testid=panel-balance-{p.id}` | PanelTable · l.491 |

**Table columns** (8)

| Text | Shown when | Where |
|---|---|---|
| «Persona» |  | PanelTable · l.355 |
| «Colegio» |  | PanelTable · l.356 |
| «Fechas del viaje» |  | PanelTable · l.357 |
| «Foco y alimentación» |  | PanelTable · l.358 |
| «Pasaje» |  | PanelTable · l.359 |
| «Alojamiento» |  | PanelTable · l.360 |
| «Pago del programa» |  | PanelTable · l.361 |
| «Documentos» |  | PanelTable · l.362 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `count === 0` | BulkBar · l.263 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Tile` | label: Pasajes pagados · hint: {summary.flightPurchased} comprados |  |  | SummaryTiles · l.68 |
| `Tile` | label: Alojamiento pagado · hint: {summary.lodgingReserved} reservados |  |  | SummaryTiles · l.75 |
| `Tile` | label: Abono 50% recibido |  |  | SummaryTiles · l.82 |
| `Tile` | label: Saldo 50% recibido |  |  | SummaryTiles · l.83 |
| `FileText` | aria-hidden: true | `each rows` |  | PanelTable · l.504 |
| `Mail` | aria-hidden: true | `each rows` |  | PanelTable · l.508 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `BULK_OPTIONS` | «Abono 50%: recibido», «Abono 50%: pendiente», «Saldo 50%: recibido», «Saldo 50%: pendiente» | l.231 |
| `sendText` | «Carta enviada {shortDate(send.at)} / Carta: sale en el próximo envío / Carta: se envía el {shortDate(send.on)} / Carta no enviada / Carta: falta información» | PanelTable · l.375 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Pasaje: {FLIGHT_LABELS[status]}» | BULK_OPTIONS · l.234 |
| «Alojamiento: {LODGING_LABELS[status]}» | BULK_OPTIONS · l.239 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (17)

| Kind | What | Where |
|---|---|---|
| mark | `testid={testId}` | Tile · l.44 |
| mark | `testid={testId}-value` | Tile · l.47 |
| mark | `testid=panel-summary` | SummaryTiles · l.58 |
| mark | `testid=panel-tile-travellers` | SummaryTiles · l.59 |
| mark | `testid=panel-tile-travellers-value` | SummaryTiles · l.61 |
| mark | `testid=panel-filters` | PanelFilters · l.105 |
| mark | `testid=panel-bulk` | BulkBar · l.266 |
| mark | `testid=panel-bulk-count` | BulkBar · l.271 |
| mark | `testid=panel-table` | PanelTable · l.342 |
| mark | `testid=panel-row-{p.id}` | PanelTable · l.386 |
| mark | `testid=panel-email-{p.id}` | PanelTable · l.408 |
| mark | `testid=panel-account-{p.id}` | PanelTable · l.412 |
| mark | `testid=panel-funding-{p.id}` | PanelTable · l.423 |
| mark | `testid=panel-flight-dates-{p.id}` | PanelTable · l.430 |
| mark | `testid=panel-docs-{p.id}` | PanelTable · l.503 |
| mark | `testid=panel-letter-{p.id}` | PanelTable · l.507 |
| mark | `testid=panel-letter-send-{p.id}` | PanelTable · l.511 |

**Values shown from data** (9)

- `{label}` — Tile · l.45
- `{value}` — Tile · l.47
- `{hint}` — Tile · l.50, when `hint`
- `{total}` — SummaryTiles · l.61
- `{roster?.schoolName} / —` — PanelTable · l.421, when `each rows`
- `{roster?.programName}` — PanelTable · l.422, when `each rows`
- `{FLIGHT_DATE_LABELS[field]}` — PanelTable · l.433, when `each rows && each FLIGHT_DATE_FIELDS`
- `{shortDate(l[field])}` — PanelTable · l.434, when `each rows && each FLIGHT_DATE_FIELDS`
- `{sendText}` — PanelTable · l.511, when `each rows`

**Other texts on screen** (26)

- «de {total}» — Tile · l.48
- «Resumen de la cohorte» (aria-label) — SummaryTiles · l.58
- «Pasantes» — SummaryTiles · l.60
- «{summary.schools} colegio / colegios» — SummaryTiles · l.64
- «Filtros» (aria-label) — PanelFilters · l.105
- «Buscar por nombre, RUT, pasaporte o correo» (label) — PanelFilters · l.108
- «Colegio» (label) — PanelFilters · l.122
- «Programa» (label) — PanelFilters · l.141
- «Pasaje» (label) — PanelFilters · l.160
- «Alojamiento» (label) — PanelFilters · l.179
- «Pago del programa» (label) — PanelFilters · l.198
- «Cambio masivo» (aria-label) — BulkBar · l.266
- «{count} persona seleccionada / personas seleccionadas» — BulkBar · l.271
- «Marcar a todas como» (label) — BulkBar · l.275
- «RUT {displayRut(p.rut)}» — PanelTable · l.406, when `each rows`
- «Pasaporte {p.passportNumber} / —» — PanelTable · l.407, when `each rows`
- «{p.email} / Sin correo» — PanelTable · l.408, when `each rows`
- «Con cuenta en GENERA» — PanelTable · l.416, when `each rows && row.hasAccount`
- «Pasajes: {FUNDING_LABELS[roster.schoo…} · Estadía: {FUNDING_LABELS[roster.schoo…} / Costos sin definir por el colegio» — PanelTable · l.423, when `each rows`
- «Según el colegio: {shortDate(p.arrivalDate)} a {shortDate(p.departureDate)}» — PanelTable · l.438, when `each rows`
- «{FOCUS_LABELS[p.focus]} / Foco sin indicar» — PanelTable · l.443, when `each rows`
- «{dietaryText(p)} / Alimentación sin indicar» — PanelTable · l.444, when `each rows`
- «Abono 50%» (label) — PanelTable · l.479, when `each rows`
- «Saldo 50%» (label) — PanelTable · l.490, when `each rows`
- «documento / documentos» — PanelTable · l.505, when `each rows`
- «Carta generada / Sin carta» — PanelTable · l.509, when `each rows`

### components/pasantias-panel/ParticipantDrawer.tsx

Used by: `/admin/pasantias-panel`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h3 |  | Section · l.112 |
| «Envío por correo» | h4 | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | ParticipantDrawer · l.838 |

**Buttons** (10)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Corregir datos» | `{() => { setDraft(draftFromParticipant(p)); setDraftErrors({}); setDraftNotice(n…}` | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)` |  | `testid=panel-data-edit` | ParticipantDrawer · l.600 |
| «Guardando… / Guardar seguimiento» | `{() => void saveTracking()}` | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `{!trackingDirty \|\| trackingSaving}` | `testid=panel-tracking-save` | ParticipantDrawer · l.752 |
| «Guardando… / Guardar datos de la carta» | `{() => void saveLines()}` | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `{!linesDirty \|\| linesSaving}` | `testid=panel-letter-save-lines` | ParticipantDrawer · l.809 |
| «Generando… / Generar una carta nueva / Generar carta de invitación» | `{() => void generateLetter()}` | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `{missing.length > 0 \|\| generating \|\| linesDirty \|\| trackingDirty}` | `testid=panel-letter-generate` | ParticipantDrawer · l.824 |
| «Enviando… / Enviar de nuevo ahora / Enviar por correo ahora» | `{() => void sendLetterNow()}` | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `{missing.length > 0 \|\| !p.email \|\| sending \|\| generating \|\| linesDirty \|\| tracki…}` | `testid=panel-letter-send` | ParticipantDrawer · l.855 |
| «Descargar» | `{() => void download(doc.id)}` | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents` | `{docBusy !== null}` | `testid=panel-doc-download-{doc.id}` | ParticipantDrawer · l.887 |
| «Sí, eliminar» | `{() => void remove(doc.id)}` | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents && confirmRemove === doc.id` | `{docBusy !== null}` | `testid=panel-doc-remove-confirm-{doc.id}` | ParticipantDrawer · l.898 |
| «Cancelar» | `{() => setConfirmRemove(null)}` | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents && confirmRemove === doc.id` | `{docBusy !== null}` | `testid=panel-doc-remove-cancel-{doc.id}` | ParticipantDrawer · l.907 |
| «Eliminar» | `{() => setConfirmRemove(doc.id)}` | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents && !(confirmRemove === doc.id)` | `{docBusy !== null}` | `testid=panel-doc-remove-{doc.id}` | ParticipantDrawer · l.918 |
| «Subiendo… / Subir documento» (submits the form) |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `{uploading}` | `testid=panel-doc-upload` | ParticipantDrawer · l.992 |

**Fields** (12)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Pasaje aéreo» | select |  | «(lista) {FLIGHT_LABELS[status]}» | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-flight id=panel-tracking-flight (id used by code)` | ParticipantDrawer · l.624 |
| «Alojamiento» | select |  | «(lista) {LODGING_LABELS[status]}» | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-lodging id=panel-tracking-lodging (id used by code)` | ParticipantDrawer · l.642 |
| «{FLIGHT_DATE_LABELS[field]}» | date | `min={FLIGHT_DATE_MIN} max={FLIGHT_DATE_MAX}` |  | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && each FLIGHT_DATE_FIELDS` | `testid=panel-tracking-{field} id=panel-tracking-{field}` | ParticipantDrawer · l.668 |
| «Abono 50% recibido» | checkbox |  |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-deposit` | ParticipantDrawer · l.692 |
| «Saldo 50% recibido» | checkbox |  |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-balance` | ParticipantDrawer · l.702 |
| «Tratamiento en la carta» | select |  | «Sin indicar», «(lista) {SALUTATION_LABELS[s]}» | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-salutation id=panel-tracking-salutation (id used by code)` | ParticipantDrawer · l.717 |
| «Notas internas» | textarea | `maxLength={NOTES_MAX * 2}` |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-tracking-notes id=panel-tracking-notes (id used by code)` | ParticipantDrawer · l.736 |
| «Colegio, como aparece en la carta» | text | `maxLength={LETTER_LINE_MAX * 2}` |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-letter-school id=panel-letter-school (id used by code)` | ParticipantDrawer · l.776 |
| «Alojamiento, como aparece en la carta» | text | `maxLength={LETTER_LINE_MAX * 2}` |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-letter-lodging id=panel-letter-lodging (id used by code)` | ParticipantDrawer · l.796 |
| «Tipo de documento» | select |  | «(lista) {DOCUMENT_KIND_LABELS[k]}» | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-doc-kind id=panel-doc-kind (id used by code)` | ParticipantDrawer · l.938 |
| «Descripción (opcional)» | text | `maxLength={DESCRIPTION_MAX * 2}` |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-doc-description id=panel-doc-description (id used by code)` | ParticipantDrawer · l.956 |
| «Archivo» | file | accepts `{FILE_ACCEPT}` |  | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `testid=panel-doc-file id=panel-doc-file (id used by code)` | ParticipantDrawer · l.972 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => void upload(e)}` | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | ParticipantDrawer · l.933 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `Dialog` | component | `true` |  | ParticipantDrawer · l.493 |

**Messages set on the page** (19)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos conectar. Inténtalo de nuevo.» | `setLoadError` |  | ParticipantDrawer · l.210 |
| «Seguimiento guardado. / info» | `setTrackingMsg` | `response.ok` | saveTracking · l.250 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setTrackingMsg` |  | saveTracking · l.263 |
| «Datos corregidos. El cambio quedó en el historial. / info» | `setDataMsg` | `response.ok` | saveCorrection · l.292 |
| «El colegio u otra persona cambió estos datos mientras los editabas. Revisa la versión guardada (arriba) y vuelve a guardar si corresponde.» | `setDraftNotice` | `response.status === 409 && body.code === 'STALE'` | saveCorrection · l.297 |
| «No pudimos conectar. Inténtalo de nuevo.» | `setDraftNotice` |  | saveCorrection · l.306 |
| «Datos de la carta guardados para {detail.roster.schoolName}. / info» | `setLetterMsg` | `response.ok` | saveLines · l.332 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setLetterMsg` |  | saveLines · l.341 |
| «Carta generada y guardada en los documentos de esta persona. / info» | `setLetterMsg` | `response.status === 201` | generateLetter · l.356 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setLetterMsg` |  | generateLetter · l.361 |
| «Carta enviada a {typeof body.to === 'string'…}. / info» | `setLetterMsg` | `response.ok` | sendLetterNow · l.376 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setLetterMsg` |  | sendLetterNow · l.381 |
| «Elige un archivo para subir.» | `setUploadErrors` | `!file` | upload · l.395 |
| «El archivo supera el máximo de 4 MB.» | `setUploadErrors` | `file.size > MAX_FILE_BYTES` | upload · l.399 |
| «Documento subido. / info» | `setDocMsg` | `response.status === 201` | upload · l.415 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setDocMsg` |  | upload · l.421 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setDocMsg` |  | download · l.446 |
| «Documento eliminado. / info» | `setDocMsg` |  | remove · l.465 |
| «No pudimos conectar. Inténtalo de nuevo. / error» | `setDocMsg` |  | remove · l.467 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!text` | Notice · l.121 |

**Pieces placed here, with the texts and settings handed to them** (13)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `DialogContent` |  |  | `testid=panel-drawer` | ParticipantDrawer · l.494 |
| `DialogHeader` |  |  |  | ParticipantDrawer · l.495 |
| `DialogTitle` |  |  | `testid=panel-drawer-title` | ParticipantDrawer · l.496 |
| `DialogDescription` |  |  |  | ParticipantDrawer · l.499 |
| `Notice` | tone: error | `loadError` |  | ParticipantDrawer · l.504 |
| `Loader2` | aria-hidden: true | `(!detail \|\| !p \|\| !roster \|\| !tracking) && !(loadError)` |  | ParticipantDrawer · l.508 |
| `Section` | title: Datos enviados por el colegio | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `id=panel-section-data` | ParticipantDrawer · l.513 |
| `ParticipantForm` |  | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && editing && draft` |  | ParticipantDrawer · l.521 |
| `RosterStatusBadge` |  | `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)` |  | ParticipantDrawer · l.595 |
| `Section` | title: Seguimiento FNE | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `id=panel-section-tracking` | ParticipantDrawer · l.618 |
| `Section` | title: Carta de invitación | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `id=panel-section-letter` | ParticipantDrawer · l.765 |
| `Section` | title: Documentos | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `id=panel-section-documents` | ParticipantDrawer · l.867 |
| `Section` | title: Historial | `!(!detail \|\| !p \|\| !roster \|\| !tracking)` | `id=panel-section-activity` | ParticipantDrawer · l.999 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `SCHOOL_LINE_EXAMPLE` | «del Colegio Ejemplo de Valdivia, de la Región de Los Ríos, Chile» | l.59 |
| `LODGING_LINE_EXAMPLE` | «la Residencia/Hotel Martí Codolar, ubicada en Av. del Cardenal Vidal i Barraquer, 15, Horta-Guinardó» | l.60 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Estos datos cambiaron mientras los editabas.» | ParticipantDrawer · l.255 |
| «Pasante» | ParticipantDrawer · l.477 |
| «No se envió: la fecha de salida de SCL ya pasó. Puedes enviarla ahora.» | ParticipantDrawer · l.847 |
| «No se enviará sola todavía. Falta: {sendState.missing.join('; ')}.» | ParticipantDrawer · l.848 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (22)

| Kind | What | Where |
|---|---|---|
| mark | `testid={id}` | Section · l.111 |
| mark | `testid={testId}` | Notice · l.123 |
| mark | `testid=panel-drawer-loading` | ParticipantDrawer · l.507 |
| mark | `testid=panel-data-view` | ParticipantDrawer · l.544 |
| mark | `testid=panel-data-rut` | ParticipantDrawer · l.547 |
| mark | `testid=panel-data-passport` | ParticipantDrawer · l.551 |
| mark | `testid=panel-data-email` | ParticipantDrawer · l.555 |
| mark | `testid=panel-data-account` | ParticipantDrawer · l.558 |
| mark | `testid=panel-tracking-error-{field}` | ParticipantDrawer · l.680 |
| mark | `id=panel-letter-school-hint` | ParticipantDrawer · l.773 |
| mark | `id=panel-letter-lodging-hint` | ParticipantDrawer · l.793 |
| mark | `testid=panel-letter-missing` | ParticipantDrawer · l.819 |
| mark | `testid=panel-letter-send-state` | ParticipantDrawer · l.839 |
| mark | `testid=panel-letter-send-error` | ParticipantDrawer · l.851 |
| mark | `testid=panel-doc-empty` | ParticipantDrawer · l.870 |
| mark | `testid=panel-doc-list` | ParticipantDrawer · l.874 |
| mark | `testid=panel-doc-{doc.id}` | ParticipantDrawer · l.876 |
| mark | `id=panel-doc-file-hint` | ParticipantDrawer · l.982 |
| mark | `testid=panel-doc-file-error` | ParticipantDrawer · l.986 |
| mark | `testid=panel-activity-empty` | ParticipantDrawer · l.1001 |
| mark | `testid=panel-activity-list` | ParticipantDrawer · l.1005 |
| mark | `testid=panel-activity-item` | ParticipantDrawer · l.1007 |

**Values shown from data** (17)

- `{children}` — Section · l.115
- `{text}` — Notice · l.123
- `{fullName}` — ParticipantDrawer · l.496
- `{displayRut(p.rut)}` — ParticipantDrawer · l.547, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- `{storedDateLabel(roster.program, 'ar…}` — ParticipantDrawer · l.570, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- `{storedDateLabel(roster.program, 'de…}` — ParticipantDrawer · l.574, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- `{dietaryText(p)}` — ParticipantDrawer · l.582, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- `{trackingErrors[field]}` — ParticipantDrawer · l.680, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && each FLIGHT_DATE_FIELDS && trackingErrors[field]`
- `{trackingErrors.notes}` — ParticipantDrawer · l.747, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && trackingErrors.notes`
- `{lineErrors.letterSchoolLine}` — ParticipantDrawer · l.787, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && lineErrors.letterSchoolLine`
- `{lineErrors.letterLodgingLine}` — ParticipantDrawer · l.807, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && lineErrors.letterLodgingLine`
- `{DOCUMENT_KIND_LABELS[doc.kind]} · {doc.description}` — ParticipantDrawer · l.878, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents`
- `{doc.fileName} · {fileSize(doc.sizeBytes)} · {formatInstant(doc.createdAt)}` — ParticipantDrawer · l.882, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.documents.length === 0) && each detail.documents`
- `{uploadErrors.description}` — ParticipantDrawer · l.966, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && uploadErrors.description`
- `{uploadErrors.file}` — ParticipantDrawer · l.986, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && uploadErrors.file`
- `{formatInstant(entry.createdAt)} · {entry.actorName}` — ParticipantDrawer · l.1008, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.activity.length === 0) && each detail.activity`
- `{line}` — ParticipantDrawer · l.1012, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(detail.activity.length === 0) && each detail.activity && each entry.lines`

**Other texts on screen** (45)

- «{roster.schoolName} · {roster.programName} / Cargando…» — ParticipantDrawer · l.499
- «Cargando…» — ParticipantDrawer · l.508, when `(!detail \|\| !p \|\| !roster \|\| !tracking) && !(loadError)`
- «Estás corrigiendo datos que ingresó el colegio. El cambio queda registrado con tu nombre y el colegio lo verá la próxima vez que abra su nómina.» — ParticipantDrawer · l.518, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && editing && draft`
- «RUT» — ParticipantDrawer · l.546, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Pasaporte» — ParticipantDrawer · l.550, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «{p.passportNumber} / Sin indicar» — ParticipantDrawer · l.551, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Correo» — ParticipantDrawer · l.554, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Sin indicar» — ParticipantDrawer · l.556, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Tiene cuenta en GENERA: ve «Mi pasantía» / Sin cuenta en GENERA» — ParticipantDrawer · l.558, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft) && p.email`
- «Llegada a Barcelona» — ParticipantDrawer · l.569, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Regreso desde Barcelona» — ParticipantDrawer · l.573, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Foco» — ParticipantDrawer · l.577, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «{FOCUS_LABELS[p.focus]} / Sin indicar» — ParticipantDrawer · l.578, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Alimentación» — ParticipantDrawer · l.581, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Costos (según el colegio)» — ParticipantDrawer · l.585, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Pasajes: {FUNDING_LABELS[roster.schoo…} · Estadía: {FUNDING_LABELS[roster.schoo…} / Sin definir por el colegio» — ParticipantDrawer · l.586, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Nómina del colegio» — ParticipantDrawer · l.593, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «· Última edición» — ParticipantDrawer · l.595, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && !(editing && draft)`
- «Pasaje aéreo» (label) — ParticipantDrawer · l.621, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Alojamiento» (label) — ParticipantDrawer · l.639, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Fechas del viaje» (label) — ParticipantDrawer · l.657, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Las fechas reales del pasaje. La carta de invitación se envía por correo 7 días antes de la salida de SCL.» — ParticipantDrawer · l.659, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «{FLIGHT_DATE_LABELS[field]}» (label) — ParticipantDrawer · l.665, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && each FLIGHT_DATE_FIELDS`
- «Pago del programa» (label) — ParticipantDrawer · l.689, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Abono 50% recibido» (label) — ParticipantDrawer · l.691, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Saldo 50% recibido» (label) — ParticipantDrawer · l.701, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Tratamiento en la carta» (label) — ParticipantDrawer · l.714, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Notas internas» (label) — ParticipantDrawer · l.733, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Solo las ve el equipo FNE. Máximo {NOTES_MAX} caracteres.» — ParticipantDrawer · l.746, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Cambios sin guardar» — ParticipantDrawer · l.761, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && trackingDirty`
- «Estos dos textos valen para todas las personas de {roster.schoolName} ( {roster.programName} ).» — ParticipantDrawer · l.766, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Colegio, como aparece en la carta» (label) — ParticipantDrawer · l.770, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Completa la frase «…como parte del equipo ____». Ej.: {SCHOOL_LINE_EXAMPLE}» — ParticipantDrawer · l.773, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Alojamiento, como aparece en la carta» (label) — ParticipantDrawer · l.790, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Completa la frase «Usted se estará hospedando en ____». Ej.: {LODGING_LINE_EXAMPLE}» — ParticipantDrawer · l.793, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Para generar la carta falta: {missing.join('; ')} .» — ParticipantDrawer · l.819, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && missing.length > 0`
- «Guarda los cambios pendientes antes de generar la carta.» — ParticipantDrawer · l.834, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && (missing.length === 0 && (linesDirty \|\| trackingDirty))`
- «Enviada a {sendState.to} el {shortDate(sendState.at)}. / Lista: se enviará sola en el próximo envío diario. / Lista: se enviará sola el {shortDate(sendState.on)} (7 días antes de la salida de SCL). / No se envió: la fecha de salida de SCL …» — ParticipantDrawer · l.839, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «El último intento falló: {sendError} .» — ParticipantDrawer · l.851, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && sendError && sendState.kind !== 'sent'`
- «Aún no hay documentos de esta persona.» — ParticipantDrawer · l.871, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && detail.documents.length === 0`
- «Tipo de documento» (label) — ParticipantDrawer · l.935, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Descripción (opcional)» (label) — ParticipantDrawer · l.953, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Archivo» (label) — ParticipantDrawer · l.969, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «PDF o imagen (JPG, PNG, WebP), hasta 4 MB. Solo el equipo FNE puede verlo.» — ParticipantDrawer · l.983, when `!(!detail \|\| !p \|\| !roster \|\| !tracking)`
- «Aún no hay cambios registrados.» — ParticipantDrawer · l.1002, when `(!(!detail \|\| !p \|\| !roster \|\| !tracking)) && detail.activity.length === 0`

### components/ui/dialog.tsx

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`

**Other texts on screen** (1)

- «Close» — l.47, hidden by its class (`sr-only`); another control opens it or it is for screen readers

### lib/api-auth.ts

Used by: `/admin/pasantia-leads`, `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/profile/pasantia`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

### lib/exportUtils.ts

Used by: `/admin/pasantia-leads`, `/admin/pasantias-panel`

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al exportar a Excel» | `throw (shown by whoever catches it)` |  | exportToExcel · l.110 |
| «Error al exportar a PDF» | `throw (shown by whoever catches it)` |  | exportToPDF · l.181 |
| «Tipo de exportación no soportado» | `throw (shown by whoever catches it)` |  | exportReport · l.227 |

**Downloads and printing** (3)

| How | When | Where |
|---|---|---|
| `URL.createObjectURL()` |  | exportToCSV · l.71 |
| `URL.createObjectURL()` |  | exportToExcel · l.101 |
| `doc.save()` |  | exportToPDF · l.178 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `exportData` | «Reporte FNE - {tabName}», «Sistema Genera» | exportReport · l.203 |
| `csvEscape()` | «"{safeValue.replace(/"/g, '""…}"» | csvEscape · l.30 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «Período: {metadata.dateRange}» | ReportExporter · l.132 |
| «Generado por: {metadata.generatedBy}» | ReportExporter · l.137 |
| «Total de registros: {metadata.totalRecords}» | ReportExporter · l.142 |
| «Fecha de generación: {new Date().toLocaleDateStri…}» | ReportExporter · l.146 |
| «Reporte exportado como {type.toUpperCase()}» | ReportExporter · l.230 |
| «Error al exportar reporte» | ReportExporter · l.235 |

### lib/pasantias/cohort-public.ts

Used by: `/admin/pasantia-leads`, `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`, `/profile/pasantia`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Unknown program: {id}» | `throw (shown by whoever catches it)` | `!program` | programById · l.344 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `INSPIRA_PROGRAM` | «Pasantía INSPIRA», «INSPIRA», «Equipos que viajan por primera vez», «6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro», «Inspiración y un mapa de lo posible», «Semana 1 — inmersión», «Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.», «Semana 2 — visitas», «Una escuela por día.», «Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).», «Escola Virolai», «Escola Sadako», «Institut Escola El Puig», «Escola La Maquinista», «Escola Octavio Paz», «Institut Angeleta Ferrer», «Institut Escola Les Vinyes», «La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.» | l.231 |
| `MIRADA_PROFUNDA_PROGRAM` | «INSPIRA Mirada Profunda», «Mirada Profunda», «Quienes ya viajaron con INSPIRA», «Son diez días, cinco escuelas y dos días completos en cada una.», «Cómo se hace por dentro, y una hoja de ruta para marzo», «Semana 1», «Cinco jornadas en escuelas.», «Semana 2», «En Mirada Profunda, todos los días del programa.», «Escola Virolai», «Escola Sadako», «Institut Angeleta Ferrer», «Institut Escola El Puig», «Institut Escola Les Vinyes», «El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lu…», «Cada participante define, con el equipo FNE, un desafío real de su colegio.», «El viernes 29 cada participante presenta qué va a mover en marzo y cómo.», «En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.», «acompañamiento para definir tu pregunta antes del viaje», «sesión online de seguimiento en abril» | l.281 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.» | MIRADA_PROFUNDA_PROGRAM · l.318 |

### lib/pasantias/panel/client.ts

Used by: `/admin/pasantias-panel`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `PANEL_CSV_HEADERS` | «Colegio», «Programa», «Nombres», «Apellidos», «RUT», «Pasaporte», «Correo», «Cuenta en GENERA», «Llegada», «Regreso», «Salida de SCL», «Llegada a BCN», «Salida de BCN», «Llegada a SCL», «Foco», «Alimentación», «Pasajes a cargo de», «Estadía a cargo de», «Pasaje», «Alojamiento», «Abono 50%», «Saldo 50%», «Documentos», «Carta de invitación», «Carta enviada», «Notas» | l.127 |
| `dietaryText()` | «Sin indicar» | dietaryText · l.102 |
| `errorText()` | «Tu sesión expiró. Vuelve a iniciar sesión.», «No tienes permiso para esta acción.» | errorText · l.205 |

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «Sin indicar» | dietaryText · l.102 |
| «Otra: {participant.dietaryOther}» | dietaryText · l.104 |
| «Recibido» | panelCsvRows · l.186 |
| «Pendiente» | panelCsvRows · l.186 |
| «Generada» | panelCsvRows · l.189 |
| «Tu sesión expiró. Vuelve a iniciar sesión.» | errorText · l.205 |
| «No tienes permiso para esta acción.» | errorText · l.206 |

### lib/pasantias/panel/dates.ts

Used by: `/profile/pasantia`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `startYear` | «de {start.year}» | letterDateRange · l.25 |
| `letterDateRange()` | «entre el {start.day} y el {end.day} de {end.month} de {end.year}», «entre el {start.day} de {start.month}{startYear} y el {end.day} de {end.month} de {end.year}» | letterDateRange · l.23 |

### lib/pasantias/panel/mine.ts

Used by: `/profile/pasantia`

**Reads and writes the database directly:** `table:pasantias_intake_participants` (select), `table:pasantias_intake_rosters` (select), `table:pasantias_panel_contacts` (select), `table:pasantias_panel_documents` (select), `table:pasantias_panel_logistics` (select), `table:pasantias_panel_roster_details` (select)

### lib/pasantias/panel/types.ts

Used by: `/admin/pasantias-panel`, `/profile/pasantia`

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «el tratamiento (Estimado/Estimada)» | `missing.push` | `!logistics.salutation` | letterMissing · l.234 |
| «el colegio como aparece en la carta» | `missing.push` | `!details.letterSchoolLine` | letterMissing · l.235 |
| «el alojamiento como aparece en la carta» | `missing.push` | `!details.letterLodgingLine` | letterMissing · l.236 |
| «el logo de la carta» | `missing.push` | `!assets.logo` | letterMissing · l.237 |
| «la firma de la carta» | `missing.push` | `!assets.signature` | letterMissing · l.238 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `FLIGHT_LABELS` | «Pendiente», «Comprado», «Pagado» | l.18 |
| `LODGING_LABELS` | «Pendiente», «Reservado», «Pagado» | l.26 |
| `SALUTATION_LABELS` | «Estimado», «Estimada» | l.34 |
| `DOCUMENT_KIND_LABELS` | «Pasaje aéreo», «Carta de invitación», «Otro» | l.49 |
| `LETTER_ASSET_LABELS` | «Logo del Instituto Relacional», «Firma» | l.75 |
| `FLIGHT_DATE_LABELS` | «Salida de SCL», «Llegada a BCN», «Salida de BCN», «Llegada a SCL» | l.84 |
| `LETTER_SEND_ERRORS` | «faltan datos para generar la carta», «falta el correo de la persona», «no se pudo generar la carta», «no se pudo guardar la carta», «el envío de correos no está configurado», «el envío de correos está desactivado para esta cuenta de prueba», «el servicio de correo rechazó el mensaje», «el servicio de correo no respondió» | l.137 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «el envío falló» | letterSendErrorText · l.151 |

### lib/pasantias/participants/client.ts

Used by: `/pasantias/nomina`

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Intake {token}» | intakeRequest · l.65 |

### lib/pasantias/participants/dates.ts

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «addCalendarDays: expected YYYY-MM-DD» | `throw (shown by whoever catches it)` | `!match` | addCalendarDays · l.39 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `arrivalExplanation()` | «un día antes del inicio», «una semana antes del inicio» | arrivalExplanation · l.50 |
| `departureExplanation()` | «el día después del cierre», «una semana después del cierre», «dos semanas después del cierre» | departureExplanation · l.56 |
| `storedDateLabel()` | «Sin indicar» | storedDateLabel · l.106 |

**Other texts written in the code (safety net: not tied to an element by the script)** (9)

| Text | Where |
|---|---|
| «un día antes del inicio» | arrivalExplanation · l.50 |
| «{Math.abs(offset)} días antes del inicio» | arrivalExplanation · l.52 |
| «el día después del cierre» | departureExplanation · l.56 |
| «una semana después del cierre» | departureExplanation · l.57 |
| «dos semanas después del cierre» | departureExplanation · l.58 |
| «{offset} días después del cierre» | departureExplanation · l.59 |
| «Las fechas de llegada y regreso pueden variar por uno o dos días, dependiendo de los pasajes» | programDatesNotice · l.94 |
| «disponibles y sus costos. Esto se conversará con el colegio al momento de tener la» | programDatesNotice · l.95 |
| «Sin indicar» | storedDateLabel · l.106 |

### lib/pasantias/participants/notice.ts

Used by: `/pasantias/nomina`

**Other texts written in the code (safety net: not tied to an element by the script)** (7)

| Text | Where |
|---|---|
| «FNE utilizará estos datos para organizar la pasantía: inscripción, pasajes, alojamiento y» | INTAKE_PURPOSE_TEXT · l.25 |
| «alimentación. El correo de cada persona se usará para enviarle su carta de invitación.» | INTAKE_PURPOSE_TEXT · l.26 |
| «El equipo FNE y quien tenga este enlace privado podrán consultar la nómina; cada persona» | INTAKE_PURPOSE_TEXT · l.27 |
| «podrá ver los datos de su propio viaje si tiene una cuenta en GENERA con ese correo.» | INTAKE_PURPOSE_TEXT · l.28 |
| «Comparte el enlace solo con las personas encargadas.» | INTAKE_PURPOSE_TEXT · l.29 |
| «Confirmo que las personas de esta nómina saben que entrego sus datos a FNE para organizar la» | INTAKE_ACKNOWLEDGEMENT_TEXT · l.32 |
| «pasantía, y que la información que ingreso es correcta.» | INTAKE_ACKNOWLEDGEMENT_TEXT · l.33 |

### lib/pasantias/participants/types.ts

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `FUNDING_LABELS` | «Costo SEP», «Costo Colegio» | l.24 |
| `FOCUS_LABELS` | «Infantil», «Primer Ciclo», «Segundo Ciclo», «Tercer Ciclo», «Todos» | l.42 |
| `DIETARY_LABELS` | «Vegetariano», «Vegano», «Sin Gluten», «Sin Lactosa», «Otra restricción» | l.67 |
| `rosterDisplayStatus()` | «reopened / open» | rosterDisplayStatus · l.89 |

### lib/pasantias/participants/validation.ts

Used by: `/admin/pasantia-participants`, `/admin/pasantias-panel`, `/pasantias/nomina`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `MESSAGES` | «La solicitud contiene campos no permitidos.», «La solicitud no es válida.», «Ingresa los nombres.», «Ingresa los apellidos.», «Usa solo letras, espacios, apóstrofos, puntos o guiones (máximo 80 caracteres).», «Ingresa el RUT.», «RUT no válido. Revisa los números y el dígito verificador (ej.: 12.345.678-5).», «Este RUT ya está en la nómina.», «El pasaporte debe tener entre 5 y 20 letras o números, sin símbolos.», «Elige quién cubre el costo de los pasajes.», «Elige quién cubre el costo de la estadía.», «Elige una de las fechas de llegada propuestas o «Sin indicar».», «Elige una de las fechas de regreso propuestas o «Sin indicar».», «La fecha de regreso debe ser posterior a la de llegada.», «Elige un foco de la lista o «Sin indicar».», «Opción de alimentación no válida.», «Describe la restricción «Otra» (máximo 200 caracteres).», «Marca «Otra» para agregar un detalle, o borra el detalle.», «El detalle no puede tener saltos de línea, tabulaciones ni caracteres de control.», «Ingresa el correo electrónico de la persona.», «Correo no válido. Revisa que esté completo (ej.: nombre@colegio.cl).», «El pasaje de esta persona ya fue comprado: las fechas no se pueden cambiar aquí. Escribe a la Fundación si necesitas modificarlas.», «Ya hay pasajes comprados para esta nómina: quién cubre la estadía no se puede cambiar aquí. Escribe a la Fundación si necesitas modificarlo.», «Debes confirmar la declaración antes de guardar.», «Solicitud inválida. Recarga la página e inténtalo de nuevo.», «Ingresa el nombre del colegio (entre 2 y 160 caracteres).», «Elige un programa.», «Elige una vigencia de 30, 60, 90 o 120 días.», «Acción no válida.» | l.57 |

### types/roles.ts

Used by: `/admin/pasantia-leads`, `/admin/pasantia-participants`, `/admin/pasantias-panel`

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

Used by: `/admin/pasantia-leads`, `/admin/pasantia-participants`, `/admin/pasantias-panel`

**Reads and writes the database directly:** `table:user_roles` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/admin/pasantia-leads` | `pages/api/admin/pasantia-leads/index.ts` | GET, PATCH | `/admin/pasantia-leads` | `__tests__/api/admin/pasantia-leads.test.ts`, `__tests__/pages/admin/pasantia-leads.test.tsx`, `pages/admin/pasantia-leads.tsx`, `supabase/migrations/20261021180000_pasantias_admin_leads_export.sql`, `tests/e2e/ci-fixture.spec.ts` +1 |
| `/api/admin/pasantia-participants/[rosterId]` | `pages/api/admin/pasantia-participants/[rosterId].ts` | GET | **no screen** | `__tests__/api/admin/pasantia-participants.test.ts`, `__tests__/pages/admin/pasantia-participants.test.tsx` |
| `/api/admin/pasantia-participants` | `pages/api/admin/pasantia-participants/index.ts` | GET | `/admin/pasantia-participants` | `__tests__/api/admin/pasantia-participants.test.ts`, `__tests__/lib/pasantias/participants/school-funding.test.ts`, `pages/admin/pasantia-participants.tsx`, `tests/e2e/pasantias-panel.spec.ts`, `tests/e2e/pasantias-participant-intake.spec.ts` |
| `/api/admin/pasantias-panel/bulk` | `pages/api/admin/pasantias-panel/bulk.ts` |  | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/documents/[docId]` | `pages/api/admin/pasantias-panel/documents/[docId].ts` | GET | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel` | `pages/api/admin/pasantias-panel/index.ts` |  | `/admin/pasantias-panel` | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx`, `lib/pasantias/panel/client.ts`, `supabase/migrations/20261109210000_pasantias_logistics_panel.sql`, `tests/e2e/pasantias-panel.spec.ts` |
| `/api/admin/pasantias-panel/letter-assets` | `pages/api/admin/pasantias-panel/letter-assets.ts` | POST | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]` | `pages/api/admin/pasantias-panel/participants/[id].ts` | GET, PATCH | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/participants/[id]/documents` | `pages/api/admin/pasantias-panel/participants/[id]/documents.ts` |  | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]/letter` | `pages/api/admin/pasantias-panel/participants/[id]/letter.ts` |  | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/admin/pasantias-panel/participants/[id]/send-letter` | `pages/api/admin/pasantias-panel/participants/[id]/send-letter.ts` |  | **no screen** | `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx` |
| `/api/admin/pasantias-panel/rosters/[rosterId]` | `pages/api/admin/pasantias-panel/rosters/[rosterId].ts` |  | **no screen** | `__tests__/api/admin/pasantias-panel.test.ts` |
| `/api/pasantias/brochure` | `pages/api/pasantias/brochure.ts` |  | `/pasantias` | `__tests__/api/pasantias-lead.test.ts`, `__tests__/api/pasantias-pdf.test.ts`, `__tests__/components/PasantiasLeadForm.test.tsx`, `__tests__/lib/pasantias-emails.test.ts`, `components/pasantias/LeadForm.tsx` +3 |
| `/api/pasantias/ficha` | `pages/api/pasantias/ficha.ts` |  | `/pasantias` | `__tests__/api/pasantias-lead.test.ts`, `__tests__/api/pasantias-pdf.test.ts`, `__tests__/components/PasantiasLeadForm.test.tsx`, `__tests__/lib/pasantias-emails.test.ts`, `__tests__/pages/pasantias.test.tsx` +6 |
| `/api/pasantias/lead` | `pages/api/pasantias/lead.ts` | POST | `/pasantias` | `__tests__/api/pasantias-lead.test.ts`, `__tests__/components/PasantiasLeadForm.test.tsx`, `components/pasantias/LeadForm.tsx`, `tests/e2e/pasantias-flow.spec.ts`, `tests/e2e/pasantias-form.spec.ts` |
| `/api/pasantias/mine/documents/[docId]` | `pages/api/pasantias/mine/documents/[docId].ts` | GET | `/profile/pasantia` | `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/pages/profile-pasantia.test.tsx`, `pages/profile/pasantia.tsx`, `tests/e2e/pasantias-panel.spec.ts` |
| `/api/pasantias/mine` | `pages/api/pasantias/mine/index.ts` | GET | **no screen** | `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/components/layout/Sidebar.miPasantia.nuevo.test.tsx`, `__tests__/components/layout/Sidebar.miPasantia.test.tsx`, `components/layout/Sidebar.tsx`, `tests/e2e/auth-lifecycle.spec.ts` +2 |
| `/api/pasantias/participants/[id]` | `pages/api/pasantias/participants/[id].ts` |  | **no screen** | `__tests__/api/pasantias-participants.test.ts`, `__tests__/lib/pasantias/participants/school-funding.test.ts`, `__tests__/pages/pasantias-nomina.test.tsx` |
| `/api/pasantias/participants/finalize` | `pages/api/pasantias/participants/finalize.ts` |  | **no screen** | `__tests__/api/pasantias-participants.test.ts` |
| `/api/pasantias/participants` | `pages/api/pasantias/participants/index.ts` | GET | `/pasantias/nomina` | `__tests__/api/pasantias-participants.test.ts`, `__tests__/lib/pasantias/participants/school-funding.test.ts`, `__tests__/pages/pasantias-nomina.test.tsx`, `pages/pasantias/nomina.tsx`, `tests/e2e/pasantias-panel.spec.ts` +1 |
| `/api/pasantias/participants/school` | `pages/api/pasantias/participants/school.ts` |  | **no screen** | `__tests__/api/pasantias-participants.test.ts`, `__tests__/pages/pasantias-nomina.test.tsx` |

