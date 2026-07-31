# Fase A0 — review request

**Round 1 (below, unchanged) → Round 2 → Round 3 (both appended at the end).**
Where rounds disagree, the later one wins: round 2 closes item 4 of round 1's
"scrutinise these hardest" and its first two "known limitations"; round 3 closes
Codex `[B1]` and round 2's limitation "still no consumer" plus its item 3
("`brandName` has no enforcement").

---

**ROUND 1**

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

---

**ROUND 2 — real legal identity, brand/legal split**

**Branch:** `phase/a0-content` (continued) · **Base for this round:** `3bdee33`
**Executor:** fresh Opus session, round 2, own worktree (`../wt-a0`)

## What changed and why

Appendix A was approved on 2026-07-31, which both supplied the A-10 values and
surfaced a distinction the round-1 interface did not model: **"Fundación Nueva
Educación" is the nombre de fantasía, not the data controller.** The controller
is *Fundación Instituto Relacional*. Round 1 had the fantasy name sitting in
`legalName` — wrong in a field that ends up in a legal footer.

Two files, nothing else:

- `lib/legal/privacy-notice.ts` (+18/−15) — `LegalIdentity` gains `brandName`;
  `legalName` now holds the razón social. Values per A-10: brand `Fundación
  Nueva Educación`, legal `Fundación Instituto Relacional`, `RUT 65.166.503-5`,
  `Carlos Silva Vildósola 10448`, `La Reina, Santiago`, `Chile`;
  `contactEmail` unchanged. `LEGAL_IDENTITY_PENDING` **deleted** (nothing
  referenced it outside this module and its test). Module doc comment now
  states the rendering contract: any footer/legal block shows brand **plus**
  legal name, RUT and address.
- `__tests__/lib/legal/privacy-notice.test.ts` (+22/−9) — 7 → 10 tests. The
  sentinel test is replaced by its inverse (no field matches
  `/PENDIENTE|\[|TODO/i`), plus brand ≠ legal name with both non-empty, plus a
  pin of every A-10 value. `PRIVACY_NOTICE_VERSION` stays `2026-07-v1` and is
  now pinned by value, not only by regex — A-13 ratified it, so drift should
  break the build rather than pass a format check.

`components/PrivacyPolicyContent.tsx`, `lib/pasantias/consent.ts` and their
tests are untouched: nothing renders `LEGAL_IDENTITY` yet.

## Test evidence (round 2)

```
npx vitest run __tests__/lib/legal/privacy-notice.test.ts \
  __tests__/components/PrivacyPolicyContent.version.test.tsx

 ✓ __tests__/lib/legal/privacy-notice.test.ts  (10 tests) 2ms
 ✓ __tests__/components/PrivacyPolicyContent.version.test.tsx  (2 tests) 17ms
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

All four gates in the isolated worktree (log: `gates-r2.log`, session scratchpad):

```
=== TYPE-CHECK ===   TYPECHECK_EXIT=0
=== LINT ===         LINT_EXIT=0
=== TEST ===          Test Files  228 passed (228)
                           Tests  3389 passed (3389)   (3386 + 3 net new)
                     TEST_EXIT=0
=== BUILD ===         ✓ Compiled successfully
                     BUILD_EXIT=0
                     ├ ○ /privacidad          2.44 kB    152 kB
