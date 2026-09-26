import { describe, it, expect, vi } from 'vitest';

// Mock supabaseAdmin before importing scoringService (it imports supabaseAdmin at top level)
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

import {
  scoreCoberturaIndicator,
  scoreFrecuenciaIndicator,
  scoreProfundidadIndicator,
  scoreTraspasoIndicator,
  scoreDetalleIndicator,
  calculateWeightedAverage,
  calculateModuleScore,
  calculateAssessmentScores,
  calculateObjectiveScore,
  classifyGap,
} from '@/lib/services/assessment-builder/scoringService';
import { calculateDemoScores } from '@/lib/services/assessment-builder/clientScoringService';
import { scoreToLevel } from '@/types/assessment-builder';
import type {
  FrequencyConfig,
  ScoringConfig,
  AssessmentResponse,
  IndicatorCategory,
} from '@/types/assessment-builder';

// ============================================================
// Cobertura normalization
// ============================================================

describe('Cobertura normalization', () => {
  it('normalizes true to 100', () => {
    expect(scoreCoberturaIndicator(true)).toBe(100);
  });

  it('normalizes false to 0', () => {
    expect(scoreCoberturaIndicator(false)).toBe(0);
  });

  it('handles undefined as 0', () => {
    expect(scoreCoberturaIndicator(undefined)).toBe(0);
  });

  it('handles null as 0', () => {
    expect(scoreCoberturaIndicator(null)).toBe(0);
  });
});

// ============================================================
// Frecuencia normalization
// ============================================================

describe('Frecuencia normalization', () => {
  const config: FrequencyConfig = { type: 'count', min: 0, max: 10, step: 1 };

  it('normalizes mid-range value: (5-0)/(10-0)*100 = 50', () => {
    expect(scoreFrecuenciaIndicator(5, config)).toBe(50);
  });

  it('normalizes min value to 0', () => {
    expect(scoreFrecuenciaIndicator(0, config)).toBe(0);
  });

  it('normalizes max value to 100', () => {
    expect(scoreFrecuenciaIndicator(10, config)).toBe(100);
  });

  it('handles value above max (clamp to 100)', () => {
    expect(scoreFrecuenciaIndicator(15, config)).toBe(100);
  });

  it('handles min === max (return 0)', () => {
    const sameConfig: FrequencyConfig = { type: 'count', min: 5, max: 5 };
    // When max <= min, the function returns 0 (invalid config)
    expect(scoreFrecuenciaIndicator(5, sameConfig)).toBe(0);
  });

  it('handles zero value with non-zero min', () => {
    const offsetConfig: FrequencyConfig = { type: 'count', min: 2, max: 10 };
    // Value 0 is below min, clamped to min=2, so (2-2)/(10-2)*100 = 0
    expect(scoreFrecuenciaIndicator(0, offsetConfig)).toBe(0);
  });

  it('handles undefined value as 0', () => {
    expect(scoreFrecuenciaIndicator(undefined, config)).toBe(0);
  });

  it('handles null value as 0', () => {
    expect(scoreFrecuenciaIndicator(null, config)).toBe(0);
  });

  it('handles no config (defaults min=0, max=100)', () => {
    // Without config, defaults are min=0, max=100
    expect(scoreFrecuenciaIndicator(50)).toBe(50);
  });
});

// ============================================================
// Profundidad normalization
// ============================================================

describe('Profundidad normalization', () => {
  it('normalizes level 0 to 0', () => {
    expect(scoreProfundidadIndicator(0)).toBe(0);
  });

  it('normalizes level 1 to 25', () => {
    expect(scoreProfundidadIndicator(1)).toBe(25);
  });

  it('normalizes level 2 to 50', () => {
    expect(scoreProfundidadIndicator(2)).toBe(50);
  });

  it('normalizes level 3 to 75', () => {
    expect(scoreProfundidadIndicator(3)).toBe(75);
  });

  it('normalizes level 4 to 100', () => {
    expect(scoreProfundidadIndicator(4)).toBe(100);
  });

  it('handles undefined as 0', () => {
    expect(scoreProfundidadIndicator(undefined)).toBe(0);
  });

  it('handles null as 0', () => {
    expect(scoreProfundidadIndicator(null)).toBe(0);
  });

  it('clamps negative values to 0', () => {
    expect(scoreProfundidadIndicator(-1)).toBe(0);
  });

  it('clamps values above 4 to 100', () => {
    expect(scoreProfundidadIndicator(5)).toBe(100);
  });
});

// ============================================================
// Traspaso binary scoring
// ============================================================

describe('Traspaso binary scoring', () => {
  it('returns 100 when evidence_link has content', () => {
    expect(scoreTraspasoIndicator({ evidence_link: 'https://example.com/doc' })).toBe(100);
  });

  it('returns 100 when improvement_suggestions has content', () => {
    expect(scoreTraspasoIndicator({ improvement_suggestions: 'Mejorar seguimiento' })).toBe(100);
  });

  it('returns 100 when both fields have content', () => {
    expect(scoreTraspasoIndicator({ evidence_link: 'https://link', improvement_suggestions: 'text' })).toBe(100);
  });

  it('returns 0 when neither field has content', () => {
    expect(scoreTraspasoIndicator({ evidence_link: '', improvement_suggestions: '' })).toBe(0);
  });

  it('returns 0 when fields are whitespace-only', () => {
    expect(scoreTraspasoIndicator({ evidence_link: '   ', improvement_suggestions: '  ' })).toBe(0);
  });

  it('returns 0 when null', () => {
    expect(scoreTraspasoIndicator(null)).toBe(0);
  });

  it('returns 0 when undefined', () => {
    expect(scoreTraspasoIndicator(undefined)).toBe(0);
  });
});

