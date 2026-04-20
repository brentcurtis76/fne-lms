import { describe, it, expect } from 'vitest';
import { canTeach, TEACHING_ELIGIBLE_ROLES } from '../roleUtils';
import { UserRole, UserRoleType } from '../../types/roles';

const makeRole = (role_type: UserRoleType): UserRole =>
  ({ role_type } as unknown as UserRole);

describe('canTeach', () => {
  it('returns false for empty array', () => {
    expect(canTeach([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(canTeach(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(canTeach(undefined)).toBe(false);
  });

  it('returns true for single docente', () => {
    expect(canTeach([makeRole('docente')])).toBe(true);
  });

  it.each([
    'admin',
    'consultor',
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
  ] as const)('returns true for %s alone', (role) => {
    expect(canTeach([makeRole(role)])).toBe(true);
  });

  it('returns false for encargado_licitacion alone', () => {
    expect(canTeach([makeRole('encargado_licitacion')])).toBe(false);
  });

  it('returns false for community_manager alone', () => {
    expect(canTeach([makeRole('community_manager')])).toBe(false);
  });

  it('returns false for supervisor_de_red alone', () => {
    expect(canTeach([makeRole('supervisor_de_red')])).toBe(false);
  });

  it('returns true when excluded + included roles are mixed', () => {
    expect(
      canTeach([
        makeRole('encargado_licitacion'),
        makeRole('docente'),
      ])
    ).toBe(true);
  });

  it('exposes the expected eligible role list', () => {
    expect(TEACHING_ELIGIBLE_ROLES).toEqual([
      'docente',
      'admin',
      'consultor',
      'equipo_directivo',
      'lider_generacion',
      'lider_comunidad',
    ]);
  });
});
