# W-B10a-01 C4 — compensation artifact and rollback-only test — review request

- **Branch:** `fix/b10a-comp` (local only), base `fix/sm09-ci` at `2e119d117`, 1 commit.
- **Authority:** Brent's decision `94d02887658014cb` (2026-09-30, recommendation): "a narrowly scoped plan revision for a dated compensation artifact outside auto-applied migrations and a rollback-only pgTAP test; exact file boundary, independent review, no widening of anon/PUBLIC grants." Worked by hand with Claude on 2026-10-01 (Brent's instruction); Codex reviews.
- **Gate:** W-B10a-01 clause C4 / blocker B10A-G2 (`docs/reviews/w-b10a-01-acceptance-disposition.md` §4). PR #89 already put `20260908180100_b10a_referenced_tables_rls.sql` on `origin/main`, so "written and tested before merge" cannot hold literally; this artifact is the replacement route the decision chose.

## Exact file boundary

| File | Kind |
|---|---|
| `supabase/compensation/20261001180000_b10a_restore_authenticated_reads.sql` | new — operator artifact, **not** under `supabase/migrations/`, never auto-applied; timestamp later than the latest migration `20260926210000` |
| `supabase/tests/074-b10a-compensation-rollback.sql` | new — pgTAP, rolls back |
| `__tests__/supabase/b10a-compensation-sync.test.ts` | new — Vitest: tested SQL == shipped SQL; forbidden-statement scan |
| `docs/planning/reviews/fase-sm-b10a-comp-review-request.md` | this file |

No existing migration, policy, API or page is changed.

## What the artifact does

Four independent, idempotent `DO` blocks — one per table whose legitimate reads B10a narrowed: `group_assignment_discussions`, `growth_community_transformation_access`, `modules`, `qa_tester_time_logs`. Each refuses to run if the table's row security is off, then creates `b10a_compensation_authenticated_read` — `AS PERMISSIVE FOR SELECT TO authenticated USING (true)` — if absent. That restores the read `authenticated` had before B10a, for the one table an operator applies it to.

It never: drops, truncates, disables RLS, grants, touches anon/PUBLIC, or adds a write policy. Row security stays on, so the restrictive `forced_password_change_guard` still applies on top. Excluded on purpose: `instructors` (already readable by all authenticated users) and `propuesta_rate_limits` (service-role only; holds IP addresses — opening it would widen, not restore). Stand-down is `ALTER POLICY … USING (false)` (no DROP).

## Tests

- **pgTAP 074** (33 assertions, `BEGIN … ROLLBACK`): before — an outsider docente reads none of the four fixture rows; the artifact's block runs verbatim; after — exactly one SELECT-only/authenticated/permissive policy per table, RLS still on, restrictive guard still present, anon has no SELECT; instructors/propuesta untouched and propuesta still closed to authenticated; the outsider now reads each row but still cannot UPDATE/DELETE/INSERT; a must-change-password account still reads nothing; re-running a block is a no-op. **NOT YET RUN** — needs Brent's SM-K021 decision and a disposable stack on non-default ports (SM-K017).
- **Vitest sync** (3/3 pass locally): the `BEGIN/END COMPENSATION` region of the artifact and of pgTAP 074 are byte-identical (`supabase test db` mounts only `supabase/tests`, so `\ir` cannot reach the artifact — see the note in pgTAP 002); no DROP/TRUNCATE/DISABLE RLS/GRANT/anon/PUBLIC outside comments; exactly 4 policies, all `FOR SELECT TO AUTHENTICATED USING (TRUE)`.

## Scrutinize hardest

1. **Is "authenticated may read everything" the right restore?** It is the pre-B10a state for reads, but for `qa_tester_time_logs` and `growth_community_transformation_access` it is broader than any legitimate consumer needs. Alternative: per-consumer narrower policies (more code, more ways to be wrong in an emergency).
2. **Guard interaction**: confirm the restrictive guard really ANDs with a new permissive policy (3c asserts it for a flagged user).
3. **pgTAP fixtures**: written against 071's fixture shapes; not yet executed — check column names/constraints and the `pg_policies.qual = 'true'` comparison.
4. **CLAUDE.md "DB agent owns migrations"**: this is not a migration, but it is hand-written SQL meant for a production operator. Is the header's procedure enough?

## Not covered / still open for W-B10a-01

- G1 (missing pgTAP cells), G3 (Privacy sign-off — draft prepared for Brent), G4 (Production application state — Brent's decision) remain open; W-B10a-01 stays held until all four gates are met and accepted.