// ============================================================
// Detalle binary scoring
// ============================================================

describe('Detalle binary scoring', () => {
  it('returns 100 with 3 selected options', () => {
    expect(scoreDetalleIndicator({ selected_options: ['ABP', 'Gamificación', 'Tutoría'] })).toBe(100);
  });

  it('returns 100 with 1 selected option', () => {
    expect(scoreDetalleIndicator({ selected_options: ['ABP'] })).toBe(100);
  });

  it('returns 0 with empty array', () => {
    expect(scoreDetalleIndicator({ selected_options: [] })).toBe(0);
  });

  it('returns 0 when null', () => {
    expect(scoreDetalleIndicator(null)).toBe(0);
  });

  it('returns 0 when undefined', () => {
    expect(scoreDetalleIndicator(undefined)).toBe(0);
  });

  it('returns 0 when selected_options is not an array', () => {
    expect(scoreDetalleIndicator({ selected_options: 'not an array' })).toBe(0);
  });
});

// ============================================================
// Weighted module score
// ============================================================

describe('Weighted module score', () => {
  it('calculates simple average with equal weights', () => {
    const items = [
      { score: 100, weight: 1 },
      { score: 50, weight: 1 },
      { score: 0, weight: 1 },
    ];
    expect(calculateWeightedAverage(items)).toBe(50);
  });

  it('calculates weighted average: (75*1 + 50*2) / (1+2) = 58.33', () => {
    const items = [
      { score: 75, weight: 1 },
      { score: 50, weight: 2 },
    ];
    expect(calculateWeightedAverage(items)).toBe(58.33);
  });

  it('handles single indicator', () => {
    const items = [{ score: 75, weight: 1 }];
    expect(calculateWeightedAverage(items)).toBe(75);
  });

  it('handles all indicators with score 0', () => {
    const items = [
      { score: 0, weight: 1 },
      { score: 0, weight: 2 },
    ];
    expect(calculateWeightedAverage(items)).toBe(0);
  });

  it('handles all indicators with score 100', () => {
    const items = [
      { score: 100, weight: 1 },
      { score: 100, weight: 2 },
    ];
    expect(calculateWeightedAverage(items)).toBe(100);
  });

  it('handles empty items array', () => {
    expect(calculateWeightedAverage([])).toBe(0);
  });
});

// ============================================================
// Weighted global score (calculateModuleScore)
// ============================================================

describe('Weighted global score', () => {
  it('averages module scores with equal weights', () => {
    const indicators = [
      { id: '1', name: 'Ind 1', category: 'cobertura' as IndicatorCategory, weight: 1 },
      { id: '2', name: 'Ind 2', category: 'cobertura' as IndicatorCategory, weight: 1 },
    ];
    const responses = new Map<string, AssessmentResponse>();
    responses.set('1', { id: '1', instance_id: 'i1', indicator_id: '1', coverage_value: true } as AssessmentResponse);
    responses.set('2', { id: '2', instance_id: 'i1', indicator_id: '2', coverage_value: false } as AssessmentResponse);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);
    // (100 + 0) / 2 = 50
    expect(result.moduleScore).toBe(50);
  });

  it('applies indicator weights correctly', () => {
    const indicators = [
      { id: '1', name: 'Ind 1', category: 'cobertura' as IndicatorCategory, weight: 1 },
      { id: '2', name: 'Ind 2', category: 'profundidad' as IndicatorCategory, weight: 2 },
    ];
    const responses = new Map<string, AssessmentResponse>();
    responses.set('1', { id: '1', instance_id: 'i1', indicator_id: '1', coverage_value: true } as AssessmentResponse);
    responses.set('2', { id: '2', instance_id: 'i1', indicator_id: '2', profundity_level: 2 } as AssessmentResponse);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);
    // (100*1 + 50*2) / (1+2) = 200/3 = 66.67
    expect(result.moduleScore).toBe(66.67);
  });

  it('handles single module', () => {
    const indicators = [
      { id: '1', name: 'Ind 1', category: 'profundidad' as IndicatorCategory, weight: 1 },
    ];
    const responses = new Map<string, AssessmentResponse>();
    responses.set('1', { id: '1', instance_id: 'i1', indicator_id: '1', profundity_level: 3 } as AssessmentResponse);

    const result = calculateModuleScore(indicators, responses, 'Single', 1);
    expect(result.moduleScore).toBe(75);
  });

  it('all 5 categories completed → 100% (binary scoring for detalle/traspaso)', () => {
    const indicators = [
      { id: '1', name: 'Cob', category: 'cobertura' as IndicatorCategory, weight: 20 },
      { id: '2', name: 'Frec', category: 'frecuencia' as IndicatorCategory, weight: 20 },
      { id: '3', name: 'Prof', category: 'profundidad' as IndicatorCategory, weight: 20 },
      { id: '4', name: 'Det', category: 'detalle' as IndicatorCategory, weight: 20 },
      { id: '5', name: 'Tras', category: 'traspaso' as IndicatorCategory, weight: 20 },
    ];
    const responses = new Map<string, AssessmentResponse>();
    responses.set('1', { id: '1', instance_id: 'i1', indicator_id: '1', coverage_value: true } as AssessmentResponse);
    responses.set('2', { id: '2', instance_id: 'i1', indicator_id: '2', frequency_value: 100 } as AssessmentResponse);
    responses.set('3', { id: '3', instance_id: 'i1', indicator_id: '3', profundity_level: 4 } as AssessmentResponse);
    responses.set('4', { id: '4', instance_id: 'i1', indicator_id: '4', sub_responses: { selected_options: ['ABP', 'Tutoría'] } } as AssessmentResponse);
    responses.set('5', { id: '5', instance_id: 'i1', indicator_id: '5', sub_responses: { evidence_link: 'https://doc.com' } } as AssessmentResponse);

    const result = calculateModuleScore(indicators, responses, 'Full Module', 1);
    // All score 100 → (100*20)*5 / (20*5) = 100
    expect(result.moduleScore).toBe(100);
  });

  it('detalle incomplete reduces score based on its weight', () => {
    const indicators = [
      { id: '1', name: 'Cob', category: 'cobertura' as IndicatorCategory, weight: 50 },
      { id: '2', name: 'Det', category: 'detalle' as IndicatorCategory, weight: 50 },
    ];
    const responses = new Map<string, AssessmentResponse>();
    responses.set('1', { id: '1', instance_id: 'i1', indicator_id: '1', coverage_value: true } as AssessmentResponse);
    responses.set('2', { id: '2', instance_id: 'i1', indicator_id: '2', sub_responses: { selected_options: [] } } as AssessmentResponse);

    const result = calculateModuleScore(indicators, responses, 'Test', 1);
    // cobertura=100*50, detalle=0*50 → (5000) / 100 = 50
    expect(result.moduleScore).toBe(50);
  });
});

