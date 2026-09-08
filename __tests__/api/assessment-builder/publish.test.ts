// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  OBJECTIVE_A,
  IND_COBERTURA_1,
  IND_FRECUENCIA_1,
  IND_PROFUNDIDAD_1,
  buildChainableQuery,
} from './_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasReadPerm,
  mockHasWritePerm,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any, methods: string[]) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/publish';

/** Draft template + one objective/module/indicator: the minimal publishable fixture. */
function publishableFixture(extraIndicators: Array<Record<string, unknown>> = []) {
  const template = {
    id: TEMPLATE_DRAFT_1,
    area: 'evaluacion',
    status: 'draft',
    is_archived: false,
    grade_id: 7,
    version: '1.0.0',
    name: 'Test Template',
    description: null,
    scoring_config: { level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 }, default_weights: { objective: 1, module: 1, indicator: 1 } },
    created_at: new Date().toISOString(),
    grade: { id: 7, name: '1° Básico', is_always_gt: true },
  };
  const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
  const module = { id: MODULE_A, name: 'Módulo A', display_order: 1, weight: 1.0, objective_id: OBJECTIVE_A };
  const indicator = { id: IND_COBERTURA_1, name: 'Ind 1', category: 'cobertura', weight: 1, module_id: MODULE_A, display_order: 1 };
  const snapshot = { id: 'snap1', version: '1.1.0', created_at: new Date().toISOString() };

  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery(template);
      if (table === 'assessment_objectives') return buildChainableQuery([objective]);
      if (table === 'assessment_modules') return buildChainableQuery([module]);
      if (table === 'assessment_indicators') return buildChainableQuery([indicator, ...extraIndicators]);
      if (table === 'assessment_year_expectations') return buildChainableQuery([]);
      if (table === 'assessment_template_snapshots') return buildChainableQuery(snapshot);
      return buildChainableQuery([]);
    }),
  };
  return { template, mockClient };
}

const VALID_FREQUENCY_CONFIG = { type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] };

function frecuenciaIndicator(id: string, code: string, frequency_config: unknown) {
  return { id, code, name: `Frecuencia ${code}`, category: 'frecuencia', weight: 1, module_id: MODULE_A, display_order: 2, frequency_config };
}

function adminSession(mockClient: { from: unknown }) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
}

