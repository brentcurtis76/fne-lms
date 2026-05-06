import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock the deeper dependencies that `getApiUser` and `createServiceRoleClient`
// rely on. Mocking the same module's exports (`getApiUser`,
// `createServiceRoleClient`) does not affect internal calls inside
// `lib/api-auth.ts`, so we control behavior by stubbing their dependencies.
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../utils/roleUtils', () => ({
  hasAdminPrivileges: vi.fn(),
  getEquipoDirectivoSchoolId: vi.fn(),
  extractRolesFromMetadata: vi.fn(() => []),
}));

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { hasAdminPrivileges, getEquipoDirectivoSchoolId } from '../../utils/roleUtils';
import { checkIsAdminOrEquipoDirectivo } from '../api-auth';

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockedCreateClient = vi.mocked(createClient);
const mockedHasAdminPrivileges = vi.mocked(hasAdminPrivileges);
const mockedGetEquipoDirectivoSchoolId = vi.mocked(getEquipoDirectivoSchoolId);

const mkUser = (id = 'user-1') => ({
  id,
  email: 'u@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-05-05T00:00:00.000Z',
} as any);

const req = { headers: {} } as unknown as NextApiRequest;
const res = {} as NextApiResponse;

const fakeServiceClient = { __service: true } as any;

function setSession(user: any | null, error: any = null) {
  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: user ? { user } : null },
        error,
      }),
    },
  };
  mockedCreateServerSupabaseClient.mockReturnValue(supabase as any);
  return supabase;
}

describe('checkIsAdminOrEquipoDirectivo', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    mockedCreateClient.mockReturnValue(fakeServiceClient);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    vi.restoreAllMocks();
  });

  it('returns unauthorized when there is no authenticated user', async () => {
    setSession(null);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result.isAuthorized).toBe(false);
    expect(result.role).toBeNull();
    expect(result.schoolId).toBeNull();
    expect(result.user).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(mockedHasAdminPrivileges).not.toHaveBeenCalled();
    expect(mockedGetEquipoDirectivoSchoolId).not.toHaveBeenCalled();
  });

  it('returns authorized admin with schoolId null when user is admin', async () => {
    const user = mkUser('admin-1');
    setSession(user);
    mockedHasAdminPrivileges.mockResolvedValue(true);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result).toEqual({
      isAuthorized: true,
      role: 'admin',
      schoolId: null,
      user,
      error: null,
    });
    expect(mockedHasAdminPrivileges).toHaveBeenCalledWith(fakeServiceClient, 'admin-1');
  });

  it('gives admin precedence when both admin and ED would match (does not call getEquipoDirectivoSchoolId)', async () => {
    const user = mkUser('dual-role');
    setSession(user);
    mockedHasAdminPrivileges.mockResolvedValue(true);
    // Even though this would return a number, it must never be called.
    mockedGetEquipoDirectivoSchoolId.mockResolvedValue(99);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result.isAuthorized).toBe(true);
    expect(result.role).toBe('admin');
    expect(result.schoolId).toBeNull();
    expect(mockedGetEquipoDirectivoSchoolId).not.toHaveBeenCalled();
  });

  it('returns authorized equipo_directivo with the resolved schoolId', async () => {
    const user = mkUser('ed-1');
    setSession(user);
    mockedHasAdminPrivileges.mockResolvedValue(false);
    mockedGetEquipoDirectivoSchoolId.mockResolvedValue(42);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result).toEqual({
      isAuthorized: true,
      role: 'equipo_directivo',
      schoolId: 42,
      user,
      error: null,
    });
    expect(mockedGetEquipoDirectivoSchoolId).toHaveBeenCalledWith(fakeServiceClient, 'ed-1');
  });

  it('returns unauthorized with the user when neither admin nor equipo_directivo', async () => {
    const user = mkUser('plain-user');
    setSession(user);
    mockedHasAdminPrivileges.mockResolvedValue(false);
    mockedGetEquipoDirectivoSchoolId.mockResolvedValue(null);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result).toEqual({
      isAuthorized: false,
      role: null,
      schoolId: null,
      user,
      error: null,
    });
  });

  it('returns an error result when hasAdminPrivileges throws', async () => {
    const user = mkUser('boom');
    setSession(user);
    const thrown = new Error('db kaboom');
    mockedHasAdminPrivileges.mockRejectedValue(thrown);

    const result = await checkIsAdminOrEquipoDirectivo(req, res);

    expect(result.isAuthorized).toBe(false);
    expect(result.role).toBeNull();
    expect(result.schoolId).toBeNull();
    expect(result.user).toBe(user);
    expect(result.error).toBe(thrown);
    expect(mockedGetEquipoDirectivoSchoolId).not.toHaveBeenCalled();
  });
});