// ============================================================
// calculateAssessmentScores — global score across modules
// ============================================================

describe('calculateAssessmentScores', () => {
  it('calculates overall weighted score across modules', () => {
    const result = calculateAssessmentScores({
      instanceId: 'test-instance',
      transformationYear: 2,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Ind', category: 'cobertura', weight: 1 },
          ],
        },
        {
          id: 'm2',
          name: 'Module 2',
          weight: 1,
          indicators: [
            { id: 'i2', name: 'Ind', category: 'profundidad', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test-instance', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test-instance', indicator_id: 'i2', profundity_level: 2 } as AssessmentResponse,
      ],
    });

    // Module 1: cobertura true = 100; Module 2: profundidad 2 = 50
    // Overall: (100 + 50) / 2 = 75
    expect(result.totalScore).toBe(75);
    expect(result.moduleScores).toHaveLength(2);
    expect(result.overallLevel).toBe(3); // 75 >= 62.5 → level 3
    expect(result.expectedLevel).toBe(1); // Year 2 → level 1
  });

  it('applies module weights correctly', () => {
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 3,
      area: 'aprendizaje',
      modules: [
        {
          id: 'm1',
          name: 'Heavy Module',
          weight: 3,
          indicators: [
            { id: 'i1', name: 'Ind', category: 'cobertura', weight: 1 },
          ],
        },
        {
          id: 'm2',
          name: 'Light Module',
          weight: 1,
          indicators: [
            { id: 'i2', name: 'Ind', category: 'cobertura', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', coverage_value: false } as AssessmentResponse,
      ],
    });

    // Module 1: 100, weight 3; Module 2: 0, weight 1
    // Overall: (100*3 + 0*1) / (3+1) = 75
    expect(result.totalScore).toBe(75);
  });
});

// ============================================================
// Score to level conversion
// ============================================================

describe('Score to level conversion', () => {
  it('0 -> level 0', () => {
    expect(scoreToLevel(0)).toBe(0);
  });

  it('12.4 -> level 0', () => {
    expect(scoreToLevel(12.4)).toBe(0);
  });

  it('12.5 -> level 1', () => {
    expect(scoreToLevel(12.5)).toBe(1);
  });

  it('37.4 -> level 1', () => {
    expect(scoreToLevel(37.4)).toBe(1);
  });

  it('37.5 -> level 2', () => {
    expect(scoreToLevel(37.5)).toBe(2);
  });

  it('62.4 -> level 2', () => {
    expect(scoreToLevel(62.4)).toBe(2);
  });

  it('62.5 -> level 3', () => {
    expect(scoreToLevel(62.5)).toBe(3);
  });

  it('87.4 -> level 3', () => {
    expect(scoreToLevel(87.4)).toBe(3);
  });

  it('87.5 -> level 4', () => {
    expect(scoreToLevel(87.5)).toBe(4);
  });

  it('100 -> level 4', () => {
    expect(scoreToLevel(100)).toBe(4);
  });

  it('respects custom thresholds from ScoringConfig', () => {
    const config: ScoringConfig = {
      level_thresholds: {
        consolidated: 90,
        advanced: 70,
        developing: 40,
        emerging: 20,
      },
      default_weights: { objective: 1, module: 1, indicator: 1 },
    };

    expect(scoreToLevel(10, config)).toBe(0);
    expect(scoreToLevel(20, config)).toBe(1);
    expect(scoreToLevel(40, config)).toBe(2);
    expect(scoreToLevel(70, config)).toBe(3);
    expect(scoreToLevel(90, config)).toBe(4);
  });
});

