-- GC-3a: delivery at publication (preview_template_delivery,
-- deliver_published_template). Invented people and schools only; built in the
-- style of 117-assessment-delivery-reconciliation.sql. Delivery must give
-- exactly what the every-minute sweep gives, never more, never twice.
BEGIN;
SELECT no_plan();

SELECT tests.create_supabase_user('dop_doc1');
SELECT tests.create_supabase_user('dop_doc2');
SELECT tests.create_supabase_user('dop_norole');
SELECT tests.create_supabase_user('dop_dir');
SELECT tests.create_supabase_user('dop_dir_norole');
SELECT tests.create_supabase_user('dop_dir_noctx');
SELECT tests.create_supabase_user('dop_doc3');
SELECT tests.get_supabase_uid('dop_doc1') AS doc1 \gset
SELECT tests.get_supabase_uid('dop_doc2') AS doc2 \gset
SELECT tests.get_supabase_uid('dop_norole') AS norole \gset
SELECT tests.get_supabase_uid('dop_dir') AS dir \gset
SELECT tests.get_supabase_uid('dop_dir_norole') AS dirnorole \gset
SELECT tests.get_supabase_uid('dop_dir_noctx') AS dirnoctx \gset
SELECT tests.get_supabase_uid('dop_doc3') AS doc3 \gset
INSERT INTO public.profiles(id,email,name,approval_status)
SELECT tests.get_supabase_uid(n), n || '@test.local', n, 'approved'
FROM (VALUES ('dop_doc1'),('dop_doc2'),('dop_norole'),('dop_dir'),('dop_dir_norole'),('dop_dir_noctx'),('dop_doc3')) x(n) ON CONFLICT(id) DO NOTHING;

-- Schools: A (9310, year 2), B (9311, year 3), C (9312, NO context), D (9313, year 1).
INSERT INTO public.schools(id,name) VALUES (9310,'DOP School A'),(9311,'DOP School B'),(9312,'DOP School C'),(9313,'DOP School D');
INSERT INTO public.user_roles(user_id,role_type,school_id,is_active) VALUES
(:'doc1','docente',9310,true),(:'doc2','docente',9311,true),
(:'norole','docente',9310,false),
(:'dir','equipo_directivo',9310,true),(:'dir','equipo_directivo',9311,true),(:'dir','admin',NULL,true),
(:'dirnorole','docente',9313,true),
(:'dirnoctx','equipo_directivo',9312,true),
(:'doc3','docente',9312,true);
INSERT INTO public.school_transversal_context(id,school_id,total_students,grade_levels,courses_per_level,implementation_year_2026,period_system) VALUES
('13100000-0000-4000-8000-00000000c00a',9310,100,ARRAY['1_basico'],'{"1_basico":5}',2,'semestral'),
('13100000-0000-4000-8000-00000000c00b',9311,100,ARRAY['1_basico'],'{"1_basico":1}',3,'semestral'),
('13100000-0000-4000-8000-00000000c00d',9313,100,ARRAY['1_basico'],'{"1_basico":1}',1,'semestral');
INSERT INTO public.ab_grades(id,name,sort_order,is_always_gt) VALUES
(93101,'DOP Grade',93101,false),(93102,'DOP Other Grade',93102,false),(93103,'DOP Third Grade',93103,true);
INSERT INTO public.ab_migration_plan(school_id,year_number,grade_id,generation_type) VALUES (9310,2,93101,'GI');

