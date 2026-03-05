// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  DOCENTE_UUID,
  ADMIN_UUID,
  INSTANCE_PENDING,
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

import handler from '../../../pages/api/docente/assessments/index';

describe('GET /api/docente/assessments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 200 with assessments for authenticated docente', async () => {
    const assignees = [
      {
        id: 'assign-1',
        instance_id: INSTANCE_PENDING,
        can_edit: true,
        can_submit: true,
        has_started: false,
        has_submitted: false,
        assessment_instances: {
          id: INSTANCE_PENDING,
          status: 'pending',
          transformation_year: 2,
          assessment_template_snapshots: {
            id: 'snap-1',
            snapshot_data: { template: { name: 'Test', area: 'evaluacion' } },
          },
        },
      },
    ];

    const mockClient = {
      from: vi.fn(() => buildChainableQuery(assignees)),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.assessments).toBeDefined();
  });

  it('returns 405 for non-GET methods', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });
});
