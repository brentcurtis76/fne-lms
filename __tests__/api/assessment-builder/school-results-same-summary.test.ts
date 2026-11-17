// @vitest-environment node
/**
 * F8 send-back 2, T1: the admin, the school's directivo and an assigned
 * consultor get the SAME school summary for the same school.
 *
 * Cause pinned here: the route used to hand the caller's own session to
 * getInstanceResults / fetchInstanceGapAnalysis, which read
 * assessment_instances (joined to its snapshot) with it. The read rule
 * "assessment_instances_select" admits an admin, the school's directivo and
 * the registro's assignees — not a consultor. So for the consultor both
 * helpers lost the snapshot: the área fell back to 'personalizacion' and the
 * gap analysis came back empty.
 *
 * The caller-session client below applies that rule; the admin client sees
 * everything. The real scoringService helpers run against both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '00000000-0000-4000-8000-0000000f8b01';
const CONSULTOR = '00000000-0000-4000-8000-0000000f8b02';
const DIRECTIVO = '00000000-0000-4000-8000-0000000f8b03';
const SCHOOL = 711;
const INSTANCE = '00000000-0000-4000-8000-0000000f8b10';
const SNAPSHOT = '00000000-0000-4000-8000-0000000f8b11';

const { db, mockGetApiUser, sessionUser } = vi.hoisted(() => {
  const snapshot_data = {
    template: { id: 't1', name: 'Registro sintético', area: 'evaluacion' },
    objectives: [
      {
        id: 'o1',
        name: 'Proceso sintético',
        modules: [
          {
            id: 'm1',
            name: 'Práctica sintética',
            indicators: [
              { id: 'i1', name: 'Indicador adelantado', code: 'A1', category: 'profundidad', display_order: 1,
                expectations_gt: { year_1_expected: 1, tolerance: 0 } },
              { id: 'i2', name: 'Indicador atrasado', code: 'A2', category: 'profundidad', display_order: 2,
                expectations_gt: { year_1_expected: 4, tolerance: 0 } },
            ],
          },
        ],
      },
    ],
  };
  const db = {
    roles: {} as Record<string, Array<{ role_type: string; school_id: number | null }>>,
    assignments: [] as Array<{ consultant_id: string; school_id: number; is_active: boolean; ends_at?: string | null }>,
    instance: {
      id: '00000000-0000-4000-8000-0000000f8b10',
      school_id: 711,
      status: 'completed',
      transformation_year: 1,
      generation_type: 'GT',
      completed_at: '2026-11-10T12:00:00Z',
      course_structure_id: null,
      template_snapshot_id: '00000000-0000-4000-8000-0000000f8b11',
      assessment_template_snapshots: { version: '1.0.0', snapshot_data },
      school_course_structure: null,
    },
    result: {
      instance_id: '00000000-0000-4000-8000-0000000f8b10',
      total_score: 62.5,
      overall_level: 2,
      expected_level: 1,
      calculated_at: '2026-11-10T12:00:00Z',
      module_scores: [
        {
          moduleId: 'm1',
          moduleName: 'Práctica sintética',
          moduleScore: 62.5,
          moduleLevel: 2,
          indicators: [
            { indicatorId: 'i1', indicatorName: 'Indicador adelantado', category: 'profundidad', normalizedScore: 100, rawValue: 4 },
            { indicatorId: 'i2', indicatorName: 'Indicador atrasado', category: 'profundidad', normalizedScore: 25, rawValue: 1 },
          ],
        },
      ],
    },
  };
  return { db, mockGetApiUser: vi.fn(), sessionUser: { id: '' } };
});

/** Minimal chainable query: filters by eq, answers `single`/list shapes. */
function makeClient(canReadInstance: () => boolean) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let single = false;
    const q: any = {
      select: () => q,
      order: () => q,
      in: () => q,
      not: () => q,
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      then: (resolve: (v: unknown) => void) => {
        const get = (c: string) => filters.find(([k]) => k === c)?.[1];
        const answer = (rows: any[]) =>
          resolve(single ? { data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } } : { data: rows, error: null });
        if (table === 'user_roles') return resolve({ data: db.roles[String(get('user_id'))] ?? [], error: null });
        if (table === 'consultant_assignments') {
          return answer(db.assignments.filter((a) => filters.every(([c, v]) => (a as any)[c] === v)));
        }
        if (table === 'schools') return answer([{ id: get('id'), name: 'Colegio Sintético' }]);
        if (table === 'school_transversal_context') return answer([{ implementation_year_2026: 1 }]);
        if (table === 'assessment_instances') {
          if (!canReadInstance()) return answer([]);
          const rows = [db.instance].filter((r) => filters.every(([c, v]) => (r as any)[c] === v));
          return answer(rows);
        }
        if (table === 'assessment_instance_results') {
          return answer([db.result].filter((r) => r.instance_id === get('instance_id')));
        }
        return answer([]);
      },
    };
    return q;
  };
  return { from: vi.fn(from) };
}

vi.mock('../../../lib/supabaseAdmin', () => ({ supabaseAdmin: makeClient(() => true) }));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  // The caller's own session: "assessment_instances_select" admits an
  // active admin, the school's directivo, or an assignee of the registro.
  createApiSupabaseClient: vi.fn(async () =>
    makeClient(() => {
      const roles = db.roles[sessionUser.id] ?? [];
      return roles.some(
        (r) => r.role_type === 'admin' || (r.role_type === 'equipo_directivo' && r.school_id === SCHOOL)
      );
    })
  ),
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Method not allowed' })),
}));

import schoolResults from '../../../pages/api/directivo/assessments/school-results';

async function call(userId: string) {
  sessionUser.id = userId;
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  const { req, res } = createMocks({ method: 'GET', query: { school_id: String(SCHOOL) } });
  await schoolResults(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.roles = {
    [ADMIN]: [{ role_type: 'admin', school_id: null }],
    [CONSULTOR]: [{ role_type: 'consultor', school_id: null }],
    [DIRECTIVO]: [{ role_type: 'equipo_directivo', school_id: SCHOOL }],
  };
  db.assignments = [{ consultant_id: CONSULTOR, school_id: SCHOOL, is_active: true, ends_at: null }];
});

describe('T1 school-results: one summary for admin, directivo and assigned consultor', () => {
  it('the admin sees the registro under its own área with its gap analysis', async () => {
    const r = await call(ADMIN);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.results.byArea)).toEqual(['evaluacion']);
    expect(r.body.gapAnalysis.avgGap).not.toBeNull();
    expect(r.body.results.byArea.evaluacion.gapStats.ahead).toBe(1);
    expect(r.body.results.byArea.evaluacion.gapStats.behind + r.body.results.byArea.evaluacion.gapStats.critical).toBe(1);
  });

  it('the directivo gets exactly the admin body', async () => {
    const admin = await call(ADMIN);
    const directivo = await call(DIRECTIVO);
    expect(directivo.status).toBe(200);
    expect(directivo.body).toEqual(admin.body);
  });

  it('the assigned consultor gets exactly the admin body (not personalizacion with no gaps)', async () => {
    const admin = await call(ADMIN);
    const consultor = await call(CONSULTOR);
    expect(consultor.status).toBe(200);
    expect(Object.keys(consultor.body.results.byArea)).toEqual(['evaluacion']);
    expect(consultor.body).toEqual(admin.body);
  });

  it('an unassigned consultor is still refused', async () => {
    db.assignments = [];
    const r = await call(CONSULTOR);
    expect(r.status).toBe(403);
  });
});
