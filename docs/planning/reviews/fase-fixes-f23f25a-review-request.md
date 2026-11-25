# GENERA fixes, release of 25 Nov: «Exportar todos» counts approved money, and «Solo los asistentes» reaches the ticked «Asistentes» with a band that names whom the summary reached

Branch: `fix/f23f25a`. Base: `5542c952b` (main, 25 Nov 2026, pull request 213: the fixes' third release of 24 Nov, awarded tenders never deleted and contract files behind five-minute links).
A straight line of commits on main, no merge commits: 5 commits of two builds of two phases (F23f, «Exportar todos» in Rendición de Gastos: 2 commits; F25a, the meeting summary's audience and band: 3 commits), and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data). This release holds one build of each of two phases, both with the owner's product answers of 20 Nov 2026:

- Rendición de Gastos (F23f, the total half of GES-3.30): «Exportar todos» counts "Approved only, plus per state".
- Espacio Colaborativo meetings (F25a, EC-R7b, answer 18): «Solo los asistentes» means "The ticked «Asistentes»" of the meeting form's first step, and the band of a finalised meeting names whom the summary was sent to.

The other half of GES-3.30 (the export buttons export every report, not the filtered list) and the rest of F23 and F25 are not in this release.

## What changes

**Expense reports (Gestión → Rendición de Gastos, «PDF» and «Excel» for all reports)**
- The headline «Monto aprobado: $X» and the table's foot «TOTAL APROBADO» count approved reports only. Before, every report was added whatever its state, so drafts and rejected reports inflated the total.
- Under the headline there is one line per state, always in the order Aprobado, Enviado, Borrador, Rechazado, each with its number of reports and its amount («<Estado>: <n> reporte(s) · $X»). «Total de reportes: N» stays, and every report is still listed in the table as before.
- Every amount in the two multi-report exports is added as a number: an amount stored as text is no longer joined as text into the total, and a missing, empty or non-numeric amount counts and shows as $0. Before, a report without an amount made both exports fail with the page's error message.
- No database change. The export of a single report is not changed.

**Meetings (Espacio Colaborativo, finalising a meeting and its details band)**
- «Solo los asistentes» reaches the people ticked under «Asistentes» in the meeting form: every attendee row of the meeting whose attendance is not marked 'absent' (the product only ever writes 'invited'). The same rule is used by the e-mail's recipients, the route's refusal, the e-mail's «asistió» marks, the bell notices and the preview count. Before, it read only rows marked 'attended', which nothing in the product writes, so the option was always refused.
- With nobody ticked, the dialog and the route say «Nadie está marcado en «Asistentes» en esta reunión.» (the dialog adds «Elige «Las personas con acceso a la reunión».»), instead of saying that attendance is not recorded on the platform. The refusal's code (`no_attendance`, 409) is unchanged.
- The finalize route stores once per meeting, in a new table, whom the summary e-mail reached and whom it did not, without changing its answer or its single update of the meeting. A person in the audience without an e-mail address (or without a profile) is stored as not reached; nobody new is mailed.
- The band of a finalised meeting reads that record with the person's own session and says «Resumen enviado por correo a: <names>.» and «No se pudo enviar a: <names>.», or «El resumen no se envió por correo a nadie.» when both lists are empty. A meeting finalised before this release has no record and says «Resumen dirigido a <audiencia>.» (before, «Resumen enviado a …» whatever had happened).

## Database

One migration, add-only, no function:
- `supabase/migrations/20261125100000_meeting_summary_outcomes.sql`: one new table `public.meeting_summary_outcomes` (`meeting_id` primary key referencing `community_meetings` with ON DELETE CASCADE, `sent_to` and `not_sent_to` as lists of profile ids, `recorded_at`), row security on, the forced-password-change guard applied, everything revoked from anon and authenticated, SELECT granted to authenticated, and one SELECT rule `Meeting readers see whom the summary reached` that shows a row exactly when its meeting is visible to the caller. There is no insert, update or delete rule: only the finalize route writes it, with the service key.

No table, policy or rule of earlier releases is touched, no row is changed, nothing is dropped. The migration defines no function, so no function of this release deletes rows and `.pm-publish/solo-preflight.json` declares none (it is unchanged: no checks, no declarations; the only key is the primary key of the table this release creates). The publisher's own reading of the file: no static problem, and no storage rule, store, trigger or function of Supabase's side. Every rule survives a dump and rebuild (1,084 rules, 0 different). The database test is `supabase/tests/172-meeting-summary-outcomes.sql` (31 tests).

Recovery without a destructive statement: the band and the route work without the table's rows (a meeting without a record shows the older sentence), and the SELECT rule can be changed in place (`ALTER POLICY`); nothing else depends on the table.

## Proof

On `2546d1e32`: database tests 116 files / 10,940 (the new file `172-meeting-summary-outcomes.sql` among them); rebuild check 0 of 1,084 rules different; the publisher's reading of the migration, no static problem and an empty inventory; type check; lint; unit suite 812 files, 22,448 tests passed (1 file and 19 tests skipped); CI's browser tests 353 passed, the 32 mandatory specs ran with no skips. Record: `evidence/F25/proof-f23f25a.summary` in the work folder.

Each build was read by a second model until it had nothing left (F23f: two reads, one send-back asking that every amount be added as a number and that a missing amount reach the report rows as zero, then approved; F25a: two reads, one send-back asking that a person without an e-mail address be recorded as not reached, then approved). Both builds were tested blind together by a third model through real requests and the real export functions: the export scenario passed (eleven reports; PDF and Excel both gave an approved headline and foot of $26,800 with Aprobado 3 / $26,800, Enviado 2 / $24,700, Borrador 5 / $97,590, Rechazado 1 / $12,300, matching the stored reports; no reports and no approved reports gave $0). Of the seven meeting scenarios, five passed (the attended audience addressed exactly the ticked person, with one bell; the preview count; an empty attendance refused with 409 and nothing changed, then `with_access` accepted; the stored outcome read through two sessions; every direct write to the new table refused). One could not be tested as seeded (the old meeting meant to have no record already had one), and its substitute check, an old-shaped completed meeting without a record, passed: reading it and a refused repeat finalising invented no record. One failed: a second finalising by an admin is refused with «No tiene permisos para finalizar esta reunión» instead of saying the meeting is already finalised. That text comes from `lib/api/meetings/load-context.ts`, which this release does not touch; the lead judged it older and not part of this release (listed below). Beyond the list, concurrent finalisings gave exactly one success each and matching records, and other communities' outcomes stayed unreadable.

## What a reviewer should look at first

1. The migration: the SELECT rule's subquery runs under the caller's `community_meetings` rules, and there is no write rule for a user session.
2. `pages/api/meetings/[id]/finalize.ts`: the ticked rule in the guard and the bells, the one write of the outcome, and that the answer and the meeting's update are unchanged.
3. `lib/notificationService.ts` (`getCommunityRecipients`): the not-'absent' rule, and the people without an address returned beside the unchanged list (a non-enumerable property) so that every other caller sees what it saw before.
4. `utils/meetingUtils.ts` and `components/meetings/MeetingDetailsModal.tsx`: the outcome read with the person's session, the names from profile cards (fallback «Usuario»), and the older sentence when there is no record.
5. `lib/expenseReportExport.ts`: `summaryByStatus` and the private `amountOf` in the two multi-report exports, headline and foot.

## Known and left for later

- A second finalising of a meeting is refused with a permission text («No tiene permisos para finalizar esta reunión», 403) instead of saying the meeting is already finalised. Older than this release; the text comes from `lib/api/meetings/load-context.ts`. Nothing is changed or duplicated by the repeat.
- A ticked attendee who has left the community is still in the attended audience: they get the bell notice and are recorded as not reached (they cannot read the outcome themselves; no e-mail is sent).
- The bell notice says «Enviada a quienes asistieron» also when the summary e-mail failed, including for a person without an address.
- When reading the people's notification preferences fails, the people with an address end up in neither list of the outcome; no text then claims that the summary was delivered to them.
- Everything listed under "Known and left for later" in the earlier requests of 17 to 24 Nov.

No credentials, no personal data in tests (invented people and companies only), no Production action by any agent.

## Used by sight

A browser pass by sight, by a tester who had not seen the builds, in a real browser on invented local data, is recorded in `evidence/F25/BROWSER-f23f25a.md` in the work folder.
