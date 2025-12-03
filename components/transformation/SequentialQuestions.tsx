import { useState, useEffect, useRef, useCallback } from 'react';

// Type definitions for API response
interface LevelOption {
  value: 'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado';
  label: string;
  description: string;
}

interface AccionSection {
  type: 'accion' | 'cobertura' | 'frecuencia' | 'profundidad';
  questions: string[];
  levels?: LevelOption[];
}

interface FlattenedSection {
  sectionIndex: number;
  accionId: string;
  objetivoNumber: number;
  accionNumber: number;
  objetivoTitle: string;
  accionDescription: string;
  section: AccionSection;
}

// Response data structure
export interface SectionResponse {
  answer: string; // User's text response
  level?: 'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado'; // Only for dimension sections
  timestamp: string;
}

// Backward compatibility aliases
export type QuestionResponse = SectionResponse;
export type ObjectiveResponse = SectionResponse;

interface SequentialQuestionsProps {
  assessmentId: string;
  area: 'personalizacion' | 'aprendizaje';
  onComplete: () => void;
  initialResponses?: Record<string, SectionResponse>;
  onSavingStateChange?: (isSaving: boolean) => void;
  onSaved?: (savedAt: Date) => void;
  onSaveError?: (message: string) => void;
  readOnly?: boolean;
}

