# A6a evidence — `/pasantias` page, round r2 (data propagation)

Rendered from the production build (`npm run build` + Playwright's `webServer`)
on the r2 head, at the two viewports the plan cares about: 1280 px (school
hardware desktop) and 390 px (phone, since this link travels by WhatsApp).

| File | What it shows |
|---|---|
| `equipo-1280.png` | All eight A-6 experts. **No `Experto invitado` anywhere** — the four titles the 2026-08-02 amendment fixed are rendered in full, and the two week-1 hosts carry their host marker. |
| `escuelas-1280.png` | The seven school cards with content-pack §5b levels and *aspectos destacados*. |
| `escuelas-390.png` | The same section on a phone: one column, nothing clipped, the longest highlight wraps inside its card. |

## What to look for

- **Boris Mir's title is the longest string in the section** and wraps to four
  lines in its card without pushing the card out of the grid — the row heights
  are equalised by the grid, not by truncation.
- The escuelas section is **stacked by tier**, not two side-by-side columns: with
  levels + highlights on every card, a 2-vs-5 column split left most of the
  immersion column empty. Same data, same testids.
- No price token appears on either section; the D-02 assertion in
  `tests/e2e/pasantias-page.spec.ts` covers the whole page HTML.

The two PDF surfaces that also render expert titles are re-rendered under
`../a3/` — `brochure-07.png` (Equipo) and `brochure-10.png` (version caption,
now `2026-10-v4`). The ficha's extracted text is byte-identical before and after
this round, which is why `FICHA_VERSION` did not move.
