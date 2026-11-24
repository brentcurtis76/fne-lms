-- GENERA fixes F22, build A, item T1: a contract records which text it was made with.
--
-- Owner rule (20 Nov 2026, "Old keep, new corrected"): every contract that exists
-- when this migration runs keeps printing exactly today's text; new contracts get the
-- corrected text; an admin may move ONE unsigned contract to the corrected text.
--
-- The print page builds the text from the template every time it is opened, so a
-- template change would reach signed contracts. This column says which text a
-- contract prints: empty (NULL) = the text as printed before this column existed,
-- 2 = the corrected text.
--
-- The column is added WITHOUT a default first, so every existing row stays empty;
-- the default is set in a separate statement and applies to new rows only.
--
-- The guard:
--   on INSERT, every caller gets 2 (whatever was sent);
--   on UPDATE by a signed-in caller (auth.uid() IS NOT NULL), a change of the mark is
--   allowed only from empty to 2, on a contract that is not signed (before or after
--   the update), not an annex and not manual or imported. "Imported" is the print
--   page's own test (pages/contract-print/[id].tsx: not an annex and es_manual or no
--   joined programme); programa_id has a foreign key to programas, so "no joined
--   programme" is programa_id IS NULL. Anything else is refused
--   with 42501. Nobody moves a contract back. The owner and server jobs
--   (auth.uid() IS NULL) are not checked on UPDATE.
-- Additive: one column, one function, one trigger. No policy changes.

ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS plantilla_version smallint;

ALTER TABLE public.contratos ALTER COLUMN plantilla_version SET DEFAULT 2;

COMMENT ON COLUMN public.contratos.plantilla_version IS
  'Which contract text this contract prints. Empty: the text as printed before this column existed (contracts made before 24 Nov 2026). 2: the corrected text (every new contract). An admin may move an unsigned programme contract from empty to 2, never back.';

CREATE FUNCTION public.guard_contrato_plantilla_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.plantilla_version := 2;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.plantilla_version IS DISTINCT FROM OLD.plantilla_version THEN
    IF NOT (OLD.plantilla_version IS NULL
            AND NEW.plantilla_version = 2
            AND NOT coalesce(OLD.firmado, false)
            AND NOT coalesce(NEW.firmado, false)
            AND NOT coalesce(OLD.is_anexo, false)
            AND NOT coalesce(OLD.es_manual, false)
            AND OLD.programa_id IS NOT NULL
            AND NEW.programa_id IS NOT NULL) THEN
      RAISE EXCEPTION 'F22: plantilla_version moves only from empty to 2, on an unsigned programme contract that is not an annex and not manual'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_contrato_plantilla_version() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.guard_contrato_plantilla_version() IS
  'F22 (T1): a contract keeps the text it was made with. Every new contract gets plantilla_version 2. A signed-in person may change the mark only from empty to 2, on a contract that is not signed, not an annex, not manual and has a programme; never back. Calls without a signed-in person (the owner, server jobs) are not checked on update.';

CREATE TRIGGER trg_guard_contrato_plantilla_version
  BEFORE INSERT OR UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.guard_contrato_plantilla_version();
