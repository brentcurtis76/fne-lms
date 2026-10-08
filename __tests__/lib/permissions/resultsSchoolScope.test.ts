// @vitest-environment node
/**
 * resolveResultsSchoolId: consultores no longer read every school's results.
 * In-memory client EVALUATES the eq filters, so a refusal is a real predicate
 * mismatch.
 */
import { describe, it, expect } from 'vitest';
import { resolveResultsSchoolId } from '../../../lib/permissions/resultsSchoolScope';

function client(assignments: Record<string, unknown>[], fail = false) {
  return {
    from() {
      const filters: [string, unknown][] = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        then: (resolve: (v: unknown) => void) =>
          resolve(fail ? { data: null, error: { message: 'x' } } : { data: assignments.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }),
      };
      return q;
    },
  };
}

const U = 'u1';
const assigned = (school_id: number, is_active = true) => ({ consultant_id: U, school_id, is_active });

describe('resolveResultsSchoolId', () => {
  it('admin: any school, school_id required', async () => {
    expect(await resolveResultsSchoolId(client([]), U, [{ role_type: 'admin', school_id: null }], '7')).toEqual({ kind: 'ok', schoolId: 7 });
    expect((await resolveResultsSchoolId(client([]), U, [{ role_type: 'admin', school_id: null }], undefined)).kind).toBe('error');
  });

  it('consultor: only an actively assigned school', async () => {
    const roles = [{ role_type: 'consultor', school_id: null }];
    expect(await resolveResultsSchoolId(client([assigned(7)]), U, roles, '7')).toEqual({ kind: 'ok', schoolId: 7 });
    expect(await resolveResultsSchoolId(client([assigned(7)]), U, roles, '8')).toMatchObject({ kind: 'error', status: 403 });
    expect(await resolveResultsSchoolId(client([assigned(8, false)]), U, roles, '8')).toMatchObject({ kind: 'error', status: 403 });
  });

  it('consultor who is also directivo of the requested school is admitted', async () => {
    const roles = [{ role_type: 'consultor', school_id: null }, { role_type: 'equipo_directivo', school_id: 9 }];
    expect(await resolveResultsSchoolId(client([]), U, roles, '9')).toEqual({ kind: 'ok', schoolId: 9 });
  });

  it('consultor: a failed assignment read is refused', async () => {
    expect(await resolveResultsSchoolId(client([assigned(7)], true), U, [{ role_type: 'consultor', school_id: null }], '7'))
      .toMatchObject({ kind: 'error', status: 403 });
  });

  it('consultor: a malformed school_id is refused', async () => {
    expect(await resolveResultsSchoolId(client([]), U, [{ role_type: 'consultor', school_id: null }], 'abc'))
      .toMatchObject({ kind: 'error', status: 400 });
  });

  it('directivo: own school, the query is ignored (unchanged)', async () => {
    expect(await resolveResultsSchoolId(client([]), U, [{ role_type: 'equipo_directivo', school_id: 5 }], '99')).toEqual({ kind: 'ok', schoolId: 5 });
  });
});
