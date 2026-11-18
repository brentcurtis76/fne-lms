# RD-6B — platform redesign, phase 6, Mi Panel, steps B and C: the new Mi Panel and its four windows, behind the switch. Review request

- **Branch:** `feat/rd-panel-popups` · **Base:** main at `7f6ee8729` (RD-6A published, pull request 198) · **Commits:** 34 (6B: the pins of the panel's pieces; their label and data code given one copy; the new view; its tests; three send-backs. 6C: the pins of the four windows; their logic given one copy; the new markup; the alert turned into a toast; its tests; two send-backs. One send-back after the test by sight. One after the blind test, one after the browser test. This record; the inventory rebuilt)
- **Part of the platform redesign** (plan phase 6, "area by area"; first area: Mi Panel). The second and last release of the area; RD-6A was its groundwork.
- **Built the new way:** builder agents from written briefs, two independent code reads (Sol), a blind test and a browser test by an independent tester (Astra), a test by sight in a real browser, the lead's own runs of every check; the lead session wrote no product code.

## Objective and scope

An account that chose «Diseño nuevo (en construcción)» on «Apariencia» (accounts marked «Tester QA» only) gets a **new Mi Panel**, drawn as the approved mock-up: a dark welcome band with «Mi Perfil» at every width; two columns (what I am doing: «Continuar Aprendiendo», «Mis Rutas de Aprendizaje», «Mis Cursos Abiertos», «Próximos Cursos», «Propuestas de Cursos», «Mis Logros»; beside it: my community, the three numbers, news, videos); cards that open with a button «Detalles» and no longer under the pointer; arrows on every row that scrolls; grey placeholders while it loads; and the panel's four windows (the community's settings, a member's profile, the course proposal form, «Eliminar Propuesta») on the shared pieces. **Everybody else gets today's Mi Panel, unchanged.** What a person gets (which parts, which courses, where a click leads) is decided once, in `usePanel` (RD-6A); a view only draws.

**In:**
- **The new view** (new files under `components/panel/`): `PanelNuevo.tsx`, `PanelSection.tsx`, `CourseCardNuevo.tsx`, `RouteCardNuevo.tsx`, `UpcomingCardNuevo.tsx`, `ProposalsNuevo.tsx`, `BadgesNuevo.tsx`, `CommunityCardNuevo.tsx`, `PanelSkeleton.tsx`. `pages/dashboard.tsx` picks the view by the look, in the same slot, after the hook; the frame and the windows stay outside the choice.
- **One copy of the labels and rules both views use** (moved out of today's pieces word for word, imported back): `components/courses/courseCardText.ts`, `upcomingCardText.ts`, `components/learning-paths/routeCardText.ts`, `components/badges/badgeCardText.ts` and `useBadges.ts`, `components/course-proposals/proposalCardText.ts` and `useCourseProposals.ts`, `components/panel/memberText.ts`. Today's pieces (`NetflixCourseCard`, `UpcomingCourseCard`, `LearningPathCard`, `BadgeCard`, `BadgesSection`, `CourseProposalCard`, `CourseProposalSection`, `PanelClasico`) now call them and draw what they drew: pinned first, by digests made by the pieces as they were.
- **The four windows:** each one's logic in a hook or helper (`components/community/useWorkspaceSettings.ts`, `memberProfileText.ts`, `components/course-proposals/useCourseProposalForm.ts`), today's markup where it was, and a new markup on the kit's `Dialog` and `ConfirmDialog` (`WorkspaceSettingsNuevo.tsx`, `MemberProfileNuevo.tsx`, `CourseProposalFormNuevo.tsx`, `ConfirmDialogNuevo.tsx`) that the same component returns under the new look, with the same props. The community workspace page, which opens the same settings window, gets the new one under the new look too.
- **`hooks/usePanel.ts`:** two additions that only build an address (`courseAddress`, `learningPathAddress`: the same templates the handlers push), so that cards are real links. No data call added.
- **The new footer** (`components/layout/FooterNuevo.tsx`): its right end kept clear of the round feedback button at every width (a leftover of RD-5b).
- **`tests/e2e/look-panel.spec.ts`** (new, in CI's list through `scripts/ci/e2e-mandatory.mjs`).

**ONE change that reaches everyone, on purpose:** when deleting a course proposal fails, the message (the server's own, or «Error al eliminar propuesta») now arrives as an error toast instead of the browser's own `alert()` box (approved with the mock-up on 13 Nov 2026). The words are the same. It is the only functional change in `useCourseProposals.ts` (one line, its import).

**Decided differences of the new look** (each named in a test):
- A card's details open with «Detalles» (today: the pointer resting on the card). The action («Continuar» / «Comenzar») is always visible.
- The percentage is written beside a course's progress bar (the mock-up shows it; today there is only the bar).
- «Mi Perfil» and «Nueva Propuesta» are offered at phone width too.
- In the new windows Escape and a click outside close the window unless it is saving (today the settings window closes on neither); while a window is saving or sending, its X is not drawn (the kit's rule: a window that cannot be closed shows no X).
- The member's window does not draw the three rows that never fill in (approved with the mock-up).
- A card's title (course, upcoming course, route, proposal) runs to three lines before it is cut, and is whole while «Detalles» is open; today's cards cut theirs at two lines of a narrower type. ONE rule, exported from `components/panel/PanelSection.tsx`.
- In the welcome band «Mi Perfil» takes a row of its own under the text when the avatar, the text and the button do not fit side by side (below about 445 px of window).
- When the new proposal form refuses a submit, it brings its message into sight inside the window (in a short window the message sits at the top of the form and could be out of sight; today's form is not changed).

**Out, on purpose:** any other screen; the kit itself; `middleware.ts`; the Course Review session's files; the oddities of today's panel (they stay, pinned; the ones found on the way are in the private notes).

## Files, grouped by risk

**Higher — today's pieces, which everyone gets, were edited to share their labels and rules**
- `components/courses/NetflixCourseCard.tsx`, `UpcomingCourseCard.tsx`, `components/learning-paths/LearningPathCard.tsx`, `components/badges/BadgeCard.tsx`, `BadgesSection.tsx`, `components/course-proposals/CourseProposalCard.tsx`, `CourseProposalSection.tsx`, `CourseProposalModal.tsx`, `ConfirmDialog.tsx`, `components/community/WorkspaceSettingsModal.tsx`, `MemberProfileModal.tsx`, `components/panel/PanelClasico.tsx`: an expression replaced by a helper that returns something else for some input; a hook's state or effect out of order. These pieces are used on other pages too (the course lists, the learning-path pages, the badges page, the community workspace).
- `pages/dashboard.tsx`: the choice of view.
- `components/course-proposals/useCourseProposals.ts`: the alert turned into a toast.

**Medium — only accounts with the new look**
- The new view's files and the four new markups.

**Lower**
- `components/layout/FooterNuevo.tsx` (the new frame only); the tests; `scripts/ci/e2e-mandatory.mjs` (one line: the new browser test joins the list); this record; the inventory.

## Tests

- **Pins of today's pieces, made before they were edited** (`__tests__/components/panel/*.pin.test.tsx` with their `*.pin.digests.json`, through `__tests__/helpers/pin.ts`): the cards (16 cases), the badges (10), the proposals (14), the settings window (17), the member's window (10), the proposal form (12), the confirmation (8). A pin without its digests fails by name. One case was changed on purpose: the failed deletion (the toast). RD-6A's pin of the whole panel (`__tests__/pages/dashboard.clasico.test.tsx`) passes with no digest changed.
- **The same panel in both views** (`__tests__/pages/dashboard.samePanel.test.tsx`): over 18 accounts and states, what a person gets is compared view against view: the parts, every text, every picture's source, every link and where it leads, every button and what its handler receives, with cards opened in both.
- **The same window in both looks** (four `*.samePopup.test.tsx`): the texts counted, each help line's tie to its control, each button enabled, disabled, busy or absent; the decided differences are named exceptions with their reasons.
- **The new view's own tests** (`dashboard.nuevo.test.tsx`, `CourseCardNuevo`, `CommunityCardNuevo`, `PanelSection`, `ProposalsNuevo`, `popupsNuevo`, `FooterNuevo`), among them: no control of the new view sits inside a parent that would cut its keyboard ring; the kit's contrast test with the new pairs.
- **`tests/e2e/look-panel.spec.ts`** (4 tests, in CI's list): a tester gets the new panel with the same sections, cards and rows work, the community opens, today's panel comes back; no footer link under the feedback button at 1,024 and 390 px; a community manager opens a member's profile and the settings, renames the community and puts the name back; the admin creates, edits and deletes a proposal through the new windows.

## Evidence (local, 17 and 18 Nov 2026)

Every figure below is of this branch's final code. It was proven on 18 Nov on top of the fixes' release and RD-6A as they were proposed; main has the same content file for file (the trees are equal), and this branch's final commit has the tree of the commit that was proven.

- **Stylesheet with the switch off:** equivalent to main's (4,279 declarations, the same in both files once each named value is replaced by what it holds).
- **Pictures, switch off** (every screen for every role at two widths, main then this branch, same stack and data, 18 Nov): **IDENTICAL, 3,040 of 3,040 visits the same**; 1,158 pictures each, none unstable, no error; one picture counted as the same with rendering noise only (11 pixels, one shade apart). This walk also stands for RD-6A on this base.
- **The panel for tester accounts with today's look** (every role, two widths): IDENTICAL to main's, 20 of 20.
- **Today's look behind a click or the pointer** (41 states, the three windows among them), pictures and texts: IDENTICAL to main's.
- **Nothing lost in the new look:** for all nine roles at both widths every heading and every line of text of today's panel is in the new one; only in the new one: «Detalles», «Comenzar» always visible, the percentage, «Mi Perfil» and «Nueva Propuesta» at phone width.
- **The new view by sight:** the lead's pictures at 1,366, 1,024, 768, 390 and 320 px (no page wider than its window, one yellow button at most, nothing under the feedback button, a keyboard walk of every control); a test by sight in a real browser (30 items passed; three real finds fixed: no keyboard ring on the community bar, titles cut in the narrow column, a proposal just sent out of sight); a blind test by an independent tester with her own browser at seven widths (today's design unchanged with zero differing pixels; nothing lost for any of six accounts; the four windows 9 of 9; two real finds fixed: «Mi Perfil» over the welcome line at 320 px, card titles cut where today's are whole); the same tester's pass in a real Chrome with pointer, keyboard and touch (Part A 3 of 3, the new panel 22 of 25, the phone 6 of 7, the windows 7 of 9; one find fixed: the proposal form's message out of sight in a short window; the others are the same in today's design or the title rule as decided).
- **Two independent code reads** (Sol): the new course card drew the lesson line under the wrong condition (fixed, with a test); the pins' digest files were not in the repository (fixed; a missing file now fails by name); the comparison tests let too much through (rewritten as above). No difference in today's look was found at any point.
- **Gates:** type-check, lint with no warnings, the whole unit suite: 672 files passed and 1 skipped, 19,992 tests passed, 18 skipped.
- **CI's browser list** against a production build on a fresh local stack made from main: 348 passed, none failed. The panel's own browser pin tests (today's design, not in CI's list): 35 passed.

## Where to look hardest

1. **Today's pieces:** each edited line against the helper it now calls; the helper must return, for every input, what the expression returned (the stray «0» of a course with zero lessons included).
2. **`useCourseProposals.ts`:** state, effect and handlers must be the section's own, in order; the one changed line is the toast.
3. **The four window components:** hooks called once above the choice of markup; today's markup untouched below it.
4. **`pages/dashboard.tsx`:** the hook call unconditional; both views in the same slot; the windows after the view.

## Known limitations

- A look that arrives AFTER the panel has drawn (rare: it normally arrives while the panel loads) mounts the new view's parts anew: the badges and the proposals are read a second time, a proposal form opened in that first second would close, and a window already open loses the focus's way back to what opened it. Accepted: lifting those reads above the choice of view would change when today's panel asks for them; the switch goes away at launch.
- Titles, labels and placeholders are written in both markups of a window and in both views. Today's markup is frozen by its pins and is deleted in phase 8; the comparison tests hold the two together until then.
- On a full reload an account with the new look sees today's frame with its spinner for a moment before the new frame's placeholders (accepted until launch on 13 Nov 2026).
- The lesson line of a course card cannot be reached through a browser on the panel (the panel's loader reads no lesson count); unit tests hold it.
- `tests/e2e/panel-pin.spec.ts` is still not in CI's list.
