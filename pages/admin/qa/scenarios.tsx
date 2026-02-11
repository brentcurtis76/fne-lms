/**
 * QA Scenario Management Page
 *
 * CRUD interface for managing test scenarios.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { useAuth } from '@/hooks/useAuth';
import {
  ClipboardList,
  Plus,
  Edit2,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
  Download,
  FileText,
  FlaskConical,
} from 'lucide-react';
import { scenariosToMarkdown } from '@/lib/qa/markdownScenarios';
import type { QAScenario, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types/qa';

const QAScenarioManagementPage: React.FC = () => {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, avatarUrl, logout } = useAuth();
  const [scenarios, setScenarios] = useState<QAScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [featureAreaFilter, setFeatureAreaFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [automatedFilter, setAutomatedFilter] = useState<string>('all');
  const [testingChannelFilter, setTestingChannelFilter] = useState<string>('all');
  const [completionFilter, setCompletionFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingAutomatedId, setTogglingAutomatedId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalScenarios, setTotalScenarios] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
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
    if (q.role) setRoleFilter(String(q.role));
    if (q.priority) setPriorityFilter(String(q.priority));
    if (q.feature_area) setFeatureAreaFilter(String(q.feature_area));
    if (q.is_active) setActiveFilter(String(q.is_active));
    if (q.automated_only) setAutomatedFilter(String(q.automated_only));
    if (q.testing_channel) setTestingChannelFilter(String(q.testing_channel));
    if (q.completion_status) setCompletionFilter(String(q.completion_status));

    initializedFromUrl.current = true;
  }, [router.isReady, router.query]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch scenarios — router is NOT in deps to avoid infinite loop
  // (router.replace inside callback would change router ref → recreate callback → re-trigger effect)
  const fetchScenarios = useCallback(async () => {
    if (!user || !isAdmin) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(currentPage));
      params.append('pageSize', String(pageSize));
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (featureAreaFilter) params.append('feature_area', featureAreaFilter);
      if (roleFilter) params.append('role', roleFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (activeFilter !== 'all') params.append('is_active', activeFilter);
      if (automatedFilter !== 'all') params.append('automated_only', automatedFilter);
      if (testingChannelFilter !== 'all') params.append('testing_channel', testingChannelFilter);
      if (completionFilter !== 'all') params.append('completion_status', completionFilter);

      const response = await fetch(`/api/qa/scenarios?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar escenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
      setTotalScenarios(data.total || 0);
    } catch (error: any) {
      console.error('Error fetching scenarios:', error);
      toast.error(error.message || 'Error al cargar escenarios');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, currentPage, pageSize, debouncedSearch, featureAreaFilter, roleFilter, priorityFilter, activeFilter, automatedFilter, testingChannelFilter, completionFilter]);

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
    if (activeFilter !== 'all') query.is_active = activeFilter;
    if (automatedFilter !== 'all') query.automated_only = automatedFilter;
    if (testingChannelFilter !== 'all') query.testing_channel = testingChannelFilter;
    if (completionFilter !== 'all') query.completion_status = completionFilter;

    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [currentPage, pageSize, debouncedSearch, featureAreaFilter, roleFilter, priorityFilter, activeFilter, automatedFilter, testingChannelFilter, completionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && isAdmin && initializedFromUrl.current) {
      fetchScenarios();
    }
  }, [user, isAdmin, fetchScenarios]);

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  }, []);

  // Toggle scenario active status
  const handleToggleActive = async (scenario: QAScenario) => {
    setTogglingId(scenario.id);
    try {
      const response = await fetch(`/api/qa/scenarios/${scenario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !scenario.is_active }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al actualizar escenario');
      }

      setScenarios((prev) =>
        prev.map((s) =>
          s.id === scenario.id ? { ...s, is_active: !s.is_active } : s
        )
      );
      toast.success(
        scenario.is_active ? 'Escenario desactivado' : 'Escenario activado'
      );
    } catch (error: any) {
      console.error('Error toggling scenario:', error);
      toast.error(error.message || 'Error al actualizar escenario');
    } finally {
      setTogglingId(null);
    }
  };

  // Toggle scenario automated_only status
  const handleToggleAutomated = async (scenario: QAScenario) => {
    setTogglingAutomatedId(scenario.id);
    try {
      const response = await fetch(`/api/qa/scenarios/${scenario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automated_only: !scenario.automated_only }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al actualizar escenario');
      }

      setScenarios((prev) =>
        prev.map((s) =>
          s.id === scenario.id ? { ...s, automated_only: !s.automated_only } : s
        )
      );
      toast.success(
        scenario.automated_only
          ? 'Escenario marcado como manual'
          : 'Escenario marcado como automatizado (Playwright)'
      );
    } catch (error: any) {
      console.error('Error toggling automated:', error);
      toast.error(error.message || 'Error al actualizar escenario');
    } finally {
      setTogglingAutomatedId(null);
    }
  };

  // Delete scenario
  const handleDelete = async (scenario: QAScenario) => {
    if (
      !confirm(
        `¿Estás seguro de eliminar el escenario "${scenario.name}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeletingId(scenario.id);
    try {
      const response = await fetch(`/api/qa/scenarios/${scenario.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al eliminar escenario');
      }

      setScenarios((prev) => prev.filter((s) => s.id !== scenario.id));
      toast.success('Escenario eliminado');
    } catch (error: any) {
      console.error('Error deleting scenario:', error);
      toast.error(error.message || 'Error al eliminar escenario');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = logout;

  // Filter change handlers (reset page to 1)
  const handleFeatureAreaChange = (value: string) => {
    setFeatureAreaFilter(value);
    setCurrentPage(1);
  };

  const handleActiveFilterChange = (value: string) => {
    setActiveFilter(value);
    setCurrentPage(1);
  };

  const handleAutomatedFilterChange = (value: string) => {
    setAutomatedFilter(value);
    setCurrentPage(1);
  };

  const handleTestingChannelFilterChange = (value: string) => {
    setTestingChannelFilter(value);
    setCurrentPage(1);
  };

  const handleCompletionFilterChange = (value: string) => {
    setCompletionFilter(value);
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

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  // Export scenarios to markdown (current page only)
  const handleExportMarkdown = () => {
    if (scenarios.length === 0) {
      toast.error('No hay escenarios para exportar');
      return;
    }

    const markdown = scenariosToMarkdown(scenarios);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-scenarios-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`${scenarios.length} escenario(s) exportado(s)`);
  };

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    debouncedSearch ||
    featureAreaFilter ||
    roleFilter ||
    priorityFilter ||
    (activeFilter !== 'all') ||
    (automatedFilter !== 'all') ||
    (testingChannelFilter !== 'all') ||
    (completionFilter !== 'all')
  );

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(totalScenarios / pageSize));
  const pageStart = totalScenarios === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = totalScenarios === 0 ? 0 : pageStart + scenarios.length - 1;

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Loading state — wait for auth to resolve
  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (!isAdmin) {
    return (
      <MainLayout
        currentPage="qa-admin"
        pageTitle=""
        breadcrumbs={[]}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-700 mb-6">
              Solo administradores pueden gestionar escenarios.
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
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardList />}
        title="Gestión de Escenarios"
        subtitle={`${totalScenarios} escenario${totalScenarios !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Buscar escenarios..."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back Link and Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <Link
            href="/admin/qa"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel
          </Link>

          <div className="flex flex-wrap gap-3">
            <select
              value={featureAreaFilter}
              onChange={(e) => handleFeatureAreaChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="">Todas las áreas</option>
              {Object.entries(FEATURE_AREA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={roleFilter}
              onChange={(e) => handleRoleFilterChange(e.target.value)}
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
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => handlePriorityFilterChange(e.target.value)}
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
              value={activeFilter}
              onChange={(e) => handleActiveFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>

            <select
              value={automatedFilter}
              onChange={(e) => handleAutomatedFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Todos (Manual + Auto)</option>
              <option value="false">Solo Manuales</option>
              <option value="true">Solo Automatizados</option>
            </select>

            <select
              value={testingChannelFilter}
              onChange={(e) => handleTestingChannelFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Canal: Todos</option>
              <option value="automation">Automatizado</option>
              <option value="human">Manual</option>
              <option value="not_applicable">No Aplicable</option>
            </select>

            <select
              value={completionFilter}
              onChange={(e) => handleCompletionFilterChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Completación: Todos</option>
              <option value="completed">Completados</option>
              <option value="pending">Pendientes</option>
            </select>

            <button
              onClick={handleExportMarkdown}
              disabled={scenarios.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              title="Exportar a Markdown"
            >
              <Download className="w-4 h-4" />
              Exportar MD
            </button>

            <Link
              href="/admin/qa/import-markdown"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              title="Importar desde Markdown"
            >
              <FileText className="w-4 h-4" />
              Importar MD
            </Link>

            <Link
              href="/admin/qa/generate"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generar Escenarios
            </Link>
          </div>
        </div>

        {/* Scenarios Table */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando escenarios...</p>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <ClipboardList className="mx-auto h-16 w-16 text-brand_gray_medium" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              {totalScenarios === 0 && !hasActiveFilters
                ? 'No hay escenarios todavía'
                : 'No se encontraron escenarios'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {totalScenarios === 0 && !hasActiveFilters
                ? '¡Crea tu primer escenario de prueba!'
                : 'Intenta con otros términos de búsqueda o filtros'}
            </p>
            {totalScenarios === 0 && !hasActiveFilters && (
              <Link
                href="/admin/qa/generate"
                className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
              >
                <Plus className="w-4 h-4" />
                Generar Escenarios
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Nombre
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Área
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Rol
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Prioridad
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Pasos
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Estado
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Tipo
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Canal
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scenarios.map((scenario) => (
                  <tr key={scenario.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {scenario.name}
                      </div>
                      {scenario.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {scenario.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {FEATURE_AREA_LABELS[scenario.feature_area]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {scenario.role_required}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${PRIORITY_COLORS[scenario.priority]}`}
                      >
                        {PRIORITY_LABELS[scenario.priority]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {scenario.steps.length}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(scenario)}
                        disabled={togglingId === scenario.id}
                        className="flex items-center gap-1 text-sm disabled:opacity-50"
                      >
                        {scenario.is_active ? (
                          <>
                            <ToggleRight className="w-5 h-5 text-green-500" />
                            <span className="text-green-600">Activo</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-500">Inactivo</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleAutomated(scenario)}
                        disabled={togglingAutomatedId === scenario.id}
                        className="flex items-center gap-1 text-sm disabled:opacity-50"
                        title={scenario.automated_only ? 'Requiere Playwright (sin sesión)' : 'Prueba manual (con sesión)'}
                      >
                        {scenario.automated_only ? (
                          <>
                            <FlaskConical className="w-4 h-4 text-brand_accent" />
                            <span className="text-brand_gray_dark">Playwright</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-500">Manual</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {scenario.testing_channel === 'automation' ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          Auto
                        </span>
                      ) : scenario.testing_channel === 'not_applicable' ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                          N/A
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/qa/scenarios/${scenario.id}`}
                          className="p-2 text-brand_primary hover:bg-brand_accent/10 rounded-lg transition-colors"
                          title="Ver/Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(scenario)}
                          disabled={deletingId === scenario.id}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-gray-50 border-t border-gray-200">
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
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QAScenarioManagementPage;
