# RLS Test Checklist (Staging First)

- Owner: <name>
- Last Updated: <YYYY-MM-DD>

## MCP Setup
- Execute all probes via MCP Postgres/Supabase client.
- Use role-appropriate JWTs for staging; keep prod read-only.
- Archive session logs under `logs/mcp/<YYYYMMDD>/rls-tests/`.

## Test Identities (by Role)
- Student: `<email or user_id>`
- Teacher: `<email or user_id>`
- Admin: `<email or user_id>`
- Network Supervisor: `<email or user_id>`
- Service Role: use service key (bypass RLS) — for control checks only

## Tables Under Test
- `profiles` (tenant/user-scoped)
- `user_roles` (RBAC pivot)
- `groups`, `group_members`
- `communities`
- `generations`
- `schools`
- Any additional tenant-scoped tables used in hot paths

## Matrix (Per Table)
For each table, validate for each role:
- Read allowed? [ ] Student [ ] Teacher [ ] Admin [ ] Supervisor [ ] Service
- Write allowed (insert/update/delete)? [ ] Student [ ] Teacher [ ] Admin [ ] Supervisor [ ] Service
- Scope enforced? [ ] Tenant scoped [ ] User scoped [ ] Global as designed
- Notes: policy names and expected predicates (USING / WITH CHECK)

## Quick Probe Queries (Run in Staging)
Use MCP Postgres client (or PostgREST via MCP HTTP) with role-appropriate JWTs.

```
-- Read probe (should succeed/fail per role) — example for profiles
select * from public.profiles limit 5;

-- Insert probe — ensure WITH CHECK works
insert into public.group_members (group_id, user_id)
values (<group_id>, <user_id>);

-- Update probe — ensure USING and WITH CHECK are coherent
update public.communities set name = name where id = <id>;

-- Delete probe — ensure deletes are restricted or soft-delete is used
delete from public.generations where id = <id>;

-- Policy inventory for context
select schemaname, tablename, policyname, using, with_check
from pg_policies
where schemaname='public' and tablename in (
  'profiles','user_roles','groups','group_members','communities','generations','schools'
);
```

## Acceptance Criteria
- Default deny posture verified on sensitive tables.
- Allow/Deny matches the access matrix for each role.
- Tenant isolation holds (no cross-tenant reads/writes).
- Service role bypass verified only where intended.
