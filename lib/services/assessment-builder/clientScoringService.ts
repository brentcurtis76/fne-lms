/**
 * Client-Side Scoring Service for Demo Mode
 *
 * Pure function that replicates the server-side scoring logic from scoringService.ts.
 * Runs entirely in the browser with zero side effects, no Supabase client, and no
 * database access.
 */

import type {
  IndicatorCategory,
  FrequencyConfig,
  ScoringConfig,
  TransformationArea,
  AssessmentYearExpectation,
  ModuleScore,
  IndicatorScore,
  ObjectiveScore,
} from '@/types/assessment-builder';
import {
  MATURITY_LEVELS,
  scoreToLevel,
  getExpectedLevelByYear,
  getMaturityLevelLabel,
} from '@/types/assessment-builder';
import type {
  GapClassification,
  IndicatorGap,
  ModuleGapStats,
  ModuleResult,
  GapAnalysisSummary,
} from '@/components/assessment/results/types';

export type { GapClassification, IndicatorGap, ModuleGapStats, ModuleResult, GapAnalysisSummary };

interface ObjectiveData {
  id: string;
  name: string;
  weight: number;
  modules: Array<{
    id: string;
    name: string;
    weight: number;
    indicators: Array<{
      id: string;
      code?: string;
      name: string;
      category: IndicatorCategory;
      weight: number;
      frequency_config?: FrequencyConfig;
    }>;
  }>;
}

interface ModuleData {
  id: string;
  name: string;
  weight: number;
  indicators: Array<{
    id: string;
    code?: string;
    name: string;
    category: IndicatorCategory;
    weight: number;
    frequency_config?: FrequencyConfig;
  }>;
}

interface ResponseData {
  coverage_value?: boolean;
  frequency_value?: number;
  profundity_level?: number;
  sub_responses?: Record<string, unknown>;
}

export interface DemoScoringInput {
  objectives: ObjectiveData[];
  modules: ModuleData[];
  responses: Record<string, ResponseData>;
  expectations: AssessmentYearExpectation[];
  scoringConfig: ScoringConfig;
  transformationYear: number;
  generationType: 'GT' | 'GI';
  templateName: string;
  templateArea: TransformationArea;
}

export interface DemoScoringOutput {
  totalScore: number;
  overallLevel: number;
  overallLevelLabel: string;
  expectedLevel: number;
  expectedLevelLabel: string;
  meetsExpectations: boolean;
  objectiveScores: ObjectiveScore[] | null;
  moduleScores: ModuleResult[];
  stats: {
    totalModules: number;
    totalIndicators: number;
    indicatorsAboveExpectation: number;
    strongestModule: string | null;
    weakestModule: string | null;
  };
  gapAnalysis: GapAnalysisSummary | null;
}

// ============================================================
// PER-INDICATOR SCORING
// ============================================================

export function scoreCoberturaIndicator(value: boolean | undefined | null): number {
  return value === true ? 100 : 0;
}

export function scoreFrecuenciaIndicator(
  value: number | undefined | null,
  config?: FrequencyConfig
): number {
  if (value === undefined || value === null) return 0;

  const min = config?.min ?? 0;
  const max = config?.max ?? 100;

  if (max <= min) return 0;

  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(((clamped - min) / (max - min)) * 10000) / 100;
}

export function scoreProfundidadIndicator(value: number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const clamped = Math.max(0, Math.min(4, value));
  return (clamped / 4) * 100;
}

export function scoreTraspasoIndicator(
  subResponses: Record<string, unknown> | undefined | null
): number {
  if (!subResponses) return 0;
  const evidenceLink = subResponses.evidence_link;
  const suggestions = subResponses.improvement_suggestions;
  const hasEvidence = typeof evidenceLink === 'string' && evidenceLink.trim().length > 0;
  const hasSuggestions = typeof suggestions === 'string' && suggestions.trim().length > 0;
  return hasEvidence || hasSuggestions ? 100 : 0;
}

