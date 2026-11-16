-- F7 (GES-1.2, GES-1.1a, N20): the programme catalogue, the Pasantías quotes,
-- the stored role summary and the support-ticket counters are closed to
-- visitors; quotes are the admin's or their own consultor's.
-- Migration 20261116170000_gestion_close_visitor_access.sql. Synthetic-only, rollback.
BEGIN;
SELECT plan(88);
CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
CREATE FUNCTION pg_temp.all_feedback() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.platform_feedback $$;

-- Personas
SELECT tests.create_supabase_user('ges122_admin');
SELECT tests.create_supabase_user('ges122_cons_x');
SELECT tests.create_supabase_user('ges122_cons_y');
SELECT tests.create_supabase_user('ges122_encargado');
SELECT tests.create_supabase_user('ges122_docente');
INSERT INTO public.schools(id,name) VALUES(9122,'GES122 synthetic school');
INSERT INTO public.profiles(id,email,name,approval_status,must_change_password) VALUES
 (pg_temp.uid('ges122_admin'),'admin@ges122.qa.local.test','Synthetic admin','approved',false),
 (pg_temp.uid('ges122_cons_x'),'consx@ges122.qa.local.test','Synthetic consultor X','approved',false),
 (pg_temp.uid('ges122_cons_y'),'consy@ges122.qa.local.test','Synthetic consultor Y','approved',false),
 (pg_temp.uid('ges122_encargado'),'encargado@ges122.qa.local.test','Synthetic encargado','approved',false),
 (pg_temp.uid('ges122_docente'),'docente@ges122.qa.local.test','Synthetic docente','approved',false)
ON CONFLICT(id) DO UPDATE SET must_change_password=EXCLUDED.must_change_password, approval_status=EXCLUDED.approval_status;
INSERT INTO public.user_roles(user_id,role_type,school_id,is_active) VALUES
 (pg_temp.uid('ges122_admin'),'admin',NULL,true),
 (pg_temp.uid('ges122_cons_x'),'consultor',9122,true),
 (pg_temp.uid('ges122_cons_y'),'consultor',9122,true),
 (pg_temp.uid('ges122_encargado'),'encargado_licitacion',9122,true),
 (pg_temp.uid('ges122_docente'),'docente',9122,true);
REFRESH MATERIALIZED VIEW public.user_roles_cache;

-- Programme catalogue fixtures (P3 is the target of the visitor/docente writes)
INSERT INTO public.programas(id,nombre) VALUES
 ('12200000-0000-4000-8000-000000000001','GES122 synthetic programme 1'),
 ('12200000-0000-4000-8000-000000000002','GES122 synthetic programme 2'),
 ('12200000-0000-4000-8000-000000000003','GES122 synthetic programme 3');

-- Quote fixtures: Q1 by the admin, Q2 by consultor X with two travel groups
INSERT INTO public.pasantias_quotes(id,client_name,arrival_date,departure_date,room_type,status,internal_notes,created_by) VALUES
 ('12200000-0000-4000-8000-000000000011','GES122 synthetic client 1','2027-03-01','2027-03-08','double','sent','Synthetic internal note 1',pg_temp.uid('ges122_admin'));
INSERT INTO public.pasantias_quotes(id,client_name,arrival_date,departure_date,room_type,status,use_groups,internal_notes,created_by) VALUES
 ('12200000-0000-4000-8000-000000000012','GES122 synthetic client 2','2027-04-01','2027-04-08','single','draft',true,'Synthetic internal note 2',pg_temp.uid('ges122_cons_x'));
INSERT INTO public.pasantias_quote_groups(id,quote_id,group_name,num_participants,arrival_date,departure_date,room_type) VALUES
 ('12200000-0000-4000-8000-000000000021','12200000-0000-4000-8000-000000000012','Synthetic group A',2,'2027-04-01','2027-04-08','single'),
 ('12200000-0000-4000-8000-000000000022','12200000-0000-4000-8000-000000000012','Synthetic group B',3,'2027-04-02','2027-04-08','double');

