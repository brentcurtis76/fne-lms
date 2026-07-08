-- Licitaciones: enforce workflow-required fields on non-historical (live) records
--
-- The prior migration (20260420191214_licitaciones_historico_support.sql) relaxed
-- NOT NULL constraints on seven workflow-only columns so historical imports
-- (estado='cerrada') could be recorded with incomplete data.
--
-- That relaxation is too broad: live licitaciones (any estado other than 'cerrada')
-- still require these fields to be populated. Without this follow-up, an UPDATE on a
-- live record could accept NULL in one of these columns and leave the workflow in an
-- inconsistent state.
--
-- This migration re-asserts the integrity at the DB level via state-scoped CHECK
-- constraints: the columns may be NULL ONLY when estado = 'cerrada'. It is
-- additive and does not require changes to existing data — all open workflow records
-- were previously NOT NULL on these columns.

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_email_required_when_live
  CHECK (estado = 'cerrada' OR email_licitacion IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_monto_minimo_required_when_live
  CHECK (estado = 'cerrada' OR monto_minimo IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_monto_maximo_required_when_live
  CHECK (estado = 'cerrada' OR monto_maximo IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_duracion_minima_required_when_live
  CHECK (estado = 'cerrada' OR duracion_minima IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_duracion_maxima_required_when_live
  CHECK (estado = 'cerrada' OR duracion_maxima IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_peso_tecnica_required_when_live
  CHECK (estado = 'cerrada' OR peso_evaluacion_tecnica IS NOT NULL);

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_peso_economica_required_when_live
  CHECK (estado = 'cerrada' OR peso_evaluacion_economica IS NOT NULL);