-- Courses: (n, school, grade, teacher, assignment active?)
--   01,02 A grade 1 doc1 active      -> receive T1
--   03    B grade 1 doc2 active      -> receives T1 (second school)
--   04    A grade 2 doc1 active      -> wrong grade for T1; receives T7
--   05    A grade 1 no teacher       -> nothing
--   06    A grade 1 doc1 INACTIVE    -> nothing
--   11-15 A grade 1 doc1 active, existing T1 work in every status -> untouched
--   21    A grade 3 norole active    -> T3 fails recipient_not_eligible
--   22    B grade 3 doc2 active      -> receives T3 despite 21
--   23    C grade 3 doc3 active      -> T3 fails context_missing (school C has no
--         context row; the course hangs off school A's context because
--         context_id is NOT NULL, delivery reads the year by the course's school)
-- A course with two active teacher assignments cannot be built: the partial
-- unique index school_course_docente_assignments_one_active_key forbids it.
CREATE TEMP TABLE dop_courses(n text, school integer, ctx uuid, grade integer, teacher uuid, active boolean);
INSERT INTO dop_courses VALUES
('01',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('02',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('03',9311,'13100000-0000-4000-8000-00000000c00b',93101,:'doc2',true),
('04',9310,'13100000-0000-4000-8000-00000000c00a',93102,:'doc1',true),
('05',9310,'13100000-0000-4000-8000-00000000c00a',93101,NULL,NULL),
('06',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',false),
('11',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('12',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('13',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('14',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('15',9310,'13100000-0000-4000-8000-00000000c00a',93101,:'doc1',true),
('21',9310,'13100000-0000-4000-8000-00000000c00a',93103,:'norole',true),
('22',9311,'13100000-0000-4000-8000-00000000c00b',93103,:'doc2',true),
('23',9312,'13100000-0000-4000-8000-00000000c00a',93103,:'doc3',true);
INSERT INTO public.school_course_structure(id,school_id,context_id,grade_level,course_name,grade_id)
SELECT ('13100000-0000-4000-8000-0000000000' || n)::uuid,school,ctx,'1_basico','DOP ' || n,grade FROM dop_courses;
INSERT INTO public.school_course_docente_assignments(course_structure_id,docente_id,assigned_by,is_active)
SELECT ('13100000-0000-4000-8000-0000000000' || n)::uuid,teacher,:'dir',active FROM dop_courses WHERE teacher IS NOT NULL;

-- Responsables: dir at A and B (liderazgo), dir at A (proposito);
-- dirnoctx at C (no context year), dirnorole at D (no equipo_directivo role).
INSERT INTO public.school_via_responsibles(school_id,area,user_id,assigned_by) VALUES
(9310,'liderazgo',:'dir',:'dir'),(9311,'liderazgo',:'dir',:'dir'),
(9310,'proposito',:'dir',:'dir'),(9312,'proposito',:'dirnoctx',:'dir'),(9313,'proposito',:'dirnorole',:'dir');

-- Templates:
--   e1 T1 personalizacion grade 1 DRAFT (has an old snapshot: earlier version)
--   e2 T2 liderazgo school-level DRAFT
--   e3 T3 aprendizaje grade 3 published
--   e4 T4 proposito school-level published
--   e5 T5 evaluacion grade 1 DRAFT (never published here)
--   e6 T6 familias grade 1 published but ARCHIVED
--   e7 T7 trabajo_docente grade 2 DRAFT (published later, sweep first)
INSERT INTO public.assessment_templates(id,area,version,name,status,is_archived,grade_id) VALUES
('13100000-0000-4000-8000-0000000000e1','personalizacion','1.0','DOP Course','draft',false,93101),
('13100000-0000-4000-8000-0000000000e2','liderazgo','1.0','DOP Leadership','draft',false,NULL),
('13100000-0000-4000-8000-0000000000e3','aprendizaje','1.0','DOP Third','published',false,93103),
('13100000-0000-4000-8000-0000000000e4','proposito','1.0','DOP Purpose','published',false,NULL),
('13100000-0000-4000-8000-0000000000e5','evaluacion','1.0','DOP Draft','draft',false,93101),
('13100000-0000-4000-8000-0000000000e6','familias','1.0','DOP Archived','published',true,93101),
('13100000-0000-4000-8000-0000000000e7','trabajo_docente','1.0','DOP Sweep First','draft',false,93102);
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at) VALUES
('13100000-0000-4000-8000-0000000000f0','13100000-0000-4000-8000-0000000000e1','0.9','{"modules":[]}','2026-01-01'),
('13100000-0000-4000-8000-0000000000f3','13100000-0000-4000-8000-0000000000e3','1.0','{"modules":[]}','2026-01-01'),
('13100000-0000-4000-8000-0000000000f4','13100000-0000-4000-8000-0000000000e4','1.0','{"modules":[]}','2026-01-01'),
('13100000-0000-4000-8000-0000000000f5','13100000-0000-4000-8000-0000000000e5','1.0','{"modules":[]}','2026-01-01'),
('13100000-0000-4000-8000-0000000000f6','13100000-0000-4000-8000-0000000000e6','1.0','{"modules":[]}','2026-01-01');

-- Existing T1 work on the old snapshot, one per status, with a read-only
-- co-assignee and a saved answer.
INSERT INTO public.assessment_instances(id,template_snapshot_id,school_id,course_structure_id,transformation_year,generation_type,status)
SELECT ('13100000-0000-4000-8000-0000000000a' || right(n::text,1))::uuid,'13100000-0000-4000-8000-0000000000f0',9310,
       ('13100000-0000-4000-8000-0000000000' || n)::uuid,1,'GT',
       CASE n WHEN 11 THEN 'pending' WHEN 12 THEN 'in_progress' WHEN 13 THEN 'completed' WHEN 14 THEN 'archived' ELSE 'pending' END
FROM generate_series(11,15) n;
SELECT public.cancel_assessment_instance(:'dir','13100000-0000-4000-8000-0000000000a5','Synthetic cancellation preservation test');
INSERT INTO public.assessment_instance_assignees(instance_id,user_id,can_edit,can_submit,has_started,has_submitted)
SELECT id,:'doc2',false,false,true,true FROM public.assessment_instances WHERE id::text LIKE '13100000-0000-4000-8000-0000000000a%';
INSERT INTO public.assessment_objectives(id,template_id,name,display_order)
VALUES ('13100000-0000-4000-8000-0000000000b1','13100000-0000-4000-8000-0000000000e1','Synthetic objective',1);
INSERT INTO public.assessment_modules(id,template_id,objective_id,name,display_order)
VALUES ('13100000-0000-4000-8000-0000000000b2','13100000-0000-4000-8000-0000000000e1','13100000-0000-4000-8000-0000000000b1','Synthetic module',1);
INSERT INTO public.assessment_indicators(id,module_id,code,name,category,display_order)
VALUES ('13100000-0000-4000-8000-0000000000b3','13100000-0000-4000-8000-0000000000b2','D1','Synthetic indicator','cobertura',1);
INSERT INTO public.assessment_responses(id,instance_id,indicator_id,coverage_value,responded_by,rationale)
VALUES ('13100000-0000-4000-8000-0000000000b4','13100000-0000-4000-8000-0000000000a2','13100000-0000-4000-8000-0000000000b3',true,:'doc2','Existing synthetic answer');
CREATE TEMP TABLE dop_original_instances AS SELECT * FROM public.assessment_instances WHERE id::text LIKE '13100000-%';
CREATE TEMP TABLE dop_original_grants AS SELECT a.* FROM public.assessment_instance_assignees a JOIN dop_original_instances i ON i.id=a.instance_id;
CREATE TEMP TABLE dop_original_responses AS SELECT * FROM public.assessment_responses WHERE id='13100000-0000-4000-8000-0000000000b4';
UPDATE public.assessment_delivery_reconcile_state SET scan_key='c:dop-marker';
CREATE TEMP TABLE dop_original_state AS SELECT * FROM public.assessment_delivery_reconcile_state;

-- ---------------------------------------------------------------------------
-- Grants and shape
-- ---------------------------------------------------------------------------
SELECT function_privs_are('public','preview_template_delivery',ARRAY['uuid'],'anon',ARRAY[]::text[],'anon cannot preview');
SELECT function_privs_are('public','preview_template_delivery',ARRAY['uuid'],'authenticated',ARRAY[]::text[],'authenticated cannot preview');
SELECT function_privs_are('public','preview_template_delivery',ARRAY['uuid'],'service_role',ARRAY['EXECUTE'],'service role can preview');
SELECT function_privs_are('public','deliver_published_template',ARRAY['uuid','integer'],'anon',ARRAY[]::text[],'anon cannot deliver');
SELECT function_privs_are('public','deliver_published_template',ARRAY['uuid','integer'],'authenticated',ARRAY[]::text[],'authenticated cannot deliver');
SELECT function_privs_are('public','deliver_published_template',ARRAY['uuid','integer'],'service_role',ARRAY['EXECUTE'],'service role can deliver');
SELECT is((SELECT bool_or(prosecdef) FROM pg_proc WHERE proname IN ('preview_template_delivery','deliver_published_template')),false,'both functions are security invoker');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE proname='preview_template_delivery'),'s','preview is STABLE');
SELECT ok((SELECT 'lock_timeout=500ms'=ANY(proconfig) FROM pg_proc WHERE proname='deliver_published_template'),'delivery bounds waits on user transactions');
SELECT ok((SELECT bool_and('search_path=public, pg_temp'=ANY(proconfig)) FROM pg_proc WHERE proname IN ('preview_template_delivery','deliver_published_template')),'both functions pin search_path');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e1')$$,'42501',NULL,'anon preview call denied');
SELECT throws_ok($$SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3')$$,'42501',NULL,'anon delivery call denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e1')$$,'42501',NULL,'authenticated preview call denied');
SELECT throws_ok($$SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3')$$,'42501',NULL,'authenticated delivery call denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3',0)$$,'22023','invalid_limit','zero limit refused');
SELECT throws_ok($$SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3',1001)$$,'22023','invalid_limit','oversized limit refused');
SELECT throws_ok($$SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3',NULL)$$,'22023','invalid_limit','null limit refused');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Preview on drafts; draft, archived and unknown templates deliver nothing
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e1') AS prev1 \gset
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e2') AS prev2 \gset
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e6') AS prev6 \gset
SELECT public.preview_template_delivery('13100000-0000-4000-8000-00000000ffff') AS prevx \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e5') AS del5 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e6') AS del6 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-00000000ffff') AS delx \gset
RESET ROLE;
SELECT is(:'prev1'::jsonb,'{"target":"course_docente","courses":3,"schools":2}'::jsonb,'draft course template: three courses with a teacher of its grade, in two schools');
SELECT is(:'prev2'::jsonb,'{"target":"school_responsible","courses":0,"schools":2}'::jsonb,'draft school template: two schools with an active responsable');
SELECT is((:'prev6'::jsonb->>'courses')::integer + (:'prev6'::jsonb->>'schools')::integer,0,'archived template previews zero');
SELECT is(:'prevx'::jsonb,'{"target":null,"courses":0,"schools":0}'::jsonb,'unknown template previews null target and zeros');

-- Archived by its status only (status 'archived', flag off), with a snapshot:
-- ea course template of grade 1 (courses 01-03 would otherwise receive it),
-- eb school template of liderazgo (schools A and B would otherwise receive it).
INSERT INTO public.assessment_templates(id,area,version,name,status,is_archived,grade_id) VALUES
('13100000-0000-4000-8000-0000000000ea','familias','3.0','DOP Status Archived Course','archived',false,93101),
('13100000-0000-4000-8000-0000000000eb','liderazgo','3.0','DOP Status Archived School','archived',false,NULL);
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at) VALUES
('13100000-0000-4000-8000-0000000000fa','13100000-0000-4000-8000-0000000000ea','3.0','{"modules":[]}','2026-01-01'),
('13100000-0000-4000-8000-0000000000fb','13100000-0000-4000-8000-0000000000eb','3.0','{"modules":[]}','2026-01-01');
SET LOCAL ROLE service_role;
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000ea') AS prevsa \gset
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000eb') AS prevsb \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000ea') AS delsa \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000eb') AS delsb \gset
RESET ROLE;
SELECT is(:'prevsa'::jsonb,'{"target":"course_docente","courses":0,"schools":0}'::jsonb,'course template archived by status previews zero courses');
SELECT is(:'prevsb'::jsonb,'{"target":"school_responsible","courses":0,"schools":0}'::jsonb,'school template archived by status previews zero schools');
SELECT is(:'delsa'::jsonb->>'reason','template_not_published','course template archived by status is not delivered');
SELECT is(:'delsb'::jsonb->>'reason','template_not_published','school template archived by status is not delivered');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_template_snapshots s ON s.id=i.template_snapshot_id
           WHERE s.template_id IN ('13100000-0000-4000-8000-0000000000ea','13100000-0000-4000-8000-0000000000eb')),0,'templates archived by status wrote no instance');
SELECT is(:'del5'::jsonb->>'reason','template_not_published','draft template is not delivered');
SELECT is((:'del5'::jsonb->>'created')::integer,0,'draft template creates nothing');
SELECT is(:'del6'::jsonb->>'reason','template_not_published','archived template is not delivered');
SELECT is(:'delx'::jsonb->>'reason','template_not_published','unknown template is not delivered');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_template_snapshots s ON s.id=i.template_snapshot_id
           WHERE s.template_id IN ('13100000-0000-4000-8000-0000000000e5','13100000-0000-4000-8000-0000000000e6')),0,'draft and archived templates wrote no instance');

-- ---------------------------------------------------------------------------
-- Publish T1 (new snapshot) and T2; deliver
-- ---------------------------------------------------------------------------
UPDATE public.assessment_templates SET status='published',version='1.1' WHERE id='13100000-0000-4000-8000-0000000000e1';
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at)
VALUES ('13100000-0000-4000-8000-0000000000f1','13100000-0000-4000-8000-0000000000e1','1.1','{"modules":[]}','2026-02-01');
UPDATE public.assessment_templates SET status='published' WHERE id='13100000-0000-4000-8000-0000000000e2';
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at)
VALUES ('13100000-0000-4000-8000-0000000000f2','13100000-0000-4000-8000-0000000000e2','1.0','{"modules":[]}','2026-02-01');
SET LOCAL ROLE service_role;
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e1') AS del1 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e2') AS del2 \gset
RESET ROLE;
SELECT is((:'del1'::jsonb->>'created')::integer,(:'prev1'::jsonb->>'courses')::integer,'course delivery creates exactly what the draft preview announced');
SELECT is(:'del1'::jsonb,'{"created":3,"skipped":0,"failed":0,"has_more":false,"failures":[]}'::jsonb,'course delivery result');
SELECT is((:'del2'::jsonb->>'created')::integer,(:'prev2'::jsonb->>'schools')::integer,'school delivery creates exactly what the draft preview announced');
SELECT is(:'del2'::jsonb,'{"created":2,"skipped":0,"failed":0,"has_more":false,"failures":[]}'::jsonb,'school delivery result');