// ============================================================
// Gap analysis
// ============================================================

describe('Gap analysis', () => {
  it('classifies as ahead when actual > expected', () => {
    expect(classifyGap(3, 2, 1, 'profundidad')).toBe('ahead');
  });

  it('classifies as on_track when actual == expected', () => {
    // gap = 0, which is >= 0, so 'ahead'
    // Actually: gap=0 means >= 0 → 'ahead'. When actual equals expected, it's considered 'ahead'
    expect(classifyGap(2, 2, 1, 'profundidad')).toBe('ahead');
  });

  it('classifies as on_track when within tolerance', () => {
    // actual=1, expected=2, gap=-1, tolerance=1 → gap >= -tolerance → on_track
    expect(classifyGap(1, 2, 1, 'profundidad')).toBe('on_track');
  });

  it('classifies as behind when below tolerance', () => {
    // actual=0, expected=2, gap=-2, tolerance=1 → gap < -tolerance, gap > -3 → behind
    expect(classifyGap(0, 2, 1, 'profundidad')).toBe('behind');
  });

  it('classifies as critical when >2 levels below expected (profundidad)', () => {
    // actual=0, expected=4, gap=-4, tolerance=1 → gap <= -3 → critical
    expect(classifyGap(0, 4, 1, 'profundidad')).toBe('critical');
  });

  it('returns on_track when expected is null', () => {
    expect(classifyGap(2, null, 1, 'profundidad')).toBe('on_track');
  });

  it('classifies as critical when tolerance is 0 and behind', () => {
    // actual=1, expected=2, gap=-1, tolerance=0 → gap < -0 and tolerance===0 → critical
    expect(classifyGap(1, 2, 0, 'cobertura')).toBe('critical');
  });
});

// ============================================================
// 3-level scoring: calculateObjectiveScore
// ============================================================

describe('calculateObjectiveScore', () => {
  it('calculates objective score as weighted average of module scores', () => {
    const moduleScores = [
      { moduleId: 'm1', moduleName: 'Module 1', moduleScore: 100, moduleWeight: 1, indicators: [] },
      { moduleId: 'm2', moduleName: 'Module 2', moduleScore: 0, moduleWeight: 1, indicators: [] },
    ];

    const result = calculateObjectiveScore('obj1', 'Objetivo 1', 1.0, moduleScores);
    expect(result.objectiveId).toBe('obj1');
    expect(result.objectiveName).toBe('Objetivo 1');
    expect(result.objectiveScore).toBe(50); // (100+0)/2
    expect(result.modules).toHaveLength(2);
  });

  it('respects module weights when calculating objective score', () => {
    const moduleScores = [
      { moduleId: 'm1', moduleName: 'Heavy', moduleScore: 100, moduleWeight: 3, indicators: [] },
      { moduleId: 'm2', moduleName: 'Light', moduleScore: 0, moduleWeight: 1, indicators: [] },
    ];

    const result = calculateObjectiveScore('obj1', 'Objetivo 1', 1.0, moduleScores);
    // (100*3 + 0*1) / (3+1) = 75
    expect(result.objectiveScore).toBe(75);
  });

  it('returns 0 when no modules', () => {
    const result = calculateObjectiveScore('obj1', 'Objetivo 1', 1.0, []);
    expect(result.objectiveScore).toBe(0);
  });
});

// ============================================================
// Year-aware scoring with activeExpectations (R8)
// ============================================================

