-- F24a (GENERA fixes, Brent 20 Nov 2026 "No, keep it off"): an awarded or closed tender
-- (contrato_pendiente, contrato_generado, adjudicada_externo, cerrada) is never deleted
-- through a user session. The RESTRICTIVE rule "licitaciones_awarded_not_deleted" closes
-- the admin's own session, the last direct door ("licitaciones_admin_all" is FOR ALL);
-- the server route, with the service key, decides. A tender before the award can still
-- be deleted by an admin, and the admin's UPDATE is untouched (the rule is DELETE only).
-- Synthetic-only fixtures (school 9166, ids 16600000-…); the transaction rolls
-- everything back.
BEGIN;
SELECT no_plan();

CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;

-- Fixtures (as the test superuser)
SELECT tests.create_supabase_user('lic166_admin');
SELECT tests.create_supabase_user('lic166_encargado');
INSERT INTO public.schools(id,name) VALUES (9166,'LIC166 School');
INSERT INTO public.profiles(id,email,name,approval_status)
SELECT pg_temp.uid('lic166_'||r),r||'@lic166.qa.local.test',r,'approved'
FROM unnest(ARRAY['admin','encargado']) r ON CONFLICT(id) DO NOTHING;
INSERT INTO public.user_roles(user_id,role_type,school_id,community_id,is_active) VALUES
(pg_temp.uid('lic166_admin'),'admin',NULL,NULL,true),
(pg_temp.uid('lic166_encargado'),'encargado_licitacion',9166,NULL,true);
INSERT INTO public.licitaciones(id,numero_licitacion,school_id,programa_id,nombre_licitacion,year,estado,email_licitacion,
  monto_minimo,monto_maximo,tipo_moneda,duracion_minima,duracion_maxima,peso_evaluacion_tecnica,peso_evaluacion_economica)
SELECT ('16600000-0000-4000-8000-00000000000'||n)::uuid,'LIC166-'||n,9166,'lic166-programa-'||n,'Synthetic tender '||n,2026,e,
  'tender@lic166.qa.local.test',100,200,'UF','3 meses','6 meses',70,30
FROM (VALUES (1,'contrato_pendiente'),(2,'contrato_generado'),(3,'adjudicada_externo'),(4,'cerrada'),(5,'publicacion_pendiente')) v(n,e);

SELECT is((SELECT count(*)::int FROM public.licitaciones WHERE school_id=9166),5,'five synthetic tenders, one per state');

-- The rule itself
SELECT is((SELECT permissive FROM pg_policies WHERE schemaname='public' AND tablename='licitaciones' AND policyname='licitaciones_awarded_not_deleted'),
  'RESTRICTIVE','licitaciones_awarded_not_deleted is RESTRICTIVE');
SELECT is((SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='licitaciones' AND policyname='licitaciones_awarded_not_deleted'),
  'DELETE','licitaciones_awarded_not_deleted is for DELETE only');

-- The school's encargado, with their own session: deletes nothing
SELECT tests.authenticate_as('lic166_encargado');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000005'$q$),0,'encargado: DELETE publicacion_pendiente changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000001'$q$),0,'encargado: DELETE contrato_pendiente changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000004'$q$),0,'encargado: DELETE cerrada changes 0 rows');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.licitaciones WHERE school_id=9166),5,'encargado: all five tenders are still there');

-- The admin's own session: an awarded or closed tender is not deleted
SELECT tests.authenticate_as('lic166_admin');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000001'$q$),0,'admin: DELETE contrato_pendiente changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000002'$q$),0,'admin: DELETE contrato_generado changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000003'$q$),0,'admin: DELETE adjudicada_externo changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000004'$q$),0,'admin: DELETE cerrada changes 0 rows');
-- The rule is about DELETE only: the admin's UPDATE of an awarded tender still changes 1 row
SELECT is(pg_temp.affected($q$UPDATE public.licitaciones SET nombre_licitacion='Synthetic tender 1 renamed' WHERE id='16600000-0000-4000-8000-000000000001'$q$),1,'admin: UPDATE contrato_pendiente still changes 1 row');
-- A tender before the award can still be deleted by the admin
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000005'$q$),1,'admin: DELETE publicacion_pendiente changes 1 row');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is((SELECT array_agg(estado ORDER BY estado)::text[] FROM public.licitaciones WHERE school_id=9166),
  ARRAY['adjudicada_externo','cerrada','contrato_generado','contrato_pendiente']::text[],
  'admin: the four awarded or closed tenders are still there, the publicacion_pendiente one is gone');

-- The service key (the server route) bypasses the rule: the route decides
SET LOCAL ROLE service_role;
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='16600000-0000-4000-8000-000000000004'$q$),1,'service key: DELETE cerrada changes 1 row (the route decides)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
