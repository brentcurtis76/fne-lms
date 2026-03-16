import { describe, it, expect } from 'vitest';
import {
  scoreCoberturaIndicator,
  scoreFrecuenciaIndicator,
  scoreProfundidadIndicator,
  scoreTraspasoIndicator,
  scoreDetalleIndicator,
  calculateWeightedAverage,
  classifyGap,
  calculateDemoScores,
} from '@/lib/services/assessment-builder/clientScoringService';
import type { DemoScoringInput } from '@/lib/services/assessment-builder/clientScoringService';
import type {
  FrequencyConfig,
  ScoringConfig,
  AssessmentYearExpectation,
} from '@/types/assessment-builder';

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  level_thresholds: {
    consolidated: 87.5,
    advanced: 62.5,
    developing: 37.5,
    emerging: 12.5,
  },
  default_weights: { objective: 1, module: 1, indicator: 1 },
};

// ============================================================
// Cobertura scoring
// ============================================================

describe('clientScoringService — Cobertura', () => {
  it('true → 100', () => expect(scoreCoberturaIndicator(true)).toBe(100));
  it('false → 0', () => expect(scoreCoberturaIndicator(false)).toBe(0));
  it('undefined → 0', () => expect(scoreCoberturaIndicator(undefined)).toBe(0));
  it('null → 0', () => expect(scoreCoberturaIndicator(null)).toBe(0));
});

// ============================================================
// Frecuencia scoring
// ============================================================

describe('clientScoringService — Frecuencia', () => {
  const config: FrequencyConfig = { type: 'count', min: 0, max: 10, step: 1 };

  it('mid-range: (5-0)/(10-0)*100 = 50', () => {
    expect(scoreFrecuenciaIndicator(5, config)).toBe(50);
  });

  it('min value → 0', () => {
    expect(scoreFrecuenciaIndicator(0, config)).toBe(0);
  });

  it('max value → 100', () => {
    expect(scoreFrecuenciaIndicator(10, config)).toBe(100);
  });

  it('above max clamps to 100', () => {
    expect(scoreFrecuenciaIndicator(15, config)).toBe(100);
  });

  it('min === max → 0', () => {
    const sameConfig: FrequencyConfig = { type: 'count', min: 5, max: 5 };
    expect(scoreFrecuenciaIndicator(5, sameConfig)).toBe(0);
  });

  it('below min clamps to 0', () => {
    const offsetConfig: FrequencyConfig = { type: 'count', min: 2, max: 10 };
    expect(scoreFrecuenciaIndicator(0, offsetConfig)).toBe(0);
  });

  it('undefined → 0', () => expect(scoreFrecuenciaIndicator(undefined, config)).toBe(0));
  it('null → 0', () => expect(scoreFrecuenciaIndicator(null, config)).toBe(0));

  it('no config defaults min=0, max=100', () => {
    expect(scoreFrecuenciaIndicator(50)).toBe(50);
  });
});

// ============================================================
// Profundidad scoring
// ============================================================

describe('clientScoringService — Profundidad', () => {
  it('level 0 → 0', () => expect(scoreProfundidadIndicator(0)).toBe(0));
  it('level 1 → 25', () => expect(scoreProfundidadIndicator(1)).toBe(25));
  it('level 2 → 50', () => expect(scoreProfundidadIndicator(2)).toBe(50));
  it('level 3 → 75', () => expect(scoreProfundidadIndicator(3)).toBe(75));
  it('level 4 → 100', () => expect(scoreProfundidadIndicator(4)).toBe(100));
  it('undefined → 0', () => expect(scoreProfundidadIndicator(undefined)).toBe(0));
  it('null → 0', () => expect(scoreProfundidadIndicator(null)).toBe(0));
  it('negative clamps to 0', () => expect(scoreProfundidadIndicator(-1)).toBe(0));
  it('above 4 clamps to 100', () => expect(scoreProfundidadIndicator(5)).toBe(100));
});

// ============================================================
// Traspaso scoring
// ============================================================

