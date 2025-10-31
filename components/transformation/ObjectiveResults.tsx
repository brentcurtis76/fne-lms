import { DimensionCard } from './DimensionCard';

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

interface DimensionResponse {
  rubricItemId: string;
  response: string;
  answer?: string;  // Legacy field name from database
  suggestedLevel: number | null;
  confirmedLevel: number | null;
  lastUpdated: string;
}

interface ActionGroup {
  actionNumber: number;
  actionText: string;
  dimensions: {
    cobertura: RubricItem;
    frecuencia: RubricItem;
    profundidad: RubricItem;
  };
}

interface ObjectiveGroup {
  objectiveNumber: number;
  objectiveText: string;
  actions: ActionGroup[];
}

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
}

interface AssessmentEvaluation {
  overall_stage: number;
  overall_stage_label: 'Incipiente' | 'Emergente' | 'Avanzado' | 'Consolidado';
  dimension_evaluations: DimensionEvaluation[];
  strengths: string[];
  growth_areas: string[];
  summary: string;
  recommendations: string[];
}

interface ObjectiveResultsProps {
  objective: ObjectiveGroup;
  responses: Record<string, DimensionResponse>;
  viewMode: 'detailed' | 'summary';
  evaluation?: AssessmentEvaluation;
}

const dimensionLabels = {
  cobertura: 'Cobertura',
  frecuencia: 'Frecuencia',
  profundidad: 'Profundidad',
};

const dimensionIcons = {
  cobertura: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  frecuencia: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  profundidad: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

const dimensionColors = {
  cobertura: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
  },
  frecuencia: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
  },
  profundidad: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
  },
};

export function ObjectiveResults({ objective, responses, viewMode, evaluation }: ObjectiveResultsProps) {

  // Helper to find evaluation for a specific rubric item
  const getEvaluationForItem = (rubricItemId: string): DimensionEvaluation | undefined => {
    return evaluation?.dimension_evaluations.find(e => e.rubricItemId === rubricItemId);
  };
  return (
    <div className="p-6 space-y-6">
      {objective.actions.map((action) => {
        // Check completion for this action
        const coberturaResponse = responses[action.dimensions.cobertura.id];
        const frecuenciaResponse = responses[action.dimensions.frecuencia.id];
        const profundidadResponse = responses[action.dimensions.profundidad.id];

        // Normalize legacy 'answer' field to 'response' field
        if (coberturaResponse && !coberturaResponse.response && coberturaResponse.answer) {
          coberturaResponse.response = coberturaResponse.answer;
        }
        if (frecuenciaResponse && !frecuenciaResponse.response && frecuenciaResponse.answer) {
          frecuenciaResponse.response = frecuenciaResponse.answer;
        }
        if (profundidadResponse && !profundidadResponse.response && profundidadResponse.answer) {
          profundidadResponse.response = profundidadResponse.answer;
        }

        // 🔍 DIAGNOSTIC: Log response lookup for this action
        console.log('🔍 DIAGNOSTIC: Looking up responses for action:', {
          objectiveNum: objective.objectiveNumber,
          actionNum: action.actionNumber,
          actionText: action.actionText.substring(0, 50) + '...',
          coberturaId: action.dimensions.cobertura.id,
          frecuenciaId: action.dimensions.frecuencia.id,
          profundidadId: action.dimensions.profundidad.id,
          coberturaFound: !!coberturaResponse,
          frecuenciaFound: !!frecuenciaResponse,
          profundidadFound: !!profundidadResponse,
          coberturaHasText: coberturaResponse?.response ? 'YES' : 'NO',
          frecuenciaHasText: frecuenciaResponse?.response ? 'YES' : 'NO',
          profundidadHasText: profundidadResponse?.response ? 'YES' : 'NO',
          totalResponsesAvailable: Object.keys(responses).length
        });

        const actionDimensionsCompleted = [
          coberturaResponse?.response?.trim(),
          frecuenciaResponse?.response?.trim(),
          profundidadResponse?.response?.trim(),
        ].filter(Boolean).length;

        const actionProgress = Math.round((actionDimensionsCompleted / 3) * 100);

        return (
          <div
            key={action.actionNumber}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          >
            {/* Action Header */}
            <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-sm font-bold">
                      {action.actionNumber}
                    </span>
                    <h4 className="text-base font-semibold text-slate-900">
                      Acción {action.actionNumber}
                    </h4>
                  </div>
                  <p className="text-sm text-slate-700 ml-11">{action.actionText}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-slate-500 mb-1">
                    {actionDimensionsCompleted}/3 dimensiones
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                    <div className="w-16 bg-emerald-200 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${actionProgress}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-emerald-700">{actionProgress}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dimensions Grid */}
            <div className="p-6">
              {viewMode === 'detailed' ? (
                <div className="space-y-4">
                  <DimensionCard
                    dimension="cobertura"
                    label={dimensionLabels.cobertura}
                    icon={dimensionIcons.cobertura}
                    colors={dimensionColors.cobertura}
                    rubricItem={action.dimensions.cobertura}
                    response={coberturaResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.cobertura.id)}
                  />
                  <DimensionCard
                    dimension="frecuencia"
                    label={dimensionLabels.frecuencia}
                    icon={dimensionIcons.frecuencia}
                    colors={dimensionColors.frecuencia}
                    rubricItem={action.dimensions.frecuencia}
                    response={frecuenciaResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.frecuencia.id)}
                  />
                  <DimensionCard
                    dimension="profundidad"
                    label={dimensionLabels.profundidad}
                    icon={dimensionIcons.profundidad}
                    colors={dimensionColors.profundidad}
                    rubricItem={action.dimensions.profundidad}
                    response={profundidadResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.profundidad.id)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <DimensionCard
                    dimension="cobertura"
                    label={dimensionLabels.cobertura}
                    icon={dimensionIcons.cobertura}
                    colors={dimensionColors.cobertura}
                    rubricItem={action.dimensions.cobertura}
                    response={coberturaResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.cobertura.id)}
                    compact
                  />
                  <DimensionCard
                    dimension="frecuencia"
                    label={dimensionLabels.frecuencia}
                    icon={dimensionIcons.frecuencia}
                    colors={dimensionColors.frecuencia}
                    rubricItem={action.dimensions.frecuencia}
                    response={frecuenciaResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.frecuencia.id)}
                    compact
                  />
                  <DimensionCard
                    dimension="profundidad"
                    label={dimensionLabels.profundidad}
                    icon={dimensionIcons.profundidad}
                    colors={dimensionColors.profundidad}
                    rubricItem={action.dimensions.profundidad}
                    response={profundidadResponse}
                    dimensionEval={getEvaluationForItem(action.dimensions.profundidad.id)}
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
