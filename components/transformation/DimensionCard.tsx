import { ReactNode } from 'react';

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
  suggestedLevel: number | null;
  confirmedLevel: number | null;
  lastUpdated: string;
}

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
}

interface DimensionCardProps {
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
  label: string;
  icon: ReactNode;
  colors: {
    bg: string;
    border: string;
    text: string;
    iconBg: string;
    iconText: string;
  };
  rubricItem: RubricItem;
  response?: DimensionResponse;
  dimensionEval?: DimensionEvaluation;
  compact?: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'Incipiente',
  2: 'Emergente',
  3: 'Avanzado',
  4: 'Consolidado',
};

const LEVEL_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-300' },
  2: { bg: 'bg-brand_yellow/10', text: 'text-brand_yellow', border: 'border-brand_yellow/30' },
  3: { bg: 'bg-brand_blue/10', text: 'text-brand_blue', border: 'border-brand_blue/30' },
  4: { bg: 'bg-brand_blue/20', text: 'text-brand_blue', border: 'border-brand_blue/50' },
};

export function DimensionCard({
  dimension,
  label,
  icon,
  colors,
  rubricItem,
  response,
  dimensionEval,
  compact = false,
}: DimensionCardProps) {
  const hasResponse = response && response.response && response.response.trim().length > 0;

  if (compact) {
    return (
      <div className={`${colors.bg} ${colors.border} border rounded-lg p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`${colors.iconBg} ${colors.iconText} rounded-full p-2`}>
            {icon}
          </div>
          <h5 className={`text-sm font-semibold ${colors.text}`}>{label}</h5>
        </div>
        {hasResponse ? (
          <div className="text-sm text-slate-700 line-clamp-4">
            {response.response}
          </div>
        ) : (
          <div className="text-sm text-slate-400 italic">
            Sin respuesta
          </div>
        )}
        {hasResponse && response.lastUpdated && (
          <div className="text-xs text-slate-500 mt-2">
            Actualizado: {new Date(response.lastUpdated).toLocaleDateString('es-CL')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className={`${colors.iconBg} px-4 py-3 flex items-center gap-3`}>
        <div className={`${colors.iconText}`}>
          {icon}
        </div>
        <h5 className={`text-base font-semibold ${colors.text}`}>{label}</h5>
        {hasResponse && (
          <div className="ml-auto">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand_blue/10 border border-brand_blue/30">
              <svg className="w-4 h-4 text-brand_blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-semibold text-brand_blue">Completado</span>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 bg-white">
        {hasResponse ? (
          <div className="space-y-4">
            {/* System Evaluation Level (if available) */}
            {dimensionEval && (
              <div className={`${LEVEL_COLORS[dimensionEval.level].bg} ${LEVEL_COLORS[dimensionEval.level].border} border rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h6 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Evaluación del Sistema
                  </h6>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${LEVEL_COLORS[dimensionEval.level].bg} ${LEVEL_COLORS[dimensionEval.level].border} border-2`}>
                    <span className={`text-sm font-bold ${LEVEL_COLORS[dimensionEval.level].text}`}>
                      Nivel {dimensionEval.level}
                    </span>
                    <span className={`text-xs font-semibold ${LEVEL_COLORS[dimensionEval.level].text}`}>
                      {LEVEL_LABELS[dimensionEval.level]}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-slate-700 mb-3">
                  <strong>Justificación:</strong> {dimensionEval.reasoning}
                </p>
                {dimensionEval.evidence_quote && (
                  <div className="bg-white/50 border border-slate-200 rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-slate-600 mb-1">Evidencia citada:</p>
                    <p className="text-sm text-slate-700 italic">"{dimensionEval.evidence_quote}"</p>
                  </div>
                )}
                {dimensionEval.next_steps && dimensionEval.next_steps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">Próximos pasos recomendados:</p>
                    <ul className="space-y-1">
                      {dimensionEval.next_steps.map((step, idx) => (
                        <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-sky-600">•</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Response */}
            <div>
              <h6 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Respuesta del Equipo
              </h6>
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4 border border-slate-200">
                {response.response}
              </div>
            </div>

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              {response.lastUpdated && (
                <span>
                  Última actualización: {new Date(response.lastUpdated).toLocaleDateString('es-CL', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>

            {/* Rubric Levels Reference (collapsible) */}
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-2">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Ver descriptores de niveles
              </summary>
              <div className="mt-3 space-y-2 pl-6">
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">Nivel 1:</span>
                  <p className="text-slate-600 mt-1">{rubricItem.level_1_descriptor}</p>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">Nivel 2:</span>
                  <p className="text-slate-600 mt-1">{rubricItem.level_2_descriptor}</p>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">Nivel 3:</span>
                  <p className="text-slate-600 mt-1">{rubricItem.level_3_descriptor}</p>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-700">Nivel 4:</span>
                  <p className="text-slate-600 mt-1">{rubricItem.level_4_descriptor}</p>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-slate-400 italic">
              Esta dimensión no tiene respuesta registrada
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