export function scoreDetalleIndicator(
  subResponses: Record<string, unknown> | undefined | null
): number {
  if (!subResponses) return 0;
  const selectedOptions = subResponses.selected_options;
  return Array.isArray(selectedOptions) && selectedOptions.length > 0 ? 100 : 0;
}

function scoreIndicator(
  response: ResponseData,
  category: IndicatorCategory,
  frequencyConfig?: FrequencyConfig
): number {
  switch (category) {
    case 'cobertura':
      return scoreCoberturaIndicator(response.coverage_value);
    case 'frecuencia':
      return scoreFrecuenciaIndicator(response.frequency_value, frequencyConfig);
    case 'profundidad':
      return scoreProfundidadIndicator(response.profundity_level);
    case 'traspaso':
      return scoreTraspasoIndicator(response.sub_responses);
    case 'detalle':
      return scoreDetalleIndicator(response.sub_responses);
    default:
      return 0;
  }
}

function getRawValue(
  response: ResponseData,
  category: IndicatorCategory
): boolean | number | undefined {
  switch (category) {
    case 'cobertura':
      return response.coverage_value;
    case 'frecuencia':
      return response.frequency_value;
    case 'profundidad':
      return response.profundity_level;
    default:
      return undefined;
  }
}

// ============================================================
// WEIGHTED SCORING
// ============================================================

