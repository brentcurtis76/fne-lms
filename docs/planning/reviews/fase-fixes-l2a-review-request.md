# GENERA fixes, level 2 (first part): places where a normal task stops

Branch: `fix/l2`. Base: `84eb3bccd` (main, 17 Nov 2026 07:45, pull request 190: the redesign's step 5a; level 1 of these fixes went live as pull request 189).
55 commits in a straight line on main, no merge commits: three fix phases (Gestor de Cambio, Espacio Colaborativo, Licitaciones), one small follow-up to level 1, one test-harness repair, this request.

## Approved scope

The owner approved the fix plan on 13 Nov 2026; its second level is "dead ends in normal use": a person does the normal thing and is stopped. This release holds the three phases of that level that needed no further decision from the owner, plus one decision he took on 16 Nov ("limit it to a consultor assigend to a school", about who reads a school's Plan de Migración). It changes no layout and adds no feature beyond what unblocks the stop. Wrong results, wrong document texts and the smaller findings are later levels and are not here.

## What changes

Four migrations, all additive (two new functions and one replaced, one `ALTER POLICY`, one partial unique index; no `DROP`, no `TRUNCATE`, no row deletion, no function that deletes rows).

**Gestor de Cambio** (`20261116179500`)
- «Duplicar» and «Editar (Nueva Versión)» inside the editor create the draft (they always failed for want of a name); a copy now keeps its indicators' visibility conditions, re-pointed to the copy; a copy that cannot be completed is not reported as made.
- «Publicar» counts an instrument's real indicators (it refused instruments whose prácticas had not been opened).
- Publication writes its snapshot and the instrument's flip to published in ONE transaction, in a server-only function (`publish_assessment_template`), and takes the next free version in its scope. Before, a publication that failed at its second step left a snapshot that blocked every retry, and two copies of one instrument could never both be published.
- «Panel de Resultados» works for admins (any school) and consultores (assigned schools), with a school chooser that follows the address; a consultor gets the same summary as the admin and the directivo (the route reads with the service role after its school check).
- «Plan de Migración» shows, when nothing is saved, what registros are really created with (GT) and can be saved as shown; a consultor sees it read-only.
- The owner's decision: a consultor reads a school's plan only when assigned to it (active, not ended), also straight from the database (`auth_is_assigned_consultor`, `ALTER POLICY ab_migration_plan_select`). Ended assignments no longer count in the school list, the results scope and the directivo permission checks.
- «Contexto Transversal» no longer shows a configured school as pending when its answer arrives late.

**Espacio Colaborativo** (`20261116179000`)
- A member can create a conversation again (nobody could since the access change of 6 Oct: the insert asked for the row back, which the read rule refuses). No rule changed. A first message that fails keeps the person's text and can be retried.
- Other people's names show (they were blank for everyone but admins): one function, `get_profile_cards`, returns first name, last name and picture address — nothing else — only for people the caller shares a community or school with, foundation staff, or anyone for admins. The rules on `profiles` are unchanged. The mention search no longer returns e-mails and offers approved people only; mentions accept accents, hyphens and dots and are not triggered by e-mail addresses.
- Reactions survive a reload; two sort options no longer empty a conversation; Enter sends; non-image attachments get their download control; another person's message appears in an open conversation at once; the workspace settings are offered only to people who can save them.
- A person's school is answered only to that person and to admins (`/api/users/<id>/school` answered any signed-in caller).

**Licitaciones** (`20261116179700`)
- The award cannot be confirmed (when the foundation wins) before the Carta de adjudicación has been generated, which used to lock the tender for good; a tender already locked can have its Carta generated.
- The Encargado gets the publication text again (the tender route returns five client fields — legal name, trade name, RUT, representative's name, commune — after its access check; the rule on `clientes` is unchanged), with the real deadline dates, also after confirming.
- A live tender cannot be created for a school without a linked client (every later step refused it); recording a past, closed tender is unchanged, on purpose.
- «Ajustar fechas» works after a reload; the proposal's access code is shown again to admins; a proposal generation interrupted more than 15 minutes ago no longer blocks a new one, and one running generation per tender is a unique index.

**Follow-up to level 1** (`20261116179800`): a visitor lists no file store. Level 1 closed listing in four stores; a check of the live system on 16 Nov showed `course-materials` still listable. The live function is replaced by the same body plus one rule. Public addresses are unaffected.

**Test harness:** `tests/e2e/notification-preferences-api.spec.ts` put its test page over the running dashboard; with this release's dashboard change the two tests failed in full runs. The harness is now a same-origin page served by the test itself. No assertion changed.

## Files, grouped by risk

- Highest: the four migrations; `lib/services/assessment-builder/publishTemplate.ts` (publication through the new function); `pages/api/directivo/assessments/school-results.ts` and `pages/api/licitaciones/[id].ts` (service-role reads after an access check); `pages/api/users/[userId]/school.ts`; `pages/api/community/search-users.ts`.
- Middle: `utils/messagingUtils-simple.ts`, `pages/community/workspace.tsx`, `lib/licitacionService.ts`, `pages/api/licitaciones/[id]/generate-propuesta.ts`, `generate-carta.ts`, the duplicate route, `lib/permissions/resultsSchoolScope.ts` and `directivo.ts` (assignment expiry).
- Screens: the tender page and step 6, the results panel, the plan page, the instrument editor, the message composer and thread modal, the person's page.
- Tests: four new pgTAP files (127 to 130), restated assertions in 086, 105, 125 and 126 (each the old rule stated as the new one, named in its commit), new unit and component tests next to each change.

## What changes for people

- Consultores: a results panel for their assigned schools (by address; no menu entry yet); the plan of unassigned schools is no longer readable; an ended assignment no longer gives access in Gestor.
- Everyone in a community sees co-members' names and pictures; nobody but admins sees more of a person's profile than that.
- Encargados: the publication text is back; confirming an award now needs the Carta first.
- Admins: a tender for a school without a client is refused at creation.

## Validation (on this branch, after it was replayed on `84eb3bccd`)

- Database tests (pgTAP): 93 files, 9,378 pass.
- Unit tests: 602 files, 19,067 pass, 18 skipped. Type check and lint pass.
- CI's mandatory browser tests, run locally with the CI script: 28 files, 339 pass, no skips, no second tries.
- Each phase was tested blind by a second model from scenario lists (real requests against a local database built from these migrations), read by a third model until approved, and used by sight in a browser.
- The whole release was then used by sight by the second model on 17 Nov (28 items: 25 pass, 1 not finishable by its tool). It found one defect, fixed in the last code commit: a newly created conversation was shown twice in the list until reload.

## Review focus

1. `publish_assessment_template`: lock order, the version it hands out, the one case where it overwrites a leftover snapshot row (never one an instance refers to).
2. `get_profile_cards`: who can learn whose name; four columns only.
3. The two routes that now read with the service role after an access check (school results; a tender's client).
4. `20261116179800`: the function body must equal the live one plus one rule.

## Known and left for later

- A consultor has no menu entry to the results panel (who sees which entry is the owner's call).
- A live message from another person shows its attached file only after the conversation is reopened.
- The Admin can still record a contract id that does not exist on a tender; tender notes reach the Encargado; the quotes list sends a person with permission to a missing page on a full reload: found while testing, next phases.
- The redesign's page-and-route inventory does not list the routes these fixes added.

No credentials, no personal data in tests (invented people only), no Production action by any agent.
