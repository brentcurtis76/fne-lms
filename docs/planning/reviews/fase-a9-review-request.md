# Fase A9 — review request (Track A release verification)

**Branch:** `phase/a9-verify`
**Base SHA:** `7c7059ff` (local `main`; the prompt named `01e0e18c`, which a Z2 docs commit had
already moved past)
**Commits:** 1
**Round:** r1

---

## Objective

A9 is the release gate for Track A — the public Pasantías INSPIRA Barcelona funnel, which is
built and already live in production. It adds no features. Its product is evidence: one unmocked
end-to-end spec that CI runs on every future PR, plus an executed, committed release checklist.

Two holes existed that only A9 could close:

1. **No test had ever driven a real submission to the database.** Every e2e on the lead path
   mocks the POST (`tests/e2e/pasantias-form.spec.ts:30` uses `page.route()`), and the API tests
   use fakes. Browser → route → row had never executed as one thing.
2. **A7a shipped with two guard gaps** in `__tests__/pages/pasantias-site-links.test.ts`. The
   failure they permit — a nav link silently repointed away from `/pasantias` — is invisible to
   every other gate, and `/pasantias` has already spent a whole phase orphaned without the suite
   noticing.

### Scope IN

- `tests/e2e/pasantias-flow.spec.ts` — new, unmocked integration spec.
- `scripts/ci/e2e-mandatory.mjs` — register it, so it cannot go quiet by being skipped.
- `__tests__/pages/pasantias-site-links.test.ts` — close A7a's two gaps ([A-new-5]).
- `docs/plan/evidence/a9/release-checklist.md` — new, executed.
- This file.
- `docs/plan/LEDGER.md` — round entry (append only).

### Scope OUT

- **Any product code.** Nothing under `pages/`, `components/` or `lib/`. Verifiable:
  `git diff --stat 7c7059ff..HEAD -- pages components lib` is empty.
- A8's two deferred SHOULD-FIX items ([A-new-4] forbids folding behavioural changes into the
  phase whose product is release evidence).
- A8's seeded lead fixture and `tests/e2e/pasantias-leads-admin.spec.ts`.
- The existing mocked form spec — it proves what the browser sends; the new one proves what
  persists. Both are wanted.
