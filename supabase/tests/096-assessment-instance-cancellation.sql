-- =============================================================================
-- 096-assessment-instance-cancellation.sql — PROC-LIFECYCLE-CANCELLATION child 1
--
-- Covers migration 20260920213000_assessment_instance_cancellation.sql:
--   D1 an active literal admin cancels a pending, an in_progress instance that
--      already carries responses ("answered") and a completed one; the audit
--      fields land atomically and the stored status, timestamps, responses,
--      assignees and results are byte-identical afterwards.
--   D2 non-admin, inactive admin, missing actor and every direct table attempt
--      are refused and mutate nothing.
--   D3 blank / whitespace / NULL / oversized reason, missing instance and an
--      ineligible stored status refuse stably; a repeat request keeps the FIRST
--      audit facts even when a different reason is supplied.
--   D4 after cancellation the database refuses response INSERT/UPDATE/DELETE and
--      instance UPDATE/DELETE — including a response UPDATE that tries to move a
--      response OUT of a cancelled instance or INTO one — while the
--      pre-cancellation status stays readable and uncancelled parents stay usable.
--   D5 the RPC is service_role only, anon and authenticated cannot execute it,
--      the service path re-checks the actor, and both touched tables keep RLS.
--   D6 the baseline status CHECK is unchanged, no row ever stores 'cancelled',
--      and the cancelled state is unambiguous from the audit fields alone.
--
-- Self-contained synthetic fixtures (school -960001, UUIDs 96000000-…).
-- Everything is rolled back.
-- =============================================================================

BEGIN;

SELECT plan(70);

-- ---------------------------------------------------------------------------
-- D5/D6 preconditions (postgres)
-- ---------------------------------------------------------------------------
SELECT tests.rls_enabled('public', 'assessment_instances');
SELECT tests.rls_enabled('public', 'assessment_responses');

SELECT is(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'assessment_instances_status_check'
      AND conrelid = 'public.assessment_instances'::regclass),
  'CHECK ((status = ANY (ARRAY[''pending''::text, ''in_progress''::text, ''completed''::text, ''archived''::text])))',
  'D6: el CHECK base de status sigue exactamente igual, sin el valor cancelled'
);

