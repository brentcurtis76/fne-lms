# Fase A6a — review request

**Branch:** `phase/a6a-page`
**Base:** `origin/main` @ `3a7fb9a`
**Commits:** 1 — `/pasantias` landing page + e2e spec + mandatory-list entry
**Executor round:** r1

---

## Objective and scope (from PLAN Phase A6a and prompt `a6a-1.md`)

> **Scope:** `pages/pasantias.tsx` (all static sections), OG/meta,
> `tests/e2e/pasantias-page.spec.ts`.
> **Out of scope:** LeadForm (A6b), links from other pages (A7a).
>
> **Acceptance criteria:**
> - [A1] Compiled Tailwind + brand tokens; `Footer`; `<Head>` OG/Twitter via
>   `app-url`; **public cohort module only** (leak guard stays green).
> - [A2] Sections per Appendix A: hero (fecha chip; primary CTA anchors to
>   `#programa`, which in this phase renders a "Solicita el programa completo"
>   panel with the info@ mailto as interim CTA), por qué Barcelona + claims, día
>   tipo, itinerario (feriado marked), escuelas, equipo, testimonios (if brief),
>   FAQ ≥5 (no prices), WhatsApp CTA (if brief), ficha download CTA →
>   `/api/pasantias/ficha`.
> - [A3] E2E (mandatory list): sections render with brief content; ficha link
>   href; no price tokens in page HTML (assert absence).
> - [A4] Gates + leak script green.

Untouched, as required: both cohort modules, `scripts/check-price-leak.mjs`, the
PDF routes and generators, `middleware.ts`, `components/Footer.tsx`, every other
page. No SQL in this phase (`npm run test:db` not run — zero migrations touched).

## Design, in one paragraph

One page file plus one spec. Every cohort fact is read from
`lib/pasantias/cohort-public.ts` at render time — the headline chip is
`COHORT_HEADLINE` verbatim, the hero counter is
`COHORT_VISIT_DAY_COUNT` / `COHORT_SCHOOLS.length`, the week cards, school tiers,
experts, day structure, objectives and includes/excludes are all `.map()` over
module arrays. Nothing about the cohort is retyped in JSX, so the A1 module stays
the single source and a module correction propagates without touching the page.
Editorial copy (hero line, section intros, FAQ answers) is the only hand-written
text and it carries no cohort facts and no amounts. Dates that the module does
not pre-format (the two week ranges, the three free-day dates) are formatted in
`getServerSideProps` with `Intl.DateTimeFormat('es-CL', { timeZone: 'UTC' })` and
passed down as strings, so no timezone can shift them and a browser without es-CL
locale data cannot produce a hydration mismatch. The `#programa` section is the
interim panel: `id`, section boundary and a comment mark it as the thing A6b
swaps for `LeadForm`.

## Files

| File | Risk | Why |
|---|---|---|
| `pages/pasantias.tsx` (new, +726) | medium | the whole phase; public surface; D-01/D-02 boundary |
| `tests/e2e/pasantias-page.spec.ts` (new, +142) | low | the gate that proves the above |
| `scripts/ci/e2e-mandatory.mjs` (+1) | low | adds the spec to the list CI must actually run |

## Test evidence

- `npm run type-check` → clean.
- `npm run lint` → clean (`--max-warnings=0`).
- `npm test` → **257 files, 4208 tests, all passed** (25.9 s).
- `npm run build` → success; `/pasantias` builds as `ƒ` (SSR), 7.23 kB.
- `node scripts/check-price-leak.mjs` → `OK — scanned 267 file(s) under
  .next/static, no commercial data found.`
- `CI=1 npx playwright test tests/e2e/pasantias-page.spec.ts` → **4/4 passed.**
- `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)` →
  the three pasantías tests and both smoke tests pass; `ci-fixture.spec.ts` fails
  locally (4 failed / 2 skipped) because no seeded local Supabase stack exists in
  this worktree — CI runs `supabase db reset` + `scripts/ci/seed-e2e.mjs` before
  that spec. The skip guard's only complaints are those two `ci-fixture` skips;
  it does not complain about `pasantias-page.spec.ts`, which is the property
  this phase needed to prove.

## Scrutinise these five hardest

