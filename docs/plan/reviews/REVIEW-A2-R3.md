# CODEX REVIEW — A2 round 3 (§1.5 scoped confirmation)

VERDICT: PASS

The sole round-2 residue is closed. The migration now implements the binding
grant-list posture, the privilege pins inspect PostgreSQL's real ACL instead of
the SQL-standard information-schema view, the PostgreSQL 15.8 skip path is
sound, and CI Gate 3 is green on fix commit `e13adfb`. No round-3 change
introduced a new finding.

BLOCKING:

- None.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- Round-2 `[B3]` is **CLOSED** —
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:142-148` now
  executes `REVOKE ALL` for `anon`, `REVOKE ALL` for `authenticated`, and then
  grants back only `SELECT` to `authenticated`. `service_role` is untouched.
  This is the grant-list form bound for B3's five email tables.
- The grant-set pins are now structurally appropriate —
  `supabase/tests/030-pasantias-leads-rls.sql:100-118` reads
  `pg_class.relacl` through `aclexplode`, so PostgreSQL-specific privileges such
  as `MAINTAIN` are visible. A clean local `supabase db reset` on PostgreSQL
  17.6 followed by independent inspection produced no anon ACL entry,
  `authenticated={SELECT}`, and full owner/service-role privileges including
  `MAINTAIN`. Effective checks returned false for anon/authenticated MAINTAIN
  and true for authenticated SELECT.
- Asserts 8–9 exercise the real finding on local and CI, not a simulated branch.
  Independent `npm run test:db` after that clean reset passed **5 files / 58
  assertions**, including 32/32 in `030-pasantias-leads-rls.sql`; the database
  reported PostgreSQL 17.6 (`server_version_num = 170006`). The final ledger's
  correction therefore properly supersedes the earlier PG15 local/CI premise.
- The sub-17 guard at
  `supabase/tests/030-pasantias-leads-rls.sql:130-165` is sound. I independently
  ran the same wrapper and CASE expressions in a disposable Supabase PostgreSQL
  15.8 container. Creating `pg_temp.lacks_maintain()` did not evaluate its body;
  both false CASE branches returned valid TAP records:
  `ok 1 # SKIP ... server is 15.8` and `ok 2 # SKIP ... server is 15.8`, followed
  by a clean `finish()`. Thus the production-version host never calls
  `has_table_privilege(..., 'MAINTAIN')`, whose privilege name does not exist
  there.
- GitHub Actions run
  [30705595846](https://github.com/brentcurtis76/fne-lms/actions/runs/30705595846)
  completed successfully for PR #31 with head SHA
  `e13adfb819b6b52dbc283f9df6706eedda7870de`. Gate 3 started a clean PostgreSQL
  **17.6.1.156** database, applied the A2 migration, and passed **5 files / 58
  assertions**. The other five checks in the run also passed.
- Re-review scope is clean. Fix commit `e13adfb` changes only the migration,
  pgTAP suite, refreshed evidence/review request, and its ledger entry. The
  later branch head `396bafd` contains the PM verification and PG-version record
  correction only. No source/API/UI or unrelated schema change entered round 3.
- No §1.5 residue remains for Brent.
