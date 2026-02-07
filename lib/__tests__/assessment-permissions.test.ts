import { describe, it, expect, vi } from 'vitest';
import {
  hasAssessmentReadPermission,
  hasAssessmentWritePermission,
} from '../assessment-permissions';

/** Create a mock Supabase client that returns the given roles data */
function createMockClient(roles: { role_type: string }[] | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: roles }),
        }),
      }),
    }),
  };
}

describe('hasAssessmentReadPermission', () => {
  it('should return true for admin users', async () => {
    const client = createMockClient([{ role_type: 'admin' }]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(true);
  });

  it('should return true for consultor users', async () => {
    const client = createMockClient([{ role_type: 'consultor' }]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(true);
  });

  it('should return true when user has multiple roles including admin', async () => {
    const client = createMockClient([
      { role_type: 'estudiante' },
      { role_type: 'admin' },
    ]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(true);
  });

  it('should return true when user has multiple roles including consultor', async () => {
    const client = createMockClient([
      { role_type: 'estudiante' },
      { role_type: 'consultor' },
    ]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(true);
  });

  it('should return false for estudiante role', async () => {
    const client = createMockClient([{ role_type: 'estudiante' }]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(false);
  });

  it('should return false for supervisor_de_red role', async () => {
    const client = createMockClient([{ role_type: 'supervisor_de_red' }]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(false);
  });

  it('should return false for coordinador role', async () => {
    const client = createMockClient([{ role_type: 'coordinador' }]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(false);
  });

  it('should return false when roles array is empty', async () => {
    const client = createMockClient([]);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(false);
  });

  it('should return false when roles data is null', async () => {
    const client = createMockClient(null);
    expect(await hasAssessmentReadPermission(client, 'user-1')).toBe(false);
  });

  it('should query user_roles table with correct filters', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ data: [] });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const client = { from: mockFrom };

    await hasAssessmentReadPermission(client, 'test-user-id');

    expect(mockFrom).toHaveBeenCalledWith('user_roles');
    expect(mockSelect).toHaveBeenCalledWith('role_type');
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'test-user-id');
    expect(mockEq2).toHaveBeenCalledWith('is_active', true);
  });
});

describe('hasAssessmentWritePermission', () => {
  it('should return true for admin users', async () => {
    const client = createMockClient([{ role_type: 'admin' }]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(true);
  });

  it('should return false for consultor users', async () => {
    const client = createMockClient([{ role_type: 'consultor' }]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should return true when user has multiple roles including admin', async () => {
    const client = createMockClient([
      { role_type: 'estudiante' },
      { role_type: 'admin' },
    ]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(true);
  });

  it('should return false for estudiante role', async () => {
    const client = createMockClient([{ role_type: 'estudiante' }]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should return false for supervisor_de_red role', async () => {
    const client = createMockClient([{ role_type: 'supervisor_de_red' }]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should return false for coordinador role', async () => {
    const client = createMockClient([{ role_type: 'coordinador' }]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should return false when roles array is empty', async () => {
    const client = createMockClient([]);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should return false when roles data is null', async () => {
    const client = createMockClient(null);
    expect(await hasAssessmentWritePermission(client, 'user-1')).toBe(false);
  });

  it('should query user_roles table with correct filters', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ data: [] });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const client = { from: mockFrom };

    await hasAssessmentWritePermission(client, 'test-user-id');

    expect(mockFrom).toHaveBeenCalledWith('user_roles');
    expect(mockSelect).toHaveBeenCalledWith('role_type');
    expect(mockEq1).toHaveBeenCalledWith('user_id', 'test-user-id');
    expect(mockEq2).toHaveBeenCalledWith('is_active', true);
  });
});
