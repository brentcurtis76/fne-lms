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
