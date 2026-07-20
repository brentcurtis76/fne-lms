-- Additive: optional generation captured by the generic public signup flow
-- (/registro, source 'registro_general'). Tractor signups leave it NULL.
-- No RLS changes: the existing admin-only policy covers the new column and
-- the public endpoints use the service-role client.
ALTER TABLE public.tractor_signups
  ADD COLUMN IF NOT EXISTS generation_id UUID
    REFERENCES public.generations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tractor_signups.generation_id IS
  'Optional generation selected on the public signup form. Only the generic flow (source registro_general) captures it; applied to profiles.generation_id at grant time when safe.';
