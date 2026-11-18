# WEB-AJUSTES — public site: the foundation's adjustments of 17 November: review request

- **Branch:** `feat/web-ajustes` · **Base:** `724b445b5` (origin/main, 2026-11-18, after RD-6B) · **Commits:** 3 (the change, three team titles, this record)
- **Requested by Brent in conversation, 2026-11-18,** from the written review Fundación Nueva Educación sent on 2026-11-17 and from what he saw while trying the result. Not an itinerary phase; this file follows the phase format so a reviewer has one place to start. It follows `fase-web-redesign-review-request.md`.

## Objective and scope

Apply the foundation's review of the redesigned public site and Brent's own remarks on it.

**In:** `/` (home), `/programas`, `/nosotros`, `/equipo`, `/noticias`, `/pasantias` (four decorations removed, nothing else), the shared effects of the public site.

**Out:** every platform page; the Pasantías texts, form, API, brochure and ficha; the proposals; news articles; any database object. No migration, no API route, no dependency was added or changed.

## What changed, grouped by risk

**Higher — behaviour**
- `pages/index.tsx` — (1) a new effect holds the target of the address's hash in place while the page settles: a link to `/#contacto` used to land before the news band had loaded, and the band then pushed the form 1,158 px below the window (1,636 px at 390 px wide). It observes the body's size for at most eight seconds and lets go on the visitor's first wheel, touch, key or pointer press. (2) The news band moved from above the map to right above the contact form. (3) The brochure dialog left the page with the two boxes under the program doors.
- `components/site/useSiteEffects.ts` — the photographs that wipe in (`.clip`) are lazy images that start fully clipped; the browser only requested them once the wipe had ended. They are now switched to eager a screen and a half before their frame arrives, and the frame's `in` class waits for the image's `load` (or `error`).

**Medium — content**
- `components/site/programsData.ts` — the foundation's wording (director o directora; escuelas, educadores y educadoras; formación y acompañamiento; claridad de propósito), two Inspira lines moved from objectives to activities, and one stage label per program (Preparación, Despegue, Cambio en el aula, Cambio en todo el colegio) in place of two families that repeated. `stage` is now free text.
- `pages/programas.tsx` — the sheet shows the same label as the timeline; the closing question no longer assumes a male reader.
- `pages/nosotros.tsx`, `pages/equipo.tsx`, `components/site/TeamSection.tsx`, `components/site/teamData.ts`, `components/site/ViasEje.tsx` — the same inclusive wording, role nouns only.
- `components/site/teamData.ts` — three titles Brent corrected on 2026-11-18, with the first sentence of each biography brought into line: Abraham de la Fuente is Director of Institut Angeleta Ferrer; Maite Pino and Enrique Vergara are Directora Adjunta and Director Adjunto of Escola Virolai.
- `components/site/Puertas.tsx` — the two boxes under the doors (directors' brochure, platform) are removed. The brochure stays on every program sheet; the platform stays in the nav.

**Lower — look**
- `components/site/PageHero.tsx` (new) — the hero the four inner pages repeated, now without the line illustration in its corner.
- `pages/pasantias.tsx` — four line illustrations removed (the two program cards, the INSPIRA schools panel, «Quién te recibe»). No text, test hook, anchor or behaviour of that page changed.
- `styles/sitio.css` — the rules of the removed pieces, removed.

## Tests changed on purpose

- `__tests__/pages/pasantias-site-links.test.ts` — the directors' brochure is pinned on `/programas` only; the home page no longer offers it.
- `tests/e2e/pasantias-page.spec.ts` — the control test «the Directivos CTA still opens its flipbook» opens it from `/programas`.

## Evidence (2026-11-18)

- `npm run type-check`, `npm run lint`, `scripts/check-price-leak.mjs`, `npm run build`: clean, run on a second machine from a copy of this tree (the laptop was running other sessions' proofs).
- Vitest, targeted: every test under `__tests__/pages`, `__tests__/styles`, `__tests__/security`, `__tests__/lib/pasantias`, plus the tests that scan the source tree and the contact API's: 94 files, 1,836 tests, green. **The full suite was not run locally.**
- `node scripts/redesign/inventory.mjs check`: passed.
- Chrome, by script against the production build, 1440 px and 390 px: the contact form lands at 0 px from the home page's menu, from the program sheet's button and from a direct `/#contacto` (before: 1,158 px and 1,636 px low); the seven wipe-in photographs of the home page are complete when their frame arrives, on a 10 Mbit/s link at reading pace; the four program sheets and their tabs read as intended; the brochure opens from a program sheet; no page errors on the pages touched.
- **Playwright e2e was not run locally.** CI's Gate 4 is its first run against this branch.

## Where to look hardest

1. **The hash hold in `pages/index.tsx`.** It scrolls the page on the visitor's behalf for up to eight seconds after a hash navigation. It lets go on the first input event, but a visitor who drags the scrollbar with a mouse triggers `pointerdown` only if the press reaches the window; a browser that does not report it would be pulled back until the timer ends.
2. **`.clip` now waits for the image.** A photograph that never fires `load` or `error` would never wipe in. Both events are listened for, and an image that is already complete skips the wait.
3. **`tests/e2e/pasantias-page.spec.ts`** — the edited control test was not executed here; a script did the same click on `/programas` and found one brochure iframe.
4. **New wording.** The stage labels and the inclusive forms beyond the foundation's own examples were drafted in this work. Brent saw them on screen and asked to publish.
5. **Inspira's «Objetivos» tab** now holds three lines that are also activities. That is the foundation's instruction followed literally; the program has no objectives written as objectives.

## Known limitations

- The directors' brochure offered on `/programas` is still the April–May 2026 edition. The foundation asked for the next edition's brochure; none exists yet.
- `/programas` still lists the second vía as «Personalización» inside the Evoluciona text; the home page says «Crecimiento».
- The Pasantías page keeps one line illustration (the Sagrada Família beside the calendar) and its skyline.
- Files no longer referenced stay under `public/`: `sitio/linea-collaborative.png`, `sitio/linea-children-on-ladder.png`, `images/faces.png`.
