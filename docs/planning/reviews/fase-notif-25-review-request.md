# NOTIF-25 (N5-04) — review request: due reminders on the real schema (r2 rebuild on current main)

- **Branch:** `fix/notif25-rebuild` · **base/HEAD:** `0746b130532ad320f0ae640eac53b761e36959de` (main `6b38ee452316fd096ad89697ce7f538fd32efe05`
  + accepted NOTIF-24 rebuild `2455d666d` + its ledger commit) · **commits:** 0 (uncommitted; the PM commits on acceptance). The
  tree also holds the PM's ledger edit (`docs/ledger/notifications.md`), not part of this unit.
- **History:** the r1 change was reviewed and accepted as commit `3e7a3bf161fcf387bd8c4967c2623113a15fb90d` on an older base,
  then set aside at publication. Its review (RUN `pm-review-r1.md`) and evidence apply to that tree only; this rebuild is a fresh
  candidate on current main and needs its own review. Status: **r2 delivered for review.**
- **Objective (ledger N5-04):** "Rewrite existing assignment_due_soon due reminders against actual persisted assignment due dates,
  actual eligible recipients and submission state; authenticate and schedule real route, preserving flag-selected delivery,
  preferences, role-safe platform links and occurrence idempotency."
- **In scope (10 paths):** `pages/api/cron/due-reminders.ts`, `lib/notificationService.ts` (`getDueAssignments`,
  `deliveredRecipients`, removal of `markReminderSent`), `vercel.json`, the two load calls of `pages/assignments/[id]/index.tsx`,
  the new cron suite, the pinned cron lists of the dispatch and session-reminders tests, the browser spec, this file, `PROJECT_STATE.md`.
- **Out of scope:** new notification families, meeting-task reminders, procurement deadlines, meeting summary, sync retirement,
  `pages/api/cron/test-reminders.ts` security, auth middleware/RLS/schema/migrations, the rest of the assignment pages, the catalog.

## Drift check against current main
Between the r1 base (`e43fc2a3f`) and this base, the route, `lib/notificationService.ts`, the assignment page, `vercel.json` and
`__tests__/api/cron/session-reminders.test.ts` are byte-identical, so the r1 hunks were reapplied unchanged (`git apply`, no
fuzz). `__tests__/lib/notificationService.dispatch.test.ts` gained main's group-thread tests; its one-line schedule hunk applied at
a +48 offset. Imports read on main: `lib/zoom/cron-auth.ts` unchanged; `lib/email/notification-access.ts` and
`lib/notifications/catalog.ts` changed only for message events (`group` source for assignment-group threads); the assignment
rule (`lesson_assignments.course_id/is_published` → course access) is unchanged. No migration since the r1 base alters
`lesson_assignments`, `lesson_assignment_submissions`, `course_enrollments` or `user_roles`; `enqueue_notification_with_source`
still maps `assignment_due_soon` to the `assignment` kind. Callers of `getDueAssignments`: the route and `test-reminders.ts`
(uses `.length` only); `markReminderSent` has no other caller.

## What changed
| Risk | File | Change |
|---|---|---|
| High (auth, schedule) | `pages/api/cron/due-reminders.ts` | `isAllowedCronMethod` → 405, `authorizeCronRequest` → 401, both before any read; no body/query credential. One `triggerNotification` per recipient, counted only when `success && notificationsCreated > 0`; `{ success: failed === 0, sent, alreadySent, failed, assignmentsChecked }`. Fixed Spanish errors; logs carry no title, id, secret or exception text. |
| High (recipients) | `lib/notificationService.ts` | Published, course set, `now < due_date <= now + 24h`; `active` enrolments; community-targeted → active role there; `checkNotificationAccess` must `allow` (`unavailable` → counted, retried); minus latest attempt `submitted`/`graded` (highest `attempt_number`, NULL first) and submitted groups. Any failed read throws `due_assignments_lookup_failed`. Canonical UTC `due_date` is the occurrence; `deliveredRecipients` skips recipients whose bell already holds the key. |
| Medium (destination) | `pages/assignments/[id]/index.tsx` | `getById(supabase, id)`, `getByAssignmentAndStudent(supabase, id, userId)`. |
| Medium (schedule) | `vercel.json` | `/api/cron/due-reminders` `0 * * * *` appended after `session-reminders`; other entries unchanged. |
| Tests | cron suite (new), dispatch + session-reminders pinned lists (+1 each), `tests/e2e/due-reminders.spec.ts` (new) | Rebuild additions: inactive role and cancelled enrolment in the eligibility matrix; a recipient with two matching roles reminded once while an enrolled user of another community is not; the spec fails if any owned fixture row survives cleanup. |

## Evidence
Final commands, exit codes and counts: RUN `executor-report-r2.md` (baseline in `evidence/baseline.md`, r2 section; logs in
`evidence/r2/logs/`). Gates: focused (order's 6 files), `npm run type-check`, `npm run lint`, `npm test`, `npm run build` in the
byte-identical private copy, full pgTAP on the private notif25 stack (brought to current main's migrations), and
`pm-unit ui-run … npx playwright test tests/e2e/due-reminders.spec.ts` with the flag off and on, plus the r2 PM-fixture journey.

## Scrutinize hardest
1. **Latest-attempt rule:** NULL `attempt_number` ranks highest; on a tie a completed attempt wins.
2. **Access check per candidate** (`checkNotificationAccess`, several reads each) runs hourly for every not-yet-delivered
   candidate; cost grows with enrolment in courses with something due within 24 h.
3. **Display date at local noon** in `assignment.due_date` (template formats in the process zone); identity unaffected (N25-N2).
4. **Delivered skip only sees a bell:** in-app off re-triggers hourly (absorbed by the key); a sync mail failing after its bell
   is not retried (N25-N1).
5. **Stack parity for pgTAP:** the private stack was migrated forward (`migration up --include-all`) and the changed
   `20261009000000` function re-applied as `CREATE OR REPLACE`, not rebuilt from scratch; parity shown by the baseline pass.

## Known limitations / deferred (owner: notifications backlog, from the r1 review)
N25-N1 delivered skip vs sync transport retry · N25-N2 Chile date-at-noon payload · N25-N3 the page's `update`/`create` save
calls still omit `supabase` · N25-N4 baseline "Published assignments are viewable by all authenticated users" policy · N25-N5
mobile menu overlay after navigation. R1 (PM genuine journey) is the PM's: fixture, manifest and instructions in RUN `evidence/r2/`.
