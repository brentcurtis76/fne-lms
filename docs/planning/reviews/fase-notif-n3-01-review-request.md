# Review request — NOTIF N3-01 (dormant email outbox and atomic enqueue RPC)

- **Branch:** `fix/notif02-redo` · **Base:** HEAD `3bca527e2f73581f77cd938a36fd51614139c760` (merge-base with `main` `49814091a2df`, 251 commits ahead) · **Commits:** 0 by the executor (the PM commits the approved receipt)
- **Unit:** NOTIF-12 r1 (r0 returned FINDINGS: the approved RPC must read `user_notification_category_prefs`, and the old 098 assertion forbade every function from doing so) · ledger item N3-01 · plan `docs/planning/notifications-plan-2026-09-26.md`
- **Authorship:** the migration SQL was authored by the repo's DB agent in r0 (a dedicated Claude Code subagent, under AGENTS.md) and is unchanged in r1. r1 changed only pgTAP (098 one assertion, 099 six new D3 assertions) and this file.

## Objective and scope (from the order)
Finish the outbox table and service-role-only `enqueue_notification` RPC with independently conditional, atomic in-app and email rows. Update the single 098 assertion so it permits exactly this RPC (SECURITY INVOKER, pinned search path, EXECUTE for service_role only) and still fails on any other function exposure.

- **In:** `supabase/migrations/20260930010000_notification_email_outbox.sql`, `supabase/tests/099-notification-email-outbox.sql`, `supabase/tests/098-notification-category-prefs.sql`, this file.
- **Out:** producer rewiring, worker/cron, renderer, unsubscribe, digest, UI, flag cutover. `NOTIFICATION_OUTBOX_DELIVERY` stays unset; no application code calls the RPC or touches the table.

## Files by risk
**High — new privileged DB objects**
- `supabase/migrations/20260930010000_notification_email_outbox.sql` (new, additive). Table `notification_email_outbox`: RLS enabled immediately plus the forced-password guard; REVOKE ALL from PUBLIC/anon/authenticated; `notification_id` nullable (FK ON DELETE SET NULL) for email-only rows; UNIQUE `idempotency_key`; worker fields (status, lease, attempts, encrypted `send_snapshot` that a CHECK forbids on terminal statuses). RPC `enqueue_notification(...)`: SECURITY INVOKER, `search_path=''`, fully qualified names, EXECUTE for service_role only; validates input with 22023 messages that echo no values; resolves email precedence as `resolve-preference.ts` (mandatory → non-default category mode → legacy suppression → unmapped immediate → catalog default); writes the bell row only when legacy `in_app_enabled` is not false and the outbox row only when the mode is not `off`, both `ON CONFLICT DO NOTHING` under the live `notif-` key.

**Medium — security regression test**
- `supabase/tests/098-notification-category-prefs.sql`: the "no function references the table" assertion now lists every referencing function as `schema.name(args):secdef:proconfig:{EXECUTE grantees other than owner}` and expects exactly the single RPC entry with `f`, `{"search_path=\"\""}` and `{service_role}`. A NULL ACL is expanded to the PUBLIC default. Plan count unchanged (69).

**Low — tests/docs**
- `supabase/tests/099-notification-email-outbox.sql` (new, 83 assertions; r1 added 6 D3 retry cases), this file.

## Test evidence
- Focused pgTAP on the isolated stack (`--workdir …/runs/NOTIF-10/db-notif10`, DB 127.0.0.1:55062), migration applied with `supabase migration up --local` (schema_migrations 69 rows, newest `20260930010000`): 099 83/83, 098 69/69; `Files=2, Tests=152, PASS`.
- Full pgTAP on the same applied stack: `Files=55, Tests=5394, PASS` (baseline on the unapplied state: only 099 failed, as expected).
- 098 mutation check (rolled back): an extra PUBLIC-executable function reading the table, EXECUTE granted to anon/authenticated/PUBLIC, SECURITY DEFINER and a reset search_path each change the observed value, so the assertion fails in every case.
- Unit (`npm test`), type-check, lint, build and `guard:migrations`: exact counts and exits in `RUN/executor-report-r1.md`. No TS/JS file changed.

## Where to look hardest
1. **The 098 allow-list shape.** It keys on `prosrc ILIKE`, as the original did, so a SQL-standard `BEGIN ATOMIC` function (empty `prosrc`) would not be seen. This gap predates r1.
2. **Channel precedence vs `resolve-preference.ts`.** Legacy `meeting_finalized` any-row suppression, the unmapped `general` bell category, and in-app off only on explicit `in_app_enabled=false` are mirrored by hand, not shared code.
3. **Retry semantics.** Retries never modify an existing outbox row: after in-app is re-enabled, the new bell row is not linked back (`notification_id` stays NULL). After a preference change the RPC returns the newly resolved `email_mode`/`email_reason`, while the stored row keeps the original. The stored row is the authority for the future worker.
4. **Failed preference read fails both channels.** The whole call rolls back, unlike the live path, which still writes the bell row. N5-02 must choose a retry policy.
5. **service_role table privileges.** Supabase default privileges leave service_role with ALL (incl. TRUNCATE/REFERENCES/TRIGGER), as on the neighbouring notification tables. Browser roles have none.

## Known limitations / deferred
- Worker, lease/claim logic, snapshot encryption, digest, unsubscribe and caller wiring are N3-03/N3-04/N5-02.
- A bad `p_notification_type_id` surfaces as FK 23503 rather than 22023 (still fully rolled back).
- `meeting_finalized` is never mailed by the live path; N5-02 must not send it on both paths.
- The migration is applied only to the private `notif10isolated` stack, which is kept for PM review.