describe('POST /api/.../templates/[id]/publish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(template)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when template has no modules', async () => {
    const template = { id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false, grade_id: 7 };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([]);
        if (table === 'assessment_modules') return buildChainableQuery([]); // no modules
        if (table === 'ab_grades') return buildChainableQuery({ id: 7, is_always_gt: false });
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when modules have no objective_id', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false,
      grade_id: 7, grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };
    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    const moduleNoObj = { id: MODULE_A, name: 'Módulo sin objetivo', display_order: 1, weight: 1.0, objective_id: null };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([moduleNoObj]);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('sin objetivo');
  });

  it('returns 400 when modules reference objectives from another template', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false,
      grade_id: 7, grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };
    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    // Module references an objective NOT in the template's objective list
    const moduleBadRef = { id: MODULE_A, name: 'Módulo con ref inválida', display_order: 1, weight: 1.0, objective_id: 'foreign-objective-id' };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([moduleBadRef]);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('no pertenecen a este template');
  });

  it('snapshot includes objectives hierarchy when template has objectives', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1,
      area: 'evaluacion',
      status: 'draft',
      is_archived: false,
      grade_id: 7,
      version: '1.0.0',
      name: 'Test Template',
      description: null,
      scoring_config: { level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 }, default_weights: { objective: 1, module: 1, indicator: 1 } },
      created_at: new Date().toISOString(),
      grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };

    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    const module = { id: MODULE_A, name: 'Módulo A', display_order: 1, weight: 1.0, objective_id: OBJECTIVE_A };
    const indicator = { id: IND_COBERTURA_1, name: 'Ind 1', category: 'cobertura', weight: 1, module_id: MODULE_A, display_order: 1 };
    const snapshot = { id: 'snap1', version: '1.1.0', created_at: new Date().toISOString() };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([module]);
        if (table === 'assessment_indicators') return buildChainableQuery([indicator]);
        if (table === 'assessment_year_expectations') return buildChainableQuery([]);
        if (table === 'assessment_template_snapshots') return buildChainableQuery(snapshot);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    // Should succeed (200) and include objectives in snapshot
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    // The removed upgrade path never reports anything
    expect(body).not.toHaveProperty('upgrade');
  });

  // ── PR 3 item 2: frecuencia indicators must be fully configured ──
  describe('frequency_config hard gate', () => {
    async function publish(mockClient: { from: unknown }) {
      adminSession(mockClient);
      const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_DRAFT_1 } });
      await handler(req as any, res as any);
      return { status: res._getStatusCode(), body: JSON.parse(res._getData()), mockClient };
    }

    it('publishes when every frecuencia indicator has a complete config', async () => {
      const { mockClient } = publishableFixture([frecuenciaIndicator(IND_FRECUENCIA_1, 'F1', VALID_FREQUENCY_CONFIG)]);
      const r = await publish(mockClient);
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    });

    it('fails 400 (no snapshot written) when a frecuencia indicator only has the legacy { unit } config', async () => {
      const { mockClient } = publishableFixture([frecuenciaIndicator(IND_FRECUENCIA_1, 'F1', { unit: 'veces' })]);
      const r = await publish(mockClient);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('invalid_frequency_config');
      expect(r.body.error).toContain('No se puede publicar: 1 indicador(es) de frecuencia sin configuración válida');
      expect(r.body.error).toContain('F1');
      expect(r.body.details).toEqual([
        { indicator: 'F1', errors: expect.arrayContaining(['el valor máximo debe ser un número']) },
      ]);
      expect((mockClient as any).from).not.toHaveBeenCalledWith('assessment_template_snapshots');
    });

    it('lists every offending indicator and ignores non-frecuencia indicators', async () => {
      const { mockClient } = publishableFixture([
        frecuenciaIndicator(IND_FRECUENCIA_1, 'F1', null),
        frecuenciaIndicator('ab000004-0000-0000-0000-000000000009', 'F2', { ...VALID_FREQUENCY_CONFIG, min: 10, max: 10 }),
        { id: IND_PROFUNDIDAD_1, code: 'P1', name: 'Prof', category: 'profundidad', weight: 1, module_id: MODULE_A, display_order: 3, frequency_config: null },
      ]);
      const r = await publish(mockClient);
      expect(r.status).toBe(400);
      expect(r.body.error).toContain('2 indicador(es)');
      expect(r.body.details.map((d: any) => d.indicator)).toEqual(['F1', 'F2']);
      expect(r.body.details[1].errors).toEqual(['el valor mínimo debe ser menor que el máximo']);
    });

    it('rejects a default unit outside allowed_units and a non-positive step', async () => {
      const { mockClient } = publishableFixture([
        frecuenciaIndicator(IND_FRECUENCIA_1, 'F1', { ...VALID_FREQUENCY_CONFIG, unit: 'dia', step: 0 }),
      ]);
      const r = await publish(mockClient);
      expect(r.status).toBe(400);
      expect(r.body.details[0].errors).toEqual([
        'el paso debe ser un número mayor que 0',
        'la unidad por defecto debe estar entre los períodos permitidos',
      ]);
    });

    it('falls back to the indicator name in the list when it has no code', async () => {
      const { mockClient } = publishableFixture([
        { ...frecuenciaIndicator(IND_FRECUENCIA_1, '', {}), code: null, name: 'Sin código' },
      ]);
      const r = await publish(mockClient);
      expect(r.status).toBe(400);
      expect(r.body.error).toContain('Sin código');
    });
  });

  // ── PROC-CONTAIN-01 (A-01): upgradeExisting containment ──────────
  describe('upgradeExisting containment', () => {
    it('rejects upgradeExisting:true with 409 before any read or publication write', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      const body = JSON.parse(res._getData());
      expect(body.code).toBe('upgrade_existing_disabled');
      expect(body.error).toContain('deshabilitada');
      // Zero database access: no template read, no snapshot insert, no status update
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('rejects any truthy upgradeExisting value (e.g. the string "true")', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: 'true' },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('still publishes when upgradeExisting is false (older clients) and reports no upgrade', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: false },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body).not.toHaveProperty('upgrade');
      expect(mockClient.from).toHaveBeenCalledWith('assessment_template_snapshots');
    });

    it('keeps the auth → permission ordering ahead of the 409', async () => {
      mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });
      const unauth = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(unauth.req as any, unauth.res as any);
      expect(unauth.res._getStatusCode()).toBe(401);

      const { mockClient } = publishableFixture();
      mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
      mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
      mockHasReadPerm.mockResolvedValue(true);
      mockHasWritePerm.mockResolvedValue(false);
      const forbidden = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(forbidden.req as any, forbidden.res as any);
      expect(forbidden.res._getStatusCode()).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// Codex round 2, finding A — the REAL publish endpoint enforces the shared
