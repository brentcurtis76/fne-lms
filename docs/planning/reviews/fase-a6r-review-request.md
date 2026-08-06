# Review request — Fase A6r: visual redesign of `/pasantias`

**Branch:** `phase/a6r-design`
**Base:** `main` @ `b8f5c05d`
**Commits:** 9 — the port (r1), two portraits, the FAQ swap (r2), r3's answer to
Sol's first FAIL, r4's containment fix, r5's cardinality and discriminator work,
and three ledger entries.

## Objective

Port the externally-authored redesign delivered under
`docs/plan/design/a6r-handoff/` onto `/pasantias`, wiring every cohort fact to
`lib/pasantias/cohort-public.ts` and keeping all A6a guards green.

**In scope:** `pages/pasantias.tsx` markup and styling; the handoff's design
tokens; the logo and photography assets the design references.
**Out of scope:** the content itself, `cohort-public.ts`, the leak guard, the
PDFs, and the lead form (A6b).

## Where the rounds went

The page has not changed since r3. **r4 and r5 are entirely about the guard that
protects it** — three consecutive reviews found the guard passing a page that
restated a cohort fact as a literal, each time through a different hole.

- **r3 — the guard was a hand-maintained string list.** Sol found it incomplete,
  which was the third hand-enumerated guard on this project to be found
  incomplete. The cases are now **derived recursively from `COHORT_PUBLIC`**, and
  the scan is paired with a **render contract**: the page is rendered once per
  leaf with that leaf changed in the module.
- **r3 also — the runtime image probe was not deployment-safe** (37 `existsSync`
  calls per request against `public/`, which is not in a Vercel function's file
  trace) and **the hero eyebrow failed WCAG AA**. Availability now resolves at
  build time from a generated, drift-tested manifest; the veil reaches 85 % under
  the text and a test samples composited pixels.
- **r4 — "the render changed" was not proof.** The PM hardcoded `2,5` in place of
  `{formatDays(immersionDays)}` and the guard passed 15/15: mutating one school's
  `immersionDays` makes the two disagree, `uniformImmersionDays()` returns `null`
  and the clause *vanishes*. The render changed by collapsing. The assertion is
  now containment — the mutated value must be **on the page** and this leaf's copy
  of the old value must be **off** it.
- **r5 — two shapes the leaf walk cannot reach.** Both from Sol, both reproduced
  before the round: collection sizes (`Las 7 escuelas` is `.length`, and no leaf
  moves when a school is dropped), and a discriminator the page *compares*
  (`school.tier === 'inmersion'`), which a suffix mutation cannot move because
  `visita` and `visitazzq` are both `!== 'inmersion'`. Five leaves had been
  declared inert on exactly that non-evidence.
- **r5 also — one of its own answers was incomplete, and this round found it.**
  See "Scrutinise these hardest" #1. It is the most important thing on this page.

## Files changed, grouped by risk

### Highest risk — the page itself
- `pages/pasantias.tsx` (+842 / −456 across the branch). Every section is new;
  every fact is read from the module. `getServerSideProps` is pure — it formats
  dates and builds two absolute URLs, nothing else. **Byte-identical since r3**;
  `git diff 9c3c9134 -- pages/pasantias.tsx` covers r3 only, and r4/r5 do not
  touch it at all.

### Medium — shared surfaces touched by a page-scoped phase
- `tailwind.config.js` (+12): two colour keys and one `backgroundImage` entry.
  **Additive only** — no existing key changed value.
- `styles/globals.css` (+3): one `@import` of the new token file.
- `styles/fne-tokens.css` (new, 138 lines): custom-property declarations only.
- `package.json` (+1): `npm run images:manifest`.

