# Review request — NOTIF N0-02 (messaging/mention and messaging/send containment)

- **Branch:** `fix/notif02-redo` · **Base:** `cd1424dbc12042e36eb7495f5ef4546482e07f02` (fetched `origin/main`, 2026-09-27) · **Commits:** 0 by the executor (the PM commits the approved receipt)
- **Unit:** NOTIF-02 r3 (current-main rebuild of the seven-path change approved in r2 on `fix/notif02-main` at `6dd3f072d`, which pm-ship set aside because that branch's ledger history did not fit main; r0 was reviewed on `ws/notifications` at `c16eff946`, r1 rebuilt it on `4376075f`, r2 added the fix for review finding N2-R1-01) · ledger item N0-02 · plan `docs/planning/notifications-plan-2026-09-26.md` (D8)
- **Rebuild:** main has not changed any of the seven paths between `4376075f` and `cd1424dbc`; the six product and test files were re-applied to the working tree byte-identical to `6dd3f072d` (no history copied), and only this file changed. The routes' callers (`lib/services/feedService.ts` is still the only UI caller of mention; send has no UI caller) and the `lib/api-auth` / `NotificationService.triggerNotification` interfaces they use are unchanged on main. The one compatibility difference on this base is that `lib/notificationService.ts` now carries N0-01 (see limitations); it needed no adaptation.
- **r2 (N2-R1-01):** a mention denied after the post saved was silent to the author. The feed caller now shows one fixed es-CL toast, "Tu publicación se guardó, pero no pudimos enviar la notificación de mención.", when any mention notification call fails (non-2xx, thrown request, or no session). The post is still returned and shown.

## Objective and scope (from the order)
Contain the two live messaging notification endpoints. After authentication, use saved message/post/mention records to derive the notification target and safe content, and verify actor and recipient membership in the same authorized scope before any service-role write or notification. Keep existing message and mention journeys usable.

- **In:** `pages/api/messaging/mention.ts`, `pages/api/messaging/send.ts`, the feed caller `lib/services/feedService.ts`, focused route tests, one browser spec, this file.
- **Out:** DB grants/RLS/migrations (N0-03), workspace mention/reply migration (N2-03), message UI redesign, catalog/preferences/outbox, real email, broad messaging refactoring.

## Files by risk
**High — authorization on service-role writes**
- `pages/api/messaging/mention.ts` — rewritten. Caller sends only `discussion_id` (post id) + `mentioned_user_id`; `context` must be absent or `community_post`. Checks: post exists and not archived (404), caller is `author_id` (403), a persisted `post_mentions` row links post → user (404), `can_access_workspace` true for author and recipient on the post's workspace (403). Only then the `user_mentions` insert (no client content stored) and a generic `user_mentioned` notification (`content_preview` fixed text, server `workspace_id`, author name from the author's profile). An already-recorded mention returns 200 without notifying again.
- `pages/api/messaging/send.ts` — rewritten. Sender is always the caller. With `thread_id`: thread must exist (404) and both users pass `can_access_workspace` on its workspace (403). Without it: both must hold an active `user_roles` row sharing a `community_id` or `school_id` (403). `context` is derived server-side (`workspace_thread` / `direct_message`). Notification text is fixed (`Tienes un nuevo mensaje`); body and subject never reach it. `notification_sent` is set only when the service reports ≥1 notification created and the update succeeds.

**Medium**
- `lib/services/feedService.ts` — the mention call no longer sends the post text. On a failed notification call (non-2xx, thrown, no session) it shows one fixed es-CL `toast.error` after the loop. The post is still returned. Logs are constant lines plus the HTTP status, with no response body, ids or raw errors.
- Both routes: `getApiUser` (Bearer or cookie) + forced-password-change gate, es-CL error messages, constant log lines (no ids, raw errors or exception text).

**Low — tests/docs**
- `__tests__/api/messaging/mention.test.ts` (29), `__tests__/api/messaging/send.test.ts` (28), `tests/e2e/messaging-notifications.spec.ts` (2), this file.

## Test evidence
- Focused Vitest: 2 files, 57 passed (mention 29, send 28) — rows D1–D5 incl. cross-scope, forged author/recipient/context/content, fault injection with synthetic secrets checked against responses and captured logs. r2 adds 4 caller tests (`UI2 · feed composer caller after the post is saved`). They drive `FeedService.createPost` with its fetch routed to the real mention handler: denial 403 → notice, accepted → no notice, thrown request → notice, no session → notice. With the toast call removed, 3 of them fail.
- Browser (`pm-unit ui-run`, local dev server, loopback DB): 2 passed — UI1 desktop 1366×768 real composer mention, tampered request, one generic notification for the recipient, none for the outsider; UI2 mobile 390×844 anonymous 401, other-school replay 403, forged saved mention → 403, forged target without saved mention → 404, keyboard submit and focus after reload. After the 403, the post is visible and the `role=status` toast shows exactly the fixed notice, with no server error text. UI1 shows no notice. r3 evidence: the `RUN/ui/<run>/` directory named in `RUN/executor-report-r3.md`, produced on this exact seven-path state.
- Full gates: see the executor report (`RUN/executor-report-r3.md`) for counts; build needs synthetic loopback public env, as at baseline.

## Where to look hardest
1. **The no-thread scope rule in `send.ts`** — "shared active community or school" is my reading of the order's "school/community/thread scope"; it has no UI caller today (only a QA index reference), so nothing exercises it outside unit tests. An admin with no school/community row cannot direct-message anyone (deny-safe, possibly stricter than wanted).
2. **`can_access_workspace` as the membership oracle** — called on the service-role client, where `auth_actor_bound` treats the backend principal as trusted. It also returns true for any active admin and for consultors of the owning school.
3. **Replay guard in `mention.ts`** — a small pre-insert lookup on `user_mentions`; not race-proof (two concurrent calls can both notify). Real idempotency stays with N2-01.
4. **Browser spec fixtures** — it depends on local-only rows (admin community role, `user_mentioned` catalog/preference rows with e-mail off) and on a populated `user_roles_cache`, all outside the CI seed; it is not in the mandatory CI list.
5. **Author name in the mention notification** — still read from the author's own profile (server-side), not generic.
6. **r2 notice scope** — the notice fires on any failed notification call, not only 403. A 200 with `notificationSent:false` (service failure or replay) shows no notice, because the route reports those as a successful save.

## Known limitations / deferred
- Pre-existing, not fixed here: non-admin users cannot use the mention picker (profiles RLS allows only own/admin reads, so `search-users` returns nothing); `CreatePostModal` crashes if a key is pressed before the suggestion popup opens (`component`/`popup` undefined in `onKeyDown`/`onExit`); the local `/notifications` page stays on "Verificando sesión..."; the local stack ships `user_roles_cache` unpopulated.
- A post whose mentions fail authorization is still published (by design). Since r2 the author sees the fixed notice that the notification failed.
- Workspace (thread) mentions/replies remain client-side until N2-03; DB grants until N0-03.
- `lib/notificationService.ts` on this base carries N0-01 (merged to main in PR #123): `triggerNotification` no longer logs its `eventData`, service errors are logged as a SQLSTATE/PostgREST code only, and `NOTIFICATION_EMAIL_ENABLED` gates immediate e-mail. The r1/r2 limitation about service-internal logging is closed here; the routes themselves still log only constant lines.
