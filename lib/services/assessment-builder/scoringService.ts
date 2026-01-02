/**
 * Scoring Service for Assessment Builder
 *
 * Calculates scores for assessment instances based on indicator responses.
 * Supports three indicator categories with different scoring logic:
 * - Cobertura (boolean): true = 100, false = 0
 * - Frecuencia (number): normalized using min/max config
 * - Profundidad (level 0-4): (level / 4) * 100
 *
 * Also includes gap analysis comparing actual vs expected levels.
 *
 * NOTE: Uses supabaseAdmin for write operations to bypass RLS restrictions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  AssessmentResponse,
  ScoringConfig,
  ModuleScore,
  IndicatorScore,
  AssessmentSummary,
  IndicatorCategory,
  FrequencyConfig,
  TransformationArea,
} from '@/types/assessment-builder';
import { scoreToLevel, getExpectedLevelByYear } from '@/types/assessment-builder';

// ============================================================
// CORE SCORING FUNCTIONS
// ============================================================

/**
 * Calculate normalized score (0-100) for a cobertura indicator
 */
export function scoreCoberturaIndicator(value: boolean | undefined | null): number {
  if (value === true) return 100;
  if (value === false) return 0;
  return 0; // Undefined/null treated as 0
}

/**
 * Calculate normalized score (0-100) for a frecuencia indicator
 */
export function scoreFrecuenciaIndicator(
  value: number | undefined | null,
  config?: FrequencyConfig
): number {
  if (value === undefined || value === null) return 0;

  const min = config?.min ?? 0;
  const max = config?.max ?? 100;

  if (max <= min) return 0; // Invalid config

  // Clamp value to range
  const clampedValue = Math.max(min, Math.min(max, value));

  // Normalize to 0-100
  const normalized = ((clampedValue - min) / (max - min)) * 100;
  return Math.round(normalized * 100) / 100; // 2 decimal places
}

/**
 * Calculate normalized score (0-100) for a profundidad indicator
 */
export function scoreProfundidadIndicator(level: number | undefined | null): number {
  if (level === undefined || level === null) return 0;

  // Clamp to 0-4 range
  const clampedLevel = Math.max(0, Math.min(4, level));

  // Convert to percentage (0=0%, 1=25%, 2=50%, 3=75%, 4=100%)
  return (clampedLevel / 4) * 100;
}

/**
 * Calculate score for any indicator based on its category
 */
export function scoreIndicator(
  response: Pick<AssessmentResponse, 'coverage_value' | 'frequency_value' | 'profundity_level'>,
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
    default:
      return 0;
  }
}

/**
 * Get the raw value from a response based on category
 */