SELECT results_eq(
  $$SELECT c.id::text FROM public.assessment_instances i JOIN public.school_course_structure c ON c.id=i.course_structure_id
     WHERE i.template_snapshot_id='13100000-0000-4000-8000-0000000000f1' ORDER BY 1$$,
  $$VALUES ('13100000-0000-4000-8000-000000000001'),('13100000-0000-4000-8000-000000000002'),('13100000-0000-4000-8000-000000000003')$$,
  'exactly the courses with an active teacher of the grade, in two schools, received T1');
SELECT ok((SELECT bool_and(status='pending') FROM public.assessment_instances WHERE template_snapshot_id='13100000-0000-4000-8000-0000000000f1'),'delivered course registros are pending');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_template_snapshots s ON s.id=i.template_snapshot_id
           WHERE s.template_id='13100000-0000-4000-8000-0000000000e1' AND i.template_snapshot_id<>'13100000-0000-4000-8000-0000000000f1'
             AND i.course_structure_id NOT IN (SELECT ('13100000-0000-4000-8000-0000000000'||n)::uuid FROM generate_series(11,15) n)),0,'new deliveries use the newest snapshot only');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances i JOIN public.assessment_instance_assignees a ON a.instance_id=i.id
            JOIN dop_courses dc ON ('13100000-0000-4000-8000-0000000000'||dc.n)::uuid=i.course_structure_id
           WHERE i.template_snapshot_id='13100000-0000-4000-8000-0000000000f1' AND a.user_id=dc.teacher AND a.can_edit AND a.can_submit),3,'each course teacher has an edit+submit grant');
