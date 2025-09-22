import { describe, it, expect } from 'vitest';
import { resolvePrimaryRole } from '../UnifiedUserManagement';

type PartialUser = {
  id: string;
  email: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  role?: string;
  user_roles?: Array<{ role_type: string }>;
};

describe('resolvePrimaryRole', () => {
  const baseUser: PartialUser = {
    id: 'user-1',
    email: 'user@example.com',
    approval_status: 'approved',
  };

  it('returns the highest priority role when multiple roles exist', () => {
    const user: PartialUser = {
      ...baseUser,
      user_roles: [
        { role_type: 'docente' },
        { role_type: 'equipo_directivo' }
      ],
    };

    expect(resolvePrimaryRole(user as any)).toBe('equipo_directivo');
  });

  it('falls back to legacy role when structured roles are missing', () => {
    const user: PartialUser = {
      ...baseUser,
      role: 'docente',
      user_roles: [],
    };

    expect(resolvePrimaryRole(user as any)).toBe('docente');
  });

  it('returns null when no role information is available', () => {
    const user: PartialUser = {
      ...baseUser,
      user_roles: [],
    };

    expect(resolvePrimaryRole(user as any)).toBeNull();
  });
});
