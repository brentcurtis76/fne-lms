# RD-SC — platform redesign, phase 6, sessions, step C: the new look of the eight other session screens, behind the design switch. Review request

- **Branch:** `rel/rd-ses-rest` · **Base:** main at `5542c952b` (after pull request 213, 25 Nov 2026) · **Commits:** one product and test commit, `0fbe5927c`, then this record
- **Part of the platform redesign** (plan phase 6, "area by area"; second area: sessions). The fourth and last of the area's releases, behind the design switch.
- **Built the new way:** builder agents from written briefs and a scenario file accepted before they started, five independent code reads, an independent tester on running copies (Astra), a measured check of the switched-off copies, a look in a browser by sight, the lead's own runs of every check; the lead session wrote no product code.

## Objective and scope

**Eight screens get their new look, shown only to an account that is marked «Tester QA» and has chosen «Diseño nuevo» in «Apariencia»:** the admin's sessions list (`/admin/sessions`), the admin's page of one session (`/admin/sessions/[id]`), the approvals of change requests (`/admin/sessions/approvals`), «Clasificar Sesiones» (`/admin/bulk-tag-sessions`), «Consultorías» (`/admin/consultant-assignments`), the reports (`/consultor/sessions/reports`), and the two meeting pages (`/meet/diag` and `/meet/session/[id]`). Every other account, including a «Tester QA» account that keeps today's design, gets exactly today's screens.

**There was no mock-up for any of the eight, and the owner approved no change of behaviour for them.** The new look keeps today's content, order and Spanish words, drawn with the kit's pieces, the new frame and the new values; every difference is a decision of the lead, listed below.

**No database change, no migration, no change to a data call, a role check or a redirect.** The commit touches no file under `pages/api`, `supabase/` or `database/`, and not `middleware.ts`. Today's markup stays in each page; the new look is a new component drawn when the look is 'nuevo', fed with the page's own state and handlers. Three handlers were split in two so that the new look can ask its own question before the same calls: approving and starting a session in `pages/admin/sessions/[id].tsx` (`handleApproveConfirmed`, `handleStartSessionConfirmed`), and deleting an assignment in `pages/admin/consultant-assignments.tsx` (`handleDeleteAssignmentConfirmed`). Today's look keeps the browser's question and then calls the same confirmed part. The shared pieces (the hours panel, the start control, the assignment pop-up, the export menu, the help button, the meeting button) are not changed.

### The new look, screen by screen

1. **The sessions list** (`components/sessions/admin-nuevo/AdminSessionsListNuevo.tsx`): breadcrumbs «Consultorías › Sesiones», a page header «Sesiones de Consultoría»; the numbers, views, filters and «Exportar Calendario» as today; in «Lista» the kit's table, as cards on a phone; «Cancelar» in a row's menu opens the kit's pop-up «Cancelar Sesión» with today's texts. The filters stay in the address bar exactly as today.
2. **One session's page** (`AdminSessionDetailNuevo.tsx`): breadcrumbs «Sesiones › Detalle de Sesión» («Sesiones» leads to the list), a page header with the session's title; the content in today's order; the questions «¿Está seguro que desea aprobar esta sesión?» and «¿Está seguro que desea iniciar esta sesión?» in the kit's question window; the two cancel pop-ups in the kit's pop-up with today's texts. A question belongs to its session: if the address moves to another session, it closes and sends nothing.
3. **Approvals** (`ApprovalsNuevo.tsx`): breadcrumbs «Consultorías › Aprobaciones»; today's plain heading becomes a page header «Aprobaciones de Sesiones»; the four filters «Pendientes», «Aprobadas», «Rechazadas», «Todas» become the kit's tabs; each request is a kit card.
4. **«Clasificar Sesiones»** (`BulkTagNuevo.tsx`): breadcrumbs «Consultorías › Clasificar Sesiones», a page header; the information banner becomes a kit notice; the filters, table and selection bar as today.
5. **«Consultorías»** (`components/sessions/assignments-nuevo/AssignmentsNuevo.tsx`): breadcrumbs «Consultorías › Asignación de Consultores»; a page header with the search «Buscar por nombre o email...» and the main action «Nueva Asignación»; the kit's table (cards on a phone); «Eliminar» asks «¿Está seguro de que desea eliminar esta asignación?» in the kit's question window, its «Confirmar» in the danger tone. The assignment pop-up is today's, unchanged.
6. **«Reportes de Sesiones»** (`components/sessions/reports-nuevo/ReportsNuevo.tsx`): breadcrumbs by the menu each role sees, «Consultorías › Reportes» for the admin and «Mi Trabajo › Mis Reportes» for the consultant; a page header with the «?» help button; the content as today; the charts in the new look's series colours.
7. **The two meeting pages** (`components/meet/meetLookNuevo.ts`): no frame and no breadcrumbs, as today. Same structure: each element keeps its place and attributes, and only its classes are chosen by the look. On the server and at the first paint the look is always today's.

