import React, { useEffect, useRef } from 'react';
import {
  FrequencyUnit,
  FREQUENCY_UNIT_LABELS,
  DEFAULT_FREQUENCY_UNIT_OPTIONS,
} from '@/types/assessment-builder';

interface FrecuenciaInputProps {
  value?: number | null;
  unit?: FrequencyUnit;
  config?: {
    type: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    allowed_units?: FrequencyUnit[];
  };
  unitOptions?: FrequencyUnit[];
  /** Receives `null` when the field is cleared — never NaN. */
  onValueChange: (value: number | null) => void;
  onUnitChange: (unit: FrequencyUnit) => void;
  disabled?: boolean;
}

const isFrequencyUnit = (u: unknown): u is FrequencyUnit =>
  typeof u === 'string' && Object.prototype.hasOwnProperty.call(FREQUENCY_UNIT_LABELS, u);

/**
 * Resolves the list of selectable units. Precedence: explicit `unitOptions`
 * (the form passes the snapshot's allowed_units or its fallback), else the
 * platform default. When `config.unit` is a real period it is moved to the
 * front so it is the displayed — and therefore persisted — default. A legacy
 * `config.unit` such as "veces" is not a period and is ignored.
 */
export function resolveFrequencyUnits(
  unitOptions: FrequencyUnit[] | undefined,
  configUnit: string | undefined
): FrequencyUnit[] {
  const base = unitOptions && unitOptions.length > 0 ? unitOptions : DEFAULT_FREQUENCY_UNIT_OPTIONS;
  if (!isFrequencyUnit(configUnit)) return [...base];
  return [configUnit, ...base.filter((u) => u !== configUnit)];
}

const FrecuenciaInput: React.FC<FrecuenciaInputProps> = ({
  value, unit, config, unitOptions, onValueChange, onUnitChange, disabled,
}) => {
  const availableUnits = resolveFrequencyUnits(unitOptions, config?.unit);
  const displayedUnit = unit || availableUnits[0];

  // The select shows a default even when no unit has been chosen; emit it once
  // a value exists so frequency_unit is persisted with it instead of staying
  // null. Gated on a value so merely opening the form never marks untouched
  // indicators dirty (which would autosave and move a pending instance to
  // in_progress).
  const hasValue = value !== undefined && value !== null;
  const defaultUnit = availableUnits[0];
  const emittedDefaultRef = useRef(false);
  useEffect(() => {
    if (unit) {
      emittedDefaultRef.current = false;
      return;
    }
    if (hasValue && !disabled && defaultUnit && !emittedDefaultRef.current) {
      emittedDefaultRef.current = true;
      onUnitChange(defaultUnit);
    }
  }, [unit, hasValue, disabled, defaultUnit, onUnitChange]);

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onValueChange(null);
            return;
          }
          const parsed = parseFloat(raw);
          onValueChange(Number.isFinite(parsed) ? parsed : null);
        }}
        min={config?.min ?? 0}
        max={config?.max}
        step={config?.step ?? 1}
        disabled={disabled}
        aria-label="Cantidad de frecuencia"
        data-testid="frecuencia-value-input"
        className={`w-20 px-3 py-2 border border-brand_primary/15 rounded-lg text-brand_primary font-medium focus:outline-none focus:ring-2 focus:ring-brand_accent/50 focus:border-brand_accent ${
          disabled ? 'opacity-50 cursor-not-allowed bg-brand_primary/[0.02]' : 'bg-white'
        }`}
        placeholder="0"
      />
      <span className="text-sm text-brand_primary/40 font-medium">veces por</span>
      <select
        value={displayedUnit}
        onChange={(e) => onUnitChange(e.target.value as FrequencyUnit)}
        disabled={disabled}
        aria-label="Unidad de frecuencia"
        data-testid="frecuencia-unit-select"
        className={`px-3 py-2 border border-brand_primary/15 rounded-lg text-brand_primary focus:outline-none focus:ring-2 focus:ring-brand_accent/50 focus:border-brand_accent ${
          disabled ? 'opacity-50 cursor-not-allowed bg-brand_primary/[0.02]' : 'bg-white'
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
