# Fase A2 — review request

**Branch:** `phase/a2-leads-db`
**Base:** `origin/main` @ `baec41a`
**Commits:** 2 — one DB commit (migration + pgTAP + evidence) + one docs commit (this file + ledger)
**Executor round:** 1

---

## Objective and scope (copied from PLAN.md v4 §Phase A2)

> **Scope (DB-agent round):** migration + `supabase/tests/030-pasantias-leads-rls.sql`.
> **Acceptance criteria:** [A1] table + split consent columns and CHECK; [A2] RLS per D-04 (authenticated admin SELECT-only policy; no INSERT/UPDATE/DELETE policies for any authenticated role; no anon policies); [A3] migration additive, forward-only rollback wording; [A4] pgTAP (~16 asserts); [A5] `npm run test:db` + gates green.

Out of scope, and untouched: any API route, page, `lib/` helper, or type. This
round is two SQL files plus documentation.

## Design, in one paragraph

`public.pasantias_leads` is created in a single additive migration with the
column set the prompt specifies verbatim, four CHECK constraints, one composite
UNIQUE, two indexes, and the shared `public.set_updated_at()` trigger. RLS is
enabled and exactly **one** policy exists: `pasantias_leads_admin_select`,
`FOR SELECT TO authenticated`, whose `USING` clause is the same
`user_roles`-EXISTS admin test that `tractor_signups_admin_all` uses. There is
deliberately **no `WITH CHECK` anywhere on the table**, which is what makes the
D-04 posture per-operation rather than per-table: an authenticated admin can
read and nothing else, and every write path is service-role. The status CHECK
constrains the *set* of legal statuses only — the transition graph stays in the
app layer per D-03, and no SQL in this migration knows about transitions.

## Files changed, grouped by risk

### Higher risk — new security surface

| File | Δ | Note |
|---|---|---|
| `supabase/migrations/20260731140500_add_pasantias_leads.sql` | +117 | The table, its constraints, the trigger, `ENABLE ROW LEVEL SECURITY`, and the single SELECT-only policy. Header comment carries the full per-operation access matrix and the forward-only rollback rule. |

### Test surface

| File | Δ | Note |
|---|---|---|
| `supabase/tests/030-pasantias-leads-rls.sql` | +355 | 21 asserts across four role tiers plus three structural asserts. Modelled on `020-tractor-signups-rls.sql` (BEGIN/ROLLBACK, `pg_temp` role helpers, `throws_ok '42501'` for blocked INSERT, `is_empty` for blocked UPDATE/DELETE). |

### Documentation / evidence

| File | Δ | Note |
|---|---|---|
| `docs/plan/evidence/a2/030-pasantias-leads-rls.tap.txt` | +33 | Per-assert TAP output, captured after `supabase db reset` so the schema under test is exactly what `supabase/migrations` declares. |
| `docs/planning/reviews/fase-a2-review-request.md` | new | This file. |
| `docs/plan/LEDGER.md` | +1 entry | Round entry. |

## Test evidence

```
npm run test:db      → Files=5, Tests=47, Result: PASS   (030 file: 21/21)
npm run type-check   → clean
npm run lint         → clean (--max-warnings=0)
npm test             → 232 files, 3445 tests, all passed
npm run build        → succeeded through page-data collection
```

`supabase db reset` was run before the recorded `test:db`, so every migration —
including this one — was applied from scratch in order, not hand-patched onto a
live local schema.

## The five things to scrutinise hardest

1. **Idempotency without `DROP`.** The repo forbids `DROP`, so the policy is
   created inside a `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_policies …) $$`
   block rather than the usual `DROP POLICY IF EXISTS` + `CREATE POLICY`. That
   is a judgment call: it keeps the migration re-runnable and hard-rule-clean,
   but it also means a *pre-existing policy of the same name with different
   text would be silently left in place*. On a brand-new table that cannot
   happen; if you disagree with the trade, this is the line to argue about.
   `CREATE OR REPLACE TRIGGER` (PG 14+; local is 17.6) is used for the same
   reason.

