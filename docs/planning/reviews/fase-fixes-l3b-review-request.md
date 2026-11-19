# GENERA fixes, third release of 18 Nov: instruments by who works with them, community documents as private files, the community chooser, nine rules re-stated, pages opened by their address, saving quotes

Branch: `fix/l3b`. Base: `f732cac9c` (main, 18 Nov 2026 22:19, pull request 202: the fixes' second release of that day).
36 commits in a straight line on main, no merge commits: 12 for F1b, 12 for F12d, 1 for the community chooser (N181), 1 that re-states nine rules, 4 for F15b, 5 for F15c, and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data) and answered the product questions of these two phases on 17 Nov; each answer is quoted in the phase's brief. F1b and F12d are leftovers of level 1 (exposed): "Only people who work with it" for instruments, and "Yes, both private" for invoices and community documents (the invoices' links went live with pull request 197). F15b and F15c are dead ends of level 2 (pages opened by their address; saving quotes of Pasantías), the second on the owner's rule "valid until a date on the quote, 30 days after sending unless another is typed".

## What changes

**F1b — an instrument of Gestor de Cambio is read only by the people who work with it (finding N1; also N144)**
- `supabase/migrations/20261118102000_instruments_by_who_works_with_them.sql`: two definer helpers about the caller only (the instruments whose structure the caller may read; the instruments whose expected levels and stored versions the caller may read), a third for sub-questions nested under another sub-question, and the eight READ rules of the instrument's tables narrowed with `ALTER POLICY` to "an admin, or the row's instrument is in that set". Who is in the set: an admin; a consultor with a current assignment to a school the instrument was delivered to, and that school's Equipo Directivo; a teacher who has a registro made from it. Expected levels and stored versions: the same people, but a teacher only once a registro of that instrument has been sent. No rule is dropped or created; writes are unchanged.
- `lib/services/assessment-builder/registroAccess.ts` (new) and the teacher's five routes under `pages/api/docente/assessments/`: each keeps its own gate with the caller's session, then reads the stored version and the active indicators with the server's client; a registro that is not sent carries no expected level in any answer; a failed read of the levels at sending is an error (500, nothing changes) instead of "every indicator is required"; the results route checks "sent" before it reads the stored version (the same 400 as before). Scoring and its client are unchanged.
- The two demo routes (`pages/api/demo/assessments/`) keep their own access check and read the content with the server's client: people given demo access keep the demo.
- The builder: the one-indicator route reads with the caller's session first (a hidden and a missing instrument answer alike); `pages/api/school/transversal-context/via-responsibles.ts`: a consultor's overview of a school's vías lists only instruments the database lets them read (admins and the school's directivos keep the full list).

**F12d — a community's documents are private files behind five-minute links (findings EC-S3, N147, N162)**
- `supabase/migrations/20261118103000_community_documents_private.sql`: the private store `community-documents` is created only where it is missing (`ON CONFLICT DO NOTHING`; it exists in Production, private and empty); ONE storage rule: upload by people who may enter the path's workspace. Nobody reads, changes or deletes objects of that store with their own session (`file_store_allows` answers false for reading there); a new nullable column on the documents' records and on their versions says which store holds the file (empty = the old public store); the counter function counts only active documents.
- `pages/api/community/documents/[id]/link.ts` (new) with `lib/storage/community-document-link.ts`: a person who can read a document's record gets a link signed for 300 seconds; hidden, foreign, missing and malformed all answer the same 404. `lib/storage/download-authorization.ts`, `pages/api/storage/download-url.ts`: the older download routes refuse hidden documents, know the private store and sign 300 seconds for documents.
- `utils/documentUtils.ts`, `pages/community/workspace.tsx`, `components/documents/DocumentPreview.tsx`: new uploads go to the private store; preview, «Abrir» and «Descargar» use the link; nothing opens without a session; pictures and PDFs are fetched once into an in-page object (so an open preview does not depend on a link that expires), video streams with a renewed link; a download keeps the document's own file name.
- Nothing is moved: the five documents already uploaded stay in the public store and keep opening through the application. Moving them is a data step outside this release, for the owner to decide.

**N181 — choosing the community already shown no longer empties the workspace**
- `pages/community/workspace.tsx`, `handleCommunityChange`: when the chosen community is the one shown, the chooser closes and nothing is reset. Before, the workspace was cleared and nothing loaded it again until a reload (older than the fixes; the previous release gave the chooser to members of two communities and to assigned consultores, where a look by sight met it). One new case in `__tests__/pages/community/workspace.switch.test.tsx`.

