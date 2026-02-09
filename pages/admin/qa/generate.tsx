/**
 * QA Scenario Generator Page
 *
 * Admin-only page for generating QA scenarios using AI and codebase index.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import {
  Wand2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  Trash2,
  Save,
  Loader2,
  Copy,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

interface FeatureArea {
  feature_area: string;
  routes: string[];
  last_indexed: string | null;
  is_stale: boolean;
}

interface GeneratedStep {
  instruction: string;
  expected_outcome: string;
  capture_on_pass?: boolean;
  capture_on_fail?: boolean;
  actor?: string;
  tabIndicator?: number;
}

interface GeneratedScenario {
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  steps: GeneratedStep[];
  expanded?: boolean;
  is_multi_user?: boolean;
}

const ROLE_OPTIONS = [
  { value: '', label: 'Cualquier rol' },
  { value: 'admin', label: 'Administrador' },
  { value: 'docente', label: 'Docente' },
  { value: 'consultor', label: 'Consultor' },
  { value: 'community_manager', label: 'Community Manager' },
  { value: 'equipo_directivo', label: 'Equipo Directivo' },
  { value: 'lider_generacion', label: 'Líder de Generación' },
  { value: 'lider_comunidad', label: 'Líder de Comunidad' },
  { value: 'supervisor_de_red', label: 'Supervisor de Red' }
];

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200'
};

const PRIORITY_LABELS = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo'
};

// Spanish display names for feature areas - must match all entries in types/qa/index.ts
const FEATURE_AREA_LABELS: Record<string, string> = {
  authentication: 'Autenticación',
  user_management: 'Gestión de Usuarios',
  role_assignment: 'Asignación de Roles',
  school_management: 'Gestión de Colegios',
  course_builder: 'Constructor de Cursos',
  course_enrollment: 'Inscripción a Cursos',
  course_management: 'Gestión de Cursos',
  assessment_builder: 'Constructor de Evaluaciones',
  transformation_assessment: 'Evaluación de Transformación',
  quiz_submission: 'Envío de Quizzes',
  reporting: 'Reportes',
  network_management: 'Gestión de Redes',
  community_workspace: 'Espacio de Comunidad',
  collaborative_space: 'Espacio Colaborativo',
  navigation: 'Navegación / Sidebar',
  docente_experience: 'Experiencia Docente',
};

// Static fallback feature areas when database is empty
const STATIC_FEATURE_AREAS: FeatureArea[] = Object.keys(FEATURE_AREA_LABELS).map(key => ({
  feature_area: key,
  routes: [],
  last_indexed: null,
  is_stale: true
}));

// Helper to get display name
const getFeatureAreaLabel = (featureArea: string): string => {
  return FEATURE_AREA_LABELS[featureArea] ||
    featureArea.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function QAGeneratorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Feature areas
  const [featureAreas, setFeatureAreas] = useState<FeatureArea[]>([]);
  const [selectedFeatureArea, setSelectedFeatureArea] = useState('');
  const [selectedFeatureData, setSelectedFeatureData] = useState<FeatureArea | null>(null);
  const [usingStaticFallback, setUsingStaticFallback] = useState(false);

  // Configuration
  const [additionalContext, setAdditionalContext] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [isMultiUser, setIsMultiUser] = useState(false);
  const [autoAssign, setAutoAssign] = useState(true); // Auto-assign to QA tester by default

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [scenarios, setScenarios] = useState<GeneratedScenario[]>([]);

  // Modal state
  const [showRefreshModal, setShowRefreshModal] = useState(false);

  // Saving state
  const [saving, setSaving] = useState(false);

  // Check admin access
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const { data: roles } = await supabase
          .from('user_roles')
          .select('role_type')
          .eq('user_id', session.user.id)
          .eq('is_active', true);

        const hasAdmin = roles?.some(r => r.role_type === 'admin');
        if (!hasAdmin) {
          toast.error('Solo administradores pueden acceder a esta página');
          router.push('/admin/qa');
          return;
        }

        setIsAdmin(true);
        fetchFeatureAreas(session.access_token);
      } catch (error) {
        console.error('Auth error:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router, supabase]);

  // Fetch feature areas
  const fetchFeatureAreas = async (token: string) => {
    try {
      const response = await fetch('/api/qa/codebase-index', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Error fetching feature areas');
      }

      const data = await response.json();

      if (data.needs_migration) {
        toast.error('La tabla codebase_index no existe. Ejecuta la migración primero.');
        // Use static fallback even when migration needed
        setFeatureAreas(STATIC_FEATURE_AREAS);
        setUsingStaticFallback(true);
        return;
      }

      // Use database data if available, otherwise use static fallback
      if (data.feature_areas && data.feature_areas.length > 0) {
        setFeatureAreas(data.feature_areas);
        setUsingStaticFallback(false);
      } else {
        // Fallback to static list so dropdown is never empty
        setFeatureAreas(STATIC_FEATURE_AREAS);
        setUsingStaticFallback(true);
        toast('Usando lista estática. Usa "Inicializar Índice" para datos enriquecidos.', {
          icon: 'ℹ️',
          duration: 4000
        });
      }
    } catch (error) {
      console.error('Error fetching feature areas:', error);
      // Use static fallback on error
      setFeatureAreas(STATIC_FEATURE_AREAS);
      setUsingStaticFallback(true);
      toast.error('Error al cargar índice. Usando lista estática.');
    }
  };

  // Handle feature area selection
  const handleFeatureAreaChange = (value: string) => {
    setSelectedFeatureArea(value);
    const feature = featureAreas.find(f => f.feature_area === value);
    setSelectedFeatureData(feature || null);
    setScenarios([]); // Clear previous scenarios
  };

  // Generate scenarios
  const handleGenerate = async () => {
    if (!selectedFeatureArea) {
      toast.error('Selecciona un área de funcionalidad');
      return;
    }

    setGenerating(true);
    setScenarios([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/qa/generate-scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          feature_area: selectedFeatureArea,
          description: additionalContext || undefined,
          role: selectedRole || undefined,
          is_multi_user: isMultiUser || undefined
        })
      });

      const data = await response.json();
      console.log('[generate] API response:', data);

      if (!response.ok) {
        console.error('[generate] API error response:', JSON.stringify(data, null, 2));
        if (data.raw_response) {
          console.error('[generate] Raw AI response:', data.raw_response);
        }
        if (data.suggestion) {
          toast.error(`${data.error}. ${data.suggestion}`);
        } else {
          toast.error(data.error || 'Error al generar escenarios');
        }
        return;
      }

      // Add expanded state to each scenario
      const scenariosWithState = (data.scenarios || []).map((s: GeneratedScenario, i: number) => ({
        ...s,
        expanded: i === 0 // First one expanded by default
      }));

      setScenarios(scenariosWithState);
      toast.success(`${scenariosWithState.length} escenarios generados`);
    } catch (error: any) {
      console.error('Generate error:', error);
      toast.error('Error al generar escenarios');
    } finally {
      setGenerating(false);
    }
  };

  // Toggle scenario expansion
  const toggleScenario = (index: number) => {
    setScenarios(prev => prev.map((s, i) =>
      i === index ? { ...s, expanded: !s.expanded } : s
    ));
  };

  // Update scenario field
  const updateScenario = (index: number, field: keyof GeneratedScenario, value: any) => {
    setScenarios(prev => prev.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    ));
  };

  // Update step field
  const updateStep = (scenarioIndex: number, stepIndex: number, field: keyof GeneratedStep, value: any) => {
    setScenarios(prev => prev.map((s, i) =>
      i === scenarioIndex
        ? {
          ...s,
          steps: s.steps.map((step, j) =>
            j === stepIndex ? { ...step, [field]: value } : step
          )
        }
        : s
    ));
  };

  // Delete scenario
  const deleteScenario = (index: number) => {
    setScenarios(prev => prev.filter((_, i) => i !== index));
    toast.success('Escenario eliminado');
  };

  // Save scenarios
  const handleSaveScenarios = async () => {
    if (scenarios.length === 0) {
      toast.error('No hay escenarios para guardar');
      return;
    }

    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Transform scenarios to match the import-scenarios API format
      const priorityMap: Record<string, number> = {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4
      };

      const scenariosToSave = scenarios.map(s => ({
        name: s.name,
        description: s.description,
        priority: priorityMap[s.priority] || 2,
        feature_area: selectedFeatureArea,
        role_required: selectedRole || 'admin', // Default to admin if no role selected
        preconditions: [],
        is_multi_user: s.is_multi_user || isMultiUser, // Use scenario flag or page-level flag
        steps: s.steps.map((step) => ({
          instruction: step.instruction,
          expectedOutcome: step.expected_outcome,
          captureOnPass: step.capture_on_pass || false,
          captureOnFail: step.capture_on_fail !== false, // Default true
          // Multi-user step fields (use camelCase to match types)
          actor: step.actor || null,
          tabIndicator: step.tabIndicator || null,
        }))
      }));

      // Import scenarios via the import API
      console.log('Saving scenarios:', JSON.stringify(scenariosToSave, null, 2));

      const response = await fetch('/api/qa/import-scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          scenarios: scenariosToSave,
          auto_assign: autoAssign,
          assign_to_role: selectedRole || undefined
        })
      });

      const data = await response.json();
      console.log('Import response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar escenarios');
      }

      // Show detailed results
      if (data.errors && data.errors.length > 0) {
        console.warn('Import errors:', data.errors);
        data.errors.forEach((err: string) => toast.error(err, { duration: 5000 }));
      }

      if (data.imported > 0) {
        let message = `${data.imported} escenario(s) guardado(s)`;
        if (data.assignments_created > 0) {
          message += ` y asignado(s) a ${data.assignments_created} tester(s)`;
        }
        toast.success(message);
      } else if (data.skipped > 0) {
        toast.error(`${data.skipped} escenario(s) omitido(s). Ver consola para detalles.`);
      }

      // Clear scenarios after saving
      setScenarios([]);

      // Redirect to scenarios list
      router.push('/admin/qa/scenarios');
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Error al guardar escenarios');
    } finally {
      setSaving(false);
    }
  };

  // Discard all scenarios
  const handleDiscardAll = () => {
    if (scenarios.length === 0) return;

    if (confirm('¿Descartar todos los escenarios generados?')) {
      setScenarios([]);
      toast.success('Escenarios descartados');
    }
  };

  // Seed initial index
  const handleSeedIndex = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      toast.loading('Inicializando índice de código...', { id: 'seed' });

      const response = await fetch('/api/qa/seed-codebase-index', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Error al inicializar índice', { id: 'seed' });
        return;
      }

      toast.success(data.message || 'Índice inicializado', { id: 'seed' });
      fetchFeatureAreas(session.access_token);
    } catch (error) {
      console.error('Seed error:', error);
      toast.error('Error al inicializar índice', { id: 'seed' });
    }
  };

  // Copy refresh command
  const copyRefreshCommand = () => {
    const command = `Analyze the ${selectedFeatureArea} feature and update the codebase_index table.
Look at routes, components, API endpoints. Extract roles, behaviors, outcomes.
Update existing rows or insert new ones.
Set last_indexed to NOW().`;

    navigator.clipboard.writeText(command);
    toast.success('Comando copiado al portapapeles');
  };

  // Format relative time
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Nunca';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return `Hace ${Math.floor(diffDays / 30)} meses`;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-[#fbbf24]" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-[#0a0a0a]">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">Solo administradores pueden acceder a esta página.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#fbbf24] rounded-lg">
              <Wand2 className="w-6 h-6 text-[#0a0a0a]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0a0a0a]">Generador de Escenarios QA</h1>
              <p className="text-gray-600">Genera escenarios de prueba basados en el análisis del código</p>
            </div>
          </div>

          {usingStaticFallback && (
            <button
              onClick={handleSeedIndex}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Inicializar Índice
            </button>
          )}
        </div>

        {/* Feature Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4">Selección de Funcionalidad</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Área de funcionalidad
              </label>
              <select
                value={selectedFeatureArea}
                onChange={(e) => handleFeatureAreaChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
              >
                <option value="">Seleccionar área...</option>
                {featureAreas.map(fa => (
                  <option key={fa.feature_area} value={fa.feature_area}>
                    {getFeatureAreaLabel(fa.feature_area)}
                  </option>
                ))}
              </select>
            </div>

            {selectedFeatureData && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Último índice: {formatRelativeTime(selectedFeatureData.last_indexed)}</span>
                </div>
                <div className="text-gray-500">
                  {selectedFeatureData.routes.length} ruta(s) indexada(s)
                </div>
              </div>
            )}

            {selectedFeatureData?.is_stale && (
              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                  <span>El índice de esta área tiene más de 7 días. Los resultados pueden no reflejar cambios recientes.</span>
                </div>
                <button
                  onClick={() => setShowRefreshModal(true)}
                  className="text-amber-700 hover:text-amber-900 underline text-sm"
                >
                  Ver comando para actualizar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#0a0a0a] mb-4">Configuración</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contexto adicional (opcional)
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Ej: Enfocarse en flujos de error, probar con datos grandes..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rol a probar (opcional)
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-user checkbox */}
          <div className="mt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isMultiUser}
                onChange={(e) => setIsMultiUser(e.target.checked)}
                className="mt-1 w-4 h-4 text-[#fbbf24] border-gray-300 rounded focus:ring-[#fbbf24]"
              />
              <div>
                <span className="font-medium text-gray-700">Escenario multi-usuario</span>
                <p className="text-sm text-gray-500 mt-1">
                  Genera escenarios que requieren múltiples usuarios en diferentes pestañas del navegador.
                  Cada paso indicará qué usuario (Usuario A, Usuario B, etc.) debe realizarlo.
                  Ideal para probar sincronización en tiempo real en el Espacio Colaborativo.
                </p>
              </div>
            </label>
          </div>

          {/* Auto-assign checkbox */}
          <div className="mt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="mt-1 w-4 h-4 text-[#fbbf24] border-gray-300 rounded focus:ring-[#fbbf24]"
              />
              <div>
                <span className="font-medium text-gray-700">Asignar automáticamente al tester QA</span>
                <p className="text-sm text-gray-500 mt-1">
                  Al guardar, los escenarios se asignarán automáticamente al usuario de prueba
                  correspondiente al rol seleccionado (ej: docente → docente.qa@fne.cl).
                </p>
              </div>
            </label>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGenerate}
              disabled={!selectedFeatureArea || generating}
              className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] font-semibold rounded-lg hover:bg-[#e6a42e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generar Escenarios
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        {generating && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-[#fbbf24] mx-auto mb-4" />
            <p className="text-gray-600">Analizando código y generando escenarios...</p>
            <p className="text-sm text-gray-500 mt-2">Esto puede tomar hasta 30 segundos</p>
          </div>
        )}

        {!generating && scenarios.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0a0a0a]">
                Escenarios Generados ({scenarios.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscardAll}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Descartar Todo
                </button>
                <button
                  onClick={handleSaveScenarios}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar {scenarios.length} Escenarios
                </button>
              </div>
            </div>

            {scenarios.map((scenario, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Scenario Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleScenario(index)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${PRIORITY_COLORS[scenario.priority]}`}>
                      {PRIORITY_LABELS[scenario.priority]}
                    </span>
                    <input
                      value={scenario.name}
                      onChange={(e) => updateScenario(index, 'name', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 font-medium text-[#0a0a0a] bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-[#fbbf24] focus:ring-0 px-0"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteScenario(index);
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {scenario.expanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Scenario Content */}
                {scenario.expanded && (
                  <div className="border-t border-gray-200 p-4 space-y-4">
                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción
                      </label>
                      <textarea
                        value={scenario.description}
                        onChange={(e) => updateScenario(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent resize-none"
                        rows={2}
                      />
                    </div>

                    {/* Priority */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prioridad
                      </label>
                      <select
                        value={scenario.priority}
                        onChange={(e) => updateScenario(index, 'priority', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                      >
                        <option value="critical">Crítico</option>
                        <option value="high">Alto</option>
                        <option value="medium">Medio</option>
                        <option value="low">Bajo</option>
                      </select>
                    </div>

                    {/* Steps */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pasos ({scenario.steps.length})
                      </label>
                      <div className="space-y-3">
                        {scenario.steps.map((step, stepIndex) => (
                          <div key={stepIndex} className="bg-gray-50 rounded-lg p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-6 h-6 bg-[#fbbf24] text-[#0a0a0a] rounded-full flex items-center justify-center text-sm font-medium">
                                {stepIndex + 1}
                              </span>
                              <input
                                value={step.instruction}
                                onChange={(e) => updateStep(index, stepIndex, 'instruction', e.target.value)}
                                placeholder="Instrucción del paso"
                                className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent text-sm"
                              />
                            </div>
                            <div className="ml-8">
                              <input
                                value={step.expected_outcome}
                                onChange={(e) => updateStep(index, stepIndex, 'expected_outcome', e.target.value)}
                                placeholder="Resultado esperado"
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent text-sm text-gray-600"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Refresh Modal */}
        {showRefreshModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-[#0a0a0a]">Actualizar Índice de Código</h3>
                <button
                  onClick={() => setShowRefreshModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <p className="text-gray-600">
                  Ejecuta este comando en Claude Code para actualizar el índice:
                </p>

                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
                  {`Analyze the ${selectedFeatureArea} feature and update the codebase_index table.
Look at routes, components, API endpoints. Extract roles, behaviors, outcomes.
Update existing rows or insert new ones.
Set last_indexed to NOW().`}
                </div>

                <button
                  onClick={copyRefreshCommand}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copiar Comando
                </button>
              </div>

              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={() => setShowRefreshModal(false)}
                  className="w-full px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
