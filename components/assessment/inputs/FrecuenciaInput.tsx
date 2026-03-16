import React from 'react';
import { FrequencyUnit, FREQUENCY_UNIT_LABELS } from '@/types/assessment-builder';

interface FrecuenciaInputProps {
  value?: number;
  unit?: FrequencyUnit;
  config?: {
    type: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  };
  unitOptions?: FrequencyUnit[];
  onValueChange: (value: number) => void;
  onUnitChange: (unit: FrequencyUnit) => void;
  disabled?: boolean;
}

const FrecuenciaInput: React.FC<FrecuenciaInputProps> = ({
  value, unit, config, unitOptions, onValueChange, onUnitChange, disabled,
}) => {
  const availableUnits: FrequencyUnit[] = unitOptions && unitOptions.length > 0
    ? unitOptions
    : ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año'];

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onValueChange(parseFloat(e.target.value))}
        min={config?.min ?? 0}
        max={config?.max}
        step={config?.step ?? 1}
        disabled={disabled}
        aria-label="Cantidad de frecuencia"
        className={`w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_primary ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
        placeholder="0"
      />
      <span className="text-sm text-gray-500">veces por</span>
      <select
        value={unit || availableUnits[0]}
        onChange={(e) => onUnitChange(e.target.value as FrequencyUnit)}
        disabled={disabled}
        aria-label="Unidad de frecuencia"
        className={`px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_primary ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
      >
        {availableUnits.map((u) => (
          <option key={u} value={u}>
            {FREQUENCY_UNIT_LABELS[u]}
          </option>
        ))}
      </select>
    </div>
  );
};

export default FrecuenciaInput;
