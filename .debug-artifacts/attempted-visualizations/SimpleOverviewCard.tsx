import React from 'react';

interface SimpleOverviewCardProps {
  overallStage: number;
  overallStageLabel: string;
  summary: string;
}

const STAGE_COLORS = {
  1: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', badge: 'bg-red-500' },
  2: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-900', badge: 'bg-yellow-500' },
  3: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', badge: 'bg-blue-500' },
  4: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', badge: 'bg-green-500' },
};

export function SimpleOverviewCard({ overallStage, overallStageLabel, summary }: SimpleOverviewCardProps) {
  const colors = STAGE_COLORS[overallStage as keyof typeof STAGE_COLORS] || STAGE_COLORS[1];

  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-xl p-8 mb-6`}>
      <div className="flex items-center gap-4 mb-4">
        <div className={`${colors.badge} text-white text-3xl font-bold w-16 h-16 rounded-full flex items-center justify-center shadow-lg`}>
          {overallStage}
        </div>
        <div>
          <h2 className={`text-2xl font-bold ${colors.text}`}>
            Nivel {overallStage}: {overallStageLabel}
          </h2>
          <p className="text-sm text-slate-600 mt-1">Evaluación General</p>
        </div>
      </div>

      <div className="bg-white bg-opacity-60 rounded-lg p-4 mt-4">
        <p className="text-slate-800 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}
