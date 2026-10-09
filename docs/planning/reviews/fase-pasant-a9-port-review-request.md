# Review request — PASANT-B001d (A9 relevant-path provenance port), r1 current-main rebuild

## Branch

`fix/pasant05-main` at base `1e19b849674294475a9cf42410c29b5afc5b1d7e` (current `main`). Commit count 0: the PM owns
the commit, and the five files below are uncommitted at delivery. This rebuilds PASANT-05 r0 (`a81338a95` on
`ws/pasant-as`, independently APPROVED, committed locally, closure `12ca52a059d1`). r0 could not ship because
`main`'s mandatory registry had gained two notification entries. r0's review, closure and evidence are unchanged.

## Objective and scope

Port the historical A9 real-flow spec, per-file link and Directivos guards, and the mandatory registration from
`82bc0e7b79a750d07f62da7cc5b322eca4d0194e` / `9008bacddcf40a79aa4c051b11ab3a5baf33939b` onto current `main` with
precise provenance (order PASANT-05 r1, plan PASANT rev 1, register R-15). **Scope in:** the three test/CI paths,
`docs/plan/evidence/a9/pasant-b001d-port.md` and this request. **Scope out:** January content, schema, API or form
changes; contract activation; January acceptance; historical A9 closure; PDF publication; real mail; auth, provider
or fixture-helper changes. **B001 remains open.** The October runtime offer is unchanged.

## Files by risk

- Medium — `scripts/ci/e2e-mandatory.mjs`: one entry and its comment appended to `main`'s 23 (a union, 23 → 24). The
  first 23 entries are unchanged and in the same order, and the checker logic is byte-identical to `main`.
- Medium — `tests/e2e/pasantias-flow.spec.ts` (new, 280 lines): the A9 source with three adaptations. An independent
  `ACTIVE_COHORT = 'octubre-2026'` pin replaces the `COHORT_ID` import, the mail comment names
  `deliverOutboundEmail`, and a provenance header was added. The only change from r0 is the January note in the pin's
  comment (the ratification correction).
- Low — `__tests__/pages/pasantias-site-links.test.ts`: byte-identical to A9 blob `bb60ceba` and to r0. Exact
  per-file `/pasantias` counts (15) and per-page Directivos flipbooks.
- Low — `docs/plan/evidence/a9/pasant-b001d-port.md` (new) and this file.

## Test evidence

RUN `/home/brent/Projects/pm-workflow/runs/PASANT-05/evidence/r1/`. Every command ran sequentially through
`pm-resources run PASANT-05 --`. The baseline on the untouched `main` lock was all green: focused 4 files/206 passed,
type-check 0, lint 0, `npm test` 518 files with 12907 passed and 12 skipped, and build 0.

- D1/D4: `CI=1 npx playwright test tests/e2e/pasantias-flow.spec.ts --project=chromium --workers=1 --retries=0
  --reporter=list,json`. It ran a production `next start` on :3852 against the newly declared owned stack
  `pasant05r1flow` (all migrations, `seed-e2e.mjs`, no `RESEND_API_KEY`). Result: 4 expected, 0 skipped,
  0 unexpected, 0 flaky. A direct DB read shows both new rows are `octubre-2026`, with consent off and on and
  `brochure_sent_at` NULL, and that the seeded lead is untouched.
- D2: red-then-green over scratch copies (`d2-links-red-green.tsv`). Three single-page corruptions fail only under
  the new guard, four retained protections fail under both, and a clean copy passes 8/8 under both.
- D3: `--list` gives 24 entries: `main`'s 23 in order plus the flow spec, once. The valid fixture exits 0. Seven
  negative fixtures exit 1: flow absent, skipped status, `skip` annotation, `fixme`, no tests, a mix of passing and
  skipped tests, and an older entry absent. The `main` guard exits 0 on every flow fixture.
- pgTAP on the owned stack: 72 files, 7342 tests, PASS.
- Final gates on this file set: focused 4 files/206 passed; `npx eslint --max-warnings=0` on the three changed
  TS/MJS files 0; `git diff --check` 0; type-check 0; lint 0; `npm test` 518 files with 12907 passed, 12 skipped
  and 0 failed (the same as the baseline); build 0. No test failed at the baseline or at the final state.

## Scrutinize

1. **The 23+1 union.** It must keep every `main` entry in order and add the flow spec once. The proof is
   `d3-registry-proof.txt`. A rebuild that pasted r0's 22-entry list would silently drop the two notification
   specs.
2. **The cohort pin and the ratification wording.** The literal `'octubre-2026'` is cited to PLAN.md [A1] and A-1
   to A-3, not to the module. The comment now says R-11 is approved but the runtime is still October. Check that
   it cannot be read as January runtime activation, and that `main`'s CANDIDATE contract file was left alone.
3. **D4 isolation.** This is a new owned stack (`pasant05r1flow`, network `pasant05r1flow_network` 10.231.86.0/24),
   declared before creation. The r0 stack was not reused. The env file is `scratch/app-r1.env` (mode 600) and the
   worktree has no `.env*` files.
4. **"No false stamp" depends on the absence of `RESEND_API_KEY`.** With a key, a real auto-reply would be
   attempted to `example.com` and the stamp would stay. That environment fails the spec rather than passing it.
5. **Exact per-file link counts.** They are correct because `main`'s pages equal A9's. A legitimate page edit in
   B003/B006 must also edit `PASANTIAS_HREF_COUNTS`. That is intended, but it adds friction.

## Known limitations

- `main` does not yet contain PASANT-06's accepted January ratification and activation (`ws/pasant-as`). Combining
  them, the January runtime cohort and copy assertions, C011 browser acceptance and the four cumulative PR CI gates
  stay on the parent B001/B006 final January state.
- A9 rows stay A2-9 PASS, A2-11 FAIL, A2-12 FAIL, A2-13 BLOCKED. No A9 closure is claimed.
- Only the flow spec was run, not the full mandatory Playwright suite. The owned stack and network are kept for
  review.
