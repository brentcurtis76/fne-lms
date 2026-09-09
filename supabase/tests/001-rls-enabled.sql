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
-- (3) Check global: toda tabla real de public (relkind 'r' o 'p') tiene RLS.
--     La ALLOWLIST está VACÍA (2026-09-07); agregar una tabla exige revisión
--     humana + entrada en PROJECT_STATE.md (Open decisions) con plan de
--     remediación.
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
-- repository-unused legacy tables (pgTAP 062). The RLS remediation of
-- 2026-09-07 (migrations 20260907120000 W-B2c-01 and 20260907120100
-- W-B10a-01; pgTAP 070 / 071) row-secured the last eight: the six B10a
-- referenced tables (group_assignment_discussions,
-- growth_community_transformation_access, instructors, modules,
-- propuesta_rate_limits, qa_tester_time_logs) and the two B2c learning-path
-- tables (learning_paths, learning_path_courses). The allowlist is now EMPTY
-- and the check is exact: every real table of public — ordinary AND
-- partitioned (relkind 'r' or 'p'; a partition inherits the parent's row
-- security setting only when the parent has it) — must have RLS enabled.
-- PROHIBIDO agregar tablas aquí: no queda excepción y la lista no debe
-- volver a crecer sin revisión humana explícita.
select is(
  (select coalesce(array_agg(pc.relname::text order by pc.relname), '{}'::text[])
     from pg_class pc
     join pg_namespace pn on pn.oid = pc.relnamespace
    where pn.nspname = 'public'
      and pc.relkind in ('r', 'p')
      and not pc.relrowsecurity
      and pc.relname <> all ('{}'::text[])  -- ALLOWLIST: vacía desde 2026-09-07
  ),
  '{}'::text[],
  'Toda tabla de public (ordinaria o particionada) tiene RLS habilitado — allowlist vacía'
);

select * from finish();
rollback;
