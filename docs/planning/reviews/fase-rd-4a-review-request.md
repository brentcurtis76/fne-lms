# RD-4a — platform redesign, step 4a: named values. Review request

- **Branch:** `feat/rd-tokens` · **Base:** release 0 of the redesign (`chore/rd-net`; main once that is published) · **Commits:** 2 (the change + this record)
- **Part of the platform redesign** (plan phase 4, "invisible groundwork").

## Objective and scope

Make every colour, font family and corner radius that Tailwind writes for the platform read from one named set of values, holding exactly today's values, so that a second look can later give the same names other values. Nothing a person can see changes.

**In:** `tailwind.config.js`, `styles/fne-tokens.css`, a comment in `styles/globals.css`, `__tests__/styles/brand-tokens.test.ts` (rewritten), two tools and their notes under `scripts/redesign/` and `docs/plan/redesign/`.

**Out:** every page and component. No class name changes anywhere. Colours typed by hand (`bg-[#0a0a0a]`, chart colours) are untouched (step 4b). Stock families the plan does not name (slate, orange, sky, emerald, rose, purple, indigo, teal, pink, violet, cyan, fuchsia; about 930 class uses) and Tailwind's `black` and `white` keep Tailwind's literal values.

## Files, grouped by risk

**Higher — what every user receives**
- `tailwind.config.js` — the brand palette (and its three older names), the gray, yellow, amber, red, green and blue families, `fontFamily` (sans, serif, mono, mont, eames) and `borderRadius` (sm to 3xl) read CSS variables. Colours as `rgb(var(--color-x) / <alpha-value>)`, the form Tailwind can put an opacity into. `ringColor.DEFAULT` is written out (see "Where to look hardest", 1).
- `styles/fne-tokens.css` — a second `:root` block declares the 86 values once each: 8 brand colours and 66 family steps as RGB triplets, 5 font lists, 7 radii. Each is the value the platform had (the old config's hexes; Tailwind 3.4's defaults).
- `styles/globals.css` — a comment only: the import of the token file is now load-bearing.

**Lower**
- `__tests__/styles/brand-tokens.test.ts` — rewritten (below).
- `scripts/redesign/tokens-check.mjs` — compares two compiled stylesheets with every named value replaced by what it holds.
- `scripts/redesign/harness/compare.mjs` — prints how many shades apart a changed picture is; `_px.mjs`, a session's tool.
- `docs/plan/redesign/tokens.md` — the names, the rules, the proofs and their limits.

## Tests changed on purpose

- `__tests__/styles/brand-tokens.test.ts` — it used to pin two copies of the brand palette to each other (config and token file). There is one copy now. It pins: each named value equals the value the platform had; one declaration each, on `:root`, in the file `globals.css` imports, in no other stylesheet; every variable the config reads is declared; the older hex tokens equal their triplets; and it runs Tailwind for real over a few classes (an opacity modifier lands inside the `rgb()`, a gradient stop fades to the same colour, the default ring is blue 500 at half strength). 24 tests. Nothing the old test pinned is unpinned.

## Evidence (local, 2026-11-13 and 14)

- **The stylesheet says the same thing.** Tailwind's command line, before and after: `tokens-check.mjs` answers EQUIVALENT, 4,034 declarations, once each named value is replaced by what it holds. Two controls (one value changed by one; one radius swapped) are reported as differences. An independent reviewer got the same answer on its own builds and checked all 74 colour triplets against Tailwind's palette.
- **Pictures** (one local stack, one snapshot; release 0 built, a full run; this branch built, a full run): every one of the 3,500 landings the same; **3,460 pictures identical; 40 pictures, on five addresses, differ by one shade of 255** (757,169 pixels in all; 60 of them by two shades). See "Where to look hardest", 2: it is expected, explained and reproduced. Two runs of release 0's build against each other: identical, 3,500 of 3,500.
- **Gates on this branch:** `npm run type-check` clean; `npm run lint` clean; `npm test` 549 files, 18,335 tests passed, 12 skipped. The production build passed when the harness built it.
- **Independent review** (another model, read-only): approve with notes; all taken in (the ring default as plain text, three stale comments, the test's three new guards, two blind spots of `tokens-check.mjs`).

## Where to look hardest

1. **The default focus ring.** Tailwind works out the colour of a `ring` that names none from `colors.blue.500`; it cannot do that from a value with `<alpha-value>` and silently falls back to a lighter blue (`rgb(147 197 253 / 0.5)` instead of `rgb(59 130 246 / 0.5)`). That would have changed most focus rings on the platform, in a state no picture shows. `tokens-check.mjs` found it; `ringColor.DEFAULT` is now written out and the test compiles a `ring` and fails if the fallback comes back. Is there another place where Tailwind derives a default from a theme colour?
2. **One shade in see-through colours.** Next shrinks the stylesheet it ships and rewrites a colour that has an opacity with whole percentages (`rgb(10 10 10 / 0.4)` becomes `hsla(0,0%,4%,.4)`; 4% is 10.2, not 10). So today's platform draws its see-through colours from values rounded by up to about a shade and a half, and solid ones exactly. A named value cannot be rewritten that way, so they are now drawn exactly. Flat fills round to the same pixel; in a fade (the dark fade over a course card on `/dashboard`, `/admin/course-builder`, `/admin/upcoming-courses`, `/community/workspace`, `/detailed-reports`) some pixels land one shade away. Drawn alone, the same fade spelled both ways differs in 7,498 of 66,000 pixels by one shade. Nobody can see it; the pictures can. It is the build's rounding ending, not a value changing.
3. **Where a variable could be undefined.** The values live on `:root` in the stylesheet every page loads. A document that used the platform's classes without that stylesheet would lose its colours. The reviewer searched for print windows, PDF and e-mail rendering, `public/` pages and `::backdrop` uses and found none that depends on these classes.
4. **Old browsers.** Nothing new is asked: Tailwind 3 already writes every `bg-*` and `text-*` with custom properties and the `rgb(r g b / a)` spelling. A browser too old for those already showed the platform without colours; it now also loses the few values that used to be plain hex (the default border, placeholders, gradient stops).
5. **`tokens-check.mjs` is a proof about Tailwind's output**, not about the shrunk file Next ships (that is exactly where point 2 comes from), nor about the other stylesheets or styles typed in code.

## Known limitations

- Tailwind's typography plugin (`prose`) takes its greys from Tailwind's palette directly; a look that changes the greys must also set its `--tw-prose-*` variables.
- The older hex tokens of the token file (`--fne-black` …) stay as second names of the brand colours; the test pins each to its triplet.
- Pictures show an address as it opens; hover, focus and pop-ups are covered by the stylesheet comparison, with the limit of point 5.
