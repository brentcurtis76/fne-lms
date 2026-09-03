// @vitest-environment node
/**
 * B-01: fetchInstanceGapAnalysis must not reconstruct a cobertura-gated,
 * not-applicable indicator's absence as a missing/critical score-zero gap,
 * and must handle both objective-hierarchy and legacy flat snapshots.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAdminFrom } = vi.hoisted(() => ({ mockAdminFrom: vi.fn() }));

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: mockAdminFrom },
}));

import { fetchInstanceGapAnalysis } from '@/lib/services/assessment-builder/scoringService';

const INSTANCE_ID = 'inst-gap-01';

function chain(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data, error: null }),
      }),
    }),
  };
}

/** Build a fake `supabase` client for the instance read (first param). */
function buildInstanceClient(instanceRow: unknown) {
  return { from: () => chain(instanceRow) } as any;
}

describe('fetchInstanceGapAnalysis — gate-aware, dual-path', () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
  });

  it('omits a cobertura-gated-out indicator from gap analysis instead of treating it as critical/behind', async () => {
    // Snapshot: cobertura (gate) + frecuencia (downstream). The docente answered
    // No, so scoring (module_scores) only produced a score for cobertura —
    // frecuencia never appears in indicatorScores.
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', expectations_gt: { year_1_expected: 1, tolerance: 1 } },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', expectations_gt: { year_1_expected: 3, tolerance: 1 } },
          ],
        },
      ],
    };

    const instanceRow = {
      id: INSTANCE_ID,
      transformation_year: 1,
      generation_type: 'GT',
      template_snapshot_id: 'snap-1',
      assessment_template_snapshots: { snapshot_data: snapshotData },
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'assessment_instance_results') {
        return chain({
          module_scores: [
            {
              moduleId: 'm1',
              moduleName: 'Módulo 1',
              moduleScore: 0,
              moduleWeight: 1,
              indicators: [
                { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', normalizedScore: 0, weight: 1 },
                // 'frec' intentionally absent — it was gated out, not scored.
              ],
              activeIndicatorCount: 1,
            },
          ],
        });
      }
      return chain(null);
    });

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRow), INSTANCE_ID);

    expect(result).not.toBeNull();
    expect(result!.modules).toHaveLength(1);
    const gapIds = result!.modules[0].indicators.map((g) => g.indicatorId);
    expect(gapIds).toEqual(['cob']);
    expect(result!.overallStats.total).toBe(1);
    // The gated-out 'frec' must not appear anywhere, including critical/behind lists.
    expect(result!.criticalIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
    expect(result!.behindIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
  });

  it('a genuinely applicable but unanswered indicator keeps the existing defensive behavior (still appears, scored 0)', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', expectations_gt: { year_1_expected: 1, tolerance: 1 } },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', expectations_gt: { year_1_expected: 3, tolerance: 1 } },
          ],
        },
      ],
    };

    const instanceRow = {
      id: INSTANCE_ID,
      transformation_year: 1,
      generation_type: 'GT',
      template_snapshot_id: 'snap-1',
      assessment_template_snapshots: { snapshot_data: snapshotData },
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'assessment_instance_results') {
        return chain({
          module_scores: [
            {
              moduleId: 'm1',
              moduleName: 'Módulo 1',
              moduleScore: 0,
              moduleWeight: 1,
              indicators: [
                { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', normalizedScore: 100, weight: 1 },
                // Gate open (cobertura=true) — frecuencia is applicable but unanswered → scored 0, still present.
                { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', normalizedScore: 0, weight: 1 },
              ],
              activeIndicatorCount: 2,
            },
          ],
        });
      }
      return chain(null);
    });

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRow), INSTANCE_ID);

    expect(result).not.toBeNull();
    const gapIds = result!.modules[0].indicators.map((g) => g.indicatorId);
    expect(gapIds).toEqual(['cob', 'frec']);
    expect(result!.overallStats.total).toBe(2);
  });

  it('handles an objective-hierarchy snapshot (objectives → modules → indicators)', async () => {
    const snapshotData = {
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          modules: [
            {
              id: 'm1',
              name: 'Módulo 1',
              indicators: [
                { id: 'cob', name: 'Cobertura', category: 'cobertura', expectations_gt: { year_1_expected: 1, tolerance: 1 } },
              ],
            },
          ],
        },
      ],
      modules: [], // flat path unused when objectives present
      template: { area: 'evaluacion' },
    };

    const instanceRow = {
      id: INSTANCE_ID,
      transformation_year: 1,
      generation_type: 'GT',
      template_snapshot_id: 'snap-1',
      assessment_template_snapshots: { snapshot_data: snapshotData },
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'assessment_instance_results') {
        return chain({
          module_scores: [
            {
              moduleId: 'm1',
              moduleName: 'Módulo 1',
              moduleScore: 100,
              moduleWeight: 1,
              indicators: [
                { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', normalizedScore: 100, weight: 1 },
              ],
              activeIndicatorCount: 1,
            },
          ],
        });
      }
      return chain(null);
    });

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRow), INSTANCE_ID);

    expect(result).not.toBeNull();
    expect(result!.modules).toHaveLength(1);
    expect(result!.modules[0].moduleId).toBe('m1');
    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
  });
});
