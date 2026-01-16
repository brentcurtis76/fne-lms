/**
 * QA Code Coverage Dashboard
 *
 * Visualizes code coverage reports and trends over time.
 * Shows overall coverage, by file/folder, and historical trends.
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
  FileCode,
  ArrowLeft,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  GitBranch,
  GitCommit,
  Folder,
  FileText,
  ChevronDown,
  ChevronUp,
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
import type { CoverageReport, CoverageTrendPoint, CoverageStats, FileCoverage } from '@/pages/api/qa/coverage';

const QACoveragePage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Data state
  const [reports, setReports] = useState<CoverageReport[]>([]);
  const [stats, setStats] = useState<CoverageStats | null>(null);
  const [trends, setTrends] = useState<CoverageTrendPoint[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [suites, setSuites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [suiteFilter, setSuiteFilter] = useState<string>('');

  // Upload form state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadData, setUploadData] = useState({
    report_name: '',
    overall_lines: '',
    overall_statements: '',
    overall_functions: '',
    overall_branches: '',
    git_commit: '',
    git_branch: '',
    test_suite: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Expanded report state
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

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

  // Fetch coverage data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({ period });
      if (branchFilter) params.append('branch', branchFilter);
      if (suiteFilter) params.append('suite', suiteFilter);

      // Fetch reports
      const reportsRes = await fetch(`/api/qa/coverage?${params}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports || []);
        setStats(data.stats || null);
        setBranches(data.branches || []);
        setSuites(data.suites || []);
      }

      // Fetch trends
      params.append('trends', 'true');
      const trendsRes = await fetch(`/api/qa/coverage?${params}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Error fetching coverage data:', error);
      toast.error('Error al cargar datos de cobertura');
    } finally {
      setLoading(false);
    }
  }, [supabase, period, branchFilter, suiteFilter]);

  // Fetch data on mount and filter change
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchData();
    }
  }, [user, hasPermission, fetchData]);

  // Submit coverage report
  const handleSubmitReport = async () => {
    if (
      !uploadData.overall_lines &&
      !uploadData.overall_statements &&
      !uploadData.overall_functions &&
      !uploadData.overall_branches
    ) {
      toast.error('Se requiere al menos una métrica de cobertura');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/coverage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          report_name: uploadData.report_name || null,
          overall_lines: uploadData.overall_lines ? parseFloat(uploadData.overall_lines) : null,
          overall_statements: uploadData.overall_statements ? parseFloat(uploadData.overall_statements) : null,
          overall_functions: uploadData.overall_functions ? parseFloat(uploadData.overall_functions) : null,
          overall_branches: uploadData.overall_branches ? parseFloat(uploadData.overall_branches) : null,
          git_commit: uploadData.git_commit || null,
          git_branch: uploadData.git_branch || null,
          test_suite: uploadData.test_suite || null,
        }),
      });

      if (response.ok) {
        toast.success('Reporte de cobertura registrado');
        setShowUploadForm(false);
        setUploadData({
          report_name: '',
          overall_lines: '',
          overall_statements: '',
          overall_functions: '',
          overall_branches: '',
          git_commit: '',
          git_branch: '',
          test_suite: '',
        });
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al registrar reporte');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Error al registrar reporte');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete report
  const handleDeleteReport = async (id: string) => {
    if (!confirm('¿Eliminar este reporte?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/coverage?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        toast.success('Reporte eliminado');
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Error al eliminar');
    }
  };

  // Get coverage color class
  const getCoverageColor = (value: number | null) => {
    if (value === null) return 'text-brand_gray_medium';
    if (value >= 80) return 'text-brand_accent';
    if (value >= 60) return 'text-brand_accent_light';
    return 'text-brand_gray_medium';
  };

  // Get coverage background class
  const getCoverageBg = (value: number | null) => {
    if (value === null) return 'bg-gray-100';
    if (value >= 80) return 'bg-brand_accent/20';
    if (value >= 60) return 'bg-brand_accent_light/30';
    return 'bg-gray-200';
  };

  // Get trend icon
  const getTrendIcon = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-brand_accent" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-brand_gray_medium" />;
      default:
        return <Minus className="w-4 h-4 text-brand_gray_medium" />;
    }
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
              Solo administradores pueden ver datos de cobertura.
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
      <QATourProvider tourId="qa-coverage">
        <ResponsiveFunctionalPageHeader
          icon={<FileCode />}
          title="Cobertura de Codigo"
          subtitle="Reportes y tendencias de cobertura de tests"
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

              {branches.length > 0 && (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                >
                  <option value="">Todas las ramas</option>
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              )}

              {suites.length > 0 && (
                <select
                  value={suiteFilter}
                  onChange={(e) => setSuiteFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                >
                  <option value="">Todos los suites</option>
                  {suites.map((suite) => (
                    <option key={suite} value={suite}>{suite}</option>
                  ))}
                </select>
              )}

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
              Registrar Reporte
            </button>
          </div>
        </div>

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Registrar Reporte de Cobertura</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del reporte</label>
                <input
                  type="text"
                  value={uploadData.report_name}
                  onChange={(e) => setUploadData({ ...uploadData, report_name: e.target.value })}
                  placeholder="Ej: CI Build #123"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Líneas (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={uploadData.overall_lines}
                  onChange={(e) => setUploadData({ ...uploadData, overall_lines: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statements (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={uploadData.overall_statements}
                  onChange={(e) => setUploadData({ ...uploadData, overall_statements: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Funciones (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={uploadData.overall_functions}
                  onChange={(e) => setUploadData({ ...uploadData, overall_functions: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branches (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={uploadData.overall_branches}
                  onChange={(e) => setUploadData({ ...uploadData, overall_branches: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Git Branch</label>
                <input
                  type="text"
                  value={uploadData.git_branch}
                  onChange={(e) => setUploadData({ ...uploadData, git_branch: e.target.value })}
                  placeholder="main"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Git Commit</label>
                <input
                  type="text"
                  value={uploadData.git_commit}
                  onChange={(e) => setUploadData({ ...uploadData, git_commit: e.target.value })}
                  placeholder="abc1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Suite</label>
                <input
                  type="text"
                  value={uploadData.test_suite}
                  onChange={(e) => setUploadData({ ...uploadData, test_suite: e.target.value })}
                  placeholder="unit, integration, e2e"
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
                onClick={handleSubmitReport}
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
        ) : stats && stats.total_reports > 0 ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6" data-tour="metrics-explanation">
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500">Total Reportes</p>
                <p className="text-3xl font-bold text-brand_primary">{stats.total_reports}</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  Líneas
                  {getTrendIcon(stats.trend_direction)}
                </p>
                <p className={`text-3xl font-bold ${getCoverageColor(stats.latest_lines)}`}>
                  {stats.latest_lines !== null ? `${stats.latest_lines}%` : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500">Statements</p>
                <p className={`text-3xl font-bold ${getCoverageColor(stats.latest_statements)}`}>
                  {stats.latest_statements !== null ? `${stats.latest_statements}%` : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500">Funciones</p>
                <p className={`text-3xl font-bold ${getCoverageColor(stats.latest_functions)}`}>
                  {stats.latest_functions !== null ? `${stats.latest_functions}%` : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4">
                <p className="text-sm text-gray-500">Branches</p>
                <p className={`text-3xl font-bold ${getCoverageColor(stats.latest_branches)}`}>
                  {stats.latest_branches !== null ? `${stats.latest_branches}%` : '—'}
                </p>
              </div>
            </div>

            {/* Trend Chart */}
            {trends.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Tendencia de Cobertura</h3>
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
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value}%`, '']} />
                      <Legend
                        formatter={(value) => {
                          const labels: Record<string, string> = {
                            lines: 'Líneas',
                            statements: 'Statements',
                            functions: 'Funciones',
                            branches: 'Branches',
                          };
                          return labels[value] || value;
                        }}
                      />
                      <Line type="monotone" dataKey="lines" stroke="#fbbf24" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="statements" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="functions" stroke="#6b7280" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="branches" stroke="#1f1f1f" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By Suite Stats */}
            {stats.by_suite.length > 1 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4">Cobertura por Suite</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.by_suite} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="test_suite" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value}%`, 'Cobertura promedio']} />
                      <Bar dataKey="avg_lines" name="Cobertura">
                        {stats.by_suite.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.avg_lines >= 80 ? '#fbbf24' : entry.avg_lines >= 60 ? '#fcd34d' : '#6b7280'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Recent Reports Table */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Reportes Recientes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Reporte</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Líneas</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Stmts</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Funcs</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Branches</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Branch/Commit</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600">Fecha</th>
                      <th className="text-center py-3 px-2 font-medium text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.slice(0, 20).map((report) => (
                      <React.Fragment key={report.id}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)}
                        >
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              {expandedReportId === report.id ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="font-medium text-gray-900">
                                {report.report_name || report.test_suite || 'Reporte'}
                              </span>
                            </div>
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getCoverageColor(report.overall_lines)}`}>
                            {report.overall_lines !== null ? `${report.overall_lines}%` : '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getCoverageColor(report.overall_statements)}`}>
                            {report.overall_statements !== null ? `${report.overall_statements}%` : '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getCoverageColor(report.overall_functions)}`}>
                            {report.overall_functions !== null ? `${report.overall_functions}%` : '—'}
                          </td>
                          <td className={`text-center py-3 px-2 font-semibold ${getCoverageColor(report.overall_branches)}`}>
                            {report.overall_branches !== null ? `${report.overall_branches}%` : '—'}
                          </td>
                          <td className="text-center py-3 px-2">
                            {report.git_branch && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                <GitBranch className="w-3 h-3" />
                                {report.git_branch}
                              </span>
                            )}
                            {report.git_commit && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500 ml-2 font-mono">
                                <GitCommit className="w-3 h-3" />
                                {report.git_commit.substring(0, 7)}
                              </span>
                            )}
                          </td>
                          <td className="text-center py-3 px-2 text-gray-500 text-xs">
                            {new Date(report.created_at).toLocaleDateString('es-CL', {
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
                                handleDeleteReport(report.id);
                              }}
                              className="p-1 text-gray-400 hover:text-brand_gray_dark transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {expandedReportId === report.id && report.file_coverage && (
                          <tr>
                            <td colSpan={8} className="bg-gray-50 px-4 py-3">
                              <p className="text-sm font-medium text-gray-700 mb-2">Cobertura por archivo:</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                {(report.file_coverage as FileCoverage[]).map((file, index) => (
                                  <div key={index} className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm">
                                    <span className="font-mono text-xs text-gray-600 truncate flex-1">
                                      {file.path}
                                    </span>
                                    <span className={`ml-2 font-semibold ${getCoverageColor(file.lines)}`}>
                                      {file.lines}%
                                    </span>
                                  </div>
                                ))}
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
            <FileCode className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">No hay reportes de cobertura</p>
            <p className="text-sm text-gray-500 mb-4">
              Registra un reporte manualmente o configura Istanbul/NYC en tu CI.
            </p>
            <button
              onClick={() => setShowUploadForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Primer Reporte
            </button>
          </div>
        )}
        </div>
      </QATourProvider>
    </MainLayout>
  );
};

export default QACoveragePage;
