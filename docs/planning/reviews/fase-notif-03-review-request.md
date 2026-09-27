# Review request — NOTIF N0-03 (notification insert boundary)

- **Branch:** `fix/notif02-main` · **Base/HEAD:** `26d9935294634f4a3c8297f8f751c906b4f0f2ef` · **Commits:** 0 by the executor (the PM commits the approved receipt)
- **Unit:** NOTIF-03 r0 · ledger item N0-03 · plan `docs/planning/notifications-plan-2026-09-26.md` (N0-03), approved plan revision 1
- **Migration authorship:** DB-agent subagent (sha256 `72bdea2e…a215c9`, ownership statement and concerns in the run evidence `db-agent-authorship.md`). The executor wrote the pgTAP suite, the browser spec and these docs.

## Objective and scope (from the order)
Revoke create_notification_safe from PUBLIC, anon and authenticated; remove anon grants and authenticated INSERT on public.user_notifications; replace permissive INSERT policies so only service_role can insert. Preserve service-role creation and browser notification reads/own updates. Inventory browser insert paths before changing grants.

- **In:** the migration, pgTAP `097`, browser spec `tests/e2e/notification-insert-boundary.spec.ts`, `docs/planning/notifications-browser-insert-inventory.md`, this file.
- **Out:** outbox, preferences, delivery, production rollout, unrelated cleanup.

## What the migration does (4 statements, additive)
1. `REVOKE ALL ON FUNCTION create_notification_safe(…) FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO service_role`.
2. `REVOKE ALL ON TABLE user_notifications FROM anon`, then `REVOKE INSERT … FROM authenticated`. SELECT, UPDATE and DELETE stay.
3. `ALTER POLICY "System can insert notifications" … TO service_role`. It was `PUBLIC … WITH CHECK (true)`.
4. `CREATE POLICY user_notifications_insert_service_role_only AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)`.

## Files by risk
- **High:** `supabase/migrations/20260927080000_notification_insert_boundary.sql`. It changes grants and policies on a live table read by every signed-in user's bell.
- **Medium:** `supabase/tests/097-notification-insert-boundary.sql`, a new 50-assertion suite covering the role × operation matrix plus catalog checks.
- **Low:** `tests/e2e/notification-insert-boundary.spec.ts`, a self-contained synthetic spec. Not added to the CI mandatory list.
- **Docs:** `docs/planning/notifications-browser-insert-inventory.md` and this file.

## Test evidence (local, isolated stack `notif03isolated` on 54921/54922, synthetic only)
- **Fail-on-old:** `097` on the pre-migration schema fails 22 of 50. That run used an earlier revision of the file, differing only in `plan()` and two expected messages.
- **After the migration:**
  - focused `097`: 50/50 PASS;
  - full pgTAP: 52 files, 5197 tests, PASS (baseline 51 files, 5147).
- **Browser** (`pm-unit ui-run … npx playwright test tests/e2e/notification-insert-boundary.spec.ts`), 3/3 passed:
  - **Desktop 1366×768:** the owner sees their own 3 notifications and not the other user's. Clicking one marks it read in the database, and the badge goes from 3 to 2.
  - **Desktop, insert attempts:** made from the page with the user's JWT, a REST insert (own, other user) and the RPC each return 403 / `42501`, and no row lands.
  - **Mobile 390×844:** "Marcar todas" marks all of the owner's rows read and none of the other user's.
  - **Mobile, empty and error states:** the empty state shows; a forced 500 shows "Error al cargar", and "Reintentar" recovers.
  - **Isolation:** every browser `user_notifications` request went to `127.0.0.1:54921`.
- **Gates:** type-check, lint, `npm test` and build are recorded in the executor report, with the baseline beside each.

## Where to look hardest
1. **Restrictive policy instead of replacing the FOR ALL policies.** `user_notifications_user_own` and `user_notifications_admin_all` are permissive `FOR ALL` and still name INSERT. The additive-only rule and the DROP guard forbid dropping them, so a RESTRICTIVE `WITH CHECK (false)` insert policy neutralises them. pgTAP re-adds the INSERT grant inside the transaction and proves RLS still refuses. Check that this meets "no permissive INSERT policy" in spirit.
2. **Anon lost SELECT/UPDATE/DELETE too.** The order said "remove anon grants". Anon reads used to return empty and now return `42501`. The inventory found no browser path that queries without a session. One dead server route (`pages/api/notifications/mark-read.ts`) runs as anon and will turn from a silent no-op into a 500 (inferred, not exercised).
3. **`create_notification_safe` stays SECURITY INVOKER with no pinned `search_path`.** It is now service_role only. The r2 precedent also pinned `search_path` for `create_user_notification`; this migration did not, because the order did not ask for it.
4. **Test-only `GRANT`/`REVOKE` inside pgTAP 097.** They run in the rolled-back transaction, so they do not persist.
5. **Spec fixtures.** Synthetic users, a `qa` school and service-role rows are created in `beforeAll` and deleted by id in `afterAll`. Row counts of every public table plus `auth.users` were identical before and after each run.

## Known limitations / deferred
- `authenticated` keeps TRUNCATE, REFERENCES and TRIGGER on the table (baseline `GRANT ALL`); PostgREST cannot issue them.
- Own-notification content (title and description) is still editable by its owner.
- Pre-existing bell copy issues: "notificaciónes", the English error text, and the error state stacked above the empty state.
- The order's exact `--db-url` fails TLS against a local stack unless `PGSSLMODE=disable` is set in the environment. The final runs used the exact URL with that env prefix.
- Production application of the migration remains Brent's post-merge step.
