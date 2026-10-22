## PM validation update — 2026-10-22 (supersedes the authorship-only status below)

Local implementation and validation complete; independent cumulative FINAL review pending. No publication or deployment.
Branch `fix/pasant-polish`, base `cd08f4d07ad801780a7e23e056c3be08a47feb1c`; zero commits above base before the planned one local reviewed commit.

- Focused PASANT/PDF/guard tests: 5,977 reported passes across 9 files.
- Full unit suite: all 8 shards pass, 17,651 reported passes across 527 unique files, zero failures. Twelve inherited skipped assertions remain explicitly recorded (11 parked Zoom, one PostgreSQL-conditional); no PASANT skips or new waivers.
- Type-check, zero-warning lint, build, 267-bundle price-leak guard, scoped interactive-testid lint and browser-boundary guard: PASS.
- Page/form browser suite: 33 passed, one worker, zero retries; includes keyboard, four widths, contrast and accessibility. Synthetic intercepted APIs only. Unmocked `pasantias-flow.spec.ts` remains NOT_RUN locally; its filename-only update requires the later full CI gate.
- PM Chrome visual checks: desktop 1866, tablet 768, phones 390/375. Corrected photo faces, equal Sandra/Jordi portraits, program cards/CTAs, calendar alignment, shortcuts and consent defaults accepted. No manual form submission or PDF/provider call.
- Sequential admitted hard-capped runs, no swap, safety reserve maintained. Build peak 3.33 GiB; browser peak 1.01 GiB. Preview stopped and shared slot released. No production or other-project interference.
- Initial D-Bus launch failure and unit-origin environment failure are retained with their successful corrected runs; neither was a product fix or test waiver. Initial Chrome capture errors resolved with a fresh tab and final screenshots.

Evidence: `/home/brent/Projects/pasant-local-handover/20261015/PASANT-design-polish-20261022/evidence-index.json`, `unit-summary.json`, `ui-evidence.json`, `freeze-remediation1.json`. Author reports below remain historical. FIRST and FINAL source reviews are separate Opus 5.5 high sessions; final cumulative review must approve this evidence before local commit. R17/A9 unchanged. No new publication approval is inferred.

# Review request — PASANT-DESIGN-POLISH-01 (`/pasantias` polish, January 2027)

**Status: authored, NOT validated. Tests, build, price guard, browser specs and UI checks are pending the PM.** Nothing
below is a test result.

- Branch: `fix/pasant-polish` (worktree `/home/brent/Projects/pm-workflow/worktrees/genera-pasant-polish`).
- Base: `cd08f4d07ad801780a7e23e056c3be08a47feb1c`, as reported by the order. The author had no Git access and has not
  verified it.
- Commits: none by the author. The order allows one reviewed local commit after independent review; no push, PR, deploy
  or merge.
- Author: Opus (`claude-opus-5-5`), order revision 2. The FIRST plan review (`review-first.md`) approved P1–P9 on
  condition of F1, which revision 2 resolved. F2–F9 bind this work.
- Remediation 1: order revision 3, by a fresh Opus (`claude-opus-5-5`) continuation acting as sole author. It answers the
  FINAL source review (`review-final-source.md`) F1–F4 only; see "Remediation 1" below. Attempts: initial 1,
  remediation 1.
- Authority: Brent, 2026-10-22, "implement all your proposed changes", following his correction that Sandra belongs in
  "Quién te recibe" (brochure pp. 4 and 12). Record: `docs/plan/pasantias-polish-addendum-20261022.md`.

## Objective and scope

**Objective:** a polished, clearer January Pasantías landing page with both ratified hosts.

**In scope (P1–P9):**
- P1: per-photo framing.
- P2: two hosts.
- P3: hero routes and "Ver los programas".
- P4: the warm Mirada card.
- P5: calendar layout.
- P6: short CTA labels.
- P7: same-page shortcuts.
- P8: a note beside the form.
- P9: preservation of everything else.

**Out of scope:**
- Any fact change, API, auth, admin, database, migration, dependency, animation, service or workflow change. The one
  exception is the ficha's existing version discriminator, `FICHA_VERSION`, which remediation 1 bumps (F2).
