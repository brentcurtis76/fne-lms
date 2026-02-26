-- ============================================================================
-- Seed Data for Hour Tracking QA Testing
-- ============================================================================
-- Purpose: Populate test data so QA testers can exercise all Hour Tracking
--          features using the QA Test School (school_id=257).
--
-- This migration is IDEMPOTENT — safe to run multiple times.
--
-- Data created:
--   A. Contract with 100 total hours for QA Test School
--   B. 3 hour allocation buckets (formacion 40h, acompanamiento_aula 35h, asesoria_directiva 25h)
--   C. 3 consultant rates for consultor.qa@fne.cl
--   D. 6 ledger entries across 3 statuses
--   E. 1 recent FX rate (EUR→CLP)
--   F. 5+ untagged consultor_sessions for bulk-tagging
--
-- Date: 2026-02-26
-- Author: Claude Code (CC-Bridge fix-request)
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION A: Contract for QA Test School
-- ============================================================================
-- cliente_id for school_id=257: 64f0710b-128d-424b-87c7-4d1ed5d91ad9
-- Using a stable UUID so we can reference it below.

INSERT INTO contratos (
  id,
  numero_contrato,
  fecha_contrato,
  cliente_id,
  programa_id,
  precio_total_uf,
  numero_cuotas,
  estado,
  firmado,
  fecha_fin,
  horas_contratadas
) VALUES (
  'a1b2c3d4-0000-4000-a000-000000000001',
  'QA-HT-2026-001',
  '2026-01-01',
  '64f0710b-128d-424b-87c7-4d1ed5d91ad9',
  'c06a4764-3f71-40b8-888a-037dbebe63e8',  -- Asesoría Integral (148h programme)
  500,
  12,
  'vigente',
  true,
  '2026-12-31',
  100
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION B: 3 Hour Allocation Buckets
-- ============================================================================

-- Bucket 1: formacion (mapped to 'asesoria_tecnica_online' hour_type) — 40 hours
INSERT INTO contract_hour_allocations (
  id, contrato_id, hour_type_id, allocated_hours, is_fixed_allocation, created_by
) VALUES (
  'b1b2c3d4-0000-4000-b000-000000000001',
  'a1b2c3d4-0000-4000-a000-000000000001',
  (SELECT id FROM hour_types WHERE key = 'asesoria_tecnica_online'),
  40,
  false,
  '7650804a-fe7d-476a-b988-25ce6201aeda'  -- admin.qa
)
ON CONFLICT (contrato_id, hour_type_id) DO NOTHING;

-- Bucket 2: acompanamiento_aula (mapped to 'asesoria_tecnica_presencial') — 35 hours
INSERT INTO contract_hour_allocations (
  id, contrato_id, hour_type_id, allocated_hours, is_fixed_allocation, created_by
) VALUES (
  'b1b2c3d4-0000-4000-b000-000000000002',
  'a1b2c3d4-0000-4000-a000-000000000001',
  (SELECT id FROM hour_types WHERE key = 'asesoria_tecnica_presencial'),
  35,
  false,
  '7650804a-fe7d-476a-b988-25ce6201aeda'
)
ON CONFLICT (contrato_id, hour_type_id) DO NOTHING;

-- Bucket 3: asesoria_directiva (mapped to 'asesoria_directiva_online') — 25 hours
INSERT INTO contract_hour_allocations (
  id, contrato_id, hour_type_id, allocated_hours, is_fixed_allocation, created_by
) VALUES (
  'b1b2c3d4-0000-4000-b000-000000000003',
  'a1b2c3d4-0000-4000-a000-000000000001',
  (SELECT id FROM hour_types WHERE key = 'asesoria_directiva_online'),
  25,
  false,
  '7650804a-fe7d-476a-b988-25ce6201aeda'
)
ON CONFLICT (contrato_id, hour_type_id) DO NOTHING;

-- ============================================================================
-- SECTION C: Consultant Rates for consultor.qa@fne.cl
-- ============================================================================
-- consultant_id: 16943651-af94-41d7-8da3-2b9e3f7d3f69
-- NOTE: An existing rate for asesoria_tecnica_online ends on 2026-02-25.
--       New rates start from 2026-02-25 to avoid exclusion constraint overlap.

INSERT INTO consultant_rates (
  id, consultant_id, hour_type_id, rate_eur, effective_from, created_by
) VALUES
  (
    'c1c2c3d4-0000-4000-c000-000000000001',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    (SELECT id FROM hour_types WHERE key = 'asesoria_tecnica_online'),
    85.00,
    '2026-02-25',
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  (
    'c1c2c3d4-0000-4000-c000-000000000002',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    (SELECT id FROM hour_types WHERE key = 'asesoria_tecnica_presencial'),
    95.00,
    '2026-02-25',
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  (
    'c1c2c3d4-0000-4000-c000-000000000003',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    (SELECT id FROM hour_types WHERE key = 'asesoria_directiva_online'),
    100.00,
    '2026-02-25',
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION D: Sample Consultor Sessions (untagged + tagged) for QA Test School
-- ============================================================================
-- These sessions are needed for:
--   1. Ledger entries to reference (tagged sessions)
--   2. Bulk-tag testing (untagged sessions with hour_type_key IS NULL)

-- 6 tagged sessions (with hour_type_key and contrato_id set) — for ledger entries
-- NOTE: scheduled_duration_minutes is a generated column — omit from INSERT
INSERT INTO consultor_sessions (
  id, school_id, title, description, session_date, start_time, end_time,
  modality, status, created_by, hour_type_key, contrato_id, growth_community_id
) VALUES
  (
    'd1d2d3d4-0000-4000-d000-000000000001', 257,
    'Asesoría Técnica Online — Sesión 1',
    'Primera sesión de asesoría técnica para QA Test School',
    '2026-02-10', '09:00', '11:00', 'online', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_tecnica_online', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000002', 257,
    'Asesoría Técnica Presencial — Sesión 1',
    'Primera sesión presencial de acompañamiento en aula',
    '2026-02-12', '14:00', '16:00', 'presencial', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_tecnica_presencial', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000003', 257,
    'Asesoría Directiva Online — Sesión 1',
    'Primera sesión de asesoría directiva',
    '2026-02-14', '10:00', '11:30', 'online', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_directiva_online', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  -- 1 session reserved (upcoming)
  (
    'd1d2d3d4-0000-4000-d000-000000000004', 257,
    'Asesoría Técnica Online — Sesión 2',
    'Segunda sesión de asesoría técnica (próxima)',
    '2026-03-15', '09:00', '11:00', 'online', 'programada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_tecnica_online', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  -- 1 cancelled (devuelta) session
  (
    'd1d2d3d4-0000-4000-d000-000000000005', 257,
    'Asesoría Técnica Presencial — Cancelada',
    'Sesión cancelada con antelación suficiente — horas devueltas',
    '2026-02-20', '14:00', '16:00', 'presencial', 'cancelada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_tecnica_presencial', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  -- 1 cancelled (penalizada) session
  (
    'd1d2d3d4-0000-4000-d000-000000000006', 257,
    'Asesoría Directiva Online — Penalizada',
    'Sesión cancelada tarde — horas penalizadas',
    '2026-02-18', '10:00', '11:30', 'online', 'cancelada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    'asesoria_directiva_online', 'a1b2c3d4-0000-4000-a000-000000000001',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  )
ON CONFLICT (id) DO NOTHING;

-- 5 untagged sessions for bulk-tag testing (hour_type_key IS NULL)
INSERT INTO consultor_sessions (
  id, school_id, title, description, session_date, start_time, end_time,
  modality, status, created_by, growth_community_id
) VALUES
  (
    'd1d2d3d4-0000-4000-d000-000000000010', 257,
    'Sesión sin clasificar — 1',
    'Sesión pendiente de clasificación para bulk tagging',
    '2026-02-03', '09:00', '10:30', 'online', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000011', 257,
    'Sesión sin clasificar — 2',
    'Sesión pendiente de clasificación para bulk tagging',
    '2026-02-05', '14:00', '15:30', 'presencial', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000012', 257,
    'Sesión sin clasificar — 3',
    'Sesión pendiente de clasificación para bulk tagging',
    '2026-02-07', '10:00', '11:00', 'online', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000013', 257,
    'Sesión sin clasificar — 4',
    'Sesión pendiente de clasificación para bulk tagging',
    '2026-02-11', '09:00', '10:00', 'presencial', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  ),
  (
    'd1d2d3d4-0000-4000-d000-000000000014', 257,
    'Sesión sin clasificar — 5',
    'Sesión pendiente de clasificación para bulk tagging',
    '2026-02-17', '14:00', '15:00', 'online', 'completada',
    '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd'
  )
ON CONFLICT (id) DO NOTHING;

-- Session facilitators for all 11 sessions (link consultor.qa as facilitator)
INSERT INTO session_facilitators (session_id, user_id, facilitator_role, is_lead)
SELECT s.id, '16943651-af94-41d7-8da3-2b9e3f7d3f69', 'consultor_externo', true
FROM consultor_sessions s
WHERE s.id IN (
  'd1d2d3d4-0000-4000-d000-000000000001',
  'd1d2d3d4-0000-4000-d000-000000000002',
  'd1d2d3d4-0000-4000-d000-000000000003',
  'd1d2d3d4-0000-4000-d000-000000000004',
  'd1d2d3d4-0000-4000-d000-000000000005',
  'd1d2d3d4-0000-4000-d000-000000000006',
  'd1d2d3d4-0000-4000-d000-000000000010',
  'd1d2d3d4-0000-4000-d000-000000000011',
  'd1d2d3d4-0000-4000-d000-000000000012',
  'd1d2d3d4-0000-4000-d000-000000000013',
  'd1d2d3d4-0000-4000-d000-000000000014'
)
AND NOT EXISTS (
  SELECT 1 FROM session_facilitators sf
  WHERE sf.session_id = s.id
    AND sf.user_id = '16943651-af94-41d7-8da3-2b9e3f7d3f69'
);

-- ============================================================================
-- SECTION E: Contract Hours Ledger Entries
-- ============================================================================
-- 3 consumida + 1 reservada + 1 devuelta + 1 penalizada = 6 entries

-- Consumida entries (completed sessions)
INSERT INTO contract_hours_ledger (
  id, allocation_id, session_id, hours, status, session_date,
  is_manual, recorded_by
) VALUES
  -- Session 1: 2h consumida in asesoria_tecnica_online bucket
  (
    'e1e2e3e4-0000-4000-e000-000000000001',
    'b1b2c3d4-0000-4000-b000-000000000001',
    'd1d2d3d4-0000-4000-d000-000000000001',
    2.00,
    'consumida',
    '2026-02-10',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  -- Session 2: 2h consumida in asesoria_tecnica_presencial bucket
  (
    'e1e2e3e4-0000-4000-e000-000000000002',
    'b1b2c3d4-0000-4000-b000-000000000002',
    'd1d2d3d4-0000-4000-d000-000000000002',
    2.00,
    'consumida',
    '2026-02-12',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  -- Session 3: 1.5h consumida in asesoria_directiva_online bucket
  (
    'e1e2e3e4-0000-4000-e000-000000000003',
    'b1b2c3d4-0000-4000-b000-000000000003',
    'd1d2d3d4-0000-4000-d000-000000000003',
    1.50,
    'consumida',
    '2026-02-14',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  -- Session 4: 2h reservada (upcoming session)
  (
    'e1e2e3e4-0000-4000-e000-000000000004',
    'b1b2c3d4-0000-4000-b000-000000000001',
    'd1d2d3d4-0000-4000-d000-000000000004',
    2.00,
    'reservada',
    '2026-03-15',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  -- Session 5: 2h devuelta (cancelled with notice)
  (
    'e1e2e3e4-0000-4000-e000-000000000005',
    'b1b2c3d4-0000-4000-b000-000000000002',
    'd1d2d3d4-0000-4000-d000-000000000005',
    2.00,
    'devuelta',
    '2026-02-20',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  ),
  -- Session 6: 1.5h penalizada (late cancellation)
  (
    'e1e2e3e4-0000-4000-e000-000000000006',
    'b1b2c3d4-0000-4000-b000-000000000003',
    'd1d2d3d4-0000-4000-d000-000000000006',
    1.50,
    'penalizada',
    '2026-02-18',
    false,
    '7650804a-fe7d-476a-b988-25ce6201aeda'
  )
ON CONFLICT (session_id) DO NOTHING;

-- ============================================================================
-- SECTION F: Recent FX Rate (EUR → CLP)
-- ============================================================================

INSERT INTO fx_rates (
  id, from_currency, to_currency, rate, source
) VALUES (
  'f1f2f3f4-0000-4000-f000-000000000001',
  'EUR',
  'CLP',
  1050.00,
  'manual-qa-seed'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
