import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  MATURITY_LEVELS,
  CATEGORY_LABELS,
  IndicatorCategory,
} from '@/types/assessment-builder';
import type { ModuleResult, GapClassification } from './types';
import { GAP_STYLES } from './types';

// Helper to format raw values for display
export function formatRawValue(
  value: boolean | number | undefined,
  category: IndicatorCategory
): string {
  if (value === undefined || value === null) return '-';

  switch (category) {
    case 'cobertura':
      return value === true ? 'Sí' : 'No';
    case 'frecuencia':
      return String(value);
    case 'profundidad': {
      const level = MATURITY_LEVELS.find((l) => l.value === value);
      return level ? `${value} - ${level.label}` : String(value);
    }
    default:
      return String(value);
  }
}

interface ModuleResultCardProps {
  module: ModuleResult;
  isExpanded: boolean;
  onToggle: (moduleId: string) => void;
}

const ModuleResultCard: React.FC<ModuleResultCardProps> = ({
  module,
  isExpanded,
  onToggle,
}) => {
  const moduleLevel = Math.round(module.moduleScore / 25);
  const moduleLevelInfo = MATURITY_LEVELS[moduleLevel] || MATURITY_LEVELS[0];

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(module.moduleId)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand_primary">
              {Math.round(module.moduleScore)}%
            </div>
            <div
              className={`text-xs px-2 py-0.5 rounded ${moduleLevelInfo.bgColor} ${moduleLevelInfo.textColor}`}
            >
              {moduleLevelInfo.label}
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-gray-800">{module.moduleName}</h4>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{module.indicators.length} indicador{module.indicators.length !== 1 ? 'es' : ''}</span>
              {module.gapStats && (
                <span className="flex items-center gap-1.5 ml-2">
                  {module.gapStats.ahead > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                      ↑{module.gapStats.ahead}
                    </span>
                  )}
                  {module.gapStats.onTrack > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                      →{module.gapStats.onTrack}
                    </span>
                  )}
                  {module.gapStats.behind > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                      ↓{module.gapStats.behind}
                    </span>
                  )}
                  {module.gapStats.critical > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                      ⚠{module.gapStats.critical}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Indicador</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Respuesta</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Puntuación</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {module.indicators.map((indicator) => {
                const gapStyle = indicator.gap?.classification
                  ? GAP_STYLES[indicator.gap.classification]
                  : null;
                return (
                  <tr key={indicator.indicatorId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{indicator.indicatorName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {CATEGORY_LABELS[indicator.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {formatRawValue(indicator.rawValue, indicator.category)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-8 rounded font-medium text-sm ${
                          indicator.normalizedScore >= 75
                            ? 'bg-green-100 text-green-700'
                            : indicator.normalizedScore >= 50
                            ? 'bg-yellow-100 text-yellow-700'
                            : indicator.normalizedScore >= 25
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {Math.round(indicator.normalizedScore)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {gapStyle && indicator.gap?.expectedLevel !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${gapStyle.bg} ${gapStyle.text}`}
                          title={`Actual: ${indicator.gap?.actualLevel}, Esperado: ${indicator.gap?.expectedLevel}`}
                        >
                          {gapStyle.icon} {gapStyle.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ModuleResultCard;
