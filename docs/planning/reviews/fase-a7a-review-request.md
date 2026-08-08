# Fase A7a — review request

**Branch:** `phase/a7a-links`
**Base SHA:** `d07cba42` (local `main`, "docs(a7a): r1 prompt; scope corrected to 7 files, grep proofs promoted to guards")
**Commits:** 2 (implementation + this document)
**Round:** r1 — first round of the phase
**Worktree:** `~/dev/wt-a7a`, per the Decision Log 2026-07-31 rule. Nothing was
committed in the shared `~/dev/fne-lms` checkout.

---

## Objective

`/pasantias` shipped finished in A6a/A6r/A6b and **orphaned**: every "PASANTÍAS"
nav entry and the footer link still pointed at `#pasantias`, the homepage teaser
section, and the INSPIRA programme was still "explained" by a Heyzine flipbook of
the **retired Abril 2026 brochure** — wrong dates, retired €1.000 price. This round
makes the real page the destination and takes the stale flipbooks off the site.

It also carries two one-line asset swaps on `pages/index.tsx`, owner-approved
2026-08-05, because the phase already opens that file.

There is **no new business logic** in this round and none was added.

### Scope in

1. All 13 nav/footer `href`s across seven files → `/pasantias`.
2. Both INSPIRA Heyzine flipbooks (state + trigger + modal) removed from
   `pages/index.tsx` and `pages/programas.tsx`; each trigger replaced by a link to
   `/pasantias` with the prompt's fixed copy.
3. Directivos flipbooks kept; ` - Abril 2026` dropped from the one modal title
   that carried it.
4. The two `pages/index.tsx` image swaps (`src` repoints only).
5. `__tests__/pages/pasantias-site-links.test.ts` (new) — the grep proofs as a
   derived source guard.
6. `tests/e2e/pasantias-page.spec.ts` — five nav assertions appended to the
   existing spec, which is already on `MANDATORY_SPECS`.

### Scope out (untouched, verified)

`pages/api/contact.ts` and the homepage contact form (A7b). The homepage
`#pasantias` **section content** — heading, copy, stats, badge, benefit list — only
its two CTA buttons and two images changed. `pages/pasantias.tsx`,
`components/pasantias/**`, `lib/pasantias/**` (frozen by A6a/A6r/A6b) — byte-identical
on this branch. `public/public-website-fne.html`. `components/quotes/QuotePublicView.tsx`.
The `cdn.tailwindcss.com` script tag. **Neither original image was deleted.**
The shared-nav extraction was **not** done — see "deliberately not done" below.

---

## Files by risk

| Risk | File | Why |
|---|---|---|
| **Medium** | `pages/index.tsx` (+13/−57) | The largest edit: a state deletion, a 50-line modal removal, a CTA element change and two `src` swaps, all inside a file whose Directivos twin must survive intact. |
| **Medium** | `pages/programas.tsx` (+7/−33) | Same shape, second copy: its own INSPIRA state, trigger and modal. |
| Medium | `tests/e2e/pasantias-page.spec.ts` (+83) | Additive only — no existing assertion was changed — but it runs in CI and one of the five new tests deliberately drives the Directivos flipbook. |
| Low | `__tests__/pages/pasantias-site-links.test.ts` (new, 248 lines) | New guard; additive. |
| Low | `pages/nosotros.tsx`, `pages/equipo.tsx`, `pages/noticias.tsx`, `pages/noticias/[slug].tsx`, `components/Footer.tsx` (+2/−2 each, Footer +1/−1) | `href` value changes; two of them also change one element type — declared below. |

---

## Test evidence

Command run verbatim from the prompt:

```
npx vitest run __tests__/pages/pasantias-site-links.test.ts && \
npm run type-check && npm run lint && npm test && npm run build && \
node scripts/check-price-leak.mjs && \
CI=1 npx playwright test tests/e2e/pasantias-page.spec.ts tests/e2e/pasantias-form.spec.ts tests/e2e/footer-heading-order.spec.ts
```

Exit 0 end to end.

