import { useState, useMemo } from 'react';
import { ObjectiveResults } from './ObjectiveResults';

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

interface Assessment {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  context_metadata: {
    responses?: Record<string, DimensionResponse>;
    [key: string]: unknown;
  };
  conversation_history: Array<{ role: string; content: string }>;
  started_at: string;
  updated_at: string;
  finalized_at?: string;
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

interface ResultsDisplayProps {
  assessment: Assessment;
  rubricItems: RubricItem[];
  responses: Record<string, DimensionResponse>;
  evaluation?: AssessmentEvaluation;
}

// Group rubric items by objective and action
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

function groupByObjectiveAndAction(rubricItems: RubricItem[]): ObjectiveGroup[] {
  const objectivesMap: Record<number, ObjectiveGroup> = {};

  rubricItems.forEach((item) => {
    // Ensure objective exists
    if (!objectivesMap[item.objective_number]) {
      objectivesMap[item.objective_number] = {
        objectiveNumber: item.objective_number,
        objectiveText: item.objective_text,
        actions: [],
      };
    }

    const objective = objectivesMap[item.objective_number];

    // Find or create action group
    let action = objective.actions.find((a) => a.actionNumber === item.action_number);
    if (!action) {
      action = {
        actionNumber: item.action_number,
        actionText: item.action_text,
        dimensions: {} as any,
      };
      objective.actions.push(action);
    }

    // Add dimension to action
    action.dimensions[item.dimension] = item;
  });

  // Sort objectives and actions
  const objectives = Object.values(objectivesMap).sort((a, b) => a.objectiveNumber - b.objectiveNumber);
  objectives.forEach((obj) => {
    obj.actions.sort((a, b) => a.actionNumber - b.actionNumber);
  });

  return objectives;
}

export function ResultsDisplay({ assessment, rubricItems, responses, evaluation }: ResultsDisplayProps) {
  const [expandedObjectives, setExpandedObjectives] = useState<Set<number>>(new Set([1])); // First objective expanded by default
  const [viewMode, setViewMode] = useState<'detailed' | 'summary'>('detailed');

  // 🔍 DIAGNOSTIC: Log props received by ResultsDisplay
  console.log('🔍 DIAGNOSTIC: ResultsDisplay props:', {
    hasAssessment: !!assessment,
    hasEvaluation: !!evaluation,
    hasResponses: !!responses,
    responseCount: responses ? Object.keys(responses).length : 0,
    hasRubricItems: !!rubricItems,
    rubricItemCount: rubricItems ? rubricItems.length : 0
  });

  // Map semantic keys to UUID keys if needed
  const mappedResponses = useMemo(() => {
    console.log('🔍 DIAGNOSTIC: Starting response mapping');
    console.log('🔍 Input responses:', responses ? Object.keys(responses).length : 0, 'keys');
    console.log('🔍 Input rubricItems:', rubricItems ? rubricItems.length : 0, 'items');

    if (!responses || !rubricItems) {
      console.log('⚠️ DIAGNOSTIC: Missing responses or rubricItems');
      return {};
    }

    const firstKey = Object.keys(responses)[0];
    if (!firstKey) {
      return {};
    }

    // UUIDs have 4-5 hyphens, semantic keys have 0-2
    // UUID example: a6bed0f2-cf31-4bfd-b1a3-299965de7359 (4 hyphens)
    // Semantic examples: obj1-accion (1 hyphen), objetivo1_accion1_accion (0 hyphens)
    const hyphenCount = (firstKey.match(/-/g) || []).length;
    const isUUID = hyphenCount >= 4;

    console.log('🔍 ResultsDisplay: First key:', firstKey);
    console.log('🔍 Hyphen count:', hyphenCount);
    console.log('🔍 Detected as UUID?', isUUID);

    if (isUUID) {
      console.log('✅ ResultsDisplay: Responses already in UUID format');
      // STILL NEED TO NORMALIZE answer → response for legacy data!
      const normalized: Record<string, DimensionResponse> = {};
      for (const [key, value] of Object.entries(responses)) {
        normalized[key] = {
          ...value,
          response: value.response || value.answer || '',  // Normalize legacy 'answer' field
        };
      }
      return normalized;
    }

    // Map semantic keys to UUIDs
    console.log('🔄 ResultsDisplay: Converting semantic keys to UUID format');
    const mapped: Record<string, DimensionResponse> = {};

    for (const [semanticKey, response] of Object.entries(responses)) {
      const match = semanticKey.match(/objetivo(\d+)_accion(\d+)_(\w+)/);
      if (!match) {
        console.warn(`⚠️ ResultsDisplay: Unrecognized key: ${semanticKey}`);
        continue;
      }

      const [, objNum, actNum, dimType] = match;
      const rubricItem = rubricItems.find(item =>
        item.objective_number === parseInt(objNum) &&
        item.action_number === parseInt(actNum) &&
        item.dimension === dimType
      );

      if (rubricItem) {
        // Normalize field names: "answer" → "response" for consistency
        mapped[rubricItem.id] = {
          ...response,  // Keep all original fields
          response: response.answer || response.response || '',  // Ensure "response" field exists
        };

        console.log(`✅ ResultsDisplay: Mapped ${semanticKey} → ${rubricItem.id}`);
        console.log('  Response preview:', (response.answer || response.response || '').substring(0, 50));
      } else {
        console.warn(`⚠️ ResultsDisplay: No rubric item for ${semanticKey}`);
      }
    }

    console.log('🔍 DIAGNOSTIC: Mapping complete');
    console.log('🔍 Output mapped responses:', Object.keys(mapped).length, 'keys');
    console.log('🔍 Output keys:', Object.keys(mapped).slice(0, 10));
    console.log('🔍 Sample mapped values:', Object.entries(mapped).slice(0, 3));

    return mapped;
  }, [responses, rubricItems]);

  // 🔍 DIAGNOSTIC: Log final mapped responses
  console.log('🔍 DIAGNOSTIC: Final mappedResponses available to component:', {
    hasMappedResponses: !!mappedResponses,
    mappedResponseCount: mappedResponses ? Object.keys(mappedResponses).length : 0,
    firstFewKeys: mappedResponses ? Object.keys(mappedResponses).slice(0, 5) : []
  });

  const objectives = groupByObjectiveAndAction(rubricItems);

  const toggleObjective = (objectiveNumber: number) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(objectiveNumber)) {
        next.delete(objectiveNumber);
      } else {
        next.add(objectiveNumber);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedObjectives(new Set(objectives.map(o => o.objectiveNumber)));
  };

