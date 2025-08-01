import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/learning-paths/search-assignees';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

// Mock the auth helpers
jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: jest.fn()
}));

// Mock the auth utilities
jest.mock('../../../lib/api-auth', () => ({
  getApiUser: jest.fn(),
  createApiSupabaseClient: jest.fn(),
  sendAuthError: jest.fn(),
  handleMethodNotAllowed: jest.fn()
}));

// Mock the service
jest.mock('../../../lib/services/learningPathsService', () => ({
  LearningPathsService: {
    hasManagePermission: jest.fn()
  }
}));

import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { LearningPathsService } from '../../../lib/services/learningPathsService';

describe('/api/learning-paths/search-assignees', () => {
  const mockSupabaseClient = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { id: 'path-123' }, error: null }))
        })),
        or: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => Promise.resolve({ 
              data: [], 
              count: 0, 
              error: null 
            }))
          }))
        })),
        in: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createApiSupabaseClient as jest.Mock).mockResolvedValue(mockSupabaseClient);
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    (handleMethodNotAllowed as jest.Mock).mockImplementation((res, methods) => {
      res.status(405).json({ error: 'Method not allowed' });
    });

    await handler(req, res);

    expect(handleMethodNotAllowed).toHaveBeenCalledWith(res, ['POST']);
  });

  it('should require authentication', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    (getApiUser as jest.Mock).mockResolvedValue({ user: null, error: 'Not authenticated' });
    (sendAuthError as jest.Mock).mockImplementation((res, message) => {
      res.status(401).json({ error: message });
    });

    await handler(req, res);

    expect(sendAuthError).toHaveBeenCalledWith(res, 'Authentication required');
  });

  it('should check user permissions', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        pathId: 'path-123',
        searchType: 'users',
        query: 'test',
        page: 1
      }
    });

    (getApiUser as jest.Mock).mockResolvedValue({ 
      user: { id: 'user-123' }, 
      error: null 
    });
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(false);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'You do not have permission to assign learning paths'
    });
  });

  it('should validate required parameters', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        // Missing required fields
      }
    });

    (getApiUser as jest.Mock).mockResolvedValue({ 
      user: { id: 'user-123' }, 
      error: null 
    });
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(true);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'pathId, searchType, and query are required'
    });
  });

  it('should return filtered user results with assignment status', async () => {
    const mockUsers = [
      { id: 'user-1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
      { id: 'user-2', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' }
    ];

    const mockAssignments = [
      { user_id: 'user-1' } // User 1 is already assigned
    ];

    // Setup the mock chain for users query
    const rangeResult = {
      data: mockUsers,
      count: 2,
      error: null
    };

    const orderMock = {
      range: jest.fn(() => Promise.resolve(rangeResult))
    };

    const orMock = {
      order: jest.fn(() => orderMock)
    };

    const selectMock = {
      or: jest.fn(() => orMock)
    };

    // Setup assignments query mock
    const assignmentsResult = {
      data: mockAssignments,
      error: null
    };

    const inMock = {
      in: jest.fn(() => Promise.resolve(assignmentsResult))
    };

    const eqMock = {
      eq: jest.fn(() => inMock)
    };

    const assignmentsSelectMock = {
      select: jest.fn(() => eqMock)
    };

    // Configure the from mock to return different mocks based on table name
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: jest.fn(() => selectMock) };
      } else if (table === 'learning_path_assignments') {
        return assignmentsSelectMock;
      } else if (table === 'learning_paths') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { id: 'path-123' }, error: null }))
            }))
          }))
        };
      }
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        pathId: 'path-123',
        searchType: 'users',
        query: 'john',
        page: 1,
        pageSize: 20
      }
    });

    (getApiUser as jest.Mock).mockResolvedValue({ 
      user: { id: 'user-123' }, 
      error: null 
    });
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(true);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const response = JSON.parse(res._getData());
    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toEqual({
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      isAlreadyAssigned: true
    });
    expect(response.results[1]).toEqual({
      id: 'user-2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      isAlreadyAssigned: false
    });
    expect(response.hasMore).toBe(false);
    expect(response.totalCount).toBe(2);
  });

  it('should handle pagination correctly', async () => {
    const mockGroups = Array(25).fill(null).map((_, i) => ({
      id: `group-${i}`,
      name: `Group ${i}`,
      description: `Description ${i}`
    }));

    // Setup for page 2 request
    const rangeResult = {
      data: mockGroups.slice(20, 25), // Page 2 results
      count: 50, // Total count
      error: null
    };

    const orderMock = {
      range: jest.fn(() => Promise.resolve(rangeResult))
    };

    const orMock = {
      order: jest.fn(() => orderMock)
    };

    const selectMock = {
      or: jest.fn(() => orMock)
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'groups') {
        return { select: jest.fn(() => selectMock) };
      } else if (table === 'learning_paths') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { id: 'path-123' }, error: null }))
            }))
          }))
        };
      } else {
        return {
          select: jest.fn(() => ({
            in: jest.fn(() => Promise.resolve({ data: [], error: null })),
            eq: jest.fn(() => ({
              in: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        };
      }
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        pathId: 'path-123',
        searchType: 'groups',
        query: 'group',
        page: 2,
        pageSize: 20
      }
    });

    (getApiUser as jest.Mock).mockResolvedValue({ 
      user: { id: 'user-123' }, 
      error: null 
    });
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(true);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const response = JSON.parse(res._getData());
    expect(response.results).toHaveLength(5);
    expect(response.hasMore).toBe(false); // No more pages after page 2
    expect(response.page).toBe(2);
    expect(response.totalCount).toBe(50);
    
    // Verify range was called with correct offset
    expect(orderMock.range).toHaveBeenCalledWith(20, 39); // offset 20, limit 20
  });

  it('should handle empty search results', async () => {
    const rangeResult = {
      data: [],
      count: 0,
      error: null
    };

    const orderMock = {
      range: jest.fn(() => Promise.resolve(rangeResult))
    };

    const selectMock = {
      order: jest.fn(() => orderMock)
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: jest.fn(() => selectMock) };
      } else if (table === 'learning_paths') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { id: 'path-123' }, error: null }))
            }))
          }))
        };
      }
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        pathId: 'path-123',
        searchType: 'users',
        query: '', // Empty query
        page: 1
      }
    });

    (getApiUser as jest.Mock).mockResolvedValue({ 
      user: { id: 'user-123' }, 
      error: null 
    });
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(true);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const response = JSON.parse(res._getData());
    expect(response.results).toHaveLength(0);
    expect(response.hasMore).toBe(false);
    expect(response.totalCount).toBe(0);
  });
});