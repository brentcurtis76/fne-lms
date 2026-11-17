# RD-5a — platform redesign, step 5a: the new look's values, behind the switch. Review request

- **Branch:** `feat/rd-look` · **Base:** main at `3063aa5cc` · **Commits:** 17 (ten more colour families named; the look's values; toasts; charts; pages outside the platform; the tokens notes; fixes from the code read, the blind test and the browser list; the picture harness's additions; this record; the inventory rebuilt)
- **Part of the platform redesign** (plan phase 5, "the new look, behind the switch"). The first of three releases of that phase; 5b (the new frame) and 5c (the shared pieces) follow, each undoable alone.
- **Built the new way:** builder agents from written briefs, an independent code read (Sol), a blind test (Astra) from a list of scenarios written without the code; the lead session wrote no product code (it wrote the picture harness's additions and this record).

## Objective and scope

Step 4d gave each account a switch that puts `data-look="nuevo"` on `<html>`; only accounts marked «Tester QA» are offered it, and until now the attribute changed nothing. This release gives the attribute its values: the approved palette, corners, shadows, focus ring, title type, toasts and chart tones. **With the switch off nothing changes.** With it on, every platform screen is recoloured at once, in today's frame.

**In:**
- `styles/look-nuevo.css` (new, imported after the token file): every value sits under `[data-look="nuevo"]`. Five scales replace the sixteen named colour families (GRIS for gray and slate; NEUTRO for blue, sky, indigo, purple, pink, cyan and teal, because the approved palette has no blue and no colour per category; ÉXITO for green and emerald; ERROR for red and rose; ÁMBAR for amber, yellow and orange); the 30 `legacy` names are mapped onto them; radii of 3, 4, 4 and 6 px; three lighter shadows; a keyboard ring that shows on light and on dark surfaces (black outside, white inside); h1 to h3 in Mont, h1 in capitals; black as the accent colour of tick boxes and radio buttons.
- `styles/fne-tokens.css`, `tailwind.config.js`: ten more stock families (slate, orange, sky, emerald, rose, purple, teal, indigo, pink, cyan) read named values holding exactly Tailwind's defaults, as step 4a did for six. Invisible by itself.
- `constants/toastStyles.ts`, `pages/_app.tsx`: toasts read `var(--toast-…, <today's value>)`; the names exist only under the look.
- Charts with several series (`components/reports/*`, `components/hours/SchoolHoursReport.tsx`, two report pages): series colours read `rgb(var(--color-serie-n, <today's value>))`; under the look the five series take the kit's tones.
- `lib/look.ts`, `contexts/LookContext.tsx`: the look never applies on pages that are not the platform (`PAGES_WITHOUT_THE_LOOK`: the sign-in family, the public site, documents for a client, the unsubscribe page, the error pages), whatever the account chose. The provider now works the attribute out during the render from the session's account, its profile, the address and a choice just saved, and writes it in one layout effect.
- `scripts/redesign/harness/*`, `scripts/redesign/tokens-check.mjs`: the picture harness can give every invented account the new look and compare what two looks show (landing page, menu, headings, text).

**Out, on purpose:** the frame (5b); any screen's classes or structure; the sign-in screens; colours written into a page or saved as data (they do not follow the look; step 4b lists them); the course screens being rebuilt elsewhere.

## Files, grouped by risk

**Higher — reaches accounts with the switch off if wrong**
- `styles/fne-tokens.css`, `tailwind.config.js`: the ten families. A wrong triplet would recolour today's platform. Proven by the stylesheet comparison and the pictures below.
- `contexts/LookContext.tsx`: decides who gets the attribute. An account that is not offered the choice must never get it, not even for one render after another account used the same browser tab.
- `constants/toastStyles.ts`, the chart files: each fallback must be today's exact value.

**Medium — only under the look**
- `styles/look-nuevo.css` (about 250 values and a few rules for shadows, focus, headings and native controls).
- `lib/look.ts`: the list of pages outside the look and its matcher.

**Lower**
- Tests, `docs/plan/redesign/tokens.md`, the harness, the inventory rebuilt.

## Tests

New: `__tests__/styles/look-nuevo.test.ts` (every family takes its scale's eleven values; nothing is declared outside the look's selector; the usual text and background pairs measure at least 4.5:1, with the three listed exceptions that are the same today; shadows, focus, native controls), `__tests__/styles/chart-series.test.ts`, `__tests__/constants/toastStyles.test.ts`.
Extended: `__tests__/contexts/LookContext.test.tsx` (the three orders in which a save and the account's loading can happen; account A, then B, then A again; a withdrawn tester mark; pages outside the look; generated sequences of events checked against a small model), `__tests__/lib/look.test.ts`, `__tests__/styles/brand-tokens.test.ts` (the count of names the config reads), `__tests__/styles/stray-colours.test.ts`, `__tests__/lib/colorAlpha.test.ts`.

## Evidence (local, 16–17 Nov 2026)

- **Stylesheet, switch off:** main's compiled stylesheet and this branch's are EQUIVALENT: 4,083 declarations the same once each name is replaced by its value; the look's own declarations set aside, since they apply to nobody with the switch off.
- **Blind test, switch off** (Astra, another model family, her own scripts, main and this branch side by side on the same data): 97 screen and state pairs, about 57,000 element comparisons, **0 pixels different**. One computed-style difference with no pixel: the toasts' three zero-width borders now compute the text colour.
- **Blind test, switch on:** no text, button, link, field, test id or chart shape missing on any screen compared; saving the choice shows at once in both directions; an account that is not a tester, the sign-in page after signing out, and a tester who switched back are pixel-identical to main. Her findings that were defects of this release were fixed here: muted grey text on the look's light grey measured 4.44:1 (now 4.91:1, with a grey one step darker than the kit's); ticked boxes and radio buttons stayed the browser's blue (now black).
- **The two looks compared by the harness** (every role, both widths, 3,020 visits each): the same landing page, menu, headings and page text in both looks, except the public home page's rotating headline; the signed-in visits that did not carry the look are exactly the pages outside it and the "not found" addresses.
- **Independent code read** (Sol): four findings. Fixed: an account that is not a tester could keep the previous account's look when account and address changed in one step; the focus ring was invisible on dark surfaces. Left: the two under "Known limitations".
- **Gates** (head `2cf1960d1`): type-check, lint with no warnings, and the whole unit suite: 569 files, 18,840 tests passed, 12 skipped. CI's browser list against a production build of this branch: 338 passed, 1 failed, and that one is `auth-lifecycle.spec.ts` "a session revoked while the page is open", which times out on this machine on main too. `look-switch.spec.ts` repeated six times: 6 of 6. `notification-preferences-api.spec.ts` repeated six times: 5 of 6; the one failure is a race in that test's own set-up (it replaces the page's content while the dashboard's scripts still run), which this branch does not touch; CI retries a failed test twice.
- **Pictures, switch off** (every screen for every role at two widths, 3,020 visits; main walked again on the same data, then this branch): **IDENTICAL, 3,020 of 3,020**; no picture unstable, no error.

## Where to look hardest

1. **The ten families in `styles/fne-tokens.css`:** 110 triplets typed from Tailwind's defaults. `brand-tokens.test.ts` compares each with Tailwind's own palette.
2. **`contexts/LookContext.tsx`:** the rule for a choice just saved (it belongs to the account that made it; a profile that arrives later does not undo it; another account, a signed-out session or a withdrawn tester mark does).
3. **Fallbacks:** `var(--toast-…, X)` and `rgb(var(--color-serie-n, X))`: X must be today's value in each of them.
4. **`PAGES_WITHOUT_THE_LOOK`:** a platform page listed there by mistake would stay in today's look; a public page missing from it would be recoloured for testers.

## Known limitations

- A "not found" page reached by a link inside the platform (without a full load) keeps the look until the next full load.
- Headings inside written lesson content take the look's title type, over classes the content brought.
- Colours a page writes itself or stores as data do not follow the look (the roadmap's bars, the message categories).
- Titles in capitals are wider: on a phone some wrap onto a second line.
- Under the look, gray 500 on gray 100 measures 4.36:1 (about what it measures today).
- A reload of a tester's page shows today's look for a moment before the look arrives (accepted until launch).
