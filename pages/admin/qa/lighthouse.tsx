/**
 * QA Performance Dashboard - Lighthouse & Web Vitals
 *
 * Combined dashboard for viewing:
 * - Lighthouse audit results and trends
 * - Core Web Vitals metrics from real user monitoring
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  Gauge,
  ArrowLeft,
  RefreshCw,
  Loader2,
  TrendingUp,
  Clock,
  Eye,
  Zap,
  Search,
  BarChart3,
  Plus,
  Trash2,
  Globe,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import QATourProvider from '@/components/qa/QATourProvider';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import type { LighthouseResult, LighthouseTrendPoint, LighthouseStats } from '@/pages/api/qa/lighthouse';
import type { VitalTrendPoint, VitalStats, VitalName } from '@/pages/api/qa/vitals';

// Vital display configuration
const VITAL_CONFIG: Record<VitalName, {
  label: string;
  unit: string;
  description: string;
  goodThreshold: number;
  poorThreshold: number;
}> = {
  LCP: {
    label: 'Largest Contentful Paint',
    unit: 'ms',
    description: 'Tiempo hasta que el contenido más grande se muestra',
    goodThreshold: 2500,
    poorThreshold: 4000,
  },
  INP: {
    label: 'Interaction to Next Paint',
    unit: 'ms',
    description: 'Tiempo de respuesta a interacciones del usuario',
    goodThreshold: 200,
    poorThreshold: 500,
  },
  CLS: {
    label: 'Cumulative Layout Shift',
    unit: '',
    description: 'Estabilidad visual durante la carga',
    goodThreshold: 0.1,
    poorThreshold: 0.25,
  },
  FCP: {
    label: 'First Contentful Paint',
    unit: 'ms',
    description: 'Tiempo hasta el primer contenido visible',
    goodThreshold: 1800,
    poorThreshold: 3000,
  },
  TTFB: {
    label: 'Time to First Byte',
    unit: 'ms',
    description: 'Tiempo de respuesta del servidor',
    goodThreshold: 800,
    poorThreshold: 1800,
  },
};

const QAPerformancePage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'lighthouse' | 'vitals'>('vitals');

  // Period filter
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');

  // Lighthouse state
  const [lighthouseResults, setLighthouseResults] = useState<LighthouseResult[]>([]);
  const [lighthouseStats, setLighthouseStats] = useState<LighthouseStats | null>(null);
  const [lighthouseTrends, setLighthouseTrends] = useState<LighthouseTrendPoint[]>([]);
  const [lighthouseUrls, setLighthouseUrls] = useState<string[]>([]);
  const [loadingLighthouse, setLoadingLighthouse] = useState(false);

  // Vitals state
  const [vitalStats, setVitalStats] = useState<VitalStats | null>(null);
  const [vitalTrends, setVitalTrends] = useState<VitalTrendPoint[]>([]);
  const [vitalPages, setVitalPages] = useState<string[]>([]);
  const [loadingVitals, setLoadingVitals] = useState(false);

  // Manual audit form
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [auditUrl, setAuditUrl] = useState('');
  const [auditScores, setAuditScores] = useState({
    performance: '',
    accessibility: '',
    best_practices: '',
    seo: '',
  });
  const [submittingAudit, setSubmittingAudit] = useState(false);

  // Expanded sections
  const [expandedVital, setExpandedVital] = useState<VitalName | null>(null);

  // Check auth and permissions
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

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const isAdmin = roles?.some((r) => r.role_type === 'admin') || false;
      setHasPermission(isAdmin);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch Lighthouse data
  const fetchLighthouseData = useCallback(async () => {
    setLoadingLighthouse(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch results
      const resultsRes = await fetch(`/api/qa/lighthouse?period=${period}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (resultsRes.ok) {
        const data = await resultsRes.json();
        setLighthouseResults(data.results || []);
        setLighthouseStats(data.stats || null);
        setLighthouseUrls(data.urls || []);
      }

      // Fetch trends
      const trendsRes = await fetch(`/api/qa/lighthouse?period=${period}&trends=true`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setLighthouseTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Error fetching lighthouse data:', error);
      toast.error('Error al cargar datos de Lighthouse');
    } finally {
      setLoadingLighthouse(false);
    }
  }, [supabase, period]);

  // Fetch Vitals data
  const fetchVitalsData = useCallback(async () => {
    setLoadingVitals(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch stats
      const statsRes = await fetch(`/api/qa/vitals?period=${period}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setVitalStats(data.stats || null);
        setVitalPages(data.pages || []);
      }

      // Fetch trends
      const trendsRes = await fetch(`/api/qa/vitals?period=${period}&trends=true`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setVitalTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Error fetching vitals data:', error);
      toast.error('Error al cargar datos de Web Vitals');
    } finally {
      setLoadingVitals(false);
    }
  }, [supabase, period]);

  // Fetch data on mount and period change
  useEffect(() => {
    if (user && hasPermission === true) {
      if (activeTab === 'lighthouse') {
        fetchLighthouseData();
      } else {
        fetchVitalsData();
      }
    }
  }, [user, hasPermission, activeTab, period, fetchLighthouseData, fetchVitalsData]);

  // Submit manual audit
  const handleSubmitAudit = async () => {
    if (!auditUrl) {
      toast.error('URL es requerida');
      return;
    }

    setSubmittingAudit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/lighthouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          url: auditUrl,
          performance_score: auditScores.performance ? parseInt(auditScores.performance, 10) : null,
          accessibility_score: auditScores.accessibility ? parseInt(auditScores.accessibility, 10) : null,
          best_practices_score: auditScores.best_practices ? parseInt(auditScores.best_practices, 10) : null,
          seo_score: auditScores.seo ? parseInt(auditScores.seo, 10) : null,
        }),
      });

      if (response.ok) {
        toast.success('Auditoría registrada');
        setShowAuditForm(false);
        setAuditUrl('');
        setAuditScores({ performance: '', accessibility: '', best_practices: '', seo: '' });
        fetchLighthouseData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al registrar auditoría');
      }
    } catch (error) {
      console.error('Error submitting audit:', error);
      toast.error('Error al registrar auditoría');
    } finally {
      setSubmittingAudit(false);
    }
  };

  // Delete lighthouse result
  const handleDeleteResult = async (id: string) => {
    if (!confirm('¿Eliminar este resultado?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/lighthouse?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        toast.success('Resultado eliminado');
        fetchLighthouseData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error deleting result:', error);
      toast.error('Error al eliminar');
    }
  };

  // Get score color class
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-brand_gray_medium';
    if (score >= 90) return 'text-brand_accent';
    if (score >= 50) return 'text-brand_accent_light';
    return 'text-brand_gray_medium';
  };

  // Get vital rating color
  const getVitalRatingColor = (vitalName: VitalName, value: number | null) => {
    if (value === null) return 'bg-gray-100 text-brand_gray_medium';
    const config = VITAL_CONFIG[vitalName];
    if (value <= config.goodThreshold) return 'bg-brand_accent/20 text-brand_primary';
    if (value <= config.poorThreshold) return 'bg-brand_accent_light/30 text-brand_primary';
    return 'bg-gray-200 text-brand_gray_dark';
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-admin"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-700 mb-6">
              Solo administradores pueden ver datos de rendimiento.
            </p>
            <Link
              href="/admin/qa"
              className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors"
            >
              Volver al Panel QA
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <QATourProvider tourId="qa-lighthouse">
        <ResponsiveFunctionalPageHeader
          icon={<Gauge />}
          title="Rendimiento"
          subtitle="Lighthouse y Core Web Vitals"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link
          href="/admin/qa"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Panel QA
        </Link>

        {/* Tabs and Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Tab Selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('vitals')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'vitals'
                    ? 'bg-brand_primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-tour="vitals-tab"
              >
                <Activity className="w-4 h-4" />
                Web Vitals
              </button>
              <button
                onClick={() => setActiveTab('lighthouse')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'lighthouse'
                    ? 'bg-brand_primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-tour="lighthouse-tab"
              >
                <Gauge className="w-4 h-4" />
                Lighthouse
              </button>
            </div>

            {/* Period Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Período:</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'week' | 'month' | 'all')}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
              >
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
                <option value="all">Todo</option>
              </select>
              <button
                onClick={() => activeTab === 'lighthouse' ? fetchLighthouseData() : fetchVitalsData()}
                disabled={loadingLighthouse || loadingVitals}
                className="p-2 text-gray-500 hover:text-brand_primary transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${(loadingLighthouse || loadingVitals) ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Web Vitals Tab */}
        {activeTab === 'vitals' && (
          <>
            {loadingVitals ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : vitalStats && Object.keys(vitalStats.by_vital).length > 0 ? (
              <>
                {/* Vitals Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                  {(Object.keys(VITAL_CONFIG) as VitalName[]).map((vitalName) => {
                    const stat = vitalStats.by_vital[vitalName];
                    const config = VITAL_CONFIG[vitalName];
                    const p75 = stat?.p75;

                    return (
                      <button
                        key={vitalName}
                        onClick={() => setExpandedVital(expandedVital === vitalName ? null : vitalName)}
                        className="bg-white rounded-lg shadow-md p-4 text-left hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500">{vitalName}</span>
                          {expandedVital === vitalName ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <p className={`text-2xl font-bold ${getVitalRatingColor(vitalName, p75 ?? null).replace('bg-', 'text-').split(' ')[0]}`}>
                          {p75 !== undefined ? (
                            vitalName === 'CLS' ? p75.toFixed(3) : `${p75.toLocaleString()}${config.unit}`
                          ) : (
                            '—'
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">P75</p>
                        {stat && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-brand_accent h-1.5 rounded-full"
                                style={{ width: `${stat.good_percentage}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{stat.good_percentage}% bueno</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Expanded Vital Detail */}
                {expandedVital && vitalStats.by_vital[expandedVital] && (
                  <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      {VITAL_CONFIG[expandedVital].label} ({expandedVital})
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {VITAL_CONFIG[expandedVital].description}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">P50 (Mediana)</p>
                        <p className="text-xl font-bold text-brand_primary">
                          {expandedVital === 'CLS'
                            ? vitalStats.by_vital[expandedVital]!.p50.toFixed(3)
                            : `${vitalStats.by_vital[expandedVital]!.p50}${VITAL_CONFIG[expandedVital].unit}`}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">P75</p>
                        <p className="text-xl font-bold text-brand_accent">
                          {expandedVital === 'CLS'
                            ? vitalStats.by_vital[expandedVital]!.p75.toFixed(3)
                            : `${vitalStats.by_vital[expandedVital]!.p75}${VITAL_CONFIG[expandedVital].unit}`}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">P95</p>
                        <p className="text-xl font-bold text-brand_gray_medium">
                          {expandedVital === 'CLS'
                            ? vitalStats.by_vital[expandedVital]!.p95.toFixed(3)
                            : `${vitalStats.by_vital[expandedVital]!.p95}${VITAL_CONFIG[expandedVital].unit}`}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Total Mediciones</p>
                        <p className="text-xl font-bold text-brand_primary">
                          {vitalStats.by_vital[expandedVital]!.count}
                        </p>
                      </div>
                    </div>

                    {/* Rating breakdown */}
                    <div className="mt-4 flex gap-4">
                      <span className="text-sm px-3 py-1 rounded-full bg-brand_accent/20 text-brand_primary">
                        {vitalStats.by_vital[expandedVital]!.good_count} bueno
                      </span>
                      <span className="text-sm px-3 py-1 rounded-full bg-brand_accent_light/30 text-brand_primary">
                        {vitalStats.by_vital[expandedVital]!.needs_improvement_count} necesita mejora
                      </span>
                      <span className="text-sm px-3 py-1 rounded-full bg-gray-200 text-brand_gray_dark">
                        {vitalStats.by_vital[expandedVital]!.poor_count} pobre
                      </span>
                    </div>

                    {/* Thresholds reference */}
                    <div className="mt-4 text-xs text-gray-500">
                      <p>
                        Umbrales: Bueno ≤ {VITAL_CONFIG[expandedVital].goodThreshold}{VITAL_CONFIG[expandedVital].unit} |
                        Necesita mejora ≤ {VITAL_CONFIG[expandedVital].poorThreshold}{VITAL_CONFIG[expandedVital].unit} |
                        Pobre {`>`} {VITAL_CONFIG[expandedVital].poorThreshold}{VITAL_CONFIG[expandedVital].unit}
                      </p>
                    </div>
                  </div>
                )}

                {/* Vitals Trend Chart */}
                {vitalTrends.length > 0 && (
                  <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Tendencia de Core Web Vitals (P75)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={vitalTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getDate()}/${date.getMonth() + 1}`;
                            }}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            formatter={(value: number, name: string) => {
                              if (name === 'CLS') return [value?.toFixed(3) || '—', name];
                              return [value ? `${value}ms` : '—', name];
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="LCP" stroke="#fbbf24" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="INP" stroke="#f59e0b" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="FCP" stroke="#6b7280" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="TTFB" stroke="#1f1f1f" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * CLS no se muestra en el gráfico debido a su escala diferente (valores típicos 0.0-0.3)
                    </p>
                  </div>
                )}

                {/* By Page Stats */}
                {vitalStats.by_page.length > 0 && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Rendimiento por Página</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-2 font-medium text-gray-600">Página</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-600">Mediciones</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-600">LCP Promedio</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-600">INP Promedio</th>
                            <th className="text-center py-3 px-2 font-medium text-gray-600">CLS Promedio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vitalStats.by_page.slice(0, 10).map((page) => (
                            <tr key={page.page_url} className="border-b border-gray-100">
                              <td className="py-3 px-2 font-mono text-xs text-gray-700 truncate max-w-xs">
                                {page.page_url}
                              </td>
                              <td className="text-center py-3 px-2 text-gray-600">
                                {page.measurement_count}
                              </td>
                              <td className="text-center py-3 px-2">
                                <span className={getVitalRatingColor('LCP', page.avg_lcp).split(' ')[0].replace('bg-', 'text-')}>
                                  {page.avg_lcp !== null ? `${page.avg_lcp}ms` : '—'}
                                </span>
                              </td>
                              <td className="text-center py-3 px-2">
                                <span className={getVitalRatingColor('INP', page.avg_inp).split(' ')[0].replace('bg-', 'text-')}>
                                  {page.avg_inp !== null ? `${page.avg_inp}ms` : '—'}
                                </span>
                              </td>
                              <td className="text-center py-3 px-2">
                                <span className={getVitalRatingColor('CLS', page.avg_cls).split(' ')[0].replace('bg-', 'text-')}>
                                  {page.avg_cls !== null ? page.avg_cls.toFixed(3) : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No hay datos de Web Vitals</p>
                <p className="text-sm text-gray-500">
                  Los datos se recopilan automáticamente de usuarios en producción.
                </p>
              </div>
            )}
          </>
        )}

        {/* Lighthouse Tab */}
        {activeTab === 'lighthouse' && (
          <>
            {/* Add Audit Button */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowAuditForm(!showAuditForm)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
              >
                <Plus className="w-4 h-4" />
                Registrar Auditoría
              </button>
            </div>

            {/* Manual Audit Form */}
            {showAuditForm && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Registrar Auditoría Manual</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                    <input
                      type="text"
                      value={auditUrl}
                      onChange={(e) => setAuditUrl(e.target.value)}
                      placeholder="https://ejemplo.com/pagina"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Performance (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={auditScores.performance}
                      onChange={(e) => setAuditScores({ ...auditScores, performance: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Accessibility (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={auditScores.accessibility}
                      onChange={(e) => setAuditScores({ ...auditScores, accessibility: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Best Practices (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={auditScores.best_practices}
                      onChange={(e) => setAuditScores({ ...auditScores, best_practices: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SEO (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={auditScores.seo}
                      onChange={(e) => setAuditScores({ ...auditScores, seo: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowAuditForm(false)}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitAudit}
                    disabled={submittingAudit}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50"
                  >
                    {submittingAudit ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar'
                    )}
                  </button>
                </div>
              </div>
            )}

            {loadingLighthouse ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : lighthouseStats && lighthouseStats.total_audits > 0 ? (
              <>
                {/* Lighthouse Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-500">Total Auditorías</p>
                    <p className="text-3xl font-bold text-brand_primary">
                      {lighthouseStats.total_audits}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Performance
                    </p>
                    <p className={`text-3xl font-bold ${getScoreColor(lighthouseStats.avg_performance)}`}>
                      {lighthouseStats.avg_performance}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      Accessibility
                    </p>
                    <p className={`text-3xl font-bold ${getScoreColor(lighthouseStats.avg_accessibility)}`}>
                      {lighthouseStats.avg_accessibility}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      Best Practices
                    </p>
                    <p className={`text-3xl font-bold ${getScoreColor(lighthouseStats.avg_best_practices)}`}>
                      {lighthouseStats.avg_best_practices}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      SEO
                    </p>
                    <p className={`text-3xl font-bold ${getScoreColor(lighthouseStats.avg_seo)}`}>
                      {lighthouseStats.avg_seo}
                    </p>
                  </div>
                </div>

                {/* Lighthouse Trend Chart */}
                {lighthouseTrends.length > 0 && (
                  <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Tendencia de Puntajes Lighthouse</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={lighthouseTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.1}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getDate()}/${date.getMonth() + 1}`;
                            }}
                          />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend
                            formatter={(value) => {
                              const labels: Record<string, string> = {
                                performance: 'Performance',
                                accessibility: 'Accessibility',
                                best_practices: 'Best Practices',
                                seo: 'SEO',
                              };
                              return labels[value] || value;
                            }}
                          />
                          <Area type="monotone" dataKey="performance" stroke="#fbbf24" fillOpacity={1} fill="url(#colorPerf)" />
                          <Line type="monotone" dataKey="accessibility" stroke="#6b7280" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="best_practices" stroke="#1f1f1f" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="seo" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Recent Results Table */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Auditorías Recientes</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-600">URL</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">Perf</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">A11y</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">BP</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">SEO</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">Fecha</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lighthouseResults.slice(0, 20).map((result) => (
                          <tr key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-2 font-mono text-xs text-gray-700 truncate max-w-xs">
                              {result.url}
                            </td>
                            <td className={`text-center py-3 px-2 font-semibold ${getScoreColor(result.performance_score)}`}>
                              {result.performance_score ?? '—'}
                            </td>
                            <td className={`text-center py-3 px-2 font-semibold ${getScoreColor(result.accessibility_score)}`}>
                              {result.accessibility_score ?? '—'}
                            </td>
                            <td className={`text-center py-3 px-2 font-semibold ${getScoreColor(result.best_practices_score)}`}>
                              {result.best_practices_score ?? '—'}
                            </td>
                            <td className={`text-center py-3 px-2 font-semibold ${getScoreColor(result.seo_score)}`}>
                              {result.seo_score ?? '—'}
                            </td>
                            <td className="text-center py-3 px-2 text-gray-500 text-xs">
                              {new Date(result.created_at).toLocaleDateString('es-CL', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="text-center py-3 px-2">
                              <button
                                onClick={() => handleDeleteResult(result.id)}
                                className="p-1 text-gray-400 hover:text-brand_gray_dark transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <Gauge className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No hay auditorías de Lighthouse</p>
                <p className="text-sm text-gray-500 mb-4">
                  Registra auditorías manualmente o configura Lighthouse CI.
                </p>
                <button
                  onClick={() => setShowAuditForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Primera Auditoría
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </QATourProvider>
    </MainLayout>
  );
};

export default QAPerformancePage;
