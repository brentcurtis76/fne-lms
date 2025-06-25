/**
 * Test Factory Functions for Consistent Mock Data
 */

import { vi } from 'vitest';

// User factory
export const createMockUser = (overrides: any = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'docente',
  school: 'Test School',
  school_id: 'school-123',
  created_at: '2024-01-01T00:00:00Z',
  approval_status: 'approved',
  ...overrides
});

// Session factory
export const createMockSession = (overrides: any = {}) => ({
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: createMockUser(overrides.user),
  ...overrides
});

// Supabase response factory
export const createSupabaseResponse = <T>(data: T, error: any = null) => ({
  data,
  error,
  count: null,
  status: error ? 400 : 200,
  statusText: error ? 'Bad Request' : 'OK'
});

// Profile factory
export const createMockProfile = (overrides: any = {}) => ({
  id: overrides.id || 'user-123',
  email: overrides.email || 'test@example.com',
  first_name: overrides.first_name || 'Test',
  last_name: overrides.last_name || 'User',
  role: overrides.role || 'docente',
  school: overrides.school || 'Test School',
  school_id: overrides.school_id || 'school-123',
  phone: null,
  avatar_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  approval_status: 'approved',
  approved_at: '2024-01-01T00:00:00Z',
  approved_by: 'admin-123',
  ...overrides
});

// API Request factory
export const createMockRequest = (overrides: any = {}) => ({
  method: 'GET',
  headers: {},
  query: {},
  body: null,
  ...overrides
});

// API Response factory
export const createMockResponse = () => {
  const res: any = {
    statusCode: 200,
    headers: {},
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: any) => {
      res._json = data;
      return res;
    }),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
};

// School factory
export const createMockSchool = (overrides: any = {}) => ({
  id: 'school-123',
  name: 'Test School',
  location: 'Test City',
  has_generations: false,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides
});

// Community factory
export const createMockCommunity = (overrides: any = {}) => ({
  id: 'community-123',
  name: 'Test Community',
  school_id: 'school-123',
  generation_id: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides
});