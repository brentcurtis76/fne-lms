-- Read-only probes to run in staging for RLS validation
-- Execute via MCP Postgres client or Supabase SQL editor (staging only)

-- Distinct instance IDs
select distinct instance_id, count(*) from auth.users group by 1 order by 2 desc;

-- Expected instance
select id from auth.instances limit 1;

-- Mismatched users
select id, email, instance_id from auth.users where instance_id <> (select id from auth.instances limit 1);

-- Identities present for mismatched users
select i.user_id, i.provider from auth.identities i where i.user_id in (
  select id from auth.users where instance_id <> (select id from auth.instances limit 1)
);

-- Profiles without linkage
select u.id as user_id, u.email from auth.users u left join public.profiles p on p.user_id = u.id where p.user_id is null;

-- Policies on key tables
select schemaname, tablename, policyname, using, with_check
from pg_policies
where schemaname='public' and tablename in ('profiles','user_roles','groups','group_members','communities','generations','schools');

