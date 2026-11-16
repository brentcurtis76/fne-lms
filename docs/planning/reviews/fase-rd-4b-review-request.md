# RD-4b — platform redesign, step 4b: the stray colours get names. Review request

- **Branch:** `feat/rd-strays` · **Base:** step 4d of the redesign (`feat/rd-switch`; main once that is published) · **Commits:** 6 (a helper; classes and stylesheets; strings; tests from the review; the inventory rebuilt; this record)
- **Part of the platform redesign** (plan phase 4, "invisible groundwork"). The last release of that phase.
- **Built the new way** (since 16 Nov): a builder agent from a written brief, an independent code read (Sol), a blind test (Astra) and a test by sight from a list of scenarios written without the code; the lead session wrote no product code.

## Objective and scope

Every hand-typed colour on the platform's screens that is NOT one of the brand kit's seven values reads a named value holding exactly the value it had, so that a new look can later give those names other values. Nothing a person can see changes.

**In:** 222 such colours were found on platform screens; **181 changed** (70 class uses, 79 strings in code, 22 chart and icon attributes, 10 stylesheet values) in 56 files; 30 new names `--color-legacy-<hex>` in `styles/fne-tokens.css` and `tailwind.config.js`; 76 uses point at names step 4a already had; one small helper, `lib/colorAlpha.ts`; `styles/notifications.css`, `styles/tour.css`.

**Out, on purpose** (each pinned with its reason in `__tests__/styles/stray-colours.test.ts`): 41 colours that are saved to the database or compared as text (the roadmap's colour picker and data; the message categories), or that no screen draws; the course screens being rebuilt elsewhere; the public site and Pasantías; documents, e-mails, proposals and file generators; the area being deleted; components no screen draws. The brand kit's own values stay literal everywhere.

## Files, grouped by risk

**Higher — colour strings handed to the browser by code**
- Charts (`components/reports/*`, `pages/consultor/sessions/reports.tsx`, `pages/directivo/assessments/dashboard.tsx`, the QA pages) and toast icons now pass `rgb(var(--color-…))` as `fill`, `stroke` and `color`. The browser resolves that; a library that computed with the string would not.
- **The glued opacity.** Six places used to append two hex characters to a colour (`${color}20`) to make a tint: `components/documents/DocumentGrid.tsx`, `components/reports/AnalyticsDashboard.tsx` (three), `components/reports/AnalyticsVisualization.tsx`, `pages/consultor/sessions/reports.tsx`. They now call `withAlpha`, which writes `rgb(var(--name) / 0.1255)` for a named colour and returns a hex colour exactly as before.
- Colour lists used in several places (`types/documents.ts` file types, session status and modality helpers, report tiles, `constants/toastStyles.ts`): each was followed to every use.

**Medium**
- 30 renamed classes (most are hover shades): `hover:bg-[#002844]` → `hover:bg-legacy-002844`, `text-[#EF4444]` → `text-red-500`; every variant and opacity modifier kept.
- `styles/notifications.css`, `styles/tour.css`: values read names.

**Lower**
- `styles/fne-tokens.css`, `tailwind.config.js`: the 30 names, one list.
- Tests (below); `docs/plan/redesign/tokens.md`; the inventory rebuilt.

## Tests changed on purpose

- `__tests__/lib/utils/session-ui-helpers.test.ts` — the seven session status colours are pinned as named values (`'#EF4444'` → `'rgb(var(--color-red-500))'` and so on), each exact.
- `__tests__/styles/brand-tokens.test.ts` — two cases added (every legacy name declared once on `:root`, holding the triplet of its own hex, offered by the config; every name used and every use named); the count of variables the config reads goes from 89 to 119.

New: `__tests__/lib/colorAlpha.test.ts` (8); `__tests__/styles/stray-colours.test.ts` (a scan of 662 platform files that fails on any stray outside an explicit list of exceptions, and on an exception that no longer matches anything; and the changed colour lists pinned value by value against the hex they had before).

## Evidence (local, 2026-11-16)

- **Pictures** (one local stack, one snapshot; step 4d built, a full run; this branch built, a full run, the machine left alone): **IDENTICAL, 3,020 of 3,020** visitor × width × address. (Two pictures counted as rendering noise: 11 pixels one shade apart, 42 pixels two.)
- **Stylesheet, class by class:** each of the 30 renamed classes has the same declarations as the class it replaces, once the names are replaced by their values.
- **Blind test** (Astra, a different model family, from a list of 18 screens and click-states, the two builds side by side on the same data, her own scripts): every computed colour the same in about 70,000 element-and-state comparisons, at rest and with the pointer on things, charts included. She reported six small pixel differences; the two that repeated are two renderings of the page header that BOTH builds show from one load to the next (checked separately), the others are one to three shades on a rounded edge or did not repeat.
- **By sight** (an Opus agent in a real browser, the same list, two tabs): no difference in the 16 items it could compare, plus six more screens.
- **Independent code read** (Sol): values, mappings, class renames, the helper and the absence of any named colour reaching saving, parsing or a file export found fine; one finding (the tests proved neither completeness nor which name replaced which colour) fixed in the fourth commit, which also shows each new test can fail.
- **Gates on this branch:** see the last line of this section, filled when the branch was moved onto main.
- GATES_LINE

## Where to look hardest

1. **`rgb(var(--…))` as an SVG attribute.** Charts and icons get it as `fill`/`stroke`. Current browsers resolve it (the pictures and the blind test saw the charts drawn alike); an old browser that does not would draw those marks black or not at all.
2. **Anything that computes with a colour string.** The builder and the reviewer found no named colour reaching a parser, a comparison, a saved value or an export. The roadmap's stored colours and the message categories were left as hex for exactly that reason, so they will not follow a new look.
3. **`withAlpha` can throw** on something that is not two hex characters, where the old gluing could not. Every caller passes a literal `'20'` or `'30'`.
4. **What nobody could look at on the local copy:** the consultant's session-report charts with data (empty there), an error toast, a message with an attachment.
5. **The exception list of `stray-colours.test.ts`** is long (120 paths, 13 single entries). It is where a wrongly excluded file would hide.

## Known limitations

- The roadmap's colours, the message categories and four classes still written by out-of-scope files stay hand-typed.
- Other stock colour families than the six step 4a named (emerald, violet, indigo, pink, orange, cyan) were given `legacy` names where a screen typed them as hex; their Tailwind classes (`bg-emerald-500`) are untouched.
- As in step 4a, a see-through use of a named colour can differ from the old rounded value by one shade of 255; none showed in this release's pictures.
