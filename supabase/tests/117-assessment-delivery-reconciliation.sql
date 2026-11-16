BEGIN;
SELECT no_plan();

SELECT tests.create_supabase_user('delivery_doc');
SELECT tests.create_supabase_user('delivery_dir');
SELECT tests.create_supabase_user('delivery_other');
SELECT tests.get_supabase_uid('delivery_doc') AS doc \gset
SELECT tests.get_supabase_uid('delivery_dir') AS dir \gset
SELECT tests.get_supabase_uid('delivery_other') AS other \gset
INSERT INTO public.profiles(id,email,name,approval_status)
SELECT tests.get_supabase_uid(n), n || '@test.local', n, 'approved'
FROM (VALUES ('delivery_doc'),('delivery_dir'),('delivery_other')) x(n) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.schools(id,name) VALUES (9180,'Delivery School'),(9181,'Delivery Other School');
INSERT INTO public.user_roles(user_id,role_type,school_id,is_active) VALUES
(:'doc','docente',9180,true),(:'dir','equipo_directivo',9180,true),(:'dir','admin',NULL,true),(:'other','docente',9181,true);
INSERT INTO public.school_transversal_context(id,school_id,total_students,grade_levels,courses_per_level,implementation_year_2026,period_system) VALUES
('18000000-0000-4000-8000-00000000c001',9180,100,ARRAY['1_basico'],'{"1_basico":5}',2,'semestral'),
('18000000-0000-4000-8000-00000000c002',9181,100,ARRAY['1_basico'],'{"1_basico":1}',2,'semestral');
INSERT INTO public.ab_grades(id,name,sort_order,is_always_gt) VALUES (91801,'Delivery Grade',91801,false),(91802,'Other Delivery Grade',91802,true);
INSERT INTO public.ab_migration_plan(school_id,year_number,grade_id,generation_type) VALUES (9180,2,91801,'GI');
INSERT INTO public.school_course_structure(id,school_id,context_id,grade_level,course_name,grade_id)
SELECT ('18000000-0000-4000-8000-00000000000' || n)::uuid,9180,'18000000-0000-4000-8000-00000000c001','1_basico','Delivery ' || n,
       CASE WHEN n=4 THEN 91802 ELSE 91801 END
FROM generate_series(1,9) n;
INSERT INTO public.school_course_docente_assignments(course_structure_id,docente_id,assigned_by,is_active)
SELECT ('18000000-0000-4000-8000-00000000000' || n)::uuid,CASE WHEN n=1 THEN :'other'::uuid ELSE :'doc'::uuid END,:'dir', n<>3
FROM generate_series(1,9) n;
INSERT INTO public.school_via_responsibles(school_id,area,user_id,assigned_by) VALUES
(9180,'liderazgo',:'dir',:'dir'),(9180,'proposito',:'dir',:'dir'),(9181,'liderazgo',:'dir',:'dir');
INSERT INTO public.assessment_templates(id,area,version,name,status,is_archived,grade_id) VALUES
('18000000-0000-4000-8000-0000000000e1','personalizacion','1.1','Delivery Course','published',false,91801),
('18000000-0000-4000-8000-0000000000e2','liderazgo','1.0','Delivery Leadership','published',false,NULL),
('18000000-0000-4000-8000-0000000000e3','proposito','1.0','Delivery Purpose','draft',false,NULL),
('18000000-0000-4000-8000-0000000000e4','personalizacion','1.0','Delivery Archived','published',true,91801),
('18000000-0000-4000-8000-0000000000e5','liderazgo','1.0','Delivery Legacy','published',false,NULL);
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at) VALUES
('18000000-0000-4000-8000-0000000000f0','18000000-0000-4000-8000-0000000000e1','1.0','{"modules":[]}','2026-01-01'),
('18000000-0000-4000-8000-0000000000f1','18000000-0000-4000-8000-0000000000e1','1.1','{"modules":[]}','2026-02-01'),
('18000000-0000-4000-8000-0000000000f2','18000000-0000-4000-8000-0000000000e2','1.0','{"modules":[]}','2026-01-01'),
('18000000-0000-4000-8000-0000000000f3','18000000-0000-4000-8000-0000000000e3','1.0','{"modules":[]}','2026-01-01'),
('18000000-0000-4000-8000-0000000000f4','18000000-0000-4000-8000-0000000000e4','1.0','{"modules":[]}','2026-01-01'),
('18000000-0000-4000-8000-0000000000f5','18000000-0000-4000-8000-0000000000e5','1.0','{"modules":[]}','2026-01-01');
-- Existing course work covers every status, cancellation, and the old version.
INSERT INTO public.assessment_instances(id,template_snapshot_id,school_id,course_structure_id,transformation_year,generation_type,status)
SELECT ('18000000-0000-4000-8000-0000000000a' || n)::uuid,'18000000-0000-4000-8000-0000000000f0',9180,
       ('18000000-0000-4000-8000-00000000000' || n)::uuid,1,'GT',
       CASE n WHEN 5 THEN 'pending' WHEN 6 THEN 'in_progress' WHEN 7 THEN 'completed' WHEN 8 THEN 'archived' ELSE 'pending' END
