-- PROC-B5 F3: year weight source revision guard.
-- Synthetic fixtures only (ids prefixed b5300000); everything rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

-- ---------------------------------------------------------------------------
-- Helpers: synthetic ids, counter reads and tagged revision baselines.
-- Templates A..D map to b5300000-0000-4000-8000-00000000000{1..4}.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE b5_base (
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY (tag, label)
);

CREATE FUNCTION pg_temp.t(p TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5300000-0000-4000-8000-' || lpad((ascii(p) - 64)::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.e(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5300000-0000-4000-8003-' || lpad(n::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.w(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5300000-0000-4000-8004-' || lpad(n::TEXT, 12, '0'))::UUID
$$;

CREATE FUNCTION pg_temp.rev(p UUID) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT COALESCE(
    (SELECT r.revision FROM public.assessment_template_source_revisions r WHERE r.template_id = p),
    0::BIGINT)
$$;

CREATE FUNCTION pg_temp.mark(p_tag TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM pg_temp.b5_base WHERE tag = p_tag;
  INSERT INTO pg_temp.b5_base (tag, label, revision)
  SELECT p_tag, l, pg_temp.rev(pg_temp.t(l))
  FROM unnest(ARRAY['A', 'B', 'C', 'D']) AS l;
END;
$$;

-- Nonzero deltas since the tagged baseline, e.g. 'A=1,B=1', or 'none'.
CREATE FUNCTION pg_temp.deltas(p_tag TEXT, p_skip TEXT[] DEFAULT '{}'::TEXT[])
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_temp.b5_base b WHERE b.tag = p_tag) THEN
    RETURN 'missing baseline ' || p_tag;
  END IF;
  RETURN COALESCE((
    SELECT string_agg(b.label || '=' || (pg_temp.rev(pg_temp.t(b.label)) - b.revision), ',' ORDER BY b.label)
    FROM pg_temp.b5_base b
    WHERE b.tag = p_tag
      AND b.label <> ALL (p_skip)
      AND pg_temp.rev(pg_temp.t(b.label)) <> b.revision
  ), 'none');
END;
$$;

-- Runs one single-row statement and returns the deltas it caused.
CREATE FUNCTION pg_temp.step(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_rows BIGINT;
BEGIN
  PERFORM pg_temp.mark('step');
  EXECUTE p_sql;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN format('rows=%s', v_rows);
  END IF;
  RETURN pg_temp.deltas('step');
END;
$$;

-- Runs a statement inside a subtransaction that is then deliberately aborted.
-- Returns the deltas observed inside; only the intentional abort is caught.
CREATE FUNCTION pg_temp.aborted(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_inside TEXT;
BEGIN
  PERFORM pg_temp.mark('abort');
  BEGIN
    EXECUTE p_sql;
    v_inside := pg_temp.deltas('abort');
    RAISE EXCEPTION USING ERRCODE = 'P0B53', MESSAGE = 'b5 intentional abort';
  EXCEPTION WHEN SQLSTATE 'P0B53' THEN
    NULL;
  END;
  RETURN v_inside;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- A: field matrix. B: move/insert target. C: service_role DML.
-- D: template deletion with year weight children.
-- ---------------------------------------------------------------------------
INSERT INTO public.assessment_templates (id, name, area, version, status)
SELECT pg_temp.t(l), 'B5 F3 synthetic ' || l, 'personalizacion', '1.0', 'draft'
FROM unnest(ARRAY['A', 'B', 'C', 'D']) AS l;

INSERT INTO public.assessment_entity_year_weights
  (id, template_id, entity_type, entity_id, year, weight, created_at, updated_at)
VALUES
  (pg_temp.w(1), pg_temp.t('A'), 'objective', pg_temp.e(1), 1, 1, now(), now()),
  (pg_temp.w(2), pg_temp.t('D'), 'module', pg_temp.e(2), 1, 1, now(), now()),
  (pg_temp.w(3), pg_temp.t('D'), 'indicator', pg_temp.e(3), 2, 0.5, now(), now());

-- ---------------------------------------------------------------------------
-- C1. Function security, ACLs and trigger attachment
-- ---------------------------------------------------------------------------
SELECT v.tap
FROM (VALUES
  ('public.guard_assessment_year_weight_source_revision()'::regprocedure,
   'public.assessment_entity_year_weights'::regclass, 'assessment_entity_year_weights_source_revision_guard')
) AS f(fn, tbl, trg)
JOIN pg_catalog.pg_proc p ON p.oid = f.fn::OID
CROSS JOIN LATERAL (VALUES
  (ok(p.prosecdef, format('%s is SECURITY DEFINER', f.fn))),
  (is(p.proconfig, ARRAY['search_path=pg_catalog, public'], format('%s pins search_path', f.fn))),
  (ok(p.prorettype = 'pg_catalog.trigger'::regtype, format('%s returns trigger', f.fn))),
  (ok(p.proacl IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0),
      format('%s has no PUBLIC grant', f.fn))),
  (ok(NOT has_function_privilege('anon', f.fn::OID, 'EXECUTE'), format('%s not executable by anon', f.fn))),
  (ok(NOT has_function_privilege('authenticated', f.fn::OID, 'EXECUTE'), format('%s not executable by authenticated', f.fn))),
  (ok(NOT has_function_privilege('service_role', f.fn::OID, 'EXECUTE'), format('%s not executable by service_role', f.fn))),
  (is((SELECT string_agg(format('%s|%s|%s|%s', (t.tgrelid = f.tbl::OID)::TEXT, t.tgname, t.tgtype, t.tgenabled), ';')
       FROM pg_catalog.pg_trigger t
       WHERE t.tgfoid = p.oid),
      format('true|%s|29|O', f.trg),
      format('%s attached once as enabled AFTER INSERT/UPDATE/DELETE row trigger', f.fn)))
) AS v(tap);

SELECT ok(
  NOT has_function_privilege('service_role', 'public.bump_template_source_revisions(uuid[])', 'EXECUTE')
  AND NOT has_table_privilege('service_role', 'public.assessment_template_source_revisions', 'INSERT, UPDATE'),
  'service_role cannot execute the helper or write counters directly'
);

-- ---------------------------------------------------------------------------
-- C1. Real service_role: direct guard invocation denied, DML bumps via definer
-- ---------------------------------------------------------------------------
SELECT pg_temp.mark('svc');

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

INSERT INTO public.assessment_entity_year_weights
  (id, template_id, entity_type, entity_id, year, weight, created_at, updated_at)
VALUES ('b5300000-0000-4000-8004-000000000005', 'b5300000-0000-4000-8000-000000000003',
        'objective', 'b5300000-0000-4000-8003-000000000005', 1, 1, now(), now());
UPDATE public.assessment_entity_year_weights SET weight = 2
WHERE id = 'b5300000-0000-4000-8004-000000000005';
UPDATE public.assessment_entity_year_weights SET updated_at = updated_at + interval '1 day'
WHERE id = 'b5300000-0000-4000-8004-000000000005';
INSERT INTO public.assessment_entity_year_weights
  (id, template_id, entity_type, entity_id, year, weight, created_at, updated_at)
VALUES ('b5300000-0000-4000-8004-000000000006', 'b5300000-0000-4000-8000-000000000003',
        'module', 'b5300000-0000-4000-8003-000000000006', 4, 1, now(), now());
DELETE FROM public.assessment_entity_year_weights WHERE id = 'b5300000-0000-4000-8004-000000000006';

DO $$
BEGIN
  PERFORM set_config('b5.svc_user', current_user, true);
  BEGIN
    PERFORM public.guard_assessment_year_weight_source_revision();
    PERFORM set_config('b5.year_weight_call', 'no error', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('b5.year_weight_call', SQLSTATE, true);
  END;
END;
$$;

RESET ROLE;

SELECT is(current_setting('b5.svc_user', true), 'service_role', 'service_role section ran as service_role');
SELECT is(current_setting('b5.year_weight_call', true), '42501', 'service_role direct year weight guard call denied 42501');
SELECT is(pg_temp.deltas('svc'), 'C=4',
          'service_role insert, update, insert, delete bump C through definer guard; timestamps-only update does not');
SELECT is((SELECT count(*) FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(5) AND weight = 2),
          1::BIGINT, 'service_role year weight insert and update persisted');
SELECT is((SELECT count(*) FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(6)),
          0::BIGINT, 'service_role year weight delete persisted');

-- ---------------------------------------------------------------------------
-- C2/C3. Field matrix, same-parent dedup, moves, insert/delete (rows=1 each)
-- ---------------------------------------------------------------------------
SELECT pg_temp.mark('matrix');
SELECT is(pg_temp.step(s.q), s.want, s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_entity_year_weights SET entity_type = 'module' WHERE id = pg_temp.w(1)$$, 'A=1',
      'entity_type change bumps A once'),
  (2, $$UPDATE public.assessment_entity_year_weights SET entity_id = pg_temp.e(2) WHERE id = pg_temp.w(1)$$, 'A=1',
      'entity_id change bumps A once'),
  (3, $$UPDATE public.assessment_entity_year_weights SET year = 2 WHERE id = pg_temp.w(1)$$, 'A=1',
      'year change bumps A once'),
  (4, $$UPDATE public.assessment_entity_year_weights SET weight = 2.5 WHERE id = pg_temp.w(1)$$, 'A=1',
      'weight change bumps A once'),
  (5, $$UPDATE public.assessment_entity_year_weights SET id = pg_temp.w(11) WHERE id = pg_temp.w(1)$$, 'none',
      'id-only change (not serialized) does not bump'),
  (6, $$UPDATE public.assessment_entity_year_weights SET id = pg_temp.w(1) WHERE id = pg_temp.w(11)$$, 'none',
      'id-only restore does not bump'),
  (7, $$UPDATE public.assessment_entity_year_weights SET created_at = created_at - interval '1 day',
        updated_at = updated_at + interval '1 day' WHERE id = pg_temp.w(1)$$, 'none',
      'timestamps-only update does not bump'),
  (8, $$UPDATE public.assessment_entity_year_weights SET template_id = template_id, entity_type = entity_type,
        entity_id = entity_id, year = year, weight = weight WHERE id = pg_temp.w(1)$$, 'none',
      'same-value update does not bump'),
  (9, $$UPDATE public.assessment_entity_year_weights SET entity_type = 'indicator', entity_id = pg_temp.e(3),
        year = 3, weight = 4 WHERE id = pg_temp.w(1)$$, 'A=1',
      'multicolumn update bumps A once'),
  (10, $$UPDATE public.assessment_entity_year_weights SET template_id = pg_temp.t('B') WHERE id = pg_temp.w(1)$$, 'A=1,B=1',
       'template move A to B bumps both parents once, C/D unchanged'),
  (11, $$UPDATE public.assessment_entity_year_weights SET template_id = pg_temp.t('A') WHERE id = pg_temp.w(1)$$, 'A=1,B=1',
       'template move B to A bumps both parents once, C/D unchanged'),
  (12, $$INSERT INTO public.assessment_entity_year_weights (id, template_id, entity_type, entity_id, year, weight, created_at, updated_at)
         VALUES (pg_temp.w(4), pg_temp.t('B'), 'objective', pg_temp.e(4), 5, 0, now(), now())$$, 'B=1',
       'insert bumps its template B once'),
  (13, $$DELETE FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(4)$$, 'B=1',
       'delete bumps its template B once')
) AS s(n, q, want, label)
ORDER BY s.n;

SELECT is(pg_temp.deltas('matrix'), 'A=7,B=4', 'matrix cumulative deltas match the individual steps');
SELECT is((SELECT format('%s|%s|%s|%s|%s', (template_id = pg_temp.t('A'))::TEXT, entity_type,
                         (entity_id = pg_temp.e(3))::TEXT, year, (weight = 4)::TEXT)
           FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(1)),
          'true|indicator|true|3|true', 'matrix row persisted final serialized values');
SELECT is((SELECT count(*) FROM public.assessment_entity_year_weights WHERE id IN (pg_temp.w(4), pg_temp.w(11))),
          0::BIGINT, 'deleted row and temporary id are absent');

SELECT pg_temp.mark('cum');
SELECT is(pg_temp.step(s.q), 'A=1', s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_entity_year_weights SET weight = 5 WHERE id = pg_temp.w(1)$$, 'weight A to B #1 bumps'),
  (2, $$UPDATE public.assessment_entity_year_weights SET weight = 4 WHERE id = pg_temp.w(1)$$, 'weight B to A #1 bumps'),
  (3, $$UPDATE public.assessment_entity_year_weights SET weight = 5 WHERE id = pg_temp.w(1)$$, 'weight A to B #2 bumps'),
  (4, $$UPDATE public.assessment_entity_year_weights SET weight = 4 WHERE id = pg_temp.w(1)$$, 'weight B to A #2 bumps')
) AS s(n, q, label)
ORDER BY s.n;
SELECT is(pg_temp.deltas('cum'), 'A=4', 'weight A-B-A twice advances A by 4 despite restored value');
SELECT ok((SELECT weight = 4 FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(1)), 'weight restored to original');

-- ---------------------------------------------------------------------------
-- C3. Template deletion cascades year weights and counter
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*) FROM public.assessment_entity_year_weights WHERE template_id = pg_temp.t('D')),
          2::BIGINT, 'template D fixture year weights present');