export function getRawValue(
  response: Pick<AssessmentResponse, 'coverage_value' | 'frequency_value' | 'profundity_level'>,
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

/**
 * Calculate weighted average of scores
 */
export function calculateWeightedAverage(
  items: Array<{ score: number; weight: number }>
): number {
  if (items.length === 0) return 0;

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = items.reduce((sum, item) => sum + item.score * item.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Calculate scores for all indicators in a module
 */
export function calculateModuleScore(
  indicators: Array<{
    id: string;
    name: string;
    category: IndicatorCategory;
    weight: number;
    frequency_config?: FrequencyConfig;
    expectedLevel?: number;
  }>,
  responses: Map<string, AssessmentResponse>,
  moduleName: string,
  moduleWeight: number
): ModuleScore {
  const indicatorScores: IndicatorScore[] = indicators.map((indicator) => {
    const response = responses.get(indicator.id);
    const rawValue = response ? getRawValue(response, indicator.category) : undefined;
    const normalizedScore = response
      ? scoreIndicator(response, indicator.category, indicator.frequency_config)
      : 0;

    return {
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      category: indicator.category,
      rawValue,
      normalizedScore,
      weight: indicator.weight,
      expectedLevel: indicator.expectedLevel,
      isAboveExpectation:
        indicator.expectedLevel !== undefined
          ? normalizedScore >= (indicator.expectedLevel / 4) * 100
          : true,
    };
  });

  const moduleScore = calculateWeightedAverage(
    indicatorScores.map((i) => ({ score: i.normalizedScore, weight: i.weight }))
  );

  return {
    moduleId: '', // Will be set by caller
    moduleName,
    moduleScore,
    moduleWeight,
    indicators: indicatorScores,
  };
}

// ============================================================
// FULL ASSESSMENT CALCULATION
// ============================================================

export interface CalculateScoresInput {
  instanceId: string;
  transformationYear: 1 | 2 | 3 | 4 | 5;
  area: TransformationArea;
  scoringConfig?: ScoringConfig;
  modules: Array<{
    id: string;
    name: string;
    weight: number;
    indicators: Array<{
      id: string;
      name: string;
      category: IndicatorCategory;
      weight: number;
      frequency_config?: FrequencyConfig;
    }>;
  }>;
  responses: AssessmentResponse[];
  yearExpectations?: Map<string, number>; // indicatorId -> expected level
}

/**
 * Calculate complete assessment scores including all modules and overall score
 */
export function calculateAssessmentScores(input: CalculateScoresInput): AssessmentSummary {
  const responseMap = new Map(input.responses.map((r) => [r.indicator_id, r]));

  const moduleScores: ModuleScore[] = input.modules.map((module) => {
    const indicatorsWithExpectations = module.indicators.map((ind) => ({
      ...ind,
      expectedLevel: input.yearExpectations?.get(ind.id),
    }));

    const score = calculateModuleScore(
      indicatorsWithExpectations,
      responseMap,
      module.name,
      module.weight
    );
    score.moduleId = module.id;
    return score;
  });

  // Calculate overall weighted score
  const totalScore = calculateWeightedAverage(
    moduleScores.map((m) => ({ score: m.moduleScore, weight: m.moduleWeight }))
  );

  // Convert score to maturity level
  const overallLevel = scoreToLevel(totalScore, input.scoringConfig);

  // Get expected level based on transformation year
  const expectedLevel = getExpectedLevelByYear(input.transformationYear);

  return {
    instanceId: input.instanceId,
    area: input.area,
    totalScore,
    moduleScores,
    overallLevel,
    expectedLevel,
    transformationYear: input.transformationYear,
  };
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

export interface InstanceDataForScoring {
  instanceId: string;
  transformationYear: 1 | 2 | 3 | 4 | 5;
  area: TransformationArea;
  scoringConfig?: ScoringConfig;
  modules: Array<{
    id: string;
    name: string;
    weight: number;
    indicators: Array<{
      id: string;
      name: string;
      category: IndicatorCategory;
      weight: number;
      frequency_config?: FrequencyConfig;
    }>;
  }>;
  responses: AssessmentResponse[];
}

/**
 * Fetch all data needed for scoring an assessment instance
 */
export async function fetchInstanceDataForScoring(
  supabase: SupabaseClient,
  instanceId: string
): Promise<InstanceDataForScoring | null> {
  // Get instance with snapshot
  const { data: instance, error: instanceError } = await supabase
    .from('assessment_instances')
    .select(
      `
      id,
      transformation_year,
      template_snapshot_id,
      assessment_template_snapshots!inner (
        snapshot_data
      )
    `
    )
    .eq('id', instanceId)
    .single();

  if (instanceError || !instance) {
    console.error('Error fetching instance:', instanceError);
    return null;
  }

  // Get responses for this instance
  const { data: responses, error: responsesError } = await supabase
    .from('assessment_responses')
    .select('*')
    .eq('instance_id', instanceId);

  if (responsesError) {
    console.error('Error fetching responses:', responsesError);
    return null;
  }

  // Extract data from snapshot
  const snapshotData = (instance as any).assessment_template_snapshots?.snapshot_data;
  if (!snapshotData) {
    console.error('No snapshot data found');
    return null;
  }

  const template = snapshotData.template;
  const snapshotModules = snapshotData.modules || [];

  const modules = snapshotModules.map((m: any) => ({
    id: m.id,
    name: m.name,
    weight: m.weight ?? 1,
    indicators: (m.indicators || []).map((ind: any) => ({
      id: ind.id,
      name: ind.name,
      category: ind.category as IndicatorCategory,
      weight: ind.weight ?? 1,
      frequency_config: ind.frequency_config,
    })),
  }));

  return {
    instanceId: instance.id,
    transformationYear: instance.transformation_year as 1 | 2 | 3 | 4 | 5,
    area: template.area as TransformationArea,
    scoringConfig: template.scoring_config,
    modules,
    responses: responses || [],
  };
}

/**
 * Calculate and save scores for an assessment instance
 * NOTE: Uses supabaseAdmin for write operations to bypass RLS restrictions
 */
export async function calculateAndSaveScores(
  supabase: SupabaseClient,
  instanceId: string,
  calculatedBy?: string
): Promise<{ success: boolean; summary?: AssessmentSummary; error?: string }> {
  try {
    // Fetch instance data (use passed client for reads, which may be RLS-restricted)
    const instanceData = await fetchInstanceDataForScoring(supabase, instanceId);
    if (!instanceData) {
      return { success: false, error: 'No se pudo cargar los datos de la instancia' };
    }

    // Calculate scores
    const summary = calculateAssessmentScores({
      instanceId: instanceData.instanceId,
      transformationYear: instanceData.transformationYear,
      area: instanceData.area,
      scoringConfig: instanceData.scoringConfig,
      modules: instanceData.modules,
      responses: instanceData.responses,
    });

    // Check if result already exists (use admin client to bypass RLS)
    const { data: existingResult } = await supabaseAdmin
      .from('assessment_instance_results')
      .select('id')
      .eq('instance_id', instanceId)
      .single();

    const resultData = {
      instance_id: instanceId,
      total_score: summary.totalScore,
      overall_level: summary.overallLevel,
      module_scores: summary.moduleScores,
      expected_level: summary.expectedLevel,
      meets_expectations: summary.overallLevel >= summary.expectedLevel,
      calculated_at: new Date().toISOString(),
      calculated_by: calculatedBy,
    };

    if (existingResult) {
      // Update existing result (use admin client to bypass RLS)
      const { error: updateError } = await supabaseAdmin
        .from('assessment_instance_results')
        .update(resultData)
        .eq('id', existingResult.id);

      if (updateError) {
        return { success: false, error: `Error actualizando resultado: ${updateError.message}` };
      }
    } else {
      // Insert new result (use admin client to bypass RLS)
      const { error: insertError } = await supabaseAdmin
        .from('assessment_instance_results')
        .insert(resultData);

      if (insertError) {
        return { success: false, error: `Error guardando resultado: ${insertError.message}` };
      }
    }

    return { success: true, summary };
  } catch (err: any) {
    console.error('Unexpected error calculating scores:', err);
    return { success: false, error: err.message || 'Error inesperado' };
  }
}

/**
 * Get calculated results for an instance
 * NOTE: Uses supabaseAdmin to bypass RLS for reading results
 */
export async function getInstanceResults(
  supabase: SupabaseClient,
  instanceId: string
): Promise<AssessmentSummary | null> {
  // Use admin client to bypass RLS for results table
  const { data: result, error } = await supabaseAdmin
    .from('assessment_instance_results')
    .select('*')
    .eq('instance_id', instanceId)
    .single();

  if (error || !result) {
    return null;
  }

  // Get instance for transformation year and area (can use passed client)
  const { data: instance } = await supabase
    .from('assessment_instances')
    .select(
      `
      transformation_year,
      assessment_template_snapshots!inner (
        snapshot_data
      )
    `
    )
    .eq('id', instanceId)
    .single();

  const snapshotData = (instance as any)?.assessment_template_snapshots?.snapshot_data;

  return {
    instanceId,
    area: snapshotData?.template?.area || 'personalizacion',
    totalScore: result.total_score,
    moduleScores: result.module_scores || [],
    overallLevel: result.overall_level,
    expectedLevel: result.expected_level,
    transformationYear: instance?.transformation_year || 1,
    completedAt: result.calculated_at,
  };
}

// ============================================================
// BATCH OPERATIONS
// ============================================================

/**
 * Calculate scores for multiple instances (e.g., when a directivo views school dashboard)
 */
export async function calculateScoresForSchool(
  supabase: SupabaseClient,
  schoolId: number,
  options?: {
    area?: TransformationArea;
    onlyCompleted?: boolean;
  }
): Promise<AssessmentSummary[]> {
  let query = supabase
    .from('assessment_instances')
    .select('id')
    .eq('school_id', schoolId);

  if (options?.onlyCompleted) {
    query = query.eq('status', 'completed');
  }

  const { data: instances, error } = await query;

  if (error || !instances) {
    console.error('Error fetching school instances:', error);
    return [];
  }

  const summaries: AssessmentSummary[] = [];

  for (const instance of instances) {
    const summary = await getInstanceResults(supabase, instance.id);
    if (summary) {
      if (!options?.area || summary.area === options.area) {
        summaries.push(summary);
      }
    }
  }

  return summaries;
}

/**
 * Aggregate scores across multiple instances for school-level view
 */
export function aggregateSchoolScores(
  summaries: AssessmentSummary[]
): {
  byArea: Record<TransformationArea, { avgScore: number; avgLevel: number; count: number }>;
  overall: { avgScore: number; avgLevel: number; totalInstances: number };
} {
  const byArea: Record<TransformationArea, { scores: number[]; levels: number[] }> = {
    personalizacion: { scores: [], levels: [] },
    aprendizaje: { scores: [], levels: [] },
    evaluacion: { scores: [], levels: [] },
    proposito: { scores: [], levels: [] },
    familias: { scores: [], levels: [] },
    trabajo_docente: { scores: [], levels: [] },
    liderazgo: { scores: [], levels: [] },
  };

  for (const summary of summaries) {
    byArea[summary.area].scores.push(summary.totalScore);
    byArea[summary.area].levels.push(summary.overallLevel);
  }

  const areas = Object.keys(byArea) as TransformationArea[];
  const aggregatedByArea = {} as Record<
    TransformationArea,
    { avgScore: number; avgLevel: number; count: number }
  >;

  let allScores: number[] = [];
  let allLevels: number[] = [];

  for (const area of areas) {
    const data = byArea[area];
    const count = data.scores.length;
    if (count > 0) {
      aggregatedByArea[area] = {
        avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / count) * 100) / 100,
        avgLevel: Math.round((data.levels.reduce((a, b) => a + b, 0) / count) * 100) / 100,
        count,
      };
      allScores = allScores.concat(data.scores);
      allLevels = allLevels.concat(data.levels);
    } else {
      aggregatedByArea[area] = { avgScore: 0, avgLevel: 0, count: 0 };
    }
  }

  const totalInstances = allScores.length;
  const overall =
    totalInstances > 0
      ? {
          avgScore:
            Math.round((allScores.reduce((a, b) => a + b, 0) / totalInstances) * 100) / 100,
          avgLevel:
            Math.round((allLevels.reduce((a, b) => a + b, 0) / totalInstances) * 100) / 100,
          totalInstances,
        }
      : { avgScore: 0, avgLevel: 0, totalInstances: 0 };

  return { byArea: aggregatedByArea, overall };
}

// ============================================================
// GAP ANALYSIS TYPES AND FUNCTIONS
// ============================================================

/**
 * Gap classification based on the difference between actual and expected levels
 */
export type GapClassification = 'ahead' | 'on_track' | 'behind' | 'critical';

/**
 * Gap analysis result for a single indicator
 */
export interface IndicatorGapAnalysis {
  indicatorId: string;
  indicatorName: string;
  indicatorCode?: string;
  category: IndicatorCategory;
  actualLevel: number; // 0-4 for profundidad, 0 or 1 for cobertura/frecuencia
  expectedLevel: number | null; // null if no expectation defined
  gap: number | null; // actualLevel - expectedLevel (positive = ahead, negative = behind)
  tolerance: number; // 0-2
  classification: GapClassification;
  score: number; // 0-100 normalized score
  // Frequency-specific fields
  frequencyActual?: { value: number; unit?: string };
  frequencyExpected?: { value: number; unit: string };
  frequencyGapPercent?: number; // Percentage difference after unit conversion
}

/**
 * Gap analysis for a module
 */
export interface ModuleGapAnalysis {
  moduleId: string;
  moduleName: string;
  indicators: IndicatorGapAnalysis[];
  stats: {
    total: number;
    ahead: number;
    onTrack: number;
    behind: number;
    critical: number;
    notConfigured: number; // No expectation defined
  };
  avgGap: number | null; // Average gap across all indicators with expectations
}

/**
 * Full gap analysis for an assessment instance
 */
export interface AssessmentGapAnalysis {
  instanceId: string;
  transformationYear: 1 | 2 | 3 | 4 | 5;
  area: TransformationArea;
  modules: ModuleGapAnalysis[];
  overallStats: {
    total: number;
    ahead: number;
    onTrack: number;
    behind: number;
    critical: number;
    notConfigured: number;
  };
  avgGap: number | null;
  criticalIndicators: IndicatorGapAnalysis[]; // List of indicators marked as critical
  behindIndicators: IndicatorGapAnalysis[]; // List of indicators behind expectations
}

/**
 * Year expectation data from template snapshot
 */
export interface YearExpectation {
  year_1_expected: number | null;
  year_1_expected_unit?: string | null;
  year_2_expected: number | null;
  year_2_expected_unit?: string | null;
  year_3_expected: number | null;
  year_3_expected_unit?: string | null;
  year_4_expected: number | null;
  year_4_expected_unit?: string | null;
  year_5_expected: number | null;
  year_5_expected_unit?: string | null;
  tolerance: number;
}

/**
 * Frequency expectation with value and unit
 */
export interface FrequencyExpectation {
  value: number;
  unit: string;
}

/**
 * Conversion factors to normalize frequency to "per year"
 */
const FREQUENCY_CONVERSION_FACTORS: Record<string, number> = {
  'dia': 365,
  'semana': 52,
  'mes': 12,
  'trimestre': 4,
  'semestre': 2,
  'año': 1,
};

/**
 * Convert frequency to annual equivalent for comparison
 */
export function normalizeFrequencyToAnnual(value: number, unit: string): number {
  const factor = FREQUENCY_CONVERSION_FACTORS[unit] || 1;
  return value * factor;
}

/**
 * Get the expected level for a specific transformation year from expectations config
 */
export function getExpectedLevelForYear(
  expectations: YearExpectation | null | undefined,
  year: 1 | 2 | 3 | 4 | 5
): number | null {
  if (!expectations) return null;

  const key = `year_${year}_expected` as keyof YearExpectation;
  const value = expectations[key];

  if (typeof value === 'number') return value;
  return null;
}

/**
 * Get frequency expectation with value and unit for a specific year
 */
export function getFrequencyExpectationForYear(
  expectations: YearExpectation | null | undefined,
  year: 1 | 2 | 3 | 4 | 5
): FrequencyExpectation | null {
  if (!expectations) return null;

  const valueKey = `year_${year}_expected` as keyof YearExpectation;
  const unitKey = `year_${year}_expected_unit` as keyof YearExpectation;

  const value = expectations[valueKey];
  const unit = expectations[unitKey];

  if (typeof value === 'number') {
    return {
      value,
      unit: typeof unit === 'string' ? unit : 'año', // Default to annual if no unit
    };
  }
  return null;
}

/**
 * Compare actual frequency against expected, considering unit conversion
 * Returns: positive = ahead, 0 = on track, negative = behind
 */
export function compareFrequency(
  actualValue: number,
  actualUnit: string | undefined,
  expectedValue: number,
  expectedUnit: string
): number {
  const actualAnnual = normalizeFrequencyToAnnual(actualValue, actualUnit || 'año');
  const expectedAnnual = normalizeFrequencyToAnnual(expectedValue, expectedUnit);

  if (expectedAnnual === 0) return 0;

  // Return difference as percentage of expected (-100 means 100% behind)
  return Math.round(((actualAnnual - expectedAnnual) / expectedAnnual) * 100);
}

/**
 * Convert normalized score (0-100) back to level (0-4) for profundidad indicators
 */
export function scoreToActualLevel(score: number, category: IndicatorCategory): number {
  if (category === 'profundidad') {
    // Score is (level/4)*100, so level = score/25
    return Math.round(score / 25);
  }
  // For cobertura/frecuencia: score >= 50 = 1, else 0
  return score >= 50 ? 1 : 0;
}

/**
 * Classify the gap between actual and expected levels
 */
export function classifyGap(
  actualLevel: number,
  expectedLevel: number | null,
  tolerance: number,
  category: IndicatorCategory
): GapClassification {
  // If no expectation is defined, consider it on track
  if (expectedLevel === null) return 'on_track';

  const gap = actualLevel - expectedLevel;

  // Ahead: actual >= expected (gap >= 0)
  if (gap >= 0) return 'ahead';

  // On track: within tolerance (gap >= -tolerance)
  // For profundidad: tolerance is in levels (0-2)
  // For cobertura/frecuencia: only 0 or 1 levels, so tolerance of 1 means on_track if actual is 0 and expected is 1
  if (gap >= -tolerance) return 'on_track';

  // Critical: more than 2 levels behind for profundidad, or behind with 0 tolerance
  if (category === 'profundidad' && gap <= -3) return 'critical';
  if (tolerance === 0 && gap < 0) return 'critical';

  // Behind: between tolerance and critical
  return 'behind';
}

/**
 * Classify frequency gap based on percentage difference
 */
export function classifyFrequencyGap(
  gapPercent: number | null,
  tolerance: number
): GapClassification {
  if (gapPercent === null) return 'on_track';

  // Ahead: actual >= expected
  if (gapPercent >= 0) return 'ahead';

  // Tolerance translates to percentage: 0 = 0%, 1 = 25%, 2 = 50%
  const tolerancePercent = tolerance * 25;

  // On track: within tolerance
  if (gapPercent >= -tolerancePercent) return 'on_track';

  // Critical: more than 75% behind
  if (gapPercent <= -75) return 'critical';

  // Behind: between tolerance and critical
  return 'behind';
}

/**
 * Calculate gap analysis for a single indicator
 */
export function calculateIndicatorGap(
  indicatorId: string,
  indicatorName: string,
  indicatorCode: string | undefined,
  category: IndicatorCategory,
  score: number,
  expectations: YearExpectation | null | undefined,
  transformationYear: 1 | 2 | 3 | 4 | 5,
  frequencyResponse?: { value?: number; unit?: string } // Optional frequency response data
): IndicatorGapAnalysis {
  const actualLevel = scoreToActualLevel(score, category);
  const expectedLevel = getExpectedLevelForYear(expectations, transformationYear);
  const tolerance = expectations?.tolerance ?? 1;

  let gap: number | null = expectedLevel !== null ? actualLevel - expectedLevel : null;
  let classification: GapClassification;
  let frequencyActual: { value: number; unit?: string } | undefined;
  let frequencyExpected: { value: number; unit: string } | undefined;
  let frequencyGapPercent: number | undefined;

  // Special handling for frequency indicators
  if (category === 'frecuencia') {
    const freqExpected = getFrequencyExpectationForYear(expectations, transformationYear);

    if (frequencyResponse?.value !== undefined && freqExpected) {
      frequencyActual = {
        value: frequencyResponse.value,
        unit: frequencyResponse.unit,
      };
      frequencyExpected = freqExpected;

      // Compare using unit conversion
      frequencyGapPercent = compareFrequency(
        frequencyResponse.value,
        frequencyResponse.unit,
        freqExpected.value,
        freqExpected.unit
      );

      // Use frequency-specific classification
      classification = classifyFrequencyGap(frequencyGapPercent, tolerance);

      // Override gap to be the percentage gap for consistency
      gap = frequencyGapPercent;
    } else {
      // No frequency data or no expectation
      classification = classifyGap(actualLevel, expectedLevel, tolerance, category);
    }
  } else {
    classification = classifyGap(actualLevel, expectedLevel, tolerance, category);
  }

  return {
    indicatorId,
    indicatorName,
    indicatorCode,
    category,
    actualLevel,
    expectedLevel,
    gap,
    tolerance,
    classification,
    score,
    frequencyActual,
    frequencyExpected,
    frequencyGapPercent,
  };
}

/**
 * Calculate gap analysis for a module
 */
export function calculateModuleGapAnalysis(
  moduleId: string,
  moduleName: string,
  indicatorGaps: IndicatorGapAnalysis[]
): ModuleGapAnalysis {
  const stats = {
    total: indicatorGaps.length,
    ahead: 0,
    onTrack: 0,
    behind: 0,
    critical: 0,
    notConfigured: 0,
  };

  let totalGap = 0;
  let gapCount = 0;

  for (const gap of indicatorGaps) {
    if (gap.expectedLevel === null) {
      stats.notConfigured++;
      continue;
    }

    switch (gap.classification) {
      case 'ahead':
        stats.ahead++;
        break;
      case 'on_track':
        stats.onTrack++;
        break;
      case 'behind':
        stats.behind++;
        break;
      case 'critical':
        stats.critical++;
        break;
    }

    if (gap.gap !== null) {
      totalGap += gap.gap;
      gapCount++;
    }
  }

  return {
    moduleId,
    moduleName,
    indicators: indicatorGaps,
    stats,
    avgGap: gapCount > 0 ? Math.round((totalGap / gapCount) * 100) / 100 : null,
  };
}

/**
 * Calculate full gap analysis for an assessment instance
 */
export function calculateAssessmentGapAnalysis(
  instanceId: string,
  transformationYear: 1 | 2 | 3 | 4 | 5,
  area: TransformationArea,
  modules: Array<{
    id: string;
    name: string;
    indicators: Array<{
      id: string;
      name: string;
      code?: string;
      category: IndicatorCategory;
      expectations?: YearExpectation | null;
    }>;
  }>,
  indicatorScores: Map<string, number> // indicatorId -> normalized score
): AssessmentGapAnalysis {
  const moduleGaps: ModuleGapAnalysis[] = [];
  const overallStats = {
    total: 0,
    ahead: 0,
    onTrack: 0,
    behind: 0,
    critical: 0,
    notConfigured: 0,
  };
  const criticalIndicators: IndicatorGapAnalysis[] = [];
  const behindIndicators: IndicatorGapAnalysis[] = [];

  let totalGap = 0;
  let gapCount = 0;

  for (const module of modules) {
    const indicatorGaps: IndicatorGapAnalysis[] = [];

    for (const indicator of module.indicators) {
      const score = indicatorScores.get(indicator.id) ?? 0;
      const gap = calculateIndicatorGap(
        indicator.id,
        indicator.name,
        indicator.code,
        indicator.category,
        score,
        indicator.expectations,
        transformationYear
      );

      indicatorGaps.push(gap);
      overallStats.total++;

      // Track overall stats
      if (gap.expectedLevel === null) {
        overallStats.notConfigured++;
      } else {
        switch (gap.classification) {
          case 'ahead':
            overallStats.ahead++;
            break;
          case 'on_track':
            overallStats.onTrack++;
            break;
          case 'behind':
            overallStats.behind++;
            behindIndicators.push(gap);
            break;
          case 'critical':
            overallStats.critical++;
            criticalIndicators.push(gap);
            break;
        }

        if (gap.gap !== null) {
          totalGap += gap.gap;
          gapCount++;
        }
      }
    }

    moduleGaps.push(calculateModuleGapAnalysis(module.id, module.name, indicatorGaps));
  }

  return {
    instanceId,
    transformationYear,
    area,
    modules: moduleGaps,
    overallStats,
    avgGap: gapCount > 0 ? Math.round((totalGap / gapCount) * 100) / 100 : null,
    criticalIndicators,
    behindIndicators,
  };
}

/**
 * Fetch gap analysis for an assessment instance from the database
 * NOTE: Uses supabaseAdmin to bypass RLS for reading results
 */
export async function fetchInstanceGapAnalysis(
  supabase: SupabaseClient,
  instanceId: string
): Promise<AssessmentGapAnalysis | null> {
  // Get instance with snapshot
  const { data: instance, error: instanceError } = await supabase
    .from('assessment_instances')
    .select(
      `
      id,
      transformation_year,
      template_snapshot_id,
      assessment_template_snapshots!inner (
        snapshot_data
      )
    `
    )
    .eq('id', instanceId)
    .single();

  if (instanceError || !instance) {
    console.error('Error fetching instance:', instanceError);
    return null;
  }

  // Get results for scores (use admin client to bypass RLS)
  const { data: result, error: resultError } = await supabaseAdmin
    .from('assessment_instance_results')
    .select('module_scores')
    .eq('instance_id', instanceId)
    .single();

  if (resultError || !result) {
    console.error('Error fetching results:', resultError);
    return null;
  }

  // Extract data from snapshot
  const snapshotData = (instance as any).assessment_template_snapshots?.snapshot_data;
  if (!snapshotData) {
    console.error('No snapshot data found');
    return null;
  }

  const template = snapshotData.template;
  const snapshotModules = snapshotData.modules || [];
  const transformationYear = instance.transformation_year as 1 | 2 | 3 | 4 | 5;

  // Build indicator score map from results
  const indicatorScores = new Map<string, number>();
  const moduleScores = result.module_scores as ModuleScore[];

  for (const module of moduleScores) {
    for (const indicator of module.indicators) {
      indicatorScores.set(indicator.indicatorId, indicator.normalizedScore);
    }
  }

  // Build modules with expectations
  const modules = snapshotModules.map((m: any) => ({
    id: m.id,
    name: m.name,
    indicators: (m.indicators || []).map((ind: any) => ({
      id: ind.id,
      name: ind.name,
      code: ind.code,
      category: ind.category as IndicatorCategory,
      expectations: ind.expectations as YearExpectation | null,
    })),
  }));

  return calculateAssessmentGapAnalysis(
    instanceId,
    transformationYear,
    template.area as TransformationArea,
    modules,
    indicatorScores
  );
}

/**
 * Aggregate gap analysis across multiple instances for school-level view
 */
export function aggregateSchoolGapAnalysis(
  analyses: AssessmentGapAnalysis[]
): {
  byArea: Record<TransformationArea, {
    avgGap: number | null;
    stats: { ahead: number; onTrack: number; behind: number; critical: number };
    count: number;
  }>;
  overall: {
    avgGap: number | null;
    stats: { ahead: number; onTrack: number; behind: number; critical: number };
    totalInstances: number;
  };
  topCriticalIndicators: Array<{ indicatorName: string; count: number }>;
} {
  const byArea: Record<TransformationArea, {
    gaps: number[];
    ahead: number;
    onTrack: number;
    behind: number;
    critical: number;
  }> = {
    personalizacion: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    aprendizaje: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    evaluacion: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    proposito: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    familias: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    trabajo_docente: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
    liderazgo: { gaps: [], ahead: 0, onTrack: 0, behind: 0, critical: 0 },
  };

  // Track critical indicators across all analyses
  const criticalCountMap = new Map<string, number>();

  for (const analysis of analyses) {
    const areaData = byArea[analysis.area];

    if (analysis.avgGap !== null) {
      areaData.gaps.push(analysis.avgGap);
    }

    areaData.ahead += analysis.overallStats.ahead;
    areaData.onTrack += analysis.overallStats.onTrack;
    areaData.behind += analysis.overallStats.behind;
    areaData.critical += analysis.overallStats.critical;

    // Track critical indicators
    for (const critical of analysis.criticalIndicators) {
      const count = criticalCountMap.get(critical.indicatorName) || 0;
      criticalCountMap.set(critical.indicatorName, count + 1);
    }
  }

  const areas = Object.keys(byArea) as TransformationArea[];
  const aggregatedByArea = {} as Record<TransformationArea, {
    avgGap: number | null;
    stats: { ahead: number; onTrack: number; behind: number; critical: number };
    count: number;
  }>;

  let allGaps: number[] = [];
  let totalAhead = 0, totalOnTrack = 0, totalBehind = 0, totalCritical = 0;

  for (const area of areas) {
    const data = byArea[area];
    const count = data.gaps.length;

    aggregatedByArea[area] = {
      avgGap: count > 0
        ? Math.round((data.gaps.reduce((a, b) => a + b, 0) / count) * 100) / 100
        : null,
      stats: {
        ahead: data.ahead,
        onTrack: data.onTrack,
        behind: data.behind,
        critical: data.critical,
      },
      count,
    };

    allGaps = allGaps.concat(data.gaps);
    totalAhead += data.ahead;
    totalOnTrack += data.onTrack;
    totalBehind += data.behind;
    totalCritical += data.critical;
  }

  // Get top critical indicators
  const topCriticalIndicators = Array.from(criticalCountMap.entries())
    .map(([indicatorName, count]) => ({ indicatorName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const totalInstances = analyses.length;

  return {
    byArea: aggregatedByArea,
    overall: {
      avgGap: allGaps.length > 0
        ? Math.round((allGaps.reduce((a, b) => a + b, 0) / allGaps.length) * 100) / 100
        : null,
      stats: {
        ahead: totalAhead,
        onTrack: totalOnTrack,
        behind: totalBehind,
        critical: totalCritical,
      },
      totalInstances,
    },
    topCriticalIndicators,
  };
}
