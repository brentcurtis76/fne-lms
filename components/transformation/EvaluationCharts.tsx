/**
 * EvaluationCharts.tsx
 *
 * Visual charts for transformation assessment results:
 * - RadarChart: Balance between dimensions (Cobertura, Frecuencia, Profundidad)
 * - BarChart: Progress by objective with color-coded levels
 */

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';

// FNE Brand Colors
const COLORS = {
  brand_blue: '#00365b',
  brand_yellow: '#fdb933',
  brand_beige: '#e8e5e2',
  slate: '#94a3b8',
};

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
  objective_number?: number;
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

interface RubricItem {
  id: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
}

interface EvaluationChartsProps {
  evaluation: AssessmentEvaluation;
  rubricItems: RubricItem[];
}

export function EvaluationCharts({ evaluation, rubricItems }: EvaluationChartsProps) {
  // Build a mapping from rubricItemId to objective_number
  const rubricIdToObjective: Record<string, number> = {};
  for (const item of rubricItems) {
    rubricIdToObjective[item.id] = item.objective_number;
  }

  // Prepare radar chart data (dimension averages)
  const radarData = (() => {
    const grouped: Record<string, number[]> = {
      cobertura: [],
      frecuencia: [],
      profundidad: [],
    };

    evaluation.dimension_evaluations?.forEach((dimEval) => {
      // The dimension field format is "Action Name - DimensionType"
      // e.g., "Plan Personal de Crecimiento - Cobertura"
      // We need to extract the dimension type from the END
      const dimRaw = dimEval.dimension?.toLowerCase() || '';

      // Try to extract dimension type from end of string (after the last " - ")
      const parts = dimRaw.split(' - ');
      const dimType = parts.length > 1
        ? parts[parts.length - 1].trim()  // Last part after " - "
        : dimRaw.split(' ')[0].trim();     // Fallback to first word

      if (grouped[dimType]) {
        grouped[dimType].push(dimEval.level);
      }
    });

    return [
      {
        dimension: 'Cobertura',
        level: grouped.cobertura.length > 0
          ? Math.round((grouped.cobertura.reduce((a, b) => a + b, 0) / grouped.cobertura.length) * 10) / 10
          : 0,
        fullMark: 4,
      },
      {
        dimension: 'Frecuencia',
        level: grouped.frecuencia.length > 0
          ? Math.round((grouped.frecuencia.reduce((a, b) => a + b, 0) / grouped.frecuencia.length) * 10) / 10
          : 0,
        fullMark: 4,
      },
      {
        dimension: 'Profundidad',
        level: grouped.profundidad.length > 0
          ? Math.round((grouped.profundidad.reduce((a, b) => a + b, 0) / grouped.profundidad.length) * 10) / 10
          : 0,
        fullMark: 4,
      },
    ];
  })();

  // Prepare bar chart data (objectives)
  const barData = (() => {
    const grouped: Record<number, number[]> = {};

    evaluation.dimension_evaluations?.forEach((dimEval) => {
      // Get objective number from rubricItem mapping
      const objNum = rubricIdToObjective[dimEval.rubricItemId] || dimEval.objective_number || 1;
      if (!grouped[objNum]) {
        grouped[objNum] = [];
      }
      grouped[objNum].push(dimEval.level);
    });

    return Object.entries(grouped)
      .map(([objNum, levels]) => {
        const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
        return {
          objective: `Obj ${objNum}`,
          objectiveNum: parseInt(objNum),
          level: Math.round(avg * 10) / 10,
        };
      })
      .sort((a, b) => a.objectiveNum - b.objectiveNum);
  })();

  // Get color based on level
  const getBarColor = (level: number): string => {
    if (level >= 3.0) return COLORS.brand_blue;
    if (level >= 2.0) return COLORS.brand_yellow;
    return COLORS.slate;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Radar Chart - Dimension Balance */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span className="text-xl">📊</span>
          Balance entre Dimensiones
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 4]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickCount={5}
              />
              <Radar
                name="Nivel Promedio"
                dataKey="level"
                stroke={COLORS.brand_blue}
                fill={COLORS.brand_blue}
                fillOpacity={0.5}
                strokeWidth={2}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}`, 'Nivel']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
          <p className="font-semibold mb-1">Interpretación:</p>
          <p>
            Este gráfico muestra el nivel promedio alcanzado en cada dimensión evaluada.
            Un perfil equilibrado indica desarrollo integral en todas las áreas.
          </p>
        </div>
      </div>

      {/* Bar Chart - Objectives Progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span className="text-xl">📈</span>
          Progreso por Objetivo
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
            >
              <XAxis
                type="number"
                domain={[0, 4]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickCount={5}
              />
              <YAxis
                type="category"
                dataKey="objective"
                tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                width={60}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}`, 'Nivel Promedio']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Bar dataKey="level" radius={[0, 6, 6, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.level)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
          <p className="font-semibold mb-2">Código de colores:</p>
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: COLORS.slate }}
              />
              <span>Nivel 1 (Incipiente)</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: COLORS.brand_yellow }}
              />
              <span>Nivel 2-2.9 (Emergente)</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: COLORS.brand_blue }}
              />
              <span>Nivel 3+ (Avanzado/Consolidado)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EvaluationCharts;
