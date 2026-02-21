/**
 * QA Scenario List Page
 *
 * Lists available QA test scenarios for testers to run.
 * Filters by feature area and role.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { useAuth } from '@/hooks/useAuth';
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
  const { user, loading: authLoading, isAdmin, avatarUrl, logout } = useAuth();
  const [scenarios, setScenarios] = useState<QAScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [featureAreaFilter, setFeatureAreaFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [completionFilter, setCompletionFilter] = useState<string>('');
  const [lastRuns, setLastRuns] = useState<Map<string, LastRunInfo>>(new Map());
  const [canRunQATests, setCanRunQATests] = useState(false);
  const [automatedCount, setAutomatedCount] = useState(0);
  const [assignedScenarios, setAssignedScenarios] = useState<AssignedScenario[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Refs for debounce and initialization
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initializedFromUrl = useRef(false);

  // Initialize from URL query params
  useEffect(() => {
    if (!router.isReady || initializedFromUrl.current) return;

    const q = router.query;
    if (q.page) setCurrentPage(Number(q.page) || 1);
    if (q.pageSize) setPageSize(Number(q.pageSize) || 25);
    if (q.search) {
      const searchValue = String(q.search);
      setSearchQuery(searchValue);
      setDebouncedSearch(searchValue);
    }
    if (q.feature_area) setFeatureAreaFilter(String(q.feature_area));
    if (q.role) setRoleFilter(String(q.role));
    if (q.priority) setPriorityFilter(String(q.priority));
    if (q.completion_status) setCompletionFilter(String(q.completion_status));

    initializedFromUrl.current = true;
  }, [router.isReady, router.query]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Check canRunQATests permission (separate from useAuth)
  useEffect(() => {
    const checkQAPermission = async () => {
      if (!user) return;

      const { data: qaData, error: qaError } = await supabase
        .from('profiles')
        .select('can_run_qa_tests')
        .eq('id', user.id)
        .single();

      if (qaError) {
        console.error('[QA] Error fetching can_run_qa_tests:', qaError.message);
        // Column might not exist - admins will still have access via role check
        setCanRunQATests(isAdmin);
      } else {
        const canRunQA = qaData?.can_run_qa_tests === true;
        // User can run QA tests if admin OR has the flag set
        setCanRunQATests(isAdmin || canRunQA);
      }
    };

    checkQAPermission();
  }, [user, isAdmin, supabase]);

  // Fetch scenarios — router is NOT in deps to avoid infinite loop
  // (router.replace inside callback would change router ref → recreate callback → re-trigger effect)
  const fetchScenarios = useCallback(async () => {
    if (!user || !canRunQATests) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(currentPage));
      params.append('pageSize', String(pageSize));
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (featureAreaFilter) params.append('feature_area', featureAreaFilter);
      if (roleFilter) params.append('role', roleFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (completionFilter) params.append('completion_status', completionFilter);
      // Exclude automated_only scenarios from manual tester UI
      params.append('include_automated', 'false');

      const response = await fetch(`/api/qa/scenarios?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar escenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
      setTotalScenarios(data.total || 0);
      setAutomatedCount(data.automatedCount || 0);

      // Read global completion counts from API response
      setCompletedCount(data.completedTotal || 0);
      setPendingCount(data.pendingTotal || 0);

      // Fetch last run info for current page's scenarios only (for card status badges)
      const scenarioIds = data.scenarios?.map((s: QAScenario) => s.id) || [];
      if (scenarioIds.length > 0) {
        // Exclude automated Playwright runs — only human executions count for card status
        const { data: runs } = await supabase
          .from('qa_test_runs')
          .select('scenario_id, overall_result, completed_at')
          .eq('tester_id', user.id)
          .neq('environment', 'automated-playwright')
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
  }, [user, canRunQATests, currentPage, pageSize, debouncedSearch, featureAreaFilter, roleFilter, priorityFilter, completionFilter, supabase]);

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

  // Sync filter state to URL (separate from fetch to avoid router dependency loop)
  useEffect(() => {
    if (!initializedFromUrl.current) return;
    const query: Record<string, string> = {};
    if (currentPage > 1) query.page = String(currentPage);
    if (pageSize !== 25) query.pageSize = String(pageSize);
    if (debouncedSearch) query.search = debouncedSearch;
    if (featureAreaFilter) query.feature_area = featureAreaFilter;
    if (roleFilter) query.role = roleFilter;
    if (priorityFilter) query.priority = priorityFilter;
    if (completionFilter) query.completion_status = completionFilter;

    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [currentPage, pageSize, debouncedSearch, featureAreaFilter, roleFilter, priorityFilter, completionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger fetch when filters change
  useEffect(() => {
    if (user && canRunQATests && initializedFromUrl.current) {
      fetchScenarios();
    }
  }, [user, canRunQATests, fetchScenarios]);

  // Fetch assigned scenarios separately
  useEffect(() => {
    if (user) {
      fetchAssignedScenarios();
    }
  }, [user, fetchAssignedScenarios]);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  }, []);

  // Filter change handlers (reset page to 1)
  const handleFeatureAreaChange = (value: string) => {
    setFeatureAreaFilter(value);
    setCurrentPage(1);
  };

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value);
    setCurrentPage(1);
  };

  const handlePriorityFilterChange = (value: string) => {
    setPriorityFilter(value);
    setCurrentPage(1);
  };

  const handleCompletionFilterChange = (value: string) => {
    setCompletionFilter(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const handleLogout = logout;

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

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(totalScenarios / pageSize));
  const pageStart = totalScenarios === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalScenarios === 0 ? 0 : pageStart + scenarios.length - 1;

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
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
        currentPage="qa-testing"
        pageTitle=""
        breadcrumbs={[]}
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
      currentPage="qa-testing"
      pageTitle=""
      breadcrumbs={[]}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardCheck />}
        title="Pruebas de QA"
        subtitle={`${totalScenarios} escenario${totalScenarios !== 1 ? 's' : ''} disponible${totalScenarios !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Buscar escenarios..."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={featureAreaFilter}
              onChange={(e) => handleFeatureAreaChange(e.target.value)}
              aria-label="Filtro de área funcional"
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
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
            aria-label="Filtro de rol"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
          >
            <option value="">Todos los roles</option>
            <option value="admin">admin</option>
            <option value="director">director</option>
            <option value="supervisor_de_red">supervisor_de_red</option>
            <option value="community_manager">community_manager</option>
            <option value="lider_generacion">lider_generacion</option>
            <option value="lider_comunidad">lider_comunidad</option>
            <option value="docente">docente</option>
            <option value="estudiante">estudiante</option>
            <option value="apoderado">apoderado</option>
            <option value="consultor">consultor</option>
            <option value="encargado_licitacion">encargado_licitacion</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => handlePriorityFilterChange(e.target.value)}
            aria-label="Filtro de prioridad"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
          >
            <option value="">Todas las prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={completionFilter}
            onChange={(e) => handleCompletionFilterChange(e.target.value)}
            aria-label="Filtro de estado de completación"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
          >
            <option value="">Todos (Completación)</option>
            <option value="completed">Completados ({completedCount})</option>
            <option value="pending">Pendientes ({pendingCount})</option>
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
        {!assignedLoading && assignedScenarios.length > 0 && completionFilter !== 'completed' && (
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

        {/* Manual Testing Info Banner */}
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3" aria-live="polite">
          <ClipboardCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-gray-700">
            Mostrando <span className="font-medium">{totalScenarios} escenario{totalScenarios !== 1 ? 's' : ''}</span> asignado{totalScenarios !== 1 ? 's' : ''} para testing manual.
            {automatedCount > 0 && (
              <> Los escenarios verificados por automatización no se muestran aquí.</>
            )}
            {isAdmin && (
              <Link href="/admin/qa/scenarios" className="ml-2 text-brand_primary hover:underline">
                Ver todos en Admin
              </Link>
            )}
          </p>
        </div>

        {/* Section Header for Other Scenarios */}
        {assignedScenarios.length > 0 && totalScenarios > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Otros Escenarios Disponibles ({totalScenarios})
            </h2>
          </div>
        )}

        {/* Scenarios List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando escenarios...</p>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <ClipboardCheck className="mx-auto h-16 w-16 text-brand_gray_medium" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              {totalScenarios === 0
                ? 'No hay escenarios de prueba'
                : 'No se encontraron escenarios'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {totalScenarios === 0
                ? 'Los escenarios de prueba serán creados por administradores.'
                : 'Intenta con otros términos de búsqueda o filtros'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((scenario) => {
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

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-lg">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {totalScenarios === 0
                    ? 'No hay escenarios para mostrar'
                    : `Mostrando ${pageStart}-${pageEnd} de ${totalScenarios} escenarios`}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
                >
                  <option value="10">10 por página</option>
                  <option value="25">25 por página</option>
                  <option value="50">50 por página</option>
                  <option value="100">100 por página</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="px-3 py-1 rounded border border-gray-300 text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default QAScenarioListPage;
