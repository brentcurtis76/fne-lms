-- Snapshot legal representative data on contratos at insert time.
--
-- Captures the cliente's legal representative (nombre + RUT) into contratos at
-- the moment of contract creation, so future changes to clientes do not
-- retroactively alter the legal record stored on existing contracts.
--
-- This migration is additive only:
--   1. Add nullable snapshot columns to contratos.
--   2. Backfill existing contratos rows from their linked clientes.
--   3. Install a BEFORE INSERT trigger that copies the current cliente
--      representative into the snapshot fields, unless the insert already
--      provided explicit non-null values.

-- 1. Additive columns -------------------------------------------------------

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS snapshot_nombre_representante TEXT;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS snapshot_rut_representante TEXT;

COMMENT ON COLUMN contratos.snapshot_nombre_representante IS
  'Legal representative name captured from clientes at contract creation time. Immutable historical record.';
COMMENT ON COLUMN contratos.snapshot_rut_representante IS
  'Legal representative RUT captured from clientes at contract creation time. Immutable historical record.';

-- 2. Backfill ---------------------------------------------------------------

UPDATE contratos c
SET
  snapshot_nombre_representante = cl.nombre_representante,
  snapshot_rut_representante = cl.rut_representante
FROM clientes cl
WHERE c.cliente_id = cl.id
  AND (
    c.snapshot_nombre_representante IS NULL
    OR c.snapshot_rut_representante IS NULL
  );

-- 3. Trigger function -------------------------------------------------------

CREATE OR REPLACE FUNCTION contratos_set_representante_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.snapshot_nombre_representante IS NULL THEN
    SELECT cl.nombre_representante
      INTO NEW.snapshot_nombre_representante
      FROM clientes cl
     WHERE cl.id = NEW.cliente_id;
  END IF;

  IF NEW.snapshot_rut_representante IS NULL THEN
    SELECT cl.rut_representante
      INTO NEW.snapshot_rut_representante
      FROM clientes cl
     WHERE cl.id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION contratos_set_representante_snapshot() IS
  'BEFORE INSERT trigger: snapshots the current clientes representative fields onto contratos when not explicitly provided.';

-- 4. Recreate trigger idempotently ------------------------------------------

DROP TRIGGER IF EXISTS contratos_set_representante_snapshot_trg ON contratos;

CREATE TRIGGER contratos_set_representante_snapshot_trg
  BEFORE INSERT ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION contratos_set_representante_snapshot();