  const collapseAll = () => {
    setExpandedObjectives(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Separator */}
      {evaluation && (
        <div className="relative py-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-slate-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-slate-50 px-6 py-2 text-sm font-semibold text-slate-600 rounded-full shadow-sm border border-slate-300">
              Detalles por Objetivo
            </span>
          </div>
        </div>
      )}

      {/* View Controls */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('detailed')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                viewMode === 'detailed'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Vista Detallada
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                viewMode === 'summary'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Vista Resumen
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              Expandir Todo
            </button>
            <button
              onClick={collapseAll}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              Contraer Todo
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-sky-900 mb-2">📊 Vista de Resultados Detallados</h3>
        <p className="text-sm text-sky-800">
          Esta vista muestra todas las respuestas proporcionadas durante la evaluación, organizadas por objetivos y acciones.
          Cada acción incluye las tres dimensiones evaluadas: Cobertura, Frecuencia y Profundidad.
        </p>
      </div>

      {/* Objectives Results */}
      <div className="space-y-4">
        {objectives.map((objective) => {
          const isExpanded = expandedObjectives.has(objective.objectiveNumber);

          // Calculate completion for this objective
          const totalDimensionsInObjective = objective.actions.length * 3; // 3 dimensions per action
          const completedDimensionsInObjective = objective.actions.reduce((count, action) => {
            let actionCompleted = 0;
            if (mappedResponses[action.dimensions.cobertura.id]?.response?.trim()) actionCompleted++;
            if (mappedResponses[action.dimensions.frecuencia.id]?.response?.trim()) actionCompleted++;
            if (mappedResponses[action.dimensions.profundidad.id]?.response?.trim()) actionCompleted++;
            return count + actionCompleted;
          }, 0);

          const objectiveProgress = totalDimensionsInObjective > 0
            ? Math.round((completedDimensionsInObjective / totalDimensionsInObjective) * 100)
            : 0;

          return (
            <div
              key={objective.objectiveNumber}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
            >
              {/* Objective Header */}
              <button
                onClick={() => toggleObjective(objective.objectiveNumber)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                      <span className="text-lg font-bold text-sky-700">{objective.objectiveNumber}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Objetivo {objective.objectiveNumber}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">{objective.objectiveText}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-slate-500">
                        {completedDimensionsInObjective}/{totalDimensionsInObjective} dimensiones completadas
                      </div>
                      <div className="flex-1 max-w-xs">
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${objectiveProgress}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-emerald-600">
                        {objectiveProgress}%
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <svg
                    className={`w-6 h-6 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Actions Results (collapsible) */}
              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50">
                  <ObjectiveResults
                    objective={objective}
                    responses={mappedResponses}
                    viewMode={viewMode}
                    evaluation={evaluation}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
