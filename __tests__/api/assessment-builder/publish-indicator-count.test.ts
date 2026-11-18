// @vitest-environment node
/**
 * GC-2: «Publicar» said «El template debe tener al menos un indicador» for an
 * instrument that has indicators, until a práctica was opened: the editor
 * counted only the indicators already loaded into the page. The page now
 * decides with the real count the modules list already carries
 * (indicator_count); the publish route keeps refusing an instrument with no
 * indicators, with the same message, before anything is written.
 * Synthetic ids only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { ADMIN_UUID, TEMPLATE_DRAFT_1, MODULE_A, OBJECTIVE_A, IND_COBERTURA_1, buildChainableQuery } from './_helpers';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockHasWritePerm, mockRpc } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasWritePerm: vi.fn(),
  // GC-10 send-back 1: snapshot + flip are one service-role call.
  mockRpc: vi.fn(async () => ({
    data: {
      ok: true,
      version: '1.1.0',
      template: { id: 'tpl', name: 'Instrumento Sintético', area: 'evaluacion', status: 'published', version: '1.1.0' },
      snapshot: { id: 'snap-1', version: '1.1.0', created_at: '2026-01-02T00:00:00Z' },
    },
    error: null,
  })),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: vi.fn().mockResolvedValue(true),
  hasAssessmentWritePermission: mockHasWritePerm,
}));

vi.mock('../../../components/layout/MainLayout', () => ({ default: () => null }));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({ ResponsiveFunctionalPageHeader: () => null }));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/publish';
import { publishIndicatorBlocker } from '../../../pages/admin/assessment-builder/[templateId]/index';

const NO_INDICATORS = 'El template debe tener al menos un indicador para ser publicado';

function fixture(indicators: unknown[]) {
  const template = {
    id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false, grade_id: 9, version: '1.0.0',
    name: 'Instrumento Sintético', description: null, scoring_config: {}, created_at: '2026-01-01T00:00:00Z',
    grade: { id: 9, name: '5° Básico', is_always_gt: false },
  };
  const writes: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      const data =
        table === 'assessment_templates' ? template
          : table === 'assessment_objectives' ? [{ id: OBJECTIVE_A, name: 'Proceso sintético', display_order: 1, weight: 1 }]
            : table === 'assessment_modules' ? [{ id: MODULE_A, name: 'Práctica sintética', display_order: 1, weight: 1, objective_id: OBJECTIVE_A }]
              : table === 'assessment_indicators' ? indicators
                : table === 'assessment_template_snapshots' ? { id: 'snap-1', version: '1.1.0', created_at: '2026-01-02T00:00:00Z' }
                  : table === 'ab_via_assignment_rules' ? [{ area: 'evaluacion', target: 'course_docente' }]
                    : [];
      const q: any = buildChainableQuery(data);
      return new Proxy(q, {
        get(t, prop) {
          if (prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'upsert') {
            writes.push(`${table}.${String(prop)}`);
            return () => buildChainableQuery(table === 'assessment_templates' ? { ...template, status: 'published', version: '1.1.0' } : data);
          }
          return (t as any)[prop];
        },
      });
    }),
  };
  return { client, writes };
}

async function publish(client: unknown) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockHasWritePerm.mockResolvedValue(true);
  const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_DRAFT_1 }, body: {} });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData()) };
}

describe('GC-2 publish route: indicators', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses an instrument with no indicators with the editor\'s message, and writes nothing', async () => {
    const { client, writes } = fixture([]);
    const r = await publish(client);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(NO_INDICATORS);
    expect(writes).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('publishes an instrument that has indicators', async () => {
    const { client, writes } = fixture([
      { id: IND_COBERTURA_1, code: 'C1', name: 'Indicador sintético', category: 'cobertura', weight: 1, module_id: MODULE_A, display_order: 1 },
    ]);
    const r = await publish(client);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    // GC-10 send-back 1: the snapshot and the flip are one publication call.
    expect(mockRpc).toHaveBeenCalledTimes(2); // GC-3b: publication, then delivery
    expect(writes).toEqual([]);
  });
});

describe('GC-2 editor publish decision', () => {
  it('does not refuse when the prácticas have indicators but none is loaded yet', () => {
    expect(
      publishIndicatorBlocker([
        { indicator_count: 3, indicatorsLoaded: false },
        { indicator_count: 0, indicatorsLoaded: false },
      ])
    ).toBeNull();
  });

  it('refuses when no práctica has an indicator', () => {
    expect(publishIndicatorBlocker([{ indicator_count: 0 }, { indicator_count: 0, indicators: [], indicatorsLoaded: true }])).toBe(NO_INDICATORS);
  });

  it('a loaded práctica counts what the page holds (an indicator deleted in the page is gone)', () => {
    expect(publishIndicatorBlocker([{ indicator_count: 2, indicators: [], indicatorsLoaded: true }])).toBe(NO_INDICATORS);
    expect(publishIndicatorBlocker([{ indicator_count: 0, indicators: [{}], indicatorsLoaded: true }])).toBeNull();
  });

  it('an indicator created in a práctica that was never opened counts', () => {
    expect(publishIndicatorBlocker([{ indicator_count: 0, indicators: [{}] }])).toBeNull();
  });
});
