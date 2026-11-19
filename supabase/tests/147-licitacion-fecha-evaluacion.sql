-- LIC-B3 (GENERA fixes F20b): the tender stores the evaluation date the commission
-- types (licitaciones.fecha_evaluacion, a date). Like every other tender column since
-- LIC-C2 (test 121), an encargado's own session cannot write it directly; an admin can.
-- Synthetic-only fixtures (school 9147, ids 14700000-…); the transaction rolls
-- everything back.
BEGIN;
SELECT no_plan();

CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;

-- The column
SELECT has_column('public', 'licitaciones', 'fecha_evaluacion', 'licitaciones.fecha_evaluacion exists');
SELECT col_type_is('public', 'licitaciones', 'fecha_evaluacion', 'date', 'licitaciones.fecha_evaluacion is a date');
SELECT col_is_null('public', 'licitaciones', 'fecha_evaluacion', 'licitaciones.fecha_evaluacion is optional');

-- Fixtures (as the test superuser)
SELECT tests.create_supabase_user('lic147_admin');
SELECT tests.create_supabase_user('lic147_encargado');
INSERT INTO public.schools(id,name) VALUES (9147,'LIC147 School');
INSERT INTO public.profiles(id,email,name,approval_status)
SELECT pg_temp.uid('lic147_'||r),r||'@lic147.qa.local.test',r,'approved'
FROM unnest(ARRAY['admin','encargado']) r ON CONFLICT(id) DO NOTHING;
INSERT INTO public.user_roles(user_id,role_type,school_id,community_id,is_active) VALUES
(pg_temp.uid('lic147_admin'),'admin',NULL,NULL,true),
(pg_temp.uid('lic147_encargado'),'encargado_licitacion',9147,NULL,true);
INSERT INTO public.licitaciones(id,numero_licitacion,school_id,programa_id,nombre_licitacion,year,estado,email_licitacion,
  monto_minimo,monto_maximo,tipo_moneda,duracion_minima,duracion_maxima,peso_evaluacion_tecnica,peso_evaluacion_economica) VALUES
('14700000-0000-4000-8000-000000000001','LIC147-1',9147,'lic147-programa','Synthetic tender',2026,'evaluacion_pendiente','tender@lic147.qa.local.test',100,200,'UF','3 meses','6 meses',70,30);

SELECT is((SELECT fecha_evaluacion FROM public.licitaciones WHERE id='14700000-0000-4000-8000-000000000001'),NULL::date,'a new tender has no evaluation date');

-- The school's encargado, with their own session: sees the tender, writes nothing
SELECT tests.authenticate_as('lic147_encargado');
SELECT is((SELECT count(*)::int FROM public.licitaciones WHERE id='14700000-0000-4000-8000-000000000001'),1,'encargado: sees own school tender');
SELECT is(pg_temp.affected($q$UPDATE public.licitaciones SET fecha_evaluacion='2026-11-05' WHERE id='14700000-0000-4000-8000-000000000001'$q$),0,'encargado: licitaciones UPDATE fecha_evaluacion changes 0 rows');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT fecha_evaluacion FROM public.licitaciones WHERE id='14700000-0000-4000-8000-000000000001'),NULL::date,'encargado: the evaluation date is unchanged');

-- An admin, as test 121 shows for the other columns: the UPDATE changes 1 row
SELECT tests.authenticate_as('lic147_admin');
SELECT is(pg_temp.affected($q$UPDATE public.licitaciones SET fecha_evaluacion='2026-11-05' WHERE id='14700000-0000-4000-8000-000000000001'$q$),1,'admin: licitaciones UPDATE fecha_evaluacion');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT fecha_evaluacion FROM public.licitaciones WHERE id='14700000-0000-4000-8000-000000000001'),'2026-11-05'::date,'admin: the evaluation date is stored');

SELECT * FROM finish();
ROLLBACK;
