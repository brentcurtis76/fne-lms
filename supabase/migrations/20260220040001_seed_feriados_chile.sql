-- Seed: Chilean Public Holidays 2025-2027
--
-- Source: Chilean law (Ley 19.668, Ley 20.629, and subsequent modifications)
-- Used for business day calculation in the Licitaciones module timeline.
--
-- MOVABLE HOLIDAY RULES (under Chilean law):
--   San Pedro y San Pablo (Jun 29): moves to nearest Monday when mid-week.
--   Encuentro de Dos Mundos (Oct 12): moves to nearest Monday when mid-week.
--   Dia Nacional de los Pueblos Indigenas: follows winter solstice date (Jun 20 or 21).
--
-- VERIFIED MOVABLE HOLIDAY DATES:
--   2025: San Pedro y San Pablo: June 29=Sunday -> moves to Monday June 30
--         Encuentro de Dos Mundos: Oct 12=Sunday -> moves to Monday October 13
--         Winter solstice 2025 = June 20
--         Easter = April 20 (Viernes Santo=Apr 18, Sabado Santo=Apr 19)
--
--   2026: San Pedro y San Pablo: June 29=Monday -> stays June 29 (no move needed)
--         Encuentro de Dos Mundos: Oct 12=Monday -> stays October 12 (no move needed)
--         Winter solstice 2026 = June 21
--         Easter = April 5 (Viernes Santo=Apr 3, Sabado Santo=Apr 4)
--
--   2027: San Pedro y San Pablo: June 29=Tuesday -> moves to Monday June 28
--         Encuentro de Dos Mundos: Oct 12=Tuesday -> moves to Monday October 11
--         Winter solstice 2027 = June 21
--         Easter = March 28 (Viernes Santo=Mar 26, Sabado Santo=Mar 27)
--
-- Total rows: 48 (16 per year x 3 years)
-- ON CONFLICT DO NOTHING ensures idempotency.
--
-- Date: 2026-02-20
-- Author: DB Agent (Pipeline Task: Licitaciones Phase 1)

-- ============================================================
-- 2025 (16 holidays)
-- Jun 30 = San Pedro y San Pablo (Jun 29 is Sunday, moves to Monday)
-- Oct 13 = Encuentro de Dos Mundos (Oct 12 is Sunday, moves to Monday)
-- ============================================================
INSERT INTO feriados_chile (fecha, nombre, year) VALUES
  ('2025-01-01', 'Ano Nuevo', 2025),
  ('2025-04-18', 'Viernes Santo', 2025),
  ('2025-04-19', 'Sabado Santo', 2025),
  ('2025-05-01', 'Dia del Trabajo', 2025),
  ('2025-05-21', 'Dia de las Glorias Navales', 2025),
  ('2025-06-20', 'Dia Nacional de los Pueblos Indigenas', 2025),
  ('2025-06-30', 'San Pedro y San Pablo', 2025),
  ('2025-07-16', 'Virgen del Carmen', 2025),
  ('2025-08-15', 'Asuncion de la Virgen', 2025),
  ('2025-09-18', 'Fiestas Patrias', 2025),
  ('2025-09-19', 'Dia de las Glorias del Ejercito', 2025),
  ('2025-10-13', 'Encuentro de Dos Mundos', 2025),
  ('2025-10-31', 'Dia de las Iglesias Evangelicas y Protestantes', 2025),
  ('2025-11-01', 'Dia de Todos los Santos', 2025),
  ('2025-12-08', 'Inmaculada Concepcion', 2025),
  ('2025-12-25', 'Navidad', 2025)
ON CONFLICT (fecha) DO NOTHING;

-- ============================================================
-- 2026 (16 holidays)
-- Jun 29 = San Pedro y San Pablo (Jun 29 is Monday, stays)
-- Oct 12 = Encuentro de Dos Mundos (Oct 12 is Monday, stays)
-- ============================================================
INSERT INTO feriados_chile (fecha, nombre, year) VALUES
  ('2026-01-01', 'Ano Nuevo', 2026),
  ('2026-04-03', 'Viernes Santo', 2026),
  ('2026-04-04', 'Sabado Santo', 2026),
  ('2026-05-01', 'Dia del Trabajo', 2026),
  ('2026-05-21', 'Dia de las Glorias Navales', 2026),
  ('2026-06-21', 'Dia Nacional de los Pueblos Indigenas', 2026),
  ('2026-06-29', 'San Pedro y San Pablo', 2026),
  ('2026-07-16', 'Virgen del Carmen', 2026),
  ('2026-08-15', 'Asuncion de la Virgen', 2026),
  ('2026-09-18', 'Fiestas Patrias', 2026),
  ('2026-09-19', 'Dia de las Glorias del Ejercito', 2026),
  ('2026-10-12', 'Encuentro de Dos Mundos', 2026),
  ('2026-10-31', 'Dia de las Iglesias Evangelicas y Protestantes', 2026),
  ('2026-11-01', 'Dia de Todos los Santos', 2026),
  ('2026-12-08', 'Inmaculada Concepcion', 2026),
  ('2026-12-25', 'Navidad', 2026)
ON CONFLICT (fecha) DO NOTHING;

-- ============================================================
-- 2027 (16 holidays)
-- Jun 28 = San Pedro y San Pablo (Jun 29 is Tuesday, moves to Monday Jun 28)
-- Oct 11 = Encuentro de Dos Mundos (Oct 12 is Tuesday, moves to Monday Oct 11)
-- ============================================================
INSERT INTO feriados_chile (fecha, nombre, year) VALUES
  ('2027-01-01', 'Ano Nuevo', 2027),
  ('2027-03-26', 'Viernes Santo', 2027),
  ('2027-03-27', 'Sabado Santo', 2027),
  ('2027-05-01', 'Dia del Trabajo', 2027),
  ('2027-05-21', 'Dia de las Glorias Navales', 2027),
  ('2027-06-21', 'Dia Nacional de los Pueblos Indigenas', 2027),
  ('2027-06-28', 'San Pedro y San Pablo', 2027),
  ('2027-07-16', 'Virgen del Carmen', 2027),
  ('2027-08-15', 'Asuncion de la Virgen', 2027),
  ('2027-09-18', 'Fiestas Patrias', 2027),
  ('2027-09-19', 'Dia de las Glorias del Ejercito', 2027),
  ('2027-10-11', 'Encuentro de Dos Mundos', 2027),
  ('2027-10-31', 'Dia de las Iglesias Evangelicas y Protestantes', 2027),
  ('2027-11-01', 'Dia de Todos los Santos', 2027),
  ('2027-12-08', 'Inmaculada Concepcion', 2027),
  ('2027-12-25', 'Navidad', 2027)
ON CONFLICT (fecha) DO NOTHING;
