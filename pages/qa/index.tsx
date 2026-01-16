/**
 * QA Scenario List Page
 *
 * Lists available QA test scenarios for testers to run.
 * Filters by feature area and role.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardCheck,
  Play,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Filter,
  FlaskConical,
  UserCheck,
  Calendar,
} from 'lucide-react';
import type { QAScenario, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types/qa';

interface LastRunInfo {
  scenario_id: string;
  overall_result: 'pass' | 'fail' | 'partial' | null;
  completed_at: string | null;
}

interface AssignedScenario extends QAScenario {
  assignment_id: string;
  assignment_status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  due_date: string | null;
  assigned_at: string;
}

const QAScenarioListPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [scenarios, setScenarios] = useState<QAScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [featureAreaFilter, setFeatureAreaFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [lastRuns, setLastRuns] = useState<Map<string, LastRunInfo>>(new Map());
  const [isAdmin, setIsAdmin] = useState(false);
  const [canRunQATests, setCanRunQATests] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [automatedCount, setAutomatedCount] = useState(0);
  const [assignedScenarios, setAssignedScenarios] = useState<AssignedScenario[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(true);

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

      // Get avatar (and QA permission if column exists)
      // Note: can_run_qa_tests column may not exist yet - handle gracefully
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Get QA permission flag from profile
      let canRunQA = false;
      const { data: qaData, error: qaError } = await supabase
        .from('profiles')
        .select('can_run_qa_tests')
        .eq('id', session.user.id)
        .single();

      if (qaError) {
        console.error('[QA] Error fetching can_run_qa_tests:', qaError.message);
        // Column might not exist - admins will still have access via role check
      } else {
        canRunQA = qaData?.can_run_qa_tests === true;
        console.log('[QA] can_run_qa_tests value:', qaData?.can_run_qa_tests, '-> canRunQA:', canRunQA);
      }

      // Get user roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const roleTypes = roles?.map((r) => r.role_type) || [];
      const userIsAdmin = roleTypes.includes('admin');
      setIsAdmin(userIsAdmin);

      // User can run QA tests if admin OR has the flag set
      setCanRunQATests(userIsAdmin || canRunQA);
      setAuthLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch scenarios
  const fetchScenarios = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (featureAreaFilter) params.append('feature_area', featureAreaFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      // Exclude automated_only scenarios from manual tester UI
      params.append('include_automated', 'false');

      const response = await fetch(`/api/qa/scenarios?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar escenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
      setAutomatedCount(data.automatedCount || 0);

      // Fetch last run info for each scenario
      const scenarioIds = data.scenarios?.map((s: QAScenario) => s.id) || [];
      if (scenarioIds.length > 0) {
        const { data: runs } = await supabase
          .from('qa_test_runs')
          .select('scenario_id, overall_result, completed_at')
          .eq('tester_id', user.id)
          .in('scenario_id', scenarioIds)
          .order('completed_at', { ascending: false });

        const runMap = new Map<string, LastRunInfo>();
        runs?.forEach((run) => {
          if (!runMap.has(run.scenario_id)) {
            runMap.set(run.scenario_id, run);
          }
        });
        setLastRuns(runMap);
      }
    } catch (error: any) {
      console.error('Error fetching scenarios:', error);
      toast.error(error.message || 'Error al cargar escenarios');
    } finally {
      setLoading(false);
    }
  }, [user, featureAreaFilter, priorityFilter, supabase]);

  // Fetch assigned scenarios for current user
  const fetchAssignedScenarios = useCallback(async () => {
    if (!user) return;

    setAssignedLoading(true);
    try {
      // Query assignments for this user, join with scenarios
      const { data: assignments, error } = await supabase
        .from('qa_scenario_assignments')
        .select(`
          id,
          status,
          due_date,
          assigned_at,
          scenario:qa_scenarios (
            id,
            name,
            description,
            feature_area,
            role_required,
            preconditions,
            steps,
            priority,
            estimated_duration_minutes,
            is_active,
            is_multi_user
          )
        `)
        .eq('tester_id', user.id)
        .neq('status', 'completed') // Only show incomplete assignments
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) {
        // Differentiate between "table doesn't exist" and other errors
        const isTableNotFound = error.code === '42P01' || error.message?.includes('relation') && error.message?.includes('does not exist');
        if (!isTableNotFound) {
          console.error('Error fetching assignments:', error);
        }
        // Show empty list for any error (including table not existing)
        setAssignedScenarios([]);
      } else {
        // Transform data to include assignment info in scenario
        const transformedAssignments: AssignedScenario[] = (assignments || [])
          .filter((a: any) => a.scenario && a.scenario.is_active)
          .map((a: any) => ({
            ...a.scenario,
            assignment_id: a.id,
            assignment_status: a.status,
            due_date: a.due_date,
            assigned_at: a.assigned_at,
          }));
        setAssignedScenarios(transformedAssignments);
      }
    } catch (error: any) {
      console.error('Error fetching assigned scenarios:', error);
      setAssignedScenarios([]);
    } finally {
      setAssignedLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchScenarios();
      fetchAssignedScenarios();
    }
  }, [user, fetchScenarios, fetchAssignedScenarios]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Filter scenarios
  const filteredScenarios = scenarios.filter((scenario) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const featureLabel = FEATURE_AREA_LABELS[scenario.feature_area] || scenario.feature_area;
    return (
      scenario.name.toLowerCase().includes(query) ||
      scenario.description?.toLowerCase().includes(query) ||
      featureLabel.toLowerCase().includes(query)
    );
  });

  // Get result icon
  const getResultIcon = (result: 'pass' | 'fail' | 'partial' | null) => {
    switch (result) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Loading state
  if (authLoading || (loading && !user)) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (!canRunQATests && user) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-testing"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Restringido</h1>
          <p className="text-gray-600 mb-6">
            No tienes permisos para acceder a las pruebas de QA. Contacta a un administrador para
            solicitar acceso.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_gray_dark transition-colors"
          >
            Volver al Dashboard
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="qa-testing"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardCheck />}
        title="Pruebas de QA"
        subtitle={`${filteredScenarios.length} escenario${filteredScenarios.length !== 1 ? 's' : ''} disponible${filteredScenarios.length !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar escenarios..."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={featureAreaFilter}
              onChange={(e) => setFeatureAreaFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="">Todas las áreas</option>
              {Object.entries(FEATURE_AREA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
          >
            <option value="">Todas las prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {isAdmin && (
            <Link
              href="/admin/qa"
              className="ml-auto px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
            >
              Panel de Admin
            </Link>
          )}
        </div>

        {/* Assigned Scenarios Section */}
        {!assignedLoading && assignedScenarios.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <UserCheck className="w-5 h-5 text-brand_accent" />
              <h2 className="text-lg font-semibold text-gray-900">
                Mis Escenarios Asignados ({assignedScenarios.length})
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {assignedScenarios.map((scenario) => {
                const lastRun = lastRuns.get(scenario.id);
                const priorityClasses = PRIORITY_COLORS[scenario.priority] || '';
                const isOverdue = scenario.due_date && new Date(scenario.due_date) < new Date();

                return (
                  <div
                    key={scenario.assignment_id}
                    className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-l-4 ${
                      isOverdue ? 'border-red-500' : 'border-brand_accent'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                          {scenario.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${priorityClasses}`}
                          >
                            {PRIORITY_LABELS[scenario.priority]}
                          </span>
                          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-brand_accent/20 text-brand_primary">
                            Asignado
                          </span>
                        </div>
                      </div>
                      {lastRun && (
                        <div className="flex items-center gap-1 ml-2">
                          {getResultIcon(lastRun.overall_result)}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {scenario.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                        {scenario.description}
                      </p>
                    )}

                    {/* Due Date */}
                    {scenario.due_date && (
                      <div className={`flex items-center gap-1 mb-3 text-sm ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                        <Calendar className="w-4 h-4" />
                        <span>
                          Fecha límite: {new Date(scenario.due_date).toLocaleDateString('es-CL')}
                          {isOverdue && ' (Vencido)'}
                        </span>
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-500">
                      <span className="inline-flex items-center bg-gray-100 px-2 py-1 rounded">
                        {FEATURE_AREA_LABELS[scenario.feature_area] || scenario.feature_area}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                        <Clock className="w-3 h-3" />
                        ~{scenario.estimated_duration_minutes} min
                      </span>
                      <span className="inline-flex items-center bg-gray-100 px-2 py-1 rounded">
                        {scenario.steps.length} pasos
                      </span>
                    </div>

                    {/* Action Button */}
                    <Link
                      href={`/qa/run/${scenario.id}`}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-brand_accent text-brand_primary rounded-lg text-sm font-medium hover:bg-brand_accent/80 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Iniciar Prueba Asignada
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Automated Scenarios Info */}
        {automatedCount > 0 && (
          <div className="mb-6 p-3 bg-brand_accent/10 border border-brand_accent/30 rounded-lg flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-brand_accent flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <span className="font-medium">{automatedCount} escenario{automatedCount !== 1 ? 's' : ''}</span>
              {' '}requiere{automatedCount === 1 ? '' : 'n'} pruebas automatizadas (Playwright) porque necesita{automatedCount === 1 ? '' : 'n'} estado sin sesión.
              {isAdmin && (
                <Link href="/admin/qa/scenarios?automated_only=true" className="ml-2 text-brand_primary hover:underline">
                  Ver en Admin
                </Link>
              )}
            </p>
          </div>
        )}

        {/* Section Header for Other Scenarios */}
        {assignedScenarios.length > 0 && filteredScenarios.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Otros Escenarios Disponibles ({filteredScenarios.length})
            </h2>
          </div>
        )}

        {/* Scenarios List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando escenarios...</p>
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <ClipboardCheck className="mx-auto h-16 w-16 text-brand_gray_medium" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              {scenarios.length === 0
                ? 'No hay escenarios de prueba'
                : 'No se encontraron escenarios'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {scenarios.length === 0
                ? 'Los escenarios de prueba serán creados por administradores.'
                : 'Intenta con otros términos de búsqueda o filtros'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredScenarios.map((scenario) => {
              const lastRun = lastRuns.get(scenario.id);
              const priorityClasses = PRIORITY_COLORS[scenario.priority] || '';

              return (
                <div
                  key={scenario.id}
                  className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                        {scenario.name}
                      </h3>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${priorityClasses}`}
                      >
                        {PRIORITY_LABELS[scenario.priority]}
                      </span>
                    </div>
                    {lastRun && (
                      <div className="flex items-center gap-1 ml-2">
                        {getResultIcon(lastRun.overall_result)}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {scenario.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                      {scenario.description}
                    </p>
                  )}

                  {/* Meta Info */}
                  <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-500">
                    <span className="inline-flex items-center bg-gray-100 px-2 py-1 rounded">
                      {FEATURE_AREA_LABELS[scenario.feature_area] || scenario.feature_area}
                    </span>
                    <span className="inline-flex items-center bg-gray-100 px-2 py-1 rounded">
                      Rol: {scenario.role_required}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                      <Clock className="w-3 h-3" />
                      ~{scenario.estimated_duration_minutes} min
                    </span>
                    <span className="inline-flex items-center bg-gray-100 px-2 py-1 rounded">
                      {scenario.steps.length} pasos
                    </span>
                  </div>

                  {/* Last Run Info */}
                  {lastRun && lastRun.completed_at && (
                    <p className="text-xs text-gray-400 mb-3">
                      Última ejecución:{' '}
                      {new Date(lastRun.completed_at).toLocaleDateString('es-CL')}
                    </p>
                  )}

                  {/* Action Button */}
                  <Link
                    href={`/qa/run/${scenario.id}`}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Iniciar Prueba
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QAScenarioListPage;
