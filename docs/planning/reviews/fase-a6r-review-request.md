# Review request — Fase A6r: visual redesign of `/pasantias`

**Branch:** `phase/a6r-design`
**Base:** `main` @ `b8f5c05d`
**Commits:** 5 — the port (r1), two portraits, the FAQ swap (r2), the r2 ledger
entry, and r3's answer to Sol's FAIL.

## Objective

Port the externally-authored redesign delivered under
`docs/plan/design/a6r-handoff/` onto `/pasantias`, wiring every cohort fact to
`lib/pasantias/cohort-public.ts` and keeping all A6a guards green.

**In scope:** `pages/pasantias.tsx` markup and styling; the handoff's design
tokens; the logo and photography assets the design references.
**Out of scope:** the content itself, `cohort-public.ts`, the leak guard, the
PDFs, and the lead form (A6b).

## What r3 changed, and why

Sol reviewed the branch at `9d377eec` and returned **FAIL** with three blocking
findings. All three were PM-verified before this round started.

- **B1 — the hardcoding guard was bypassable.** It scanned the page source
  against a hand-maintained list of strings with `includes()`, so it missed
  numbers, booleans, derived dates, composition and any field added to the module
  later. The cases are now **derived recursively from `COHORT_PUBLIC`**, and the
  scan is paired with a **render contract**: the page is rendered once per leaf
  with that leaf changed, and an unchanged render means the page is not reading
  it. See "Scrutinise these hardest" #1.
- **B2 — the runtime image probe was not deployment-safe.** 37 `existsSync` calls
  per request against `public/`, which is not in a Vercel function's file trace.
  Availability is now resolved at build time from a generated, drift-tested
  manifest.
- **B3 — the hero eyebrow failed WCAG AA.** The veil ran at ~53 % where the
  eyebrow sits. It now reaches 85 % under the text, and a test samples the
  composited pixels rather than trusting axe, which files photo-backed text as
  `incomplete`.
- **S1 — this file and the evidence README were stale.** Both refreshed; the
  hero and equipo captures re-rendered.

## Files changed, grouped by risk

### Highest risk — the page itself
- `pages/pasantias.tsx` (+842 / −456 across the branch). Every section is new;
  every fact is read from the module. `getServerSideProps` is back to being
  pure — it formats dates and builds two absolute URLs, nothing else.

### Medium — shared surfaces touched by a page-scoped phase
- `tailwind.config.js` (+12): two new colour keys and one `backgroundImage`
  entry. **Additive only** — no existing key changed value.
- `styles/globals.css` (+3): one `@import` of the new token file.
- `styles/fne-tokens.css` (new, 138 lines): custom-property declarations only,
  no rules. Importing it changes no existing surface until something reads a
  token.
- `package.json` (+1): `npm run images:manifest`.