-- Support tickets: two by the docente, one by the admin
INSERT INTO public.platform_feedback(id,description,type,status,created_by) VALUES
 ('12200000-0000-4000-8000-000000000031','Synthetic ticket 1','bug','new',pg_temp.uid('ges122_docente')),
 ('12200000-0000-4000-8000-000000000032','Synthetic ticket 2','idea','seen',pg_temp.uid('ges122_docente')),
 ('12200000-0000-4000-8000-000000000033','Synthetic ticket 3','feedback','new',pg_temp.uid('ges122_admin'));

SELECT ok((SELECT count(*) FROM public.user_roles_cache WHERE user_id IN (pg_temp.uid('ges122_admin'),pg_temp.uid('ges122_docente')))=2,
  'fixture: role summary holds the personas');

-- ===================== anon (visitor) =====================
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT set_config('role','anon',true);
-- GES-1.2
SELECT throws_ok($q$SELECT * FROM public.programas$q$,'42501',NULL,'anon: programas SELECT denied');
SELECT throws_ok($q$INSERT INTO public.programas(nombre) VALUES('GES122 anon insert')$q$,'42501',NULL,'anon: programas INSERT denied');
SELECT throws_ok($q$UPDATE public.programas SET nombre='GES122 anon update' WHERE id='12200000-0000-4000-8000-000000000003'$q$,'42501',NULL,'anon: programas UPDATE denied');
SELECT throws_ok($q$DELETE FROM public.programas WHERE id='12200000-0000-4000-8000-000000000003'$q$,'42501',NULL,'anon: programas DELETE denied');
-- GES-1.1a
SELECT throws_ok($q$SELECT * FROM public.pasantias_quotes$q$,'42501',NULL,'anon: pasantias_quotes SELECT denied');
SELECT throws_ok($q$SELECT * FROM public.pasantias_quote_groups$q$,'42501',NULL,'anon: pasantias_quote_groups SELECT denied');
SELECT throws_ok($q$SELECT nextval('public.pasantias_quote_number_seq')$q$,'42501',NULL,'anon: quote number sequence denied');
-- N20
SELECT throws_ok($q$SELECT count(*) FROM public.user_roles_cache$q$,'42501',NULL,'anon: user_roles_cache SELECT denied');
SELECT throws_ok($q$SELECT * FROM public.feedback_stats$q$,'42501',NULL,'anon: feedback_stats SELECT denied');
RESET ROLE;
SELECT set_config('request.jwt.claims',NULL,true);

-- ===================== docente =====================
SELECT tests.authenticate_as('ges122_docente');
SELECT is((SELECT count(*)::int FROM public.programas WHERE id::text LIKE '12200000-%'),3,'docente: programas SELECT returns the fixture rows');
SELECT throws_ok($q$INSERT INTO public.programas(nombre) VALUES('GES122 docente insert')$q$,'42501',NULL,'docente: programas INSERT denied');
SELECT is(pg_temp.affected($q$UPDATE public.programas SET nombre='GES122 docente update' WHERE id='12200000-0000-4000-8000-000000000003'$q$),0,'docente: programas UPDATE changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.programas WHERE id='12200000-0000-4000-8000-000000000003'$q$),0,'docente: programas DELETE changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id::text LIKE '12200000-%'),0,'docente: sees 0 quotes');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE id::text LIKE '12200000-%'),0,'docente: sees 0 quote groups');
SELECT throws_ok($q$SELECT count(*) FROM public.user_roles_cache$q$,'42501',NULL,'docente: user_roles_cache SELECT denied');
SELECT is(public.auth_get_user_role(),'docente','docente: auth_get_user_role() still answers from the role summary');
SELECT is(public.auth_is_teacher(),false,'docente: auth_is_teacher() still answers false');
SELECT is((SELECT (bug_count+idea_count+feedback_count)::int FROM public.feedback_stats),2,'docente: feedback_stats counts own tickets only');
SELECT is((SELECT bug_count::int FROM public.feedback_stats),1,'docente: own bug ticket counted');
RESET ROLE;