## Decisions taken by the lead (not by Brent)

Not shown in a mock-up; taken by the lead while building. The owner may undo any of them.

- **(a) The rule for the new look without a mock-up.** The kit's pieces, the new frame with breadcrumbs from the menu's group and item, today's content, order and words; the three hand-made cancel pop-ups become the kit's pop-up with the same texts, closed by Escape, focus held inside and returned to the opener.
- **(b) The questions.** The two browser questions of one session and «Eliminar» on «Consultorías» use the kit's question window, in the new look only; today's look keeps the browser's question.
- **(c) Labels.** New screen-reader labels (for example «Acciones de {título}» on a row's menu), in the new look only.
- **(d) Chart colours.** The charts of «Reportes de Sesiones» use the brand kit's values: black, intense yellow, mid grey.
- **(e) Control heights.** The kit's controls stay 40 px high on a phone; the hours panel's buttons, the X of the kit's pop-up and the buttons of the kit's question window are under 44 px.
- **(f) Approvals for the admin only.** The new body of approvals shows only to an administrator, on the same condition as the page's data read; anyone else on the new look sees exactly today's screen while today's redirect takes them away.
- **(g) Which view the two admin pages draw, and the piece that must not mount twice.** Both admin pages follow the look with RD-SB's `useViewLatch`: the four-second follow applies to these two pages too, with the same accepted reload flash, and, as in RD-SB, a profile that arrives more than four seconds late leaves today's view until a reload. The piece that must not mount twice (the hours comparison panel on the page of one session; the list view that reads the hours ledger on the list) is rendered ONCE, through a portal, into one kept DOM node that each view takes into its own `display: contents` place (`components/sessions/admin-nuevo/keptNode.tsx`). A change of view neither remounts the panel nor repeats its read; what was typed in it stays, and its focus and caret are put back. With the switch off the DOM gains only those unclassed wrappers, each standing exactly where the piece stood on main.

## Files, grouped by risk

**Higher — the pages that choose the view, the split handlers, the kept node**
- `pages/admin/sessions/index.tsx`, `pages/admin/sessions/[id].tsx`: the latch, the portal and the kept node's place in today's view; the session page's two split handlers.
- `components/sessions/admin-nuevo/keptNode.tsx`: the one kept DOM node, its lending to each view's place, and the focus guard (decision g).
- `pages/admin/sessions/approvals.tsx`, `pages/admin/bulk-tag-sessions.tsx`, `pages/admin/consultant-assignments.tsx` (with its split handler), `pages/consultor/sessions/reports.tsx`: the live look picks the view; today's branch is as before.
- `pages/meet/diag.tsx`, `pages/meet/session/[id].tsx`: class strings chosen by the look on the same elements; server code, access checks, camera, copy button, titles and `data-testid` not moved.

**Lower**
- The new views: `components/sessions/admin-nuevo/AdminSessionsListNuevo.tsx`, `AdminSessionDetailNuevo.tsx`, `ApprovalsNuevo.tsx`, `BulkTagNuevo.tsx`, `adminNuevoStyles.ts`; `components/sessions/assignments-nuevo/AssignmentsNuevo.tsx`; `components/sessions/reports-nuevo/ReportsNuevo.tsx`; `components/meet/meetLookNuevo.ts`.
- The tests and their helpers (`__tests__/helpers/adminSessionsFakes.tsx`, `__tests__/helpers/scTwoFakes.tsx`); this record.

## Tests

- **Today's screens held:** for each framed screen a `sameRequests` test shows that both looks make the same requests in the same order (`adminList`, `adminDetail`, `approvals`, `bulkTag`, `consultantAssignments`, `reports`); `consultantAssignments.clasico` and `reports.clasico` show today's texts and today's browser question.
- **The new views:** a `views` or `nuevo` test per screen walks the texts, states, roles and pop-ups (opening, Escape, «Cancelar», nothing sent).
- **The view rules:** `adminDetail.latch`: a late new look is followed, today's look wins at once, with no look today's view stays, and across a change of view either way the hours panel is mounted once and keeps what was typed in it; `adminList.ledgerRead`: a change of look alone does not repeat the read of the hours ledger; `keptNode.focus`: focus, selection and scroll inside the kept node survive a move, and a focus elsewhere is not touched; `adminDetail.question`: a question never acts on another session; `approvals.adminOnly`: only the admin gets the new body.

## Evidence (measured by the lead on `0fbe5927c`, 25 Nov 2026)

- **Gates:** type-check, 0 errors; lint, 0. The whole unit suite: 832 files, 22,605 tests passed. The build passes.
- **Pictures, switch OFF:** **IDENTICAL** to main: 3,060 of 3,060 the same for ordinary accounts; 220 of 220 for accounts marked «Tester QA» that keep today's design.
- **Pictures, switch ON:** 38 pictures differ from main, all of them of the eight screens, as intended. Two picture runs of the release with the switch on are identical to each other (220 of 220).
- **The mandatory browser list:** 353 passed.
- **The code read:** five reads by an independent code reader; the last found nothing that must be fixed (minor points under Known limitations).
- **Astra, with the switch on:** her walk of the scenario file passed 55 points; 3 failed and 1 could not be tested. The three: at 1,366 px in the new look two texts are cut (the filters of the admin's list cut «Todos los colegios» and «Todos los estados»; the search field of «Consultorías» cuts its placeholder), both on the leftovers list; and the six charts of «Reportes de Sesiones» stayed blank on both copies alike with the invented local data, not this release's doing.
- **The switch off, measured:** Astra's blind comparison of the two running copies was followed by a measured check, with loads interleaved within each copy and between them. Every reported difference showed equally between two loads of the same copy, except one: on the admin's sessions list at desktop width, the release repeats the read of the hours ledger less often while the page loads (once or twice per load; main one to four times). It makes no request main does not make, the requests and bodies are the same, the phone width and the page of one session show no difference, and once loaded nothing differs. It follows from decision (g): the list's rows are mounted once. **The owner accepted this difference on 25 Nov 2026** ("release all"). In rare loads a capture 300 ms after a reload showed a partly drawn page in both copies (5 of 80 on the release, 2 of 80 on main), all the same within one second; too few to tell apart.
- **Where:** the code reads and Astra's walk and comparison were made on `e57eb8551`, the same change on main as it was on 24 Nov, before it was moved unchanged onto today's main.
- **By sight:** a look in a browser by sight (a headless browser at 1,366, 390 and 320 px, every role): nothing of today's screens is lost on the eight screens; all 38 changed pictures are the intended new look; text, focus and caret are kept when the look changes while typing in the hours panel (15 of 15 tries); no sideways scroll at 320 px; one layout fault, the four filters of the admin's list cut their text at 1,366 px (Known limitations).

## What a person sees after the release

**Nothing changes for anyone on today's design.** Only an account marked «Tester QA» that chose «Diseño nuevo» in «Apariencia» sees the new look on the eight screens. A difference in behaviour, in the new look only: the browser's own question boxes become the platform's question window. On the admin's list and on the admin's page of one session, the new look may appear a moment after today's on a reload (the accepted reload flash).

## Where to look hardest

1. **That today's branch is untouched:** in each page, today's look draws today's markup, frame and browser questions; the three split handlers run the same calls in the same order.
2. **`keptNode.tsx`:** each place holds nothing but the kept node; it moves without a remount; the focus guard restores only a focus that was inside it; with the switch off the only DOM difference is the unclassed wrapper.
3. **The questions of one session:** never confirmed for another session after the address changes.
4. **Approvals:** the new body is gated on the data read's admin condition.
5. **The meeting pages:** server render and first paint are today's; only class strings change.

## Known limitations

- Controls under 44 px on a phone, as described in decision (e).
- The code reader's minor points, on the area's leftovers list: the question test of the admin's session page confirms approval only; the approvals test does not prove the loading frame; the focus guard checks the current focus only; the committed list tests omit «Semana».
- Texts cut at 1,366 px in the new look: all four filters of the admin's list cut their text («Todos los colegios», «Todas las comunidades», «Todos los consultores», «Todos los estados») and their chevrons sit low; the search field of «Consultorías» cuts its placeholder. Only an account on the new design sees it; on the area's leftovers list.
- With the switch off, on the admin's sessions list at desktop width, the hours ledger is read less often while the page loads than on main (once or twice per load instead of one to four times); nothing else differs. Accepted by the owner on 25 Nov 2026; it follows from decision (g).
- The two admin pages share the latch's cost described in RD-SB: the reload flash, and a profile more than four seconds late leaves today's look until a reload.