| Gate | Result |
|---|---|
| `pasantias-site-links` guard | **8 passed (8)**, 1 file |
| `type-check` | clean |
| `lint` | clean, `--max-warnings=0` |
| `npm test` | **264 files / 6207 tests passed** (A6b's baseline was 263 / 6199; the delta is this round's 8 guard tests, one new file) |
| `build` | `✓ Compiled successfully`, 156 static pages generated |
| `check-price-leak` | `OK — scanned 267 file(s) under .next/static, no commercial data found.` |
| Playwright (3 specs) | **26 passed (22.7s)**, 1 worker, `CI=1` (A6b's baseline was 21; the delta is this round's 5 nav tests). Tests 22–26 are the new ones; axe still green. |

`npm run test:db` was **not** run: this round contains zero SQL. The full
`MANDATORY_SPECS` list cannot run on this machine — it needs CI's seeded ephemeral
Supabase stack — so the three specs above are this phase's local standard, not the
list.

### The guard was attacked before it was believed

Each control was applied to the real source, the guard was run, and the source was
restored. All four failures name the offending **file and line**:

| Mutant | Result |
|---|---|
| `components/Footer.tsx` href back to `/#pasantias` | **2 failed** — `no href targets the homepage teaser anchor` reports `components/Footer.tsx:91 — href="/#pasantias"`, and the anti-vacuity test fails too |
| `id="pasantias"` deleted from the homepage section | **1 failed** — `pages/index.tsx no longer carries id="pasantias"` |
| a Directivos iframe repointed to the retired `fef3878d3c` | **3 failed** — `pages/index.tsx:1103 — fef3878d3c` plus the Directivos-still-present pin |
| `Abril 2026` restored to the Directivos title; `/barcelona-skyline.jpg` restored | included above — `pages/index.tsx:1078 — Abril 2026`, `pages/index.tsx:381 — /barcelona-skyline.jpg` |

---

## Acceptance criteria

| ID | Evidence |
|---|---|
| **[A1]** | `grep -rn 'href="[^"]*pasantias[^"]*"' pages/ components/` → 15 hits, every one `/pasantias` (13 nav/footer + the 2 new CTAs). `grep -rn '#pasantias' pages/ components/` → **zero**. `grep -rn 'id="pasantias"' pages/ components/` → `pages/index.tsx:276`, preserved. See FINDING 1 on the criterion's own wording. |
| **[A2]** | `grep -rni 'heyzine' pages/ components/` → 3 hits, all Directivos (`d87d80f309` ×2, `92bf9eb5ee` ×1). Neither `fef3878d3c` nor `fb8cf2cfb1` appears. |
| **[A3]** | `showFlipbook`/`setShowFlipbook` grep → zero. The Directivos state, both buttons and both modals are byte-identical to `main` except the one `<h3>`; the diff shows no other line inside them. |
| **[A4]** | `grep -rn 'Abril 2026' pages/ components/` → zero. |
| **[A5]** | Both CTAs are `<Link href="/pasantias" data-testid="inspira-pasantias-cta">` with the exact copy `Conoce las Pasantías en Barcelona`; each keeps its own file's classes and trailing icon svg. |
| **[A6]** | `pages/index.tsx` references `/images/pasantias/educadores-biblioteca.jpg` (alt `Educadores en la biblioteca de una escuela en Barcelona`) and `/images/pasantias/bcn-skyline.jpg`; neither original path appears. `public/barcelona-innovation.jpg` (1.1 MB) and `public/barcelona-skyline.jpg` (9.4 MB) both still exist on disk. |
| **[A7]** | See the gate table above. |

---

## What a reviewer should scrutinise hardest

1. **Six `<a>` elements became `<Link>`, and that is the change a link round hides
   best.** `pages/index.tsx` (×2), `pages/programas.tsx` (×2), `pages/noticias.tsx`
   (mobile) and `pages/noticias/[slug].tsx` (mobile) all used a plain `<a>` for the
   PASANTÍAS nav entry. The prompt's rule is "use `next/link` where the file already
   imports `Link`; keep a plain `<a>` where the file uses `<a>` **and does not import
   `Link`**" — and all seven files import `Link`, so the second clause is empty here
   and every one of them takes `<Link>`. No import was added to any file. Judge
   whether that reading is the intended one; the alternative (change only the `href`
   value and leave the `<a>`) is a one-character-per-site difference and would ship
   full page loads for internal navigation. The homepage's mobile-menu close handler
   binds to `mobileMenu.querySelectorAll('a')`, and `next/link` renders an `<a>`, so
   the menu still closes on click.
