-- =============================================================================
-- 001-rls-enabled.sql — Fase 0 DoD: verificación RLS sobre el schema public
--
-- (1) Demo positiva: una tabla CON RLS pasa el check individual.
-- (2) Demo negativa (DoD Fase 0): una tabla deliberadamente world-readable es
--     detectada como violación — la condición exacta que hace fallar
--     tests.rls_enabled('public'). (No invocamos rls_enabled() sobre ella
--     dentro de la suite: pgTAP registraría un fail real y rompería el plan;
--     la demostración "not ok" en vivo está documentada en docs/ci-setup.md.)
--     Fixture transitoria: existe solo dentro de esta transacción (rollback).
-- (3) Check global: toda tabla real de public tiene RLS. La ALLOWLIST parte
--     vacía; agregar una tabla exige revisión humana + entrada en
--     PROJECT_STATE.md (Open decisions) con plan de remediación.
-- =============================================================================

begin;
select plan(3);

-- (1) POSITIVA ---------------------------------------------------------------
create table public._fase0_rls_ok (id int);
alter table public._fase0_rls_ok enable row level security;
select tests.rls_enabled('public', '_fase0_rls_ok');

-- (2) NEGATIVA — la tabla world-readable DEBE ser detectada -------------------
create table public._fase0_world_readable (id int);  -- RLS deliberadamente ausente

select is(
  (select count(*)::integer
     from pg_class pc
     join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname = 'public'
      and pc.relkind = 'r'
      and pc.relname = '_fase0_world_readable'
      and not pc.relrowsecurity),
  1,
  'DoD Fase 0: la tabla deliberadamente world-readable ES detectada sin RLS (condición que hace fallar rls_enabled)'
);

-- Retirar fixtures para que el check global refleje el schema real.
-- (DROP de fixtures transitorias dentro de la transacción de test — permitido;
--  la regla "never DROP" aplica a objetos reales del schema.)
drop table public._fase0_world_readable;
drop table public._fase0_rls_ok;

-- (3) GLOBAL — allowlist vacía ------------------------------------------------
select is(
  (select coalesce(array_agg(pc.relname::text order by pc.relname), '{}'::text[])
     from pg_class pc
     join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname = 'public'
      and pc.relkind = 'r'
      and not pc.relrowsecurity
      and pc.relname <> all (array[]::text[])  -- ALLOWLIST legacy (vacía)
  ),
  '{}'::text[],
  'Toda tabla de public tiene RLS habilitado (allowlist legacy vacía)'
);

select * from finish();
rollback;
