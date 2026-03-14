import React from 'react';

interface DetalleInputProps {
  indicatorId: string;
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

const DetalleInput: React.FC<DetalleInputProps> = ({
  indicatorId, options, selectedOptions, onChange, disabled,
}) => {
  const toggleOption = (opt: string) => {
    if (selectedOptions.includes(opt)) {
      onChange(selectedOptions.filter((o) => o !== opt));
    } else {
      onChange([...selectedOptions, opt]);
    }
  };

  if (options.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">Sin opciones definidas para este indicador.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 mb-2">Selecciona todas las que aplican:</p>
      {options.map((opt, idx) => (
        <label
          key={idx}
          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
            selectedOptions.includes(opt) ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            id={`detalle-${indicatorId}-${idx}`}
            checked={selectedOptions.includes(opt)}
            onChange={() => !disabled && toggleOption(opt)}
            disabled={disabled}
            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
          />
          <span className="text-sm text-gray-800">{opt}</span>
        </label>
      ))}
    </div>
  );
};

export default DetalleInput;
