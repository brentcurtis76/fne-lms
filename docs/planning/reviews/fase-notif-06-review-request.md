# NOTIF-06 — review request (N1-03, precedence resolver in compat mode)

## State

- **r2 (current-main rebuild):** branch `fix/notif06-rb`, base/HEAD `b1ed3ae100a5708a27b12867055d372e119d50a2`
  = `origin/main` `ec96c0dba` plus the provisional NOTIF-04 catalog cherry-pick (`c3f449c52`).
- r0/r1 were reviewed on `fix/notif02-redo` at `a81ebf1d2` and PM-committed as `0e75ae586` (r1 APPROVED).
- **r3–r6:** no product or test file changed. r3 added the shared ledger to the commit manifest as the
  ninth path (PM review r2, F03); r4 corrects this file to account for it (PM review r3, F04); r5 changed
  no repo file; r6 refreshes this file after NOTIF-13's closure moved the ledger (PM review r5, F06).
- **Commit count: 0.** The order forbids Git mutation; this unit is a working-tree change of **nine
  paths** (`RUN/commit-paths.txt`, all listed under "Files, grouped by risk") for the PM to review and
  commit. One of them, `docs/ledger/notifications.md`, is modified in the working tree by `pm-unit`,
  not by the executor (see "Shared ledger in the commit manifest"). The approved plan file
  `docs/planning/notifications-plan-2026-09-26.md` is untracked, untouched and not in the manifest.

## r2 rebuild on current main

- `lib/notificationService.ts`, `lib/notifications/catalog.ts` and the three existing test files are
  byte-identical between the r1 base `a81ebf1d2` and this base (`git diff a81ebf1d2 HEAD` is empty for
  them); main's newer commits touch other areas only. So the r1-approved diff for the eight paths applied
  cleanly, and every hunk was re-read against this checkout's service, catalog, feedback route and
  meeting finalize/recipients callers. No main behavior is dropped and no conflict needed a judgment.
- `origin/main` has since moved to `53a22c6e9`; its diff from `ec96c0dba` does not touch these paths
  (per the order). `c3f449c52` (NOTIF-04) is still not on main: this unit depends on it (`getCatalogEntry`,
  `NOTIFICATION_CATALOG`) and must land after it.
- One r2 addition to the Playwright spec (order r2 D5 asks for reload and empty state): the recipient
  first sees the empty bell, the four events then run as their own serial test, and the desktop test
  reloads and re-checks all four items. 3 → 5 tests.

## Shared ledger in the commit manifest (r3, refreshed in r6)

`docs/ledger/notifications.md` is the ninth manifest path because `pm-unit precheck` requires every
changed file to be declared (r2 failed `declared_all` on it). Its whole delta from HEAD is 7 added and
3 removed lines — three rows changed and four events appended — all written by `pm-unit`. The executor
never wrote, reordered or attributed a ledger line, and no round touches the file.

| Written by | Row change | Event appended |
|---|---|---|
| `pm-unit`, N1-03 reopen for this rebuild (3 s before the r2 dispatch) | N1-03 `todo` → `in-progress`, NOTIF-06, 2026-09-30 | `2026-09-30T02:35:26-03:00 · NOTIF-06 · IN-PROGRESS · Reopen N1-03 …` · token `ls-0dda282e71` |
| `pm-unit begin`, NOTIF-13 r0 dispatch (another unit) | N3-02 `blocked` → `in-progress`, NOTIF-13, 2026-09-30 | `2026-09-30T02:49:43-03:00 · NOTIF-13 · IN-PROGRESS · NOTIF-13 r0 dispatched (pm-unit begin)` · token `ls-86e6a189d2` |
| `pm-unit`, NOTIF-13 r1 closure (another unit, after the r5 packet was frozen) | N3-02 `in-progress` → `done`, NOTIF-13, 2026-09-30 | `2026-09-30T04:15:03-03:00 · NOTIF-13 · DONE · NOTIF-13: unify email rendering and sender validation` · token `3deb245e5aa1` |
| `pm-unit`, PM release of the dependent item by that closure | N3-03 `blocked` → `todo`, no unit, 2026-09-26 → 2026-09-30 | `2026-09-30T04:15:03-03:00 · PM · TODO · N3-03 is free again: N3-02 finished.` · token `3deb245e5aa1-free-N3-03` |

