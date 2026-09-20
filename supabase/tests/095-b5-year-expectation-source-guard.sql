-- PROC-B5 F4: year expectation source revision guard.
-- Synthetic fixtures only (ids prefixed b5400000); everything rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

-- ---------------------------------------------------------------------------
-- Helpers: synthetic ids, counter reads and tagged revision baselines.
-- Templates A..E map to b5400000-0000-4000-8000-00000000000{1..5}.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE b5_base (
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY (tag, label)
);

CREATE FUNCTION pg_temp.t(p TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5400000-0000-4000-8000-' || lpad((ascii(p) - 64)::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.m(p TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5400000-0000-4000-8001-' || lpad((ascii(p) - 64)::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.i(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5400000-0000-4000-8002-' || lpad(n::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.x(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5400000-0000-4000-8005-' || lpad(n::TEXT, 12, '0'))::UUID
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
  FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E']) AS l;
END;
$$;

-- Delta of one label since the tagged baseline (NULL if no baseline).
CREATE FUNCTION pg_temp.delta(p_tag TEXT, p_label TEXT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT pg_temp.rev(pg_temp.t(b.label)) - b.revision
  FROM pg_temp.b5_base b
  WHERE b.tag = p_tag AND b.label = p_label
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
    RAISE EXCEPTION USING ERRCODE = 'P0B54', MESSAGE = 'b5 intentional abort';
  EXCEPTION WHEN SQLSTATE 'P0B54' THEN
    NULL;
  END;
  RETURN v_inside;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- A: field matrix (module A, indicators 1..3). B: move/insert target and
-- cross-template link to indicator 3. C: service_role DML.
-- D: deleted template (module D, indicator 4). E: survivor whose expectation
-- references D's indicator 4.
-- ---------------------------------------------------------------------------
INSERT INTO public.assessment_templates (id, name, area, version, status)
SELECT pg_temp.t(l), 'B5 F4 synthetic ' || l, 'personalizacion', '1.0', 'draft'
FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E']) AS l;

INSERT INTO public.assessment_modules (id, template_id, name, display_order, weight)
VALUES
  (pg_temp.m('A'), pg_temp.t('A'), 'B5 F4 module A', 1, 0.5),
  (pg_temp.m('D'), pg_temp.t('D'), 'B5 F4 module D', 1, 0.5);

INSERT INTO public.assessment_indicators (id, module_id, name, category, display_order, weight)
VALUES
  (pg_temp.i(1), pg_temp.m('A'), 'B5 F4 indicator 1', 'cobertura', 1, 0.5),
  (pg_temp.i(2), pg_temp.m('A'), 'B5 F4 indicator 2', 'cobertura', 2, 0.5),
  (pg_temp.i(3), pg_temp.m('A'), 'B5 F4 indicator 3', 'cobertura', 3, 0.5),
  (pg_temp.i(4), pg_temp.m('D'), 'B5 F4 indicator 4', 'cobertura', 1, 0.5);

INSERT INTO public.assessment_year_expectations
  (id, template_id, indicator_id, generation_type,
   year_1_expected, year_1_expected_unit, year_2_expected, year_2_expected_unit,
   year_3_expected, year_3_expected_unit, year_4_expected, year_4_expected_unit,
   year_5_expected, year_5_expected_unit, tolerance)
VALUES
  (pg_temp.x(1), pg_temp.t('A'), pg_temp.i(1), 'GT', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  (pg_temp.x(3), pg_temp.t('A'), pg_temp.i(3), 'GT', 1, 'nivel', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1),
  (pg_temp.x(6), pg_temp.t('B'), pg_temp.i(3), 'GI', 2, 'nivel', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1),
  (pg_temp.x(4), pg_temp.t('D'), pg_temp.i(4), 'GT', 1, 'nivel', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1),
  (pg_temp.x(5), pg_temp.t('E'), pg_temp.i(4), 'GI', 1, 'nivel', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1);

-- ---------------------------------------------------------------------------
-- C1. Function security, ACLs and trigger attachment
-- ---------------------------------------------------------------------------
SELECT v.tap
FROM (VALUES
  ('public.guard_assessment_year_expectation_source_revision()'::regprocedure,
   'public.assessment_year_expectations'::regclass, 'assessment_year_expectations_source_revision_guard')
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
  (is((SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgfoid = p.oid),
      1::BIGINT, format('%s attached to exactly one trigger', f.fn))),
  (ok((SELECT t.tgrelid = f.tbl::OID FROM pg_catalog.pg_trigger t WHERE t.tgfoid = p.oid),
      format('%s trigger is on %s', f.fn, f.tbl))),
  (is((SELECT format('%s|%s|%s', t.tgname, t.tgtype, t.tgenabled)
       FROM pg_catalog.pg_trigger t
       WHERE t.tgfoid = p.oid),
      format('%s|29|O', f.trg),
      format('%s attached as enabled AFTER INSERT/UPDATE/DELETE row trigger', f.fn)))
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

INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, generation_type, year_2_expected)
VALUES ('b5400000-0000-4000-8005-000000000007', 'b5400000-0000-4000-8000-000000000003',
        'b5400000-0000-4000-8002-000000000001', 'GT', 1);
UPDATE public.assessment_year_expectations SET year_2_expected = 3
WHERE id = 'b5400000-0000-4000-8005-000000000007';
UPDATE public.assessment_year_expectations SET updated_at = updated_at + interval '1 day'
WHERE id = 'b5400000-0000-4000-8005-000000000007';
INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, generation_type)
VALUES ('b5400000-0000-4000-8005-000000000008', 'b5400000-0000-4000-8000-000000000003',
        'b5400000-0000-4000-8002-000000000002', 'GI');
DELETE FROM public.assessment_year_expectations WHERE id = 'b5400000-0000-4000-8005-000000000008';

DO $$
BEGIN
  PERFORM set_config('b5.svc_user', current_user, true);
  BEGIN
    PERFORM public.guard_assessment_year_expectation_source_revision();
    PERFORM set_config('b5.year_expectation_call', 'no error', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('b5.year_expectation_call', SQLSTATE, true);
  END;
END;
$$;

RESET ROLE;

SELECT is(current_setting('b5.svc_user', true), 'service_role', 'service_role section ran as service_role');
SELECT is(current_setting('b5.year_expectation_call', true), '42501',
          'service_role direct year expectation guard call denied 42501');
SELECT is(pg_temp.deltas('svc'), 'C=4',
          'service_role insert, update, insert, delete bump C through definer guard; timestamps-only update does not');
SELECT is((SELECT count(*) FROM public.assessment_year_expectations WHERE id = pg_temp.x(7) AND year_2_expected = 3),
          1::BIGINT, 'service_role year expectation insert and update persisted');
SELECT is((SELECT count(*) FROM public.assessment_year_expectations WHERE id = pg_temp.x(8)),
          0::BIGINT, 'service_role year expectation delete persisted');

-- ---------------------------------------------------------------------------
-- C2. Each nullable serialized field independently NULL -> valid -> NULL
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE b5_fields (n INT PRIMARY KEY, col TEXT NOT NULL, val TEXT NOT NULL);
INSERT INTO pg_temp.b5_fields (n, col, val) VALUES
  (1, 'year_1_expected', '0'), (2, 'year_1_expected_unit', 'unit_1'),
  (3, 'year_2_expected', '1'), (4, 'year_2_expected_unit', 'unit_2'),
  (5, 'year_3_expected', '2'), (6, 'year_3_expected_unit', 'unit_3'),
  (7, 'year_4_expected', '3'), (8, 'year_4_expected_unit', 'unit_4'),
  (9, 'year_5_expected', '4'), (10, 'year_5_expected_unit', 'unit_5'),
  (11, 'tolerance', '2');

SELECT is((SELECT num_nulls(year_1_expected, year_1_expected_unit, year_2_expected, year_2_expected_unit,
                            year_3_expected, year_3_expected_unit, year_4_expected, year_4_expected_unit,
                            year_5_expected, year_5_expected_unit, tolerance)
           FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)),
          11, 'matrix row starts with all 11 nullable serialized fields NULL');

SELECT pg_temp.mark('fields');
SELECT is(pg_temp.step(format('UPDATE public.assessment_year_expectations SET %I = %L WHERE id = pg_temp.x(1)', f.col, f.val)),
          'A=1', format('%s NULL to %s bumps A once', f.col, f.val))
FROM pg_temp.b5_fields f
ORDER BY f.n;

SELECT is((SELECT format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
                         year_1_expected, year_1_expected_unit, year_2_expected, year_2_expected_unit,
                         year_3_expected, year_3_expected_unit, year_4_expected, year_4_expected_unit,
                         year_5_expected, year_5_expected_unit, tolerance)
           FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)),
          '0|unit_1|1|unit_2|2|unit_3|3|unit_4|4|unit_5|2', 'all 11 valid values persisted');

SELECT is(pg_temp.step(format('UPDATE public.assessment_year_expectations SET %I = NULL WHERE id = pg_temp.x(1)', f.col)),
          'A=1', format('%s %s to NULL bumps A once', f.col, f.val))
FROM pg_temp.b5_fields f
ORDER BY f.n;

SELECT is((SELECT num_nulls(year_1_expected, year_1_expected_unit, year_2_expected, year_2_expected_unit,
                            year_3_expected, year_3_expected_unit, year_4_expected, year_4_expected_unit,
                            year_5_expected, year_5_expected_unit, tolerance)
           FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)),
          11, 'all 11 fields restored to NULL');
