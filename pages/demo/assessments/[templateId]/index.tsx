import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardCheck,
  ArrowLeft,
  Eye,
  BarChart3,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import {
  AREA_LABELS,
  ENTITY_LABELS,
  TransformationArea,
  GenerationType,
} from '@/types/assessment-builder';
import { ModuleCard } from '@/components/assessment';
import type { IndicatorData, ModuleData, ObjectiveData, ResponseData } from '@/components/assessment';

const DemoAssessmentForm: React.FC = () => {
  const router = useRouter();
  const { templateId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Demo selector state
  const [year, setYear] = useState<number>(1);
  const [generationType, setGenerationType] = useState<GenerationType>('GT');

  // Assessment data
  const [template, setTemplate] = useState<any>(null);
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveData[]>([]);
  const [expectations, setExpectations] = useState<any[]>([]);

  // Client-side only responses
  const [responses, setResponses] = useState<Record<string, ResponseData>>({});
  const [progress, setProgress] = useState({ total: 0, answered: 0, percentage: 0 });

  // UI state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
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

  // Fetch demo assessment data
  const fetchDemoAssessment = useCallback(async () => {
    if (!user || !templateId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/demo/assessments/${templateId}?year=${year}&generationType=${generationType}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar la evaluación demo');
      }

      const data = await response.json();
      setTemplate(data.template);
      setModules(data.modules || []);
      setObjectives(data.objectives || []);
      setExpectations(data.expectations || []);

      // Expand first module by default
      if (data.objectives?.length > 0 && data.objectives[0].modules?.length > 0) {
        setExpandedModules(new Set([data.objectives[0].modules[0].id]));
      } else if (data.modules?.length > 0) {
        setExpandedModules(new Set([data.modules[0].id]));
      }
    } catch (error: any) {
      console.error('Error fetching demo assessment:', error);
      toast.error(error.message || 'Error al cargar la evaluación demo');
    } finally {
      setLoading(false);
    }
  }, [user, templateId, year, generationType]);

  useEffect(() => {
    if (user && templateId) {
      fetchDemoAssessment();
    }
  }, [user, templateId, fetchDemoAssessment]);

  // Check if an indicator response is "answered"
  const isIndicatorAnswered = (indicator: IndicatorData, resp: ResponseData | undefined): boolean => {
    if (!resp) return false;
    if (indicator.category === 'cobertura') return resp.coverageValue !== undefined && resp.coverageValue !== null;
    if (indicator.category === 'frecuencia') return resp.frequencyValue !== undefined && resp.frequencyValue !== null;
    if (indicator.category === 'profundidad') return resp.profundityLevel !== undefined && resp.profundityLevel !== null;
    if (indicator.category === 'traspaso') {
      const sub = resp.subResponses as Record<string, unknown> | undefined;
      return !!(sub?.evidence_link || sub?.improvement_suggestions);
    }
    if (indicator.category === 'detalle') {
      const sub = resp.subResponses as Record<string, unknown> | undefined;
      const selected = sub?.selected_options;
      return Array.isArray(selected) && selected.length > 0;
    }
    return false;
  };

  // Update progress whenever responses change
  useEffect(() => {
    const modulesToCheck = objectives.length > 0
      ? objectives.flatMap((o) => o.modules)
      : modules;

    if (modulesToCheck.length > 0) {
      let total = 0;
      let answered = 0;

      modulesToCheck.forEach(module => {
        const sortedIndicators = [...module.indicators]
          .filter((ind) => ind.isActiveThisYear !== false)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        const hasCoberturaGate = sortedIndicators.length > 0 && sortedIndicators[0].category === 'cobertura';

        if (hasCoberturaGate) {
          const coberturaResp = responses[sortedIndicators[0].id];
          const coberturaValue = coberturaResp?.coverageValue;

          total++;
          if (isIndicatorAnswered(sortedIndicators[0], coberturaResp)) answered++;

          if (coberturaValue === false) {
            // Gate closed
          } else if (coberturaValue === true) {
            sortedIndicators.slice(1).forEach(indicator => {
              total++;
              if (isIndicatorAnswered(indicator, responses[indicator.id])) answered++;
            });
          }
        } else {
          module.indicators.forEach(indicator => {
            total++;
            if (isIndicatorAnswered(indicator, responses[indicator.id])) answered++;
          });
        }
      });

      setProgress({
        total,
        answered,
        percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, modules, objectives]);

  // Toggle module expansion
  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Handle response change (client-side only, no API calls)
  const handleResponseChange = (indicatorId: string, field: keyof ResponseData, value: ResponseData[keyof ResponseData]) => {
    setResponses(prev => ({
      ...prev,
      [indicatorId]: {
        ...prev[indicatorId],
        [field]: value,
      },
    }));
  };

  // Reset all responses
  const handleReset = () => {
    setResponses({});
    toast.success('Respuestas reiniciadas');
  };

  // Navigate to results
  const handleViewResults = () => {
    try {
      sessionStorage.setItem(
        `demo_responses_${templateId}`,
        JSON.stringify(responses)
      );
      sessionStorage.setItem(
        `demo_template_${templateId}`,
        JSON.stringify({ template, objectives, modules, expectations, year, generationType })
      );
      router.push(`/demo/assessments/${templateId}/results`);
    } catch (err) {
      toast.error('Error al guardar datos para resultados');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_light flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

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
        icon={<ClipboardCheck />}
        title={template?.name || 'Evaluación Demo'}
        subtitle={AREA_LABELS[template?.area as TransformationArea] || 'Evaluación'}
      />

      {/* MODO DEMO banner */}
      <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Eye className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            MODO DEMO — Las respuestas no se guardan. Este es un entorno de práctica.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button, Year/GenType selectors, and actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <Link href="/demo/assessments" legacyBehavior>
            <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_primary">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver a Demos
            </a>
          </Link>

          {/* Year & Generation Type selectors */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="demo-year" className="text-sm text-gray-600 font-medium">
                Año:
              </label>
              <select
                id="demo-year"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_primary"
              >
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>Año {y}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setGenerationType('GT')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  generationType === 'GT'
                    ? 'bg-white text-brand_primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                GT
              </button>
              <button
                type="button"
                onClick={() => setGenerationType('GI')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  generationType === 'GI'
                    ? 'bg-white text-brand_primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                GI
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reiniciar
            </button>
            <button
              onClick={handleViewResults}
              disabled={progress.percentage < 100}
              className="inline-flex items-center px-4 py-1.5 text-sm bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 disabled:opacity-50"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Ver Resultados
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progreso</span>
            <span className="text-sm text-gray-500">
              {progress.answered} de {progress.total} indicadores ({progress.percentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                progress.percentage === 100 ? 'bg-green-500' : 'bg-brand_primary'
              }`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          {progress.percentage === 100 && (
            <div className="mt-3 flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">Todos los indicadores respondidos</span>
            </div>
          )}
        </div>

        {/* 3-level hierarchy: Objectives → Acciones → Indicators */}
        {objectives.length > 0 ? (
          <div className="space-y-6">
            {objectives.map((objective) => (
              <div key={objective.id} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <div className="h-px flex-1 bg-gray-200" />
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                    {ENTITY_LABELS.objective}: {objective.name}
                  </h3>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                {objective.description && (
                  <p className="text-sm text-gray-500 px-1">{objective.description}</p>
                )}

                <div className="space-y-3">
                  {objective.modules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      responses={responses}
                      expanded={expandedModules.has(module.id)}
                      onToggle={() => toggleModule(module.id)}
                      onResponseChange={handleResponseChange}
                      canEdit={true}
                    />
                  ))}
                  {objective.modules.length === 0 && (
                    <p className="text-sm text-gray-400 italic px-2">
                      Sin {ENTITY_LABELS.modules.toLowerCase()} en este {ENTITY_LABELS.objective.toLowerCase()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                responses={responses}
                expanded={expandedModules.has(module.id)}
                onToggle={() => toggleModule(module.id)}
                onResponseChange={handleResponseChange}
                canEdit={true}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default DemoAssessmentForm;