SELECT is((SELECT count(*)::integer FROM public.assessment_instance_assignees a JOIN public.assessment_instances i ON i.id=a.instance_id
           WHERE i.template_snapshot_id='13100000-0000-4000-8000-0000000000f1'),3,'no other grants on delivered course registros');
SELECT is((SELECT generation_type::text || '/' || transformation_year FROM public.assessment_instances WHERE course_structure_id='13100000-0000-4000-8000-000000000001' AND template_snapshot_id='13100000-0000-4000-8000-0000000000f1'),'GI/2','migration plan and context year respected (school A)');
SELECT is((SELECT generation_type::text || '/' || transformation_year FROM public.assessment_instances WHERE course_structure_id='13100000-0000-4000-8000-000000000003' AND template_snapshot_id='13100000-0000-4000-8000-0000000000f1'),'GT/3','GT fallback and context year respected (school B)');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id IN
           ('13100000-0000-4000-8000-000000000004','13100000-0000-4000-8000-000000000005','13100000-0000-4000-8000-000000000006')),0,'wrong grade, no teacher and inactive assignment receive nothing');

SELECT results_eq(
  $$SELECT l.school_id, a.user_id, a.can_edit, a.can_submit, i.status::text, i.course_structure_id IS NULL, i.template_snapshot_id::text
      FROM public.school_via_instance_links l JOIN public.assessment_instances i ON i.id=l.instance_id
      JOIN public.assessment_instance_assignees a ON a.instance_id=i.id
     WHERE l.template_id='13100000-0000-4000-8000-0000000000e2' ORDER BY l.school_id$$,
  $$VALUES (9310,tests.get_supabase_uid('dop_dir'),true,true,'pending'::text,true,'13100000-0000-4000-8000-0000000000f2'),
           (9311,tests.get_supabase_uid('dop_dir'),true,true,'pending'::text,true,'13100000-0000-4000-8000-0000000000f2')$$,
  'each active responsable receives the school registro with link and edit+submit grant');

