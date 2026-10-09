# PASANT-B001d — A9 relevant-path provenance port

Ledger item PASANT-B001d (parent PASANT-B001, outcome C001; C003 and C011 final gates preserved), order PASANT-05 r1
under approved plan PASANT revision 1. Selection: `b001-brent-decisions.md` §4 (PM record of the A9 continuation and
receiver ACK; the file is on `ws/pasant-as`, e.g. at `c1f498efb`, not on `main`) and prerequisite register R-15. This
is a test-only port. It does not activate the January contract at runtime, and it does not close A9.

## 1. Refs

| Role | Ref |
|---|---|
| A9 code commit | `82bc0e7b79a750d07f62da7cc5b322eca4d0194e` ("test(a9): unmocked lead-flow e2e, per-file link guards, release checklist") |
| A9 head (`origin/phase/a9-verify`) | `9008bacddcf40a79aa4c051b11ab3a5baf33939b`, with the three ported paths byte-identical to the code commit |
| r0 port (historical) | `a81338a95` on `ws/pasant-as` (base `c1f498efb`), PASANT-05 r0, independently reviewed APPROVED and committed locally (closure `12ca52a059d1`). It did not apply to `main` because `main`'s registry had gained two entries |
| r1 base (this port) | `main` at `1e19b849674294475a9cf42410c29b5afc5b1d7e`, branch `fix/pasant05-main` |
| Historical selected baseline | `76349909621bc07a1c7ab8242cd3c3ececaed152` (A9 merge base `7c7059ffbf51b072cd38b00f5445e3ae972640c8`) |

r1 rebuilds the same five paths on `main`. Nothing from the A9 branch or from `ws/pasant-as` was merged or
cherry-picked. Between the r0 base and `main`, the flow spec's callers (`tests/e2e/helpers/auth.ts`,
`scripts/ci/e2e-fixtures.json`, `lib/legal/privacy-notice.ts`, `lib/pasantias/**`, `lib/email/provider.ts`), the
scanned pages and `components/Footer.tsx`, and `docs/plan/PLAN.md` are unchanged. Only the registry differs.

## 2. Provenance matrix

| Path | A9 source blob | Port | Adaptation |
|---|---|---|---|
| `tests/e2e/pasantias-flow.spec.ts` (new) | `3c1462bf3b6cb3a7c6ae86affea4598ed7cd5ea6` (259 lines) | 280 lines, +26/−5 against the source | (a) The `COHORT_ID` import is replaced by the independent pin `ACTIVE_COHORT = 'octubre-2026'` (§3). (b) The claim-release comment names the current mail path, `deliverOutboundEmail` in `lib/email/provider.ts` (`not_configured` with no `RESEND_API_KEY`). (c) A provenance header was added. Every test, helper, assertion, timeout and selector is unchanged. Against r0 the only change is the January note in the pin's comment (§3). |
| `__tests__/pages/pasantias-site-links.test.ts` | `bb60ceba7a404454ffe7895470e4947278c0218a` | byte-identical to the source blob (and to r0) | None needed. The pages on `main` hold exactly the counts A9 pinned: index 3, programas 3, equipo 2, nosotros 2, noticias 2, noticias/[slug] 2, Footer 1 (15). Directivos `d87d80f309` is on index and programas, and `92bf9eb5ee` is on index only. |
| `scripts/ci/e2e-mandatory.mjs` | A9 version is a smaller 11-entry list on an older base | union: `main`'s 23 entries, in order, plus the flow spec = 24 | Only the A9 flow entry and its comment are appended after `notification-settings.spec.ts`. All 23 `main` entries stay, including the two r0 never saw (`notification-preferences-api`, `notification-settings`). The older 21/22-entry r0 list was not reused. The checker code after the list is byte-identical to `main`. |

The flow spec uses `apiContextFor(browser, 'admin', baseURL)` from `tests/e2e/helpers/auth.ts` unedited. It logs in
through the real form, so the `getServerSideUser`/provider safeguards are not bypassed.

## 3. October cohort pin and the January adaptation

The source asserted `lead.cohort === COHORT_ID`, and `lib/pasantias/leads.ts` rejects any cohort other than that
same `COHORT_ID`, so that assertion could never fail on drift. The port pins the value independently from
`docs/plan/PLAN.md`: [A1] states "cohort id `octubre-2026`", and Appendix A-1 to A-3 give the Octubre 2026 label and
the 5–9 and 13–16 October weeks. Appendix A-7 holds content, not the identity. `lib/pasantias/cohort-public.ts` was
read only to confirm the value agrees today. The active October offer is unchanged.

**Ratification correction (r1).** r0's "R-11 pending" wording is historical. Brent answered R-11 (question
`6d9b56320e62019a`) "Approve this contract" on 2026-10-09T09:23:35-03:00. The accepted ratification and contract
activation are PASANT-06 (`83a8b7a46` on `ws/pasant-as`), which is not on `main`. `main`'s
`docs/plan/pasantias-january-contract.md` still reads CANDIDATE, and this port does not edit it. The runtime offer
is still October. The January runtime switch (C003 runtime, C011) belongs to B003/B006 after the PASANT-06 and `main`
results are combined. That cutover changes `ACTIVE_COHORT` to the January id, citing the amended PLAN.md row. Full
C011 browser acceptance (desktop 1366×768, mobile 390×844, keyboard, roles) and the four cumulative CI gates stay on
the parent B001/B006 final January state.

## 4. Unchanged records

A9 release rows stay **A2-9 PASS, A2-11 FAIL, A2-12 FAIL, A2-13 BLOCKED**, and all historical A9 attempts are
immutable. Nothing in A9's `release-checklist.md` or `LEDGER.md` is re-run or re-graded. The r0 review and
closure are kept as they were. B001 stays open.

## 5. Evidence (PASANT-05 RUN)

r0 (on `ws/pasant-as`, `evidence/`): D4 4 expected/0 skipped, pgTAP 71 files/7286 tests PASS, independent APPROVED.
r1 (on `main`, `evidence/r1/`):
- D1/D4: `CI=1 npx playwright test tests/e2e/pasantias-flow.spec.ts --project=chromium --workers=1 --retries=0
  --reporter=list,json` against a production build and the newly declared owned stack `pasant05r1flow` (fresh
  migrations plus `seed-e2e.mjs`, app on loopback :3852, no `RESEND_API_KEY`) gave 4 expected, 0 skipped,
  0 unexpected and 0 flaky (`d4-e2e-results.json`). A direct read of the rows is in `d4-state.md`.
- D2: `d2-links-red-green.tsv`. Directivos deleted from programas, a programas nav entry repointed and an equipo
  link deleted each fail the new guard and pass the old one. The teaser-anchor href, the removed section anchor, a
  returned INSPIRA flipbook and a returned retired image fail under both. A clean copy passes 8/8 under both.
- D3: `d3-registry-proof.txt` shows the first 23 entries are identical to `main` and in the same order, the flow
  spec is entry 24 and appears once, and the checker logic is unchanged. In `d3-mandatory-check.log` the valid 24-spec
  fixture exits 0. The fixtures where the flow is absent, skipped, `skip`/`fixme` annotated, contributes no tests,
  or has one passing and one skipped test, and the one where an older entry is absent, each exit 1. The `main` guard
  passes every flow fixture, and that is the gap this registration closes.
- pgTAP on the same owned stack: 72 files, 7342 tests, PASS.
