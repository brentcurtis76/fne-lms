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


// ============================================================
// B-01 remediation R2 — historical (pre-gate) persisted results.
//
// Older `assessment_instance_results.module_scores` rows stored
// cobertura-gated-out indicators at score 0 instead of omitting them, so
// presence in the persisted set is NOT proof of applicability. The reader must
// re-resolve the gate from the evidence the row itself carries (the leading
// cobertura indicator's persisted rawValue) and exclude what was gated out —
// without rewriting any stored result.
// ============================================================

/** Snapshot indicator with an explicit display order (as real snapshots carry). */
function snapInd(
  id: string,
  name: string,
  category: string,
  display_order: number,
  yearExpected: number
) {
  return {
    id,
    name,
    category,
    display_order,
    expectations_gt: { [`year_1_expected`]: yearExpected, tolerance: 1 },
  };
}

function instanceRowFor(snapshotData: unknown) {
  return {
    id: INSTANCE_ID,
    transformation_year: 1,
    generation_type: 'GT',
    template_snapshot_id: 'snap-1',
    assessment_template_snapshots: { snapshot_data: snapshotData },
  };
}

function mockResults(moduleScores: unknown[]) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'assessment_instance_results') {
      return chain({ module_scores: moduleScores });
    }
    return chain(null);
  });
}

describe('fetchInstanceGapAnalysis — historical gated-out compatibility (R2)', () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
  });

  it('excludes a historically persisted gated-out indicator (legacy flat snapshot, rawValue false)', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    // Written by the pre-gate scorer: `frec` IS present, scored 0.
    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: false, normalizedScore: 0, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result).not.toBeNull();
    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
    expect(result!.overallStats.total).toBe(1);
    expect(result!.modules[0].stats.total).toBe(1);
    expect(result!.behindIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
    expect(result!.criticalIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
  });

  it('excludes a historically persisted gated-out indicator (objective-shaped snapshot)', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          modules: [
            {
              id: 'm1',
              name: 'Módulo 1',
              indicators: [
                snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
                snapInd('prof', 'Profundidad', 'profundidad', 2, 4),
              ],
            },
          ],
        },
      ],
      modules: [],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 0,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: false, normalizedScore: 0, weight: 1 },
          { indicatorId: 'prof', indicatorName: 'Profundidad', category: 'profundidad', rawValue: 0, normalizedScore: 0, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
    expect(result!.criticalIndicators.map((g) => g.indicatorId)).not.toContain('prof');
    expect(result!.overallStats.total).toBe(1);
  });

  it('resolves the historical gate by display order, not persisted array order', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: false, normalizedScore: 0, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
  });

  it('an OPEN historical gate keeps every downstream indicator, including a genuine zero', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 50,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: true, normalizedScore: 100, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 0, normalizedScore: 0, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob', 'frec']);
    expect(result!.overallStats.total).toBe(2);
    // The genuine zero is still surfaced as a real gap.
    expect(result!.criticalIndicators.concat(result!.behindIndicators).map((g) => g.indicatorId)).toContain('frec');
  });

  it('does not infer a closed gate from an unrelated zero score when the module has no cobertura gate', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('prof', 'Profundidad', 'profundidad', 1, 3),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 0,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'prof', indicatorName: 'Profundidad', category: 'profundidad', rawValue: 0, normalizedScore: 0, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 0, normalizedScore: 0, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['prof', 'frec']);
    expect(result!.overallStats.total).toBe(2);
  });

  it('a leading cobertura that was year-inactive at scoring time does not gate the persisted active set', async () => {
    // `cob` is in the snapshot but absent from module_scores: it was not active
    // for this year, so the persisted active set starts at `frec` and has no gate.
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
            snapInd('prof', 'Profundidad', 'profundidad', 3, 3),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
          { indicatorId: 'prof', indicatorName: 'Profundidad', category: 'profundidad', rawValue: 0, normalizedScore: 0, weight: 1 },
        ],
        activeIndicatorCount: 2,
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['frec', 'prof']);
    expect(result!.overallStats.total).toBe(2);
  });

  it('an ambiguous legacy row with no rawValue but a 100 cobertura score is read as an OPEN gate', async () => {
    // rawValue was not persisted (or serialised away). For a cobertura
    // indicator, normalizedScore 100 is an exact inverse of a stored "Sí",
    // so downstream indicators must NOT be hidden.
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 50,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', normalizedScore: 100, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', normalizedScore: 0, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob', 'frec']);
    expect(result!.overallStats.total).toBe(2);
  });

  it('an ambiguous legacy row with no rawValue and a 0 cobertura score is read as CLOSED (fail-closed): downstream excluded', async () => {
    // rawValue was not persisted. A cobertura normalizedScore of 0 means the
    // stored answer was "No" OR unanswered — the reader cannot tell which, and
    // does not pretend to: it resolves to the shared policy's "unanswered"
    // state, never to a fabricated "No". Both states close the gate, so the
    // applicability outcome is identical either way — only the gate indicator
    // applies, and the stale downstream row must not surface as a gap.
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', normalizedScore: 0, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
    expect(result!.overallStats.total).toBe(1);
    expect(result!.criticalIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
    expect(result!.behindIndicators.find((g) => g.indicatorId === 'frec')).toBeUndefined();
  });

  it('a snapshot without display_order falls back to snapshot order for the historical gate', async () => {
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

    mockResults([
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: false, normalizedScore: 0, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
        ],
      },
    ]);

    const result = await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(result!.modules[0].indicators.map((g) => g.indicatorId)).toEqual(['cob']);
  });

  it('never mutates the persisted module_scores rows it reads', async () => {
    const snapshotData = {
      template: { area: 'evaluacion' },
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          indicators: [
            snapInd('cob', 'Cobertura', 'cobertura', 1, 1),
            snapInd('frec', 'Frecuencia', 'frecuencia', 2, 3),
          ],
        },
      ],
    };

    const persisted = [
      {
        moduleId: 'm1',
        moduleName: 'Módulo 1',
        moduleScore: 10,
        moduleWeight: 1,
        indicators: [
          { indicatorId: 'cob', indicatorName: 'Cobertura', category: 'cobertura', rawValue: false, normalizedScore: 0, weight: 1 },
          { indicatorId: 'frec', indicatorName: 'Frecuencia', category: 'frecuencia', rawValue: 20, normalizedScore: 20, weight: 1 },
        ],
      },
    ];
    const persistedSnapshot = JSON.stringify(persisted);
    const snapshotSnapshot = JSON.stringify(snapshotData);

    mockResults(persisted);

    await fetchInstanceGapAnalysis(buildInstanceClient(instanceRowFor(snapshotData)), INSTANCE_ID);

    expect(JSON.stringify(persisted)).toBe(persistedSnapshot);
    expect(JSON.stringify(snapshotData)).toBe(snapshotSnapshot);
    // Read-only: no write/update/upsert/insert path was ever reached.
    const tables = mockAdminFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).toEqual(['assessment_instance_results']);
  });
});
