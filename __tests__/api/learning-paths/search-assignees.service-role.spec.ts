import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/learning-paths/search-assignees';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient } from '../../../lib/api-auth';
import { LearningPathsService } from '../../../lib/services/learningPathsService';

// Mock the auth and database modules
jest.mock('../../../lib/api-auth');
jest.mock('../../../lib/services/learningPathsService');

describe('/api/learning-paths/search-assignees', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'admin@test.com',
    user_metadata: { roles: ['admin'] }
  };

  const mockServiceClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn()
  };

  const mockSessionClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getApiUser as jest.Mock).mockResolvedValue({ user: mockUser, error: null });
    (createApiSupabaseClient as jest.Mock).mockResolvedValue(mockSessionClient);
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceClient);
    (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(true);
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 when user is not authenticated', async () => {
      (getApiUser as jest.Mock).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'users',
          query: ''
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({ error: 'Authentication required' });
    });

    it('should return 403 when user lacks manage permission', async () => {
      (LearningPathsService.hasManagePermission as jest.Mock).mockResolvedValue(false);

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'users',
          query: ''
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({ 
        error: 'You do not have permission to assign learning paths' 
      });
    });
  });

  describe('Service Role Client Usage', () => {
    it('should use service role client for user_roles when schoolId is provided', async () => {
      const mockUserRoles = [
        { user_id: 'user-1' },
        { user_id: 'user-2' }
      ];

      mockServiceClient.select.mockResolvedValueOnce({ 
        data: mockUserRoles, 
        error: null 
      });

      mockServiceClient.select.mockResolvedValueOnce({ 
        data: [
          { id: 'user-1', first_name: 'John', last_name: 'Doe', email: 'john@test.com' },
          { id: 'user-2', first_name: 'Jane', last_name: 'Smith', email: 'jane@test.com' }
        ], 
        count: 2,
        error: null 
      });

      mockSessionClient.select.mockResolvedValueOnce({
        data: { id: 'test-path-id' },
        error: null
      });

      mockSessionClient.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'users',
          query: '',
          schoolId: 'test-school-id',
          page: 1,
          pageSize: 20
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(createServiceRoleClient).toHaveBeenCalled();
      
      // Verify service client was used for user_roles query
      expect(mockServiceClient.from).toHaveBeenCalledWith('user_roles');
      expect(mockServiceClient.eq).toHaveBeenCalledWith('school_id', 'test-school-id');
    });

    it('should use service role client for group member counts', async () => {
      const mockUserRoles = [
        { community_id: 'comm-1' },
        { community_id: 'comm-2' }
      ];

      const mockGroups = [
        { id: 'group-1', name: 'Group 1', community_id: 'comm-1' },
        { id: 'group-2', name: 'Group 2', community_id: 'comm-2' }
      ];

      mockServiceClient.select.mockResolvedValueOnce({ 
        data: mockUserRoles, 
        error: null 
      });

      mockSessionClient.select.mockResolvedValueOnce({
        data: { id: 'test-path-id' },
        error: null
      });

      mockSessionClient.select.mockResolvedValueOnce({ 
        data: mockGroups, 
        count: 2,
        error: null 
      });

      // Mock for member counts query (should use service client)
      mockServiceClient.select.mockResolvedValueOnce({
        data: [
          { community_id: 'comm-1' },
          { community_id: 'comm-1' },
          { community_id: 'comm-2' }
        ],
        error: null
      });

      mockSessionClient.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'groups',
          query: '',
          schoolId: 'test-school-id',
          page: 1,
          pageSize: 20
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      // Verify service client was used for both queries
      expect(createServiceRoleClient).toHaveBeenCalled();
      expect(mockServiceClient.from).toHaveBeenCalledWith('user_roles');
    });
  });

  describe('Response Shape and Pagination', () => {
    it('should return correct response shape with pagination info', async () => {
      mockSessionClient.select.mockResolvedValueOnce({
        data: { id: 'test-path-id' },
        error: null
      });

      mockSessionClient.select.mockResolvedValueOnce({ 
        data: [
          { id: 'user-1', first_name: 'John', last_name: 'Doe', email: 'john@test.com' }
        ], 
        count: 50,
        error: null 
      });

      mockSessionClient.select.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'users',
          query: 'john',
          page: 1,
          pageSize: 20
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      const response = JSON.parse(res._getData());
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('hasMore');
      expect(response).toHaveProperty('totalCount');
      expect(response).toHaveProperty('page');
      expect(response).toHaveProperty('pageSize');
      
      expect(response.hasMore).toBe(true); // 50 total, showing 20
      expect(response.totalCount).toBe(50);
      expect(response.page).toBe(1);
      expect(response.pageSize).toBe(20);
    });

    it('should handle empty results correctly', async () => {
      mockSessionClient.select.mockResolvedValueOnce({
        data: { id: 'test-path-id' },
        error: null
      });

      mockSessionClient.select.mockResolvedValueOnce({ 
        data: [], 
        count: 0,
        error: null 
      });

      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'users',
          query: 'nonexistent',
          page: 1,
          pageSize: 20
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      const response = JSON.parse(res._getData());
      expect(response.results).toEqual([]);
      expect(response.hasMore).toBe(false);
      expect(response.totalCount).toBe(0);
    });
  });

  describe('Input Validation', () => {
    it('should return 400 for missing required fields', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          // Missing pathId and searchType
          query: 'test'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({ 
        error: 'pathId, searchType, and query are required' 
      });
    });

    it('should return 400 for invalid searchType', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          pathId: 'test-path-id',
          searchType: 'invalid',
          query: ''
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({ 
        error: 'searchType must be either "users" or "groups"' 
      });
    });

    it('should return 405 for non-POST methods', async () => {
      const { req, res } = createMocks({
        method: 'GET'
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getHeaders()).toHaveProperty('allow', 'POST');
    });
  });
});