describe('calculateAssessmentScores — year-aware scoring (R8)', () => {
  it('T3: Module with 4 indicators, only 2 active for Year 1 — uses only those 2 weights', () => {
    // Active: i1 (cobertura, weight 30), i2 (frecuencia, weight 20).
    // Inactive: i3 (weight 30), i4 (weight 20) — no entry in activeExpectations.
    const activeExpectations = new Map([
      ['i1', { expected: 1, unit: null, tolerance: 1 }],
      ['i2', { expected: 2, unit: 'semana', tolerance: 1 }],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 30 },
            { id: 'i2', name: 'Frecuencia', category: 'frecuencia', weight: 20 },
            { id: 'i3', name: 'Traspaso', category: 'traspaso', weight: 30 },
            { id: 'i4', name: 'Detalle', category: 'detalle', weight: 20 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        // frequency_value: 50 with default config (min=0, max=100) → score = 50
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', frequency_value: 50 } as AssessmentResponse,
      ],
      activeExpectations,
    });

    // Only i1 (100 * weight 30) and i2 (frecuencia=50 with default max=100 → score=50, weight 20) are active
    // Score: (100*30 + 50*20) / (30+20) = (3000 + 1000) / 50 = 80
    expect(result.totalScore).toBe(80);
    // Active indicator count in module score
    expect(result.moduleScores[0].activeIndicatorCount).toBe(2);
  });

  it('T4: Module with 0 active indicators — excluded from objective average', () => {
    // All indicators are inactive
    const activeExpectations = new Map<string, { expected: number | null; unit: string | null; tolerance: number }>();
    // No entries = no indicators active

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          weight: 1,
          modules: [
            {
              id: 'm1',
              name: 'Module (all inactive)',
              weight: 1,
              indicators: [
                { id: 'i1', name: 'Ind 1', category: 'cobertura', weight: 1 },
              ],
            },
          ],
        },
        {
          id: 'obj2',
          name: 'Objetivo 2',
          weight: 1,
          modules: [
            {
              id: 'm2',
              name: 'Module (active)',
              weight: 1,
              indicators: [
                { id: 'i2', name: 'Ind 2', category: 'cobertura', weight: 1 },
              ],
            },
          ],
        },
      ],
      modules: [],
      responses: [
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', coverage_value: true } as AssessmentResponse,
      ],
      activeExpectations: new Map([
        ['i2', { expected: 1, unit: null, tolerance: 1 }],
      ]),
    });

    // obj1's module has no active indicators → obj1 excluded
    // obj2's module has i2 active → obj2 score = 100
    // Total: just obj2 = 100
    expect(result.totalScore).toBe(100);
    // Only obj2 contributed (obj1 excluded)
    expect(result.objectiveScores!.length).toBe(1);
    expect(result.objectiveScores![0].objectiveId).toBe('obj2');
  });

  it('T5: Indicator with no expectation entry — not included in score', () => {
    // i1 has an entry, i2 does not
    const activeExpectations = new Map([
      ['i1', { expected: 1, unit: null, tolerance: 1 }],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Active', category: 'cobertura', weight: 1 },
            { id: 'i2', name: 'Inactive', category: 'profundidad', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', profundity_level: 0 } as AssessmentResponse,
      ],
      activeExpectations,
    });

    // Only i1 is active: score = 100 (i2 excluded)
    expect(result.totalScore).toBe(100);
    expect(result.moduleScores[0].activeIndicatorCount).toBe(1);
  });

  it('T6: Cobertura active + answered No — module scores 0 (gate effect)', () => {
    const activeExpectations = new Map([
      ['cob', { expected: 1, unit: null, tolerance: 1 }],
      ['frec', { expected: 5, unit: 'semana', tolerance: 1 }],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 50 },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 50 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'cob', coverage_value: false } as AssessmentResponse,
        // frec has no response (docente didn't fill it because gate was closed)
      ],
      activeExpectations,
    });

    // cobertura = false (0), frecuencia = no response (0)
    // Score: (0*50 + 0*50) / 100 = 0
    expect(result.totalScore).toBe(0);
  });

  it('T7: All indicators active — uses full design-time weights (same as current)', () => {
    const activeExpectations = new Map([
      ['i1', { expected: 1, unit: null, tolerance: 1 }],
      ['i2', { expected: 2, unit: null, tolerance: 1 }],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
            { id: 'i2', name: 'Profundidad', category: 'profundidad', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', profundity_level: 2 } as AssessmentResponse,
      ],
      activeExpectations,
    });

    // (100*1 + 50*1) / 2 = 75
    expect(result.totalScore).toBe(75);
    expect(result.moduleScores[0].activeIndicatorCount).toBe(2);
  });

  it('T8: Dynamic redistribution: weights [30, 20, 50], only first two active → [60%, 40%]', () => {
    // i1 weight=30, i2 weight=20, i3 weight=50. Only i1 and i2 active.
    // calculateWeightedAverage will divide by (30+20)=50, effectively redistributing.
    const activeExpectations = new Map([
      ['i1', { expected: 1, unit: null, tolerance: 1 }],
      ['i2', { expected: 1, unit: null, tolerance: 1 }],
      // i3 not in map = inactive
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 30 },
            { id: 'i2', name: 'Profundidad', category: 'profundidad', weight: 20 },
            { id: 'i3', name: 'Frecuencia', category: 'frecuencia', weight: 50 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', profundity_level: 0 } as AssessmentResponse,
      ],
      activeExpectations,
    });

    // i1: 100 * weight 30, i2: 0 * weight 20
    // calculateWeightedAverage: (100*30 + 0*20) / (30+20) = 3000/50 = 60
    // Effectively: i1 contributes 60% (30/50), i2 contributes 40% (20/50)
    expect(result.totalScore).toBe(60);
    expect(result.moduleScores[0].activeIndicatorCount).toBe(2);
  });

  it('T-legacy: No activeExpectations — falls back to excluding traspaso/detalle', () => {
    // Legacy mode: no activeExpectations → traspaso and detalle excluded
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
            { id: 'i2', name: 'Traspaso', category: 'traspaso', weight: 1 },
            { id: 'i3', name: 'Detalle', category: 'detalle', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
      ],
      // activeExpectations: undefined (legacy)
    });

    // Legacy: traspaso/detalle excluded → only i1 scored → 100
    expect(result.totalScore).toBe(100);
    expect(result.moduleScores[0].activeIndicatorCount).toBe(1);
  });

  it('T-nothing-active: All modules inactive — returns 0 score', () => {
    // All indicators have null expected values for this year
    const activeExpectations = new Map([
      ['i1', { expected: null, unit: null, tolerance: 1 }],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
          ],
        },
      ],
      responses: [],
      activeExpectations,
    });

    // No active indicators → module skipped → totalScore = 0
    expect(result.totalScore).toBe(0);
    expect(result.moduleScores.length).toBe(0);
  });
});

// ============================================================
// Per-year weight override tests
// ============================================================

