/**
 * EvaluationSummary.tsx
 *
 * Displays the overall transformation assessment summary including:
 * - Overall stage badge and label
 * - AI-generated summary
 * - Stats grid (strengths, growth areas, dimensions)
 * - Strengths and growth areas lists
 * - Recommendations section
 */

import { CheckCircle, TrendingUp, Target, Lightbulb, Users } from 'lucide-react';

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

interface Collaborator {
  id: string;
  full_name: string;
  role?: string;
  avatar_url?: string;
}

interface EvaluationSummaryProps {
  evaluation: AssessmentEvaluation;
  schoolName?: string;
  completedDate?: string;
  collaborators?: Collaborator[];
}

// Stage colors matching FNE brand
const STAGE_COLORS = {
  1: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    badge: 'bg-slate-400',
    accent: '#94a3b8'
  },
  2: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    badge: 'bg-brand_yellow',
    accent: '#fbbf24'
  },
  3: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-brand_blue',
    badge: 'bg-brand_blue',
    accent: '#0a0a0a'
  },
  4: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-brand_blue',
    badge: 'bg-brand_blue',
    accent: '#0a0a0a'
  },
};

const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: 'La comunidad educativa está comenzando a explorar prácticas de personalización del aprendizaje. Las iniciativas son incipientes y requieren mayor sistematización.',
  2: 'Se observan avances en la implementación de prácticas de personalización. Existen iniciativas emergentes que necesitan consolidación y expansión.',
  3: 'La comunidad muestra un nivel avanzado de implementación. Las prácticas están bastante establecidas con oportunidades de profundización.',
  4: 'Las prácticas de personalización están consolidadas y son parte integral de la cultura escolar. Se observa un alto nivel de madurez institucional.',
};

export function EvaluationSummary({ evaluation, schoolName, completedDate, collaborators }: EvaluationSummaryProps) {
  const stage = evaluation.overall_stage as 1 | 2 | 3 | 4;
  const colors = STAGE_COLORS[stage] || STAGE_COLORS[1];

  return (
    <div className="space-y-6">
      {/* Overall Stage Banner */}
      <div className={`${colors.bg} border-2 ${colors.border} rounded-xl p-6 md:p-8`}>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Stage Circle */}
          <div className="flex-shrink-0">
            <div
              className={`w-24 h-24 md:w-28 md:h-28 rounded-full ${colors.badge} text-white flex items-center justify-center shadow-lg`}
            >
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold">{evaluation.overall_stage}</div>
                <div className="text-xs opacity-80">de 4</div>
              </div>
            </div>
          </div>

          {/* Stage Info */}
          <div className="flex-1">
            <p className="text-xs font-semibold text-brand_yellow uppercase tracking-wide mb-1">
              Nivel de Transformación
            </p>
            <h2 className={`text-2xl md:text-3xl font-bold ${colors.text} mb-2`}>
              {evaluation.overall_stage_label}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {STAGE_DESCRIPTIONS[stage]}
            </p>
          </div>
        </div>

        {/* AI Summary Quote */}
        <div className="mt-6 bg-white/70 rounded-lg p-4 border-l-4 border-brand_yellow">
          <p className="text-slate-700 italic leading-relaxed">
            &quot;{evaluation.summary}&quot;
          </p>
        </div>

        {/* Collaborators Section */}
        {collaborators && collaborators.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-medium">Elaborado por:</span>
              <span>
                {collaborators.map((c, idx) => (
                  <span key={c.id}>
                    {c.full_name}
                    {c.role === 'creator' && <span className="text-slate-400"> (creador)</span>}
                    {idx < collaborators.length - 1 && ', '}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-brand_blue/10 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-brand_blue" />
          </div>
          <div className="text-3xl font-bold text-brand_blue mb-1">
            {evaluation.strengths?.length || 0}
          </div>
          <div className="text-sm text-slate-600">Fortalezas Identificadas</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-brand_yellow/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-brand_yellow" />
          </div>
          <div className="text-3xl font-bold text-brand_yellow mb-1">
            {evaluation.growth_areas?.length || 0}
          </div>
          <div className="text-sm text-slate-600">Áreas de Crecimiento</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-brand_blue/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-brand_blue" />
          </div>
          <div className="text-3xl font-bold text-brand_blue mb-1">
            {evaluation.dimension_evaluations?.length || 0}
          </div>
          <div className="text-sm text-slate-600">Dimensiones Evaluadas</div>
        </div>
      </div>

      {/* Strengths Section */}
      {evaluation.strengths && evaluation.strengths.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-brand_blue mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Fortalezas Identificadas
          </h3>
          <ul className="space-y-3">
            {evaluation.strengths.map((strength, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand_blue/10 text-brand_blue font-semibold text-sm flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-slate-700 leading-relaxed">{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Growth Areas Section */}
      {evaluation.growth_areas && evaluation.growth_areas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-brand_yellow mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Áreas de Crecimiento
          </h3>
          <ul className="space-y-3">
            {evaluation.growth_areas.map((area, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand_yellow/20 text-brand_yellow font-semibold text-sm flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-slate-700 leading-relaxed">{area}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations Section */}
      {evaluation.recommendations && evaluation.recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-brand_blue/5 to-brand_blue/10 border border-brand_blue/20 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-brand_blue mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Recomendaciones Prioritarias
          </h3>
          <ul className="space-y-3">
            {evaluation.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand_yellow text-brand_blue font-semibold text-sm flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-slate-700 font-medium leading-relaxed">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default EvaluationSummary;