### Low — tests, generated data and assets
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts` (rewritten) — [A1].
- `__tests__/lib/pasantias-image-manifest.test.ts` (new) — manifest drift.
- `__tests__/styles/brand-tokens.test.ts` (new, 73 lines) — token/config drift.
- `lib/pasantias/image-manifest.ts` (new, generated) +
  `scripts/generate-pasantias-image-manifest.mjs` (new).
- `tests/e2e/pasantias-page.spec.ts` (+91): two contrast tests. **No existing
  assertion was changed or removed.**
- `public/logos/symbol-gold.png`, `public/logos/symbol-lineal.png` (from the handoff).
- `public/images/pasantias/equipo/*` — **eight** portraits: six copied from
  `public/images/consultants/`, two pulled from the Supabase Equipo bucket, all
  renamed to the slug the page derives from the expert's name.
- `docs/plan/evidence/a6r/` — 54 PNGs + README.

## Test evidence

At `phase/a6r-design` head, r3:

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, `--max-warnings=0` |
| `npm test` | **262 files, 6142 tests, all passing** |
| `npm run build` | compiled successfully |
| `node scripts/check-price-leak.mjs` | OK — 263 files scanned, no commercial data |
| `CI=1 npx playwright test` (pasantias-page, footer-heading-order, smoke) | **16 passed** |

Measured hero-eyebrow contrast against the **lightest** pixel behind the glyphs,
`#FBBF24` at 11 px over `bcn-skyline.jpg`:

| Viewport | Before r3 | After r3 | Needed |
|---|---|---|---|
| 390 × 844 | 2.98:1 | **8.72:1** | 4.5:1 |
| 1440 × 900 | 2.88:1 | **8.55:1** | 4.5:1 |

Every A6a assertion in `tests/e2e/pasantias-page.spec.ts` still passes against
markup it never saw — the testids, the school-card `li` structure, the
thirteen-objective count, the `Día completo — fuera de Barcelona` string, the
20-Tab CTA reachability, the D-02 price patterns, axe.

## Scrutinise these hardest

1. **The render contract is the load-bearing new mechanism, and it is unusual.**
   `__tests__/pages/pasantias-hardcoded-cohort.test.ts` mocks `cohort-public` as
   getters over a mutable store, so a single leaf can be changed and the page
   re-rendered without re-importing it. 150 leaves, one render each, ~300 ms. It
   assumes Vitest compiles named imports into namespace property accesses — true
   today, and the three `the contract can fail` proofs would go green-on-broken
   if it ever stopped being true. Worth asking whether that assumption should be
   asserted directly rather than relied on.

2. **The contract's mutation strategy decides what it can see.** Strings get every
   token suffixed; numbers shift; booleans flip; ISO dates shift the *day*,
   because the page prints day and month and a year change would render
   identically. Enum-ish fields (two to four distinct values at the same field
   name, e.g. `tier`) mutate to another of their own values — appending a suffix
   to `'visita'` renders identically, since the page reads it as
   `=== 'inmersion'`. All derived, none listed, but each rule is a judgment about
   what "changed" means.

3. **Six leaves are declared as expected gaps rather than covered.** `id`,
   `dateLabel`, all of `visitDays` (top-level and per week) and
   `freeDays[1].date` — each with a reason in `EXPECTED_GAPS`. They are asserted
   to *stay* uncovered, so one that starts rendering fails the suite. The
   argument to have is whether any of them should be rendered instead of excused.

4. **The source scan still has a 12-character floor.** Sol was right that it
   leaves `Codocencia` and `Cenas` unchecked. The floor is kept because
   "Barcelona" and "ESO" are ordinary Spanish, and those values are now covered
   by the render contract instead — which the `lodgingArea` proof demonstrates on
   a nine-character value the scan cannot see. Two mechanisms with different
   blind spots, rather than one mechanism claiming to be complete.

5. **The veil is anchored in pixels from the bottom, not in percent.** The text
   block is bottom-aligned, so the eyebrow sits ~440–460 px above the hero's lower
   edge at every width, while its *fraction* of the hero swings from 0.17 to 0.41
   with the window's height. A percentage stop passes at one window size and fails
   at another. 480 px is chosen to clear the eyebrow at all of them, and the e2e
   measures two of them — it does not measure a short-and-wide window.

6. **The 85 % veil exceeds the range the repo's own brand distillation states.**
   `docs/plan/design/a6r-handoff/design-system-readme.md` says "a black veil of at
   least 40 % when text sits on top" and "black at 40–55 % as a photo veil";
   `tokens/colors.css` carries `--veil-photo: rgba(10,10,10,.4)` as the *minimum*.
   The r3 prompt states the manual specifies 85 % under the text. Both cannot be
   right, and I cannot read the manual itself from here. A flat veil inside
   40–55 % cannot carry `#FBBF24` at 11 px to 4.5:1 — it needs ~65 % — so the
   shipped page has always exceeded that range (r1/r2 already ended at 80 %). I
   implemented what the prompt specifies and am raising the discrepancy rather
   than picking a side quietly. **This is the one thing in r3 that wants an
   owner's word.**

7. **Two colour palettes still exist in the repo.** `styles/fne-tokens.css` and
   `tailwind.config.js` both carry the brand hexes. Collapsing the config onto
   `var(--fne-*)` is the true single source but silently breaks every existing
   `bg-brand_*/40` opacity modifier app-wide, which is not an A6r-sized change.
   `__tests__/styles/brand-tokens.test.ts` pins the two together instead. The
   gold gradient — the only genuinely new token — *is* single-sourced: the config
   reads it through `var()`.

8. **I kept a section the delivered design does not have.** The mockup replaces
   A6a's "Por qué Barcelona" prose with the stats strip. The e2e requires
   `pasantias-barcelona` to be visible, and the plan puts content out of scope,
   so deleting two paragraphs of owner-visible copy was not mine to make.

## Known limitations / deferred

- **Two photo slots are unfilled** (`barcelona-calle`, `barcelona-tarde`) and
  render nothing at all rather than a placeholder band. All eight portraits now
  resolve. Real Barcelona photography remains the owner's critical path.
- **The `og:image` is now conditional.** It points at the hero, falls back to
  `bcn-skyline.jpg`, and if neither is in the manifest the `og:image`,
  `og:image:alt` and `twitter:image` tags are omitted and `twitter:card` drops to
  `summary`. An unfurl pointing at a 404 is worse than no image; today both
  candidates ship, so the tags are present.
- **`barcelona-innovation.jpg` is off `/pasantias` but still live on
  `pages/index.tsx:374`.** The file is not deleted because the homepage would
  break. A7a [A2] now owns the swap.
- **`styles/globals.css:1` still imports Inter from the Google Fonts CDN**, and
  the app shell loads Font Awesome from `cdnjs`. Both are pre-existing and global
  to every page. Nothing new from a CDN was added by this round.
- **The objectives expander was not ported.** The mockup shows four of thirteen
  behind a toggle. The A6a spec counts thirteen `li` in that section, and a
  collapsed item is a zero-box element to Playwright, so the toggle would have
  meant weakening a guard for a presentation preference. All thirteen render.
- **Header WhatsApp button removed.** `pasantias-header-whatsapp` no longer
  exists — the replicated site header has no room for it and no spec depended on
  it. WhatsApp survives as the closing CTA (`pasantias-cta-whatsapp`).
- **The week testids are now derived** — `` `pasantias-week-${week.id}` `` rather
  than the literal `pasantias-week-semana-1`. The rendered value is unchanged, so
  the e2e that navigates by it was not touched; the literal was a restatement of
  `weeks[].id` and the render contract flagged it as one.
