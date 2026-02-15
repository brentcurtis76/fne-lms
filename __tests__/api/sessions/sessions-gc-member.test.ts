// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/index';

// Mock dependencies
vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

describe('/api/sessions - GC Member Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET - GC Member with community', () => {
    it('should return sessions for the GC member\'s community (not drafts)', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      const mockSessions = [
        {
          id: 'session-1',
          title: 'Session 1',
          status: 'programada',
          growth_community_id: 'comm-123',
          session_date: '2026-03-01',
        },
        {
          id: 'session-2',
          title: 'Session 2',
          status: 'completada',
          growth_community_id: 'comm-123',
          session_date: '2026-02-15',
        },
      ];

      // Chain for GC member with no filters: from → select → eq(is_active) → in(growth_community_id) → neq(status) → range → order
      const mockOrderFn = vi.fn(() => Promise.resolve({
        data: mockSessions,
        error: null,
        count: mockSessions.length,
      }));
      const mockRangeFn = vi.fn(() => ({ order: mockOrderFn }));
      const mockNeqFn = vi.fn(() => ({ range: mockRangeFn }));
      const mockInFn = vi.fn(() => ({ neq: mockNeqFn }));
      const mockEqFn = vi.fn(() => ({ in: mockInFn }));
      const mockSelectFn = vi.fn(() => ({ eq: mockEqFn }));
      const mockFromFn = vi.fn(() => ({ select: mockSelectFn }));

      const mockClient = { from: mockFromFn };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: {},
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.data.sessions).toHaveLength(2);
      expect(mockInFn).toHaveBeenCalledWith('growth_community_id', ['comm-123']);
      expect(mockNeqFn).toHaveBeenCalledWith('status', 'borrador');
    });

    it('should exclude borrador sessions for GC members', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'docente',
          community_id: 'comm-123',
          school_id: 1,
        },
      ]);

      (getHighestRole as any).mockReturnValue('docente');

      let capturedNeqStatus: string | null = null;

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                neq: vi.fn((field: string, value: string) => {
                  if (field === 'status') {
                    capturedNeqStatus = value;
                  }
                  return {
                    range: vi.fn(() => ({
                      order: vi.fn(() => Promise.resolve({
                        data: [],
                        error: null,
                        count: 0,
                      })),
                    })),
                  };
                }),
              })),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: {},
      });

      await handler(req as any, res as any);

      expect(capturedNeqStatus).toBe('borrador');
    });

    it('should not return sessions from other communities', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      let capturedCommunityIds: string[] = [];

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn((field: string, values: string[]) => {
                if (field === 'growth_community_id') {
                  capturedCommunityIds = values;
                }
                return {
                  neq: vi.fn(() => ({
                    range: vi.fn(() => ({
                      order: vi.fn(() => Promise.resolve({
                        data: [],
                        error: null,
                        count: 0,
                      })),
                    })),
                  })),
                };
              }),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: {},
      });

      await handler(req as any, res as any);

      expect(capturedCommunityIds).toEqual(['comm-123']);
    });
  });

  describe('GET - GC Member without community', () => {
    it('should return empty result (not 403) when user has no community roles', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-no-comm' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'docente',
          community_id: null,
          school_id: 1,
        },
      ]);

      (getHighestRole as any).mockReturnValue('docente');

      const { req, res } = createMocks({
        method: 'GET',
        query: {},
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.data.sessions).toEqual([]);
      expect(data.data.total).toBe(0);
    });
  });

  describe('GET - GC Member with filters', () => {
    it('should filter by status when provided', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                neq: vi.fn(() => ({
                  in: vi.fn(() => ({
                    range: vi.fn(() => ({
                      order: vi.fn(() => Promise.resolve({
                        data: [],
                        error: null,
                        count: 0,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: { status: 'programada,en_progreso' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });

    it('should filter by date_from and date_to when provided', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                neq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    lte: vi.fn(() => ({
                      range: vi.fn(() => ({
                        order: vi.fn(() => Promise.resolve({
                          data: [],
                          error: null,
                          count: 0,
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: { date_from: '2026-02-01', date_to: '2026-03-31' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });

    it('should handle pagination correctly', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      let capturedRange: { from: number; to: number } | null = null;

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                neq: vi.fn(() => ({
                  range: vi.fn((from: number, to: number) => {
                    capturedRange = { from, to };
                    return {
                      order: vi.fn(() => Promise.resolve({
                        data: [],
                        error: null,
                        count: 0,
                      })),
                    };
                  }),
                })),
              })),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: { page: '2', limit: '10' },
      });

      await handler(req as any, res as any);

      expect(capturedRange).toEqual({ from: 10, to: 19 });
    });
  });

  describe('GET - GC Member with multiple communities', () => {
    it('should deduplicate community IDs and query all of them', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'gc-user-multi' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([
        {
          role_type: 'lider_comunidad',
          community_id: 'comm-123',
          school_id: null,
        },
        {
          role_type: 'docente',
          community_id: 'comm-456',
          school_id: 1,
        },
        {
          role_type: 'docente',
          community_id: 'comm-123', // duplicate
          school_id: 2,
        },
      ]);

      (getHighestRole as any).mockReturnValue('lider_comunidad');

      let capturedCommunityIds: string[] = [];

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn((field: string, values: string[]) => {
                if (field === 'growth_community_id') {
                  capturedCommunityIds = values;
                }
                return {
                  neq: vi.fn(() => ({
                    range: vi.fn(() => ({
                      order: vi.fn(() => Promise.resolve({
                        data: [],
                        error: null,
                        count: 0,
                      })),
                    })),
                  })),
                };
              }),
            })),
          })),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: {},
      });

      await handler(req as any, res as any);

      expect(capturedCommunityIds).toHaveLength(2);
      expect(capturedCommunityIds).toContain('comm-123');
      expect(capturedCommunityIds).toContain('comm-456');
    });
  });
});
