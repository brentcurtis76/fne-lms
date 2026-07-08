-- =============================================================================
-- 000-setup.sql — Fase 0: pgTAP + Supabase test helpers
--
-- Runs first (alphabetical order) under `supabase test db`. NO rollback here:
-- the helpers must persist for every later test file in this directory.
--
-- The `tests` schema is an API-compatible vendored port of basejump's
-- supabase-test-helpers (rls_enabled, create_supabase_user, get_supabase_uid,
-- authenticate_as, clear_authentication). Replace with the upstream package
-- (database.dev) when we adopt dbdev — keep signatures identical (Fase 1
-- fixtures depend on them).
-- =============================================================================

create extension if not exists pgtap;

create schema if not exists tests;

-- ---------------------------------------------------------------------------
-- tests.rls_enabled(schema) — TAP assertion: every table in schema has RLS on
-- ---------------------------------------------------------------------------
create or replace function tests.rls_enabled(testing_schema text)
returns text as $$
  select is(
    (select count(pc.relname)::integer
       from pg_class pc
       join pg_namespace pn on pn.oid = pc.relnamespace
      where pn.nspname = rls_enabled.testing_schema
        and pc.relkind = 'r'
        and not pc.relrowsecurity),
    0,
    'Todas las tablas del schema ' || testing_schema || ' deben tener RLS habilitado'
  );
$$ language sql;

-- ---------------------------------------------------------------------------
-- tests.rls_enabled(schema, table) — TAP assertion: one table has RLS on
-- ---------------------------------------------------------------------------
create or replace function tests.rls_enabled(testing_schema text, testing_table text)
returns text as $$
  select is(
    (select count(*)::integer
       from pg_class pc
       join pg_namespace pn on pn.oid = pc.relnamespace
      where pn.nspname = rls_enabled.testing_schema
        and pc.relname = rls_enabled.testing_table
        and pc.relkind = 'r'
        and pc.relrowsecurity),
    1,
    'La tabla ' || testing_table || ' del schema ' || testing_schema || ' debe tener RLS habilitado'
  );
$$ language sql;

-- ---------------------------------------------------------------------------
-- tests.create_supabase_user(identifier, email?, phone?, metadata?) → uuid
-- ---------------------------------------------------------------------------
create or replace function tests.create_supabase_user(
  identifier text,
  email text default null,
  phone text default null,
  metadata jsonb default null
) returns uuid
security definer
set search_path = auth, public, pg_temp
as $$
declare
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users
    (id, instance_id, aud, role, email, phone,
     raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values
    (user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     coalesce(email, identifier || '@test.local'), phone,
     jsonb_build_object('test_identifier', identifier) || coalesce(metadata, '{}'::jsonb),
     '{"provider":"email","providers":["email"]}'::jsonb, now(), now());
  return user_id;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- tests.get_supabase_uid(identifier) → uuid
-- ---------------------------------------------------------------------------
create or replace function tests.get_supabase_uid(identifier text)
returns uuid
security definer
set search_path = auth, pg_temp
as $$
  select id from auth.users
   where raw_user_meta_data ->> 'test_identifier' = identifier
   limit 1;
$$ language sql;

-- ---------------------------------------------------------------------------
-- tests.authenticate_as(identifier) — act as that user for the transaction
-- ---------------------------------------------------------------------------
create or replace function tests.authenticate_as(identifier text)
returns void as $$
declare
  user_id uuid := tests.get_supabase_uid(identifier);
  user_email text;
begin
  if user_id is null then
    raise exception 'tests.authenticate_as: identificador de test desconocido: %', identifier;
  end if;
  select u.email into user_email from auth.users u where u.id = user_id;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated', 'email', user_email)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- tests.clear_authentication() — back to postgres, no claims
-- ---------------------------------------------------------------------------
create or replace function tests.clear_authentication()
returns void as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'postgres', true);
end;
$$ language plpgsql;

-- Self-verification of the setup itself (valid TAP output, no rollback)
select plan(2);
select has_extension('pgtap', 'pgTAP instalado');
select has_schema('tests', 'schema de helpers de test presente');
select * from finish();
