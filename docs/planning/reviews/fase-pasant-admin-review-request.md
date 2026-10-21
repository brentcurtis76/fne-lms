# Review request — PASANT-B004 admin leads completeness (C009)

- Unit: PASANT-B004 r1 (authorship-only), criterion C009, plan revision 1. Orders:
  `/home/brent/Projects/pasant-local-handover/20261015/PASANT-B004-r1/order-r1.json` and its fixture continuation
  `order-r1-continuation.json` (variant `r1-fixture-continuation-1`, scope review `fixture-scope-review.json`).
- Attempts: initial 1, scope continuations 1, remediation 1 (`order-remediation-1.json`, variant `r1-remediation-1`, from
  `combined-review-r1.json`); inherited counters unchanged. The original r1 attempt line read "remediation 0".
- Branch `fix/p02b-r1`, base `85838af02a03a5289ad71852aab007fa62edbbf7`, **0 commits** — all changes uncommitted, on top of
  the uncommitted B002a/B002b/B003 overlay (B003-part2 final freeze `689d9fd4…`).
- Executor: Claude Code `claude-opus-5-5` (high, fallback NONE). Reviewer: Codex Sol 6.1. PM: Astra.
- Record: `docs/plan/evidence/pasant-january/b004-admin-completeness.md`.

## Objective and scope

In: extend the existing FNE-global admin screen to every contact and all program interests — exact contact totals and
global status counts, both program labels plus explicit historical/unclassified labels, bounded stable pagination, a CSV of
every matching contact beyond 1000 rows that refuses partial or inconsistent retrieval — while preserving triage, search
sanitization, notes, consent evidence and the access model, and adding the local forced-password verdict before any lead
operation.

Out: SQL/RLS, `lib/api-auth.ts`, `lib/auth/**`, `utils/roleUtils.ts`, `lib/exportUtils.ts`,
`tests/e2e/pasantias-leads-admin.spec.ts`, `tests/e2e/helpers/session-personas.ts` (see N5; allowlisted narrowly by
remediation 1, together with `tests/e2e/zoom-join-authz.spec.ts`), every inherited
non-allowlisted file, services, seeding, deployment, R-08 and R-17. The continuation added exactly the seed, the fixture
file, `tests/e2e/helpers/auth.ts` and `tests/e2e/ci-fixture.spec.ts`, for the reviewed fixture scope only.

## Files by risk

- High — auth boundary, PII, counts and export: `pages/api/admin/pasantia-leads/index.ts`,
  `components/admin/PasantiaLeadCard.tsx` (labels, CSV row, export collector), `pages/admin/pasantia-leads.tsx`.
- High — tests: `__tests__/api/admin/pasantia-leads.test.ts` (harness rewritten, every prior case kept),
  `__tests__/components/admin/pasantia-lead-card.test.tsx` (two source guards re-targeted, new blocks),
  `tests/e2e/pasantias-flow.spec.ts` (every prior assertion kept; one stale comment corrected; new describe).
- Low — hygiene: `__tests__/lib/pasantias-leads.test.ts` (one title, B003-P2-N1).
- High — fixtures (continuation): `scripts/ci/seed-e2e.mjs` (owned 1205-contact bulk + interests; forced-password flag
  for one persona), `scripts/ci/e2e-fixtures.json` (`pasantiasBulk`, `users.adminForcedPassword`),
  `tests/e2e/helpers/auth.ts` (roster entry, flag guard, persona-exact `/change-password` landing),
  `tests/e2e/ci-fixture.spec.ts` (dedicated branch for that persona), `tests/e2e/pasantias-flow.spec.ts` (owned-fixture
  describe, forced-password cookie/bearer denial, strengthened same-address submission test).
- High — remediation 1:
  - the route (second watermark read, 409/500, repeated `program`);
  - the page (`reloadToken` refresh);
  - the API suite (shared-table interleaving, parameter policy);
  - the NEW `__tests__/pages/admin/pasantia-leads.test.tsx` (rendered page);
  - `tests/e2e/helpers/session-personas.ts` (held tier) and `tests/e2e/zoom-join-authz.spec.ts` (partition test only).
  The card change is a comment only.
