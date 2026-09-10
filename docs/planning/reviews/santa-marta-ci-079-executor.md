# SM-CI-079 r1 — pgTAP 079 calendar failure — executor report

Executor: Claude Code, resumed release-operator context `a93c2ccb-d43c-40f0-a5e8-920fc9266265`,
model claude-opus-5 (effort medium requested, not independently confirmable in-session), fallback
NONE. PM_REVIEWER: Codex. Date 2026-09-10 (America/Santiago, UTC-3).
Authority: Brent's 2026-09-10 Santa Marta autonomous grant; order SM-CI-079 r1. New bounded baseline
CI defect: initial execution 1, remediation 0 of cap 2. B1b counters (1, 2/2) unchanged, not reset.

**Status: READY_FOR_REVIEW.** SQL-test-only change, uncommitted. No product, auth, RLS, migration,
application or config change. No commit/push/PR update/merge/deploy/hosted operation/deletion.

## 1. State lock (observed)

Root `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, HEAD
`10983e7fe1a6f579cef6ba9a1407847543fad6ec` = live `origin/fix/horas-rep`; live `origin/main`
`b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46` unchanged. Clean worktree at intake.
Failure log `.../evidence/b1b-ci-pgtap-failed.log` sha256
`fc5807b2e3ef95ad4576d1d429cbdfc2c08bb60f18b5e6e1541710f4ef52e3a6`: CI run 34467890545, 079 at
2026-09-10T10:49:28Z, tests 102/116/118/119, have `3/3/1/12/3`, want `3/3/1/12/4`.

## 2. Cause — calendar-dependent literal, not a product defect

`pg_temp.view_counts(path a)` = assigned / user summary / performance / **daily rows** / **monthly
rows**. Monthly keys (`learning_path_monthly_summary`, migration `20260908180600`) are the Santiago
months of grain dates (`lp_activity_date(session_start)`) UNION the months of daily-summary dates,
which include assignment dates (`lp_activity_date(assigned_at)`) and completion dates. No `now()` is
involved in the keys; the views aggregate correctly.

The fixture, however, is partly `now()`-relative: assignments at −40/−10/−2 days, retention sessions
at −20/−21/−22/−30 days, the stale open session at −31 days (settled by `close_stale`, grain on its
start day), and section 7's predecessor at the transaction clock. These nine days always fall on
nine distinct Santiago days, but how many calendar months they span depends on the run date. The
literal `4` was written on 2026-09-08 (commit `ce24dba2`), when −40 days was July 29: months
{2026-03, 07, 08, 09}. Local dump at 2026-09-10T10:55Z (`diag-keys.log`): u1's assignment at −40
days is `2026-08-01 10:55Z` = Santiago **2026-08-01**, so July disappears: months {03, 08, 09} = 3.

**Exact onset, timezone causal:** `now() - 40 days` reaches Santiago Aug 1 at 2026-08-01T04:00Z
(UTC-4 in August), i.e. `now()` ≥ **2026-09-10T04:00:00Z**. Santiago's own Sep 10 began at 03:00Z
(UTC-3 since the 2026-09-06 switch), so between 03:00Z and 03:59:59Z it was already the 10th locally
while the old test still passed. DB zone rules verified (`tz-rules.log`, PostgreSQL 17.6):
08-01 03:59:59Z → Jul 31 23:59:59; 04:00Z → Aug 1 00:00; 10-01 02:59:59Z → Sep 30; 03:00Z → Oct 1.

**Not a one-off:** hourly sweep 2026-09-01 → 2027-08-31 (`calendar-sweep.log`) — the old literal
holds in only 2,760 of 8,760 hours; 3 months in the other 6,000. It flips at each Santiago month
start (04:00Z winter / 03:00Z summer) and about 40 days later (first changes 09-01T04:00Z → 4,
09-10T04:00Z → 3, 10-01T03:00Z → 4, 10-11T04:00Z → 3 ...). Daily rows are 12 at every date.

No security/product flaw was found: the gate, grants and monthly aggregation behave as specified.

## 3. Repair — `supabase/tests/079-c3-reporting-retention.sql` only

sha256 before `6f5b093a24a98992be9b997b1cd47cc930529ebaf13f9dbbc98a96c4a8604f55` (HEAD), after
`7406a7e032931cf4cc5fcc98c893b248133a0bec9ac1020f6d12c010ddb78f46`. `git diff --stat`: 1 file,
+84 −6. `git diff --check` clean. Plan 121 → 129.

1. **Section 8, independent fixture oracle.** Temp table `c3_calendar_oracle` lists every event that
   creates a path-a day key, from the fixture inputs: 5 March sessions and 3 March completions as
   the same literals the fixtures insert, the nine `now()`-relative expressions exactly as written
   above, and section 7's predecessor `session_start` read from its session row. Bucketing uses
   `AT TIME ZONE 'America/Santiago'` directly — never the views and never `lp_activity_date`.
   Excluded, with comments: u2's −25-day session (grain deliberately deleted in 5) and u2's new open
   session from 7 (unsettled, no grain). `\gset` yields `c3_days`, `c3_expected_counts`
   (`'3/3/1/' || days || '/' || months`), `c3_day_keys`, `c3_month_keys`.
2. The four `'3/3/1/12/4'` literals (unflagged admin, service_role, postgres, flag cleared) now expect
   `:'c3_expected_counts'`. Assigned 3 / user 3 / performance 1 stay literal in that string.
3. Three added section-8 assertions: oracle day count `12` (literal invariant); admin daily row keys
   = oracle days; admin monthly row keys = oracle months (set equality, not only counts).
4. **New section 9, fixed instants, deterministic on every run date,** on a dedicated path
   `…000c` read by nothing earlier. Five assertions: winter boundary and summer boundary literals of
   `lp_activity_date`; three boundary sessions settle; exact daily keys; exact monthly figures.

Unchanged: every flagged/learner/anon assertion (`0/0/0/0/0`, `1/1/0/0/0`, throws), grants,
catalog, sections 1–7, including section 3's literal March monthly row `2/5/125/3/0.10/25.00`.

### Expected-data derivation

Section 8 day keys (oracle, 12 on any date): 2026-03-10 (s1 13:00Z, s3 13:20Z, s2 14:00Z,
s5 16:00Z, u1 K1 completion 15:00Z; UTC-3 so same day); 2026-03-11 (s4 at 03-12T02:30Z = 23:30 on
the 11th; u3 K1 completion); 2026-03-12 (u3 K2 completion 15:00Z); nine distinct `now()`-relative
days {−40, −31, −30, −22, −21, −20, −10, −2, 0}. Months = 2026-03 plus the distinct months of those
nine days: 3 or 4 depending on the date. At this run: 08-01, 08-10, 08-11, 08-19, 08-20, 08-21,
08-31, 09-08, 09-10 → `3/3/1/12/3`; local dump matches exactly.

Section 9 (fixture → Santiago local → key):

| Event | Instant (UTC) | Santiago | Day | Month source |
|---|---|---|---|---|
| u1 assignment | 2026-08-01 03:30 | Jul 31 23:30 (UTC-4) | 07-31 | July: assignment only |
| u1 session 10 min | 2026-08-01 04:10 | Aug 1 00:10 | 08-01 | August grain |
| u2 session 10 min | 2026-09-01 03:30 | Aug 31 23:30 (UTC-4) | 08-31 | August grain |
| u2 session 10 min | 2026-10-01 02:50 | Sep 30 23:50 (UTC-3) | 09-30 | September grain |
| u2 assignment | 2026-10-01 03:30 | Oct 1 00:30 (UTC-3) | 10-01 | October: assignment only |

Expected daily `2026-07-31,2026-08-01,2026-08-31,2026-09-30,2026-10-01`; monthly
(users/sessions/assignments) `2026-07 0/0/1, 2026-08 2/2/0, 2026-09 1/1/0, 2026-10 0/0/1`.
The 2026-09-06 DST switch lies between the August and September events.

## 4. Validation — local disposable stack only

Refusal guard `/tmp/b1b-validation/assert-local-target.js` passed before every DB command (loopback,
API 54461, DB 54462, no hosted domain); the container `supabase_db_b1b-local-20260909` was checked
to be the one on 54462. `supabase` CLI 2.110.0 (same pin as CI Gate 3). Every variant is a
BEGIN…ROLLBACK copy in `/tmp/sm-ci-079/variants`; the worktree test is not modified by the harness.

| Run | Result |
|---|---|
| Baseline HEAD 079, real now (10:53Z) | **FAIL** 4/121: 102, 116, 118, 119, have `3/3/1/12/3` — same as CI (`repro-baseline.log`) |
| Repaired 079, final bytes | **PASS 129/129**, exit 0 (`final-focused-079.log`) |
| Full pgTAP, final bytes | **PASS, 42 files, 4124 tests**, exit 0 (`final-full-pgtap.log`) |

The new count is 4124 = the retained reported baseline 4116 + 8 new assertions in 079. The 4116
figure remains the prior B1b evidence and is not relabelled.

Harness (`harness.py`, `harness-results.json`) on the final bytes. Anchor variants replace only the
fixture-calendar expressions (`now() - interval '{40,31,30,25,22,21,20,10,2} days'`; 25 substitutions
in the repaired file, 17 in HEAD) with a fixed instant. Retention boundaries, `close_stale` and the
views keep the real `now()`.

| Variant | Repaired 079 | HEAD 079 |
|---|---|---|
| real now 2026-09-10 ~11:0xZ | 129/129 | 117/121, fails 102/116/118/119 |
| anchor 2026-09-10T03:59:59Z (Santiago already 10th) | 129/129 | 121/121 |
| anchor 2026-09-10T04:00:00Z | 129/129 | 117/121, same four |
| anchor 2026-09-09T12:00Z | 129/129 | 121/121 |
| session TimeZone America/Santiago, Pacific/Kiritimati (+14), Etc/GMT+12 | 129/129 each | — |

### Negative controls — mutations inside the rolled-back transaction (repaired test)

| Mutation | Result |
|---|---|
| `lp_activity_date` = fixed UTC-3 | 3 fail: 125 winter boundary, 128 daily keys, 129 monthly (have `2026-08 1/1/1,2026-09 1/2/0,2026-10 0/0/1`) |
| `lp_activity_date` = fixed UTC-4 | 4 fail: 23 (Jan summer), 126 summer boundary, 128, 129 |
| `lp_activity_date` = UTC day | 8 fail: 22, 32, 49, 50, 125, 126, 128, 129 |
| monthly keys from grain only (assignment/completion months dropped) | 1 fail: 129 (have `2026-08 2/2/0,2026-09 1/1/0`) — section 8 alone would not catch this today, section 9 does |
| `password_change_gate_ok()` removed from the monthly view | 1 fail: 111, flagged admin have `0/0/0/0/3` — gate checks retain their force |
| oracle missing the −40-day assignment | 6 fail: 101 (11 days), 103, 104, 119, 121, 122 — the oracle is load-bearing, not vacuous |

Test numbers shift after the edit: old 102/116/118/119 are now 103/119/121/122.

## 5. Evidence

`/tmp/sm-ci-079/` (retained, nothing deleted): `repro-baseline.log`, `diag-keys.log`/`.sql`,
`tz-rules.log`, `calendar-sweep.log`, `final-focused-079.log`, `final-full-pgtap.log`, `harness.py`,
`final-harness.log`, `harness-results.json`, `variants/*.sql|log`, `monthly-viewdef.txt`; earlier
pre-whitespace-fix runs `focused-079-new.log`, `full-pgtap.log`, `harness.log` retained as history
(identical results; the final edit only added a space after three commas). Manifest `SHA256SUMS.txt`
(26 entries) sha256 `071fdf0639217f7c51cfc2eba8a99d384299131cbb0d8c3dcf0860acd622e1ca`.

## 6. Scope, resources and stop

Written: the 079 test and this report only. `docs/reviews/santa-marta-autonomous-run-2026-09-10.md`
shows a PM continuation entry (mtime 07:58), not written by me; left untouched and not to be staged
by me. Other worktrees, the B6b writer in `/Users/brentcurtis/dev/wt/sm-nav-dir`, the preview on
:3107 (pid 83306, still listening) and the local stack were not altered beyond rolled-back test
transactions. No JS unit/build rerun (SQL-test-only). No commit or push pending PM independent
review; hosted CI will rerun all gates after the PM authorizes publication. Executor writes stop.
