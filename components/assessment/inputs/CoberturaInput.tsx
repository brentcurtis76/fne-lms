import React from 'react';

interface CoberturaInputProps {
  value?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  indicatorName?: string;
}

const CoberturaInput: React.FC<CoberturaInputProps> = ({ value, onChange, disabled, indicatorName }) => (
  <div className="flex gap-3">
    <button
      type="button"
      onClick={() => onChange(true)}
      disabled={disabled}
      aria-label={indicatorName ? `Sí: ${indicatorName}` : 'Sí'}
      className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all ${
        value === true
          ? 'bg-brand_primary text-brand_accent shadow-sm'
          : 'bg-brand_primary/5 text-brand_primary/60 hover:bg-brand_primary/10 border border-brand_primary/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      Sí
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      disabled={disabled}
      aria-label={indicatorName ? `No: ${indicatorName}` : 'No'}
      className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all ${
        value === false
          ? 'bg-brand_primary text-white shadow-sm'
          : 'bg-brand_primary/5 text-brand_primary/60 hover:bg-brand_primary/10 border border-brand_primary/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      No
    </button>
  </div>
);

export default CoberturaInput;