FROM generate_series(5,9) n;
SELECT public.cancel_assessment_instance(:'dir','18000000-0000-4000-8000-0000000000a9','Synthetic cancellation preservation test');
INSERT INTO public.assessment_instance_assignees(instance_id,user_id,can_edit,can_submit,has_started,has_submitted)
SELECT id,:'other',false,false,true,true FROM public.assessment_instances WHERE id::text LIKE '18000000-0000-4000-8000-0000000000a%';
-- Unlinked legacy school work must not be silently adopted or duplicated.
INSERT INTO public.assessment_instances(id,template_snapshot_id,school_id,transformation_year,generation_type,status)
VALUES ('18000000-0000-4000-8000-0000000000aa','18000000-0000-4000-8000-0000000000f5',9180,1,'GT','completed');
INSERT INTO public.assessment_objectives(id,template_id,name,display_order)
VALUES ('18000000-0000-4000-8000-0000000000b1','18000000-0000-4000-8000-0000000000e1','Synthetic objective',1);
INSERT INTO public.assessment_modules(id,template_id,objective_id,name,display_order)
VALUES ('18000000-0000-4000-8000-0000000000b2','18000000-0000-4000-8000-0000000000e1','18000000-0000-4000-8000-0000000000b1','Synthetic module',1);
INSERT INTO public.assessment_indicators(id,module_id,code,name,category,display_order)
VALUES ('18000000-0000-4000-8000-0000000000b3','18000000-0000-4000-8000-0000000000b2','D1','Synthetic indicator','cobertura',1);
INSERT INTO public.assessment_responses(id,instance_id,indicator_id,coverage_value,responded_by,rationale)
VALUES ('18000000-0000-4000-8000-0000000000b4','18000000-0000-4000-8000-0000000000a6','18000000-0000-4000-8000-0000000000b3',true,:'other','Existing synthetic answer');
CREATE TEMP TABLE delivery_original_instances AS SELECT * FROM public.assessment_instances WHERE id::text LIKE '18000000-%';
CREATE TEMP TABLE delivery_original_grants AS SELECT a.* FROM public.assessment_instance_assignees a JOIN delivery_original_instances i ON i.id=a.instance_id;
CREATE TEMP TABLE delivery_original_responses AS SELECT * FROM public.assessment_responses WHERE id='18000000-0000-4000-8000-0000000000b4';

