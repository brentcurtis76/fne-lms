# RD-5b — platform redesign, step 5b: the new frame, behind the switch. Review request

- **Branch:** `feat/rd-frame` · **Base:** main at `f3e7f6fdd` (step 5a and the fixes' level 2, first part, both published) · **Commits:** 14 (today's frame pinned; the sidebar item's code lifted into one hook, unchanged; the new frame; its tests; the fixes and tests from the code read; one fix from the test by sight; this record; the inventory rebuilt; this record and the inventory once more after the replay on the new main)
- **Part of the platform redesign** (plan phase 5). The second of three releases of that phase.
- **Built the new way:** builder agents from written briefs, an independent code read (Sol), a test by sight in a real browser from a list of scenarios written without the code; the lead session wrote no product code.

## Objective and scope

An account with the new look chosen (`data-look="nuevo"`, offered only to «Tester QA» accounts) gets a new frame around every platform screen: a black sidebar with one-line entries, a white top bar that holds the path of links, the school, the bell, the avatar and the way out, the page's title under it, and a one-line footer. **An account with the switch off gets today's frame, unchanged.** Both frames draw the same menu from the same list through the same visibility code, so an entry cannot be in one and missing in the other.

**In:**
- `components/layout/MainLayout.tsx`: reads the look and chooses the frame. The chain of elements down to `<main>` is the same in both, so a page is not mounted again when the look flips; only class names and the frame's own slots differ.
- `components/layout/Sidebar.tsx`: still ONE component. Its body (what is loaded, which entries an account sees, what is expanded, what a click does) does not move; only its `return` chooses between today's markup and `SidebarNuevo`. The per-entry code (is it shown, is it active, its children) was lifted, unchanged, into `components/layout/useSidebarItem.ts`, which both sidebars call.
- New: `SidebarNuevo.tsx`, `TopBarNuevo.tsx`, `FooterNuevo.tsx`.
- `components/notifications/ModernNotificationCenter.tsx`: a `panelAlign` prop, so the bell's panel opens under the top bar's bell; today's use passes nothing and is unchanged.
- `styles/look-nuevo.css`: under the look only, the keyboard ring inside the black sidebar (yellow) and the bell's colours in the white top bar. The frame's layers (top bar, sidebar, phone veil, drawer) are one constant, `FRAME_LAYERS`, in `SidebarNuevo.tsx`.
- `tests/e2e/look-frame.spec.ts`, added to CI's list.

**Out, on purpose:** the list of menu entries, who sees which, and where each goes; every page inside the frame; the sign-in screens and the public site (their frame is their own); the shared pieces (5c).

## Files, grouped by risk

**Higher — today's frame must not move**
- `components/layout/Sidebar.tsx` (the lift into the hook, about 130 lines moved) and `components/layout/MainLayout.tsx` (class names and slots now chosen by the look).

**Medium — only under the look**
- `SidebarNuevo.tsx`, `TopBarNuevo.tsx`, `FooterNuevo.tsx`, the frame's rules in `styles/look-nuevo.css`.

**Lower**
- `ModernNotificationCenter.tsx` (one optional prop), tests, the inventory rebuilt.

## Tests

- `__tests__/components/layout/frame.clasico.test.tsx` with `frame.clasico.digests.json`: today's frame rendered for 44 combinations of role, state and width, each pinned by a SHA-256 of its markup, written BEFORE the new frame existed. Any change to today's frame fails it.
- `__tests__/components/layout/Sidebar.sameMenu.test.tsx`: 576 combinations of role, permissions and feature state; for each, both frames must show the same entries with the same labels in the same order, a click must go to the same place, and the collapsed menu must offer the same children. Shown to fail on four deliberate breaks.
- `__tests__/components/layout/frame.nuevo.test.tsx` and three role-specific files for the new sidebar; `__tests__/contexts/LookContext.identity.test.tsx`.
- `tests/e2e/look-frame.spec.ts`: a tester gets the new frame with the same menu, and today's frame back after «Diseño actual»; in the new frame nothing in the sidebar is cut and the footer sits at the bottom of a short page.

## Evidence (local, 16–17 Nov 2026)

- **Stylesheet, switch off:** 5a's compiled stylesheet and this branch's are EQUIVALENT: 4,193 declarations the same once each name is replaced by its value; 27 new rules set apart, all for classes only the new frame uses.
- **Today's frame:** the 44 digests written before the new frame existed still pass, never re-accepted.
- **Pictures, switch off** (every screen for every role at two widths, 3,020 visits; 5a, then this branch, on the same data): **IDENTICAL, 3,020 of 3,020**; no picture unstable, no error.
- **The two frames compared by the harness** (every role with the new look against the same role with today's, 3,020 visits each): the same landing page, menu, headings and page text, except the public home page's rotating headline and one list that loads more rows as its end comes into view.
- **Independent code read** (Sol): four findings, all fixed here: `setLook` kept no stable identity; top-level buttons of the new sidebar had no name of their own; the bell's panel sat under the feedback button; the same-menu test compared too little (it now compares labels, where a click goes and the collapsed menu). It found the lift word for word and today's markup unchanged.
- **Test by sight in a real browser** (another agent, from a list written without the code, four tester accounts): with the switch off, 9 of 9 items the same as main; in the new frame the same entries, order and children as today's for each account, and every entry of three roles opened the same page (about 55 pages: none without its frame, none with two). Three things it saw were fixed here: the sidebar's head was cut, one long entry name was cut, the footer floated on a short page.
- **Gates** (run on `079be7bda`, before the move onto the published 5a, which changed no product file): type-check, lint with no warnings, the whole unit suite: 576 files, 18,992 tests passed, 12 skipped. CI's browser list against a production build: 340 passed, 1 failed, which is `auth-lifecycle.spec.ts` "a session revoked while the page is open" timing out on this machine as it does on main.
- **Replayed on main `f3e7f6fdd`** (17 Nov, after the fixes' level 2 was published): the twelve commits replayed without conflict and unchanged (`git range-diff`: every commit `=`); the fixes' release touches neither the sidebar nor the top bar. On the replayed line: type-check, lint with no warnings, the whole unit suite: 609 files, 19,219 tests passed, 18 skipped. The pictures, the stylesheet comparison, the code read and the test by sight above were made before the replay; CI's browser list runs on the replayed line in the pull request.

## Where to look hardest

1. **The lift in `Sidebar.tsx`:** that `useSidebarItem` is the old inline code and nothing else. The digests pin the outcome; the diff shows the move.
2. **`MainLayout.tsx`:** that with the switch off every class name and every slot is today's.
3. **The same menu:** `Sidebar.sameMenu.test.tsx` is the proof that nothing can be reached in one frame and not in the other; its list of combinations is where a gap would hide.
4. **Layers:** the bell's panel, the phone drawer and its veil against the feedback button, toasts and open windows.

## Known limitations

- On the first load after signing in, a tester sees today's frame for a moment before the new one (the look is read from the profile; accepted until launch).
- In the new frame a top entry's description is the browser's own tooltip (the pointer resting on it); on a touch screen it is not shown.
- A list that loads more when its end comes into view can show one more row in the new frame, which leaves it a little more height.