2. **Grants are inherited, not stated.** The migration says nothing about
   `GRANT`/`REVOKE`. It relies on Supabase's default privileges granting
   `anon`/`authenticated`/`service_role` table access, with RLS as the only
   gate — exactly the `tractor_signups` posture. The pgTAP suite proves the
   *effect* (asserts 4–14), but if the reviewer wants the grant set pinned
   explicitly in SQL rather than proven behaviourally, say so.

3. **The policy inventory assert (asserts 2 and 3).** [A2] is a negative
   claim — "no other policies exist" — and negative claims are the ones tests
   usually fail to make. I asserted it directly off `pg_policies`
   (`policyname|cmd|roles` aggregated to one string, plus a count of policies
   with a non-NULL `with_check`) rather than pgTAP's `policies_are` /
   `policy_cmd_is`, to avoid depending on the installed pgTAP version. Check
   that this really pins what [A2] means.

4. **Assert count drifted from the prompt's "~16" to 21.** The five extra
   asserts are: the two structural policy asserts above, `consent_notice_version`
   NOT NULL (the prompt named the consent columns plural), docente `DELETE`,
   and the `set_updated_at` trigger check — the last because the trigger is in
   the [A1] spec and nothing else in the suite would have caught its absence.
   No assert was dropped from the prompt's list.

5. **`service_role` impersonation.** The suite reaches the write path with
   `set_config('role','service_role',true)`, relying on that role's `BYPASSRLS`
   attribute (verified: `rolbypassrls = t` locally). If the reviewer considers
   this an unrepresentative stand-in for the real service-role JWT path, the
   constraint asserts (15–20) would need to move to an API-level test in A5.

## Rollback (forward-only)

There is no destructive rollback for this phase and none is offered. If A2 must
be abandoned, the path is: **stop the consumers, leave the schema**. No
`DROP TABLE`, no `DROP POLICY`, no `TRUNCATE`, no destructive `ALTER` — those
are repo hard rules, and this table will hold real consent evidence the moment
A5 ships. To retire it, ship a *forward* migration that renames nothing and
removes nothing; disable the write path in the app layer instead. Reverting the
branch before merge is of course free, since nothing outside these two SQL files
depends on it yet.

## Known limitations / deferred

- **No transition enforcement in SQL.** Intentional, per D-03/D-04: the
  `status` CHECK admits any of the four values, so `new → converted` is legal at
  the storage layer. `canTransitionLead()` in `lib/pasantias/leads.ts` (A5) is
  the only guard, and it is only authoritative because D-04 leaves no
  authenticated write path. If A5 ever adds one, this assumption breaks.
- **No `school_id`.** Per D-11 (owner-approved tenancy exception) comms data is
  FNE-global.
- **No FK from `cohort` to anything.** Cohorts are typed constants (A1), not a
  table; `cohort` is free text carrying `'oct-2026'`.
- **`num_people` upper bound is 60**, per the prompt. No product rationale is
  recorded in the plan for that number; flagging it rather than inventing one.

---

# Round r2 — remediation of REVIEW-A2.md

**Executor round:** 2 · **Branch:** `phase/a2-leads-db` (continued) · **Base:** `origin/main` @ `baec41a`
**Scope:** the same two SQL files, edited in place. No second migration, no new
file, nothing outside `supabase/`. Round r1's schema, constraints, trigger,
policy and consent contract are unchanged.

## The two findings and how they are closed

### [B1] `anon` and `authenticated` could TRUNCATE the table

