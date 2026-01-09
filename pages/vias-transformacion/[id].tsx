import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import {
  ArrowLeft,
  Users,
  UserPlus,
  X,
  Building2,
  GraduationCap,
  Clock,
  CheckCircle,
  Archive,
  AlertTriangle,
  Eye,
  Edit3,
  Calendar,
  Trash2,
  FileText,
  RefreshCw,
  Download,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { AREA_LABELS, AREA_ICONS, type TransformationArea } from '@/types/transformation';
import { formatGradesDisplay, type ChileanGrade } from '@/types/grades';
import CollaboratorSelector from '@/components/transformation/CollaboratorSelector';

// Import existing assessment components
import { PreAssessmentQuestions, PreAssessmentAnswers } from '@/components/transformation/PreAssessmentQuestions';
import { SequentialQuestions, QuestionResponse } from '@/components/transformation/SequentialQuestions';
import { ResultsDisplay } from '@/components/transformation/ResultsDisplay';
import { EvaluationSummary } from '@/components/transformation/EvaluationSummary';
import { EvaluationCharts } from '@/components/transformation/EvaluationCharts';
import { downloadReportAsPdf } from '@/utils/transformationReportPdf';

interface Collaborator {
  id: string;
  role: string;
  can_edit: boolean;
  full_name: string;
  avatar_url?: string;
  is_current_user?: boolean;
}

interface Assessment {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  grades: ChileanGrade[];
  school_id: number;
  school_name: string | null;
  growth_community_id?: string;
  context_metadata: Record<string, any>;
  conversation_history?: Array<{ role: string; content: string }>;
  created_by: string;
  creator_name: string;
  creator_avatar?: string;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  collaborators: Collaborator[];
  is_creator: boolean;
  is_collaborator: boolean;
  is_admin_viewer?: boolean;
  can_edit: boolean;
}

interface RubricItem {
  id: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
  level_1_descriptor: string;
  level_2_descriptor: string;
  level_3_descriptor: string;
  level_4_descriptor: string;
  initial_questions: string[];
  display_order: number;
}

type AssessmentStep = 'pre-assessment' | 'questions' | 'results';

// Pre-assessment validation
const REQUIRED_PRE_ASSESSMENT_RADIOS: (keyof PreAssessmentAnswers)[] = [
  'q1_num_estudiantes',
  'q3_generacion_tractor',
  'q4_generacion_innova',
  'q5_tiempo_trabajando',
  'q6_num_docentes',
  'q7_plan_personal',
  'q8_entrevistas_individuales',
  'q9_oportunidades_eleccion',
  'q10_docentes_dua',
  'q11_proyectos_autoconocimiento',
  'q12_aspecto_fortalecer',
  'q14_percepcion_familias',
  'q15_apoyo_directivo',
  'q16_sistemas_seguimiento',
  'q17_preparacion_docentes',
  'q18_autorregulacion_estudiantes',
];

const REQUIRED_PRE_ASSESSMENT_MULTISELECT: Array<'q2_niveles_personalizacion' | 'q13_resistencias'> = [
  'q2_niveles_personalizacion',
  'q13_resistencias',
];

function isPreAssessmentComplete(answers?: PreAssessmentAnswers | null): boolean {
  if (!answers) return false;

  for (const key of REQUIRED_PRE_ASSESSMENT_RADIOS) {
    const value = answers[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return false;
    }
  }

  for (const key of REQUIRED_PRE_ASSESSMENT_MULTISELECT) {
    const value = answers[key];
    if (!Array.isArray(value) || value.length === 0) {
      return false;
    }
  }

  if (
    answers.q3_generacion_tractor === 'Sí' &&
    (!Array.isArray(answers.q3_tractor_niveles) || answers.q3_tractor_niveles.length === 0)
  ) {
    return false;
  }

  if (
    answers.q4_generacion_innova === 'Sí' &&
    (!Array.isArray(answers.q4_innova_niveles) || answers.q4_innova_niveles.length === 0)
  ) {
    return false;
  }

  return true;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'ahora mismo';
  if (seconds < 60) return 'hace un momento';
  if (seconds < 120) return 'hace 1 minuto';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} minutos`;
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export default function AssessmentDetailPage() {
  const router = useRouter();
  const { id: assessmentId } = router.query;
  const supabase = useSupabaseClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Assessment state
  const [currentStep, setCurrentStep] = useState<AssessmentStep>('pre-assessment');
  const [rubricItems, setRubricItems] = useState<RubricItem[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSavingPreAssessment, setIsSavingPreAssessment] = useState(false);
  const [isSavingSequential, setIsSavingSequential] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [needsRegeneration, setNeedsRegeneration] = useState(false);

  // Collaborator management
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  const [selectedNewCollaborators, setSelectedNewCollaborators] = useState<string[]>([]);
  const [addingCollaborators, setAddingCollaborators] = useState(false);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null);

  const hasInitialized = useRef(false);
  const hasAutoAdvancedToQuestions = useRef(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Load assessment
  useEffect(() => {
    if (!router.isReady || !assessmentId || typeof assessmentId !== 'string' || !user) {
      return;
    }

    if (hasInitialized.current) return;
    hasInitialized.current = true;

    loadAssessment();
  }, [router.isReady, assessmentId, user]);

  const loadAssessment = async () => {
    if (!assessmentId || typeof assessmentId !== 'string') return;

    try {
      setLoading(true);
      setPageError(null);

      const response = await fetch(`/api/vias-transformacion/${assessmentId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar la evaluación');
      }

      setAssessment(data);

      // Determine current step based on saved data
      const contextMeta = data.context_metadata || {};
      const preAnswers = contextMeta.preAssessmentAnswers;
      const responses = contextMeta.responses || {};
      const evaluation = contextMeta.evaluation;

      if (data.status === 'completed' && evaluation) {
        setCurrentStep('results');
      } else if (isPreAssessmentComplete(preAnswers)) {
        setCurrentStep('questions');
        hasAutoAdvancedToQuestions.current = true;
      } else {
        setCurrentStep('pre-assessment');
      }

      // Load rubric items for the assessment's area
      await loadRubricItems(data.area);
    } catch (error: any) {
      console.error('[AssessmentDetail] Error loading:', error);
      setPageError(error.message || 'Error al cargar la evaluación');
    } finally {
      setLoading(false);
    }
  };

  const loadRubricItems = useCallback(async (area: string) => {
    try {
      const { data, error } = await supabase
        .from('transformation_rubric')
        .select('*')
        .eq('area', area)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRubricItems(data || []);
    } catch (error) {
      console.error('[AssessmentDetail] Error loading rubric:', error);
    }
  }, [supabase]);

  // Save pre-assessment answers
  const handlePreAssessmentChange = useCallback(
    async (answers: PreAssessmentAnswers) => {
      if (!assessment || !assessment.can_edit) return;

      setIsSavingPreAssessment(true);
      setSaveError(null);

      try {
        const updatedMetadata = {
          ...assessment.context_metadata,
          preAssessmentAnswers: answers,
        };

        const { error } = await supabase
          .from('transformation_assessments')
          .update({
            context_metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', assessment.id);

        if (error) throw error;

        setAssessment({
          ...assessment,
          context_metadata: updatedMetadata,
        });
        setLastSavedAt(new Date());
      } catch (error: any) {
        console.error('[AssessmentDetail] Save error:', error);
        setSaveError('Error al guardar respuestas');
      } finally {
        setIsSavingPreAssessment(false);
      }
    },
    [assessment, supabase]
  );

  // Save sequential question responses
  const handleSequentialChange = useCallback(
    async (responses: Record<string, QuestionResponse>) => {
      if (!assessment || !assessment.can_edit) return;

      setIsSavingSequential(true);
      setSaveError(null);

      try {
        const updatedMetadata = {
          ...assessment.context_metadata,
          responses,
        };

        const { error } = await supabase
          .from('transformation_assessments')
          .update({
            context_metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', assessment.id);

        if (error) throw error;

        setAssessment({
          ...assessment,
          context_metadata: updatedMetadata,
        });
        setLastSavedAt(new Date());
        setNeedsRegeneration(true);
      } catch (error: any) {
        console.error('[AssessmentDetail] Save error:', error);
        setSaveError('Error al guardar respuestas');
      } finally {
        setIsSavingSequential(false);
      }
    },
    [assessment, supabase]
  );

  // Complete pre-assessment and move to questions
  const handlePreAssessmentComplete = useCallback(
    async (answers: PreAssessmentAnswers) => {
      if (!assessment || !assessment.can_edit) return;

      try {
        const updatedMetadata = {
          ...assessment.context_metadata,
          preAssessmentAnswers: answers,
        };

        await supabase
          .from('transformation_assessments')
          .update({
            context_metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', assessment.id);

        setAssessment({
          ...assessment,
          context_metadata: updatedMetadata,
        });

        setCurrentStep('questions');
      } catch (error) {
        console.error('[AssessmentDetail] Error completing pre-assessment:', error);
        toast.error('Error al guardar pre-evaluación');
      }
    },
    [assessment, supabase]
  );

  // Evaluate assessment
  const handleEvaluate = useCallback(async () => {
    if (!assessment || !assessment.can_edit) return;

    setIsEvaluating(true);
    setEvaluationError(null);

    try {
      const response = await fetch(`/api/transformation/assessments/${assessment.id}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: assessment.context_metadata?.responses || {},
          rubricItems,
          preAssessmentAnswers: assessment.context_metadata?.preAssessmentAnswers || {},
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al evaluar');
      }

      // Update local state with evaluation results
      const updatedMetadata = {
        ...assessment.context_metadata,
        evaluation: data,
      };

      setAssessment({
        ...assessment,
        context_metadata: updatedMetadata,
      });

      setNeedsRegeneration(false);
      setCurrentStep('results');
    } catch (error: any) {
      console.error('[AssessmentDetail] Evaluation error:', error);
      setEvaluationError(error.message || 'Error al evaluar');
    } finally {
      setIsEvaluating(false);
    }
  }, [assessment, rubricItems]);

  // Finalize assessment
  const handleFinalize = useCallback(async () => {
    if (!assessment || !assessment.can_edit) return;

    setIsFinalizing(true);

    try {
      const response = await fetch(`/api/transformation/assessments/${assessment.id}/finalize`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al finalizar');
      }

      setAssessment({
        ...assessment,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      toast.success('Evaluación finalizada correctamente');
    } catch (error: any) {
      console.error('[AssessmentDetail] Finalize error:', error);
      toast.error(error.message || 'Error al finalizar');
    } finally {
      setIsFinalizing(false);
    }
  }, [assessment]);

  // Handle questions completion (called by SequentialQuestions)
  // This is called after finalize endpoint has already completed the assessment
  // The progressive evaluation has already run, so we just need to reload and show results
  const handleQuestionsComplete = useCallback(async () => {
    // Reload the assessment to get the latest evaluation data
    // The finalize endpoint already marked the assessment as completed
    // and progressive evaluation has already populated evaluation data
    try {
      const response = await fetch(`/api/vias-transformacion/${assessment?.id}`);
      const data = await response.json();

      if (response.ok && data) {
        setAssessment(data);
        // Ensure rubric items are loaded for results display
        if (data.area && rubricItems.length === 0) {
          await loadRubricItems(data.area);
        }
        setCurrentStep('results');
      } else {
        // Fallback: still try to show results with existing data
        console.warn('Failed to reload assessment, showing results with existing data');
        setCurrentStep('results');
      }
    } catch (error) {
      console.error('Error reloading assessment:', error);
      // Fallback: still navigate to results
      setCurrentStep('results');
    }
  }, [assessment?.id, rubricItems.length, loadRubricItems]);

  // Handle sequential questions save callback
  const handleSequentialSaved = useCallback((savedAt: Date) => {
    setLastSavedAt(savedAt);
  }, []);

  // Handle sequential questions save error
  const handleSequentialSaveError = useCallback((message: string) => {
    setSaveError(message);
  }, []);

  // Add collaborators
  const handleAddCollaborators = async () => {
    if (!assessment || selectedNewCollaborators.length === 0) return;

    setAddingCollaborators(true);

    try {
      const response = await fetch(`/api/vias-transformacion/${assessment.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedNewCollaborators }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al agregar colaboradores');
      }

      toast.success(`${data.added} colaborador(es) agregado(s)`);
      setShowCollaboratorModal(false);
      setSelectedNewCollaborators([]);

      // Reload assessment to get updated collaborators
      await loadAssessment();
    } catch (error: any) {
      console.error('[AssessmentDetail] Add collaborators error:', error);
      toast.error(error.message || 'Error al agregar colaboradores');
    } finally {
      setAddingCollaborators(false);
    }
  };

  // Remove collaborator
  const handleRemoveCollaborator = async (userId: string) => {
    if (!assessment) return;

    setRemovingCollaboratorId(userId);

    try {
      const response = await fetch(`/api/vias-transformacion/${assessment.id}/collaborators`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al eliminar colaborador');
      }

      toast.success('Colaborador eliminado');

      // Update local state
      setAssessment({
        ...assessment,
        collaborators: assessment.collaborators.filter(c => c.id !== userId),
      });
    } catch (error: any) {
      console.error('[AssessmentDetail] Remove collaborator error:', error);
      toast.error(error.message || 'Error al eliminar colaborador');
    } finally {
      setRemovingCollaboratorId(null);
    }
  };

  const getAreaInfo = (area: string) => {
    const areaKey = area as TransformationArea;
    return {
      label: AREA_LABELS[areaKey] || area,
      emoji: AREA_ICONS[areaKey] || '📋',
    };
  };

  const getStatusInfo = (status: string) => {
    const statuses = {
      in_progress: { icon: Clock, label: 'En Progreso', className: 'text-blue-600' },
      completed: { icon: CheckCircle, label: 'Completado', className: 'text-green-600' },
      archived: { icon: Archive, label: 'Archivado', className: 'text-gray-500' },
    };
    return statuses[status as keyof typeof statuses] || statuses.in_progress;
  };

  // Loading state
  if (loading || authLoading) {
    return (
      <MainLayout currentPage="vias-transformacion" pageTitle="Cargando...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (pageError) {
    return (
      <MainLayout currentPage="vias-transformacion" pageTitle="Error">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-red-800 mb-2">Error</h2>
            <p className="text-red-600 mb-4">{pageError}</p>
            <button
              onClick={() => router.push('/vias-transformacion')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Volver al listado
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!assessment) {
    return (
      <MainLayout currentPage="vias-transformacion" pageTitle="No encontrado">
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500">Evaluación no encontrada</p>
        </div>
      </MainLayout>
    );
  }

  const areaInfo = getAreaInfo(assessment.area);
  const statusInfo = getStatusInfo(assessment.status);
  const StatusIcon = statusInfo.icon;

  return (
    <MainLayout currentPage="vias-transformacion" pageTitle={`${areaInfo.label} - Evaluación`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          {/* Back button */}
          <button
            onClick={() => router.push('/vias-transformacion')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al listado
          </button>

          {/* Title and meta */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="text-4xl">{areaInfo.emoji}</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {areaInfo.label}
                  <span className={`flex items-center gap-1 text-sm font-normal ${statusInfo.className}`}>
                    <StatusIcon className="h-4 w-4" />
                    {statusInfo.label}
                  </span>
                </h1>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                  {assessment.school_name && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {assessment.school_name}
                    </span>
                  )}
                  {assessment.grades.length > 0 && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-4 w-4" />
                      {formatGradesDisplay(assessment.grades)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Actualizado: {new Date(assessment.updated_at).toLocaleDateString('es-CL')}
                  </span>
                </div>

                {/* Edit/View indicator */}
                <div className="mt-2">
                  {assessment.can_edit ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      <Edit3 className="h-3 w-3" />
                      Puedes editar
                    </span>
                  ) : assessment.is_admin_viewer ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      <Eye className="h-3 w-3" />
                      Vista de administrador (solo lectura)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      <Eye className="h-3 w-3" />
                      Solo lectura
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons - PDF downloads and regenerate */}
            {currentStep === 'results' && assessment.context_metadata?.evaluation && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Regenerate button - only for collaborators */}
                {assessment.can_edit && (
                  <button
                    onClick={handleEvaluate}
                    disabled={isEvaluating}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-brand_blue hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isEvaluating ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isEvaluating ? 'Regenerando...' : 'Regenerar'}</span>
                  </button>
                )}

                {/* PDF Resumen button */}
                <button
                  onClick={() => {
                    downloadReportAsPdf({
                      communityName: assessment.school_name || 'Escuela',
                      schoolName: assessment.school_name || undefined,
                      area: assessment.area,
                      completedDate: new Date(assessment.completed_at || assessment.updated_at).toLocaleDateString('es-CL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                      evaluation: assessment.context_metadata.evaluation,
                      rubricItems,
                      responses: assessment.context_metadata?.responses || {},
                      viewMode: 'summary',
                      collaborators: assessment.collaborators,
                      grades: assessment.grades ? formatGradesDisplay(assessment.grades) : undefined,
                      creatorName: assessment.creator_name,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-brand_blue hover:bg-gray-100 rounded-lg transition"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">PDF Resumen</span>
                </button>

                {/* PDF Completo button */}
                <button
                  onClick={() => {
                    downloadReportAsPdf({
                      communityName: assessment.school_name || 'Escuela',
                      schoolName: assessment.school_name || undefined,
                      area: assessment.area,
                      completedDate: new Date(assessment.completed_at || assessment.updated_at).toLocaleDateString('es-CL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                      evaluation: assessment.context_metadata.evaluation,
                      rubricItems,
                      responses: assessment.context_metadata?.responses || {},
                      viewMode: 'detailed',
                      collaborators: assessment.collaborators,
                      grades: assessment.grades ? formatGradesDisplay(assessment.grades) : undefined,
                      creatorName: assessment.creator_name,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-brand_blue text-white hover:bg-brand_blue/90 rounded-lg transition"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">PDF Completo</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Collaborators section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Colaboradores ({assessment.collaborators.length})
            </h2>
            {assessment.can_edit && (
              <button
                onClick={() => setShowCollaboratorModal(true)}
                className="flex items-center gap-1 text-sm text-yellow-600 hover:text-yellow-700"
              >
                <UserPlus className="h-4 w-4" />
                Agregar
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {assessment.collaborators.map(collab => (
              <div
                key={collab.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  collab.is_current_user
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {collab.avatar_url ? (
                  <img src={collab.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                    {collab.full_name[0]?.toUpperCase()}
                  </div>
                )}
                <span>{collab.full_name}</span>
                {collab.role === 'creator' && (
                  <span className="text-xs text-gray-400">(creador)</span>
                )}
                {collab.is_current_user && (
                  <span className="text-xs text-yellow-600">(tú)</span>
                )}
                {assessment.can_edit &&
                  collab.role !== 'creator' &&
                  !collab.is_current_user && (
                    <button
                      onClick={() => handleRemoveCollaborator(collab.id)}
                      disabled={removingCollaboratorId === collab.id}
                      className="ml-1 text-gray-400 hover:text-red-500"
                    >
                      {removingCollaboratorId === collab.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  )}
              </div>
            ))}
          </div>
        </div>

        {/* Save indicator */}
        {lastSavedAt && (
          <div className="text-xs text-gray-400 text-right mb-2">
            Guardado {formatTimeAgo(lastSavedAt)}
          </div>
        )}

        {/* Assessment content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {currentStep === 'pre-assessment' && (
            <PreAssessmentQuestions
              onSave={handlePreAssessmentChange}
              onComplete={handlePreAssessmentComplete}
              initialAnswers={assessment.context_metadata?.preAssessmentAnswers}
              readOnly={!assessment.can_edit}
            />
          )}

          {currentStep === 'questions' && (
            <SequentialQuestions
              assessmentId={assessment.id}
              area={assessment.area as 'personalizacion' | 'aprendizaje'}
              onComplete={handleQuestionsComplete}
              initialResponses={assessment.context_metadata?.responses as Record<string, QuestionResponse> | undefined}
              onSavingStateChange={setIsSavingSequential}
              onSaved={handleSequentialSaved}
              onSaveError={handleSequentialSaveError}
              readOnly={!assessment.can_edit}
            />
          )}

          {currentStep === 'results' && assessment.context_metadata?.responses && (
            <div className="p-6 space-y-8">
              {/* Evaluation Summary and Charts - only shown when evaluation exists */}
              {assessment.context_metadata?.evaluation && (
                <>
                  <EvaluationSummary
                    evaluation={assessment.context_metadata.evaluation}
                    schoolName={assessment.school_name || undefined}
                    completedDate={
                      assessment.completed_at
                        ? new Date(assessment.completed_at).toLocaleDateString('es-CL', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : undefined
                    }
                    collaborators={assessment.collaborators}
                  />
                  <EvaluationCharts
                    evaluation={assessment.context_metadata.evaluation}
                    rubricItems={rubricItems}
                  />
                </>
              )}

              {/* Detailed Results Display */}
              <ResultsDisplay
                assessment={{
                  ...assessment,
                  conversation_history: assessment.conversation_history || [],
                  started_at: assessment.started_at,
                  finalized_at: assessment.completed_at,
                }}
                rubricItems={rubricItems}
                responses={assessment.context_metadata.responses}
                evaluation={assessment.context_metadata?.evaluation}
              />
            </div>
          )}
        </div>

        {/* Error messages */}
        {saveError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {saveError}
          </div>
        )}
        {evaluationError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {evaluationError}
          </div>
        )}
      </div>

      {/* Add Collaborators Modal */}
      {showCollaboratorModal && assessment.school_id && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={() => setShowCollaboratorModal(false)}
            />
            <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Agregar Colaboradores</h2>
                <button
                  onClick={() => setShowCollaboratorModal(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">
                <CollaboratorSelector
                  schoolId={assessment.school_id}
                  assessmentId={assessment.id}
                  selectedIds={selectedNewCollaborators}
                  onSelectionChange={setSelectedNewCollaborators}
                />
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => setShowCollaboratorModal(false)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddCollaborators}
                  disabled={addingCollaborators || selectedNewCollaborators.length === 0}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:bg-gray-300"
                >
                  {addingCollaborators ? 'Agregando...' : `Agregar (${selectedNewCollaborators.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
