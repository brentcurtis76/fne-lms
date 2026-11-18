# GENERA fixes, second release of 18 Nov: the workspace itself, a consultor's entry, and Contratos

Branch: `fix/l2i`. Base: `4821ab01c` (main, 18 Nov 2026 17:04, pull request 200: the public website's adjustments; before it pull request 199, the redesign's release 6B, 15:52, and pull request 198, its release 6A; the six fix phases of 17 Nov went live as pull request 197).
42 commits in a straight line on main, no merge commits: 4 for F12e, 15 for F12c, 5 for F10a, 15 for F10b, 2 that steady two end-to-end tests, and this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026 (three levels: exposed, dead ends in normal use, wrong money or data) and answered the product questions of these phases on 17 Nov; each answer is quoted in the phase's brief. This release holds four phases of level 2 built on 18 Nov.

## What changes

**F12e — a consultor's entry to Espacio Colaborativo follows the assignment; mentions (findings N28, EC-V5, N97)**
- `supabase/migrations/20261118101000_consultor_workspace_entry.sql`: `auth_consultor_assigned_school_ids()` (definer, about the caller only: the schools of the caller's current assignments — active, started, not ended — while they hold an active consultor role), and ONE additional read rule on `community_workspaces` (`consultants_read_assigned_school_workspaces`): a consultor currently assigned to the school of a workspace's community reads that workspace's own row. No existing rule changes.
- `lib/consultor-assigned-schools.ts`; `middleware.ts` (the `/community/workspace` block only): a consultor with a current assignment passes, any other consultor is sent to the panel as before; `utils/workspaceUtils.ts`: a consultor's communities are those of the assigned schools (a consultor without assignment who is a member of a community enters as a member); `pages/api/community/ensure-workspace.ts` and `members.ts` accept a consultor assigned to the community's school (the member list they get is a plain member's: no e-mails, approved people only).
- `pages/api/community/search-users.ts` takes `workspace_id`: admin, member of that community or assigned consultor; lists that community's approved people (same fields, no e-mail); without the parameter the previous path. `components/feed/CreatePostModal.tsx`, `FeedContainer.tsx` send it.

**F12c — the workspace itself (findings EC-V1, N92, N127, EC-V4, EC-V6, N159, N154, N163)**
- `supabase/migrations/20261118100000_workspace_rename.sql`: `rename_community_workspace(workspace, name)` (definer): an admin, or a caller with an active role row in the workspace's community that is not a consultor row, sets `custom_name` (1 to 100 characters after stripping; at least one letter or digit; no control, direction, zero-width or filler characters) and `updated_at`, nothing else. The table's own rules are unchanged (a member's direct update still changes nothing).
- `components/community/useWorkspaceSettings.ts` (the window's logic since pull request 199), `components/community/WorkspaceSettingsModal.tsx` (today's look), `components/community/WorkspaceSettingsNuevo.tsx` (the new look), `lib/services/communityWorkspace.js`, `pages/community/workspace.tsx`: every member and admin gets the gear; the name always goes through the function and only when the field changed (saving a picture alone no longer writes the name); after a save the window reads the row back and reports the stored values; the picture part only for admins and the community's manager; a long name breaks inside the header and the gear keeps its place.
- `pages/community/workspace.tsx`: the community chooser for a member of several communities (documents and meetings tabs start afresh per community; a switch drops a stale `thread` from the address); the start-up runs once per signed-in user instead of on every navigation; the meetings list reloads after a successful finalise.
- `utils/meetingUtils.ts`, `components/meetings/MeetingDetailsModal.tsx`: a meeting's author, facilitator, secretary and finaliser come from profile cards, and no e-mail is requested; `utils/documentUtils.ts`: «Subido por» from profile cards.

**F10a — annexes and the PDF import (findings GES-2.5, GES-2.9, GES-2.3)**
- `components/contracts/AnnexForm.tsx`: «Nuevo Anexo» works for a manual or imported contract (listed by its description; the annex is stored as manual with that description); the save refuses a cuota without date or amount instead of dropping it; in edit mode no way back to another contract. `pages/contracts.tsx`: «Editar» on an annex opens the annex form. `lib/annex-template.ts`, `pages/contract-print/[id].tsx`: the annex's text names a manual parent by its description.
- `pages/api/contracts/extract-pdf.ts` (a 4 MB body), `components/contracts/ContractPDFImporter.tsx` (2,9 MB, said and enforced), `lib/contracts/extractionError.ts` (a clear message for a 413).

**F10b — the contract form (findings GES-2.1, GES-2.2, GES-2.6, GES-2.7, GES-2.8, GES-3.1)**
- `components/contracts/ContractForm.tsx`, new `lib/contracts/client-row.ts` and `lib/contracts/cuotas-math.ts`: the client row is built from an explicit column list (a contract with a brand-new client saves); «Horas contratadas» exists (choosing a programme sets it, the admin can type over it; locked once a distribution of hours exists; loading a contract never fills it); cuotas are split and compared in whole units of the currency and amounts with more decimals than the currency are refused; «Guardar Borrador» checks before any write and answers inside the page; a manual or imported contract opens as manual; an edit keeps the client's school. `components/contracts/ContractDetailsModal.tsx`: «Horas contratadas» beside «Horas del programa». No migration.

**The port onto the redesign's workspace-settings hook (pull request 199)**
- Pull request 199 moved the settings window's state and save handler into `components/community/useWorkspaceSettings.ts` and added a second markup for the new look. Three of this release's commits changed that window and were carried over by hand (each says so in its message): the behaviour lives in the hook once, and what a person sees is in BOTH markups (the optional `canChangePicture` prop and the hidden picture part, the line «La imagen la cambian los administradores y el gestor de la comunidad.», «Guardar cambios» disabled when nothing changed or the name is empty). The other 38 commits are patch-identical to the line proven on the two previous mains.
- `__tests__/components/panel/workspaceSettings.pin.digests.json`: 16 of the redesign's 17 digests are re-accepted ON PURPOSE, by that test's own procedure. Every difference is one of four intended behaviours: the added line; the save disabled when nothing changed; what a save sends (the name through the rename function only when it changed, the picture update without the name); the read-back before `onUpdate` and `undefined` for "nothing stored". Case W10 («saving: the spinner…») no longer reaches the saving state, because its scenario saves an unchanged form; the saving state stays pinned in `workspaceSettings.samePopup.test.tsx` and `popupsNuevo.test.tsx`, whose two saving cases now choose a picture first. The fake services of those three test files gained the two service methods the save now calls.
- New: `__tests__/components/community/WorkspaceSettingsModal.rename.nuevo.test.tsx`, the window's 18 cases in the new look.
- The panel's callers (`hooks/usePanel.ts`, `components/panel/PanelClasico.tsx`, `CommunityCardNuevo.tsx`) are unchanged: each falls back to the community's own name for an `undefined` custom name, and only an admin or the community's manager gets the panel's gear.

## Files, grouped by risk

- Highest: the two migrations; `middleware.ts`; `pages/api/community/search-users.ts`, `ensure-workspace.ts`, `members.ts`.
- Medium: `pages/community/workspace.tsx`, `utils/workspaceUtils.ts`, `components/community/useWorkspaceSettings.ts` with its two markups, `components/contracts/ContractForm.tsx`, `components/contracts/AnnexForm.tsx`, `utils/meetingUtils.ts`.
- Low: `lib/contracts/*`, `lib/annex-template.ts`, `pages/contract-print/[id].tsx`, `components/contracts/ContractDetailsModal.tsx`, `ContractPDFImporter.tsx`, `pages/api/contracts/extract-pdf.ts`, `utils/documentUtils.ts`, `components/feed/*`.
- Tests: database tests 135 (rename, 67 assertions) and 138 (consultor's entry, 38); new unit tests for every route, helper and screen above (the contract form had none before).

## What changes for people

- Every member of a community can rename its workspace; saving only a picture no longer changes the name; a person in two communities chooses between them; moving inside the page no longer reloads it or loses typed text; a finalised meeting shows as completed at once; documents and meetings name people.
- A consultor with a current assignment to a school enters «Espacio Colaborativo» and sees that school's communities; any other consultor lands on the panel. An admin can mention people in a post.
- An admin can create a contract with a new client, give it hours, compute cuotas that the form accepts, save drafts whole or not at all, make and edit annexes (also of manual contracts), and import PDFs up to 2,9 MB with an honest message above that.

## Validation (on the 41 commits before this request, `d9c4bad55`)

The line was proven on the commit that pull request 200 then published (`6fa0d8937`, as `5212ba554`); main's tree after that release is identical to that commit's, and this branch's tree before the request is identical to the proven one (`15d744e1…`).

- Database tests: 100 files, 10,072 pass.
- Unit tests: 698 files passed, 1 skipped; 20,227 tests pass, 18 skipped (the redesign's panel tests of pull requests 198 and 199 among them, with the 16 re-accepted digests). Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script: 31 files, 348 pass, no failures, no second tries (the redesign's `look-panel.spec.ts`, in which a community's manager renames the community from the new panel, among them).
- The port: read by a second model (Sol) against the line proven before it, path by path — approved, no change asked; the settings window used by sight in a browser in both looks, as a plain member and as the community's manager, from the workspace page and from the panel (11 of 12 checks pass, none fails; the twelfth, a narrowed window, could not be staged).
- The same 38 unported commits were proven twice before, on the mains of pull requests 197 and 198 (database tests, unit suite, CI's browser tests each time).
- The publisher's static check, run in memory on the two migrations of this release: no refusal, no note. `.pm-publish/solo-preflight.json` is emptied by this request's commit: the function it declared went live with pull request 197 and this release has no function that deletes rows.
- Each phase: read by a second model (Sol), tested blind with real requests by another (Astra), and used by sight in a browser; the defects found were sent back and re-checked. The reports are in the fix run's own folder, outside this repository.
- The two test-only commits: `tests/e2e/finance-messaging-access.spec.ts` and `tests/e2e/urgent-anonymous-current.spec.ts` reloaded the page before a save had left the browser (the first took the text in the message box for the sent message); each now waits for the save. Five runs in a row of each file alone, without second tries, pass.

## Review focus

1. `20261118101000_consultor_workspace_entry.sql`: the additional read rule — exactly the workspace's own row, exactly for a currently assigned consultor; nothing inside the workspace changes.
2. `middleware.ts`: the extra lookup runs only for a non-admin without a community who holds a consultor role, and fails closed.
3. `pages/api/community/search-users.ts`: the new branch reads with the service role after its gate — can any caller get people of a community they may not see, or a field the old path did not return.
4. `20261118100000_workspace_rename.sql`: writes only the name; who is refused; the name's character rules.
5. `components/contracts/ContractForm.tsx`: the three write paths (create, update, draft) build the client row from one helper and carry the hours; nothing is half-written when a check fails.
6. `components/community/useWorkspaceSettings.ts` and the 16 re-accepted digests: is each difference one of the four intended behaviours, and nothing else.

## Known and left for later

- A consultor WITHOUT a current assignment still reads a workspace's own row (name, picture) by a direct request through the older rule that follows the school on the role row, and what a consultor reads inside a workspace still follows that school: the phase "the assignment decides everywhere" narrows these together.
- A very long workspace name without spaces still widens the page's title strip (`components/layout/FunctionalPageHeader.tsx`, the redesign's).
- The redesign's pin case W10 keeps its title although it no longer shows the saving state (see the port above): for the redesign's session to rename or re-stage. The settings gear's hidden label says «Editar nombre e imagen de la comunidad» also for a member who can change only the name.
- CI's unit job runs close to its 20-minute limit (14 to 18 minutes on pull requests 197 to 199; cancelled at the limit on pull request 200); this release adds about 280 tests. If it is cancelled at the limit, it is a re-run, not a defect.
- A person who manages one community and belongs to another is offered only the first; a person with both a consultor and a member role gets no gear although the database lets them rename.
- On a contract made from a licitación, a typed number of hours can be put back to the programme's if the page reloads its lists while the form is open (`pages/contracts.tsx` reloads on navigation); the draft's three writes are not one transaction; the database itself does not check a contract's numbers against an admin's direct request.
- The client's legal fields stay obligatory in the database and amounts of 100 million pesos or more cannot be stored: both need a column change that migrations may not make (waiting for the owner's decision).
- An annex's hours are not built yet (waiting for the owner's answer).
- Everything listed under "Known and left for later" in the request of 17 Nov (`fase-fixes-l2d-review-request.md`).

No credentials, no personal data in tests (invented people only), no Production action by any agent.