Against HEAD the three rows read: N1-03 `todo` → `in-progress`; N3-02 `blocked` → `done` (through
`in-progress`); N3-03 `blocked` → `todo`.

Verified in r3 and recomputed in r6 on in-memory copies:

- Working file sha256 `c5e2b3b2…f0da` = the hash `pm-unit` recorded at the r6 dispatch.
- Minus the 04:15:03 closure and release (N3-02 and N3-03 rows, two events) = `b0aacdd4…65c4`, the
  hash `pm-unit` recorded at the r3, r4 and r5 dispatches.
- Minus the NOTIF-13 dispatch row and event = `c57cb53c…f65d`, the hash `pm-unit` recorded at the r2
  dispatch.
- Minus the N1-03 row and event as well = HEAD's file (`a333bbf6…7dee`), byte for byte.
- Token `3deb245e5aa1` is NOTIF-13's closure record (`runs/NOTIF-13/closure-r1-3deb245e5aa1.json`):
  unit NOTIF-13, round 1, ledger item N3-02, the same message as the DONE event, `ledger_done`
  04:15:03, code commit `f95c1d584` on `fix/notif13-render`, `ledger_commit` `none`.
- The workflow index `ledgers/NOTIF.json` agrees: N1-03 `in-progress`/NOTIF-06 at 02:35:26, N3-02
  `done`/NOTIF-13 at 04:15:03, N3-03 `todo`/no unit at 04:15:03. The NOTIF-13 r0 dispatch record is
  stamped 02:49:43 for item N3-02.

## Objective and scope (from orders r0, r1 and r2; unchanged by r3–r6)

Resolve the notification email choice in the approved order — mandatory event, non-default category
mode, legacy suppression, catalog default — and wire it into the live synchronous `NotificationService`
path while the outbox is off: `digest` sends immediately, `off` suppresses. In-app stays independent.
The separate meeting-summary send keeps its legacy any-false suppression and applies the `community`
category choice to its recipient filtering. A `default` category row restores legacy suppression.

**In:** the pure resolver, `createNotification`'s email decision, `getCommunityRecipients` filtering,
tests, one Playwright journey. **Out:** preferences API/page, outbox RPC/worker/digest, provider
renderer, meeting-summary content, schema/catalog/legacy-table edits, producer migration, flag cutover,
release.

## Live behavior changes — call out in release notes

1. **`system_update` stops sending email by default.** The catalog default is `off`, so with no
   `system` category row the admin system-update broadcast (`pages/api/admin/system-updates.ts`) now
   creates bell items only. A user who sets the `system` category to immediate or digest gets it again.
2. **Every other mapped event with a `digest` catalog default** (`course_completed`, `module_completed`,
   `new_feedback`, `qa_test_failed`, `data_quality_alert`) still sends immediately, as before (compat).
