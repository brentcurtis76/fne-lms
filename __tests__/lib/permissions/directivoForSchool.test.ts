// @vitest-environment node
/**
 * hasDirectivoPermissionForSchool (20261008120000, Codex B2 r1): decided only
 * against the requested school, correct for people with several roles.
 * Uses the real helper with an in-memory client that EVALUATES the filters.
 */
import { describe, it, expect } from 'vitest';
import { hasDirectivoPermissionForSchool } from '../../../lib/permissions/directivo';

type Row = Record<string, unknown>;

function client(tables: Record<string, Row[]>, failTable?: string) {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return q;
        },
        then: (resolve: (v: unknown) => void) =>
          resolve(
            table === failTable
              ? { data: null, error: { message: 'boom' } }
              : { data: (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }
          ),
      };
      return q;
    },
  };
}

const U = 'user-1';
const role = (role_type: string, school_id: number | null, is_active = true) => ({ user_id: U, role_type, school_id, is_active });

describe('hasDirectivoPermissionForSchool', () => {
  it('a directivo at two schools is admitted at the second, with write scope', async () => {
    const c = client({ user_roles: [role('equipo_directivo', 1), role('equipo_directivo', 2)] });
    expect(await hasDirectivoPermissionForSchool(c, U, 2)).toMatchObject({ hasPermission: true, via: 'equipo_directivo', schoolId: 2 });
  });

  it('a directivo at A who is consultor assigned to B reads B as consultor', async () => {
    const c = client({
      user_roles: [role('equipo_directivo', 1), role('consultor', null)],
      consultant_assignments: [{ consultant_id: U, school_id: 2, is_active: true }],
    });
    expect(await hasDirectivoPermissionForSchool(c, U, 2)).toMatchObject({ hasPermission: true, via: 'consultor' });
  });

  it('a directivo of another school is refused', async () => {
    const c = client({ user_roles: [role('equipo_directivo', 1)] });
    expect((await hasDirectivoPermissionForSchool(c, U, 2)).hasPermission).toBe(false);
  });

  it('an inactive directivo role does not count', async () => {
    const c = client({ user_roles: [role('equipo_directivo', 2, false)] });
    expect((await hasDirectivoPermissionForSchool(c, U, 2)).hasPermission).toBe(false);
  });

  it('a consultor not assigned to the school is refused', async () => {
    const c = client({
      user_roles: [role('consultor', null)],
      consultant_assignments: [{ consultant_id: U, school_id: 1, is_active: true }],
    });
    expect((await hasDirectivoPermissionForSchool(c, U, 2)).hasPermission).toBe(false);
  });

  it('an admin is admitted anywhere', async () => {
    const c = client({ user_roles: [role('admin', null)] });
    expect(await hasDirectivoPermissionForSchool(c, U, 9)).toMatchObject({ hasPermission: true, isAdmin: true });
  });

  it('fails closed when roles cannot be read', async () => {
    const c = client({ user_roles: [role('admin', null)] }, 'user_roles');
    expect((await hasDirectivoPermissionForSchool(c, U, 2)).hasPermission).toBe(false);
  });
});
