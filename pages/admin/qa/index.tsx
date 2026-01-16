/**
 * QA Admin Dashboard
 *
 * Overview of QA testing activity for administrators.
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ClipboardList,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Plus,
  Eye,
  Upload,
  Users,
  FlaskConical,
  UserMinus,
  Loader2,
  Shield,
  CheckSquare,
  TrendingUp,
  FileCode,
  Zap,
} from 'lucide-react';
import QATourProvider from '@/components/qa/QATourProvider';
import type { QATestRun, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';
import type { FeatureCoverageStats } from '@/pages/api/qa/feature-checklist';
import type { TrendDataPoint, TesterProductivity } from '@/pages/api/qa/trends';

interface DashboardStats {
  totalScenarios: number;
  activeScenarios: number;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  partialRuns: number;
  inProgressRuns: number;
}

interface FeatureAreaStats {
  feature_area: FeatureArea;
  total: number;
  passed: number;
  failed: number;
}

interface QATester {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  can_run_qa_tests: boolean;
}

interface TesterAssignmentStats {
  tester_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  total_assigned: number;
  completed: number;
  pending: number;
  in_progress: number;
}

const QAAdminDashboard: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [stats, setStats] = useState<DashboardStats>({
    totalScenarios: 0,
    activeScenarios: 0,
    totalRuns: 0,
    passedRuns: 0,
    failedRuns: 0,
    partialRuns: 0,
    inProgressRuns: 0,
  });
  const [recentRuns, setRecentRuns] = useState<QATestRun[]>([]);
  const [featureStats, setFeatureStats] = useState<FeatureAreaStats[]>([]);
  const [qaTesters, setQATesters] = useState<QATester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [togglingTester, setTogglingTester] = useState<string | null>(null);
  const [assignmentStats, setAssignmentStats] = useState<TesterAssignmentStats[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Coverage stats
  const [coverageStats, setCoverageStats] = useState<FeatureCoverageStats | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);

  // Trends
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [testerProductivity, setTesterProductivity] = useState<TesterProductivity[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

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

      // Get avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Check permissions (admin only)
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

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!user || hasPermission === false) return;

    setLoading(true);
    try {
      // Fetch scenario counts
      const { count: totalScenarios } = await supabase
        .from('qa_scenarios')
        .select('*', { count: 'exact', head: true });

      const { count: activeScenarios } = await supabase
        .from('qa_scenarios')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Fetch test run counts
      const { data: runCounts } = await supabase
        .from('qa_test_runs')
        .select('overall_result, status');

      const passedRuns = runCounts?.filter((r) => r.overall_result === 'pass').length || 0;
      const failedRuns = runCounts?.filter((r) => r.overall_result === 'fail').length || 0;
      const partialRuns = runCounts?.filter((r) => r.overall_result === 'partial').length || 0;
      const inProgressRuns = runCounts?.filter((r) => r.status === 'in_progress').length || 0;

      setStats({
        totalScenarios: totalScenarios || 0,
        activeScenarios: activeScenarios || 0,
        totalRuns: runCounts?.length || 0,
        passedRuns,
        failedRuns,
        partialRuns,
        inProgressRuns,
      });

      // Fetch recent runs
      const { data: runs } = await supabase
        .from('qa_test_runs')
        .select(
          `
          *,
          scenario:qa_scenarios(id, name, feature_area),
          tester:profiles(email, first_name, last_name)
        `
        )
        .order('started_at', { ascending: false })
        .limit(10);

      setRecentRuns(runs || []);

      // Calculate feature area stats
      const { data: allRuns } = await supabase
        .from('qa_test_runs')
        .select(
          `
          overall_result,
          scenario:qa_scenarios(feature_area)
        `
        )
        .eq('status', 'completed');

      const featureMap = new Map<FeatureArea, { total: number; passed: number; failed: number }>();
      allRuns?.forEach((run: any) => {
        const area = run.scenario?.feature_area as FeatureArea;
        if (!area) return;

        const current = featureMap.get(area) || { total: 0, passed: 0, failed: 0 };
        current.total++;
        if (run.overall_result === 'pass') current.passed++;
        if (run.overall_result === 'fail') current.failed++;
        featureMap.set(area, current);
      });

      const featureStatsArray: FeatureAreaStats[] = Array.from(featureMap.entries())
        .map(([area, stats]) => ({
          feature_area: area,
          ...stats,
        }))
        .sort((a, b) => b.total - a.total);

      setFeatureStats(featureStatsArray);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Error al cargar datos del panel');
    } finally {
      setLoading(false);
    }
  }, [user, hasPermission, supabase]);

  // Fetch coverage stats
  const fetchCoverageStats = async () => {
    setLoadingCoverage(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/feature-checklist?stats_only=true', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCoverageStats(data.stats || null);
      }
    } catch (error) {
      console.error('Error fetching coverage stats:', error);
    } finally {
      setLoadingCoverage(false);
    }
  };

  // Fetch trends
  const fetchTrends = async (period: string = trendPeriod) => {
    setLoadingTrends(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/trends?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTrendData(data.trends || []);
        setTesterProductivity(data.productivity || []);
      }
    } catch (error) {
      console.error('Error fetching trends:', error);
    } finally {
      setLoadingTrends(false);
    }
  };

  useEffect(() => {
    if (user && hasPermission === true) {
      fetchDashboardData();
      fetchQATesters();
      fetchAssignmentStats();
      fetchCoverageStats();
      fetchTrends();
    }
  }, [user, hasPermission, fetchDashboardData]);

  // Refetch trends when period changes
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchTrends(trendPeriod);
    }
  }, [trendPeriod]);

  // Fetch assignment stats per tester
  const fetchAssignmentStats = async () => {
    setLoadingAssignments(true);
    try {
      // Get all assignments with tester info
      const { data: assignments, error } = await supabase
        .from('qa_scenario_assignments')
        .select(`
          tester_id,
          status,
          tester:profiles(email, first_name, last_name)
        `);

      if (error) {
        // Differentiate between "table doesn't exist" and other errors
        const isTableNotFound = error.code === '42P01' || error.message?.includes('relation') && error.message?.includes('does not exist');
        if (!isTableNotFound) {
          console.error('Error fetching assignments:', error);
        }
        // Show empty list for any error (including table not existing)
        setAssignmentStats([]);
        return;
      }

      // Group by tester
      const statsMap = new Map<string, TesterAssignmentStats>();

      assignments?.forEach((a: any) => {
        const testerId = a.tester_id;
        if (!statsMap.has(testerId)) {
          statsMap.set(testerId, {
            tester_id: testerId,
            email: a.tester?.email || 'Unknown',
            first_name: a.tester?.first_name,
            last_name: a.tester?.last_name,
            total_assigned: 0,
            completed: 0,
            pending: 0,
            in_progress: 0,
          });
        }

        const stat = statsMap.get(testerId)!;
        stat.total_assigned++;
        if (a.status === 'completed') stat.completed++;
        else if (a.status === 'pending') stat.pending++;
        else if (a.status === 'in_progress') stat.in_progress++;
      });

      setAssignmentStats(Array.from(statsMap.values()).sort((a, b) => b.total_assigned - a.total_assigned));
    } catch (error) {
      console.error('Error fetching assignment stats:', error);
      setAssignmentStats([]);
    } finally {
      setLoadingAssignments(false);
    }
  };

  // Fetch QA testers
  const fetchQATesters = async () => {
    setLoadingTesters(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/update-qa-tester-status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setQATesters(data.testers || []);
      }
    } catch (error) {
      console.error('Error fetching QA testers:', error);
    } finally {
      setLoadingTesters(false);
    }
  };

  // Toggle QA tester status
  const handleToggleTester = async (userId: string, currentStatus: boolean) => {
    setTogglingTester(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/update-qa-tester-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId,
          canRunQATests: !currentStatus
        })
      });

      if (response.ok) {
        toast.success(!currentStatus ? 'Tester habilitado' : 'Tester deshabilitado');
        fetchQATesters();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al actualizar');
      }
    } catch (error) {
      console.error('Error toggling tester:', error);
      toast.error('Error al actualizar estado');
    } finally {
      setTogglingTester(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Get result icon - using brand colors
  const getResultIcon = (result: 'pass' | 'fail' | 'partial' | null, status: string) => {
    if (status === 'in_progress') {
      return <Clock className="w-4 h-4 text-brand_accent" />;
    }
    switch (result) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-brand_accent" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-brand_gray_medium" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-brand_accent_light" />;
      default:
        return <Clock className="w-4 h-4 text-brand_gray_medium" />;
    }
  };

  // Loading state
  if (loading && hasPermission === null) {
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
              Solo administradores pueden acceder al panel de QA.
            </p>
            <Link
              href="/qa"
              className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors"
            >
              Ir a Pruebas de QA
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
      <QATourProvider tourId="qa-dashboard">
        <ResponsiveFunctionalPageHeader
          icon={<BarChart3 />}
          title="Panel de QA"
          subtitle="Administracion de pruebas y escenarios"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3 mb-6" data-tour="scenario-buttons">
          <Link
            href="/admin/qa/scenarios"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Gestionar Escenarios
          </Link>
          <Link
            href="/admin/qa/assignments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-lg text-sm font-medium hover:bg-brand_accent_hover transition-colors"
          >
            <Users className="w-4 h-4" />
            Gestionar Asignaciones
          </Link>
          <Link
            href="/admin/qa/feature-checklist"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-brand_primary text-brand_primary rounded-lg text-sm font-medium hover:bg-brand_primary/5 transition-colors"
          >
            <CheckSquare className="w-4 h-4" />
            Checklist de Cobertura
          </Link>
          <Link
            href="/admin/qa/lighthouse"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-brand_accent text-brand_primary rounded-lg text-sm font-medium hover:bg-brand_accent/10 transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            Rendimiento
          </Link>
          <span data-tour="additional-tools" className="contents">
            <Link
              href="/admin/qa/coverage"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <FileCode className="w-4 h-4" />
              Cobertura de Codigo
            </Link>
            <Link
              href="/admin/qa/load-tests"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Pruebas de Carga
            </Link>
          </span>
          <Link
            href="/admin/qa/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importar Escenarios
          </Link>
          <Link
            href="/qa"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Ver como Tester
          </Link>
        </div>

        {/* Stats Cards - including coverage */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8" data-tour="metrics-cards">
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-500">Escenarios Activos</p>
            <p className="text-3xl font-bold text-brand_primary">
              {stats.activeScenarios}
            </p>
            <p className="text-xs text-gray-400">
              de {stats.totalScenarios} totales
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-500">Ejecuciones Totales</p>
            <p className="text-3xl font-bold text-gray-900">{stats.totalRuns}</p>
            <p className="text-xs text-gray-400">
              {stats.inProgressRuns} en progreso
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-500">Tasa de Éxito</p>
            <p className="text-3xl font-bold text-brand_accent">
              {stats.totalRuns > 0
                ? Math.round(
                    (stats.passedRuns /
                      (stats.passedRuns + stats.failedRuns + stats.partialRuns)) *
                      100
                  )
                : 0}
              %
            </p>
            <p className="text-xs text-gray-400">
              {stats.passedRuns} pasadas, {stats.failedRuns} fallidas
            </p>
          </div>
          <Link
            href="/admin/qa/feature-checklist"
            className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
          >
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Cobertura de Features
            </p>
            {loadingCoverage ? (
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 mt-2" />
            ) : coverageStats ? (
              <>
                <p className={`text-3xl font-bold ${
                  coverageStats.coverage_percentage >= 80 ? 'text-brand_accent' :
                  coverageStats.coverage_percentage >= 50 ? 'text-brand_accent_light' : 'text-brand_gray_medium'
                }`}>
                  {coverageStats.coverage_percentage}%
                </p>
                <p className="text-xs text-gray-400">
                  {coverageStats.covered_features}/{coverageStats.total_features} cubiertas
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Sin datos</p>
            )}
          </Link>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-sm text-gray-500">Fallidas Recientes</p>
            <p className="text-3xl font-bold text-brand_gray_medium">{stats.failedRuns}</p>
            <p className="text-xs text-gray-400">
              requieren atención
            </p>
          </div>
        </div>

        {/* Trends Chart */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6" data-tour="trends-chart">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand_primary" />
              <h2 className="text-lg font-semibold text-gray-900">
                Tendencias de Pruebas
              </h2>
            </div>
            <div className="flex gap-2">
              {(['week', 'month', 'all'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTrendPeriod(period)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    trendPeriod === period
                      ? 'bg-brand_primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period === 'week' ? '7 días' : period === 'month' ? '30 días' : 'Todo'}
                </button>
              ))}
            </div>
          </div>

          {loadingTrends ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : trendData.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay datos de pruebas en este periodo</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPassed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6b7280" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6b7280" stopOpacity={0.1}/>
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
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString('es-CL')}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'passed' ? 'Pasadas' : name === 'failed' ? 'Fallidas' : 'Parciales'
                    ]}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'passed' ? 'Pasadas' : value === 'failed' ? 'Fallidas' : 'Parciales'
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="passed"
                    stroke="#fbbf24"
                    fillOpacity={1}
                    fill="url(#colorPassed)"
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#6b7280"
                    fillOpacity={1}
                    fill="url(#colorFailed)"
                    stackId="1"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Tester Productivity */}
        {testerProductivity.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Productividad de Testers ({trendPeriod === 'week' ? 'últimos 7 días' : trendPeriod === 'month' ? 'últimos 30 días' : 'todo el tiempo'})
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {testerProductivity.slice(0, 6).map((tester) => (
                <div key={tester.tester_id} className="border border-gray-200 rounded-lg p-4">
                  <p className="font-medium text-gray-900 truncate">{tester.tester_name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-brand_primary">
                      {tester.tests_completed}
                    </span>
                    <span className={`text-sm px-2 py-0.5 rounded-full ${
                      tester.pass_rate >= 80 ? 'bg-brand_accent/20 text-brand_primary' :
                      tester.pass_rate >= 50 ? 'bg-brand_accent_light/30 text-brand_primary' :
                      'bg-brand_gray_medium/20 text-brand_gray_dark'
                    }`}>
                      {tester.pass_rate}% éxito
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">pruebas completadas</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Runs */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Ejecuciones Recientes
            </h2>
            {recentRuns.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No hay ejecuciones registradas todavía.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentRuns.slice(0, 5).map((run: any) => (
                  <li key={run.id}>
                    <Link
                      href={`/admin/qa/runs/${run.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {getResultIcon(run.overall_result, run.status)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {run.scenario?.name || 'Escenario eliminado'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {run.tester?.first_name} {run.tester?.last_name}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(run.started_at).toLocaleDateString('es-CL')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {recentRuns.length > 5 && (
              <Link
                href="/admin/qa/runs"
                className="block text-center text-sm text-brand_primary hover:underline mt-4"
              >
                Ver todas las ejecuciones →
              </Link>
            )}
          </div>

          {/* Feature Area Stats */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Por Área Funcional
            </h2>
            {featureStats.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No hay datos de pruebas por área todavía.
              </p>
            ) : (
              <ul className="space-y-3">
                {featureStats.map((stat) => {
                  const passRate =
                    stat.total > 0
                      ? Math.round((stat.passed / stat.total) * 100)
                      : 0;

                  return (
                    <li key={stat.feature_area} className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          {FEATURE_AREA_LABELS[stat.feature_area] || stat.feature_area}
                        </span>
                        <span className="text-xs text-gray-500">
                          {stat.total} pruebas
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            passRate >= 80
                              ? 'bg-brand_accent'
                              : passRate >= 50
                                ? 'bg-brand_accent_light'
                                : 'bg-brand_gray_medium'
                          }`}
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{stat.passed} pasadas</span>
                        <span>{passRate}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* QA Testers Section */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-brand_accent" />
              <h2 className="text-lg font-semibold text-gray-900">
                Testers QA Habilitados
              </h2>
            </div>
            <Link
              href="/admin/user-management"
              className="text-sm text-brand_primary hover:underline"
            >
              Gestionar en Usuarios →
            </Link>
          </div>

          {loadingTesters ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : qaTesters.length === 0 ? (
            <div className="text-center py-8">
              <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-4">
                No hay testers QA habilitados todavía.
              </p>
              <Link
                href="/admin/user-management"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar Tester
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {qaTesters.map((tester) => (
                <div
                  key={tester.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand_accent/20 flex items-center justify-center">
                      <FlaskConical className="w-4 h-4 text-brand_accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {tester.first_name && tester.last_name
                          ? `${tester.first_name} ${tester.last_name}`
                          : tester.email}
                      </p>
                      {tester.first_name && tester.last_name && (
                        <p className="text-xs text-gray-500">{tester.email}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleTester(tester.id, true)}
                    disabled={togglingTester === tester.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand_gray_dark bg-brand_gray_medium/10 hover:bg-brand_gray_medium/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Quitar acceso de tester"
                  >
                    {togglingTester === tester.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserMinus className="w-3 h-3" />
                    )}
                    Quitar
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400 mt-3 pt-3 border-t">
                Los administradores siempre tienen acceso a QA, no necesitan habilitación.
              </p>
            </div>
          )}
        </div>

        {/* Assignment Stats Section */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-brand_primary" />
            <h2 className="text-lg font-semibold text-gray-900">
              Estado de Asignaciones por Tester
            </h2>
          </div>

          {loadingAssignments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : assignmentStats.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-2">
                No hay asignaciones de escenarios todavía.
              </p>
              <p className="text-xs text-gray-400">
                Las asignaciones se crean automáticamente al generar escenarios con un rol seleccionado.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignmentStats.map((stat) => (
                <div key={stat.tester_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {stat.first_name && stat.last_name
                          ? `${stat.first_name} ${stat.last_name}`
                          : stat.email}
                      </p>
                      {stat.first_name && stat.last_name && (
                        <p className="text-xs text-gray-500">{stat.email}</p>
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {stat.total_assigned} asignado{stat.total_assigned !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div
                      className="bg-brand_accent h-2.5 rounded-full transition-all"
                      style={{
                        width: stat.total_assigned > 0
                          ? `${(stat.completed / stat.total_assigned) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>

                  {/* Stats breakdown */}
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-brand_accent_hover">
                      <CheckCircle2 className="w-3 h-3" />
                      {stat.completed} completado{stat.completed !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-brand_accent">
                      <Clock className="w-3 h-3" />
                      {stat.in_progress} en progreso
                    </span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <AlertCircle className="w-3 h-3" />
                      {stat.pending} pendiente{stat.pending !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </QATourProvider>
    </MainLayout>
  );
};

export default QAAdminDashboard;