3. **A failed preference read now suppresses email** (it used to send). This applies to the legacy
   read, the category read and, for the meeting summary, either read (then no recipient gets it and the
   finalize dialog's preview count is 0). The in-app row still goes out. The mandatory event still sends.

## Files, grouped by risk

**Medium — the shared notification path and the meeting-summary recipients**

- `lib/notificationService.ts` *(+125/−19)* — `resolveEmailChannel` (kill switch first, then category
  read, then resolver); `getNotificationPreference` flags `lookup_failed` instead of silently defaulting;
  `getCommunityRecipients` reads `user_notification_category_prefs` for `community` and applies the
  resolver per user, failing closed on a returned error, a rejection or a throw; one shared
  `isEmailKillSwitchOff`.
- `lib/notifications/resolve-preference.ts` *(new, 60)* — pure precedence function.

**Low — shared workflow ledger, written by `pm-unit` and not by the executor**

- `docs/ledger/notifications.md` *(+7/−3)* — the three rows and four events in "Shared ledger in the
  commit manifest". Documentation only. The risk is bookkeeping: this unit's commit carries NOTIF-13's
  N3-02 `done` row, its dispatch and DONE events and the N3-03 release next to N1-03's reopen, while
  NOTIF-13's code (`f95c1d584`, `fix/notif13-render`) is not on this branch — so on this branch alone
  the ledger says N3-02 is done before its code arrives. Any later `pm-unit` event changes the file and
  the manifest digest again (it did once, at 04:15:03), which then needs this section refreshed and a
  new UI run and precheck.

**No product risk**

- `__tests__/lib/notifications/resolve-preference.test.ts` *(new, 31 tests)*
- `__tests__/lib/notificationService.email.test.ts` *(+26 tests, fake extended with the category table)*
- `__tests__/lib/notificationService.getCommunityRecipients.test.ts` *(+7 tests)*
- `__tests__/api/feedback/notify-admins.test.ts` *(fake answers the category table; one read-error
  assertion moved to the N1-03 rule; r1)*
- `tests/e2e/notification-preference-compat.spec.ts` *(new, 5 tests; r2 added empty state and reload)*
- this file

## Test evidence

Full logs: `RUN/evidence/` (`RUN` = `pm-workflow/runs/NOTIF-06`). All under `mise exec node@22.16.0 --`.
r0 delivered with 6 `notify-admins.test.ts` failures; r1 repaired them. r2 re-ran everything on the
current-main base (isolated stack `notif06main`, DB 55242, app 3104). r3 changed no repo file; its
column is the final evidence for the product and test files on the nine-path manifest.

| Suite | r2 baseline (untouched b1ed3ae10) | r2 final (eight paths) | r3 final (nine paths) | r1 final (a81ebf1d2) |
|---|---|---|---|---|
| Focused (4 files incl. `notify-admins.test.ts`) | 3 files, 85 passed | 4 files, 149 passed | 4 files, 149 passed (re-run) | 4 files, 149 passed |
| `npm test` | 372 files, 9979 passed, 1 skipped, 0 failed | 373 files, 10043 passed, 1 skipped, 0 failed | reused from r2 | same as r2 final |
| type-check / lint (0 warnings) / guard:migrations (67 files) | exit 0 | exit 0 | exit 0 (re-run) | exit 0 |
| build, synthetic loopback `NEXT_PUBLIC_*` | exit 0 | exit 0 | reused from r2 | exit 0 |
| `test:db` (isolated) | 53 files, 5266 PASS | 53 files, 5266 PASS | reused from r2 | 53 files, 5266 PASS |
| Playwright via `pm-unit ui-run` | n/a | 5 passed | 5 passed (re-run) | 3 passed |
| `pm-unit precheck` | n/a | FAIL 6/7: ledger changed but not declared | PASS 7/7 | PASS 7/7 |

- **r3 reuse basis:** the eight non-ledger paths had the same sha256 as in r2's final state (six of
  them equal to the r1 commit `0e75ae586`), with the same HEAD, `package-lock.json`, `node_modules`,
  Node v22.16.0 and private stack. No code, test or script references the ledger path (`git grep`).
- **r3 precheck and scoped UI** ran on the nine-path digest `07fb04de…b0c2` (`RUN/exec-r3-precheck.json`,
  `RUN/ui/20260930-033644-3462071`): one synthetic docente with no school, desktop 1366×768 and mobile
  390×844, six screenshots, every fixture removed (`remaining` 0), app env `NOTIFICATION_EMAIL_ENABLED=false`
  and no `RESEND_API_KEY`.
