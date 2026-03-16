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
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === true
          ? 'bg-green-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      Sí
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      disabled={disabled}
      aria-label={indicatorName ? `No: ${indicatorName}` : 'No'}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === false
          ? 'bg-red-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      No
    </button>
  </div>
);

export default CoberturaInput;
