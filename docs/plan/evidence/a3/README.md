# Phase A3 — visual QA evidence

Every page of both generated PDFs, rasterised at **144 DPI** (criterion [A4]).
The PM inspects these files from the repository, not from a chat transcript.

**Re-rendered 2026-08-03 for the `a1-repricing` round.** The owner's 2026-08-02
repricing changed three pages and only three: `brochure-08` (Programa now
**€2.500**), `brochure-09` (week-1 lunches in; week-2 meals, all cenas and the
El Puig / Les Vinyes transport out) and `brochure-10` (the version caption, now
`2026-10-v3` — the D-05 cache key was bumped with the price). Pages 01–07 and
both ficha pages came back byte-identical, which is the expected result:
nothing else in Appendix A moved.

**`brochure-09` re-rendered again in round r2** (Sol B1): two of its inclusion /
exclusion strings were paraphrases of Appendix A-7 rather than transcriptions,
and now read as A-7 writes them — `Bibliografía básica recomendada, una bitácora
y un sistema de registro de los aprendizajes, presentado al menos un mes antes
del viaje` and `Pasajes aéreos y transporte terrestre de llegada y salida`. It
was the only page of the twelve that changed. `BROCHURE_VERSION` stays
`2026-10-v3`: the D-05 cache key was already bumped for this round's brochure
and no cached object was ever served from it.

**Re-rendered again by A6a r2 and r3**, both times because the Appendix A-6
expert titles reached `cohort-public.ts` late and both PDFs print `expert.role`
verbatim. A6a r2 fixed experts 5–8 (`brochure-07`, `brochure-10`;
`BROCHURE_VERSION` → `2026-10-v4`, ficha untouched because it prints only the
first four). **A6a r3** added A-6's `INSPIRA` suffix to Coral Regí and Mora del
Fresno — who *are* in the ficha's first four — so this time three pages moved:
`brochure-07`, `brochure-10` (`BROCHURE_VERSION` → `2026-10-v5`) and `ficha-2`
(`FICHA_VERSION` → `2026-10-v2`, its first bump). The other nine pages came back
byte-identical, verified by `git status` after the render rather than by eye.

| File | Document | Page |
|---|---|---|
| `brochure-01.png` | Brochure | Portada |
| `brochure-02.png` | Brochure | Qué es la pasantía |
| `brochure-03.png` | Brochure | Objetivos (13) |
| `brochure-04.png` | Brochure | Estructura del día |
| `brochure-05.png` | Brochure | Itinerario (semana 1 · fin de semana largo · semana 2) |
| `brochure-06.png` | Brochure | Las 7 escuelas (2 inmersión + 5 visitas) |
| `brochure-07.png` | Brochure | Equipo (8) |
| `brochure-08.png` | Brochure | **Inversión** — the only page with prices |
| `brochure-09.png` | Brochure | Qué incluye / no incluye |
| `brochure-10.png` | Brochure | Contacto |
| `ficha-1.png` | Ficha | Qué es · fechas · escuelas |
| `ficha-2.png` | Ficha | Día tipo · equipo · cifras · CTA |

## Regenerating

```
NEXT_PUBLIC_BASE_URL=https://nuevaeducacion.org npx tsx scripts/pasantias-visual-qa.ts
```

The base URL matters: the printed call to action resolves through
`lib/utils/app-url.ts` (D-09), so a run without it renders `localhost:3000/pasantias`.
Requires poppler's `pdftoppm` (`brew install poppler`) — a local tool, not a CI
gate; the committed PNGs are the artifact.

## What to look for

- **Prices appear on `brochure-08.png` and nowhere else.** The ficha has no page
  with a monetary token — that is structural (`ficha.tsx` never imports
  `cohort-commercial.ts`) and asserted in `lib/pasantias/__tests__/pdf.test.ts`.
- The lodging figure reads **€70 – €120 por persona por noche · base doble**,
  with the verbatim Appendix A-8 note and the coordination framing under it.
  **No combined total, no night count, no Madrid** anywhere in either document.
- Accented es-CL glyphs (`Pasantías`, `inmersión`, `Cataluña`, `brújulas`,
  `Vildósola`) render from the embedded Inter faces.
