import type { IndicatorCategory, GenerationType } from '@/types/assessment-builder';

export type GapClassification = 'ahead' | 'on_track' | 'behind' | 'critical';

export interface IndicatorGap {
  actualLevel: number;
  expectedLevel: number | null;
  gap: number | null;
  classification: GapClassification;
  tolerance: number;
}

export interface ModuleGapStats {
  ahead: number;
  onTrack: number;
  behind: number;
  critical: number;
  avgGap: number | null;
}

export interface ModuleResult {
  moduleId: string;
  moduleName: string;
  moduleScore: number;
  moduleWeight: number;
  level: number;
  gapStats: ModuleGapStats | null;
  indicators: {
    indicatorId: string;
    indicatorName: string;
    category: IndicatorCategory;
    rawValue: boolean | number | undefined;
    normalizedScore: number;
    weight: number;
    isAboveExpectation: boolean;
    gap: IndicatorGap | null;
  }[];
}

export interface GapAnalysisSummary {
  overallStats: {
    total: number;
    ahead: number;
    onTrack: number;
    behind: number;
    critical: number;
    notConfigured: number;
  };
  avgGap: number | null;
  criticalIndicators: Array<{
    indicatorName: string;
    indicatorCode?: string;
    actualLevel: number;
    expectedLevel: number | null;
    gap: number | null;
  }>;
  behindIndicators: Array<{
    indicatorName: string;
    indicatorCode?: string;
    actualLevel: number;
    expectedLevel: number | null;
    gap: number | null;
  }>;
}

export interface ResultsData {
  success: boolean;
  instance: {
    id: string;
    status: string;
    completedAt: string;
    transformationYear: number;
    generationType: GenerationType;
    snapshotVersion: string;
  };
  template: {
    name: string;
    area: string;
    areaLabel: string;
    description?: string;
  };
  results: {
    totalScore: number;
    overallLevel: number;
    overallLevelLabel: string;
    expectedLevel: number;
    expectedLevelLabel: string;
    meetsExpectations: boolean;
    objectiveScores?: {
      objectiveId: string;
      objectiveName: string;
      objectiveScore: number;
      objectiveWeight: number;
      modules: ModuleResult[];
    }[] | null;
    moduleScores: ModuleResult[];
  };
  stats: {
    totalModules: number;
    totalIndicators: number;
    indicatorsAboveExpectation: number;
    strongestModule: string | null;
    weakestModule: string | null;
  };
  gapAnalysis: GapAnalysisSummary | null;
}

// Gap classification styling
export const GAP_STYLES: Record<GapClassification, { bg: string; text: string; label: string; icon: string }> = {
  ahead: { bg: 'bg-green-100', text: 'text-green-700', label: 'Adelante', icon: '↑' },
  on_track: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En camino', icon: '→' },
  behind: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Atrasado', icon: '↓' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Crítico', icon: '⚠' },
};