- Docs: the record (new), this file (new), `PROJECT_STATE.md`.

## Test evidence

**None executed.** Authorship-only orders: no tests, scanner, build, seed, services or browser were run; counts unknown.
Nothing was seeded, so every flow-spec test that needs the owned fixture or the persona is unproven. With N5 open, the four
specs importing `session-personas.ts` fail at module load. (Remediation 1: N5 is now authored, so those four specs should
load; this is unverified. The new suite `__tests__/pages/admin/pasantia-leads.test.tsx` and the new API cases are also NOT
RUN.)

## Scrutinize hardest

1. Real PostgREST semantics of the aliased duplicate `!inner` embed (`program_match`), embedded-null filtering for
   `sin-programa`, exact counts with an inner embed, and PGRST103 — unit tests only pin what is requested.
2. Export consistency (`collectAllMatchingLeads` + watermark read before every page): whether the refusal conditions are
   sufficient, and the residual limits stated in the record §2 (long transactions committing after the watermark read).
3. Forced-password placement after the admin decision (both orders deny; this one keeps "a non-admin never reaches the
   service client") and the thrown-read → 503 mapping.
4. The moved CSV builder: `'Programa enviado'` byte-identity now spans page (table header) and card (header list + row key);
   the r2 B1 source guard was re-targeted accordingly. Also the local CR→LF normalization standing in for the shared exporter
   gap (N4).
5. The unit harness rewrite in `__tests__/api/admin/pasantia-leads.test.ts` — classification of queries by columns/options;
   check no prior assertion was weakened (the counts test now asserts five exact HEAD counts instead of a row tally).
6. (Continuation) Fixture ownership and convergence in `ensurePasantiasBulk`. The refusal pre-checks, the upsert keys,
   and the disclosed reset of OWNED bulk triage on rerun. Also that the A8 lead and non-owned contacts are never written.
7. (Continuation) Independence of expectations. The hand-written `expected` block, the seeder's check against it, and the
   spec's own re-derivation. Confirm that no assertion reduces to the generator agreeing with itself. Also confirm the
   hand-worked hostile CSV cells against `lib/exportUtils.ts`.
8. (Continuation) The forced-password exception. It is keyed on one exact persona, both guards refuse a flag elsewhere,
   and normal personas are still held to `/dashboard`. The bearer token is a genuine local password grant.
9. (Remediation 1, B004-R1-02) The second watermark read after every data read, with the 409/500 mapping. Check that
   the stated guarantee in record §9.2 is no stronger than the code: detection over `updated_at`, no snapshot, and
   long-running transactions with older stamps unseen. The screen GET now shares the 409.
10. (Remediation 1, B004-R1-01) The `reloadToken` refresh: the save's refresh must come from the current render's
    effect. Also check that the new page suite exercises the rendered page rather than mirroring it. Its fake `fetch`
    is answered explicitly and only `setTimeout` is faked.
11. (Remediation 1, N5) The `PASSWORD_HELD_PERSONAS` tier and the zoom-join-authz partition test. Check them against
    `fixture-roster-extension-review.json`: existing tier arrays unchanged, held persona in no session matrix.
12. (Remediation 1, B004-N1) A repeated `program` → 400; `status`/`search` first-value reading pinned, not changed.

## Known limitations and deferred items

- N5 session-tier partition (load-bearing, path not allowlisted), N4 shared exporter bare-CR gap — record §4. N1/N2 are
  authored (record §8); N3 is met by bulk timestamps older than any A8 lead. Remediation 1: N5 is authored under the
  reviewed roster extension (record §9.3). N4 stands.
- Remediation 1 (record §9): B004-R1-01 and B004-R1-02 are addressed in code, and B004-FLOW-N1 is corrected by a linked
  note in record §2. All three stay open until independent review and execution. The real PostgREST/database race proof
  is owed.
- Real cookie/Bearer forced-password evidence, real `max_rows` evidence, the actual seed run and every UI journey are owed
  by later runs.
- R-08 / R-17 human release obligations and historical A9 failures/blocked rows persist.
