/**
 * QA Scenario Assignment Management Page
 *
 * Admin interface for assigning QA scenarios to testers.
 * Supports bulk assignment, due dates, and assignment tracking.
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
  ClipboardList,
  ArrowLeft,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Search,
  Loader2,
  UserPlus,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { QAScenario, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types/qa';
import type { QAScenarioAssignment } from '@/pages/api/qa/assignments';

interface QATester {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  can_run_qa_tests: boolean;
}

const QAAssignmentManagementPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Scenarios for assignment
  const [scenarios, setScenarios] = useState<QAScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenarioSearchQuery, setScenarioSearchQuery] = useState('');
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  const [featureAreaFilter, setFeatureAreaFilter] = useState<string>('');

  // Testers
  const [testers, setTesters] = useState<QATester[]>([]);
  const [loadingTesters, setLoadingTesters] = useState(false);
  const [selectedTester, setSelectedTester] = useState<string>('');

  // Assignments
  const [assignments, setAssignments] = useState<QAScenarioAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [assignmentTesterFilter, setAssignmentTesterFilter] = useState<string>('');

  // Assignment form
  const [dueDate, setDueDate] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);

  // UI state
  const [showScenarioSelector, setShowScenarioSelector] = useState(true);

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

  // Fetch data when permission is confirmed
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchScenarios();
      fetchTesters();
      fetchAssignments();
    }
  }, [user, hasPermission]);

  // Refetch assignments when filters change
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchAssignments();
    }
  }, [includeCompleted, assignmentTesterFilter]);

  // Fetch active scenarios
  const fetchScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const params = new URLSearchParams();
      params.append('is_active', 'true');
      if (featureAreaFilter) params.append('feature_area', featureAreaFilter);

      const response = await fetch(`/api/qa/scenarios?${params.toString()}`);
      if (!response.ok) throw new Error('Error al cargar escenarios');

      const data = await response.json();
      setScenarios(data.scenarios || []);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      toast.error('Error al cargar escenarios');
    } finally {
      setLoadingScenarios(false);
    }
  };

  // Fetch QA testers
  const fetchTesters = async () => {
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
        setTesters(data.testers || []);
      } else {
        console.error('Failed to fetch testers, status:', response.status);
        toast.error('Error al cargar testers');
      }
    } catch (error) {
      console.error('Error fetching testers:', error);
      toast.error('Error al cargar testers');
    } finally {
      setLoadingTesters(false);
    }
  };

  // Fetch assignments
  const fetchAssignments = async () => {
    setLoadingAssignments(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams();
      if (includeCompleted) params.append('include_completed', 'true');
      if (assignmentTesterFilter) params.append('tester_id', assignmentTesterFilter);

      const response = await fetch(`/api/qa/assignments?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAssignments(data.assignments || []);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  // Handle scenario selection
  const toggleScenarioSelection = (scenarioId: string) => {
    setSelectedScenarios((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(scenarioId)) {
        newSet.delete(scenarioId);
      } else {
        newSet.add(scenarioId);
      }
      return newSet;
    });
  };

  // Select all visible scenarios
  const selectAllVisible = () => {
    const filteredIds = filteredScenarios.map((s) => s.id);
    setSelectedScenarios(new Set(filteredIds));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedScenarios(new Set());
  };

  // Create assignments
  const handleAssign = async () => {
    if (selectedScenarios.size === 0) {
      toast.error('Selecciona al menos un escenario');
      return;
    }

    if (!selectedTester) {
      toast.error('Selecciona un tester');
      return;
    }

    setIsAssigning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          scenario_ids: Array.from(selectedScenarios),
          tester_id: selectedTester,
          due_date: dueDate || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear asignaciones');
      }

      toast.success(data.message);

      // Clear form
      setSelectedScenarios(new Set());
      setSelectedTester('');
      setDueDate('');

      // Refresh assignments
      fetchAssignments();
    } catch (error) {
      console.error('Error creating assignments:', error);
      const message = error instanceof Error ? error.message : 'Error al crear asignaciones';
      toast.error(message);
    } finally {
      setIsAssigning(false);
    }
  };

  // Delete assignment
  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('¿Eliminar esta asignación?')) return;

    setDeletingAssignmentId(assignmentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/assignments?id=${assignmentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al eliminar');
      }

      toast.success('Asignación eliminada');
      fetchAssignments();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      const message = error instanceof Error ? error.message : 'Error al eliminar';
      toast.error(message);
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  // Filter scenarios by search and feature area
  const filteredScenarios = scenarios.filter((scenario) => {
    const matchesSearch =
      !scenarioSearchQuery ||
      scenario.name.toLowerCase().includes(scenarioSearchQuery.toLowerCase()) ||
      scenario.description?.toLowerCase().includes(scenarioSearchQuery.toLowerCase());

    const matchesArea = !featureAreaFilter || scenario.feature_area === featureAreaFilter;

    return matchesSearch && matchesArea;
  });

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
      case 'skipped':
        return <X className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado';
      case 'in_progress':
        return 'En Progreso';
      case 'pending':
        return 'Pendiente';
      case 'skipped':
        return 'Saltado';
      default:
        return status;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state - waiting for auth check
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
              Solo administradores pueden gestionar asignaciones de QA.
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
        title="Asignaciones QA"
        subtitle="Asignar escenarios a testers"
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

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column: Scenario Selection & Assignment Form */}
          <div className="space-y-6">
            {/* Assignment Form */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-brand_primary" />
                Nueva Asignación
              </h2>

              <div className="space-y-4">
                {/* Tester Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tester
                  </label>
                  <select
                    value={selectedTester}
                    onChange={(e) => setSelectedTester(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                  >
                    <option value="">Seleccionar tester...</option>
                    {testers.map((tester) => (
                      <option key={tester.id} value={tester.id}>
                        {tester.first_name && tester.last_name
                          ? `${tester.first_name} ${tester.last_name}`
                          : tester.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Límite (opcional)
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                  />
                </div>

                {/* Selected Count */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-gray-600">
                    {selectedScenarios.size} escenario(s) seleccionado(s)
                  </span>
                  <button
                    onClick={handleAssign}
                    disabled={isAssigning || selectedScenarios.size === 0 || !selectedTester}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAssigning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Asignando...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Asignar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Scenario Selector */}
            <div className="bg-white rounded-lg shadow-md">
              <div
                className="p-4 border-b cursor-pointer flex items-center justify-between"
                onClick={() => setShowScenarioSelector(!showScenarioSelector)}
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-brand_accent" />
                  Seleccionar Escenarios
                </h2>
                {showScenarioSelector ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {showScenarioSelector && (
                <div className="p-4">
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar escenarios..."
                        value={scenarioSearchQuery}
                        onChange={(e) => setScenarioSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                      />
                    </div>
                    <select
                      value={featureAreaFilter}
                      onChange={(e) => {
                        setFeatureAreaFilter(e.target.value);
                        fetchScenarios();
                      }}
                      className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    >
                      <option value="">Todas las áreas</option>
                      {Object.entries(FEATURE_AREA_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Actions */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={selectAllVisible}
                      className="text-sm text-brand_primary hover:underline"
                    >
                      Seleccionar todos ({filteredScenarios.length})
                    </button>
                    {selectedScenarios.size > 0 && (
                      <button
                        onClick={clearSelection}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Limpiar selección
                      </button>
                    )}
                  </div>

                  {/* Scenario List */}
                  {loadingScenarios ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : filteredScenarios.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      No se encontraron escenarios
                    </p>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto space-y-2">
                      {filteredScenarios.map((scenario) => (
                        <div
                          key={scenario.id}
                          onClick={() => toggleScenarioSelection(scenario.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedScenarios.has(scenario.id)
                              ? 'border-brand_primary bg-brand_primary/5'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedScenarios.has(scenario.id)}
                              onChange={() => toggleScenarioSelection(scenario.id)}
                              className="mt-1 rounded border-gray-300 text-brand_primary focus:ring-brand_primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {scenario.name}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="text-xs text-gray-500">
                                  {FEATURE_AREA_LABELS[scenario.feature_area]}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    PRIORITY_COLORS[scenario.priority]
                                  }`}
                                >
                                  {PRIORITY_LABELS[scenario.priority]}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {scenario.role_required}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Assignment History */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand_accent" />
                Asignaciones Existentes
              </h2>
            </div>

            <div className="p-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <select
                  value={assignmentTesterFilter}
                  onChange={(e) => setAssignmentTesterFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                >
                  <option value="">Todos los testers</option>
                  {testers.map((tester) => (
                    <option key={tester.id} value={tester.id}>
                      {tester.first_name && tester.last_name
                        ? `${tester.first_name} ${tester.last_name}`
                        : tester.email}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeCompleted}
                    onChange={(e) => setIncludeCompleted(e.target.checked)}
                    className="rounded border-gray-300 text-brand_primary focus:ring-brand_primary"
                  />
                  Incluir completados
                </label>
              </div>

              {/* Assignments List */}
              {loadingAssignments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No hay asignaciones</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {assignment.scenario?.name || 'Escenario eliminado'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {assignment.tester?.first_name && assignment.tester?.last_name
                                ? `${assignment.tester.first_name} ${assignment.tester.last_name}`
                                : assignment.tester?.email || 'Tester desconocido'}
                            </span>
                            {assignment.due_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(assignment.due_date).toLocaleDateString('es-CL')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                              assignment.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : assignment.status === 'in_progress'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : assignment.status === 'skipped'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {getStatusIcon(assignment.status)}
                            {getStatusLabel(assignment.status)}
                          </span>

                          {assignment.status !== 'completed' && (
                            <button
                              onClick={() => handleDeleteAssignment(assignment.id)}
                              disabled={deletingAssignmentId === assignment.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                              title="Eliminar asignación"
                            >
                              {deletingAssignmentId === assignment.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Assignment metadata */}
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                        <span>
                          Asignado {new Date(assignment.assigned_at).toLocaleDateString('es-CL')}
                          {assignment.assigned_by_user && (
                            <> por {assignment.assigned_by_user.first_name || assignment.assigned_by_user.email}</>
                          )}
                        </span>
                        {assignment.scenario?.feature_area && (
                          <span className="ml-2">
                            | {FEATURE_AREA_LABELS[assignment.scenario.feature_area as FeatureArea]}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default QAAssignmentManagementPage;
