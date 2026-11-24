# RD-SB — platform redesign, phase 6, sessions, step B: the new view of the three session screens, behind the design switch. Review request

- **Branch:** `rel/rd-ses-views` · **Base:** main at `4d7ebc5d6` (after pull request 209, 22 Nov 2026) · **Commits:** one product and test commit, `99dede9c1`, then this record
- **Part of the platform redesign** (plan phase 6, "area by area"; second area: sessions). The third of the area's releases, and the first that draws the area's new screens; like the panel before it, it is behind the design switch.
- **Built the new way:** a builder agent from a written brief and a scenario file written before it started, an independent code read, an independent tester walking the scenarios on running copies (Astra), a look in a real browser, a second look at the layout corrections that followed, the lead's own runs of every check; the lead session wrote no product code.

## Objective and scope

**Three screens get their new view, shown only to an account that is marked «Tester QA» and has chosen «Diseño nuevo» in «Apariencia»:** the sessions list (`/consultor/sessions`), one session's page (`/consultor/sessions/[id]`), and the form «Programar Sesión» (`/admin/sessions/create`). Every other account, including a «Tester QA» account that keeps today's design, gets exactly today's screens. The new views are the ones the owner approved with the mock-ups on 13 Nov 2026; the differences he approved are listed below in full.

**No database change, no migration, no change to a data call, a role check or a redirect.** The commit touches no file under `pages/api`, `supabase/` or `database/`, and not `middleware.ts`. Each page still runs its own hook, with the same requests in the same order; who reaches each page, and where a refused visitor is sent, are today's. Two handlers were split in two so that the new view can ask its own question before the same calls: «Programar» in `hooks/useSessionCreate.ts` (the checks and the question, then the confirmed part), and the deletion of a material in `hooks/useSessionDetail.ts` (the question, then the deletion). Today's view calls them as before and passes nothing new.

### Approved changes: the form «Programar Sesión» (18 points)