**Nine rules of Rendición de Gastos re-stated (same meaning)**
- `supabase/migrations/20261118103500_expense_rules_restated.sql`: nine `ALTER POLICY` statements. The rules went live with pull request 197 written as `status IN ('draft', 'rejected')` on a `character varying` column; PostgreSQL spells such a rule one way when it is created and another way after a dump and a rebuild, so Production and the publisher's rebuilt copy no longer matched and the rehearsal of pull request 202 was blocked. On 18 Nov 2026 the owner applied exactly these nine statements to Production by hand, once (his decision; Publish could not carry them while it was blocked). This migration makes every database built from the repository equal to that; where the statements are already applied it changes nothing. `supabase/tests/142-rules-survive-rebuild.sql` pins the nine texts, the unchanged meaning, and a general guard that no rule of the app's schemas or of storage holds the spelling that changes.

**F15b — pages opened by their address, signed out or by a reload (findings N66, N83, RD-a, the live part of RD-c)**
- `lib/auth/forced-password-change.ts`: `/student`, `/mi-aprendizaje` and `/quiz-reviews` join the list of areas from which the middleware sends a visitor without a session to `/login?next=…` (it already did for five areas; `middleware.ts` itself is unchanged). Before, a lesson's page sent the visitor to `/auth/login`, a page that does not exist, and «Mis tareas» and a quiz review showed a spinner for ever.
- `next.config.js`: two temporary redirects, `/auth/login` and `/auth/signin` → `/login` (a few pages still send people there).
- `pages/profile.tsx`, `pages/notifications.tsx`: they wait for the session to finish loading before deciding (a reload used to throw a signed-in person to the panel); without a session they go to `/login?next=<their own path>`.

**F15c — saving quotes of Pasantías (findings GES-2.12, GES-2.13 with N64)**
- `pages/api/quotes/createV2.ts`, `pages/api/quotes/[id].ts`, new `lib/quotes/valid-until.ts`: an empty or malformed «válido hasta» or early-payment date is stored as nothing instead of breaking the save with a server error; a quote saved as sent without a date gets the day in Chile plus 30. The create route now stores the early-payment switch, its date and the viáticos fields it used to drop.
- `supabase/migrations/20261118104000_quote_groups_save.sql`: ONE function, `public.save_quote_with_groups(uuid, jsonb, jsonb)` (invoker, executable by the service role only): it locks the quote's row, checks the list of travel groups (not empty, no group of another quote, none twice), updates the listed groups, inserts the new ones, deletes the ones no longer listed and updates the quote's allow-listed columns — all or nothing. **It deletes rows by design and is declared in `.pm-publish/solo-preflight.json`.** `pages/api/quotes/[id].ts` calls it for a quote in group mode after its unchanged checks (caller, owner or admin, status rule, field allow-list); before, every save of a quote with travel groups was refused. New `lib/quotes/group-fields.ts` (the thirteen editable columns of a group, shared with the groups route).

## Files, grouped by risk

- Highest: the four migrations (above all `20261118104000_quote_groups_save.sql`, the one function that deletes rows); `lib/auth/forced-password-change.ts` (who is turned away before a page is served); `pages/api/quotes/[id].ts`; `pages/api/community/documents/[id]/link.ts`; `lib/storage/download-authorization.ts`; the teacher's routes and `registroAccess.ts` (they read with the server's client after a gate).
- Medium: `components/documents/DocumentPreview.tsx`, `utils/documentUtils.ts`, `pages/community/workspace.tsx` (documents part), the builder's indicator route, `via-responsibles.ts`.
- Low: the demo routes, `pages/api/storage/download-url.ts`, `next.config.js` (two redirects), `pages/profile.tsx`, `pages/notifications.tsx`, `pages/api/quotes/createV2.ts`.
- Tests: database tests 139 (instruments, 121 assertions, among them an admin's `INSERT … RETURNING` of a new instrument), 140 (the private store, 83 assertions), 141 (the quotes' save, 72: rollback after a refused quote update, foreign and duplicate ids, columns outside the lists) and 142 (the re-stated rules, 34); test 125's assertions follow the new read rule; unit tests for every route and helper above; three end-to-end specs brought to the new behaviour (`community-document-links.spec.ts`, `urgent-anonymous-current.spec.ts`, and `urgent-anonymous-boundaries.spec.ts`, which CI does not run).

## What changes for people

- A teacher fills in a registro without seeing the expected levels; after sending, the results show the comparison as before. A consultor sees in «Constructor de Registros» only the published instruments delivered to schools they are currently assigned to, read-only, and no drafts. A person of another school reads nothing of an instrument that was not delivered to theirs. Admins see and edit everything as before.
- A community's new documents are stored privately: they preview, open and download as before for the people of that community (and admins, and a consultor assigned to the school); a copied address stops working after five minutes and never works without the application; a deleted document's file can no longer be fetched.

