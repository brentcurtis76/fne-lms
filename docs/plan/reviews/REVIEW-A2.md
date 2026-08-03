# CODEX REVIEW — A2 round 1

VERDICT: FAIL

A2 gets the planned CRUD posture, consent schema, and D-03 storage boundary
substantially right, and the independent `npm run test:db` run passes 5 files /
47 tests. It is not merge-ready because the claimed SELECT-only database
posture has an untested destructive bypass: Supabase's inherited grants give
both `anon` and `authenticated` `TRUNCATE`, and PostgreSQL RLS does not apply to
`TRUNCATE`. The pgTAP suite also omits the required anon UPDATE and DELETE deny
cases, so it does not prove the full A2 [A4] matrix.

BLOCKING:

- [B1] The table is directly truncatable by both `anon` and `authenticated` —
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:34` and
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:85-108` — the
  migration creates the table under Supabase's default privileges and adds only
  RLS plus a SELECT policy; it never revokes the inherited `TRUNCATE` grant.
  Independent catalog inspection on the branch's local schema showed
  `TRUNCATE` in `information_schema.role_table_grants` for both roles, and the
  following rollback-contained probes both succeeded:
  `SET ROLE authenticated; TRUNCATE public.pasantias_leads;` and
  `SET ROLE anon; TRUNCATE public.pasantias_leads;`. `WITH CHECK` is irrelevant
  to this command because PostgreSQL does not apply row-level security to
  `TRUNCATE`. This contradicts D-04's effective posture (anon and non-admin
  roles have nothing; every mutation uses `service_role`) and the migration's
  own access-matrix claim at lines 9-22. Required closure: explicitly revoke
  `TRUNCATE` from `anon` and `authenticated` in the migration, and add pgTAP
  assertions that impersonating each role cannot truncate the table. Pinning
  the other inherited non-CRUD privileges (`REFERENCES`, `TRIGGER`) at the same
  time is recommended so the declared access surface does not depend on
  mutable Supabase defaults.

- [B2] The anon deny matrix is incomplete —
  `supabase/tests/030-pasantias-leads-rls.sql:213-237` — A2 [A4] requires anon
  to be fully blocked, but this tier tests only SELECT and INSERT. It has no
  anon UPDATE or DELETE assertion, despite the review request claiming that no
  prompt assertion was dropped. The structural single-policy check is useful,
  but it is not a substitute for the role-by-operation behavioral matrix; the
  unexamined privilege interaction in [B1] demonstrates why. Required closure:
  add anon UPDATE and DELETE deny cases with the repository's correct blocked
  operation semantics, update the TAP plan/evidence and review-request counts,
  and rerun `npm run test:db`.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- [A1 / D-12] The consent columns and CHECK are otherwise correct.
  `consent_accepted_at` and `consent_notice_version` are `NOT NULL` with no
  defaults; `marketing_opt_in` is `NOT NULL DEFAULT false`; and the CHECK at
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:66-71` admits
  exactly the two frozen nullability shapes. Because the boolean is non-null,
  SQL three-valued logic does not create a third accepted shape. The two
  required-consent omissions and both invalid marketing shapes are exercised
  at `supabase/tests/030-pasantias-leads-rls.sql:257-311`. The frozen criterion
  requires non-null versions, not a nonblank-text CHECK, so empty-string
  rejection is not invented as an A2 finding.
- [A2 / D-04] For SELECT/INSERT/UPDATE/DELETE specifically, the policy design is
  sound: catalog inspection found RLS enabled and exactly one permissive
  `FOR SELECT TO authenticated` policy with the admin-role `USING` expression
  and a null `with_check`. Admin CRUD and docente CRUD assertions use the
  correct repository semantics. This does not cure [B1], because `TRUNCATE`
  sits outside the RLS policy machinery.
- [D-03] The status CHECK correctly constrains only the four stored values and
  does not attempt to encode the transition graph. With authenticated CRUD
  denied, keeping `canTransitionLead()` at the future A5/A8 service-route
  boundary matches the frozen decision.
- The executor's `service_role` stand-in is acceptable for this DB phase.
  `pg_temp.set_service_role()` at
  `supabase/tests/030-pasantias-leads-rls.sql:125-130` performs the same database
  role selection PostgREST makes after accepting a service-role JWT; independent
  catalog inspection confirmed `service_role.rolbypassrls = true`, while
  `anon` and `authenticated` are not bypass roles. The successful constraint
  probes therefore exercise the intended privileged database path. API-key
  handling and route guards do not exist until A5/A8 and are correctly outside
  A2.
- Independent evidence on branch head `d3f8004`: `npm run test:db` passed
  **5 files / 47 tests**; `git diff --check origin/main...HEAD` passed; PR #31
  is mergeable and all CI/Vercel checks are green. Those gates do not detect
  [B1] or the missing cases in [B2]. The actual PR diff is confined to the
  migration, its pgTAP/evidence, the review request, and the A2 ledger entries;
  no API, page, helper, dependency, middleware, or unrelated schema work entered
  the phase.