-- ===================== encargado de licitación =====================
SELECT tests.authenticate_as('ges122_encargado');
SELECT is((SELECT count(*)::int FROM public.programas WHERE id::text LIKE '12200000-%'),3,'encargado: programas SELECT returns the fixture rows');
SELECT throws_ok($q$INSERT INTO public.programas(nombre) VALUES('GES122 encargado insert')$q$,'42501',NULL,'encargado: programas INSERT denied');
SELECT is(pg_temp.affected($q$UPDATE public.programas SET nombre='GES122 encargado update' WHERE id='12200000-0000-4000-8000-000000000003'$q$),0,'encargado: programas UPDATE changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.programas WHERE id='12200000-0000-4000-8000-000000000003'$q$),0,'encargado: programas DELETE changes 0 rows');
SELECT throws_ok($q$SELECT count(*) FROM public.user_roles_cache$q$,'42501',NULL,'encargado: user_roles_cache SELECT denied');
RESET ROLE;

-- ===================== consultor Y (not the owner of Q2) =====================
SELECT tests.authenticate_as('ges122_cons_y');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id IN ('12200000-0000-4000-8000-000000000011','12200000-0000-4000-8000-000000000012')),0,'consultor Y: sees 0 rows of Q1 and Q2');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id='12200000-0000-4000-8000-000000000012'),0,'consultor Y: sees 0 groups of Q2');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quotes SET grand_total=1 WHERE id='12200000-0000-4000-8000-000000000012'$q$),0,'consultor Y: UPDATE of Q2 changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.pasantias_quotes WHERE id='12200000-0000-4000-8000-000000000012'$q$),0,'consultor Y: DELETE of Q2 changes 0 rows');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quote_groups SET group_name='Y edit' WHERE id='12200000-0000-4000-8000-000000000021'$q$),0,'consultor Y: UPDATE of a Q2 group changes 0 rows');
SELECT is(pg_temp.affected($q$DELETE FROM public.pasantias_quote_groups WHERE id='12200000-0000-4000-8000-000000000022'$q$),0,'consultor Y: DELETE of a Q2 group changes 0 rows');
SELECT throws_ok($q$INSERT INTO public.pasantias_quote_groups(quote_id,num_participants,arrival_date,departure_date,room_type) VALUES('12200000-0000-4000-8000-000000000012',1,'2027-04-01','2027-04-08','single')$q$,'42501',NULL,'consultor Y: INSERT of a group on Q2 denied');
SELECT throws_ok(format($q$INSERT INTO public.pasantias_quotes(client_name,arrival_date,departure_date,room_type,created_by) VALUES('GES122 forged owner','2027-05-01','2027-05-03','single',%L)$q$, pg_temp.uid('ges122_cons_x')),'42501',NULL,'consultor Y: INSERT of a quote owned by X denied');
RESET ROLE;

