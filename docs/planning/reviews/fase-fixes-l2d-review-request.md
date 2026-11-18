# GENERA fixes, third release of 17 Nov: registros at publication, four exposure leftovers, invoice links, meetings and documents, Rendición de Gastos by role

Branch: `fix/l2d`. Base: `5e08e8aed` (main, 17 Nov 2026 15:41, pull request 196: the second part of level 2).
51 commits in a straight line on main, no merge commits: 7 for F7c, 8 for F9a, 7 for F2c, 8 for F12a, 14 for F7d and F7e, 6 for F12b, and this request with the release's declaration file.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data). On 17 Nov he answered the product questions these phases waited for; each answer is quoted in the phase's brief. This release holds the leftovers of level 1 that those answers unlocked (F7c, F2c, F7d with its screen F7e) and three phases of level 2 (F9a, F12a, F12b).

## What changes

**F9a — a published registro reaches its courses at publication (finding GC-3)**
- `supabase/migrations/20261117160000_deliver_on_publish.sql`: `deliver_published_template(template, limit)` delivers, for one published instrument, exactly the pairs the every-minute sweep of 16 Nov would deliver (same candidate query, same per-pair locks and re-checks, each pair in its own subtransaction; never touches the sweep's cursor or an existing instance, grant or response); `preview_template_delivery(template)` counts the pairs that would really be delivered, also for a draft. Both service role only.
- `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` calls the delivery once after a successful publication, as a second call; a failed or partial delivery never fails the publication (the sweep stays as the net). New admin-only route `delivery-preview.ts`; the editor's confirmation says how many courses or schools will receive the registro.
- `pages/school/transversal-context/index.tsx`: «Reenviar registros» on a course card, for whoever sees «Cambiar docente»; it posts the course's current teacher to the existing assign route.

**F7c — four smaller doors**
- `supabase/migrations/20261117165000_course_gifts_by_assignment.sql`: a consultor gives and takes away courses only for people their CURRENT assignments cover (active, started, not ended; the four scopes of the quiz-review rule); new helper `auth_consultor_covers_user`; `batch_assign_courses` and `batch_unassign_courses` replaced with their previous bodies plus that one check; neither is executable by anon any more. `batch_unassign_courses` keeps its own `DELETE`, declared in `.pm-publish/solo-preflight.json`.
- `pages/api/community/members.ts`: a member's e-mail is returned only to an admin, to the community's manager and to its leader; people whose profile is not approved are listed for admins only.
- `pages/api/contracts/extract-pdf.ts` refuses a `pdfUrl`; the import screen says the document's text is sent to Anthropic.
- `components/feedback/FeedbackDetail.tsx`: a ticket's page address is a link only when it is an http or https address.

**F2c — invoices through a five-minute link (finding GES-1.4)**
- New route `pages/api/contracts/invoice-link.ts` (active admins only; the same 404 for everyone else and for anything that is not that instalment's invoice; signed for 300 seconds; `download=1` asks the store for a plain download); helper `lib/contracts/invoice-path.ts`; «Ver factura», «Descargar factura» and «Ver» ask the route (`lib/contracts/open-invoice.ts` reserves the tab during the click); new uploads store the file's name, not a public address; removal understands both forms. No migration. The store's own public setting is NOT changed by this release.

**F12a — meetings of Espacio Colaborativo**
- `supabase/migrations/20261117162000_meeting_item_progress.sql`: `update_meeting_item_progress(kind, id, status, progress, notes)` lets a verified editor of the meeting or the person in charge change an item's state, progress, notes and completion time, and nothing else; it also makes «Reabrir» work (the completion time is cleared). No rule changes.
- `components/meetings/*`, `utils/meetingUtils.ts`: «Crear Reunión» saves a draft; background saving runs only for drafts; participants and people in charge are shown by name through profile cards; `components/workspace/WorkspaceSessionsTab.tsx`: a session card is a link only for staff.

**F12b — documents of Espacio Colaborativo (findings EC-D1, EC-D2, N139)**
- `utils/documentUtils.ts`: the sort choices map to real columns (sorting by name, size, downloads or views gave an error).
- `supabase/migrations/20261117163000_document_actions.sql`: `rename_community_document`, `move_community_document`, `hide_community_document` and two yes/no helpers — the uploader (while still a member), the community's leader and admins may rename, move and hide a document; "deleted" is hidden, nothing is destroyed; a name is stripped of blanks and control characters and refused when nothing is left. The two UPDATE rules on `community_documents` are narrowed with `ALTER POLICY` to admins: a direct update by the uploader or a leader, which could change any column, now changes nothing; counters keep working through their definer function.
- `pages/community/workspace.tsx` (documents tab), `components/documents/DocumentGrid.tsx`: «Editar» (rename), «Mover» and «Eliminar» (asked inside the page) work and are offered only for a document the person may manage.

**F7d and F7e — Rendición de Gastos by role (finding GES-1.3, with GES-2.15, 2.16, 2.17)**
- `supabase/migrations/20261117166000_expenses_by_role.sql`: who files is decided by role (`auth_can_file_expenses`: active admin, consultor, community manager); restrictive rules on `expense_reports` and `expense_items`; a guard trigger on `expense_reports` (an author changes content only in draft or rejected; only an admin decides and writes the review fields; an admin author may only decide their own sent report; reports start as draft or sent); the history table `expense_report_events`, written only by a trigger; the receipts store follows the role (`file_store_allows`, branch `boletas`, and four added storage rules for filers).
- `lib/bots/expense-service.ts`, `pages/api/bots/link-code.ts`, `pages/api/expense-reports/[id]/notify.ts`: the Telegram assistant, the account-link code and the notifications follow the role; the fixed approver e-mail grants nothing.
- `pages/expense-reports.tsx`, `components/expenses/*`, `pages/admin/user-management.tsx`: the page's gate asks the database; any admin approves and rejects and is recorded as the reviewer; the rejection reason is asked inside the page and required; a rejected report is corrected and sent again; the detail shows the history; edit and delete are offered only where the rules allow; the one-by-one switch leaves user administration.

## Files, grouped by risk

- Highest: the five migrations (above); `pages/api/community/members.ts`; `pages/api/contracts/invoice-link.ts`; `publish.ts`.
- Medium: `pages/expense-reports.tsx`, `components/expenses/ExpenseReportDetails.tsx`, `lib/bots/expense-service.ts`, `components/meetings/MeetingDocumentationModal.tsx`, `utils/meetingUtils.ts`, `pages/school/transversal-context/index.tsx`, `components/contracts/*`, `pages/contracts.tsx`.
- Low: `components/feedback/FeedbackDetail.tsx`, `components/contracts/ContractPDFImporter.tsx`, `components/workspace/WorkspaceSessionsTab.tsx`, `pages/admin/user-management.tsx`.
- Tests: database tests 131 (delivery), 133 (meeting items), 134 (documents), 136 (course gifts), 137 (expenses), with small restatements in 078, 080 and 126; unit tests for every route and screen above; two end-to-end specs adjusted to the invoice link.

## What changes for people

- An admin who publishes a registro sees how many courses will receive it before confirming, and the teachers have it at once. A school's leadership has «Reenviar registros» on each course with a teacher.
- A consultor can give or take away a course only for people of their current assignments. Members of a community no longer see each other's e-mail (the leader, the community's manager and admins do).
- In «Contratos», invoices open and download through a link that lasts five minutes. Until the store itself is made private (the owner's step), an old address still opens the file.
- In «Reuniones», a new meeting is a draft until «Finalizar reunión»; editing a finalised meeting no longer loses what is typed; names show; «Reabrir» works; the person in charge of a task can update it. A teacher's click on a session card no longer lands on the panel.
- In «Documentos», sorting works; the person who uploaded a document, the community's leader and admins can rename, move and delete it (it disappears from the lists; the file is kept).
- «Rendición de Gastos»: every consultor and community manager can file (by its address until the menu offers it); a teacher who was switched on by hand and holds none of those roles loses it; a sent or approved report is closed to its author; any admin approves or rejects, with a reason for a rejection; a rejected report can be corrected and sent again; each report shows its history.

## Validation (on the joined line, whose content is identical to this branch before this request: tree `1c0427a1`)

- Database tests: 98 files, 9,967 pass.
- Unit tests: 652 files passed, 1 skipped; 19,681 tests pass, 18 skipped. Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script on the final code: 30 files, 344 pass, no skips, no second tries. An earlier run, before F12b was added, had two failures, both end-to-end tests that still expected a behaviour this release changes on purpose (a consultor giving a course with no assignment; the old message after «Crear Reunión»); both tests were brought up to the new behaviour and the whole set run again (344 of 344), and once more with F12b (344 of 344).
- The publisher's static check, run in memory on the five migrations: no refusal; one note (the declared function).
- Each phase: read by a second model (Sol), tested blind with real requests by another (Astra), and used by sight in a browser; the defects found were sent back and re-checked. The reports are in the fix run's own folder, outside this repository.

## Review focus

1. `20261117166000_expenses_by_role.sql`: the restrictive rules and the guard together — can an author change a sent or approved report; can a non-admin reach "approved"; does the receipts store let a person without a filing role do anything.
2. `20261117165000_course_gifts_by_assignment.sql`: are the two replaced functions their previous bodies plus the coverage check only.
3. `20261117160000_deliver_on_publish.sql` against the sweep of `20261116160000`: the same checks, locks and order.
4. `pages/api/community/members.ts`: every consumer still gets what it needs without e-mails.
5. `lib/contracts/invoice-path.ts`: can a stored value make the route sign anything but one invoice file.
6. `20261117163000_document_actions.sql`: who may rename, move and hide; does anything in the application still update `community_documents` with a person's own session after the two rules are narrowed.

## Known and left for later

- The invoices store is still public: old addresses open until it is made private, which Publish cannot do for an existing store (the owner decides how).
- The side menu does not offer «Rendición de Gastos» to consultores yet (the menu is the redesign's).
- An admin can hand their own draft or rejected expense report to another person and then act on it as any admin; an admin who is not a report's author can blank its state by a direct request. Neither reaches non-admins.
- A database built fresh from this repository lets anyone call `bot_save_expense_item`; Production reserves it to the server (sheet of 16 Nov). To be aligned by a one-line migration.
- Two decisions on one expense report at the same moment can leave the report and its history disagreeing.
- Meetings saved as «Completada» before this release were never finalised and stay as they are.
- A hidden document's file can still be fetched by a member who knows its place, and the documents' store is public (both go with the move of community documents to a private store, a later phase).
- A consultor's access still follows the school on their role in several places, not their assignment (a later phase).

No credentials, no personal data in tests (invented people only), no Production action by any agent.
