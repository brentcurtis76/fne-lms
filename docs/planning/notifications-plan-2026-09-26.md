# Plan — GENERA Notifications workstream (NOTIF): catalog, email delivery, preferences

## Revision history

**Rev 4 (2026-09-26).** Re-baselined on **origin/main c1a404ebe**.
- Revs 1–3 were audited against fne-lms-working (`codex/eval-complete`), which is 172 commits behind origin/main. Those revs missed SM-15 (1fd7fd265), which shipped live immediate email, and the r2 migration, which already revoked `create_user_notification`.
- Rev 4 also adds the PM–Executor workstream onboarding: ledger, registry, watchdog and console.
- Codex (gpt-6-astra) approved rev 3 with minor changes. Rev 4 needs a fresh review because its baseline changed.

**Rev 5.** Fixes the 7 blocking items from the round-4 review:
1. Email and in-app are enqueued independently.
2. The send-time access and preference checks, digest snapshots and snapshot clearing are restored.
3. The two flags now have explicit defaults and an enablement order, and the UI can't offer digest before it exists.
4. The large orders are split: N3 has 7 items, N4 has 3, N5 has 7.
5. The ledger-tool commands are corrected: automatic source, `--event`, and a blocker in place of a cross-ledger `depends_on`.
6. Orders stay `PROPOSED` until Brent approves them.
7. Santa Marta items keep their acceptance gates when they move, and only items NOTIF fully absorbs are held.

**Rev 6.** Fixes the round-5 production-continuity gap.
- N5-02 becomes a flag-selected dual path: the sync path keeps running while the flag is off, and the crons are registered but do nothing.
- The new N5-08 retires the sync path only after production has run on the outbox.
- Production-default-state tests are added.
- **Codex (gpt-6-astra) round 6 verdict: APPROVED**, with no new blocking issues, reviewed against origin/main c1a404ebe. The six review rounds are saved in the scratchpad as `codex-review-r1.md` through `codex-review-r6.md`.

## Context

Brent asked for three things: how notifications work today (the bell and email), what should be notified automatically, and a page where users choose which emails they get. The work runs as a bounded PM–Executor workstream with a ledger.

**State on origin/main.** Line numbers below are origin/main.

**Email is live and uncontrolled.** SM-15 made `createNotification` (`lib/notificationService.ts:887-930`) send immediate email synchronously in the request via `sendImmediateEmail` (:994) → `authorizeUserEmail` (`lib/email/outbound-policy.ts:47-86`, QA-suppressing, fail-closed) → `deliverOutboundEmail` (`lib/email/provider.ts:56-86`, the only provider boundary).
- Preferences are read per exact type (`getNotificationPreference` :1080-1103). A missing row means ON, and the preferences API never writes valid rows, so every user gets every email.
- The email has no unsubscribe link, the footer points to a page that doesn't exist, and there is no kill switch, outbox or retry.
- The idempotency key is a 32-bit minute-bucket hash (:838-862) that is sent to Resend, so a retry more than a minute later sends again.
- `system_update` goes to every profile, sequentially, inside the request.

**Security holes that are still open:**
- **`/api/feedback/notify-admins` has no authentication.** The caller supplies the recipients (`assigned_users`) and the text (`school.name`, `feedback_preview`). This is an unauthenticated way to send branded email to anyone.
- `/api/messaging/mention` (:44) and `/api/messaging/send` (:32,:67-72) authenticate the caller but accept the recipients and content the caller sends.
- `create_notification_safe` is still granted to anon, authenticated and PUBLIC (baseline:22460).
- `user_notifications` still has the policies `"System can insert notifications" WITH CHECK (true)` (applies to PUBLIC, :18520), `_admin_all` (:21809) and `_user_own` (:21813), and the table still grants ALL to anon (:26039).

**Already fixed:** r2 (`20260908180300_r2_remediation.sql:1033-1035`) revoked `create_user_notification` and `create_notification` and pinned their search_path. pgTAP `073-r2-remediation.sql` covers this.

**Two stores and two bells (unchanged).** Legacy writers still target the old `notifications` table and still fail under RLS or column mismatches:
- workspace @mentions/replies: `utils/messagingUtils-simple.ts:821,857`
- `create-group.ts:264`, `add-classmates.ts:371`, `submit-group.ts:148`
- `quiz-reviews/submit-review.ts:103`, `lib/services/quizSubmissions.js:29,61`
- the legacy `RealtimeNotificationBell`

