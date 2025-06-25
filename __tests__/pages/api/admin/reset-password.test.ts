import { createMocks } from 'node-mocks-http';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../../../pages/api/admin/reset-password';
import { createClient } from '@supabase/supabase-js';

// Mock createClient for API tests
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

describe('/api/admin/reset-password', () => {
  let mockSupabaseClient: any;
  let mockGetUser: any;
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockSingle: any;
  let mockUpdateUserById: any;
  let mockUpdate: any;
  let mockInsert: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock chain for database queries
    mockSingle = vi.fn();
    mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: mockSelect, update: mockUpdate };
      }
      if (table === 'audit_logs') {
        return { insert: mockInsert };
      }
      return { select: mockSelect };
    });

    // Setup auth mocks
    mockGetUser = vi.fn();
    mockUpdateUserById = vi.fn();

    // Create mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: mockGetUser,
        admin: {
          updateUserById: mockUpdateUserById,
        },
      },
      from: mockFrom,
    };

    // Make createClient return our mock
    vi.mocked(createClient).mockReturnValue(mockSupabaseClient);
  });

  it('should reject non-POST requests', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Method not allowed',
    });
  });

  it('should reject requests without authorization header', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Unauthorized',
    });
  });

  it('should reject requests with invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid token',
    });
  });

  it('should reject requests from non-admin users', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { role: 'docente' },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'target-user-id',
        temporaryPassword: 'temp123',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Only admins can reset passwords',
    });
  });

  it('should reject requests without required fields', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-123' } },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'target-user-id',
        // Missing temporaryPassword
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'User ID and temporary password are required',
    });
  });

  it('should successfully reset password for admin user', async () => {
    const adminUser = { id: 'admin-123' };
    const targetUserId = 'target-user-id';
    const temporaryPassword = 'TempPass123!';

    // Mock successful auth check
    mockGetUser.mockResolvedValueOnce({
      data: { user: adminUser },
      error: null,
    });

    // Mock admin role check
    mockSingle.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    });

    // Mock successful password update
    mockUpdateUserById.mockResolvedValueOnce({
      data: { user: { id: targetUserId } },
      error: null,
    });

    // Mock successful profile update
    mockEq.mockReturnValueOnce({
      data: null,
      error: null,
    });

    // Mock successful audit log insert
    mockInsert.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: targetUserId,
        temporaryPassword,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      message: 'Password reset successfully',
      user: { id: targetUserId },
    });

    // Verify password update was called with correct parameters
    expect(mockUpdateUserById).toHaveBeenCalledWith(targetUserId, {
      password: temporaryPassword,
      user_metadata: {
        password_change_required: true,
        password_reset_by_admin: true,
        password_reset_at: expect.any(String),
      },
    });

    // Verify profile update was called
    expect(mockUpdate).toHaveBeenCalledWith({
      password_change_required: true,
      updated_at: expect.any(String),
    });

    // Verify audit log was created
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: adminUser.id,
      action: 'password_reset',
      details: {
        target_user_id: targetUserId,
        reset_by: 'admin',
        timestamp: expect.any(String),
      },
    });
  });

  it('should handle password update errors', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-123' } },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    });

    // Mock failed password update
    mockUpdateUserById.mockResolvedValueOnce({
      data: null,
      error: { message: 'Password update failed' },
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'target-user-id',
        temporaryPassword: 'temp123',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Failed to reset password',
    });
  });

  it('should continue even if profile update fails', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'admin-123' } },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: { role: 'admin' },
      error: null,
    });

    mockUpdateUserById.mockResolvedValueOnce({
      data: { user: { id: 'target-user-id' } },
      error: null,
    });

    // Mock failed profile update
    mockEq.mockReturnValueOnce({
      data: null,
      error: { message: 'Profile update failed' },
    });

    // Mock successful audit log
    mockInsert.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'target-user-id',
        temporaryPassword: 'temp123',
      },
    });

    await handler(req, res);

    // Should still succeed since password was updated
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      message: 'Password reset successfully',
      user: { id: 'target-user-id' },
    });
  });

  it('should handle unexpected errors gracefully', async () => {
    // Mock an unexpected error
    mockGetUser.mockRejectedValueOnce(new Error('Unexpected error'));

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'target-user-id',
        temporaryPassword: 'temp123',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Internal server error',
    });
  });
});