```

Honest note on the build: the first attempt exited 1 at "Collecting page data"
with `NEXT_PUBLIC_SUPABASE_URL … required`. Cause was the fresh worktree having
no `.env.local` (gitignored, so `git worktree add` does not bring it). Copied
from the main checkout and re-ran → exit 0. Not a code regression, but worth
knowing that a clean-worktree build needs that file staged first.

## Scrutinise these hardest (round 2)

1. **Is `taxId` the right shape?** It stores `'RUT 65.166.503-5'` — label
   included, exactly as A-10 writes it and as a footer renders it. The prompt
   specified that string. Consequence: any future consumer that wants the bare
   number (validation, an API field) must strip the prefix. If a machine-
   readable RUT is ever needed, that is a second field, not a reformat of this
   one.
2. **Pinning every A-10 value in a test.** Round 1 deliberately asserted
   *structural* properties so owner rewording would not break the suite. These
   values are now owner-approved and legally load-bearing, so I inverted that
   for this block: exact pins. A legitimate owner correction to the address will
   now fail a test — intended, but it is a change of testing philosophy inside
   the same file, so it deserves a look.
3. **`brandName` has no enforcement.** The interface models the split and the
   doc comment states the "show both" rule, but nothing yet stops a future
   consumer from rendering `brandName` alone (which would be the exact defect
   round 1 shipped). The first real consumer — B-track campaign footer, A6b's
   form — is where that becomes testable; there is no consumer to test today.
4. **Deleting `LEGAL_IDENTITY_PENDING`.** Verified unreferenced across
   `*.ts/tsx/js` outside this module and its test (the LEDGER and this file
   mention it only as history). If any in-flight branch (A7b, B1a) started
   importing it, this is a merge-time break — cheap to check, worth checking.

## Known limitations / deferred (round 2)

- Still no consumer: `LEGAL_IDENTITY` is exported and tested but rendered
  nowhere. A0's scope ends at the constants.
- `contactEmail` (`info@nuevaeducacion.org`) was not part of A-10's fill and is
  carried over from round 1 unverified against the owner's preferred
  data-subject-request address.
- Round-1 limitations that remain: nothing consumes `CONSENT_*`; no evidence
  directory (the test output is the evidence).

---

**ROUND 3 — the public notice names the real controller (closes Codex `[B1]`)**

**Branch:** `phase/a0-content` (continued) · **Base for this round:** `d101fdc`
**Executor:** fresh Opus session, round 3, own worktree (`../wt-a0r3`)
**Remediates:** `docs/plan/reviews/REVIEW-A0.md` `[B1]`

## What changed and why

Codex `[B1]` was right and narrow: rounds 1–2 got the *constants* right while
`/privacidad` still told the reader that the controller is "Fundación Nueva
Educación" at "Dirección: Santiago, Chile". The constants were never rendered.
This round makes the page render them.

Two files, nothing else:

- `components/PrivacyPolicyContent.tsx` (+30/−5) — imports `LEGAL_IDENTITY` and
  uses it in the two places the prose speaks as/about the controller:
  1. **New identification paragraph** (`data-testid="privacy-controller-identity"`),
     placed between the version line and heading 1 so no section number moves:
     *"El responsable del tratamiento de sus datos personales es Fundación Nueva
     Educación (razón social: Fundación Instituto Relacional, RUT 65.166.503-5),
     con domicilio en Carlos Silva Vildósola 10448, La Reina, Santiago, Chile
     (en adelante, «FNE»)."* Every value comes from the constant.
  2. **Contact block, §10** (`data-testid="privacy-contact-block"`) — now brand +
     `Razón social: … · RUT …` + `mailto:` from `contactEmail` + the full postal
     address. The hard-coded `Dirección: Santiago, Chile` is gone.
  Also: §1's opening changed from "En Fundación Nueva Educación recopilamos…"
  to "En FNE recopilamos…" — see item 1 below. No other prose touched.
- `__tests__/components/PrivacyPolicyContent.identity.test.tsx` (new, 5 tests) —
  assertions on the *rendered* page, which is where the defect lived.

## Test evidence (round 3)

```
npx vitest run __tests__/components/PrivacyPolicyContent.identity.test.tsx \
  __tests__/components/PrivacyPolicyContent.version.test.tsx \
  __tests__/lib/legal/privacy-notice.test.ts

 ✓ __tests__/lib/legal/privacy-notice.test.ts  (10 tests) 3ms
 ✓ __tests__/components/PrivacyPolicyContent.identity.test.tsx  (5 tests) 36ms
 ✓ __tests__/components/PrivacyPolicyContent.version.test.tsx  (2 tests) 3ms
 Test Files  3 passed (3)
      Tests  17 passed (17)
```

All four gates in the isolated worktree (log: `gates-r3.log`, session scratchpad):

```
=== TYPE-CHECK ===   TYPECHECK_EXIT=0
=== LINT ===         LINT_EXIT=0
=== TEST ===          Test Files  229 passed (229)
                           Tests  3394 passed (3394)   (3389 + 5 new)
                     TEST_EXIT=0
=== BUILD ===         ✓ Compiled successfully
                     BUILD_EXIT=0
                     ├ ○ /privacidad          2.66 kB    152 kB