describe('clientScoringService — Traspaso', () => {
  it('evidence_link → 100', () => {
    expect(scoreTraspasoIndicator({ evidence_link: 'https://example.com' })).toBe(100);
  });

  it('improvement_suggestions → 100', () => {
    expect(scoreTraspasoIndicator({ improvement_suggestions: 'Mejorar' })).toBe(100);
  });

  it('both fields → 100', () => {
    expect(scoreTraspasoIndicator({ evidence_link: 'url', improvement_suggestions: 'text' })).toBe(100);
  });

  it('empty strings → 0', () => {
    expect(scoreTraspasoIndicator({ evidence_link: '', improvement_suggestions: '' })).toBe(0);
  });

  it('whitespace only → 0', () => {
    expect(scoreTraspasoIndicator({ evidence_link: '  ', improvement_suggestions: '  ' })).toBe(0);
  });

  it('null → 0', () => expect(scoreTraspasoIndicator(null)).toBe(0));
  it('undefined → 0', () => expect(scoreTraspasoIndicator(undefined)).toBe(0));
});

// ============================================================
// Detalle scoring
// ============================================================

describe('clientScoringService — Detalle', () => {
  it('selected options → 100', () => {
    expect(scoreDetalleIndicator({ selected_options: ['ABP', 'Tutoría'] })).toBe(100);
  });

  it('one option → 100', () => {
    expect(scoreDetalleIndicator({ selected_options: ['ABP'] })).toBe(100);
  });

  it('empty array → 0', () => {
    expect(scoreDetalleIndicator({ selected_options: [] })).toBe(0);
  });

  it('null → 0', () => expect(scoreDetalleIndicator(null)).toBe(0));
  it('undefined → 0', () => expect(scoreDetalleIndicator(undefined)).toBe(0));

  it('non-array → 0', () => {
    expect(scoreDetalleIndicator({ selected_options: 'not an array' })).toBe(0);
  });
});

// ============================================================
// Weighted average
// ============================================================

describe('clientScoringService — calculateWeightedAverage', () => {
  it('equal weights → simple average', () => {
    expect(calculateWeightedAverage([
      { score: 100, weight: 1 },
      { score: 50, weight: 1 },
      { score: 0, weight: 1 },
    ])).toBe(50);
  });

  it('weighted: (75*1 + 50*2) / 3 = 58.33', () => {
    expect(calculateWeightedAverage([
      { score: 75, weight: 1 },
      { score: 50, weight: 2 },
    ])).toBe(58.33);
  });

  it('empty → 0', () => {
    expect(calculateWeightedAverage([])).toBe(0);
  });
});

// ============================================================
// Gap analysis classification
// ============================================================

describe('clientScoringService — classifyGap', () => {
  it('actual > expected → ahead', () => {
    expect(classifyGap(3, 2, 1, 'profundidad')).toBe('ahead');
  });

  it('actual == expected → ahead', () => {
    expect(classifyGap(2, 2, 1, 'profundidad')).toBe('ahead');
  });

  it('within tolerance → on_track', () => {
    expect(classifyGap(1, 2, 1, 'profundidad')).toBe('on_track');
  });

  it('below tolerance → behind', () => {
    expect(classifyGap(0, 2, 1, 'profundidad')).toBe('behind');
  });

  it('≥3 levels below → critical (profundidad)', () => {
    expect(classifyGap(0, 4, 1, 'profundidad')).toBe('critical');
  });

  it('expected null → on_track', () => {
    expect(classifyGap(2, null, 1, 'profundidad')).toBe('on_track');
  });

  it('tolerance 0 and behind → critical', () => {
    expect(classifyGap(1, 2, 0, 'cobertura')).toBe('critical');
  });
});

// ============================================================
// calculateDemoScores — integration tests
// ============================================================

function makeInput(overrides: Partial<DemoScoringInput> = {}): DemoScoringInput {
  return {
    objectives: [],
    modules: [],
    responses: {},
    expectations: [],
    scoringConfig: DEFAULT_SCORING_CONFIG,
    transformationYear: 1,
    generationType: 'GT',
    templateName: 'Test Template',
    templateArea: 'evaluacion',
    ...overrides,
  };
}