-- Failures are listed and do not stop the other pairs.
SET LOCAL ROLE service_role;
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e3') AS prev3 \gset
SELECT public.preview_template_delivery('13100000-0000-4000-8000-0000000000e4') AS prev4 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e3') AS del3 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e4') AS del4 \gset
RESET ROLE;
SELECT is(:'prev3'::jsonb,'{"target":"course_docente","courses":1,"schools":1}'::jsonb,'preview counts only the courses that will receive (not the ineligible recipient, not the school without context year)');
SELECT is((:'prev3'::jsonb->>'courses')::integer,(:'del3'::jsonb->>'created')::integer,'course preview equals what delivery creates');
SELECT is(:'del3'::jsonb,'{"created":1,"skipped":0,"failed":2,"has_more":false,"failures":[{"course_id":"13100000-0000-4000-8000-000000000021","code":"recipient_not_eligible"},{"course_id":"13100000-0000-4000-8000-000000000023","code":"context_missing"}]}'::jsonb,
  'recipient without an active role and course in a school without context year are listed as failed; the other course still receives');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id='13100000-0000-4000-8000-000000000021'),0,'recipient without an active role receives nothing');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id='13100000-0000-4000-8000-000000000022'),1,'eligible course after a failed one receives');
SELECT is(:'prev4'::jsonb,'{"target":"school_responsible","courses":0,"schools":1}'::jsonb,'school preview counts only the schools that will receive (not the one without context year, not the responsable without role)');
SELECT is((:'prev4'::jsonb->>'schools')::integer,(:'del4'::jsonb->>'created')::integer,'school preview equals what delivery creates');
SELECT is(:'del4'::jsonb,'{"created":1,"skipped":0,"failed":2,"has_more":false,"failures":[{"school_id":9312,"code":"context_missing"},{"school_id":9313,"code":"recipient_not_eligible"}]}'::jsonb,
  'school without context year and responsable without role are listed; school A still receives');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_via_instance_links WHERE template_id='13100000-0000-4000-8000-0000000000e4'),ARRAY[9310],'only the eligible school got the school registro');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE school_id IN (9312,9313)),0,'failed schools have nothing written');

