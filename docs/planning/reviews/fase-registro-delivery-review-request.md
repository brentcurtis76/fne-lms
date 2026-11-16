# Automatic delivery of published Registros

Branch: `fix/registro-deliver`. Base: `c8741ba18df96edb91231e2d9ff16eeefb3b679c`.
One implementation commit, rebased after the controlled publisher prerequisite.

## Approved scope

The owner requested an urgent production fix on 2026-11-16: existing assigned
teachers and school vía responsables must receive newly published matching
Registros, including historical gaps. A separate new template is delivered;
republication of the same template preserves existing work. The owner explicitly
accepted preserving pending work as well as started/completed work.

The missing delivery occurred because publication did not revisit assignments
created before a template was available. A one-minute cron now reconciles the
persisted assignments against published, nonarchived templates. This also covers
publication through tools other than the admin HTTP endpoint.

## Changes and risk

- Database: one additive migration adds a service-only cursor table and bounded
  reconciliation function. Fresh assignment, recipient role, school, grade, vía,
  context year and current snapshot checks precede creation. Existing course and
  school assignment locks serialize delivery with assignment/replacement. Stable
  template identity, across every snapshot and status, prevents duplicates.
- Server: authenticated cron invokes one batch of at most 100 candidate pairs;
  Vercel runs it every minute. A global transaction lock prevents overlapping
  sweeps. A durable ordered cursor advances past failed candidates, then wraps
  for retries. Counts report created/skipped/failed work without person data.
- Tests: SQL permission/integrity/preservation tests, cron authentication tests,
  two existing cron-list expectations extended for the new job, and a mandatory
  browser test of cron→database→teacher list/sidebar.

No existing instances, grants, responses or assignment rows are updated by the
worker. No notifications are sent. No UI or publication validation changes.

## Review focus

1. Lock compatibility with existing course and school assignment/replacement RPCs.
2. Same-school active recipient checks and service-only access to the worker/state.
3. Stable-template deduplication, including legacy school instances without links.
4. Cursor progression under permanent errors and concurrent publication/assignment.
5. Preservation of every existing status, snapshot, response and co-assignee grant.

## Validation

- Type checking, zero-warning lint, and production build: PASS.
- Cron unit suite on final logging behavior: 13/13 PASS.
- Clean migration replay and full pgTAP: 80 files, 8,342 assertions PASS, including
  40 reconciliation assertions. An initial run with browser fixtures loaded caused
  unrelated global-count failures; the clean replay removed that interference.
  The new table's forced-password catalog guard was added before the passing run.
- Real browser delivery test: PASS. An assignment predates publication; the real
  cron creates the grant, the authenticated teacher API and sidebar/list expose
  the Registro, and republication preserves the original started instance.
- Final lock hardening: 41/41 focused SQL assertions PASS. Live local concurrency
  probes PASS for overlapping workers, immediate skip and cursor advance on a
  locked course, and retry after the actual teacher-replacement RPC granting only
  the new teacher. The full DB suite above predates only this lock adjustment.
- Full Vitest run: 550 files; 18,344 passed, 12 preexisting skips, and two failures
  because cron-list expectations did not yet include the new job. Both expectations
  were extended without weakening them; final rerun of both affected suites plus
  the delivery suite: 120/120 PASS. No other unit failures.
- Mandatory Playwright run: 334 passed, one failure because the local build's
  configured public URL was `generafix.localhost` while the test expected
  `localhost`. All 27 mandatory specs ran with no skips. Final corrected-environment
  production build PASS; complete authentication-lifecycle suite plus real Registro
  delivery test rerun without retries: 7/7 PASS. This closes the sole browser failure.
- Browser-boundary, staged-secret and migration guards: PASS.

The original release PR #183 passed every remote CI check and publisher rehearsal.
The publisher prerequisite was then published through PR #185. This release is
rebased onto that production baseline; only documentation needed conflict
resolution. Product, migration and test contents are unchanged from the reviewed
commit `3485bf6a48693f188d38879355e3b93eafcda0a9`. The final combined release runs
remote CI and publisher rehearsal again before publication.

## Independent review

Claude Opus 5.5 reviewed the implementation independently and returned APPROVE.
It identified a possible lock cycle between a multi-course sweep and a school
context save. The final function uses `FOR UPDATE NOWAIT` for course rows and a
500ms lock timeout elsewhere. Failed pairs advance the cursor and retry later.
The reviewer also suggested aggregate failure logging, now implemented and tested.
Opus reviewed both fixes again and returned APPROVE, no blockers. These were code
reviews; the reviewer did not execute tests. Test results above are separately
recorded from actual execution.

## Operational limits

Delivery is asynchronous, normally on the next minute tick; large backlogs take
multiple batches. A missing school context, snapshot or eligible recipient is
reported as a failed pair and retried on the next scan cycle. This does not repair
unrelated malformed existing instances or change their grants. Annual rounds and
replacement of already-started teachers are outside this urgent fix.

Migration creates definitions and one cursor row only; production delivery begins
when the new application cron is deployed. The existing controlled publisher
rehearses/applies the migration before merging the application. Rolling back the
application stops future automatic delivery; already-created Registros remain.