**Preferences UI and API are still broken:**
- The API and UI (`pages/api/user/notification-preferences*.ts`, `UserPreferences.tsx`, only mounted at `admin/configuration.tsx:458`) use a jsonb, RPC and history-table shape that doesn't exist.
- Links to `/configuracion` and `/settings/notifications` lead nowhere.

**Other broken pieces:**
- `meeting_finalized` has no recipient case (:664).
- `notification_type_id` is never set.
- Payload and template mismatches: `mention.ts:84-92` vs `notificationEvents.ts:345-356`; `send.ts` `content` vs `message_preview`.
- `due-reminders` queries columns that don't exist (:1154-1184).
- Only `cleanup-learning-path-sessions` was added to `vercel.json`. The session, due-date, digest and licitación crons are still unscheduled.
- `email-digest.ts` is a stub over the missing `email_digest_queue`.
- Meeting summaries still email the full notes and attendee list (`lib/emailService.js:15-64`).
- The sender contract is split: `emailService.js` wraps the address, while everything else uses the form "Name <addr>".
- `triggerNotification` logs the whole `eventData` (:245).
- Notification mail is not mirrored to `E2E_MAIL_OUTBOX`: `scripts/ci/check-browser-boundaries.mjs` treats type-only imports as real ones, per the SM-15 review request.

**Brent's decisions (25–26 Sep):**
- Email is either immediate or in a daily digest.
- Preferences get their own page at `/configuracion/notificaciones`.
- All legacy writers migrate to `user_notifications`.
- Email defaults are set per event.
- Workstream prefix is **NOTIF**, in a fresh worktree created with `pm-unit new-workstream`.
- The notify-admins fix is the **first NOTIF unit**.
- Overlapping Santa Marta ledger items **move to NOTIF**.

## Constraints
- The PM–Executor workflow applies (`templates/COORDINATED-LOOP.md`), with Codex as PM/reviewer and Claude Code as executor, one unit at a time.
- Each order has at most 8 files, at most 6 functional rows, and a Focused test command.
- Gates are type-check, lint, test and build, plus test:db and e2e where the unit touches the database or UI.
- Migrations are additive and go through the DB-agent flow. RLS stays enabled. Each migration gets a pgTAP matrix (anon, own, cross-user, admin, service_role, RPC bypass). New pgTAP files must use unused numbers; `073` is taken twice already.
- Synthetic data only. No production access. No deploys; Brent ships with `pm-ship GENERA`.
- Current 9 roles only; the Fase 1 roles plug into the catalog later.
- **Build on SM-15, don't replace it.** Every send goes through `authorizeUserEmail` and `deliverOutboundEmail`, and QA suppression (W-SIM-01) is kept.

## Design (adapted to origin/main)

**D1 · Catalog.** `lib/notifications/catalog.ts` maps each event to:
- category, audience, and an `emailDefault` (immediate / digest / off)
- a `mandatory` flag, with a justification
- `occurrenceId`, an allowlisted `emailPayload`, the templates, and a `urlBuilder` (this fixes the dead links and W-BL-A13-2)

Categories and defaults are unchanged from rev 3. Setting `system_update` to off **changes live behaviour**, so the release notes must call it out.

**D2 · Preferences.** New table `user_notification_category_prefs(user_id, category, email_mode ∈ default|immediate|digest|off)`, unique on `(user_id, category)`, owner-only RLS.
- **Precedence:**
  1. mandatory
  2. a non-default category mode
  3. legacy per-type suppression, using SM-15's current rule (an exact `(user_id, event_type||category)` row with `email_enabled=false`), plus the meeting-summary rule that any false row suppresses it
  4. the catalog default

  Choosing Predeterminado re-applies the legacy suppression.
- Legacy `in_app_enabled=false` is still honoured, as it is today, but v1 doesn't expose it in the UI.

**D3 · Transactional outbox.**
- The service-role-only RPC `enqueue_notification` resolves both channels and, in one transaction, writes **independently conditional** rows:
  - a `user_notifications` row only if in-app delivery is enabled
  - a `notification_email_outbox` row only if the email mode isn't `off`
- This keeps SM-15's email-only behaviour when `in_app_enabled=false` (`notificationService.ts:875-918`).
- The outbox row has its own identity: a unique idempotency key and a **nullable** `notification_id`. It never depends on a visible bell row.
- Regression tests: email-only, in-app-only, both, neither.
- The idempotency key is `event + occurrenceId + recipient`, replacing the minute hash both in-app and at the provider.
- A single dispatch point picks exactly one email path per event using `NOTIFICATION_OUTBOX_DELIVERY`, so nothing is sent twice. SM-15's synchronous `sendImmediateEmail` stays as the flag-off path until N5-08 retires it. That happens only after production has run on the outbox.

