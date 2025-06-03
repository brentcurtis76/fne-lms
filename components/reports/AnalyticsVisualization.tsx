import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import LoadingSkeleton from '../common/LoadingSkeleton';
import ExportDropdown from './ExportDropdown';
import { generateAutomaticInsights } from '../../utils/insightGenerator';

interface AnalyticsVisualizationProps {
  userId: string;
  userRole: string;
  filters: {
    timeRange: string;
    groupBy: string;
    school_id?: string;
    generation_id?: string;
    community_id?: string;
  };
}

interface AnalyticsData {
  progressTrends: any[];
  completionRatesByOrg: any;
  performanceDistribution: any[];
  timeSpentTrends: any[];
  quizPerformance: any[];
  kpiData: {
    current: any;
    previous: any;
    trends: any;
  };
  metadata: any;
}

const FNE_COLORS = {
  primary: '#00365b',
  secondary: '#fdb933',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  gray: '#6b7280'
};

const CHART_COLORS = [
  FNE_COLORS.primary,
  FNE_COLORS.secondary,
  FNE_COLORS.success,
  FNE_COLORS.info,
  FNE_COLORS.warning,
  FNE_COLORS.error
];

export default function AnalyticsVisualization({ 
  userId, 
  userRole, 
  filters 
}: AnalyticsVisualizationProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [automaticInsights, setAutomaticInsights] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [filters]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const params = new URLSearchParams({
        timeRange: filters.timeRange,
        groupBy: filters.groupBy,
        ...(filters.school_id && { school_id: filters.school_id }),
        ...(filters.generation_id && { generation_id: filters.generation_id }),
        ...(filters.community_id && { community_id: filters.community_id })
      });

      const response = await fetch(`/api/reports/analytics-data?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
        
        // Generate automatic insights from the real data
        const insights = generateAutomaticInsights(data);
        setAutomaticInsights(insights);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al cargar datos analíticos');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Error al cargar datos analíticos');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label, formatter }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatter ? formatter(entry.value) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const formatPercentage = (value: number) => `${Math.round(value)}%`;
  const formatHours = (value: number) => `${value}h`;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="chart" />
          ))}
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">No se pudieron cargar los datos analíticos</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vista
              </label>
              <select
                value={comparisonMode ? 'comparison' : 'current'}
                onChange={(e) => setComparisonMode(e.target.value === 'comparison')}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#fdb933]"
              >
                <option value="current">Período Actual</option>
                <option value="comparison">Comparación Períodos</option>
              </select>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Datos de {analyticsData.metadata?.timeRange} días • {analyticsData.kpiData.current.totalUsers} usuarios
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Usuarios Activos',
            current: analyticsData.kpiData.current.activeUsers,
            total: analyticsData.kpiData.current.totalUsers,
            trend: analyticsData.kpiData.trends.activeUsers,
            icon: '👥',
            color: FNE_COLORS.primary
          },
          {
            title: 'Tasa Completación',
            current: analyticsData.kpiData.current.avgCompletionRate,
            trend: analyticsData.kpiData.trends.avgCompletionRate,
            icon: '📈',
            color: FNE_COLORS.success,
            suffix: '%'
          },
          {
            title: 'Tiempo Total',
            current: analyticsData.kpiData.current.totalTimeSpent,
            trend: analyticsData.kpiData.trends.totalTimeSpent,
            icon: '⏱️',
            color: FNE_COLORS.secondary,
            suffix: 'h'
          }
        ].map((kpi, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: kpi.color }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                <div className="flex items-baseline">
                  <p className="text-2xl font-bold text-gray-900">
                    {kpi.current}{kpi.suffix || ''}
                    {kpi.total && <span className="text-lg text-gray-500">/{kpi.total}</span>}
                  </p>
                  <span className={`ml-2 text-sm ${kpi.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {kpi.trend >= 0 ? '↗' : '↘'} {Math.abs(kpi.trend).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-full" style={{ backgroundColor: `${kpi.color}20` }}>
                <span style={{ color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Progress Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Tendencias de Progreso</h3>
            <ExportDropdown
              tabName="Tendencias-Progreso"
              data={analyticsData.progressTrends}
              headers={['period', 'completedLessons', 'activeUsers', 'avgCompletionRate']}
              className="text-sm"
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analyticsData.progressTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="period" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="completedLessons"
                stroke={FNE_COLORS.primary}
                strokeWidth={2}
                name="Lecciones Completadas"
                dot={{ fill: FNE_COLORS.primary }}
              />
              <Line
                type="monotone"
                dataKey="activeUsers"
                stroke={FNE_COLORS.secondary}
                strokeWidth={2}
                name="Usuarios Activos"
                dot={{ fill: FNE_COLORS.secondary }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Completion Rates by Organization */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Tasas por Escuela</h3>
            <ExportDropdown
              tabName="Tasas-Escuela"
              data={analyticsData.completionRatesByOrg.schools || []}
              headers={['name', 'completionRate', 'totalStudents']}
              className="text-sm"
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.completionRatesByOrg.schools || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip formatter={formatPercentage} />} />
              <Bar
                dataKey="completionRate"
                fill={FNE_COLORS.success}
                name="Tasa de Completación (%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Distribución de Rendimiento</h3>
            <ExportDropdown
              tabName="Distribucion-Rendimiento"
              data={analyticsData.performanceDistribution}
              headers={['range', 'count', 'percentage']}
              className="text-sm"
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.performanceDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                fill={FNE_COLORS.info}
                name="Número de Estudiantes"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Time Spent Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Tendencias de Tiempo</h3>
            <ExportDropdown
              tabName="Tendencias-Tiempo"
              data={analyticsData.timeSpentTrends}
              headers={['period', 'totalHours', 'avgHoursPerUser', 'peakHours']}
              className="text-sm"
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analyticsData.timeSpentTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="period" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip formatter={formatHours} />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="totalHours"
                stackId="1"
                stroke={FNE_COLORS.primary}
                fill={`${FNE_COLORS.primary}80`}
                name="Total Horas"
              />
              <Area
                type="monotone"
                dataKey="avgHoursPerUser"
                stackId="2"
                stroke={FNE_COLORS.secondary}
                fill={`${FNE_COLORS.secondary}80`}
                name="Promedio por Usuario"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quiz Performance Scatter */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Análisis de Rendimiento en Evaluaciones</h3>
            <ExportDropdown
              tabName="Rendimiento-Evaluaciones"
              data={analyticsData.quizPerformance}
              headers={['userId', 'avgScore', 'quizzesCompleted', 'timeSpent', 'improvementTrend']}
              className="text-sm"
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={analyticsData.quizPerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="quizzesCompleted" 
                name="Evaluaciones Completadas"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                dataKey="avgScore" 
                name="Puntaje Promedio"
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
                        <p className="font-medium text-gray-900 mb-2">Usuario: {data.userId}</p>
                        <p className="text-sm text-gray-600">Evaluaciones: {data.quizzesCompleted}</p>
                        <p className="text-sm text-gray-600">Puntaje Promedio: {data.avgScore}%</p>
                        <p className="text-sm text-gray-600">Tiempo Promedio: {data.timeSpent}min</p>
                        <p className={`text-sm ${data.improvementTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Tendencia: {data.improvementTrend >= 0 ? '+' : ''}{data.improvementTrend}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter dataKey="avgScore" fill={FNE_COLORS.success} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Insights Automáticos</h3>
        {automaticInsights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {automaticInsights.map((insight, index) => {
              const colors = {
                success: {
                  bg: 'bg-green-50',
                  border: 'border-green-200',
                  text: 'text-green-800',
                  subtext: 'text-green-700',
                  icon: 'text-green-400'
                },
                warning: {
                  bg: 'bg-yellow-50',
                  border: 'border-yellow-200',
                  text: 'text-yellow-800',
                  subtext: 'text-yellow-700',
                  icon: 'text-yellow-400'
                },
                info: {
                  bg: 'bg-blue-50',
                  border: 'border-blue-200',
                  text: 'text-blue-800',
                  subtext: 'text-blue-700',
                  icon: 'text-blue-400'
                },
                error: {
                  bg: 'bg-red-50',
                  border: 'border-red-200',
                  text: 'text-red-800',
                  subtext: 'text-red-700',
                  icon: 'text-red-400'
                }
              };

              const iconSvgs = {
                success: (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                ),
                warning: (
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                ),
                info: (
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                ),
                error: (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                )
              };

              const colorSet = colors[insight.type];

              return (
                <div key={index} className={`p-4 ${colorSet.bg} ${colorSet.border} border rounded-lg`}>
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className={`h-5 w-5 ${colorSet.icon}`} fill="currentColor" viewBox="0 0 20 20">
                        {iconSvgs[insight.type]}
                      </svg>
                    </div>
                    <div className="ml-3">
                      <div className="flex items-center">
                        <h4 className={`text-sm font-medium ${colorSet.text}`}>{insight.title}</h4>
                        {insight.metric !== undefined && insight.metric !== null && (
                          <span className={`ml-2 px-2 py-1 rounded text-xs font-bold ${colorSet.text} bg-white bg-opacity-50`}>
                            {insight.metric.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${colorSet.subtext} mt-1`}>
                        {insight.message}
                      </p>
                      {insight.recommendation && (
                        <p className={`text-xs ${colorSet.subtext} mt-2 font-medium`}>
                          💡 {insight.recommendation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="mt-2">Generando insights basados en datos...</p>
            <p className="text-sm text-gray-400">Los insights aparecerán cuando haya suficientes datos</p>
          </div>
        )}
      </div>
    </div>
  );
}