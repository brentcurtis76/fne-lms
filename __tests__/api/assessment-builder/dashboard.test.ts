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