SELECT tests.rls_enabled('public','assessment_delivery_reconcile_state');
SELECT table_privs_are('public','assessment_delivery_reconcile_state','anon',ARRAY[]::text[],'anon cannot read/write cursor');
SELECT table_privs_are('public','assessment_delivery_reconcile_state','authenticated',ARRAY[]::text[],'authenticated cannot read/write cursor');
SELECT table_privs_are('public','assessment_delivery_reconcile_state','service_role',ARRAY['SELECT','UPDATE'],'service role has only cursor read/update');
SELECT function_privs_are('public','reconcile_published_assessment_deliveries',ARRAY['integer'],'anon',ARRAY[]::text[],'anon cannot reconcile');
SELECT function_privs_are('public','reconcile_published_assessment_deliveries',ARRAY['integer'],'authenticated',ARRAY[]::text[],'authenticated cannot reconcile');
SELECT function_privs_are('public','reconcile_published_assessment_deliveries',ARRAY['integer'],'service_role',ARRAY['EXECUTE'],'service role can reconcile');
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname='reconcile_published_assessment_deliveries'),false,'RPC is security invoker');
SELECT ok((SELECT 'lock_timeout=500ms'=ANY(proconfig) FROM pg_proc WHERE proname='reconcile_published_assessment_deliveries'),'background sweep bounds waits on user transactions');
SELECT throws_ok($$SELECT public.reconcile_published_assessment_deliveries(0)$$,'22023','invalid_limit','zero batch refused');
SELECT throws_ok($$SELECT public.reconcile_published_assessment_deliveries(501)$$,'22023','invalid_limit','oversized batch refused');
SELECT throws_ok($$SELECT public.reconcile_published_assessment_deliveries(NULL)$$,'22023','invalid_limit','null batch refused');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.reconcile_published_assessment_deliveries(1)$$,'42501','permission denied for function reconcile_published_assessment_deliveries','anon RPC invocation denied');
SELECT throws_ok($$SELECT * FROM public.assessment_delivery_reconcile_state$$,'42501','permission denied for table assessment_delivery_reconcile_state','anon cursor read denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reconcile_published_assessment_deliveries(1)$$,'42501','permission denied for function reconcile_published_assessment_deliveries','authenticated RPC invocation denied');
SELECT throws_ok($$UPDATE public.assessment_delivery_reconcile_state SET scan_key=''$$,'42501','permission denied for table assessment_delivery_reconcile_state','authenticated cursor mutation denied');
RESET ROLE;

-- A permanently invalid first pair must not starve the next valid teacher.
UPDATE public.assessment_delivery_reconcile_state SET scan_key='c:18000000-0000-4000-8000-000000000000';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(1) AS first_batch \gset
RESET ROLE;
SELECT is((:'first_batch'::jsonb->>'failed')::integer,1,'ineligible first recipient is reported');
SELECT is((:'first_batch'::jsonb->>'created')::integer,0,'ineligible recipient receives nothing');
SELECT ok((SELECT scan_key LIKE 'c:18000000-0000-4000-8000-000000000001:%' FROM public.assessment_delivery_reconcile_state),'failed pair advances cursor');
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(1) AS next_batch \gset
RESET ROLE;
SELECT is((:'next_batch'::jsonb->>'created')::integer,1,'next tick delivers valid teacher past failed pair');
SELECT is((SELECT template_snapshot_id::text FROM public.assessment_instances WHERE course_structure_id='18000000-0000-4000-8000-000000000002'),'18000000-0000-4000-8000-0000000000f1','teacher gets current snapshot');
SELECT is((SELECT generation_type::text FROM public.assessment_instances WHERE course_structure_id='18000000-0000-4000-8000-000000000002'),'GI','migration plan generation respected');
SELECT is((SELECT transformation_year FROM public.assessment_instances WHERE course_structure_id='18000000-0000-4000-8000-000000000002'),2,'current context year respected');
SELECT ok(EXISTS(SELECT 1 FROM public.assessment_instance_assignees a JOIN public.assessment_instances i ON i.id=a.instance_id WHERE i.course_structure_id='18000000-0000-4000-8000-000000000002' AND a.user_id=:'doc' AND a.can_edit AND a.can_submit),'teacher receives edit/submit grant');

SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.school_via_instance_links WHERE school_id=9180),1,'existing school responsible receives late leadership template');
SELECT ok(EXISTS(SELECT 1 FROM public.school_via_instance_links l JOIN public.assessment_instance_assignees a ON a.instance_id=l.instance_id WHERE l.school_id=9180 AND a.user_id=:'dir' AND a.can_edit AND a.can_submit),'school responsible gets edit/submit grant');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE school_id=9181),0,'out-of-school responsible receives nothing');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id IN ('18000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000003','18000000-0000-4000-8000-000000000004')),0,'foreign/inactive/wrong-grade teacher assignments skipped');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_template_snapshots s ON s.id=i.template_snapshot_id WHERE i.school_id=9180 AND s.template_id IN ('18000000-0000-4000-8000-0000000000e3','18000000-0000-4000-8000-0000000000e4')),0,'draft and archived templates are not delivered');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_template_snapshots s ON s.id=i.template_snapshot_id WHERE i.school_id=9180 AND s.template_id='18000000-0000-4000-8000-0000000000e5'),1,'unlinked legacy school work not duplicated');
SELECT is((SELECT count(*)::integer FROM public.school_via_instance_links WHERE template_id='18000000-0000-4000-8000-0000000000e5'),0,'legacy work not silently adopted');

