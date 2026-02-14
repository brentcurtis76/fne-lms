import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import LoadingSkeleton from '../../../components/common/LoadingSkeleton';
import ExportDropdown from '../../../components/reports/ExportDropdown';
import {
  Calendar,
  CheckCircle,
  Clock,
  Users,
  FileText,
  CalendarClock,
  XCircle,
  BarChart3,
  Filter,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { getStatusBadge, getStatusColor } from '../../../lib/utils/session-ui-helpers';
import { SessionStatus } from '../../../lib/types/consultor-sessions.types';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface SessionAnalyticsKPIs {
  total_sessions: number;
  completed_sessions: number;
  cancelled_sessions: number;
  completion_rate: number;
  total_hours_scheduled: number;
  total_hours_actual: number;
  avg_attendance_rate: number;
  sessions_pending_report: number;
  upcoming_sessions: number;
}

interface StatusDistributionItem {
  status: string;
  count: number;
}

interface ModalityDistributionItem {
  modality: string;
  count: number;
}

interface SessionsByMonthItem {
  month: string;
  total: number;
  completed: number;
  cancelled: number;
}

interface SessionsBySchoolItem {
  school_id: number;
  school_name: string;
  total: number;
  completed: number;
}

interface AttendanceTrendsItem {
  month: string;
  avg_attendance_rate: number;
  total_expected: number;
  total_attended: number;
}

interface TopConsultantItem {
  user_id: string;
  name: string;
  sessions_led: number;
  avg_attendance: number;
}

interface RecentSessionItem {
  id: string;
  title: string;
  session_date: string;
  status: SessionStatus;
  school_name: string;
  gc_name: string;
  attendance_rate: number | null;
}

interface AnalyticsData {
  kpis: SessionAnalyticsKPIs;
  status_distribution: StatusDistributionItem[];
  modality_distribution: ModalityDistributionItem[];
  sessions_by_month: SessionsByMonthItem[];
  sessions_by_school: SessionsBySchoolItem[];
  attendance_trends: AttendanceTrendsItem[];
  top_consultants?: TopConsultantItem[];
  recent_sessions: RecentSessionItem[];
}

// ============================================================
// COLORS
// ============================================================

const FNE_COLORS = {
  brand_primary: '#0a0a0a',
  brand_accent: '#fbbf24',
  brand_accent_light: '#fef3c7',
};

const MODALITY_COLORS: Record<string, string> = {
  presencial: '#3B82F6',
  online: '#10B981',
  hibrida: '#F59E0B',
};

// ============================================================
// KPI CARD COMPONENT
// ============================================================

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

function KPICard({ title, value, icon, color }: KPICardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow p-6 border-l-4"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// ============================================================
// PIE CHART CUSTOM LABEL
// ============================================================

interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: PieLabelProps) {
  if (percent < 0.05) return null; // Skip labels for tiny slices
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

const SessionReportsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Filter state
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [schoolFilter, setSchoolFilter] = useState('');
  const [gcFilter, setGcFilter] = useState('');
  const [consultantFilter, setConsultantFilter] = useState('');

  // Responsive
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auth initialization
  useEffect(() => {
    if (!router.isReady) return;

    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        const role = await getUserPrimaryRole(session.user.id);
        if (!role || !['admin', 'consultor'].includes(role)) {
          setError('No tienes permisos para acceder a los reportes de sesiones');
          setLoading(false);
          return;
        }

        setUserRole(role);
        setLoading(false);
      } catch (err) {
        setError('Error al cargar los datos del usuario');
        setLoading(false);
      }
    }

    initAuth();
  }, [router.isReady, router, supabase]);

  // Fetch analytics data
  useEffect(() => {
    if (!userRole) return;
    fetchAnalytics();
  }, [userRole, dateFrom, dateTo, schoolFilter, gcFilter, consultantFilter]);

  const fetchAnalytics = async () => {
    try {
      setDataLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (schoolFilter) params.append('school_id', schoolFilter);
      if (gcFilter) params.append('growth_community_id', gcFilter);
      if (consultantFilter && userRole === 'admin') {
        params.append('consultant_id', consultantFilter);
      }

      const response = await fetch(`/api/sessions/reports/analytics?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        toast.error(errData.error || 'Error cargando datos');
        return;
      }

      const result = await response.json();
      setAnalyticsData(result.data || null);
    } catch (err) {
      toast.error('Error al cargar datos de reportes');
    } finally {
      setDataLoading(false);
    }
  };

  const isAdmin = userRole === 'admin';

  // ============================================================
  // LOADING STATE
  // ============================================================
  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <LoadingSkeleton variant="card" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        </div>
      </MainLayout>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================
  if (error) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Acceso Denegado
            </h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-md hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Dashboard
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ============================================================
  // EMPTY STATE
  // ============================================================
  if (!dataLoading && analyticsData && analyticsData.kpis.total_sessions === 0) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {renderHeader()}
          {renderFilters()}
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <BarChart3 className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No hay sesiones en el período seleccionado</p>
            <p className="text-sm mt-2">No hay sesiones que coincidan con los filtros seleccionados. Intenta ajustar los filtros para ver más resultados.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ============================================================
  // HELPER: Format month label
  // ============================================================
  function formatMonthLabel(month: string): string {
    try {
      return format(parseISO(month + '-01'), 'MMM yyyy', { locale: es });
    } catch {
      return month;
    }
  }

  // ============================================================
  // RENDER: Header
  // ============================================================
  function renderHeader() {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-7 h-7 text-brand_primary" />
          <h1 className="text-2xl font-bold text-gray-900">Reportes de Sesiones</h1>
        </div>
        <p className="text-gray-600">
          {isAdmin
            ? 'Estadísticas y métricas de todas las sesiones de consultoría'
            : 'Estadísticas y métricas de tus sesiones de consultoría'}
        </p>
      </div>
    );
  }

  // ============================================================
  // RENDER: Filters
  // ============================================================
  function renderFilters() {
    // Build unique GC list from sessions_by_school data
    const schools = analyticsData?.sessions_by_school || [];
    // Build unique consultants from top_consultants (admin only)
    const consultants = analyticsData?.top_consultants || [];

    return (
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
            />
          </div>
          <div>
            <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
            />
          </div>
          <div>
            <label htmlFor="school-filter" className="block text-sm font-medium text-gray-700 mb-1">Escuela</label>
            <select
              id="school-filter"
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
            >
              <option value="">Todas</option>
              {schools.map((s) => (
                <option key={s.school_id} value={s.school_id}>
                  {s.school_name}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && consultants.length > 0 && (
            <div>
              <label htmlFor="consultant-filter" className="block text-sm font-medium text-gray-700 mb-1">Consultor</label>
              <select
                id="consultant-filter"
                value={consultantFilter}
                onChange={(e) => setConsultantFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
              >
                <option value="">Todos</option>
                {consultants.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: KPI Cards
  // ============================================================
  function renderKPICards() {
    if (!analyticsData) return null;
    const { kpis } = analyticsData;

    return (
      <div className="space-y-4 mb-6">
        {/* Row 1: 4 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Sesiones"
            value={kpis.total_sessions}
            icon={<Calendar className="w-6 h-6" />}
            color={FNE_COLORS.brand_primary}
          />
          <KPICard
            title="Tasa de Completación"
            value={`${kpis.completion_rate}%`}
            icon={<CheckCircle className="w-6 h-6" />}
            color="#10B981"
          />
          <KPICard
            title="Horas Programadas"
            value={`${kpis.total_hours_scheduled}h`}
            icon={<Clock className="w-6 h-6" />}
            color="#3B82F6"
          />
          <KPICard
            title="Asistencia Promedio"
            value={`${kpis.avg_attendance_rate}%`}
            icon={<Users className="w-6 h-6" />}
            color="#F59E0B"
          />
        </div>

        {/* Row 2: 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard
            title="Pendientes de Informe"
            value={kpis.sessions_pending_report}
            icon={<FileText className="w-6 h-6" />}
            color="#F97316"
          />
          <KPICard
            title="Próximas Sesiones"
            value={kpis.upcoming_sessions}
            icon={<CalendarClock className="w-6 h-6" />}
            color="#6366F1"
          />
          <KPICard
            title="Sesiones Canceladas"
            value={kpis.cancelled_sessions}
            icon={<XCircle className="w-6 h-6" />}
            color="#EF4444"
          />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: Charts
  // ============================================================
  function renderCharts() {
    if (!analyticsData) return null;

    const chartHeight = isMobile ? 250 : 300;

    // Prepare sessions by month data with formatted labels
    const monthlyData = analyticsData.sessions_by_month.map((item) => ({
      ...item,
      label: formatMonthLabel(item.month),
      other: item.total - item.completed - item.cancelled,
    }));

    // Prepare status distribution data
    const statusData = analyticsData.status_distribution.map((item) => ({
      ...item,
      name: getStatusBadge(item.status as SessionStatus).label,
      fill: getStatusColor(item.status as SessionStatus),
    }));

    // Prepare modality distribution data
    const modalityData = analyticsData.modality_distribution.map((item) => ({
      ...item,
      name: item.modality.charAt(0).toUpperCase() + item.modality.slice(1),
      fill: MODALITY_COLORS[item.modality] || '#6B7280',
    }));

    // Prepare attendance trends data
    const attendanceData = analyticsData.attendance_trends.map((item) => ({
      ...item,
      label: formatMonthLabel(item.month),
    }));

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Chart 1: Sessions by Month */}
        <div className="bg-white rounded-lg shadow p-6" aria-label="Sesiones por Mes - Gráfico de barras">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sesiones por Mes</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomChartTooltip />} />
              <Legend />
              <Bar dataKey="completed" stackId="a" fill="#10B981" name="Completadas" />
              <Bar dataKey="cancelled" stackId="a" fill="#EF4444" name="Canceladas" />
              <Bar dataKey="other" stackId="a" fill="#9CA3AF" name="Otras" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Status Distribution */}
        <div className="bg-white rounded-lg shadow p-6" aria-label="Distribución por Estado - Gráfico circular">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Estado</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderPieLabel}
                outerRadius={isMobile ? 80 : 100}
                dataKey="count"
                nameKey="name"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 3: Modality Distribution */}
        <div className="bg-white rounded-lg shadow p-6" aria-label="Distribución por Modalidad - Gráfico circular">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Modalidad</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={modalityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderPieLabel}
                outerRadius={isMobile ? 80 : 100}
                dataKey="count"
                nameKey="name"
              >
                {modalityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 4: Attendance Trends */}
        <div className="bg-white rounded-lg shadow p-6" aria-label="Tendencia de Asistencia - Gráfico de área">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia de Asistencia</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip content={<CustomChartTooltip />} />
              <Area
                type="monotone"
                dataKey="avg_attendance_rate"
                stroke={FNE_COLORS.brand_primary}
                fill={FNE_COLORS.brand_accent_light}
                name="Asistencia (%)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 5 (admin only): Sessions by School */}
        {isAdmin && analyticsData.sessions_by_school.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6" aria-label="Sesiones por Escuela - Gráfico de barras horizontal">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sesiones por Escuela</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart
                data={analyticsData.sessions_by_school}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="school_name"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend />
                <Bar dataKey="total" fill="#3B82F6" name="Total" />
                <Bar dataKey="completed" fill="#10B981" name="Completadas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart 6 (admin only): Top Consultants */}
        {isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6" aria-label="Top Consultores - Gráfico de barras horizontal">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Consultores</h3>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart
                data={analyticsData.top_consultants}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend />
                <Bar dataKey="sessions_led" fill={FNE_COLORS.brand_accent} name="Sesiones dirigidas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RENDER: Recent Sessions Table
  // ============================================================
  function renderRecentSessionsTable() {
    if (!analyticsData || analyticsData.recent_sessions.length === 0) return null;

    const exportData = analyticsData.recent_sessions.map((s) => ({
      Fecha: s.session_date,
      Título: s.title,
      Escuela: s.school_name,
      Comunidad: s.gc_name,
      Estado: getStatusBadge(s.status).label,
      Asistencia: s.attendance_rate !== null ? `${s.attendance_rate}%` : 'N/A',
    }));

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Sesiones Recientes</h3>
          <ExportDropdown
            tabName="Sesiones Recientes"
            data={exportData}
            headers={['Fecha', 'Título', 'Escuela', 'Comunidad', 'Estado', 'Asistencia']}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Título
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Escuela
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comunidad
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asistencia
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analyticsData.recent_sessions.map((session) => {
                const badge = getStatusBadge(session.status);
                return (
                  <tr
                    key={session.id}
                    className="hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(`/consultor/sessions/${session.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/consultor/sessions/${session.id}`);
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(parseISO(session.session_date), 'dd MMM yyyy', { locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {session.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {session.school_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {session.gc_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {session.attendance_rate !== null ? `${session.attendance_rate}%` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderHeader()}
        {renderFilters()}

        {dataLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        ) : (
          <>
            {renderKPICards()}
            {renderCharts()}
            {renderRecentSessionsTable()}
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default SessionReportsPage;
