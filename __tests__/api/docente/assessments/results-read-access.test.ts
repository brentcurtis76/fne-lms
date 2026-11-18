// @vitest-environment node
/**
 * N1, part 2 (item 3b) — the teacher's results route checks that the registro
 * is sent (status completed) BEFORE it reads the stored version. The caller's
 * client below answers as the second build's read rules do: the stored version
 * (assessment_template_snapshots, also when embedded in an instances read with
 * !inner) is readable to the teacher only once the registro is completed;
 * before that an embedded !inner read loses the whole row and a direct read
 * returns no row. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockGetInstanceResults,
  mockCalculateAndSaveScores,
  mockFetchInstanceGapAnalysis,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetInstanceResults: vi.fn(),
  mockCalculateAndSaveScores: vi.fn(),
  mockFetchInstanceGapAnalysis: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Autenticación requerida' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

vi.mock('@/lib/services/assessment-builder/scoringService', () => ({
  getInstanceResults: mockGetInstanceResults,
  calculateAndSaveScores: mockCalculateAndSaveScores,
  fetchInstanceGapAnalysis: mockFetchInstanceGapAnalysis,
}));

import resultsHandler from '@/pages/api/docente/assessments/[instanceId]/results';

const USER = 'docente-sintetico-3';
const INSTANCE = 'inst-sintetica-3';
const SNAPSHOT = 'snap-sintetico-3';
const NO_ROW = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };

const SNAPSHOT_DATA = {
  template: { id: 'tpl-sintetico-3', name: 'Instrumento sintético', area: 'evaluacion', description: 'Descripción sintética' },
  objectives: [{ id: 'obj-1', name: 'Proceso sintético', weight: 1, modules: [{ id: 'mod-1' }] }],
  modules: [{ id: 'mod-1' }],
};

const SUMMARY = {
  instanceId: INSTANCE,
  area: 'evaluacion',
  totalScore: 50,
  overallLevel: 2,
  expectedLevel: 1,
  transformationYear: 2,
  completedAt: '2026-11-01T00:00:00Z',
  moduleScores: [
    {
      moduleId: 'mod-1',
      moduleName: 'Práctica sintética',
      moduleScore: 50,
      moduleWeight: 1,
      indicators: [
        { indicatorId: 'ind-a', indicatorName: 'Indicador a', category: 'profundidad', rawValue: 2, normalizedScore: 50, weight: 1, isAboveExpectation: true },
      ],
    },
  ],
};

type Row = { status: string; template_snapshot_id: string } | null;

/**
 * The teacher's client, answering as the new read rules do.
 * - assessment_instance_assignees: the caller's row when `assignee` is true.
 * - assessment_instances: the instance row; if the select embeds the stored
 *   version with !inner and the registro is not completed, the row is lost
 *   (no row: PGRST116 on .single()), as PostgREST does when the embedded
 *   table is refused.
 * - assessment_template_snapshots: readable only once completed.
 */
function teacherClient(opts: { assignee: boolean; instance: Row; snapshotExists?: boolean }) {
  const reads: Array<{ table: string; select: string }> = [];
  const snapshotReadable = () => opts.instance?.status === 'completed' && opts.snapshotExists !== false;
  const snapshotRow = { version: '2.0.0', snapshot_data: SNAPSHOT_DATA };
  return {
    reads,
    from: vi.fn((table: string) => {
      const entry = { table, select: '' };
      reads.push(entry);
      const builder: any = {
        select: vi.fn((s: string) => { entry.select = s; return builder; }),
        eq: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (table === 'assessment_instance_assignees') {
            return opts.assignee
              ? { data: { id: 'asg-1', instance_id: INSTANCE, user_id: USER, can_edit: true, can_submit: true }, error: null }
              : { data: null, error: NO_ROW };
          }
          if (table === 'assessment_instances') {
            if (!opts.instance) return { data: null, error: NO_ROW };
            const row: any = {
              id: INSTANCE,
              status: opts.instance.status,
              completed_at: opts.instance.status === 'completed' ? '2026-11-01T00:00:00Z' : null,
              transformation_year: 2,
              generation_type: 'GT',
              school_id: 1,
              course_structure_id: 'curso-1',
              template_snapshot_id: opts.instance.template_snapshot_id,
            };
            if (entry.select.includes('assessment_template_snapshots')) {
              if (!snapshotReadable()) return { data: null, error: NO_ROW };
              row.assessment_template_snapshots = snapshotRow;
            }
            return { data: row, error: null };
          }
          if (table === 'assessment_template_snapshots') {
            return snapshotReadable() ? { data: snapshotRow, error: null } : { data: null, error: NO_ROW };
          }
          return { data: null, error: NO_ROW };
        }),
      };
      return builder;
    }),
  };
}

