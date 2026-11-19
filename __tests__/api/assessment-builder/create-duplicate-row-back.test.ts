// @vitest-environment node
/**
 * F1b-2, send-back 2: an admin's own new instrument is readable in the
 * statement that creates it.
 *
 * The builder's create route (POST templates) and the duplicate route insert
 * the template and ask for it back in the same request
 * (`.insert(…).select(…).single()`, an INSERT … RETURNING). The database
 * applies the table's READ rule to the returned row. With the phase's first
 * read rules the helper saw the table as it was when the statement began, so
 * the new instrument was not in its set: 42501 and the routes answered 500.
 *
 * The client below behaves as the database does for an ADMIN: an insert or
 * update that asks for its rows back succeeds only when the read rule admits
 * the returned row. `rule = 'fixed'` is the rule of the migration now (an
 * admin is admitted in the rule itself); `rule = 'before'` is the rule as it
 * was (only instruments that existed BEFORE the statement are admitted).
 * These are mocks: the proof that the database itself behaves like this is
 * supabase/tests/139-instruments-by-who-works-with-them.sql (send-back 2
 * section), not this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { randomUUID } from 'node:crypto';

const { store, mockGetApiUser } = vi.hoisted(() => ({
  store: {
    tables: {} as Record<string, any[]>,
    rule: 'fixed' as 'fixed' | 'before',
  },
  mockGetApiUser: vi.fn(),
}));

/** The instrument a row belongs to, read from the tables as they are now. */
function instrumentOf(table: string, row: any): string | undefined {
  if (table === 'assessment_templates') return row.id;
  if (table === 'assessment_indicators') {
    return (store.tables.assessment_modules ?? []).find((m) => m.id === row.module_id)?.template_id;
  }
  return row.template_id;
}

/** The read rule on a returned row, for an admin. */
function adminReadsReturnedRow(table: string, row: any, existingBefore: Set<string>): boolean {
  if (store.rule === 'fixed') return true;
  // Before the fix: tables whose only read path for an admin was the helper's set.
  const helperOnly = [
    'assessment_templates', 'assessment_objectives', 'assessment_modules',
    'assessment_indicators', 'assessment_template_snapshots',
  ];
  if (!helperOnly.includes(table)) return true;
  const id = instrumentOf(table, row);
  return id !== undefined && existingBefore.has(id);
}

/** A small PostgREST-like client over `store.tables`, acting as an admin. */
function adminClient() {
  const from = (table: string) => {
    const rows = () => (store.tables[table] ??= []);
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let returning = false;
    let single = false;
    let head = false;
    const q: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (op !== 'select') returning = true;
        if (opts?.head) head = true;
        return q;
      },
      insert: (p: any) => { op = 'insert'; payload = p; return q; },
      update: (p: any) => { op = 'update'; payload = p; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      order: () => q,
      range: () => q,
      single: () => { single = true; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          const now = new Date().toISOString();
          const existingBefore = new Set((store.tables.assessment_templates ?? []).map((t) => t.id as string));
          const refused = () =>
            resolve({
              data: null,
              error: { code: '42501', message: `new row violates row-level security policy for table "${table}"` },
            });
          if (op === 'insert') {
            const list = (Array.isArray(payload) ? payload : [payload]).map((p: any) => ({
              id: randomUUID(), created_at: now, updated_at: now, ...p,
            }));
            // The statement is checked as a whole: refused, nothing is written.
            if (returning && !list.every((r) => adminReadsReturnedRow(table, r, existingBefore))) return refused();
            rows().push(...list);
            if (!returning) return resolve({ data: null, error: null });
            return resolve({ data: single ? { ...list[0] } : list.map((r) => ({ ...r })), error: null });
          }
          const matched = rows().filter((r) => filters.every((f) => f(r)));
          if (op === 'update') {
            const after = matched.map((r) => ({ ...r, ...payload, updated_at: now }));
            if (returning && !after.every((r) => adminReadsReturnedRow(table, r, existingBefore))) return refused();
            matched.forEach((r, i) => Object.assign(r, after[i]));
            if (!returning) return resolve({ data: null, error: null });
            return resolve({ data: single ? after[0] ?? null : after, error: null });
          }
          if (op === 'delete') {
            store.tables[table] = rows().filter((r) => !matched.includes(r));
            return resolve({ data: null, error: null });
          }
          if (head) return resolve({ data: null, count: matched.length, error: null });
          if (single) {
            return resolve(matched[0]
              ? { data: { ...matched[0] }, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'no rows' } });
          }
          return resolve({ data: matched.map((r) => ({ ...r })), error: null, count: matched.length });
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return q;
  };
  return { from: vi.fn(from) };
}

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: vi.fn(async () => adminClient()),
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Method not allowed' })),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: vi.fn().mockResolvedValue(true),
  hasAssessmentWritePermission: vi.fn().mockResolvedValue(true),
}));

