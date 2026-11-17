# GENERA fixes, level 1: things people could see or change that they should not

Branch: `fix/l1`. Base: `091ec16852469e0da29a09bf9ab7b5a70abb9aaa` (main, 16 Nov 2026 19:21, pull request 188).
Thirty-seven commits in a straight line on main: the commits of ten fix phases, one renumbering commit, this request. (The phases were built and proven on a line that joined them with merge commits, `fix/join`; this branch replays the same commits without the merges and ends in exactly the same files, except this request's own two lines about the branch.)

## Approved scope

The owner approved the fix plan on 13 Nov 2026 ("i approve the plan") after the five module reviews were gathered into one list, with this order: first what is exposed. This release is that first level and nothing else: it closes ways in which a visitor, or a signed-in person who should not, could read, change or delete things. It adds no feature and changes no screen's layout. Findings that are dead ends or wrong results are later levels and are not here.

The record of the work (briefs, test scenarios, the second model's blind tests and code reads, browser passes, every decision with its time) is kept outside the repository by the session that led it.

## What changes, phase by phase

Nine migrations, all additive (`ALTER POLICY`, new restrictive rules, `REVOKE`, `CREATE OR REPLACE FUNCTION`, one new table, new functions; no `DROP`, no `TRUNCATE`, no row deletion, no function that deletes rows).

- **Gestor de Cambio** (`20261116170000`): evaluation objectives could be written by any signed-in person; snapshots, expectations, context questions and the migration plan were readable by people outside the school or by visitors; answers and instances could be changed by people other than their teacher. All narrowed to the people the screens already assume.
- **Espacio Colaborativo** (`20261116171000`): the feed's activity, reactions, mentions and hashtags were readable across communities; a view was granted to visitors; the download routes now check that the caller may open the file; a post can no longer be moved to another community.
- **Cursos** (`20261116172000`, `173000`, `176000`, `177000`): course content is written by admins only and "course teacher" no longer includes learners; quizzes are graded on the server from the stored quiz (the browser's copy of the questions is ignored) and learners cannot write results directly; a learner cannot write their own course progress, and can mark only real content of a course they have; tasks and group work can no longer be graded, joined or read across groups and schools by direct requests.
- **Licitaciones** (`20261116174000`): an encargado can no longer write tender records straight to the database; their part still works through the server routes.
- **Gestión** (`20261116175000`): quotes, the programme catalogue, a summary of every user's roles and the ticket counters are closed to visitors and outsiders; a quote's public page shows no private notes.
- **Rendiciones**: a receipt is opened through one server route that answers only its filer and admins, with a link that lasts five minutes; the form no longer stores a year-long link or lists the whole store.
- **File stores** (`20261116178000`): one function and four restrictive rules on `storage.objects`. Visitors never write and no longer list invoices or course files; signed-in people no longer replace or delete files that are not theirs; a receipt can be listed, signed or deleted only by its uploader, an admin, or the person the server recorded for it (new server-only table `expense_receipt_files`, written only by `record_expense_receipt_file`, which the Telegram assistant now calls). Every bucket keeps its public flag: a file whose exact address someone already holds still opens. The rules were written against a read of Production's 26 buckets and 62 storage rules taken on 16 Nov 2026 with the owner's read-only query; the repository declares none of them.

## Files, grouped by risk

- Highest: the nine migrations under `supabase/migrations/2026111617*.sql` (access rules on about forty tables and on `storage.objects`; three replaced functions; one new table).
- Server routes that decide access: `pages/api/expense-reports/receipt-link.ts` (new), `pages/api/storage/download.ts` and `download-url.ts` with `lib/storage/download-authorization.ts` (new), `pages/api/assignments/feedback.ts`, the quiz review routes with `lib/quiz-reviews/review-scope.ts` (new), the quote routes under `pages/api/quotes/`, `lib/bots/expense-service.ts`.
- Screens touched, small: `components/expenses/ExpenseReportForm.tsx` and `ExpenseReportDetails.tsx` (receipts open through the route), the quote editor (refuses group quotes).
- Tests: nine new pgTAP files, the restated assertions, new unit test files next to each route, `tests/e2e/learning-path-governance.spec.ts` adapted to the closed direct writes.

## What changes for people

- A receipt opens only for its uploader, an admin, or the recorded filer. Today anyone with expense access can read every receipt.
- Receipts the Telegram assistant stored BEFORE this release have no uploader and no record: they open for admins only. New ones open for their filer.
- A directivo reviews quizzes of their own school's learners only; a consultor only of learners their assignments cover.
- Group tasks: only admins grade through the old address; a group's work is visible to the group and to admins.
- Editing a quote that has travel groups is refused with a message for now (its totals were being saved wrongly).

## Validation (run on the same files as this branch holds, at `465493f43` of the joined line)

- Database tests (pgTAP): 89 files, 9,226 pass. Nine new test files (118 to 126); existing assertions that pinned the old open doors were restated in 072, 078, 101 and 105, each named in its commit.
- Unit tests: 566 files, 18,658 pass, 12 skipped. Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script: 28 files, 339 pass, no skips.
- Every statement of the nine migrations was compared with the 16 Nov read of Production: each rule that is altered exists there under the same name and text, each new name is free, the three replaced functions have main's body there.
- Each phase was tested blind by a second model from scenario lists (real requests against a local database built from these migrations), read by a third model, and used by sight in a browser; the whole level was then used by sight by the second model.

## Review focus

1. `20261116178000_file_stores_boundaries.sql`: the function returns true for every bucket and action it does not govern; check the governed list against Production's buckets.
2. `submit_quiz` keeps its signature and grants; `update_course_enrollment_progress` becomes SECURITY DEFINER with a pinned search path.
3. The restated assertions in 072, 078, 101 and 105: each is the old open door stated closed, nothing else.
4. Order: the nine migrations carry versions after Production's newest (`20261116164500`), in dependency order.

## Known and left for later

- Invoices, course files and community documents still open by their exact public address without sign-in: making them private needs every screen that shows them to change, and is the owner's decision.
- `/api/community/members` returns co-members' e-mails; the evaluation instruments are readable between roles: both wait for the owner's answers.
- The redesign's page-and-route inventory (`node scripts/redesign/inventory.mjs check`, not run by CI) does not yet list the new route `pages/api/expense-reports/receipt-link.ts`.
- Reloading the quotes list in full sends a person who holds the permission to a page that does not exist (older than this release; next level).

No credentials, no personal data in tests (invented people only), no Production action by any agent.
