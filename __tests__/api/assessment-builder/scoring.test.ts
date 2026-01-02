/**
 * Unit tests for Assessment Builder Scoring Service
 * Phase 8: Scoring calculation and results
 *
 * Tests cover:
 * - Category-specific scoring (cobertura, frecuencia, profundidad)
 * - Weighted average calculations
 * - Module score aggregation
 * - Overall assessment scoring
 * - Score to level conversion
 */

import { describe, it, expect } from 'vitest';
import {
  scoreCoberturaIndicator,
  scoreFrecuenciaIndicator,
  scoreProfundidadIndicator,
  scoreIndicator,
  calculateWeightedAverage,
  calculateModuleScore,
  calculateAssessmentScores,
  aggregateSchoolScores,
} from '@/lib/services/assessment-builder/scoringService';
import {
  AssessmentResponse,
  FrequencyConfig,
  AssessmentSummary,
  scoreToLevel,
  getExpectedLevelByYear,
  getMaturityLevelLabel,
} from '@/types/assessment-builder';

describe('Cobertura Scoring', () => {
  it('should return 100 for true value', () => {
    expect(scoreCoberturaIndicator(true)).toBe(100);
  });

  it('should return 0 for false value', () => {
    expect(scoreCoberturaIndicator(false)).toBe(0);
  });

  it('should return 0 for undefined value', () => {
    expect(scoreCoberturaIndicator(undefined)).toBe(0);
  });

  it('should return 0 for null value', () => {
    expect(scoreCoberturaIndicator(null as any)).toBe(0);
  });
});

describe('Frecuencia Scoring', () => {
  it('should normalize value within default 0-100 range', () => {
    expect(scoreFrecuenciaIndicator(50)).toBe(50);
    expect(scoreFrecuenciaIndicator(0)).toBe(0);
    expect(scoreFrecuenciaIndicator(100)).toBe(100);
  });

  it('should normalize value with custom min/max config', () => {
    const config: FrequencyConfig = { type: 'count', min: 0, max: 10 };
    expect(scoreFrecuenciaIndicator(5, config)).toBe(50);
    expect(scoreFrecuenciaIndicator(10, config)).toBe(100);
    expect(scoreFrecuenciaIndicator(0, config)).toBe(0);
  });

  it('should clamp values outside range', () => {
    const config: FrequencyConfig = { type: 'count', min: 0, max: 10 };
    expect(scoreFrecuenciaIndicator(15, config)).toBe(100); // Clamped to max
    expect(scoreFrecuenciaIndicator(-5, config)).toBe(0); // Clamped to min
  });

  it('should return 0 for undefined value', () => {
    expect(scoreFrecuenciaIndicator(undefined)).toBe(0);
  });

  it('should return 0 for null value', () => {
    expect(scoreFrecuenciaIndicator(null as any)).toBe(0);
  });

  it('should handle non-zero min value', () => {
    const config: FrequencyConfig = { type: 'count', min: 5, max: 15 };
    expect(scoreFrecuenciaIndicator(5, config)).toBe(0);
    expect(scoreFrecuenciaIndicator(10, config)).toBe(50);
    expect(scoreFrecuenciaIndicator(15, config)).toBe(100);
  });

  it('should handle percentage type', () => {
    const config: FrequencyConfig = { type: 'percentage', min: 0, max: 100 };
    expect(scoreFrecuenciaIndicator(75, config)).toBe(75);
  });

  it('should return 0 for invalid config (max <= min)', () => {
    const config: FrequencyConfig = { type: 'count', min: 10, max: 5 };
    expect(scoreFrecuenciaIndicator(7, config)).toBe(0);
  });
});

describe('Profundidad Scoring', () => {
  it('should convert level 0 to 0%', () => {
    expect(scoreProfundidadIndicator(0)).toBe(0);
  });

  it('should convert level 1 to 25%', () => {
    expect(scoreProfundidadIndicator(1)).toBe(25);
  });

  it('should convert level 2 to 50%', () => {
    expect(scoreProfundidadIndicator(2)).toBe(50);
  });

  it('should convert level 3 to 75%', () => {
    expect(scoreProfundidadIndicator(3)).toBe(75);
  });

  it('should convert level 4 to 100%', () => {
    expect(scoreProfundidadIndicator(4)).toBe(100);
  });

  it('should clamp values above 4 to 100%', () => {
    expect(scoreProfundidadIndicator(5)).toBe(100);
    expect(scoreProfundidadIndicator(10)).toBe(100);
  });

  it('should clamp negative values to 0%', () => {
    expect(scoreProfundidadIndicator(-1)).toBe(0);
    expect(scoreProfundidadIndicator(-5)).toBe(0);
  });

  it('should return 0 for undefined value', () => {
    expect(scoreProfundidadIndicator(undefined)).toBe(0);
  });

  it('should return 0 for null value', () => {
    expect(scoreProfundidadIndicator(null as any)).toBe(0);
  });
});

