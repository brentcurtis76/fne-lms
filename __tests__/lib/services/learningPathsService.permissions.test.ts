// @vitest-environment node
/**
 * W-B2c-01 — the API-boundary half of "literal-admin-only management".
 *
 * `LearningPathsService.hasManagePermission` used to grant management to admin,
 * equipo_directivo AND consultor, and `canManagePath` added a `created_by` owner
 * shortcut. Both are retired by the owner decisions of 2026-08-29: only the literal
 * RBAC role `admin` manages global templates, and nobody owns a path.
 *
 * The client is a recording double: the assertion is on the QUERY the service issues
 * (an exact `role_type = 'admin'` predicate, never an IN list that could re-admit the
 * two over-privileged roles) as much as on the answer.
 */
import { describe, expect, it, vi } from 'vitest';
import { LearningPathsService } from '../../../lib/services/learningPathsService';

interface Recorded {
  table: string;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown]>;
}

function clientAnswering(rows: unknown[] | null, error: unknown = null) {
  const calls: Recorded[] = [];
  const client = {
    from: vi.fn((table: string) => {
      const rec: Recorded = { table, eqs: [], ins: [] };
      calls.push(rec);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        rec.eqs.push([col, val]);
        return chain;
      };
      chain.in = (col: string, vals: unknown) => {
        rec.ins.push([col, vals]);
        return chain;
      };
      chain.single = () => chain;
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error }).then(resolve, reject);
      return chain;
    }),
  };
  return { client, calls };
}

const USER = '11111111-1111-4111-8111-111111111111';
const PATH = '22222222-2222-4222-8222-222222222222';

describe('LearningPathsService.hasManagePermission — literal admin only', () => {
  it('asks user_roles for an ACTIVE row with role_type exactly admin', async () => {
    const { client, calls } = clientAnswering([{ role_type: 'admin' }]);
    await expect(LearningPathsService.hasManagePermission(client, USER)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('user_roles');
    expect(calls[0].eqs).toEqual([
      ['user_id', USER],
      ['is_active', true],
      ['role_type', 'admin'],
    ]);
    // The retired IN ('admin','equipo_directivo','consultor') predicate must not come back.
    expect(calls[0].ins).toEqual([]);
  });

  it('is false when the admin-filtered query returns no row (equipo_directivo / consultor / docente)', async () => {
    const { client } = clientAnswering([]);
    await expect(LearningPathsService.hasManagePermission(client, USER)).resolves.toBe(false);
  });

  it('is false on a query error or a thrown client', async () => {
    const { client } = clientAnswering(null, { message: 'synthetic' });
    await expect(LearningPathsService.hasManagePermission(client, USER)).resolves.toBe(false);

    const throwing = { from: () => { throw new Error('boom'); } };
    await expect(LearningPathsService.hasManagePermission(throwing, USER)).resolves.toBe(false);
  });
});

describe('LearningPathsService.canManagePath — no owner shortcut', () => {
  it('never consults learning_paths.created_by: a non-admin creator cannot manage "their" path', async () => {
    const { client, calls } = clientAnswering([]);
    await expect(LearningPathsService.canManagePath(client, PATH, USER)).resolves.toBe(false);
    expect(calls.map((c) => c.table)).toEqual(['user_roles']);
  });

  it('is exactly hasManagePermission for an admin', async () => {
    const { client, calls } = clientAnswering([{ role_type: 'admin' }]);
    await expect(LearningPathsService.canManagePath(client, PATH, USER)).resolves.toBe(true);
    expect(calls.map((c) => c.table)).toEqual(['user_roles']);
  });
});

/**
 * W-B2c-01 reporting scope (Brent 2026-10-02): the report DOOR (who may open the
 * learning-path reports at all). Which rows a reporter then sees is decided by the
 * report views (supabase/tests/101-lp-reporting-scope.sql). The double returns its
 * rows whatever the filters say, so the service must ALSO drop inactive rows itself.
 */
describe('LearningPathsService.getReportScope — the caller\'s own ACTIVE roles', () => {
  const SCHOOL = 7;
  it.each([
    ['admin', [{ role_type: 'admin', school_id: null, is_active: true }], 'all'],
    ['consultor (all schools)', [{ role_type: 'consultor', school_id: SCHOOL, is_active: true }], 'all'],
    ['consultor without a school', [{ role_type: 'consultor', school_id: null, is_active: true }], 'all'],
    ['equipo_directivo with a school', [{ role_type: 'equipo_directivo', school_id: SCHOOL, is_active: true }], 'school'],
    ['equipo_directivo + consultor', [
      { role_type: 'equipo_directivo', school_id: SCHOOL, is_active: true },
      { role_type: 'consultor', school_id: null, is_active: true },
    ], 'all'],
    ['equipo_directivo WITHOUT a school', [{ role_type: 'equipo_directivo', school_id: null, is_active: true }], null],
    ['docente', [{ role_type: 'docente', school_id: SCHOOL, is_active: true }], null],
    ['lider_comunidad', [{ role_type: 'lider_comunidad', school_id: SCHOOL, is_active: true }], null],
    ['supervisor_de_red', [{ role_type: 'supervisor_de_red', school_id: null, is_active: true }], null],
    ['no roles', [], null],
  ])('%s → %s', async (_label, rows, expected) => {
    const { client } = clientAnswering(rows);
    await expect(LearningPathsService.getReportScope(client, USER)).resolves.toBe(expected);
  });

  it('INACTIVE rows are ignored (an inactive admin / consultor / directivo opens nothing)', async () => {
    const { client } = clientAnswering([
      { role_type: 'admin', school_id: null, is_active: false },
      { role_type: 'consultor', school_id: SCHOOL, is_active: false },
      { role_type: 'equipo_directivo', school_id: SCHOOL, is_active: null },
      { role_type: 'docente', school_id: SCHOOL, is_active: true },
    ]);
    await expect(LearningPathsService.getReportScope(client, USER)).resolves.toBeNull();
  });

  it('an inactive consultor row does not lift an active directivo above their school', async () => {
    const { client } = clientAnswering([
      { role_type: 'consultor', school_id: null, is_active: false },
      { role_type: 'equipo_directivo', school_id: SCHOOL, is_active: true },
    ]);
    await expect(LearningPathsService.getReportScope(client, USER)).resolves.toBe('school');
  });

  it('asks only for the caller\'s own ACTIVE user_roles rows', async () => {
    const { client, calls } = clientAnswering([{ role_type: 'consultor', school_id: null, is_active: true }]);
    await LearningPathsService.getReportScope(client, USER);
    expect(calls.map((c) => c.table)).toEqual(['user_roles']);
    expect(calls[0].eqs).toEqual([['user_id', USER], ['is_active', true]]);
  });

  it('fails closed (null) on a query error or a thrown client', async () => {
    const { client } = clientAnswering(null, { message: 'synthetic' });
    await expect(LearningPathsService.getReportScope(client, USER)).resolves.toBeNull();
    const throwing = { from: () => { throw new Error('boom'); } };
    await expect(LearningPathsService.getReportScope(throwing, USER)).resolves.toBeNull();
  });
});
