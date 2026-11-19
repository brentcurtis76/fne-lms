# RD-SA — platform redesign, phase 6, sessions, step A: the data code of three session screens in hooks. Review request

- **Branch:** `feat/rd-ses-hook` · **Base:** main at `9874f20df` (after the fixes' releases of 19 Nov 2026, pull requests 204 and 205). Built and proven on 19 Nov on main at `f732cac9c`, then moved onto `9874f20df` the same day and proven again from the start (see "Evidence") · **Commits:** 16 product and test commits (two that pin today's three pages; three that lift the data code into hooks; three that move the markup into classic views; three that give each page's decisions one copy; three answering the two code reads; one that moves two source-reading tests to the new files), then this record and the inventory rebuilt
- **Part of the platform redesign** (plan phase 6, "area by area"; second area: sessions). The first of the area's releases.
- **Built the new way:** builder agents from written briefs, two independent code reads (Sol), a blind test by an independent tester (Astra), the lead's own runs of every check; the lead session wrote no product code.

## Objective and scope

Groundwork that nobody sees. Three session screens get a second, new layout later in this area, for accounts that chose the new design: the consultor's list of sessions (`/consultor/sessions`), the session page (`/consultor/sessions/[id]`) and the admin's form to create sessions (`/admin/sessions/create`). To make that safe, this release separates what each page knows and decides from what it draws, **without changing either**: for every account, in both designs, the three screens are element for element and call for call what they were.

**In:**
- `hooks/useSessionsList.ts`, `hooks/useSessionDetail.ts`, `hooks/useSessionCreate.ts` (new): each page's state, effects, data calls, redirects and handlers, moved in the same order with the same dependency lists, and one named copy of every decision its markup makes, each worked out where the markup worked it out.
- `components/sessions/SessionsListClasico.tsx`, `SessionDetailClasico.tsx`, `SessionCreateClasico.tsx` (new): today's markup, moved untouched; each reads its hook's result.
- `components/sessions/SessionsList.types.ts`, `SessionDetail.types.ts`, `sessionCreateTypes.ts`: the pages' interfaces and constants, moved.
- `pages/consultor/sessions/index.tsx`, `pages/consultor/sessions/[id].tsx`, `pages/admin/sessions/create.tsx`: each calls its hook and draws its classic view inside the frame it drew before.
- `__tests__/pages/consultor/sessions/list.clasico.test.tsx`, `detail.clasico.test.tsx`, `__tests__/pages/admin/sessions/create.clasico.test.tsx`, each with its `*.digests.json` (new): today's three pages pinned by 221 digests (43, 100 and 78) of their markup and of the ordered log of everything they ask for, written by the pages as they were BEFORE this release (the two pin commits touch no product file).
- `__tests__/api/sessions/session-timezone.test.ts`, `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`: two tests that read source files by path now read the files the code moved to. What they check is unchanged.

**Out, on purpose:** the new views (a later release of this area); the three behaviour changes of the create form that were decided for everyone (the next release, on its own); the eight other session screens; any change to a piece these pages draw; the oddities of today's pages (they stay, pinned).

## Files, grouped by risk

**Higher — the three screens consultors and admins work in**
- the three hooks, the three pages, the three classic views: a moved line that changed, a hook out of order, a decision or a clock read evaluated at another moment.

**Lower**
- the types files; the tests; this record; the inventory (the three pages' rows now sit under their hooks and views).

## Tests

- The three pin files: 227 tests: the 221 pinned cases and the tests around them (among them the session page's router becoming ready with the same id, and a response body that can be read only once). The log holds every call with its arguments; each file fixes its own time zone and restores it.
- **Three pin cases read React's internal tree** (the `__reactFiber$` key of React 18) to list, in order, the hooks the page's own component calls: that is how the pin shows the order of hooks did not change when they moved into a custom hook. A React upgrade can change that internal shape and fail these three cases without any change of the pages: they then need a deliberate re-accept, after the order was checked another way.
- The two source-reading tests named above, re-keyed to the new files.

## Evidence (local, 19 Nov 2026, on main at `9874f20df`)

A fresh local stack was made from the base (its migrations applied), the base was photographed and its gates run again, the branch was moved onto it (`git rebase --onto`, no conflict; the sixteen commits carry the same changes as before), and every check below was run on the moved branch.

- **The pins' digests are today's pages':** the three pin files run against a checkout of this branch with main's own three pages put back in place: 227 of 227 pass.
- **Two independent code reads** compared the old functions with the new files statement by statement. The first found decisions worked out at another moment than the markup worked them out, and cases the pins missed; fixed here (commits `d7e4a3138`, `013d16a37`), with tests. The second found the markup, the requests, the redirects, the order of hooks and the rendered values equal to the old pages, two more cases for the pins (fixed, `88df016da`), and the point under "Known limitations", which was left on purpose.
- **Pictures, switch off** (every screen for every role at two widths; main, then this branch, same stack and data): **IDENTICAL**, 3,040 of 3,040 visits the same; no picture unstable, no error.
- **The session screens for tester accounts, in today's look and in the new look** (every role, two widths): **IDENTICAL** to main's, 220 of 220 each.
- **A blind test** (an independent tester given two running copies, not told which is which or what changed, signed in as made-up accounts): no difference that holds at rest in repeated loads. It reported that the order of requests differs between the two copies; the lead's own check (eight loads each of main, this branch and main again, one page at a time) shows the same requests on every load, four to eight different orders among main's own eight loads, and no pair of requests that keeps one order on main and the other on this branch.
- **Gates:** type-check and lint with no warnings. The whole unit suite, base: 757 files passed, 1 skipped, 21,359 tests passed. This branch: 760 files passed, 1 skipped, 21,586 tests passed. (The chain's first run of the suite had one failure, a test of the feedback window, which this branch does not touch; that file run alone on this branch passed five times of five, and the whole suite run again passed.)
- **CI's browser list** against a production build (base: 348 passed): 348 passed, none failed. (The chain's first run had one failure, a test of Mi Panel's proposal pop-ups, which this branch does not touch; that file run alone on this branch passed twice, and the whole list run again passed.)

## Where to look hardest

1. **The three hooks, above their decisions:** must be the old page functions' lines in the same order. Any difference is a defect.
2. **The decisions:** each expression against the old markup's, and worked out where the old markup evaluated it, not before.
3. **The three pages:** the frame and the loading returns as they were.

## Known limitations

- **Where the create form reads the clock.** The form's two earliest-date reads from the clock now happen at the start of the page's render; the old page made them in the middle of building its markup, in the same render, microseconds later. The second code read asked for the old position. It was not changed: the old instant was as arbitrary as the new one, the two can differ only in a render that straddles midnight UTC by that margin, and the next release replaces exactly these reads on purpose (the earliest date becomes today in Chile).
- Each classic view is a component: its markup is evaluated when React renders it, after the frame's render has begun, and no longer inside the page's own render. Inherent to having two views; no difference in what is drawn or asked.
- The pins cannot prove complete equivalence: a change inside a piece the pin replaces by a marker escapes them, and a library update that changes how markup is written out, or React's internal tree (above), can fail them without a change of the pages. The pictures, the blind test and the code reads cover those sides.
