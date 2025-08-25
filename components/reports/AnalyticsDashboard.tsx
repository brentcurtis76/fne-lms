import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import LoadingSkeleton from '../common/LoadingSkeleton';
import CollapsibleSection from './CollapsibleSection';
import { apiCache } from '../../utils/cache';
import toast from 'react-hot-toast';

interface AnalyticsDashboardProps {
  userId: string;
  userRole: string;
  isAdmin: boolean;
  filters: {
    school_id: string;
    generation_id: string;
    community_id: string;
  };
}

interface AnalyticsData {
  progress_trends: any[];
  completion_rates: any[];
  performance_distribution: any[];
  time_trends: any[];
  quiz_analytics: any;
  kpis: any;
  insights: any[];
  metadata: any;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
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

function KPICard({ title, value, subtitle, icon, color, trend }: KPICardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <div className="flex items-baseline">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {trend && (
              <span className={`ml-2 text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ userId, userRole, isAdmin, filters }: AnalyticsDashboardProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState('30');
  const [groupBy, setGroupBy] = useState('week');
  const [activeChart, setActiveChart] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    insights: true,
    kpis: true,
    charts: true,
    quizzes: true
  });

  useEffect(() => {
    fetchAnalyticsData();
  }, [userId, timePeriod, groupBy, filters]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On mobile, collapse sections by default except KPIs
      if (mobile) {
        setExpandedSections({
          insights: false,
          kpis: true,
          charts: false,
          quizzes: false
        });
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      
      const url = new URL('/api/reports/analytics-data', window.location.origin);
      url.searchParams.set('user_id', userId);
      url.searchParams.set('timeRange', timePeriod);
      url.searchParams.set('groupBy', groupBy);
      
      if (filters.school_id !== 'all') {
        url.searchParams.set('school_id', filters.school_id);
      }
      if (filters.generation_id !== 'all') {
        url.searchParams.set('generation_id', filters.generation_id);
      }
      if (filters.community_id !== 'all') {
        url.searchParams.set('community_id', filters.community_id);
      }

      // Check cache first
      const cacheKey = url.toString();
      const cachedData = apiCache.get<AnalyticsData>(cacheKey);
      
      if (cachedData) {
        setAnalyticsData(cachedData);
        setLoading(false);
        return;
      }

      const response = await fetch(url.toString());
      
      if (response.ok) {
        const data = await response.json();
        // Cache for 3 minutes
        apiCache.set(cacheKey, data, 3 * 60 * 1000);
        setAnalyticsData(data);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error cargando datos analíticos');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Error cargando datos analíticos');
    } finally {
      setLoading(false);
    }
  };

  const exportChart = async (chartType: string) => {
    try {
      // This would typically use a library like html2canvas or similar
      toast.success(`Funcionalidad de exportación para ${chartType} próximamente`);
    } catch (error) {
      toast.error('Error exportando gráfico');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Período de Tiempo
              </label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7">Última semana</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 3 meses</option>
                <option value="365">Último año</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agrupar por
              </label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="day">Día</option>
                <option value="week">Semana</option>
                <option value="month">Mes</option>
              </select>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Datos de {analyticsData.metadata?.total_users || 0} usuarios
          </div>
        </div>
      </div>

      {/* Mock Data Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Vista Previa del Dashboard Analítico
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>Este dashboard está listo para mostrar datos reales una vez que se implemente la API de analytics correspondiente.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sample KPI Cards */}
      <CollapsibleSection
        title="Métricas Clave"
        isExpanded={expandedSections.kpis}
        onToggle={() => toggleSection('kpis')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <KPICard
          title="Usuarios Activos"
          value={125}
          subtitle="de 200 totales"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
          }
          color={FNE_COLORS.primary}
        />
        
        <KPICard
          title="Tasa de Finalización"
          value="78%"
          subtitle="de cursos completados"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
          color={FNE_COLORS.success}
        />
        
        <KPICard
          title="Progreso Promedio"
          value="65%"
          subtitle="de avance general"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          }
          color={FNE_COLORS.info}
        />
        
        <KPICard
          title="Tiempo Promedio"
          value="12.5h"
          subtitle="por usuario"
          icon={
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          }
          color={FNE_COLORS.warning}
        />
        </div>
      </CollapsibleSection>

      {/* Sample Charts */}
      <CollapsibleSection
        title="Gráficos de Análisis"
        isExpanded={expandedSections.charts}
        onToggle={() => toggleSection('charts')}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {/* Sample Progress Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Tendencia de Progreso</h3>
            <button
              onClick={() => exportChart('progress-trends')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Exportar
            </button>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
            <LineChart data={[
              { label: 'Sem 1', lessons_completed: 45, unique_users: 20 },
              { label: 'Sem 2', lessons_completed: 67, unique_users: 32 },
              { label: 'Sem 3', lessons_completed: 89, unique_users: 45 },
              { label: 'Sem 4', lessons_completed: 123, unique_users: 58 }
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="lessons_completed"
                stroke={FNE_COLORS.primary}
                strokeWidth={2}
                name="Lecciones Completadas"
              />
              <Line
                type="monotone"
                dataKey="unique_users"
                stroke={FNE_COLORS.secondary}
                strokeWidth={2}
                name="Usuarios Activos"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sample Time Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Tiempo de Estudio</h3>
            <button
              onClick={() => exportChart('time-trends')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Exportar
            </button>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
            <AreaChart data={[
              { label: 'Sem 1', total_time_hours: 120, avg_time_per_user: 6 },
              { label: 'Sem 2', total_time_hours: 180, avg_time_per_user: 9 },
              { label: 'Sem 3', total_time_hours: 245, avg_time_per_user: 12 },
              { label: 'Sem 4', total_time_hours: 320, avg_time_per_user: 15 }
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="total_time_hours"
                stroke={FNE_COLORS.success}
                fill={`${FNE_COLORS.success}30`}
                name="Total Horas"
              />
              <Area
                type="monotone"
                dataKey="avg_time_per_user"
                stroke={FNE_COLORS.info}
                fill={`${FNE_COLORS.info}30`}
                name="Promedio por Usuario"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}