-- F24a (GENERA fixes, Brent 20 Nov 2026): an awarded or closed tender is never deleted
-- through a user session.
--
-- "licitaciones_admin_all" (baseline) is FOR ALL with no command limit, so an admin's own
-- session could DELETE any tender (and its rows by cascade). This RESTRICTIVE rule is ANDed
-- with the existing permissive rules, which stay in place: a DELETE through a user session
-- only reaches tenders that are not awarded or closed. SELECT, INSERT and UPDATE are not
-- affected. The service role keeps BYPASSRLS, so the server route (which decides, with its
-- own state rule) is unchanged.

CREATE POLICY "licitaciones_awarded_not_deleted"
  ON public.licitaciones
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (
    estado <> ALL (ARRAY['contrato_pendiente'::text, 'contrato_generado'::text, 'adjudicada_externo'::text, 'cerrada'::text])
  );

COMMENT ON POLICY "licitaciones_awarded_not_deleted" ON public.licitaciones IS
  'An awarded or closed tender (contrato_pendiente, contrato_generado, adjudicada_externo, cerrada) is never deleted through a user session; the server route, with the service key, decides.';