```

**The check Codex ran, re-run on this build** — `[B1]` cited the prerendered
HTML as proof of the defect, so here it is as proof of the fix
(`.next/server/pages/privacidad.html`):

```
2 × "Fundación Instituto Relacional"
2 × "RUT 65.166.503-5"
2 × "Carlos Silva Vildósola 10448"
2 × "La Reina, Santiago"
0 × "Dirección: Santiago, Chile"
```

(Two of each: the identification paragraph and the §10 contact block. In the raw
HTML the values are separated by React's `<!-- -->` text-node markers, which are
invisible to the reader — the jsdom test asserts the contiguous
`street, city, country` string and passes.)

**Mutation check on the new guard.** The "brand never alone" test is only worth
its line count if it actually fails when the defect returns, so I reverted §1 to
"En Fundación Nueva Educación recopilamos…" and re-ran: `1 failed | 4 passed`,
failing exactly on the brand-occurrence invariant. Restored.

DB and e2e gates remain not applicable (no DB, no flow change — one component's
copy).

## Scrutinise these hardest (round 3)

1. **The «FNE» short form is prose I changed that the finding did not name.**
   §1 read "En Fundación Nueva Educación recopilamos información…" — the
   controller speaking as itself under the fantasy name alone, i.e. the same
   defect class as the contact block. Rather than inline the whole identity into
   a collection sentence, the identification paragraph defines `«FNE»` and §1
   uses it. This is defensible on two grounds — §4 already said "los derechos y
   seguridad de FNE" with the abbreviation never defined, so the notice now
   defines a term it was already using — but it *is* prose the prompt scoped as
   "do not rewrite". If you prefer the brand name spelled out in §1, that is a
   one-line revert **plus** relaxing the brand-occurrence assertion in test 4.
2. **The brand-alone guard is an occurrence-count invariant, not a lint rule.**
   Test 4 counts `brandName` in the whole rendered text and requires that count
   to equal its occurrences inside the two identity blocks — so any future edit
   that names the brand elsewhere in *this component* fails. It cannot see the
   sibling legal blocks (see limitations), and it would not catch a paraphrase
   ("la Fundación Nueva Educación de Chile"). It is a regression guard for the
   exact defect `[B1]` found, not a general policy.
3. **Placement of the identification block.** It sits before heading 1 rather
   than as a new numbered section, so §1–§10 keep their numbers. That is the
   conservative choice for a notice whose version is cited by consent records
   (`2026-07-v1`) — but note the *text* of the notice changed while the version
   constant did not. Round-1/2 stamped `2026-07-v1` for a page that omitted the
   controller identity; that page has not been shown to any consenting user yet
   (no lead form ships until A5/A6b), so I did **not** bump the version. If you
   read D-12 as requiring a bump on any text change, this is the call to
   overturn — and it is one constant plus two test pins.
4. **`contactEmail` is now rendered as the data-subject-request mailbox** — that
   is Codex `[S1]`, still unratified by the owner. Note the exposure did not
   grow: the same address was already hard-coded in this block since before A0.
   The change is that it now comes from `LEGAL_IDENTITY`, so ratifying a
   different address is a one-field edit.

## Known limitations / deferred (round 3)

- **`components/TermsOfUseModal.tsx:146–150` has the identical defect** and is
  out of this phase's scope: its §14 contact block hard-codes
  `Fundación Nueva Educación` + `info@nuevaeducacion.org` +
  `Dirección: Santiago, Chile`. It is a legal block naming the entity, so A-10's
  "show both" rule applies to it as much as to the privacy notice. Reported, not
  fixed — this prompt scoped `PrivacyPolicyContent.tsx` + its tests only.
- Brand-only footers left untouched (copyright lines, not controller
  statements): `pages/privacidad.tsx:40`, `pages/registro.tsx:262`,
  `pages/registro-tractor.tsx:211` (`© 2026 Fundación Nueva Educación ·
  Santiago, Chile`) and `components/Footer.tsx:110` (`Santiago, Chile` as a
  contact-list item). Worth an owner call on whether the public footer should
  carry the legal identity; A-10 phrases the requirement as "footer/legal blocks
  show both".
- Round-2 limitation "still no consumer" is closed for `LEGAL_IDENTITY`;
  `CONSENT_*` still has no consumer (A5/A6b).
- Still no evidence directory: the test output plus the prerendered-HTML counts
  above are the evidence.