describe('clientScoringService — calculateDemoScores basic', () => {
  it('scores a single cobertura indicator (true)', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
        ],
      }],
      responses: { i1: { coverage_value: true } },
    }));

    expect(result.totalScore).toBe(100);
    expect(result.overallLevel).toBe(4);
    expect(result.overallLevelLabel).toBe('Consolidado');
    expect(result.meetsExpectations).toBe(true);
    expect(result.stats.totalModules).toBe(1);
    expect(result.stats.totalIndicators).toBe(1);
  });

  it('scores a single cobertura indicator (false)', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
        ],
      }],
      responses: { i1: { coverage_value: false } },
    }));

    expect(result.totalScore).toBe(0);
    expect(result.overallLevel).toBe(0);
    expect(result.overallLevelLabel).toBe('Por Comenzar');
  });

  it('scores profundidad level 2 → 50', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: { i1: { profundity_level: 2 } },
    }));

    expect(result.totalScore).toBe(50);
    expect(result.overallLevel).toBe(2);
    expect(result.overallLevelLabel).toBe('En Desarrollo');
  });

  it('scores frecuencia with config', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          {
            id: 'i1',
            name: 'Frec',
            category: 'frecuencia',
            weight: 1,
            frequency_config: { type: 'count', min: 0, max: 10 },
          },
        ],
      }],
      responses: { i1: { frequency_value: 5 } },
    }));

    expect(result.totalScore).toBe(50);
  });

  it('scores traspaso with evidence', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Tras', category: 'traspaso', weight: 1 },
        ],
      }],
      responses: { i1: { sub_responses: { evidence_link: 'https://doc.com' } } },
    }));

    expect(result.totalScore).toBe(100);
  });

  it('scores detalle with selections', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Det', category: 'detalle', weight: 1 },
        ],
      }],
      responses: { i1: { sub_responses: { selected_options: ['A', 'B'] } } },
    }));

    expect(result.totalScore).toBe(100);
  });
});

// ============================================================
// Cobertura gate behavior
// ============================================================

describe('clientScoringService — cobertura gate', () => {
  it('cobertura false → all other indicators score 0', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
          { id: 'i2', name: 'Prof', category: 'profundidad', weight: 1 },
          { id: 'i3', name: 'Frec', category: 'frecuencia', weight: 1, frequency_config: { type: 'count', min: 0, max: 10 } },
        ],
      }],
      responses: {
        i1: { coverage_value: false },
        i2: { profundity_level: 4 },
        i3: { frequency_value: 10 },
      },
    }));

    // All indicators score 0 because cobertura gate is active
    expect(result.totalScore).toBe(0);
    const indicators = result.moduleScores[0].indicators;
    expect(indicators[0].normalizedScore).toBe(0); // cobertura false
    expect(indicators[1].normalizedScore).toBe(0); // gated
    expect(indicators[2].normalizedScore).toBe(0); // gated
  });

  it('cobertura true → other indicators score normally', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cobertura', category: 'cobertura', weight: 1 },
          { id: 'i2', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: {
        i1: { coverage_value: true },
        i2: { profundity_level: 2 },
      },
    }));

    // (100 + 50) / 2 = 75
    expect(result.totalScore).toBe(75);
    expect(result.moduleScores[0].indicators[1].normalizedScore).toBe(50);
  });

  it('non-cobertura first indicator → no gate effect', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 },
          { id: 'i2', name: 'Frec', category: 'frecuencia', weight: 1 },
        ],
      }],
      responses: {
        i1: { profundity_level: 0 },
        i2: { frequency_value: 50 },
      },
    }));

    // (0 + 50) / 2 = 25
    expect(result.totalScore).toBe(25);
  });
});

// ============================================================
// Weighted aggregation
// ============================================================