SELECT ok(EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('D')),
          'template D has a counter before deletion');
SELECT pg_temp.mark('tdel');
SELECT lives_ok($$DELETE FROM public.assessment_templates WHERE id = pg_temp.t('D')$$,
                'deleting template D with year weight children succeeds');
SELECT is((SELECT count(*) FROM public.assessment_templates WHERE id = pg_temp.t('D'))
          + (SELECT count(*) FROM public.assessment_entity_year_weights WHERE id IN (pg_temp.w(2), pg_temp.w(3))),
          0::BIGINT, 'template D and its cascaded year weights are gone');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('D')),
          'template deletion removes D counter and leaves no orphan');
SELECT is(pg_temp.deltas('tdel', ARRAY['D']), 'none', 'template deletion leaves other templates unchanged');

-- ---------------------------------------------------------------------------
-- C4. Aborted subtransaction move restores source and both counters
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.aborted($$UPDATE public.assessment_entity_year_weights SET template_id = pg_temp.t('B') WHERE id = pg_temp.w(1)$$),
          'A=1,B=1', 'year weight move A to B bumps both inside subtransaction');
SELECT is(pg_temp.deltas('abort'), 'none', 'aborted move restores both counters');
SELECT is((SELECT template_id FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(1)), pg_temp.t('A'),
          'aborted move restores source template_id');

