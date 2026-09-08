import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import {
  Clock,
  Users,
  Target,
  TrendingUp,
  AlertTriangle,
  Map,
  Lock,
  Info,
} from 'lucide-react';
import {
  isOverviewAnalytics,
  isPathSpecificAnalytics,
  UNAVAILABLE_METRIC_LABELS,
  type LearningPathAnalyticsOverview,
  type PathSpecificAnalytics,
  type UnavailableMetric,
} from '../../types/learning-path-analytics';

/**
 * Learning-path analytics (admin reports tab). Consumes the nullable C3
 * contract of types/learning-path-analytics.ts — C-R1-04 (closure review
 * 2026-09-08): a null rate is an explicit "No disponible" state (never a
 * crash, never a fabricated 0), a valid 0 is 0.0 %, metrics without a governing
 * definition are named as unavailable and never drawn as a series, and a
 * denied (403), failed (502 relation) or malformed response each has its own
 * state.
 */

interface LearningPathAnalyticsProps {
  selectedPath?: string;
  dateRange?: number;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string; relation?: string }
  | { kind: 'overview'; data: LearningPathAnalyticsOverview }
  | { kind: 'path'; data: PathSpecificAnalytics };

const UNAVAILABLE = 'No disponible';

/** A nullable rate: null = unavailable; a number (0 included) is a value. */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value.toFixed(1)}h`;
}

function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return `${value.toFixed(1)} días`;
}

function unavailableLabels(keys: readonly string[]): string {
  return keys
    .map((k) => UNAVAILABLE_METRIC_LABELS[k as UnavailableMetric] ?? k)
    .join(', ');
}

export default function LearningPathAnalytics({ selectedPath, dateRange = 30 }: LearningPathAnalyticsProps) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const fetchAnalytics = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const params = new URLSearchParams({ dateRange: dateRange.toString() });
      if (selectedPath) params.append('pathId', selectedPath);

      const response = await fetch(`/api/learning-paths/analytics?${params}`);
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.status === 401 || response.status === 403) {
        setState({ kind: 'denied' });
        return;
      }
      if (response.status === 502) {
        const b = (body ?? {}) as { relation?: string };
        setState({ kind: 'error', message: 'Las analíticas de rutas de aprendizaje están temporalmente no disponibles.', relation: b.relation });
        return;
      }
      if (!response.ok) {
        const b = (body ?? {}) as { error?: string };
        setState({ kind: 'error', message: b.error || `Error ${response.status}` });
        return;
      }
      if (selectedPath ? isPathSpecificAnalytics(body) : isOverviewAnalytics(body)) {
        setState(selectedPath ? { kind: 'path', data: body as PathSpecificAnalytics } : { kind: 'overview', data: body as LearningPathAnalyticsOverview });
        return;
      }
      setState({ kind: 'error', message: 'La respuesta del servidor no tiene el formato esperado.' });
    } catch (err: unknown) {
      console.error('Analytics fetch error:', err);
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Error de conexión' });
    }
  }, [selectedPath, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-4" data-testid="lp-analytics-loading">
        <div className="animate-pulse bg-gray-200 h-40 rounded-lg"></div>
        <div className="animate-pulse bg-gray-200 h-60 rounded-lg"></div>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg" data-testid="lp-analytics-denied">
        <div className="flex items-center">
          <Lock className="h-5 w-5 mr-2" />
          <span>Las analíticas de rutas de aprendizaje están disponibles solo para administradores.</span>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" data-testid="lp-analytics-error">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>
            {state.relation ? state.message : `Error al cargar analíticas: ${state.message}`}
            {state.relation && <span className="ml-1 text-sm">(consulta fallida: <code>{state.relation}</code>)</span>}
          </span>
        </div>
      </div>
    );
  }

  if (state.kind === 'path') {
    return <PathSpecificView data={state.data} />;
  }

  const data = state.data;
  const ratedPaths = data.pathPerformance.filter((p) => p.completionRate !== null);
  const unratedPaths = data.pathPerformance.filter((p) => p.completionRate === null);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="lp-analytics-summary">
        <SummaryCard title="Rutas Totales" value={data.summary.totalPaths} icon={<Map className="h-5 w-5" />} color="text-blue-600" />
        <SummaryCard title="Usuarios Asignados" value={data.summary.totalAssignedUsers} icon={<Users className="h-5 w-5" />} color="text-green-600" />
        <SummaryCard title="Completados" value={data.summary.totalCompletedUsers} icon={<Target className="h-5 w-5" />} color="text-amber-600" />
        <SummaryCard
          title="Tasa Promedio"
          value={formatRate(data.summary.averageCompletionRate)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="text-orange-600"
          testId="lp-analytics-avg-rate"
          muted={data.summary.averageCompletionRate === null}
        />
        <SummaryCard
          title="Tiempo Total"
          value={formatHours(data.summary.totalTimeSpentHours)}
          icon={<Clock className="h-5 w-5" />}
          color="text-red-600"
          testId="lp-analytics-total-hours"
        />
      </div>

      {/* Empty / unavailable population states (distinct from a failed query) */}
      {data.summary.totalPaths === 0 && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg" data-testid="lp-analytics-empty">
          <div className="flex items-center">
            <Info className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>Sin rutas de aprendizaje registradas: no hay datos que analizar en este período.</span>
          </div>
        </div>
      )}
      {data.summary.totalPaths > 0 && data.summary.averageCompletionRate === null && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg" data-testid="lp-analytics-empty">
          <div className="flex items-center">
            <Info className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>Tasa promedio no disponible: ninguna ruta tiene usuarios asignados todavía.</span>
          </div>
        </div>
      )}

      {/* Path Performance Chart — completion rate only; undefined metrics are never a series */}
      {ratedPaths.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" data-testid="lp-analytics-performance-chart">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Rendimiento por Ruta de Aprendizaje
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={ratedPaths}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="pathName" angle={-45} textAnchor="end" height={100} fontSize={12} />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(value: number | string, name: string) => {
                  if (name === 'completionRate') return [formatRate(Number(value)), 'Tasa de Completación'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar dataKey="completionRate" fill="#3b82f6" name="Tasa de Completación (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {unratedPaths.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" data-testid="lp-analytics-unrated">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Rutas sin población asignada</h3>
          <p className="text-sm text-gray-600 mb-3">
            La tasa de completación no está definida para una ruta sin usuarios asignados; no se muestra como 0.
          </p>
          <ul className="space-y-1">
            {unratedPaths.map((p) => (
              <li key={p.pathId} className="text-sm text-gray-800">
                <strong>{p.pathName}</strong>: {UNAVAILABLE} (sin población asignada)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Completion Trends */}
      {data.completionTrends.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" data-testid="lp-analytics-trends">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Tendencias de Completación (Últimos {dateRange} días)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.completionTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="completions" stroke="#3b82f6" strokeWidth={2} name="Completaciones de curso" />
              <Line type="monotone" dataKey="enrollments" stroke="#10b981" strokeWidth={2} name="Nuevas asignaciones" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Low Performing Paths Alert */}
      {data.lowPerformingPaths.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4" data-testid="lp-analytics-low-performing">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-1 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-lg font-medium text-amber-800 mb-2">Rutas con Bajo Rendimiento</h4>
              <p className="text-amber-700 text-sm mb-3">
                Las siguientes rutas tienen tasas de completación inferiores al 40%:
              </p>
              <ul className="space-y-2">
                {data.lowPerformingPaths.map((path) => (
                  <li key={path.pathId} className="text-sm text-amber-800">
                    <strong>{path.pathName}</strong>: {formatRate(path.completionRate)} completación ({path.totalUsers} usuarios asignados)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {data.unavailable.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="lp-analytics-unavailable-note">
          Métricas sin definición aprobada (no disponibles, no se calculan): {unavailableLabels(data.unavailable)}.
        </p>
      )}
    </div>
  );
}

function PathSpecificView({ data }: { data: PathSpecificAnalytics }) {
  return (
    <div className="space-y-6" data-testid="lp-analytics-path">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="lp-analytics-summary">
        <SummaryCard title="Usuarios Asignados" value={data.pathInfo.totalAssignedUsers} icon={<Users className="h-5 w-5" />} color="text-green-600" />
        <SummaryCard title="Completados" value={data.pathInfo.completedUsers} icon={<Target className="h-5 w-5" />} color="text-amber-600" />
        <SummaryCard
          title="Tasa de Completación"
          value={formatRate(data.pathInfo.completionRate)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="text-orange-600"
          testId="lp-analytics-avg-rate"
          muted={data.pathInfo.completionRate === null}
        />
        <SummaryCard title="Tiempo Promedio" value={formatDays(data.pathInfo.avgCompletionTimeDays)} icon={<Clock className="h-5 w-5" />} color="text-red-600" />
      </div>
      {data.pathInfo.totalAssignedUsers === 0 && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg" data-testid="lp-analytics-empty">
          Esta ruta no tiene usuarios asignados: las tasas no están disponibles.
        </div>
      )}
      {data.courseProgression.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Progresión por Curso</h3>
          <ul className="space-y-1">
            {data.courseProgression.map((c) => (
              <li key={c.courseId} className="text-sm text-gray-800">
                {c.sequenceOrder}. <strong>{c.courseName ?? 'Curso sin título'}</strong>: {c.usersReached} usuarios alcanzados · alcance {formatRate(c.reachRate)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.unavailable.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="lp-analytics-unavailable-note">
          Métricas sin definición aprobada (no disponibles, no se calculan): {unavailableLabels(data.unavailable)}.
        </p>
      )}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  testId?: string;
  muted?: boolean;
}

function SummaryCard({ title, value, icon, color, testId, muted }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${muted ? 'text-gray-400' : 'text-gray-900'}`} data-testid={testId}>{value}</p>
        </div>
        <div className={`${color}`}>{icon}</div>
      </div>
    </div>
  );
}