-- ===================== consultor X (owner of Q2) =====================
SELECT tests.authenticate_as('ges122_cons_x');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id='12200000-0000-4000-8000-000000000012'),1,'consultor X: reads own Q2');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id='12200000-0000-4000-8000-000000000011'),0,'consultor X: does not read the admin''s Q1');
SELECT ok((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id='12200000-0000-4000-8000-000000000012')>=1,'consultor X: reads the groups of Q2');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quotes SET notes='X edit' WHERE id='12200000-0000-4000-8000-000000000012'$q$),1,'consultor X: UPDATE of own Q2 changes 1 row');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quotes SET notes='X edit' WHERE id='12200000-0000-4000-8000-000000000011'$q$),0,'consultor X: UPDATE of Q1 changes 0 rows');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quote_groups SET group_name='X edit' WHERE id='12200000-0000-4000-8000-000000000021'$q$),1,'consultor X: UPDATE of a Q2 group changes 1 row');
SELECT lives_ok($q$INSERT INTO public.pasantias_quote_groups(id,quote_id,group_name,num_participants,arrival_date,departure_date,room_type) VALUES('12200000-0000-4000-8000-000000000023','12200000-0000-4000-8000-000000000012','Synthetic group C',1,'2027-04-03','2027-04-08','single')$q$,'consultor X: INSERT of a group on own Q2 succeeds (with the group trigger)');
SELECT ok((SELECT grand_total IS NOT NULL FROM public.pasantias_quotes WHERE id='12200000-0000-4000-8000-000000000012'),'consultor X: Q2 totals row still readable after the group insert');
SELECT lives_ok(format($q$INSERT INTO public.pasantias_quotes(id,client_name,arrival_date,departure_date,room_type,use_groups,created_by) VALUES('12200000-0000-4000-8000-000000000013','GES122 synthetic client 3','2027-06-01','2027-06-05','double',true,%L)$q$, pg_temp.uid('ges122_cons_x')),'consultor X: INSERT of a new own quote succeeds');
SELECT lives_ok($q$INSERT INTO public.pasantias_quote_groups(id,quote_id,num_participants,arrival_date,departure_date,room_type) VALUES('12200000-0000-4000-8000-000000000024','12200000-0000-4000-8000-000000000013',2,'2027-06-01','2027-06-05','double')$q$,'consultor X: INSERT of a group on the new own quote succeeds');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id='12200000-0000-4000-8000-000000000013'),1,'consultor X: reads the new quote''s group');
SELECT is(pg_temp.affected($q$DELETE FROM public.pasantias_quote_groups WHERE id='12200000-0000-4000-8000-000000000024'$q$),1,'consultor X: DELETE of own group changes 1 row');
SELECT throws_ok($q$SELECT count(*) FROM public.user_roles_cache$q$,'42501',NULL,'consultor X: user_roles_cache SELECT denied');
RESET ROLE;

-- ===================== admin =====================
SELECT tests.authenticate_as('ges122_admin');
SELECT is((SELECT count(*)::int FROM public.programas WHERE id::text LIKE '12200000-%'),3,'admin: programas SELECT returns the fixture rows');
SELECT lives_ok($q$INSERT INTO public.programas(id,nombre) VALUES('12200000-0000-4000-8000-000000000004','GES122 admin insert')$q$,'admin: programas INSERT works');
SELECT is(pg_temp.affected($q$UPDATE public.programas SET nombre='GES122 admin update' WHERE id='12200000-0000-4000-8000-000000000001'$q$),1,'admin: programas UPDATE changes 1 row');
SELECT is(pg_temp.affected($q$DELETE FROM public.programas WHERE id='12200000-0000-4000-8000-000000000004'$q$),1,'admin: programas DELETE changes 1 row');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id::text LIKE '12200000-%'),3,'admin: reads every quote');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id='12200000-0000-4000-8000-000000000012'),3,'admin: reads every group of Q2');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quotes SET notes='admin edit' WHERE id='12200000-0000-4000-8000-000000000012'$q$),1,'admin: UPDATE of X''s Q2 changes 1 row');
SELECT is(pg_temp.affected($q$UPDATE public.pasantias_quote_groups SET group_name='admin edit' WHERE id='12200000-0000-4000-8000-000000000022'$q$),1,'admin: UPDATE of a Q2 group changes 1 row');
SELECT is(pg_temp.affected($q$DELETE FROM public.pasantias_quote_groups WHERE id='12200000-0000-4000-8000-000000000023'$q$),1,'admin: DELETE of a Q2 group changes 1 row');
SELECT is(pg_temp.affected($q$DELETE FROM public.pasantias_quotes WHERE id='12200000-0000-4000-8000-000000000013'$q$),1,'admin: DELETE of X''s quote changes 1 row');
SELECT throws_ok($q$SELECT count(*) FROM public.user_roles_cache$q$,'42501',NULL,'admin: user_roles_cache SELECT denied (functions only)');
SELECT is(public.auth_get_user_role(),'admin','admin: auth_get_user_role() still answers from the role summary');
SELECT is(public.auth_is_teacher(),true,'admin: auth_is_teacher() still answers true');
SELECT is((SELECT (bug_count+idea_count+feedback_count)::int FROM public.feedback_stats),pg_temp.all_feedback(),'admin: feedback_stats totals every ticket');
SELECT ok((SELECT (bug_count+idea_count+feedback_count) FROM public.feedback_stats)>=3,'admin: feedback_stats includes the fixture tickets');
RESET ROLE;

