# GENERA fixes, release of 24 Nov: Soporte's reply reaches the reporter through the bell, and a new proposal version retires the older versions' links

Branch: `fix/join9`. Base: `0bf8241b3` (main, 24 Nov 2026, pull request 210: the sessions area's release).
A straight line of commits on main, no merge commits: 5 commits of two phases (F27: 2 commits; F24: 3 commits), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data). This release holds two small parts of level 3, both with the owner's product answers of 20 Nov 2026:

- Soporte (F27, GES-2.18): a reply to a reported problem reaches the reporter by "The bell only".
- Licitaciones (F24, LIC-E2 and LIC-E6): "Yes to both": older proposal links stop working when a new version is generated, and the «Plataforma de Crecimiento» tick is hidden until it is built.

The rest of F24 and F27 is not in this release.

## What changes

**Soporte (admins answering a reported problem; the person who reported it)**
- When an admin answers a ticket with «Responder al usuario», the person who reported it gets one notification in the bell: «Tu reporte tiene una respuesta de Soporte». It opens «Mis reportes». No e-mail is sent or queued for it, whatever the person's e-mail preferences are.
- A «Nota interna» notifies nobody. An admin answering their own ticket gets no bell.
- The bell's texts and its address are fixed in code: a stored notification template cannot replace them.
- «Configuración» → «Notificaciones» (the e-mail preferences) shows no new section for this notification, because it never goes by e-mail.

**Licitaciones, the proposal panel (admins)**
- Generating a new version of a proposal retires the links of that tender's older versions: they answer "expired" from then on (the public page, the access-code check, the documents and the ZIP). Only older versions are retired, never a newer one. The PDF of every version stays downloadable from the panel's history.
- Before generating, when the tender already holds a live version, the panel says above «Generar Propuesta Final»: «Al generar una nueva versión, los enlaces de las versiones anteriores dejarán de funcionar.» After generating, the older versions read «Expirada» in the history.
- If the retirement fails, the new version is still published (it already is at that point) and the panel says: «No se pudieron retirar los enlaces anteriores: retírelos con «Retirar enlace».»
- The section «Plataforma de Crecimiento» with the tick «Incluir acceso a Plataforma de Crecimiento» is no longer shown: nothing of it was ever sent. The hours line «Plataforma de Crecimiento» in «Distribución de Actividades» is a different thing and stays.
- Older versions that are live in Production today are not touched by this release: they are retired at their tender's next generation, or by hand with «Retirar enlace» as today.

## Database

No migration, no change of any rule, table, function or store. `.pm-publish/solo-preflight.json` declares no checks and no row-deleting function.

Recovery: reverting the five commits restores the earlier behaviour; links retired meanwhile stay retired (a new generation publishes a fresh one).

## Proof

On `18e910505`: database tests 112 files / 10,849; rebuild check 0 of 1,080 rules different; type check; lint; unit suite 794 files, 22,053 tests passed (1 file and 18 tests skipped, as on main); CI's browser tests 353 of 353.

Each part was read by a second model until it had nothing left (F27: two reads; F24: two reads, one point of the second read declined, see below). Each part was tested blind by a third model on the same code one main earlier (`4ee72a11b`; the fix files are identical): Soporte, scenarios 6 to 11 behave as expected through the route; proposals, 21 scenarios passed (a third version, two generations at once, swapped codes, a visitor and a Docente; fresh requests to a retired version's page, code check, ZIP and documents answer 410). The failures both testers reported are the first two items under "Known and left for later".

## What a reviewer should look at first

1. `pages/api/feedback/reply.ts` and `lib/notificationService.ts`: who gets the bell (the reporter only, never the author of the reply, never for an internal note), and that nothing is queued for e-mail.
2. `lib/notifications/catalog.ts` and `lib/notificationEvents.ts`: the new event is bell-only, with fixed texts and address.
3. `pages/api/licitaciones/[id]/generate-propuesta.ts`: the retirement happens only after the new version is published, only for versions older than the new one of the same tender, and its failure does not undo the new version.
4. `components/licitaciones/ProposalConfigPanel.tsx`: the sentence before generating, the failure message, and the hidden section (a named constant).

## Known and left for later

- A download address of a proposal's file that was handed out BEFORE its version was retired keeps giving the file until the address expires, one hour at most, to anyone holding it (found by the blind tester). A signed address cannot be withdrawn. Follow-up: five-minute addresses, as the owner chose for signed contracts (his decision of 20 Nov).
- Not from this build, live today: the table `feedback_activity` can be written straight with a person's own session, without the route (found by the blind tester). An admin can so save a reply with no bell and without the route's checks of length and blank text; a reporter can add a line the reporter can see to their own ticket. The table should be writable only through the route; that needs a later migration that changes a live rule, with its own scenario first.
- Seen by the code reader, declined by the lead: a proposal generation that stalls for more than 15 minutes, is marked failed, and then wakes up again would still publish its link, and a newer version's link would stay live beside it. The generation route publishes by id without checking that it still owns its running state, which is older than this build; Production's host stops a function long before 15 minutes, so the case is believed not to occur there (from the host's limit, not seen).
- Seen in the browser, not blocking: opening a ticket writes the activity line «Estado cambiado de new a seen» with the internal English state names, and the inbox counts that line as a comment; a retired version still shows its «Link» button (it copies an address that now only says the proposal expired); the history's download is labelled «PDF»; typing over a full access-code box does not replace its content; in the local test data the client's name differed between two versions of one proposal (likely the test data, not checked).
- Everything listed under "Known and left for later" in the earlier requests of 17 to 22 Nov.

No credentials, no personal data in tests (invented people only), no Production action by any agent.

## Used by sight

Once, by a tester who had not seen the builds, in a real browser on invented local data (the same code one main earlier): 4 of 4 scenarios passed, no errors in the browser's console.
- An admin answers a Docente's ticket with «Responder al usuario» (the hint reads «La persona que reportó lo verá en «Mis reportes».»): the Docente's bell shows one new notification, which opens «Mis reportes» with the answer.
- An admin writes a «Nota interna» on the same ticket: the Docente's bell stays as it was.
- The Docente's «Notificaciones por correo» page shows its four sections as before, none for Soporte.
- The proposal panel of a tender with a live version shows the sentence above «Generar Propuesta Final», no «Plataforma de Crecimiento» section; after generating, the first version's public link shows the expired page, the second version opens with its own code and refuses the first version's code.

Break attempts that held: a Docente typing the admin inbox or the tenders is sent to the dashboard; a signed-out visitor gets the login page; the back button after signing out shows no private page.
