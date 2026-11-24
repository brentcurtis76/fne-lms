-- GENERA fixes F22, build A, item T1: a contract records which text it was made with.
-- plantilla_version on contratos: empty = the text as printed before the column existed,
-- 2 = the corrected text. Every insert gets 2; a signed-in person may only move ONE
-- unsigned programme contract from empty to 2 (never back, never a signed contract, an
-- annex or a manual contract). Synthetic data only; rolled back.
BEGIN;
SELECT no_plan();
CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
-- Row count of a statement; -1 when the statement fails (so that, before the migration,
-- every assertion of this file reports a failure instead of the file stopping at the first).
CREATE FUNCTION pg_temp.affected(stmt text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; EXCEPTION WHEN OTHERS THEN RETURN -1; END $$;
-- The mark of one contract as text ('empty' for NULL, 'error' when it cannot be read).
CREATE FUNCTION pg_temp.mark(cid uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE v text; BEGIN EXECUTE 'SELECT coalesce(plantilla_version::text, ''empty'') FROM public.contratos WHERE id = $1' INTO v USING cid; RETURN v; EXCEPTION WHEN OTHERS THEN RETURN 'error'; END $$;

SELECT tests.create_supabase_user('ct154_admin');
SELECT tests.create_supabase_user('ct154_docente');
SELECT tests.create_supabase_user('ct154_consultor');
INSERT INTO public.schools(id,name) VALUES(9154,'CT154 school');
INSERT INTO public.profiles(id,email,name,approval_status,must_change_password) VALUES(pg_temp.uid('ct154_admin'),'admin@ct154.qa.local.test','Synthetic admin','approved',false) ON CONFLICT(id) DO UPDATE SET must_change_password=EXCLUDED.must_change_password;
INSERT INTO public.user_roles(user_id,role_type,school_id,red_id,is_active) VALUES(pg_temp.uid('ct154_admin'),'admin',NULL,NULL,true);
INSERT INTO public.profiles(id,email,name,approval_status,must_change_password) VALUES(pg_temp.uid('ct154_docente'),'docente@ct154.qa.local.test','Synthetic docente','approved',false) ON CONFLICT(id) DO UPDATE SET must_change_password=EXCLUDED.must_change_password;
INSERT INTO public.user_roles(user_id,role_type,school_id,red_id,is_active) VALUES(pg_temp.uid('ct154_docente'),'docente',9154,NULL,true);
INSERT INTO public.profiles(id,email,name,approval_status,must_change_password) VALUES(pg_temp.uid('ct154_consultor'),'consultor@ct154.qa.local.test','Synthetic consultor','approved',false) ON CONFLICT(id) DO UPDATE SET must_change_password=EXCLUDED.must_change_password;
INSERT INTO public.user_roles(user_id,role_type,school_id,red_id,is_active) VALUES(pg_temp.uid('ct154_consultor'),'consultor',9154,NULL,true);
REFRESH MATERIALIZED VIEW public.user_roles_cache;

INSERT INTO public.clientes(id,nombre_legal,nombre_fantasia,rut,direccion,nombre_representante,rut_representante,fecha_escritura,nombre_notario,school_id) VALUES
('15400000-0000-4000-8000-000000000011','Synthetic legal 154','Synthetic','154-0','Synthetic','Synthetic representative 154','155-0','2026-01-01','Synthetic',9154);
INSERT INTO public.programas(id,nombre) VALUES('15400000-0000-4000-8000-000000000031','Synthetic programme 154');
-- Contracts made by the owner (they stand for contracts made before the release).
INSERT INTO public.contratos(id,numero_contrato,fecha_contrato,cliente_id,programa_id,firmado,is_anexo,es_manual,parent_contrato_id) VALUES
('15400000-0000-4000-8000-000000000021','CT154-unsigned','2026-01-01','15400000-0000-4000-8000-000000000011','15400000-0000-4000-8000-000000000031',false,false,false,NULL),
('15400000-0000-4000-8000-000000000022','CT154-signed','2026-01-01','15400000-0000-4000-8000-000000000011','15400000-0000-4000-8000-000000000031',true,false,false,NULL),
('15400000-0000-4000-8000-000000000023','CT154-annex','2026-01-01','15400000-0000-4000-8000-000000000011','15400000-0000-4000-8000-000000000031',false,true,false,'15400000-0000-4000-8000-000000000021'),
('15400000-0000-4000-8000-000000000024','CT154-manual','2026-01-01','15400000-0000-4000-8000-000000000011',NULL,false,false,true,NULL),
('15400000-0000-4000-8000-000000000025','CT154-sign-and-move','2026-01-01','15400000-0000-4000-8000-000000000011','15400000-0000-4000-8000-000000000031',false,false,false,NULL),
('15400000-0000-4000-8000-000000000026','CT154-other-roles','2026-01-01','15400000-0000-4000-8000-000000000011','15400000-0000-4000-8000-000000000031',false,false,false,NULL),
-- Not manual but without a programme: the print page treats it as imported (send-back 1, R1).
('15400000-0000-4000-8000-000000000028','CT154-no-programme','2026-01-01','15400000-0000-4000-8000-000000000011',NULL,false,false,false,NULL);

-- The column.
SELECT has_column('public','contratos','plantilla_version','contratos has plantilla_version');
SELECT col_type_is('public','contratos','plantilla_version','smallint','plantilla_version is smallint');
SELECT col_is_null('public','contratos','plantilla_version','plantilla_version is nullable');
SELECT col_default_is('public','contratos','plantilla_version','2','plantilla_version defaults to 2');

-- The owner's insert gets 2 too, even when it sends 1 (stands for the service-key routes).
SELECT is(pg_temp.affected($q$INSERT INTO public.contratos(id,numero_contrato,fecha_contrato,cliente_id,plantilla_version) VALUES('15400000-0000-4000-8000-000000000027','CT154-owner-one','2026-01-01','15400000-0000-4000-8000-000000000011',1)$q$),1,'owner: insert with 1 is accepted');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000027'),'2','owner: insert with 1 gets 2');

-- "Made before the release": the owner clears the mark (the owner is not checked).
SELECT is(pg_temp.affected($q$UPDATE public.contratos SET plantilla_version = NULL WHERE id::text LIKE '15400000-0000-4000-8000-00000000002%' AND id <> '15400000-0000-4000-8000-000000000027'$q$),7,'owner: clears the mark of the seven old contracts');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000021'),'empty','owner: old contract mark is empty');

SELECT tests.authenticate_as('ct154_admin');
-- New contracts get 2 whatever the admin sends.
SELECT is(pg_temp.affected($q$INSERT INTO public.contratos(id,numero_contrato,fecha_contrato,cliente_id) VALUES('15400000-0000-4000-8000-000000000041','CT154-admin-new','2026-01-01','15400000-0000-4000-8000-000000000011')$q$),1,'admin: insert');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000041'),'2','admin: a new contract gets 2');
SELECT is(pg_temp.affected($q$INSERT INTO public.contratos(id,numero_contrato,fecha_contrato,cliente_id,plantilla_version) VALUES('15400000-0000-4000-8000-000000000042','CT154-admin-null','2026-01-01','15400000-0000-4000-8000-000000000011',NULL)$q$),1,'admin: insert sending NULL');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000042'),'2','admin: sending NULL still gets 2');
SELECT is(pg_temp.affected($q$INSERT INTO public.contratos(id,numero_contrato,fecha_contrato,cliente_id,plantilla_version) VALUES('15400000-0000-4000-8000-000000000043','CT154-admin-one','2026-01-01','15400000-0000-4000-8000-000000000011',1)$q$),1,'admin: insert sending 1');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000043'),'2','admin: sending 1 still gets 2');

-- The one allowed move: empty to 2 on an unsigned programme contract.
SELECT is(pg_temp.affected($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000021'$q$),1,'admin: moves an unsigned programme contract to 2');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000021'),'2','admin: the moved contract is on 2');
-- Other updates of a contract keep working and leave the mark alone.
SELECT is(pg_temp.affected($q$UPDATE public.contratos SET descripcion_manual='Synthetic update' WHERE id='15400000-0000-4000-8000-000000000022'$q$),1,'admin: an ordinary update of an old signed contract');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000022'),'empty','admin: an ordinary update keeps the empty mark');

-- Refused moves.
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = NULL WHERE id='15400000-0000-4000-8000-000000000021'$q$,'42501',NULL,'admin: cannot move back from 2 to empty');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 1 WHERE id='15400000-0000-4000-8000-000000000021'$q$,'42501',NULL,'admin: cannot move from 2 to 1');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000022'$q$,'42501',NULL,'admin: cannot move a signed contract');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 2, firmado = true WHERE id='15400000-0000-4000-8000-000000000025'$q$,'42501',NULL,'admin: cannot move and sign in one update');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000023'$q$,'42501',NULL,'admin: cannot move an annex');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000024'$q$,'42501',NULL,'admin: cannot move a manual contract');
SELECT throws_ok($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000028'$q$,'42501',NULL,'admin: cannot move a contract without a programme (imported)');
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000025'),'empty','admin: the refused sign-and-move left the mark empty');
RESET ROLE;

SELECT tests.authenticate_as('ct154_docente');
SELECT is(pg_temp.affected($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000026'$q$),0,'docente: update changes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('ct154_consultor');
SELECT is(pg_temp.affected($q$UPDATE public.contratos SET plantilla_version = 2 WHERE id='15400000-0000-4000-8000-000000000026'$q$),0,'consultor: update changes 0 rows');
RESET ROLE;
SELECT is(pg_temp.mark('15400000-0000-4000-8000-000000000026'),'empty','docente and consultor left the mark empty');

-- The guard's form.
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname='guard_contrato_plantilla_version' AND pronamespace='public'::regnamespace),true,'guard is security definer');
SELECT ok(CASE WHEN to_regprocedure('public.guard_contrato_plantilla_version()') IS NULL THEN false ELSE NOT has_function_privilege('authenticated','public.guard_contrato_plantilla_version()','EXECUTE') END,'authenticated cannot call the guard');
SELECT is((SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.contratos'::regclass AND tgfoid=to_regprocedure('public.guard_contrato_plantilla_version()')),1,'guard trigger on contratos');
SELECT * FROM finish();
ROLLBACK;