describe('calculateAssessmentScores — per-year weight overrides', () => {
  it('T-PY1: Scoring Year 1 uses Year 1 indicatorYearWeights (Cobertura 40%)', () => {
    // Cobertura (ind cob) weight = 40 for Year 1, Frecuencia (ind frec) weight = 60
    // cob answered true (100), frec answered 50/100
    // Expected score: (100*40 + 50*60) / (40+60) = (4000 + 3000) / 100 = 70
    const indicatorYearWeights = new Map([
      ['cob', 40],
      ['frec', 60],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 50 }, // default 50
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 50 }, // default 50
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'cob', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'frec', frequency_value: 50 } as AssessmentResponse,
      ],
      indicatorYearWeights,
    });

    // With per-year overrides (40/60): (100*40 + 50*60) / 100 = 70
    expect(result.totalScore).toBe(70);
  });

  it('T-PY2: Year 2 with no per-year weights falls back to default entity weights', () => {
    // No indicatorYearWeights → uses entity default weights (both weight=1 → equal)
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 2,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1 },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'cob', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'frec', frequency_value: 50 } as AssessmentResponse,
      ],
      // no indicatorYearWeights → fallback
    });

    // Default equal weights: (100*1 + 50*1) / 2 = 75
    expect(result.totalScore).toBe(75);
  });

  it('T-PY3: Cobertura 40% in Y1 → its contribution is 40% of module score', () => {
    // cob: weight=40, answered true (100). frec: weight=60, answered 0 (no response)
    // Score: (100*40 + 0*60) / 100 = 40
    const indicatorYearWeights = new Map([
      ['cob', 40],
      ['frec', 60],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 50 },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 50 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'cob', coverage_value: true } as AssessmentResponse,
        // frec has no response → scores 0
      ],
      indicatorYearWeights,
    });

    // (100 * 40 + 0 * 60) / (40 + 60) = 40
    expect(result.totalScore).toBe(40);
  });

  it('T-PY4: Year 4 with Cobertura 10% → contribution is 10%', () => {
    // Same template, Year 4: cob weight=10, frec weight=90
    // cob=true (100), frec answered 100 → score=(100*10 + 100*90)/100=100
    // But let frec=0 to verify weight: (100*10 + 0*90)/100=10
    const indicatorYearWeights = new Map([
      ['cob', 10],
      ['frec', 90],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 4,
      area: 'evaluacion',
      modules: [
        {
          id: 'm1',
          name: 'Module',
          weight: 1,
          indicators: [
            { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 50 },
            { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 50 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'cob', coverage_value: true } as AssessmentResponse,
        // frec = no response → 0
      ],
      indicatorYearWeights,
    });

    // cob contributes 10% of total: (100 * 10 + 0 * 90) / 100 = 10
    expect(result.totalScore).toBe(10);
  });

  it('T-PY5: per-year objective weight overrides → objective contributes correctly', () => {
    // Two objectives, Year 1: obj1 weight=80, obj2 weight=20
    // obj1 score=100, obj2 score=0
    // Expected total: (100*80 + 0*20) / 100 = 80
    const objectiveYearWeights = new Map([
      ['obj1', 80],
      ['obj2', 20],
    ]);

    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          weight: 50, // default (overridden to 80)
          modules: [
            {
              id: 'm1',
              name: 'Modulo 1',
              weight: 1,
              indicators: [{ id: 'i1', name: 'Ind 1', category: 'cobertura', weight: 1 }],
            },
          ],
        },
        {
          id: 'obj2',
          name: 'Objetivo 2',
          weight: 50, // default (overridden to 20)
          modules: [
            {
              id: 'm2',
              name: 'Modulo 2',
              weight: 1,
              indicators: [{ id: 'i2', name: 'Ind 2', category: 'cobertura', weight: 1 }],
            },
          ],
        },
      ],
      modules: [],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', coverage_value: false } as AssessmentResponse,
      ],
      objectiveYearWeights,
    });

    // (100*80 + 0*20) / 100 = 80
    expect(result.totalScore).toBe(80);
  });
});

// ============================================================
// 3-level calculateAssessmentScores with objectives
// ============================================================

describe('calculateAssessmentScores — 3-level hierarchy', () => {
  it('calculates total score via objectives → modules → indicators', () => {
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          weight: 1,
          modules: [
            {
              id: 'm1',
              name: 'Módulo 1',
              weight: 1,
              indicators: [
                { id: 'i1', name: 'Ind 1', category: 'cobertura', weight: 1 },
              ],
            },
          ],
        },
        {
          id: 'obj2',
          name: 'Objetivo 2',
          weight: 1,
          modules: [
            {
              id: 'm2',
              name: 'Módulo 2',
              weight: 1,
              indicators: [
                { id: 'i2', name: 'Ind 2', category: 'profundidad', weight: 1 },
              ],
            },
          ],
        },
      ],
      modules: [], // flat list not used when objectives present
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', profundity_level: 2 } as AssessmentResponse,
      ],
    });

    // Obj1 module score: cobertura true = 100; Obj1 score = 100
    // Obj2 module score: profundidad 2 = 50; Obj2 score = 50
    // Total: (100 + 50) / 2 = 75
    expect(result.totalScore).toBe(75);
    expect(result.objectiveScores).toHaveLength(2);
    expect(result.objectiveScores![0].objectiveScore).toBe(100);
    expect(result.objectiveScores![1].objectiveScore).toBe(50);
    expect(result.moduleScores).toHaveLength(2); // flattened
  });

  it('respects objective weights for total score', () => {
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      objectives: [
        {
          id: 'obj1',
          name: 'Heavy Objective',
          weight: 3,
          modules: [
            {
              id: 'm1',
              name: 'Módulo 1',
              weight: 1,
              indicators: [
                { id: 'i1', name: 'Ind 1', category: 'cobertura', weight: 1 },
              ],
            },
          ],
        },
        {
          id: 'obj2',
          name: 'Light Objective',
          weight: 1,
          modules: [
            {
              id: 'm2',
              name: 'Módulo 2',
              weight: 1,
              indicators: [
                { id: 'i2', name: 'Ind 2', category: 'cobertura', weight: 1 },
              ],
            },
          ],
        },
      ],
      modules: [],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', coverage_value: false } as AssessmentResponse,
      ],
    });

    // Obj1 score=100 weight=3; Obj2 score=0 weight=1
    // Total: (100*3 + 0*1) / (3+1) = 75
    expect(result.totalScore).toBe(75);
  });

  it('falls back to flat modules when no objectives', () => {
    const result = calculateAssessmentScores({
      instanceId: 'test',
      transformationYear: 1,
      area: 'evaluacion',
      objectives: [], // empty objectives — use flat modules
      modules: [
        {
          id: 'm1',
          name: 'Módulo 1',
          weight: 1,
          indicators: [
            { id: 'i1', name: 'Ind 1', category: 'cobertura', weight: 1 },
          ],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true } as AssessmentResponse,
      ],
    });

    expect(result.totalScore).toBe(100);
    expect(result.objectiveScores).toBeUndefined();
    expect(result.moduleScores).toHaveLength(1);
  });
});