import createHandler from '../../../pages/api/admin/assessment-builder/templates/index';
import duplicateHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/duplicate';

const ADMIN = '00000000-0000-4000-8000-0000000f1b21';
const SRC = '00000000-0000-4000-8000-0000000f1b22';
const OBJ = '00000000-0000-4000-8000-0000000f1b23';
const MOD = '00000000-0000-4000-8000-0000000f1b24';
const IND = '00000000-0000-4000-8000-0000000f1b25';

function seed() {
  store.tables = {
    ab_via_assignment_rules: [{ area: 'evaluacion', target: 'course_docente' }],
    assessment_templates: [
      {
        id: SRC, name: 'Instrumento Sintético F1b', description: 'Descripción sintética', area: 'evaluacion',
        grade_id: 9, status: 'published', version: '1.0.0', scoring_config: { mode: 'weighted' },
        is_archived: false, created_by: ADMIN,
      },
    ],
    assessment_objectives: [{ id: OBJ, template_id: SRC, name: 'Proceso sintético', display_order: 1, weight: 1 }],
    assessment_modules: [{ id: MOD, template_id: SRC, objective_id: OBJ, name: 'Práctica sintética', display_order: 1, weight: 1 }],
    assessment_indicators: [
      { id: IND, module_id: MOD, code: 'F1B-1', name: 'Indicador sintético', category: 'cobertura', display_order: 1, weight: 1, visibility_condition: null },
    ],
    assessment_year_expectations: [],
    assessment_entity_year_weights: [],
  };
}

async function call(handler: any, opts: Record<string, unknown>) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN }, error: null });
  const { req, res } = createMocks(opts as any);
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

const create = () =>
  call(createHandler, { method: 'POST', body: { area: 'evaluacion', name: 'Instrumento nuevo F1b', grade_id: 9 } });
const duplicate = () =>
  call(duplicateHandler, { method: 'POST', query: { templateId: SRC }, body: { name: 'Instrumento F1b (copia)', grade_id: 9 } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

describe('«Crear template» as an admin: the new instrument comes back in the same request', () => {
  it('with the rule as it now is: 201 with the new draft, written once', async () => {
    store.rule = 'fixed';
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.template).toMatchObject({ name: 'Instrumento nuevo F1b', area: 'evaluacion', grade_id: 9, status: 'draft', created_by: ADMIN });
    expect(store.tables.assessment_templates.filter((t) => t.name === 'Instrumento nuevo F1b')).toHaveLength(1);
  });

  it('with the rule as it was before the fix: the insert-and-return is refused (42501) and the route answers 500', async () => {
    store.rule = 'before';
    const r = await create();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Error al crear el template' });
    expect(store.tables.assessment_templates.map((t) => t.id)).toEqual([SRC]);
  });
});

describe('«Duplicar» as an admin: the copy comes back in the same request', () => {
  it('with the rule as it now is: 201 with the copy, its proceso, práctica and indicador made', async () => {
    store.rule = 'fixed';
    const r = await duplicate();
    expect(r.status).toBe(201);
    const copyId = r.body.template.id;
    expect(copyId).not.toBe(SRC);
    expect(r.body.template).toMatchObject({ name: 'Instrumento F1b (copia)', status: 'draft', grade_id: 9 });
    expect(store.tables.assessment_objectives.filter((o) => o.template_id === copyId)).toHaveLength(1);
    const copyMods = store.tables.assessment_modules.filter((m) => m.template_id === copyId);
    expect(copyMods).toHaveLength(1);
    expect(store.tables.assessment_indicators.filter((i) => i.module_id === copyMods[0].id)).toHaveLength(1);
  });

  it('with the rule as it was before the fix: refused (42501), the route answers 500 and makes no copy', async () => {
    store.rule = 'before';
    const r = await duplicate();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'Error al crear nuevo template' });
    expect(store.tables.assessment_templates.map((t) => t.id)).toEqual([SRC]);
  });
});
