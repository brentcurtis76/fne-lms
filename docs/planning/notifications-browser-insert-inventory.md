# Notifications — browser insert inventory (N0-03)

Date: 2026-09-27 · Unit NOTIF-03 · Migration `supabase/migrations/20260927080000_notification_insert_boundary.sql`

Purpose: before `create_notification_safe` and `user_notifications` INSERT were limited to `service_role`, record every code path that creates notifications or touches the table. Browser-bundled paths must be absent or flagged as affected, so nothing breaks silently.

## Method

- Source search: `rg -n 'create_notification_safe|user_notifications' pages components hooks contexts lib`, plus a whole-repo search that excluded `node_modules`, `.next`, migrations and docs. The second search also covered `utils`, `services`, `scripts` and `tests`.
- Bundle check: the production client bundle (`.next/static`, built with the synthetic local env) was searched for `create_notification_safe` and every `from("user_notifications").<op>`.
- Database check: on the isolated stack, every function whose body names `user_notifications` or `create_notification_safe`, with its `SECURITY DEFINER` flag and whether `authenticated` can execute it. Triggers calling any of them were also listed.

## Results

### `create_notification_safe` (RPC)

| Where | Caller | Effect |
|---|---|---|
| Application code (all dirs) | none | no caller, not affected |
| Client bundle | none | not affected |
| Database functions and triggers | none | not affected |

After the migration only `service_role` can execute it (pgTAP 097 D1; browser spec: the RPC from the page gets 403 / `42501`).

### `user_notifications` INSERT

| Path | Bundled to browser? | Client | Effect |
|---|---|---|---|
| `lib/notificationService.ts:963` (`createNotification`) | No. `lib/qa/index.ts` keeps it out of browser imports on purpose, and the bundle has no insert | service role (`SUPABASE_SERVICE_ROLE_KEY`) or a test-injected client | unchanged |
| `lib/notificationServiceEnhanced.ts:257, 315` | No (no importer outside itself) | service role | unchanged |
| `pages/api/test/notification-preferences.ts:246` | No (API route) | service role (`supabaseAdmin`) | unchanged |
| Browser components, pages, hooks, contexts | none | none | nothing to break |

Client bundle: the only `user_notifications` operations shipped are `select` and `update` (shared chunk used by `ModernNotificationCenter`), plus `select`, `update` and `delete` (`pages/notifications`). The bundle has no `insert`, `upsert` or RPC.

### Browser reads and writes the migration must preserve

| Path | Operation | Role | Status after migration |
|---|---|---|---|
| `components/notifications/ModernNotificationCenter.tsx:77, 98` | own list and unread count | authenticated | preserved (pgTAP D3; browser spec desktop/mobile) |
| `ModernNotificationCenter.tsx:268, 348` | mark one or all read | authenticated | preserved (browser spec: click one on desktop, "Marcar todas" on mobile) |
| `pages/notifications.tsx:78, 183, 201, 224` | list, mark read/unread, delete own | authenticated | preserved (grants and SELECT/UPDATE/DELETE policies untouched; pgTAP D3 covers own update and delete) |
| `pages/api/notifications/index.ts`, `mark-all-read.ts`, `[id]/read.ts`, `pages/api/cron/email-digest.ts`, `pages/api/admin/notification-analytics.ts`, `pages/api/test/notification-triggers.ts` | select/update | service role | unchanged |

### Affected paths (flagged)

1. **`pages/api/notifications/mark-read.ts`: dead route, response changes.** It verifies the bearer token but then updates through `lib/supabase-wrapper`. On the server, that is a `createPagesBrowserClient` with no session, so the request runs as `anon`.
   - **Before:** anon held UPDATE, but the policy `auth.uid() = user_id` matched no row, so the route returned 200 and changed nothing (a silent no-op).
   - **After (inferred from the grants, not exercised):** anon has no grant, so the update raises `42501` and the route returns 500 ("Failed to mark notification(s) as read").
   - **Callers:** none in the repo; the bell uses `/api/notifications/[id]/read` and `/api/notifications/mark-all-read`, which run as service role.
   - **Handling:** recorded here and not changed (outside the N0-03 allowlist). The route is a candidate for the N2-05 dead-code retirement.
2. **Anon reads.** `anon` now gets `42501` on any `user_notifications` query, instead of an empty result. No browser path queries the table without a session: the bell and the page both return early when there is no session.

### Database-side callers (isolated stack, after migration)

| Function | Definer? | authenticated EXECUTE | Relevance |
|---|---|---|---|
| `create_user_notification` | yes | no (already revoked, r2) | still revoked (pgTAP D4) |
| `check_duplicate_notification` | no | yes | read-only helper (SELECT); unaffected |
| `get_unread_notification_count`, `mark_notification_read`, `mark_all_notifications_read` | yes | yes | owner runs them, not affected by browser grants |
| triggers calling any of the above | none | — | — |

## Residual observations (not changed by this unit)

- `authenticated` still holds TRUNCATE, REFERENCES and TRIGGER on `user_notifications` (baseline `GRANT ALL`). RLS does not govern TRUNCATE, but PostgREST cannot issue it. A later additive REVOKE would close it.
- `authenticated` can still edit the title and description of its own notifications through the UPDATE policies. It cannot reassign `user_id` (pgTAP D3).
- Bell copy: "notificaciónes" (misspelled plural), and the error text "Failed to fetch notifications" is English. The error state renders above the empty state. All three were present before this unit.