-- ===================== service role and catalog =====================
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('role','service_role',true);
SELECT ok((SELECT count(*) FROM public.user_roles_cache)>=2,'service_role: still reads user_roles_cache');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id::text LIKE '12200000-%'),2,'service_role: reads every remaining quote');
SELECT is((SELECT count(*)::int FROM public.programas WHERE id::text LIKE '12200000-%'),3,'service_role: reads the programme catalogue');
RESET ROLE;
SELECT set_config('request.jwt.claims',NULL,true);
SELECT ok(NOT has_table_privilege('anon','public.programas','SELECT'),'catalog: anon holds no privilege on programas');
SELECT ok(NOT has_table_privilege('authenticated','public.programas','TRUNCATE'),'catalog: authenticated holds no TRUNCATE on programas');
SELECT ok(NOT has_table_privilege('authenticated','public.programas','REFERENCES'),'catalog: authenticated holds no REFERENCES on programas');
SELECT ok(NOT has_table_privilege('authenticated','public.programas','TRIGGER'),'catalog: authenticated holds no TRIGGER on programas');
SELECT ok(has_table_privilege('authenticated','public.programas','SELECT'),'catalog: authenticated still holds SELECT on programas');
SELECT ok(has_table_privilege('authenticated','public.programas','INSERT'),'catalog: authenticated still holds INSERT on programas');
SELECT ok(has_table_privilege('authenticated','public.programas','UPDATE'),'catalog: authenticated still holds UPDATE on programas');
SELECT ok(has_table_privilege('authenticated','public.programas','DELETE'),'catalog: authenticated still holds DELETE on programas');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quotes','TRUNCATE'),'catalog: authenticated holds no TRUNCATE on pasantias_quotes');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quotes','REFERENCES'),'catalog: authenticated holds no REFERENCES on pasantias_quotes');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quotes','TRIGGER'),'catalog: authenticated holds no TRIGGER on pasantias_quotes');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quotes','SELECT'),'catalog: authenticated still holds SELECT on pasantias_quotes');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quotes','INSERT'),'catalog: authenticated still holds INSERT on pasantias_quotes');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quotes','UPDATE'),'catalog: authenticated still holds UPDATE on pasantias_quotes');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quotes','DELETE'),'catalog: authenticated still holds DELETE on pasantias_quotes');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quote_groups','TRUNCATE'),'catalog: authenticated holds no TRUNCATE on pasantias_quote_groups');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quote_groups','REFERENCES'),'catalog: authenticated holds no REFERENCES on pasantias_quote_groups');
SELECT ok(NOT has_table_privilege('authenticated','public.pasantias_quote_groups','TRIGGER'),'catalog: authenticated holds no TRIGGER on pasantias_quote_groups');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quote_groups','SELECT'),'catalog: authenticated still holds SELECT on pasantias_quote_groups');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quote_groups','INSERT'),'catalog: authenticated still holds INSERT on pasantias_quote_groups');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quote_groups','UPDATE'),'catalog: authenticated still holds UPDATE on pasantias_quote_groups');
SELECT ok(has_table_privilege('authenticated','public.pasantias_quote_groups','DELETE'),'catalog: authenticated still holds DELETE on pasantias_quote_groups');
SELECT is((SELECT reloptions::text FROM pg_class WHERE oid='public.feedback_stats'::regclass),'{security_invoker=true}','catalog: feedback_stats runs with the caller''s rights');
SELECT * FROM finish();
ROLLBACK;