1. New shape: six numbered cards. New section titles «Colegio y consultores», «Datos de la sesión», «Fecha y hora», «Horas y contrato» («Tipo de sesión» with the series box and «Modalidad» are today's).
2. A new «Resumen» card holds the buttons, in view on the right from 1024 px and last on a phone. New texts: «Resumen», «Colegio», «Comunidad», «Consultores», «Fecha» / «Fechas», «Sesiones», «Horario», «Modalidad», «Horas», «· principal», «· Zoom», «{k} en fin de semana», «Sin seguimiento de horas».
3. Checks: all 12 show next to their field and together in a red box at the top, with links to each field; none is a toast, and every failed check shows at once. New text: «Revise lo siguiente antes de continuar:».
4. Type and contract: choosing only one is still refused with today's message, now also shown under the two selects, and section 6 states the rule up front. New text: «Elija ambos para registrar las horas, o deje los dos vacíos.»
5. The question before scheduling is a pop-up: its title is today's question, its body «Se notificará a los participantes.» plus a short summary; its main button carries the same label as the page's.
6. The page is a real form: Enter opens the confirmation.
7. Changing the school also clears the community. (Already for everyone since RD-SX; the new view keeps it.)
8. The earliest allowed date is today in Chile. (Already for everyone since RD-SX; the new view keeps it.)
9. «Consultor principal» is a radio: exactly one consultant can be lead, and it cannot be unticked. Removing the lead leaves none. (Held by tests since RD-SX; the new view keeps it.)
10. The «Externo» / «Interno» choice is a labelled two-option switch. New screen-reader labels: «Tipo de consultor de {nombre}», and «Fecha {n}» for custom date rows.
11. The modality label reads «Híbrida».
12. Hour numbers use a decimal comma (42,5).
13. The hours chip and the series box are the shared notice pieces (the series box grey with a black left border).
14. New breadcrumbs «Sesiones › Programar Sesión».
15. A new small «Cancelar» under the two save buttons.
16. Loading and access denied are shown inside the frame (skeleton cards; «Acceso Denegado» in an empty-state card).
17. The summary shows the hours of one session and the series total, with a warning when the total exceeds the hours available. New texts: «{h} h por sesión · {total} h en total», «Más de lo disponible en este tipo ({n} h)».
18. If creating works but approving fails, a notice says the drafts already exist. New texts: «Las sesiones quedaron guardadas como borrador. Revise la lista de sesiones antes de volver a programar, para no crearlas dos veces.» / «La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.»

### Approved changes: one session's page (12 points)

1. «Finalizar Sesión» is the one yellow button, inside a visible checklist card; the missing conditions are always shown as text. The card and its disabled button also appear while the session is «En Progreso». New texts: «Para finalizar la sesión», «Condiciones faltantes: {n}», met-condition lines «Sesión en estado "Pendiente de Informe"», «Informe de sesión creado», «Asistencia marcada para todos».
2. The reason «Solicitar Cambios» is disabled while a request is pending («Ya existe una solicitud de cambio pendiente para esta sesión.») is visible text under the button.
3. The edit-request history is in the «Actividad» tab. New text: the heading «Actividad» over the activity list when the history is shown above it.
4. New breadcrumbs «Mi Trabajo › Mis Sesiones › {title}» lead back to the list.
5. The header's Spain time is the modal's shorter line, for example «En España: 13:30 a 15:00 (hora España)».
6. Arrival status in read mode is in Spanish: «A tiempo», «Tarde», «Salió temprano».
7. The modality reads «Híbrida».
8. Edit-request history values are formatted: dates «13 noviembre 2026», times HH:MM, modality words.
9. Activity actions read in Spanish. New texts: «Sesión creada», «Sesión vista», «Sesión editada», «Cambio de estado», «Material subido», «Material eliminado», «Informe registrado», «Informe actualizado», «Asistencia registrada», «Asistencia actualizada», «Comunicación agregada», «Cambio solicitado», «Cambio aprobado», «Cambio rechazado», «Aprobación de cambio bloqueada», «Facilitadores actualizados», «Sesión cancelada», «Sesión finalizada».
10. «Guardar asistencia», «Subir material», «Crear» / «Actualizar» are black; «Finalizar» in its pop-up is yellow. Status colours follow the palette: no green, orange or blue buttons.
11. The materials table stacks on phones, and the icon buttons carry labels. New aria-labels / titles: «Abrir {archivo}», «Eliminar {archivo}», «Asistió: {nombre}», «Estado de llegada: {nombre}», «Notas: {nombre}», screen-reader «Sí» / «No».
12. The question before deleting a material, «¿Está seguro que desea eliminar "{file_name}"?», is a pop-up with that text as its title and a new button «Eliminar». The Finalize pop-up closes with Escape and has a close X.

### Approved changes: the sessions list (6 points)

1. Two tabs «Mis Sesiones» / «Otras Sesiones en Mis Colegios», each with its count; each list has the full width.
2. Sessions are agenda rows (a date block with weekday, day, month and start time), and each row is a link that opens by keyboard. New text: «Hoy» in the date block of today's rows.
3. Grouping is «Esta semana» (ascending), «Próximas» (ascending), «Pasadas» (newest first). New texts: «Esta semana», «Próximas», «Pasadas».
4. «Otras Sesiones…» rows are drawn at full strength, like «Mis Sesiones».
5. «Pendiente Informe» and «En Progreso» rows in «Mis Sesiones» say what the session needs, in today's status helper words.
6. «Exportar Calendario» is a secondary button in the page header; «Cargar más» is an outline button (yellow is kept for one main action, and the list has none).

## Decisions taken by the lead (not by Brent)

These were not shown in the mock-ups; the lead took them while building. They are the lead's, and the owner may undo any of them.

- **(a) The list's opening tab.** The list opens on «Otras Sesiones en Mis Colegios» when «Mis Sesiones» is empty and the other is not; otherwise on «Mis Sesiones».
- **(b) Narrow screens.** Below 640 px the list's two tabs stack.
- **(c) Another year.** A list row of a session in another year shows the year.
- **(d) Which view the session page draws** (`components/sessions/detail-nuevo/useViewLatch.ts`). Nobody waits for the account's look: while it is unknown it counts as today's. A look that turns new within 4,000 ms of the session body's first drawn render is followed, once; after that the view holds. Today's look still wins at once, and one way. **Its cost, in plain words:** on a reload a tester may see today's view of a session for a moment before the new one; in those first seconds the Zoom suggestions box may load twice, and a recording begun in them would start again; a profile that arrives more than four seconds late leaves today's view until a reload.
- **(e) When a shown error goes** (a refinement of approved point 3 of the form, not shown in the mock-up). A field's error goes, next to the field and in the red box, as soon as that field is changed; a change of either time clears both time errors. Nothing is checked while typing: errors appear only at a press. The two errors about consultants sit by the consultants' field while it is drawn (a school is chosen), otherwise by «Colegio».
- **(f) Layout corrections after the looks in a browser.** The session page's header and cards keep their words inside at 320 px (long words may break); on a phone the tab that gets the focus or is chosen is brought into view inside its row (`components/sessions/detail-nuevo/revealTab.ts`; the page itself is never scrolled). In the form, the fields of one row share their lines (`components/sessions/create-nuevo/fieldRow.ts`, a CSS subgrid: Chrome 117, Firefox 71, Safari 16 and later; an older browser draws each field under its label, as before); the date and time fields wrap instead of narrowing; the «Resumen» column is 344 px wide and from 1024 px only its list scrolls, so that its buttons stay clear of the frame's floating help note.
- **(g) One point of the code reviewer left open on purpose.** A render that React discards could in theory alter the held view. The session page has no transition, Suspense or lazy part, so it cannot happen there today. It is on the area's leftovers list.

## Files, grouped by risk

**Higher — the pages that choose the view, and the two split handlers**
- `pages/consultor/sessions/index.tsx`, `pages/consultor/sessions/[id].tsx`, `pages/admin/sessions/create.tsx`: the live look picks today's view or the new one; today's branch draws what it drew before.
- `components/sessions/detail-nuevo/useViewLatch.ts`: the session page's held view (decision d).
- `hooks/useSessionCreate.ts`, `hooks/useSessionDetail.ts`: each a pure split of one handler; the same calls in the same order.

**Lower**
- The new views: `components/sessions/SessionsListNuevo.tsx`, `SessionDetailNuevo.tsx`, `SessionCreateNuevo.tsx`, and their parts under `components/sessions/detail-nuevo/` and `components/sessions/create-nuevo/`; the texts in `components/sessions/sessionTextNuevo.ts`, the checks in `components/sessions/sessionCreateChecks.ts`.
- The tests and their helpers; `tests/e2e/look-sessions.spec.ts`, added to the mandatory browser list in `scripts/ci/e2e-mandatory.mjs`; this record.

## Tests

- **Today's screens held:** `list.sameList`, `detail.sameSession` and `create.sameForm` show that an account on today's design gets today's screen and today's calls.
- **The new views:** `list.nuevo`, `detail.nuevo`, `create.nuevo` and `create.checks` walk the approved changes; `detail.latch` holds the session page's view rules; `revealTab` the tab row's sideways move; `sessionTextNuevo` the new texts.
- **In a browser** (`tests/e2e/look-sessions.spec.ts`, mandatory): switched off, a tester who has not chosen the new design and a non-tester get today's screens; switched on, the list's tabs count the data and a row opens by Enter; the session page opened from the new list is drawn once, with one request each; the form lists every failed check, Enter opens the confirmation, a school change empties what depends on it, a faked refusal of a half-chosen hours pair shows under the two selects, a faked failed approval shows the drafts notice and a real one lands where today's does; no sideways scroll at 320 px.

## Evidence (measured by the lead on `99dede9c1`, 22 Nov 2026)

- **Gates:** type-check, 0 errors; lint, 0. The whole unit suite: 790 files, 22,023 tests passed. The build passes.
- **Pictures, switch OFF:** **IDENTICAL** to main: 3,060 of 3,060 the same for ordinary accounts; 220 of 220 for accounts marked «Tester QA» that keep today's design.
- **Pictures, switch ON:** 12 pictures differ from main, all of them of the three screens, as intended.
- **The mandatory browser list:** 353 passed.
- **Astra and the browser by sight** (on the build before the layout corrections of decisions (e) and (f)): Astra's blind comparison of the two running copies with the switch off found no real difference; her walk of the scenario file with the switch on passed 46 points, the session page drew the new view in 40 of 40 reloads, and she reported three layout faults. A look in a real browser confirmed nothing of today's screens lost, the new view in 20 of 20 reloads (today's view was seen for a moment once: the cost in decision (d)), the three faults, and five more on the form.
- **The corrections by sight** (on `04a4a8d6a`, the same change on main as it was on 20 Nov, before it was moved unchanged onto today's main; a headless browser at 320, 390, 768, 1024, 1321 and 1366 px): all eight spots judged corrected, with pictures.

## What a person sees after the release

**Nothing changes for anyone on today's design.** Only an account marked «Tester QA» that chose «Diseño nuevo» in «Apariencia» sees the three new screens: the sessions list, one session's page, and the form «Programar Sesión».

## Where to look hardest

1. **That today's branch is untouched:** in each of the three pages, an account on today's look draws today's view with today's frame, and the two split handlers run the same calls in the same order.
2. **`useViewLatch`:** today's look wins at once and one way; a late new look is followed only once and only within the four seconds; the latch belongs to the loaded session, not the address.
3. **The form's confirmed part:** the new pop-up's yes runs exactly what today's yes ran; the drafts notice appears only when the create request succeeded and the approval failed.

## Known limitations

- The session page's held view has the cost described in decision (d), and the open point (g) is on the area's leftovers list.
