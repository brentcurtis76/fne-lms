-- LIC-C2: an encargado's own session reads its school's tenders and writes nothing
-- directly; every tender write goes through the server routes (service role).
-- Synthetic-only fixtures (schools 9121/9122, ids 12100000-…); the transaction rolls
-- everything back.
BEGIN;
SELECT no_plan();

CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;

-- Every direct write a crafted request could make on school 1's tender and its rows.
-- Expected for any non-admin caller: UPDATE affects 0 rows, INSERT throws 42501.
CREATE FUNCTION pg_temp.write_matrix(who text) RETURNS SETOF text LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitaciones SET estado='cerrada' WHERE id='12100000-0000-4000-8000-000000000001'$q$),0,who||': licitaciones UPDATE estado');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitaciones SET monto_adjudicado_uf=150 WHERE id='12100000-0000-4000-8000-000000000001'$q$),0,who||': licitaciones UPDATE monto_adjudicado_uf');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitaciones SET ganador_ate_id='12100000-0000-4000-8000-000000000011' WHERE id='12100000-0000-4000-8000-000000000001'$q$),0,who||': licitaciones UPDATE ganador_ate_id');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_ates(licitacion_id,nombre_ate) VALUES('12100000-0000-4000-8000-000000000001','Synthetic crafted ATE')$q$,'42501',NULL,who||': licitacion_ates INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_ates SET es_ganador=true, puntaje_total=100 WHERE id='12100000-0000-4000-8000-000000000011'$q$),0,who||': licitacion_ates UPDATE');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_comision(licitacion_id,nombre,orden) VALUES('12100000-0000-4000-8000-000000000001','Synthetic crafted member',2)$q$,'42501',NULL,who||': licitacion_comision INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_comision SET cargo='Synthetic crafted' WHERE id='12100000-0000-4000-8000-000000000021'$q$),0,who||': licitacion_comision UPDATE');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_consultas(licitacion_id,pregunta) VALUES('12100000-0000-4000-8000-000000000001','Synthetic crafted question')$q$,'42501',NULL,who||': licitacion_consultas INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_consultas SET respuesta='Synthetic crafted' WHERE id='12100000-0000-4000-8000-000000000031'$q$),0,who||': licitacion_consultas UPDATE');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_documentos(licitacion_id,tipo,nombre,storage_path,file_name) VALUES('12100000-0000-4000-8000-000000000001','evaluacion_firmada','Synthetic crafted','synthetic/crafted.pdf','crafted.pdf')$q$,'42501',NULL,who||': licitacion_documentos INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_documentos SET nombre='Synthetic crafted' WHERE id='12100000-0000-4000-8000-000000000041'$q$),0,who||': licitacion_documentos UPDATE');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_evaluaciones(licitacion_id,ate_id,criterio_id,puntaje) VALUES('12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000011','12100000-0000-4000-8000-0000000000c2',10)$q$,'42501',NULL,who||': licitacion_evaluaciones INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_evaluaciones SET puntaje=10 WHERE id='12100000-0000-4000-8000-000000000051'$q$),0,who||': licitacion_evaluaciones UPDATE');
  RETURN NEXT throws_ok($q$INSERT INTO public.licitacion_historial(licitacion_id,accion) VALUES('12100000-0000-4000-8000-000000000001','Synthetic crafted action')$q$,'42501',NULL,who||': licitacion_historial INSERT denied');
  RETURN NEXT is(pg_temp.affected($q$UPDATE public.licitacion_historial SET accion='Synthetic crafted' WHERE id='12100000-0000-4000-8000-000000000061'$q$),0,who||': licitacion_historial UPDATE');
END $$;

