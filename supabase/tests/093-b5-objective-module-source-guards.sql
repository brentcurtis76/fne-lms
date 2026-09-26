-- PROC-B5 F2: objective/module source revision guards.
-- Synthetic fixtures only (ids prefixed b5200000); everything rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

-- Helpers: synthetic ids, counter reads and tagged revision baselines.
-- Templates A..F map to b5200000-0000-4000-8000-00000000000{1..6}.
CREATE TEMP TABLE b5_base (
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY (tag, label)
);

CREATE FUNCTION pg_temp.t(p TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5200000-0000-4000-8000-' || lpad((ascii(p) - 64)::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.o(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5200000-0000-4000-8001-' || lpad(n::TEXT, 12, '0'))::UUID
$$;
CREATE FUNCTION pg_temp.m(n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b5200000-0000-4000-8002-' || lpad(n::TEXT, 12, '0'))::UUID
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
  FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F']) AS l;
END;
$$;

CREATE FUNCTION pg_temp.d(p_tag TEXT, p_label TEXT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT pg_temp.rev(pg_temp.t(p_label)) - b.revision
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
    RAISE EXCEPTION USING ERRCODE = 'P0B52', MESSAGE = 'b5 intentional abort';
  EXCEPTION WHEN SQLSTATE 'P0B52' THEN
    NULL;
  END;
  RETURN v_inside;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- A: field matrix. B: move/insert target. C: service_role DML.
-- D: objective cascade. E: cross-template module parent. F: template deletion.
-- ---------------------------------------------------------------------------
INSERT INTO public.assessment_templates (id, name, area, version, status)
SELECT pg_temp.t(l), 'B5 F2 synthetic ' || l, 'personalizacion', '1.0', 'draft'
FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F']) AS l;

INSERT INTO public.assessment_objectives
  (id, template_id, name, description, display_order, weight, created_at, updated_at)
VALUES
  (pg_temp.o(1), pg_temp.t('A'), 'o1', 'd1', 1, 1, now(), now()),
  (pg_temp.o(2), pg_temp.t('A'), 'o2', NULL, 20, 1, now(), now()),
  (pg_temp.o(3), pg_temp.t('B'), 'o3', NULL, 1, 1, now(), now()),
  (pg_temp.o(4), pg_temp.t('D'), 'o4', NULL, 1, 1, now(), now()),
  (pg_temp.o(5), pg_temp.t('F'), 'o5', NULL, 1, 1, now(), now());

INSERT INTO public.assessment_modules
  (id, template_id, objective_id, name, description, instructions, display_order, weight, created_at, updated_at)
VALUES
  (pg_temp.m(1), pg_temp.t('A'), pg_temp.o(1), 'm1', 'md1', 'mi1', 1, 1, now(), now()),
  (pg_temp.m(2), pg_temp.t('A'), NULL, 'm2', NULL, NULL, 20, 1, now(), now()),
  (pg_temp.m(3), pg_temp.t('D'), pg_temp.o(4), 'm3', NULL, NULL, 1, 1, now(), now()),
  (pg_temp.m(4), pg_temp.t('E'), pg_temp.o(4), 'm4', NULL, NULL, 1, 1, now(), now()),
  (pg_temp.m(5), pg_temp.t('F'), pg_temp.o(5), 'm5', NULL, NULL, 1, 1, now(), now()),
  (pg_temp.m(6), pg_temp.t('E'), pg_temp.o(5), 'm6', NULL, NULL, 2, 1, now(), now());

-- 1. Function security, ACLs and trigger attachment
SELECT v.tap
FROM (VALUES
  ('public.guard_assessment_objective_source_revision()'::regprocedure,
   'public.assessment_objectives'::regclass, 'assessment_objectives_source_revision_guard'),
  ('public.guard_assessment_module_source_revision()'::regprocedure,
   'public.assessment_modules'::regclass, 'assessment_modules_source_revision_guard')
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

-- 1b. Real service_role: direct guard invocation denied, DML bumps via definer
SELECT pg_temp.mark('svc');

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

INSERT INTO public.assessment_objectives
  (id, template_id, name, description, display_order, weight, created_at, updated_at)
VALUES ('b5200000-0000-4000-8001-000000000007', 'b5200000-0000-4000-8000-000000000003',
        'svc objective', NULL, 1, 1, now(), now());
INSERT INTO public.assessment_modules
  (id, template_id, objective_id, name, description, instructions, display_order, weight, created_at, updated_at)
VALUES ('b5200000-0000-4000-8002-000000000008', 'b5200000-0000-4000-8000-000000000003',
        'b5200000-0000-4000-8001-000000000007', 'svc module', NULL, NULL, 1, 1, now(), now());
UPDATE public.assessment_modules SET name = 'svc module renamed'
WHERE id = 'b5200000-0000-4000-8002-000000000008';
DELETE FROM public.assessment_modules WHERE id = 'b5200000-0000-4000-8002-000000000008';
UPDATE public.assessment_objectives SET display_order = 2
WHERE id = 'b5200000-0000-4000-8001-000000000007';

DO $$
BEGIN
  PERFORM set_config('b5.svc_user', current_user, true);
  BEGIN
    PERFORM public.guard_assessment_objective_source_revision();
    PERFORM set_config('b5.objective_call', 'no error', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('b5.objective_call', SQLSTATE, true);
  END;
  BEGIN
    PERFORM public.guard_assessment_module_source_revision();
    PERFORM set_config('b5.module_call', 'no error', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('b5.module_call', SQLSTATE, true);
  END;
END;
$$;

RESET ROLE;

SELECT is(current_setting('b5.svc_user', true), 'service_role', 'service_role section ran as service_role');
SELECT is(current_setting('b5.objective_call', true), '42501', 'service_role direct objective guard call denied 42501');
SELECT is(current_setting('b5.module_call', true), '42501', 'service_role direct module guard call denied 42501');
SELECT is(pg_temp.deltas('svc'), 'C=5', 'service_role objective/module insert, update, delete bump C through definer guards');
SELECT is((SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(7) AND display_order = 2),
          1::BIGINT, 'service_role objective insert and update persisted');
SELECT is((SELECT count(*) FROM public.assessment_modules WHERE id = pg_temp.m(8)),
          0::BIGINT, 'service_role module delete persisted');

SELECT pg_temp.mark('denied');
SET LOCAL ROLE anon;
SELECT is_empty($$UPDATE public.assessment_objectives SET name = 'denied' WHERE id = pg_temp.o(1) RETURNING id$$,
                'anon objective update reaches no source row');
SELECT throws_ok($$INSERT INTO public.assessment_modules (id, template_id, name, display_order)
                   VALUES (pg_temp.m(99), pg_temp.t('A'), 'denied', 99)$$,
                 '42501', NULL, 'anon module insert is denied');
RESET ROLE;
SELECT is(pg_temp.deltas('denied'), 'none', 'denied actor leaves every source revision unchanged');

-- 2/3. Objective field matrix, moves, insert/delete
SELECT is(pg_temp.step(s.q), s.want, s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_objectives SET name = 'o1b' WHERE id = pg_temp.o(1)$$, 'A=1', 'objective name change bumps A'),
  (2, $$UPDATE public.assessment_objectives SET description = NULL WHERE id = pg_temp.o(1)$$, 'A=1', 'objective description value to NULL bumps A'),
  (3, $$UPDATE public.assessment_objectives SET description = NULL WHERE id = pg_temp.o(1)$$, 'none', 'objective description NULL to NULL does not bump'),
  (4, $$UPDATE public.assessment_objectives SET description = 'd1b' WHERE id = pg_temp.o(1)$$, 'A=1', 'objective description NULL to value bumps A'),
  (5, $$UPDATE public.assessment_objectives SET display_order = 3 WHERE id = pg_temp.o(1)$$, 'A=1', 'objective display_order change bumps A'),
  (6, $$UPDATE public.assessment_objectives SET weight = 2.5 WHERE id = pg_temp.o(1)$$, 'A=1', 'objective weight change bumps A'),
  (7, $$UPDATE public.assessment_objectives SET id = id, template_id = template_id, name = name,
        description = description, display_order = display_order, weight = weight
      WHERE id = pg_temp.o(1)$$, 'none', 'objective same-value update does not bump'),
  (8, $$UPDATE public.assessment_objectives SET created_at = created_at - interval '1 day',
        updated_at = updated_at + interval '1 day' WHERE id = pg_temp.o(1)$$, 'none', 'objective timestamps-only update does not bump'),
  (9, $$UPDATE public.assessment_objectives SET name = 'o1c', description = 'd1c', display_order = 4, weight = 3
      WHERE id = pg_temp.o(1)$$, 'A=1', 'objective multicolumn update bumps A once'),
  (10, $$UPDATE public.assessment_objectives SET id = pg_temp.o(12) WHERE id = pg_temp.o(2)$$, 'A=1', 'objective id change bumps A'),
  (11, $$UPDATE public.assessment_objectives SET id = pg_temp.o(2) WHERE id = pg_temp.o(12)$$, 'A=1', 'objective id restore bumps A'),
  (12, $$UPDATE public.assessment_objectives SET template_id = pg_temp.t('B') WHERE id = pg_temp.o(2)$$, 'A=1,B=1', 'objective template move A to B bumps both'),
  (13, $$UPDATE public.assessment_objectives SET template_id = pg_temp.t('A') WHERE id = pg_temp.o(2)$$, 'A=1,B=1', 'objective template move B to A bumps both'),
  (14, $$INSERT INTO public.assessment_objectives (id, template_id, name, description, display_order, weight, created_at, updated_at)
        VALUES (pg_temp.o(6), pg_temp.t('B'), 'o6', NULL, 30, 1, now(), now())$$, 'B=1', 'objective insert bumps its template B'),
  (15, $$DELETE FROM public.assessment_objectives WHERE id = pg_temp.o(6)$$, 'B=1', 'objective delete bumps its template B')
) AS s(n, q, want, label)
ORDER BY s.n;

SELECT pg_temp.mark('cum');
SELECT is(pg_temp.step(s.q), 'A=1', s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_objectives SET name = 'o1x' WHERE id = pg_temp.o(1)$$, 'objective name A to B #1 bumps'),
  (2, $$UPDATE public.assessment_objectives SET name = 'o1c' WHERE id = pg_temp.o(1)$$, 'objective name B to A #1 bumps'),
  (3, $$UPDATE public.assessment_objectives SET name = 'o1x' WHERE id = pg_temp.o(1)$$, 'objective name A to B #2 bumps'),
  (4, $$UPDATE public.assessment_objectives SET name = 'o1c' WHERE id = pg_temp.o(1)$$, 'objective name B to A #2 bumps')
) AS s(n, q, label)
ORDER BY s.n;
SELECT is(pg_temp.deltas('cum'), 'A=4', 'objective A-B-A twice advances A by 4 despite restored value');
SELECT is((SELECT name FROM public.assessment_objectives WHERE id = pg_temp.o(1)), 'o1c', 'objective name restored to original');
SELECT is((SELECT template_id FROM public.assessment_objectives WHERE id = pg_temp.o(2)), pg_temp.t('A'),
          'objective owner restored after both moves');

-- 2/3. Module field matrix, objective reassignment, moves, insert/delete
SELECT is(pg_temp.step(s.q), s.want, s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_modules SET name = 'm1b' WHERE id = pg_temp.m(1)$$, 'A=1', 'module name change bumps A'),
  (2, $$UPDATE public.assessment_modules SET description = NULL WHERE id = pg_temp.m(1)$$, 'A=1', 'module description value to NULL bumps A'),
  (3, $$UPDATE public.assessment_modules SET description = NULL WHERE id = pg_temp.m(1)$$, 'none', 'module description NULL to NULL does not bump'),
  (4, $$UPDATE public.assessment_modules SET description = 'md1b' WHERE id = pg_temp.m(1)$$, 'A=1', 'module description NULL to value bumps A'),
  (5, $$UPDATE public.assessment_modules SET instructions = NULL WHERE id = pg_temp.m(1)$$, 'A=1', 'module instructions value to NULL bumps A'),
  (6, $$UPDATE public.assessment_modules SET instructions = NULL WHERE id = pg_temp.m(1)$$, 'none', 'module instructions NULL to NULL does not bump'),
  (7, $$UPDATE public.assessment_modules SET instructions = 'mi1b' WHERE id = pg_temp.m(1)$$, 'A=1', 'module instructions NULL to value bumps A'),
  (8, $$UPDATE public.assessment_modules SET display_order = 3 WHERE id = pg_temp.m(1)$$, 'A=1', 'module display_order change bumps A'),
  (9, $$UPDATE public.assessment_modules SET weight = NULL WHERE id = pg_temp.m(1)$$, 'A=1', 'module weight value to NULL bumps A'),
  (10, $$UPDATE public.assessment_modules SET weight = NULL WHERE id = pg_temp.m(1)$$, 'none', 'module weight NULL to NULL does not bump'),
  (11, $$UPDATE public.assessment_modules SET weight = 2.5 WHERE id = pg_temp.m(1)$$, 'A=1', 'module weight NULL to value bumps A'),
  (12, $$UPDATE public.assessment_modules SET objective_id = pg_temp.o(3) WHERE id = pg_temp.m(1)$$, 'A=1',
       'module objective_id-only reassignment to a template B objective bumps only module parent A'),
  (13, $$UPDATE public.assessment_modules SET objective_id = NULL WHERE id = pg_temp.m(1)$$, 'A=1', 'module objective_id value to NULL bumps A'),
  (14, $$UPDATE public.assessment_modules SET objective_id = NULL WHERE id = pg_temp.m(1)$$, 'none', 'module objective_id NULL to NULL does not bump'),
  (15, $$UPDATE public.assessment_modules SET objective_id = pg_temp.o(1) WHERE id = pg_temp.m(1)$$, 'A=1', 'module objective_id NULL to value bumps A'),
  (16, $$UPDATE public.assessment_modules SET id = id, template_id = template_id, objective_id = objective_id, name = name,
         description = description, instructions = instructions, display_order = display_order, weight = weight
       WHERE id = pg_temp.m(1)$$, 'none', 'module same-value update does not bump'),
  (17, $$UPDATE public.assessment_modules SET created_at = created_at - interval '1 day',
         updated_at = updated_at + interval '1 day' WHERE id = pg_temp.m(1)$$, 'none', 'module timestamps-only update does not bump'),
  (18, $$UPDATE public.assessment_modules SET objective_id = pg_temp.o(3), name = 'm1c', description = NULL,
         instructions = 'mi1c', display_order = 4, weight = 4
       WHERE id = pg_temp.m(1)$$, 'A=1', 'module multicolumn update bumps A once'),
  (19, $$UPDATE public.assessment_modules SET id = pg_temp.m(12) WHERE id = pg_temp.m(2)$$, 'A=1', 'module id change bumps A'),
  (20, $$UPDATE public.assessment_modules SET id = pg_temp.m(2) WHERE id = pg_temp.m(12)$$, 'A=1', 'module id restore bumps A'),
  (21, $$UPDATE public.assessment_modules SET template_id = pg_temp.t('B') WHERE id = pg_temp.m(2)$$, 'A=1,B=1', 'module template move A to B bumps both'),
  (22, $$UPDATE public.assessment_modules SET template_id = pg_temp.t('A') WHERE id = pg_temp.m(2)$$, 'A=1,B=1', 'module template move B to A bumps both'),
  (23, $$INSERT INTO public.assessment_modules (id, template_id, objective_id, name, description, instructions, display_order, weight, created_at, updated_at)
         VALUES (pg_temp.m(7), pg_temp.t('B'), pg_temp.o(1), 'm7', NULL, NULL, 30, 1, now(), now())$$, 'B=1',
       'module insert bumps its direct template B, not objective parent A'),
  (24, $$DELETE FROM public.assessment_modules WHERE id = pg_temp.m(7)$$, 'B=1', 'module delete bumps its direct template B, not objective parent A')
) AS s(n, q, want, label)
ORDER BY s.n;

SELECT pg_temp.mark('cum');
SELECT is(pg_temp.step(s.q), 'A=1', s.label)
FROM (VALUES
  (1, $$UPDATE public.assessment_modules SET name = 'm1x' WHERE id = pg_temp.m(1)$$, 'module name A to B #1 bumps'),
  (2, $$UPDATE public.assessment_modules SET name = 'm1c' WHERE id = pg_temp.m(1)$$, 'module name B to A #1 bumps'),
  (3, $$UPDATE public.assessment_modules SET name = 'm1x' WHERE id = pg_temp.m(1)$$, 'module name A to B #2 bumps'),
  (4, $$UPDATE public.assessment_modules SET name = 'm1c' WHERE id = pg_temp.m(1)$$, 'module name B to A #2 bumps')
) AS s(n, q, label)
ORDER BY s.n;
SELECT is(pg_temp.deltas('cum'), 'A=4', 'module A-B-A twice advances A by 4 despite restored value');
SELECT is((SELECT name FROM public.assessment_modules WHERE id = pg_temp.m(1)), 'm1c', 'module name restored to original');
SELECT is((SELECT template_id FROM public.assessment_modules WHERE id = pg_temp.m(2)), pg_temp.t('A'),
          'module owner restored after both moves');

SELECT pg_temp.mark('invalid');
SELECT throws_ok($$INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
                   VALUES (pg_temp.o(99), pg_temp.t('Z'), 'invalid owner', 99)$$,
                 '23503', NULL, 'objective insert with missing owner fails');
SELECT throws_ok($$INSERT INTO public.assessment_modules (id, template_id, name, display_order)
                   VALUES (pg_temp.m(98), pg_temp.t('Z'), 'invalid owner', 98)$$,
                 '23503', NULL, 'module insert with missing owner fails');
SELECT throws_ok($$INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
                   VALUES (pg_temp.m(99), pg_temp.t('A'), pg_temp.o(99), 'invalid parent', 99)$$,
                 '23503', NULL, 'module insert with missing objective fails');
SELECT is(pg_temp.deltas('invalid'), 'none', 'invalid parent and owner attempts leave revisions unchanged');
SELECT is((SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(99))
          + (SELECT count(*) FROM public.assessment_modules WHERE id IN (pg_temp.m(98), pg_temp.m(99))),
          0::BIGINT, 'invalid parent and owner attempts leave no child rows');

-- ---------------------------------------------------------------------------
-- 4. Objective -> module cascade (module m4 lives in E, its objective in D)
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(4))
          + (SELECT count(*) FROM public.assessment_modules WHERE id IN (pg_temp.m(3), pg_temp.m(4))),
          3::BIGINT, 'cascade fixture objective and modules present');