SELECT is(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'assessment_instances_cancellation_all_or_none'
      AND conrelid = 'public.assessment_instances'::regclass),
  'CHECK ((((cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancellation_reason IS NULL))'
  || ' OR ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND (cancellation_reason IS NOT NULL)'
  || ' AND (btrim(cancellation_reason) <> ''''::text) AND (length(cancellation_reason) <= 500))))',
  'D6: la restricción todo-o-nada exige los tres campos juntos, motivo no vacío y <= 500 caracteres'
);

SELECT is(
  (SELECT array_agg(a.attname::text || ':' || format_type(a.atttypid, NULL) || ':' || a.attnotnull::text ORDER BY a.attname)
     FROM pg_attribute a
    WHERE a.attrelid = 'public.assessment_instances'::regclass
      AND a.attname IN ('cancelled_at', 'cancelled_by', 'cancellation_reason')),
  ARRAY['cancellation_reason:text:false', 'cancelled_at:timestamp with time zone:false', 'cancelled_by:uuid:false'],
  'D6: las tres columnas de auditoría existen, son anulables y tienen el tipo esperado'
);

SELECT is(
  (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger
    WHERE tgname IN ('assessment_instance_cancellation_guard_trg', 'assessment_response_cancellation_guard_trg')
      AND NOT tgisinternal),
  ARRAY['assessment_instance_cancellation_guard_trg', 'assessment_response_cancellation_guard_trg'],
  'D4: ambos disparadores terminales están cargados'
);

SELECT ok(
  has_function_privilege('service_role', 'public.cancel_assessment_instance(uuid,uuid,text)', 'EXECUTE'),
  'D5: service_role puede ejecutar la RPC de cancelación'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.cancel_assessment_instance(uuid,uuid,text)', 'EXECUTE'),
  'D5: anon no puede ejecutar la RPC de cancelación'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.cancel_assessment_instance(uuid,uuid,text)', 'EXECUTE'),
  'D5: authenticated no puede ejecutar la RPC de cancelación'
);

SELECT is(
  public.assessment_instance_lifecycle_state('in_progress', NULL),
  'in_progress',
  'D6: sin cancelled_at el estado derivado es el status almacenado'
);
SELECT is(
  public.assessment_instance_lifecycle_state('completed', now()),
  'cancelled',
  'D6: con cancelled_at el estado derivado es cancelled cualquiera sea el status'
);

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres)
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_admin uuid;
  v_docente uuid;
  v_exadmin uuid;
BEGIN
  v_admin := tests.create_supabase_user('c14_admin_096', 'c14-admin-096@test.local');
  v_docente := tests.create_supabase_user('c14_docente_096', 'c14-docente-096@test.local');
  v_exadmin := tests.create_supabase_user('c14_exadmin_096', 'c14-exadmin-096@test.local');
  PERFORM set_config('c14.admin_uid', v_admin::text, true);
  PERFORM set_config('c14.docente_uid', v_docente::text, true);
  PERFORM set_config('c14.exadmin_uid', v_exadmin::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_admin, 'c14-admin-096@test.local', 'C14 Admin 096', 'approved', false),
    (v_docente, 'c14-docente-096@test.local', 'C14 Docente 096', 'approved', false),
    (v_exadmin, 'c14-exadmin-096@test.local', 'C14 ExAdmin 096', 'approved', false);

  INSERT INTO public.schools (id, name) VALUES (-960001, 'C14 Synthetic School 096');

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_admin, 'admin', NULL, true),
    (v_docente, 'docente', -960001, true),
    (v_exadmin, 'admin', NULL, false);

  INSERT INTO public.assessment_templates (id, area, version, name, status)
  VALUES ('96000000-0000-4000-8000-0000000000a1', 'C14 Synthetic Area 096', 'v-096', 'C14 Synthetic Template 096', 'published');

  INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
  VALUES ('96000000-0000-4000-8000-0000000000b1', '96000000-0000-4000-8000-0000000000a1', 'v-096', '{"modules": []}'::jsonb);

  INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, transformation_year, status, assigned_by, started_at, completed_at)
  VALUES
    ('96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-0000000000b1', -960001, 1, 'pending', v_admin, NULL, NULL),
    ('96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-0000000000b1', -960001, 2, 'in_progress', v_admin, '2026-09-01T10:00:00Z', NULL),
    ('96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-0000000000b1', -960001, 3, 'completed', v_admin, '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z'),
    ('96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-0000000000b1', -960001, 4, 'archived', v_admin, NULL, NULL),
    ('96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-0000000000b1', -960001, 5, 'pending', v_admin, NULL, NULL),
    ('96000000-0000-4000-8000-000000000006', '96000000-0000-4000-8000-0000000000b1', -960001, 1, 'pending', v_admin, NULL, NULL),
    ('96000000-0000-4000-8000-000000000007', '96000000-0000-4000-8000-0000000000b1', -960001, 2, 'in_progress', v_admin, '2026-09-01T10:00:00Z', NULL),
    ('96000000-0000-4000-8000-000000000008', '96000000-0000-4000-8000-0000000000b1', -960001, 3, 'pending', v_admin, NULL, NULL);

  -- I2 is the "answered" case: in_progress with responses already recorded.
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, profundity_level, rationale, responded_by)
  VALUES
    ('96000000-0000-4000-8000-0000000000c1', '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-0000000000d1', 2, 'C14 respuesta uno', v_docente),
    ('96000000-0000-4000-8000-0000000000c2', '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-0000000000d2', 3, 'C14 respuesta dos', v_docente),
    ('96000000-0000-4000-8000-0000000000c3', '96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-0000000000d1', 4, 'C14 respuesta tres', v_docente),
    ('96000000-0000-4000-8000-0000000000c4', '96000000-0000-4000-8000-000000000007', '96000000-0000-4000-8000-0000000000d1', 2, 'C14 respuesta cuatro', v_docente);

  INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by)
  VALUES ('96000000-0000-4000-8000-0000000000e1', '96000000-0000-4000-8000-000000000003', v_docente, true, true, true, true, v_admin);

  INSERT INTO public.assessment_instance_results (id, instance_id, total_score, overall_level, meets_expectations, calculated_by)
  VALUES ('96000000-0000-4000-8000-0000000000f1', '96000000-0000-4000-8000-000000000003', 72.50, 3, true, v_admin);
END
$fixture$;

-- Pre-cancellation digests, compared verbatim after the cancellations land.
DO $digest$
BEGIN
  PERFORM set_config('c14.i3_row',
    (SELECT row(status, transformation_year, assigned_at, started_at, completed_at, assigned_by, context_responses)::text
       FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000003'), true);
  PERFORM set_config('c14.i3_resp',
    (SELECT array_agg(row(id, indicator_id, profundity_level, rationale, responded_by, responded_at)::text ORDER BY id)::text
       FROM public.assessment_responses WHERE instance_id = '96000000-0000-4000-8000-000000000003'), true);
  PERFORM set_config('c14.i2_resp',
    (SELECT array_agg(row(id, indicator_id, profundity_level, rationale, responded_by, responded_at)::text ORDER BY id)::text
       FROM public.assessment_responses WHERE instance_id = '96000000-0000-4000-8000-000000000002'), true);
  PERFORM set_config('c14.assignee',
    (SELECT row(instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_at, assigned_by)::text
       FROM public.assessment_instance_assignees WHERE id = '96000000-0000-4000-8000-0000000000e1'), true);
  PERFORM set_config('c14.result',
    (SELECT row(instance_id, total_score, overall_level, meets_expectations, calculated_at, calculated_by)::text
       FROM public.assessment_instance_results WHERE id = '96000000-0000-4000-8000-0000000000f1'), true);
END
$digest$;

-- ---------------------------------------------------------------------------
-- D2 — authenticated and anon cannot reach the RPC at all
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c14_admin_096');
SELECT is(current_user::text, 'authenticated', 'D5: el admin sintético actúa como authenticated');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, 'intento directo') $$,
  '42501', NULL::text,
  'D5: ni siquiera un admin real puede ejecutar la RPC como authenticated'
);

SELECT throws_ok(
  $$ UPDATE public.assessment_instances
        SET cancelled_at = now(), cancelled_by = current_setting('c14.admin_uid')::uuid, cancellation_reason = 'por tabla'
      WHERE id = '96000000-0000-4000-8000-000000000005' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: un admin autenticado no puede escribir los campos de auditoría por tabla'
);

RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       '96000000-0000-4000-8000-000000000001'::uuid, '96000000-0000-4000-8000-000000000005'::uuid, 'anon') $$,
  '42501', NULL::text,
  'D5: anon no puede ejecutar la RPC de cancelación'
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- D2 — direct table attempts as postgres (RLS is bypassed, only the guard acts)
-- ---------------------------------------------------------------------------
-- El disparador es BEFORE, así que corta la escritura parcial antes de que la
-- restricción todo-o-nada llegue a evaluarse: el rechazo es del guardián.
SELECT throws_ok(
  $$ UPDATE public.assessment_instances SET cancelled_at = now() WHERE id = '96000000-0000-4000-8000-000000000005' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: postgres no puede fijar solo cancelled_at por tabla'
);
SELECT throws_ok(
  $$ UPDATE public.assessment_instances
        SET cancelled_at = now(), cancelled_by = current_setting('c14.admin_uid')::uuid, cancellation_reason = 'por tabla'
      WHERE id = '96000000-0000-4000-8000-000000000005' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: postgres tampoco puede escribir los tres campos por tabla'
);
SELECT throws_ok(
  $$ INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, transformation_year, status, cancelled_at, cancelled_by, cancellation_reason)
     VALUES ('96000000-0000-4000-8000-000000000009', '96000000-0000-4000-8000-0000000000b1', -960001, 1, 'pending',
             now(), current_setting('c14.admin_uid')::uuid, 'nace cancelada') $$,
  '42501', 'cancellation_requires_rpc',
  'D2: no se puede insertar una instancia que nace cancelada'
);

-- ---------------------------------------------------------------------------
-- D2 — contraejemplo B1: la clave GUC que r1 usaba como permiso ya no vale nada
-- ---------------------------------------------------------------------------
-- Cualquiera puede fijar la clave; queda fijada para el resto de la transacción,
-- así que todos los rechazos siguientes ocurren con la clave puesta en la instancia
-- objetivo. postgres es el dueño de la RPC, el peor caso: aun así es rechazado,
-- porque el guardián exige además el marco real de la RPC en la pila de llamadas.
SELECT is(
  set_config('assessment_instance.cancelling', '96000000-0000-4000-8000-000000000008', true),
  '96000000-0000-4000-8000-000000000008',
  'D2: la clave GUC que r1 usaba como permiso sigue siendo fijable por cualquier llamador');
SELECT throws_ok(
  $$ UPDATE public.assessment_instances
        SET cancelled_at = now(), cancelled_by = current_setting('c14.admin_uid')::uuid, cancellation_reason = 'suplantando la clave'
      WHERE id = '96000000-0000-4000-8000-000000000008' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: ni el dueño de la RPC puede escribir la auditoría por tabla con la clave GUC fijada');

-- ---------------------------------------------------------------------------
-- D2/D5 — the service path re-checks the actor
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$ UPDATE public.assessment_instances
        SET cancelled_at = now(), cancelled_by = current_setting('c14.admin_uid')::uuid, cancellation_reason = 'suplantando la clave'
      WHERE id = '96000000-0000-4000-8000-000000000008' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: service_role tampoco puede escribir la auditoría por tabla con la clave GUC fijada');

SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.docente_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, 'motivo válido') $$,
  '42501', 'permission_denied',
  'D2: service_role con un actor docente es rechazado'
);
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.exadmin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, 'motivo válido') $$,
  '42501', 'permission_denied',
  'D2: service_role con un admin inactivo es rechazado'
);
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       NULL::uuid, '96000000-0000-4000-8000-000000000005'::uuid, 'motivo válido') $$,
  '42501', 'permission_denied',
  'D2: service_role sin actor es rechazado'
);

-- Con la misma clave suplantada aún puesta, la RPC sigue funcionando y sigue
-- siendo idempotente: el arreglo de B1 no rompe el único camino legítimo.
SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000008'::uuid, 'cierre por la RPC'
  ) ->> 'lifecycle_state',
  'cancelled',
  'D2: con la clave GUC suplantada puesta, la RPC sigue cancelando correctamente');
SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000008'::uuid, 'segundo intento'
  ) ->> 'cancellation_reason',
  'cierre por la RPC',
  'D2: la repetición sigue devolviendo los primeros hechos de auditoría');
SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances
    WHERE id = '96000000-0000-4000-8000-000000000008'
      AND status = 'pending' AND cancellation_reason = 'cierre por la RPC'
      AND cancelled_by = current_setting('c14.admin_uid')::uuid),
  1,
  'D2: la instancia cancelada por la RPC guarda los primeros hechos y conserva su status');
SELECT throws_ok(
  $$ UPDATE public.assessment_instances SET cancellation_reason = 'reescrito con la clave'
      WHERE id = '96000000-0000-4000-8000-000000000008' $$,
  'P0001', 'instance_cancelled',
  'D2: tras la RPC la clave GUC tampoco abre ninguna ventana de reescritura');

-- ---------------------------------------------------------------------------
-- D3 — reason, instance and eligibility refusals
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, '') $$,
  'P0001', 'invalid_reason', 'D3: un motivo vacío es rechazado');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, '     ') $$,
  'P0001', 'invalid_reason', 'D3: un motivo de solo espacios es rechazado');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, NULL) $$,
  'P0001', 'invalid_reason', 'D3: un motivo NULL es rechazado');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000005'::uuid, repeat('x', 501)) $$,
  'P0001', 'reason_too_long', 'D3: un motivo de 501 caracteres es rechazado');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-00000000dead'::uuid, 'motivo válido') $$,
  'P0001', 'instance_not_found', 'D3: una instancia inexistente responde not found');
SELECT throws_ok(
  $$ SELECT public.cancel_assessment_instance(
       current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000004'::uuid, 'motivo válido') $$,
  'P0001', 'instance_not_cancellable:archived',
  'D3: una instancia archivada no es cancelable y el status aparece en el mensaje');

SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances
    WHERE id IN ('96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-000000000004')
      AND (cancelled_at IS NOT NULL OR cancelled_by IS NOT NULL OR cancellation_reason IS NOT NULL)),
  0,
  'D2/D3: tras todos los rechazos ninguna instancia quedó con campos de auditoría'
);
SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000009'),
  0,
  'D2: la instancia que nacía cancelada no existe'
);

-- D3 boundary: exactly 500 characters is accepted.
SELECT is(
  length(public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000006'::uuid, repeat('y', 500)
  ) ->> 'cancellation_reason'),
  500,
  'D3: un motivo de exactamente 500 caracteres es aceptado y se guarda completo'
);

-- ---------------------------------------------------------------------------
-- D1 — the three eligible source states cancel
-- ---------------------------------------------------------------------------
SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000001'::uuid, 'cierre del proceso'
  ) ->> 'lifecycle_state',
  'cancelled', 'D1: una instancia pendiente se cancela y su estado derivado es cancelled');

SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000002'::uuid, 'cierre con respuestas'
  ) ->> 'status',
  'in_progress', 'D1: una instancia respondida se cancela y la RPC devuelve el status previo intacto');

SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000003'::uuid, 'cierre tras completar'
  ) ->> 'status',
  'completed', 'D1: una instancia completada se cancela y conserva su status completed');

RESET ROLE;

SELECT is(
  (SELECT array_agg(status || '|' || public.assessment_instance_lifecycle_state(status, cancelled_at) ORDER BY id)
     FROM public.assessment_instances
    WHERE id IN ('96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000003')),
  ARRAY['pending|cancelled', 'in_progress|cancelled', 'completed|cancelled'],
  'D1/D6: los status almacenados sobreviven y el estado derivado es cancelled en los tres casos'
);

SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances
    WHERE id IN ('96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000003')
      AND cancelled_at IS NOT NULL AND cancelled_by = current_setting('c14.admin_uid')::uuid
      AND btrim(cancellation_reason) <> ''),
  3,
  'D1: las tres instancias tienen los tres campos de auditoría puestos de forma atómica');

SELECT is(
  (SELECT row(status, transformation_year, assigned_at, started_at, completed_at, assigned_by, context_responses)::text
     FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000003'),
  current_setting('c14.i3_row'),
  'D1: la instancia completada conserva status, marcas de tiempo y autoría sin ningún cambio');

SELECT is(
  (SELECT array_agg(row(id, indicator_id, profundity_level, rationale, responded_by, responded_at)::text ORDER BY id)::text
     FROM public.assessment_responses WHERE instance_id = '96000000-0000-4000-8000-000000000002'),
  current_setting('c14.i2_resp'),
  'D1: las respuestas de la instancia respondida quedan idénticas');

SELECT is(
  (SELECT array_agg(row(id, indicator_id, profundity_level, rationale, responded_by, responded_at)::text ORDER BY id)::text
     FROM public.assessment_responses WHERE instance_id = '96000000-0000-4000-8000-000000000003'),
  current_setting('c14.i3_resp'),
  'D1: las respuestas de la instancia completada quedan idénticas');

SELECT is(
  (SELECT row(instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_at, assigned_by)::text
     FROM public.assessment_instance_assignees WHERE id = '96000000-0000-4000-8000-0000000000e1'),
  current_setting('c14.assignee'),
  'D1: el asignado de la instancia completada queda idéntico');

SELECT is(
  (SELECT row(instance_id, total_score, overall_level, meets_expectations, calculated_at, calculated_by)::text
     FROM public.assessment_instance_results WHERE id = '96000000-0000-4000-8000-0000000000f1'),
  current_setting('c14.result'),
  'D1: el resultado calculado de la instancia completada queda idéntico');

SELECT is(
  (SELECT count(*)::int FROM public.assessment_template_snapshots WHERE id = '96000000-0000-4000-8000-0000000000b1'),
  1, 'D1: el snapshot de plantilla sigue existiendo tras las cancelaciones');

-- ---------------------------------------------------------------------------
-- D3 — idempotencia: la repetición conserva los primeros hechos de auditoría
-- ---------------------------------------------------------------------------
DO $audit$
BEGIN
  PERFORM set_config('c14.i1_audit',
    (SELECT row(cancelled_at, cancelled_by, cancellation_reason)::text
       FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000001'), true);
END
$audit$;

SET LOCAL ROLE service_role;
SELECT is(
  public.cancel_assessment_instance(
    current_setting('c14.admin_uid')::uuid, '96000000-0000-4000-8000-000000000001'::uuid, 'otro motivo distinto'
  ) ->> 'cancellation_reason',
  'cierre del proceso',
  'D3: una repetición con otro motivo devuelve el motivo original');
RESET ROLE;

SELECT is(
  (SELECT row(cancelled_at, cancelled_by, cancellation_reason)::text
     FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000001'),
  current_setting('c14.i1_audit'),
  'D3: la repetición no reescribe ninguno de los tres hechos de auditoría');

-- ---------------------------------------------------------------------------
-- D2 — the RPC closed its window: a direct write is refused again afterwards
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.assessment_instances
        SET cancelled_at = now(), cancelled_by = current_setting('c14.admin_uid')::uuid, cancellation_reason = 'por tabla'
      WHERE id = '96000000-0000-4000-8000-000000000005' $$,
  '42501', 'cancellation_requires_rpc',
  'D2: tras ejecutarse la RPC, una escritura directa sobre otra instancia sigue rechazada'
);

-- ---------------------------------------------------------------------------
-- D4 — la instancia cancelada es terminal
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.assessment_responses (instance_id, indicator_id, profundity_level)
     VALUES ('96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-0000000000d9', 1) $$,
  'P0001', 'instance_cancelled', 'D4: no se puede insertar una respuesta nueva tras la cancelación');
SELECT throws_ok(
  $$ UPDATE public.assessment_responses SET profundity_level = 0
      WHERE id = '96000000-0000-4000-8000-0000000000c1' $$,
  'P0001', 'instance_cancelled', 'D4: no se puede actualizar una respuesta tras la cancelación');
SELECT throws_ok(
  $$ DELETE FROM public.assessment_responses WHERE id = '96000000-0000-4000-8000-0000000000c1' $$,
  'P0001', 'instance_cancelled', 'D4: no se puede borrar una respuesta tras la cancelación');
SELECT throws_ok(
  $$ UPDATE public.assessment_instances SET status = 'completed'
      WHERE id = '96000000-0000-4000-8000-000000000002' $$,
  'P0001', 'instance_cancelled', 'D4: no se puede avanzar el status tras la cancelación');
SELECT throws_ok(
  $$ UPDATE public.assessment_instances SET cancellation_reason = 'reescrito'
      WHERE id = '96000000-0000-4000-8000-000000000002' $$,
  'P0001', 'instance_cancelled', 'D4: no se pueden reescribir los hechos de auditoría de una instancia cancelada');
SELECT throws_ok(
  $$ DELETE FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000002' $$,
  'P0001', 'instance_cancelled', 'D4: no se puede borrar una instancia cancelada');

-- Contraejemplo B2: r1 sólo miraba NEW.instance_id, así que sacar una respuesta de
-- una instancia cancelada la vaciaba de historia sin que nada lo impidiera.
SELECT throws_ok(
  $$ UPDATE public.assessment_responses SET instance_id = '96000000-0000-4000-8000-000000000007'
      WHERE id = '96000000-0000-4000-8000-0000000000c1' $$,
  'P0001', 'instance_cancelled',
  'D4: no se puede sacar una respuesta de una instancia cancelada hacia otra sin cancelar');
SELECT throws_ok(
  $$ UPDATE public.assessment_responses SET instance_id = '96000000-0000-4000-8000-000000000002'
      WHERE id = '96000000-0000-4000-8000-0000000000c4' $$,
  'P0001', 'instance_cancelled',
  'D4: tampoco se puede meter una respuesta ajena dentro de una instancia cancelada');
SELECT lives_ok(
  $$ UPDATE public.assessment_responses SET instance_id = '96000000-0000-4000-8000-000000000005'
      WHERE id = '96000000-0000-4000-8000-0000000000c4' $$,
  'D4: mover una respuesta entre dos instancias sin cancelar sigue permitido');
SELECT is(
  (SELECT array_agg(instance_id::text ORDER BY id)
     FROM public.assessment_responses
    WHERE id IN ('96000000-0000-4000-8000-0000000000c1', '96000000-0000-4000-8000-0000000000c4')),
  ARRAY['96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000005'],
  'D4: la respuesta de la instancia cancelada no se movió y la otra sí llegó a su destino');

SELECT tests.authenticate_as('c14_docente_096');
SELECT throws_ok(
  $$ INSERT INTO public.assessment_responses (instance_id, indicator_id, profundity_level)
     VALUES ('96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-0000000000d8', 1) $$,
  'P0001', 'instance_cancelled',
  'D4: el asignado autenticado tampoco puede responder una instancia cancelada');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT status FROM public.assessment_instances WHERE id = '96000000-0000-4000-8000-000000000002'),
  'in_progress',
  'D4: tras todos los rechazos el status previo a la cancelación sigue legible');
SELECT is(
  (SELECT array_agg(row(id, indicator_id, profundity_level, rationale, responded_by, responded_at)::text ORDER BY id)::text
     FROM public.assessment_responses WHERE instance_id = '96000000-0000-4000-8000-000000000002'),
  current_setting('c14.i2_resp'),
  'D4: tras todos los rechazos las respuestas siguen intactas');

-- ---------------------------------------------------------------------------
-- D4 — una instancia no cancelada sigue siendo mutable
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE public.assessment_instances SET status = 'in_progress'
      WHERE id = '96000000-0000-4000-8000-000000000005' $$,
  'D4: el disparador no toca instancias sin cancelar');
SELECT lives_ok(
  $$ INSERT INTO public.assessment_responses (instance_id, indicator_id, profundity_level)
     VALUES ('96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-0000000000d7', 1) $$,
  'D4: se siguen pudiendo responder instancias sin cancelar');

-- ---------------------------------------------------------------------------
-- D5/D6 — cierre
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances WHERE status = 'cancelled'),
  0,
  'D6: ninguna fila almacena el valor cancelled en status');

SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances
    WHERE school_id = -960001
      AND (cancelled_at IS NOT NULL) <> (public.assessment_instance_lifecycle_state(status, cancelled_at) = 'cancelled')),
  0,
  'D6: el estado cancelado es inequívoco a partir de los campos de auditoría, fila por fila');

SELECT tests.rls_enabled('public', 'assessment_instances');
SELECT tests.rls_enabled('public', 'assessment_responses');

SELECT * FROM finish();

ROLLBACK;