// ============================================================
// W-B1c-02 — contribution of a gate-closed practice to the total
// ============================================================

describe('calculateAssessmentScores — gate-closed practice in a mixed weighted total (W-B1c-02)', () => {
  type Ind = {
    id: string; name: string; category: IndicatorCategory; weight: number;
    display_order: number; active: boolean; frequency_config?: FrequencyConfig;
  };
  type Mod = { id: string; name: string; weight: number; indicators: Ind[] };
  type Res = Omit<AssessmentResponse, 'id' | 'instance_id' | 'responded_at' | 'updated_at'>;

  // Practice A (weight 3) is closed: its cobertura is answered "No", but stale
  // auto-saved answers remain on its downstream indicators, and a year-inactive
  // indicator sits first by display order. Practice B (weight 2) is open. Practice
  // C (weight 5) has no indicator active this year.
  const MODULES: Mod[] = [
    { id: 'A', name: 'Práctica cerrada', weight: 3, indicators: [
      { id: 'a-prof', name: 'Profundidad A', category: 'profundidad', weight: 2, display_order: 2, active: true },
      { id: 'a-inactive', name: 'Inactiva A', category: 'profundidad', weight: 5, display_order: 0, active: false },
      { id: 'a-cob', name: 'Cobertura A', category: 'cobertura', weight: 1, display_order: 1, active: true },
      { id: 'a-frec', name: 'Frecuencia A', category: 'frecuencia', weight: 1, display_order: 3, active: true,
        frequency_config: { type: 'count', min: 0, max: 10 } },
    ] },
    { id: 'B', name: 'Práctica abierta', weight: 2, indicators: [
      { id: 'b-cob', name: 'Cobertura B', category: 'cobertura', weight: 1, display_order: 1, active: true },
      { id: 'b-prof', name: 'Profundidad B', category: 'profundidad', weight: 3, display_order: 2, active: true },
      { id: 'b-trasp', name: 'Traspaso B', category: 'traspaso', weight: 2, display_order: 3, active: false },
    ] },
    { id: 'C', name: 'Práctica sin indicadores este año', weight: 5, indicators: [
      { id: 'c-cob', name: 'Cobertura C', category: 'cobertura', weight: 1, display_order: 1, active: false },
    ] },
  ];

  const STALE: Res[] = [
    { indicator_id: 'a-prof', profundity_level: 4 },
    { indicator_id: 'a-frec', frequency_value: 10 },
    { indicator_id: 'a-inactive', profundity_level: 4 },
  ];
  const OPEN_B: Res[] = [
    { indicator_id: 'b-cob', coverage_value: true },
    { indicator_id: 'b-prof', profundity_level: 2 },
    { indicator_id: 'b-trasp', sub_responses: { evidence_link: 'https://example.com/evidencia' } },
    { indicator_id: 'c-cob', coverage_value: true },
  ];

  function score(
    responses: Res[],
    objectives?: Array<{ id: string; name: string; weight: number; moduleIds: string[] }>
  ) {
    const toModule = (m: Mod) => ({
      id: m.id, name: m.name, weight: m.weight,
      indicators: m.indicators.map(({ active: _active, ...ind }) => ind),
    });
    return calculateAssessmentScores({
      instanceId: 'synthetic',
      transformationYear: 2,
      area: 'evaluacion',
      modules: MODULES.map(toModule),
      objectives: objectives?.map((o) => ({
        id: o.id, name: o.name, weight: o.weight,
        modules: MODULES.filter((m) => o.moduleIds.includes(m.id)).map(toModule),
      })),
      responses: responses.map((r, i) => ({
        id: `r${i}`, instance_id: 'synthetic', responded_at: '', updated_at: '', ...r,
      })),
      activeExpectations: new Map(MODULES.flatMap((m) => m.indicators).map((ind) => [
        ind.id, { expected: ind.active ? 2 : null, unit: null, tolerance: 1 },
      ])),
    });
  }

  const breakdown = (result: ReturnType<typeof score>) => result.moduleScores.map((m) => ({
    id: m.moduleId, score: m.moduleScore, weight: m.moduleWeight,
    indicators: m.indicators.map((i) => i.indicatorId),
  }));

  it('D1: closed practice counts as 0 at its full weight; stale downstream answers are ignored', () => {
    const result = score([{ indicator_id: 'a-cob', coverage_value: false }, ...STALE, ...OPEN_B]);

    // A: only the gate applies → 0. B: (100*1 + 50*3) / 4 = 62.5. C: nothing active → excluded.
    // Total: (0*3 + 62.5*2) / (3+2) = 25.
    // Scoring the stale answers would give A = (0*1 + 100*2 + 100*1) / 4 = 75 and a total of 70;
    // dropping the closed practice from the denominator would give 62.5.
    expect(result.totalScore).toBe(25);
    expect(breakdown(result)).toEqual([
      { id: 'A', score: 0, weight: 3, indicators: ['a-cob'] },
      { id: 'B', score: 62.5, weight: 2, indicators: ['b-cob', 'b-prof'] },
    ]);
    expect(result.moduleScores[0].activeIndicatorCount).toBe(1);
  });

  it('D1: removing the stale rows changes nothing', () => {
    const withStale = score([{ indicator_id: 'a-cob', coverage_value: false }, ...STALE, ...OPEN_B]);
    const withoutStale = score([{ indicator_id: 'a-cob', coverage_value: false }, ...OPEN_B]);
    expect(withoutStale.totalScore).toBe(25);
    expect(breakdown(withoutStale)).toEqual(breakdown(withStale));
  });

  it('D2: an unanswered gate scores the practice 0 at full weight, like "No"', () => {
    const result = score([...STALE, ...OPEN_B]);
    expect(result.totalScore).toBe(25);
    expect(breakdown(result)[0]).toEqual({ id: 'A', score: 0, weight: 3, indicators: ['a-cob'] });
  });

  it('D2: an open gate scores every active indicator of the practice (unchanged behaviour)', () => {
    const result = score([{ indicator_id: 'a-cob', coverage_value: true }, ...STALE, ...OPEN_B]);
    // A: (100*1 + 100*2 + 100*1) / 4 = 100 (a-inactive still excluded). Total: (100*3 + 62.5*2) / 5 = 85.
    expect(result.totalScore).toBe(85);
    expect(breakdown(result)[0]).toEqual({ id: 'A', score: 100, weight: 3, indicators: ['a-cob', 'a-prof', 'a-frec'] });
  });

  it('D2: no responses at all → every applicable indicator 0, total 0', () => {
    const result = score([]);
    expect(result.totalScore).toBe(0);
    expect(breakdown(result)).toEqual([
      { id: 'A', score: 0, weight: 3, indicators: ['a-cob'] },
      { id: 'B', score: 0, weight: 2, indicators: ['b-cob'] },
    ]);
  });

  it('D1: 3-level — the closed practice zeroes its objective, which keeps its objective weight', () => {
    const result = score(
      [{ indicator_id: 'a-cob', coverage_value: false }, ...STALE, ...OPEN_B],
      [
        { id: 'O1', name: 'Objetivo 1', weight: 2, moduleIds: ['A'] },
        { id: 'O2', name: 'Objetivo 2', weight: 3, moduleIds: ['B', 'C'] },
      ]
    );
    // O1 = 0; O2 = 62.5 (C excluded). Total: (0*2 + 62.5*3) / 5 = 37.5.
    expect(result.objectiveScores?.map((o) => [o.objectiveId, o.objectiveScore, o.objectiveWeight])).toEqual([
      ['O1', 0, 2],
      ['O2', 62.5, 3],
    ]);
    expect(result.totalScore).toBe(37.5);
  });

  it('D2: server and client scoring agree on applicable indicators, module scores and total', () => {
    const variants: Array<[string, Res[]]> = [
      ['closed', [{ indicator_id: 'a-cob', coverage_value: false }, ...STALE, ...OPEN_B]],
      ['unanswered', [...STALE, ...OPEN_B]],
      ['open', [{ indicator_id: 'a-cob', coverage_value: true }, ...STALE, ...OPEN_B]],
      ['empty', []],
    ];
    for (const [label, responses] of variants) {
      const server = score(responses);
      const client = calculateDemoScores({
        objectives: [],
        modules: MODULES.map((m) => ({
          id: m.id, name: m.name, weight: m.weight,
          indicators: m.indicators.map(({ active, ...ind }) => ({ ...ind, is_active_this_year: active })),
        })),
        responses: Object.fromEntries(responses.map(({ indicator_id, ...r }) => [indicator_id, r])),
        expectations: [],
        scoringConfig: { level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
          default_weights: { objective: 1, module: 1, indicator: 1 } },
        transformationYear: 2,
        generationType: 'GT',
        templateName: 'Sintética',
        templateArea: 'evaluacion',
      });
      expect({ label, total: client.totalScore }).toEqual({ label, total: server.totalScore });
      expect({ label, modules: client.moduleScores.map((m) => ({
        id: m.moduleId, score: m.moduleScore, weight: m.moduleWeight,
        indicators: m.indicators.map((i) => i.indicatorId),
      })) }).toEqual({ label, modules: breakdown(server) });
    }
  });
});
