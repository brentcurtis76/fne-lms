// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ED_ASSIGNABLE_ROLES,
  ED_FORBIDDEN_TARGET_ROLES,
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES,
  getEquipoDirectivoSchoolId,
} from '../../utils/roleUtils';

describe('ED_ASSIGNABLE_ROLES', () => {
  it('includes the five ED-assignable role types', () => {
    expect(ED_ASSIGNABLE_ROLES).toContain('docente');
    expect(ED_ASSIGNABLE_ROLES).toContain('lider_comunidad');
    expect(ED_ASSIGNABLE_ROLES).toContain('lider_generacion');
    expect(ED_ASSIGNABLE_ROLES).toContain('equipo_directivo');
    expect(ED_ASSIGNABLE_ROLES).toContain('encargado_licitacion');
  });

  it('excludes FNE/network-only roles', () => {
    expect(ED_ASSIGNABLE_ROLES).not.toContain('admin');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('consultor');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('community_manager');
    expect(ED_ASSIGNABLE_ROLES).not.toContain('supervisor_de_red');
  });
});

// F4 (phase 16.1): ED_FORBIDDEN_TARGET_ROLES is an explicit constant for
// "roles whose presence on a target user blocks ED from mutating that user".
// Today it's identical to (all roles \ SCHOOL_SCOPED_ROLES), but the
// decoupling means a future non-school-scoped-but-ED-safe role can be added
// without re-enabling ED access through the global-vs-scoped proxy.
describe('ED_FORBIDDEN_TARGET_ROLES', () => {
  it('contains the four FNE/network-only roles', () => {
    expect(ED_FORBIDDEN_TARGET_ROLES).toEqual([
      'admin',
      'consultor',
      'community_manager',
      'supervisor_de_red',
    ]);
  });

  it('is disjoint from SCHOOL_SCOPED_ROLES (target-role gate ≠ school-scope filter)', () => {
    const overlap = ED_FORBIDDEN_TARGET_ROLES.filter((r) =>
      (SCHOOL_SCOPED_ROLES as readonly string[]).includes(r),
    );
    expect(overlap).toEqual([]);
  });

  it('is disjoint from ED_ASSIGNABLE_ROLES (ED cannot grant the role it cannot target)', () => {
    const overlap = ED_FORBIDDEN_TARGET_ROLES.filter((r) =>
      (ED_ASSIGNABLE_ROLES as readonly string[]).includes(r),
    );
    expect(overlap).toEqual([]);
  });

  it('set form provides O(1) membership for all entries', () => {
    for (const r of ED_FORBIDDEN_TARGET_ROLES) {
      expect(ED_FORBIDDEN_TARGET_ROLES_SET.has(r)).toBe(true);
    }
    expect(ED_FORBIDDEN_TARGET_ROLES_SET.has('docente')).toBe(false);
    expect(ED_FORBIDDEN_TARGET_ROLES_SET.has('equipo_directivo')).toBe(false);
  });
});

function buildSupabaseFor(rows: unknown[] | null, error: unknown = null) {
  const resolved = { data: rows, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolved);
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return { from: vi.fn(() => new Proxy({}, handler)) } as any;
}

describe('getEquipoDirectivoSchoolId — multi-ED invariant', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns the school_id when the user has exactly one active ED row', async () => {
    const supabase = buildSupabaseFor([{ id: 1, school_id: 42 }]);
    const result = await getEquipoDirectivoSchoolId(supabase, 'user-1');
    expect(result).toBe(42);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs error when the user has multiple active ED rows', async () => {
    const supabase = buildSupabaseFor([
      { id: 1, school_id: 42 },
      { id: 2, school_id: 99 },
    ]);
    const result = await getEquipoDirectivoSchoolId(supabase, 'user-1');
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '[roleUtils.getEquipoDirectivoSchoolId] multi-ED invariant violated',
      expect.objectContaining({
        userId: 'user-1',
        rows: [
          { id: 1, school_id: 42 },
          { id: 2, school_id: 99 },
        ],
      }),
    );
  });

  it('returns null when the user has no active ED row', async () => {
    const supabase = buildSupabaseFor([]);
    const result = await getEquipoDirectivoSchoolId(supabase, 'user-1');
    expect(result).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null when the single ED row has null school_id', async () => {
    const supabase = buildSupabaseFor([{ id: 1, school_id: null }]);
    const result = await getEquipoDirectivoSchoolId(supabase, 'user-1');
    expect(result).toBeNull();
  });

  it('returns null and logs error when the query errors', async () => {
    const supabase = buildSupabaseFor(null, { message: 'db error' });
    const result = await getEquipoDirectivoSchoolId(supabase, 'user-1');
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
