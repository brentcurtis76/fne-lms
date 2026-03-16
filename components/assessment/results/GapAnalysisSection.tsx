import React from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import type { GenerationType } from '@/types/assessment-builder';
import type { GapAnalysisSummary } from './types';

interface GapAnalysisSectionProps {
  gapAnalysis: GapAnalysisSummary;
  transformationYear: number;
  generationType: GenerationType;
}

const GapAnalysisSection: React.FC<GapAnalysisSectionProps> = ({
  gapAnalysis,
  transformationYear,
  generationType,
}) => {
  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-brand_primary" />
        Análisis de Brechas - Año {transformationYear}
        <span
          className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            generationType === 'GT'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}
          title={generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
        >
          Expectativas {generationType}
        </span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-700">{gapAnalysis.overallStats.ahead}</div>
          <div className="text-xs text-green-600">Adelante</div>
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-700">{gapAnalysis.overallStats.onTrack}</div>
          <div className="text-xs text-blue-600">En camino</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-700">{gapAnalysis.overallStats.behind}</div>
          <div className="text-xs text-yellow-600">Atrasado</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-700">{gapAnalysis.overallStats.critical}</div>
          <div className="text-xs text-red-600">Crítico</div>
        </div>
      </div>

      {/* Critical indicators alert */}
      {gapAnalysis.criticalIndicators.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Indicadores Críticos ({gapAnalysis.criticalIndicators.length})
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {gapAnalysis.criticalIndicators.slice(0, 5).map((ci, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                {ci.indicatorCode && <span className="font-mono text-xs">{ci.indicatorCode}:</span>}
                {ci.indicatorName}
                <span className="text-xs text-red-500">
                  (nivel {ci.actualLevel} de {ci.expectedLevel} esperado)
                </span>
              </li>
            ))}
            {gapAnalysis.criticalIndicators.length > 5 && (
              <li className="text-xs italic">
                ...y {gapAnalysis.criticalIndicators.length - 5} más
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Behind indicators (if no critical but there are behind) */}
      {gapAnalysis.criticalIndicators.length === 0 && gapAnalysis.behindIndicators.length > 0 && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="text-sm font-semibold text-yellow-800 mb-2">
            Indicadores que Requieren Atención ({gapAnalysis.behindIndicators.length})
          </h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {gapAnalysis.behindIndicators.slice(0, 5).map((bi, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                {bi.indicatorCode && <span className="font-mono text-xs">{bi.indicatorCode}:</span>}
                {bi.indicatorName}
              </li>
            ))}
            {gapAnalysis.behindIndicators.length > 5 && (
              <li className="text-xs italic">
                ...y {gapAnalysis.behindIndicators.length - 5} más
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GapAnalysisSection;