-- The sweep state is never touched by delivery.
SELECT results_eq('SELECT * FROM public.assessment_delivery_reconcile_state','SELECT * FROM dop_original_state','delivery does not touch the sweep cursor');

-- ---------------------------------------------------------------------------
-- Idempotence against itself and the sweep
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE dop_after_delivery AS
  SELECT i.id FROM public.assessment_instances i WHERE i.school_id BETWEEN 9310 AND 9313;
SET LOCAL ROLE service_role;
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e1') AS again1 \gset
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e2') AS again2 \gset
RESET ROLE;
SELECT is((:'again1'::jsonb->>'created')::integer + (:'again2'::jsonb->>'created')::integer,0,'second delivery creates nothing');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE school_id BETWEEN 9310 AND 9313),(SELECT count(*)::integer FROM dop_after_delivery),'second delivery wrote no instance');

-- Publish T7 now; the sweep runs first for it, then delivery.
UPDATE public.assessment_templates SET status='published' WHERE id='13100000-0000-4000-8000-0000000000e7';
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data,created_at)
VALUES ('13100000-0000-4000-8000-0000000000f7','13100000-0000-4000-8000-0000000000e7','1.0','{"modules":[]}','2026-02-01');
UPDATE public.assessment_delivery_reconcile_state SET scan_key='';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE school_id BETWEEN 9310 AND 9313 AND id NOT IN (SELECT id FROM dop_after_delivery)),1,'sweep after delivery adds only the not-yet-delivered T7 course');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE template_snapshot_id='13100000-0000-4000-8000-0000000000f7' AND course_structure_id='13100000-0000-4000-8000-000000000004'),1,'sweep delivered T7');
SET LOCAL ROLE service_role;
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e7') AS del7 \gset
RESET ROLE;
SELECT is((:'del7'::jsonb->>'created')::integer,0,'delivery after the sweep creates nothing');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE template_snapshot_id='13100000-0000-4000-8000-0000000000f7'),1,'still one T7 registro');

