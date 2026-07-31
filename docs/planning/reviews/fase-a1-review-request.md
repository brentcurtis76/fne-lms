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
