// @vitest-environment node
/**
 * N1, part 2, send-back 1 (item 1) — the builder's route for ONE indicator
 * obeys the instruments' read rule. The caller's session client below answers
 * as the new read rules do (a consultor sees only the instruments the
 * database lets them read; a hidden instrument is simply not there). The
 * service client answers everything, as the service role does: it must not
 * be asked anything before the caller's own read of the instrument has
 * admitted the request. Synthetic data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any, methods: string[]) =>
    res.status(405).json({ error: `Method not allowed. Use: ${methods.join(', ')}` })
  ),
}));

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]';

const ADMIN = 'admin-sintetico-1';
const CONSULTOR = 'cons-sintetico-1';
const T1 = 'tpl-entregado-s1'; // published, delivered to the consultor's school
const T3 = 'tpl-borrador'; // draft: the consultor may not read it
const NO_ROW = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };

const indicatorRow = (id: string, moduleId: string, templateId: string) => ({
  id, module_id: moduleId, template_id: templateId, code: `C-${id}`, name: `Indicador ${id}`,
  description: 'Descripción inventada', category: 'cobertura', frequency_config: null, frequency_unit_options: null,
  level_0_descriptor: null, level_1_descriptor: null, level_2_descriptor: null, level_3_descriptor: null,
  level_4_descriptor: null, detalle_options: null, evaluation_guidance: 'Guía inventada', display_order: 2,
  weight: 1, visibility_condition: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
});

function allRows(): Record<string, Array<Record<string, any>>> {
  return {
    assessment_templates: [
      { id: T1, status: 'published', is_archived: false },
      { id: T3, status: 'draft', is_archived: false },
    ],
    assessment_modules: [
      { id: 'mod-1', template_id: T1 },
      { id: 'mod-3', template_id: T3 },
    ],
    assessment_indicators: [
      { ...indicatorRow('ind-0', 'mod-1', T1), display_order: 1 },
      indicatorRow('ind-1', 'mod-1', T1),
      { ...indicatorRow('ind-30', 'mod-3', T3), display_order: 1 },
      indicatorRow('ind-3', 'mod-3', T3),
    ],
    assessment_year_expectations: [],
  };
}

/**
 * A client over the synthetic rows. `readable` = the instruments its caller
 * may read (null = all, as for an admin or the service role); `role` = the
 * caller's active role, as either client reads it from user_roles. Every
 * `.from` is recorded.
 */
function client(role: 'admin' | 'consultor', readable: string[] | null) {
  const rows = allRows();
  const asked: string[] = [];
  const visible = (table: string): Array<Record<string, any>> => {
    if (table === 'user_roles') {
      return [{ role_type: role === 'admin' ? 'admin' : 'consultor', user_id: role === 'admin' ? ADMIN : CONSULTOR, is_active: true }];
    }
    const list = rows[table] ?? [];
    if (readable === null) return list;
    if (table === 'assessment_templates') return list.filter((r) => readable.includes(r.id));
    return list.filter((r) => readable.includes(r.template_id));
  };
  function builder(table: string) {
    let current = visible(table);
    let op: 'select' | 'update' | 'delete' = 'select';
    let patch: Record<string, unknown> | null = null;
    const b: any = {
      select: vi.fn(() => b),
      update: vi.fn((data: Record<string, unknown>) => { op = 'update'; patch = data; return b; }),
      delete: vi.fn(() => { op = 'delete'; return b; }),
      eq: vi.fn((col: string, val: unknown) => { current = current.filter((r) => r[col] === val); return b; }),
      order: vi.fn(() => b),
      limit: vi.fn((n: number) => { current = current.slice(0, n); return b; }),
      single: vi.fn(async () => {
        const out = op === 'update' && patch ? current.map((r) => ({ ...r, ...patch })) : current;
        return out.length === 1 ? { data: out[0], error: null } : { data: null, error: NO_ROW };
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: op === 'delete' ? null : current, error: null }),
    };
    return b;
  }
  return { asked, from: vi.fn((table: string) => { asked.push(table); return builder(table); }) };
}

