import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useAuth } from '@/hooks/useAuth';
import { PreAssessmentQuestions, PreAssessmentAnswers } from '@/components/transformation/PreAssessmentQuestions';
import { SequentialQuestions, QuestionResponse } from '@/components/transformation/SequentialQuestions';
import { ResultsDisplay } from '@/components/transformation/ResultsDisplay';
import { AreaSelectionModal } from '@/components/transformation/AreaSelectionModal';

// Type definitions for transformation assessment
interface Assessment {
  id: string;
  growth_community_id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  context_metadata: Record<string, any>;
  conversation_history?: Array<{ role: string; content: string }>;
  started_at: string;
  updated_at: string;
  completed_at?: string;
}

interface GrowthCommunity {
  id: string;
  name: string;
  school_id: string | null;
  created_at: string;
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

export default function TransformationAssessmentPage() {
  const router = useRouter();
  const { communityId: rawCommunityId, area: rawArea } = router.query;
  const supabase = useSupabaseClient();
  const { user, profile, loading: authLoading } = useAuth();

  // Normalize communityId (can be string | string[] | undefined)
  const communityId = Array.isArray(rawCommunityId)
    ? rawCommunityId[0]
    : rawCommunityId;

  const requestedAreaParam = Array.isArray(rawArea) ? rawArea[0] : rawArea;
  const requestedArea: 'personalizacion' | 'aprendizaje' | null =
    requestedAreaParam === 'personalizacion' || requestedAreaParam === 'aprendizaje'
      ? requestedAreaParam
      : null;

  const [loading, setLoading] = useState(true);
  const [isSavingPreAssessment, setIsSavingPreAssessment] = useState(false);
  const [isSavingSequential, setIsSavingSequential] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [community, setCommunity] = useState<GrowthCommunity | null>(null);
  const [currentStep, setCurrentStep] = useState<AssessmentStep>('pre-assessment');
  const [rubricItems, setRubricItems] = useState<RubricItem[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [needsRegeneration, setNeedsRegeneration] = useState(false);
  const [, setTimeAgoTick] = useState(0);

  // Área selection state (only for new assessments)
  const [selectedArea, setSelectedArea] = useState<'personalizacion' | 'aprendizaje' | null>(null);

  // Exit confirmation state
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showAreaSelection, setShowAreaSelection] = useState(false);
  const [preferredArea, setPreferredArea] = useState<'personalizacion' | 'aprendizaje' | null>(null);

  // Use ref instead of state to prevent triggering useEffect
  const hasInitialized = useRef(false);
  const isInitializing = useRef(false);
  const hasAutoAdvancedToQuestions = useRef(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Load or create assessment
  useEffect(() => {
    console.log('🔍 useEffect triggered:', {
      isReady: router.isReady,
      communityId,
      hasInitialized: hasInitialized.current,
      isInitializing: isInitializing.current,
      hasAssessment: !!assessment,
      hasUser: !!user,
    });

    // Guard: Only run once per component lifecycle
    if (hasInitialized.current) {
      console.log('✅ Already initialized, skipping');
      return;
    }

    // Wait for router to be ready
    if (!router.isReady) {
      console.log('⏳ Router not ready yet, waiting...');
      return;
    }

    console.log('📍 Router query:', router.query);
    console.log('📍 CommunityId from URL:', communityId);

    // Check for authenticated user
    if (!user) {
      console.log('⏳ Waiting for user authentication...');
      return;
    }

    // Validate communityId
    if (!communityId || typeof communityId !== 'string') {
      console.error('❌ No valid communityId in URL');
      setPageError('Debes indicar communityId en la URL.');
      setLoading(false);
      return;
    }

    // Guard: Prevent running while already initializing
    if (isInitializing.current) {
      console.log('⏳ Already initializing assessment, skipping useEffect...');
      return;
    }

    console.log('✅ All conditions met, starting initialization');

    // Mark as initializing BEFORE calling async function
    isInitializing.current = true;

    const initializeAssessment = async () => {

      try {
        setLoading(true);
        setPageError(null);

        // Fetch community details
        const { data: communityData, error: communityError } = await supabase
          .from('growth_communities')
          .select('*')
          .eq('id', communityId)
          .single();

        if (communityError) {
          throw new Error(`Error al cargar la comunidad: ${communityError.message}`);
        }

        if (!communityData) {
          throw new Error('Comunidad no encontrada');
        }

        setCommunity(communityData);

        // Check if assessment already exists (any área)
        const { data: existingAssessments, error: fetchError } = await supabase
          .from('transformation_assessments')
          .select('*')
          .eq('growth_community_id', communityId)
          .order('started_at', { ascending: false });

        if (fetchError) {
          throw new Error(`Error al verificar evaluación: ${fetchError.message}`);
        }

        // For now, load the most recent assessment (future: allow selecting between multiple)
        const assessmentsList = existingAssessments ?? [];

        if (requestedArea) {
          const matchingAssessment = assessmentsList.find(
            (assessment) => assessment.area === requestedArea
          );

          if (matchingAssessment) {
            setAssessment(matchingAssessment);
            setSelectedArea(requestedArea);
            console.log('📋 Evaluación existente cargada:', matchingAssessment.id, 'área:', matchingAssessment.area);
            hasInitialized.current = true;
          } else {
            console.log('🎯 No existe evaluación para el área solicitada, mostrando selección:', requestedArea);
            setPreferredArea(requestedArea);
            setShowAreaSelection(true);
            setLoading(false);
            hasInitialized.current = true;
            return;
          }
        } else if (assessmentsList.length > 0) {
          const existingAssessment = assessmentsList[0];
          setAssessment(existingAssessment);
          setSelectedArea(existingAssessment.area as 'personalizacion' | 'aprendizaje');
          console.log('📋 Evaluación existente cargada:', existingAssessment.id, 'área:', existingAssessment.area);
          hasInitialized.current = true;
        } else {
          console.log('🎯 No hay evaluación existente, mostrando selección de área');
          setShowAreaSelection(true);
          setPreferredArea(null);
          setLoading(false);
          hasInitialized.current = true;
          return;
        }
      } catch (err) {
        console.error('❌ Error al inicializar evaluación:', err);
        setPageError(err instanceof Error ? err.message : 'Error desconocido');
        // Mark as initialized even on error to prevent retry loop
        hasInitialized.current = true;
      } finally {
        setLoading(false);
        isInitializing.current = false;
      }
    };

    initializeAssessment();
  }, [router.isReady, user, communityId, supabase]);

  // Handle área selection when creating new assessment
  const handleAreaSelect = useCallback(async (area: 'personalizacion' | 'aprendizaje') => {
    if (!communityId) {
      console.error('No communityId available for assessment creation');
      return;
    }

    try {
      setLoading(true);
      setShowAreaSelection(false);
      setSelectedArea(area);

      console.log('✨ Creando nueva evaluación con área:', area);

      // Create new assessment via API
      const response = await fetch('/api/transformation/assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          communityId: communityId,
          area: area,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear evaluación');
      }

      const newAssessment = await response.json();
      setAssessment(newAssessment);
      setPreferredArea(null);
      console.log('✅ Nueva evaluación creada:', newAssessment.id, 'área:', area);

    } catch (err) {
      console.error('❌ Error al crear evaluación:', err);
      setPageError(err instanceof Error ? err.message : 'Error al crear evaluación');
      setShowAreaSelection(true); // Show modal again on error
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  // Handle exit assessment with confirmation
  const handleExitAssessment = useCallback(() => {
    // If on results page, just go back without confirmation
    if (currentStep === 'results') {
      router.push(`/community/workspace?section=transformation`);
      return;
    }

    // Otherwise, show confirmation modal
    setShowExitConfirmation(true);
  }, [currentStep, router]);

  const confirmExit = useCallback(() => {
    router.push(`/community/workspace?section=transformation`);
  }, [router]);

  const cancelExit = useCallback(() => {
    setShowExitConfirmation(false);
  }, []);

  // Load rubric items when moving to results step
  useEffect(() => {
    const loadRubricItems = async () => {
      if (currentStep === 'results' && rubricItems.length === 0 && assessment?.area) {
        try {
          const { data, error } = await supabase
            .from('transformation_rubric')
            .select('*')
            .eq('area', assessment.area)
            .order('display_order', { ascending: true});

          if (error) {
            console.error('Error loading rubric items:', error);
          } else if (data) {
            setRubricItems(data);
          }
        } catch (err) {
          console.error('Failed to load rubric items:', err);
        }
      }
    };

    loadRubricItems();
  }, [currentStep, rubricItems.length, assessment?.area, supabase]);

  // Set initial step based on assessment status and data
  useEffect(() => {
    if (!assessment) return;

    const hasEvaluation = assessment.context_metadata?.evaluation;
    const hasResponses = assessment.context_metadata?.responses;
    const preAssessmentAnswers = assessment.context_metadata?.preAssessmentAnswers as PreAssessmentAnswers | undefined;
    const hasPreAssessmentData =
      !!preAssessmentAnswers &&
      Object.values(preAssessmentAnswers).some((value) =>
        Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== ''
      );
    const preAssessmentComplete = isPreAssessmentComplete(preAssessmentAnswers);
    const isCompleted = assessment.status === 'completed';

    console.log('🔍 Step routing check:', {
      hasAssessment: !!assessment,
      currentStep,
      hasEvaluation: !!hasEvaluation,
      hasResponses: !!hasResponses,
      hasPreAssessmentData,
      preAssessmentComplete,
      status: assessment.status,
      isCompleted
    });

    // CRITICAL FIX: Check for evaluation FIRST, regardless of completion status
    // This prevents bouncing back to questions after evaluation completes
    if (hasEvaluation) {
      // If we have an evaluation, stay/go to results
      // Don't change step if already on results (prevents unnecessary re-renders)
      if (currentStep !== 'results') {
        setCurrentStep('results');
        console.log('🎯 Evaluación disponible - mostrando resultados');
      }
      return;
    } else if (isCompleted) {
      // Completed but no evaluation yet (shouldn't happen, but handle gracefully)
      // This might be a completed assessment without AI evaluation
      if (currentStep !== 'results') {
        setCurrentStep('results');
        console.log('✅ Evaluación completada sin IA - mostrando resultados');
      }
      return;
    }

    if (hasResponses) {
      if (currentStep === 'pre-assessment' && !hasAutoAdvancedToQuestions.current) {
        hasAutoAdvancedToQuestions.current = true;
        setCurrentStep('questions');
        console.log('📝 Continuando con preguntas (respuestas previas detectadas)');
      } else if (currentStep !== 'questions' && currentStep !== 'results') {
        setCurrentStep('questions');
        console.log('📝 Continuando con preguntas');
      }
      return;
    }

    if (preAssessmentComplete) {
      if (currentStep === 'pre-assessment' && !hasAutoAdvancedToQuestions.current) {
        hasAutoAdvancedToQuestions.current = true;
        setCurrentStep('questions');
        console.log('📋 Contexto completado - iniciando preguntas');
      }
      return;
    }

    // Pre-assessment incomplete and no sequential responses - stay on step 1
    hasAutoAdvancedToQuestions.current = false;
    if (currentStep !== 'pre-assessment') {
      setCurrentStep('pre-assessment');
      console.log('⏮️ Contexto incompleto - regresando a Paso 1');
    }
    // Otherwise stay at 'pre-assessment' (default for new assessments)
  }, [assessment, currentStep]); // IMPORTANT: Add currentStep to dependencies

  // Migrate legacy data from sequentialResponses to responses
  useEffect(() => {
    if (!assessment) return;

    const hasLegacyData = assessment.context_metadata?.sequentialResponses;
    const hasNewData = assessment.context_metadata?.responses;

    console.log('🔍 Checking for migration:', {
      hasLegacyData: !!hasLegacyData,
      hasNewData: !!hasNewData,
      keys: Object.keys(assessment.context_metadata || {})
    });

    // If we have old data but not new data, migrate it
    if (hasLegacyData && !hasNewData) {
      console.log('🔄 Migrando datos históricos de sequentialResponses a responses');

      // Hydrate in memory
      setAssessment(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          context_metadata: {
            ...prev.context_metadata,
            responses: prev.context_metadata.sequentialResponses,
          }
        };
      });

      // Also save to database for future loads
      const migrateData = async () => {
        try {
          const { error: updateError } = await supabase
            .from('transformation_assessments')
            .update({
              context_metadata: {
                ...assessment.context_metadata,
                responses: assessment.context_metadata.sequentialResponses,
              }
            })
            .eq('id', assessment.id);

          if (updateError) {
            console.error('Error migrando datos:', updateError);
          } else {
            console.log('✅ Datos migrados exitosamente a la base de datos');
          }
        } catch (err) {
          console.error('Error en migración:', err);
        }
      };

      migrateData();
    }
  }, [assessment, supabase]);

  // 🔍 DIAGNOSTIC: Log database response keys
  useEffect(() => {
    if (assessment?.context_metadata?.responses) {
      console.log('🔍 DIAGNOSTIC: All response keys in database:');
      const keys = Object.keys(assessment.context_metadata.responses);
      keys.forEach(key => {
        console.log('  -', key);
      });
      console.log('🔍 Total keys:', keys.length);

      console.log('🔍 Sample response values:');
      keys.slice(0, 5).forEach(key => {
        console.log('  Key:', key);
        console.log('  Value:', assessment.context_metadata.responses[key]);
      });
    }
  }, [assessment]);

  // Handler to save pre-assessment answers
  const handleSavePreAssessment = async (answers: PreAssessmentAnswers) => {
    if (!assessment) return;

    try {
      setIsSavingPreAssessment(true);
      setSaveError(null);

      const response = await fetch(`/api/transformation/assessments/${assessment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context_metadata: {
            ...assessment.context_metadata,
            preAssessmentAnswers: answers,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar respuestas');
      }

      const updatedAssessment = await response.json();
      setAssessment(updatedAssessment);
      setLastSavedAt(new Date());
      setSaveError(null);
      console.log('💾 Respuestas guardadas automáticamente');
    } catch (err) {
      console.error('Error al guardar respuestas:', err);
      setSaveError(err instanceof Error ? err.message : 'Error desconocido al guardar respuestas');
      // Don't show error to user for auto-save failures
    } finally {
      setIsSavingPreAssessment(false);
    }
  };

  const handleSequentialSavingState = useCallback((savingState: boolean) => {
    setIsSavingSequential(savingState);
    if (savingState) {
      setSaveError(null);
    }
  }, []);

  const handleSequentialSaved = useCallback((timestamp: Date) => {
    setLastSavedAt(timestamp);
    setSaveError(null);
  }, []);

  const handleSequentialSaveError = useCallback((message: string) => {
    setSaveError(message);
  }, []);

  useEffect(() => {
    if (!lastSavedAt) return;

    const interval = setInterval(() => {
      setTimeAgoTick((tick) => tick + 1);
    }, 30000);

    return () => clearInterval(interval);
  }, [lastSavedAt]);

  useEffect(() => {
    if (!assessment?.updated_at) return;

    setLastSavedAt((prev) => prev ?? new Date(assessment.updated_at));
  }, [assessment?.updated_at]);

  // Handler when pre-assessment is completed
  const handlePreAssessmentComplete = async (answers: PreAssessmentAnswers) => {
    // Save final answers
    await handleSavePreAssessment(answers);
    // Move to next step
    setCurrentStep('questions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler to go back one step
  const handleBackStep = () => {
    if (currentStep === 'questions') {
      setCurrentStep('pre-assessment');
    } else if (currentStep === 'results') {
      setCurrentStep('questions');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler when sequential questions are completed
  const handleQuestionsComplete = async () => {
    if (!assessment) return;

    try {
      console.log('📋 Questions complete - updating status to completed');

      // CRITICAL: Update status to 'completed' FIRST before triggering evaluation
      // This prevents race condition where evaluate API rejects due to status check
      const { error: updateError } = await supabase
        .from('transformation_assessments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', assessment.id);

      if (updateError) {
        console.error('Error updating status to completed:', updateError);
        setPageError('Error al actualizar el estado de la evaluación');
        return;
      }

      console.log('✅ Status updated to completed');

      // Update local state
      setAssessment(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      // Move to results step
      setCurrentStep('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Trigger AI evaluation if not already evaluated OR if regeneration is needed
      if (needsRegeneration || !assessment.context_metadata?.evaluation) {
        setNeedsRegeneration(false); // Reset flag
        console.log('🤖 Triggering AI evaluation...');
        await handleTriggerEvaluation();
      }
    } catch (err) {
      console.error('Error in handleQuestionsComplete:', err);
      setPageError('Error al completar la evaluación');
    }
  };

  // Handler to trigger AI evaluation
  const handleTriggerEvaluation = async () => {
    if (!assessment) return;

    try {
      setIsEvaluating(true);
      setEvaluationError(null); // Clear previous evaluation errors

      const response = await fetch(`/api/transformation/assessments/${assessment.id}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar evaluación');
      }

      // Reload assessment to get updated evaluation
      const { data: updatedAssessment, error: fetchError } = await supabase
        .from('transformation_assessments')
        .select('*')
        .eq('id', assessment.id)
        .single();

      if (fetchError) {
        throw new Error('Error al recargar evaluación');
      }

      setAssessment(updatedAssessment);
      console.log('✅ Evaluación generada exitosamente');
    } catch (err) {
      console.error('Error al generar evaluación:', err);
      setEvaluationError(
        'Ocurrió un error al generar la evaluación. Por favor, inténtalo de nuevo.'
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handler to edit responses
  const handleEditResponses = () => {
    setNeedsRegeneration(true); // Mark that we need fresh evaluation
    setCurrentStep('questions'); // Return to questions step
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler to finalize assessment
  const handleFinalizeAssessment = async () => {
    if (!assessment) return;

    const confirmFinalize = window.confirm(
      '¿Estás seguro de que deseas finalizar esta evaluación? No podrás editarla después.'
    );

    if (!confirmFinalize) return;

    try {
      setIsFinalizing(true);
      setPageError(null);

      const response = await fetch(`/api/transformation/assessments/${assessment.id}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al finalizar evaluación');
      }

      // Show success message
      alert('¡Evaluación finalizada exitosamente!');

      // Reload assessment
      const { data: updatedAssessment } = await supabase
        .from('transformation_assessments')
        .select('*')
        .eq('id', assessment.id)
        .single();

      if (updatedAssessment) {
        setAssessment(updatedAssessment);
      }
    } catch (err) {
      console.error('Error al finalizar evaluación:', err);
      setPageError(err instanceof Error ? err.message : 'Error al finalizar evaluación');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Get step information
  const getStepInfo = () => {
    switch (currentStep) {
      case 'pre-assessment':
        return { number: 1, total: 3, title: 'Contexto Institucional' };
      case 'questions':
        return { number: 2, total: 3, title: 'Preguntas Secuenciales' };
      case 'results':
        return { number: 3, total: 3, title: 'Resultados' };
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  // Show error for missing communityId
  if (!communityId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error: Comunidad no especificada</h2>
          <p className="text-red-600 mb-4">
            No se proporcionó un ID de comunidad en la URL.
          </p>
          <button
            onClick={() => router.back()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while fetching data
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando evaluación...</p>
        </div>
      </div>
    );
  }

  // Show área selection modal (only for new assessments)
  if (showAreaSelection) {
    return <AreaSelectionModal onSelect={handleAreaSelect} initialArea={preferredArea} />;
  }

  // Show error state
  if (pageError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error</h2>
          <p className="text-red-600 mb-4">{pageError}</p>
          <button
            onClick={() => router.back()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Main assessment page UI
  const firstName = profile?.first_name || 'Usuario';
  const communityName = community?.name || 'Comunidad';
  const activeArea =
    (assessment?.area as 'personalizacion' | 'aprendizaje' | undefined) ??
    selectedArea ??
    preferredArea ??
    'personalizacion';

  const areaLabel = activeArea === 'aprendizaje' ? 'Aprendizaje' : 'Personalización';
  const stepInfo = getStepInfo();
  const isSaving = isSavingPreAssessment || isSavingSequential;
  const lastSavedLabel = lastSavedAt ? formatTimeAgo(lastSavedAt) : null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Evaluación de Transformación: {areaLabel}
              </h1>
              <p className="text-lg text-gray-600 mb-1">
                Hola, {firstName}
              </p>
              <p className="text-sm text-gray-500">
                Comunidad: <span className="font-medium">{communityName}</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Save status */}
              <div className="flex items-center gap-2 text-sm">
                {isSaving ? (
                  <div className="flex items-center gap-2 text-blue-600">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="font-medium">Guardando...</span>
                  </div>
                ) : lastSavedLabel ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Guardado {lastSavedLabel}</span>
                  </div>
                ) : null}
              </div>

              {/* Exit button */}
              <button
                onClick={handleExitAssessment}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>{currentStep === 'results' ? 'Volver al Espacio' : 'Salir'}</span>
              </button>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">
                Paso {stepInfo.number} de {stepInfo.total}
              </span>
              <span className="text-sm text-slate-600">{stepInfo.title}</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`flex-1 h-2 rounded-full transition-colors ${
                    step <= stepInfo.number ? 'bg-sky-600' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">
                  Tus respuestas se guardan automáticamente.
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Puedes salir y volver en cualquier momento — encontrarás tu progreso exactamente donde lo dejaste.
                </p>
              </div>
            </div>
          </div>

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-rose-900">No pudimos guardar algunos cambios</p>
                  <p className="text-sm text-rose-700 mt-1">
                    {saveError}. Revisa tu conexión a internet o intenta nuevamente más tarde.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Back Button */}
        {currentStep !== 'pre-assessment' && (
          <button
            onClick={handleBackStep}
            className="mb-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Volver
          </button>
        )}

        {/* Step Content */}
        {currentStep === 'pre-assessment' && assessment && (
          <PreAssessmentQuestions
            onSave={handleSavePreAssessment}
            onComplete={handlePreAssessmentComplete}
            initialAnswers={assessment.context_metadata?.preAssessmentAnswers}
          />
        )}

        {currentStep === 'questions' && assessment && (
          <SequentialQuestions
            assessmentId={assessment.id}
            area={assessment.area as 'personalizacion' | 'aprendizaje'}
            onComplete={handleQuestionsComplete}
            initialResponses={assessment.context_metadata?.responses as Record<string, QuestionResponse> | undefined}
            onSavingStateChange={handleSequentialSavingState}
            onSaved={handleSequentialSaved}
            onSaveError={handleSequentialSaveError}
          />
        )}

        {currentStep === 'results' && assessment && (
          <div className="space-y-6">
            {/* Loading State while evaluating */}
            {isEvaluating && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-full mb-4">
                    <svg
                      className="animate-spin h-8 w-8 text-sky-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-sky-900 mb-2">
                    Generando Reporte Final
                  </h3>
                  <p className="text-sm text-sky-700">
                    Estamos generando el reporte completo de esta vía de transformación. Esto puede tomar varios minutos...
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {evaluationError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-red-900 font-semibold mb-1">Error</h3>
                    <p className="text-red-700 text-sm mb-3">{evaluationError}</p>
                    <button
                      onClick={handleTriggerEvaluation}
                      disabled={isEvaluating}
                      className="text-sm font-semibold text-red-600 hover:text-red-800 underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isEvaluating ? 'Reintentando...' : 'Reintentar evaluación'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Results Display with Professional Visualizations */}
            {!isEvaluating && rubricItems.length > 0 && assessment.context_metadata?.responses && (
              <>
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

                {/* Action Buttons */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-slate-600">
                      {assessment.status === 'completed' ? (
                        <span className="inline-flex items-center gap-2 text-emerald-700 font-semibold">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Evaluación finalizada
                        </span>
                      ) : (
                        'Revisa los resultados y finaliza cuando estés listo'
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {assessment.status !== 'completed' && (
                        <>
                          <button
                            onClick={handleEditResponses}
                            className="px-6 py-3 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                          >
                            Editar Respuestas
                          </button>
                          <button
                            onClick={handleFinalizeAssessment}
                            disabled={isFinalizing}
                            className="px-6 py-3 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {isFinalizing ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Finalizando...
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Confirmar y Finalizar
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Exit Confirmation Modal */}
        {showExitConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    ¿Salir de la evaluación?
                  </h3>
                  <p className="text-gray-600 text-sm mb-1">
                    Tus respuestas han sido guardadas automáticamente. Podrás continuar donde lo dejaste cuando regreses.
                  </p>
                  <p className="text-gray-600 text-sm">
                    ¿Deseas salir ahora?
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelExit}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Continuar Evaluación
                </button>
                <button
                  onClick={confirmExit}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sí, Salir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