1. **`resolveOrigin` weakens `app-url`'s production contract, on purpose.**
   `getAppBaseUrl` throws in production when no origin is configured, which is
   exactly the CI e2e server (`npm run start`, no `NEXT_PUBLIC_BASE_URL`,
   no Vercel vars) — an unguarded call would 500 the page in gate 4. So the
   `catch` falls back to the request's own `Host`. On Vercel production
   `VERCEL_PROJECT_PRODUCTION_URL` is always set, so the fallback is unreachable
   there; on preview `isProduction()` is already false. The value only fills this
   page's own `og:`/`canonical` tags — no artifact outlives the request. If you
   would rather CI set `NEXT_PUBLIC_BASE_URL` and the call stay strict, that is a
   one-line CI change and I will take it.
2. **The FAQ's audience sentence is the one claim not sourced from the module.**
   "Equipos directivos, docentes y líderes de comunidades educativas" is my
   inference from Appendix A-9 ("40+ colegios") and the objectives' framing. It
   is the only eligibility assertion on the page and the owner should veto or
   confirm it. Everything else in the FAQ is module data or the A-8-sanctioned
   lodging coordination framing.
3. **Expert titles are stale in the module — see the finding below.** The page
   renders `COHORT_EXPERTS` verbatim, so it currently prints "Experto invitado"
   for Sergi del Moral, Boris Mir, Pepe Menéndez and Joan Quintana. The prompt
   itself asserts del Moral is "Director". I did not edit copy the module owns.
4. **A header was added that the plan did not ask for.** A slim top bar with the
   FNE logo linking to `/` and a WhatsApp button. Rationale: the page is orphaned
   until A7a and had no way back to the site; it is inside the scoped file and
   adds no cohort facts. Cut it if you disagree.
5. **The price assertion covers rendered HTML, not just the bundle.** The e2e
   greps `page.content()` for `€`, `2.500`, `1.000` and `1.560`. That is
   deliberately the surface `check-price-leak.mjs` cannot see: hand-written page
   copy. Retired amounts stay on the list for the same reason the scanner keeps
   them.

## Finding raised (not fixed here — the module is A1's, not this phase's)

`lib/pasantias/cohort-public.ts` never absorbed the **2026-08-02 Appendix A-6
amendment** (Decision Log: "the owner-reviewed brochure is CANONICAL for
content"). Four experts carry the pre-amendment placeholder `Experto invitado`:

| Expert | Module today | Appendix A-6 (normative) |
|---|---|---|
| Boris Mir | `Experto invitado` | ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer |
| Sergi del Moral | `Experto invitado` | **Director, Institut Escola Les Vinyes** |
| Pepe Menéndez | `Experto invitado` | consultor en transformación pedagógica |
| Joan Quintana | `Experto invitado` | consultor en procesos de cambio, co-autor de «Educación Relacional» |

Coral Regí, Mora del Fresno, Jordi Musons and Sandra Entrena are correct.

This is the same propagation-class miss the ledger has already recorded twice for
the repricing. It is not fixable inside A6a's scope: correcting it touches the
A1 module, `__tests__/lib/pasantias-cohort.test.ts`, and probably the A3
brochure/ficha renders and their `*_VERSION` cache keys. **The page needs no
change when it lands** — it renders whatever the module holds.

## Known limitations / deferred

- No testimonios section: A-12 says launch without one, and the module carries no
  quotes.
- School "aspectos destacados" (what each school is known for) are approved in
  the content pack but are not exported by `cohort-public.ts`, so the school
  cards show name + tier + full-day marker only, as the prompt's fallback allows.
- The page is still orphaned: nothing links to `/pasantias` yet (A7a).
- `npm run lint:testid` not run (advisory); every interactive element on the page
  carries a `data-testid`.

---

# Round r2 — data propagation (prompt `a6a-2.md`)

**Commits:** 2 — r1's page, plus this round's module propagation + guards
**Scope of this round:** close r1's own finding (the A-6 expert titles that never
reached `cohort-public.ts`) and r1's should-fix (school *aspectos destacados* not
exported), then make both un-droppable with tests.

## What changed

