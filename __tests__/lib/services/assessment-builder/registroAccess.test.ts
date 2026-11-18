// @vitest-environment node
/**
 * N1, part 1 — registroAccess: the gate reads with the caller's client, the
 * stored version and the expected levels with the service client, the active
 * indicator ids are the same as the inline code of the form and send routes
 * computed, and stripExpectations leaves no expected level in the content.
 * Synthetic ids and data only.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  assertInstanceAssignee,
  loadSnapshotForInstance,
  loadSnapshotsForInstances,
  loadActiveIndicatorIds,
  stripExpectations,
  EXPECTATION_KEYS,
} from '../../../../lib/services/assessment-builder/registroAccess';
import { publishTemplate } from '../../../../lib/services/assessment-builder/publishTemplate';

type Row = Record<string, any>;

/** Read-only in-memory client (same shape as publishTemplate.atomic.test.ts). */
function memoryClient(tables: Record<string, Row[]>, failTables: string[] = []) {
  const reads: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      reads.push(table);
      const st = { filters: [] as Array<(r: Row) => boolean>, single: false, maybe: false, columns: '*' };
      const chain: any = {
        select: (cols?: string) => ((st.columns = cols ?? '*'), chain),
        eq: (c: string, v: unknown) => (st.filters.push((r) => r[c] === v), chain),
        in: (c: string, v: unknown[]) => (st.filters.push((r) => v.includes(r[c])), chain),
        order: () => chain,
        limit: () => chain,
        single: () => ((st.single = true), chain),
        maybeSingle: () => ((st.maybe = true), chain),
        then: (resolve: (v: unknown) => void) => {
          if (failTables.includes(table)) return resolve({ data: null, error: { code: '42501', message: 'permission denied' } });
          let out = (tables[table] ?? []).filter((r) => st.filters.every((f) => f(r)));
          if (table === 'assessment_templates') out = out.map((t) => ({ ...t, grade: { id: t.grade_id, name: '5° Básico', is_always_gt: false } }));
          if (st.single) return resolve(out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } });
          if (st.maybe) return resolve({ data: out[0] ?? null, error: null });
          return resolve({ data: out, error: null });
        },
      };
      return chain;
    }),
  };
  return { client, reads };
}

const EXPECTATION_ROWS: Row[] = [
  { template_id: 'tpl-1', indicator_id: 'ind-1', generation_type: 'GT', year_1_expected: 1, year_1_expected_unit: null, year_2_expected: 2, year_2_expected_unit: null, year_3_expected: null, year_3_expected_unit: null, year_4_expected: 3, year_4_expected_unit: null, year_5_expected: 4, year_5_expected_unit: null, tolerance: 1 },
  { template_id: 'tpl-1', indicator_id: 'ind-2', generation_type: 'GT', year_1_expected: null, year_1_expected_unit: null, year_2_expected: 17, year_2_expected_unit: 'semana', year_3_expected: 19, year_3_expected_unit: 'semana', year_4_expected: null, year_4_expected_unit: null, year_5_expected: 23, year_5_expected_unit: 'mes', tolerance: 2 },
  { template_id: 'tpl-1', indicator_id: 'ind-3', generation_type: 'GT', year_1_expected: 3, year_1_expected_unit: null, year_2_expected: null, year_2_expected_unit: null, year_3_expected: 2, year_3_expected_unit: null, year_4_expected: null, year_4_expected_unit: null, year_5_expected: null, year_5_expected_unit: null, tolerance: 1 },
  { template_id: 'tpl-1', indicator_id: 'ind-1', generation_type: 'GI', year_1_expected: null, year_1_expected_unit: null, year_2_expected: 1, year_2_expected_unit: null, year_3_expected: 1, year_3_expected_unit: null, year_4_expected: 1, year_4_expected_unit: null, year_5_expected: 1, year_5_expected_unit: null, tolerance: 1 },
  { template_id: 'tpl-1', indicator_id: 'ind-2', generation_type: 'GI', year_1_expected: 5, year_1_expected_unit: 'semana', year_2_expected: null, year_2_expected_unit: null, year_3_expected: null, year_3_expected_unit: null, year_4_expected: null, year_4_expected_unit: null, year_5_expected: null, year_5_expected_unit: null, tolerance: 1 },
];

