// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  DOCENTE_UUID,
  DIRECTIVO_UUID,
  buildChainableQuery,
} from './_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
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

// Mock supabaseAdmin (used directly in school-results handler)
vi.mock('../../../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildChainableQuery([])),
  },
}));

// Mock scoring service functions (used in school-results handler)
vi.mock('../../../lib/services/assessment-builder/scoringService', () => ({
  getInstanceResults: vi.fn().mockResolvedValue(null),
  aggregateSchoolScores: vi.fn().mockReturnValue({ byArea: {}, overall: {} }),
  fetchInstanceGapAnalysis: vi.fn().mockResolvedValue(null),
  aggregateSchoolGapAnalysis: vi.fn().mockReturnValue({ byArea: {}, overall: {}, topCriticalIndicators: [] }),
}));

import schoolResultsHandler from '../../../pages/api/directivo/assessments/school-results';
import courseResultsHandler from '../../../pages/api/directivo/assessments/course-results';

describe('GET /api/directivo/assessments/school-results', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({ method: 'GET' });
    await schoolResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not directivo or admin', async () => {
    // Import the mock to configure it for this test
    const { supabaseAdmin } = await import('../../../lib/supabaseAdmin');
    (supabaseAdmin.from as any).mockReturnValue(
      buildChainableQuery([{ role_type: 'docente', school_id: null }])
    );

    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery([])),
    });

    const { req, res } = createMocks({ method: 'GET' });
    await schoolResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });
});

describe('GET /api/directivo/assessments/course-results', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({ method: 'GET' });
    await courseResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not directivo or admin', async () => {
    const { supabaseAdmin } = await import('../../../lib/supabaseAdmin');
    (supabaseAdmin.from as any).mockReturnValue(
      buildChainableQuery([{ role_type: 'docente', school_id: null }])
    );

    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery([])),
    });

    const { req, res } = createMocks({ method: 'GET' });
    await courseResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });
});

describe('results endpoints: a consultor reads only assigned schools', () => {
  beforeEach(() => vi.clearAllMocks());

  const consultorAssignedTo = async (schoolId: number) => {
    const { supabaseAdmin } = await import('../../../lib/supabaseAdmin');
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'consultor', school_id: null }]);
      if (table === 'consultant_assignments') {
        const filters: [string, unknown][] = [];
        const q: any = {
          select: () => q,
          eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
          then: (resolve: (v: unknown) => void) => {
            const rows = [{ consultant_id: DIRECTIVO_UUID, school_id: schoolId, is_active: true }];
            resolve({ data: rows.filter((r: any) => filters.every(([c, v]) => r[c] === v)), error: null });
          },
        };
        return q;
      }
      return buildChainableQuery([]);
    });
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({ from: vi.fn(() => buildChainableQuery([])) });
  };

  it('school-results refuses an unassigned school', async () => {
    await consultorAssignedTo(7);
    const { req, res } = createMocks({ method: 'GET', query: { school_id: '8' } });
    await schoolResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('course-results refuses an unassigned school', async () => {
    await consultorAssignedTo(7);
    const { req, res } = createMocks({ method: 'GET', query: { school_id: '8' } });
    await courseResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('course-results admits the assigned school', async () => {
    await consultorAssignedTo(7);
    const { req, res } = createMocks({ method: 'GET', query: { school_id: '7' } });
    await courseResultsHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });
});

describe('stored results only for non-admins (20261008120000)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a directivo never recalculates a missing result; it is reported as unavailable', async () => {
    // The scoringService mock has no calculateAndSaveScores: any recalculation
    // attempt would throw and turn this into a 500.
    const scoring = await import('../../../lib/services/assessment-builder/scoringService');
    const { supabaseAdmin } = await import('../../../lib/supabaseAdmin');
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'equipo_directivo', school_id: 5 }]);
      if (table === 'assessment_instances') {
        return buildChainableQuery([{ id: 'i1', completed_at: '2026-10-01', assessment_template_snapshots: { snapshot_data: { template: { area: 'liderazgo' } } }, school_course_structure: null }]);
      }
      return buildChainableQuery(null);
    });
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({ from: vi.fn(() => buildChainableQuery([])) });

    const { req, res } = createMocks({ method: 'GET' });
    await schoolResultsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).unavailableResults).toBe(1);
    expect((scoring as any).getInstanceResults).toHaveBeenCalledWith(expect.anything(), 'i1');
  });
});
