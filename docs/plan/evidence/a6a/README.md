# A6a evidence — `/pasantias` page

Rendered from the production build (`npm run build` + Playwright's `webServer`)
at the two viewports the plan cares about: 1280 px (school hardware desktop) and
390 px (phone, since this link travels by WhatsApp).

**All four PNGs re-rendered on the r3 head.** Two things moved in the rendered
copy and one in the colour, so none of the r2 images was still an accurate
picture of the page:

- the two remaining Appendix A-6 titles gained their `INSPIRA` suffix (Coral
  Regí, Mora del Fresno);
- the visit-school cards no longer print `Visita de media jornada`, a duration
  Appendix A never states (Sol r2 S1);
- every amber accent that carries **text** moved from `brand_accent_hover`
  (#f59e0b, 2.14:1 on white — axe rated it 15 serious violations) to the new
  `brand_accent_text` token (#b45309, **5.02:1**). The host markers and the
  thirteen objective numbers are the elements that changed.

| File | What it shows |
|---|---|
| `equipo-1280.png` | All eight A-6 experts. **No `Experto invitado` anywhere**, both `INSPIRA` suffixes present, and the two week-1 host markers in the AA-safe amber. |
| `escuelas-1280.png` | The seven school cards with content-pack §5b levels and *aspectos destacados*, and the neutral `Visita en Barcelona` line on the five that are not full-day. |
| `escuelas-390.png` | The same section on a phone: one column, nothing clipped, the longest highlight wraps inside its card. |
| `objetivos-1280.png` | **New in r3.** All thirteen numbered objectives — thirteen of axe's fifteen contrast violations were these numbers, so this is the picture of the fix. |

## What to look for

- The accent amber is **darker than the brand accent on purpose**: it is the only
  amber in the palette legible as small text on white. `brand_accent` (#fbbf24)
  is still used for surfaces — the date chip, the CTA buttons — where the text
  sits on top of it in near-black and the contrast runs the other way.
- **Boris Mir's title is the longest string in the equipo section** and wraps to
  four lines in its card without pushing the card out of the grid — the row
  heights are equalised by the grid, not by truncation.
- The escuelas section is **stacked by tier**, not two side-by-side columns: with
  levels + highlights on every card, a 2-vs-5 column split left most of the
  immersion column empty. Same data, same testids.
- No price token appears in any section; the D-02 assertion in
  `tests/e2e/pasantias-page.spec.ts` covers the whole page HTML, and since r3 it
  covers the word forms `eur` / `euro` / `euros` as well as `€`.

The two PDF surfaces that also render expert titles are re-rendered under
`../a3/`: `brochure-07.png` (Equipo), `brochure-10.png` (version caption, now
`2026-10-v5`) and `ficha-2.png` (Equipo destacado + caption, now `2026-10-v2`).
Unlike r2, `FICHA_VERSION` **did** move this round — the ficha prints the first
four experts, and two of them are exactly the rows that changed.
