# RD-4d — platform redesign, step 4d: the look switch. Review request

- **Branch:** `feat/rd-switch` · **Base:** step 4c of the redesign (`feat/rd-retire`; main once that is published) · **Commits:** 4 (the switch, the review's findings, the inventory rebuilt, this record)
- **Part of the platform redesign** (plan phase 4). The course screens' rebuild uses this same switch.

## Objective and scope

A switch per account between today's look and the redesign's, so that the new look can be built and used on the live platform by a few accounts while everyone else keeps today's. This release only adds the switch: nothing reads it yet. An account that never chose gets exactly the page it had.

**In:** `lib/look.ts` (the whole rule), `contexts/LookContext.tsx`, three lines of `pages/_app.tsx`, a new page `/configuracion/apariencia`, a new route `PUT /api/user/look`, a link on `/configuracion/notificaciones` for accounts that are offered it, tests, the inventory rebuilt.

**Out:** any style or component that reacts to the switch (phase 5). No migration: `profiles.learning_preferences` exists and was unused. `pages/_document.tsx` is not touched.

## How it works

- The choice is one key of the account's own profile row: `learning_preferences.ui_look = "nuevo"`. Anything else, the key's absence included, is today's look.
- `LookProvider` (around the app, inside `AuthProvider`, which already loads the whole profile row) puts `data-look="nuevo"` on `<html>` for an account that chose it **and is offered the choice**, once the profile loaded is the session's own; otherwise the attribute is absent. Components ask `useLook()`; stylesheets use `[data-look="nuevo"]`.
- **Who is offered it:** accounts marked «Tester QA» (`profiles.can_run_qa_tests`, the switch an admin sets on a user in Usuarios). `mayChooseLook` decides who sees «Apariencia», who may save, and who is shown the look.
- Nothing is kept in the browser. A person with the new look sees today's for a moment on a full page load; a copy in the browser would belong to the computer, not the account.

## Files, grouped by risk

**Higher — runs for every signed-in page**
- `contexts/LookContext.tsx`, `pages/_app.tsx` — one more provider. For an account that is not offered the choice or never chose it sets no attribute and stores nothing.
- `pages/configuracion/notificaciones.tsx` — one more prop, `canChooseLook`, from the profile flag the page already read (no extra read); a link «Apariencia» under the settings when it is true.

**Medium — new, reached by testers only**
- `pages/api/user/look.ts` — `PUT { look }`. The verified caller only (`requireVerifiedCaller`); the body must be exactly `{ look: "nuevo" | "clasico" }`; refused with 403 for an account that is not offered the choice; reads and writes the caller's own row through the caller's own client, so the row policies apply; writes only `learning_preferences`, every other key kept; `no-store`.
- `pages/configuracion/apariencia.tsx` — the server verifies the user, applies the forced-password rule, and sends anyone who is not offered the choice to the notification settings, as `/configuracion` does.
- `lib/look.ts` — names and pure functions.

**Lower**
- `scripts/ci/e2e-mandatory.mjs` — `tests/e2e/look-switch.spec.ts` joins CI's list.
- `pages/configuracion/index.tsx` (a comment), the inventory.

## Tests changed on purpose

- `__tests__/pages/notification-settings.test.tsx` — one pinned result gains the new prop (`canChooseLook: false`); two cases added (the tester flag and nothing else offers the link; the link shows only then).

New: `__tests__/lib/look.test.ts` (9), `__tests__/contexts/LookContext.test.tsx` (10), `__tests__/api/user-look.test.ts` (19), `__tests__/pages/apariencia.test.tsx` (11), `tests/e2e/look-switch.spec.ts` (4, against the real policies).

## Evidence (local, 2026-11-14)

- **Pictures** (one local stack, one snapshot; 4c built, a full run; this branch built, a full run): one new address, `/configuracion/apariencia`, where every made-up account lands on the notification settings (none is a tester); **all 3,000 others are the same**, every landing among them.
- **Browser tests on the plain seeded local copy:** `look-switch` (4), `notification-settings` and the panel pin tests: 43 of 43. `look-switch` covers: an account that is not offered the choice sees nothing of it, is refused by the route, and is not shown the look even with the key written into its own row; no session: 401; a tester switches to the new look and back from the keyboard, the profile holds it across a reload, another key of the column is kept, nothing is kept in the browser; a withdrawn tester mark and an ended session both return the page to today's look.
- **By sight on the local copy** as a made-up tester, desktop and phone: the link, the page, saving, the attribute, going back; nothing overflows.
- **Gates on this branch:** `npm run type-check` clean; `npm run lint` clean; `npm test` 553 files, 18,384 tests passed, 12 skipped (run before the last move of the branch; the files this release touches have not changed since). The production build passed when the harness built it.
- **Independent review** (another model, read-only): approve with notes; what changed because of it is the second commit: the tester rule now also decides who is shown the look (a tester whose mark is withdrawn would otherwise have been stuck in it); the copy of the look in the browser and the script in `<head>` that the first build had are gone (on a shared school computer the next person would have got a flash of a look that is not theirs); the provider asks that the profile is the session's own.

## Where to look hardest

1. **`LookProvider` runs on every page for every signed-in person.** The claim is that it does nothing unless the account is a tester who chose the new look. `useAuth()` returns a new object each render; the effect depends on three primitives.
2. **Any signed-in person can mark themselves «Tester QA».** The database lets a person update their whole own profile row (only `must_change_password` has a guard), and `can_run_qa_tests` is one of its columns. That already opened the QA pages to them before this release; after it, also «Apariencia» and the new look. Not fixed here: it is a column guard in the database, outside the redesign, and has been reported.
3. **The route's read-then-write of `learning_preferences`** is not atomic. Nothing else writes that column today; two saves at once can only lose one of two looks.
4. **New Spanish texts**, written in this work and seen only by testers: «Apariencia», «Elige cómo se ve la plataforma para tu cuenta. El cambio solo te afecta a ti y puedes volver atrás cuando quieras.», «Diseño de la plataforma», «Diseño actual», «La plataforma tal como se ve hoy.», «Diseño nuevo (en construcción)», «El rediseño de la plataforma. Se irá activando por partes; mientras tanto puede verse igual al actual.», «Tu apariencia se guardó.», «No pudimos guardar tu apariencia. Intenta nuevamente.», «Tu cuenta no tiene esta opción.».
5. **`tests/e2e/look-switch.spec.ts` ends a session by clearing cookies**, not by the app's own sign-out button.

## Known limitations

- A tester sees today's look for a moment on a full page load (the profile has to load first).
- An admin without the «Tester QA» mark is not offered the choice (the menu's QA entry does count admins in).
- The switch and the rule go away when the new look becomes everyone's.