describe('Generic scoreIndicator', () => {
  it('should route cobertura to cobertura scoring', () => {
    const response = { coverage_value: true };
    expect(scoreIndicator(response, 'cobertura')).toBe(100);
  });

  it('should route frecuencia to frecuencia scoring', () => {
    const response = { frequency_value: 50 };
    expect(scoreIndicator(response, 'frecuencia')).toBe(50);
  });

  it('should route profundidad to profundidad scoring', () => {
    const response = { profundity_level: 3 };
    expect(scoreIndicator(response, 'profundidad')).toBe(75);
  });

  it('should use frequency config when provided', () => {
    const response = { frequency_value: 5 };
    const config: FrequencyConfig = { type: 'count', min: 0, max: 10 };
    expect(scoreIndicator(response, 'frecuencia', config)).toBe(50);
  });

  it('should return 0 for unknown category', () => {
    const response = { coverage_value: true };
    expect(scoreIndicator(response, 'unknown' as any)).toBe(0);
  });
});

describe('Weighted Average Calculation', () => {
  it('should calculate simple average when all weights are equal', () => {
    const items = [
      { score: 80, weight: 1 },
      { score: 60, weight: 1 },
      { score: 100, weight: 1 },
    ];
    expect(calculateWeightedAverage(items)).toBe(80);
  });

  it('should calculate weighted average correctly', () => {
    const items = [
      { score: 100, weight: 3 }, // 300
      { score: 50, weight: 1 }, // 50
      // Total: 350 / 4 = 87.5
    ];
    expect(calculateWeightedAverage(items)).toBe(87.5);
  });

  it('should return 0 for empty array', () => {
    expect(calculateWeightedAverage([])).toBe(0);
  });

  it('should return 0 when total weight is 0', () => {
    const items = [
      { score: 100, weight: 0 },
      { score: 50, weight: 0 },
    ];
    expect(calculateWeightedAverage(items)).toBe(0);
  });

  it('should round to 2 decimal places', () => {
    const items = [
      { score: 33.333, weight: 1 },
      { score: 66.666, weight: 1 },
    ];
    // (33.333 + 66.666) / 2 = 49.9995 -> 50
    const result = calculateWeightedAverage(items);
    expect(result).toBeCloseTo(50, 1);
  });
});