SELECT is(pg_temp.deltas('fields'), 'A=22', 'field matrix advanced only A, by 22');

-- ---------------------------------------------------------------------------
-- C2. No-op, grouping, same-parent dedup, moves, insert/delete (rows=1 each)
-- ---------------------------------------------------------------------------
SELECT pg_temp.mark('matrix');
SELECT is(pg_temp.step(s.q), s.want, s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_year_expectations SET id = pg_temp.x(11) WHERE id = pg_temp.x(1)$$, 'none',
      'id-only change (not serialized) does not bump'),
  (2, $$UPDATE public.assessment_year_expectations SET id = pg_temp.x(1) WHERE id = pg_temp.x(11)$$, 'none',
      'id-only restore does not bump'),
  (3, $$UPDATE public.assessment_year_expectations SET created_at = created_at - interval '1 day',
        updated_at = updated_at + interval '1 day' WHERE id = pg_temp.x(1)$$, 'none',
      'timestamps-only update does not bump'),
  (4, $$UPDATE public.assessment_year_expectations SET template_id = template_id, indicator_id = indicator_id,
        generation_type = generation_type, year_1_expected = year_1_expected, year_1_expected_unit = year_1_expected_unit,
        year_2_expected = year_2_expected, year_2_expected_unit = year_2_expected_unit,
        year_3_expected = year_3_expected, year_3_expected_unit = year_3_expected_unit,
        year_4_expected = year_4_expected, year_4_expected_unit = year_4_expected_unit,
        year_5_expected = year_5_expected, year_5_expected_unit = year_5_expected_unit,
        tolerance = tolerance WHERE id = pg_temp.x(1)$$, 'none',
      'same-value update of all serialized fields (NULLs included) does not bump'),
  (5, $$UPDATE public.assessment_year_expectations SET year_1_expected = 1, year_3_expected_unit = 'nivel',
        tolerance = 1 WHERE id = pg_temp.x(1)$$, 'A=1',
      'same-parent multifield update bumps A once'),
  (6, $$UPDATE public.assessment_year_expectations SET indicator_id = pg_temp.i(2) WHERE id = pg_temp.x(1)$$, 'A=1',
      'grouping indicator_id change bumps A once'),
  (7, $$UPDATE public.assessment_year_expectations SET indicator_id = pg_temp.i(1) WHERE id = pg_temp.x(1)$$, 'A=1',
      'grouping indicator_id restore bumps A once'),
  (8, $$UPDATE public.assessment_year_expectations SET generation_type = 'GI' WHERE id = pg_temp.x(1)$$, 'A=1',
      'grouping generation_type GT to GI bumps A once'),
  (9, $$UPDATE public.assessment_year_expectations SET generation_type = 'GT' WHERE id = pg_temp.x(1)$$, 'A=1',
      'grouping generation_type GI to GT bumps A once'),
  (10, $$UPDATE public.assessment_year_expectations SET template_id = pg_temp.t('B') WHERE id = pg_temp.x(1)$$, 'A=1,B=1',
       'template move A to B bumps both parents once, C/D/E unchanged'),
  (11, $$UPDATE public.assessment_year_expectations SET template_id = pg_temp.t('A') WHERE id = pg_temp.x(1)$$, 'A=1,B=1',
       'template move B to A bumps both parents once, C/D/E unchanged'),
  (12, $$INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, generation_type, year_4_expected)
         VALUES (pg_temp.x(9), pg_temp.t('B'), pg_temp.i(2), 'GT', 5)$$, 'B=1',
       'insert bumps its direct template B once'),
  (13, $$DELETE FROM public.assessment_year_expectations WHERE id = pg_temp.x(9)$$, 'B=1',
       'delete bumps its direct template B once')
) AS s(n, q, want, label)
ORDER BY s.n;