-- ---------------------------------------------------------------------------
-- C4. Overflow on the higher-ordered destination fails and restores everything
-- ---------------------------------------------------------------------------
INSERT INTO public.assessment_template_source_revisions (template_id, revision)
VALUES (pg_temp.t('B'), 9223372036854775807::BIGINT)
ON CONFLICT (template_id) DO UPDATE SET revision = EXCLUDED.revision;

SELECT pg_temp.mark('ovf');
SELECT ok(pg_temp.t('A') < pg_temp.t('B') AND pg_temp.rev(pg_temp.t('A')) > 0
          AND pg_temp.rev(pg_temp.t('B')) = 9223372036854775807::BIGINT,
          'source A has a counter and destination B is higher-ordered at bigint max');

SELECT throws_ok($$UPDATE public.assessment_entity_year_weights SET template_id = pg_temp.t('B') WHERE id = pg_temp.w(1)$$,
                 '22003', NULL, 'year weight move into max-revision parent B fails 22003');
SELECT is((SELECT template_id FROM public.assessment_entity_year_weights WHERE id = pg_temp.w(1)), pg_temp.t('A'),
          'failed move restores source template_id');
SELECT is(pg_temp.deltas('ovf'), 'none', 'failed move rolls back earlier A increment and leaves B at max');

SELECT * FROM finish();
ROLLBACK;
