# Fase A1 — review request

**Phase:** A1 — Cohort data modules + leak guard + homepage date fix
**Branch:** `phase/a1-cohort` (base `origin/main` @ `baec41a`)
**Round:** 1 (executor)
**Status reported:** FINDINGS — see §6. Everything Appendix A specifies is built and
green; the Appendix A-7 content block is not, because its source is not reachable.

## 1. Objective and scope

Split the Pasantías INSPIRA cohort data into a client-safe public module and a
server-only commercial module (D-01), make the split mechanically enforced rather
than a matter of discipline (D-02), and stop the homepage advertising dates that
have already passed.

**In scope:** `lib/pasantias/cohort-public.ts`, `lib/pasantias/cohort-commercial.ts`,
`scripts/check-price-leak.mjs`, CI wiring, `__tests__/lib/pasantias-cohort.test.ts`,
the "Próximas Expediciones" card in `pages/index.tsx`.

**Out of scope:** the `/pasantias` landing page (A6a), the PDF generators (A3),
link rewiring and the flipbooks (A7a), the lead form (A6b), nav, contact form.

## 2. Files, grouped by risk

**Higher risk — the guard is the whole enforcement mechanism**
- `scripts/check-price-leak.mjs` (new) — post-build scan of `.next/static/**`.
- `.github/workflows/ci.yml` (+6) — one step in gate 4, after `npm run build`.

**Medium — consumed by every later Track A phase**
- `lib/pasantias/cohort-public.ts` (new) — cohort facts, zero monetary fields.
- `lib/pasantias/cohort-commercial.ts` (new) — prices, payment terms, brochure
  constants, `COMMERCIAL_SENTINEL`.

**Lower**
- `__tests__/lib/pasantias-cohort.test.ts` (new) — 21 tests.
- `pages/index.tsx` (+4/−9) — the dates card only.

## 3. Test evidence

- `npx vitest run __tests__/lib/pasantias-cohort.test.ts` → 21 passed.
- `npm run type-check` → clean.
- `npm run lint` → clean (zero warnings).
- `npm test` → 233 files, 3466 tests, all passed.
- `npm run build` → succeeded through "Collecting page data".
- `node scripts/check-price-leak.mjs` → OK, 266 files scanned.
- Guard failure demonstrated end to end and then reverted:
  `docs/plan/evidence/a1/leak-guard.md`.

## 4. Scrutinise these hardest

1. **The leak guard's pattern set is the only thing standing between
   `cohort-commercial.ts` and a published price list.** The first version of the
   script would have passed a build in which accented commercial copy leaked,
   because the minifier emits `Extensi\xf3n`, and would have missed `1000`
   because it is emitted as `1e3`. Both were found by actually running the leak,
   not by reading the code — so assume more of the same is possible and attack
   the pattern set. In particular, `priced-amount` did not fire in the demo.

2. **`COMMERCIAL_SENTINEL` is weaker than it looks.** It only travels with a
   leak that imports the `COHORT_COMMERCIAL` object; a leak importing a single
   price constant tree-shakes it away. That is documented, and the copy/amount
   checks exist for that case, but the residual gap is a leak of a bare numeric
   constant with no currency marker and no commercial string anywhere near it.

3. **`PRICE_AMOUNT_PATTERNS` duplicates the Appendix A-8 amounts in a second
   file.** A price changed in `cohort-commercial.ts` and not in the script is a
   price the guard stops looking for. A comment says so; nothing enforces it. I
   judged importing the TS module from an `.mjs` build script to be worse, but
   this is a real drift surface and worth a second opinion.

4. **The 120-character currency window is tuned to one observed bundle layout.**
   It was measured against the leaked chunk and verified not to fire on a clean
   build of this repo, which does ship unrelated euro code (consultant rates,
   expense reports). A future dependency that puts `EUR` near the digits 560 or
   810 would red the build on an unrelated PR.

