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
