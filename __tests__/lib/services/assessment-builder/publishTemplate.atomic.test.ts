// @vitest-environment node
/**
 * GC-10, send-back 1: publishTemplate writes the snapshot and the flip through
 * ONE call of public.publish_assessment_template (service role), after the
 * checks a person can correct, and deletes nothing. In-memory clients,
 * synthetic ids. The function itself is proven in
 * supabase/tests/128-gestor-publish-atomic.sql and, through the real route, in
 * __tests__/api/assessment-builder/publish-snapshot-retry.localdb.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  publishTemplate,
  TEMPLATE_CHANGED_WHILE_PUBLISHING,
} from '../../../../lib/services/assessment-builder/publishTemplate';

type Row = Record<string, any>;

/** Read-only in-memory client that records every write it is asked for. */
function memoryClient(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      const st = { filters: [] as Array<(r: Row) => boolean>, single: false };
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => (st.filters.push((r) => r[c] === v), chain),
        in: (c: string, v: unknown[]) => (st.filters.push((r) => v.includes(r[c])), chain),
        order: () => chain,
        single: () => ((st.single = true), chain),
        insert: () => (writes.push(`${table}.insert`), chain),
        update: () => (writes.push(`${table}.update`), chain),
        upsert: () => (writes.push(`${table}.upsert`), chain),
        delete: () => (writes.push(`${table}.delete`), chain),
        then: (resolve: (v: unknown) => void) => {
          let out = (tables[table] ?? []).filter((r) => st.filters.every((f) => f(r)));
          if (table === 'assessment_templates') out = out.map((t) => ({ ...t, grade: { id: t.grade_id, name: '5° Básico', is_always_gt: false } }));
          if (st.single) return resolve(out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } });
          return resolve({ data: out, error: null });
        },
      };
      return chain;
    }),
  };
  return { client, writes };
}

function seed() {
  return {
    ab_via_assignment_rules: [{ area: 'evaluacion', target: 'course_docente' }, { area: 'liderazgo', target: 'school_responsible' }],
    assessment_templates: [{ id: 'tpl-1', name: 'Instrumento Sintético', area: 'evaluacion', grade_id: 9, version: '1.1.1', status: 'draft', is_archived: false, scoring_config: {} }],
    assessment_objectives: [{ id: 'obj-1', template_id: 'tpl-1', name: 'Proceso', display_order: 1, weight: 1 }],
    assessment_modules: [{ id: 'mod-1', template_id: 'tpl-1', objective_id: 'obj-1', name: 'Práctica', display_order: 1, weight: 1 }],
    assessment_indicators: [{ id: 'ind-1', module_id: 'mod-1', code: 'C1', name: 'Indicador', category: 'cobertura', display_order: 1, weight: 1 }],
    assessment_template_snapshots: [] as Row[],
    assessment_instances: [] as Row[],
  } as Record<string, Row[]>;
}

const PUBLISHED_ANSWER = {
  ok: true,
  version: '1.3.0',
  template: { id: 'tpl-1', name: 'Instrumento Sintético', area: 'evaluacion', status: 'published', version: '1.3.0' },
  snapshot: { id: 'snap-9', version: '1.3.0', created_at: '2026-11-16T00:00:00Z' },
};

function rpcClient(answer: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => answer) };
}

describe('GC-10 publishTemplate: one publication call, nothing deleted', () => {
  it('publishes through ONE call of publish_assessment_template, with the version read, and writes nothing else', async () => {
    const tables = seed();
    const caller = memoryClient(tables);
    const svc = rpcClient({ data: PUBLISHED_ANSWER, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });

    expect(r).toMatchObject({ ok: true, newVersion: '1.3.0', template: { status: 'published', version: '1.3.0' }, snapshot: { id: 'snap-9', version: '1.3.0' } });
    expect(svc.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = svc.rpc.mock.calls[0] as unknown as [string, any];
    expect(fn).toBe('publish_assessment_template');
    expect(args.p_template_id).toBe('tpl-1');
    expect(args.p_expected_version).toBe('1.1.1');
    expect(args.p_snapshot_data.template).toMatchObject({ id: 'tpl-1', area: 'evaluacion', grade_id: 9 });
    expect(args.p_snapshot_data.published_by).toBe('admin');
    expect(caller.writes).toEqual([]); // no insert, no update, no delete by the caller
  });

  it('a version already held by another template of the scope is no longer refused here (the function picks the next free one)', async () => {
    const tables = seed();
    tables.assessment_templates.push({ id: 'tpl-0', name: 'Copia', area: 'evaluacion', grade_id: 9, version: '1.2.0', status: 'published', is_archived: false });
    const caller = memoryClient(tables);
    const svc = rpcClient({ data: PUBLISHED_ANSWER, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
    expect(r.ok).toBe(true);
    expect(svc.rpc).toHaveBeenCalledTimes(1);
  });

  it('"no longer a draft at the version read" becomes the message a person can act on', async () => {
    const caller = memoryClient(seed());
    const svc = rpcClient({ data: { ok: false, code: 'template_not_draft' }, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
    expect(r).toEqual({ ok: false, status: 409, error: TEMPLATE_CHANGED_WHILE_PUBLISHING, code: 'template_changed' });
    expect(TEMPLATE_CHANGED_WHILE_PUBLISHING).toBe('Este instrumento ya fue publicado o cambió mientras se publicaba. Recarga la página.');
    expect(caller.writes).toEqual([]);
  });

  it('a snapshot in use at that version is refused with a message, and nothing is deleted', async () => {
    const caller = memoryClient(seed());
    const svc = rpcClient({ data: { ok: false, code: 'snapshot_in_use', version: '1.2.0' }, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'snapshot_in_use' });
    expect((r as any).error).toContain('1.2.0');
    expect(caller.writes).toEqual([]);
  });

  it('an unknown template answered by the function is a 404', async () => {
    const caller = memoryClient(seed());
    const svc = rpcClient({ data: { ok: false, code: 'template_not_found' }, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
    expect(r).toMatchObject({ ok: false, status: 404, error: 'Template no encontrado' });
  });

  it('a database refusal inside the call (vía guard, version key) is a 409 with the builder message; nothing is deleted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [error, message] of [
      [{ code: 'P0001', message: 'template_grade_required' }, 'El nivel es requerido: esta vía se asigna al docente de cada curso.'],
      [{ code: '23505', message: 'duplicate key' }, 'Ya existe un template con la misma vía, nivel (o nombre, si no lleva nivel) y versión.'],
    ] as const) {
      const caller = memoryClient(seed());
      const svc = rpcClient({ data: null, error });
      const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
      expect(r).toEqual({ ok: false, status: 409, error: message, code: 'template_conflict' });
      expect(caller.writes).toEqual([]);
    }
    const caller = memoryClient(seed());
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: rpcClient({ data: null, error: { code: 'XX000', message: 'boom' } }) as any });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(caller.writes).toEqual([]);
  });

  it('a grade on a school-level vía is refused before the publication call', async () => {
    const tables = seed();
    tables.assessment_templates[0].area = 'liderazgo';
    const caller = memoryClient(tables);
    const svc = rpcClient({ data: PUBLISHED_ANSWER, error: null });
    const r = await publishTemplate(caller.client, 'tpl-1', { id: 'admin' }, { publishClient: svc as any });
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.' });
    expect(svc.rpc).not.toHaveBeenCalled();
    expect(caller.writes).toEqual([]);
  });

  it('the service source contains no delete at all', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('lib/services/assessment-builder/publishTemplate.ts', 'utf8');
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/assessment_template_snapshots/);
  });
});
