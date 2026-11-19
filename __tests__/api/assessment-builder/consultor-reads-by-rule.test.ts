// @vitest-environment node
/**
 * N1, part 2 (item 4) — the builder for a consultor. The read gate
 * (lib/assessment-permissions.ts) stays "admin or consultor"; the database now
 * decides which instruments a consultor reads. The caller's client below
 * answers as the new read rules do for a consultor assigned to one school:
 * rows of instruments delivered to that school only; drafts and instruments
 * of other schools are simply not there (no error, no row). Synthetic data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateApiSupabaseClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any, methods: string[]) =>
    res.status(405).json({ error: `Method not allowed. Use: ${methods.join(', ')}` })
  ),
}));

import listHandler from '../../../pages/api/admin/assessment-builder/templates/index';
import detailHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]';
import versionsHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/versions';
import snapshotHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId]';
import expectationsHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/expectations/index';

const CONSULTOR = 'cons-sintetico-1';
const T1 = 'tpl-entregado-s1'; // published, delivered to the consultor's school
const T2 = 'tpl-entregado-s2'; // published, delivered to another school only
const T3 = 'tpl-borrador'; // draft
const NO_ROW = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };

const template = (id: string, status: string, area: string) => ({
  id, area, version: '1.0', name: `Instrumento ${id}`, description: null, status, scoring_config: {},
  published_at: status === 'published' ? '2026-10-01T00:00:00Z' : null, published_by: null, created_by: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', is_archived: false, archived_at: null,
  archived_by: null, grade_id: null, grade: null,
});

const ALL: Record<string, Array<Record<string, any>>> = {
  assessment_templates: [template(T1, 'published', 'evaluacion'), template(T2, 'published', 'aprendizaje'), template(T3, 'draft', 'proposito')],
  assessment_modules: [
    { id: 'mod-1', template_id: T1, name: 'Práctica 1', description: null, instructions: null, display_order: 1, weight: 1 },
    { id: 'mod-2', template_id: T2, name: 'Práctica 2', description: null, instructions: null, display_order: 1, weight: 1 },
    { id: 'mod-3', template_id: T3, name: 'Práctica 3', description: null, instructions: null, display_order: 1, weight: 1 },
  ],
  assessment_indicators: [
    { id: 'ind-1', module_id: 'mod-1', template_id: T1, code: 'I1', name: 'Indicador 1', category: 'cobertura', display_order: 1, weight: 1 },
    { id: 'ind-3', module_id: 'mod-3', template_id: T3, code: 'I3', name: 'Indicador 3', category: 'cobertura', display_order: 1, weight: 1 },
  ],
  assessment_template_snapshots: [
    { id: 'snap-1', template_id: T1, version: '1.0', snapshot_data: { modules: [] }, created_at: '2026-10-01T00:00:00Z' },
    { id: 'snap-2', template_id: T2, version: '1.0', snapshot_data: { modules: [] }, created_at: '2026-10-01T00:00:00Z' },
  ],
  assessment_objectives: [],
  assessment_year_expectations: [],
  assessment_entity_year_weights: [],
  assessment_instances: [],
  assessment_responses: [],
};

/** A client that answers as the new rules do for a consultor who may read `readable` only. */
function consultorClient(readable: string[]) {
  const reads: string[] = [];
  const visible = (table: string) => {
    if (table === 'user_roles') return [{ role_type: 'consultor', user_id: CONSULTOR, is_active: true }];
    const rows = ALL[table] ?? [];
    if (table === 'assessment_templates') return rows.filter((r) => readable.includes(r.id));
    if (table === 'assessment_instances' || table === 'assessment_responses') return []; // consultores never read these
    return rows.filter((r) => readable.includes(r.template_id));
  };
  function builder(table: string) {
    let rows = visible(table);
    let head = false;
    const b: any = {
      select: vi.fn((_s?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return b; }),
      eq: vi.fn((col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val || (col === 'is_archived' && r[col] === val)); return b; }),
      in: vi.fn((col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; }),
      is: vi.fn((col: string, val: unknown) => { rows = rows.filter((r) => (r[col] ?? null) === val); return b; }),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      single: vi.fn(async () => (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: NO_ROW })),
      maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: head ? null : rows, error: null, count: rows.length }),
    };
    return b;
  }
  return {
    reads,
    from: vi.fn((table: string) => { reads.push(table); return builder(table); }),
  };
}

async function call(handler: any, query: Record<string, string>) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

describe('builder routes for a consultor under the new read rules (N1, part 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR }, error: null });
  });

  it('the list holds only what the database returns', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(listHandler, {});
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.templates.map((t: any) => t.id)).toEqual([T1]);
    expect(body.templates[0].module_count).toBe(1);
  });

  it('an empty list is an empty answer, not an error', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([]));
    const { status, body } = await call(listHandler, {});
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, templates: [] });
  });

  it('opening an instrument the consultor reads works as today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(detailHandler, { templateId: T1 });
    expect(status).toBe(200);
    expect(body.template.id).toBe(T1);
    expect(body.template.modules.map((m: any) => m.id)).toEqual(['mod-1']);
    expect(body.template.modules[0].indicators.map((i: any) => i.id)).toEqual(['ind-1']);
  });

  it.each([
    ['a draft', T3],
    ['an instrument of another school', T2],
  ])('opening %s answers the existing 404 «Template no encontrado», never a 500', async (_label, id) => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(detailHandler, { templateId: id });
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Template no encontrado' });
  });

  it('the versions of an instrument the consultor may not read: 404 «Template no encontrado»', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(versionsHandler, { templateId: T2 });
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Template no encontrado' });
  });

  it('a stored version of an instrument the consultor may not read: 404 «Snapshot no encontrado»', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(snapshotHandler, { templateId: T2, snapshotId: 'snap-2' });
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Snapshot no encontrado' });
  });

  it('the expected levels of an instrument the consultor may not read: 404 «Template no encontrado»', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(consultorClient([T1]));
    const { status, body } = await call(expectationsHandler, { templateId: T3 });
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Template no encontrado' });
  });
});
