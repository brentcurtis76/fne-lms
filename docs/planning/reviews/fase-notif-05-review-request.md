# Review request — NOTIF N1-02 (category-preference storage)

- **Branch:** `fix/notif02-redo` · **Base/HEAD:** `8af103ad4ed73afcbcdf4198040aec500b2b882c` · **Commits:** 0 by the executor (the PM commits the approved receipt)
- **Unit:** NOTIF-05 r0 · ledger item N1-02 · plan `docs/planning/notifications-plan-2026-09-26.md` (D2), approved plan revision 1
- **Migration authorship:** DB-agent subagent, two revisions. Final sha256 is `e6c58659…891a3e`. The ownership statement and concerns are in the run evidence `db-agent-authorship.md`. The executor wrote the pgTAP suite and this file.

## Objective and scope (from the order)
Add D2 storage: `public.user_notification_category_prefs` holds one row per `(user_id, category)`, with `email_mode` one of default/immediate/digest/off. RLS lets an authenticated user manage only their own rows, and service_role stays available for future server flows. No resolver, API, UI or delivery change.

- **In:** the migration, pgTAP `098`, this file.
- **Out:**
  - precedence resolution (N1-03);
  - API and UI (N4-01/02);
  - the legacy `user_notification_preferences` table (untouched);
  - catalog and app code, send behaviour, production rollout.

## What the migration does (additive)
1. **Create the table** with columns `user_id` (FK `profiles(id)` ON DELETE CASCADE), `category`, `email_mode` (default `'default'`), `created_at` and `updated_at`, all NOT NULL.
   - PK `(user_id, category)`.
   - CHECK constraints for the eight `NotificationCategory` values (`lib/notifications/catalog.ts`) and the four modes.
2. `ENABLE ROW LEVEL SECURITY`.
3. `apply_forced_password_change_guard(...)`, the repo-wide restrictive guard. pgTAP `053` requires it on every row-secured public table.
4. A `BEFORE UPDATE` trigger using the existing SECURITY INVOKER `update_updated_at_column()`.
5. **Grants:**
   - `REVOKE ALL … FROM PUBLIC, anon, authenticated`;
   - `GRANT SELECT, INSERT, UPDATE, DELETE` to authenticated and to service_role.
6. **Four permissive owner policies**, `TO authenticated`, each `(SELECT auth.uid()) = user_id`. UPDATE checks both USING and WITH CHECK. There is no admin, anon or PUBLIC policy.
7. A table comment.

## Files by risk
- **High:** `supabase/migrations/20260928100000_user_notification_category_prefs.sql` (75 lines). It creates a new table and its privilege boundary. No existing object is changed.
- **Medium:** `supabase/tests/098-notification-category-prefs.sql` (523 lines, `plan(69)`), covering catalog/ACL checks and the role × operation matrix.
- **Docs:** this file.

## Test evidence (isolated stack `notif05isolated`, API 55031 / DB 55032, synthetic only)
- **Fail-on-old:** on the pre-migration schema `098` dies at assertion 2 ("relation does not exist"). That run used an earlier file revision (`plan(69)`, before the t/f literal fix).
- **After the migration:**
  - focused `098`: 69/69 PASS;
  - full pgTAP: 53 files, 5266 tests, PASS (baseline 52 files / 5197).
- **Mutation checks** on the disposable DB, each restored afterwards:
  - `update_own WITH CHECK (true)` fails test 15;
  - `GRANT SELECT TO anon` fails tests 9, 13 and 28;
  - `select_own USING (true)` fails tests 22, 32 and 39.
- **Gates:** type-check, lint, `npm test`, build (synthetic loopback env), `guard:migrations` and `test:db` are recorded in the executor report, with the baseline beside each.

## Row map (TAP test numbers in `098`)
- **D1 schema/ACL:**
  - 1–18: table, RLS, columns, NOT NULL, PK, FK+cascade, CHECK names, default, ACL and policy checks;
  - 49 and 53: the eight categories × four modes are accepted;
  - 65–66: forced-password guard probes;
  - 67–68: the cascade;
  - 69: RLS still enabled.
- **D2 owner matrix (19–27):** insert with default, insert non-default, select-own, default→immediate, digest→default, upsert, delete and persistence.
- **D3 negative matrix:**
  - 28–31 anon: SELECT/INSERT/UPDATE/DELETE each raise `42501` (no grant);
  - 32–38 authenticated cross-user: read 0, INSERT and upsert throw, UPDATE/steal/DELETE return 0, transfer throws;
  - 39–43 admin (with `user_roles` admin row and admin JWT claims): the same outcomes;
  - 44: full state is unchanged after every denied attempt.
- **D4 service_role and bypass:**
  - 45–48 and 52: service_role reads, inserts, updates and deletes any row;
  - 9–13: no PUBLIC/anon table or column ACL;
  - 16–18: no function body references the table, no view depends on it, and its only trigger is SECURITY INVOKER.
- **D5 counterexamples:**
  - 50–51 and 54–63: unknown/case-variant/event-type category and unknown mode give `23514`; NULLs give `23502`; a duplicate pair or rename-into-pair gives `23505`; a missing profile gives `23503`;
  - 38, 43, 44 and 64: denied transfers, and the owner's rows unchanged.

## Where to look hardest
1. **Transfer denial has two layers.** WITH CHECK on `update_own` blocks a transfer, and so does Postgres checking the updated row against the SELECT policy. Mutation 1 therefore fails only the structural assertion, not the behavioural one. Check that relying on the structural check is acceptable.
2. **The forced-password guard was added after the order was written.** The order did not name it, but the repo's `053` catalog invariant fails CI without it. With the guard, flagged users cannot read or write their own preferences, and 098 asserts this.
3. **The category list is hard-coded in a CHECK.** A future category needs a constraint swap, which the additive-only/DROP guard makes awkward (DB-agent concern 1).
4. **service_role keeps TRUNCATE/REFERENCES/TRIGGER** from Supabase default privileges. The order only asked that it "remain available".
5. **Anon gets `42501`, not empty results**, because there is no grant at all. This is stricter than the order's "blocked UPDATE/DELETE return empty", which applies to authenticated.

## Known limitations / deferred
- No caller exists yet (verified by repo grep), so there is no UI or browser evidence; N1-03/N4 own that.
- `098` depends on the `tests` helper schema from `000-setup.sql`, so run it after the full suite on a fresh DB.
- The order's exact `--db-url` needs `PGSSLMODE=disable` against a local stack.
- Size: 75 product lines plus the 523-line required test matrix, over the ~400-line guideline.
- Production application of the migration remains Brent's post-merge step.