### Low — tests, generated data and assets
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts` (+912 net, now **1551
  lines**) — [A1]. The whole of r3, r4 and r5 lives here. Its size is raised as a
  finding below.
- `__tests__/lib/pasantias-image-manifest.test.ts` (new) — manifest drift.
- `__tests__/styles/brand-tokens.test.ts` (new, 73 lines) — token/config drift.
- `lib/pasantias/image-manifest.ts` (new, generated) +
  `scripts/generate-pasantias-image-manifest.mjs` (new).
- `tests/e2e/pasantias-page.spec.ts` (+117): contrast tests. **No existing
  assertion was changed or removed.**
- `public/logos/symbol-gold.png`, `public/logos/symbol-lineal.png` (handoff).
- `public/images/pasantias/equipo/*` — **eight** portraits, all renamed to the
  slug the page derives from the expert's name.
- `docs/plan/evidence/a6r/` — 54 PNGs + README.

## Test evidence

At `phase/a6r-design` head, r5:

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, `--max-warnings=0` |
| `npm test` | **262 files, 6156 tests, all passing** |
| `npm run build` | compiled successfully |
| `node scripts/check-price-leak.mjs` | OK — 263 files scanned, no commercial data |
| `CI=1 npx playwright test` (pasantias-page, footer-heading-order, smoke) | **16 passed** |

The guard file alone: **29 tests** (21 at r4, 28 as r5 was first written).

Measured hero-eyebrow contrast against the **lightest** pixel behind the glyphs,
`#FBBF24` at 11 px over `bcn-skyline.jpg`:

| Viewport | Before r3 | After r3 | Needed |
|---|---|---|---|
| 390 × 844 | 2.98:1 | **8.72:1** | 4.5:1 |
| 1440 × 900 | 2.88:1 | **8.55:1** | 4.5:1 |

Sol re-measured both independently at 8.682:1 and 8.519:1.

### Negative controls run this round, against the page itself

Each mutation was applied to `pages/pasantias.tsx`, the guard run, and the page
restored with `git checkout` — the page is byte-identical to `bcfa1b71`
afterwards, and `git diff bcfa1b71 -- pages/pasantias.tsx` is empty.

| Mutation | Before this round | After |
|---|---|---|
| `Las ${COHORT_SCHOOLS.length} escuelas` → `Las 7 escuelas` | **28/28 passed** | 2 failed, naming `schools` |
| `· {COHORT_SCHOOLS.length} escuelas` → `· 7 escuelas` (hero) | not run | 2 failed, naming `schools` |
| both school sites at once | 2 failed | 2 failed |
| `Los ${COHORT_OBJECTIVES.length} objetivos` → `Los 13 objetivos` | 2 failed | 2 failed |
| `school.tier === 'inmersion'` → `school.immersionDays !== undefined` | 2 failed, naming 7 tier leaves | same |

## Scrutinise these hardest

1. **The r5 answer to B1 did not close B1, and this is how it was found.** The
   round's own evidence — the PM's and the first executor's — was the pair
   mutation `Las 7 escuelas` **and** `Los 13 objetivos`, run together, which
   failed two tests. Run apart, **both failures come from the objectives half**.
   The schools literal, which is the one Sol reported, passed 28/28. The cause is
   structural: `COHORT_SCHOOLS.length` is printed at two sites, and
   `publishesCount` compares *totals*, so one site still moving satisfies both of
   its halves. The helper's own docstring declared this unresolvable. It is not:
   `printsStaleSize` now shrinks the collection past its present size on a module
   whose prose has been marked out of the way, and requires the old size to be
   **gone**. One surviving `7` is one literal. Shrinking rather than growing
   because the objectives list numbers its own items, so growing leaves a `13` on
   the page for an innocent reason. **Ask whether the quiet module is honest** —
   it marks every string leaf, so the only bare numbers left are the ones the page
   computes, and if that assumption is wrong the clause reads a coincidence as a
   literal (loudly — it fails, it does not pass).

2. **A wrong reason was recorded as fact for a full round, and every reason has
   now been re-verified.** `visitSchools[*].tier` sat in `EXPECTED_GAPS` calling
   itself inert while `SchoolDetail` branched on all five, and the r4 ledger
   entry endorsed that classification as "right". The immersion pair's reason was
   wrong on its own terms too — it claimed `tier` decides which schools the
   immersion figure is drawn from, and `uniformImmersionDays()`
   (`pages/pasantias.tsx:75`) reads only `immersionDays`. All 27 declared reasons
   across the four lists were re-read against the code this round, each against a
   file and line; the r5 executor report carries the list. The argument to have is
   whether a prose reason is the right carrier for a claim this load-bearing.

3. **The guard is 1551 lines for one test file, and it is now larger than the
   page it guards** (1151). Raised as a finding below rather than acted on.

4. **Six leaves are declared expected gaps rather than covered.** `id`,
   `dateLabel`, all of `visitDays` (top-level and per week) and `freeDays[1].date`
   — each with a reason, each asserted to *stay* uncovered. The argument to have
   is whether any should be rendered instead of excused.

5. **The source scan still has a 12-character floor**, so `Codocencia` and `Cenas`
   are unscanned. They are covered by the render contract instead, which the
   `lodgingArea` proof demonstrates on a nine-character value. Two mechanisms with
   different blind spots, rather than one claiming to be complete.

6. **The veil figure is settled and the branch inherits the correction.** 40 % is
   the manual's minimum for the white **logo** over photography (p.6); 85 % is the
   **text** veil (p.15). The handoff readme and `tokens/colors.css` were corrected
   on `main`; this branch predates those commits. Nothing here re-litigates it.

## Known limitations / deferred

- **The guard file is too large.** 1551 lines, four declaration lists, five
  classification outcomes and three mutation strategies. Every piece of it was
  added in answer to a demonstrated false pass, so none of it is speculative — but
  it is now the largest single artifact of a phase whose scope is a page redesign,
  and reading it is a prerequisite to reviewing it. **Suggested cut, for the PM and
  Sol rather than for a remediation round:** the mechanism (leaf walk, mutation
  strategies, collection walk, quiet module, classification) is ~700 lines and
  belongs in `__tests__/support/cohort-contract.ts`; the declarations and the
  suite are the part a reader of this phase needs. That is a move, not a rewrite,
  and it should not happen inside a round that is also changing behaviour.
- **A count hardcoded at *every* site it is printed at** is caught by the counting
  half, not by `printsStaleSize` — which asks whether the old size is gone, not
  which site printed it. Both halves are required and both are proved by their own
  negative controls.
- **A collection of one cannot be shrunk** into a size the page could print, so it
  falls back to the counting half alone. None exists in `COHORT_PUBLIC` today.
- **`uniformImmersionDays` is proved as a field, not as an index.** Siblings
  holding the same value are indistinguishable once moved together, so the contract
  proves the figure is read from the module, not which of the two schools it came
  from. Declared in `UNIFORM_LEAVES`.
- **Two photo slots are unfilled** (`barcelona-calle`, `barcelona-tarde`) and
  render nothing rather than a placeholder band. Real Barcelona photography remains
  the owner's critical path.
- **The `og:image` is conditional.** It points at the hero, falls back to
  `bcn-skyline.jpg`, and if neither is in the manifest the image tags are omitted
  and `twitter:card` drops to `summary`. Today both candidates ship.
- **`barcelona-innovation.jpg` is off `/pasantias` but still live on
  `pages/index.tsx:374`.** The file is not deleted because the homepage would
  break. A7a [A2] owns the swap.
- **`styles/globals.css:1` still imports Inter from the Google Fonts CDN**, and the
  app shell loads Font Awesome from `cdnjs`. Both pre-existing and app-wide;
  nothing new from a CDN was added.
- **There is no `prebuild` step for the image manifest**, so a stale manifest fails
  `npm test` but a bare `npm run build` succeeds with it. Sol's observation, in the
  ledger backlog.
- **The objectives expander was not ported.** The A6a spec counts thirteen `li`,
  and a collapsed item is a zero-box element to Playwright.
- **Header WhatsApp button removed.** `pasantias-header-whatsapp` no longer exists;
  WhatsApp survives as the closing CTA (`pasantias-cta-whatsapp`).
- **The week testids are derived** — `` `pasantias-week-${week.id}` `` rather than
  the literal. The rendered value is unchanged.
</content>
</invoke>