SELECT pg_temp.mark('casc');
DELETE FROM public.assessment_objectives WHERE id = pg_temp.o(4);
SELECT is((SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(4))
          + (SELECT count(*) FROM public.assessment_modules WHERE id IN (pg_temp.m(3), pg_temp.m(4))),
          0::BIGINT, 'objective delete cascades its modules');
SELECT is(pg_temp.d('casc', 'D'), 2::BIGINT, 'objective and same-owner module cascade advance D twice');
SELECT is(pg_temp.d('casc', 'E'), 1::BIGINT, 'cross-owner module cascade advances E once');
SELECT is(pg_temp.deltas('casc', ARRAY['D', 'E']), 'none', 'objective cascade leaves other templates unchanged');

-- ---------------------------------------------------------------------------
-- 4. Template deletion with children (module m6 lives in E, its objective in F)
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(5))
          + (SELECT count(*) FROM public.assessment_modules WHERE id IN (pg_temp.m(5), pg_temp.m(6))),
          3::BIGINT, 'template F fixture children present');
SELECT ok(EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('F')),
          'template F has a counter before deletion');
SELECT pg_temp.mark('tdel');
SELECT lives_ok($$DELETE FROM public.assessment_templates WHERE id = pg_temp.t('F')$$,
                'deleting template F with objective and module children succeeds');
