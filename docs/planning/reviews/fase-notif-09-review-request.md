# NOTIF-09 review request — N2-03 workspace message mentions and replies (r0 + r1 + r2)

- **Branch:** `fix/notif02-redo`
- **Base:** `29ee273afc79d33da62b0c4887b74ad52d9d1665`. The order forbids commits, so this is 0 commits on top of the base. The PM commits.
- **Run:** `~/Projects/pm-workflow/runs/NOTIF-09`. The executor reports are `executor-report-r0.md`, `executor-report-r1.md` and `executor-report-r2.md`.

## Objective and scope (order r0)

Workspace message mention and reply bells move from browser writes to a server-verified path. Sending and replying behave as before. For a persisted message, the server checks:
- the actor;
- the workspace and thread;
- the reply author;
- which mentioned users are eligible.

A retry or reconciliation by message id fills in missing bells without creating duplicates. N2-01 idempotency and the N2-02 category/type/link/email behavior are preserved.

**Out of scope:**
- group and quiz writers (N2-04);
- retiring the legacy bell (N2-05);
- outbox, migrations, UI redesign and release.

**r1 (order r1, finding R0-F1):** a `message_sent`/`user_mentioned` bell opens its thread directly, in the community that owns it, also for a recipient of two communities. A missing, malformed or inaccessible thread link opens no thread, selects no foreign community and shows a notice. Section-only links and manual thread selection are unchanged.

**r2 (order r2, finding R1-F1):** on one mounted page, clicking the same bell again reopens its thread after the user closed it or visited another section. The thread-community helper logs only a fixed message (advisory A1).

## Design

- **`sendMessage`** (`utils/messagingUtils-simple.ts`): it no longer inserts into the legacy `notifications` table. After the message is saved, it POSTs `{message_id, workspace_id, mentioned_user_ids}` with the caller's bearer token. A rejected or failed request is logged by status only, and the message stays sent.
- **`POST /api/community/workspace-message-notifications`** does these checks in order:
  1. auth → 401;
  2. forced-password gate;
  3. UUID validation, with at most 50 mentions → 400;
  4. `notifyWorkspaceMessage`.
- **`lib/services/workspace-message-notifications.ts`** reads everything with the service role:
  - **Message:** it must exist and not be deleted (else 404), the caller must be its author (else 403), and it must be in the posted workspace (else 400).
  - **Thread:** it must belong to that workspace (else 400).
  - **Actor:** `can_access_workspace` must pass (else 403).
  - **Reply parent:** it must exist and be in the same thread (else 400, and nobody is notified).
  - **Mentions:** these are the rows already in `message_mentions`, plus claimed users whose composer handle (`@First_Last`, the same rule as `MessageComposer`/`toMentionSuggestion`) appears in the saved text. Each one must pass `can_access_workspace`. Newly verified mentions are recorded in `message_mentions`, so a repeat by message id alone re-derives the same audience.
  - **Reply author:** gets only the reply bell (`message_sent`), even when also mentioned. The author never gets a bell.
  - **Failures:** any read or access-check error returns 500 and notifies nobody. A trigger failure returns 500 after the other bells are created. The message is never touched.
- **Catalog** (`lib/notifications/catalog.ts`):
  - `message_sent` and `user_mentioned` link to `/community/workspace?section=messaging&thread=<id>` when the payload names a thread.
  - `user_mentioned` falls back to the occurrence `message_id` when there is no `mention_id`, so each bell is keyed by (event, message, recipient).
  - Post mentions and `/api/messaging/send` payloads carry no `thread_id`, so their links and keys do not change.

- **Thread deep link (r1)** (`pages/community/workspace.tsx`, `getThreadCommunityId` in `utils/messagingUtils-simple.ts`):
  - `?thread=<id>` must be a UUID. Under the caller's own session, the page reads only the thread's `workspace_id` and that workspace's `community_id`; the community must also be in the caller's `availableCommunities`. Otherwise the page keeps its usual default community and shows a dismissible `role="alert"` notice.
  - A resolved link selects its community *instead of* the default, so the default community's messaging never loads. The messaging tab then opens the thread only if it is in that workspace's own thread list (`getWorkspaceThreads`); if not, the notice shows.
  - The first link of a page load is resolved in `initializeWorkspace`. A link followed while the page is open (the bell uses `router.push`) is resolved by a `routeChangeComplete` listener, which also shows the messaging section and switches community through the existing `handleCommunityChange`.
  - **r2:** the listener replaced r1's effect on `query.thread` and its last-handled ref. The router fires `routeChangeComplete` for every push, including one to the URL it already holds, so every bell click is handled again. `handleSectionChange` still rewrites the URL with `history.replaceState`, which is left unchanged. `getThreadCommunityId` logs `Thread community lookup failed` instead of the caught error.

## Files, grouped by risk

- **High:**
  - `lib/services/workspace-message-notifications.ts` (new): the audience derivation and the fail-closed paths.
  - `pages/api/community/workspace-message-notifications.ts` (new): auth and validation.
- **Medium:**
  - `pages/community/workspace.tsx` (r1, r2): thread-link resolution, the per-navigation listener, community choice, the notice, and the messaging tab's target selection.
  - `utils/messagingUtils-simple.ts`: legacy writes removed, server request added, used by both send callers; r1 adds `getThreadCommunityId`.
  - `lib/notifications/catalog.ts`: the thread link and the occurrence fallback.
