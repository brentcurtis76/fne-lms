import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  BarChart3,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AREA_LABELS,
  MATURITY_LEVELS,
  CATEGORY_LABELS,
  TransformationArea,
  IndicatorCategory,
} from '@/types/assessment-builder';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';

type GapClassification = 'ahead' | 'on_track' | 'behind' | 'critical';

interface IndicatorGap {
  actualLevel: number;
  expectedLevel: number | null;
  gap: number | null;
  classification: GapClassification;
  tolerance: number;
}

interface ModuleGapStats {
  ahead: number;
  onTrack: number;
  behind: number;
  critical: number;
  avgGap: number | null;
}

interface ModuleResult {
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

interface GapAnalysisSummary {
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

interface ResultsData {
  success: boolean;
  instance: {
    id: string;
    status: string;
    completedAt: string;
    transformationYear: number;
    snapshotVersion: string;
  };
  template: {
    name: string;
    area: TransformationArea;
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
const GAP_STYLES: Record<GapClassification, { bg: string; text: string; label: string; icon: string }> = {
  ahead: { bg: 'bg-green-100', text: 'text-green-700', label: 'Adelante', icon: '↑' },
  on_track: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En camino', icon: '→' },
  behind: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Atrasado', icon: '↓' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Crítico', icon: '⚠' },
};

const AssessmentResults: React.FC = () => {
  const router = useRouter();
  const { instanceId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [results, setResults] = useState<ResultsData | null>(null);
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

  // Fetch results
  const fetchResults = useCallback(async () => {
    if (!user || !instanceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}/results`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar resultados');
      }

      const data = await response.json();
      setResults(data);

      // Expand first module by default
      if (data.results?.moduleScores?.length > 0) {
        setExpandedModules(new Set([data.results.moduleScores[0].moduleId]));
      }
    } catch (error: any) {
      console.error('Error fetching results:', error);
      toast.error(error.message || 'Error al cargar resultados');
      router.push('/docente/assessments');
    } finally {
      setLoading(false);
    }
  }, [user, instanceId, router]);

  useEffect(() => {
    if (user && instanceId) {
      fetchResults();
    }
  }, [user, instanceId, fetchResults]);

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

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-gray-600">No se encontraron resultados</p>
      </div>
    );
  }

  const { template, results: res, stats } = results;
  const maturityLevel = MATURITY_LEVELS.find((l) => l.value === res.overallLevel);

  // Prepare chart data
  const moduleChartData = res.moduleScores.map((m) => ({
    name: m.moduleName.length > 15 ? m.moduleName.substring(0, 15) + '...' : m.moduleName,
    score: Math.round(m.moduleScore),
    fullName: m.moduleName,
  }));

  // Radar chart data for module comparison
  const radarData = res.moduleScores.map((m) => ({
    subject: m.moduleName.length > 12 ? m.moduleName.substring(0, 12) + '...' : m.moduleName,
    score: m.moduleScore,
    fullMark: 100,
  }));

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
        subtitle={`${template.areaLabel} - ${template.name}`}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link href="/docente/assessments" legacyBehavior>
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a evaluaciones
          </a>
        </Link>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Overall score */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">Puntuación Total</span>
              <Award className={`w-5 h-5 ${maturityLevel?.textColor || 'text-gray-500'}`} />
            </div>
            <div className="text-3xl font-bold text-brand_blue mb-2">
              {Math.round(res.totalScore)}%
            </div>
            <div
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                maturityLevel?.bgColor || 'bg-gray-100'
              } ${maturityLevel?.textColor || 'text-gray-700'}`}
            >
              {res.overallLevelLabel}
            </div>
          </div>

          {/* Meets expectations */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">Expectativa Año {results.instance.transformationYear}</span>
              <Target className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              {res.meetsExpectations ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              )}
              <span className="text-xl font-semibold">
                {res.meetsExpectations ? 'Cumple' : 'En desarrollo'}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Nivel esperado: {res.expectedLevelLabel}
            </p>
          </div>

          {/* Indicator stats */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">Indicadores</span>
              <BarChart3 className="w-5 h-5 text-gray-500" />
            </div>
            <div className="text-3xl font-bold text-brand_blue mb-2">
              {stats.indicatorsAboveExpectation}/{stats.totalIndicators}
            </div>
            <p className="text-sm text-gray-500">
              sobre la expectativa
            </p>
          </div>
        </div>

        {/* Strengths and areas for improvement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {stats.strongestModule && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-green-800">Fortaleza</div>
                <div className="text-green-700">{stats.strongestModule}</div>
              </div>
            </div>
          )}
          {stats.weakestModule && stats.weakestModule !== stats.strongestModule && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-yellow-800">Área de mejora</div>
                <div className="text-yellow-700">{stats.weakestModule}</div>
              </div>
            </div>
          )}
        </div>

        {/* Gap Analysis Summary */}
        {results.gapAnalysis && (
          <div className="bg-white shadow-md rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-brand_blue" />
              Análisis de Brechas - Año {results.instance.transformationYear}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{results.gapAnalysis.overallStats.ahead}</div>
                <div className="text-xs text-green-600">Adelante</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{results.gapAnalysis.overallStats.onTrack}</div>
                <div className="text-xs text-blue-600">En camino</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-700">{results.gapAnalysis.overallStats.behind}</div>
                <div className="text-xs text-yellow-600">Atrasado</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{results.gapAnalysis.overallStats.critical}</div>
                <div className="text-xs text-red-600">Crítico</div>
              </div>
            </div>

            {/* Critical indicators alert */}
            {results.gapAnalysis.criticalIndicators.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Indicadores Críticos ({results.gapAnalysis.criticalIndicators.length})
                </h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {results.gapAnalysis.criticalIndicators.slice(0, 5).map((ci, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                      {ci.indicatorCode && <span className="font-mono text-xs">{ci.indicatorCode}:</span>}
                      {ci.indicatorName}
                      <span className="text-xs text-red-500">
                        (nivel {ci.actualLevel} de {ci.expectedLevel} esperado)
                      </span>
                    </li>
                  ))}
                  {results.gapAnalysis.criticalIndicators.length > 5 && (
                    <li className="text-xs italic">
                      ...y {results.gapAnalysis.criticalIndicators.length - 5} más
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Behind indicators (if no critical but there are behind) */}
            {results.gapAnalysis.criticalIndicators.length === 0 && results.gapAnalysis.behindIndicators.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="text-sm font-semibold text-yellow-800 mb-2">
                  Indicadores que Requieren Atención ({results.gapAnalysis.behindIndicators.length})
                </h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {results.gapAnalysis.behindIndicators.slice(0, 5).map((bi, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                      {bi.indicatorCode && <span className="font-mono text-xs">{bi.indicatorCode}:</span>}
                      {bi.indicatorName}
                    </li>
                  ))}
                  {results.gapAnalysis.behindIndicators.length > 5 && (
                    <li className="text-xs italic">
                      ...y {results.gapAnalysis.behindIndicators.length - 5} más
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Bar chart */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Puntuación por Módulo</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, 'Puntuación']}
                    labelFormatter={(label) => {
                      const item = moduleChartData.find((d) => d.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Bar dataKey="score" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar chart */}
          {res.moduleScores.length >= 3 && (
            <div className="bg-white shadow-md rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Perfil de Competencias</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar
                      name="Puntuación"
                      dataKey="score"
                      stroke="#2563eb"
                      fill="#2563eb"
                      fillOpacity={0.3}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Detailed module results */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Detalle por Módulo</h3>
          {res.moduleScores.map((module) => {
            const moduleLevel = Math.round(module.moduleScore / 25); // 0-4 scale
            const moduleLevelInfo = MATURITY_LEVELS[moduleLevel] || MATURITY_LEVELS[0];

            return (
              <div key={module.moduleId} className="bg-white shadow-md rounded-lg overflow-hidden">
                {/* Module header */}
                <button
                  onClick={() => toggleModule(module.moduleId)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-brand_blue">
                        {Math.round(module.moduleScore)}%
                      </div>
                      <div
                        className={`text-xs px-2 py-0.5 rounded ${moduleLevelInfo.bgColor} ${moduleLevelInfo.textColor}`}
                      >
                        {moduleLevelInfo.label}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">{module.moduleName}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{module.indicators.length} indicador{module.indicators.length !== 1 ? 'es' : ''}</span>
                        {module.gapStats && (
                          <span className="flex items-center gap-1.5 ml-2">
                            {module.gapStats.ahead > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                ↑{module.gapStats.ahead}
                              </span>
                            )}
                            {module.gapStats.onTrack > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                                →{module.gapStats.onTrack}
                              </span>
                            )}
                            {module.gapStats.behind > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                                ↓{module.gapStats.behind}
                              </span>
                            )}
                            {module.gapStats.critical > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                                ⚠{module.gapStats.critical}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expandedModules.has(module.moduleId) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Indicators detail */}
                {expandedModules.has(module.moduleId) && (
                  <div className="border-t border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Indicador
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Categoría
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                            Respuesta
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                            Puntuación
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {module.indicators.map((indicator) => {
                          const gapStyle = indicator.gap?.classification
                            ? GAP_STYLES[indicator.gap.classification]
                            : null;

                          return (
                          <tr key={indicator.indicatorId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {indicator.indicatorName}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {CATEGORY_LABELS[indicator.category]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-sm">
                              {formatRawValue(indicator.rawValue, indicator.category)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex items-center justify-center w-12 h-8 rounded font-medium text-sm ${
                                  indicator.normalizedScore >= 75
                                    ? 'bg-green-100 text-green-700'
                                    : indicator.normalizedScore >= 50
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : indicator.normalizedScore >= 25
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {Math.round(indicator.normalizedScore)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {gapStyle && indicator.gap?.expectedLevel !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${gapStyle.bg} ${gapStyle.text}`}
                                  title={`Actual: ${indicator.gap?.actualLevel}, Esperado: ${indicator.gap?.expectedLevel}`}
                                >
                                  {gapStyle.icon} {gapStyle.label}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Evaluación completada el{' '}
            {new Date(results.instance.completedAt).toLocaleDateString('es-CL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="text-xs mt-1">Versión del instrumento: {results.instance.snapshotVersion}</p>
        </div>
      </div>
    </MainLayout>
  );
};

// Helper to format raw values for display
function formatRawValue(
  value: boolean | number | undefined,
  category: IndicatorCategory
): string {
  if (value === undefined || value === null) return '-';

  switch (category) {
    case 'cobertura':
      return value === true ? 'Sí' : 'No';
    case 'frecuencia':
      return String(value);
    case 'profundidad':
      const level = MATURITY_LEVELS.find((l) => l.value === value);
      return level ? `${value} - ${level.label}` : String(value);
    default:
      return String(value);
  }
}

export default AssessmentResults;
