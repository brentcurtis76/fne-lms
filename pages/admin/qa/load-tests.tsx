/**
 * QA Load Test Results Dashboard
 *
 * Visualizes load testing results from k6/Artillery runs.
 * Shows key metrics, trends, and historical data.
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
  Zap,
  ArrowLeft,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Server,
  ChevronDown,
  ChevronRight,
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
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import type { LoadTestResult, LoadTestTrendPoint, LoadTestStats } from '@/pages/api/qa/load-tests';

const QALoadTestsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Data state
  const [results, setResults] = useState<LoadTestResult[]>([]);
  const [stats, setStats] = useState<LoadTestStats | null>(null);
  const [trends, setTrends] = useState<LoadTestTrendPoint[]>([]);
  const [testNames, setTestNames] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [testNameFilter, setTestNameFilter] = useState<string>('');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Upload form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadData, setUploadData] = useState({
    test_name: '',
    test_script: '',
    description: '',
    duration_seconds: '',
    virtual_users: '',
    requests_total: '',
    requests_per_second: '',
    response_time_avg: '',
    response_time_p50: '',
    response_time_p95: '',
    response_time_p99: '',
    error_rate: '',
    errors_total: '',
    target_url: '',
    environment: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Expanded result state
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

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

  // Fetch load test data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({ period });
      if (testNameFilter) params.append('test_name', testNameFilter);
      if (environmentFilter) params.append('environment', environmentFilter);
      if (statusFilter) params.append('status', statusFilter);

      // Fetch results
      const resultsRes = await fetch(`/api/qa/load-tests?${params}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (resultsRes.ok) {
        const data = await resultsRes.json();
        setResults(data.results || []);
        setStats(data.stats || null);
        setTestNames(data.testNames || []);
        setEnvironments(data.environments || []);
      }

      // Fetch trends
      params.append('trends', 'true');
      const trendsRes = await fetch(`/api/qa/load-tests?${params}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Error fetching load test data:', error);
      toast.error('Error al cargar datos de pruebas de carga');
    } finally {
      setLoading(false);
    }
  }, [supabase, period, testNameFilter, environmentFilter, statusFilter]);

  // Fetch data on mount and filter change
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchData();
    }
  }, [user, hasPermission, fetchData]);

  // Submit load test result
  const handleSubmitResult = async () => {
    if (!uploadData.test_name) {
      toast.error('Nombre de prueba es requerido');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/load-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          test_name: uploadData.test_name,
          test_script: uploadData.test_script || null,
          description: uploadData.description || null,
          duration_seconds: uploadData.duration_seconds ? parseInt(uploadData.duration_seconds, 10) : null,
          virtual_users: uploadData.virtual_users ? parseInt(uploadData.virtual_users, 10) : null,
          requests_total: uploadData.requests_total ? parseInt(uploadData.requests_total, 10) : null,
          requests_per_second: uploadData.requests_per_second ? parseFloat(uploadData.requests_per_second) : null,
          response_time_avg: uploadData.response_time_avg ? parseFloat(uploadData.response_time_avg) : null,
          response_time_p50: uploadData.response_time_p50 ? parseFloat(uploadData.response_time_p50) : null,
          response_time_p95: uploadData.response_time_p95 ? parseFloat(uploadData.response_time_p95) : null,
          response_time_p99: uploadData.response_time_p99 ? parseFloat(uploadData.response_time_p99) : null,
          error_rate: uploadData.error_rate ? parseFloat(uploadData.error_rate) : null,
          errors_total: uploadData.errors_total ? parseInt(uploadData.errors_total, 10) : null,
          target_url: uploadData.target_url || null,
          environment: uploadData.environment || null,
        }),
      });

      if (response.ok) {
        toast.success('Resultado de prueba registrado');
        setShowUploadForm(false);
        setUploadData({
          test_name: '',
          test_script: '',
          description: '',
          duration_seconds: '',
          virtual_users: '',
          requests_total: '',
          requests_per_second: '',
          response_time_avg: '',
          response_time_p50: '',
          response_time_p95: '',
          response_time_p99: '',
          error_rate: '',
          errors_total: '',
          target_url: '',
          environment: '',
        });
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al registrar resultado');
      }
    } catch (error) {
      console.error('Error submitting result:', error);
      toast.error('Error al registrar resultado');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete result
  const handleDeleteResult = async (id: string) => {
    if (!confirm('¿Eliminar este resultado?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/load-tests?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        toast.success('Resultado eliminado');
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error deleting result:', error);
      toast.error('Error al eliminar');
    }
  };

  // Get status icon
  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="w-4 h-4 text-brand_accent" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-brand_gray_medium" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-brand_accent_light" />;
      default:
        return <Clock className="w-4 h-4 text-brand_gray_medium" />;
    }
  };

  // Get status badge class
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'passed':
        return 'bg-brand_accent/20 text-brand_primary';
      case 'failed':
        return 'bg-gray-200 text-brand_gray_dark';
      case 'warning':
        return 'bg-brand_accent_light/30 text-brand_primary';
      default:
        return 'bg-gray-100 text-brand_gray_medium';
    }
  };

  // Get response time color
  const getResponseTimeColor = (value: number | null) => {
    if (value === null) return 'text-brand_gray_medium';
    if (value <= 200) return 'text-brand_accent';
    if (value <= 500) return 'text-brand_accent_light';
    return 'text-brand_gray_medium';
  };

  // Get error rate color
  const getErrorRateColor = (value: number | null) => {
    if (value === null) return 'text-brand_gray_medium';
    if (value <= 1) return 'text-brand_accent';
    if (value <= 5) return 'text-brand_accent_light';
    return 'text-brand_gray_medium';
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
              Solo administradores pueden ver pruebas de carga.
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
      <QATourProvider tourId="qa-load-tests">
        <ResponsiveFunctionalPageHeader
          icon={<Zap />}
          title="Pruebas de Carga"
          subtitle="Resultados de k6/Artillery"
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

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as 'week' | 'month' | 'all')}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
              >
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
                <option value="all">Todo</option>
              </select>

              {testNames.length > 0 && (
                <select
                  value={testNameFilter}
                  onChange={(e) => setTestNameFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                >
                  <option value="">Todas las pruebas</option>
                  {testNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}

              {environments.length > 0 && (
                <select
                  value={environmentFilter}
                  onChange={(e) => setEnvironmentFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                >
                  <option value="">Todos los entornos</option>
                  {environments.map((env) => (
                    <option key={env} value={env}>{env}</option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
              >
                <option value="">Todos los estados</option>
                <option value="passed">Pasadas</option>
                <option value="warning">Advertencia</option>
                <option value="failed">Fallidas</option>
              </select>

              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 text-gray-500 hover:text-brand_primary transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <button
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
              data-tour="register-button"
            >
              <Plus className="w-4 h-4" />
              Registrar Resultado
            </button>
          </div>
        </div>

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Registrar Resultado de Prueba de Carga</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Prueba *</label>
                <input
                  type="text"
                  value={uploadData.test_name}
                  onChange={(e) => setUploadData({ ...uploadData, test_name: e.target.value })}
                  placeholder="Ej: API Stress Test"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entorno</label>
                <input
                  type="text"
                  value={uploadData.environment}
                  onChange={(e) => setUploadData({ ...uploadData, environment: e.target.value })}
                  placeholder="staging, production"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duración (segundos)</label>
                <input
                  type="number"
                  min="0"
                  value={uploadData.duration_seconds}
                  onChange={(e) => setUploadData({ ...uploadData, duration_seconds: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Virtual Users</label>
                <input
                  type="number"
                  min="0"
                  value={uploadData.virtual_users}
                  onChange={(e) => setUploadData({ ...uploadData, virtual_users: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requests/sec</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={uploadData.requests_per_second}
                  onChange={(e) => setUploadData({ ...uploadData, requests_per_second: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">P50 (ms)</label>
                <input
                  type="number"
                  min="0"
                  value={uploadData.response_time_p50}
                  onChange={(e) => setUploadData({ ...uploadData, response_time_p50: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">P95 (ms)</label>
                <input
                  type="number"
                  min="0"
                  value={uploadData.response_time_p95}
                  onChange={(e) => setUploadData({ ...uploadData, response_time_p95: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">P99 (ms)</label>
                <input
                  type="number"
                  min="0"
                  value={uploadData.response_time_p99}
                  onChange={(e) => setUploadData({ ...uploadData, response_time_p99: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Error Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={uploadData.error_rate}
                  onChange={(e) => setUploadData({ ...uploadData, error_rate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
                <input
                  type="text"
                  value={uploadData.target_url}
                  onChange={(e) => setUploadData({ ...uploadData, target_url: e.target.value })}
                  placeholder="https://api.ejemplo.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowUploadForm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitResult}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50"
              >
                {submitting ? (
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : stats && stats.total_tests > 0 ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6" data-tour="key-metrics">
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500">Total Pruebas</p>
                <p className="text-3xl font-bold text-brand_primary">{stats.total_tests}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-brand_accent">{stats.passed_tests} ✓</span>
                  <span className="text-brand_accent_light">{stats.warning_tests} !</span>
                  <span className="text-brand_gray_medium">{stats.failed_tests} ✗</span>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  P95 Promedio
                </p>
                <p className={`text-3xl font-bold ${getResponseTimeColor(stats.avg_response_time_p95)}`}>
                  {stats.avg_response_time_p95}
                  <span className="text-sm font-normal text-gray-500">ms</span>
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Error Rate
                </p>
                <p className={`text-3xl font-bold ${getErrorRateColor(stats.avg_error_rate)}`}>
                  {stats.avg_error_rate}
                  <span className="text-sm font-normal text-gray-500">%</span>
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Tasa de Éxito
                </p>
                <p className="text-3xl font-bold text-brand_accent">
                  {stats.total_tests > 0
                    ? Math.round((stats.passed_tests / stats.total_tests) * 100)
                    : 0}
                  <span className="text-sm font-normal text-gray-500">%</span>
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Escenarios
                </p>
                <p className="text-3xl font-bold text-brand_primary">{stats.by_test_name.length}</p>
              </div>
            </div>

            {/* Trend Chart */}
            {trends.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Tendencia de Rendimiento</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getDate()}/${date.getMonth() + 1}`;
                        }}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'error_rate') return [`${value}%`, 'Error Rate'];
                          if (name === 'requests_per_second') return [`${value} rps`, 'Requests/sec'];
                          return [`${value}ms`, name === 'response_time_p95' ? 'P95' : 'P99'];
                        }}
                      />
                      <Legend
                        formatter={(value) => {
                          const labels: Record<string, string> = {
                            response_time_p95: 'P95',
                            response_time_p99: 'P99',
                            error_rate: 'Error Rate',
                            requests_per_second: 'Requests/sec',
                          };
                          return labels[value] || value;
                        }}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="response_time_p95" stroke="#fbbf24" strokeWidth={2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="response_time_p99" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="error_rate" stroke="#6b7280" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By Test Name */}
            {stats.by_test_name.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Estado por Escenario</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stats.by_test_name.map((test) => (
                    <div key={test.test_name} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(test.latest_status)}
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {test.test_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{test.count} runs</span>
                        {test.latest_p95 !== null && (
                          <span className={`text-xs font-semibold ${getResponseTimeColor(test.latest_p95)}`}>
                            {test.latest_p95}ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Results Table */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Resultados Recientes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Prueba</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Estado</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">VUs</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">P95</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">P99</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Error %</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">RPS</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Fecha</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 20).map((result) => (
                      <React.Fragment key={result.id}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedResultId(expandedResultId === result.id ? null : result.id)}
                        >
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              {expandedResultId === result.id ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="font-medium text-gray-900">
                                {result.test_name}
                              </span>
                              {result.environment && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                  {result.environment}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getStatusBadge(result.status)}`}>
                              {getStatusIcon(result.status)}
                              {result.status === 'passed' ? 'OK' : result.status === 'warning' ? 'Warn' : result.status === 'failed' ? 'Fail' : '—'}
                            </span>
                          </td>
                          <td className="text-center py-3 px-2 text-gray-600">
                            {result.virtual_users ?? '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getResponseTimeColor(result.response_time_p95)}`}>
                            {result.response_time_p95 !== null ? `${result.response_time_p95}ms` : '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getResponseTimeColor(result.response_time_p99)}`}>
                            {result.response_time_p99 !== null ? `${result.response_time_p99}ms` : '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getErrorRateColor(result.error_rate)}`}>
                            {result.error_rate !== null ? `${result.error_rate}%` : '—'}
                          </td>
                          <td className="text-center py-3 px-2 text-gray-600">
                            {result.requests_per_second !== null ? result.requests_per_second.toFixed(1) : '—'}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteResult(result.id);
                              }}
                              className="p-1 text-gray-400 hover:text-brand_gray_dark transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {expandedResultId === result.id && (
                          <tr>
                            <td colSpan={9} className="bg-gray-50 px-4 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-500">Duración</p>
                                  <p className="font-medium">{result.duration_seconds ? `${result.duration_seconds}s` : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Total Requests</p>
                                  <p className="font-medium">{result.requests_total?.toLocaleString() ?? '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Total Errores</p>
                                  <p className="font-medium">{result.errors_total?.toLocaleString() ?? '—'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Avg Response</p>
                                  <p className="font-medium">{result.response_time_avg ? `${result.response_time_avg}ms` : '—'}</p>
                                </div>
                                {result.target_url && (
                                  <div className="md:col-span-4">
                                    <p className="text-gray-500">Target URL</p>
                                    <p className="font-mono text-xs">{result.target_url}</p>
                                  </div>
                                )}
                                {result.description && (
                                  <div className="md:col-span-4">
                                    <p className="text-gray-500">Descripción</p>
                                    <p>{result.description}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">No hay resultados de pruebas de carga</p>
            <p className="text-sm text-gray-500 mb-4">
              Registra un resultado manualmente o configura k6/Artillery en tu CI.
            </p>
            <button
              onClick={() => setShowUploadForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Primer Resultado
            </button>
          </div>
        )}
        </div>
      </QATourProvider>
    </MainLayout>
  );
};

export default QALoadTestsPage;
