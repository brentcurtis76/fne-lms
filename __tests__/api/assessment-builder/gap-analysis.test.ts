/**
 * Gap Analysis Tests
 *
 * Tests for the gap analysis functionality in the scoring service.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyGap,
  scoreToActualLevel,
  getExpectedLevelForYear,
  calculateIndicatorGap,
  calculateModuleGapAnalysis,
  calculateAssessmentGapAnalysis,
  aggregateSchoolGapAnalysis,
  GapClassification,
  YearExpectation,
  IndicatorGapAnalysis,
  AssessmentGapAnalysis,
} from '@/lib/services/assessment-builder/scoringService';

describe('Gap Analysis - scoreToActualLevel', () => {
  it('should convert profundidad scores to levels correctly', () => {
    expect(scoreToActualLevel(0, 'profundidad')).toBe(0);
    expect(scoreToActualLevel(25, 'profundidad')).toBe(1);
    expect(scoreToActualLevel(50, 'profundidad')).toBe(2);
    expect(scoreToActualLevel(75, 'profundidad')).toBe(3);
    expect(scoreToActualLevel(100, 'profundidad')).toBe(4);
  });

  it('should handle intermediate scores for profundidad', () => {
    expect(scoreToActualLevel(12, 'profundidad')).toBe(0);
    expect(scoreToActualLevel(37, 'profundidad')).toBe(1);
    expect(scoreToActualLevel(62, 'profundidad')).toBe(2);
    expect(scoreToActualLevel(87, 'profundidad')).toBe(3);
  });

  it('should convert cobertura scores to 0 or 1', () => {
    expect(scoreToActualLevel(0, 'cobertura')).toBe(0);
    expect(scoreToActualLevel(49, 'cobertura')).toBe(0);
    expect(scoreToActualLevel(50, 'cobertura')).toBe(1);
    expect(scoreToActualLevel(100, 'cobertura')).toBe(1);
  });

  it('should convert frecuencia scores to 0 or 1', () => {
    expect(scoreToActualLevel(0, 'frecuencia')).toBe(0);
    expect(scoreToActualLevel(49, 'frecuencia')).toBe(0);
    expect(scoreToActualLevel(50, 'frecuencia')).toBe(1);
    expect(scoreToActualLevel(100, 'frecuencia')).toBe(1);
  });
});

describe('Gap Analysis - getExpectedLevelForYear', () => {
  const expectations: YearExpectation = {
    year_1_expected: 1,
    year_2_expected: 2,
    year_3_expected: 3,
    year_4_expected: 3,
    year_5_expected: 4,
    tolerance: 1,
  };

  it('should return correct expected level for each year', () => {
    expect(getExpectedLevelForYear(expectations, 1)).toBe(1);
    expect(getExpectedLevelForYear(expectations, 2)).toBe(2);
    expect(getExpectedLevelForYear(expectations, 3)).toBe(3);
    expect(getExpectedLevelForYear(expectations, 4)).toBe(3);
    expect(getExpectedLevelForYear(expectations, 5)).toBe(4);
  });

  it('should return null for null expectations', () => {
    expect(getExpectedLevelForYear(null, 1)).toBeNull();
    expect(getExpectedLevelForYear(undefined, 3)).toBeNull();
  });

  it('should return null for null year values', () => {
    const partialExpectations: YearExpectation = {
      year_1_expected: 1,
      year_2_expected: null,
      year_3_expected: 3,
      year_4_expected: null,
      year_5_expected: null,
      tolerance: 1,
    };
    expect(getExpectedLevelForYear(partialExpectations, 2)).toBeNull();
    expect(getExpectedLevelForYear(partialExpectations, 4)).toBeNull();
  });
});

describe('Gap Analysis - classifyGap', () => {
  describe('profundidad indicators', () => {
    it('should classify as ahead when actual >= expected', () => {
      expect(classifyGap(3, 2, 1, 'profundidad')).toBe('ahead');
      expect(classifyGap(4, 4, 1, 'profundidad')).toBe('ahead');
      expect(classifyGap(2, 1, 0, 'profundidad')).toBe('ahead');
    });

    it('should classify as on_track when within tolerance', () => {
      expect(classifyGap(2, 3, 1, 'profundidad')).toBe('on_track');
      expect(classifyGap(1, 3, 2, 'profundidad')).toBe('on_track');
    });

    it('should classify as behind when beyond tolerance but not critical', () => {
      expect(classifyGap(1, 3, 1, 'profundidad')).toBe('behind');
      expect(classifyGap(0, 2, 1, 'profundidad')).toBe('behind');
    });

    it('should classify as critical when 3+ levels behind', () => {
      expect(classifyGap(0, 3, 1, 'profundidad')).toBe('critical');
      expect(classifyGap(1, 4, 1, 'profundidad')).toBe('critical');
      expect(classifyGap(0, 4, 0, 'profundidad')).toBe('critical');
    });

    it('should classify as critical with 0 tolerance and any gap', () => {
      expect(classifyGap(2, 3, 0, 'profundidad')).toBe('critical');
      expect(classifyGap(1, 2, 0, 'profundidad')).toBe('critical');
    });
  });

  describe('cobertura/frecuencia indicators', () => {
    it('should classify as ahead when actual >= expected', () => {
      expect(classifyGap(1, 1, 0, 'cobertura')).toBe('ahead');
      expect(classifyGap(1, 0, 0, 'frecuencia')).toBe('ahead');
    });

    it('should classify as on_track within tolerance', () => {
      expect(classifyGap(0, 1, 1, 'cobertura')).toBe('on_track');
      expect(classifyGap(0, 1, 1, 'frecuencia')).toBe('on_track');
    });

    it('should classify as critical with 0 tolerance', () => {
      expect(classifyGap(0, 1, 0, 'cobertura')).toBe('critical');
      expect(classifyGap(0, 1, 0, 'frecuencia')).toBe('critical');
    });
  });

  it('should return on_track for null expected level', () => {
    expect(classifyGap(0, null, 1, 'profundidad')).toBe('on_track');
    expect(classifyGap(0, null, 0, 'cobertura')).toBe('on_track');
  });
});

describe('Gap Analysis - calculateIndicatorGap', () => {
  const expectations: YearExpectation = {
    year_1_expected: 1,
    year_2_expected: 2,
    year_3_expected: 3,
    year_4_expected: 3,
    year_5_expected: 4,
    tolerance: 1,
  };

  it('should calculate gap for profundidad indicator', () => {
    const gap = calculateIndicatorGap(
      'ind-1',
      'Test Indicator',
      'T1.1',
      'profundidad',
      50, // level 2
      expectations,
      3 // year 3 expects level 3
    );

    expect(gap.indicatorId).toBe('ind-1');
    expect(gap.indicatorName).toBe('Test Indicator');
    expect(gap.indicatorCode).toBe('T1.1');
    expect(gap.actualLevel).toBe(2);
    expect(gap.expectedLevel).toBe(3);
    expect(gap.gap).toBe(-1);
    expect(gap.classification).toBe('on_track'); // within tolerance of 1
    expect(gap.score).toBe(50);
  });

  it('should handle indicator without expectations', () => {
    const gap = calculateIndicatorGap(
      'ind-2',
      'Test Indicator 2',
      undefined,
      'cobertura',
      0,
      null,
      1
    );

    expect(gap.expectedLevel).toBeNull();
    expect(gap.gap).toBeNull();
    expect(gap.classification).toBe('on_track');
  });
});

describe('Gap Analysis - calculateModuleGapAnalysis', () => {
  const indicators: IndicatorGapAnalysis[] = [
    {
      indicatorId: 'ind-1',
      indicatorName: 'Indicator 1',
      category: 'profundidad',
      actualLevel: 3,
      expectedLevel: 2,
      gap: 1,
      tolerance: 1,
      classification: 'ahead',
      score: 75,
    },
    {
      indicatorId: 'ind-2',
      indicatorName: 'Indicator 2',
      category: 'profundidad',
      actualLevel: 2,
      expectedLevel: 3,
      gap: -1,
      tolerance: 1,
      classification: 'on_track',
      score: 50,
    },
    {
      indicatorId: 'ind-3',
      indicatorName: 'Indicator 3',
      category: 'profundidad',
      actualLevel: 0,
      expectedLevel: 3,
      gap: -3,
      tolerance: 1,
      classification: 'critical',
      score: 0,
    },
    {
      indicatorId: 'ind-4',
      indicatorName: 'Indicator 4',
      category: 'cobertura',
      actualLevel: 1,
      expectedLevel: null,
      gap: null,
      tolerance: 1,
      classification: 'on_track',
      score: 100,
    },
  ];

  it('should aggregate stats correctly', () => {
    const result = calculateModuleGapAnalysis('mod-1', 'Module 1', indicators);

    expect(result.moduleId).toBe('mod-1');
    expect(result.moduleName).toBe('Module 1');
    expect(result.stats.total).toBe(4);
    expect(result.stats.ahead).toBe(1);
    expect(result.stats.onTrack).toBe(1);
    expect(result.stats.behind).toBe(0);
    expect(result.stats.critical).toBe(1);
    expect(result.stats.notConfigured).toBe(1);
  });

  it('should calculate average gap correctly', () => {
    const result = calculateModuleGapAnalysis('mod-1', 'Module 1', indicators);
    // Average of (1, -1, -3) = -3/3 = -1
    expect(result.avgGap).toBe(-1);
  });
});

describe('Gap Analysis - calculateAssessmentGapAnalysis', () => {
  const modules = [
    {
      id: 'mod-1',
      name: 'Module 1',
      indicators: [
        {
          id: 'ind-1',
          name: 'Indicator 1',
          code: 'M1.1',
          category: 'profundidad' as const,
          expectations: {
            year_1_expected: 1,
            year_2_expected: 2,
            year_3_expected: 3,
            year_4_expected: 3,
            year_5_expected: 4,
            tolerance: 1,
          },
        },
      ],
    },
    {
      id: 'mod-2',
      name: 'Module 2',
      indicators: [
        {
          id: 'ind-2',
          name: 'Indicator 2',
          code: 'M2.1',
          category: 'cobertura' as const,
          expectations: {
            year_1_expected: 1,
            year_2_expected: 1,
            year_3_expected: 1,
            year_4_expected: 1,
            year_5_expected: 1,
            tolerance: 0,
          },
        },
      ],
    },
  ];

  const indicatorScores = new Map<string, number>([
    ['ind-1', 50], // level 2
    ['ind-2', 100], // level 1 (achieved)
  ]);

  it('should calculate full assessment gap analysis', () => {
    const result = calculateAssessmentGapAnalysis(
      'instance-1',
      3,
      'personalizacion',
      modules,
      indicatorScores
    );

    expect(result.instanceId).toBe('instance-1');
    expect(result.transformationYear).toBe(3);
    expect(result.area).toBe('personalizacion');
    expect(result.modules).toHaveLength(2);
  });

  it('should identify critical and behind indicators', () => {
    const lowScoreModules = [
      {
        id: 'mod-1',
        name: 'Module 1',
        indicators: [
          {
            id: 'ind-1',
            name: 'Critical Indicator',
            code: 'C1',
            category: 'profundidad' as const,
            expectations: {
              year_1_expected: 4,
              year_2_expected: 4,
              year_3_expected: 4,
              year_4_expected: 4,
              year_5_expected: 4,
              tolerance: 0,
            },
          },
        ],
      },
    ];

    const lowScores = new Map([['ind-1', 0]]); // level 0

    const result = calculateAssessmentGapAnalysis(
      'instance-1',
      1,
      'personalizacion',
      lowScoreModules,
      lowScores
    );

    expect(result.criticalIndicators).toHaveLength(1);
    expect(result.criticalIndicators[0].indicatorName).toBe('Critical Indicator');
  });
});

describe('Gap Analysis - aggregateSchoolGapAnalysis', () => {
  const analyses: AssessmentGapAnalysis[] = [
    {
      instanceId: 'inst-1',
      transformationYear: 1,
      area: 'personalizacion',
      modules: [],
      overallStats: { total: 10, ahead: 5, onTrack: 3, behind: 1, critical: 1, notConfigured: 0 },
      avgGap: 0.5,
      criticalIndicators: [
        { indicatorId: 'c1', indicatorName: 'Critical 1', category: 'profundidad', actualLevel: 0, expectedLevel: 4, gap: -4, tolerance: 0, classification: 'critical', score: 0 },
      ],
      behindIndicators: [],
    },
    {
      instanceId: 'inst-2',
      transformationYear: 1,
      area: 'personalizacion',
      modules: [],
      overallStats: { total: 10, ahead: 4, onTrack: 4, behind: 2, critical: 0, notConfigured: 0 },
      avgGap: -0.5,
      criticalIndicators: [],
      behindIndicators: [],
    },
    {
      instanceId: 'inst-3',
      transformationYear: 1,
      area: 'aprendizaje',
      modules: [],
      overallStats: { total: 8, ahead: 2, onTrack: 4, behind: 1, critical: 1, notConfigured: 0 },
      avgGap: -1.0,
      criticalIndicators: [
        { indicatorId: 'c1', indicatorName: 'Critical 1', category: 'profundidad', actualLevel: 0, expectedLevel: 4, gap: -4, tolerance: 0, classification: 'critical', score: 0 },
      ],
      behindIndicators: [],
    },
  ];

  it('should aggregate by area correctly', () => {
    const result = aggregateSchoolGapAnalysis(analyses);

    expect(result.byArea.personalizacion.count).toBe(2);
    expect(result.byArea.aprendizaje.count).toBe(1);
    expect(result.byArea.evaluacion.count).toBe(0);
  });

  it('should calculate overall stats', () => {
    const result = aggregateSchoolGapAnalysis(analyses);

    expect(result.overall.totalInstances).toBe(3);
    expect(result.overall.stats.ahead).toBe(11); // 5 + 4 + 2
    expect(result.overall.stats.onTrack).toBe(11); // 3 + 4 + 4
    expect(result.overall.stats.behind).toBe(4); // 1 + 2 + 1
    expect(result.overall.stats.critical).toBe(2); // 1 + 0 + 1
  });

  it('should track top critical indicators', () => {
    const result = aggregateSchoolGapAnalysis(analyses);

    expect(result.topCriticalIndicators.length).toBeGreaterThan(0);
    expect(result.topCriticalIndicators[0].indicatorName).toBe('Critical 1');
    expect(result.topCriticalIndicators[0].count).toBe(2); // appears in 2 analyses
  });

  it('should calculate average gap across all instances', () => {
    const result = aggregateSchoolGapAnalysis(analyses);
    // Average of (0.5, -0.5, -1.0) = -1/3 ≈ -0.33
    expect(result.overall.avgGap).toBeCloseTo(-0.33, 1);
  });
});