function publishSeed(): Record<string, Row[]> {
  return {
    ab_via_assignment_rules: [{ area: 'evaluacion', target: 'course_docente' }],
    assessment_templates: [{ id: 'tpl-1', name: 'Instrumento Sintético', area: 'evaluacion', grade_id: 9, version: '1.0.0', status: 'draft', is_archived: false, scoring_config: {} }],
    assessment_objectives: [{ id: 'obj-1', template_id: 'tpl-1', name: 'Proceso', display_order: 1, weight: 1 }],
    assessment_modules: [{ id: 'mod-1', template_id: 'tpl-1', objective_id: 'obj-1', name: 'Práctica', display_order: 1, weight: 1 }],
    assessment_indicators: [
      { id: 'ind-1', module_id: 'mod-1', code: 'C1', name: 'Cobertura sintética', category: 'cobertura', display_order: 1, weight: 1 },
      { id: 'ind-2', module_id: 'mod-1', code: 'F1', name: 'Frecuencia sintética', category: 'frecuencia', display_order: 2, weight: 1, frequency_config: { min: 0, max: 50, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] } },
      { id: 'ind-3', module_id: 'mod-1', code: 'P1', name: 'Profundidad sintética', category: 'profundidad', display_order: 3, weight: 1, level_0_descriptor: 'n0', level_1_descriptor: 'n1', level_2_descriptor: 'n2', level_3_descriptor: 'n3', level_4_descriptor: 'n4' },
    ],
    assessment_year_expectations: EXPECTATION_ROWS,
    assessment_entity_year_weights: [],
    assessment_template_snapshots: [],
    assessment_instances: [],
  };
}

/** The stored content exactly as publishTemplate builds it (captured from its one publication call). */
async function publishedSnapshotData(): Promise<any> {
  const caller = memoryClient(publishSeed());
  const svc = { rpc: vi.fn(async (_fn: string, _args: any) => ({ data: { ok: true, version: '1.0.0', template: { id: 'tpl-1', name: 'x', area: 'evaluacion', status: 'published', version: '1.0.0' }, snapshot: { id: 'snap-1', version: '1.0.0', created_at: '2026-11-18T00:00:00Z' } }, error: null })) };
  const result = await publishTemplate(caller.client as any, 'tpl-1', { id: 'admin-synthetic' }, { publishClient: svc as any });
  expect(result).toMatchObject({ ok: true });
  return (svc.rpc.mock.calls[0] as any[])[1].p_snapshot_data;
}

/** Every key and every primitive value anywhere in a JSON value. */
function collect(value: unknown, keys: string[] = [], values: unknown[] = []) {
  if (Array.isArray(value)) value.forEach((v) => collect(v, keys, values));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      collect(v, keys, values);
    }
  } else values.push(value);
  return { keys, values };
}

// The inline computation of pages/api/docente/assessments/[instanceId]/index.ts
// (before N1 part 1): a map indicator -> active, null when error or no rows.
function oldFormActiveMap(expData: Row[] | null, expError: unknown, year: number): Map<string, boolean> | null {
  const yearKey = `year_${year}_expected`;
  let activeExpectationsMap: Map<string, boolean> | null = null;
  if (!expError && expData && expData.length > 0) {
    activeExpectationsMap = new Map<string, boolean>();
    for (const row of expData) {
      const expectedValue = row[yearKey];
      activeExpectationsMap.set(row.indicator_id, expectedValue !== null && expectedValue !== undefined);
    }
  }
  return activeExpectationsMap;
}

// The inline computation of pages/api/docente/assessments/[instanceId]/submit.ts
// (before N1 part 1): a set of active ids, null when error or no rows.
function oldSubmitActiveSet(expData: Row[] | null, expError: unknown, year: number): Set<string> | null {
  const yearKey = `year_${year}_expected`;
  let activeIndicatorIds: Set<string> | null = null;
  if (!expError && expData && expData.length > 0) {
    activeIndicatorIds = new Set<string>();
    for (const r of expData) {
      const expectedValue = r[yearKey];
      if (expectedValue !== null && expectedValue !== undefined) activeIndicatorIds.add(r.indicator_id);
    }
  }
  return activeIndicatorIds;
}

