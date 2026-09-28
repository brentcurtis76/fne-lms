# Ledger — Notifications (GENERA)
Index: ~/Projects/pm-workflow/ledgers/NOTIF.json (machine copy; keep both in sync via pm-unit)
Format: v1, see ~/Projects/pm-workflow/LEDGER-FORMAT.md. Workstream registered 2026-09-26; items are added at intake (NOTIF-01).

## Now
NOTIF-01 proposes N0-01: secure the feedback notification route and add the immediate-email kill switch. Brent's order approval is next; no executor has been dispatched. The Santa Marta item moves wait until its PM finishes the open SM-24 review.

## Items
| id | title | status | unit | updated | notes |
|---|---|---|---|---|---|
| N0-01 | Authenticate notify-admins; derive admins and text from the persisted feedback; add the `NOTIFICATION_EMAIL_ENABLED` kill switch (default ON) to `sendImmediateEmail` | done | NOTIF-01 | 2026-09-26 |  |
| N0-02 | Derive recipients and content server-side, with membership checks, for `messaging/mention` and `messaging/send` | done | NOTIF-02 | 2026-09-28 |  |
| N0-03 | DB: revoke create_notification_safe from anon/authenticated/PUBLIC; restrict user_notifications INSERT to service_role; remove anon grant; pgTAP and browser-insert inventory | done | NOTIF-03 | 2026-09-27 |  |
| N1-01 | `catalog.ts` and completeness tests; notification `urlBuilder`s | in-progress | NOTIF-04 | 2026-09-27 |  |
| N1-02 | Category-preferences table, RLS and pgTAP | blocked |  | 2026-09-26 |  |
| N1-03 | Precedence resolver (SM-15 legacy rule, meeting any-false rule, mandatory), wired into the sync path in compat mode (digest sent as immediate) | blocked |  | 2026-09-26 |  |
| N2-01 | Occurrence-id idempotency (in-app and provider key); stop logging the full eventData | blocked |  | 2026-09-26 |  |
| N2-02 | Payload/template fixes; `notification_type_id`/category; `meeting_finalized` recipients **in-app only** (email suppressed until N5-06, so no double send) | blocked |  | 2026-09-26 |  |
| N2-03 | Workspace mentions and replies moved server-side, with reconciliation | blocked |  | 2026-09-26 |  |
| N2-04 | Group and quiz writers moved to the service; `quiz_review_pending` recipient fix | blocked |  | 2026-09-26 |  |
| N2-05 | Retire the legacy bell and dead notification code | blocked |  | 2026-09-26 |  |
| N3-01 | Outbox table and `enqueue_notification` RPC with independently conditional inserts; pgTAP | blocked |  | 2026-09-26 |  |
| N3-02 | Shared renderer `lib/email/render.ts` and a single sender contract | blocked |  | 2026-09-26 |  |
| N3-03 | Worker core: claim/lease, pre-first-attempt access and preference checks, encrypted snapshot freeze, send through `authorizeUserEmail`/`deliverOutboundEmail` | blocked |  | 2026-09-26 |  |
| N3-04 | Worker failure semantics: ambiguous vs definite, terminal 409, 24h `unknown`, backoff/throttle, recovery-outbox priority, snapshot clearing and retention purge | blocked |  | 2026-09-26 |  |
| N3-05 | Unsubscribe tokens, RFC 8058 POST endpoint, GET confirmation page, headers | blocked |  | 2026-09-26 |  |
| N3-06 | Resend bounce webhook and per-address suppression | blocked |  | 2026-09-26 |  |
| N3-07 | E2E mail mirror (fix the type-only-import boundary scanner) | blocked |  | 2026-09-26 |  |
| N4-01 | Rewrite the preferences API (GET effective, PUT validated) | blocked |  | 2026-09-26 |  |
| N4-02 | `/configuracion/notificaciones` page and `/configuracion` redirect; "Resumen diario" hidden while the outbox flag is off | blocked |  | 2026-09-26 |  |
| N4-03 | Entry points (bell gear, `/notifications` cog, Mi Perfil, email footer links); retire the admin tab and dead preference routes | blocked |  | 2026-09-26 |  |
| N5-01 | Digest runs table and hourly cron (dormant behind the flag) | blocked |  | 2026-09-26 |  |
| N5-02 | Flag-selected dual path: outbox delivery when enabled; unchanged synchronous delivery when unset; dormant worker/digest crons and production-default tests | blocked |  | 2026-09-26 |  |
| N5-03 | Session-reminders cron | blocked |  | 2026-09-26 |  |
| N5-04 | Rewrite due reminders on the real schema | blocked |  | 2026-09-26 |  |
| N5-05 | Licitación deadline cron | blocked |  | 2026-09-26 |  |
| N5-06 | Meeting summary on the pipeline (notice + link), truthful send result | blocked |  | 2026-09-26 |  |
| N5-07 | Production enablement: flag checklist, institutional-mailbox delivery evidence and sign-off | waiting |  | 2026-09-26 |  |
| N5-08 | Retire the sync `sendImmediateEmail` path and the flag-off branch. Blocked on N5-07, plus Brent confirming that production has run on the outbox for at least 7 days without delivery incidents | blocked |  | 2026-09-26 |  |