-- has_more and the limit: a fresh template with two candidates, limit 1.
INSERT INTO public.assessment_templates(id,area,version,name,status,is_archived,grade_id)
VALUES ('13100000-0000-4000-8000-0000000000e8','evaluacion','2.0','DOP Limit','published',false,93101);
INSERT INTO public.assessment_template_snapshots(id,template_id,version,snapshot_data)
VALUES ('13100000-0000-4000-8000-0000000000f8','13100000-0000-4000-8000-0000000000e8','1.0','{"modules":[]}');
SET LOCAL ROLE service_role;
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e8',1) AS lim1 \gset
RESET ROLE;
SELECT is((:'lim1'::jsonb->>'created')::integer,1,'limit 1 delivers one pair');
SELECT is((:'lim1'::jsonb->>'has_more')::boolean,true,'limit reached reports has_more');

-- ---------------------------------------------------------------------------
-- A pair that fails with a database error (not one of the application's
-- names) is listed with a fixed code, never PostgreSQL's prose. pgTAP runs in
-- one session and the fixture is uncommitted, so a second session cannot hold
-- the course's row lock (55P03 -> course_busy is not exercised here). Instead:
-- school E's responsable was assigned by a profile that has no auth user, so
-- delivery's INSERT into assessment_instances (assigned_by -> auth.users)
-- raises a foreign-key violation, SQLSTATE 23503.
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('dop_dir4');
SELECT tests.get_supabase_uid('dop_dir4') AS dir4 \gset
INSERT INTO public.profiles(id,email,name,approval_status) VALUES
(:'dir4','dop_dir4@test.local','dop_dir4','approved'),
('13100000-0000-4000-8000-0000000000d9','dop_ghost@test.local','dop_ghost','approved') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.schools(id,name) VALUES (9314,'DOP School E');
INSERT INTO public.user_roles(user_id,role_type,school_id,is_active) VALUES (:'dir4','equipo_directivo',9314,true);
INSERT INTO public.school_transversal_context(id,school_id,total_students,grade_levels,courses_per_level,implementation_year_2026,period_system) VALUES
('13100000-0000-4000-8000-00000000c00e',9314,100,ARRAY['1_basico'],'{"1_basico":1}',1,'semestral');
INSERT INTO public.school_via_responsibles(school_id,area,user_id,assigned_by) VALUES
(9314,'liderazgo',:'dir4','13100000-0000-4000-8000-0000000000d9');
SET LOCAL ROLE service_role;
SELECT public.deliver_published_template('13100000-0000-4000-8000-0000000000e2') AS delerr \gset
RESET ROLE;
SELECT is(:'delerr'::jsonb->'failures'->0->>'code','error_23503','a database error is listed as error_<SQLSTATE>, not as the database message');
SELECT ok((SELECT bool_and(f->>'code' IN ('scope_changed','assignment_invariant_violation','recipient_not_eligible','via_changed',
             'responsible_changed','template_changed','grade_changed','context_missing','snapshot_missing',
             'invalid_arguments','course_not_found','docente_not_active_on_course','snapshot_not_found','template_not_eligible',
             'via_rule_missing','via_not_course_level','instance_ambiguous','snapshot_not_current','course_busy')
             OR f->>'code' ~ '^error_[0-9A-Z]{5}$')
           FROM jsonb_array_elements(:'delerr'::jsonb->'failures') f),'every failure code is a fixed value');
