// @vitest-environment node
/**
 * GC-7: «Panel de Resultados» for admins and consultores. The page now sends
 * the chosen school; these tests pin who may read which school through both
 * results routes:
 *   admin      any school; without a school → 400 (the page shows the picker)
 *   consultor  assigned schools only; unassigned → 403
 *   directivo  their own school, whatever school they name (unchanged)
 *   docente    refused
 * In-memory admin client, synthetic ids.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '00000000-0000-4000-8000-0000000f8a01';
const CONSULTOR = '00000000-0000-4000-8000-0000000f8a02';
const DIRECTIVO = '00000000-0000-4000-8000-0000000f8a03';
const DOCENTE = '00000000-0000-4000-8000-0000000f8a04';
const OWN = 701;
const ASSIGNED = 702;
const OTHER = 703;

const { db, mockGetApiUser } = vi.hoisted(() => {
  const db = {
    roles: {} as Record<string, Array<{ role_type: string; school_id: number | null }>>,
    assignments: [] as Array<{ consultant_id: string; school_id: number; is_active: boolean; ends_at?: string | null }>,
    reads: [] as string[],
  };
  return { db, mockGetApiUser: vi.fn() };
});

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: vi.fn(async () => ({ from: vi.fn() })),
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Authentication required' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Method not allowed' })),
}));

vi.mock('../../../lib/supabaseAdmin', () => {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const q: any = {
      select: () => q,
      order: () => q,
      in: () => q,
      not: () => q,
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        if (c === 'school_id' || (table === 'schools' && c === 'id')) db.reads.push(`${table}:${String(v)}`);
        return q;
      },
      single: () => q,
      maybeSingle: () => q,
      then: (resolve: (v: unknown) => void) => {
        const get = (c: string) => filters.find(([k]) => k === c)?.[1];
        if (table === 'user_roles') return resolve({ data: db.roles[String(get('user_id'))] ?? [], error: null });
        if (table === 'consultant_assignments') {
          const rows = db.assignments.filter((a) => filters.every(([c, v]) => (a as any)[c] === v));
          return resolve({ data: rows, error: null });
        }
        if (table === 'schools') return resolve({ data: { id: get('id'), name: 'Colegio Sintético' }, error: null });
        return resolve({ data: [], error: null });
      },
    };
    return q;
  };
  return { supabaseAdmin: { from: vi.fn(from) } };
});

vi.mock('../../../lib/services/assessment-builder/scoringService', () => ({
  getInstanceResults: vi.fn().mockResolvedValue(null),
  aggregateSchoolScores: vi.fn().mockReturnValue({ byArea: {}, overall: {} }),
  fetchInstanceGapAnalysis: vi.fn().mockResolvedValue(null),
  aggregateSchoolGapAnalysis: vi.fn().mockReturnValue({ byArea: {}, overall: {}, topCriticalIndicators: [] }),
}));

import schoolResults from '../../../pages/api/directivo/assessments/school-results';
import courseResults from '../../../pages/api/directivo/assessments/course-results';

const routes = [
  ['school-results', schoolResults, 'schools'],
  ['course-results', courseResults, 'school_course_structure'],
] as const;

async function call(handler: any, userId: string, schoolId?: number) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  const { req, res } = createMocks({ method: 'GET', query: schoolId === undefined ? {} : { school_id: String(schoolId) } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.reads = [];
  db.roles = {
    [ADMIN]: [{ role_type: 'admin', school_id: null }],
    [CONSULTOR]: [{ role_type: 'consultor', school_id: null }],
    [DIRECTIVO]: [{ role_type: 'equipo_directivo', school_id: OWN }],
    [DOCENTE]: [{ role_type: 'docente', school_id: OWN }],
  };
  db.assignments = [
    { consultant_id: CONSULTOR, school_id: ASSIGNED, is_active: true },
    { consultant_id: CONSULTOR, school_id: OTHER, is_active: false },
  ];
});

describe.each(routes)('GC-7 %s school choice', (_name, handler, schoolTable) => {
  it('admin with a school reads that school', async () => {
    const r = await call(handler, ADMIN, OTHER);
    expect(r.status).toBe(200);
    expect(db.reads).toContain(`${schoolTable}:${OTHER}`);
  });

  it('admin without a school is asked for one (400), nothing is read', async () => {
    const r = await call(handler, ADMIN);
    expect(r.status).toBe(400);
    expect(db.reads).toEqual([]);
  });

  it('consultor with an assigned school reads it', async () => {
    const r = await call(handler, CONSULTOR, ASSIGNED);
    expect(r.status).toBe(200);
    expect(db.reads).toContain(`${schoolTable}:${ASSIGNED}`);
  });

  it('consultor naming an unassigned school (or an inactive assignment) is refused with 403', async () => {
    const r = await call(handler, CONSULTOR, OTHER);
    expect(r.status).toBe(403);
    expect(db.reads.filter((x) => x.startsWith(schoolTable))).toEqual([]);
  });

  it('directivo reads their own school', async () => {
    const r = await call(handler, DIRECTIVO);
    expect(r.status).toBe(200);
    expect(db.reads).toContain(`${schoolTable}:${OWN}`);
  });

  it('directivo naming another school still gets their own school (as today)', async () => {
    const r = await call(handler, DIRECTIVO, OTHER);
    expect(r.status).toBe(200);
    expect(db.reads).toContain(`${schoolTable}:${OWN}`);
    expect(db.reads).not.toContain(`${schoolTable}:${OTHER}`);
  });

  it('docente is refused', async () => {
    const r = await call(handler, DOCENTE, OWN);
    expect(r.status).toBe(403);
  });

  it('P2: a consultor whose assignment ended yesterday is refused with 403; ending tomorrow or with no end reads', async () => {
    const day = 24 * 60 * 60 * 1000;
    db.assignments = [
      { consultant_id: CONSULTOR, school_id: OTHER, is_active: true, ends_at: new Date(Date.now() - day).toISOString() },
      { consultant_id: CONSULTOR, school_id: ASSIGNED, is_active: true, ends_at: new Date(Date.now() + day).toISOString() },
      { consultant_id: CONSULTOR, school_id: OWN, is_active: true, ends_at: null },
    ];
    const ended = await call(handler, CONSULTOR, OTHER);
    expect(ended.status).toBe(403);
    expect(db.reads.filter((x) => x.startsWith(schoolTable))).toEqual([]);
    expect((await call(handler, CONSULTOR, ASSIGNED)).status).toBe(200);
    expect((await call(handler, CONSULTOR, OWN)).status).toBe(200);
  });
});
