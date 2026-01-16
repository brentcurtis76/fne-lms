/**
 * QA Scenario Management Page
 *
 * CRUD interface for managing test scenarios.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
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
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [scenarios, setScenarios] = useState<QAScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [featureAreaFilter, setFeatureAreaFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [automatedFilter, setAutomatedFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingAutomatedId, setTogglingAutomatedId] = useState<string | null>(null);

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

  // Fetch scenarios
  const fetchScenarios = useCallback(async () => {
    if (!user || hasPermission === false) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (featureAreaFilter) params.append('feature_area', featureAreaFilter);
      if (activeFilter !== 'all') params.append('is_active', activeFilter);
      if (automatedFilter !== 'all') params.append('automated_only', automatedFilter);

      const response = await fetch(`/api/qa/scenarios?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar escenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
    } catch (error: any) {
      console.error('Error fetching scenarios:', error);
      toast.error(error.message || 'Error al cargar escenarios');
    } finally {
      setLoading(false);
    }
  }, [user, hasPermission, featureAreaFilter, activeFilter, automatedFilter]);

  useEffect(() => {
    if (user && hasPermission === true) {
      fetchScenarios();
    }
  }, [user, hasPermission, fetchScenarios]);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Export scenarios to markdown
  const handleExportMarkdown = () => {
    const scenariosToExport = filteredScenarios.length > 0 ? filteredScenarios : scenarios;
    if (scenariosToExport.length === 0) {
      toast.error('No hay escenarios para exportar');
      return;
    }

    const markdown = scenariosToMarkdown(scenariosToExport);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-scenarios-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`${scenariosToExport.length} escenario(s) exportado(s)`);
  };

  // Filter scenarios
  const filteredScenarios = scenarios.filter((scenario) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      scenario.name.toLowerCase().includes(query) ||
      scenario.description?.toLowerCase().includes(query) ||
      FEATURE_AREA_LABELS[scenario.feature_area].toLowerCase().includes(query)
    );
  });

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
      user={user}
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardList />}
        title="Gestión de Escenarios"
        subtitle={`${filteredScenarios.length} escenario${filteredScenarios.length !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
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

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>

            <select
              value={automatedFilter}
              onChange={(e) => setAutomatedFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_accent"
            >
              <option value="all">Todos (Manual + Auto)</option>
              <option value="false">Solo Manuales</option>
              <option value="true">Solo Automatizados</option>
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
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <ClipboardList className="mx-auto h-16 w-16 text-brand_gray_medium" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              {scenarios.length === 0
                ? 'No hay escenarios todavía'
                : 'No se encontraron escenarios'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {scenarios.length === 0
                ? '¡Crea tu primer escenario de prueba!'
                : 'Intenta con otros términos de búsqueda o filtros'}
            </p>
            {scenarios.length === 0 && (
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
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredScenarios.map((scenario) => (
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
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QAScenarioManagementPage;
