# W-B10a-01 C4 — compensation artifact and rollback-only test — review request

- **Branch:** `fix/b10a-comp` (local only), base `fix/sm09-ci` at `2e119d117`, 4 commits (artifact+tests, Privacy sign-off record, pgTAP role-reset fix, round 1 answering Codex r0 APPROVED_WITH_NOTES).
- **Authority:** Brent's decision `94d02887658014cb` (2026-09-30, recommendation): "a narrowly scoped plan revision for a dated compensation artifact outside auto-applied migrations and a rollback-only pgTAP test; exact file boundary, independent review, no widening of anon/PUBLIC grants." Worked by hand with Claude on 2026-10-01 (Brent's instruction); Codex reviews.
- **Gate:** W-B10a-01 clause C4 / blocker B10A-G2 (`docs/reviews/w-b10a-01-acceptance-disposition.md` §4 — not on this branch yet: it is the uncommitted SM-34 evidence kept with the SM-34 run records (branch `fix/pc03`, accepted predecessor commit `b1b17a0a0`)). PR #89 already put `20260908180100_b10a_referenced_tables_rls.sql` on `origin/main`, so "written and tested before merge" cannot hold literally; this artifact is the replacement route the decision chose.

## Exact file boundary

| File | Kind |
|---|---|
| `supabase/compensation/20261001180000_b10a_restore_authenticated_reads.sql` | new — operator artifact, **not** under `supabase/migrations/`, never auto-applied; timestamp later than the latest migration `20260926210000` |
| `supabase/tests/074-b10a-compensation-rollback.sql` | new — pgTAP, rolls back |
| `__tests__/supabase/b10a-compensation-sync.test.ts` | new — Vitest: tested SQL == shipped SQL; forbidden-statement scan |
| `docs/planning/reviews/fase-sm-b10a-comp-review-request.md` | this file |
| `docs/reviews/w-b10a-01-privacy-signoff-2026-10-01.md` | Brent's dated Privacy sign-off (B10A-G3) + a later factual correction |

No existing migration, policy, API or page is changed.

## What the artifact does

Four independent, idempotent `DO` blocks — one per table whose legitimate reads B10a narrowed: `group_assignment_discussions`, `growth_community_transformation_access`, `modules`, `qa_tester_time_logs`. Each refuses to run if the table's row security is off, then creates `b10a_compensation_authenticated_read` — `AS PERMISSIVE FOR SELECT TO authenticated USING (true)` — if absent. That restores the read `authenticated` had before B10a, for the one table an operator applies it to.

It never: drops, truncates, disables RLS, grants, touches anon/PUBLIC, or adds a write policy. Row security stays on, so the restrictive `forced_password_change_guard` still applies on top. Excluded on purpose: `instructors` (already readable by all authenticated users) and `propuesta_rate_limits` (service-role only; holds IP addresses — opening it would widen, not restore). Stand-down is `ALTER POLICY … USING (false)` (no DROP); a re-run then raises and names the reactivation command instead of silently doing nothing. On `growth_community_transformation_access` the later restrictive school-scope policy (W-B10a-02) still applies, so the restore is "every signed-in user except an `equipo_directivo`-only actor outside their schools".

## Tests

- **pgTAP 074** (38 assertions, `BEGIN … ROLLBACK`): before — an outsider docente reads none of the four fixture rows; the artifact's block runs verbatim; after — exactly one SELECT-only/authenticated/permissive policy per table, RLS still on, restrictive guard still present, anon has no SELECT; instructors/propuesta untouched and propuesta still closed to authenticated; the outsider now reads each row but still cannot UPDATE/DELETE/INSERT; a must-change-password account still reads nothing; re-running the whole region is a no-op; the W-B10a-02 school boundary still holds for `equipo_directivo`-only actors (same school 1, other school 0); stand-down → re-run raises with the reactivation command → `ALTER POLICY … USING (true)` reactivates. **Run 2026-10-01: 38/38 PASS** (round 1; round 0 was 33/33), with 000-setup and 071 **201/201** still passing, on a disposable stack `sm1001disposable` (API 127.0.0.1:55021, DB 127.0.0.1:55022, all SM migrations through `20260926210000` applied fresh, no seed). Brent authorised synthetic local accounts on 2026-10-01. Residue after the run: 0 compensation policies, 0 `b10c_%` users, 0 fixture schools (the file rolls back).
- **Vitest sync** (5/5): the artifact holds exactly one marked region and only comments outside it; pgTAP 074 carries that region twice and the modules block once, all identical to the artifact (`supabase test db` mounts only `supabase/tests`, so `\ir` cannot reach the artifact — see the note in pgTAP 002); no DROP/TRUNCATE/DISABLE RLS/GRANT/anon/PUBLIC outside comments; exactly 4 policies, all `FOR SELECT TO AUTHENTICATED USING (TRUE)`.

## Scrutinize hardest

1. **Is "authenticated may read everything" the right restore?** It is the pre-B10a state for reads, but for `qa_tester_time_logs` and `growth_community_transformation_access` it is broader than any legitimate consumer needs. Alternative: per-consumer narrower policies (more code, more ways to be wrong in an emergency).
2. **Guard interaction**: confirm the restrictive guard really ANDs with a new permissive policy (3c asserts it for a flagged user).
3. **pgTAP assertions**: check the `pg_policies.qual = 'true'` comparison and that 3c really exercises the guard (the flagged account is a profile with `must_change_password = true`).
4. **CLAUDE.md "DB agent owns migrations"**: this is not a migration, but it is hand-written SQL meant for a production operator. Is the header's procedure enough?

## Not covered / still open for W-B10a-01

- G1 (missing pgTAP cells) and G4 (Production application state — Brent's decision) remain open; G3 is now met by Brent's dated sign-off `docs/reviews/w-b10a-01-privacy-signoff-2026-10-01.md` (2026-10-01). W-B10a-01 stays held until all four gates are met and accepted.
