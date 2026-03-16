import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IndicatorData, ModuleData, ResponseData } from './types';
import IndicatorInput from './IndicatorInput';

interface ModuleCardProps {
  module: ModuleData;
  responses: Record<string, ResponseData>;
  expanded: boolean;
  onToggle: () => void;
  onResponseChange: (indicatorId: string, field: keyof ResponseData, value: ResponseData[keyof ResponseData]) => void;
  canEdit: boolean | undefined;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  responses,
  expanded,
  onToggle,
  onResponseChange,
  canEdit,
}) => {
  // R12: Filter out indicators that are inactive for this year.
  const activeIndicators = module.indicators.filter(
    (ind) => ind.isActiveThisYear !== false
  );

  // Sort active indicators by display order
  const sortedIndicators = [...activeIndicators].sort((a, b) => a.displayOrder - b.displayOrder);

  // Cobertura gate logic
  const hasCoberturaGate = sortedIndicators.length > 0 && sortedIndicators[0].category === 'cobertura';
  const coberturaResponse = hasCoberturaGate ? responses[sortedIndicators[0].id] : undefined;
  const coberturaValue = coberturaResponse?.coverageValue;

  // Determine which indicators to show
  let visibleIndicators: IndicatorData[];
  let showGateMessage = false;

  if (hasCoberturaGate) {
    if (coberturaValue === true) {
      visibleIndicators = sortedIndicators;
    } else if (coberturaValue === false) {
      visibleIndicators = [sortedIndicators[0]];
      showGateMessage = true;
    } else {
      visibleIndicators = [sortedIndicators[0]];
    }
  } else {
    visibleIndicators = sortedIndicators;
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${module.name}`}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-brand_primary">{module.name}</h3>
            {hasCoberturaGate && coberturaValue === false && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                No implementada
              </span>
            )}
          </div>
          {module.description && (
            <p className="text-sm text-gray-500 mt-1">{module.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {activeIndicators.length} indicador{activeIndicators.length !== 1 ? 'es' : ''}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {expanded && module.instructions && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
            {module.instructions}
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {visibleIndicators.map((indicator) => (
            <IndicatorInput
              key={indicator.id}
              indicator={indicator}
              response={responses[indicator.id] || {}}
              onChange={(field, value) => onResponseChange(indicator.id, field, value)}
              disabled={!canEdit}
            />
          ))}
          {showGateMessage && (
            <div className="p-4 bg-gray-50 text-sm text-gray-500 italic">
              Esta práctica no se implementa en este establecimiento
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModuleCard;