- Any POST against production. The live-site checks are read-only GETs.
- The inherited conflict markers in `docs/plan/prompts/a4-3.md`, `docs/plan/prompts/a5-3.md`,
  `docs/plan/reviews/REVIEW-A5.md` (known, Brent's call).

---

## Files, grouped by risk

### Higher risk — a new CI-blocking spec that writes to the database

- **`tests/e2e/pasantias-flow.spec.ts`** (new, 259 lines). Four tests. It is the only spec in the
  suite that inserts rows through a public route, and it is now mandatory, so a flake in it
  blocks every future PR. It has **not run anywhere yet** — see Limitations.
- **`scripts/ci/e2e-mandatory.mjs`** (+6/−0). One list entry plus a comment in the existing
  style. Small, but it is what converts the spec from "exists" to "gates".

### Medium risk — a guard file whose assertions got stricter

- **`__tests__/pages/pasantias-site-links.test.ts`** (+88/−19). Two assertions replaced by
  stricter per-file forms, and the header docblock extended to say why. Test-only, but a
  hardcoded expectation that is wrong is worse than no expectation, so both maps were derived
  from the tree by script and cross-checked against the prompt's independently-obtained numbers.

### Low risk — documentation

- **`docs/plan/evidence/a9/release-checklist.md`** (new).
- **`docs/planning/reviews/fase-a9-review-request.md`** (new, this file).
- **`docs/plan/LEDGER.md`** (append only).

---

## Test evidence

| Suite | Command | Result |
|---|---|---|
| The guard file alone | `npx vitest run __tests__/pages/pasantias-site-links.test.ts` | 1 file, **8 tests passed** |
| Typecheck | `npm run type-check` | clean, no output |
| Lint (zero warnings) | `npm run lint` | clean, no output |
| Unit/integration | `npm test` | **266 files, 6263 tests passed** |
| Production build | `npm run build` | compiled successfully |
| D-01 price-leak guard | `node scripts/check-price-leak.mjs` | `OK — scanned 269 file(s) under .next/static, no commercial data found.` |
| testid lint (advisory) | `npm run lint:testid` | 43 errors / 2625 warnings — **entirely the inherited baseline**; grepping the output for this phase's files returns nothing (A9 adds no interactive elements) |
| e2e | `npx playwright test tests/e2e/pasantias-flow.spec.ts` | **NOT RUN** — see Limitations |
| `npm run test:db` | — | not applicable, A9 adds no migration |

### Mutation proofs for [A-new-5]

Both gaps were proven to bite by mutating the tree, running the suite, and reverting.

- **Gap 1** — replaced the `d87d80f309` flipbook id at `pages/programas.tsx:664`:
  `the Directivos flipbooks are still on each page that offers them` failed with
  `expected [ 'pages/programas.tsx — d87d80f309' ] to deeply equal []`. The old site-wide
  assertion would have stayed green, because `pages/index.tsx` still carried the id.
- **Gap 2** — repointed the desktop nav's `href="/pasantias"` to `/programas` at
  `pages/index.tsx:188`: `every page keeps the /pasantias links it was given` failed with
  `"pages/index.tsx: 2 /pasantias href(s), expected 3"`. Every A7a assertion passed on that
  mutation: no `#pasantias` appeared, and the file still held two other `/pasantias` hrefs.

Both reverted; `git status` shows no modification under `pages/`.

---

## Where an independent reviewer should push hardest

1. **The new e2e spec has never executed.** This is the honest headline. A local run would have
   written synthetic leads into the *production* Supabase project (`npm run dev:unsafe` loads
   `.env.local`), and the prompt's fallback — a local ephemeral stack — was excluded by its own
   precondition, since a Supabase stack for another worktree was already running on the shared
   project ref. So every assertion in it is reasoned from source, not observed. **Read it as
   unverified code and check the reasoning, particularly the `brochure_sent_at === null`
   assertion**, which depends on a three-step inference: CI sets no `RESEND_API_KEY` →
   `sendLeadAutoReply` returns `failure:'not_configured'` → `canReleaseAutoReplyClaim` is true →
   the claim is restored. If any link is wrong the test goes red on the first PR.

2. **I replaced a test rather than adding one.** `it('the scan can see hrefs at all')` — A7a's
   anti-vacuity check, which asserted at least one `/pasantias` href in three named files — is
   gone, and `it('every page keeps the /pasantias links it was given')` stands in its place. My
   argument is that the new one strictly implies the old one (3 ≥ 1 for `index`, 3 ≥ 1 for
   `programas`, 1 ≥ 1 for `Footer`) and that keeping both would leave the header docblock naming
   the weaker test as the guard. **If you disagree, the fix is to restore the old test alongside
   the new one — it costs nothing.** Judge the implication claim yourself rather than taking it
   from me.

3. **Fifteen hardcoded numbers are now load-bearing.** `PASANTIAS_HREF_COUNTS` pins exact per-file
   counts, so any legitimate future edit that adds or removes a `/pasantias` link fails CI until
   somebody updates the map. That is the intent — the change becomes deliberate — but it is real
   friction, and if the counts are wrong the file is worse than before. They were derived by a
   script replaying the file's own `hrefOccurrences()` regex over its own `walkTsx` scope, and
   they agree exactly with A7a's independently recorded total of 15. **Re-derive them; do not
   take my word for it.** The same applies to the two-entry `DIRECTIVOS_FLIPBOOKS` map.

4. **Test parallelism versus a shared table.** `playwright.config.ts` sets `fullyParallel: true`
   and `workers: 1` only on CI, so locally these four tests could run concurrently against one
   database. I believe they are safe — each mints a UUID address, and every read is scoped by
   `?search=<that address>` — but test 3 reads A8's shared fixture while the others write to the
   same table, and `soleLeadMatching` asserts a count of exactly 1. **Check that nothing here can
   collide**, especially whether an `ilike` search on a UUID address could ever match a second row.

5. **The release checklist claims eight production PASS rows.** They are `curl` transcripts, not
   screenshots, and one of them (A2-5, "the ficha has no prices") is a negative proven by a
   regex over `pdftotext` output, which found a single hit that I judged to be the RUT in the
   legal footer rather than an amount. **That judgement is mine and worth checking.**

---

## Known limitations and deferred items

- **`tests/e2e/pasantias-flow.spec.ts` has not been executed.** CI on this branch's PR is its
  first run. Reported the same way in the checklist (§D) and in the executor report.
- **Four checklist rows are OWNER-RUN — PENDING** (A2-9 WhatsApp unfurl on a named device, A2-11
  auto-reply to a test mailbox, A2-12 internal notification, A2-13 the brochure link inside the
  received email). They need a real mailbox, a real handset, or production credentials. Per [A3]
  the phase closes only when the checklist is fully green, so these are expected to remain open
  at the end of r1 and are not a defect in it.
- **Finding, not fixed (out of A9's scope):** `/pasantias` serves an `og:image` of
  **1.5 MB / 2400×1350**, well above the few-hundred-KB range WhatsApp is commonly observed to
  render in a link preview. The plausible failure is a share card with correct text and no image.
  Recorded under A2-9 as the specific thing to look for, and flagged here because fixing it means
  touching a product asset, which A9 may not do.
- **A8's two deferred SHOULD-FIX items are untouched**, per [A-new-4]. They still need their own
  round before Track A ships.
- **`npm run lint:testid` is red on the inherited baseline** (43 errors, 2625 warnings), none of
  them in this phase's files. It is advisory today and becomes blocking once the baseline is
  clean; that cleanup is not A9's.