## Validation (on the 35 commits before this request, `b96e4f85b`)

The 35 commits were proven as one line (`a0c20fe7f`) on the tree of the fixes' previous release as it stood before its last two commits (the CI job's time limit and a note in its request); this branch's tree differs from that proven tree by exactly those three files of pull request 202 (`.github/workflows/ci.yml`, `.pm-publish/solo-preflight.json`, that release's review request).

- Database tests: 104 files, 10,382 pass.
- Every rule reads the same after a dump and a rebuild of the database: 0 of 1,075 differ (before the re-stated rules: 9). This check is new; it is what the blocked rehearsal of 18 Nov would have needed.
- Unit tests: 714 files passed, 1 skipped; 20,452 tests pass, 18 skipped. Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script: 31 files, 348 pass, no failures, no second tries (`community-document-links.spec.ts` and `urgent-anonymous-current.spec.ts` among them).
- The publisher's static check on the four migrations: no refusal and no note for three; for `20261118104000_quote_groups_save.sql` one note, the declared function's DELETE.
- Each phase: read by a second model (Sol), tested blind with real requests by another (Astra), and used by sight in a browser; the defects found were sent back and re-checked. F12d's blind test found that a hidden document's file stayed readable through the store itself (cured: nobody reads that store with their own session); F1b's test data found that an admin could no longer create an instrument (cured: each rule admits an admin directly); F15c's code read found that a save could be left half done and that two saves at once could leave a quote without groups (cured: the one function; ten pairs of truly simultaneous saves then always left one group). The reports are in the fix run's own folder, outside this repository.

## Review focus

1. `20261118102000_instruments_by_who_works_with_them.sql`: the eight rules — each admits an admin directly (a helper cannot see the row an insert is creating); no other permissive rule on those tables lets anyone else read; the helpers answer about the caller only.
2. The teacher's routes: is every read with the server's client behind a gate made with the caller's session; can any request value widen what is read; is anything of the expected levels in an answer for a registro that is not sent.
3. `20261118103000_community_documents_private.sql`: no read, update or delete right for anyone on the private store; the upload rule; the existing stores and their rules untouched.
4. `pages/api/community/documents/[id]/link.ts`: can it be made to sign another file; does any answer tell a hidden or foreign document from a missing one.
5. `components/documents/DocumentPreview.tsx`: what is shown from the in-page object is decided by an exact list of types (JPEG and PNG as pictures, PDF in a frame, MP4 as video), never by the file's name.
6. `20261118104000_quote_groups_save.sql`: the lock comes before the groups are read; every write is filtered by this quote's id; only the listed columns can be written; nobody but the service role may execute it.
7. `lib/auth/forced-password-change.ts`: is any page under `/student`, `/mi-aprendizaje` or `/quiz-reviews` meant for people who are not signed in (none was found).
8. `20261118103500_expense_rules_restated.sql`: the nine rules mean exactly what they meant.

## Known and left for later

- The five documents uploaded before this release stay in the public store until the owner decides their move; the invoices store is still public for the same reason (links are in place since pull request 197).
- A cancelled registro still shows as editable to its teacher and its save answers 500 (older); a cancelled delivery still counts as "delivered to the school" for reading an instrument; an assignment that has not started yet already counts in one older helper: all three go with the phase "the assignment decides everywhere".
- A registro shared by several teachers is "sent" for all of them once one has sent it (none can answer it afterwards).
- Sub-questions of an indicator never reach the teacher's form (older; whether they are a finished feature is a product question).
- The document preview does not cancel a whole-file fetch when it is closed, and has no size above which it only offers «Abrir»; the two older download routes answer 500 instead of 404 for a file that does not exist.
- Quotes: a group quote's stored total still leaves out the flights and daily viáticos are counted for one day (older, in the database's own triggers); a departure before the arrival and a negative price are still accepted; the create route can leave a quote in group mode without groups after a malformed request; a refusal by the database reaches the person as a general error. All planned with the quotes' money phase; the new function is the place for those checks.
- The redesign's inventory documents that are generated from the list of signed-in-only areas are out of date until regenerated.
- Everything listed under "Known and left for later" in the requests of 17 and 18 Nov (`fase-fixes-l2d-review-request.md`, `fase-fixes-l2i-review-request.md`); the community chooser's defect listed there is cured by this release.

No credentials, no personal data in tests (invented people only), no Production action by any agent.
