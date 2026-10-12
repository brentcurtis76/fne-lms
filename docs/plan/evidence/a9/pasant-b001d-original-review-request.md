# Review request — PASANT-B001d (A9 relevant-path provenance port)

## Branch

`ws/pasant-as` at HEAD `c1f498efb250cd4c5ff53bdbc6d6616ab3dac3b2`: selected baseline
`76349909621bc07a1c7ab8242cd3c3ececaed152` plus 6 accepted child commits (PASANT-01, -03 and -04 work and ledger).
This executor made 0 commits. The PM owns commits, and the five files below are uncommitted at delivery.

## Objective and scope

Port the historical A9 real-flow spec, per-file link and Directivos guards, and the mandatory registration from
`82bc0e7b79a750d07f62da7cc5b322eca4d0194e` / `9008bacddcf40a79aa4c051b11ab3a5baf33939b` onto the current branch
with precise provenance (order PASANT-05 r0, plan PASANT rev 1, register R-15). **Scope in:** the three test/CI
paths, `docs/plan/evidence/a9/pasant-b001d-port.md` and this request. **Scope out:** January content, schema, API
or form changes; contract activation; January acceptance; historical A9 closure; PDF publication; real mail;
auth, provider or fixture-helper changes. **B001 remains open.** C003 is not activated, and the October offer is
unchanged.

## Files by risk

- Medium — `tests/e2e/pasantias-flow.spec.ts` (new, 279 lines). The A9 source has three adaptations: an
  independent `ACTIVE_COHORT = 'octubre-2026'` pin replaces the `COHORT_ID` import, the mail-path comment now names
  `deliverOutboundEmail`, and a provenance header was added. The tests and assertions are unchanged.
- Medium — `scripts/ci/e2e-mandatory.mjs`: one appended entry and comment (a union: 21 → 22). The checker logic is
  byte-identical after the list.
- Low — `__tests__/pages/pasantias-site-links.test.ts`: byte-identical to the A9 blob `bb60ceba`. Exact per-file
  `/pasantias` counts (15) and per-page Directivos flipbooks replace the site-wide or at-least-one forms.
- Low — `docs/plan/evidence/a9/pasant-b001d-port.md` (new) and this file.

## Test evidence

RUN `/home/brent/Projects/pm-workflow/runs/PASANT-05/evidence/`. The baseline on the untouched lock was all green.
Focused: 4 files, 227 passed. type-check 0, lint 0. `npm test`: 515 files, 12752 passed, 12 skipped, 0 failed.
Build 0.

- D1/D4 — `npx playwright test tests/e2e/pasantias-flow.spec.ts --workers=1 --retries=0 --reporter=list,json`
  ran with `CI=1`, a production `next start` on :3851 and the owned isolated synthetic Supabase `pasant05a9flow`
  (all migrations plus `seed-e2e.mjs`, no `RESEND_API_KEY`). Result: 4 expected, 0 skipped, 0 unexpected, 0 flaky.
  A direct DB read shows both new rows are `octubre-2026`, with split consent on and off and `brochure_sent_at`
  NULL, and that the seeded lead is untouched.
- D2 — red-then-green over scratch copies (`d2-links-red-green.tsv`). Three single-page corruptions (Directivos
  removed from programas, a programas nav entry repointed, an equipo link removed) are green under the old guard
  and red under the new one. Four retained protections are red under both. A clean copy passes 8/8 under both.
- D3 — the guard exits 0 on the valid 22-spec fixture and exits 1 when the flow is absent, has a skipped status,
  has a `skip` or `fixme` annotation, or contributes no tests, and when an older entry is absent. The pre-port
  guard passes the flow-absent report.
- pgTAP on the owned stack: 71 files, 7286 tests, PASS.
- Final gates (sequential, `pm-resources run PASANT-05 --`) all exited 0. The focused command gave 4 files,
  227 passed (links 8, contract 135, source 30, cohort 54). `npx eslint --max-warnings=0` on the three changed
  TS/MJS files was clean, and so was `git diff --check`. `npm run type-check` and `npm run lint` passed. `npm test`
  gave 515 files, 12752 passed, 12 skipped, 0 failed, the same as the baseline. `npm run build` used synthetic
  localhost values. No test failed at the baseline or at the final state.

## Scrutinize

1. **The cohort pin.** A literal `'octubre-2026'` cited to PLAN.md [A1] and A-1 to A-3, not the module. It
   catches a module that drifts. Check that the citation is the right normative source and that the January C011
   cutover note cannot be read as activation.
2. **Isolation of the D4 run.** Docker address pools were exhausted, so I created one owned network
   `pasant05a9flow_network` with the explicit subnet 10.231.85.0/24 and started the declared stack on it. No
   network was pruned and no stack was borrowed. Check the env (`scratch/app.env`, mode 600) and that
   `.env.development.local` (shared :54421) is not loaded by `next start`.
3. **The "no false stamp" assertion depends on the absence of `RESEND_API_KEY`.** I unset it in the run. A future
   environment with a key would send a real auto-reply to `example.com` (it never delivers) and keep the stamp, so
   that environment would fail the spec rather than pass it falsely.
4. **The union registration.** The A9 list was 11 entries on an older base. Check that nothing was dropped (the
   `comm` output is in the RUN log) and that CI's `--list` now runs the flow spec in gate 4.
5. **The byte-identical links port.** It is correct only because today's page counts equal A9's. A page that
   legitimately gains a `/pasantias` link must now edit `PASANTIAS_HREF_COUNTS`. This is intended, but it is
   friction for B003/B006 page edits.

## Known limitations

- The January contract is unratified (R-11, question `6d9b56320e62019a` pending). The January cohort and copy
  assertions are deferred to the B003/B006 cutover. C011 full browser acceptance and the four cumulative PR CI gates
  stay on the parent's final January state.
- A9 rows stay A2-9 PASS, A2-11 FAIL, A2-12 FAIL, A2-13 BLOCKED. Historical attempts are unchanged and no A9 closure
  is claimed.
- The full mandatory Playwright suite was not run, only the flow spec. The owned stack and network are retained
  for review.