export function calculateWeightedAverage(
  items: Array<{ score: number; weight: number }>
): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = items.reduce((sum, item) => sum + item.score * item.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ============================================================
// GAP ANALYSIS
// ============================================================

export function classifyGap(
  actualLevel: number,
  expectedLevel: number | null,
  tolerance: number,
  category: IndicatorCategory
): GapClassification {
  if (expectedLevel === null) return 'on_track';

  const gap = actualLevel - expectedLevel;

  if (gap >= 0) return 'ahead';
  if (gap >= -tolerance) return 'on_track';
  if (category === 'profundidad' && gap <= -3) return 'critical';
  if (tolerance === 0 && gap < 0) return 'critical';

  return 'behind';
}

function buildExpectationsMap(
  expectations: AssessmentYearExpectation[],
  year: number,
  generationType: 'GT' | 'GI'
): Map<string, { expected: number | null; tolerance: number }> {
  const map = new Map<string, { expected: number | null; tolerance: number }>();
  const yearKey = `year_${year}_expected` as keyof AssessmentYearExpectation;

  for (const exp of expectations) {
    if (exp.generation_type !== generationType) continue;
    const expected = exp[yearKey] as number | undefined;
    map.set(exp.indicator_id, {
      expected: expected ?? null,
      tolerance: exp.tolerance ?? 1,
    });
  }
  return map;
}

// ============================================================
// MODULE SCORING WITH GAP ANALYSIS
// ============================================================

interface IndicatorInput {
  id: string;
  code?: string;
  name: string;
  category: IndicatorCategory;
  weight: number;
  frequency_config?: FrequencyConfig;
}

function scoreModule(
  module: { id: string; name: string; weight: number; indicators: IndicatorInput[] },
  responses: Record<string, ResponseData>,
  expectationsMap: Map<string, { expected: number | null; tolerance: number }>,
  scoringConfig: ScoringConfig
): ModuleResult | null {
  const indicators = module.indicators;
  if (indicators.length === 0) return null;

  // Check cobertura gate: if the first indicator is cobertura and answer is false,
  // all other indicators in the module score 0
  const firstIndicator = indicators[0];
  const firstResponse = responses[firstIndicator.id];
  const coberturaGate =
    firstIndicator.category === 'cobertura' &&
    (!firstResponse || firstResponse.coverage_value !== true);

  const indicatorResults: ModuleResult['indicators'] = [];
  let activeCount = 0;

  for (let i = 0; i < indicators.length; i++) {
    const ind = indicators[i];
    const response = responses[ind.id];
    const expectation = expectationsMap.get(ind.id);

    // If cobertura gate is active, non-first indicators score 0
    let normalizedScore: number;
    let rawValue: boolean | number | undefined;

    if (coberturaGate && i > 0) {
      normalizedScore = 0;
      rawValue = response ? getRawValue(response, ind.category) : undefined;
    } else if (response) {
      normalizedScore = scoreIndicator(response, ind.category, ind.frequency_config);
      rawValue = getRawValue(response, ind.category);
    } else {
      normalizedScore = 0;
      rawValue = undefined;
    }

    // Determine actual maturity level for gap analysis
    const actualLevel = scoreToLevel(normalizedScore, scoringConfig);

    // Gap analysis
    let gap: IndicatorGap | null = null;
    if (expectation && expectation.expected !== null) {
      const gapValue = actualLevel - expectation.expected;
      const classification = classifyGap(
        actualLevel,
        expectation.expected,
        expectation.tolerance,
        ind.category
      );
      gap = {
        actualLevel,
        expectedLevel: expectation.expected,
        gap: gapValue,
        classification,
        tolerance: expectation.tolerance,
      };
    }

    const isAboveExpectation =
      expectation && expectation.expected !== null
        ? actualLevel >= expectation.expected
        : true;

    if (isAboveExpectation) activeCount++;

    indicatorResults.push({
      indicatorId: ind.id,
      indicatorName: ind.name,
      category: ind.category,
      rawValue,
      normalizedScore,
      weight: ind.weight,
      isAboveExpectation,
      gap,
    });
  }

  // Calculate module score as weighted average
  // If cobertura gate is active, excluded indicators still count with score 0
  const moduleScore = calculateWeightedAverage(
    indicatorResults.map((ir) => ({ score: ir.normalizedScore, weight: ir.weight }))
  );

  const level = scoreToLevel(moduleScore, scoringConfig);

  // Build module gap stats
  let gapStats: ModuleGapStats | null = null;
  const gapsWithExpectations = indicatorResults.filter((ir) => ir.gap !== null);
  if (gapsWithExpectations.length > 0) {
    const stats = { ahead: 0, onTrack: 0, behind: 0, critical: 0 };
    const gaps: number[] = [];
    for (const ir of gapsWithExpectations) {
      stats[
        ir.gap!.classification === 'on_track'
          ? 'onTrack'
          : ir.gap!.classification
      ]++;
      if (ir.gap!.gap !== null) gaps.push(ir.gap!.gap);
    }
    gapStats = {
      ...stats,
      avgGap: gaps.length > 0
        ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100
        : null,
    };
  }

  return {
    moduleId: module.id,
    moduleName: module.name,
    moduleScore,
    moduleWeight: module.weight,
    level,
    gapStats,
    indicators: indicatorResults,
  };
}

// ============================================================
// MAIN SCORING FUNCTION
// ============================================================

export function calculateDemoScores(input: DemoScoringInput): DemoScoringOutput {
  const {
    objectives,
    modules,
    responses,
    expectations,
    scoringConfig,
    transformationYear,
    generationType,
  } = input;

  const year = Math.max(1, Math.min(5, transformationYear)) as 1 | 2 | 3 | 4 | 5;
  const expectationsMap = buildExpectationsMap(expectations, year, generationType);

  const hasObjectives = objectives && objectives.length > 0;

  let allModuleResults: ModuleResult[] = [];
  let objectiveScores: ObjectiveScore[] | null = null;
  let totalScore: number;

  if (hasObjectives) {
    objectiveScores = [];

    for (const objective of objectives) {
      const moduleResults: ModuleResult[] = [];

      for (const mod of objective.modules) {
        const result = scoreModule(mod, responses, expectationsMap, scoringConfig);
        if (result) moduleResults.push(result);
      }

      if (moduleResults.length === 0) continue;

      const objScore = calculateWeightedAverage(
        moduleResults.map((m) => ({ score: m.moduleScore, weight: m.moduleWeight }))
      );

      objectiveScores.push({
        objectiveId: objective.id,
        objectiveName: objective.name,
        objectiveScore: objScore,
        objectiveWeight: objective.weight,
        modules: moduleResults.map((mr) => ({
          moduleId: mr.moduleId,
          moduleName: mr.moduleName,
          moduleScore: mr.moduleScore,
          moduleWeight: mr.moduleWeight,
          indicators: mr.indicators.map((ir) => ({
            indicatorId: ir.indicatorId,
            indicatorName: ir.indicatorName,
            category: ir.category,
            rawValue: ir.rawValue,
            normalizedScore: ir.normalizedScore,
            weight: ir.weight,
            isAboveExpectation: ir.isAboveExpectation,
          })),
        })),
      });

      allModuleResults.push(...moduleResults);
    }

    totalScore =
      objectiveScores.length > 0
        ? calculateWeightedAverage(
            objectiveScores.map((o) => ({ score: o.objectiveScore, weight: o.objectiveWeight }))
          )
        : 0;
  } else {
    // Flat modules fallback
    for (const mod of modules) {
      const result = scoreModule(mod, responses, expectationsMap, scoringConfig);
      if (result) allModuleResults.push(result);
    }

    totalScore = calculateWeightedAverage(
      allModuleResults.map((m) => ({ score: m.moduleScore, weight: m.moduleWeight }))
    );
  }

  const overallLevel = scoreToLevel(totalScore, scoringConfig);
  const expectedLevel = getExpectedLevelByYear(year);

  // Build stats
  const allIndicators = allModuleResults.flatMap((m) => m.indicators);
  const indicatorsAboveExpectation = allIndicators.filter((i) => i.isAboveExpectation).length;

  let strongestModule: string | null = null;
  let weakestModule: string | null = null;
  if (allModuleResults.length > 0) {
    const sorted = [...allModuleResults].sort((a, b) => a.moduleScore - b.moduleScore);
    weakestModule = sorted[0].moduleName;
    strongestModule = sorted[sorted.length - 1].moduleName;
    if (sorted.length === 1) weakestModule = null; // Don't show weakest if only one module
  }

  // Build gap analysis summary
  let gapAnalysis: GapAnalysisSummary | null = null;
  const allGaps = allIndicators.filter((i) => i.gap !== null);
  if (allGaps.length > 0) {
    const overallStats = {
      total: allIndicators.length,
      ahead: 0,
      onTrack: 0,
      behind: 0,
      critical: 0,
      notConfigured: allIndicators.length - allGaps.length,
    };
    const gapValues: number[] = [];

    const criticalIndicators: GapAnalysisSummary['criticalIndicators'] = [];
    const behindIndicators: GapAnalysisSummary['behindIndicators'] = [];

    for (const ind of allGaps) {
      const g = ind.gap!;
      switch (g.classification) {
        case 'ahead':
          overallStats.ahead++;
          break;
        case 'on_track':
          overallStats.onTrack++;
          break;
        case 'behind':
          overallStats.behind++;
          behindIndicators.push({
            indicatorName: ind.indicatorName,
            actualLevel: g.actualLevel,
            expectedLevel: g.expectedLevel,
            gap: g.gap,
          });
          break;
        case 'critical':
          overallStats.critical++;
          criticalIndicators.push({
            indicatorName: ind.indicatorName,
            actualLevel: g.actualLevel,
            expectedLevel: g.expectedLevel,
            gap: g.gap,
          });
          break;
      }
      if (g.gap !== null) gapValues.push(g.gap);
    }

    gapAnalysis = {
      overallStats,
      avgGap:
        gapValues.length > 0
          ? Math.round((gapValues.reduce((s, v) => s + v, 0) / gapValues.length) * 100) / 100
          : null,
      criticalIndicators,
      behindIndicators,
    };
  }

  return {
    totalScore,
    overallLevel,
    overallLevelLabel: getMaturityLevelLabel(overallLevel),
    expectedLevel,
    expectedLevelLabel: getMaturityLevelLabel(expectedLevel),
    meetsExpectations: overallLevel >= expectedLevel,
    objectiveScores,
    moduleScores: allModuleResults,
    stats: {
      totalModules: allModuleResults.length,
      totalIndicators: allIndicators.length,
      indicatorsAboveExpectation,
      strongestModule,
      weakestModule,
    },
    gapAnalysis,
  };
}