export function SequentialQuestions({
  assessmentId,
  area,
  onComplete,
  initialResponses,
  onSavingStateChange,
  onSaved,
  onSaveError,
  readOnly = false,
}: SequentialQuestionsProps) {
  // State
  const [sections, setSections] = useState<FlattenedSection[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, SectionResponse>>(initialResponses || {});
  const [currentResponse, setCurrentResponse] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado' | ''>('');
  const [showLevelSelection, setShowLevelSelection] = useState(false);
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  // Refs for auto-save debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSectionIdRef = useRef<string>('');
  const hasInitiallyLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  // FIX #3: Dynamic objective boundaries calculation
  // Calculate the last section index for each objetivo based on actual sections data
  const getLastSectionForObjective = useCallback((objectiveNumber: number): number => {
    // Find the last section that belongs to this objective
    for (let i = sections.length - 1; i >= 0; i--) {
      if (sections[i].objetivoNumber === objectiveNumber) {
        return i;
      }
    }
    return -1; // Not found
  }, [sections]);

  // Load questions from API
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setIsLoadingQuestions(true);
        setLoadError(null);

        const response = await fetch(`/api/transformation/area-questions?area=${area}`);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validation: Ensure we have sections data
        if (!data.flattened || data.flattened.length === 0) {
          throw new Error(
            `Data integrity error: No sections received. ` +
            `ACCIONes count: ${data.acciones?.length || 0}`
          );
        }

        // Log section count for debugging
        console.log(`✅ Loaded ${data.flattened.length} sections for área: ${area}`);

        // Validation: Ensure all sections have required fields
        const invalidSections = data.flattened.filter((s: FlattenedSection) =>
          !s.section || !s.section.type || !s.section.questions || s.section.questions.length === 0
        );

        if (invalidSections.length > 0) {
          throw new Error(
            `Data integrity error: ${invalidSections.length} sections are missing required fields`
          );
        }

        setSections(data.flattened);

        // Resume at first unanswered section ONLY on initial load AND only if NOT in read-only mode
        // For read-only mode (admin viewers), always start from the beginning
        // This prevents auto-navigation when responses are saved during the session
        if (!hasInitiallyLoadedRef.current &&
            !readOnly &&
            initialResponses &&
            Object.keys(initialResponses).length > 0) {
          const firstUnansweredIndex = data.flattened.findIndex((s: FlattenedSection) => {
            const sectionId = `${s.accionId}_${s.section.type}`;
            const response = initialResponses[sectionId];

            // Section is unanswered if no response exists
            if (!response || !response.answer.trim()) return true;

            // For dimension sections, also check if level is selected
            if (s.section.type !== 'accion' && !response.level) return true;

            return false;
          });

          // If found an unanswered section, resume there
          if (firstUnansweredIndex !== -1) {
            setCurrentSectionIndex(firstUnansweredIndex);
          }
        }

        // Mark initial load as complete no matter what, so subsequent updates
        // (e.g. when saving answers or when evaluations land) don't re-run the resume logic
        hasInitiallyLoadedRef.current = true;
      } catch (error) {
        console.error('Error loading questions:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido al cargar preguntas';
        setLoadError(errorMessage);
      } finally {
        setIsLoadingQuestions(false);
      }
    };

    loadQuestions();
  }, [area, initialResponses]);

  // Load saved response for current section
  // IMPORTANT: Only run when section changes, NOT when responses update (to avoid overwriting user input)
  useEffect(() => {
    // Only run if we have sections loaded
    if (sections.length === 0) return;
    if (!sections[currentSectionIndex]) return;

    const currentSectionData = sections[currentSectionIndex];
    const sectionId = `${currentSectionData.accionId}_${currentSectionData.section.type}`;
    const savedResponse = responses[sectionId];

    if (savedResponse && savedResponse.answer && savedResponse.answer.trim()) {
      // Has a saved answer
      setCurrentResponse(savedResponse.answer);

      if (savedResponse.level) {
        // Has both answer AND level saved
        setSelectedLevel(savedResponse.level);
      } else {
        // Has answer but no level yet
        setSelectedLevel('');
      }

      // For dimension sections with answers, ALWAYS show level selection UI
      // (user needs to select/review the level)
      if (currentSectionData.section.type !== 'accion') {
        setShowLevelSelection(true);
      } else {
        // ACCIÓN sections don't have level selection
        setShowLevelSelection(false);
      }
    } else {
      // No saved answer - start fresh with text input
      setCurrentResponse('');
      setSelectedLevel('');
      setShowLevelSelection(false);
    }

    // Reset edit mode when changing sections
    setIsEditingAnswer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, currentSectionIndex]);

  // Save to database
  const setSavingState = useCallback((value: boolean) => {
    if (isMountedRef.current) {
      setIsSaving(value);
    }
    onSavingStateChange?.(value);
  }, [onSavingStateChange]);

  const saveToDatabase = useCallback(async (updatedResponses: Record<string, SectionResponse>) => {
    try {
      setSavingState(true);

      const response = await fetch(`/api/transformation/assessments/${assessmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_metadata: {
            responses: updatedResponses,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('No se pudieron guardar las respuestas');
      }

      onSaved?.(new Date());
      // No need to call parent callback - parent will refetch when needed
    } catch (error) {
      console.error('Error saving responses:', error);
      if (error instanceof Error) {
        onSaveError?.(error.message);
      } else {
        onSaveError?.('Error desconocido al guardar respuestas');
      }
    } finally {
      setSavingState(false);
    }
  }, [assessmentId, onSaved, onSaveError, setSavingState]);

  // Debounced save
  const debouncedSave = useCallback((updatedResponses: Record<string, SectionResponse>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveToDatabase(updatedResponses);
    }, 1000);
  }, [saveToDatabase]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      onSavingStateChange?.(false);
    };
  }, [onSavingStateChange]);

  // Progressive Evaluation: Evaluate an objetivo after completion
  // IMPORTANT: This must be defined BEFORE any early returns (React Rules of Hooks)
  const evaluateObjective = useCallback(async (objectiveNumber: number) => {
    console.log(`🎯 Evaluating Objective ${objectiveNumber}...`);
    setIsEvaluating(true);
    setEvaluationError(null);

    try {
      const response = await fetch(`/api/transformation/assessments/${assessmentId}/evaluate-objective`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ objectiveNumber }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Error ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Objective ${objectiveNumber} evaluated successfully`);
      console.log(`   Dimensions: ${result.evaluation?.dimension_evaluations?.length || 0}`);

      return result;
    } catch (error: any) {
      console.error(`❌ Failed to evaluate Objective ${objectiveNumber}:`, error);
      setEvaluationError(error.message || 'Error al evaluar objetivo');
      throw error;
    } finally {
      setIsEvaluating(false);
    }
  }, [assessmentId]);

  // Show loading/error state
  if (isLoadingQuestions) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">
          <p className="text-gray-600">Cargando preguntas...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-900 font-bold text-lg mb-2">Error al cargar la evaluación</h3>
          <p className="text-red-700 mb-4">{loadError}</p>
          <p className="text-sm text-red-600">
            Por favor contacte al administrador del sistema. Este error indica un problema con la
            integridad de los datos de evaluación.
          </p>
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">
          <p className="text-gray-600">No se encontraron preguntas para cargar.</p>
        </div>
      </div>
    );
  }

  const totalSections = sections.length;

  // Get current section data
  const currentSectionData = sections[currentSectionIndex];
  const { section, accionId, objetivoNumber, accionNumber, objetivoTitle, accionDescription } = currentSectionData;
  const sectionId = `${accionId}_${section.type}`;
  currentSectionIdRef.current = sectionId;

  // Check if this section has been answered
  const hasAnswered = !!responses[sectionId]?.answer?.trim();

  // Handle save edited answer
  const handleSaveEditedAnswer = () => {
    if (readOnly) return;
    if (!currentResponse.trim()) return;

    const savedResponse = responses[sectionId];
    const updatedResponse: SectionResponse = {
      answer: currentResponse,
      level: savedResponse?.level, // Preserve existing level
      timestamp: new Date().toISOString(),
    };

    const updatedResponses = {
      ...responses,
      [sectionId]: updatedResponse,
    };

    setResponses(updatedResponses);
    saveToDatabase(updatedResponses); // Save immediately, no debounce
    setIsEditingAnswer(false);
  };

  // Handle submit answer button
  const handleSubmitAnswer = () => {
    if (readOnly) return;
    if (!currentResponse.trim()) return;

    const newResponse: SectionResponse = {
      answer: currentResponse,
      timestamp: new Date().toISOString(),
    };

    const updatedResponses = {
      ...responses,
      [sectionId]: newResponse,
    };

    setResponses(updatedResponses);
    debouncedSave(updatedResponses);

    // If ACCIÓN section: no level selection needed, user clicks "Siguiente" to advance
    if (section.type === 'accion') {
      return;
    }

    // If dimension section: show level selection
    setShowLevelSelection(true);
  };

  // Handle level selection
  const handleLevelSelect = (level: 'incipiente' | 'en_desarrollo' | 'avanzado' | 'consolidado') => {
    if (readOnly) return;
    setSelectedLevel(level);

    const updatedResponse: SectionResponse = {
      answer: currentResponse,
      level,
      timestamp: new Date().toISOString(),
    };

    const updatedResponses = {
      ...responses,
      [sectionId]: updatedResponse,
    };

    setResponses(updatedResponses);
    debouncedSave(updatedResponses);

    // BUG FIX: Removed auto-advance - user must click "Siguiente" button
    // This gives users time to review their selection before proceeding
  };

  // Navigation
  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
      setIsEditingAnswer(false); // Reset edit mode when navigating
    }
  };

  const handleNext = async () => {
    if (currentSectionIndex >= totalSections - 1) return;

    // In read-only mode, just navigate without evaluation
    if (readOnly) {
      setCurrentSectionIndex(prev => prev + 1);
      return;
    }

    // FIX #3: Dynamically check if this is the last section of an objective
    const currentObjective = currentSectionData?.objetivoNumber;
    const lastSectionOfCurrentObjective = currentObjective ? getLastSectionForObjective(currentObjective) : -1;
    const isLastSectionOfObjective = currentSectionIndex === lastSectionOfCurrentObjective;

    if (isLastSectionOfObjective && currentObjective) {
      console.log(`📊 Completed Objective ${currentObjective}, triggering evaluation...`);

      // FIX #1: Flush any pending debounced saves before evaluation
      // The API reads from database, so we must ensure latest responses are saved
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      try {
        // Force immediate save of current state
        console.log('💾 Flushing pending saves before evaluation...');
        await saveToDatabase(responses);
        console.log('✅ All responses saved, proceeding with evaluation');

        // Now safe to evaluate with complete data
        await evaluateObjective(currentObjective);
      } catch (error) {
        // Don't block navigation on evaluation error - user can retry later
        console.warn('Evaluation failed, but allowing navigation');
      }
    }

    // Advance to next section
    setCurrentSectionIndex(prev => prev + 1);
    setIsEditingAnswer(false);
  };

  const handleFinalize = async () => {
    // Save final state first
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsEvaluating(true);
    setEvaluationError(null);

    try {
      // Save responses
      await saveToDatabase(responses);

      // Evaluate Objective 6 (if not already evaluated)
      console.log('📊 Evaluating final Objective 6...');
      await evaluateObjective(6);

      // Generate overall summary via finalize endpoint
      console.log('🎯 Generating overall evaluation summary...');
      const finalizeResponse = await fetch(`/api/transformation/assessments/${assessmentId}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(error.error || `Error ${finalizeResponse.status}`);
      }

      const finalizeResult = await finalizeResponse.json();
      console.log('✅ Evaluation finalized successfully');

      // Complete the assessment
      onComplete();
    } catch (error: any) {
      console.error('❌ Failed to finalize assessment:', error);
      setEvaluationError(error.message || 'Error al finalizar evaluación');
      setIsEvaluating(false);
      // Don't call onComplete() on error - user can retry
    }
  };

  // Check if user can proceed to next section
  // Note: This is a regular function (not useCallback) because it's called during render
  const canProceed = () => {
    const savedResponse = responses[sectionId];

    // Must have an answer
    if (!savedResponse || !savedResponse.answer.trim()) return false;

    // For dimension sections, must have level selected when level selection is shown
    if (section.type !== 'accion') {
      // If level selection is shown (or should be shown for a saved complete response), check for level
      if (showLevelSelection || savedResponse.level) {
        return !!savedResponse.level;
      }
    }

    return true;
  };

  // Calculate progress
  const completedSections = Object.keys(responses).filter(key => {
    const response = responses[key];
    if (!response || !response.answer || !response.answer.trim()) return false;

    // Check if this is a dimension section (has levels)
    const isAccion = key.endsWith('_accion');
    if (!isAccion && !response.level) return false;

    return true;
  }).length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Read-only banner */}
      {readOnly && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm font-medium">
            Vista de solo lectura - Estás viendo las respuestas de esta evaluación
          </p>
        </div>
      )}

      {/* Loading Modal for Evaluation */}
      {isEvaluating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 max-w-md mx-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {currentSectionIndex === totalSections - 1
                  ? 'Generando Reporte Final'
                  : 'Procesando Respuestas'}
              </h3>
              <p className="text-gray-600">
                {currentSectionIndex === totalSections - 1
                  ? 'Estamos generando el reporte completo de esta vía de transformación. Esto puede tomar unos momentos...'
                  : 'Espera unos momentos, estamos procesando tus respuestas antes de seguir con el siguiente objetivo...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {evaluationError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Error en la evaluación</h3>
              <p className="text-sm text-red-700 mt-1">{evaluationError}</p>
              <p className="text-xs text-red-600 mt-2">Puedes continuar y reintentar más tarde.</p>
            </div>
            <button
              onClick={() => setEvaluationError(null)}
              className="ml-3 flex-shrink-0 text-red-400 hover:text-red-600"
            >
              <span className="sr-only">Cerrar</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header with progress */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Evaluación de Objetivos
        </h2>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Objetivo {objetivoNumber} - Acción {accionNumber}
          </p>
          <p className="text-sm font-medium text-blue-600">
            Pregunta {currentSectionIndex + 1} de {totalSections}
          </p>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 bg-gray-200 rounded-full">
          <div
            className="h-2 bg-blue-600 rounded-full transition-all"
            style={{ width: `${((currentSectionIndex + 1) / totalSections) * 100}%` }}
          />
        </div>
        <div className="mt-2 text-right text-sm text-gray-600 flex items-center justify-end gap-2">
          <span>{completedSections}/{totalSections} completadas</span>
          {isSaving && (
            <span className="flex items-center gap-1 text-blue-600">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs">Guardando...</span>
            </span>
          )}
        </div>
      </div>

      {/* Objective & Acción Context Card */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        {/* Objective Title */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Objetivo {objetivoNumber}
          </p>
          <h3 className="text-base font-semibold text-gray-900">
            {objetivoTitle}
          </h3>
        </div>

        {/* Acción Description */}
        <div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Acción {accionNumber}
          </p>
          <p className="text-sm text-gray-700">
            {accionDescription}
          </p>
        </div>
      </div>

      {/* Current section content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Section header */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 capitalize">
            {section.type === 'accion' ? 'Acción' : section.type}
          </h3>
        </div>

        {/* Questions */}
        <div className="mb-6 space-y-3">
          {section.questions.map((q, idx) => (
            <p key={idx} className="text-gray-700">
              {q}
            </p>
          ))}
        </div>

        {/* Text area for response - show ONLY if not answered yet AND not in read-only mode */}
        {!hasAnswered && !readOnly && (
          <div className="space-y-4">
            <textarea
              value={currentResponse}
              onChange={(e) => setCurrentResponse(e.target.value)}
              placeholder="Escriba su respuesta aquí..."
              rows={6}
              className="w-full border border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!currentResponse.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Ingresar respuesta
            </button>
          </div>
        )}

        {/* Show "no answer yet" message in read-only mode for unanswered questions */}
        {!hasAnswered && readOnly && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-500 text-sm italic">
            Esta pregunta aún no ha sido respondida.
          </div>
        )}

        {/* Read-only box with edit button - shown for ALL answered questions */}
        {hasAnswered && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Su respuesta:</p>
              {!isEditingAnswer && !readOnly && (
                <button
                  onClick={() => setIsEditingAnswer(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Editar respuesta
                </button>
              )}
            </div>

            {isEditingAnswer && !readOnly ? (
              <div className="space-y-2">
                <textarea
                  value={currentResponse}
                  onChange={(e) => setCurrentResponse(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg p-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEditedAnswer}
                    disabled={!currentResponse.trim()}
                    className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Guardar cambios
                  </button>
                  <button
                    onClick={() => {
                      const savedResponse = responses[sectionId];
                      if (savedResponse) {
                        setCurrentResponse(savedResponse.answer);
                      }
                      setIsEditingAnswer(false);
                    }}
                    className="text-sm px-3 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-900 whitespace-pre-wrap">{currentResponse}</p>
            )}
          </div>
        )}

        {/* Level selection - ONLY for dimension sections, shown AFTER answer submitted */}
        {hasAnswered && section.type !== 'accion' && section.levels && (
          <div className="mt-4 space-y-3">
            <p className="font-medium text-gray-900">
              {readOnly ? 'Nivel de avance seleccionado:' : 'Seleccione el nivel de avance:'}
            </p>
            {section.levels.map((level) => (
              <label
                key={level.value}
                className={`flex items-start space-x-3 p-4 border-2 rounded-lg transition-all ${
                  readOnly ? 'cursor-default' : 'cursor-pointer'
                } ${
                  selectedLevel === level.value
                    ? 'border-blue-600 bg-blue-50'
                    : readOnly
                    ? 'border-gray-200'
                    : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                }`}
              >
                <input
                  type="radio"
                  name="level"
                  value={level.value}
                  checked={selectedLevel === level.value}
                  onChange={(e) => handleLevelSelect(e.target.value as typeof level.value)}
                  disabled={readOnly}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div>
                  <p className="font-medium text-gray-900">{level.label}</p>
                  <p className="text-sm text-gray-600 mt-1">{level.description}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentSectionIndex === 0 || isEvaluating}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ← Anterior
        </button>

        {currentSectionIndex < totalSections - 1 && (
          <button
            onClick={handleNext}
            disabled={readOnly ? false : (!canProceed() || isEvaluating)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        )}

        {currentSectionIndex === totalSections - 1 && !readOnly && (
          <button
            onClick={handleFinalize}
            disabled={!canProceed() || isEvaluating}
            className="px-4 py-2 bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Finalizar Evaluación
          </button>
        )}

        {/* Show indicator when at end in read-only mode */}
        {currentSectionIndex === totalSections - 1 && readOnly && (
          <div className="px-4 py-2 text-gray-500 text-sm">
            Fin de las preguntas
          </div>
        )}
      </div>
    </div>
  );
}