describe('clientScoringService — weighted aggregation', () => {
  it('respects indicator weights within module', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 },
          { id: 'i2', name: 'Prof', category: 'profundidad', weight: 2 },
        ],
      }],
      responses: {
        i1: { coverage_value: true },
        i2: { profundity_level: 2 },
      },
    }));

    // (100*1 + 50*2) / 3 = 66.67
    expect(result.totalScore).toBe(66.67);
  });

  it('respects module weights', () => {
    const result = calculateDemoScores(makeInput({
      modules: [
        {
          id: 'm1',
          name: 'Heavy',
          weight: 3,
          indicators: [{ id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 }],
        },
        {
          id: 'm2',
          name: 'Light',
          weight: 1,
          indicators: [{ id: 'i2', name: 'Cob', category: 'cobertura', weight: 1 }],
        },
      ],
      responses: {
        i1: { coverage_value: true },
        i2: { coverage_value: false },
      },
    }));

    // (100*3 + 0*1) / 4 = 75
    expect(result.totalScore).toBe(75);
  });

  it('3-level scoring with objectives', () => {
    const result = calculateDemoScores(makeInput({
      objectives: [
        {
          id: 'obj1',
          name: 'Objetivo 1',
          weight: 1,
          modules: [{
            id: 'm1',
            name: 'Module 1',
            weight: 1,
            indicators: [{ id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 }],
          }],
        },
        {
          id: 'obj2',
          name: 'Objetivo 2',
          weight: 1,
          modules: [{
            id: 'm2',
            name: 'Module 2',
            weight: 1,
            indicators: [{ id: 'i2', name: 'Prof', category: 'profundidad', weight: 1 }],
          }],
        },
      ],
      responses: {
        i1: { coverage_value: true },
        i2: { profundity_level: 2 },
      },
    }));

    // Obj1: 100, Obj2: 50 → (100+50)/2 = 75
    expect(result.totalScore).toBe(75);
    expect(result.objectiveScores).toHaveLength(2);
    expect(result.objectiveScores![0].objectiveScore).toBe(100);
    expect(result.objectiveScores![1].objectiveScore).toBe(50);
  });

  it('respects objective weights', () => {
    const result = calculateDemoScores(makeInput({
      objectives: [
        {
          id: 'obj1',
          name: 'Heavy',
          weight: 3,
          modules: [{
            id: 'm1',
            name: 'M1',
            weight: 1,
            indicators: [{ id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 }],
          }],
        },
        {
          id: 'obj2',
          name: 'Light',
          weight: 1,
          modules: [{
            id: 'm2',
            name: 'M2',
            weight: 1,
            indicators: [{ id: 'i2', name: 'Cob', category: 'cobertura', weight: 1 }],
          }],
        },
      ],
      responses: {
        i1: { coverage_value: true },
        i2: { coverage_value: false },
      },
    }));

    // (100*3 + 0*1) / 4 = 75
    expect(result.totalScore).toBe(75);
  });
});

// ============================================================
// Gap analysis in calculateDemoScores
// ============================================================

