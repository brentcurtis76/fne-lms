# CODEX REVIEW — A2 round 2

VERDICT: FAIL

Both round-1 findings are closed on their stated operations: independent,
rollback-contained probes confirmed that `anon` and `authenticated` each receive
SQLSTATE `42501` on `TRUNCATE`, and the expanded anon UPDATE/DELETE assertions
exercise the correct privilege-denial behavior. The independent database gate
passes 5 files / 56 assertions. The remediation nevertheless introduced one
new BLOCKING residue: its authenticated denylist omits PostgreSQL 17's
`MAINTAIN` privilege, while the new catalog assertion incorrectly reports the
effective grant set as SELECT-only.

BLOCKING:

- [B3] `authenticated` still has effective `MAINTAIN`, so D-04's SELECT-only
  grant posture is false —
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:125-136` and
  `supabase/tests/030-pasantias-leads-rls.sql:85-103` — the migration revokes a
  six-privilege denylist but omits `MAINTAIN`, which already exists on the
  branch's PostgreSQL 17.6 server and was included by Supabase's default
  `GRANT ALL`. Independent inspection returned
  `has_table_privilege('authenticated', 'public.pasantias_leads', 'MAINTAIN') = true`
  and the underlying ACL `authenticated=rm/postgres` (`r` = SELECT, `m` =
  MAINTAIN). A rollback-contained `SET LOCAL ROLE authenticated; LOCK TABLE
  public.pasantias_leads IN ACCESS EXCLUSIVE MODE NOWAIT;` succeeded. That is
  a command-level availability capability outside RLS, not SELECT-only access.
  The supposedly exact test passes because `information_schema.role_table_grants`
  does not expose `MAINTAIN` here. This is precisely the failure mode the round-r2
  review request said its denylist plus exact-grant pin would catch, but it is
  present today and passes all 56 assertions.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- Round-1 `[B1]` is **CLOSED for TRUNCATE**. Independent rollback-contained
  probes as `anon` and `authenticated` both raised `42501`; neither command
  reached RLS or changed data.
- Round-1 `[B2]` is **CLOSED**. Anon UPDATE and DELETE are now tested, along
  with SELECT, INSERT, and TRUNCATE. Their `throws_ok('42501', 'permission
  denied for table pasantias_leads')` shape is correct after the grant revocation.
- The executor's semantics flip is accepted. PostgreSQL checks command
  privileges before row-level policies. Once INSERT/UPDATE/DELETE grants are
  absent, the operation must raise `42501`; an empty UPDATE/DELETE result is
  only the expected shape when the command privilege survives and RLS filters
  every row. Replacing the prior empty-result assertions is therefore necessary,
  not a weakening.
- Independent `npm run test:db` on final branch head `ede60d0` passed **5 files /
  56 assertions**, including 30/30 in `030-pasantias-leads-rls.sql`. The passing
  result does not detect `[B3]`.

### Residue for Brent — SOP §1.5 (Codex round cap reached)

- **One remediation-introduced BLOCKING item remains:** authenticated
  `MAINTAIN` privilege. This is not a taste disagreement and should not be
  accepted or backlogged while D-04 says SELECT-only.
- **Recommended disposition:** choose the grantlist form for A2 and bind it as
  the B3 pattern for all five email tables:

  ```sql
  REVOKE ALL ON public.<table> FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.<table> TO authenticated;
  ```

  Leave `service_role` untouched. Replace the `information_schema` exact-set
  claim with effective-privilege assertions that include every PostgreSQL 17
  table privilege, explicitly including `MAINTAIN`; retain the behavioral
  TRUNCATE probes and add an authenticated `MAINTAIN` denial probe (for example,
  rollback-contained `LOCK TABLE`). The acceptance check is: authenticated has
  effective SELECT and no other table privilege; anon has none; service-role
  CRUD remains intact; `npm run test:db` is green.
- **Binding B3 decision:** use revoke-all-then-grant-SELECT, not a non-SELECT
  denylist. The allowlist is fail-closed at migration execution and avoids
  silently missing a privilege that the target PostgreSQL version already has.
  Because this is round 2 of 2, Brent must explicitly choose accept, re-plan,
  or authorize the narrow closure correction under §1.5; Codex recommends the
  narrow correction and does not recommend accepting the residue.