SELECT is(pg_temp.deltas('matrix'), 'A=7,B=4', 'matrix cumulative deltas match the individual steps');
SELECT is((SELECT format('%s|%s|%s|%s|%s|%s|%s', template_id, indicator_id, generation_type,
                         year_1_expected, year_3_expected_unit, tolerance,
                         num_nulls(year_1_expected_unit, year_2_expected, year_2_expected_unit, year_3_expected,
                                   year_4_expected, year_4_expected_unit, year_5_expected, year_5_expected_unit))
           FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)),
          format('%s|%s|GT|1|nivel|1|8', pg_temp.t('A'), pg_temp.i(1)),
          'matrix row persisted final serialized values');
SELECT is((SELECT count(*) FROM public.assessment_year_expectations WHERE id IN (pg_temp.x(9), pg_temp.x(11))),
          0::BIGINT, 'deleted row and temporary id are absent');

SELECT pg_temp.mark('aba');
SELECT is(pg_temp.step(s.q), 'A=1', s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_year_expectations SET tolerance = 0 WHERE id = pg_temp.x(1)$$, 'tolerance 1 to 0 bumps'),
  (2, $$UPDATE public.assessment_year_expectations SET tolerance = 1 WHERE id = pg_temp.x(1)$$, 'tolerance 0 to 1 bumps')
) AS s(n, q, label)
ORDER BY s.n;
SELECT is(pg_temp.deltas('aba'), 'A=2', 'tolerance A-B-A advances A by 2 despite restored value');
SELECT is((SELECT tolerance FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)), 1,
          'tolerance restored to original');