## Events (append-only, newest last)
- 2026-09-26T15:41-03:00 · NOTIF-01 · PM_STARTED · workstream registered; ledger created empty for intake
- 2026-09-26T15:54:00-03:00 · PM · TODO · created from notifications plan rev 6 · token ls-ddd510dcb5
- 2026-09-26T15:54:03-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-3e03096ff1
- 2026-09-26T16:03:00-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-300299a85c
- 2026-09-26T16:03:03-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-3a3f5cbfcf
- 2026-09-26T16:03:07-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-58b6928e13
- 2026-09-26T16:03:11-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-2f10ffa1c1
- 2026-09-26T16:03:14-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-3333f5cc7b
- 2026-09-26T16:03:18-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-0599714f68
- 2026-09-26T16:03:23-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-d2ef5c8b2d
- 2026-09-26T16:03:30-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-142e38e23b
- 2026-09-26T16:03:39-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-40e8139911
- 2026-09-26T16:03:45-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-7b279066ac
- 2026-09-26T16:03:58-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-e02c76e352
- 2026-09-26T16:04:02-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-04e80ee61a
- 2026-09-26T16:04:05-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-3816ede28e
- 2026-09-26T16:04:09-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-6c9e73a3a0
- 2026-09-26T16:04:12-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-983da14d95
- 2026-09-26T16:04:15-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-d29b336821
- 2026-09-26T16:04:17-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-0f473585e3
- 2026-09-26T16:04:20-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-426dbb6458
- 2026-09-26T16:04:23-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-df6ec8f799
- 2026-09-26T16:04:26-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-2a0defadaf
- 2026-09-26T16:04:41-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-c426f9ba1d
- 2026-09-26T16:04:45-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-5adcc043c2
- 2026-09-26T16:04:47-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-a81f31fb17
- 2026-09-26T16:04:50-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-5b9a37d74a
- 2026-09-26T16:04:53-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-1b672223bd
- 2026-09-26T16:04:55-03:00 · PM · WAITING · created from notifications plan rev 6 · token ls-6d285bebb1
- 2026-09-26T16:04:59-03:00 · PM · BLOCKED · created from notifications plan rev 6 · token ls-eba849d43a
- 2026-09-26T16:06:40-03:00 · NOTIF-01 · TODO · assigned to NOTIF-01 for bounded order r0 · token ls-0795018d18
- 2026-09-26T16:16:35-03:00 · NOTIF-01 · IN-PROGRESS · NOTIF-01 r0 dispatched (pm-unit begin) · token ls-39c52b39bd
- 2026-09-26T18:15:34-03:00 · NOTIF-01 · DONE · NOTIF-01: contain feedback notifications · token 37b2e3d06020
- 2026-09-26T18:15:34-03:00 · PM · TODO · N0-02 is free again: N0-01 finished. · token 37b2e3d06020-free-N0-02
- 2026-09-26T18:25:22-03:00 · NOTIF-02 · IN-PROGRESS · NOTIF-02 r0 dispatched (pm-unit begin) · token ls-b7a1bb7efe
- 2026-09-26T19:58:13-03:00 · NOTIF-02 · DONE · NOTIF-02: contain messaging notifications · token d5487e7e01b3
- 2026-09-26T19:58:13-03:00 · PM · TODO · N0-03 is free again: N0-02 finished. · token d5487e7e01b3-free-N0-03
- 2026-09-26T20:07:51-03:00 · NOTIF-01 · IN-PROGRESS · NOTIF-01 r3 dispatched (pm-unit begin) · token ls-d07df98629
- 2026-09-26T21:01:10-03:00 · NOTIF-01 · DONE · NOTIF-01: contain feedback notifications · token 5f506e4dc36e
- 2026-09-27T07:57:35-03:00 · NOTIF-03 · IN-PROGRESS · NOTIF-03 r0 dispatched (pm-unit begin) · token ls-91f289e77c
- 2026-09-27T08:38:36-03:00 · NOTIF-03 · DONE · NOTIF-03: restrict notification inserts to service role · token 4dce916e3e66
- 2026-09-27T08:38:36-03:00 · PM · TODO · N1-01 is free again: N0-03 finished. · token 4dce916e3e66-free-N1-01
- 2026-09-27T08:40:12-03:00 · NOTIF-02 · IN-PROGRESS · N0-02 current-main rebuild r3 reopened after pm-ship set aside commit 6dd3f072d; same approved outcome and preserved prior review · token ls-981602c087
- 2026-09-27T08:40:34-03:00 · NOTIF-04 · IN-PROGRESS · NOTIF-04 r0 dispatched (pm-unit begin) · token ls-96bf7cff09
- 2026-09-28T06:00:47-03:00 · NOTIF-02 · DONE · NOTIF-02: contain messaging notification endpoints on current main · token 010d4c2f1f14
