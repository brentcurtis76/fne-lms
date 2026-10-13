# NOTIF-23 (N5-02) — review request: flag-selected dual delivery path (current-main rebuild)

- **Branch:** `fix/notif23-main` · **base/HEAD:** `6e1816a639004427a5f922cd0f493f2ae3f56dc3` (accepted NOTIF-22 rebuild `7c4d3487d`
  atop main `1e19b8496`) · **commits:** 0 (uncommitted working tree; the PM commits on acceptance). The tree also holds the PM's own
  ledger edit (`docs/ledger/notifications.md`), not part of this unit. Status: **local rebuild candidate, review pending** (PM
  independent review and PM genuine CUA not yet done). `origin/main` later moved to `42997ec65` with documentation-only PASANT-04
  changes; nothing here depends on them and no rebase was done.
- **What this rebuild is:** the reviewed N5-02 change (historical commit `ba819f1a6`, rounds r0–r6) redone on current main.
  Round 7 restored ten files byte-identical to that commit (its report said twelve; ten is correct). Round 8 repairs the
  round-7 finding R7-F1 (group-thread messages failed with the flag on) and so changes four of them (migration, pgTAP 106,
  catalog, dispatch test); six stay byte-identical: `lib/notificationService.ts`, `pages/api/quiz-reviews/notify-pending.ts`,
  `pages/api/cron/monitor-enrollments.ts`, `vercel.json`, `pages/api/cron/notification-emails.ts`, `pages/api/cron/email-digest.ts`.
  Also different for a current-main reason: `pages/api/messaging/send.ts` (main's `can_access_message_thread` check kept), the
  source-context test (its fake answers that RPC) and the browser spec (cleanup asserts zero survivors, advisory N23-N2).
  Round 8 adds `lib/email/notification-access.ts`, `lib/services/workspace-message-notifications.ts` and its test.
- **Objective (plan rev 6 / ledger N5-02):** "Flag-selected dual path. Producers go through one dispatch point: with
  `NOTIFICATION_OUTBOX_DELIVERY` on they call `enqueue_notification` and the worker sends; with it off or unset they keep the
  existing sync `sendImmediateEmail`, unchanged. The worker and digest crons are registered in `vercel.json` here; they do nothing
  while the flag is off. Tests cover the production-default state (flag unset: sync sends, no outbox rows) and flag on (outbox only,
  no double send). The sync path is not removed." Because the worker fails closed on a record-bound row without its source row,
  "enqueue" is a source-aware RPC that writes the outbox row and its typed source in one transaction (N5-02a).
- **In scope:** the additive enqueue migration and pgTAP 106; catalog source mapping; producer occurrence/source context
  (messaging send and workspace mention/reply, pending-quiz, enrollment monitor); the worker's access rule for a group-thread
  message; the flag selector and enqueue branch in `lib/notificationService.ts`; cron
  registration and route comments; unit, pgTAP and browser tests; this file and `PROJECT_STATE.md`.
- **Out of scope:** N5-03 onward, the meeting finalize summary (N5-06), production enablement (N5-07), sync-path retirement
  (N5-08), worker/digest/access policy, preference UI, a per-user digest hour, historical backfill, old-RPC changes, release.

## What changed
| Risk | File | Change |
|---|---|---|
| High (schema) | `supabase/migrations/20261009000000_notification_enqueue_source.sql` | Additive, service-role-only `enqueue_notification_with_source` (SECURITY INVOKER, empty search_path): validates event + typed source kind/id before any write, reuses `enqueue_notification`, writes `notification_email_outbox_source` in the same transaction; same-source retry dedupes, conflicting or source-less reuse raises and rolls back; per-occurrence advisory lock. Message events accept kind `workspace` or (r8) the existing kind `group`; every other event's kind is unchanged. Old RPC, grants, RLS, source-kind constraint untouched. Authored by the DB agent (Claude subagent, claude-opus-5-5). |
| High (access) | `lib/email/notification-access.ts` | (r8) A `message_sent`/`user_mentioned` row with a `group` source is re-checked with main's `can_access_assignment_group` (membership with an active school/community role, global admin, school consultor, forced password change); a `workspace` source keeps `can_access_workspace`. Group invitation/submission rules are unchanged and not reused for messages. |
| Medium (producers) | `lib/services/workspace-message-notifications.ts` | (r8) `threadGroupIds` reads the thread's `assignment_group_id` and its `group_assignment_discussions` links in the same `message_threads` query; mention/reply payloads carry `thread_group_ids` only when non-empty. |
| High (delivery) | `lib/notificationService.ts` | `isOutboxDeliveryOn()` (same on/true/1 rule as the worker). Flag on + supported event → one RPC call per recipient with the original occurrence, catalog category/default/mandatory, producer copy, access-checked URL, allowlisted email payload and resolved source. Invalid source/context, RPC error or malformed answer throws a sanitized `notification_enqueue_failed: <code>`; never a sync rescue. Flag off, unsupported events (`meeting_finalized`, `learning_path_assigned`, unknown), `direct_message` and event-less calls keep the old sync path. |
| Medium (mapping) | `lib/notifications/catalog.ts` | Typed source resolver per supported event from the producer payload (no URL/title inference); `ok` / `unsupported` / `invalid`. (r8) One thread group → source `group`; two groups, a malformed list or a direct message naming a group → invalid. |
| Medium (producers) | `pages/api/messaging/send.ts`, `pages/api/quiz-reviews/notify-pending.ts`, `pages/api/cron/monitor-enrollments.ts` | Pass the checked thread's persisted workspace id (and, r8, its owning groups), the quiz-submission record and the monitor's occurrence as `source_context`; flag-off rows unchanged. |
| Medium (schedule) | `vercel.json`, `pages/api/cron/notification-emails.ts`, `pages/api/cron/email-digest.ts` | Existing crons unchanged; worker `* * * * *`, digest `0 * * * *` added. Route files: header comment only. |
| Tests | `__tests__/lib/notificationService.dispatch.test.ts`, `__tests__/lib/notificationService.source-context.test.ts`, `__tests__/lib/workspace-message-notifications.test.ts`, `supabase/tests/106-notification-enqueue-source.sql` (plan 82), `tests/e2e/notification-dispatch.spec.ts` (2 journeys × 2 flag variants) | See evidence. |

## Evidence (final rebuilt state; executor report `runs/NOTIF-23/executor-report-r8.md`)
- Focused (10 files) → 684 passed; `__tests__/lib/workspace-message-notifications.test.ts` → 19. `npm test` → 523 files,
  13290 passed, 12 skipped, 0 failed (baseline on untouched main: 521 / 13133 / 12). `npm run type-check`, `npm run lint` (zero
  warnings), `npm run guard:migrations` (87 files) and `npm run build` (private source-manifested copy) pass.
- Full pgTAP on the private notif23 stack (main's 86 migrations + this one) → 74 files, 7626 tests, PASS (baseline 73 / 7544);
  106 has 82 assertions, and the round-7 function body fails the 18 new ones.
- Mutation checks (r8): dropping the resolver's group branch, the worker's group rule, `send.ts`'s group read or the legacy
  discussion links each makes the new unit tests fail.
- Browser (`pm-unit ui-run … npx playwright test tests/e2e/notification-dispatch.spec.ts`, private app on :3107, one worker),
  both flag variants 2/2 passed (admin assignment, docente 403, default immediate mail with no outbox; enabled typed source,
  worker once, digest once, email-off bell only; 1366×768 and 390×844; zero fixture survivors).
- Group-thread journey (r8, private DB and app, flag on, both real producers): null-workspace thread from main's
  `get_or_create_group_discussion` enqueued as `group/<id>` for immediate, digest, email-off, in-app-off and neither recipients,
  nothing mailed at enqueue, worker and digest mail once each over repeated runs; nonnull-workspace thread denies a workspace
  member outside the group and cancels the mail of a member removed after the enqueue; valid legacy discussion linkage → group
  source; cross-assignment and mismatched-workspace linkage → 403 with nothing written; global admin and school consultor mailed;
  forced password change and inactive role after the enqueue cancel; the message body reaches no bell, payload or mail.

## Where to look hardest
1. **Group derivation (`threadGroupIds`).** The group comes from `assignment_group_id` plus every discussion link, read through
   a PostgREST embed in the existing thread query. Exactness relies on main's rules: `can_access_message_thread` already denies
   invalid legacy links, discussion rows cannot be written by clients, FKs cascade (no orphans), and thread identity is
   immutable. A thread with two groups fails closed only when the flag is on; flag-off behaviour is main's.
2. **Worker rule selection.** `checkNotificationAccess` picks the message rule by the stored kind (`workspace` or `group`); any
   other kind is a mismatch. A message stored before r8 with a workspace source is still checked against its workspace.
3. **Enqueue RPC concurrency/rollback (migration)** — the r8 change is the kind mapping only; pgTAP 106 adds workspace↔group
   conflict (also with email off) and distinct-occurrence checks. Sorted before `20261009120000` on disk.
4. **Fail-closed boundary in `createNotification`.** Which events go to the RPC versus the sync path is decided by the catalog
   resolver status; a mis-classified event would queue something undeliverable or bypass the outbox when on.
5. **Browser harness for the enabled variant.** The private server runs with a synthetic provider key and a RUN-scratch preload
   that answers the provider host locally and refuses every other external request; digest steps move the run's own outbox row
   to just before the database's due instant.

## Known limitations and deferred items
- `/api/messaging/send` bells keep main's link to the messaging section (its payload has no thread id); mention/reply bells link
  to the thread. Unchanged here.
- **N23-N1 (old RPC, no advisory lock)** stays routed to N5-08: a concurrent old-RPC caller can commit a source-less row; the
  worker fails closed on it and supported producers use only the new RPC when on.
- Per-recipient calls without an enclosing transaction; an unidentifiable occurrence keeps a fresh `unidentified:<uuid>`.
- `meeting_finalized` stays in-app only and the finalize summary is untouched until N5-06; no backfill.
- The flag stays unset everywhere; production enablement is N5-07, outside this unit. CI runs the spec's default variant only if
  it is listed; the enabled variant needs a server whose provider calls are answered locally.
- Migration `20261009000000` sorts before main's `20261009120000`; a database that already applied that version needs an
  out-of-order apply (objects do not overlap). In the private stack the function was applied directly in stage a and is not in
  its migration history table; CI applies it from the file.