async function call(method: string, templateId: string, moduleId: string, indicatorId: string, body?: unknown) {
  const { req, res } = createMocks({ method: method as any, query: { templateId, moduleId, indicatorId }, body: body as any });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

describe('one indicator in the builder, under the instruments\' read rule (N1, part 2, send-back 1)', () => {
  let service: ReturnType<typeof client>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = client('consultor', null);
    mockCreateServiceRoleClient.mockReturnValue(service);
  });

  describe('a consultor who may NOT read the instrument (a draft)', () => {
    beforeEach(() => {
      mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR }, error: null });
      mockCreateApiSupabaseClient.mockResolvedValue(client('consultor', [T1]));
    });

    it.each(['GET', 'PUT', 'DELETE'])('%s: 404 «Template no encontrado», and the service client is asked nothing', async (method) => {
      const { status, body } = await call(method, T3, 'mod-3', 'ind-3', method === 'PUT' ? { name: 'Otro nombre' } : undefined);
      expect(status).toBe(404);
      expect(body).toEqual({ error: 'Template no encontrado' });
      expect(service.asked).toEqual([]);
    });

    it.each(['GET', 'PUT', 'DELETE'])('%s with children that do not exist: the same 404 (nothing learned about the hidden instrument)', async (method) => {
      const { status, body } = await call(method, T3, 'no-such-module', 'no-such-indicator', method === 'PUT' ? { name: 'x' } : undefined);
      expect(status).toBe(404);
      expect(body).toEqual({ error: 'Template no encontrado' });
      expect(service.asked).toEqual([]);
    });

    it('an instrument that does not exist answers the same 404', async () => {
      const { status, body } = await call('GET', 'tpl-inexistente', 'mod-x', 'ind-x');
      expect(status).toBe(404);
      expect(body).toEqual({ error: 'Template no encontrado' });
      expect(service.asked).toEqual([]);
    });

    it('an unsupported method answers 405 before any read at all', async () => {
      const session = client('consultor', [T1]);
      mockCreateApiSupabaseClient.mockResolvedValue(session);
      const { status } = await call('PATCH', T3, 'mod-3', 'ind-3');
      expect(status).toBe(405);
      expect(service.asked).toEqual([]);
      expect(session.asked).toEqual([]);
    });
  });

  describe('a consultor who MAY read the instrument', () => {
    beforeEach(() => {
      mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR }, error: null });
      mockCreateApiSupabaseClient.mockResolvedValue(client('consultor', [T1]));
    });

    it('GET: the indicator, as today', async () => {
      const { status, body } = await call('GET', T1, 'mod-1', 'ind-1');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.indicator.id).toBe('ind-1');
      expect(body.indicator.name).toBe('Indicador ind-1');
      expect(body.indicator.evaluationGuidance).toBe('Guía inventada');
    });

    it.each(['PUT', 'DELETE'])('%s: refused as today (403)', async (method) => {
      const { status, body } = await call(method, T1, 'mod-1', 'ind-1', method === 'PUT' ? { name: 'Otro nombre' } : undefined);
      expect(status).toBe(403);
      expect(body).toEqual({ error: 'Solo administradores pueden modificar indicadores' });
    });

    it('a module of a hidden instrument, asked under a readable one, is absent (404), not «no pertenece» (400)', async () => {
      const { status, body } = await call('GET', T1, 'mod-3', 'ind-3');
      // mod-3 belongs to the draft: not readable for this consultor → absent.
      expect(status).toBe(404);
      expect(body).toEqual({ error: 'Módulo no encontrado' });
    });
  });

  describe('an admin: everything as today', () => {
    beforeEach(() => {
      mockGetApiUser.mockResolvedValue({ user: { id: ADMIN }, error: null });
      mockCreateApiSupabaseClient.mockResolvedValue(client('admin', null));
      service = client('admin', null);
      mockCreateServiceRoleClient.mockReturnValue(service);
    });

    it('GET a draft\'s indicator: 200 with the indicator', async () => {
      const { status, body } = await call('GET', T3, 'mod-3', 'ind-3');
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.indicator.id).toBe('ind-3');
      expect(body.indicator.code).toBe('C-ind-3');
    });

    it('PUT: 200 with the updated indicator and snapshotUpdated', async () => {
      const { status, body } = await call('PUT', T3, 'mod-3', 'ind-3', { name: 'Nombre nuevo' });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.indicator.name).toBe('Nombre nuevo');
      expect(body.snapshotUpdated).toBe(true);
    });

    it('DELETE: 200 with today\'s message', async () => {
      const { status, body } = await call('DELETE', T3, 'mod-3', 'ind-3');
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, message: 'Indicador eliminado correctamente', snapshotUpdated: true });
    });

    it('a missing template, module or indicator: today\'s three answers', async () => {
      expect((await call('GET', 'tpl-inexistente', 'mod-3', 'ind-3')).body).toEqual({ error: 'Template no encontrado' });
      expect((await call('GET', T3, 'mod-x', 'ind-3')).body).toEqual({ error: 'Módulo no encontrado' });
      expect((await call('GET', T3, 'mod-3', 'ind-x')).body).toEqual({ error: 'Indicador no encontrado' });
      expect((await call('GET', T3, 'mod-1', 'ind-1')).status).toBe(400);
    });
  });
});
