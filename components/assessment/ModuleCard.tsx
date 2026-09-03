import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IndicatorData, ModuleData, ResponseData } from './types';
import IndicatorInput from './IndicatorInput';
import { resolveCoberturaGate } from '@/lib/services/assessment-builder/coberturaGatePolicy';

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

  const gate = resolveCoberturaGate({
    indicators: activeIndicators,
    getId: (ind: IndicatorData) => ind.id,
    getCategory: (ind: IndicatorData) => ind.category,
    getDisplayOrder: (ind: IndicatorData) => ind.displayOrder,
    getCoverageValue: (id: string) => responses[id]?.coverageValue,
  });

  const hasCoberturaGate = gate.hasGate;
  const coberturaValue = gate.state === 'yes' ? true : gate.state === 'no' ? false : undefined;
  const visibleIndicators = gate.applicable;
  const showGateMessage = gate.state === 'no';

  return (
    <div className="bg-white rounded-xl border border-brand_primary/[0.08] overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${module.name}`}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-brand_primary/[0.015] transition-colors"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-semibold text-brand_primary tracking-tight">{module.name}</h3>
            {hasCoberturaGate && coberturaValue === false && (
              <span className="text-[10px] font-medium bg-brand_primary/[0.06] text-brand_primary/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                No implementada
              </span>
            )}
          </div>
          {module.description && (
            <p className="text-sm text-brand_primary/45 mt-0.5 leading-relaxed">{module.description}</p>
          )}
          <p className="text-xs text-brand_primary/30 mt-1 font-medium">
            {activeIndicators.length} indicador{activeIndicators.length !== 1 ? 'es' : ''}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-brand_primary/30 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-brand_primary/30 flex-shrink-0" />
        )}
      </button>

      {expanded && module.instructions && (
        <div className="px-5 pb-4 pt-0">
          <div className="bg-brand_accent/[0.08] border border-brand_accent/20 px-4 py-3 rounded-lg text-sm text-brand_primary/70 leading-relaxed">
            {module.instructions}
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-brand_primary/[0.06] divide-y divide-brand_primary/[0.04]">
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
            <div className="px-5 py-4 text-sm text-brand_primary/35 italic">
              Esta práctica no se implementa en este establecimiento
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModuleCard;
