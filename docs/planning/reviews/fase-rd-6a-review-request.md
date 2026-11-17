# RD-6A — platform redesign, phase 6, Mi Panel, step A: the panel's data code in one hook. Review request

- **Branch:** `feat/rd-panel-hook` · **Base:** main at `5e08e8aed` (the fixes' level 2, second part, published) · **Commits:** 10 (the pin of today's panel; the hook; the classic view; the decisions; three commits answering the first code read and the lead's runs; one answering the second code read; this record; the inventory rebuilt)
- **Part of the platform redesign** (plan phase 6, "area by area"; first area: Mi Panel). The first of the area's releases.
- **Built the new way:** builder agents from written briefs, two independent code reads (Sol), the lead's own runs of every check; the lead session wrote no product code.

## Objective and scope

Groundwork that nobody sees. «Mi Panel» (`pages/dashboard.tsx`) is a key screen of the redesign: it gets a second, new layout for accounts that chose the new design (the next release). To make that safe, this release separates what the page knows and decides from what it draws, **without changing either**: for every account, in both designs, the panel is element for element and call for call what it was.

**In:**
- `hooks/usePanel.ts` (new): the page's state, its five effects (the data calls, the redirects, the arrival toast), the two course lists and sign-out, moved word for word in the same order with the same dependency lists; and `decide()`, one named copy of every decision the markup makes (the greeting's name, the consultor's line, the community block, which sections show, the route cards, the handlers), each from the expression it was.
- `components/panel/PanelClasico.tsx` (new): today's markup, moved untouched; it reads the hook's result and the decisions.
- `components/panel/format.ts`, `components/panel/types.ts` (new): the page's three date and excerpt helpers and its three interfaces, moved.
- `pages/dashboard.tsx`: calls the hook, draws the frame and the loading mark as before, calls `decide()` after its loading return (where the body began), draws the classic view and the two pop-ups.
- `__tests__/pages/dashboard.clasico.test.tsx` with `dashboard.clasico.digests.json` (new): today's panel pinned by 37 digests of its markup and of the ordered log of everything it asks for, written by the page as it was BEFORE this release (first commit of the branch, which touches no product file).
- `tests/e2e/panel-pin.spec.ts`: two tests brought in line with main (since the fixes' level 2 the community's settings gear is offered only to an admin or that community's manager) and one added for the manager. This file is not in CI's list.

**Out, on purpose:** the new view (next release); any change to a piece the panel draws; the oddities of today's panel (they stay, pinned).

## Files, grouped by risk

**Higher — everyone's first screen**
- `hooks/usePanel.ts`, `pages/dashboard.tsx`, `components/panel/PanelClasico.tsx`: a moved line that changed, a hook out of order, a decision evaluated at another moment.

**Lower**
- `components/panel/format.ts`, `types.ts`; the tests; this record; the inventory (the panel's rows now sit under the hook and the view).

## Tests

- `__tests__/pages/dashboard.clasico.test.tsx` (52 tests): 37 pinned cases (the loading mark; an admin; a consultor by role row and by metadata; a teacher with courses in every state, routes, upcoming courses, news, videos, numbers; nothing anywhere; every call failing; parts still loading; one and two communities, open and closed, with and without the right to edit, every kind of member; the two pop-ups' props; avatar sources; a second person signing in), behaviour tests (the four redirects, the arrival toast at 100 ms, sign-out, where a course and a route lead), and tests that count when the decisions run (never while loading; the gear's check only for an opened bar; the route cards only for an account with routes). The log holds every call with all its arguments. The file fixes its own time zone and number language, so it gives the same result on any machine.
- The pin was shown to fail on deliberate breaks: a class, a text, two conditions, the order of two calls, eleven changed call arguments.
- `tests/e2e/panel-pin.spec.ts`: 35 tests, all passing on this branch against a production build (on main 32 of the 34 passed: the two that failed were the out-of-date ones).

## Evidence (local, 17 Nov 2026)

- **The code moved, it was not rewritten.** Line by line (indentation aside): 852 of the old page's 898 lines that say something are in the new files unchanged; the other 46 are imports, the `export` of three helpers and three interfaces, and the decisions and inline handlers that now have a name. Two independent code reads compared the old function with the new files statement by statement. The first found that the named decisions were worked out on every render, also behind the loading mark, and two of them earlier than before; fixed here (`decide()`, and two decisions called at their old place), with tests that failed before. The second found the product code right in every point and one more way the pin read the machine's language; fixed.
- **The pin's digests are today's panel's:** run against the page as it was on main (`git show 5e08e8aed:pages/dashboard.tsx`), all 37 pass.
- **Stylesheet:** the compiled stylesheet is byte for byte main's.
- **Pictures, switch off** (every screen for every role at two widths; main, then this branch, same stack and data): 3,038 of 3,040 visits the same; no picture unstable, no error. The two that differ are one screen, `/admin/school-users` as equipo directivo at both widths, in the 50 x 50 px of the frame's avatar: a difference main shows against itself (that role walked again on each build: identical, 302 of 302; main's two runs of that screen at phone width are not the same picture). This release does not touch that page or the frame.
- **The panel in the new look and for tester accounts with today's look** (every role, two widths): **IDENTICAL** to main's in both, 20 of 20 each.
- **Behind a click or the pointer** (41 states of the panel: nine accounts on arrival at both widths; an opened course card, an opened upcoming card, a row's arrows, the proposal form and its first error, the community bar open, a member's window, the settings window; a visitor not signed in), pictures and texts, main against this branch: **IDENTICAL**, 41 of 41, in today's look and in the new look (main compared with itself first: identical).
- **Gates:** type-check, lint with no warnings, the whole unit suite: 620 files passed and 1 skipped, 19,395 tests passed, 18 skipped.
- **CI's browser list** against a production build on a fresh local stack made from main: 344 passed, none failed.

## Where to look hardest

1. **`hooks/usePanel.ts`, lines above `decide()`:** must be the old function's lines 97 to 459 in the same order. Any difference is a defect.
2. **`decide()` and its two functions:** each expression against the old markup's; `canEditWorkspace()` and `learningPathCards()` are called by the view where the old markup evaluated them, not before.
3. **`pages/dashboard.tsx`:** both `MainLayout` returns as they were (the loading one passes `avatarUrl || undefined`), the pop-ups after the view.

## Known limitations

- The classic view is a component: its markup is evaluated when React renders it, after `MainLayout`'s render has begun, and no longer inside the page's own render. Inherent to having two views; no difference in what is drawn or asked.
- The pin cannot prove complete equivalence: a dependency removed from an effect's list escapes cases that keep one client, a change inside a piece the pin replaces by a marker escapes it, and a library update that changes how markup is written out can fail it without a change of the panel. The browser pin tests, the pictures and the code reads cover those sides.
- `tests/e2e/panel-pin.spec.ts` is still not in CI's list (it needs sample content CI's stack does not load).