| File | Change |
|---|---|
| `lib/pasantias/cohort-public.ts` | Four placeholder expert roles replaced with the Appendix A-6 wording; `note` added for the two week-1 hosts; `levels` + `highlights` added to `CohortSchool` as **required** fields and filled for all seven schools from content-pack §5b. |
| `pages/pasantias.tsx` | New `SchoolDetail` sub-component renders levels + highlights on every school card; expert cards render the host marker; escuelas section stacked by tier instead of two columns. |
| `lib/pasantias/cohort-commercial.ts` | `BROCHURE_VERSION` `2026-10-v3` → `2026-10-v4` (D-05 cache key; the brochure prints all eight roles). |
| `__tests__/lib/pasantias-cohort.test.ts` | +5 tests: the placeholder/empty-role guard, the four corrected titles verbatim, the host markers, every-school-has-levels-and-a-highlight, and two verbatim §5b pins. |
| `lib/pasantias/__tests__/pdf.test.ts` | +2 tests: neither PDF's text layer may contain `Experto invitado`; the brochure must print the three corrected role strings. |
| `tests/e2e/pasantias-page.spec.ts` | The equipo section must not contain the placeholder and must contain one real title as a **literal**; every school card must show its levels and first highlight; `Metaprendizaje` pinned. |
| `docs/plan/evidence/a3/brochure-07.png`, `brochure-10.png` | Re-rendered — the only two of the twelve pages that changed. |
| `docs/plan/evidence/a6a/` | New: page screenshots at 1280 and 390 px + README. |

## Guards demonstrated failing

Reverting Pepe Menéndez to `Experto invitado` and emptying one school's
`highlights` fails **5 tests** — the module guard names the person
(`Pepe Menéndez still carries the placeholder role`), the school guard names the
school (`Escola Sadako has no highlights`), and the brochure text-layer guard
fires on the rendered PDF. Rebuilt and re-run, the e2e also fails with the
placeholder visible in the received string. Restored: 4216/4216 and 4/4 green.

## Scrutinise these hardest

1. **`levels` / `highlights` are required, not optional.** That is the actual
   guard — the runtime test is a backstop for data that is present but empty. It
   means every future school must arrive with pack-approved copy or fail
   `type-check`. Deliberate; say so if it is too strict.
2. **Boris Mir lost his `school` field.** A-6's wording for him names Institut
   Angeleta Ferrer twice inside the role string, so keeping `school` would print
   it a third time. The alternative — a shorter role plus the school field —
   would not be the Appendix's wording.
3. **Initial capitals on two roles.** A-6 writes "consultor en transformación
   pedagógica" mid-sentence inside a table cell; the card renders it as a
   standalone line, so it ships as "Consultor …". This is the same mechanical
   rule already documented on `COHORT_INCLUDES`, and the only edit made to any
   A-6 string.
4. **`FICHA_VERSION` deliberately not bumped.** The ficha features only the first
   four experts, none of whose roles changed, and it does not render `note`. Its
   extracted text is byte-identical before and after (diffed, not assumed), so
   bumping would invalidate a valid cached PDF for nothing.
5. **The escuelas layout change.** Not in the prompt. With levels + highlights on
   each card, the 2-vs-5 column split left ~800 px of empty column on desktop;
   the section is now stacked by tier. Data, testids and copy are unchanged.

## Known limitations / deferred (r2)

