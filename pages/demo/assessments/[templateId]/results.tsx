import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  BarChart3,
  ArrowLeft,
  Eye,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import {
  AREA_LABELS,
  TransformationArea,
  GenerationType,
} from '@/types/assessment-builder';
import {
  calculateDemoScores,
  type DemoScoringInput,
  type DemoScoringOutput,
} from '@/lib/services/assessment-builder/clientScoringService';
import {
  SummaryCards,
  StrengthsWeaknesses,
  GapAnalysisSection,
  ResultsCharts,
  DetailedResults,
} from '@/components/assessment/results';
import type { ModuleResult } from '@/components/assessment/results';
import type { ResponseData } from '@/components/assessment';
import type { FrequencyConfig } from '@/types/assessment-builder';

interface StoredIndicator {
  id: string;
  code?: string;
  name: string;
  category: 'cobertura' | 'frecuencia' | 'profundidad' | 'traspaso' | 'detalle';
  weight: number;
  frequencyConfig?: FrequencyConfig;
  [key: string]: unknown;
}

interface StoredModule {
  id: string;
  name: string;
  weight: number;
  indicators: StoredIndicator[];
  [key: string]: unknown;
}

interface StoredObjective {
  id: string;
  name: string;
  weight: number;
  modules: StoredModule[];
  [key: string]: unknown;
}

interface StoredTemplateData {
  template: {
    id: string;
    version: string;
    name: string;
    area: TransformationArea;
    description?: string;
    scoringConfig: any;
  };
  objectives: StoredObjective[];
  modules: StoredModule[];
  expectations: any[];
  year: number;
  generationType: GenerationType;
}

/**
 * Transform frontend camelCase responses to the snake_case format
 * expected by the scoring service.
 */
function transformResponses(
  responses: Record<string, ResponseData>
): Record<string, { coverage_value?: boolean; frequency_value?: number; profundity_level?: number; sub_responses?: Record<string, unknown> }> {
  const result: Record<string, any> = {};
  for (const [indicatorId, resp] of Object.entries(responses)) {
    result[indicatorId] = {
      coverage_value: resp.coverageValue,
      frequency_value: resp.frequencyValue,
      profundity_level: resp.profundityLevel,
      sub_responses: resp.subResponses,
    };
  }
  return result;
}

/**
 * Transform frontend camelCase module/objective data to the format
 * expected by the scoring service.
 */
function transformModuleForScoring(mod: StoredModule) {
  return {
    id: mod.id,
    name: mod.name,
    weight: mod.weight,
    indicators: mod.indicators.map((ind) => ({
      id: ind.id,
      code: ind.code,
      name: ind.name,
      category: ind.category,
      weight: ind.weight,
      frequency_config: ind.frequencyConfig as FrequencyConfig | undefined,
    })),
  };
}

function transformObjectiveForScoring(obj: StoredObjective) {
  return {
    id: obj.id,
    name: obj.name,
    weight: obj.weight,
    modules: obj.modules.map(transformModuleForScoring),
  };
}

