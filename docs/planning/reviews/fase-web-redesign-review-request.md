# WEB-REDESIGN — public site redesign: review request

- **Branch:** `feat/web-redesign` · **Base:** `631771416` (origin/main, 2026-11-11) · **Commits:** 7 (6 feature + this record)
- **Requested by Brent in conversation, 2026-11-12.** Not an itinerary phase; this file follows the phase format so a reviewer has one place to start.

## Objective and scope

Redesign the public site of Fundación Nueva Educación around its thesis (relational education) in the visual language of the Los Pellines home page: deep blue and gold, Mont capitals, a serif for running text, scroll-driven illustrations.

**In:** `/` (home), `/programas`, `/nosotros`, `/equipo`, `/noticias`, `/noticias/[slug]`, `/pasantias` (look only), the shared shell they now use, two small content changes Brent asked for on the proposals (`/propuesta/[slug]` and its PDF).

**Out:** every platform page; `/privacidad`; `/pasantias/nomina`; the Pasantías form, its API, the brochure and ficha; any database object. No migration, no API route, no dependency was added or changed.

## Files, grouped by risk

**Higher — behaviour that existed before and must not change**
- `pages/index.tsx` — the contact form posts exactly the same body to `/api/contact`, trap field and `elapsedMs` included (`__tests__/pages/home-contact-form.test.tsx` is untouched and green). The Pasantías teaser keeps the ratified January copy word for word in new markup.
- `pages/pasantias.tsx` — same facts, sections, `data-testid`s, anchors and form. The header/footer became the shared shell; the same-page shortcut bar was removed on Brent's direction. Layout is still Tailwind; inside `.pas` the platform colour tokens are remapped by `styles/sitio.css`.
- `lib/propuestas-web/constants.ts`, `lib/propuestas-web/pdf-generator.ts`, `components/propuestas-web/ProposalPublicView.tsx` — Boris Mir removed from the fixed advisors and filtered out of older snapshots (`isRetiredAdvisor`); Sandra Entrena's title updated.

**Medium — new code**
- `components/site/*` — `SiteLayout` (nav, footer, fonts, head), `useSiteEffects` (reveals, nav, cursor), `Sociograma` (canvas), `ViasEje`, `MapaChile` (+ `chilePath`), `Puertas`, `Ecosistema`, `RedAliada`, `Novedades`, `TeamSection`, `NewsCard`, `FlipbookDialog`, and the data modules (`teamData`, `programsData`, `news`).
- `styles/sitio.css` — imported in `_app.tsx`; every selector is scoped under `.ne` (or `.ne-html` / `.ne-js` on `<html>`).
- `pages/programas.tsx`, `nosotros.tsx`, `equipo.tsx`, `noticias.tsx`, `noticias/[slug].tsx` — rewritten on the shared shell. News and events are still read from `/api/news` and `/api/public/events`; the events realtime subscription is kept.

**Lower**
- `public/sitio/*` — hero video (6 MB, re-encoded from the 48 MB file the old home streamed from storage), optimised photos, mask images.
- `vercel.json` — preview disabled for this branch, as for earlier branches.

## Tests changed on purpose

- `__tests__/pages/pasantias-site-links.test.ts` — the nav and footer links moved into the shared shell (scope and per-file counts updated, the nav entry pinned as data); the teaser's ratified copy is pinned in its new markup.
- `__tests__/pages/pasantias.test.tsx` — the shortcut-bar block now asserts the bar is gone and the anchor offsets remain.
- `tests/e2e/pasantias-page.spec.ts` — reads the shared header (`site-header`); shortcut-bar assertions replaced by "no bar" and by the hero's own same-page jumps.
- `lib/propuestas-web/__tests__/advisor-filter.test.ts` — the replicated filter gains the retired-advisor rule, plus one case for it.

## Evidence (local, 2026-11-12)

- `npm run type-check` — clean. `npm run lint` — clean on the first round; changed files re-linted clean after each later round.
- `npm run build` — passes; `scripts/check-price-leak.mjs` OK (273 files); `scripts/ci/check-browser-boundaries.mjs` OK.
- Vitest: full suite run once after the first round (548 of 549 files green; the one failure was this branch's `useSiteEffects.ts` tripping `ledger-hours-reader-inventory.test.ts`, since fixed and re-run green, 67/67). After the later rounds: the Pasantías, proposals and home-form suites (30 files, 885 tests) green. **The full suite was not re-run after the last rounds.**
- Browser checks by script against the production build (desktop and 390 px): no console errors on the six pages, one `h1` and no skipped heading level on each, no horizontal overflow from 320 to 1440 px, the Pasantías program CTA preselects its program, the bond counter never decreases while scrolling.
- **Playwright e2e was not run locally.** CI's Gate 4 is its first run against this branch.

## Where to look hardest

1. **`tests/e2e/pasantias-page.spec.ts` against the restyled page** — never executed here. The contrast check on the hero eyebrow, the axe pass and the layout measurements are the likeliest to object; the motion on that page is transform-only precisely so text never loses contrast mid-animation.
2. **The colour-token remap in `.ne .pas`** — it overrides Tailwind utilities by class name. It is contained, but a new utility colour used on that page later will not be remapped unless added there.
3. **`styles/sitio.css` is global** — scoping under `.ne` is the only thing keeping it off the platform. It no longer resets `p`/heading margins itself and relies on Tailwind's preflight for that.
4. **`isRetiredAdvisor`** — it hides a consultant by name in every proposal, including proposals already sent.
5. **New Spanish copy** — the home headline, thesis, the four sociogram steps and the one-line reading of each vía were drafted in this work. Brent saw them on screen and asked to publish; they did not go through a separate copy review.

## Known limitations

- `/programas` still lists the vías with «Personalización» inside the Evoluciona text carried over from the old page; the home page now says «Crecimiento».
- Unused files remain: `components/Footer.tsx` is no longer used by the public pages (still used elsewhere), and photographs of the two people removed from the team are still under `public/`.
- The home page's network logos and team portraits are still served from Supabase storage, as before.