SELECT is((SELECT count(*) FROM public.assessment_templates WHERE id = pg_temp.t('F'))
          + (SELECT count(*) FROM public.assessment_objectives WHERE id = pg_temp.o(5))
          + (SELECT count(*) FROM public.assessment_modules WHERE id IN (pg_temp.m(5), pg_temp.m(6))),
          0::BIGINT, 'template F and its cascaded children are gone');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.assessment_template_source_revisions WHERE template_id = pg_temp.t('F')),
          'template deletion leaves no orphan counter for F');
SELECT is(pg_temp.d('tdel', 'E'), 1::BIGINT, 'surviving template E advances once for cross-template module');
SELECT is(pg_temp.deltas('tdel', ARRAY['E', 'F']), 'none', 'template deletion leaves other templates unchanged');

-- ---------------------------------------------------------------------------
-- 5. Aborted subtransaction moves restore source and both counters
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.aborted($$UPDATE public.assessment_objectives SET template_id = pg_temp.t('B') WHERE id = pg_temp.o(2)$$),
          'A=1,B=1', 'objective move A to B bumps both inside subtransaction');
SELECT is(pg_temp.deltas('abort'), 'none', 'aborted objective move restores both counters');
SELECT is((SELECT template_id FROM public.assessment_objectives WHERE id = pg_temp.o(2)), pg_temp.t('A'),
          'aborted objective move restores source template_id');

