# EXECUTOR PROMPT — Repricing round (INSPIRA Comms) — owner-directed

Owner repriced the program on 2026-08-02 (Decision Log + Appendix A-7/A-8 on
origin/main): **programa €1.000 → €2.500 por persona**, and the includes/
excludes were replaced. A1 and A3 are already merged, so this is a fresh
branch touching both phases' files.

BRANCH: `phase/a1-repricing` (from origin/main)
FIRST ACTIONS: `git fetch origin && git worktree add ../wt-reprice -b phase/a1-repricing origin/main`;
copy `.env.local` in; read Appendix A-7/A-8 from origin/main HEAD (authoritative).

## Scope

1. `lib/pasantias/cohort-commercial.ts`: programme price 1000 → **2500**
   (keep the lodging band 70–120 and everything else unchanged).
2. `lib/pasantias/cohort-public.ts`: replace the includes/excludes arrays with
   Appendix A-7's updated lists — includes ends with "Almuerzos de la primera
   semana, en Escola Virolai y Escola Sadako"; excludes gains "Comidas en los
   días de visita de la segunda semana", "Cenas" (no closing-dinner exception),
   and "Transporte a El Puig y Les Vinyes"; the old "comidas incluidas en los
   días de visita y cena de cierre" include is GONE, as is transport-included.
3. `scripts/check-price-leak.mjs`: swap `1[.,\s]?000` for the 2.500 shapes AND
   **add 1.000 as a retired amount** (same currency-context machinery as the
   band values — a retired price leaking is exactly what the guard is for).
4. Tests — update every pin: `__tests__/lib/pasantias-cohort.test.ts` (money
   math: programme === 2500; includes/excludes content + counts),
   `__tests__/scripts/check-price-leak.test.ts`, and **A3's
   `lib/pasantias/__tests__/pdf.test.ts`** (brochure text now contains "2.500",
   must NOT contain "1.000"; keep the band and no-total assertions).
5. Re-render A3's evidence PNGs with the QA script (`scripts/pasantias-visual-qa.ts`),
   inspect the inversión + incluye pages, and re-commit the changed renders.

ACCEPTANCE: no `1.000`/`1000` programme price anywhere in `lib/pasantias/**`;
guard catches both retired amounts (red-then-green proof appended to
`docs/plan/evidence/a1/leak-guard.md`); regenerated brochure shows €2.500 and
the new terms; full gates + leak script green.
RULES: SOP + repo CLAUDE.md; surgical; max 3 red iterations then BLOCKED; any
mismatch between Appendix A-7/A-8 and this prompt → FINDINGS (the Appendix wins).
Review-request `docs/planning/reviews/fase-a1-repricing-review-request.md`.
WHEN DONE: LEDGER entry, push, EXECUTOR REPORT per SOP §2.3.