-- Publish another school template; republish the already-delivered course.
UPDATE public.assessment_templates SET status='published' WHERE id='18000000-0000-4000-8000-0000000000e3';
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at)
VALUES ('18000000-0000-4000-8000-0000000000f9','18000000-0000-4000-8000-0000000000e1','1.2','{"modules":[]}','2026-03-01');
UPDATE public.assessment_delivery_reconcile_state SET scan_key='';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.school_via_instance_links WHERE school_id=9180),2,'later Purpose publication delivered automatically');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id='18000000-0000-4000-8000-000000000002'),1,'republish and repeated sweeps do not clone delivered course');
SELECT is((SELECT template_snapshot_id::text FROM public.assessment_instances WHERE course_structure_id='18000000-0000-4000-8000-000000000002'),'18000000-0000-4000-8000-0000000000f1','pending delivered work retains original snapshot');
SELECT results_eq('SELECT i.* FROM public.assessment_instances i JOIN delivery_original_instances old ON old.id=i.id ORDER BY i.id','SELECT * FROM delivery_original_instances ORDER BY id','all existing instance fields preserved across every status and republish');
SELECT results_eq('SELECT a.* FROM public.assessment_instance_assignees a JOIN delivery_original_instances old ON old.id=a.instance_id ORDER BY a.id','SELECT * FROM delivery_original_grants ORDER BY id','all existing grants preserved including started/submitted read-only co-assignees');
SELECT results_eq('SELECT r.* FROM public.assessment_responses r JOIN delivery_original_responses old ON old.id=r.id','SELECT * FROM delivery_original_responses','saved responses preserved byte for byte');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id IN (SELECT ('18000000-0000-4000-8000-00000000000'||n)::uuid FROM generate_series(5,9)n)),5,'no clones for pending/in-progress/completed/archived/cancelled old versions');

-- A second new course template is independently delivered; missing migration
-- plan keeps the existing GT fallback. Revoked roles cannot receive new work.
DELETE FROM public.ab_migration_plan WHERE school_id=9180;
INSERT INTO public.assessment_templates(id,area,version,name,status,is_archived,grade_id)
VALUES ('18000000-0000-4000-8000-0000000000e6','personalizacion','2.0','Second course publication','published',false,91801);
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data)
VALUES ('18000000-0000-4000-8000-0000000000f6','18000000-0000-4000-8000-0000000000e6','2.0','{"modules":[]}');
UPDATE public.user_roles SET is_active=false WHERE user_id=:'doc';
UPDATE public.assessment_delivery_reconcile_state SET scan_key='';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE template_snapshot_id='18000000-0000-4000-8000-0000000000f6'),0,'revoked role receives no new template');
UPDATE public.user_roles SET is_active=true WHERE user_id=:'doc';
UPDATE public.assessment_delivery_reconcile_state SET scan_key='';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE template_snapshot_id='18000000-0000-4000-8000-0000000000f6'),6,'all six eligible active courses receive second template');
SELECT ok((SELECT bool_and(generation_type='GT') FROM public.assessment_instances WHERE template_snapshot_id='18000000-0000-4000-8000-0000000000f6'),'missing migration plan uses GT fallback');
SELECT * FROM finish();
ROLLBACK;