SELECT is(pg_temp.aborted($$UPDATE public.assessment_modules SET template_id = pg_temp.t('B') WHERE id = pg_temp.m(2)$$),
          'A=1,B=1', 'module move A to B bumps both inside subtransaction');
SELECT is(pg_temp.deltas('abort'), 'none', 'aborted module move restores both counters');
SELECT is((SELECT template_id FROM public.assessment_modules WHERE id = pg_temp.m(2)), pg_temp.t('A'),
          'aborted module move restores source template_id');

-- ---------------------------------------------------------------------------
-- 5. Overflow on the higher-ordered parent fails and restores everything
-- ---------------------------------------------------------------------------
INSERT INTO public.assessment_template_source_revisions (template_id, revision)
VALUES (pg_temp.t('B'), 9223372036854775807::BIGINT)
ON CONFLICT (template_id) DO UPDATE SET revision = EXCLUDED.revision;

SELECT pg_temp.mark('ovf');
SELECT ok(pg_temp.t('A') < pg_temp.t('B') AND pg_temp.rev(pg_temp.t('B')) = 9223372036854775807::BIGINT,
          'B is the higher-ordered parent and sits at bigint max');

SELECT throws_ok($$UPDATE public.assessment_objectives SET template_id = pg_temp.t('B') WHERE id = pg_temp.o(2)$$,
                 '22003', NULL, 'objective move into max-revision parent B fails 22003');
SELECT is((SELECT template_id FROM public.assessment_objectives WHERE id = pg_temp.o(2)), pg_temp.t('A'),
          'failed objective move restores source template_id');
SELECT is(pg_temp.deltas('ovf'), 'none', 'failed objective move restores both counters');

SELECT throws_ok($$UPDATE public.assessment_modules SET template_id = pg_temp.t('B') WHERE id = pg_temp.m(2)$$,
                 '22003', NULL, 'module move into max-revision parent B fails 22003');
SELECT is((SELECT template_id FROM public.assessment_modules WHERE id = pg_temp.m(2)), pg_temp.t('A'),
          'failed module move restores source template_id');
SELECT is(pg_temp.deltas('ovf'), 'none', 'failed module move restores both counters');

SELECT * FROM finish();
ROLLBACK;
