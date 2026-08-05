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
- **`10-equipo` shows the same principle on the portraits.** Six of eight experts
  have a photograph in the repository; Mora del Fresno and Sergi del Moral get an
  initials tile on the brand black with the accent, which sits beside the six
  without looking like a failed load.
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
  ledger entry for why the mockup's six differ. **The two `14-faq*` sets are the
  only captures re-rendered in r2**, which swapped "¿Qué incluye el programa?" —
  it restated the `#incluye` section a screen above it — for "¿Necesito hablar
  catalán?", whose answer is owner-approved copy rather than the mockup's
  wording. Still six.

## Size

19 MB across 54 PNGs. The photography-bearing captures are most of it. The set
is complete rather than sampled because [A4] asks for every section at both
widths, and a sampled set is how a regression in an uncaptured section ships.
