-- GENERA fixes F14, send-back 1 (S4): at most one running proposal generation
-- per tender, as a fact of the database. Two requests that each recover the
-- same stale «generando» row can no longer both start a generation: the second
-- insert of a «generando» row for the same licitacion is refused with a unique
-- violation (23505), which pages/api/licitaciones/[id]/generate-propuesta.ts
-- answers with «Ya hay una generación en curso».
-- Add-only: one partial unique index; no existing row is changed.

CREATE UNIQUE INDEX IF NOT EXISTS propuesta_generadas_one_running_per_licitacion
  ON public.propuesta_generadas (licitacion_id)
  WHERE estado = 'generando';
