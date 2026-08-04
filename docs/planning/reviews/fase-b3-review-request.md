# Fase B3 — review request (INSPIRA Comms)

**Phase:** B3 — Email schema: 5 tables + per-op RLS + privilege pgTAP (DB-agent round)
**Branch:** `phase/b3-email-db`
**Base SHA:** `fb61b69` (origin/main at branch creation)
**Commits:** 1
**Round:** r1

---

## Objective and scope

**Objective (PLAN Phase B3):** create the five "Correos" tables with the D-04
per-operation access posture and prove that posture — privileges *and* policies —
with pgTAP.

**In scope:** one additive migration + one pgTAP suite.

**Out of scope (explicitly):** all SQL functions (B4a send-side, B4b data-side),
all app code, all UI. The tables are dormant until B4a/B4b land; nothing in this
branch reads or writes them.

---

## Files created

| File | Risk | Why |
|------|------|-----|
| `supabase/migrations/20260803170000_add_email_marketing_tables.sql` (+352) | **HIGH** — it is the access boundary for every comms table the platform will have | Five tables, five RLS policies, the grant-list revocations, the constraint set, and the documentation of the D-06 allowlist rule |
| `supabase/tests/040-email-marketing-rls.sql` (+498) | **MEDIUM** — a suite that passes vacuously is worse than no suite | 142 asserts: the full per-operation matrix ×5 tables ×3 roles, ACL-level grant pins, and the storage-layer contracts B4a/B4b depend on |
| `docs/plan/evidence/b3/040-email-marketing-rls.tap` (+143) | LOW | Raw TAP, unedited |
| `docs/plan/evidence/b3/mutation-probe.txt` (+45) | LOW | Seven mutation probes and what each one killed |

No existing file was modified.

---

## Test evidence

| Gate | Command | Result |
|------|---------|--------|
| pgTAP | `npm run test:db` | **PASS** — Files=8, Tests=313 (this suite contributes 142/142; `030` and the rest unchanged) |
| type-check | `npm run type-check` | PASS (clean) |
| lint | `npm run lint` | PASS (`--max-warnings=0`, clean) |
| unit | `npm test` | PASS — 253 files, 3992 tests |
| build | `npm run build` | PASS |

Raw TAP: `docs/plan/evidence/b3/040-email-marketing-rls.tap` (`1..142`, zero `not ok`).
The two `MAINTAIN` asserts ran **live** on this server (PostgreSQL 17.6), not skipped —
lines 24–25 of the TAP confirm it. Against production's 15.8 they take the `skip`
branch, so both halves of the guard have somewhere to execute.

**Mutation probes** (`docs/plan/evidence/b3/mutation-probe.txt`): seven deliberate
regressions of the frozen decisions, each applied inside an outer transaction that
the suite's own `ROLLBACK` undoes, so nothing persisted on the shared local stack.
7/7 killed:

| Mutation | Asserts killed |
|---|---|
| M1 `GRANT INSERT … TO authenticated` | 3 (ACL pin, admin INSERT denial, docente INSERT denial) |
| M2 drop the two-shape identity CHECK | 4 |
| M3 add an authenticated `WITH CHECK` policy | 2 (policy-shape pin, no-WITH-CHECK pin) |
| M4 contact FK `RESTRICT` → `CASCADE` | 1 |
| M5 `GRANT TRUNCATE` on the tombstones | 5 — note the fifth: the admin TRUNCATE *succeeded*, emptying the table, so the later duplicate-hash assert also failed. The blast radius of that one grant is visible in the output |
| M6 status CHECK readmits `failed` | 1 |
| M7 `basis_recorded_at SET DEFAULT now()` | 1 |

---

## The five areas to scrutinise hardest