2. **The Directivos twin, in both files.** Everything removed had an INSPIRA and a
   Directivos copy sitting beside each other with near-identical markup. Read the
   `pages/index.tsx` hunk at 1069 and the `pages/programas.tsx` hunk at 650 for
   anything taken from the wrong one. The e2e `the Directivos CTA still opens its
   flipbook` exists for exactly this and is the control for the count-0 assertion
   next to it.
3. **Whether the new guard's href scan can be defeated.** It reads `href` *values*
   rather than searching the source, because `id="pasantias"` must survive and a
   substring search would either fail on it or be weakened to nothing. It handles
   `href="…"`, `href='…'`, `href={'…'}` and an uninterpolated `` href={`…`} ``, and
   an href built from an expression is invisible to it. That is a real miss; whether
   it matters is the question. The anti-vacuity test pins three `/pasantias`
   destinations so a regex that stops matching goes red instead of green.
4. **The e2e assertions land on `/pasantias`, not on hrefs.** Each clicks and then
   asserts the URL *and* that the destination renders exactly one visible `h1`. The
   prompt's "no modal and no iframe" is asserted as `iframe.fp-iframe` count 0 both
   before the click and after the landing, with the Directivos control proving the
   locator still finds a flipbook when one exists.
5. **`pages/index.tsx:276` still carries `id="pasantias"`.** The section anchor is a
   *preservation* criterion — external links and bookmarks point at it — and the
   guard pins it in the opposite direction from everything else in the file, so a
   later cleanup that "finishes the job" fails deliberately.

---

## Deliberately not done

- **Extracting the duplicated inline nav into a shared component.** Five marketing
  pages inline their own header nav, this round opened all of them, and the prompt
  forbids the refactor. Recorded here as the plan asks, not taken.
- **Neither original image was deleted.** `public/barcelona-skyline.jpg` is still
  referenced by `components/quotes/QuotePublicView.tsx:902` and
  `public/public-website-fne.html`; `public/barcelona-innovation.jpg` by the same
  static snapshot. Retiring them is a later round's work.
- **`public/public-website-fne.html` was not touched.** It still contains
  `#pasantias` anchors and both retired image paths. It is a legacy static snapshot
  in `public/`, explicitly out of scope, and every grep and the new guard are scoped
  to `pages/`/`components/` so it cannot pollute them.
- **The homepage still loads `cdn.tailwindcss.com`.** Known backlog item.

---

## Findings — where the prompt or plan is inaccurate

Neither is a blocker; neither changed the work.

1. **[A1]'s stated expectation cannot be produced by [A1]'s stated command.** The
   criterion says `grep -rn '#pasantias' pages/ components/` must return "exactly one
   hit: `pages/index.tsx` `id="pasantias"`". `id="pasantias"` contains no `#`, so
   that grep returns **zero** on a correct tree — and it returned zero for the anchor
   on `main` too, before any of this round's edits. The intent is unambiguous (no
   `href` targets the anchor; the `id` survives) and both halves are satisfied and
   guarded, each by its own assertion. The criterion's *command* wants the wording
   fixed.
2. **"15 links across seven files" is 13.** The prompt's and the PLAN's own
   enumeration lists 13 lines (six pages × 2 nav entries + one footer link), and the
   grep on `main` returned exactly those 13. 15 is the count *after* the two INSPIRA
   CTAs become links. The enumeration itself was complete and correct — including the
   two files the PM added by amendment — so nothing was missed; only the headline
   number is off.

---

## Known limitations

- The Vitest guard scans `pages/**/*.tsx` + `components/Footer.tsx`. A `#pasantias`
  href introduced in a component other than the Footer would not be seen. The scope
  is the prompt's; widening it to all of `components/` is a one-line change if the
  reviewer wants it.
- The e2e nav assertions run against the three specs this machine can run. They are
  in a spec already on `MANDATORY_SPECS`, so CI runs them; nothing here proves the
  rest of that list.
- `/programas` renders its INSPIRA CTA only inside the program modal, which the new
  e2e test does not open — the `/programas` assertion covers the nav link, and the
  CTA there is covered statically by the guard and by the shared `data-testid`.