describe('clientScoringService — gap analysis integration', () => {
  it('builds gap analysis from expectations', () => {
    const expectations: AssessmentYearExpectation[] = [
      {
        id: 'e1',
        template_id: 't1',
        indicator_id: 'i1',
        generation_type: 'GT',
        year_1_expected: 2,
        tolerance: 1,
        created_at: '',
        updated_at: '',
      },
    ];

    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: { i1: { profundity_level: 4 } },
      expectations,
      transformationYear: 1,
    }));

    expect(result.gapAnalysis).not.toBeNull();
    expect(result.gapAnalysis!.overallStats.ahead).toBe(1);

    const indGap = result.moduleScores[0].indicators[0].gap;
    expect(indGap).not.toBeNull();
    expect(indGap!.classification).toBe('ahead');
    expect(indGap!.actualLevel).toBe(4);
    expect(indGap!.expectedLevel).toBe(2);
  });

  it('classifies behind indicators', () => {
    const expectations: AssessmentYearExpectation[] = [
      {
        id: 'e1',
        template_id: 't1',
        indicator_id: 'i1',
        generation_type: 'GT',
        year_1_expected: 3,
        tolerance: 1,
        created_at: '',
        updated_at: '',
      },
    ];

    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: { i1: { profundity_level: 0 } }, // level 0, expected 3, gap = -3
      expectations,
      transformationYear: 1,
    }));

    // gap=-3, tolerance=1 → profundidad with gap <= -3 → critical
    expect(result.gapAnalysis!.overallStats.critical).toBe(1);
    expect(result.gapAnalysis!.criticalIndicators).toHaveLength(1);
  });

  it('filters expectations by generationType', () => {
    const expectations: AssessmentYearExpectation[] = [
      {
        id: 'e1',
        template_id: 't1',
        indicator_id: 'i1',
        generation_type: 'GI', // Different from input GT
        year_1_expected: 3,
        tolerance: 1,
        created_at: '',
        updated_at: '',
      },
    ];

    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: { i1: { profundity_level: 0 } },
      expectations,
      generationType: 'GT', // Does not match GI expectations
      transformationYear: 1,
    }));

    // No matching expectations → no gap analysis
    expect(result.gapAnalysis).toBeNull();
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('clientScoringService — edge cases', () => {
  it('empty responses → all zeros', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 },
          { id: 'i2', name: 'Prof', category: 'profundidad', weight: 1 },
        ],
      }],
      responses: {},
    }));

    expect(result.totalScore).toBe(0);
    expect(result.overallLevel).toBe(0);
  });

  it('all 100s → total 100', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [
          { id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 },
          { id: 'i2', name: 'Prof', category: 'profundidad', weight: 1 },
          { id: 'i3', name: 'Frec', category: 'frecuencia', weight: 1 },
          { id: 'i4', name: 'Det', category: 'detalle', weight: 1 },
          { id: 'i5', name: 'Tras', category: 'traspaso', weight: 1 },
        ],
      }],
      responses: {
        i1: { coverage_value: true },
        i2: { profundity_level: 4 },
        i3: { frequency_value: 100 },
        i4: { sub_responses: { selected_options: ['A'] } },
        i5: { sub_responses: { evidence_link: 'url' } },
      },
    }));

    expect(result.totalScore).toBe(100);
    expect(result.overallLevel).toBe(4);
    expect(result.overallLevelLabel).toBe('Consolidado');
  });

  it('no modules → 0 score', () => {
    const result = calculateDemoScores(makeInput({
      modules: [],
      responses: {},
    }));

    expect(result.totalScore).toBe(0);
    expect(result.stats.totalModules).toBe(0);
    expect(result.stats.totalIndicators).toBe(0);
  });

  it('empty objectives falls back to flat modules', () => {
    const result = calculateDemoScores(makeInput({
      objectives: [],
      modules: [{
        id: 'm1',
        name: 'Module 1',
        weight: 1,
        indicators: [{ id: 'i1', name: 'Cob', category: 'cobertura', weight: 1 }],
      }],
      responses: { i1: { coverage_value: true } },
    }));

    expect(result.totalScore).toBe(100);
    expect(result.objectiveScores).toBeNull();
  });

  it('expected level by year: year 1→1, year 3→2, year 5→3', () => {
    for (const [year, expected] of [[1, 1], [2, 1], [3, 2], [4, 3], [5, 3]] as [number, number][]) {
      const result = calculateDemoScores(makeInput({
        modules: [{
          id: 'm1',
          name: 'M',
          weight: 1,
          indicators: [{ id: 'i1', name: 'C', category: 'cobertura', weight: 1 }],
        }],
        responses: { i1: { coverage_value: true } },
        transformationYear: year,
      }));

      expect(result.expectedLevel).toBe(expected);
    }
  });

  it('stats: strongest and weakest module', () => {
    const result = calculateDemoScores(makeInput({
      modules: [
        {
          id: 'm1',
          name: 'Strong',
          weight: 1,
          indicators: [{ id: 'i1', name: 'C', category: 'cobertura', weight: 1 }],
        },
        {
          id: 'm2',
          name: 'Weak',
          weight: 1,
          indicators: [{ id: 'i2', name: 'C', category: 'cobertura', weight: 1 }],
        },
      ],
      responses: {
        i1: { coverage_value: true },
        i2: { coverage_value: false },
      },
    }));

    expect(result.stats.strongestModule).toBe('Strong');
    expect(result.stats.weakestModule).toBe('Weak');
  });

  it('single module → strongest set, weakest null', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'Only',
        weight: 1,
        indicators: [{ id: 'i1', name: 'C', category: 'cobertura', weight: 1 }],
      }],
      responses: { i1: { coverage_value: true } },
    }));

    expect(result.stats.strongestModule).toBe('Only');
    expect(result.stats.weakestModule).toBeNull();
  });

  it('meetsExpectations is false when overallLevel < expectedLevel', () => {
    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'M',
        weight: 1,
        indicators: [{ id: 'i1', name: 'C', category: 'cobertura', weight: 1 }],
      }],
      responses: { i1: { coverage_value: false } },
      transformationYear: 3, // expected level 2
    }));

    expect(result.overallLevel).toBe(0);
    expect(result.expectedLevel).toBe(2);
    expect(result.meetsExpectations).toBe(false);
  });

  it('custom scoring config thresholds are respected', () => {
    const customConfig: ScoringConfig = {
      level_thresholds: {
        consolidated: 90,
        advanced: 70,
        developing: 40,
        emerging: 20,
      },
      default_weights: { objective: 1, module: 1, indicator: 1 },
    };

    const result = calculateDemoScores(makeInput({
      modules: [{
        id: 'm1',
        name: 'M',
        weight: 1,
        indicators: [{ id: 'i1', name: 'Prof', category: 'profundidad', weight: 1 }],
      }],
      responses: { i1: { profundity_level: 3 } }, // score = 75
      scoringConfig: customConfig,
    }));

    // 75 >= 70 → level 3 with custom thresholds
    expect(result.overallLevel).toBe(3);
  });
});