**1. `email_campaign_sends.campaign_id` is `ON DELETE RESTRICT`, and the plan may
not have meant that.** PLAN B3 [A1] says "`email_campaign_sends` FK `ON DELETE
RESTRICT`" without saying *which* FK. v2's [A2] said "**contact** FK ON DELETE
RESTRICT" and v1 said both FKs were CASCADE. I applied RESTRICT to **both**,
reasoning from D-04's unqualified "no code path deletes … send history": a CASCADE
on `campaign_id` *is* such a path. I believe it is behaviourally free — B9a's
delete route is draft-only, `queue_campaign_sends` is the sole writer of send
rows, and D-07 leaves a campaign in `draft` exactly when it queued nothing, so a
draft campaign never has send rows to restrict against. But that argument is a
chain of three other phases' contracts, and if any link is wrong, B9a's delete
route returns a 23503 instead of working. This is my judgement call, not the
plan's words.

**2. The two-shape identity CHECK is stricter than D-06's sentence.** D-06 says
"normal row with consistent normalized email, or anonymized row with NULL
identity". I additionally require `unsubscribe_token IS NOT NULL` on the normal
shape, because D-08 needs a per-recipient token on every live contact and a live
row without one is a silent deliverability/compliance hole. It is a strengthening,
so it cannot admit a row the plan would reject — but it *can* reject a row a later
phase expects to insert. Check it against B6's import path in particular: the
import RPC must let the column default fire rather than passing an explicit NULL.

**3. `subscribed_at` is nullable with no default, and I did not define the
"subscribed" predicate in SQL.** B4a's [A1] eligibility list starts with
"subscribed", and I deliberately did not encode that as a column default, because
`subscribed_at DEFAULT now()` reads like the database asserting a subscription it
was never told about (D-12's "no default may assert consent"). The column comment
states the authoritative predicate is `unsubscribed_at IS NULL` and that
`subscribed_at` is informational. If the reviewer thinks B4a will be tempted to
write `WHERE subscribed_at IS NOT NULL`, this is the moment to say so — it would
silently exclude every contact whose importer forgot to stamp it.

**4. The suite is driven from one table array rather than written out per table.**
Each denial tier issues five statements (`SELECT`/`INSERT`/`UPDATE`/`DELETE`/
`TRUNCATE`) through `unnest(pg_temp.comms_tables())`, emitting one TAP line per
table. That is what makes 75 matrix asserts readable, and it means a sixth comms
table added to the array without its policy or REVOKE fails the suite. The risk is
the inverse: a table *omitted* from the array is invisible. The array is also the
migration's policy loop, so the two can drift. Worth a look. The `INSERT` probe
uses `DEFAULT VALUES` and relies on the ACL check firing at executor start, before
any NOT NULL is evaluated — verified empirically (all 15 raise 42501, never
23502), but it is an ordering assumption.

**5. Two column sets are invented, not quoted from the frozen plan.** The v4 plan
only names some columns; I took `source`'s CHECK list
(`manual|csv_import|profiles|tractor_signups|pasantia_leads|other`) and the
campaign content fields (`subject/preheader/content/content_html/hero_image_url/
cta_label/cta_url`) verbatim from the v1/v2 plan lineage rather than inventing
them, and `imported_by`/`created_by` are `REFERENCES public.profiles(id) ON DELETE
SET NULL` per v1. If v4's narrowing dropped any of those on purpose, this is where
it shows.

---

## Known limitations / deferred

- **Nothing exercises the tables end-to-end.** The suite proves the posture and the
  constraints; the *behaviour* (queue → claim → complete, anonymize, webhook
  dedup) is B4a/B4b by design. A constraint that is right in isolation and wrong
  in a workflow will surface there, not here.
- **`provider_batch_key` is created unused**, per PLAN B3 [A1] and B2's findings
  §1.4.4. The suite asserts it exists and is nullable; nothing writes it. B10a
  chooses the idempotency mechanism.
- **`detail`'s PII-free rule is documented, not enforced.** D-06 puts the
  allowlist projection inside `process_webhook_event` (B4b). B3 creates the column
  with a table/column comment stating the rule; there is no CHECK that could
  enforce "contains no email address" meaningfully at this layer. B4b's [A3] is
  where it becomes testable ("a payload containing `to`/subject yields a stored row
  without them").
- **The migration is not applied to production.** Per the repo's DB-safety rules
  that is the owner's post-merge step, as it was for `pasantias_leads`.
- **CI gate 3 will run this suite against a fresh stack**; it has only been run
  locally so far, on PostgreSQL 17.6.

---

# Round r2 — proof hardening (REVIEW-B3.md [B1] + [B2])

**Round:** r2
**Commits this round:** 1
**Files changed:** `supabase/tests/040-email-marketing-rls.sql` only, plus evidence.
**The migration is byte-identical to r1** — `git diff supabase/migrations/` is
empty. Both blockers were proof gaps; no mutation showed the schema itself wrong,
so per the round's instruction nothing in the DDL was touched.

## What changed

**[B1] — ACL pins now compare the whole `aclexplode` tuple.** The r1 pins
aggregated `privilege_type` for a named grantee and discarded everything else.
Three drivers replace the two, plus one new global driver:

| assertion (× 5 tables) | kills |
|---|---|
| `anon` entries = `(none)` | any direct grant to anon |
| `authenticated` entries = `SELECT` — rendered as `PRIVILEGE [WITH GRANT OPTION]` | a re-grantable SELECT, which shares an ACL entry with the plain one and so has an identical privilege *name* |
| PUBLIC (grantee 0) entries = `(none)` | a grant that reaches anon by inheritance without ever appearing in anon's own ACL rows |
| no grantable entry anywhere on the table, any grantee | the same widening applied to `service_role` or the owner |

The version-guarded `MAINTAIN` branch and the per-role `TRUNCATE`/`service_role`
CRUD probes are untouched. The new grantability driver is deliberately
version-independent: it enumerates whatever the ACL holds rather than naming
privileges that may not exist on a given server, so it needs no PG15/PG17 split.

**[B2] — the identity CHECK is pinned one term at a time.** The r1 cases each
violated a term in *both* arms of the disjunction, so dropping any single term
left the other arm rejecting the row and the test green. Every new case violates
exactly one term: the anonymized-arm fixtures are fully anonymized rows except
for the single named field, and the live-arm fixtures leave `anonymized_at` NULL
and satisfy every other live requirement. All eight anonymized terms
(`anonymized_at IS NOT NULL`, `email`, `email_normalized`, `first_name`,
`last_name`, `organization`, `basis_note`, `unsubscribe_token`) and all six live
terms are now independently killed, and the live shape's inverse is asserted
positively (a live row may carry every optional identity field).

## Evidence

- `docs/plan/evidence/b3/mutation-driver-r2.sh` — the driver, committed so the
  runs are reproducible rather than narrated.
- `docs/plan/evidence/b3/mutation-probe-r2.txt` — its verbatim output.
  **18 mutants, 18 killed**, baseline and restored schema green. It includes
  Sol's two mutations verbatim (M-A1, M-A2), a `GRANT SELECT ... TO PUBLIC` on
  the tombstones (M-A3), a grantable `service_role` INSERT (M-A4), and one probe
  per CHECK term (M-C1…M-C14).
- `docs/plan/evidence/b3/040-email-marketing-rls.tap` — refreshed, `1..164`,
  164 ok / 0 not ok.

The driver captures `pg_get_constraintdef()` and the full ACL before touching
anything and re-compares both after every restore, aborting if either differs, so
a botched restore cannot be mistaken for a surviving mutant.

## Two things the reviewer should scrutinise hardest

1. **The suite gained two cases my own reasoning said were impossible, and the
   census is what caught it.** I claimed in a code comment that the live arm's
   `email IS NOT NULL` and `email_normalized IS NOT NULL` were redundant beside
   `email_normalized = lower(btrim(email))` and therefore unkillable equivalent
   mutants. That was wrong: **a CHECK constraint rejects only on FALSE — a NULL
   result ADMITS the row.** Dropping either guard turns the arm from false to
   NULL for a half-identified contact, so the mutant *commits* rows the shipped
   constraint rejects. The disagreement census in the driver enumerates a 120-row
   candidate grid, found 3 and 5 disagreeing shapes respectively, and printed
   them; the two half-identified live cases in the suite came from that output.
   Worth checking that the census grid is not itself too narrow.
2. **`anonymized_at IS NOT NULL` needed an explicit NULL token to be pinned.**
   `unsubscribe_token` defaults to `gen_random_uuid()`, so an otherwise-empty row
   that simply omits the column is rejected by `unsubscribe_token IS NULL`
   instead, leaving the arm's marker term unproven. M-C1 survived the first full
   driver run for exactly this reason. The fixture now passes `NULL` explicitly.

## Gates

`supabase db reset` then `npm run test:db` → **Files=8, Tests=335, Result: PASS**
(the suite's own plan is `1..164`, up from 142).

The four JS gates cannot be affected by a change confined to one `.sql` test
file; they were run anyway and are green: `type-check` exit 0, `lint` exit 0
(`--max-warnings=0`), `npm test` **253 files / 3992 tests passed**, `npm run
build` exit 0 (`✓ Compiled successfully`).

## Known limitations / deferred (r2)

- **Everything under "Known limitations" from r1 still stands** — the tables are
  still dormant, `provider_batch_key` is still unwritten, `detail`'s PII-free
  rule is still B4b's to enforce, and the migration is still not applied to
  production.
- **The local Supabase stack is shared between worktrees**, and a `supabase db
  reset` run from a branch without this migration dropped the five tables in the
  middle of a driver run. The driver now records the applied migration head at
  the start and re-checks it at the end, and aborts if it moved — so an
  interfered-with run cannot be published as evidence. It does not *prevent* the
  interference; serialising DB gate runs across sessions is still a process rule,
  not a mechanism.
- **`is_grantable` is asserted false, never true.** No fixture proves the render
  would show `WITH GRANT OPTION` if a privilege genuinely were grantable —
  except through the mutation probes (M-A1, M-A4), where it does exactly that.