-- ---------------------------------------------------------------------------
-- C3. Indicator deletion cascades linked expectations and bumps direct parents
-- Indicator 3 belongs to A's module; x3 is on A, x6 is directly on B.
-- ---------------------------------------------------------------------------
SELECT is((SELECT string_agg(format('%s:%s', e.id, e.template_id), ',' ORDER BY e.id)
           FROM public.assessment_year_expectations e WHERE e.indicator_id = pg_temp.i(3)),
          format('%s:%s,%s:%s', pg_temp.x(3), pg_temp.t('A'), pg_temp.x(6), pg_temp.t('B')),
          'indicator 3 has linked expectations on A and B');
SELECT pg_temp.mark('idel');
SELECT lives_ok($$DELETE FROM public.assessment_indicators WHERE id = pg_temp.i(3)$$,
                'deleting indicator 3 with linked expectations succeeds');
SELECT is((SELECT count(*) FROM public.assessment_indicators WHERE id = pg_temp.i(3))
          + (SELECT count(*) FROM public.assessment_year_expectations WHERE id IN (pg_temp.x(3), pg_temp.x(6))),
          0::BIGINT, 'indicator 3 and its cascaded expectations are gone');
SELECT ok(pg_temp.delta('idel', 'A') >= 1, 'cascaded expectation delete bumps its direct template A');
SELECT ok(pg_temp.delta('idel', 'B') >= 1,
          'cascaded expectation delete bumps its direct template B (not the indicator ancestor)');
SELECT is(pg_temp.deltas('idel', ARRAY['A', 'B']), 'none', 'indicator deletion leaves C/D/E unchanged');

-- ---------------------------------------------------------------------------
-- C3. Template deletion: own rows and counter removed; survivor E bumped
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*) FROM public.assessment_year_expectations WHERE id IN (pg_temp.x(4), pg_temp.x(5))),
          2::BIGINT, 'template D own expectation and cross-template E expectation present');
SELECT ok(EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('D')),
          'template D has a counter before deletion');
SELECT pg_temp.mark('tdel');
SELECT lives_ok($$DELETE FROM public.assessment_templates WHERE id = pg_temp.t('D')$$,
                'deleting template D with module, indicator and expectation children succeeds');
SELECT is((SELECT count(*) FROM public.assessment_templates WHERE id = pg_temp.t('D'))
          + (SELECT count(*) FROM public.assessment_modules WHERE id = pg_temp.m('D'))
          + (SELECT count(*) FROM public.assessment_indicators WHERE id = pg_temp.i(4))
          + (SELECT count(*) FROM public.assessment_year_expectations WHERE id IN (pg_temp.x(4), pg_temp.x(5))),
          0::BIGINT, 'template D, its module, indicator and both linked expectations are gone');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('D')),
          'template deletion removes D counter and leaves no orphan');
SELECT ok(EXISTS (SELECT 1 FROM public.assessment_templates WHERE id = pg_temp.t('E'))
          AND pg_temp.delta('tdel', 'E') >= 1,
          'surviving template E is bumped when its expectation cascades from deleted ancestor D');
SELECT is(pg_temp.deltas('tdel', ARRAY['D', 'E']), 'none', 'template deletion leaves A/B/C unchanged');

-- ---------------------------------------------------------------------------
-- C4. Aborted subtransaction move restores source and both counters
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.aborted($$UPDATE public.assessment_year_expectations SET template_id = pg_temp.t('B') WHERE id = pg_temp.x(1)$$),
          'A=1,B=1', 'year expectation move A to B bumps both inside subtransaction');
SELECT is(pg_temp.deltas('abort'), 'none', 'aborted move restores both counters');
SELECT is((SELECT template_id FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)), pg_temp.t('A'),
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

SELECT throws_ok($$UPDATE public.assessment_year_expectations SET template_id = pg_temp.t('B') WHERE id = pg_temp.x(1)$$,
                 '22003', NULL, 'year expectation move into max-revision parent B fails 22003');
SELECT is((SELECT template_id FROM public.assessment_year_expectations WHERE id = pg_temp.x(1)), pg_temp.t('A'),
          'failed move restores source template_id');
SELECT is(pg_temp.deltas('ovf'), 'none', 'failed move rolls back earlier A increment and leaves B at max');

SELECT * FROM finish();
ROLLBACK;
