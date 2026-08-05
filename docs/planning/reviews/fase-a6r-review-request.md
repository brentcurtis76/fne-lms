# Review request — Fase A6r: visual redesign of `/pasantias`

**Branch:** `phase/a6r-design`
**Base:** `main` @ `b8f5c05d`
**Commits:** 1

## Objective

Port the externally-authored redesign delivered under
`docs/plan/design/a6r-handoff/` onto `/pasantias`, wiring every cohort fact to
`lib/pasantias/cohort-public.ts` and keeping all A6a guards green.

**In scope:** `pages/pasantias.tsx` markup and styling; the handoff's design
tokens; the logo and photography assets the design references.
**Out of scope:** the content itself, `cohort-public.ts`, the leak guard, the
PDFs, and the lead form (A6b).

## Files changed, grouped by risk

### Highest risk — the page itself
- `pages/pasantias.tsx` (+778 / −429, full rewrite of the markup). Every section
  is new; every fact is read from the module. `getServerSideProps` gained a
  filesystem probe that resolves photography and portraits, which is new
  server-side behaviour on a previously pure page.

### Medium — shared surfaces touched by a page-scoped phase
- `tailwind.config.js` (+12): two new colour keys and one `backgroundImage`
  entry. **Additive only** — no existing key changed value.
- `styles/globals.css` (+3): one `@import` of the new token file.
- `styles/fne-tokens.css` (new, 138 lines): custom-property declarations only,
  no rules. Importing it changes no existing surface until something reads a
  token.

### Low — tests and assets
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts` (new, 202 lines) — [A1].
- `__tests__/styles/brand-tokens.test.ts` (new, 73 lines) — token/config drift.
- `public/logos/symbol-gold.png`, `public/logos/symbol-lineal.png` (from the handoff).
- `public/images/pasantias/equipo/*` — six portraits copied from
  `public/images/consultants/`, renamed to the slug the page derives.
- `docs/plan/evidence/a6r/` — 54 PNGs + README.

## Test evidence

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, `--max-warnings=0` |
| `npm test` | **261 files, 6129 tests, all passing** |
| `npm run build` | compiled successfully |
| `node scripts/check-price-leak.mjs` | OK — 263 files scanned, no commercial data |
| `CI=1 npx playwright test` (pasantias-page, footer-heading-order, smoke) | **14 passed**, including axe and the whole-document heading order |

`tests/e2e/pasantias-page.spec.ts` was **not modified**. Every A6a assertion —
the testids, the school-card `li` structure, the thirteen-objective count, the
`Día completo — fuera de Barcelona` string, the 20-Tab CTA reachability, the
D-02 price patterns, axe — passes against markup it never saw.

## Scrutinise these hardest

1. **`getServerSideProps` now touches the filesystem.** Photography and portraits
   are resolved with `existsSync` per request against `public/`, via a dynamic
   `import('node:fs')`. It is what makes "degrade honestly" automatic — dropping
   a file in is the whole of adding a photo — but it is per-request I/O on a
   public marketing page and it is the one place where a missing file changes
   rendered output. Worth asking whether it should be memoised or hoisted to
   build time.

2. **[A1]'s length floor is a judgment call.** The guard skips module values
   under 12 characters unless they are proper nouns or ISO dates, because
   `COHORT_LODGING_AREA` is the single word "Barcelona" — ordinary page copy —
   and `ESO` is a substring of three other level strings. That floor lets
   `Codocencia` (10) and `Cenas` (5) through unchecked. I judged an
   unsatisfiable guard worse than a guard with a documented floor, and added
   two mutation cases so the oracle is provably non-vacuous, but the floor is
   the thing to argue with.

3. **I kept a section the delivered design does not have.** The mockup replaces
   A6a's "Por qué Barcelona" prose with the stats strip. The e2e requires
   `pasantias-barcelona` to be visible, and the plan puts content out of scope,
   so deleting two paragraphs of owner-visible copy was not mine to make. I kept
   the prose in the design's own grammar and moved the claims into the strip.
   If the owner wants the prose gone, that is a content decision, not a port.

4. **The FAQ's six questions are A6a's, not the mockup's.** The prompt says to
   take the answers from the current page. The mockup's *questions* also differ:
   two of its six topics (a day inside a school; whether you need Catalan) have
   no owner-reviewed answer anywhere, and two of A6a's (what the programme
   includes; lodging) are absent from it. Writing answers for the new topics
   would have been inventing content, so the whole owner-reviewed set survives
   unchanged. This leaves the "¿Qué incluye el programa?" answer duplicating the
   new `#incluye` section — visible only when that accordion item is opened.
   Flagged for the owner rather than resolved by me.

5. **Two colour palettes now exist in the repo.** `styles/fne-tokens.css` and
   `tailwind.config.js` both carry the brand hexes. Collapsing the config onto
   `var(--fne-*)` is the true single source but silently breaks every existing
   `bg-brand_*/40` opacity modifier app-wide, which is not an A6r-sized change.
   `__tests__/styles/brand-tokens.test.ts` pins the two together instead. The
   gold gradient — the only genuinely new token — *is* single-sourced: the config
   reads it through `var()`.

## Known limitations / deferred

- **Two photo slots are unfilled** (`barcelona-calle`, `barcelona-tarde`) and two
  portraits are missing (Mora del Fresno, Sergi del Moral). Both degrade to
  designed-looking output rather than broken images. Real photography remains
  the owner's critical path.
- **`barcelona-innovation.jpg` is off `/pasantias` but still live on
  `pages/index.tsx:374`.** The file is not deleted because the homepage would
  break. The generic-stock and identifiable-minors problem the PM raised applies
  there identically and is not A6r's to fix.
- **`styles/globals.css:1` still imports Inter from the Google Fonts CDN.** It is
  pre-existing, global to every page, and swapping it for the local Inter files
  in `public/fonts/` would drop weights 500/600 to synthesis app-wide. Nothing
  new from a CDN was added by this round; the existing import is raised rather
  than fixed.
- **The objectives expander was not ported.** The mockup shows four of thirteen
  behind a "Ver los 13 objetivos" toggle. The A6a spec counts thirteen `li` in
  that section, and a collapsed item is a zero-box element to Playwright, so the
  toggle would have meant weakening a guard for a presentation preference. All
  thirteen render.
- **Header WhatsApp button removed.** `pasantias-header-whatsapp` no longer
  exists — the replicated site header has no room for it and no spec depended on
  it. WhatsApp survives as the closing CTA (`pasantias-cta-whatsapp`).
