-- 20250205_transformation_guards.sql
-- Previene eliminación accidental de rúbricas con resultados asociados

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_rubric_deletion_with_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transformation_results tr
    WHERE tr.rubric_item_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar el ítem de rúbrica % porque existen resultados asociados', OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_transformation_rubric_deletion ON public.transformation_rubric;

CREATE TRIGGER protect_transformation_rubric_deletion
  BEFORE DELETE ON public.transformation_rubric
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_rubric_deletion_with_results();

COMMIT;
