# Fase A0 — review request (round 1)

**Branch:** `phase/a0-content`
**Base:** `main` @ `d62d7e9`
**Commits:** 3 — `3a90223` (docs-only merge of `docs/comms-plan`), `82a14cd` (the phase
work), plus the ledger/review-request commit
**Executor:** fresh Opus session, round 1

## Objective and scope

Phase A0 of `docs/plan/PLAN.md` (frozen v4): privacy-notice versioning + split
consent copy. Executor half only — `[A2]` and `[A3]`. `[A1]` (Appendix A
sign-off) is owner work and is **not** claimed by this branch.

**In scope:** `components/PrivacyPolicyContent.tsx` (fixed date + version),
exported es-CL consent constants (processing vs optional marketing), legal
identity block with Appendix A-10 placeholders, unit tests.

**Out of scope (untouched):** any cohort / lead / email feature code, any other
page, adjacent refactors.

## Files created / modified, by risk

**Public-facing behaviour change (highest risk here):**
- `components/PrivacyPolicyContent.tsx` (+10/−2) — the "Última actualización"
  line no longer calls `new Date()`; it renders `PRIVACY_NOTICE_UPDATED_LABEL`
  and `PRIVACY_NOTICE_VERSION`. `suppressHydrationWarning` removed (it existed
  only because the value used to differ server vs client). This component is
  shared by `/privacidad` and the footer `PrivacyPolicyModal`; both now show
  `Última actualización: 30-07-2026 · Versión 2026-07-v1`.
  Precise prior behaviour, for the record: `/privacidad` is statically
  prerendered (`○` in the build output), so the served HTML carried the **build**
  date and hydration replaced it with the **viewer's** local date — two different
  values, neither of them citable by a consent record. The fix removes both.

**New constants (no runtime behaviour yet, but they become legal evidence in A2/A5/B3):**
- `lib/legal/privacy-notice.ts` (new, 51 lines) — `PRIVACY_NOTICE_VERSION`,
  `PRIVACY_NOTICE_UPDATED_AT` (ISO), `PRIVACY_NOTICE_UPDATED_LABEL` (es-CL),
  `LEGAL_IDENTITY` + `LEGAL_IDENTITY_PENDING`.
- `lib/pasantias/consent.ts` (new, 31 lines) — `CONSENT_PROCESSING_TEXT`,
  `CONSENT_MARKETING_TEXT`, `PRIVACY_POLICY_PATH`, `PRIVACY_POLICY_LINK_LABEL`.

**Tests:**
- `__tests__/lib/legal/privacy-notice.test.ts` (7 tests)
- `__tests__/lib/pasantias/consent.test.ts` (7 tests)
- `__tests__/components/PrivacyPolicyContent.version.test.tsx` (2 tests)

## Test evidence

```
npx vitest run __tests__/lib/legal/privacy-notice.test.ts \
  __tests__/lib/pasantias/consent.test.ts \
  __tests__/components/PrivacyPolicyContent.version.test.tsx

 ✓ __tests__/lib/legal/privacy-notice.test.ts  (7 tests) 20ms
 ✓ __tests__/lib/pasantias/consent.test.ts  (7 tests) 25ms
 ✓ __tests__/components/PrivacyPolicyContent.version.test.tsx  (2 tests) 29ms
 Test Files  3 passed (3)
      Tests  16 passed (16)
```

All four gates, re-run **in the isolated worktree on this branch alone** (log:
`gates-clean.log`, session scratchpad):

```
=== TYPE-CHECK ===   TYPECHECK_EXIT=0
=== LINT ===         LINT_EXIT=0
=== TEST ===          Test Files  228 passed (228)
                           Tests  3386 passed (3386)
                     TEST_EXIT=0
=== BUILD ===         ✓ Compiled successfully
                     BUILD_EXIT=0
                     ├ ○ /privacidad          2.44 kB    152 kB
```

No DB or UI-flow change, so `test:db` and e2e are not applicable to this phase.

Two evidence caveats, both worth knowing:
- An earlier run of these same four gates was also green, but it executed in the
  shared checkout, whose tree carried T2's uncommitted files — a superset of this
  branch. That run is **not** cited above; the numbers above are from the clean
  worktree. (They agree: 228/3386 both times.)
