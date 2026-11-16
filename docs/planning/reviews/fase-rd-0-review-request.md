# RD-0 — platform redesign, release 0: the safety net. Review request

- **Branch:** `chore/rd-net` · **Base:** `58b8d169f` (origin/main, 2026-11-13) · **Commits:** 2 (the release + this record)
- **Part of the platform redesign** Brent asked for on 2026-11-12 (plan phases 2 to 4). Not an itinerary phase; this file follows the phase format so a reviewer has one place to start.

## Objective and scope

Bring the redesign's safety net into the repository before any screen changes, in a release that **nobody can see**: the inventory of what every screen offers today, the picture harness that proves "nothing visible changed", the tests that pin the panel, and one change to how Tailwind finds class names.

**In:** `tailwind.config.js` (`content`), `src/components/TipTapEditor.tsx` (15 class names removed), `docs/plan/redesign/**`, `scripts/redesign/**`, `tests/e2e/panel-pin.spec.ts`, three lines of `.gitignore`.

**Out:** every other application file. No page, component, API route, migration, dependency or CI file changes. The panel tests are **not** added to CI's mandatory list (see "Known limitations").

## Files, grouped by risk

**Higher — what every user receives (two files)**
- `tailwind.config.js` — `content` also reads `src/`, `lib/`, `types/`, `config/` and `utils/`. Before, a class written only there was silently never generated.
- `src/components/TipTapEditor.tsx` — the rich-text editor (lesson text blocks, news, meeting notes). It carried 15 class names that were never generated and so never applied (icon-only toolbar buttons on desktop, larger text on wide screens, a yellow focus ring). With the wider `content` they would have switched on for everyone. Brent's decision of 13 Nov: keep the editor as it is; the names are taken out. The Course Review work rebuilds this editor; a note about this edit was written for it on 13 Nov.

**Lower — not used by the application**
- `docs/plan/redesign/inventory/**` and `scripts/redesign/inventory.mjs`, `extract.mjs` — what every screen offers today (21 areas, 177 screen files, 364 API files, about 18,800 rows), written from the code. `build`, `check`, `diff`.
- `scripts/redesign/harness/**` and `docs/plan/redesign/harness/**` — a private local copy of the platform (the stack of `scripts/ci/e2e-local.sh`) with invented sample content; a picture of every address as ten visitors at two widths; a comparison of two runs. It refuses any stack that is not on this machine (API address and database address).
- `tests/e2e/panel-pin.spec.ts` — 34 tests that record what the panel (`/dashboard`) does today.
- `.gitignore` — the repository ignores `*.json`; three exception lines for the two folders' data files.

**Deliberately not in the repository.** The repository is public. Notes that say where the live platform is weak (behaviour problems found on the way, what walks by sight saw, where roles really land, pointers to code reviews) are kept in a private folder outside it; `inventory.mjs` and `harness/landings.mjs` read and write them there, and `inventory.mjs` stops if it finds one in `annotations.json`. This branch is a single new commit on main for the same reason: the working branches carried those notes in their history.

## Tests changed on purpose

None. One test file is added (`tests/e2e/panel-pin.spec.ts`).

## Evidence (local, 2026-11-13 and 14)

- **Stylesheet.** Compiled before and after with Tailwind's command line: no class is lost, five rules are added (`.flex-shrink`, `.shrink`, `.ordinal`, `.!inline`, `.!transition`: ordinary words in code and comments under the newly read folders), none used by any element. None of the 15 removed names existed in the stylesheet before. Checked again by an independent reviewer on its own builds.
- **Pictures.** On one local stack, from one database snapshot: main's code built, a full run (3,500 visitor × width × address, about 1,460 pictures); this release built, a full run; compared: **3,499 the same, every landing the same, 1 picture different**: `/admin/new-reporting` as admin on desktop, 273 pixels, the seconds of a "last updated" clock the page prints (`12:00:06` against `12:00:01`). A second full run of this release against the first: **IDENTICAL, 3,500 of 3,500**.
- **Gates on this branch:** `npm run type-check` clean; `npm run lint` clean; `npm test` 549 files, 18,321 tests passed, 12 skipped; `scripts/ci/check-browser-boundaries.mjs` OK. The production build passed each time the harness built it.
- **CI's browser gate, run once from an empty stack** (`scripts/ci/e2e-local.sh`, the 26 mandatory files, with the panel tests added for the trial): 364 of 368 pass. Three failures are panel tests and are the reason the panel tests are not in the list (below). The fourth is `auth-lifecycle.spec.ts` › «a session revoked while the page is open lands on /login and stays there (no loop)», which ran out of time on all three attempts while waiting for the sign-in page to go quiet. Run alone, and with its file, it passes in 3 seconds on unchanged main and on this code. Nothing in this release touches sign-in. **CI on the release's pull request is the judge.**
- **Panel tests:** 34 of 34 on the plain seeded database.
- **Independent review** (another model, read-only): the code change is invisible; it found the weakness notes and two gaps in the harness's "local only" checks, all three fixed before this commit.

## Where to look hardest

1. **`src/components/TipTapEditor.tsx`** — the claim is "only names that never worked were removed". A name that *was* generated through some other file would be a visible loss. The 15 are listed in `docs/plan/redesign/harness/README.md`.
2. **Tailwind reads comments.** From now on a class named in a comment or a string of any `.ts`/`.tsx` file under the five new folders is generated. The five new rules are of that kind. Harmless today; worth knowing.
3. **What is public.** `docs/plan/redesign/inventory/**` is generated from the code and says, per screen, what the menu and the middleware let each role do. That is a restatement of public code, but it is a convenient one. Judgements about weaknesses were taken out; if the role tables should also stay private, they can be.
4. **The harness's safety.** `scripts/redesign/harness/lib.mjs` (`stack()`) is the one place that decides what the seed and the walk may talk to. `stack.sh` uses `docker exec` on its own stack's containers.
5. **`tests/e2e/panel-pin.spec.ts` in `npm run e2e`.** It is not in CI's list, but a plain `npm run e2e` would run it; it seeds through the harness, which refuses a non-local stack.

## Known limitations

- **The panel tests do not run in CI.** In CI's order, specs that run before them leave rows behind that the panel shows (a course «Synthetic access course» for the admin, a community for the school's consultor, a second member in the lider de comunidad's community), and three of the 34 pins then fail. They are right on a plain seeded database. Joining CI needs a database of their own inside the workflow: a separate change, wanted before the panel is rebuilt.
- **Pictures show an address as it opens.** Nothing behind a click, no hover or focus. The local copy lacks Production's permissions table, notification types and one feature flag (the harness README lists it all).
- **The inventory's "read from" names a commit of this branch;** the publisher replays commits, so that name will not be in main. `inventory.mjs diff` does not need it.
- `/admin/new-reporting` prints a clock with seconds, so its picture can differ between any two runs; the page is retired in the next release but one.
