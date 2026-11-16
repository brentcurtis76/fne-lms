// @vitest-environment node
/**
 * GC-10: publishTemplate removes a snapshot only through the cleanup client
 * and only when no assessment instance refers to it; refusals a person can
 * correct come before the snapshot is written. In-memory clients, synthetic
 * ids. The same flows run against the local database in
 * __tests__/api/assessment-builder/publish-snapshot-retry.localdb.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { publishTemplate } from '../../../../lib/services/assessment-builder/publishTemplate';

type Row = Record<string, any>;

/** select/eq/in/order/single/head-count, insert/update/delete over arrays; `failUpdate` makes template updates fail. */
function memoryClient(tables: Record<string, Row[]>, opts: { failUpdate?: { code?: string; message: string } } = {}) {
  const log: string[] = [];
  let serial = 0;
  const client = {
    from: vi.fn((table: string) => {
      const st = { op: 'select', payload: null as any, filters: [] as Array<(r: Row) => boolean>, single: false, head: false };
      const chain: any = {
        select: (_c?: string, o?: { head?: boolean }) => ((st.head = Boolean(o?.head)), chain),
        eq: (c: string, v: unknown) => (st.filters.push((r) => r[c] === v), chain),
        in: (c: string, v: unknown[]) => (st.filters.push((r) => v.includes(r[c])), chain),
        order: () => chain,
        single: () => ((st.single = true), chain),
        insert: (p: Row) => ((st.op = 'insert'), (st.payload = p), chain),
        update: (p: Row) => ((st.op = 'update'), (st.payload = p), chain),
        delete: () => ((st.op = 'delete'), chain),
        then: (resolve: (v: unknown) => void) => {
          const rows = (tables[table] ??= []);
          const match = () => rows.filter((r) => st.filters.every((f) => f(r)));
          if (st.op !== 'select') log.push(`${table}.${st.op}`);
          let out: Row[] = [];
          if (st.op === 'insert') {
            const row = { id: `gen-${(serial += 1)}`, created_at: '2026-11-16T00:00:00Z', ...st.payload };
            if (table === 'assessment_template_snapshots' && rows.some((r) => r.template_id === row.template_id && r.version === row.version)) {
              return resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
            }
            rows.push(row);
            out = [row];
          } else if (st.op === 'update') {
            if (table === 'assessment_templates' && opts.failUpdate) return resolve({ data: null, error: opts.failUpdate });
            match().forEach((r) => Object.assign(r, st.payload));
            out = match();
          } else if (st.op === 'delete') {
            out = match();
            out.forEach((r) => rows.splice(rows.indexOf(r), 1));
          } else {
            out = match();
            if (table === 'assessment_templates') out = out.map((t) => ({ ...t, grade: { id: t.grade_id, name: '5° Básico', is_always_gt: false } }));
          }
          if (st.head) return resolve({ data: null, error: null, count: out.length });
          if (st.single) return resolve(out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } });
          return resolve({ data: out, error: null });
        },
      };
      return chain;
    }),
  };
  return { client, log };
}

function seed(extra: Partial<Record<string, Row[]>> = {}) {
  return {
    ab_via_assignment_rules: [{ area: 'evaluacion', target: 'course_docente' }, { area: 'liderazgo', target: 'school_responsible' }],
    assessment_templates: [{ id: 'tpl-1', name: 'Instrumento Sintético', area: 'evaluacion', grade_id: 9, version: '1.0.0', status: 'draft', is_archived: false, scoring_config: {} }],
    assessment_objectives: [{ id: 'obj-1', template_id: 'tpl-1', name: 'Proceso', display_order: 1, weight: 1 }],
    assessment_modules: [{ id: 'mod-1', template_id: 'tpl-1', objective_id: 'obj-1', name: 'Práctica', display_order: 1, weight: 1 }],
    assessment_indicators: [{ id: 'ind-1', module_id: 'mod-1', code: 'C1', name: 'Indicador', category: 'cobertura', display_order: 1, weight: 1 }],
    assessment_template_snapshots: [] as Row[],
    assessment_instances: [] as Row[],
    ...extra,
  } as Record<string, Row[]>;
}

describe('GC-10 publishTemplate snapshot clean-up', () => {
  it('a flip that still fails (version taken at the last moment) leaves no snapshot: the cleanup client removes it', async () => {
    const tables = seed();
    const caller = memoryClient(tables, { failUpdate: { code: '23505', message: 'duplicate key' } });
    const cleanup = memoryClient(tables);
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { cleanupClient: cleanup.client });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(tables.assessment_template_snapshots).toEqual([]);
    expect(caller.log).not.toContain('assessment_template_snapshots.delete');
    expect(cleanup.log).toContain('assessment_template_snapshots.delete');
  });

  it('a leftover snapshot an instance refers to is never removed (the publish fails as before)', async () => {
    const tables = seed({
      assessment_template_snapshots: [{ id: 'old-snap', template_id: 'tpl-1', version: '1.1.0' }],
      assessment_instances: [{ id: 'inst-1', template_snapshot_id: 'old-snap' }],
    });
    const caller = memoryClient(tables);
    const cleanup = memoryClient(tables);
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { cleanupClient: cleanup.client });
    expect(r).toMatchObject({ ok: false, status: 500, error: 'Error al crear snapshot' });
    expect(tables.assessment_template_snapshots.map((s) => s.id)).toEqual(['old-snap']);
    expect(cleanup.log).not.toContain('assessment_template_snapshots.delete');
    expect(tables.assessment_templates[0].status).toBe('draft');
  });

  it('a leftover snapshot referred to by nothing is removed and the publication goes on', async () => {
    const tables = seed({ assessment_template_snapshots: [{ id: 'old-snap', template_id: 'tpl-1', version: '1.1.0' }] });
    const caller = memoryClient(tables);
    const cleanup = memoryClient(tables);
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { cleanupClient: cleanup.client });
    expect(r.ok).toBe(true);
    expect(tables.assessment_template_snapshots.map((s) => s.id)).not.toContain('old-snap');
    expect(tables.assessment_template_snapshots).toHaveLength(1);
  });

  it('a version already taken in the same vía and level is refused before any snapshot is written', async () => {
    const tables = seed();
    tables.assessment_templates.push({ id: 'tpl-0', name: 'Otro', area: 'evaluacion', grade_id: 9, version: '1.1.0', status: 'published', is_archived: false });
    const caller = memoryClient(tables);
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { cleanupClient: memoryClient(tables).client });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      error: 'Ya existe un template con la misma vía, nivel (o nombre, si no lleva nivel) y versión.',
    });
    expect(caller.log).toEqual([]);
  });

  it('a grade on a school-level vía is refused before any snapshot is written', async () => {
    const tables = seed();
    tables.assessment_templates[0].area = 'liderazgo';
    const caller = memoryClient(tables);
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { cleanupClient: memoryClient(tables).client });
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.' });
    expect(caller.log).toEqual([]);
  });
});
