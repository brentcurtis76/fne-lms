SESSION: INSPIRA · A7a · SOL (final review)

You are Codex Sol, the independent final reviewer for phase **A7a** of the INSPIRA Comms
plan (`docs/plan/PLAN.md`, frozen v4). You have final say on BLOCKING findings. The phase
is not Done until you pass it.

**Branch:** `phase/a7a-links` @ `a6f78a48` (code `66774a58`), base `main` @ `d07cba42`.
Pushed to `origin/phase/a7a-links`. Not merged.

---

## WHAT THE PHASE WAS FOR

`/pasantias` shipped finished in A6a/A6r/A6b and shipped **orphaned** — nothing on the
marketing site linked to it, and the INSPIRA program was still represented by a Heyzine
flipbook of the retired **Abril 2026** brochure carrying the wrong dates and the retired
€1.000 price. A7a makes the real page the destination, takes both INSPIRA flipbooks off the
site, keeps the two Directivos flipbooks, and takes two owner-approved image swaps on the
homepage while that file is open.

No new business logic. It is a link round, and it should read like one.

---

## WHAT I ALREADY RE-RAN, SO YOU DO NOT SPEND YOUR ROUND RE-PROVING GREEN

All of this I ran myself in the executor's worktree, not from the report:

- `type-check` clean · `lint` clean (`--max-warnings=0`) · `npm test` **264 files / 6207
  tests** · `build` compiled, 156 static pages · `node scripts/check-price-leak.mjs` OK over
  267 files · `CI=1 npx playwright test tests/e2e/pasantias-page.spec.ts
  tests/e2e/pasantias-form.spec.ts tests/e2e/footer-heading-order.spec.ts` → **26 passed**,
  axe green. Exit 0 end to end.
- Greps: `#pasantias` → zero in `pages/`+`components/`; `heyzine` → three hits, all
  Directivos; `Abril 2026` → zero; `id="pasantias"` alive at `pages/index.tsx:276`;
  `href="/pasantias"` → 15 (13 nav/footer + 2 CTAs); both original images still on disk.
- I read the whole source diff. Inside both Directivos blocks exactly one line changed —
  the `<h3>` losing ` - Abril 2026`.
- `npm run test:db` was not run: zero SQL in this round. The full `MANDATORY_SPECS` list
  cannot run on this machine (it needs CI's seeded Supabase stack) — the three specs above
  are this phase's local standard, and CI runs the list.

---

## WHAT I ATTACKED, AND THE ONE MUTANT THAT LIVED

The phase's whole product is a set of link facts, so those facts ship as a guard —
`__tests__/pages/pasantias-site-links.test.ts`, which walks `pages/**/*.tsx` +
`components/Footer.tsx` rather than hand-listing the seven files, and reads `href` *values*
rather than searching source text (a `source.includes('#pasantias')` would be defeated by the
preserved section `id`, which the same file also has to pin in the opposite direction).

Five mutants against real source, restored after each:

| # | Mutant | Result |
|---|---|---|
| M1 | a brand-new `pages/zzz-mutant.tsx` copies the old `/#pasantias` nav link | **killed**, names the new file:line |
| M2 | `href={"/#pasantias"}` — the brace-quoted spelling | **killed**, names file:line |
| M3 | `d87d80f309` removed from `programas.tsx` only, kept on `index.tsx` | **SURVIVED, 8/8 green** |
| M4 | footer href back to `/#pasantias` | killed |
| M5 | `id="pasantias"` deleted | killed |

M1 is the guard's central claim — that walking the directory covers the eighth page nobody
has written yet — and it holds.

**M3 is put in front of you deliberately rather than filed quietly.** The Directivos pin is
`matchesIn(SCOPE, id).length === 0`, i.e. **site-wide** presence, so the flipbook has to
vanish from every file before the pin fires; losing it from one of two pages passes green,
and a partial purge is the likelier accident. I classified it **SHOULD-FIX, not BLOCKING**,
on the grounds that it is guard reach rather than behaviour: no defect ships today, and I
verified that by reading the diff of both Directivos blocks rather than by trusting the
suite. **If you think that reasoning is too comfortable, say so** — you have overturned this
PM on this project's guards repeatedly and been right each time.

---

## THE THREE PLACES I AM LEAST CONFIDENT — spend your round here

1. **Six `<a>` elements became `<Link>`** (`index.tsx` ×2, `programas.tsx` ×2, and the mobile
   entries in `noticias.tsx` and `noticias/[slug].tsx`). My prompt's rule was "`<Link>` where
   the file already imports `Link`, plain `<a>` otherwise", and all seven files import it, so
   the rule resolved to `<Link>` everywhere. The executor declared this prominently rather
   than burying it. The behaviour I checked is the homepage mobile menu, which binds its
   close handler with `mobileMenu.querySelectorAll('a')` in a mount effect — `next/link`
   renders an `<a>`, so it still binds. **What I have not exhausted is every other page's
   menu and every other consequence of client-side routing** replacing what used to be a
   same-document anchor jump on the homepage. If a nav element type change has a cost I
   have not thought of, this is where it is.
2. **The e2e asserts the landing, not the href** — URL plus exactly one visible `h1` — and
   the flipbook check is `iframe.fp-iframe` count 0 before the click and after the landing,
   with the **Directivos CTA required to still open one** as its control. I believe that
   control is what keeps count-0 honest. Tell me if the count-0 assertion is still
   satisfiable by something other than the flipbook being gone.
3. **Coverage gaps I know about and accepted.** `/programas` renders its INSPIRA CTA only
   inside the program modal, which the e2e never opens (static guard covers it, shares the
   `data-testid`). The guard reads only *literal* hrefs, so a computed destination or a
   `router.push('/#pasantias')` is invisible. `public/public-website-fne.html` — a legacy
   static snapshot in `public/` — still carries `#pasantias` anchors and both retired image
   paths; it is out of scope by plan, and every grep and the guard are scoped to
   `pages/`/`components/` so it cannot pollute them. Neither original image is deleted:
   `barcelona-skyline.jpg` is still used by `components/quotes/QuotePublicView.tsx:902` and
   by that snapshot.

---

## TWO CRITERION DEFECTS THAT ARE MINE, ALREADY CORRECTED — so you do not rediscover them

The executor raised both; both were my errors, and both are fixed in `PLAN.md` on this branch.

1. **[A1]'s stated command could not produce its stated expectation.** I wrote that
   `grep -rn '#pasantias' pages/ components/` must return "exactly one hit, the preserved
   `id="pasantias"`". `id="pasantias"` contains no `#`, so a correct tree returns **zero** —
   and it returned zero for the anchor on `main` before any edit. The criterion now reads as
   its two separate facts, each independently asserted by the guard.
2. **"15 links across seven files" is 13** (six pages × 2 nav entries + one footer link). 15
   is the count *after* the two INSPIRA CTAs become links. My arithmetic; the enumeration
   itself was complete, including the two files I added to the scope by amendment
   (`equipo.tsx`, `noticias/[slug].tsx`, which the frozen plan had omitted while its own
   criterion demanded they be covered).

---

## WHAT TO PRODUCE

`docs/plan/reviews/REVIEW-A7A.md`, in the SOP §2.4 block: verdict PASS / REQUEST CHANGES,
findings classified **BLOCKING / SHOULD-FIX / NIT**, each with the file:line and the concrete
failure it causes. If you report inline instead of writing the file, say so explicitly — the
last phase's r2 verdict exists only in the ledger because the file was never written, and I
will not author your artifact for you.