- **A-6 also carries "INSPIRA" on the first two roles** ("Directora del programa
  INSPIRA", "Coordinadora INSPIRA") where the module says "Directora del
  programa" / "Coordinadora". The prompt marks both as already correct, so they
  were left alone — flagged rather than silently changed. One word each if the
  owner wants them.
- Content-pack §6 lists Boris Mir as plain "Institut Angeleta Ferrer" and both
  consultants as "Conferencista INSPIRA", which contradicts Appendix A-6.
  Appendix A-6 is the normative source (and the prompt pins it), so §6 is now
  stale; PM-owned.
- School highlights are **not** rendered into the brochure or ficha — out of this
  round's scope, and neither document has a per-school block to hold them.
- The page is still orphaned until A7a; `#programa` is still the interim mailto
  panel until A6b.

---

# Round r3 — Sol FAIL closed (5 blocking + 2 should-fix)

**Branch:** `phase/a6a-page` · base `4de30f3` (r2 head) · 1 commit
**Prompt:** `docs/plan/prompts/a6a-3.md`

Sol's content-fidelity audit passed in r2; what failed was the machinery. Three
of the five blocking findings were guards that did not guard, so for each of
those the deliverable is not the fix but the demonstrated failure when the fix
is reverted. All mutation proofs below were run, not reasoned about.

## What changed, by finding

**B1 — the leak scanner missed ordinary Spanish prices.**
`scripts/check-price-leak.mjs`'s `CURRENCY` was `(?:€|EUR)`. It now also
recognises `eur` / `euro` / `euros`, case-insensitively, bounded on both sides by
non-letters. The boundary is the whole reason it is written out rather than
using the `i` flag: **`Europa` is live copy on this page** ("recorrer Barcelona o
conocer Europa"), and a naive alternation fires on every free-day block.

One correction to the finding's diagnosis, stated because it changes what the
fix is: **the bare `2500` was never the gap.** `PRICE_AMOUNT_PATTERNS` has always
spelled the separator `[.,\s]?`, so `2500`, `2.500`, `2,500` and `2 500` all
matched already; the same is true of `1000`, `1560` and `560`. What was missing
was only the currency word. Both spellings are now pinned against every currency
form so the property cannot quietly lapse.

*Proof:* 19 new cases in `__tests__/scripts/check-price-leak.test.ts`, driven
through the scanner's own exported `scanText` (not a copy of it), including
Sol's exact injection. Reverting `CURRENCY` to `(?:€|EUR)` turns **9** of them
red by name — `fires on Sol's exact injection`, `fires on the same amount
grouped`, `fires on title case`, `fires on the singular word`, `fires on the
retired programme fee in words`, `fires on the retired total in words`, `fires on
the retired lodging package in words`, `fires on the lodging band, both figures
in words`, `fires on the lodging band minimum in words`. (`2500 EUROS` survives
the old pattern only because `EUR` is a prefix of `EUROS` — which is the sort of
accident that made the old guard look like it worked.)

The windows were **not** touched: `node scripts/check-price-leak.mjs` on an
unmodified production build reports OK over 267 files with the wider
alternation, so no narrowing was needed. This repo does ship the string `EUR`
in unrelated bundles (consultant rates, expense reports) and none of it fires.

**B2 — the fidelity guards were partial and self-referential.**
`__tests__/lib/pasantias-cohort.test.ts` gains `ORACLE_SCHOOLS` (7 rows: name,
tier, levels, the full ordered highlight list, `immersionDays`/`fullDay`) and
`ORACLE_EXPERTS` (8 rows: name, role, school, host note), both hand-transcribed
from Appendix A-5/A-6 and pack §5b and both compared with `toEqual`, which is
symmetric — an added, removed, renamed or reordered entry fails. They are
literals in the test file: not imported, not derived, not shared with the module.

At the page level, `tests/e2e/pasantias-page.spec.ts` gains a `PINNED` block with
at least one literal assertion per section (headline, hero stats, week labels,
día tipo, the seven school names, one level string, one highlight, three expert
roles, the objective count and the first objective's opening). The e2e still
reads the module for rendering assertions — that is its job — but a wholesale
module corruption now fails at both levels.

*Proof:* Sol's three mutations, applied one at a time:

| Mutation | Test that failed |
|---|---|
| La Maquinista `levels` → `ESO` | `the independent oracle (Sol r2 B2) > matches the hand-transcribed A-5 / §5b school table exactly, row for row` |
| La Maquinista `highlights[0]` → `Innovación educativa` | same test |
| Jordi Musons `role` → `Coordinador` | `the independent oracle (Sol r2 B2) > matches the hand-transcribed A-6 expert table exactly, row for row` |

Reverted, 54/54 green.

**B3 — whole-page heading order failed.**
`components/Footer.tsx`'s two section headings are now `h2` instead of `h4`,
classes untouched (`text-lg font-bold mb-6` carries the size, so nothing moves
visually). The A6a heading assertion is un-scoped from `<main>` to the whole
document.

`Footer` is shared by 8 public pages; all 8 were checked on this build. The
Footer change **regresses none of them** — it can only ever remove a jump, since
the footer's headings come last in DOM order and moving them up a level cannot
affect any heading before them. Three pages do carry pre-existing `heading-order`
violations of their own, all far above the footer and none introduced here:
`/nosotros` (h1 → h3 "Transformar"), `/programas` (h1 → h3 "AULA GENERATIVA"),
`/brand-preview` (h2 "4. Cards" → h4). Raised as a finding; not fixed, because
restructuring three unrelated marketing pages is not this phase's scope.

New spec `tests/e2e/footer-heading-order.spec.ts` (added to `MANDATORY_SPECS` —
CI runs only that list, so a guard off it never runs) asserts precisely the
Footer's own contract on 6 of those pages: no jump **into** the footer and none
**inside** it. Deliberately narrow, so it neither adopts nor hides the three
pages' own debt.

*Proof:* reverting both `h2`s to `h4` fails
`pasantias-page.spec.ts > has one h1, ordered headings across the whole document
and a Tab-reachable CTA` plus the footer spec on `/programas`,
`/brand-preview` and `/pasantias` — and passes on `/`, `/nosotros` and `/equipo`,
whose last body heading is an `h3`. That asymmetry is exactly why the defect
looked absent for two rounds.

**B4 — text contrast failed WCAG AA.**
New token `brand_accent_text: '#b45309'` (amber 700). Measured against the real
background (#ffffff, both the equipo card and the objectives section):
**5.02:1** — computed from the WCAG relative-luminance formula, not assumed.
`brand_accent_hover` (#f59e0b) measures 2.14:1 and `brand_accent` (#fbbf24)
1.66:1, so neither may carry small text on white; both keep their surface/hover
roles untouched everywhere else in the repo. The two host markers (13 px), the
thirteen objective numbers (15 px) and the decorative `·` in `SchoolDetail` now
use the new token — the third is `aria-hidden` and was never a violation, but
leaving one lighter amber beside the others would have been an inconsistency
with no reason.

The durable half: `@axe-core/playwright` (already a devDependency, previously
unused) is wired into the A6a e2e and fails on any **serious or critical**
violation. Current result: zero.

*Proof:* reverting the two flagged elements to `brand_accent_hover` and
rebuilding fails `has no serious or critical accessibility violations (axe)`
with, verbatim:
`serious · color-contrast · 15 node(s) · li[data-testid="pasantias-expert-2"] > … | li[data-testid="pasantias-objective-0"] > …`
— Sol's fifteen, named.

Note for the reviewer: axe rates `heading-order` **moderate**, so B3's defect
does *not* surface through this filter. The explicit heading-sequence assertion
is what covers it; the two checks are not redundant.

**B5 — the page defeated the production-origin contract.**
The try/catch in `pages/pasantias.tsx` is deleted; `getAppBaseUrl(context.req)`
is called directly and allowed to throw. `.github/workflows/ci.yml` now writes
`NEXT_PUBLIC_BASE_URL=http://localhost:3000` into the `.env.local` it already
generates.

**S1 — invented content.** `Visita de media jornada` → `Visita en Barcelona`.
The replacement claims no duration; it carries the same contrast A-5 itself
draws (El Puig and Les Vinyes take the whole day *because they are outside
Barcelona*). No duration data was added to the module. A new e2e test asserts the
section contains neither `media jornada` nor `medio día`.

**S3 — the keyboard test.** `.focus()` is gone; the test presses `Tab` from the
document start until the primary CTA holds focus (bounded at 20 presses, reached
in 3), then `Enter`.

**S2 — not acted on**, per the prompt.

**Also folded in:** Coral Regí → `Directora del programa INSPIRA`, Mora del
Fresno → `Coordinadora INSPIRA` (Appendix A-6 verbatim), pinned in the new oracle
and in the page-level `PINNED` block.

## Files changed

| File | Risk | Why |
|---|---|---|
| `components/Footer.tsx` | **highest — shared by 8 public pages** | h4 → h2 ×2, classes unchanged |
| `.github/workflows/ci.yml` | high — CI gate 4 | one env line, must stay before the build step |
| `tailwind.config.js` | medium — global theme | additive token only, nothing redefined |
| `scripts/check-price-leak.mjs` | medium — CI guard | `CURRENCY` widened; windows and amounts unchanged |
| `pages/pasantias.tsx` | medium | origin, 3 colour classes, 1 copy string |
| `lib/pasantias/cohort-public.ts` | medium | 2 role strings |
| `lib/pasantias/cohort-commercial.ts`, `lib/pasantias/pdf/filenames.ts` | medium — D-05 cache keys | v4 → v5, v1 → v2 |
| `scripts/ci/e2e-mandatory.mjs` | medium | one spec added to the list |
| `tests/e2e/pasantias-page.spec.ts`, `tests/e2e/footer-heading-order.spec.ts`, `__tests__/…` | low | tests only |
| `docs/plan/evidence/a6a/*`, `docs/plan/evidence/a3/*` | none | re-rendered artefacts |

## Scrutinise hardest

1. **The `CURRENCY` boundary.** `(?<![A-Za-z])[Ee][Uu][Rr](?:[Oo][Ss]?)?(?![A-Za-z])`
   is the only new regex in a CI gate. It is bounded on letters, not on word
   characters — `2500EUR` still matches (a leak shape) while `Europa` and
   `eurocentrismo` do not. Both directions are tested; the clean-build run is the
   evidence that matters most.
2. **The `h4 → h2` choice.** `h3` would have been the conservative-looking
   option and is the wrong one: on a page whose last body heading is an `h1`, an
   `h3` footer is itself a two-level jump. `h2` is safe after any level.
3. **The narrow footer spec.** It deliberately does not assert whole-document
   heading order on the other pages. That is a judgement call — the alternative
   was to inherit three unrelated pages' debt or weaken the assertion.
4. **The two PDF version bumps.** If `FICHA_VERSION` were left at v1, A4 would
   keep serving a cached ficha with the pre-`INSPIRA` titles. r2 correctly did
   not bump it; r3 must, and the reason is one row of `slice(0, 4)`.
5. **`Visita en Barcelona`.** It is a claim, just a much weaker one than the
   string it replaces. It rests on A-5's "están fuera de Barcelona" implying the
   other five are inside it. If the PM reads that as still too much inference,
   the honest fallback is to print nothing at all on those cards.

## Known limitations / deferred (r3)

- **Three pages carry pre-existing `heading-order` violations** in their own
  bodies (`/nosotros`, `/programas`, `/brand-preview` — listed above). Not this
  phase's scope; the footer spec is scoped so it neither fixes nor hides them.
- **`NEXT_PUBLIC_*` is inlined at build time.** An attempt to prove B5's throw at
  runtime — stripping the origin vars from `.env.local` and restarting
  `next start` — did **not** produce a 500, because the value is baked into the
  server bundle by the build. The consequence is real and load-bearing: the CI
  step that writes `.env.local` must stay ahead of the build step. It does, and
  the workflow now says so in a comment. A build-time proof was not run (it costs
  two extra production builds and B5's stated acceptance is "the e2e passes with
  the catch gone and the env set", which it does).
- `ci-fixture.spec.ts` cannot run in this worktree — it needs T2's seeded local
  Supabase stack and this `.env.local` points at the remote project. 4 failed / 2
  did not run there; every other mandatory spec is green.
- The content-pack §6 vs Appendix A-6 contradiction is **still open and still
  PM-owned** (§6 calls Menéndez and Quintana "Conferencista INSPIRA" and gives
  Boris Mir no role). The module and both oracles follow A-6, and the module now
  says so in a comment.
- The page is still orphaned until A7a; `#programa` is still the interim mailto
  panel until A6b.

---

# Round r4 — Sol r2 B1 residue closed (decimal-dot prices)

**Branch:** `phase/a6a-page` · base `ca8e024` (r3 head) · 1 commit
**Prompt:** `docs/plan/prompts/a6a-4.md`

Sol's second review verified B2–B5, S1 and S3 closed by mutation and withdrew
S2. One blocking residue remained and is the only thing this round touches: the
leak scanner's amount tail admitted a comma and nothing else, so
`Programa: 2500.00 euros por persona` reached a real production bundle while
`check-price-leak.mjs` exited 0.

## Which approach, and why

The prompt offered two: normalise the digit run to a canonical form, or extend
the tail to `(?:[.,]\d{2})?`. **I took normalisation.** The narrow fix works,
but it is a fourth special case on a guard that had already been wrong three
times in three different ways — and the next convention (a thin-space grouping,
an amount inside a longer number) would have been a fifth.

`scripts/check-price-leak.mjs` now tokenises a written number **maximally** and
normalises it to a canonical integer, and the three amount lists hold values
(`'2500'`) instead of spellings (`'2[.,\s]?500'`, `'2\.5e3'`). `2500`, `2.500`,
`2,500`, `2 500`, `2500,00`, `2500.00`, `2,500.00`, `2.500,00` and the
minifier's `2.5e3` all collapse to `2500`.

The prompt's trap was the trailing `(?![.,]\d)` — the false-positive control
added after Sol's r1 S1, and the same clause that rejected a dot decimal. It is
not widened; it is **replaced by a stronger invariant**. Maximal tokenisation
means `€12.500` is the single number `12.500`, so there is no `500` left over to
compare against a protected amount, and `€1.200,70` is `1.200,70`, so there is
no `70`. `2.5000` is rejected by the grammar itself: four digits after a dot is
neither a thousands grouping nor a two-decimal tail, so it is not an amount.
Every r1 S1 control is still pinned and still green, now for a structural reason
rather than a lookaround.

The window logic changed shape with it — `GAP`/`BAND_GAP` are character counts
rather than regex fragments, and proximity is a binary search over the file's
currency markers instead of a `CURRENCY GAP amount|amount GAP CURRENCY`
alternation. The windows themselves are unchanged (120 and 12). Files with no
currency marker skip tokenisation entirely, so the rewrite does not slow the
scan of the ~267 client files.

## Proof

`docs/plan/evidence/a6a/leak-guard-r4.md` — two production-build mutants, each
scanned by the **r3** scanner and the **r4** scanner against the same
`.next/static`: r3 says OK/exit 0, r4 says FAIL/exit 1 and names the chunk and
offset. Then the page is restored, rebuilt, and the guard is green on the same
267 files.

## Scrutinise hardest

1. **`splitNumber`'s four grammars are the whole false-positive surface.** Plain,
   plain-with-decimals, grouped-by-a-consistent-separator, and grouped-plus-a-
   different-decimal-separator. Anything outside them is "not an amount" and is
   silently skipped. That is deliberate (it is what kills `2.5000`), but it is
   also where a real leak could hide if a bundler emits an amount in a shape none
   of the four describe. I could not construct one; the exponential path
   (`2.5e3`, `1e3`) is the only non-grammar shape the minifier was observed to
   produce and it is handled separately by `shiftDecimalPoint`.
2. **Maximal tokenisation can mask as well as bound.** `€70 120` tokenises as
   one grouped number `70 120` → `70120`, so neither band figure is seen. Every
   instance I could think of is semantically correct (`€120 000` really is
   120000), and the alternative — dropping the space separator — loses `€2 500`,
   which the old pattern caught. Newline and tab are deliberately **not**
   separators for exactly this reason. Documented at `NUMBER_TOKEN`.
3. **Cents are dropped, not compared.** `€2.500,00` and `€2.500,50` both
   normalise to `2500` and both fire, matching the old `(?:,\d{2})?` tail. If the
   intent were "only exact amounts", `€2.500,50` should be silent — I judged a
   fee quoted with cents to be the same fee.
4. **`nearestMarker` returns the nearest marker only.** If the nearest is outside
   the check's window, no finding is recorded — correct, since a farther marker
   is farther still. Worth a second pair of eyes on the binary search's boundary
   (`markers[low].start >= end`) and on the claim that markers and number tokens
   can never overlap (they are built from disjoint character classes: `€`/letters
   vs digits and separators).
5. **The exponent cap.** `[eE]\+?\d{1,2}` — two digits. Uncapped, `1e999999`
   would ask `shiftDecimalPoint` for a gigabyte of zero padding on a hostile or
   merely odd bundle. Two digits covers every shape the minifier emits near a
   four-digit amount, but it is a cap, and caps are where things get missed.

## Known limitations / deferred (r4)

- `€2\n500` no longer fires; it did under `2[.,\s]?500`. Newline is not a
  thousands separator in any convention and minified bundles are single-line, so
  this is an intentional trade for the masking safety described above.
- Everything Sol left out of scope stays out: the pre-existing `heading-order`
  debt on `/nosotros`, `/programas`, `/brand-preview`; `ci-fixture.spec.ts`,
  which still needs T2's seeded stack and cannot run in this worktree; the
  content-pack §6 vs Appendix A-6 contradiction (PM-owned).
- No evidence PNGs were re-rendered — no rendered copy changed. `pages/pasantias.tsx`
  is byte-identical to `ca8e024`.
