import React from 'react';
import { CheckCircle } from 'lucide-react';
import { CATEGORY_LABELS } from '@/types/assessment-builder';
import { IndicatorData, ResponseData } from './types';
import CoberturaInput from './inputs/CoberturaInput';
import FrecuenciaInput from './inputs/FrecuenciaInput';
import ProfundidadInput from './inputs/ProfundidadInput';
import TraspasoInput from './inputs/TraspasoInput';
import DetalleInput from './inputs/DetalleInput';

interface IndicatorInputProps {
  indicator: IndicatorData;
  response: ResponseData;
  onChange: (field: keyof ResponseData, value: ResponseData[keyof ResponseData]) => void;
  disabled?: boolean;
}

const IndicatorInput: React.FC<IndicatorInputProps> = ({
  indicator,
  response,
  onChange,
  disabled,
}) => {
  const subResp = response.subResponses as Record<string, unknown> | undefined;
  const detalleSelected = Array.isArray(subResp?.selected_options) ? subResp.selected_options as string[] : [];
  const hasResponse =
    (indicator.category === 'cobertura' && response.coverageValue !== undefined && response.coverageValue !== null) ||
    (indicator.category === 'frecuencia' && response.frequencyValue !== undefined && response.frequencyValue !== null) ||
    (indicator.category === 'profundidad' && response.profundityLevel !== undefined && response.profundityLevel !== null) ||
    (indicator.category === 'traspaso' && !!(subResp?.evidence_link || subResp?.improvement_suggestions)) ||
    (indicator.category === 'detalle' && detalleSelected.length > 0);

  return (
    <div className={`p-4 ${hasResponse ? 'bg-green-50/50' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        {hasResponse && (
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {indicator.code && (
              <span className="text-xs font-mono bg-gray-200 px-1.5 py-0.5 rounded">
                {indicator.code}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {CATEGORY_LABELS[indicator.category]}
            </span>
          </div>
          <h4 className="font-medium text-gray-900">{indicator.name}</h4>
          {indicator.description && (
            <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
          )}
        </div>
      </div>

      <div className="ml-8">
        {indicator.category === 'cobertura' && (
          <CoberturaInput
            value={response.coverageValue}
            onChange={(v) => onChange('coverageValue', v)}
            disabled={disabled}
            indicatorName={indicator.name}
          />
        )}

        {indicator.category === 'frecuencia' && (
          <FrecuenciaInput
            value={response.frequencyValue}
            unit={response.frequencyUnit}
            config={indicator.frequencyConfig}
            unitOptions={indicator.frequencyUnitOptions}
            onValueChange={(v) => onChange('frequencyValue', v)}
            onUnitChange={(u) => onChange('frequencyUnit', u)}
            disabled={disabled}
          />
        )}

        {indicator.category === 'profundidad' && (
          <ProfundidadInput
            value={response.profundityLevel}
            descriptors={{
              0: indicator.level0Descriptor,
              1: indicator.level1Descriptor,
              2: indicator.level2Descriptor,
              3: indicator.level3Descriptor,
              4: indicator.level4Descriptor,
            }}
            onChange={(v) => onChange('profundityLevel', v)}
            disabled={disabled}
          />
        )}

        {indicator.category === 'traspaso' && (
          <TraspasoInput
            indicatorId={indicator.id}
            value={response.subResponses as { evidence_link?: string; improvement_suggestions?: string } | undefined}
            onChange={(v) => onChange('subResponses', v)}
            disabled={disabled}
          />
        )}

        {indicator.category === 'detalle' && (
          <DetalleInput
            indicatorId={indicator.id}
            options={indicator.detalle_options || []}
            selectedOptions={detalleSelected}
            onChange={(selected) => onChange('subResponses', { selected_options: selected })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};

export default IndicatorInput;