describe('assertInstanceAssignee', () => {
  it('reads the assignee row with the caller client it is given and returns it', async () => {
    const caller = memoryClient({ assessment_instance_assignees: [{ id: 'as-1', instance_id: 'inst-1', user_id: 'doc-1', can_edit: true, can_submit: false }] });
    const row = await assertInstanceAssignee(caller.client as any, 'inst-1', 'doc-1');
    expect(row).toMatchObject({ id: 'as-1', can_edit: true, can_submit: false });
    expect(caller.reads).toEqual(['assessment_instance_assignees']);
  });

  it('returns null for a caller who is not an assignee, and when the read fails', async () => {
    const caller = memoryClient({ assessment_instance_assignees: [{ id: 'as-1', instance_id: 'inst-1', user_id: 'doc-1' }] });
    expect(await assertInstanceAssignee(caller.client as any, 'inst-1', 'doc-2')).toBeNull();
    expect(await assertInstanceAssignee(caller.client as any, 'inst-2', 'doc-1')).toBeNull();
    const failing = memoryClient({}, ['assessment_instance_assignees']);
    expect(await assertInstanceAssignee(failing.client as any, 'inst-1', 'doc-1')).toBeNull();
  });
});

describe('loadSnapshotForInstance / loadSnapshotsForInstances', () => {
  const snapshots = [
    { id: 'snap-1', template_id: 'tpl-1', version: '1.0.0', snapshot_data: { template: { name: 'A' } }, created_at: '2026-01-01' },
    { id: 'snap-2', template_id: 'tpl-2', version: '2.0.0', snapshot_data: { template: { name: 'B' } }, created_at: '2026-01-02' },
  ];

  it('reads the stored version of the instance with the service client', async () => {
    const svc = memoryClient({ assessment_template_snapshots: snapshots });
    const { snapshot, error } = await loadSnapshotForInstance(svc.client as any, { template_snapshot_id: 'snap-2' });
    expect(error).toBeNull();
    expect(snapshot).toMatchObject({ id: 'snap-2', template_id: 'tpl-2', version: '2.0.0' });
    expect(svc.reads).toEqual(['assessment_template_snapshots']);
  });

  it('no stored version named: null without a read; a failed read: the error', async () => {
    const svc = memoryClient({ assessment_template_snapshots: snapshots });
    expect(await loadSnapshotForInstance(svc.client as any, { template_snapshot_id: null })).toEqual({ snapshot: null, error: null });
    expect(svc.reads).toEqual([]);
    const failing = memoryClient({}, ['assessment_template_snapshots']);
    const r = await loadSnapshotForInstance(failing.client as any, { template_snapshot_id: 'snap-1' });
    expect(r.snapshot).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('the list loader reads every named stored version in one query', async () => {
    const svc = memoryClient({ assessment_template_snapshots: snapshots });
    const { snapshots: map, error } = await loadSnapshotsForInstances(svc.client as any, [
      { template_snapshot_id: 'snap-1' }, { template_snapshot_id: 'snap-2' }, { template_snapshot_id: 'snap-1' }, { template_snapshot_id: null },
    ]);
    expect(error).toBeNull();
    expect([...map.keys()].sort()).toEqual(['snap-1', 'snap-2']);
    expect(svc.reads).toEqual(['assessment_template_snapshots']);
  });
});

describe('loadActiveIndicatorIds', () => {
  for (const generationType of ['GT', 'GI']) {
    for (const year of [1, 2, 3, 4, 5]) {
      it(`${generationType} year ${year}: the same ids the old inline code of the form and the send computed`, async () => {
        const svc = memoryClient({ assessment_year_expectations: EXPECTATION_ROWS });
        const { ids, error } = await loadActiveIndicatorIds(svc.client as any, { templateId: 'tpl-1', transformationYear: year, generationType });
        expect(error).toBeNull();
        expect(svc.reads).toEqual(['assessment_year_expectations']);

        const rows = EXPECTATION_ROWS.filter((r) => r.template_id === 'tpl-1' && r.generation_type === generationType);
        const oldMap = oldFormActiveMap(rows, null, year)!;
        const oldSet = oldSubmitActiveSet(rows, null, year)!;
        expect([...ids!].sort()).toEqual([...oldSet].sort());
        expect([...ids!].sort()).toEqual([...oldMap.entries()].filter(([, v]) => v).map(([k]) => k).sort());
        for (const id of ['ind-1', 'ind-2', 'ind-3', 'ind-unknown']) {
          expect(ids!.has(id)).toBe(oldMap.get(id) ?? false);
        }
      });
    }
  }

  it('no rows: null (legacy), like the old code; no template or year: null without a read', async () => {
    const svc = memoryClient({ assessment_year_expectations: [] });
    expect(await loadActiveIndicatorIds(svc.client as any, { templateId: 'tpl-x', transformationYear: 2, generationType: 'GT' })).toEqual({ ids: null, error: null });
    expect(oldFormActiveMap([], null, 2)).toBeNull();
    expect(oldSubmitActiveSet([], null, 2)).toBeNull();
    const none = memoryClient({ assessment_year_expectations: EXPECTATION_ROWS });
    expect(await loadActiveIndicatorIds(none.client as any, { templateId: null, transformationYear: 2, generationType: 'GT' })).toEqual({ ids: null, error: null });
    expect(await loadActiveIndicatorIds(none.client as any, { templateId: 'tpl-1', transformationYear: null, generationType: 'GT' })).toEqual({ ids: null, error: null });
    expect(none.reads).toEqual([]);
  });

  it('a failed read: ids null AND the error is returned (the routes decide)', async () => {
    const failing = memoryClient({}, ['assessment_year_expectations']);
    const r = await loadActiveIndicatorIds(failing.client as any, { templateId: 'tpl-1', transformationYear: 2, generationType: 'GT' });
    expect(r.ids).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

describe('stripExpectations', () => {
  it('the content publishTemplate builds carries expected levels under expectations, expectations_gt and expectations_gi', async () => {
    const data = await publishedSnapshotData();
    const ind = data.objectives[0].modules[0].indicators.find((i: any) => i.id === 'ind-2');
    expect(ind.expectations_gt).toMatchObject({ year_2_expected: 17, year_3_expected: 19, tolerance: 2 });
    expect(ind.expectations_gi).toMatchObject({ year_1_expected: 5 });
    expect(ind.expectations).toMatchObject({ year_5_expected: 23 });
    expect(data.modules[0].indicators[1].expectations_gt).toMatchObject({ year_2_expected: 17 });
    expect([...EXPECTATION_KEYS].sort()).toEqual(['expectations', 'expectations_gi', 'expectations_gt']);
  });

  it('leaves no key or value of the expected levels anywhere, keeps everything else, and does not change its input', async () => {
    const data = await publishedSnapshotData();
    const before = JSON.stringify(data);
    const stripped = stripExpectations(data);
    expect(JSON.stringify(data)).toBe(before); // input untouched (deep copy)

    const { keys } = collect(stripped);
    for (const k of EXPECTATION_KEYS) expect(keys).not.toContain(k);
    expect(keys.filter((k) => /^year_\d_expected/.test(k) || k === 'tolerance')).toEqual([]);
    // The distinctive expected values (17, 19, 23) appear nowhere else in the content.
    const json = JSON.stringify(stripped);
    expect(json).not.toMatch(/year_\d_expected/);
    expect(json).not.toMatch(/"tolerance"/);
    expect(collect(stripped).values.filter((v) => v === 17 || v === 19 || v === 23)).toEqual([]);

    // Everything that is not an expected level stays as it was.
    const reAdd = (s: any) => JSON.parse(JSON.stringify(s));
    const withoutExp = reAdd(data);
    for (const list of [withoutExp.modules, ...withoutExp.objectives.map((o: any) => o.modules)]) {
      for (const m of list) for (const i of m.indicators) for (const k of EXPECTATION_KEYS) delete i[k];
    }
    expect(stripped).toEqual(withoutExp);
    expect(stripped.template).toEqual(data.template);
  });

  it('removes them from older shapes too (flat modules only, legacy expectations key)', () => {
    const legacy = { template: { name: 'Antiguo' }, modules: [{ id: 'm', indicators: [{ id: 'i', category: 'cobertura', expectations: { year_1_expected: 1, tolerance: 1 } }] }] };
    const stripped = stripExpectations(legacy);
    expect(stripped).toEqual({ template: { name: 'Antiguo' }, modules: [{ id: 'm', indicators: [{ id: 'i', category: 'cobertura' }] }] });
    expect(legacy.modules[0].indicators[0].expectations).toBeDefined();
    expect(stripExpectations(null)).toBeNull();
    expect(stripExpectations({})).toEqual({});
  });
});
