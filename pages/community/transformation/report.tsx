/**
 * Standalone Transformation Assessment Report Page
 * Professional visualizations with Recharts
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSideProps } from 'next';
import {
  Radar,
  RadarChart,
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

// FNE Institutional Colors
const COLORS = {
  brand_blue: '#0a0a0a',
  brand_yellow: '#fbbf24',
  brand_beige: '#e8e5e2',
};

// Use only FNE institutional colors with varying intensity
const STAGE_COLORS = {
  1: { bg: 'bg-slate-50', border: 'border-slate-300', badge: 'bg-slate-400', text: 'text-slate-900', hex: '#94a3b8' },
  2: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-[#fbbf24]', text: 'text-yellow-900', hex: '#fbbf24' },
  3: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-[#0a0a0a]', text: 'text-blue-900', hex: '#0a0a0a' },
  4: { bg: 'bg-blue-100', border: 'border-blue-300', badge: 'bg-[#0a0a0a]', text: 'text-blue-900', hex: '#0066b3' },
};

interface ReportPageProps {
  assessment: any;
  evaluation: any;
  dimensionEvaluations: any[];
}

export default function TransformationReportPage({ assessment, evaluation, dimensionEvaluations }: ReportPageProps) {
  const router = useRouter();
  const { communityId } = router.query;

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-yellow-900 mb-4">
              No hay evaluación disponible
            </h1>
            <p className="text-yellow-800 mb-6">
              Esta evaluación aún no ha sido completada. Por favor, completa todos los objetivos y finaliza la evaluación.
            </p>
            <button
              onClick={() => router.push(`/community/transformation/assessment?communityId=${communityId}`)}
              className="px-6 py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition"
            >
              Volver a la Evaluación
            </button>
          </div>
        </div>
      </div>
    );
  }

  const colors = STAGE_COLORS[evaluation.overall_stage as keyof typeof STAGE_COLORS] || STAGE_COLORS[1];

  // Prepare radar chart data (dimension averages)
  const radarData = (() => {
    const grouped: Record<string, number[]> = {
      cobertura: [],
      frecuencia: [],
      profundidad: [],
    };

    dimensionEvaluations.forEach((dimEval) => {
      const dim = dimEval.dimension.toLowerCase();
      if (grouped[dim]) {
        grouped[dim].push(dimEval.level);
      }
    });

    return [
      {
        dimension: 'Cobertura',
        level: grouped.cobertura.length > 0
          ? grouped.cobertura.reduce((a, b) => a + b, 0) / grouped.cobertura.length
          : 0,
        fullMark: 4,
      },
      {
        dimension: 'Frecuencia',
        level: grouped.frecuencia.length > 0
          ? grouped.frecuencia.reduce((a, b) => a + b, 0) / grouped.frecuencia.length
          : 0,
        fullMark: 4,
      },
      {
        dimension: 'Profundidad',
        level: grouped.profundidad.length > 0
          ? grouped.profundidad.reduce((a, b) => a + b, 0) / grouped.profundidad.length
          : 0,
        fullMark: 4,
      },
    ];
  })();

  // Prepare bar chart data (objectives)
  const barData = (() => {
    const grouped: Record<number, number[]> = {};

    dimensionEvaluations.forEach((dimEval) => {
      const objNum = dimEval.objective_number || 1;
      if (!grouped[objNum]) {
        grouped[objNum] = [];
      }
      grouped[objNum].push(dimEval.level);
    });

    return Object.entries(grouped).map(([objNum, levels]) => {
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
      return {
        objective: `Obj ${objNum}`,
        level: Math.round(avg * 10) / 10,
      };
    });
  })();

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">
            Reporte de Transformación Educativa
          </h1>
          <button
            onClick={() => router.push(`/community/transformation/assessment?communityId=${communityId}`)}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition"
          >
            ← Volver
          </button>
        </div>

        {/* Overall Stage Card */}
        <div className={`${colors.bg} border-2 ${colors.border} rounded-xl p-8 shadow-lg`}>
          <div className="flex items-start gap-6">
            <div className={`${colors.badge} text-white text-4xl font-bold w-20 h-20 rounded-full flex items-center justify-center shadow-xl`}>
              {evaluation.overall_stage}
            </div>
            <div className="flex-1">
              <h2 className={`text-3xl font-bold ${colors.text} mb-2`}>
                Nivel {evaluation.overall_stage}: {evaluation.overall_stage_label}
              </h2>
              <p className="text-slate-600 text-sm mb-4">Evaluación General del Establecimiento</p>
              <div className="bg-white bg-opacity-70 rounded-lg p-6 mt-4">
                <p className="text-slate-800 text-lg leading-relaxed">{evaluation.summary}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visualizations Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar Chart */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">📊</span>
              Balance entre Dimensiones
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 14, fontWeight: 600 }} />
                <PolarRadiusAxis angle={90} domain={[0, 4]} tick={{ fill: '#64748b' }} />
                <Radar
                  name="Nivel Promedio"
                  dataKey="level"
                  stroke={COLORS.brand_blue}
                  fill={COLORS.brand_blue}
                  fillOpacity={0.6}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              <p className="font-semibold mb-1">Interpretación:</p>
              <p>Este gráfico muestra el nivel promedio alcanzado en cada dimensión evaluada. Un perfil equilibrado indica desarrollo integral.</p>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">📈</span>
              Progreso por Objetivo
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" domain={[0, 4]} tick={{ fill: '#64748b' }} />
                <YAxis type="category" dataKey="objective" tick={{ fill: '#475569', fontSize: 14, fontWeight: 600 }} />
                <Tooltip />
                <Bar dataKey="level" radius={[0, 8, 8, 0]}>
                  {barData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.level >= 3.0 ? COLORS.brand_blue :
                        entry.level >= 2.0 ? COLORS.brand_yellow :
                        '#94a3b8'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              <p className="font-semibold mb-1">Código de colores:</p>
              <div className="flex gap-3 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-400 rounded"></span> Nivel 1</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#fbbf24] rounded"></span> Nivel 2-2.9</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#0a0a0a] rounded"></span> Nivel 3+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Strengths and Growth Areas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Strengths */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <span className="text-2xl">💪</span>
              Fortalezas Identificadas
            </h3>
            <ul className="space-y-3">
              {evaluation.strengths.map((strength: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-[#0a0a0a] font-bold text-lg">✓</span>
                  <span className="text-slate-800 leading-relaxed">{strength}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Growth Areas */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-yellow-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              Áreas de Mejora
            </h3>
            <ul className="space-y-3">
              {evaluation.growth_areas.map((area: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-[#fbbf24] font-bold text-lg">→</span>
                  <span className="text-slate-800 leading-relaxed">{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommendations */}
        {evaluation.recommendations && evaluation.recommendations.length > 0 && (
          <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="text-2xl">💡</span>
              Recomendaciones
            </h3>
            <ul className="space-y-3">
              {evaluation.recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-yellow-600 font-bold text-lg">{idx + 1}.</span>
                  <span className="text-slate-800 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 border-t-2 border-slate-200">
          <p className="text-slate-600 text-sm">
            Generado con el Sistema de Evaluación de Transformación Educativa - Fundación Nueva Educación
          </p>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { communityId } = context.query;

  if (!communityId || typeof communityId !== 'string') {
    return { notFound: true };
  }

  const supabase = createPagesServerClient(context);

  // Get the assessment
  const { data: assessment, error } = await supabase
    .from('transformation_assessments')
    .select('*')
    .eq('community_id', communityId)
    .eq('area', 'personalizacion')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !assessment) {
    return { notFound: true };
  }

  const evaluation = assessment.context_metadata?.evaluation || null;
  const dimensionEvaluations = evaluation?.dimension_evaluations || [];

  // Allow page to render even if evaluation doesn't exist yet
  return {
    props: {
      assessment,
      evaluation,
      dimensionEvaluations,
    },
  };
};
