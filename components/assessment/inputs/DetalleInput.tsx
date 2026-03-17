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
      <p className="text-sm text-brand_primary/30 italic">Sin opciones definidas para este indicador.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-brand_primary/40 font-medium uppercase tracking-wider mb-2">Selecciona todas las que aplican</p>
      {options.map((opt, idx) => (
        <label
          key={idx}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
            selectedOptions.includes(opt)
              ? 'bg-brand_accent/10 border border-brand_accent/30'
              : 'bg-brand_primary/[0.02] border border-brand_primary/[0.06] hover:border-brand_primary/15'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            id={`detalle-${indicatorId}-${idx}`}
            checked={selectedOptions.includes(opt)}
            onChange={() => !disabled && toggleOption(opt)}
            disabled={disabled}
            className="w-4 h-4 text-brand_accent border-brand_primary/20 rounded focus:ring-2 focus:ring-brand_accent/40 focus:ring-offset-1"
          />
          <span className="text-sm text-brand_primary/80">{opt}</span>
        </label>
      ))}
    </div>
  );
};

export default DetalleInput;