**D4 · Worker.**
- `pages/api/cron/notification-emails.ts`, protected by `authorizeCronRequest`.
- Claims rows with lease plus `SKIP LOCKED`, and sends only through `authorizeUserEmail` → `deliverOutboundEmail`, using its `headers` for `List-Unsubscribe`.
- **Before the first attempt**, the worker re-checks entity access (the recipient can still see the source record) and the current preference. `authorizeUserEmail` only checks tenant/QA disposition, so it is not enough on its own. If either check fails, the row is cancelled.
- A frozen, encrypted `send_snapshot` is written on the first attempt. Every retry resends it byte for byte with the same key, and the worker never re-keys to get past a 409.
- Digest runs freeze their rendered snapshot at claim time in the same way.
- Snapshots are nulled at every terminal outcome, and the retention cron purges rows after 90 days.
- Delivery outcomes:
  - The provider reports 429 and 5xx as `transport_error`, which is ambiguous.
  - An ambiguous send is re-checked before each retry; a revoked recipient becomes `cancelled_after_ambiguous`. After 24h it becomes `unknown`, and a 409 is terminal.
  - Other rejections are definite.
- Throttling: a per-run budget, backoff with jitter, and priority for the recovery outbox.
- **Two flags and a fixed enablement order:**
  - `NOTIFICATION_EMAIL_ENABLED` is the kill switch for the **live SM-15 synchronous path**, added in N0-01. It **defaults ON when unset**, deliberately, to keep the shipped SM-15 behaviour (the W-B10b-01 gate). Brent can turn it off at any time.
  - `NOTIFICATION_OUTBOX_DELIVERY` gates the worker and digest. It **defaults OFF** and is only turned on at cutover (N5-02), after the prerequisites are done: the worker (N3-03, N3-04), unsubscribe (N3-05), bounce (N3-06), the preferences UI (N4-01 to N4-03) and the digest (N5-01).