5. **The empty Appendix A-7 fields.** `COHORT_OBJECTIVES`, `COHORT_DAY_STRUCTURE`,
   `COHORT_INCLUDES`, `COHORT_EXCLUDES`, `COHORT_LODGING_AREA` and
   `COHORT_MADRID_SCHOOLS` ship empty, listed in `COHORT_CONTENT_PENDING`. This
   is deliberate (§6) but it does mean A3 and A6a will consume a module with
   blank sections unless the content lands first.

## 5. Judgment calls made

- **Derived rather than literal date label.** `COHORT_DATE_LABEL` is computed
  from `COHORT_WEEKS`, so the headline cannot drift from the ISO calendar it
  claims to describe; the test pins the computed output to
  `5–9 y 13–16 de octubre`.
- **`COHORT_PRICE_TOTAL` is a `reduce`, not the literal 1560.** The parts and the
  total cannot disagree. Side effect: `1560` never appears in any bundle.
- **The free-day note drops "para conocer Europa"** (A-4's marketing phrasing)
  and keeps the normative fact (long weekend, Fiesta Nacional, schools closed).
  The word "Europa" contains the substring `eur`, which the D-01 serialization
  test greps for; the travel line belongs to A6a's page copy anyway.
- **The homepage card became a single cohort**, not two. There is one October
  2026 cohort; the previous two-cell "Primer/Segundo Cohorte" grid had no second
  cohort to hold.

## 6. Known limitations / deferred

- **Appendix A-7 content is missing and was not invented.** A-7 points at the
  PPTX "BROCHURE INSPIRA 2026 - oct2026 2.0" for the 13 objectives, the día tipo,
  and includes/excludes. That file is not in the repo and was not reachable from
  this session (searched the repo, `~/Documents`, `~/Downloads`, `~/Desktop`).
  The only INSPIRA brochure this repo can reach is the Heyzine flipbook for
  **Abril 2026**, whose "10 días" claim Appendix A-4 explicitly retires — so it
  is the wrong source, not merely an old one. Writing plausible objectives would
  put unapproved marketing claims in front of prospects, which is the exact
  failure mode Appendix A's supremacy rule exists to prevent. Lodging area and
  the Madrid school names are absent from Appendix A for the same reason.
- Both flipbook modal titles still say "Abril 2026". [A4] permits this until
  A7a rewires them. "Noviembre 2026" is gone from the page entirely.
- No e2e spec was added for the homepage card; the phase's test plan is unit-level
  and A6a/A6b own the page-level specs.

---

# Round 2 — Appendix A-7 content fill

**Round:** 2 (executor) · **Status reported:** COMPLETE · base = round 1's `b03dd56`
(round-1 code untouched).

## R2.1 What changed and why

Round 1 returned FINDINGS because the A-7 source PPTX lived outside the repo. The
PM resolved that by transcribing the block verbatim into `docs/plan/PLAN.md`
("Appendix A-7 (verbatim content)"). This round fills the six exports that shipped
empty and retires `COHORT_CONTENT_PENDING`. No other file in the phase was touched.

- `lib/pasantias/cohort-public.ts` (+94/−45) — 13 objectives, día tipo (3 blocks),
  includes (8) / excludes (4), `COHORT_LODGING_AREA`, three Madrid schools;
  `COHORT_CONTENT_PENDING` and the empty-export scaffolding deleted.
- `__tests__/lib/pasantias-cohort.test.ts` (+79/−2) — 21 → 31 tests.

## R2.2 Scrutinise these hardest

1. **The two A-16 holds are the only places this file is not verbatim.** A-16
   (nights covered by the €560 lodging, and the meal-to-day mapping) is still open
   with the owner, so the lodging item is exactly `Alojamiento en Barcelona (base
   doble)` — the source's night count and its "habitación simple a consultar"
   aside are both dropped — and the source's `comidas en días de visita` is
   omitted entirely. Check that judgment: I kept `Cena de cierre`, because the
   excludes line `Cenas (salvo la de cierre)` is verbatim, carries no A-16 hold,
   and asserts the closing dinner independently. Dropping it would have made the
   two lists contradict each other.
2. **`Desayuno a media mañana en las escuelas` was kept.** It is a meal claim, and
   the prompt said to omit per-day meal claims. I read A-16 as being about the
   *mapping of meals to days/dates* for the two-week format, and this item maps to
   "at the schools", not to a day count — so it stays verbatim. If the reviewer
   reads A-16 wider, this is the one line to cut.
3. **The D-01 serialization grep was narrowed, and that is a guard weakening.**
   `/€|price|precio|eur/i` → `/€|price|precio|\beur(?:os?)?\b/i`. It had to change:
   A-7 names `Colegio Virgen de Europa`, and `Europa` contains `eur`. The bounded
   form still fails on `EUR`, `euro` and `euros` and still rejects `Europa` as a
   false positive — but it is a looser net than round 1 shipped, deliberately.
   `scripts/check-price-leak.mjs` is unaffected: its currency token is
   case-sensitive `(?:€|EUR)`, which `Europa` never matched.
4. **`COHORT_LODGING_AREA = 'Barcelona'` is derived, not quoted.** A-7 says
   "alojamiento en Barcelona en base doble" and names no neighbourhood; the field
   carries the city and nothing finer. If the plan's `[A1]` "lodging area" meant a
   barrio, the source does not supply one.
5. **Nothing consumes these exports yet.** A3 and A6a are the first readers, so
   the only proof the copy is right is that it matches the PLAN block character
   for character. Spot-check objectives 1 and 13 against `PLAN.md` — the tests pin
   exactly those two.

## R2.3 Test evidence (round 2)

- `npx vitest run __tests__/lib/pasantias-cohort.test.ts` → 31 passed (was 21).
- `npm run type-check` → clean · `npm run lint` → clean (zero warnings).
- `npm test` → 233 files, 3476 tests, all passed.
- `npm run build` → succeeded · `node scripts/check-price-leak.mjs` → OK, 266 files.

## R2.4 Known limitations / deferred (round 2)

- **A-16 is still unanswered.** When it lands, the lodging item and the meals item
  need their detail restored — the code comment on `COHORT_INCLUDES` says which
  two lines and why. A test asserts no export matches `/PENDIENTE|A-16/i`.
- Round 1 dropped "para conocer Europa" from the free-day label to dodge the `eur`
  grep. Now that the grep is bounded, that workaround is no longer needed — but
  the phrase is A6a page copy, so restoring it is A6a's call, not this round's.
- The worktree for this round was cut from `origin/phase/a1-cohort`, whose
  `PLAN.md` predates the A-7 block (the block is committed on `phase/t2-ci`). The
  verbatim source was read from the main checkout at `784d7c6`; the two ledgers
  and plans union at merge as usual.

---

# Round 3 — A-8 lodging pricing model (delta only)

**Round:** 3 (executor) · **Status reported:** COMPLETE
**Base:** `origin/phase/a1-cohort` @ `9bd389b` (round 2's head)
**Commits:** `65aa52b` (the delta) + a one-line follow-up correcting a comment
that still referred to "the total" after the total was removed.

## R3.1 What this round was

Round 2 was executed faithfully against a prompt that predated the owner's
2026-07-31 lodging amendment — a dispatch race, triaged by the PM in the ledger.
This round applies only the missing delta; round 2's content work is untouched.

The amendment: Barcelona lodging is no longer a fixed €560 double package and
there is no €1.560 combined total. Programme stays €1.000 per person; lodging is
€70–120 per person per night depending on the type of accommodation. Prices are
commercial data, so the band lives in the commercial module only and the public
module carries no lodging pricing and no lodging inclusion at all.

## R3.2 Files

- `lib/pasantias/cohort-commercial.ts` (+19/−9, +1/−1 in the follow-up) — `COHORT_PRICE_ITEMS` drops the
  `alojamiento` item; `COHORT_PRICE_TOTAL` **removed** (a band times an unstated
  number of nights has no total); adds `COHORT_LODGING_PER_NIGHT_EUR`
  `{min:70,max:120}` and `COHORT_LODGING_NOTE`, derived from it so copy and data
  cannot drift; `COHORT_COMMERCIAL` gains `lodgingPerNightEur` + `lodgingNote`
  and loses `total`. `BROCHURE_VERSION` `2026-10-v1` → `-v2` (the file's own rule:
  the `propuestas` bucket is keyed by it — see R3.5).
- `lib/pasantias/cohort-public.ts` (+11/−14) — includes list drops
  "Alojamiento en Barcelona (base doble)" and restores the A-7 meals line
  "Comidas incluidas en los días de visita y cena de cierre" in place of round 2's
  bare "Cena de cierre". The list is now A-7's own seven items in A-7's order.
  Two comments rewritten (A-16 is closed; lodging is not public data).
- `__tests__/lib/pasantias-cohort.test.ts` (+69/−12, +1/−1 in the follow-up) —
  31 → 34 tests.
- `scripts/check-price-leak.mjs` (+15/−6) — amount patterns and copy patterns.
- `docs/plan/evidence/a1/leak-guard.md` (+55) — §5, the r3 guard demo.

## R3.3 Test evidence

Gate chain run verbatim from the prompt, in the round's worktree:

- `npx vitest run __tests__/lib/pasantias-cohort.test.ts` → **34 passed** (was 31).
- `npm run type-check` → clean · `npm run lint` → clean (zero warnings).
- `npm test` → **233 files, 3479 tests, all passed**.
- `npm run build` → succeeded · `node scripts/check-price-leak.mjs` → OK, 266 files.

Two guards were mutation-tested rather than assumed:

1. Temporarily re-adding `export const COHORT_PRICE_TOTAL = 1560` turned the
   no-total test red (`expected … to not have property "COHORT_PRICE_TOTAL"`),
   then reverted.
2. Leaking `COHORT_LODGING_NOTE` into `pages/index.tsx` turned the price-leak
   script red on 3 `commercial-copy` matches, then reverted. Full output in
   `docs/plan/evidence/a1/leak-guard.md` §5.

## R3.4 Scrutinise these

1. **The leak guard now covers the lodging band by copy, not by amount.** `560`
   and `1[.,\s]?560` are gone from `PRICE_AMOUNT_PATTERNS`; `70` and `120` were
   deliberately **not** added, because two- and three-digit numbers near a euro
   sign are everywhere in minified output and the repo ships unrelated
   euro-denominated code. Coverage moved to `commercial-copy`, where
   `Alojamiento \(habitación doble\)` (now a dead string) was replaced by
   `por persona por noche`. The §5 demo shows this catching a leak the sentinel
   missed entirely — but it is a judgment call about where the tripwire sits, and
   it is the one to argue with if any is.
2. **`COHORT_PRICE_TOTAL` was deleted, not zeroed.** Nothing imports it yet (A3 is
   the first reader and does not exist), so removal is free today. If A3 wants a
   "desde" figure it must build one from the band explicitly and decide what the
   night count is — which is the point.
3. **The public includes list changed shape, and one item is a meal claim.**
   "Desayuno a media mañana en las escuelas" survived round 2's A-16 caveat and is
   still here; the restored meals line now sits beside it. Both are A-7 verbatim
   and A-16 is closed on generic phrasing, so neither states a per-day mapping —
   but if the reviewer reads A-16's closure narrowly, these are the two lines.
4. **The D-01 numeric test switched from `toContain` to bounded regex** and gained
   `70`/`120`. That makes it stricter (the band must not reach public data) and
   less brittle (`560` no longer matches inside `1560`). Verified with positive
   and negative controls. Risk: a future public figure that legitimately *is* 70
   or 120 would fail this test — deliberate, and cheap to revisit.
5. **`BROCHURE_VERSION` bumped without being asked to.** The prompt's delta did
   not mention it; the file's own comment says to bump whenever a value changes,
   and A3 keys the `propuestas` bucket on it. No PDFs exist yet, so nothing is
   invalidated either way. Flagged because it is outside the literal delta.

## R3.5 Known limitations / deferred

- **Madrid's €810 is untouched and still carries the owner's doubt.** Amended A-8
  says its €360 lodging component inherits the same question and must be confirmed
  at A3 before the brochure renders it. Out of this round's scope; A3's problem.
- **The lodging styling question is open** (A-8): whether lodging is FNE-managed
  at cost or self-booked. It affects brochure copy only, not this data model.
- **The plan sources are on `phase/t2-ci`, not `origin/main`.** The prompt told
  this round to read them from `origin/main` HEAD, where they do not exist — see
  the ledger entry. Sources were read from `origin/phase/t2-ci` @ `71cba41`, which
  is the commit that also carries this round's own prompt file.
- Nothing consumes these exports yet; A3/A6a are the first readers.

---

# Round 4 — Codex remediation (REVIEW-A1.md B1 + B2)

Both BLOCKING findings from Codex round 1, in one round. No other change: the
cohort data, the homepage card and the plan criteria are untouched.

## R4.1 What changed and why

**B1 — the scanner was blind to the band values.** `€70` and `€120` are
protected data under the amended A-8, but `PRICE_AMOUNT_PATTERNS` listed only
`1.000`/`1e3`/`810`, so a consumer that reads
`COHORT_LODGING_PER_NIGHT_EUR.min` and renders it produced no finding. The r3
round left them out for a real reason — a two-digit number inside
`PRICE_AMOUNT_PATTERNS`' 120-character currency window would fire across every
chunk — so the fix keeps that window and gives the band its own, narrower one:

- `BAND_AMOUNT_PATTERNS = ['70','120']` in a new `priced-band-amount` check with
  `BAND_GAP = 12` characters, sized against the widest real shape measured in the
  r3 demo (`"entre €".concat(70,` — nine characters).
- The figures are bounded on both sides against longer numbers
  (`(?<!\d)(?<![\d][.,]) … (?!\d)(?![.,]\d)`), so `€1.200,70` and `€120.000` —
  how this repo's unrelated euro amounts are written — cannot match.
- `commercial-copy` gains two more fragments of the band sentence
  (`Alojamiento en Barcelona: entre`, `según el tipo de alojamiento`), so
  reworded copy has to lose all three fragments to slip past.

**B2 — the serialization guard watched one export.** The D-01 test serialized
`COHORT_PUBLIC`, a hand-assembled aggregate, so a standalone monetary export
added to `cohort-public.ts` and left out of the aggregate would not have been
seen. It now enumerates every runtime export mechanically (`Object.keys` over the
`import * as cohortPublicModule` namespace) and serializes all of them, with
exported functions serialized as their source so a helper cannot carry an amount
past it either. Both original assertions are kept and now run against the
namespace **and** the aggregate.

## R4.2 Files

- `scripts/check-price-leak.mjs` (+68/−21) — the `priced-band-amount` check and
  its bounded pattern; two more `commercial-copy` fragments; the file-scanning
  loop refactored to call a new exported `scanText` so the regression test
  exercises the same code path the build runs; `main()` now runs only when the
  file is the CLI entry point, so importing it neither scans nor exits.
- `__tests__/scripts/check-price-leak.test.ts` (new, +80) — 16 tests: six
  isolated band-leak shapes, each asserted to fire `priced-band-amount` and
  **only** that check; the full note; the programme fee; the sentinel; and eight
  negative controls.
- `__tests__/lib/pasantias-cohort.test.ts` (+52/−13) — the D-01 describe block
  rewritten to the module namespace, plus a test that the serialization is not
  vacuous. 34 → 35 tests.
- `lib/pasantias/cohort-public.ts` (+5/−1) — the `COHORT_PUBLIC` doc comment said
  the guard test serializes it; it no longer does, so the comment says what the
  guard actually covers. Comment only; no data change.
- `docs/plan/evidence/a1/leak-guard.md` (+97) — §6, the r4 red-then-green demo.

## R4.3 Test evidence

Run verbatim from the prompt, in this round's worktree:

- `npx vitest run __tests__/lib/pasantias-cohort.test.ts __tests__/scripts/check-price-leak.test.ts`
  → **51 passed** (35 + 16).
- `npm run type-check` → exit 0 · `npm run lint` → exit 0 (`--max-warnings=0`).
- `npm test` → **234 files, 3496 tests, all passed** (was 233 / 3479).
- `npm run build` → exit 0 · `node scripts/check-price-leak.mjs` → `OK — scanned
  266 file(s)`.

Both guards were mutation-tested, not assumed:

1. Appending `export const SCRATCH_LODGING_MIN_EUR = 70` to `cohort-public.ts`
   turned the namespace test red (`expected '{"COHORT_ID":"octubre-2026",…' not
   to match /(?<!\d)70(?!\d)/`) — the drift B2 described — then reverted.
2. Leaking `COHORT_LODGING_PER_NIGHT_EUR` into `pages/index.tsx` and rendering
   `.min`/`.max` turned the build scanner red on `priced-band-amount` at the two
   render offsets, then reverted; the note-only leak from §5 was re-run and is
   now caught by two independent checks. Full output in
   `docs/plan/evidence/a1/leak-guard.md` §6.

## R4.4 Scrutinise these

1. **The 12-character band window is a measured guess, not a proof.** It covers
   every shape observed in two real leak builds (`"€70"`, `["€",70]`,
   `"€".concat(120)`, `currency:"EUR",amount:120`) and finds nothing across 266
   real client files. A future leak that puts more than 12 characters between the
   marker and the figure would still slip; widening it re-imports the noise
   problem r3 identified. This is the trade-off to argue with if any is.
2. **The build demo could not fully isolate the figures, and §6.1 says so.**
   Importing one band constant still drags `COHORT_LODGING_NOTE` into the chunk —
   both are module-scope literals derived from the same values — so
   `commercial-copy` fired alongside `priced-band-amount`. The genuinely isolated
   case is proven at unit level against the script's own regexes, not at bundle
   level, because the bundler will not produce that bundle from this module.
3. **`main()` is now behind an entry-point check.** This is a real change to how
   the script behaves when loaded. Verified both ways: `node
   scripts/check-price-leak.mjs` with no build present still errors and exits 1,
   and importing the module runs nothing.
4. **The namespace guard serializes function bodies.** That makes the guard
   stricter than "no monetary values" — an exported helper whose *source* mentions
   a protected number would now fail it. `buildCohortDateLabel` is the only
   function export and contains no such number. Deliberate; cheap to revisit if a
   future helper legitimately needs one.
5. **`priced-band-amount` is a separate check, not extra entries in
   `PRICE_AMOUNT_PATTERNS`.** That is why the two checks report separately in the
   scanner output. Folding them together would have forced one window on both.

## R4.5 Known limitations / deferred

- Codex's S1 (source-level importer allowlist for `cohort-commercial.ts`) and S2
  (rendered homepage-card assertion) were **not** done — SHOULD-FIX, ledger
  backlog, out of this round's scope per the prompt.
- Madrid's €810 and its embedded €360 lodging component still carry the owner's
  doubt, to be confirmed at A3. Unchanged by this round.
- Nothing consumes the cohort exports yet; A3/A6a are the first readers.