- The first `npm run build` attempt hung at 0% CPU with no worker children,
  because its stdout pipe was never drained. It was killed and re-run with
  output redirected to a file. Any "exit 0" from that killed attempt is
  meaningless and is not cited anywhere.

## Scrutinise these hardest

1. **How this branch was reconstructed — verify the history, not just the diff.**
   Two executor sessions (A0 and T2) ran against the *same* working tree. The
   T2 session moved the shared checkout's HEAD onto `phase/t2-ci` while this
   session was mid-phase, so this session's `git commit` landed `6e69c9e` on
   **T2's branch** — its parent is `d62d7e9` (main), not this branch's merge
   commit. T2 rescued it to `rescue/a0-6e69c9e` and rebuilt their branch,
   leaving `phase/a0-content` with no source work. I recovered by creating an
   isolated `git worktree` for `phase/a0-content` and cherry-picking the rescued
   commit as `82a14cd`. Worth checking: that `82a14cd` and `6e69c9e` have
   identical trees for the six files, that nothing of T2's leaked into this
   branch, and that `rescue/a0-6e69c9e` can now be deleted.

2. **The docs-only merge commit (`3a90223`).** `phase/a0-content` branches from
   `main` per PLAN.md, but `docs/plan/{PLAN,LEDGER}.md` exist only on
   `docs/comms-plan`, which is not in `main`. I merged that branch (docs-only,
   no source overlap) rather than fork a second `LEDGER.md`. Consequence: merging
   this phase to `main` also lands the plan docs. If that is not wanted, the
   merge commit should be dropped and the ledger handled elsewhere — this is a
   process decision, not mine. Note T2 hit the same wall and applied the same
   workaround independently; landing `docs/comms-plan` on `main` removes it.
   Because each session appended to its own branch copy of `LEDGER.md`, the two
   round-1 entries will conflict on the second merge — keep both.

3. **Where `LEGAL_IDENTITY` lives.** The prompt suggested it sit next to the
   consent constants; I put it in `lib/legal/privacy-notice.ts` instead, because
   Track B's campaign footer needs the controller identity without importing a
   pasantías module. Judgement call — reasonable people could put it in a third
   file.

4. **Placeholder strategy for Appendix A-10.** `taxId` and `streetAddress` hold
   the literal `[PENDIENTE: Apéndice A-10]`. Any phase that renders
   `LEGAL_IDENTITY` before the owner fills those fields will display that string
   to users. I chose visible-pending over empty-string; the test pins it so the
   sentinel cannot silently become `''`. If a later phase renders this block, it
   must gate on the sentinel.

5. **Date rendering.** `PRIVACY_NOTICE_UPDATED_LABEL` is a written-out string,
   not a runtime format of `PRIVACY_NOTICE_UPDATED_AT`. Deliberate: a `Date`
   built from a date-only string is UTC midnight and renders as the previous day
   in `America/Santiago`, and `toLocaleDateString` output varies with the
   runtime's ICU build. The drift risk is two constants going out of sync, so a
   test derives `dd-mm-yyyy` from the ISO string and compares — pure string
   arithmetic, no `Date`, no ICU.

6. **Consent-copy wording is not owner-approved yet.** The two sentences satisfy
   D-12 structurally (distinct purposes, marketing explicitly optional,
   marketing never asserted by default), but they are drafts pending A-14/A-15
   sign-off. The tests assert the *structural* properties (distinctness,
   optionality marker, purpose scoping), not the exact prose, so an owner
   rewording that keeps those properties will not break the suite.

## Known limitations / deferred

- `[A1]` Appendix A sign-off is not done — A0 cannot close on this branch alone.
  Items A-4, A-5, A-9..A-12, A-14, A-15 remain pending owner/BCN input.
- Nothing consumes `CONSENT_*` or `LEGAL_IDENTITY` yet; the lead form (A6b) and
  the lead API (A5) are the first consumers, and A5 is what stamps
  `PRIVACY_NOTICE_VERSION` into `consent_notice_version` /
  `marketing_notice_version`.
- No evidence directory was created (`docs/plan/evidence/a0/`): this phase
  produces no PDFs, screenshots or checklist artifacts — the evidence is the
  test output above.
- The version string `2026-07-v1` is my choice (the plan gave it as an example
  format). If the owner wants a different scheme, changing it now is one edit
  plus one test constant; changing it after A5 ships means stored consent
  records cite a retired version.