-- How many of school 1's fixture rows the caller can SELECT, per table.
CREATE FUNCTION pg_temp.read_matrix(who text, expected int) RETURNS SETOF text LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEXT is((SELECT count(*)::int FROM public.licitaciones WHERE id='12100000-0000-4000-8000-000000000001'),expected,who||': licitaciones SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_ates WHERE id='12100000-0000-4000-8000-000000000011'),expected,who||': licitacion_ates SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_comision WHERE id='12100000-0000-4000-8000-000000000021'),expected,who||': licitacion_comision SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_consultas WHERE id='12100000-0000-4000-8000-000000000031'),expected,who||': licitacion_consultas SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_documentos WHERE id='12100000-0000-4000-8000-000000000041'),expected,who||': licitacion_documentos SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_evaluaciones WHERE id='12100000-0000-4000-8000-000000000051'),expected,who||': licitacion_evaluaciones SELECT school 1');
  RETURN NEXT is((SELECT count(*)::int FROM public.licitacion_historial WHERE id='12100000-0000-4000-8000-000000000061'),expected,who||': licitacion_historial SELECT school 1');
END $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the test superuser)
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('lic121_admin');
SELECT tests.create_supabase_user('lic121_encargado_1');
SELECT tests.create_supabase_user('lic121_encargado_2');
SELECT tests.create_supabase_user('lic121_docente_1');
INSERT INTO public.schools(id,name) VALUES (9121,'LIC121 School'),(9122,'LIC121 Other School');
INSERT INTO public.profiles(id,email,name,approval_status)
SELECT pg_temp.uid('lic121_'||r),r||'@lic121.qa.local.test',r,'approved'
FROM unnest(ARRAY['admin','encargado_1','encargado_2','docente_1']) r ON CONFLICT(id) DO NOTHING;
INSERT INTO public.user_roles(user_id,role_type,school_id,community_id,is_active) VALUES
(pg_temp.uid('lic121_admin'),'admin',NULL,NULL,true),
(pg_temp.uid('lic121_encargado_1'),'encargado_licitacion',9121,NULL,true),
(pg_temp.uid('lic121_encargado_2'),'encargado_licitacion',9122,NULL,true),
(pg_temp.uid('lic121_docente_1'),'docente',9121,NULL,true);
INSERT INTO public.programa_evaluacion_criterios(id,programa_id,nombre_criterio,puntaje_maximo) VALUES
('12100000-0000-4000-8000-0000000000c1','lic121-programa','Synthetic criterion',20),
('12100000-0000-4000-8000-0000000000c2','lic121-programa','Synthetic criterion two',20),
('12100000-0000-4000-8000-0000000000c3','lic121-programa','Synthetic criterion three',20);
INSERT INTO public.licitaciones(id,numero_licitacion,school_id,programa_id,nombre_licitacion,year,estado,email_licitacion,
  monto_minimo,monto_maximo,tipo_moneda,duracion_minima,duracion_maxima,peso_evaluacion_tecnica,peso_evaluacion_economica) VALUES
('12100000-0000-4000-8000-000000000001','LIC121-1',9121,'lic121-programa','Synthetic tender one',2026,'propuestas_pendientes','tender1@lic121.qa.local.test',100,200,'UF','3 meses','6 meses',70,30),
('12100000-0000-4000-8000-000000000002','LIC121-2',9122,'lic121-programa','Synthetic tender two',2026,'borrador','tender2@lic121.qa.local.test',50,80,'UF','1 mes','2 meses',60,40);
INSERT INTO public.licitacion_ates(id,licitacion_id,nombre_ate) VALUES
('12100000-0000-4000-8000-000000000011','12100000-0000-4000-8000-000000000001','Synthetic ATE one'),
('12100000-0000-4000-8000-000000000012','12100000-0000-4000-8000-000000000002','Synthetic ATE two');
INSERT INTO public.licitacion_comision(id,licitacion_id,nombre,orden) VALUES
('12100000-0000-4000-8000-000000000021','12100000-0000-4000-8000-000000000001','Synthetic member',1);
INSERT INTO public.licitacion_consultas(id,licitacion_id,ate_id,pregunta) VALUES
('12100000-0000-4000-8000-000000000031','12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000011','Synthetic question');
INSERT INTO public.licitacion_documentos(id,licitacion_id,tipo,nombre,storage_path,file_name) VALUES
('12100000-0000-4000-8000-000000000041','12100000-0000-4000-8000-000000000001','otro','Synthetic document','synthetic/lic121.pdf','lic121.pdf');
INSERT INTO public.licitacion_evaluaciones(id,licitacion_id,ate_id,criterio_id,puntaje) VALUES
('12100000-0000-4000-8000-000000000051','12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000011','12100000-0000-4000-8000-0000000000c1',12);
INSERT INTO public.licitacion_historial(id,licitacion_id,accion) VALUES
('12100000-0000-4000-8000-000000000061','12100000-0000-4000-8000-000000000001','Synthetic creation');

