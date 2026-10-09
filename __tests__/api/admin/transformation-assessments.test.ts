// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

type Row = Record<string, any>;
type Operation = { table: string; method: string; args: unknown[] };

const { mockCreatePagesServerClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreatePagesServerClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: mockCreatePagesServerClient,
}));

// The verified caller comes from requireVerifiedCaller (SM-B015); its
// forged-cookie behaviour is covered with the other SM-B015 suites.
vi.mock('../../../lib/api-auth', () => ({
  // The caller-scoped client is the cookie client this suite builds.
  createApiSupabaseClient: async () => mockCreatePagesServerClient(),
  requireVerifiedCaller: async () => ({ user: { id: 'admin-1' }, status: null, body: null }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import handler from '../../../pages/api/admin/transformation-assessments';

function query(table: string, initialRows: Row[], operations: Operation[]) {
  let rows = [...initialRows];
  const chain: any = {};
  const record = (method: string, args: unknown[]) => operations.push({ table, method, args });

  chain.select = vi.fn((...args: unknown[]) => {
    record('select', args);
    return chain;
  });
  chain.eq = vi.fn((column: string, value: unknown) => {
    record('eq', [column, value]);
    rows = rows.filter((row) => row[column] === value);
    return chain;
  });
  chain.in = vi.fn((column: string, values: unknown[]) => {
    record('in', [column, values]);
    rows = rows.filter((row) => values.includes(row[column]));
    return chain;
  });
  chain.order = vi.fn((...args: unknown[]) => {
    record('order', args);
    return chain;
  });
  chain.or = vi.fn((filter: string) => {
    record('or', [filter]);
    const ids = /school_id\.in\.\(([^)]*)\)/.exec(filter)?.[1]
      ?.split(',')
      .map(Number)
      .filter(Number.isSafeInteger) ?? [];
    const keepNull = filter.split(',').includes('school_id.is.null');
    rows = rows.filter((row) => (row.school_id === null ? keepNull : ids.includes(Number(row.school_id))));
    return chain;
  });
  chain.then = (resolve: (result: { data: Row[]; error: null }) => void) => {
    resolve({ data: rows, error: null });
  };
  return chain;
}

describe('/api/admin/transformation-assessments', () => {
  const operations: Operation[] = [];
  let callerRoles: Row[];
  let consultantAssignments: Row[];
  let assignmentsError: unknown;

  function mountRoles() {
    const roleQuery = query('user_roles', callerRoles.map((r) => ({ user_id: 'admin-1', is_active: true, school_id: null, ...r })), operations);
    mockCreatePagesServerClient.mockReturnValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'admin-1' } } } }) },
      from: vi.fn((table: string) => {
        if (table !== 'user_roles') throw new Error(`unexpected session table ${table}`);
        return roleQuery;
      }),
    });
  }

  beforeEach(() => {
    operations.length = 0;
    mockCreatePagesServerClient.mockReset();
    mockCreateClient.mockReset();
    callerRoles = [{ role_type: 'admin' }];
    consultantAssignments = [];
    assignmentsError = null;
    mountRoles();

    let schoolsCall = 0;
    const assessments = [
      { id: 'client-assessment', area: 'aprendizaje', status: 'in_progress', school_id: 1, created_by: null, context_metadata: {}, schools: { id: 1, name: 'Client school' } },
      { id: 'other-client-assessment', area: 'aprendizaje', status: 'completed', school_id: 2, created_by: null, context_metadata: {}, schools: { id: 2, name: 'Other client school' } },
      { id: 'qa-assessment', area: 'aprendizaje', status: 'in_progress', school_id: 257, created_by: null, context_metadata: {}, schools: { id: 257, name: 'QA school' } },
      { id: 'operator-assessment', area: 'evaluacion', status: 'completed', school_id: 19, created_by: null, context_metadata: {}, schools: { id: 19, name: 'Operator school' } },
      { id: 'legacy-assessment', area: 'evaluacion', status: 'archived', school_id: null, created_by: null, context_metadata: {}, schools: null },
    ];
    const schools = [
      { id: 1, name: 'Client school', tenant_kind: 'client' },
      { id: 2, name: 'Other client school', tenant_kind: 'client' },
      { id: 19, name: 'Operator school', tenant_kind: 'operator' },
      { id: 257, name: 'QA school', tenant_kind: 'qa' },
    ];

    mockCreateClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'schools') {
          schoolsCall += 1;
          return query(table, schoolsCall === 1 ? schools : schools.map(({ id, name }) => ({ id, name })), operations);
        }
        if (table === 'transformation_assessments') return query(table, assessments, operations);
        if (table === 'transformation_assessment_collaborators') return query(table, [], operations);
        if (table === 'transformation_rubric') return query(table, [], operations);
        if (table === 'profiles') return query(table, [], operations);
        if (table === 'consultant_assignments') {
          const q = query(table, consultantAssignments, operations);
          if (assignmentsError) q.then = (resolve: (r: unknown) => void) => resolve({ data: null, error: assignmentsError });
          return q;
        }
        throw new Error(`unexpected admin table ${table}`);
      }),
    });
  });

  it('keeps QA/operator assessments and schools out of the official admin response', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.schoolGroups.map((group: Row) => group.school_id)).toEqual([1, 2]);
    expect(body.noSchoolAssessments.map((assessment: Row) => assessment.id)).toEqual(['legacy-assessment']);
    expect(body.schools.map((school: Row) => school.id)).toEqual([1, 2]);
    expect(body.stats).toMatchObject({ total: 3, schools_with_assessments: 2 });

    expect(operations).toContainEqual({
      table: 'transformation_assessments',
      method: 'or',
      args: ['school_id.is.null,school_id.in.(1,2)'],
    });
    expect(operations).toContainEqual({ table: 'schools', method: 'in', args: ['id', [1, 2]] });
    expect(operations.some((o) => o.table === 'consultant_assignments')).toBe(false);
  });

  describe('consultor (not admin)', () => {
    beforeEach(() => {
      callerRoles = [{ role_type: 'consultor' }];
      mountRoles();
    });

    it('sees only the client schools of their active assignments, and no legacy rows', async () => {
      consultantAssignments = [
        { consultant_id: 'admin-1', is_active: true, school_id: 1 },
        { consultant_id: 'admin-1', is_active: false, school_id: 2 },
        { consultant_id: 'admin-1', is_active: true, school_id: 257 },
        { consultant_id: 'someone-else', is_active: true, school_id: 2 },
      ];
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const body = res._getJSONData();
      expect(body.schoolGroups.map((group: Row) => group.school_id)).toEqual([1]);
      expect(body.noSchoolAssessments).toEqual([]);
      expect(body.schools.map((school: Row) => school.id)).toEqual([1]);
      expect(body.stats).toMatchObject({ total: 1, schools_with_assessments: 1 });
      expect(operations).toContainEqual({ table: 'transformation_assessments', method: 'or', args: ['school_id.in.(1)'] });
    });

    it('a school where the consultor is also an active directivo counts', async () => {
      callerRoles = [{ role_type: 'consultor' }, { role_type: 'equipo_directivo', school_id: 2 }];
      mountRoles();
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as any, res as any);

      expect(res._getJSONData().schoolGroups.map((group: Row) => group.school_id)).toEqual([2]);
    });

    it('asking for an unassigned school is refused before reading assessments', async () => {
      consultantAssignments = [{ consultant_id: 'admin-1', is_active: true, school_id: 1 }];
      const { req, res } = createMocks({ method: 'GET', query: { schoolId: '2' } });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(403);
      expect(operations.some((o) => o.table === 'transformation_assessments')).toBe(false);
    });

    it('with no assignments the answer is empty, not every school', async () => {
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const body = res._getJSONData();
      expect(body).toMatchObject({ schoolGroups: [], noSchoolAssessments: [], schools: [] });
      expect(body.stats.total).toBe(0);
      expect(operations.some((o) => o.table === 'transformation_assessments')).toBe(false);
    });

    it('fails closed when the assignments cannot be read', async () => {
      assignmentsError = { message: 'boom' };
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(500);
      expect(operations.some((o) => o.table === 'transformation_assessments')).toBe(false);
    });
  });

  it('an admin may filter by any client school', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { schoolId: '2' } });
    await handler(req as any, res as any);
    expect(res._getJSONData().schoolGroups.map((group: Row) => group.school_id)).toEqual([2]);
  });

  it.each([['abc'], ['1.0'], [['1']], [['1', '2']]])('an invalid schoolId %j is refused', async (schoolId) => {
    const { req, res } = createMocks({ method: 'GET', query: { schoolId: schoolId as any } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});