- **Tests:**
  - `__tests__/api/community/workspace-message-notifications.test.ts` (new, 28; r2 adds the helper's no-leak test);
  - `__tests__/lib/workspace-message-notifications.test.ts` (new, 13, real NotificationService with the unique idempotency key enforced);
  - `tests/e2e/messaging-notifications.spec.ts` (+6 N2-03 tests; r1 changed the two D6 tests to assert direct opening and added the r1 D4 test; r2 added the repeat-bell test and console checks in r1 D4).

## Test evidence

- **Focused Vitest:** 40 passed. Mutation checks are in `RUN/evidence/mutations.log`: each of these mutations fails at least one test:
  - reply-author dedupe removed;
  - content-handle check removed;
  - recipient access check removed;
  - author check removed;
  - trigger-failure status removed;
  - parent-thread check removed.
- **Full gates:** see the executor report (type-check, lint, `npm test`, build, `test:db`, `guard:migrations`).
- **Scoped Playwright:** the scoped run passed 12/12 on the owned `notif09isolated` stack:
  - The real reply plus mention went through the composer at 1366×768. The first notification request was failed in the browser; the message stayed sent.
  - The repeat by body, and then by id alone, each returned `notified: 2`, leaving exactly 2 bells, no legacy rows and 1 `message_mentions` row.
  - Denials: anonymous 401, outsider 403, missing message 404, foreign workspace 400.
  - The recipient's bell opened the thread URL on desktop and mobile. The mobile reply gave the author exactly one reply bell. The outsider saw none.
- **r1 scoped Playwright:** 13/13 (`RUN/ui/20260928-184433-1729384`):
  - Desktop: `replicada` belongs to both owned communities and its default is the other one (asserted first, without a link). Its bell, clicked on the open workspace page, shows `Mensajería de Comunidad N09 <run>` with the thread open, the composer and the saved reply, with no list click. The other community's thread and message are absent.
  - Mobile: `miembro`'s bell, clicked from outside the workspace page, opens the thread directly; the reply still sends.
  - r1 D4: `externa` with a link to the foreign thread, and `miembro` with a missing and a malformed id, each see the notice, their own community's list, and no composer or foreign content; the notice dismisses.
- **r2 scoped Playwright:** 14/14 (run directory in `executor-report-r2.md`). On one mounted page (a `window` marker survives), `replicada` opens the bell from its default community, closes the thread, clicks the same bell (the thread reopens), switches to Documentos, and clicks it again (the thread reopens in messaging, and the URL is the thread link). No browser console line contains a fixture address or the password, in this test or in r1 D4. With r1's page logic restored, this test fails at the reclick after the section change (`RUN/evidence/mutations.log`).
- **r2 focused Vitest:** 41 passed. The new test makes the helper throw an error containing a synthetic address and credential; the helper returns null and logs only the fixed message. It fails with r1's raw-error log.

## Scrutinize hardest

1. **Mention verification by handle:** the check matches the composer's `@First_Last` handle against the saved text. Two members with the same name would both qualify if one is claimed. A name the client regex cannot express (accents) was never sent by the client, and still is not.
2. **Recording in `message_mentions`:** there is no unique constraint, so concurrent repeats could insert duplicate rows. Bells cannot duplicate, because the key is message plus recipient. This is the first writer to the table, and it has no readers.
3. **Mentions now email:** `user_mentioned`/`message_sent` follow the catalog's `community` email default (immediate) and the kill switch. The legacy browser writes never emailed. This is consistent with post mentions and N2-02, but it is new for workspace messages.
4. **The reply bell reuses `message_sent`:** its title is "Mensaje de X" and its copy is generic. No new event type or registry entry was added, which kept the unit at 8 files.
5. **Status semantics:** a partial trigger failure returns 500 even though some bells were created. The repeat fills in the missing ones.

6. **Thread deep link (r1):** trust rests on `availableCommunities` plus the workspace's own thread list, not on the URL. `message_threads` has a pre-existing `SELECT USING (true)` policy, so the id lookup can read any thread's `workspace_id`; the `community_workspaces` read is RLS-limited and the community check is client-side. No thread title or content is read before the thread appears in the caller's own list. Also check the same-page path: two async `loadWorkspace` calls can still race when switching community, as they already could with the existing manual switch.
7. **Per-navigation listener (r2):** it handles any in-page navigation whose URL has `thread`, including back/forward to a thread URL. It re-registers when `workspaceAccess` or `selectedCommunityId` changes, and it does nothing before access has loaded. A page-load link is handled by `initializeWorkspace`. The router fires no `routeChangeComplete` for a hard load. On a client-side arrival from another page, the event fires before access has loaded, so the listener is not registered yet. If both ever ran, they would resolve the same target twice, which is harmless.

## Known limitations / deferred

- **Deep-link edges:** an archived thread is not in the list, so its link shows the notice. The r1 limitation (re-clicking the same bell did nothing) is fixed in r2. `handleSectionChange` still bypasses the router, so `router.query.section` can be stale; the listener does not rely on it.
- **Page unit test not collected:** `__tests__/pages/community/workspace.mention-scope.test.tsx` is never collected by `vitest run` in this checkout ("no tests", even when named directly). This predates this unit and is out of scope. Its router mock has no `events`.
- **Pre-existing RLS:** `message_threads_select_workspace` lets any authenticated user read thread rows. The page does not rely on it; this is a DB-owned follow-up.
- In the thread view, another member's message can show its author as "Usuario" (screenshot `n2-03-desktop-replied-thread.png`). This comes from the existing profile read in `getWorkspaceMessages`, which this unit does not change.
- There is no scheduled reconciliation job. Reconciliation is on demand, by message id, through the route.