async function callResults() {
  const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE } });
  await resultsHandler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

describe('docente results route — "sent" is checked before the stored version is read (N1, part 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: USER }, error: null });
    mockGetInstanceResults.mockResolvedValue(SUMMARY);
    mockFetchInstanceGapAnalysis.mockResolvedValue(null);
  });

  it.each(['pending', 'in_progress'])(
    'an assignee asking for the results of an unsent (%s) registro gets today\'s 400 and message',
    async (status) => {
      const caller = teacherClient({ assignee: true, instance: { status, template_snapshot_id: SNAPSHOT } });
      mockCreateApiSupabaseClient.mockResolvedValue(caller);

      const { status: code, body } = await callResults();

      expect(code).toBe(400);
      expect(body).toEqual({ error: 'Los resultados solo están disponibles para registros completados', status });
      expect(caller.reads.map((r) => r.table)).not.toContain('assessment_template_snapshots');
      expect(mockGetInstanceResults).not.toHaveBeenCalled();
      expect(mockCalculateAndSaveScores).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    }
  );

  it('a completed registro answers as today, with the teacher\'s own client for the stored version and scoring', async () => {
    const caller = teacherClient({ assignee: true, instance: { status: 'completed', template_snapshot_id: SNAPSHOT } });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);

    const { status, body } = await callResults();

    expect(status).toBe(200);
    expect(body.instance).toEqual({
      id: INSTANCE,
      status: 'completed',
      completedAt: '2026-11-01T00:00:00Z',
      transformationYear: 2,
      generationType: 'GT',
      snapshotVersion: '2.0.0',
    });
    expect(body.template).toEqual({
      name: 'Instrumento sintético',
      area: 'evaluacion',
      areaLabel: expect.any(String),
      description: 'Descripción sintética',
    });
    expect(body.results.totalScore).toBe(50);
    expect(body.results.overallLevel).toBe(2);
    expect(body.results.expectedLevel).toBe(1);
    expect(body.results.objectiveScores).toHaveLength(1);
    expect(body.results.objectiveScores[0]).toMatchObject({ objectiveId: 'obj-1', objectiveName: 'Proceso sintético', objectiveScore: 50 });
    expect(body.results.moduleScores[0]).toMatchObject({ moduleId: 'mod-1', level: 2, gapStats: null });
    expect(body.stats).toEqual({
      totalModules: 1,
      totalIndicators: 1,
      indicatorsAboveExpectation: 1,
      strongestModule: 'Práctica sintética',
      weakestModule: 'Práctica sintética',
    });
    expect(body.gapAnalysis).toBeNull();
    // scoring keeps its calls and its client (the teacher's)
    expect(mockGetInstanceResults).toHaveBeenCalledWith(caller, INSTANCE);
    expect(mockFetchInstanceGapAnalysis).toHaveBeenCalledWith(caller, INSTANCE);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a completed registro without stored results is still calculated with the teacher\'s client', async () => {
    const caller = teacherClient({ assignee: true, instance: { status: 'completed', template_snapshot_id: SNAPSHOT } });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockGetInstanceResults.mockResolvedValue(null);
    mockCalculateAndSaveScores.mockResolvedValue({ success: true, summary: SUMMARY });

    const { status, body } = await callResults();

    expect(status).toBe(200);
    expect(body.results.totalScore).toBe(50);
    expect(mockCalculateAndSaveScores).toHaveBeenCalledWith(caller, INSTANCE, USER);
  });

  it('a completed registro whose stored version is not there answers today\'s 404', async () => {
    const caller = teacherClient({
      assignee: true,
      instance: { status: 'completed', template_snapshot_id: SNAPSHOT },
      snapshotExists: false,
    });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);

    const { status, body } = await callResults();

    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Registro no encontrado' });
    expect(mockGetInstanceResults).not.toHaveBeenCalled();
  });

  it('an instance that does not read answers today\'s 404', async () => {
    const caller = teacherClient({ assignee: true, instance: null });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);

    const { status, body } = await callResults();

    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Registro no encontrado' });
  });

  it('a caller who is not an assignee gets today\'s 403, and nothing else is read', async () => {
    const caller = teacherClient({ assignee: false, instance: { status: 'completed', template_snapshot_id: SNAPSHOT } });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);

    const { status, body } = await callResults();

    expect(status).toBe(403);
    expect(body).toEqual({ error: 'No tienes permiso para ver los resultados de este registro' });
    expect(caller.reads.map((r) => r.table)).toEqual(['assessment_instance_assignees']);
    expect(mockGetInstanceResults).not.toHaveBeenCalled();
  });
});