describe('Module Score Calculation', () => {
  it('should calculate module score from indicators', () => {
    const indicators = [
      { id: 'i1', name: 'Indicator 1', category: 'cobertura' as const, weight: 1 },
      { id: 'i2', name: 'Indicator 2', category: 'profundidad' as const, weight: 1 },
    ];

    const responses = new Map<string, AssessmentResponse>([
      ['i1', { id: 'r1', instance_id: 'inst1', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' }],
      ['i2', { id: 'r2', instance_id: 'inst1', indicator_id: 'i2', profundity_level: 4, responded_at: '', updated_at: '' }],
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    expect(result.moduleName).toBe('Test Module');
    expect(result.moduleScore).toBe(100); // (100 + 100) / 2
    expect(result.indicators).toHaveLength(2);
  });

  it('should handle missing responses as 0', () => {
    const indicators = [
      { id: 'i1', name: 'Indicator 1', category: 'cobertura' as const, weight: 1 },
      { id: 'i2', name: 'Indicator 2', category: 'profundidad' as const, weight: 1 },
    ];

    const responses = new Map<string, AssessmentResponse>([
      ['i1', { id: 'r1', instance_id: 'inst1', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' }],
      // i2 has no response
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    expect(result.moduleScore).toBe(50); // (100 + 0) / 2
  });

  it('should respect indicator weights', () => {
    const indicators = [
      { id: 'i1', name: 'Indicator 1', category: 'cobertura' as const, weight: 3 },
      { id: 'i2', name: 'Indicator 2', category: 'cobertura' as const, weight: 1 },
    ];

    const responses = new Map<string, AssessmentResponse>([
      ['i1', { id: 'r1', instance_id: 'inst1', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' }],
      ['i2', { id: 'r2', instance_id: 'inst1', indicator_id: 'i2', coverage_value: false, responded_at: '', updated_at: '' }],
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    // (100*3 + 0*1) / 4 = 75
    expect(result.moduleScore).toBe(75);
  });

  it('should calculate isAboveExpectation correctly', () => {
    const indicators = [
      { id: 'i1', name: 'Indicator 1', category: 'profundidad' as const, weight: 1, expectedLevel: 2 },
    ];

    const responses = new Map<string, AssessmentResponse>([
      ['i1', { id: 'r1', instance_id: 'inst1', indicator_id: 'i1', profundity_level: 3, responded_at: '', updated_at: '' }],
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    // Level 3 = 75%, expected 2 = 50%, so above expectation
    expect(result.indicators[0].isAboveExpectation).toBe(true);
  });
});

describe('Full Assessment Scoring', () => {
  it('should calculate overall score from modules', () => {
    const input = {
      instanceId: 'test-instance',
      transformationYear: 1 as const,
      area: 'personalizacion' as const,
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 1,
          indicators: [{ id: 'i1', name: 'Ind 1', category: 'cobertura' as const, weight: 1 }],
        },
        {
          id: 'm2',
          name: 'Module 2',
          weight: 1,
          indicators: [{ id: 'i2', name: 'Ind 2', category: 'profundidad' as const, weight: 1 }],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' },
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', profundity_level: 2, responded_at: '', updated_at: '' },
      ],
    };

    const result = calculateAssessmentScores(input);

    expect(result.instanceId).toBe('test-instance');
    expect(result.area).toBe('personalizacion');
    expect(result.moduleScores).toHaveLength(2);
    // Module 1: 100, Module 2: 50 -> Average: 75
    expect(result.totalScore).toBe(75);
  });

  it('should calculate correct maturity level', () => {
    const input = {
      instanceId: 'test-instance',
      transformationYear: 1 as const,
      area: 'aprendizaje' as const,
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 1,
          indicators: [{ id: 'i1', name: 'Ind 1', category: 'profundidad' as const, weight: 1 }],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', profundity_level: 4, responded_at: '', updated_at: '' },
      ],
    };

    const result = calculateAssessmentScores(input);

    // Score 100 -> Level 4 (Consolidated)
    expect(result.overallLevel).toBe(4);
  });

  it('should include expected level based on transformation year', () => {
    const input = {
      instanceId: 'test-instance',
      transformationYear: 3 as const, // Year 3 expects level 2
      area: 'evaluacion' as const,
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 1,
          indicators: [{ id: 'i1', name: 'Ind 1', category: 'cobertura' as const, weight: 1 }],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' },
      ],
    };

    const result = calculateAssessmentScores(input);

    expect(result.expectedLevel).toBe(2); // Year 3 expects "En Desarrollo"
    expect(result.transformationYear).toBe(3);
  });

  it('should respect module weights', () => {
    const input = {
      instanceId: 'test-instance',
      transformationYear: 1 as const,
      area: 'personalizacion' as const,
      modules: [
        {
          id: 'm1',
          name: 'Module 1',
          weight: 3,
          indicators: [{ id: 'i1', name: 'Ind 1', category: 'cobertura' as const, weight: 1 }],
        },
        {
          id: 'm2',
          name: 'Module 2',
          weight: 1,
          indicators: [{ id: 'i2', name: 'Ind 2', category: 'cobertura' as const, weight: 1 }],
        },
      ],
      responses: [
        { id: 'r1', instance_id: 'test', indicator_id: 'i1', coverage_value: true, responded_at: '', updated_at: '' },
        { id: 'r2', instance_id: 'test', indicator_id: 'i2', coverage_value: false, responded_at: '', updated_at: '' },
      ],
    };

    const result = calculateAssessmentScores(input);

    // Module 1 (100) weight 3, Module 2 (0) weight 1
    // (100*3 + 0*1) / 4 = 75
    expect(result.totalScore).toBe(75);
  });
});

describe('Score to Level Conversion', () => {
  it('should use default thresholds', () => {
    expect(scoreToLevel(0)).toBe(0); // Por Comenzar
    expect(scoreToLevel(12.5)).toBe(1); // Incipiente
    expect(scoreToLevel(37.5)).toBe(2); // En Desarrollo
    expect(scoreToLevel(62.5)).toBe(3); // Avanzado
    expect(scoreToLevel(87.5)).toBe(4); // Consolidado
    expect(scoreToLevel(100)).toBe(4); // Consolidado
  });

  it('should use custom thresholds when provided', () => {
    const customConfig = {
      level_thresholds: {
        consolidated: 90,
        advanced: 70,
        developing: 40,
        emerging: 20,
      },
    };

    expect(scoreToLevel(15, customConfig)).toBe(0);
    expect(scoreToLevel(25, customConfig)).toBe(1);
    expect(scoreToLevel(50, customConfig)).toBe(2);
    expect(scoreToLevel(75, customConfig)).toBe(3);
    expect(scoreToLevel(95, customConfig)).toBe(4);
  });
});

describe('School Score Aggregation', () => {
  it('should aggregate scores by area', () => {
    const summaries: AssessmentSummary[] = [
      {
        instanceId: 'i1',
        area: 'personalizacion',
        totalScore: 80,
        moduleScores: [],
        overallLevel: 3,
        expectedLevel: 2,
        transformationYear: 3,
      },
      {
        instanceId: 'i2',
        area: 'personalizacion',
        totalScore: 60,
        moduleScores: [],
        overallLevel: 2,
        expectedLevel: 2,
        transformationYear: 3,
      },
      {
        instanceId: 'i3',
        area: 'aprendizaje',
        totalScore: 90,
        moduleScores: [],
        overallLevel: 4,
        expectedLevel: 2,
        transformationYear: 3,
      },
    ];

    const result = aggregateSchoolScores(summaries);

    expect(result.byArea.personalizacion.avgScore).toBe(70);
    expect(result.byArea.personalizacion.count).toBe(2);
    expect(result.byArea.aprendizaje.avgScore).toBe(90);
    expect(result.byArea.aprendizaje.count).toBe(1);
  });

  it('should calculate overall averages', () => {
    const summaries: AssessmentSummary[] = [
      {
        instanceId: 'i1',
        area: 'personalizacion',
        totalScore: 60,
        moduleScores: [],
        overallLevel: 2,
        expectedLevel: 2,
        transformationYear: 3,
      },
      {
        instanceId: 'i2',
        area: 'aprendizaje',
        totalScore: 80,
        moduleScores: [],
        overallLevel: 3,
        expectedLevel: 2,
        transformationYear: 3,
      },
    ];

    const result = aggregateSchoolScores(summaries);

    expect(result.overall.avgScore).toBe(70);
    expect(result.overall.avgLevel).toBe(2.5);
    expect(result.overall.totalInstances).toBe(2);
  });

  it('should handle empty summaries', () => {
    const result = aggregateSchoolScores([]);

    expect(result.overall.avgScore).toBe(0);
    expect(result.overall.avgLevel).toBe(0);
    expect(result.overall.totalInstances).toBe(0);
  });

  it('should return 0 counts for areas without data', () => {
    const summaries: AssessmentSummary[] = [
      {
        instanceId: 'i1',
        area: 'personalizacion',
        totalScore: 80,
        moduleScores: [],
        overallLevel: 3,
        expectedLevel: 2,
        transformationYear: 3,
      },
    ];

    const result = aggregateSchoolScores(summaries);

    expect(result.byArea.personalizacion.count).toBe(1);
    expect(result.byArea.aprendizaje.count).toBe(0);
    expect(result.byArea.evaluacion.count).toBe(0);
  });
});

describe('Expected Level by Year', () => {
  it('should return correct expected levels', () => {
    expect(getExpectedLevelByYear(1)).toBe(1); // Incipiente
    expect(getExpectedLevelByYear(2)).toBe(1); // Incipiente
    expect(getExpectedLevelByYear(3)).toBe(2); // En Desarrollo
    expect(getExpectedLevelByYear(4)).toBe(3); // Avanzado
    expect(getExpectedLevelByYear(5)).toBe(3); // Avanzado
  });
});

describe('Maturity Level Labels', () => {
  it('should return correct labels for all levels', () => {
    expect(getMaturityLevelLabel(0)).toBe('Por Comenzar');
    expect(getMaturityLevelLabel(1)).toBe('Incipiente');
    expect(getMaturityLevelLabel(2)).toBe('En Desarrollo');
    expect(getMaturityLevelLabel(3)).toBe('Avanzado');
    expect(getMaturityLevelLabel(4)).toBe('Consolidado');
  });

  it('should return Desconocido for invalid level', () => {
    expect(getMaturityLevelLabel(5)).toBe('Desconocido');
    expect(getMaturityLevelLabel(-1)).toBe('Desconocido');
  });
});
