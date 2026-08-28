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

-- (3) GLOBAL ------------------------------------------------------------------
-- ALLOWLIST legacy: originally the 22 pre-Fase-0 tables without RLS (baseline
-- 2026-07-08, documented exception approved by Brent). W-B2b-01 (lote B2b,
-- migration 20260827170000, 2026-08-27) locked down the fourteen
-- repository-unused legacy tables and removed them from this list; pgTAP
-- 062-unused-legacy-lockdown.sql carries their table-by-table evidence.
-- Exactly 8 exceptions remain: the six B10a referenced tables
-- (group_assignment_discussions, growth_community_transformation_access,
-- instructors, modules, propuesta_rate_limits, qa_tester_time_logs — unit
-- W-B10a-01) and the two B2c learning-path tables (learning_paths,
-- learning_path_courses — unit W-B2c-01, BLOCKED). None contains minor data.
-- PROHIBIDO agregar tablas nuevas aquí sin revisión humana; el objetivo sigue
-- siendo VACIAR esta lista, no crecerla.
select is(
  (select coalesce(array_agg(pc.relname::text order by pc.relname), '{}'::text[])
     from pg_class pc
     join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname = 'public'
      and pc.relkind = 'r'
      and not pc.relrowsecurity
      and pc.relname <> all (array[
        'group_assignment_discussions','growth_community_transformation_access',
        'instructors','learning_path_courses','learning_paths','modules',
        'propuesta_rate_limits','qa_tester_time_logs'
      ]::text[])  -- ALLOWLIST legacy restante (8 tablas: 6 B10a + 2 B2c)
  ),
  '{}'::text[],
  'Toda tabla de public tiene RLS habilitado (fuera de la allowlist legacy restante: 6 B10a + 2 B2c)'
);

select * from finish();
rollback;
