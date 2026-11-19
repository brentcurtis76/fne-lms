-- LIC-B3 (GENERA fixes F20b): store the evaluation date the commission types on the
-- evaluation screen, so the Acta prints it. Additive; no rule changes (since LIC-C2 every
-- tender write goes through the server routes).
ALTER TABLE public.licitaciones ADD COLUMN IF NOT EXISTS fecha_evaluacion date;

COMMENT ON COLUMN public.licitaciones.fecha_evaluacion IS 'The day the evaluation commission met, as typed on the evaluation screen. Printed on the Acta; when empty, the Acta prints the day it is generated in Chile.';