SELECT is(:'delerr'::jsonb,'{"created":0,"skipped":0,"failed":1,"has_more":false,"failures":[{"school_id":9314,"code":"error_23503"}]}'::jsonb,'the failed school is the only pair, listed by id and code');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE school_id=9314),0,'the failed school has nothing written');

-- ---------------------------------------------------------------------------
-- Existing work byte-identical
-- ---------------------------------------------------------------------------
SELECT results_eq('SELECT i.* FROM public.assessment_instances i JOIN dop_original_instances old ON old.id=i.id ORDER BY i.id','SELECT * FROM dop_original_instances ORDER BY id','all existing instance fields preserved across every status');
SELECT results_eq('SELECT a.* FROM public.assessment_instance_assignees a JOIN dop_original_instances old ON old.id=a.instance_id ORDER BY a.id','SELECT * FROM dop_original_grants ORDER BY id','all existing grants preserved including started/submitted read-only co-assignees');
SELECT results_eq('SELECT r.* FROM public.assessment_responses r JOIN dop_original_responses old ON old.id=r.id','SELECT * FROM dop_original_responses','saved responses preserved byte for byte');
SELECT is((SELECT count(*)::integer FROM public.assessment_instances WHERE course_structure_id IN (SELECT ('13100000-0000-4000-8000-0000000000'||n)::uuid FROM generate_series(11,15) n)),5,'no clones for pending/in-progress/completed/archived/cancelled earlier work');

SELECT * FROM finish();
ROLLBACK;