// contract: it refuses every modern config the responses API would 422 on,
// and publishes every one it accepts.
// ---------------------------------------------------------------------------
import { FREQUENCY_CONTRACT_CASES } from '../../fixtures/frequency-config-contract';

describe('POST /api/.../publish — frequency contract parity with the responses API', () => {
  beforeEach(() => vi.clearAllMocks());

  async function publishWith(frequency_config: unknown) {
    const { mockClient } = publishableFixture([frecuenciaIndicator(IND_FRECUENCIA_1, 'F1', frequency_config)]);
    adminSession(mockClient);
    const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_DRAFT_1 } });
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), body: JSON.parse(res._getData()), mockClient };
  }

  it('refuses the Codex example (step 2 in a 0..1 range) with 400 invalid_frequency_config and writes no snapshot', async () => {
    const r = await publishWith({ type: 'count', min: 0, max: 1, step: 2, unit: 'dia', allowed_units: ['dia'] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_frequency_config');
    expect(r.body.details).toEqual([{ indicator: 'F1', errors: ['el paso no puede ser mayor que el rango (máximo − mínimo)'] }]);
    expect((r.mockClient as any).from).not.toHaveBeenCalledWith('assessment_template_snapshots');
  });

  it('publishes the boundary config (step == max − min)', async () => {
    const r = await publishWith({ type: 'count', min: 0, max: 1, step: 1, unit: 'dia', allowed_units: ['dia'] });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('publishes the Codex decimal boundary (step 0.2 in 0.1..0.3; finding 2) and still refuses a step wider by 2e-7', async () => {
    const ok = await publishWith({ type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    const wide = await publishWith({ type: 'count', min: 0.1, max: 0.3, step: 0.2000002, unit: 'dia', allowed_units: ['dia'] });
    expect(wide.status).toBe(400);
    expect(wide.body.code).toBe('invalid_frequency_config');
    expect(wide.body.details).toEqual([{ indicator: 'F1', errors: ['el paso no puede ser mayor que el rango (máximo − mínimo)'] }]);
    expect((wide.mockClient as any).from).not.toHaveBeenCalledWith('assessment_template_snapshots');
  });

  it.each(FREQUENCY_CONTRACT_CASES.map((c) => [c.label, c.valid, c.config] as const))(
    '%s → publish verdict matches the shared contract (valid=%s)',
    async (_label, valid, config) => {
      const r = await publishWith(config);
      if (valid) {
        expect(r.status).toBe(200);
      } else {
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('invalid_frequency_config');
        expect((r.mockClient as any).from).not.toHaveBeenCalledWith('assessment_template_snapshots');
      }
    }
  );
});