- **r4** edited only this file, so its hash and the manifest digest differ from r3's. Its precheck
  failed 6/7 on the order's allowlist, not on a file (`RUN/executor-report-r4.md`).
- **r5** changed no repo file: focused suites 149 passed, scoped Playwright 5 passed and precheck 7/7 on
  digest `f9c26949…6c33` (`RUN/executor-report-r5.md`). That digest went stale at 04:15:03 when the
  ledger moved.
- **r6** edits only this file, for the moved ledger. A file cannot carry its own digest: the r6
  re-runs on the final state (focused suites, the scoped Playwright spec and
  `pm-unit precheck NOTIF-06 6`) are recorded in `RUN/executor-report-r6.md`.

## r1 repairs (PM review r0)

- **F01** — `__tests__/api/feedback/notify-admins.test.ts`: its fake Supabase now answers the category
  table with a normal missing row, so the admins' `new_feedback` email follows the catalog `digest`
  (sent now in compat mode); D1 also asserts the per-admin `(user_id, qa_support)` category read. The
  old `R2-D1 … falls back to both channels` test became `… keeps the in-app row, suppresses the e-mail`:
  in-app still delivered, zero provider calls, `preference_unavailable` logged, sensitive-value checks
  kept. The tampering, refusal and exception tests are unchanged.
- **F02** — `getCommunityRecipients`: a rejected or throwing read of either preference table is now
  caught like a returned `{error}`: no recipients, only `{status:'preference_unavailable'}` logged, no
  rejection reaches the finalize caller. Four new `D8` tests (each table × rejects/throws); they fail
  against the r0 code (`RUN/evidence/r1-mutations.log`).

Mutation check (r0, focused suites): dropping the mandatory rule, ignoring a read failure, applying a
category mode to unmapped events, suppressing compat digest, ignoring the category in the meeting
summary, ignoring its read error, or defaulting a legacy read error to send — each fails 1–6 tests.

## Scrutinize these hardest

1. **r2: the rebuild is the r1 diff re-applied.** Confirm the "byte-identical base" claim above and that
   NOTIF-04 lands first; if `lib/notificationService.ts` changes on main before merge, this needs a rebase.
2. **Mandatory beats a read failure.** `session_cancelled` sends even when the preference reads fail,
   because no stored value can disable it. The order says "suppress email on read failure"; I read that
   as applying to what a preference can change. Confirm.
3. **Invalid stored mode is treated as `default`,** not as a read failure. It falls through to the
   legacy row and the catalog default, so it can never opt in over a legacy false or a catalog `off`; it
   can still send when both say send. The DB CHECK makes this unreachable today.
4. **Meeting summary fails closed on a read error** — nobody is emailed and the preview shows 0. Before,
   a legacy read error was ignored and everyone was emailed.
5. **The e2e capture seam.** The journey runs the real `triggerNotification` path in-process and swaps
   only `createNotification`'s `deps.transport` for a capturing function; it proves the provider boundary
   decision, not a real send. The app server keeps `NOTIFICATION_EMAIL_ENABLED=false`.

## Known limitations

- The legacy row is still read before the kill switch (the in-app channel needs it); the kill switch
  precedes the category read, the recipient lookup and the provider.
- Captured email links use the spec process's base URL (`http://localhost:3000`), not the app port.
- An unmapped event, or a notification with no `event_type`, never reads a category row (by design).
- No outbox write exists anywhere in this change; `NOTIFICATION_OUTBOX_DELIVERY` is not referenced.
- The ledger events' two `ls-…` tokens could not be recomputed from any record the executor may read;
  their provenance rests on the hash chain, the timestamps and the workflow index above. The closure
  token `3deb245e5aa1` was matched to NOTIF-13's closure record.
- `npm test`, build and `test:db` were last run in r2 and not re-run in r3–r6 (no product or test
  byte changed since).
