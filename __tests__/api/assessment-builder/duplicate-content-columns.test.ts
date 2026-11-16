// @vitest-environment node
/**
 * F8 send-back 2, T2: a copy made by the duplicate route carries every column
 * that describes the instrument's content — including each indicator's
 * `visibility_condition`, which used to be dropped (null in the copy).
 *
 * A condition may name another indicator of the same instrument by id; in the
 * copy that reference must point at the copy's own indicator, never back at
 * the source.
 *
 * Runs the real route over a small in-memory store (synthetic ids). Columns
 * set afresh on purpose: id, template_id/module_id/objective_id/indicator_id
 * (remapped), created_at, updated_at, and on the template name, grade, status,
 * version, created_by, published_*, archived_*.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { randomUUID } from 'node:crypto';

const { store, mockGetApiUser } = vi.hoisted(() => ({
  store: { tables: {} as Record<string, any[]> },
  mockGetApiUser: vi.fn(),
}));

/** A tiny PostgREST-like client over `store.tables`. */
function memoryClient() {
  const from = (table: string) => {
    const rows = () => (store.tables[table] ??= []);
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let single = false;
    let head = false;
    let inserted: any[] = [];
    const q: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true;
        return q;
      },
      insert: (p: any) => {
        op = 'insert';
        payload = p;
        return q;
      },
      update: (p: any) => {
        op = 'update';
        payload = p;
        return q;
      },
      delete: () => {
        op = 'delete';
        return q;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return q;
      },
      is: (c: string, v: unknown) => {
        filters.push((r) => (r[c] ?? null) === v);
        return q;
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]));
        return q;
      },
      order: () => q,
      range: () => q,
      single: () => {
        single = true;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          const now = new Date().toISOString();
          if (op === 'insert') {
            const list = (Array.isArray(payload) ? payload : [payload]).map((p: any) => ({
              id: randomUUID(),
              created_at: now,
              updated_at: now,
              ...p,
            }));
            rows().push(...list);
            inserted = list;
            return resolve({ data: single ? inserted[0] : inserted, error: null });
          }
          const matched = rows().filter((r) => filters.every((f) => f(r)));
          if (op === 'update') {
            for (const r of matched) Object.assign(r, payload, { updated_at: now });
            return resolve({ data: matched, error: null });
          }
          if (op === 'delete') {
            store.tables[table] = rows().filter((r) => !matched.includes(r));
            return resolve({ data: null, error: null });
          }
          if (head) return resolve({ data: null, count: matched.length, error: null });
          if (single) {
            return resolve(matched[0] ? { data: { ...matched[0] }, error: null } : { data: null, error: { message: 'no rows' } });
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
  createApiSupabaseClient: vi.fn(async () => memoryClient()),
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Method not allowed' })),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: vi.fn().mockResolvedValue(true),
  hasAssessmentWritePermission: vi.fn().mockResolvedValue(true),
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/duplicate';

const ADMIN = '00000000-0000-4000-8000-0000000f8c01';
const SRC = '00000000-0000-4000-8000-0000000f8c10';
const OBJ = '00000000-0000-4000-8000-0000000f8c20';
const MOD_1 = '00000000-0000-4000-8000-0000000f8c30';
const MOD_2 = '00000000-0000-4000-8000-0000000f8c31';
const IND_GATE = '00000000-0000-4000-8000-0000000f8c40';
const IND_DEPENDENT = '00000000-0000-4000-8000-0000000f8c41';
const IND_LATER = '00000000-0000-4000-8000-0000000f8c42';

const T = '2026-11-01T10:00:00.000Z';

/** Columns that are the copy's own on purpose (never compared). */
const OWN = ['id', 'template_id', 'module_id', 'objective_id', 'indicator_id', 'entity_id', 'created_at', 'updated_at'];
const content = (row: any) => Object.fromEntries(Object.entries(row).filter(([k]) => !OWN.includes(k)));

function seed() {
  const indicator = (id: string, moduleId: string, order: number, extra: Record<string, unknown> = {}) => ({
    id,
    module_id: moduleId,
    code: `C-${order}`,
    name: `Indicador sintético ${order}`,
    description: `Descripción ${order}`,
    category: 'frecuencia',
    frequency_config: { type: 'count', min: 0, max: 20, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] },
    frequency_unit_options: ['semana', 'mes'],
    level_0_descriptor: 'N0',
    level_1_descriptor: 'N1',
    level_2_descriptor: 'N2',
    level_3_descriptor: 'N3',
    level_4_descriptor: 'N4',
    display_order: order,
    weight: 1.5,
    visibility_condition: null,
    detalle_options: ['a', 'b'],
    evaluation_guidance: `Guía ${order}`,
    created_at: T,
    updated_at: T,
    ...extra,
  });
  store.tables = {
    ab_via_assignment_rules: [{ area: 'evaluacion', target: 'course_docente' }],
    assessment_templates: [
      {
        id: SRC, name: 'Instrumento Sintético', description: 'Descripción del instrumento', area: 'evaluacion',
        grade_id: 9, status: 'published', version: '1.0.0', scoring_config: { mode: 'weighted' },
        is_archived: false, created_by: ADMIN, created_at: T, updated_at: T,
      },
    ],
    assessment_objectives: [
      { id: OBJ, template_id: SRC, name: 'Proceso', description: 'Desc proceso', display_order: 1, weight: 2, created_at: T, updated_at: T },
    ],
    assessment_modules: [
      { id: MOD_1, template_id: SRC, objective_id: OBJ, name: 'Práctica 1', description: 'D1', instructions: 'I1', display_order: 1, weight: 1, created_at: T, updated_at: T },
      { id: MOD_2, template_id: SRC, objective_id: OBJ, name: 'Práctica 2', description: 'D2', instructions: 'I2', display_order: 2, weight: 3, created_at: T, updated_at: T },
    ],
    assessment_indicators: [
      indicator(IND_GATE, MOD_1, 1, { category: 'cobertura' }),
      // Refers to an indicator copied BEFORE it, and (nested) to one copied AFTER it, in another práctica.
      indicator(IND_DEPENDENT, MOD_1, 2, {
        visibility_condition: {
          logic: 'and',
          conditions: [
            { field: IND_GATE, operator: 'equals', value: true },
            { logic: 'or', conditions: [{ field: IND_LATER, operator: 'in', value: [IND_GATE, 'otro'] }] },
          ],
        },
      }),
      indicator(IND_LATER, MOD_2, 3, { visibility_condition: { field: 'modalidad', operator: 'equals', value: 'presencial' } }),
    ],
    assessment_year_expectations: [
      {
        id: randomUUID(), template_id: SRC, indicator_id: IND_DEPENDENT, generation_type: 'GT',
        year_1_expected: 1, year_1_expected_unit: 'semana', year_2_expected: 2, year_2_expected_unit: 'semana',
        year_3_expected: 3, year_3_expected_unit: 'mes', year_4_expected: 4, year_4_expected_unit: 'mes',
        year_5_expected: 5, year_5_expected_unit: 'mes', tolerance: 1, created_at: T, updated_at: T,
      },
    ],
    assessment_entity_year_weights: [
      { id: randomUUID(), template_id: SRC, entity_type: 'indicator', entity_id: IND_DEPENDENT, year: 2, weight: 0.5, created_at: T, updated_at: T },
    ],
  };
}

async function duplicate() {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN }, error: null });
  const { req, res } = createMocks({
    method: 'POST',
    query: { templateId: SRC },
    body: { name: 'Instrumento Sintético (copia)', grade_id: 9 },
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

describe('T2 duplicate keeps every content column', () => {
  it('the copy equals the source in every content column, visibility conditions included and re-pointed', async () => {
    const r = await duplicate();
    expect(r.status).toBe(201);
    const copyId = r.body.template.id;
    const t = store.tables;

    const srcMods = t.assessment_modules.filter((m) => m.template_id === SRC);
    const copyMods = t.assessment_modules.filter((m) => m.template_id === copyId);
    expect(copyMods.map(content)).toEqual(srcMods.map(content));

    const srcObjs = t.assessment_objectives.filter((o) => o.template_id === SRC);
    const copyObjs = t.assessment_objectives.filter((o) => o.template_id === copyId);
    expect(copyObjs.map(content)).toEqual(srcObjs.map(content));

    const copyModIds = copyMods.map((m) => m.id);
    const srcInds = t.assessment_indicators.filter((i) => [MOD_1, MOD_2].includes(i.module_id));
    const copyInds = t.assessment_indicators.filter((i) => copyModIds.includes(i.module_id));
    expect(copyInds).toHaveLength(3);

    // Map source indicator id -> copy indicator id (by code, unique here).
    const idOf = (code: string) => copyInds.find((i) => i.code === code)!.id;
    const map: Record<string, string> = {
      [IND_GATE]: idOf('C-1'),
      [IND_DEPENDENT]: idOf('C-2'),
      [IND_LATER]: idOf('C-3'),
    };
    const repoint = (v: unknown): unknown =>
      JSON.parse(JSON.stringify(v ?? null), (_k, x) => (typeof x === 'string' && map[x] ? map[x] : x));

    for (const src of srcInds) {
      const copy = copyInds.find((i) => i.code === src.code)!;
      expect(content(copy)).toEqual({ ...content(src), visibility_condition: repoint(src.visibility_condition) });
    }

    const dependent = copyInds.find((i) => i.code === 'C-2')!;
    expect(dependent.visibility_condition).toEqual({
      logic: 'and',
      conditions: [
        { field: map[IND_GATE], operator: 'equals', value: true },
        { logic: 'or', conditions: [{ field: map[IND_LATER], operator: 'in', value: [map[IND_GATE], 'otro'] }] },
      ],
    });
    // No reference back to the source instrument's indicators.
    for (const copy of copyInds) {
      const text = JSON.stringify(copy.visibility_condition);
      for (const srcId of [IND_GATE, IND_DEPENDENT, IND_LATER]) expect(text).not.toContain(srcId);
    }
    // A condition naming no indicator is carried as it is.
    expect(copyInds.find((i) => i.code === 'C-3')!.visibility_condition).toEqual({
      field: 'modalidad', operator: 'equals', value: 'presencial',
    });

    const srcExp = t.assessment_year_expectations.filter((e) => e.template_id === SRC);
    const copyExp = t.assessment_year_expectations.filter((e) => e.template_id === copyId);
    expect(copyExp.map(content)).toEqual(srcExp.map(content));
    expect(copyExp[0].indicator_id).toBe(map[IND_DEPENDENT]);

    const srcW = t.assessment_entity_year_weights.filter((w) => w.template_id === SRC);
    const copyW = t.assessment_entity_year_weights.filter((w) => w.template_id === copyId);
    expect(copyW.map(content)).toEqual(srcW.map(content));
    expect(copyW[0].entity_id).toBe(map[IND_DEPENDENT]);

    const src = t.assessment_templates.find((x) => x.id === SRC)!;
    const copy = t.assessment_templates.find((x) => x.id === copyId)!;
    for (const col of ['description', 'area', 'scoring_config']) expect(copy[col]).toEqual(src[col]);
  });
});