- `LeadForm.tsx` and the consents.
- The January contract file.
- New images.
- Global CSS.
- Test tooling.

## Files, grouped by risk

**Guards (highest scrutiny):**
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts`:
  - `EXPECTED_LEAF_COUNT` goes 106 → 112, with the reason recorded.
  - The `hosts` uncounted reason is rewritten.
  - The C005 calendar slices are retargeted (F3).
  - Deep-leaf presence checks are added for the new leaves.
  - No declaration was added and no mechanism was changed.
- `__tests__/lib/pasantias-cohort.test.ts`:
  - Two hosts are pinned, with Jordi first.
  - Sandra is excluded from the "unratified October expert" loop by addendum citation only.
  - The program oracles gain `shortName`.
  - Index 0 is kept on the contract host check.

**Public data:**
- `lib/pasantias/cohort-public.ts`:
  - Sandra Entrena is appended after Jordi Musons.
  - `shortName` is added to each program (`INSPIRA`, `Mirada Profunda`).
  - The comments cite the addendum.

**Page:**
- `pages/pasantias.tsx`:
  - P1: a `PhotoFrame` per slot.
  - P2: a two-host grid.
  - P3: the hero route line.
  - P4: `CARD_WARM`.
  - P5: a subgrid calendar, with the weekend band below it.
  - P6: `BUTTON_PROGRAM_BASE` and `Me interesa ${shortName}`.
  - P7: a non-sticky shortcut nav, plus `scroll-mt` on the targets.
  - P8: the registration note.

**Tests and docs:**
- `__tests__/pages/pasantias.test.tsx` (new): focused render checks.
- `tests/e2e/pasantias-page.spec.ts`:
  - hosts;
  - the weekend (F4);
  - CTA labels, routes, shortcuts and the note;
  - a new four-viewport layout test (375/390/768/1866) and a shortcut landing test.
- `tests/e2e/pasantias-form.spec.ts`: a new keyboard CTA preselection test.
- `docs/plan/pasantias-polish-addendum-20261022.md` (new).
- This file.
- `PROJECT_STATE.md`.

## Remediation 1 (order revision 3: FINAL F1–F4)

- **F1, generated-PDF oracle** (`lib/pasantias/__tests__/pdf.test.ts`):
  - "Sandra Entrena" leaves `OCTOBER_ONLY`, with a comment citing the addendum.
  - `SHARED_PUBLIC_CONTENT` gains "Sandra Entrena" and the exact row "Encargada de Innovación, Escola Virolai ·
    Anfitriona", which both PDFs print as `${role}, ${school} · ${note}`.
  - Every other October prohibition stays ("Coral Regí", "Boris Mir", "Pepe Menéndez", "Mussons" and the rest), and
    "Anfitriona semana 1" is added.
  - `ficha.tsx` and `brochure.tsx` are not edited.
- **F2, ficha cache key:**
  - PM decision: production is deployed, so a generated `pasantias/ficha-2027-01-v1.pdf` may exist.
  - `FICHA_VERSION` (`lib/pasantias/pdf/filenames.ts`) is now `2027-01-v2`, with a dated reason comment.
  - The exact expectations move with it:
    - `pdf.test.ts`: the printed "Versión 2027-01-v2", the pinned version and the ficha filename;
    - `__tests__/api/pasantias-pdf.test.ts`: the January ficha cache path and filename;
    - `tests/e2e/pasantias-flow.spec.ts`: the ficha download name;
    - `__tests__/scripts/price-leak-corpus.mjs`: the ficha filename row. It still fires `commercial-copy` on the
      `Pasantias-INSPIRA-Barcelona` stem, so its expected occurrences are unchanged.
  - `BROCHURE_VERSION`, the designed brochure `pasantias/brochure-2027-01-v1.pdf` (R-08), the PDF renderers and the
    download API code are unchanged.
  - Production was not read, and no download API was executed.
- **F3:** the `routing` uncounted reason in `__tests__/pages/pasantias-hardcoded-cohort.test.ts` now also names the hero
  route line. Only the reason text changed, not the mechanism.
- **F4:** records updated in the addendum §4, `PROJECT_STATE.md` and this file. They stay PARTIAL/NOT_RUN.
- No other style or page change was made in this round.

## Test evidence

**NONE.** The author was not authorized to run anything.

The PM runs the following, against the frozen final state:
- focused Vitest:
  - `__tests__/pages/pasantias-hardcoded-cohort.test.ts`
  - `__tests__/lib/pasantias-cohort.test.ts`
  - `__tests__/pages/pasantias.test.tsx`
  - `__tests__/lib/pasantias-image-manifest.test.ts`
  - `__tests__/pages/pasantias-site-links.test.ts`
  - `__tests__/api/pasantias-pdf.test.ts`
  - `lib/pasantias/__tests__/pdf.test.ts`
  - `__tests__/scripts/check-price-leak.test.ts`
- `npm run type-check`, `npm run lint` (zero warnings), `npm test`, and `npm run build` followed by the price-leak guard;
- `tests/e2e/pasantias-page.spec.ts` and `tests/e2e/pasantias-form.spec.ts` with synthetic, intercepted responses
  (`tests/e2e/pasantias-flow.spec.ts` changed only in its ficha filename literal; it is an unmocked, backend-dependent
  spec outside this unit's synthetic runtime plan, so it is NOT_RUN here and is left to full CI);
- the UI journeys in `review-first.md` at 1866×986, 768, 390 and 375.

## Where to look hardest

1. **The hero eyebrow contrast (F8).** The route line adds height to a bottom-anchored hero whose veil stop is fixed at
   480 px. The author offset it by trimming spacing:
   - phone: bottom padding −16, eyebrow margin −4, chip row −8, CTA row −12;
   - desktop: bottom padding −32.

   The veil was not moved. The net estimate is about +16 px at 390 and +6 px at 1440, which is unmeasured. If
   `hero eyebrow clears WCAG AA` fails at 390 or 1440, raising `via-[480px]` is the reviewed fallback.
2. **The `shortName` leaves against the guard.** `programs[1].shortName` equals `routing[1].program`. Both should prove
   `rendered`, because each prints at a distinct site that loses its occurrence when that leaf is mutated. Confirm that
   the restatement rule reports no `INSPIRA` site on the quiet printed surface. Hand-written "INSPIRA" exists only in
   attributes and `<Head>`.
3. **Subgrid calendar (P5).** `lg:grid lg:grid-rows-subgrid`, with an inline `gridRow: span (weeks + 1)`. Check:
   - alignment at ≥1024;
   - the fallback on browsers without subgrid, where it degrades to stacked cards;
   - that a grown third week still renders without overlap.
4. **Photo framing (P1).**
   - Below `lg`, both breaks are 16:9 (the photographs' own shape), so there is no side clipping at 375/390.
   - The Virolai break is also taller at tablet than before (16:9 rather than `clamp(…40vw…)`).
   - At ≥1024 the library is `21/9`, max 860 px, with focal point `50% 20%`, and Virolai keeps its approved band.
   - Verify all five library faces at 1866.
5. **Host portraits (P2).** Two 112/128 px squares. Sandra's landscape JPG is centre-cropped to a square. Confirm her
   face is not cut. Both PDFs gain a Sandra row through `COHORT_HOSTS`, untouched in code. `pdf.test.ts` now pins that
   row exactly (remediation 1). The exact-row match assumes the PDF text layer keeps the row's words whole. Jordi's
   shorter row already passes this way; if Sandra's longer row is hyphenated mid-word on a wrap, the test fails, and
   the cause is layout, not content.

## Known limitations and deferred items

- The author ran no command, test or browser. Every gate is open.
- The CTA width calculation for "Me interesa Mirada Profunda" at 375 is an estimate. The button wraps (min-height,
  centred) rather than overflowing if the font renders wider.
- Shortcut nav placement: a slim white bar between the header and the hero, scrolling away with the page. It adds about
  40 px above the hero on phones.
- R17/A9 human obligations remain open and are unaffected.