- **Until cutover:**
  - The synchronous path uses the resolver in compat mode: `digest` is sent as `immediate` (today's behaviour), and `off` suppresses.
  - The UI hides "Resumen diario" until `NOTIFICATION_OUTBOX_DELIVERY` is on, so a user can never choose a mode the system can't honour.
  - No outbox rows are written while the flag is off, in any environment, so no backlog builds up and existing production email keeps flowing through the sync path.
- **Production continuity:** every NOTIF item can ship on its own through `pm-ship GENERA` without interrupting production email. With the flag unset, production behaves exactly as SM-15 does, apart from the N0/N1 fixes.
- Renderers: `buildNotificationEmail` (`lib/email/notifications.ts`) and the private `renderEmail` (`lib/email/invitations.ts:149`) merge into a shared `lib/email/render.ts`.
- Sender contract: settled here (absorbs W-B3b-02).

**D5 · Unsubscribe.**
- Purpose-scoped HMAC tokens carrying user, category and `pref_version`.
- RFC 8058 one-click via POST. GET only shows a confirmation page.
- For a digest, the header link turns off the digest and the body has one link per category.
- Rows still pending when a user unsubscribes are cancelled.

**D6 · Privacy.**
- An allowlisted `emailPayload`; no message bodies, notes, attendance, grades or free text.
- The meeting-summary email becomes a notice with a link. This changes behaviour, and Brent confirms it in the unit.
- `triggerNotification` stops logging the full `eventData`.
- Any minor data triggers the consent/EIPD gate.

**D7 · Preferences page.**
- `pages/configuracion/notificaciones.tsx` (plus an index redirect), with Predeterminado / Inmediato / Resumen diario / Desactivado per category, filtered by role and scope.
- Also shows the digest hour, the always-on list, a notice when the address is bounce-suppressed, and inherited-suppression markers.
- Reached from the bell gear, the `/notifications` cog, Mi Perfil, and the email footers.
- The API is rewritten; the admin tab and the dead routes are retired.

**D8 · Producers derive from persisted records.**
- Covers notify-admins, `messaging/mention`, **`messaging/send`**, workspace mentions/replies, and group/quiz writers.
- The actor, recipients and content are derived server-side from the saved record, with authorization and membership checks.
- Workspace messages are idempotent per message id, with a reconciliation query.
- The recipient fix applies only to `quiz_review_pending`.
- Retired: the legacy bell, `realtimeNotifications.js`, `notificationServiceEnhanced.ts`, and `EmailNotificationService`. The legacy table stays.

**D9 · Schedules.**
- Digest via `notification_digest_runs(user_id, local_date)` with frozen membership, a lease, a stable key and Santiago-timezone catch-up (DST-safe).
- Session reminders: `authorizeCronRequest`, with an occurrence id that includes the scheduled start.
- Due reminders: rewritten against the real due-date sources.
- A licitación deadline cron (absorbs W-B8a-01 and the related sweep items).
- All of these are added to `vercel.json`.

## Ledger items (NOTIF)

The Markdown ledger is `docs/ledger/notifications.md` and the index is `~/Projects/pm-workflow/ledgers/NOTIF.json`.
- Each item is sized for one order: at most 8 files including tests, at most 6 functional rows, one behaviour.
- Items run strictly in order. Each is `blocked` with `depends_on` naming the item before it, unless this section says otherwise.
- Every item has `authority: brent`, because none falls under GENERA's `low_risk_paths`.
- The plan doc `docs/planning/notifications-plan-2026-09-26.md` holds one `### <id>` section per item, with its scope, done-when rows and the SM gates it inherits.

| id | title | absorbs from SM (with its gate) |
|---|---|---|
| **N0 · Containment** (the live sync path stays on) | | |
| N0-01 | Authenticate notify-admins; derive admins and text from the persisted feedback; add the `NOTIFICATION_EMAIL_ENABLED` kill switch (default ON) to `sendImmediateEmail` | — |
| N0-02 | Derive recipients and content server-side, with membership checks, for `messaging/mention` and `messaging/send` | — |
| N0-03 | DB: revoke `create_notification_safe` from anon, authenticated and PUBLIC; limit `user_notifications` INSERT to service_role and remove the anon grant; pgTAP. Depends on N0-01, N0-02 and a browser-insert inventory | — |
| **N1 · Contract** (no delivery change) | | |
| N1-01 | `catalog.ts` and completeness tests; notification `urlBuilder`s | W-BL-A13-2 **notification links only**; the SM item stays open for reminders, calendar and the workspace list |
| N1-02 | Category-preferences table, RLS and pgTAP | — |
| N1-03 | Precedence resolver (SM-15 legacy rule, meeting any-false rule, mandatory), wired into the sync path in compat mode (digest sent as immediate) | — |
| **N2 · Producers** | | |
| N2-01 | Occurrence-id idempotency (in-app and provider key); stop logging the full eventData | — |
| N2-02 | Payload/template fixes; `notification_type_id`/category; `meeting_finalized` recipients **in-app only** (email suppressed until N5-06, so no double send) | — |
| N2-03 | Workspace mentions and replies moved server-side, with reconciliation | — |
| N2-04 | Group and quiz writers moved to the service; `quiz_review_pending` recipient fix | — |
| N2-05 | Retire the legacy bell and dead notification code | — |
| **N3 · Delivery** (dormant: `NOTIFICATION_OUTBOX_DELIVERY` off, no producer writes outbox rows) | | |
| N3-01 | Outbox table and `enqueue_notification` RPC with independently conditional inserts; pgTAP | — |
| N3-02 | Shared renderer `lib/email/render.ts` and a single sender contract | W-B3b-02, with its gate: both consumers accept one value |
| N3-03 | Worker core: claim/lease, pre-first-attempt access and preference checks, encrypted snapshot freeze, send through `authorizeUserEmail`/`deliverOutboundEmail` | — |
| N3-04 | Worker failure semantics: ambiguous vs definite, terminal 409, 24h `unknown`, backoff/throttle, recovery-outbox priority, snapshot clearing and retention purge | — |
| N3-05 | Unsubscribe tokens, RFC 8058 POST endpoint, GET confirmation page, headers | — |
| N3-06 | Resend bounce webhook and per-address suppression | — |
| N3-07 | E2E mail mirror (fix the type-only-import boundary scanner) | — |
| **N4 · UI** | | |
| N4-01 | Rewrite the preferences API (GET effective, PUT validated) | — |
| N4-02 | `/configuracion/notificaciones` page and `/configuracion` redirect; "Resumen diario" hidden while the outbox flag is off | — |
| N4-03 | Entry points (bell gear, `/notifications` cog, Mi Perfil, email footer links); retire the admin tab and dead preference routes | — |
| **N5 · Cutover and schedules** | | |
| N5-01 | Digest runs table and hourly cron (dormant behind the flag) | — |
| N5-02 | **Flag-selected dual path.** Producers go through one dispatch point: with `NOTIFICATION_OUTBOX_DELIVERY` on they call `enqueue_notification` and the worker sends; with it **off or unset** they keep the existing sync `sendImmediateEmail`, unchanged. The worker and digest crons are registered in `vercel.json` here; they do nothing while the flag is off. Tests cover the production-default state (flag unset: sync sends, no outbox rows) and flag on (outbox only, no double send). The sync path is **not** removed | EMAIL-DELIVERABILITY-INFRA **code part** |
| N5-03 | Session-reminders cron | — |
| N5-04 | Rewrite due reminders on the real schema | — |
| N5-05 | Licitación deadline cron | W-B8a-01, W-BL-SWEEP-PRIOR-AUDIT-03, W-BL-SWEEP-NONFUNCTIONAL-DEADLINE-ALERTS, with their gates |
| N5-06 | Meeting summary on the pipeline (notice + link), truthful send result | W-B3b-01 code part |
| N5-07 | Production enablement: flag checklist, **institutional-mailbox evidence** (a synthetic send reaches a real school inbox) and sign-off. `waiting`, `--blocker-who Brent`, `--blocker-need "verify Resend sender domain (SM W-PC-03) and provide institutional-mailbox evidence"` | Evidence gates of EMAIL-DELIVERABILITY-INFRA and W-B3b-01 (Directora sign-off) |
| N5-08 | Retire the sync `sendImmediateEmail` path and the flag-off branch. Blocked on N5-07, plus Brent confirming that production has run on the outbox for at least 7 days without delivery incidents | — |

**Moving items out of SM (step 6) preserves their obligations:**
- Before an SM item is held, its `gate_salida`, owner and sign-off are copied into the absorbing NOTIF item's plan section.
- An SM item is only held when NOTIF absorbs its **full** scope.
- W-BL-A13-2 is **not** held. It gets an event noting that N1-01 covers the notification links.
- W-PC-03 and W-SIM-01 stay in SM.

## Workstream onboarding (after this plan is approved)

**Brent, in a terminal:**
1. `pm-unit new-workstream`. Answers:
   - project GENERA, name "Notifications", prefix NOTIF, fresh from GitHub main
   - result: `worktrees/genera-notifications` on `ws/notifications`, a `node_modules` symlink, `.env.development.local` on port 3104, the `workstreams.json` entry, and the Herdr workspace "GENERA · Notifications"

**Claude (this planning session), once Brent says to proceed:**

2. Edit `~/Projects/pm-workflow/workstreams.json` for the NOTIF root. `new-workstream` leaves these fields out, and without `ledger` the Markdown ledger is silently skipped (pm-unit:6985). Add:
   - `"ledger": "docs/ledger/notifications.md"`
   - `"index": "/home/brent/Projects/pm-workflow/ledgers/NOTIF.json"`
   - `refs`: the ledger ("THE ledger"), `docs/planning/notifications-plan-2026-09-26.md`, and the SM-15 review request
3. Run `~/Projects/pm-workflow/bin/trust-workstreams` and copy `.codex/hooks.json` into the worktree. Codex asks Brent to trust the hook on first launch.
4. In the worktree, write:
   - `docs/planning/notifications-plan-2026-09-26.md`, with one `### <id>` section per item
   - `docs/ledger/notifications.md`, with `# Ledger — Notifications (GENERA)`, `Index:`, `## Now`, `## Items` (header row plus `|---|`), and `## Events`
5. Create `ledgers/NOTIF.json` as `[]`.
   - Add each item with `pm-unit ledger set NOTIF <id> <status> --title "…" --authority brent [--depends-on <prev>] [--blocker-who … --blocker-need …] --event "created from notifications plan rev 4"`.
   - N0-01 is `todo`. Every other item is `blocked` on the one before it, except N5-07, which is `waiting` with a blocker.
   - `source` is filled in automatically as `docs/ledger/notifications.md#<id>`, and the row `ledger set` writes contains the anchor. There is no source flag.
   - `depends_on` only names NOTIF ids. The SM W-PC-03 dependency is expressed as N5-07's blocker.
   - Finish with `pm-unit ledger validate NOTIF`.
6. **Move the Santa Marta items**, only while the SM PM is idle between units:
   - `pm-unit ledger set SM <id> held --event "moved to NOTIF <item>; gate copied to notifications plan §<item>"` for W-B3b-01, W-B3b-02, W-B8a-01, W-BL-SWEEP-PRIOR-AUDIT-03, W-BL-SWEEP-NONFUNCTIONAL-DEADLINE-ALERTS and W-BL-SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA.
   - W-BL-A13-2 gets only an event: `pm-unit ledger event SM --who "Claude for Brent" --kind NOTE "NOTIF N1-01 covers notification links; reminders, calendar and workspace-list navigation remain here"`.
   - Finish with `pm-unit ledger validate SM`.
7. Commit the ledger and plan docs on `ws/notifications` as one docs-only commit (the `LEDGER-SM`/`LEDGER-PROC` precedent), queued as `LEDGER-NOTIF` in SHIP-QUEUE. This needs Brent's explicit go-ahead, because commits need his instruction.

**Brent, in the "GENERA · Notifications" workspace (cwd = new worktree):**

8. `pm-unit doctor`, then `pm-unit start`. This creates `runs/NOTIF-01` and a "NOTIF-01 PM" Codex tab, sends the intake, and makes sure the watchdog is running.
   - **Caveat:** `start` wipes `batch.json` `auto_starts` for every workstream, which resets the shared cap of 12 starts per 24h.
9. **Watchdog and console:** nothing to configure. The watchdog discovers `runs/NOTIF-*` through `pm-start.json`, and the console maps the workspace by pane cwd or registry name. To verify:
   - `pm-unit brief --units` lists NOTIF-01
   - the console shows the NOTIF row
   - NEXT FOR CLAUDE asks reach a Claude in that workspace
10. Close this planning workspace (wH) once the new one is running.

**Loop after that:**
- The PM writes `runs/NOTIF-0N/order-r0.md` from `ORDER-TEMPLATE.md` with **`Status: PROPOSED`**. It only becomes `APPROVED (Brent, <date>)` after Brent approves that specific order (`ORDER-TEMPLATE.md:4`, `COORDINATED-LOOP.md:81`). The PM never approves an order itself.
- The loop is begin → wait → review-start → accept. Accept writes the code commit plus `ledger: NOTIF-0N done`, adds a SHIP-QUEUE entry, and spawns the next unit under the cap.
- Brent ships with `pm-ship GENERA`.

## Verification
- **Onboarding:**
  - `pm-unit ledger validate NOTIF` is clean.
  - `pm-unit doctor` passes in the NOTIF root.
  - `pm-unit brief --units` shows NOTIF.
  - The SM ledger shows the moved items as held, with a pointer.
  - The console maps "GENERA · Notifications" to prefix NOTIF.
- **Per unit:** each order's Focused command, the four gates plus test:db and e2e where the unit touches the database or UI, and the `fase-*-review-request.md` file.
- **Key tests, carried over from rev 3 and adapted:**
  - pgTAP: anon and authenticated cannot insert notifications directly or via `create_notification_safe`; the r2 revoke on `create_user_notification` has a regression test; the outbox and digest tables are service-role only; preferences are owner-only.
  - notify-admins returns 401 without a session and ignores recipients sent in the request body.
  - The kill switch stops the live SM-15 sends, and leaving it unset preserves SM-15 behaviour.
  - With the outbox flag off, no outbox rows are written and the worker sends nothing.
  - **Production-default intermediate state** (every build from N5-02 through N5-07, flag unset): the sync path still delivers, the worker and digest crons are no-ops, and nothing is sent twice.
  - With the flag on: outbox delivery only.
  - Digest is hidden in the UI while the flag is off.
  - Channel independence: email-only, in-app-only, both and neither.
  - The access and preference re-check runs before the first attempt.
  - Snapshots are cleared at terminal outcomes.
  - Catalog completeness.
  - The precedence resolver, including SM-15's legacy rule.
  - Occurrence deduplication, both the retry case and two genuine occurrences.
  - The worker's snapshot identity after a mutation, `cancelled_after_ambiguous`, a terminal 409, 429 backoff, and recovery priority.
  - No double send when the synchronous path is retired.
  - Digest claims across skipped hours and DST.
  - Unsubscribe via one-click POST, and a GET that has no side effect.
  - The privacy allowlist.
  - The role matrix: all 9 roles, multiple roles, and school/community isolation.
  - E2E on the synthetic tenant with `E2E_MAIL_OUTBOX` once N3-06 lands.
