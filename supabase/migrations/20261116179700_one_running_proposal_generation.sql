-- GENERA fixes F14, send-back 1 (S4): at most one running proposal generation
-- per tender, as a fact of the database. Two requests that each recover the
-- same stale «generando» row can no longer both start a generation: the second
-- insert of a «generando» row for the same licitacion is refused with an
-- exclusion violation (SQLSTATE 23P01), which
-- pages/api/licitaciones/[id]/generate-propuesta.ts answers with
-- «Ya hay una generación en curso».
-- Add-only: one exclusion constraint (btree, equality on licitacion_id, only
-- among rows with estado = 'generando'); no existing row is changed.

ALTER TABLE public.propuesta_generadas
  ADD CONSTRAINT propuesta_generadas_one_running_per_licitacion
  EXCLUDE USING btree (licitacion_id WITH =) WHERE (estado = 'generando');