const DemoAssessmentResults: React.FC = () => {
  const router = useRouter();
  const { templateId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [storedData, setStoredData] = useState<StoredTemplateData | null>(null);
  const [responses, setResponses] = useState<Record<string, ResponseData> | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
    };

    checkAuth();
  }, [supabase, router]);

  // Load data from sessionStorage
  useEffect(() => {
    if (!templateId || typeof templateId !== 'string') return;

    try {
      const templateRaw = sessionStorage.getItem(`demo_template_${templateId}`);
      const responsesRaw = sessionStorage.getItem(`demo_responses_${templateId}`);

      if (!templateRaw || !responsesRaw) {
        // No data in sessionStorage — redirect back to form
        router.replace(`/demo/assessments/${templateId}`);
        return;
      }

      const parsedTemplate: StoredTemplateData = JSON.parse(templateRaw);
      const parsedResponses: Record<string, ResponseData> = JSON.parse(responsesRaw);

      setStoredData(parsedTemplate);
      setResponses(parsedResponses);
      setLoading(false);
    } catch {
      router.replace(`/demo/assessments/${templateId}`);
    }
  }, [templateId, router]);

  // Calculate scores
  const scoringResults: DemoScoringOutput | null = useMemo(() => {
    if (!storedData || !responses) return null;

    const input: DemoScoringInput = {
      objectives: storedData.objectives.map(transformObjectiveForScoring),
      modules: storedData.modules.map(transformModuleForScoring),
      responses: transformResponses(responses),
      expectations: storedData.expectations || [],
      scoringConfig: storedData.template.scoringConfig,
      transformationYear: storedData.year,
      generationType: storedData.generationType,
      templateName: storedData.template.name,
      templateArea: storedData.template.area,
    };

    return calculateDemoScores(input);
  }, [storedData, responses]);

  // Expand first module once scores are ready
  useEffect(() => {
    if (scoringResults && scoringResults.moduleScores.length > 0 && expandedModules.size === 0) {
      setExpandedModules(new Set([scoringResults.moduleScores[0].moduleId]));
    }
  }, [scoringResults, expandedModules.size]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleBackToForm = () => {
    router.push(`/demo/assessments/${templateId}`);
  };

  const handleReset = () => {
    if (templateId) {
      sessionStorage.removeItem(`demo_responses_${templateId}`);
      sessionStorage.removeItem(`demo_template_${templateId}`);
    }
    router.push(`/demo/assessments/${templateId}`);
  };

  const handleChangeYear = () => {
    router.push(`/demo/assessments/${templateId}?openYearSelector=1`);
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  if (!scoringResults || !storedData) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-gray-600">No se encontraron resultados</p>
      </div>
    );
  }

  const { template } = storedData;
  const areaLabel = AREA_LABELS[template.area] || template.area;
  const genLabel = storedData.generationType === 'GT' ? 'GT' : 'GI';

  // Build module lookup for enriching objective scores with full ModuleResult data
  const moduleMap = new Map(
    scoringResults.moduleScores.map((m) => [m.moduleId, m])
  );

  // Enrich objective scores: replace ModuleScore with full ModuleResult (includes level, gapStats)
  const enrichedObjectiveScores = scoringResults.objectiveScores?.map((obj) => ({
    ...obj,
    modules: obj.modules
      .map((m) => moduleMap.get(m.moduleId))
      .filter((m): m is ModuleResult => m !== undefined),
  })) ?? null;

  return (
    <MainLayout
      user={user}
      currentPage="assessments"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BarChart3 />}
        title="Resultados"
        subtitle={`${areaLabel} - ${template.name}`}
      />

      {/* MODO DEMO banner */}
      <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Eye className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            MODO DEMO — Estos resultados son simulados basados en sus respuestas de práctica.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Navigation buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={handleBackToForm}
            className="inline-flex items-center text-sm text-gray-600 hover:text-brand_primary"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver al instrumento
          </button>

          <div className="flex-1" />

          <button
            onClick={handleChangeYear}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            <Calendar className="w-4 h-4" />
            Cambiar Año/Generación
          </button>

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 rounded-md hover:bg-red-50 text-red-600"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Demo
          </button>
        </div>

        <SummaryCards
          totalScore={scoringResults.totalScore}
          overallLevel={scoringResults.overallLevel}
          overallLevelLabel={scoringResults.overallLevelLabel}
          expectedLevelLabel={scoringResults.expectedLevelLabel}
          meetsExpectations={scoringResults.meetsExpectations}
          transformationYear={storedData.year}
          generationType={storedData.generationType}
          indicatorsAboveExpectation={scoringResults.stats.indicatorsAboveExpectation}
          totalIndicators={scoringResults.stats.totalIndicators}
        />

        <StrengthsWeaknesses
          strongestModule={scoringResults.stats.strongestModule}
          weakestModule={scoringResults.stats.weakestModule}
        />

        {scoringResults.gapAnalysis && (
          <GapAnalysisSection
            gapAnalysis={scoringResults.gapAnalysis}
            transformationYear={storedData.year}
            generationType={storedData.generationType}
          />
        )}

        <ResultsCharts moduleScores={scoringResults.moduleScores} />

        <DetailedResults
          objectiveScores={enrichedObjectiveScores}
          moduleScores={scoringResults.moduleScores}
          expandedModules={expandedModules}
          onToggleModule={toggleModule}
        />

        {/* Simulated results info (replaces completion info) */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Resultados simulados — {new Date().toLocaleDateString('es-CL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })} — Año {storedData.year} — {genLabel}
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default DemoAssessmentResults;