Confirmed independently before touching anything —
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES
TO anon/authenticated` in the baseline (lines 26108–26109) gives every new
public table the full privilege set, and `information_schema.role_table_grants`
listed `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` for both roles.

The migration now revokes, after the policy block:

```sql
REVOKE ALL ON public.pasantias_leads FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pasantias_leads FROM authenticated;
```

`authenticated` keeps `SELECT` (the policy gates the rows); `service_role`'s
grants are untouched. Post-reset catalog state:

| grantee | privileges |
|---|---|
| `anon` | *(no row at all)* |
| `authenticated` | `SELECT` |
| `service_role` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` |
| `postgres` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` |

The header comment now documents the posture as **two layers** — GRANTs decide
which commands a role may attempt at all, the policy decides which rows the
surviving `SELECT` returns — instead of presenting RLS as the whole boundary.

### [B2] The anon deny matrix was incomplete

`anon` now has all four CRUD commands plus `TRUNCATE` asserted behaviorally
(asserts 18–22), and `authenticated` gains a `TRUNCATE` denial (assert 13).

## Assert count: 21 → 30

| # | Assert | Why |
|---|---|---|
| 4 | `anon` holds no privilege at all | catalog-level [B1] |
| 5 | `authenticated` holds `SELECT` and nothing else | catalog-level [B1] |
| 6, 7 | `has_table_privilege(..., 'TRUNCATE')` false for both roles | the explicit TRUNCATE denial the amended D-04 requires |
| 8 | `service_role` keeps SELECT/INSERT/UPDATE/DELETE | proves the REVOKEs did not sever the write path |
| 13 | admin `TRUNCATE` denied | the exact probe Codex ran |
| 20, 21 | anon `UPDATE` / `DELETE` denied | [B2] |
| 22 | anon `TRUNCATE` denied | [B2] + [B1] |

## Deviation you should check first

**Eight pre-existing asserts changed their expected outcome, and this was
unavoidable.** PostgreSQL checks table privileges *before* RLS, so once the
grant is gone the command no longer reaches the policy:

| asserts | round r1 expectation | round r2 expectation |
|---|---|---|
| 10, 15, 19 (INSERT: admin/docente/anon) | `42501` *new row violates row-level security policy* | `42501` *permission denied for table pasantias_leads* |
| 11, 12, 16, 17 (UPDATE/DELETE: admin/docente) | `is_empty` — 0 rows matched | `throws_ok 42501` — permission denied |
| 18 (anon SELECT) | `is_empty` — 0 rows visible | `throws_ok 42501` — permission denied |

The prompt's wording for [B2] asked for "behavioral anon UPDATE matches-0 and
anon DELETE matches-0". After [B1]'s revocation that outcome is no longer
reachable: anon cannot match 0 rows because it cannot execute the statement at
all, and an `is_empty` on a statement that raises would abort the suite's
transaction rather than fail one assert. The asserts therefore use
`throws_ok '42501'`, which is what REVIEW-A2.md's own closure text asks for
("with the repository's correct blocked operation semantics") and is a strictly
stronger claim than matches-0. The repo convention "blocked UPDATE returns
empty" is an *RLS* convention; it does not describe a privilege denial, and the
suite header now says so.

## Test evidence (round r2)

```
supabase db reset    → all 3 migrations applied from scratch
npm run test:db      → Files=5, Tests=56, Result: PASS   (030 file: 30/30)
npm run type-check   → clean
npm run lint         → clean (--max-warnings=0)
npm test             → 232 files, 3445 tests, all passed
npm run build        → succeeded through page-data collection
```

The four JS gates cannot be affected by a diff confined to two `.sql` files;
they were run anyway and are recorded above unchanged from round r1.
Refreshed TAP: `docs/plan/evidence/a2/030-pasantias-leads-rls.tap.txt`.

## What to scrutinise hardest in this round

1. **The REVOKE list is a denylist, not an allowlist.** I revoked the six
   non-SELECT privileges from `authenticated` by name rather than doing
   `REVOKE ALL ... FROM authenticated; GRANT SELECT ... TO authenticated;`.
   Both reach the same state today; the denylist form breaks if PostgreSQL
   ever adds a new table privilege. Asserts 4 and 5 pin the *exact* resulting
   grant set, so a new privilege leaking in would fail the suite rather than
   pass silently — but if you prefer the revoke-all-then-grant form as the
   pattern B3's five tables should copy, this is the round to say so.
2. **`anon` now cannot even SELECT.** That is the intended D-04 posture (the
   public lead form posts to a service-role API route, never to PostgREST), but
   it means any future attempt to read this table with the anon key fails hard
   with a 401/403 rather than returning an empty set. A5 must not assume a
   readable-but-empty table.
3. **Assert 8 is the only thing standing between these REVOKEs and a broken
   write path.** If it were ever weakened, an over-broad revoke could sever
   `service_role` and A5 would fail at runtime rather than in this suite.
4. **Idempotency.** `REVOKE` on an already-revoked privilege is a no-op, so the
   migration remains re-runnable, consistent with the `IF NOT EXISTS` /
   `CREATE OR REPLACE` style of the rest of the file.

## Rollback (unchanged, forward-only)

Still no destructive rollback. The REVOKEs remove no object and no data —
they withdraw inherited grants — so the forward-only rule in the round-r1
section applies to this round verbatim.

---

# Round r3 — MAINTAIN closure (REVIEW-A2-R2.md's remaining finding)

**Executor round:** 3 · **Branch:** `phase/a2-leads-db` (continued)
**Scope:** the same two SQL files, edited in place, plus this section and the
refreshed TAP evidence. No third migration, no schema change, nothing outside
`supabase/` and `docs/`.

## The finding and how it is closed

Round r2 revoked `authenticated`'s non-SELECT privileges by *name*. That is a
denylist, and a denylist cannot cover a privilege that does not exist yet —
PostgreSQL 17 added `MAINTAIN`, which an enumerated revoke written against
PostgreSQL 15 leaves granted.

The migration now uses the **grant-list** form:

```sql
REVOKE ALL ON public.pasantias_leads FROM anon;
REVOKE ALL ON public.pasantias_leads FROM authenticated;
GRANT SELECT ON public.pasantias_leads TO authenticated;
```

Upgrade-proof by construction: a future release's new privilege lands on the
revoked side of the line, never the granted side. The header access matrix now
states this as the reason the form is the standard — Codex has bound B3's five
tables to the same shape.

The two grant-set pins (asserts 4, 5) moved off
`information_schema.role_table_grants` and onto `aclexplode(pg_class.relacl)`.
This is not cosmetic: the information_schema views are SQL-standard and report
only standard privileges, so a PostgreSQL-specific one is *invisible* there —
which is exactly how r2's pin passed while `MAINTAIN` was unrevoked. The ACL is
total, so the pins now hold for privileges that do not exist yet.

Asserts 8 and 9 are new, version-guarded `MAINTAIN` probes. Plan: 30 → 32.

## Read this before anything else: the prompt's PG15 premise is wrong for local/CI

The r3 prompt states as a PM-verified fact that the local stack is PostgreSQL 15
and therefore cannot exercise a PG17-only privilege. **The local and CI stacks
are PostgreSQL 17.6.** `supabase/config.toml` pins no `[db] major_version`, so
the Supabase CLI's default image applies, and CI gate 3 uses the same unpinned
`supabase/setup-cli@v1`. Only the hosted production database is 15.8 (the PM's
`select version()` was against production, and that part is correct).

Three consequences, all in the reviewer's favour:

1. **Asserts 8–9 run live rather than skipping.** The acceptance criterion
   anticipated visible skips; what the suite actually produces is two passing
   assertions on a server where `MAINTAIN` genuinely exists. That is strictly
   stronger evidence, and it means the fix is verified against the privilege
   itself rather than against its absence.
2. **The finding is closer to live than "forward-looking".** The PM's triage
   classified it as materialising only on a future upgrade. Tables created on
   the PG17 local/CI stacks carry `MAINTAIN` in their default privileges today —
   visible in the ACL dump in the evidence file. Production at 15.8 is still
   unaffected, so the severity call does not change, but the "no server we run
   has this privilege" part of the rationale does not hold.
3. **The version guard is still required**, for the opposite direction from the
   one the prompt assumed: it exists so the suite can run against the 15.8
   production server, where `has_table_privilege(..., 'MAINTAIN')` raises
   *unrecognized privilege type*.

## Why the MAINTAIN call is wrapped in a plpgsql function

`pg_temp.lacks_maintain(role_name)` exists solely to guarantee the call is not
evaluated when the guard is false. Written inline, correctness would rest on
PostgreSQL not constant-folding the expression; `has_table_privilege` is STABLE
so it would not be folded in practice, but a plpgsql function is *never* folded,
which turns a reasoned argument into a structural one. The evidence file records
a laziness proof (an exception-raising function in the untaken branch, which the
suite does not reach).

## Test evidence (round r3)

```
supabase test db  (npm run test:db) → Files=5, Tests=58, Result: PASS   (030 file: 32/32)
npm run type-check → clean
npm run lint       → clean (--max-warnings=0)
npm test           → 232 files, 3445 tests, all passed
npm run build      → succeeded through page-data collection
```

Refreshed TAP, the live ACL dump, and the sub-PG17 branch proof:
`docs/plan/evidence/a2/030-pasantias-leads-rls.tap.txt`.

**How the database was built, stated plainly.** `supabase db reset` and
`supabase start` both wedged on this machine — the CLI sat idle in `ClientRead`
at "Initialising schema...", the Docker daemon went unresponsive once and needed
a restart, and the CLI's image pulls then stalled indefinitely. The schema under
test was therefore built by applying `supabase/migrations/*.sql` in order with
`psql -v ON_ERROR_STOP=1` onto a **freshly initialised** database container —
the same three files in the same order that `db reset` applies, from scratch,
with no pre-existing objects. Two further environment repairs were needed and
are disclosed because they are the kind of thing that can manufacture a false
green:

- **`auth.uid()`** ships in the Postgres image in its pre-2021 form
  (`request.jwt.claim.sub` only); the modern form is installed by GoTrue's own
  migration `20211202183645_update_auth_uid.up.sql`, which never ran because the
  auth container could not be pulled. Every policy in the repo that calls
  `auth.uid()` fails without it — **suites 010 and 020, which this round does not
  touch, failed too**, which is how the cause was identified rather than guessed.
  That migration's SQL was extracted from the GoTrue image and applied verbatim
  with `Namespace` = `auth`. It is upstream's own text, not hand-written.
- **`public.schema_migrations`** was debris created by an attempt to run
  `gotrue migrate` (the `pop` migrator's own tracking table, `varchar(14)`); it
  is not in any repo migration and it broke `001-rls-enabled.sql`. Dropped from
  the local throwaway container.

Neither repair touches the repository, the migrations, the test files, or any
non-local database. Both are disclosed so the run can be discounted if you would
rather rely on CI — **CI gate 3 is the authoritative execution of this suite**,
and it runs the same PG17 image, so asserts 8–9 will run live there too.

## What to scrutinise hardest in this round

1. **Does the ACL pin actually close the class of bug, or just this instance?**
   Asserts 4–5 now compare the *complete* set of ACL privilege types per role
   against a literal. My claim is that this is total — a new privilege in any
   future release appears in `aclexplode` output and breaks the equality. Check
   that claim; it is the whole argument for why r3 is a fix and not another
   patch. In particular, `aclexplode` returns nothing for a NULL `relacl`, which
   the `coalesce(..., '(none)')` handles for `anon` — satisfy yourself the
   `authenticated` side cannot pass vacuously the same way.
2. **The two-server split is now load-bearing.** The suite behaves differently
   on 17.6 (asserts run) and 15.8 (asserts skip). A skip is a *pass* in TAP, so
   on production-parity the MAINTAIN coverage silently disappears. That is
   correct — the privilege does not exist there — but it means the guard's
   threshold (`>= 170000`) is the only thing standing between real coverage and
   vacuous coverage. If you think a skipping assert is too quiet, this is the
   round to say so.
3. **`REVOKE ALL FROM authenticated` immediately followed by `GRANT SELECT`.**
   There is a window inside the migration where `authenticated` holds nothing.
   The statements are in one transaction (Supabase applies each migration file
   transactionally), so no concurrent session observes the gap — but confirm
   that, because if migrations were ever applied non-transactionally this would
   be a brief live denial rather than a no-op.
4. **The environment repairs above.** I would rather you discount this local run
   entirely than trust it silently. The specific question worth asking is
   whether applying GoTrue's `auth.uid()` migration could mask a genuine failure
   in the three suites — my answer is no, because the function text is upstream's
   verbatim and the two untouched suites returned to green with no other change,
   but it is your call.
5. **Nothing else changed.** Round r1's schema, constraints, trigger, policy and
   consent contract are untouched, and r2's behavioral denial matrix is
   untouched. The diff is two REVOKE/GRANT lines, two rewritten catalog asserts,
   two new asserts, one plpgsql helper, and comments. If you find anything else
   in the diff, that is a finding.

## Rollback (unchanged, forward-only)

`REVOKE ALL` + `GRANT SELECT` removes no object and no data, exactly as the r2
REVOKEs did. The forward-only rule from round r1 applies to this round verbatim.
