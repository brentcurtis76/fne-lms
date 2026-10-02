# Ledger — Notifications (GENERA)
Index: ~/Projects/pm-workflow/ledgers/NOTIF.json (machine copy; keep both in sync via pm-unit)
Format: v1, see ~/Projects/pm-workflow/LEDGER-FORMAT.md. Workstream registered 2026-09-26; items are added at intake (NOTIF-01).

## Now
NOTIF-01, 02, 03 and 05 are on main (PRs #123–#127). NOTIF-04 and 06–18 sit on one branch, `fix/notif-line`, rebuilt on current main on 2026-10-02 (the two older branches `fix/notif06-rb` and `fix/notif13-render` are superseded). Nothing here switches the email queue on in production; that is a separate Brent decision. Next item: N4-01.

## Items
| id | title | status | unit | updated | notes |
|---|---|---|---|---|---|
| N0-01 | Authenticate notify-admins; derive admins and text from the persisted feedback; add the `NOTIFICATION_EMAIL_ENABLED` kill switch (default ON) to `sendImmediateEmail` | done | NOTIF-01 | 2026-09-26 |  |
| N0-02 | Derive recipients and content server-side, with membership checks, for `messaging/mention` and `messaging/send` | done | NOTIF-02 | 2026-09-28 |  |
| N0-03 | DB: revoke create_notification_safe from anon/authenticated/PUBLIC; restrict user_notifications INSERT to service_role; remove anon grant; pgTAP and browser-insert inventory | done | NOTIF-03 | 2026-09-27 |  |
| N1-01 | `catalog.ts` and completeness tests; notification `urlBuilder`s | done | NOTIF-04 | 2026-10-02 |  |
| N1-02 | Category-preferences table, RLS and pgTAP | done | NOTIF-05 | 2026-09-28 |  |
| N1-03 | Precedence resolver (SM-15 legacy rule, meeting any-false rule, mandatory), wired into the sync path in compat mode (digest sent as immediate) | done | NOTIF-06 | 2026-10-02 |  |
| N2-01 | Occurrence-id idempotency (in-app and provider key); stop logging the full eventData | done | NOTIF-07 | 2026-10-02 |  |
| N2-02 | Payload/template fixes; `notification_type_id`/category; `meeting_finalized` recipients **in-app only** (email suppressed until N5-06, so no double send) | done | NOTIF-08 | 2026-10-02 |  |
| N2-03 | Workspace mentions and replies moved server-side, with reconciliation | done | NOTIF-09 | 2026-10-02 |  |
| N2-04 | Group and quiz writers moved to the service; `quiz_review_pending` recipient fix | done | NOTIF-10 | 2026-10-02 |  |
| N2-05 | Retire the legacy bell and dead notification code | done | NOTIF-11 | 2026-10-02 |  |
| N3-01 | Outbox table and `enqueue_notification` RPC with independently conditional inserts; pgTAP | done | NOTIF-12 | 2026-10-02 |  |
| N3-02 | Shared renderer `lib/email/render.ts` and a single sender contract | done | NOTIF-13 | 2026-09-30 |  |
| N3-03 | Worker core: claim/lease, pre-first-attempt access and preference checks, encrypted snapshot freeze, send through `authorizeUserEmail`/`deliverOutboundEmail` | done | NOTIF-14 | 2026-09-30 |  |
| N3-04 | Worker failure semantics: ambiguous vs definite, terminal 409, 24h `unknown`, backoff/throttle, recovery-outbox priority, snapshot clearing and retention purge | done | NOTIF-15 | 2026-09-30 |  |
| N3-05 | Unsubscribe tokens, RFC 8058 POST endpoint, GET confirmation page, headers | done | NOTIF-16 | 2026-09-30 |  |
| N3-06 | Resend bounce webhook and per-address suppression | done | NOTIF-17 | 2026-09-30 |  |
| N3-07 | E2E mail mirror (fix the type-only-import boundary scanner) | done | NOTIF-18 | 2026-09-30 |  |
| N4-01 | Rewrite the preferences API (GET effective, PUT validated) | todo |  | 2026-09-30 |  |
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
- 2026-09-28T09:43:01-03:00 · NOTIF-04 · DONE · NOTIF-04: complete notification catalog and safe links · token 4b3ef4bba912
- 2026-09-28T09:43:01-03:00 · PM · TODO · N1-02 is free again: N1-01 finished. · token 4b3ef4bba912-free-N1-02
- 2026-09-28T12:10:30-03:00 · NOTIF-05 · IN-PROGRESS · NOTIF-05 r0 dispatched (pm-unit begin) · token ls-1bb336d703
- 2026-09-28T12:54:52-03:00 · NOTIF-05 · DONE · NOTIF-05: add category preference storage and RLS · token 0d3682b38dd5
- 2026-09-28T12:54:52-03:00 · PM · TODO · N1-03 is free again: N1-02 finished. · token 0d3682b38dd5-free-N1-03
- 2026-09-28T13:17:09-03:00 · NOTIF-06 · IN-PROGRESS · NOTIF-06 r0 dispatched (pm-unit begin) · token ls-2701e3d919
- 2026-09-28T14:17:17-03:00 · NOTIF-06 · DONE · NOTIF-06: resolve notification email preferences in sync compatibility mode · token 141dd63ba4de
- 2026-09-28T14:17:17-03:00 · PM · TODO · N2-01 is free again: N1-03 finished. · token 141dd63ba4de-free-N2-01
- 2026-09-28T14:21:43-03:00 · NOTIF-07 · IN-PROGRESS · NOTIF-07 r0 dispatched (pm-unit begin) · token ls-2b71133226
- 2026-09-28T15:48:11-03:00 · NOTIF-07 · DONE · NOTIF-07: stable notification occurrence keys and bounded audit · token 603975c29dcb
- 2026-09-28T15:48:11-03:00 · PM · TODO · N2-02 is free again: N2-01 finished. · token 603975c29dcb-free-N2-02
- 2026-09-28T15:55:57-03:00 · NOTIF-08 · IN-PROGRESS · NOTIF-08 r0 dispatched (pm-unit begin) · token ls-cf02568994
- 2026-09-28T17:36:16-03:00 · NOTIF-08 · DONE · NOTIF-08: complete N2-02 notification producer contract · token 329be799ff7a
- 2026-09-28T17:36:16-03:00 · PM · TODO · N2-03 is free again: N2-02 finished. · token 329be799ff7a-free-N2-03
- 2026-09-28T17:39:57-03:00 · NOTIF-09 · IN-PROGRESS · NOTIF-09 r0 dispatched (pm-unit begin) · token ls-773f2ce26b
- 2026-09-28T20:10:38-03:00 · NOTIF-09 · DONE · NOTIF-09: deliver workspace message notification bells · token 488f0adaf1c2
- 2026-09-28T20:10:38-03:00 · PM · TODO · N2-04 is free again: N2-03 finished. · token 488f0adaf1c2-free-N2-04
- 2026-09-28T20:17:30-03:00 · NOTIF-10 · IN-PROGRESS · NOTIF-10 r0 dispatched (pm-unit begin) · token ls-f44df85d6b
- 2026-09-30T00:20:12-03:00 · NOTIF-10 · DONE · NOTIF-10: group and quiz notification writers · token 7dcb067861ed
- 2026-09-30T00:20:12-03:00 · PM · TODO · N2-05 is free again: N2-04 finished. · token 7dcb067861ed-free-N2-05
- 2026-09-30T00:25:52-03:00 · NOTIF-11 · IN-PROGRESS · NOTIF-11 r0 dispatched (pm-unit begin) · token ls-5a8ad8a6a9
- 2026-09-30T01:31:30-03:00 · NOTIF-11 · DONE · NOTIF-11: retire legacy notification code · token daec7dc9d09b
- 2026-09-30T01:31:30-03:00 · PM · TODO · N3-01 is free again: N2-05 finished. · token daec7dc9d09b-free-N3-01
- 2026-09-30T01:36:42-03:00 · NOTIF-12 · IN-PROGRESS · NOTIF-12 r0 dispatched (pm-unit begin) · token ls-66cd28cc51
- 2026-09-30T02:33:09-03:00 · NOTIF-12 · DONE · NOTIF-12: add dormant transactional notification outbox · token 6e29a706c163
- 2026-09-30T02:33:09-03:00 · PM · TODO · N3-02 is free again: N3-01 finished. · token 6e29a706c163-free-N3-02
- 2026-09-30T02:35:26-03:00 · NOTIF-06 · IN-PROGRESS · Reopen N1-03 for the release-requested current-main rebuild; r1 approval and commit remain preserved · token ls-0dda282e71
- 2026-09-30T02:49:43-03:00 · NOTIF-13 · IN-PROGRESS · NOTIF-13 r0 dispatched (pm-unit begin) · token ls-86e6a189d2
- 2026-09-30T04:15:03-03:00 · NOTIF-13 · DONE · NOTIF-13: unify email rendering and sender validation · token 3deb245e5aa1
- 2026-09-30T04:15:03-03:00 · PM · TODO · N3-03 is free again: N3-02 finished. · token 3deb245e5aa1-free-N3-03
- 2026-09-30T04:32:20-03:00 · NOTIF-06 · DONE · NOTIF-06: rebuild notification email preference precedence on current main · token 8cd2c4f543c0
- 2026-09-30T04:41:50-03:00 · NOTIF-14 · IN-PROGRESS · NOTIF-14 r0 dispatched (pm-unit begin) · token ls-d0fe4f019e
- 2026-09-30T06:13:46-03:00 · NOTIF-14 · DONE · NOTIF-14: worker core · token 7706c0847820
- 2026-09-30T06:13:46-03:00 · PM · TODO · N3-04 is free again: N3-03 finished. · token 7706c0847820-free-N3-04
- 2026-09-30T06:22:32-03:00 · NOTIF-15 · IN-PROGRESS · NOTIF-15 r0 dispatched (pm-unit begin) · token ls-9f39e940e0
- 2026-09-30T07:49:53-03:00 · NOTIF-15 · DONE · NOTIF-15: worker failure semantics · token 42080a40e34c
- 2026-09-30T07:49:53-03:00 · PM · TODO · N3-05 is free again: N3-04 finished. · token 42080a40e34c-free-N3-05
- 2026-09-30T08:01:02-03:00 · NOTIF-16 · IN-PROGRESS · NOTIF-16 r0 dispatched (pm-unit begin) · token ls-7d50a35f94
- 2026-09-30T11:03:58-03:00 · NOTIF-16 · DONE · NOTIF-16: versioned notification unsubscribe · token 7a8f66378a9c
- 2026-09-30T11:03:58-03:00 · PM · TODO · N3-06 is free again: N3-05 finished. · token 7a8f66378a9c-free-N3-06
- 2026-09-30T11:26:10-03:00 · NOTIF-17 · IN-PROGRESS · NOTIF-17 r0 dispatched (pm-unit begin) · token ls-d47856e3b3
- 2026-09-30T14:08:54-03:00 · NOTIF-17 · DONE · NOTIF-17: suppress bounced notification addresses · token 06d0ecd35ce3
- 2026-09-30T14:08:54-03:00 · PM · TODO · N3-07 is free again: N3-06 finished. · token 06d0ecd35ce3-free-N3-07
- 2026-09-30T14:19:08-03:00 · NOTIF-18 · IN-PROGRESS · NOTIF-18 r0 dispatched (pm-unit begin) · token ls-e05a3c1673
- 2026-09-30T15:09:11-03:00 · NOTIF-18 · DONE · NOTIF-18: mirror notification mail in local E2E · token 29ce02ce82cb
- 2026-09-30T15:09:11-03:00 · PM · TODO · N4-01 is free again: N3-07 finished. · token 29ce02ce82cb-free-N4-01
- 2026-10-02T12:00:00-03:00 · PM · NOTE · NOTIF-04 and 06–18 brought onto one branch fix/notif-line on current main (by hand, Claude); 04/06 from fix/notif06-rb, 07–18 replayed from fix/notif13-render; events from both old checkouts merged here
