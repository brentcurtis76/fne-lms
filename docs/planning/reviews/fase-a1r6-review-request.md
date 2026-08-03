# Fase A1 r6 — review request (owner-directed label fix)

**Branch:** `phase/a1-r6-label`
**Base:** `origin/main` @ `2613b46`
**Commits:** 2 — one code+tests+docs commit, then the ledger commit that records its SHA
**Executor round:** r6 — micro-round on a fresh branch; A1 itself merged at PR #34.

---

## Objective and scope (from `docs/plan/prompts/a1-6.md`)

Owner decision 2026-08-02 (PLAN.md Decision Log + Appendix A-1): the live
homepage label `Octubre 2026 · 5–9 y 13–16 de octubre` reads as **two**
pasantías. The headline date-span everywhere becomes the single continuous
span **`Octubre, 5 al 16`**, still derived from the week data.

In scope: the label derivation in `lib/pasantias/cohort-public.ts`, and every
test that pinned the old two-range string.

Out of scope, explicitly: card layout, any other copy, `pages/index.tsx`
(untouched — it already renders `COHORT_HEADLINE`).

## Files changed, by risk

| File | Risk | Why |
|---|---|---|
| `lib/pasantias/cohort-public.ts` (+30/−12) | **medium** — public copy on the site's most-visited page | the derivation + the headline composition |
| `__tests__/lib/pasantias-cohort.test.ts` (+43/−2) | low | re-pinned to the new string, plus three new asserts |
| `__tests__/scripts/check-price-leak.test.ts` (+1/−1) | low | one negative control carried the old headline verbatim |
| `docs/plan/evidence/a1/headline-span.md` (new) | none | rendered-HTML proof |

## What changed in the derivation

`buildCohortDateLabel` used to map each week to `start–end` and join with
`" y "`, appending `de <month>`. It now flattens the weeks' **visit days** and
spans first → last: `Octubre, 5 al 16`. Taking the ends from `visitDays`
rather than `startDate`/`endDate` is what the prompt asked for and is also the
more honest end of the span — week 2's block and its first visit day happen to
coincide here (both the 13th), but the visit days are what the cohort actually
buys.

`COHORT_HEADLINE` was `${COHORT_LABEL} · ${COHORT_DATE_LABEL}`. `COHORT_LABEL`
is `"Octubre 2026"`, and the new span already names the month, so keeping that
composition would have rendered **"Octubre 2026 · Octubre, 5 al 16"** — the
month twice. The headline is now `${COHORT_DATE_LABEL} · ${COHORT_YEAR}`,
where `COHORT_YEAR` is read off `COHORT_WEEKS[0].startDate` (module-private,
not a new public export). Rendered result: `Octubre, 5 al 16 · 2026` — the
exact span the owner asked for, with 2026 still on the card. **This is the one
judgement call in the round; see "scrutinise hardest" below.**

`COHORT_LABEL` itself is untouched: Appendix A-1 still defines the cohort label
as "Octubre 2026", and `cohort-commercial.ts` builds
`"Precios vigentes para la cohorte Octubre 2026"` from it.

## Test evidence

- `__tests__/lib/pasantias-cohort.test.ts` — 38 tests (was 36). Re-pinned:
  `COHORT_DATE_LABEL === 'Octubre, 5 al 16'`, `COHORT_HEADLINE ===
  'Octubre, 5 al 16 · 2026'`. Added: (1) the span's two numbers come from
  `COHORT_VISIT_DAYS`' first and last entries; (2) a prohibition test — no en
  dash, no `" y "` join, no `2026` inside the span, exactly one `2026` and one
  `Octubre` in the headline; (3) a derivation test — `buildCohortDateLabel`
  handed a synthetic November calendar returns `Noviembre, 3 al 11`, which a
  hardcoded string cannot pass.
- `__tests__/scripts/check-price-leak.test.ts` — 16 tests, unchanged count; the
  "public headline stays silent" negative control now carries the new string,
  so it still tests the real headline rather than a retired one.
- Full gates: `npm run type-check` clean, `npm run lint` clean (0 warnings),
  `npm test` **235 files / 3502 tests passed**, `npm run build` succeeded,
  `node scripts/check-price-leak.mjs` OK (266 files scanned).
- TZ sweep: cohort suite green under `UTC`, `Europe/Madrid`, `America/Santiago`
  (date-only logic is UTC-canonical; vitest pins no TZ).
- Rendered proof: `docs/plan/evidence/a1/headline-span.md`.

## Scrutinise hardest

1. **The headline composition is my call, not the prompt's.** The prompt said
   "the year stays wherever it already renders separately (card title)". It does
   not render separately anywhere — the year existed only inside
   `COHORT_LABEL`, inside the same `<p>`. I kept it in that same element and put
   it after the span. If the owner wants a different shape (year first, an
   em dash, or the year moved into the "Próxima cohorte" line), that is a copy
   decision, not a code problem, and it is one line.
2. **Span ends now come from `visitDays`, not from week `startDate`/`endDate`.**
   For this cohort both give 5 and 16. They would diverge for a cohort whose
   block starts on a non-visit day. The prompt specified visit days; flagging it
   because the two readings are indistinguishable in the current data, so no
   test can tell them apart from the October calendar alone (the synthetic
   November case does — its blocks and visit days deliberately differ).
3. **A capitalised month, from a lowercase table.** `MONTH_NAMES_ES` stays
   lowercase (it may still be needed mid-sentence); `capitalizeFirst` handles
   the leading position. All twelve names are ASCII-initial, so no locale-aware
   uppercasing is involved.
4. **The D-01 leak surface.** The headline gained a bare `2026`. It is not in
   `PROTECTED_AMOUNTS` and cannot become one, but the namespace guard and the
   post-build scanner were both re-run on the rebuilt bundles rather than
   assumed — see evidence §4.

## Known limitations / deferred

- **PLAN.md `Phase A1 [A4]` still pins the retired string** (`"Octubre 2026 ·
  5–9 y 13–16 de octubre"`, `PLAN.md:125`). Appendix A-1 and the Decision Log
  were amended on 2026-08-02; the phase criteria line was not. PLAN.md is
  PM-owned, so this round did not touch it — raised for the PM to reconcile,
  otherwise A1's own criteria contradict the owner's amendment.
- Codex **S2** (a rendered homepage-card regression assertion) is still open as
  backlog. This round supplies the rendered proof as committed evidence rather
  than as a test, which is what the prompt scoped; S2 remains the durable fix.
- No e2e/Playwright assertion touches this card; the CI e2e gate runs only
  `tests/e2e/smoke.spec.ts`.
