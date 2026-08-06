# A6r evidence — `/pasantias` after the redesign port

Rendered from the production build (`npm run build` + `npm run start`) and
captured with Playwright at three viewports: **390 px** and **1440 px** (the
prompt's acceptance widths) and **1280 px** (the plan's, and the width A6a's
evidence used, so the two sets are directly comparable).

1280 and 1440 produce the **same layout** — the content shell is capped at
1280 px, so the wider viewport only adds side gutters. The 1440 set is kept
because the round's acceptance names it; the full-bleed sections (hero, the two
photo breaks, the closing panel) are the only places the extra width is visible.

## Files

`00-full-<width>.png` is the whole page. Everything else is one section, numbered
in page order, matching its `data-testid`:

| # | File | Section |
|---|---|---|
| 01 | `01-header` | replicated site header, `pasantias-header` |
| 02 | `02-hero` | full-bleed hero, `pasantias-hero` |
| 03 | `03-claims` | the four Appendix A-9 claims, `pasantias-claims` |
| 04 | `04-barcelona` | why Barcelona, `pasantias-barcelona` |
| 05 | `05-modos` | two weeks + the free weekend, `pasantias-modos` |
| 06 | `06-photo-escuela-interior` | photo break |
| 07 | `07-dia-tipo` | día tipo, `pasantias-dia-tipo` |
| 08 | `08-escuelas` | both school tiers, `pasantias-escuelas` |
| 09 | `09-photo-equipo` | photo break |
| 10 | `10-equipo` | the eight A-6 experts, `pasantias-equipo` |
| 11 | `11-objetivos` | all thirteen objectives, `pasantias-objetivos` |
| 12 | `12-incluye` | incluye / no incluye, `pasantias-incluye` |
| 13 | `13-programa` | the interim panel, `pasantias-programa` |
| 14 | `14-faq` / `14-faq-open` | the accordion closed (first item open) and with every answer forced open |
| 15 | `15-cierre` | closing CTA, `pasantias-cierre` |
| 16 | `16-footer` | the shared `components/Footer.tsx` |

The sticky header appears at the top of some section captures. That is the
header doing its job during `scrollIntoViewIfNeeded`, not a layout fault — see
`00-full-*.png` for the uninterrupted page.

## What to look for

- **Photography is what breaks up the page.** The hero and the two full-bleed
  breaks are the mechanism the brand permits for colour; the rest is black,
  white and one yellow card. Two of the design's five photo slots are still
  empty (`barcelona-calle`, `barcelona-tarde`) and **render nothing at all** —
  `05-modos` runs straight into `06-photo-escuela-interior`, and `15-cierre` is
  a solid black panel. A fixed-height black band in an unfilled slot would read
  as a broken image; nothing reads as a page designed with fewer photographs.
- **`10-equipo`: all eight portraits now resolve.** Six came from
  `public/images/consultants/`; Mora del Fresno's and Sergi del Moral's were
  pulled from the Supabase Equipo bucket in r2. The initials-tile fallback still
  exists in the page and is still the right behaviour for an expert added without
  a photograph — it is simply no longer exercised, so no capture shows it.
- **`13-programa` is deliberately not a form.** The delivered design puts a full
  request form here. A6b owns the form's behaviour, so this round ports the
  section's treatment and keeps A6a's interim mailto. The faint lineal symbol in
  the top right is the manual's watermark at 12 %.
- **Yellow is spent once.** `05-modos` has the page's only solid-yellow surface,
  on the free weekend — the manual's 10 % accent, spent on the part of the
  itinerary buyers ask about most. Every yellow that carries *text* on a light
  background is `brand_accent_text` (#b45309, 5.02:1), never `brand_accent`.
- **`14-faq-open`** exists because the closed accordion shows six questions and
  no copy. The answers are A6a's owner-reviewed ones, not the mockup's — see the
  ledger entry for why the mockup's six differ. **The two `14-faq*` sets were
  re-rendered in r2**, which swapped "¿Qué incluye el programa?" — it restated the
  `#incluye` section a screen above it — for "¿Necesito hablar catalán?", whose
  answer is owner-approved copy rather than the mockup's wording. Still six.
- **`02-hero` is r3's capture, not r1's.** The veil was running at ~53 % where the
  eyebrow sits, which measured **2.98:1 at 390 px and 2.88:1 at 1440 px** against
  the 4.5:1 that 11 px text needs — Sol's B3. It now reaches 85 % under the text
  and dissolves upward, so the photograph reads at the top of the frame and the
  eyebrow measures **8.72:1 and 8.55:1**. The ratios are asserted against the
  actual composited pixels in `tests/e2e/pasantias-page.spec.ts`; axe cannot see
  this defect, because it files text over a photograph as `incomplete`.

## Which captures belong to which round

r1 rendered the whole set. r2 re-rendered `14-faq*`. r3 re-rendered `00-full-*`
(page-level, so it carries the new hero), `02-hero-*` (the veil) and `10-equipo-*`
(the two portraits that landed after r1's capture). r4 and r5 touched only the
[A1] guard, so neither re-rendered anything.

**r6 re-rendered `00-full-*`, `08-escuelas-*` and both `14-faq*` sets** — the
first page change since r3, and the only captures its two copy edits move.
`14-faq` and `14-faq-open` carry the rewritten long-weekend answer, which now
prints the free-day range and leaves the Fiesta Nacional to the yellow card in
`05-modos`, which already states it in full. `08-escuelas` lost the italic note
under the school grid: the week-2 summary two sections above already says the
visit order can vary, and the note restated it. `05-modos` and `13-programa` are
**not** re-rendered — their week-count sentences now read `COHORT_WEEKS.length`
through an es-CL number word instead of a literal, and at two weeks the rendered
text is byte-identical to what r1 captured.

**r7 re-rendered `00-full-*`, `05-modos-*` and `14-faq-open-*`, at all three
widths.** Two rendered sentences moved. The long-weekend FAQ answer now opens
*"El fin de semana largo suma 3 días libres, del 10 al 12 de octubre"*: it used
to open *"Entre ambas semanas"*, which states the two-week shape as flatly as a
number would and which the [A1] guard could not see, because `ambas` is not a
number word — Sol's third FAIL. And both surfaces that print the long weekend
fold the repeated month, so the yellow card's heading in `05-modos` reads `10 al
12 de octubre` rather than `10 de octubre al 12 de octubre`.

`14-faq-*` — the accordion as it loads, with only the first answer open — is
**byte-identical** after re-rendering at all three widths: the question that
changed is the fourth, and only its heading is visible there. It is left as r6
rendered it. The captures the prompt named were 390 and 1280; 1440 was rendered
too, because leaving it would have left three captures showing a sentence the
page no longer contains.

Nothing else moved. No other section is re-rendered, and the **week cards in
`05-modos` still read `5 de octubre al 9 de octubre`** — the range formatter was
applied to the long weekend only, which is the scope the owner set, so the two
date treatments on that screen are deliberately different.

## r8 — nothing re-rendered

r8 is test-only. `pages/pasantias.tsx` is byte-identical to `7c5b642a`, and
`git diff 7c5b642a -- pages/pasantias.tsx` is empty; the round changed
`__tests__/pages/pasantias-hardcoded-cohort.test.ts` alone. Re-shooting the set
would have produced 54 identical PNGs, so the captures above stand as r7 left
them.

## Size

19 MB across 54 PNGs. The photography-bearing captures are most of it. The set
is complete rather than sampled because [A4] asks for every section at both
widths, and a sampled set is how a regression in an uncaptured section ships.