-- ---------------------------------------------------------------------------
-- Encargado of school 1 — broken first: today these writes go through
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('lic121_encargado_1');
SELECT * FROM pg_temp.read_matrix('encargado school 1 (must still read)',1);
SELECT * FROM pg_temp.write_matrix('encargado school 1');
SELECT is((SELECT count(*)::int FROM public.licitaciones WHERE id='12100000-0000-4000-8000-000000000002'),0,'encargado school 1: does not see school 2 tender');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT estado FROM public.licitaciones WHERE id='12100000-0000-4000-8000-000000000001'),'propuestas_pendientes','encargado school 1: tender estado unchanged');
SELECT is((SELECT count(*)::int FROM public.licitacion_ates WHERE licitacion_id='12100000-0000-4000-8000-000000000001'),1,'encargado school 1: no ATE row added');

-- ---------------------------------------------------------------------------
-- Encargado of school 2, docente of school 1, anon
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('lic121_encargado_2');
SELECT * FROM pg_temp.read_matrix('encargado school 2',0);
SELECT * FROM pg_temp.write_matrix('encargado school 2');
SELECT is((SELECT count(*)::int FROM public.licitaciones WHERE id='12100000-0000-4000-8000-000000000002'),1,'encargado school 2: still sees own school tender');
SELECT is((SELECT count(*)::int FROM public.licitacion_ates WHERE id='12100000-0000-4000-8000-000000000012'),1,'encargado school 2: still sees own school ATE');
SELECT is(pg_temp.affected($q$UPDATE public.licitaciones SET notas='Synthetic crafted' WHERE id='12100000-0000-4000-8000-000000000002'$q$),0,'encargado school 2: own tender UPDATE 0 rows');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('lic121_docente_1');
SELECT * FROM pg_temp.read_matrix('docente school 1',0);
SELECT * FROM pg_temp.write_matrix('docente school 1');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT * FROM pg_temp.read_matrix('anon',0);
SELECT * FROM pg_temp.write_matrix('anon');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Admin — must still insert, update and delete on all seven tables
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('lic121_admin');
SELECT * FROM pg_temp.read_matrix('admin',1);
SELECT lives_ok($q$INSERT INTO public.licitaciones(id,numero_licitacion,school_id,programa_id,nombre_licitacion,year,estado,email_licitacion,monto_minimo,monto_maximo,duracion_minima,duracion_maxima,peso_evaluacion_tecnica,peso_evaluacion_economica) VALUES('12100000-0000-4000-8000-000000000003','LIC121-3',9121,'lic121-programa','Synthetic admin tender',2027,'borrador','tender3@lic121.qa.local.test',10,20,'1 mes','2 meses',50,50)$q$,'admin: licitaciones INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitaciones SET estado='adjudicacion_pendiente', monto_adjudicado_uf=150, ganador_ate_id='12100000-0000-4000-8000-000000000011' WHERE id='12100000-0000-4000-8000-000000000001'$q$),1,'admin: licitaciones UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_ates(id,licitacion_id,nombre_ate) VALUES('12100000-0000-4000-8000-000000000013','12100000-0000-4000-8000-000000000001','Synthetic admin ATE')$q$,'admin: licitacion_ates INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_ates SET notas='Synthetic admin' WHERE id='12100000-0000-4000-8000-000000000011'$q$),1,'admin: licitacion_ates UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_comision(id,licitacion_id,nombre,orden) VALUES('12100000-0000-4000-8000-000000000022','12100000-0000-4000-8000-000000000001','Synthetic admin member',2)$q$,'admin: licitacion_comision INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_comision SET cargo='Synthetic admin' WHERE id='12100000-0000-4000-8000-000000000021'$q$),1,'admin: licitacion_comision UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_consultas(id,licitacion_id,pregunta) VALUES('12100000-0000-4000-8000-000000000032','12100000-0000-4000-8000-000000000001','Synthetic admin question')$q$,'admin: licitacion_consultas INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_consultas SET respuesta='Synthetic admin' WHERE id='12100000-0000-4000-8000-000000000031'$q$),1,'admin: licitacion_consultas UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_documentos(id,licitacion_id,tipo,nombre,storage_path,file_name) VALUES('12100000-0000-4000-8000-000000000042','12100000-0000-4000-8000-000000000001','otro','Synthetic admin document','synthetic/lic121-admin.pdf','lic121-admin.pdf')$q$,'admin: licitacion_documentos INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_documentos SET nombre='Synthetic admin' WHERE id='12100000-0000-4000-8000-000000000041'$q$),1,'admin: licitacion_documentos UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_evaluaciones(id,licitacion_id,ate_id,criterio_id,puntaje) VALUES('12100000-0000-4000-8000-000000000052','12100000-0000-4000-8000-000000000001','12100000-0000-4000-8000-000000000011','12100000-0000-4000-8000-0000000000c3',15)$q$,'admin: licitacion_evaluaciones INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_evaluaciones SET puntaje=18 WHERE id='12100000-0000-4000-8000-000000000051'$q$),1,'admin: licitacion_evaluaciones UPDATE');
SELECT lives_ok($q$INSERT INTO public.licitacion_historial(id,licitacion_id,accion) VALUES('12100000-0000-4000-8000-000000000062','12100000-0000-4000-8000-000000000001','Synthetic admin action')$q$,'admin: licitacion_historial INSERT');
SELECT is(pg_temp.affected($q$UPDATE public.licitacion_historial SET accion='Synthetic admin' WHERE id='12100000-0000-4000-8000-000000000061'$q$),1,'admin: licitacion_historial UPDATE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_ates WHERE id='12100000-0000-4000-8000-000000000013'$q$),1,'admin: licitacion_ates DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_comision WHERE id='12100000-0000-4000-8000-000000000022'$q$),1,'admin: licitacion_comision DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_consultas WHERE id='12100000-0000-4000-8000-000000000032'$q$),1,'admin: licitacion_consultas DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_documentos WHERE id='12100000-0000-4000-8000-000000000042'$q$),1,'admin: licitacion_documentos DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_evaluaciones WHERE id='12100000-0000-4000-8000-000000000052'$q$),1,'admin: licitacion_evaluaciones DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitacion_historial WHERE id='12100000-0000-4000-8000-000000000062'$q$),1,'admin: licitacion_historial DELETE');
SELECT is(pg_temp.affected($q$DELETE FROM public.licitaciones WHERE id='12100000-0000-4000-8000-000000000003'$q$),1,'admin: licitaciones DELETE');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- The rules themselves: the eleven write rules are admin-only, the seven
-- encargado read rules still name the encargado role.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND policyname LIKE 'licitacion%_encargado_%' AND cmd IN ('INSERT','UPDATE')
      AND coalesce(qual,'')||coalesce(with_check,'') LIKE '%encargado_licitacion%'),
  0,'no encargado INSERT/UPDATE rule on the tender tables names the encargado role');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND policyname LIKE 'licitacion%_encargado_%' AND cmd IN ('INSERT','UPDATE')
      AND coalesce(qual,'')||coalesce(with_check,'') LIKE '%''admin''::%user_role_type%'),
  11,'the eleven encargado write rules now require an active admin');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='public' AND policyname LIKE 'licitacion%_encargado_select' AND cmd='SELECT'
      AND qual LIKE '%encargado_licitacion%'),
  7,'the seven encargado read rules are unchanged in role');

SELECT * FROM finish();
ROLLBACK;
