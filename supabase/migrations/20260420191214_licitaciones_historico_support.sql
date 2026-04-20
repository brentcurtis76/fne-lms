-- Licitaciones histórico support
-- Enables recording historical/legacy licitaciones with incomplete data:
--   - Adds 'anexos' to the licitacion_documentos.tipo allowed values
--   - Drops NOT NULL on fields that may be unknown for historical records
--   - Rewrites CHECK constraints so NULL values are explicitly allowed

-- ============================================================
-- 1. licitacion_documentos: allow 'anexos' tipo
-- ============================================================

ALTER TABLE licitacion_documentos
  DROP CONSTRAINT IF EXISTS licitacion_documentos_tipo_check;

ALTER TABLE licitacion_documentos
  ADD CONSTRAINT licitacion_documentos_tipo_check CHECK (tipo IN (
    'publicacion_imagen',
    'bases_generadas',
    'bases_enviadas',
    'propuesta',
    'evaluacion_generada',
    'evaluacion_firmada',
    'carta_adjudicacion_generada',
    'carta_adjudicacion_firmada',
    'anexos',
    'otro'
  ));

-- ============================================================
-- 2. licitaciones: drop NOT NULL on historical-optional columns
-- ============================================================

ALTER TABLE licitaciones ALTER COLUMN email_licitacion DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN monto_minimo DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN monto_maximo DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN duracion_minima DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN duracion_maxima DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN peso_evaluacion_tecnica DROP NOT NULL;
ALTER TABLE licitaciones ALTER COLUMN peso_evaluacion_economica DROP NOT NULL;

-- ============================================================
-- 3. Rewrite CHECK constraints to explicitly allow NULLs
-- ============================================================

-- Inline >=0 checks on monto_minimo / monto_maximo
ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_monto_minimo_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_monto_minimo_check
  CHECK (monto_minimo IS NULL OR monto_minimo >= 0);

ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_monto_maximo_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_monto_maximo_check
  CHECK (monto_maximo IS NULL OR monto_maximo >= 0);

-- Inline BETWEEN 1 AND 99 checks on peso columns
ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_peso_evaluacion_tecnica_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_peso_evaluacion_tecnica_check
  CHECK (peso_evaluacion_tecnica IS NULL OR peso_evaluacion_tecnica BETWEEN 1 AND 99);

ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_peso_evaluacion_economica_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_peso_evaluacion_economica_check
  CHECK (peso_evaluacion_economica IS NULL OR peso_evaluacion_economica BETWEEN 1 AND 99);

-- Named composite checks
ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_monto_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_monto_check
  CHECK (monto_minimo IS NULL OR monto_maximo IS NULL OR monto_maximo >= monto_minimo);

ALTER TABLE licitaciones DROP CONSTRAINT IF EXISTS licitaciones_peso_check;
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_peso_check
  CHECK (
    peso_evaluacion_tecnica IS NULL
    OR peso_evaluacion_economica IS NULL
    OR peso_evaluacion_tecnica + peso_evaluacion_economica = 100
  );
